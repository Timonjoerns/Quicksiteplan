import axios from 'axios';
import { OSMFeatureType } from '../components/DataSelector';

// Map OSMFeatureType to Overpass QL queries
const featureQueries: Record<OSMFeatureType, string> = {
  water: 'way["natural"="water"]',
  streets: 'way["highway"]',
  buildings: 'way["building"]',
  // parks removed
  railways: 'way["railway"="rail"]',
};

export async function fetchOsmData(
  bbox: [number, number, number, number],
  types: OSMFeatureType[]
): Promise<any> {
  // Overpass expects (south,west,north,east)
  const bboxStr = `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`;
  // Group all type queries in a union block so Overpass returns all at once
  const queries = types.map(type => `${featureQueries[type]}(${bboxStr});`).join('\n');
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