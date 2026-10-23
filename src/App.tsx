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
import { PresetKey, StyleMap, LayerStyle, STYLE_PRESETS, cloneStyleMap } from './utils/exportStyles';
import { LAYER_LABEL_KEYS } from './utils/layerLabels';
import { prepareExportGeometry, computeScaleBar } from './utils/exportGeometry';
import { buildExportSvg } from './utils/exportSvg';
import jsPDF from 'jspdf';

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
  const [stylePreset, setStylePreset] = useState<PresetKey>('default');
  const [layerStyles, setLayerStyles] = useState<StyleMap>(() => cloneStyleMap(STYLE_PRESETS.default));

  const applyStylePreset = useCallback((preset: PresetKey) => {
    setStylePreset(preset);
    setLayerStyles(cloneStyleMap(STYLE_PRESETS[preset]));
  }, []);

  const updateLayerStyle = useCallback((type: OSMFeatureType, patch: Partial<LayerStyle>) => {
    setLayerStyles(prev => ({ ...prev, [type]: { ...prev[type], ...patch } }));
  }, []);

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

  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async (options: ExportOptions) => {
    try {
      setExportError(null);
      const [wmm, hmm] = getPaperDimsMm(options);
      // Orientation must match the requested w/h, or jsPDF silently swaps
      // the page back to the opposite shape — stretching everything drawn
      // into it, since the map math below assumes the requested shape.
      const doc = new jsPDF({
        orientation: wmm > hmm ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [wmm, hmm],
      });
      // Draw OSM features as vector lines, using Web Mercator for true metric scaling
      if (osmData && osmData.elements) {
        const { features } = osmElementsToGeoJSON(osmData.elements);
        // Inset used only for placing the scale bar / north arrow / title
        // text away from the page edge — NOT for fitting the map content.
        // The geographic bbox was sized (in App's setPresetBbox) to match
        // the full page at the requested scale, so the map must fill the
        // full page too, or the printed scale would drift from what's
        // stated (previously ~10% off because of exactly this mismatch).
        const inset = 10;
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        // Scales fixed-size elements (arrow, scale bar, fonts) relative to
        // A4, so they stay legible — not comically tiny — on A0 and not
        // oversized on custom small formats.
        const pageScale = Math.min(2.2, Math.max(0.6, Math.sqrt((pageW * pageH) / (210 * 297))));
        const { project, categories, trueWidthMeters } = prepareExportGeometry(bbox, features, selectedTypes, pageW, pageH);
        const { water = [], streets = [], buildings = [], railways = [], trees = [], greenery = [] } = categories;

        // Draw each category using its configured style (color, line width,
        // fill, dash pattern — from the selected preset or custom edits).
        const drawCategory = (cat: GeoJSON.Feature[], style: LayerStyle) => {
          const { color, lineWidth, fill, fillOpacity, dash } = style;
          doc.setDrawColor(...color);
          doc.setLineWidth(lineWidth);
          doc.setLineDashPattern(dash ?? [], 0);
          if (fill) doc.setFillColor(color[0], color[1], color[2]);

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
                  if (fill) {
                    if (fillOpacity < 1) doc.setGState(new (doc as any).GState({ opacity: fillOpacity }));
                    validPoints.forEach(([x, y], i) => {
                      if (i === 0) doc.moveTo(x, y);
                      else doc.lineTo(x, y);
                    });
                    doc.lineTo(validPoints[0][0], validPoints[0][1]);
                    doc.fill();
                    if (fillOpacity < 1) doc.setGState(new (doc as any).GState({ opacity: 1 }));
                  }
                  validPoints.forEach(([x, y], i) => {
                    if (i === 0) doc.moveTo(x, y);
                    else doc.lineTo(x, y);
                  });
                  doc.lineTo(validPoints[0][0], validPoints[0][1]);
                  doc.stroke();
                }
              }
            }
          });
          doc.setLineDashPattern([], 0);
        };
        // Draw trees as small circles
        const drawTrees = (treeFeatures: GeoJSON.Feature[], style: LayerStyle) => {
          doc.setDrawColor(...style.color);
          doc.setFillColor(style.color[0], style.color[1], style.color[2]);
          treeFeatures.forEach(f => {
            if (f.geometry.type === 'Point') {
              const coords = f.geometry.coordinates as [number, number];
              const [px, py] = project(coords);
              if (!isNaN(px) && !isNaN(py)) {
                doc.circle(px, py, style.pointRadius ?? 0.8, 'F');
              }
            }
          });
        };
        // Draw in the same stacking order as the map preview: greenery
        // (fill) below everything, then water, railways, streets,
        // buildings, trees on top.
        drawCategory(greenery, layerStyles.greenery);
        drawCategory(water, layerStyles.water);
        drawCategory(railways, layerStyles.railways);
        drawCategory(streets, layerStyles.streets);
        drawCategory(buildings, layerStyles.buildings);
        drawTrees(trees, layerStyles.trees);

        // --- Draw scale bar ---
        // Choose a nice round scale bar length (in true ground meters, not
        // Web Mercator units — see note above).
        const { length: scaleBarLength, px: scaleBarPx } = computeScaleBar(trueWidthMeters, pageW);
        // Draw scale bar at bottom left
        const barX = inset + 12 * pageScale;
        const barY = pageH - inset - 24 * pageScale;
        doc.setDrawColor(26, 26, 26);
        doc.setLineDashPattern([], 0);
        doc.setLineWidth(pageScale);
        doc.line(barX, barY, barX + scaleBarPx, barY);
        doc.line(barX, barY - 3 * pageScale, barX, barY + 3 * pageScale);
        doc.line(barX + scaleBarPx, barY - 3 * pageScale, barX + scaleBarPx, barY + 3 * pageScale);
        doc.setFontSize(10 * pageScale);
        doc.text(`${scaleBarLength} m`, barX + scaleBarPx / 2, barY - 4 * pageScale, { align: 'center' });

        // --- Draw north arrow ---
        // Place at top left
        const arrowX = inset + 24 * pageScale;
        const arrowY = inset + 32 * pageScale;
        const arrowLen = 18 * pageScale;
        doc.setDrawColor(26, 26, 26);
        doc.setLineWidth(1.2 * pageScale);
        doc.line(arrowX, arrowY, arrowX, arrowY - arrowLen);
        doc.line(arrowX, arrowY - arrowLen, arrowX - 4 * pageScale, arrowY - arrowLen + 7 * pageScale);
        doc.line(arrowX, arrowY - arrowLen, arrowX + 4 * pageScale, arrowY - arrowLen + 7 * pageScale);
        doc.setFontSize(12 * pageScale);
        doc.text('N', arrowX, arrowY - arrowLen - 4 * pageScale, { align: 'center' });

        // --- Title block: scale, paper size and export date, bottom right ---
        doc.setFontSize(9 * pageScale);
        doc.setTextColor(26, 26, 26);
        const paperLabel = options.paperSize === 'Custom' ? `${Math.round(wmm)}×${Math.round(hmm)} mm` : `${options.paperSize} ${options.orientation}`;
        const titleLine = `1:${options.scale.toLocaleString()}  ·  ${paperLabel}  ·  ${new Date().toLocaleDateString()}`;
        doc.text(titleLine, pageW - inset, pageH - inset, { align: 'right' });
      }
      doc.save('siteplan-export.pdf');
    } catch (err) {
      setExportError(t('errorExportFailed'));
    }
  };

  // Exports an SVG with one named <g> per feature category (water,
  // streets, buildings, ...) instead of one flat drawing. Design tools
  // (Illustrator, Inkscape) import these as real, independently selectable
  // groups/layers — the jsPDF version in use has no equivalent for PDF
  // (no support for PDF layers / Optional Content Groups), so this is the
  // reliable way to get that grouping.
  const handleExportSVG = (options: ExportOptions) => {
    try {
      setExportError(null);
      if (!osmData || !osmData.elements) return;
      const [wmm, hmm] = getPaperDimsMm(options);
      const { features } = osmElementsToGeoJSON(osmData.elements);
      const { project, categories, trueWidthMeters } = prepareExportGeometry(bbox, features, selectedTypes, wmm, hmm);
      const svg = buildExportSvg({ wmm, hmm, categories, project, layerStyles, trueWidthMeters, exportOptions: options });
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'siteplan-export.svg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(t('errorExportFailed'));
    }
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
        exportError={exportError}
        hasData={!!osmData}
        bboxAreaKm2={currentAreaKm2}
        maxBboxAreaKm2={MAX_BBOX_AREA_KM2}
        selectedTypes={selectedTypes}
        setSelectedTypes={setSelectedTypes}
        exportOptions={exportOptions}
        setExportOptions={setExportOptions}
        handleExport={handleExport}
        handleExportSVG={handleExportSVG}
        onFetch={() => setFetchRequested(true)}
        stylePreset={stylePreset}
        onStylePresetChange={applyStylePreset}
        layerStyles={layerStyles}
        onLayerStyleChange={updateLayerStyle}
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
