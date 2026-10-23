import axios from 'axios';
import { OSMFeatureType } from '../components/DataSelector';
import { cacheGet, cacheSet } from './requestCache';

// Tile edge length per layer for splitting large areas into separate
// requests. Dense layers (buildings, streets) need small tiles to stay
// inside the server's time/size limits; sparse ones cover far more ground
// per request, which cuts the request count for large areas a lot.
type OverpassLayer = Exclude<OSMFeatureType, 'contours'>;

const TILE_SIZE_KM: Record<OverpassLayer, number> = {
  buildings: 4,
  streets: 4,
  trees: 4,
  greenery: 10,
  water: 15,
  railways: 25,
};

// Contour lines come from elevation tiles (see contours.ts), not Overpass.
export const OVERPASS_LAYERS: OverpassLayer[] = ['water', 'streets', 'buildings', 'railways', 'trees', 'greenery'];

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
const featureQueries: Record<OverpassLayer, string> = {
  // Lakes/rivers mapped as areas (closed ways, or multipolygon relations for
  // the large ones), plus river/canal/stream center lines.
  water: 'way["natural"="water"];relation["natural"="water"]["type"="multipolygon"];way["waterway"~"^(river|canal|stream)$"]',
  streets: 'way["highway"]',
  // Large buildings with courtyards (stations, malls, castles) are often
  // multipolygon relations rather than single closed ways.
  buildings: 'way["building"];relation["building"]["type"="multipolygon"]',
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

function buildQuery(q: string, bboxStr: string): string {
  const clauses = q.split(';').filter(sub => sub.trim()).map(sub => `${sub}(${bboxStr});`);
  // `out geom;` embeds each way's coordinates directly in the response, so
  // there's no need for the old recursive ">;" pass that fetches every
  // shared node separately — a smaller payload per request, especially for
  // dense areas (buildings, streets).
  return `[out:json][timeout:${SERVER_TIMEOUT_S}];\n(\n${clauses.join('\n')}\n);\nout geom;`;
}

// Tries every mirror, starting at `firstMirror` so parallel workers each
// begin on a different one. Successful answers are cached (see
// requestCache.ts), so re-fetching the same area — after a reload, or to
// retry the tiles that failed — only requests what's missing.
// A mirror that just failed (timeout, network error, 429/5xx) is moved to
// the back of the line for a while, so one hanging instance doesn't make
// every request wait out its full timeout first.
const MIRROR_PENALTY_MS = 2 * 60 * 1000;
const mirrorPenaltyUntil = OVERPASS_MIRRORS.map(() => 0);

function mirrorOrder(first: number): number[] {
  const now = Date.now();
  const order = OVERPASS_MIRRORS.map((_, i) => (first + i) % OVERPASS_MIRRORS.length);
  return [...order.filter(i => mirrorPenaltyUntil[i] <= now), ...order.filter(i => mirrorPenaltyUntil[i] > now)];
}

async function fetchQuery(query: string, firstMirror: number, signal?: AbortSignal): Promise<any[]> {
  const cached = await cacheGet(query);
  if (cached) return cached;
  let lastError: any = null;
  for (const m of mirrorOrder(firstMirror)) {
    const url = OVERPASS_MIRRORS[m];
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    try {
      const response = await axios.post(url, query, {
        headers: { 'Content-Type': 'text/plain' },
        timeout: REQUEST_TIMEOUT_MS,
        signal,
      });
      // Overpass reports server-side timeouts/memory limits as a 200 with
      // a "remark" and a truncated element list — not a usable answer.
      if (Array.isArray(response.data?.elements) && !response.data?.remark) {
        cacheSet(query, response.data.elements);
        return response.data.elements;
      }
      // a server-side timeout/memory remark is about this query, not the
      // mirror: don't penalize the mirror for it
      lastError = new Error(response.data?.remark || 'Unexpected response shape');
    } catch (err: any) {
      if (isAbort(err)) throw err;
      lastError = err;
      mirrorPenaltyUntil[m] = Date.now() + MIRROR_PENALTY_MS;
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
  let layers = OVERPASS_LAYERS.filter(t => types.includes(t));
  if ((options?.scale ?? 0) > TREES_MAX_SCALE) layers = layers.filter(t => t !== 'trees');

  // Snap the area outward to a ~100 m grid (0.001°) before tiling: the
  // frame restored after a reload or shared link differs from the original
  // by fractions of a meter, which would otherwise change every tile's
  // query and miss the cache.
  const SNAP = 1000;
  bbox = [
    Math.floor(bbox[0] * SNAP) / SNAP, Math.floor(bbox[1] * SNAP) / SNAP,
    Math.ceil(bbox[2] * SNAP) / SNAP, Math.ceil(bbox[3] * SNAP) / SNAP,
  ];
  const queue: { type: OverpassLayer; bbox: Bbox }[] = [];
  layers.forEach(type => splitBbox(bbox, TILE_SIZE_KM[type]).forEach(tile => queue.push({ type, bbox: tile })));

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
        const query = buildQuery(featureQueries[task.type], [minLat, minLon, maxLat, maxLon].map(v => v.toFixed(6)).join(','));
        const tileElements = await fetchQuery(query, mirror, options?.signal);
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

  const failedLayers = layers.filter(t => failed.has(t));
  if (elements.length === 0 && failedLayers.length > 0) {
    throw new Error('All layers failed to load');
  }

  return { elements, failedLayers };
}
