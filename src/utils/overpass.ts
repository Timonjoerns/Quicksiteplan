import axios from 'axios';
import { OSMFeatureType } from '../components/DataSelector';

// How much detail to fetch, by export scale. At small scales (large
// areas) small features are invisible on paper anyway, and fetching every
// building and footpath for hundreds of km² would mean millions of
// features — so they're left out and only the main network is requested.
export type DetailLevel = 'full' | 'medium' | 'coarse';

export function getDetailLevel(scale: number): DetailLevel {
  if (scale > 20000) return 'coarse';
  if (scale > 10000) return 'medium';
  return 'full';
}

// Layers not fetched at all at a detail level.
export const OMITTED_LAYERS: Record<DetailLevel, OSMFeatureType[]> = {
  full: [],
  medium: ['trees'],
  coarse: ['trees', 'buildings'],
};

// Tile edge length per detail level: sparser queries can cover more ground
// per request.
const TILE_SIZE_KM: Record<DetailLevel, number> = { full: 4, medium: 6, coarse: 20 };

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

// Reduced queries for medium/coarse detail; layers not listed use the full
// query.
const reducedQueries: Record<Exclude<DetailLevel, 'full'>, Partial<Record<OSMFeatureType, string>>> = {
  medium: {
    streets: 'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]',
  },
  coarse: {
    streets: 'way["highway"~"^(motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|primary_link|secondary_link)$"]',
    water: 'way["natural"="water"];relation["natural"="water"]["type"="multipolygon"];way["waterway"~"^(river|canal)$"]',
    greenery: 'way["landuse"="forest"];way["leisure"="park"];way["leisure"="nature_reserve"];way["natural"="wood"];relation["leisure"="park"]["type"="multipolygon"];relation["landuse"="forest"]["type"="multipolygon"];relation["natural"="wood"]["type"="multipolygon"]',
  },
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

function buildQuery(type: OSMFeatureType, bboxStr: string, level: DetailLevel): string {
  const q = (level !== 'full' && reducedQueries[level][type]) || featureQueries[type];
  const clauses = q.includes(';')
    ? q.split(';').filter(s => s.trim()).map(subq => `${subq}(${bboxStr});`)
    : [`${q}(${bboxStr});`];
  // `out geom;` embeds each way's coordinates directly in the response, so
  // there's no need for the old recursive ">;" pass that fetches every
  // shared node separately — a smaller payload per request, especially for
  // dense areas (buildings, streets).
  return `[out:json][timeout:${SERVER_TIMEOUT_S}];\n(\n${clauses.join('\n')}\n);\nout geom;`;
}

async function fetchLayer(type: OSMFeatureType, bboxStr: string, level: DetailLevel, signal?: AbortSignal): Promise<any[]> {
  const query = buildQuery(type, bboxStr, level);
  let lastError: any = null;
  for (const url of OVERPASS_MIRRORS) {
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

// Fetches each selected layer as its own smaller Overpass request. Layers
// are requested one at a time (not in parallel) — public Overpass mirrors
// commonly cap concurrent requests per client and reject the rest outright,
// so firing them all at once can make every single one fail. A failed layer
// doesn't block the others; whatever succeeded is still returned.
// Areas bigger than one tile are split into a grid of tiles (TILE_SIZE_KM
// per side), each fetched as its own request — a single Overpass query for
// a large, dense area runs into the server's time and memory limits and
// fails outright, while small tiles stay well inside.
export function splitBbox(bbox: [number, number, number, number], tileKm: number): [number, number, number, number][] {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const centerLat = (minLat + maxLat) / 2;
  const widthKm = (maxLon - minLon) * 111.32 * Math.cos(centerLat * Math.PI / 180);
  const heightKm = (maxLat - minLat) * 110.57;
  const nx = Math.max(1, Math.ceil(widthKm / tileKm));
  const ny = Math.max(1, Math.ceil(heightKm / tileKm));
  const tiles: [number, number, number, number][] = [];
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

export async function fetchOsmData(
  bbox: [number, number, number, number],
  types: OSMFeatureType[],
  options?: { scale?: number; signal?: AbortSignal; onProgress?: (p: FetchProgress) => void }
): Promise<FetchResult> {
  const level = getDetailLevel(options?.scale ?? 0);
  types = types.filter(t => !OMITTED_LAYERS[level].includes(t));
  const tiles = splitBbox(bbox, TILE_SIZE_KM[level]);
  const total = types.length * tiles.length;
  const elements: any[] = [];
  // Features crossing a tile edge come back from every tile they touch.
  const seen = new Set<string>();
  const failedLayers: OSMFeatureType[] = [];
  let done = 0;

  for (const type of types) {
    let layerFailed = false;
    for (const [minLon, minLat, maxLon, maxLat] of tiles) {
      const bboxStr = `${minLat},${minLon},${maxLat},${maxLon}`;
      try {
        const tileElements = await fetchLayer(type, bboxStr, level, options?.signal);
        for (const el of tileElements) {
          const key = `${el.type}/${el.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          elements.push(el);
        }
      } catch (err: any) {
        if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError') throw err;
        layerFailed = true;
      }
      done++;
      options?.onProgress?.({ done, total, layer: type, failed: layerFailed });
    }
    if (layerFailed) failedLayers.push(type);
  }

  if (elements.length === 0 && failedLayers.length > 0) {
    throw new Error('All layers failed to load');
  }

  return { elements, failedLayers };
}
