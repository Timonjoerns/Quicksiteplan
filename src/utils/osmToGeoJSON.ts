// Converts raw Overpass `out geom;` elements into a GeoJSON FeatureCollection.
// Ways carry their coordinates inline (`el.geometry`), so unlike the old
// `out body; >; out skel qt;` format, there's no need to separately look up
// referenced nodes.
export function osmElementsToGeoJSON(elements: any[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const el of elements) {
    // Standalone tagged nodes (e.g. trees)
    if (el.type === 'node' && el.tags && Object.keys(el.tags).length > 0) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
        properties: el.tags || {},
      });
      continue;
    }

    if (el.type === 'way' && Array.isArray(el.geometry)) {
      const coords = el.geometry
        .filter((pt: any) => pt && typeof pt.lon === 'number' && typeof pt.lat === 'number')
        .map((pt: any): [number, number] => [pt.lon, pt.lat]);
      if (coords.length > 1) {
        const first = coords[0];
        const last = coords[coords.length - 1];
        const isClosed = first[0] === last[0] && first[1] === last[1];
        const isArea = isClosed && (
          el.tags?.landuse ||
          el.tags?.leisure === 'park' ||
          el.tags?.leisure === 'garden' ||
          el.tags?.leisure === 'nature_reserve' ||
          el.tags?.natural === 'wood' ||
          el.tags?.natural === 'scrub' ||
          el.tags?.natural === 'grassland' ||
          el.tags?.natural === 'heath'
        );

        features.push({
          type: 'Feature',
          geometry: {
            type: isArea ? 'Polygon' : 'LineString',
            coordinates: isArea ? [coords] : coords,
          },
          properties: el.tags || {},
        });
      }
    }
  }

  return { type: 'FeatureCollection', features };
}
