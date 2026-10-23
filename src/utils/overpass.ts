import axios from 'axios';
import { OSMFeatureType } from '../components/DataSelector';

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

const REQUEST_TIMEOUT_MS = 18000;
const SERVER_TIMEOUT_S = 15;

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

async function fetchLayer(type: OSMFeatureType, bboxStr: string, signal?: AbortSignal): Promise<any[]> {
  const query = buildQuery(type, bboxStr);
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
export async function fetchOsmData(
  bbox: [number, number, number, number],
  types: OSMFeatureType[],
  options?: { signal?: AbortSignal; onProgress?: (p: FetchProgress) => void }
): Promise<FetchResult> {
  const bboxStr = `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`;
  const total = types.length;
  const elements: any[] = [];
  const failedLayers: OSMFeatureType[] = [];

  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    try {
      const layerElements = await fetchLayer(type, bboxStr, options?.signal);
      elements.push(...layerElements);
      options?.onProgress?.({ done: i + 1, total, layer: type, failed: false });
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError') throw err;
      failedLayers.push(type);
      options?.onProgress?.({ done: i + 1, total, layer: type, failed: true });
    }
  }

  if (elements.length === 0 && failedLayers.length > 0) {
    throw new Error('All layers failed to load');
  }

  return { elements, failedLayers };
}
