import { OSMFeatureType } from '../components/DataSelector';

export interface LayerStyle {
  color: [number, number, number];
  lineWidth: number;
  fill: boolean;
  fillOpacity: number; // 0-1, only used when fill is true
  dash?: [number, number]; // [dash, gap] in mm
  pointRadius?: number; // only used for point layers (trees)

  // --- Illustrative extras, SVG export only (the PDF export ignores these
  // and draws the flat style above). Real-world sizes are in meters and are
  // converted to page mm using the export scale.
  fillColor?: [number, number, number]; // area fill, defaults to `color`
  texture?: 'hatch' | 'stipple' | 'grain' | 'lines'; // pattern fill for areas, drawn in `color`
  shadow?: boolean; // cast drop shadow (buildings, trees)
  casingMeters?: number; // streets: draw as double-line road of this width
  scaledLines?: boolean; // water: stroke rivers/canals/streams at real-world width
  canopy?: 'scribble' | 'soft'; // trees: canopy symbol (outlined with trunk strokes, or a plain textured blob) instead of a dot
}

export type StyleMap = Record<OSMFeatureType, LayerStyle>;

export type PresetKey = 'default' | 'blueprint' | 'grayscale' | 'bold' | 'sketch' | 'aerial' | 'vibrant';

export const STYLE_PRESET_KEYS: PresetKey[] = ['default', 'blueprint', 'grayscale', 'bold', 'sketch', 'aerial', 'vibrant'];

// Presets whose look relies on the SVG-only extras above.
export const SVG_ONLY_PRESETS: PresetKey[] = ['sketch', 'aerial', 'vibrant'];

// Optional textured page background (SVG only), drawn under every layer.
// Uses LayerStyle's fill fields: fillColor = base tone, color = texture ink.
export const PRESET_BACKGROUNDS: Partial<Record<PresetKey, LayerStyle>> = {
  aerial: { color: [95, 95, 95], lineWidth: 0, fill: true, fillOpacity: 1, fillColor: [212, 212, 212], texture: 'grain' },
};

const BASE: StyleMap = {
  water: { color: [51, 153, 255], lineWidth: 0.1, fill: false, fillOpacity: 1 },
  streets: { color: [255, 102, 0], lineWidth: 0.1, fill: false, fillOpacity: 1 },
  buildings: { color: [136, 136, 136], lineWidth: 0.1, fill: false, fillOpacity: 1 },
  railways: { color: [68, 68, 68], lineWidth: 0.1, fill: false, fillOpacity: 1, dash: [2, 1.3] },
  trees: { color: [34, 139, 34], lineWidth: 0.1, fill: true, fillOpacity: 1, pointRadius: 0.8 },
  greenery: { color: [144, 238, 144], lineWidth: 0.1, fill: true, fillOpacity: 1 },
  contours: { color: [170, 120, 80], lineWidth: 0.1, fill: false, fillOpacity: 1 },
};

const INK: [number, number, number] = [26, 26, 26];

export const STYLE_PRESETS: Record<PresetKey, StyleMap> = {
  default: BASE,

  // Monochrome, matching the app's own flat ink/paper look — good for a
  // clean line drawing that still reads well in black & white.
  blueprint: {
    water: { color: INK, lineWidth: 0.1, fill: false, fillOpacity: 1, dash: [1.5, 1.2] },
    streets: { color: INK, lineWidth: 0.1, fill: false, fillOpacity: 1 },
    buildings: { color: INK, lineWidth: 0.1, fill: false, fillOpacity: 1 },
    railways: { color: INK, lineWidth: 0.1, fill: false, fillOpacity: 1, dash: [2, 1.3] },
    trees: { color: INK, lineWidth: 0.1, fill: true, fillOpacity: 1, pointRadius: 0.7 },
    greenery: { color: INK, lineWidth: 0.1, fill: true, fillOpacity: 0.08 },
    contours: { color: INK, lineWidth: 0.1, fill: false, fillOpacity: 1, dash: [0.6, 0.6] },
  },

  // Achromatic shades, differentiated by darkness instead of hue — safe for
  // black & white printers.
  grayscale: {
    water: { color: [120, 120, 120], lineWidth: 0.1, fill: false, fillOpacity: 1, dash: [1.5, 1.2] },
    streets: { color: [40, 40, 40], lineWidth: 0.1, fill: false, fillOpacity: 1 },
    buildings: { color: [90, 90, 90], lineWidth: 0.1, fill: false, fillOpacity: 1 },
    railways: { color: [60, 60, 60], lineWidth: 0.1, fill: false, fillOpacity: 1, dash: [2, 1.3] },
    trees: { color: [100, 100, 100], lineWidth: 0.1, fill: true, fillOpacity: 1, pointRadius: 0.8 },
    greenery: { color: [190, 190, 190], lineWidth: 0.1, fill: true, fillOpacity: 0.5 },
    contours: { color: [150, 150, 150], lineWidth: 0.1, fill: false, fillOpacity: 1 },
  },

  // Default colors, thicker strokes — holds up at large formats (A1/A0) or
  // when printed small.
  bold: {
    water: { color: [51, 153, 255], lineWidth: 1.1, fill: false, fillOpacity: 1 },
    streets: { color: [255, 102, 0], lineWidth: 1.2, fill: false, fillOpacity: 1 },
    buildings: { color: [136, 136, 136], lineWidth: 1.0, fill: false, fillOpacity: 1 },
    railways: { color: [68, 68, 68], lineWidth: 1.0, fill: false, fillOpacity: 1, dash: [3, 2] },
    trees: { color: [34, 139, 34], lineWidth: 0.6, fill: true, fillOpacity: 1, pointRadius: 1.2 },
    greenery: { color: [144, 238, 144], lineWidth: 1.0, fill: true, fillOpacity: 1 },
    contours: { color: [170, 120, 80], lineWidth: 0.5, fill: false, fillOpacity: 1 },
  },

  // Hand-drawn architectural site plan: white buildings with cast shadows,
  // double-line streets, scribbled tree canopies, stippled green areas and
  // hatched water. Best exported as SVG.
  sketch: {
    water: { color: [110, 110, 110], lineWidth: 0.25, fill: true, fillOpacity: 0.12, texture: 'hatch' },
    streets: { color: [60, 60, 60], lineWidth: 0.18, fill: false, fillOpacity: 1, casingMeters: 6 },
    buildings: { color: [26, 26, 26], lineWidth: 0.3, fill: true, fillOpacity: 1, fillColor: [255, 255, 255], shadow: true },
    railways: { color: [60, 60, 60], lineWidth: 0.3, fill: false, fillOpacity: 1, dash: [1.5, 1] },
    trees: { color: [60, 60, 60], lineWidth: 0.15, fill: true, fillOpacity: 0.18, pointRadius: 0.8, shadow: true, canopy: 'scribble' },
    greenery: { color: [90, 90, 90], lineWidth: 0.15, fill: true, fillOpacity: 0.06, texture: 'stipple', dash: [0.8, 0.6] },
    contours: { color: [150, 150, 150], lineWidth: 0.12, fill: false, fillOpacity: 1 },
  },

  // Grayscale "aerial photo" look: a grainy ground, darker grainy green
  // areas and tree canopies, pale roofs with cast shadows, white streets
  // and no hard outlines on vegetation. Best exported as SVG.
  aerial: {
    water: { color: [70, 70, 70], lineWidth: 0.1, fill: true, fillOpacity: 1, fillColor: [105, 105, 105] },
    streets: { color: [175, 175, 175], lineWidth: 0.08, fill: false, fillOpacity: 1, casingMeters: 6 },
    buildings: { color: [120, 120, 120], lineWidth: 0.1, fill: true, fillOpacity: 1, fillColor: [236, 236, 236], shadow: true },
    railways: { color: [80, 80, 80], lineWidth: 0.3, fill: false, fillOpacity: 1, dash: [1.5, 1] },
    trees: { color: [25, 25, 25], lineWidth: 0, fill: true, fillOpacity: 1, fillColor: [95, 95, 95], pointRadius: 0.8, shadow: true, canopy: 'soft', texture: 'grain' },
    greenery: { color: [45, 45, 45], lineWidth: 0, fill: true, fillOpacity: 1, fillColor: [160, 160, 160], texture: 'grain' },
    contours: { color: [90, 90, 90], lineWidth: 0.1, fill: false, fillOpacity: 1 },
  },

  // Vibrant urban-masterplan diagram: saturated blue water with rivers at
  // real width, coral buildings without outlines, pale mint green areas
  // with fine line hatching, light gray streets, dashed purple rail.
  vibrant: {
    water: { color: [0, 102, 255], lineWidth: 0.2, fill: true, fillOpacity: 1, scaledLines: true },
    streets: { color: [196, 196, 202], lineWidth: 0.12, fill: false, fillOpacity: 1 },
    buildings: { color: [242, 140, 135], lineWidth: 0, fill: true, fillOpacity: 1, fillColor: [244, 150, 144] },
    railways: { color: [140, 60, 230], lineWidth: 0.35, fill: false, fillOpacity: 1, dash: [1.2, 0.8] },
    trees: { color: [120, 205, 175], lineWidth: 0.1, fill: true, fillOpacity: 1, pointRadius: 0.45 },
    greenery: { color: [130, 205, 185], lineWidth: 0, fill: true, fillOpacity: 1, fillColor: [222, 243, 236], texture: 'lines' },
    contours: { color: [170, 215, 200], lineWidth: 0.1, fill: false, fillOpacity: 1 },
  },
};

export function cloneStyleMap(map: StyleMap): StyleMap {
  const clone = {} as StyleMap;
  (Object.keys(map) as OSMFeatureType[]).forEach(key => {
    const s = map[key];
    clone[key] = {
      ...s,
      color: [...s.color] as [number, number, number],
      fillColor: s.fillColor ? [...s.fillColor] as [number, number, number] : undefined,
      dash: s.dash ? [...s.dash] as [number, number] : undefined,
    };
  });
  return clone;
}
