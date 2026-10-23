import { OSMFeatureType } from '../components/DataSelector';
import { ExportOptions } from './paperSizes';
import { PresetKey, STYLE_PRESET_KEYS } from './exportStyles';

// The shareable part of the app state: where the frame is, its scale and
// paper size, the style preset and the selected layers. Kept in the URL
// hash (so a link reproduces the setup) and in localStorage (so a plain
// reload or a later visit picks up where you left off).

export interface SavedState {
  center: [number, number]; // lon, lat
  exportOptions: ExportOptions;
  preset: PresetKey;
  layers: OSMFeatureType[];
  contourInterval: number | null; // m, null = automatic
}

const STORAGE_KEY = 'qsp-settings';
const ALL_LAYERS: OSMFeatureType[] = ['water', 'streets', 'buildings', 'railways', 'trees', 'greenery', 'contours'];

export function serializeState(st: SavedState): string {
  const p = new URLSearchParams();
  p.set('c', `${st.center[1].toFixed(5)},${st.center[0].toFixed(5)}`);
  p.set('s', String(st.exportOptions.scale));
  p.set('p', st.exportOptions.paperSize);
  if (st.exportOptions.paperSize === 'Custom') {
    p.set('w', String(Math.round(st.exportOptions.customWidthMm ?? 210)));
    p.set('h', String(Math.round(st.exportOptions.customHeightMm ?? 297)));
  } else {
    p.set('o', st.exportOptions.orientation);
  }
  p.set('st', st.preset);
  p.set('l', st.layers.join(','));
  if (st.contourInterval) p.set('ci', String(st.contourInterval));
  return p.toString();
}

function parseParams(str: string): SavedState | null {
  const p = new URLSearchParams(str.replace(/^#/, ''));
  const c = (p.get('c') ?? '').split(',').map(Number);
  if (c.length !== 2 || !c.every(Number.isFinite) || Math.abs(c[0]) > 85 || Math.abs(c[1]) > 180) return null;
  const scale = Number(p.get('s'));
  const paperSize = p.get('p') ?? 'A4';
  const preset = p.get('st') as PresetKey;
  const layers = (p.get('l') ?? '').split(',').filter((l): l is OSMFeatureType => (ALL_LAYERS as string[]).includes(l));
  return {
    center: [c[1], c[0]],
    exportOptions: {
      scale: Number.isFinite(scale) && scale > 0 ? scale : 5000,
      paperSize,
      orientation: p.get('o') === 'landscape' ? 'landscape' : 'portrait',
      ...(paperSize === 'Custom' ? { customWidthMm: Number(p.get('w')) || 210, customHeightMm: Number(p.get('h')) || 297 } : {}),
    },
    preset: STYLE_PRESET_KEYS.includes(preset) ? preset : 'default',
    layers: layers.length > 0 ? layers : ['water', 'streets', 'buildings', 'trees', 'greenery'],
    contourInterval: Number(p.get('ci')) > 0 ? Number(p.get('ci')) : null,
  };
}

// URL hash first (a shared link wins), then the last saved session.
export function loadState(): SavedState | null {
  const fromHash = window.location.hash.length > 1 ? parseParams(window.location.hash) : null;
  if (fromHash) return fromHash;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? parseParams(stored) : null;
  } catch {
    return null;
  }
}

export function saveState(st: SavedState) {
  const str = serializeState(st);
  try {
    window.history.replaceState(null, '', `#${str}`);
  } catch { /* ignore */ }
  try {
    window.localStorage.setItem(STORAGE_KEY, str);
  } catch { /* ignore */ }
}
