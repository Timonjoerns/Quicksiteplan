import axios from 'axios';
import { OSMFeatureType } from '../components/DataSelector';

// Tile edge length per layer for splitting large areas into separate
// requests. Dense layers (buildings, streets) need small tiles to stay
// inside the server's time/size limits; sparse ones cover far more ground
// per request, which cuts the request count for large areas a lot.
const TILE_SIZE_KM: Record<OSMFeatureType, number> = {
  buildings: 4,
  streets: 4,
  trees: 4,
  greenery: 10,
  water: 15,
  railways: 25,
};

// A tile that still fails is split into quarters and retried, down to this
// edge length.
const MIN_TILE_SIZE_KM = 1.5;

// Above this scale, individual trees are too small to read on paper and
// are left out — at large areas they'd be a big share of the requests.
export const TREES_MAX_SCALE = 10000;

// One request in flight per mirror: public Overpass instances cap
// concurrent requests per client, so this is as parallel as it gets
// without being rejected.
const CONCURRENCY = 3;

// Map OSMFeatureType to Overpass QL queries. 'greenery' expands to a union
// of several sub-filters, each still part of the SAME request for that type.
const featureQueries: Record<OSMFeatureType, string> = {
  // Lakes/rivers mapped as areas (closed ways, or multipolygon relations for
  // the large ones), plus river/canal/stream center lines.
  water: 'way["natural"="water"];relation["natural"="water"]["type"="multipolygon"];way["waterway"~"^(river|canal|stream)$"]',
  streets: 'way["highway"]',
  buildings: 'way["building"]',
  railways: 'way["railway"="rail"]',
  trees: 'node["natural"="tree"]',
  greenery: 'way["landuse"="forest"];way["landuse"="grass"];way["landuse"="meadow"];way["landuse"="orchard"];way["landuse"="vineyard"];way["landuse"="farmland"];way["landuse"="allotments"];way["leisure"="park"];way["leisure"="garden"];way["leisure"="nature_reserve"];way["natural"="wood"];way["natural"="scrub"];way["natural"="grassland"];way["natural"="heath"];relation["leisure"="park"]["type"="multipolygon"];relation["landuse"="forest"]["type"="multipolygon"];relation["natural"="wood"]["type"="multipolygon"]',
};

// Public Overpass instances have no central status page and go down or hit
// capacity limits often. Trying a short list of mirrors in order — falling
// through to the next on timeout/5xx/network error — makes a single bad
// instance not take the whole app down with it.
const OVERPASS_MIRRORS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const REQUEST_TIMEOUT_MS = 30000;
const SERVER_TIMEOUT_S = 25;

function buildQuery(type: OSMFeatureType, bboxStr: string): string {
  const q = featureQueries[type];
  const clauses = q.includes(';')
    ? q.split(';').filter(s => s.trim()).map(subq => `${subq}(${bboxStr});`)
    : [`${q}(${bboxStr});`];
  // `out geom;` embeds each way's coordinates directly in the response, so
  // there's no need for the old recursive ">;" pass that fetches every
  // shared node separately — a smaller payload per request, especially for
  // dense areas (buildings, streets).
  return `[out:json][timeout:${SERVER_TIMEOUT_S}];\n(\n${clauses.join('\n')}\n);\nout geom;`;
}

// Tries every mirror, starting at `firstMirror` so parallel workers each
// begin on a different one.
async function fetchLayer(type: OSMFeatureType, bboxStr: string, firstMirror: number, signal?: AbortSignal): Promise<any[]> {
  const query = buildQuery(type, bboxStr);
  let lastError: any = null;
  for (let m = 0; m < OVERPASS_MIRRORS.length; m++) {
    const url = OVERPASS_MIRRORS[(firstMirror + m) % OVERPASS_MIRRORS.length];
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const response = await axios.post(url, query, {
        headers: { 'Content-Type': 'text/plain' },
        timeout: REQUEST_TIMEOUT_MS,
        signal,
      });
      if (Array.isArray(response.data?.elements)) {
        return response.data.elements;
      }
      lastError = new Error('Unexpected response shape');
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError') throw err;
      lastError = err;
      // try the next mirror
    }
  }
  throw lastError ?? new Error('All Overpass mirrors failed');
}

export interface FetchProgress {
  done: number;
  total: number;
  layer: OSMFeatureType;
  failed: boolean;
}

export interface FetchResult {
  elements: any[];
  failedLayers: OSMFeatureType[];
}

type Bbox = [number, number, number, number];

function bboxSizeKm([minLon, minLat, maxLon, maxLat]: Bbox): [number, number] {
  const centerLat = (minLat + maxLat) / 2;
  return [(maxLon - minLon) * 111.32 * Math.cos(centerLat * Math.PI / 180), (maxLat - minLat) * 110.57];
}

// Splits a bbox into a grid of tiles of at most tileKm per side — a single
// Overpass query for a large, dense area runs into the server's time and
// memory limits and fails outright, while small tiles stay well inside.
function splitBbox(bbox: Bbox, tileKm: number): Bbox[] {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const [widthKm, heightKm] = bboxSizeKm(bbox);
  const nx = Math.max(1, Math.ceil(widthKm / tileKm));
  const ny = Math.max(1, Math.ceil(heightKm / tileKm));
  const tiles: Bbox[] = [];
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      tiles.push([
        minLon + ((maxLon - minLon) * ix) / nx,
        minLat + ((maxLat - minLat) * iy) / ny,
        minLon + ((maxLon - minLon) * (ix + 1)) / nx,
        minLat + ((maxLat - minLat) * (iy + 1)) / ny,
      ]);
    }
  }
  return tiles;
}

const isAbort = (err: any) => err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError';

// Fetches the selected layers tile by tile, CONCURRENCY requests at a time.
// A failed tile is split into quarters and retried; only if a tile at the
// minimum size still fails is its layer reported as failed. Whatever
// succeeded is still returned.
export async function fetchOsmData(
  bbox: Bbox,
  types: OSMFeatureType[],
  options?: { scale?: number; signal?: AbortSignal; onProgress?: (p: FetchProgress) => void }
): Promise<FetchResult> {
  if ((options?.scale ?? 0) > TREES_MAX_SCALE) types = types.filter(t => t !== 'trees');
  const queue: { type: OSMFeatureType; bbox: Bbox }[] = [];
  types.forEach(type => splitBbox(bbox, TILE_SIZE_KM[type]).forEach(tile => queue.push({ type, bbox: tile })));

  let total = queue.length;
  let done = 0;
  const elements: any[] = [];
  // Features crossing a tile edge come back from every tile they touch.
  const seen = new Set<string>();
  const failed = new Set<OSMFeatureType>();

  const worker = async (mirror: number) => {
    while (queue.length > 0) {
      const task = queue.shift()!;
      const [minLon, minLat, maxLon, maxLat] = task.bbox;
      try {
        const tileElements = await fetchLayer(task.type, `${minLat},${minLon},${maxLat},${maxLon}`, mirror, options?.signal);
        for (const el of tileElements) {
          const key = `${el.type}/${el.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          elements.push(el);
        }
      } catch (err: any) {
        if (isAbort(err)) throw err;
        const [w, h] = bboxSizeKm(task.bbox);
        if (Math.max(w, h) / 2 >= MIN_TILE_SIZE_KM) {
          const quarters = splitBbox(task.bbox, Math.max(w, h) / 2);
          quarters.forEach(q => queue.push({ type: task.type, bbox: q }));
          total += quarters.length;
        } else {
          failed.add(task.type);
        }
      }
      done++;
      options?.onProgress?.({ done, total, layer: task.type, failed: failed.has(task.type) });
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

  const failedLayers = types.filter(t => failed.has(t));
  if (elements.length === 0 && failedLayers.length > 0) {
    throw new Error('All layers failed to load');
  }

  return { elements, failedLayers };
}
