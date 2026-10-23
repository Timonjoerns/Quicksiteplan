import proj4 from 'proj4';
import { OSMFeatureType } from '../components/DataSelector';

export type CategoryMap = Partial<Record<OSMFeatureType, GeoJSON.Feature[]>>;

export interface PreparedExport {
  // Projects a [lon, lat] into page-space [x, y] in mm (0,0 = top-left).
  // Points outside the export bbox land off-page rather than being
  // dropped — dropping them would cut chords across features that extend
  // past the edge (rivers, long streets); the page/viewBox clips instead.
  project: (coord: [number, number]) => [number, number];
  categories: CategoryMap;
  // True ground width of the bbox in meters (equirectangular approximation)
  // — NOT the same as the Web Mercator coordinate span, which inflates
  // distance away from the equator by 1/cos(latitude). Always use this for
  // anything labeled "meters" (e.g. a scale bar).
  trueWidthMeters: number;
}

const MERCATOR_PROJ = '+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs';

// Builds a
// lon/lat -> page-mm projector for the given bbox and page size. Shared by
// every export format (PDF, SVG, ...) so the geo math only lives in one
// place.
export function prepareExportGeometry(
  bbox: [number, number, number, number],
  features: GeoJSON.Feature[],
  selectedTypes: OSMFeatureType[],
  pageW: number,
  pageH: number
): PreparedExport {
  const [bboxMinLon, bboxMinLat, bboxMaxLon, bboxMaxLat] = bbox;

  const centerLat = (bboxMinLat + bboxMaxLat) / 2;
  const metersPerDegLon = 40075000 * Math.cos(centerLat * Math.PI / 180) / 360;
  const trueWidthMeters = Math.abs(bboxMaxLon - bboxMinLon) * metersPerDegLon;

  const projectToMerc = (coord: number[]): [number, number] => proj4('EPSG:4326', MERCATOR_PROJ, coord) as [number, number];
  const bboxCorners: [number, number][] = [
    [bboxMinLon, bboxMinLat],
    [bboxMinLon, bboxMaxLat],
    [bboxMaxLon, bboxMaxLat],
    [bboxMaxLon, bboxMinLat],
  ];
  const bboxMerc = bboxCorners.map(projectToMerc);
  const xs = bboxMerc.map((c) => c[0]);
  const ys = bboxMerc.map((c) => c[1]);
  const cropMinX = Math.min.apply(null, xs);
  const cropMaxX = Math.max.apply(null, xs);
  const cropMinY = Math.min.apply(null, ys);
  const cropMaxY = Math.max.apply(null, ys);

  const project = ([lon, lat]: [number, number]): [number, number] => {
    const [x, y] = projectToMerc([lon, lat]);
    const px = ((x - cropMinX) / (cropMaxX - cropMinX)) * pageW;
    const py = pageH - ((y - cropMinY) / (cropMaxY - cropMinY)) * pageH;
    return [px, py];
  };

  const categories = categorizeFeatures(features, selectedTypes);

  return { project, categories, trueWidthMeters };
}

const GREENERY_LANDUSE = ['forest', 'grass', 'meadow', 'orchard', 'vineyard', 'farmland', 'allotments'];
const GREENERY_LEISURE = ['park', 'garden', 'nature_reserve'];
const GREENERY_NATURAL = ['wood', 'scrub', 'grassland', 'heath'];

// Splits GeoJSON features into the app's fixed layer categories (only the
// selected ones). Shared by the map preview and every export format.
export function categorizeFeatures(features: GeoJSON.Feature[], selectedTypes: OSMFeatureType[]): CategoryMap {
  const has = (type: OSMFeatureType) => selectedTypes.includes(type);
  const pick = (type: OSMFeatureType, test: (p: GeoJSON.GeoJsonProperties & {}) => boolean) =>
    has(type) ? features.filter(f => f.properties && test(f.properties)) : [];
  return {
    water: pick('water', p => !!(p.waterway || p.natural === 'water')),
    streets: pick('streets', p => !!p.highway),
    buildings: pick('buildings', p => !!p.building),
    railways: pick('railways', p => p.railway === 'rail'),
    trees: pick('trees', p => p.natural === 'tree'),
    greenery: pick('greenery', p => GREENERY_LANDUSE.includes(p.landuse) || GREENERY_LEISURE.includes(p.leisure) || GREENERY_NATURAL.includes(p.natural)),
    contours: pick('contours', p => !!p.contour),
  };
}

// Douglas–Peucker line simplification. Used with a tolerance below what
// the printer can resolve (in page mm, or meters for DXF), so nothing
// visibly changes but large-area exports lose most of their redundant
// points.
export function simplifyPts<T extends [number, number]>(pts: T[], tol: number): T[] {
  if (pts.length < 3 || tol <= 0) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d2: number;
      if (len2 === 0) {
        d2 = (px - ax) ** 2 + (py - ay) ** 2;
      } else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
      }
      if (d2 > maxD) { maxD = d2; idx = i; }
    }
    if (maxD > tol2 && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// Page-mm tolerance for simplification: ~1/600 inch, finer than print.
export const SIMPLIFY_TOL_MM = 0.04;

// Returns a feature's area geometry as polygons ([outer, ...holes][]), or
// null for open lines/points. Closed LineStrings count as areas: OSM
// buildings and small lakes arrive as closed ways, not Polygons.
export function areaPolygons(f: GeoJSON.Feature): [number, number][][][] | null {
  const g = f.geometry;
  if (g.type === 'Polygon') return [g.coordinates as [number, number][][]];
  if (g.type === 'MultiPolygon') return g.coordinates as [number, number][][][];
  if (g.type === 'LineString') {
    const c = g.coordinates as [number, number][];
    if (c.length > 3 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1]) return [[c]];
  }
  return null;
}

// Picks a round scale-bar length (in true meters) that fits within ~1/4 of
// the given page width, and its length in page mm.
export function computeScaleBar(trueWidthMeters: number, pageW: number): { length: number; px: number } {
  const lengths = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
  let length = lengths[0];
  for (const l of lengths) {
    if (l < trueWidthMeters / 4) length = l;
  }
  const metersPerPdfUnit = trueWidthMeters / pageW;
  return { length, px: length / metersPerPdfUnit };
}
