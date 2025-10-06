import axios from 'axios';
import { OSMFeatureType } from '../components/DataSelector';

// Map OSMFeatureType to Overpass QL queries
const featureQueries: Record<OSMFeatureType, string> = {
  water: 'way["natural"="water"]',
  streets: 'way["highway"]',
  buildings: 'way["building"]',
  railways: 'way["railway"="rail"]',
  trees: 'node["natural"="tree"]',
  // For greenery, return multiple queries as array that will be expanded
  greenery: 'way["landuse"="forest"];way["landuse"="grass"];way["landuse"="meadow"];way["landuse"="orchard"];way["landuse"="vineyard"];way["landuse"="farmland"];way["landuse"="allotments"];way["leisure"="park"];way["leisure"="garden"];way["leisure"="nature_reserve"];way["natural"="wood"];way["natural"="scrub"];way["natural"="grassland"];way["natural"="heath"]',
};

export async function fetchOsmData(
  bbox: [number, number, number, number],
  types: OSMFeatureType[]
): Promise<any> {
  // Overpass expects (south,west,north,east)
  const bboxStr = `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`;
  // Group all type queries in a union block so Overpass returns all at once
  const queries = types.flatMap(type => {
    const q = featureQueries[type];
    // Check if query contains multiple statements (separated by semicolon)
    if (q.includes(';')) {
      // Split and add bbox to each
      return q.split(';').filter(s => s.trim()).map(subq => `${subq}(${bboxStr});`);
    } else {
      return [`${q}(${bboxStr});`];
    }
  }).join('\n');
  const query = `[out:json][timeout:25];
(
${queries}
);
out body;>;
out skel qt;`;
  console.log('Overpass Query:', query);
  const url = 'https://overpass.kumi.systems/api/interpreter';
  const response = await axios.post(url, query, {
    headers: { 'Content-Type': 'text/plain' },
  });
  return response.data;
}