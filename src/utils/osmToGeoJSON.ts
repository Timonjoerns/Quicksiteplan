type Coord = [number, number];

const sameCoord = (a: Coord, b: Coord) => a[0] === b[0] && a[1] === b[1];

// Joins way segments end-to-end into closed rings. Segments may be stored
// in either direction; anything that can't be closed is dropped.
function assembleRings(segments: Coord[][]): Coord[][] {
  const remaining = segments.filter(s => s.length > 1).map(s => s.slice());
  const rings: Coord[][] = [];
  while (remaining.length > 0) {
    let ring = remaining.shift()!;
    let extended = true;
    while (!sameCoord(ring[0], ring[ring.length - 1]) && extended) {
      extended = false;
      const end = ring[ring.length - 1];
      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i];
        if (sameCoord(seg[0], end)) {
          ring = ring.concat(seg.slice(1));
        } else if (sameCoord(seg[seg.length - 1], end)) {
          ring = ring.concat(seg.slice(0, -1).reverse());
        } else {
          continue;
        }
        remaining.splice(i, 1);
        extended = true;
        break;
      }
    }
    if (ring.length > 3 && sameCoord(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

function pointInRing([x, y]: Coord, ring: Coord[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Builds GeoJSON polygon coordinates ([outer, ...holes][]) from a
// multipolygon relation's `out geom` members.
function relationToPolygons(members: any[]): Coord[][][] {
  const toCoords = (m: any): Coord[] => (Array.isArray(m.geometry) ? m.geometry : [])
    .filter((pt: any) => pt && typeof pt.lon === 'number' && typeof pt.lat === 'number')
    .map((pt: any): Coord => [pt.lon, pt.lat]);
  const ways = members.filter(m => m.type === 'way');
  const outers = assembleRings(ways.filter(m => m.role !== 'inner').map(toCoords));
  const inners = assembleRings(ways.filter(m => m.role === 'inner').map(toCoords));
  const polygons: Coord[][][] = outers.map(o => [o]);
  inners.forEach(inner => {
    const owner = polygons.find(p => pointInRing(inner[0], p[0]));
    if (owner) owner.push(inner);
  });
  return polygons;
}

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

    // Multipolygon relations (large lakes, rivers, parks): the area is
    // split over many member ways that have to be stitched into rings.
    if (el.type === 'relation' && Array.isArray(el.members)) {
      const polygons = relationToPolygons(el.members);
      if (polygons.length > 0) {
        features.push({
          type: 'Feature',
          geometry: polygons.length === 1
            ? { type: 'Polygon', coordinates: polygons[0] }
            : { type: 'MultiPolygon', coordinates: polygons },
          properties: el.tags || {},
        });
      }
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
