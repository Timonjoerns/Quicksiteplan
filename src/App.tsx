import SidebarCollapsible from './components/SidebarCollapsible';
import { CenterIcon, LinkIcon } from './components/Icons';

import './App.css';
import MapView from './components/MapView';
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { OSMFeatureType } from './components/DataSelector';
import { fetchOsmData } from './utils/overpass';
import { fetchContours } from './utils/contours';
import { buildExportDxf } from './utils/exportDxf';
import { exportCredits } from './utils/credits';
import { MapData, dataToFeatures } from './utils/mapData';
import { loadState, saveState } from './utils/urlState';
import { ExportOptions, getPaperDimsMm } from './utils/paperSizes';
import { I18nProvider, useI18n } from './i18n/I18nContext';
import { PresetKey, StyleMap, LayerStyle, STYLE_PRESETS, cloneStyleMap, PRESET_BACKGROUNDS } from './utils/exportStyles';
import { LAYER_LABEL_KEYS } from './utils/layerLabels';
import { prepareExportGeometry, computeScaleBar, areaPolygons, simplifyPts, SIMPLIFY_TOL_MM } from './utils/exportGeometry';
import { buildExportSvg } from './utils/exportSvg';
import jsPDF from 'jspdf';

// Hannover 96 stadium (Heinz von Heiden Arena / Niedersachsenstadion)
const DEFAULT_BBOX: [number, number, number, number] = [9.7163, 52.3550, 9.7463, 52.3650];
const DEFAULT_STYLES = [
  { name: 'OSM Default', url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json' },
];

// No hard cap: large areas are fetched in tiles (see overpass.ts). Above
// this size the UI only warns that loading takes longer and exported files
// get big.
const LARGE_AREA_KM2 = 150;

function downloadBlob(content: string, type: string, filename: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function bboxAreaKm2([minLon, minLat, maxLon, maxLat]: [number, number, number, number]): number {
  const metersPerDegLat = 111320;
  const centerLat = (minLat + maxLat) / 2;
  const metersPerDegLon = 40075000 * Math.cos(centerLat * Math.PI / 180) / 360;
  const widthKm = Math.abs(maxLon - minLon) * metersPerDegLon / 1000;
  const heightKm = Math.abs(maxLat - minLat) * metersPerDegLat / 1000;
  return widthKm * heightKm;
}

// Settings from a shared link or the last session, read once at startup.
const initialState = loadState();

function bboxAround([lon, lat]: [number, number]): [number, number, number, number] {
  const dLon = (DEFAULT_BBOX[2] - DEFAULT_BBOX[0]) / 2;
  const dLat = (DEFAULT_BBOX[3] - DEFAULT_BBOX[1]) / 2;
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

const AppInner: React.FC = () => {
  const { t } = useI18n();
  // (frame size is re-derived from paper size and scale on mount)
  const [bbox, setBbox] = useState<[number, number, number, number]>(() => initialState ? bboxAround(initialState.center) : DEFAULT_BBOX);
  const [selectedTypes, setSelectedTypes] = useState<OSMFeatureType[]>(() => initialState?.layers ?? ['water', 'streets', 'buildings', 'trees', 'greenery']);
  const [osmData, setOsmData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchRequested, setFetchRequested] = useState(false);
  // Contour spacing in meters; null = automatic (from scale and relief)
  const [contourInterval, setContourInterval] = useState<number | null>(() => initialState?.contourInterval ?? null);
  const [exportOptions, setExportOptions] = useState<ExportOptions>(() => initialState?.exportOptions ?? { scale: 5000, paperSize: 'A4', orientation: 'portrait' });
  const abortControllerRef = useRef<AbortController | null>(null);

  // Only fetch OSM data when user clicks fetch button. Each selected layer
  // is requested separately (smaller payloads, parallel), so one slow or
  // failing layer doesn't block the rest.
  useEffect(() => {
    if (!fetchRequested) return;
    setFetchRequested(false);
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    setLoadingProgress(null);
    // Contour lines come from a separate elevation service, fetched in
    // parallel with the OSM layers.
    const wantsOsm = selectedTypes.some(type => type !== 'contours');
    const contoursPromise: Promise<GeoJSON.Feature[] | null> = selectedTypes.includes('contours')
      ? fetchContours(bbox, exportOptions.scale, contourInterval, controller.signal).catch(err => {
        if (err?.name === 'AbortError') throw err;
        return null;
      })
      : Promise.resolve([]);
    const osmPromise = wantsOsm
      ? fetchOsmData(bbox, selectedTypes, {
        scale: exportOptions.scale,
        signal: controller.signal,
        onProgress: (p) => {
          if (abortControllerRef.current !== controller) return;
          setLoadingProgress({ done: p.done, total: p.total });
        },
      })
      : Promise.resolve({ elements: [], failedLayers: [] as OSMFeatureType[] });
    Promise.all([osmPromise, contoursPromise])
      .then(([result, contours]) => {
        if (abortControllerRef.current !== controller) return; // superseded by a newer fetch
        setOsmData({ elements: result.elements, contours: contours ?? [], bbox, scale: exportOptions.scale });
        const failedLayers: OSMFeatureType[] = [...result.failedLayers, ...(contours === null ? ['contours' as const] : [])];
        if (failedLayers.length > 0) {
          const layerNames = failedLayers.map(l => t(LAYER_LABEL_KEYS[l])).join(', ');
          setError(t('errorPartialFetch', { layers: layerNames }));
        }
      })
      .catch((err) => {
        if (abortControllerRef.current !== controller) return; // superseded by a newer fetch
        if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError') return;
        setError(t('errorFetchFailed'));
      })
      .finally(() => {
        if (abortControllerRef.current !== controller) return; // superseded by a newer fetch
        setLoading(false);
        setLoadingProgress(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- contourInterval changes are handled by the effect below, without a full re-fetch
  }, [fetchRequested, bbox, selectedTypes, exportOptions.scale, t]);

  // Interval changed after a fetch: regenerate only the contours, for the
  // same area as the loaded data.
  const contourRequest = useRef(0);
  useEffect(() => {
    if (!osmData || !selectedTypes.includes('contours')) return;
    const req = ++contourRequest.current;
    const id = window.setTimeout(() => {
      fetchContours(osmData.bbox, osmData.scale, contourInterval)
        .then(contours => {
          if (req === contourRequest.current) setOsmData(prev => (prev ? { ...prev, contours } : prev));
        })
        .catch(() => { /* keep the previous contours */ });
    }, 400);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the interval should trigger this
  }, [contourInterval]);

  const mapRef = useRef<maplibregl.Map | null>(null);

  const [stylePreset, setStylePreset] = useState<PresetKey>(() => initialState?.preset ?? 'default');
  const [layerStyles, setLayerStyles] = useState<StyleMap>(() => cloneStyleMap(STYLE_PRESETS[initialState?.preset ?? 'default']));

  // Keep the URL (shareable link) and saved session in sync with the setup.
  const centerLon = Math.round(((bbox[0] + bbox[2]) / 2) * 1e5) / 1e5;
  const centerLat = Math.round(((bbox[1] + bbox[3]) / 2) * 1e5) / 1e5;
  useEffect(() => {
    const id = window.setTimeout(() => saveState({ center: [centerLon, centerLat], exportOptions, preset: stylePreset, layers: selectedTypes, contourInterval }), 300);
    return () => window.clearTimeout(id);
  }, [centerLon, centerLat, exportOptions, stylePreset, selectedTypes, contourInterval]);

  const [linkCopied, setLinkCopied] = useState(false);
  const copyLink = () => {
    saveState({ center: [centerLon, centerLat], exportOptions, preset: stylePreset, layers: selectedTypes, contourInterval });
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => { /* clipboard blocked: the URL bar has the link too */ });
  };

  // Search result picked: move the frame there (same size) and the map too.
  const goTo = useCallback((lon: number, lat: number) => {
    setBbox(([minLon, minLat, maxLon, maxLat]) => {
      const dLon = (maxLon - minLon) / 2;
      const dLat = (maxLat - minLat) / 2;
      const next: [number, number, number, number] = [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
      mapRef.current?.fitBounds([[next[0], next[1]], [next[2], next[3]]], { padding: 80, duration: 800 });
      return next;
    });
  }, []);

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
      if (osmData) {
        const features = dataToFeatures(osmData);
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
        const { water = [], streets = [], buildings = [], railways = [], trees = [], greenery = [], contours = [] } = categories;
        const projectLine = (coords: [number, number][]) => simplifyPts(coords.map(project), SIMPLIFY_TOL_MM);

        // Draw each category using its configured style (color, line width,
        // fill, dash pattern — from the selected preset or custom edits).
        const drawCategory = (cat: GeoJSON.Feature[], style: LayerStyle) => {
          const { color, lineWidth, fill, fillOpacity, dash } = style;
          doc.setDrawColor(...color);
          doc.setLineWidth(lineWidth);
          doc.setLineDashPattern(dash ?? [], 0);
          const fc = style.fillColor ?? color;
          if (fill) doc.setFillColor(fc[0], fc[1], fc[2]);

          const tracePts = (pts: [number, number][], close: boolean) => {
            pts.forEach(([x, y], i) => {
              if (i === 0) doc.moveTo(x, y);
              else doc.lineTo(x, y);
            });
            if (close) doc.lineTo(pts[0][0], pts[0][1]);
          };

          cat.forEach(f => {
            const polygons = areaPolygons(f);
            if (polygons) {
              polygons.forEach(rings => {
                const projectedRings = rings.map(projectLine).filter(r => r.length > 2);
                if (projectedRings.length === 0) return;
                if (fill) {
                  // All rings in one path + even-odd fill, so inner rings
                  // (islands, courtyards) are left as holes.
                  if (fillOpacity < 1) doc.setGState(new (doc as any).GState({ opacity: fillOpacity }));
                  projectedRings.forEach(r => tracePts(r, true));
                  doc.fillEvenOdd();
                  if (fillOpacity < 1) doc.setGState(new (doc as any).GState({ opacity: 1 }));
                }
                projectedRings.forEach(r => {
                  tracePts(r, true);
                  doc.stroke();
                });
              });
            } else if (f.geometry.type === 'LineString') {
              const projected = projectLine(f.geometry.coordinates as [number, number][]);
              if (projected.length > 1) {
                // index contours (every 5th) drawn heavier
                if (f.properties?.contour && f.properties.index) doc.setLineWidth(lineWidth * 2.2);
                tracePts(projected, false);
                doc.stroke();
                if (f.properties?.contour && f.properties.index) doc.setLineWidth(lineWidth);
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
        drawCategory(contours, layerStyles.contours);
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

        // --- Credits + disclaimer, bottom left ---
        const creditPt = 6 * pageScale;
        const creditLines = exportCredits(contours.length > 0);
        doc.setFontSize(creditPt);
        // light backing box so map lines don't run through the text
        const creditMm = creditPt * 0.3528;
        const boxW = Math.max(...creditLines.map(l => doc.getTextWidth(l))) + creditMm;
        const boxH = creditLines.length * creditMm * 1.35 + creditMm * 0.4;
        doc.setGState(new (doc as any).GState({ opacity: 0.85 }));
        doc.setFillColor(255, 255, 255);
        doc.rect(inset - creditMm * 0.5, pageH - inset - boxH + creditMm * 0.6, boxW, boxH, 'F');
        doc.setGState(new (doc as any).GState({ opacity: 1 }));
        doc.setTextColor(80, 80, 80);
        creditLines.forEach((line, i) => {
          doc.text(line, inset, pageH - inset - (creditLines.length - 1 - i) * creditPt * 0.3528 * 1.35);
        });
      }
      doc.save('kontext-export.pdf');
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
      if (!osmData) return;
      const [wmm, hmm] = getPaperDimsMm(options);
      const { project, categories, trueWidthMeters } = prepareExportGeometry(bbox, dataToFeatures(osmData), selectedTypes, wmm, hmm);
      const svg = buildExportSvg({ wmm, hmm, categories, project, layerStyles, trueWidthMeters, exportOptions: options, background: PRESET_BACKGROUNDS[stylePreset] });
      downloadBlob(svg, 'image/svg+xml', 'kontext-export.svg');
    } catch (err) {
      setExportError(t('errorExportFailed'));
    }
  };

  // DXF for CAD: real-world meters in UTM, one CAD layer per category.
  const handleExportDXF = (options: ExportOptions) => {
    try {
      setExportError(null);
      if (!osmData) return;
      const [wmm, hmm] = getPaperDimsMm(options);
      const { categories } = prepareExportGeometry(bbox, dataToFeatures(osmData), selectedTypes, wmm, hmm);
      const dxf = buildExportDxf({ bbox, categories, layerStyles, scale: options.scale });
      downloadBlob(dxf, 'application/dxf', 'kontext-export.dxf');
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
          layerStyles={layerStyles}
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
        largeAreaKm2={LARGE_AREA_KM2}
        selectedTypes={selectedTypes}
        setSelectedTypes={setSelectedTypes}
        exportOptions={exportOptions}
        setExportOptions={setExportOptions}
        handleExport={handleExport}
        handleExportSVG={handleExportSVG}
        handleExportDXF={handleExportDXF}
        onFetch={() => setFetchRequested(true)}
        stylePreset={stylePreset}
        onStylePresetChange={applyStylePreset}
        layerStyles={layerStyles}
        onLayerStyleChange={updateLayerStyle}
        onPlaceSelect={goTo}
        contourInterval={contourInterval}
        onContourIntervalChange={setContourInterval}
        usedContourInterval={osmData?.contours[0]?.properties?.interval ?? null}
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
        <button type="button" className="qsp-toolbar-btn" onClick={copyLink} title={t('copyLinkHint')}>
          <LinkIcon size={18} />
          {linkCopied ? t('linkCopied') : t('copyLinkButton')}
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
