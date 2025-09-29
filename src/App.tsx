import SidebarCollapsible from './components/SidebarCollapsible';
import { DownloadIcon, CenterIcon } from './components/Icons';

import './App.css';
import MapView from './components/MapView';
import React, { useRef, useState, useEffect } from 'react';
import DataSelector, { OSMFeatureType } from './components/DataSelector';
import ExportPanel from './components/ExportPanel';
import { fetchOsmData } from './utils/overpass';
import jsPDF from 'jspdf';
import proj4 from 'proj4';

// Helper: Calculate bbox size in meters (approx, using haversine for width/height)
function bboxSizeMeters([minLon, minLat, maxLon, maxLat]: [number, number, number, number]) {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  // width: distance at center latitude
  const lat = (minLat + maxLat) / 2;
  const dLon = toRad(maxLon - minLon);
  const dLat = toRad(maxLat - minLat);
  const width = R * dLon * Math.cos(toRad(lat));
  const height = R * dLat;
  return { width: Math.abs(width), height: Math.abs(height) };
}


const DEFAULT_BBOX: [number, number, number, number] = [13.375, 52.515, 13.405, 52.525]; // Berlin example
const DEFAULT_STYLES = [
  { name: 'OSM Default', url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json' },
];

const App: React.FC = () => {
  const [bbox, setBbox] = useState<[number, number, number, number]>(DEFAULT_BBOX);
  const [selectedTypes, setSelectedTypes] = useState<OSMFeatureType[]>(['water', 'streets']);
  const [osmData, setOsmData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Remove fetchPaused, use explicit fetch trigger
  const [fetchRequested, setFetchRequested] = useState(false);

  // Only fetch OSM data when user clicks fetch button
  useEffect(() => {
    if (!fetchRequested) return;
    setLoading(true);
    setError(null);
    fetchOsmData(bbox, selectedTypes)
      .then(data => setOsmData(data))
      .catch(() => setError('Failed to fetch OSM data'))
      .finally(() => setLoading(false));
    setFetchRequested(false);
  }, [fetchRequested, bbox, selectedTypes]);

  // Removed style upload logic

  const mapRef = useRef<maplibregl.Map | null>(null);

  // Export fit check state
  const [exportOptions, setExportOptions] = useState<{ scale: number; paperSize: string; orientation: string }>({ scale: 5000, paperSize: 'A4', orientation: 'portrait' });
  // Removed bboxFits state, no longer needed

  // Helper: set bbox to match paper size/orientation/scale, centered on current bbox center
  function setPresetBbox({ scale, paperSize, orientation }: { scale: number; paperSize: string; orientation: string }) {
    let [wmm, hmm] = PAPER_SIZES[paperSize] || [210, 297];
    if (orientation === 'landscape') [wmm, hmm] = [hmm, wmm];
    const wMeters = wmm / 1000 * scale;
    const hMeters = hmm / 1000 * scale;
    // Center of current bbox
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const centerLon = (minLon + maxLon) / 2;
    const centerLat = (minLat + maxLat) / 2;
    // Approximate meters per degree at center latitude
    const metersPerDegLat = 111320;
    const metersPerDegLon = 40075000 * Math.cos(centerLat * Math.PI / 180) / 360;
    const dLat = hMeters / 2 / metersPerDegLat;
    const dLon = wMeters / 2 / metersPerDegLon;
    setBbox([
      centerLon - dLon,
      centerLat - dLat,
      centerLon + dLon,
      centerLat + dLat,
    ]);
  }

  // Paper sizes in mm
  const PAPER_SIZES: Record<string, [number, number]> = { A4: [210, 297], A3: [297, 420] };

  // When export options change, update bbox to preset size
  useEffect(() => {
    setPresetBbox(exportOptions);
  }, [exportOptions.paperSize, exportOptions.orientation, exportOptions.scale]);

  // Check if bbox fits at current scale using Web Mercator projection (matches export logic)
  // Removed bbox fit check effect

  const handleExport = async (options: { scale: number; paperSize: string; orientation: string }) => {
    // Do not setExportOptions here; exportOptions and bbox are always in sync
    const doc = new jsPDF({
      orientation: options.orientation as 'portrait' | 'landscape',
      format: options.paperSize.toLowerCase() as 'a3' | 'a4',
    });
    // Draw OSM features as vector lines, using UTM projection for true metric scaling
    if (osmData && osmData.elements) {
      // Convert OSM JSON to GeoJSON FeatureCollection (copied from MapView)
      const nodes: Record<string, [number, number]> = {};
      for (const el of osmData.elements) {
        if (el.type === 'node') {
          nodes[el.id] = [el.lon, el.lat];
        }
      }
      const features: GeoJSON.Feature[] = [];
      for (const el of osmData.elements) {
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
      // PDF drawing area
      const margin = 10;
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const drawW = pageW - 2 * margin;
      const drawH = pageH - 2 * margin;
      // Use the user bbox (from state) for export area
      const [bboxMinLon, bboxMinLat, bboxMaxLon, bboxMaxLat] = bbox;
      // Project all bbox corners to Web Mercator (EPSG:3857)
      const mercatorProj = '+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs';
      const projectToMerc = (coord: number[]): [number, number] => proj4('EPSG:4326', mercatorProj, coord) as [number, number];
      const bboxCorners: [number, number][] = [
        [bboxMinLon, bboxMinLat],
        [bboxMinLon, bboxMaxLat],
        [bboxMaxLon, bboxMaxLat],
        [bboxMaxLon, bboxMinLat],
      ];
      const bboxMerc = bboxCorners.map(projectToMerc);
      // Find Mercator bbox min/max
      const xs = bboxMerc.map(([x, _]) => x);
      const ys = bboxMerc.map(([_, y]) => y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      // Calculate page size in meters at requested scale
      let [wmm, hmm] = PAPER_SIZES[options.paperSize] || [210, 297];
      if (options.orientation === 'landscape') [wmm, hmm] = [hmm, wmm];
      const wMeters = wmm / 1000 * options.scale;
      const hMeters = hmm / 1000 * options.scale;
      // Center crop: determine visible bbox in Mercator
      // Use the projected bbox as the export area (no cropping)
      const cropMinX = minX, cropMaxX = maxX, cropMinY = minY, cropMaxY = maxY;
      // Project Mercator to PDF coords
      const project = ([lon, lat]: [number, number]): [number, number] => {
        const [x, y] = projectToMerc([lon, lat]);
        // Only draw features within the export rectangle
        if (x < cropMinX || x > cropMaxX || y < cropMinY || y > cropMaxY) return [NaN, NaN];
        const px = margin + ((x - cropMinX) / (cropMaxX - cropMinX)) * drawW;
        // PDF y=0 is top, so invert y
        const py = margin + drawH - ((y - cropMinY) / (cropMaxY - cropMinY)) * drawH;
        return [px, py];
      };
      // Split features by type, only export selectedTypes
      const water = features.filter(f => selectedTypes.includes('water') && (f.properties && (f.properties.waterway || f.properties.natural === 'water')));
      const streets = features.filter(f => selectedTypes.includes('streets') && (f.properties && f.properties.highway));
      const buildings = features.filter(f => selectedTypes.includes('buildings') && (f.properties && f.properties.building));
      // Draw each category in its color
      const drawCategory = (cat: GeoJSON.Feature[], color: [number, number, number]) => {
        doc.setDrawColor(...color);
        doc.setLineWidth(0.7);
        cat.forEach(f => {
          if (f.geometry.type === 'LineString') {
            const coords = f.geometry.coordinates as [number, number][];
            const projected = coords.map(project);
            if (projected.length > 1 && projected.some(([x, y]) => !isNaN(x) && !isNaN(y))) {
              let started = false;
              projected.forEach(([x, y]) => {
                if (isNaN(x) || isNaN(y)) return;
                if (!started) {
                  doc.moveTo(x, y);
                  started = true;
                } else {
                  doc.lineTo(x, y);
                }
              });
              if (started) doc.stroke();
            }
          }
        });
      };
      drawCategory(water, [51, 153, 255]); // blue
      drawCategory(streets, [255, 102, 0]); // orange
      drawCategory(buildings, [136, 136, 136]); // gray
      // --- Draw scale bar ---
      // Choose a nice round scale bar length (in meters)
      const scaleBarLengths = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
      const bboxWidthMeters = cropMaxX - cropMinX;
      // How many meters per PDF point (drawW is in PDF units)
      const metersPerPdfUnit = bboxWidthMeters / drawW;
      // Pick a scale bar length that fits 1/4 of the width
      let scaleBarLength = scaleBarLengths[0];
      for (const l of scaleBarLengths) {
        if (l < bboxWidthMeters / 4) scaleBarLength = l;
      }
      const scaleBarPx = scaleBarLength / metersPerPdfUnit;
      // Draw scale bar at bottom left
      const barX = margin + 12;
      const barY = pageH - margin - 24;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(1);
      doc.line(barX, barY, barX + scaleBarPx, barY);
      doc.line(barX, barY - 3, barX, barY + 3);
      doc.line(barX + scaleBarPx, barY - 3, barX + scaleBarPx, barY + 3);
      doc.setFontSize(10);
      doc.text(`${scaleBarLength} m`, barX + scaleBarPx / 2, barY - 4, { align: 'center' });

      // --- Draw north arrow ---
      // Place at top left
      const arrowX = margin + 24;
      const arrowY = margin + 32;
      const arrowLen = 18;
      // Arrow shaft
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(1.2);
      doc.line(arrowX, arrowY, arrowX, arrowY - arrowLen);
      // Arrow head
      doc.line(arrowX, arrowY - arrowLen, arrowX - 4, arrowY - arrowLen + 7);
      doc.line(arrowX, arrowY - arrowLen, arrowX + 4, arrowY - arrowLen + 7);
      // N label
      doc.setFontSize(12);
      doc.text('N', arrowX, arrowY - arrowLen - 4, { align: 'center' });
    }
    doc.save('siteplan-export.pdf');
  };

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100vw', fontFamily: 'Inter, Helvetica Neue, Arial, sans-serif', background: '#f4f6fa', overflow: 'hidden' }}>
      {/* Map as background layer */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        <MapView ref={mapRef} styleUrl={DEFAULT_STYLES[0].url} bbox={bbox} onBboxChange={setBbox} osmData={osmData} selectedTypes={selectedTypes} />
      </div>
      {/* Floating Sidebar */}
      {/* Collapsible Sidebar */}
      <SidebarCollapsible
        loading={loading}
        error={error}
        selectedTypes={selectedTypes}
        setSelectedTypes={setSelectedTypes}
        exportOptions={exportOptions}
        setExportOptions={setExportOptions}
        handleExport={handleExport}
      />
      {/* Floating Action Buttons - Swiss style glassmorphism */}
      <div style={{ position: 'absolute', bottom: 40, right: 40, display: 'flex', flexDirection: 'column', gap: 28, zIndex: 30 }}>
          <button
            onClick={() => setFetchRequested(true)}
            title="Fetch OSM Data"
            style={{
              width: 64, height: 64, borderRadius: 32, border: '1.5px solid rgba(255,255,255,0.5)',
              background: 'rgba(255,255,255,0.35)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              backdropFilter: 'blur(18px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#1976d2', cursor: 'pointer', transition: 'box-shadow 0.2s, background 0.2s',
              WebkitBackdropFilter: 'blur(18px)',
              outline: 'none',
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.55)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.35)'}
          >
            <DownloadIcon size={32} />
          </button>
          <button
            onClick={() => {
              if (mapRef.current) {
                const center = mapRef.current.getCenter();
                const [minLon, minLat, maxLon, maxLat] = bbox;
                const dLon = (maxLon - minLon) / 2;
                const dLat = (maxLat - minLat) / 2;
                setBbox([
                  center.lng - dLon,
                  center.lat - dLat,
                  center.lng + dLon,
                  center.lat + dLat,
                ]);
              }
            }}
            title="Center BBox Here"
            style={{
              width: 64, height: 64, borderRadius: 32, border: '1.5px solid rgba(255,255,255,0.5)',
              background: 'rgba(255,255,255,0.35)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              backdropFilter: 'blur(18px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#1976d2', cursor: 'pointer', transition: 'box-shadow 0.2s, background 0.2s',
              WebkitBackdropFilter: 'blur(18px)',
              outline: 'none',
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.55)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.35)'}
          >
            <CenterIcon size={32} />
          </button>
      </div>
    </div>
  );
};

export default App;
