


// ...existing imports...

import React, { useRef, useEffect, forwardRef, useImperativeHandle, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { OSMFeatureType } from './DataSelector';

interface MapViewProps {
  styleUrl: string;
  bbox: [number, number, number, number];
  onBboxChange: (bbox: [number, number, number, number]) => void;
  osmData?: any;
  selectedTypes?: OSMFeatureType[];
}


const MapView = forwardRef<maplibregl.Map | undefined, MapViewProps>(
  ({ styleUrl, bbox, onBboxChange, osmData, selectedTypes = ['water', 'streets', 'buildings', 'trees', 'greenery'] }, ref) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const [mapInitialized, setMapInitialized] = useState(false);

    // Draw a center marker for the map frame, update on move/zoom
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;
      let markerId = 'frame-center-marker';
      function updateMarker() {
        if (!map || !map.isStyleLoaded()) return;
        const center = map.getCenter();
        if (!map) return;
        // Remove old marker if exists
        if (map.getSource(markerId)) {
          map.removeLayer(markerId);
          map.removeSource(markerId);
        }
        map.addSource(markerId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [center.lng, center.lat] },
            properties: {},
          },
        });
        map.addLayer({
          id: markerId,
          type: 'circle',
          source: markerId,
          paint: {
            'circle-radius': 7,
            'circle-color': '#1976d2',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
          },
        });
      }
      // Initial draw
      if (map.isStyleLoaded()) updateMarker();
      else map.once('styledata', updateMarker);
      // Update on move/zoom
      map.on('move', updateMarker);
      // Cleanup
      return () => {
        map.off('move', updateMarker);
        if (map.getSource(markerId)) {
          map.removeLayer(markerId);
          map.removeSource(markerId);
        }
      };
    }, []);

  // Initial bbox, captured once: used only to position the map on first
  // load. Intentionally not reactive — re-running this effect on every
  // bbox change would destroy and recreate the whole map.
  const initialBboxRef = useRef(bbox);

  // Initialize map
  useEffect(() => {
    if (mapContainer.current && !mapRef.current) {
      mapRef.current = new maplibregl.Map({
        container: mapContainer.current,
        style: styleUrl,
        bounds: initialBboxRef.current,
        fitBoundsOptions: { padding: 20 },
      });
      setMapInitialized(true);
    }
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        setMapInitialized(false);
      }
    };
  }, [styleUrl]);

  useImperativeHandle(ref, () => mapInitialized ? mapRef.current || undefined : undefined, [mapInitialized]);

  // Add/update bbox layer whenever bbox changes, but only after style is loaded
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const bboxGeoJSON: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [minLon, minLat],
              [minLon, maxLat],
              [maxLon, maxLat],
              [maxLon, minLat],
              [minLon, minLat],
            ]],
          },
          properties: {},
        },
      ],
    };
    function addOrUpdateBbox() {
      if (map.getSource('bbox')) {
        (map.getSource('bbox') as any).setData(bboxGeoJSON);
      } else {
        map.addSource('bbox', { type: 'geojson', data: bboxGeoJSON });
        map.addLayer({
          id: 'bbox-fill',
          type: 'fill',
          source: 'bbox',
          paint: { 'fill-color': '#ff2222', 'fill-opacity': 0.08 },
        });
        map.addLayer({
          id: 'bbox-visible',
          type: 'line',
          source: 'bbox',
          paint: { 'line-color': '#ff2222', 'line-width': 4, 'line-dasharray': [2, 2], 'line-opacity': 0.9 },
        });
      }
    }
    if (map.isStyleLoaded && map.isStyleLoaded()) {
      addOrUpdateBbox();
    } else {
      map.once('styledata', addOrUpdateBbox);
    }
  }, [bbox]);

  // Add/update OSM data as GeoJSON source/layer after style is loaded
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    let cancelled = false;
    function updateLayers() {
      if (!map || cancelled || !map.isStyleLoaded()) return;
      // Remove previous layers first, then sources
      const layerIds = [
        'osm-greenery-fill',
        'osm-greenery',
        'osm-water',
        'osm-streets',
        'osm-buildings',
        'osm-railways',
        'osm-trees',
      ];
      const sourceIds = [
        'osm-water',
        'osm-streets',
        'osm-buildings',
        'osm-railways',
        'osm-trees',
        'osm-greenery',
      ];
      
      // Remove layers first
      layerIds.forEach(id => {
        if (map.getLayer(id)) {
          map.removeLayer(id);
        }
      });
      
      // Then remove sources
      sourceIds.forEach(id => {
        if (map.getSource(id)) {
          map.removeSource(id);
        }
      });
      if (osmData && osmData.elements) {
        // Split features by type
        const geojson = osmToGeoJSON(osmData);
        // Only show selected types
        const water = { type: 'FeatureCollection' as const, features: selectedTypes && selectedTypes.includes('water') ? geojson.features.filter(f => f.properties && (f.properties.waterway || f.properties.natural === 'water')) : [] };
        const streets = { type: 'FeatureCollection' as const, features: selectedTypes && selectedTypes.includes('streets') ? geojson.features.filter(f => f.properties && (f.properties.highway)) : [] };
        const buildings = { type: 'FeatureCollection' as const, features: selectedTypes && selectedTypes.includes('buildings') ? geojson.features.filter(f => f.properties && (f.properties.building)) : [] };
        const railways = { type: 'FeatureCollection' as const, features: selectedTypes && selectedTypes.includes('railways') ? geojson.features.filter(f => f.properties && (f.properties.railway === 'rail')) : [] };
        const trees = { type: 'FeatureCollection' as const, features: selectedTypes && selectedTypes.includes('trees') ? geojson.features.filter(f => f.properties && (f.properties.natural === 'tree')) : [] };
        const greenery = { type: 'FeatureCollection' as const, features: selectedTypes && selectedTypes.includes('greenery') ? geojson.features.filter(f => f.properties && (f.properties.landuse === 'forest' || f.properties.landuse === 'grass' || f.properties.landuse === 'meadow' || f.properties.landuse === 'orchard' || f.properties.landuse === 'vineyard' || f.properties.landuse === 'farmland' || f.properties.landuse === 'allotments' || f.properties.leisure === 'park' || f.properties.leisure === 'garden' || f.properties.leisure === 'nature_reserve' || f.properties.natural === 'wood' || f.properties.natural === 'scrub' || f.properties.natural === 'grassland' || f.properties.natural === 'heath')) : [] };

        // Add sources
        map.addSource('osm-water', { type: 'geojson', data: water });
        map.addSource('osm-streets', { type: 'geojson', data: streets });
        map.addSource('osm-buildings', { type: 'geojson', data: buildings });
        map.addSource('osm-railways', { type: 'geojson', data: railways });
        map.addSource('osm-trees', { type: 'geojson', data: trees });
        map.addSource('osm-greenery', { type: 'geojson', data: greenery });

        // Add layers with different colors, in correct order (greenery fill below everything, water, then railways, streets, buildings, trees on top)
        map.addLayer({
          id: 'osm-greenery-fill',
          type: 'fill',
          source: 'osm-greenery',
          paint: { 'fill-color': '#90EE90', 'fill-opacity': 0.4 },
        });
        map.addLayer({
          id: 'osm-greenery',
          type: 'line',
          source: 'osm-greenery',
          paint: { 'line-color': '#228B22', 'line-width': 1.5 },
        });
        map.addLayer({
          id: 'osm-water',
          type: 'line',
          source: 'osm-water',
          paint: { 'line-color': '#3399ff', 'line-width': 2 },
        });
        map.addLayer({
          id: 'osm-railways',
          type: 'line',
          source: 'osm-railways',
          paint: { 'line-color': '#444', 'line-width': 2, 'line-dasharray': [2,2] },
        });
        map.addLayer({
          id: 'osm-streets',
          type: 'line',
          source: 'osm-streets',
          paint: { 'line-color': '#ff6600', 'line-width': 2 },
        });
        map.addLayer({
          id: 'osm-buildings',
          type: 'line',
          source: 'osm-buildings',
          paint: { 'line-color': '#888888', 'line-width': 2 },
        });
        map.addLayer({
          id: 'osm-trees',
          type: 'circle',
          source: 'osm-trees',
          paint: { 
            'circle-radius': 4, 
            'circle-color': '#228B22', 
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff'
          },
        });
      }
    }
    if (map.isStyleLoaded && map.isStyleLoaded()) {
      updateLayers();
    } else {
      map.once('styledata', updateLayers);
    }
    return () => { cancelled = true; };
  }, [osmData, selectedTypes]);

  // Helper: Convert OSM JSON to GeoJSON
  function osmToGeoJSON(osm: any): GeoJSON.FeatureCollection {
    // Handle both nodes (for trees) and ways (for other features)
    const nodes: Record<string, [number, number]> = {};
    for (const el of osm.elements) {
      if (el.type === 'node') {
        nodes[el.id] = [el.lon, el.lat];
      }
    }
    const features: GeoJSON.Feature[] = [];
    for (const el of osm.elements) {
      // Handle standalone nodes (like trees)
      if (el.type === 'node' && el.tags && Object.keys(el.tags).length > 0) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
          properties: el.tags || {},
        });
      }
      // Handle ways
      if (el.type === 'way' && el.nodes) {
        const coords = el.nodes.map((nid: string) => nodes[nid]).filter(Boolean);
        if (coords.length > 1) {
          // Check if it's a closed way (polygon) - for greenery areas
          const isClosed = el.nodes[0] === el.nodes[el.nodes.length - 1];
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
              coordinates: isArea ? [coords] : coords 
            },
            properties: el.tags || {},
          });
        }
      }
    }
    return { type: 'FeatureCollection', features };
  }

  // Removed auto-fitBounds on every bbox change to fix zoom issue


  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 100,
        pointerEvents: 'none',
      }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="8" fill="#fff" fillOpacity="0.8" />
          <circle cx="14" cy="14" r="7" fill="#1976d2" fillOpacity="0.9" stroke="#fff" strokeWidth="2" />
          <circle cx="14" cy="14" r="3" fill="#fff" />
        </svg>
      </div>
    </div>
  );
  }
);

export default MapView;
