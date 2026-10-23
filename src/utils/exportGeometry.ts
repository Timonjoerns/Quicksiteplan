import proj4 from 'proj4';
import { OSMFeatureType } from '../components/DataSelector';

export type CategoryMap = Partial<Record<OSMFeatureType, GeoJSON.Feature[]>>;

export interface PreparedExport {
  // Projects a [lon, lat] into page-space [x, y] in mm (0,0 = top-left),
  // or [NaN, NaN] if the point falls outside the export bbox.
  project: (coord: [number, number]) => [number, number];
  categories: CategoryMap;
  // True ground width of the bbox in meters (equirectangular approximation)
  // — NOT the same as the Web Mercator coordinate span, which inflates
  // distance away from the equator by 1/cos(latitude). Always use this for
  // anything labeled "meters" (e.g. a scale bar).
  trueWidthMeters: number;
}

const MERCATOR_PROJ = '+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs';

// Splits GeoJSON features into the app's fixed OSM categories, and builds a
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
    if (x < cropMinX || x > cropMaxX || y < cropMinY || y > cropMaxY) return [NaN, NaN];
    const px = ((x - cropMinX) / (cropMaxX - cropMinX)) * pageW;
    const py = pageH - ((y - cropMinY) / (cropMaxY - cropMinY)) * pageH;
    return [px, py];
  };

  const has = (type: OSMFeatureType) => selectedTypes.includes(type);
  const categories: CategoryMap = {
    water: features.filter(f => has('water') && f.properties && (f.properties.waterway || f.properties.natural === 'water')),
    streets: features.filter(f => has('streets') && f.properties && f.properties.highway),
    buildings: features.filter(f => has('buildings') && f.properties && f.properties.building),
    railways: features.filter(f => has('railways') && f.properties && f.properties.railway === 'rail'),
    trees: features.filter(f => has('trees') && f.properties && f.properties.natural === 'tree'),
    greenery: features.filter(f => has('greenery') && f.properties && (
      f.properties.landuse === 'forest' || f.properties.landuse === 'grass' || f.properties.landuse === 'meadow' ||
      f.properties.landuse === 'orchard' || f.properties.landuse === 'vineyard' || f.properties.landuse === 'farmland' ||
      f.properties.landuse === 'allotments' || f.properties.leisure === 'park' || f.properties.leisure === 'garden' ||
      f.properties.leisure === 'nature_reserve' || f.properties.natural === 'wood' || f.properties.natural === 'scrub' ||
      f.properties.natural === 'grassland' || f.properties.natural === 'heath'
    )),
  };

  return { project, categories, trueWidthMeters };
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
