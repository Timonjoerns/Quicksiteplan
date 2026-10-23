// Attribution and disclaimer printed on every export. The OSM licence
// (ODbL) requires the credit on anything showing the data; the elevation
// sources ask to be credited too; the disclaimer makes clear these plans
// aren't official survey documents.
export function exportCredits(hasContours: boolean): string[] {
  return [
    'Map data © OpenStreetMap contributors, ODbL (openstreetmap.org/copyright)',
    ...(hasContours ? ['Elevation: AWS Terrain Tiles; contains modified Copernicus EU-DEM data and NASA SRTM'] : []),
    'Not an official survey map. No guarantee of accuracy or completeness.',
  ];
}

// Typographic points to millimeters (font sizes are given in pt).
export const PT_TO_MM = 25.4 / 72;
