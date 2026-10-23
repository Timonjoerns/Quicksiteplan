import { OSMFeatureType } from '../components/DataSelector';

export interface LayerStyle {
  color: [number, number, number];
  lineWidth: number;
  fill: boolean;
  fillOpacity: number; // 0-1, only used when fill is true
  dash?: [number, number]; // [dash, gap] in mm
  pointRadius?: number; // only used for point layers (trees)
}

export type StyleMap = Record<OSMFeatureType, LayerStyle>;

export type PresetKey = 'default' | 'blueprint' | 'grayscale' | 'bold';

export const STYLE_PRESET_KEYS: PresetKey[] = ['default', 'blueprint', 'grayscale', 'bold'];

const BASE: StyleMap = {
  water: { color: [51, 153, 255], lineWidth: 0.7, fill: false, fillOpacity: 1 },
  streets: { color: [255, 102, 0], lineWidth: 0.7, fill: false, fillOpacity: 1 },
  buildings: { color: [136, 136, 136], lineWidth: 0.7, fill: false, fillOpacity: 1 },
  railways: { color: [68, 68, 68], lineWidth: 0.6, fill: false, fillOpacity: 1, dash: [2, 1.3] },
  trees: { color: [34, 139, 34], lineWidth: 0.5, fill: true, fillOpacity: 1, pointRadius: 0.8 },
  greenery: { color: [144, 238, 144], lineWidth: 0.7, fill: true, fillOpacity: 1 },
};

const INK: [number, number, number] = [26, 26, 26];

export const STYLE_PRESETS: Record<PresetKey, StyleMap> = {
  default: BASE,

  // Monochrome, matching the app's own flat ink/paper look — good for a
  // clean line drawing that still reads well in black & white.
  blueprint: {
    water: { color: INK, lineWidth: 0.6, fill: false, fillOpacity: 1, dash: [1.5, 1.2] },
    streets: { color: INK, lineWidth: 0.8, fill: false, fillOpacity: 1 },
    buildings: { color: INK, lineWidth: 0.5, fill: false, fillOpacity: 1 },
    railways: { color: INK, lineWidth: 0.5, fill: false, fillOpacity: 1, dash: [2, 1.3] },
    trees: { color: INK, lineWidth: 0.4, fill: true, fillOpacity: 1, pointRadius: 0.7 },
    greenery: { color: INK, lineWidth: 0.5, fill: true, fillOpacity: 0.08 },
  },

  // Achromatic shades, differentiated by darkness instead of hue — safe for
  // black & white printers.
  grayscale: {
    water: { color: [120, 120, 120], lineWidth: 0.7, fill: false, fillOpacity: 1, dash: [1.5, 1.2] },
    streets: { color: [40, 40, 40], lineWidth: 0.8, fill: false, fillOpacity: 1 },
    buildings: { color: [90, 90, 90], lineWidth: 0.6, fill: false, fillOpacity: 1 },
    railways: { color: [60, 60, 60], lineWidth: 0.5, fill: false, fillOpacity: 1, dash: [2, 1.3] },
    trees: { color: [100, 100, 100], lineWidth: 0.5, fill: true, fillOpacity: 1, pointRadius: 0.8 },
    greenery: { color: [190, 190, 190], lineWidth: 0.7, fill: true, fillOpacity: 0.5 },
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
  },
};

export function cloneStyleMap(map: StyleMap): StyleMap {
  const clone = {} as StyleMap;
  (Object.keys(map) as OSMFeatureType[]).forEach(key => {
    const s = map[key];
    clone[key] = { ...s, color: [...s.color] as [number, number, number], dash: s.dash ? [...s.dash] as [number, number] : undefined };
  });
  return clone;
}
