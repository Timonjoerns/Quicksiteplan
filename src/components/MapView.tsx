

// ...existing imports...

import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
// @ts-ignore
import DrawRectangle from 'mapbox-gl-draw-rectangle-mode';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';


import { OSMFeatureType } from './DataSelector';

interface MapViewProps {
  styleUrl: string;
  bbox: [number, number, number, number];
  onBboxChange: (bbox: [number, number, number, number]) => void;
  osmData?: any;
  selectedTypes?: OSMFeatureType[];
}


const MapView = forwardRef<maplibregl.Map | undefined, MapViewProps>(
  ({ styleUrl, bbox, onBboxChange, osmData, selectedTypes = ['water', 'streets', 'buildings'] }, ref) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);

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

  useImperativeHandle(ref, () => mapRef.current ?? undefined, [mapRef.current]);

  // Draw control ref
  const drawRef = useRef<MapboxDraw | null>(null);


  // Initialize map
  useEffect(() => {
    if (mapContainer.current && !mapRef.current) {
      mapRef.current = new maplibregl.Map({
        container: mapContainer.current,
        style: styleUrl,
        bounds: bbox,
        fitBoundsOptions: { padding: 20 },
      });
    }
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [styleUrl]);

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
      if (!map || cancelled) return;
      // Remove previous source/layer if exists
      [
        'osm-water',
        'osm-streets',
        'osm-buildings',
        'osm-railways',
      ].forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      });
      if (osmData && osmData.elements) {
        // Split features by type
        const geojson = osmToGeoJSON(osmData);
        // Only show selected types
        const water = { type: 'FeatureCollection' as const, features: selectedTypes && selectedTypes.includes('water') ? geojson.features.filter(f => f.properties && (f.properties.waterway || f.properties.natural === 'water')) : [] };
        const streets = { type: 'FeatureCollection' as const, features: selectedTypes && selectedTypes.includes('streets') ? geojson.features.filter(f => f.properties && (f.properties.highway)) : [] };
        const buildings = { type: 'FeatureCollection' as const, features: selectedTypes && selectedTypes.includes('buildings') ? geojson.features.filter(f => f.properties && (f.properties.building)) : [] };
        const railways = { type: 'FeatureCollection' as const, features: selectedTypes && selectedTypes.includes('railways') ? geojson.features.filter(f => f.properties && (f.properties.railway === 'rail')) : [] };

        // Add sources
        map.addSource('osm-water', { type: 'geojson', data: water });
        map.addSource('osm-streets', { type: 'geojson', data: streets });
        map.addSource('osm-buildings', { type: 'geojson', data: buildings });
        map.addSource('osm-railways', { type: 'geojson', data: railways });

        // Add layers with different colors, in correct order (water below everything, then railways, streets, buildings)
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
    // Only handle ways as LineString for MVP
    const nodes: Record<string, [number, number]> = {};
    for (const el of osm.elements) {
      if (el.type === 'node') {
        nodes[el.id] = [el.lon, el.lat];
      }
    }
    const features: GeoJSON.Feature[] = [];
    for (const el of osm.elements) {
      if (el.type === 'way' && el.nodes) {
        const coords = el.nodes.map((nid: string) => nodes[nid]).filter(Boolean);
        if (coords.length > 1) {
          features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
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
