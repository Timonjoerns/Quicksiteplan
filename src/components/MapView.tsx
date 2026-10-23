


// ...existing imports...

import React, { useRef, useEffect, forwardRef, useImperativeHandle, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { OSMFeatureType } from './DataSelector';
import { findNearestDin, findNearestDinDimension, PAPER_SIZES, DIN_DIMENSIONS } from '../utils/paperSizes';
import { MapData, dataToFeatures } from '../utils/mapData';
import { categorizeFeatures, areaPolygons } from '../utils/exportGeometry';
import { LayerStyle, StyleMap } from '../utils/exportStyles';

interface MapViewProps {
  styleUrl: string;
  bbox: [number, number, number, number];
  onBboxChange: (bbox: [number, number, number, number]) => void;
  osmData?: MapData | null;
  selectedTypes?: OSMFeatureType[];
  layerStyles: StyleMap;
  scale: number;
  onResizeCommit: (patch: { paperSize: string; orientation: 'portrait' | 'landscape'; customWidthMm?: number; customHeightMm?: number }) => void;
}

const METERS_PER_DEG_LAT = 111320;
function metersPerDegLon(lat: number) {
  return 40075000 * Math.cos((lat * Math.PI) / 180) / 360;
}

type Corner = 'nw' | 'ne' | 'se' | 'sw';
const OPPOSITE_CORNER: Record<Corner, Corner> = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' };
// Direction the dragged corner lies in, relative to its (fixed) opposite anchor.
const CORNER_DIRECTION: Record<Corner, { lon: 1 | -1; lat: 1 | -1 }> = {
  nw: { lon: -1, lat: 1 },
  ne: { lon: 1, lat: 1 },
  se: { lon: 1, lat: -1 },
  sw: { lon: -1, lat: -1 },
};

function cornerLngLat(bbox: [number, number, number, number], corner: Corner): [number, number] {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  switch (corner) {
    case 'nw': return [minLon, maxLat];
    case 'ne': return [maxLon, maxLat];
    case 'se': return [maxLon, minLat];
    case 'sw': return [minLon, minLat];
  }
}

// Edge midpoint handles: dragging one resizes a single axis (width for e/w,
// height for n/s), snapping that axis to the nearest DIN side length while
// the opposite side and the other axis stay fixed.
type Edge = 'n' | 's' | 'e' | 'w';

function edgeLngLat(bbox: [number, number, number, number], edge: Edge): [number, number] {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const midLon = (minLon + maxLon) / 2;
  const midLat = (minLat + maxLat) / 2;
  switch (edge) {
    case 'n': return [midLon, maxLat];
    case 's': return [midLon, minLat];
    case 'e': return [maxLon, midLat];
    case 'w': return [minLon, midLat];
  }
}


// Preview layers, bottom to top (same order as the exports).
const PREVIEW_SOURCES = [
  'osm-greenery', 'osm-greenery-areas', 'osm-contours', 'osm-water', 'osm-water-areas', 'osm-railways',
  'osm-streets', 'osm-buildings', 'osm-buildings-areas', 'osm-trees',
];
const PREVIEW_LAYERS: { id: string; kind: 'fill' | 'line' | 'circle'; source: string; type: OSMFeatureType }[] = [
  { id: 'osm-greenery-fill', kind: 'fill', source: 'osm-greenery-areas', type: 'greenery' },
  { id: 'osm-greenery', kind: 'line', source: 'osm-greenery', type: 'greenery' },
  { id: 'osm-contours', kind: 'line', source: 'osm-contours', type: 'contours' },
  { id: 'osm-water-fill', kind: 'fill', source: 'osm-water-areas', type: 'water' },
  { id: 'osm-water', kind: 'line', source: 'osm-water', type: 'water' },
  { id: 'osm-railways', kind: 'line', source: 'osm-railways', type: 'railways' },
  { id: 'osm-streets', kind: 'line', source: 'osm-streets', type: 'streets' },
  { id: 'osm-buildings-fill', kind: 'fill', source: 'osm-buildings-areas', type: 'buildings' },
  { id: 'osm-buildings', kind: 'line', source: 'osm-buildings', type: 'buildings' },
  { id: 'osm-trees', kind: 'circle', source: 'osm-trees', type: 'trees' },
];

const hex = ([r, g, b]: [number, number, number]) => `rgb(${r},${g},${b})`;

// A real-world size (m) as screen pixels at each zoom level, never thinner
// than minPx so hairlines stay visible. MapLibre zoom uses 512 px tiles.
function metersToPx(meters: number, lat: number, minPx: number): any {
  const base = meters / (78271.517 * Math.cos((lat * Math.PI) / 180));
  const stops: number[] = [];
  for (let z = 0; z <= 24; z += 2) stops.push(z, Math.max(minPx, base * 2 ** z));
  return ['interpolate', ['exponential', 2], ['zoom'], ...stops];
}

function applyPreviewPaint(map: maplibregl.Map, styles: StyleMap, scale: number, lat: number) {
  const mmToM = (mm: number) => (mm / 1000) * scale;
  PREVIEW_LAYERS.forEach(({ id, kind, type }) => {
    if (!map.getLayer(id)) return;
    const s: LayerStyle = styles[type];
    const color = hex(s.color);
    if (kind === 'fill') {
      map.setPaintProperty(id, 'fill-color', hex(s.fillColor ?? s.color));
      map.setPaintProperty(id, 'fill-opacity', s.fill ? Math.max(s.fillOpacity, s.texture ? 0.35 : 0) : 0);
    } else if (kind === 'line') {
      map.setPaintProperty(id, 'line-color', color);
      map.setPaintProperty(id, 'line-width', metersToPx(mmToM(Math.max(s.lineWidth, 0.05)), lat, s.lineWidth > 0 ? 0.6 : 0));
      map.setPaintProperty(id, 'line-opacity', s.lineWidth > 0 ? 1 : 0);
      map.setPaintProperty(id, 'line-dasharray', s.dash && s.lineWidth > 0 ? [s.dash[0] / s.lineWidth, s.dash[1] / s.lineWidth] : [1, 0]);
    } else {
      const rMeters = type === 'trees' && s.canopy ? 3 : mmToM(s.pointRadius ?? 0.8);
      map.setPaintProperty(id, 'circle-color', hex(type === 'trees' && s.canopy ? (s.fillColor ?? s.color) : s.color));
      map.setPaintProperty(id, 'circle-radius', metersToPx(rMeters, lat, 1.5));
    }
  });
}

const MapView = forwardRef<maplibregl.Map | undefined, MapViewProps>(
  ({ styleUrl, bbox, onBboxChange, osmData, selectedTypes = ['water', 'streets', 'buildings', 'trees', 'greenery'], layerStyles, scale, onResizeCommit }, ref) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const [mapInitialized, setMapInitialized] = useState(false);
    const [styleReady, setStyleReady] = useState(false);

    // Latest values for the drag handlers below, which are bound once and
    // would otherwise close over stale props/state.
    const liveRef = useRef({ bbox, scale, onBboxChange, onResizeCommit });
    liveRef.current = { bbox, scale, onBboxChange, onResizeCommit };

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
            'circle-radius': 6,
            'circle-color': '#1a1a1a',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#e3e3de',
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
      // 'load' fires once the base style is usable. isStyleLoaded() is
      // stricter (false while any tile or image is still pending, which can
      // last a long time), so it's no gate for adding the data layers.
      mapRef.current.once('load', () => setStyleReady(true));
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

  // Add/update bbox layer (fill, outline, drag handles) whenever bbox
  // changes, but only after style is loaded
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const corners: Corner[] = ['nw', 'ne', 'se', 'sw'];
    const edges: Edge[] = ['n', 's', 'e', 'w'];
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
        ...edges.map((edge): GeoJSON.Feature => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: edgeLngLat(bbox, edge) },
          properties: { edge },
        })),
        ...corners.map((corner): GeoJSON.Feature => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: cornerLngLat(bbox, corner) },
          properties: { corner },
        })),
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
          paint: { 'fill-color': '#1a1a1a', 'fill-opacity': 0.06 },
        });
        map.addLayer({
          id: 'bbox-visible',
          type: 'line',
          source: 'bbox',
          paint: { 'line-color': '#1a1a1a', 'line-width': 2.5, 'line-dasharray': [2, 2], 'line-opacity': 0.9 },
        });
        if (!map.getSource('resize-guides')) {
          map.addSource('resize-guides', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          map.addLayer({
            id: 'resize-guides-line',
            type: 'line',
            source: 'resize-guides',
            filter: ['==', ['geometry-type'], 'LineString'],
            paint: {
              'line-color': '#2563eb',
              'line-width': 1.4,
              'line-dasharray': ['literal', [2, 1.5]],
              'line-opacity': 0.75,
            },
          });
          map.addLayer({
            id: 'resize-guides-label',
            type: 'symbol',
            source: 'resize-guides',
            filter: ['==', ['geometry-type'], 'Point'],
            layout: {
              'text-field': ['get', 'label'],
              'text-size': 11,
              'text-anchor': ['get', 'anchor'],
              'text-offset': ['get', 'offset'],
              'text-allow-overlap': true,
              'text-ignore-placement': true,
            },
            paint: {
              'text-color': '#2563eb',
              'text-opacity': 0.95,
              'text-halo-color': '#e3e3de',
              'text-halo-width': 1.2,
            },
          });
        }
        // Larger invisible hit target, easier to grab than the visible dot
        map.addLayer({
          id: 'bbox-handle-hit',
          type: 'circle',
          source: 'bbox',
          paint: { 'circle-radius': 20, 'circle-color': '#000000', 'circle-opacity': 0 },
        });
        map.addLayer({
          id: 'bbox-handle-dot',
          type: 'circle',
          source: 'bbox',
          paint: {
            'circle-radius': 5,
            'circle-color': '#1a1a1a',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#e3e3de',
          },
        });
      }
    }
    if (map.isStyleLoaded && map.isStyleLoaded()) {
      addOrUpdateBbox();
    } else {
      map.once('styledata', addOrUpdateBbox);
    }
  }, [bbox]);

  // Drag interactions: move the whole frame by dragging inside it, or
  // resize it from a corner handle. Bound once; reads live values via
  // liveRef so the handlers never go stale.
  useEffect(() => {
    if (!mapRef.current) return;
    // Bound to a fresh, explicitly non-null const so closures below don't
    // need cross-closure null narrowing (which TS doesn't do for plain
    // function declarations).
    const map: maplibregl.Map = mapRef.current;

    type DragState =
      | { mode: 'move'; startLngLat: maplibregl.LngLat; startBbox: [number, number, number, number] }
      | { mode: 'resize-corner'; corner: Corner; anchor: [number, number] }
      | { mode: 'resize-edge'; edge: Edge; bboxAtStart: [number, number, number, number] };

    let drag: DragState | null = null;
    let lastGuideOrientation: 'portrait' | 'landscape' | null = null;

    function computeCornerResizeBbox(anchor: [number, number], cursor: [number, number], scale: number) {
      const [anchorLon, anchorLat] = anchor;
      const [cursorLon, cursorLat] = cursor;
      const refLat = (anchorLat + cursorLat) / 2;
      const mPerLon = metersPerDegLon(refLat) || 1;

      const rawWMeters = Math.abs(cursorLon - anchorLon) * mPerLon;
      const rawHMeters = Math.abs(cursorLat - anchorLat) * METERS_PER_DEG_LAT;
      const wmm = (rawWMeters * 1000) / scale;
      const hmm = (rawHMeters * 1000) / scale;

      const din = findNearestDin(wmm, hmm, 0.08);
      const finalWmm = din ? din.wmm : wmm;
      const finalHmm = din ? din.hmm : hmm;
      const wMeters = (finalWmm / 1000) * scale;
      const hMeters = (finalHmm / 1000) * scale;

      const dirLon = cursorLon >= anchorLon ? 1 : -1;
      const dirLat = cursorLat >= anchorLat ? 1 : -1;
      const newLon = anchorLon + dirLon * (wMeters / mPerLon);
      const newLat = anchorLat + dirLat * (hMeters / METERS_PER_DEG_LAT);

      const newBbox: [number, number, number, number] = [
        Math.min(anchorLon, newLon), Math.min(anchorLat, newLat),
        Math.max(anchorLon, newLon), Math.max(anchorLat, newLat),
      ];
      return { newBbox, din, wmm: finalWmm, hmm: finalHmm };
    }

    // Resize a single axis (the dragged edge), snapping that axis alone to
    // the nearest DIN side length, while the opposite edge and the other
    // axis stay exactly where they were.
    function computeEdgeResizeBbox(bboxAtStart: [number, number, number, number], edge: Edge, cursor: [number, number], scale: number) {
      const [minLon, minLat, maxLon, maxLat] = bboxAtStart;
      const [cursorLon, cursorLat] = cursor;
      const refLat = (minLat + maxLat) / 2;
      const mPerLon = metersPerDegLon(refLat) || 1;

      let newBbox: [number, number, number, number];
      let wmm: number;
      let hmm: number;

      if (edge === 'e' || edge === 'w') {
        const anchorLon = edge === 'e' ? minLon : maxLon;
        const rawMeters = Math.abs(cursorLon - anchorLon) * mPerLon;
        const mm = (rawMeters * 1000) / scale;
        const snapped = findNearestDinDimension(mm) ?? mm;
        const meters = (snapped / 1000) * scale;
        const dir = cursorLon >= anchorLon ? 1 : -1;
        const newLon = anchorLon + dir * (meters / mPerLon);
        newBbox = [Math.min(anchorLon, newLon), minLat, Math.max(anchorLon, newLon), maxLat];
        wmm = snapped;
        hmm = ((maxLat - minLat) * METERS_PER_DEG_LAT * 1000) / scale;
      } else {
        const anchorLat = edge === 'n' ? minLat : maxLat;
        const rawMeters = Math.abs(cursorLat - anchorLat) * METERS_PER_DEG_LAT;
        const mm = (rawMeters * 1000) / scale;
        const snapped = findNearestDinDimension(mm) ?? mm;
        const meters = (snapped / 1000) * scale;
        const dir = cursorLat >= anchorLat ? 1 : -1;
        const newLat = anchorLat + dir * (meters / METERS_PER_DEG_LAT);
        newBbox = [minLon, Math.min(anchorLat, newLat), maxLon, Math.max(anchorLat, newLat)];
        wmm = ((maxLon - minLon) * mPerLon * 1000) / scale;
        hmm = snapped;
      }

      const din = findNearestDin(wmm, hmm, 0.08);
      return { newBbox, din, wmm, hmm };
    }

    function guidesSource() {
      return map.getSource('resize-guides') as maplibregl.GeoJSONSource | undefined;
    }

    function setGuides(features: GeoJSON.Feature[]) {
      guidesSource()?.setData({ type: 'FeatureCollection', features });
    }

    function clearGuides() {
      guidesSource()?.setData({ type: 'FeatureCollection', features: [] });
    }

    // Nested rectangle "shadow guides" anchored at the fixed corner, one per
    // DIN size in the orientation (portrait/landscape) the current drag is
    // heading toward, so the user can see where to go to land exactly on a
    // given format (like the classic A-series diagram).
    function buildCornerGuides(anchor: [number, number], corner: Corner, scale: number, orientation: 'portrait' | 'landscape'): GeoJSON.Feature[] {
      const [anchorLon, anchorLat] = anchor;
      const { lon: dirLon, lat: dirLat } = CORNER_DIRECTION[corner];
      const mPerLon = metersPerDegLon(anchorLat) || 1;
      const features: GeoJSON.Feature[] = [];

      Object.keys(PAPER_SIZES).forEach(key => {
        let [wmm, hmm] = PAPER_SIZES[key];
        if (orientation === 'landscape') [wmm, hmm] = [hmm, wmm];
        const wMeters = (wmm / 1000) * scale;
        const hMeters = (hmm / 1000) * scale;
        const farLon = anchorLon + dirLon * (wMeters / mPerLon);
        const farLat = anchorLat + dirLat * (hMeters / METERS_PER_DEG_LAT);

        features.push({
          type: 'Feature',
          properties: { faint: false },
          geometry: {
            type: 'LineString',
            coordinates: [
              [anchorLon, anchorLat], [farLon, anchorLat], [farLon, farLat], [anchorLon, farLat], [anchorLon, anchorLat],
            ],
          },
        });

        features.push({
          type: 'Feature',
          properties: {
            label: orientation === 'landscape' ? `${key} L` : key,
            anchor: `${dirLat > 0 ? 'bottom' : 'top'}-${dirLon > 0 ? 'left' : 'right'}`,
            offset: [dirLon > 0 ? 0.4 : -0.4, dirLat > 0 ? -0.4 : 0.4],
          },
          geometry: { type: 'Point', coordinates: [farLon, farLat] },
        });
      });
      return features;
    }

    // Straight guide lines across the fixed axis, one per DIN side length,
    // for a single-axis edge drag.
    function buildEdgeGuides(bboxAtStart: [number, number, number, number], edge: Edge, scale: number): GeoJSON.Feature[] {
      const [minLon, minLat, maxLon, maxLat] = bboxAtStart;
      const refLat = (minLat + maxLat) / 2;
      const mPerLon = metersPerDegLon(refLat) || 1;
      const features: GeoJSON.Feature[] = [];

      if (edge === 'e' || edge === 'w') {
        const anchorLon = edge === 'e' ? minLon : maxLon;
        const dir = edge === 'e' ? 1 : -1;
        const midLat = (minLat + maxLat) / 2;
        const spanLat = (maxLat - minLat) * 0.65;
        DIN_DIMENSIONS.forEach(mm => {
          const lon = anchorLon + dir * ((mm / 1000) * scale / mPerLon);
          features.push({
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: [[lon, midLat - spanLat], [lon, midLat + spanLat]] },
          });
          features.push({
            type: 'Feature',
            properties: { label: `${mm}`, anchor: 'bottom', offset: [0, -0.4] },
            geometry: { type: 'Point', coordinates: [lon, midLat + spanLat] },
          });
        });
      } else {
        const anchorLat = edge === 'n' ? minLat : maxLat;
        const dir = edge === 'n' ? 1 : -1;
        const midLon = (minLon + maxLon) / 2;
        const spanLon = (maxLon - minLon) * 0.65;
        DIN_DIMENSIONS.forEach(mm => {
          const lat = anchorLat + dir * ((mm / 1000) * scale / METERS_PER_DEG_LAT);
          features.push({
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: [[midLon - spanLon, lat], [midLon + spanLon, lat]] },
          });
          features.push({
            type: 'Feature',
            properties: { label: `${mm}`, anchor: 'left', offset: [0.5, 0] },
            geometry: { type: 'Point', coordinates: [midLon + spanLon, lat] },
          });
        });
      }
      return features;
    }

    function onHandleMouseDown(e: maplibregl.MapLayerMouseEvent | maplibregl.MapLayerTouchEvent) {
      const feature = e.features && e.features[0];
      const corner = feature?.properties?.corner as Corner | undefined;
      const edge = feature?.properties?.edge as Edge | undefined;
      if (!corner && !edge) return;
      e.preventDefault();
      const { bbox, scale } = liveRef.current;
      if (corner) {
        const anchor = cornerLngLat(bbox, OPPOSITE_CORNER[corner]);
        drag = { mode: 'resize-corner', corner, anchor };
        lastGuideOrientation = null;
      } else if (edge) {
        drag = { mode: 'resize-edge', edge, bboxAtStart: bbox };
        setGuides(buildEdgeGuides(bbox, edge, scale));
      }
      map.dragPan.disable();
      map.getCanvas().style.cursor = 'grabbing';
    }

    function onFillMouseDown(e: maplibregl.MapLayerMouseEvent | maplibregl.MapLayerTouchEvent) {
      // Don't start a move-drag if a handle at this point should take the event instead.
      const handleHit = map.queryRenderedFeatures(e.point, { layers: ['bbox-handle-hit'] });
      if (handleHit.length) return;
      e.preventDefault();
      const { bbox } = liveRef.current;
      drag = { mode: 'move', startLngLat: e.lngLat, startBbox: bbox };
      map.dragPan.disable();
      map.getCanvas().style.cursor = 'grabbing';
    }

    function onMove(e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) {
      if (!drag) return;
      const { onBboxChange, scale } = liveRef.current;
      if (drag.mode === 'move') {
        const dLon = e.lngLat.lng - drag.startLngLat.lng;
        const dLat = e.lngLat.lat - drag.startLngLat.lat;
        const [minLon, minLat, maxLon, maxLat] = drag.startBbox;
        onBboxChange([minLon + dLon, minLat + dLat, maxLon + dLon, maxLat + dLat]);
      } else if (drag.mode === 'resize-corner') {
        const [anchorLon, anchorLat] = drag.anchor;
        const mPerLon = metersPerDegLon(anchorLat) || 1;
        const rawWMeters = Math.abs(e.lngLat.lng - anchorLon) * mPerLon;
        const rawHMeters = Math.abs(e.lngLat.lat - anchorLat) * METERS_PER_DEG_LAT;
        const orientation: 'portrait' | 'landscape' = rawWMeters >= rawHMeters ? 'landscape' : 'portrait';
        if (orientation !== lastGuideOrientation) {
          lastGuideOrientation = orientation;
          setGuides(buildCornerGuides(drag.anchor, drag.corner, scale, orientation));
        }
        const { newBbox } = computeCornerResizeBbox(drag.anchor, [e.lngLat.lng, e.lngLat.lat], scale);
        onBboxChange(newBbox);
      } else {
        const { newBbox } = computeEdgeResizeBbox(drag.bboxAtStart, drag.edge, [e.lngLat.lng, e.lngLat.lat], scale);
        onBboxChange(newBbox);
      }
    }

    function onUp(e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) {
      if (!drag) return;
      const { scale, onResizeCommit } = liveRef.current;
      let result: { din: ReturnType<typeof findNearestDin>; wmm: number; hmm: number } | null = null;
      if (drag.mode === 'resize-corner') {
        result = computeCornerResizeBbox(drag.anchor, [e.lngLat.lng, e.lngLat.lat], scale);
      } else if (drag.mode === 'resize-edge') {
        result = computeEdgeResizeBbox(drag.bboxAtStart, drag.edge, [e.lngLat.lng, e.lngLat.lat], scale);
      }
      if (result) {
        const { din, wmm, hmm } = result;
        if (din) {
          onResizeCommit({ paperSize: din.key, orientation: din.orientation });
        } else {
          onResizeCommit({ paperSize: 'Custom', orientation: 'portrait', customWidthMm: Math.round(wmm), customHeightMm: Math.round(hmm) });
        }
      }
      drag = null;
      clearGuides();
      map.dragPan.enable();
      map.getCanvas().style.cursor = '';
    }

    function onHandleEnter() { if (!drag) map.getCanvas().style.cursor = 'pointer'; }
    function onHandleLeave() { if (!drag) map.getCanvas().style.cursor = ''; }

    map.on('mousedown', 'bbox-handle-hit', onHandleMouseDown);
    map.on('touchstart', 'bbox-handle-hit', onHandleMouseDown);
    map.on('mousedown', 'bbox-fill', onFillMouseDown);
    map.on('touchstart', 'bbox-fill', onFillMouseDown);
    map.on('mouseenter', 'bbox-handle-hit', onHandleEnter);
    map.on('mouseleave', 'bbox-handle-hit', onHandleLeave);
    map.on('mousemove', onMove);
    map.on('touchmove', onMove);
    map.on('mouseup', onUp);
    map.on('touchend', onUp);

    return () => {
      map.off('mousedown', 'bbox-handle-hit', onHandleMouseDown);
      map.off('touchstart', 'bbox-handle-hit', onHandleMouseDown);
      map.off('mousedown', 'bbox-fill', onFillMouseDown);
      map.off('touchstart', 'bbox-fill', onFillMouseDown);
      map.off('mouseenter', 'bbox-handle-hit', onHandleEnter);
      map.off('mouseleave', 'bbox-handle-hit', onHandleLeave);
      map.off('mousemove', onMove);
      map.off('touchmove', onMove);
      map.off('mouseup', onUp);
      map.off('touchend', onUp);
    };
  }, [mapInitialized]);

  // OSM data on the map, styled like the export: same colors, fills and
  // line widths (true to the export scale, so the preview shows how heavy
  // lines will print). Sources are rebuilt only when the data changes;
  // style edits just update paint properties.
  const stylesRef = useRef({ layerStyles, scale, lat: (bbox[1] + bbox[3]) / 2 });
  stylesRef.current = { layerStyles, scale, lat: (bbox[1] + bbox[3]) / 2 };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;
    PREVIEW_LAYERS.forEach(l => { if (map.getLayer(l.id)) map.removeLayer(l.id); });
    PREVIEW_SOURCES.forEach(id => { if (map.getSource(id)) map.removeSource(id); });
    if (!osmData) return;

    const categories = categorizeFeatures(dataToFeatures(osmData), selectedTypes);
    const collection = (features: GeoJSON.Feature[]) => ({ type: 'FeatureCollection' as const, features });
    // Areas as real polygons (closed ways arrive as LineStrings), for fills
    const asAreas = (features: GeoJSON.Feature[] = []) => collection(features.flatMap(f => {
      const polygons = areaPolygons(f);
      return polygons ? [{ type: 'Feature' as const, properties: f.properties, geometry: { type: 'MultiPolygon' as const, coordinates: polygons } }] : [];
    }));
    PREVIEW_SOURCES.forEach(id => {
      const type = id.replace('osm-', '').replace('-areas', '') as OSMFeatureType;
      map.addSource(id, { type: 'geojson', data: id.endsWith('-areas') ? asAreas(categories[type]) : collection(categories[type] ?? []) });
    });
    // below the export frame and its handles, so those stay on top
    const beforeId = map.getLayer('bbox-fill') ? 'bbox-fill' : undefined;
    PREVIEW_LAYERS.forEach(l => map.addLayer({ id: l.id, type: l.kind, source: l.source } as maplibregl.LayerSpecification, beforeId));
    applyPreviewPaint(map, stylesRef.current.layerStyles, stylesRef.current.scale, stylesRef.current.lat);
  }, [osmData, selectedTypes, styleReady]);

  const latKey = Math.round(((bbox[1] + bbox[3]) / 2) * 10) / 10;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer('osm-streets')) return;
    applyPreviewPaint(map, layerStyles, scale, latKey);
  }, [layerStyles, scale, latKey]);

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
          <circle cx="14" cy="14" r="8" fill="#e3e3de" fillOpacity="0.85" />
          <circle cx="14" cy="14" r="7" fill="#1a1a1a" fillOpacity="0.95" stroke="#e3e3de" strokeWidth="2" />
          <circle cx="14" cy="14" r="3" fill="#e3e3de" />
        </svg>
      </div>
    </div>
  );
  }
);

export default MapView;
