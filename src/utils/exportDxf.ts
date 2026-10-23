import proj4 from 'proj4';
import { OSMFeatureType } from '../components/DataSelector';
import { StyleMap } from './exportStyles';
import { CategoryMap, areaPolygons, simplifyPts, SIMPLIFY_TOL_MM } from './exportGeometry';
import { exportCredits } from './credits';

// DXF (R12 / AC1009, the most widely readable flavour) for CAD: AutoCAD,
// Archicad, Vectorworks, Rhino, QGIS. Coordinates are real-world meters in
// the local UTM zone (ETRS89/WGS84 — identical at drawing precision), so
// the drawing is georeferenced and to scale at 1 unit = 1 m. Each category
// is its own CAD layer; contour lines carry their height as elevation.

type Pt = [number, number];
type Bbox = [number, number, number, number];

const LAYER_NAMES: Record<OSMFeatureType, string> = {
  greenery: 'QSP_GREENERY',
  contours: 'QSP_CONTOURS',
  water: 'QSP_WATER',
  railways: 'QSP_RAILWAYS',
  streets: 'QSP_STREETS',
  buildings: 'QSP_BUILDINGS',
  trees: 'QSP_TREES',
};
const INDEX_CONTOUR_LAYER = 'QSP_CONTOURS_INDEX';
const FRAME_LAYER = 'QSP_FRAME';

// R12 has no true color, only the AutoCAD Color Index: pick the nearest.
const ACI: [number, [number, number, number]][] = [
  [1, [255, 0, 0]], [2, [255, 255, 0]], [3, [0, 255, 0]], [4, [0, 255, 255]], [5, [0, 0, 255]],
  [6, [255, 0, 255]], [7, [0, 0, 0]], [8, [128, 128, 128]], [9, [192, 192, 192]],
  [30, [255, 127, 0]], [40, [255, 191, 0]], [94, [0, 127, 0]], [84, [127, 255, 127]],
  [140, [0, 127, 255]], [150, [0, 63, 255]], [190, [191, 0, 255]], [210, [255, 0, 191]],
  [11, [255, 127, 127]], [32, [165, 82, 0]], [250, [51, 51, 51]], [251, [80, 80, 80]],
  [252, [105, 105, 105]], [253, [130, 130, 130]], [254, [190, 190, 190]],
];
function nearestAci([r, g, b]: [number, number, number]): number {
  let best = 7;
  let bestD = Infinity;
  for (const [aci, [ar, ag, ab]] of ACI) {
    const d = (r - ar) ** 2 + (g - ag) ** 2 + (b - ab) ** 2;
    if (d < bestD) { bestD = d; best = aci; }
  }
  return best;
}

export function utmZoneFor(bbox: Bbox): { zone: number; south: boolean; label: string } {
  const lon = (bbox[0] + bbox[2]) / 2;
  const lat = (bbox[1] + bbox[3]) / 2;
  const zone = Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1));
  const south = lat < 0;
  return { zone, south, label: `UTM zone ${zone}${south ? 'S' : 'N'} (ETRS89/WGS84), meters` };
}

export interface BuildDxfParams {
  bbox: Bbox;
  categories: CategoryMap;
  layerStyles: StyleMap;
  scale: number;
}

export function buildExportDxf(params: BuildDxfParams): string {
  const { bbox, categories, layerStyles, scale } = params;
  const { zone, south, label } = utmZoneFor(bbox);
  const utm = `+proj=utm +zone=${zone}${south ? ' +south' : ''} +ellps=GRS80 +units=m +no_defs`;
  const toUtm = (c: Pt): Pt => proj4('EPSG:4326', utm, c) as Pt;
  const metersPerMm = scale / 1000;
  const tol = SIMPLIFY_TOL_MM * metersPerMm;
  const [minLon, minLat, maxLon, maxLat] = bbox;

  const out: string[] = [];
  const g = (code: number, value: string | number) => out.push(String(code), typeof value === 'number' ? value.toFixed(3) : value);
  const gi = (code: number, value: number) => out.push(String(code), String(Math.round(value)));

  const featureInBbox = (coords: Pt[]) => {
    let fx0 = Infinity, fy0 = Infinity, fx1 = -Infinity, fy1 = -Infinity;
    for (const [x, y] of coords) {
      if (x < fx0) fx0 = x; if (x > fx1) fx1 = x;
      if (y < fy0) fy0 = y; if (y > fy1) fy1 = y;
    }
    return fx1 >= minLon && fx0 <= maxLon && fy1 >= minLat && fy0 <= maxLat;
  };

  const polyline = (layer: string, coords: Pt[], closed: boolean, elevation = 0) => {
    const pts = simplifyPts(coords.map(toUtm), tol);
    const verts = closed && pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1] ? pts.slice(0, -1) : pts;
    if (verts.length < 2) return;
    g(0, 'POLYLINE'); g(8, layer); gi(66, 1); gi(70, closed ? 1 : 0);
    g(10, 0); g(20, 0); g(30, elevation);
    verts.forEach(([x, y]) => { g(0, 'VERTEX'); g(8, layer); g(10, x); g(20, y); g(30, elevation); });
    g(0, 'SEQEND'); g(8, layer);
  };
  const circle = (layer: string, [x, y]: Pt, r: number) => {
    g(0, 'CIRCLE'); g(8, layer); g(10, x); g(20, y); g(30, 0); g(40, r);
  };
  // R12 text is not UTF-8; non-ASCII characters (umlauts, ©, ·) go in as
  // AutoCAD's \U+XXXX escapes, which every DXF reader understands.
  const dxfText = (value: string) => value.replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7e]/g, ch => `\\U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
  // --- entities ---
  const entities = () => {
    const lineTypes: OSMFeatureType[] = ['greenery', 'contours', 'water', 'railways', 'streets', 'buildings'];
    lineTypes.forEach(type => {
      (categories[type] ?? []).forEach(f => {
        const polygons = areaPolygons(f);
        if (polygons) {
          if (!featureInBbox(polygons.flatMap(p => p[0]))) return;
          polygons.forEach(rings => rings.forEach(r => polyline(LAYER_NAMES[type], r, true)));
        } else if (f.geometry.type === 'LineString') {
          const coords = f.geometry.coordinates as Pt[];
          if (!featureInBbox(coords)) return;
          if (f.properties?.contour) {
            polyline(f.properties.index ? INDEX_CONTOUR_LAYER : LAYER_NAMES.contours, coords, false, f.properties.ele);
          } else {
            polyline(LAYER_NAMES[type], coords, false);
          }
        }
      });
    });

    (categories.trees ?? []).forEach(f => {
      if (f.geometry.type !== 'Point') return;
      const crown = parseFloat(String(f.properties?.diameter_crown ?? '').replace(',', '.'));
      circle(LAYER_NAMES.trees, toUtm(f.geometry.coordinates as Pt), Number.isFinite(crown) && crown > 0 ? Math.min(crown, 24) / 2 : 3);
    });

    // Export frame + a note with the coordinate system
    const corners: Pt[] = [[minLon, minLat], [maxLon, minLat], [maxLon, maxLat], [minLon, maxLat], [minLon, minLat]];
    polyline(FRAME_LAYER, corners, true);
    const [fx, fy] = toUtm([minLon, minLat]);
    // Notes below the frame: coordinate system, then credits + disclaimer
    const notes = [`Quicksiteplan · ${label} · 1:${scale}`, ...exportCredits((categories.contours ?? []).length > 0)];
    notes.forEach((note, i) => {
      g(0, 'TEXT'); g(8, FRAME_LAYER); g(10, fx); g(20, fy - (4 + i * 3.5) * metersPerMm); g(30, 0); g(40, 2.5 * metersPerMm);
      g(1, dxfText(note));
    });
  };

  // --- write sections ---
  const [ex0, ey0] = toUtm([minLon, minLat]);
  const [ex1, ey1] = toUtm([maxLon, maxLat]);
  g(0, 'SECTION'); g(2, 'HEADER');
  g(9, '$ACADVER'); g(1, 'AC1009');
  g(9, '$INSUNITS'); gi(70, 6);
  g(9, '$EXTMIN'); g(10, ex0); g(20, ey0); g(30, 0);
  g(9, '$EXTMAX'); g(10, ex1); g(20, ey1); g(30, 0);
  g(0, 'ENDSEC');

  const layers: [string, number][] = (Object.keys(LAYER_NAMES) as OSMFeatureType[])
    .map(t => [LAYER_NAMES[t], nearestAci(layerStyles[t].color)] as [string, number]);
  layers.push([INDEX_CONTOUR_LAYER, nearestAci(layerStyles.contours.color)], [FRAME_LAYER, 7]);
  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LTYPE'); gi(70, 1);
  g(0, 'LTYPE'); g(2, 'CONTINUOUS'); gi(70, 0); g(3, 'Solid line'); gi(72, 65); gi(73, 0); g(40, 0);
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); gi(70, layers.length);
  layers.forEach(([name, color]) => { g(0, 'LAYER'); g(2, name); gi(70, 0); gi(62, color); g(6, 'CONTINUOUS'); });
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');

  g(0, 'SECTION'); g(2, 'ENTITIES');
  entities();
  g(0, 'ENDSEC');
  g(0, 'EOF');
  return out.join('\n') + '\n';
}
