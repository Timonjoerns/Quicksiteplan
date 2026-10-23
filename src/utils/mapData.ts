import { osmElementsToGeoJSON } from './osmToGeoJSON';

// Fetched data: raw Overpass elements plus generated contour lines.
export interface MapData {
  elements: any[];
  contours: GeoJSON.Feature[];
  // area and scale the data was fetched for (contours are regenerated for
  // these when only the interval changes)
  bbox: [number, number, number, number];
  scale: number;
}

export function dataToFeatures(data: MapData | null): GeoJSON.Feature[] {
  if (!data) return [];
  return [...osmElementsToGeoJSON(data.elements).features, ...data.contours];
}
