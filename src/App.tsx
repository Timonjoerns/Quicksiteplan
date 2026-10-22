import SidebarCollapsible from './components/SidebarCollapsible';
import { CenterIcon } from './components/Icons';

import './App.css';
import MapView from './components/MapView';
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { OSMFeatureType } from './components/DataSelector';
import { fetchOsmData } from './utils/overpass';
import { osmElementsToGeoJSON } from './utils/osmToGeoJSON';
import { ExportOptions, getPaperDimsMm } from './utils/paperSizes';
import { I18nProvider, useI18n } from './i18n/I18nContext';
import type { Dictionary } from './i18n/translations';
import jsPDF from 'jspdf';
import proj4 from 'proj4';

const DEFAULT_BBOX: [number, number, number, number] = [13.375, 52.515, 13.405, 52.525]; // Berlin example
const DEFAULT_STYLES = [
  { name: 'OSM Default', url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json' },
];

// Above this, an Overpass query risks timing out and the browser risks
// choking on rendering/exporting too many features.
const MAX_BBOX_AREA_KM2 = 25;

function bboxAreaKm2([minLon, minLat, maxLon, maxLat]: [number, number, number, number]): number {
  const metersPerDegLat = 111320;
  const centerLat = (minLat + maxLat) / 2;
  const metersPerDegLon = 40075000 * Math.cos(centerLat * Math.PI / 180) / 360;
  const widthKm = Math.abs(maxLon - minLon) * metersPerDegLon / 1000;
  const heightKm = Math.abs(maxLat - minLat) * metersPerDegLat / 1000;
  return widthKm * heightKm;
}

const LAYER_LABEL_KEYS: Record<OSMFeatureType, keyof Dictionary> = {
  water: 'layerWater',
  streets: 'layerStreets',
  buildings: 'layerBuildings',
  railways: 'layerRailways',
  trees: 'layerTrees',
  greenery: 'layerGreenery',
};

const AppInner: React.FC = () => {
  const { t } = useI18n();
  const [bbox, setBbox] = useState<[number, number, number, number]>(DEFAULT_BBOX);
  const [selectedTypes, setSelectedTypes] = useState<OSMFeatureType[]>(['water', 'streets', 'buildings', 'trees', 'greenery']);
  const [osmData, setOsmData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchRequested, setFetchRequested] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Only fetch OSM data when user clicks fetch button. Each selected layer
  // is requested separately (smaller payloads, parallel), so one slow or
  // failing layer doesn't block the rest.
  useEffect(() => {
    if (!fetchRequested) return;
    setFetchRequested(false);
    if (bboxAreaKm2(bbox) > MAX_BBOX_AREA_KM2) {
      setError(t('errorAreaTooLarge', { max: MAX_BBOX_AREA_KM2 }));
      return;
    }
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    setLoadingProgress({ done: 0, total: selectedTypes.length });
    fetchOsmData(bbox, selectedTypes, {
      signal: controller.signal,
      onProgress: (p) => {
        if (abortControllerRef.current !== controller) return;
        setLoadingProgress({ done: p.done, total: p.total });
      },
    })
      .then(result => {
        if (abortControllerRef.current !== controller) return; // superseded by a newer fetch
        setOsmData({ elements: result.elements });
        if (result.failedLayers.length > 0) {
          const layerNames = result.failedLayers.map(l => t(LAYER_LABEL_KEYS[l])).join(', ');
          setError(t('errorPartialFetch', { layers: layerNames }));
        }
      })
      .catch((err) => {
        if (abortControllerRef.current !== controller) return; // superseded by a newer fetch
        if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
        setError(t('errorFetchFailed'));
      })
      .finally(() => {
        if (abortControllerRef.current !== controller) return; // superseded by a newer fetch
        setLoading(false);
        setLoadingProgress(null);
      });
  }, [fetchRequested, bbox, selectedTypes, t]);

  const mapRef = useRef<maplibregl.Map | null>(null);

  const [exportOptions, setExportOptions] = useState<ExportOptions>({ scale: 5000, paperSize: 'A4', orientation: 'portrait' });

  // Helper: set bbox to match paper size/orientation/scale, centered on current bbox center.
  // Uses the functional setState form (reads previous bbox via its callback,
  // not the component's `bbox` closure) so this has a stable identity and
  // can be a safe, complete useEffect dependency without re-triggering itself.
  const setPresetBbox = useCallback((opts: ExportOptions) => {
    const [wmm, hmm] = getPaperDimsMm(opts);
    const safeScale = opts.scale > 0 ? opts.scale : 1;
    const wMeters = wmm / 1000 * safeScale;
    const hMeters = hmm / 1000 * safeScale;
    setBbox(([minLon, minLat, maxLon, maxLat]) => {
      const centerLon = (minLon + maxLon) / 2;
      const centerLat = (minLat + maxLat) / 2;
      // Approximate meters per degree at center latitude
      const metersPerDegLat = 111320;
      const metersPerDegLon = 40075000 * Math.cos(centerLat * Math.PI / 180) / 360;
      const dLat = hMeters / 2 / metersPerDegLat;
      const dLon = wMeters / 2 / metersPerDegLon;
      return [
        centerLon - dLon,
        centerLat - dLat,
        centerLon + dLon,
        centerLat + dLat,
      ];
    });
  }, []);

  // When export options change, update bbox to preset size
  useEffect(() => {
    setPresetBbox(exportOptions);
  }, [exportOptions, setPresetBbox]);

  // Called by MapView when a corner-drag resize ends: syncs the dragged
  // frame size back into scale/paper-size state (snapped DIN size, or a
  // Custom size when it didn't land near one).
  const handleResizeCommit = useCallback((patch: { paperSize: string; orientation: 'portrait' | 'landscape'; customWidthMm?: number; customHeightMm?: number }) => {
    setExportOptions(prev => ({ ...prev, ...patch }));
  }, []);

  const handleExport = async (options: ExportOptions) => {
    const [wmm, hmm] = getPaperDimsMm(options);
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [wmm, hmm],
    });
    // Draw OSM features as vector lines, using UTM projection for true metric scaling
    if (osmData && osmData.elements) {
      const { features } = osmElementsToGeoJSON(osmData.elements);
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
      const xs = bboxMerc.map((coord) => coord[0]);
      const ys = bboxMerc.map((coord) => coord[1]);
      const minX = Math.min.apply(null, xs);
      const maxX = Math.max.apply(null, xs);
      const minY = Math.min.apply(null, ys);
      const maxY = Math.max.apply(null, ys);
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
      const trees = features.filter(f => selectedTypes.includes('trees') && (f.properties && f.properties.natural === 'tree'));
      const greenery = features.filter(f => selectedTypes.includes('greenery') && (f.properties && (f.properties.landuse === 'forest' || f.properties.landuse === 'grass' || f.properties.landuse === 'meadow' || f.properties.landuse === 'orchard' || f.properties.landuse === 'vineyard' || f.properties.landuse === 'farmland' || f.properties.landuse === 'allotments' || f.properties.leisure === 'park' || f.properties.leisure === 'garden' || f.properties.leisure === 'nature_reserve' || f.properties.natural === 'wood' || f.properties.natural === 'scrub' || f.properties.natural === 'grassland' || f.properties.natural === 'heath')));
      // Draw each category in its color
      const drawCategory = (cat: GeoJSON.Feature[], color: [number, number, number], fill = false, fillOpacity = 0.3) => {
        doc.setDrawColor(...color);
        doc.setLineWidth(0.7);
        if (fill) {
          doc.setFillColor(color[0], color[1], color[2]);
        }
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
          } else if (f.geometry.type === 'Polygon') {
            const rings = f.geometry.coordinates as [number, number][][];
            const outerRing = rings[0];
            const projected = outerRing.map(project);
            if (projected.length > 2 && projected.some(([x, y]) => !isNaN(x) && !isNaN(y))) {
              const validPoints = projected.filter(([x, y]) => !isNaN(x) && !isNaN(y));
              if (validPoints.length > 2) {
                // Draw filled polygon
                if (fill) {
                  doc.setFillColor(color[0], color[1], color[2]);
                  // Draw polygon path
                  validPoints.forEach(([x, y], i) => {
                    if (i === 0) doc.moveTo(x, y);
                    else doc.lineTo(x, y);
                  });
                  // Close and fill
                  doc.lineTo(validPoints[0][0], validPoints[0][1]);
                  doc.fill();
                  // Draw outline
                  doc.setDrawColor(...color);
                  validPoints.forEach(([x, y], i) => {
                    if (i === 0) doc.moveTo(x, y);
                    else doc.lineTo(x, y);
                  });
                  doc.lineTo(validPoints[0][0], validPoints[0][1]);
                  doc.stroke();
                } else {
                  // Draw outline only
                  validPoints.forEach(([x, y], i) => {
                    if (i === 0) doc.moveTo(x, y);
                    else doc.lineTo(x, y);
                  });
                  doc.lineTo(validPoints[0][0], validPoints[0][1]);
                  doc.stroke();
                }
              }
            }
          }
        });
      };
      // Draw trees as small circles
      const drawTrees = (treeFeatures: GeoJSON.Feature[], color: [number, number, number]) => {
        doc.setDrawColor(...color);
        doc.setFillColor(color[0], color[1], color[2]);
        treeFeatures.forEach(f => {
          if (f.geometry.type === 'Point') {
            const coords = f.geometry.coordinates as [number, number];
            const [px, py] = project(coords);
            if (!isNaN(px) && !isNaN(py)) {
              doc.circle(px, py, 0.8, 'F'); // Small filled circle for tree
            }
          }
        });
      };
      // Draw in correct order: greenery (fill), water, streets, buildings, trees
      drawCategory(greenery, [144, 238, 144], true); // light green with fill
      drawCategory(water, [51, 153, 255]); // blue
      drawCategory(streets, [255, 102, 0]); // orange
      drawCategory(buildings, [136, 136, 136]); // gray
      drawTrees(trees, [34, 139, 34]); // forest green
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
      doc.setDrawColor(26, 26, 26);
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
      doc.setDrawColor(26, 26, 26);
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

  const currentAreaKm2 = bboxAreaKm2(bbox);

  return (
    <div className="qsp-app">
      <div className="qsp-map-layer">
        <MapView
          ref={mapRef}
          styleUrl={DEFAULT_STYLES[0].url}
          bbox={bbox}
          onBboxChange={setBbox}
          osmData={osmData}
          selectedTypes={selectedTypes}
          scale={exportOptions.scale}
          onResizeCommit={handleResizeCommit}
        />
      </div>

      <SidebarCollapsible
        loading={loading}
        loadingProgress={loadingProgress}
        error={error}
        hasData={!!osmData}
        bboxAreaKm2={currentAreaKm2}
        maxBboxAreaKm2={MAX_BBOX_AREA_KM2}
        selectedTypes={selectedTypes}
        setSelectedTypes={setSelectedTypes}
        exportOptions={exportOptions}
        setExportOptions={setExportOptions}
        handleExport={handleExport}
        onFetch={() => setFetchRequested(true)}
      />

      <div className="qsp-toolbar">
        <button
          type="button"
          className="qsp-toolbar-btn"
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
          title={t('centerHereButton')}
        >
          <CenterIcon size={18} />
          {t('centerHereButton')}
        </button>
      </div>
    </div>
  );
};

const App: React.FC = () => (
  <I18nProvider>
    <AppInner />
  </I18nProvider>
);

export default App;
