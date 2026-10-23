// Contour lines generated in the browser from free global elevation tiles
// (Mapzen/AWS "Terrarium" PNGs: elevation encoded in RGB, no API key). The
// tiles are mosaicked into a height grid covering the bbox, lightly
// smoothed, and traced with marching squares at a "nice" interval picked
// from the local relief.

const TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const TILE_PX = 256;
const MAX_ZOOM = 15; // ~3–5 m/px — the best these tiles get
const MAX_TILES = 64;
const INTERVALS = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500];
const MAX_LEVELS = 40;
// Finest interval worth drawing at a scale (~scale/2500, as on topographic
// maps: 2 m at 1:5000, 10 m at 1:25000). Finer steps in this data mostly
// trace noise, especially in flat terrain.
const minIntervalForScale = (scale: number) => scale / 2500;
const INDEX_EVERY = 5; // every 5th line is an index (thicker) contour

type Bbox = [number, number, number, number];

const lonToX = (lon: number, z: number) => ((lon + 180) / 360) * TILE_PX * 2 ** z;
const latToY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * TILE_PX * 2 ** z;
};
const xToLon = (x: number, z: number) => (x / (TILE_PX * 2 ** z)) * 360 - 180;
const yToLat = (y: number, z: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / (TILE_PX * 2 ** z)))) * 180) / Math.PI;

function pickZoom([minLon, minLat, maxLon, maxLat]: Bbox): number {
  const lat = (minLat + maxLat) / 2;
  const widthM = (maxLon - minLon) * 111320 * Math.cos((lat * Math.PI) / 180);
  // aim for ~800 grid cells across the area
  const targetMpp = Math.max(widthM / 800, 0.1);
  let z = Math.floor(Math.log2((156543.03 * Math.cos((lat * Math.PI) / 180)) / targetMpp));
  z = Math.max(3, Math.min(MAX_ZOOM, z));
  const tileCount = (zz: number) =>
    (Math.floor(lonToX(maxLon, zz) / TILE_PX) - Math.floor(lonToX(minLon, zz) / TILE_PX) + 1) *
    (Math.floor(latToY(minLat, zz) / TILE_PX) - Math.floor(latToY(maxLat, zz) / TILE_PX) + 1);
  while (z > 3 && tileCount(z) > MAX_TILES) z--;
  return z;
}

function loadTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const onAbort = () => { img.src = ''; reject(new DOMException('Aborted', 'AbortError')); };
    signal?.addEventListener('abort', onAbort, { once: true });
    img.onload = () => {
      signal?.removeEventListener('abort', onAbort);
      const canvas = document.createElement('canvas');
      canvas.width = TILE_PX;
      canvas.height = TILE_PX;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return reject(new Error('No canvas'));
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, TILE_PX, TILE_PX).data);
    };
    img.onerror = () => { signal?.removeEventListener('abort', onAbort); reject(new Error(`Elevation tile ${z}/${x}/${y} failed`)); };
    img.src = TILE_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  });
}

function boxBlur(grid: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(grid.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          sum += grid[yy * w + xx];
          n++;
        }
      }
      out[y * w + x] = sum / n;
    }
  }
  return out;
}

type P = [number, number];

// Marching squares for one level: returns polylines in grid coordinates.
function traceLevel(grid: Float32Array, w: number, h: number, level: number): P[][] {
  const segments: [P, P][] = [];
  const interp = (x1: number, y1: number, v1: number, x2: number, y2: number, v2: number): P => {
    const t = (level - v1) / (v2 - v1);
    return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
  };
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const tl = grid[y * w + x];
      const tr = grid[y * w + x + 1];
      const br = grid[(y + 1) * w + x + 1];
      const bl = grid[(y + 1) * w + x];
      const c = (tl >= level ? 8 : 0) | (tr >= level ? 4 : 0) | (br >= level ? 2 : 0) | (bl >= level ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const top = () => interp(x, y, tl, x + 1, y, tr);
      const right = () => interp(x + 1, y, tr, x + 1, y + 1, br);
      const bottom = () => interp(x, y + 1, bl, x + 1, y + 1, br);
      const left = () => interp(x, y, tl, x, y + 1, bl);
      switch (c) {
        case 1: case 14: segments.push([left(), bottom()]); break;
        case 2: case 13: segments.push([bottom(), right()]); break;
        case 3: case 12: segments.push([left(), right()]); break;
        case 4: case 11: segments.push([top(), right()]); break;
        case 6: case 9: segments.push([top(), bottom()]); break;
        case 7: case 8: segments.push([left(), top()]); break;
        case 5: case 10: {
          // saddle: resolve by the cell's average
          const center = (tl + tr + br + bl) / 4 >= level;
          if ((c === 5) === center) {
            segments.push([left(), top()]);
            segments.push([bottom(), right()]);
          } else {
            segments.push([left(), bottom()]);
            segments.push([top(), right()]);
          }
          break;
        }
      }
    }
  }
  return joinSegments(segments);
}

// Chains segments sharing endpoints into polylines. Endpoints on a shared
// cell edge are computed identically from both cells, so exact keys match.
function joinSegments(segments: [P, P][]): P[][] {
  const key = (p: P) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
  const byEnd = new Map<string, number[]>();
  segments.forEach(([a, b], i) => {
    [key(a), key(b)].forEach(k => {
      const list = byEnd.get(k);
      if (list) list.push(i);
      else byEnd.set(k, [i]);
    });
  });
  const used = new Uint8Array(segments.length);
  const lines: P[][] = [];
  const nextFrom = (p: P): P | null => {
    const list = byEnd.get(key(p));
    if (!list) return null;
    for (const i of list) {
      if (used[i]) continue;
      used[i] = 1;
      const [a, b] = segments[i];
      return key(a) === key(p) ? b : a;
    }
    return null;
  };
  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line: P[] = [segments[i][0], segments[i][1]];
    let p: P | null;
    while ((p = nextFrom(line[line.length - 1]))) line.push(p);
    while ((p = nextFrom(line[0]))) line.unshift(p);
    lines.push(line);
  }
  return lines;
}

// `interval` (m) forces a contour spacing; null picks one automatically.
export async function fetchContours(bbox: Bbox, scale: number, interval: number | null, signal?: AbortSignal): Promise<GeoJSON.Feature[]> {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const z = pickZoom(bbox);
  const x0 = lonToX(minLon, z);
  const x1 = lonToX(maxLon, z);
  const y0 = latToY(maxLat, z);
  const y1 = latToY(minLat, z);
  const tx0 = Math.floor(x0 / TILE_PX);
  const tx1 = Math.floor(x1 / TILE_PX);
  const ty0 = Math.floor(y0 / TILE_PX);
  const ty1 = Math.floor(y1 / TILE_PX);

  // Mosaic all tiles into one grid
  const mw = (tx1 - tx0 + 1) * TILE_PX;
  const mh = (ty1 - ty0 + 1) * TILE_PX;
  const mosaic = new Float32Array(mw * mh);
  const jobs: Promise<void>[] = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      jobs.push(loadTile(z, tx, ty, signal).then(px => {
        const ox = (tx - tx0) * TILE_PX;
        const oy = (ty - ty0) * TILE_PX;
        for (let y = 0; y < TILE_PX; y++) {
          for (let x = 0; x < TILE_PX; x++) {
            const i = (y * TILE_PX + x) * 4;
            mosaic[(oy + y) * mw + ox + x] = px[i] * 256 + px[i + 1] + px[i + 2] / 256 - 32768;
          }
        }
      }));
    }
  }
  await Promise.all(jobs);

  // Crop to the bbox (plus a 1 px margin so lines reach the edge)
  const cx0 = Math.max(0, Math.floor(x0 - tx0 * TILE_PX) - 1);
  const cy0 = Math.max(0, Math.floor(y0 - ty0 * TILE_PX) - 1);
  const cx1 = Math.min(mw - 1, Math.ceil(x1 - tx0 * TILE_PX) + 1);
  const cy1 = Math.min(mh - 1, Math.ceil(y1 - ty0 * TILE_PX) + 1);
  const w = cx1 - cx0 + 1;
  const h = cy1 - cy0 + 1;
  let grid = new Float32Array(w * h);
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = mosaic[(cy0 + y) * mw + cx0 + x];
      grid[y * w + x] = v;
    }
  }
  // The raw data steps in whole meters and is noisy; two light blur passes
  // keep contours from turning into pixel staircases.
  grid = boxBlur(boxBlur(grid, w, h), w, h);
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] < min) min = grid[i];
    if (grid[i] > max) max = grid[i];
  }
  if (!Number.isFinite(min) || max - min < 0.5) return [];

  const minInterval = minIntervalForScale(scale);
  const autoInterval = INTERVALS.find(iv => iv >= minInterval * 0.99 && (max - min) / iv <= MAX_LEVELS) ?? INTERVALS[INTERVALS.length - 1];
  // A chosen interval is honored, but capped at 400 lines so a tiny value
  // in mountains can't freeze the browser.
  const step = interval && interval > 0 ? Math.max(interval, (max - min) / 400) : autoInterval;
  const features: GeoJSON.Feature[] = [];
  for (let level = Math.ceil(min / step) * step; level <= max; level += step) {
    const ele = Math.round(level * 100) / 100;
    const isIndex = Math.abs(Math.round(ele / step) % INDEX_EVERY) === 0;
    traceLevel(grid, w, h, level).forEach(line => {
      if (line.length < 3) return;
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: line.map(([gx, gy]) => [xToLon(tx0 * TILE_PX + cx0 + gx, z), yToLat(ty0 * TILE_PX + cy0 + gy, z)]),
        },
        properties: { contour: true, ele, index: isIndex, interval: step },
      });
    });
  }
  return features;
}
