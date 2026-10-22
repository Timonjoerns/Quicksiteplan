export type Orientation = 'portrait' | 'landscape';

// DIN paper sizes in millimeters (portrait orientation).
export const PAPER_SIZES: Record<string, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  A1: [594, 841],
  A0: [841, 1189],
};

export interface ExportOptions {
  scale: number;
  paperSize: string; // one of PAPER_SIZES keys, or 'Custom'
  orientation: Orientation;
  customWidthMm?: number;
  customHeightMm?: number;
}

// Width/height in mm for the current export options, orientation-applied.
export function getPaperDimsMm(opts: ExportOptions): [number, number] {
  if (opts.paperSize === 'Custom') {
    const w = opts.customWidthMm && opts.customWidthMm > 0 ? opts.customWidthMm : 210;
    const h = opts.customHeightMm && opts.customHeightMm > 0 ? opts.customHeightMm : 297;
    return [w, h];
  }
  let [w, h] = PAPER_SIZES[opts.paperSize] || PAPER_SIZES.A4;
  if (opts.orientation === 'landscape') [w, h] = [h, w];
  return [w, h];
}

// All individual DIN side lengths (widths and heights across A0-A4),
// de-duplicated and sorted. Used to snap a single dragged edge (one axis)
// independently of its paired dimension.
export const DIN_DIMENSIONS: number[] = Array.from(
  new Set(Object.values(PAPER_SIZES).flat())
).sort((a, b) => a - b);

// Snap a single length (mm) to the nearest DIN side length, within
// `tolerance` relative error. Returns null when nothing is close enough.
export function findNearestDinDimension(mm: number, tolerance = 0.05): number | null {
  let best: number | null = null;
  let bestErr = Infinity;
  for (const d of DIN_DIMENSIONS) {
    const err = Math.abs(mm - d) / d;
    if (err < bestErr) {
      bestErr = err;
      best = d;
    }
  }
  return best !== null && bestErr <= tolerance ? best : null;
}

export interface DinMatch {
  key: string;
  orientation: Orientation;
  wmm: number;
  hmm: number;
}

// Find the closest standard DIN size (either orientation) to the given
// dimensions, within `tolerance` (relative error, e.g. 0.05 = 5%).
// Returns null when nothing is close enough — caller should fall back to
// a custom size.
export function findNearestDin(wmm: number, hmm: number, tolerance = 0.05): DinMatch | null {
  let best: DinMatch | null = null;
  let bestErr = Infinity;
  for (const [key, [pw, ph]] of Object.entries(PAPER_SIZES)) {
    const candidates: [number, number, Orientation][] = [
      [pw, ph, 'portrait'],
      [ph, pw, 'landscape'],
    ];
    for (const [tw, th, orientation] of candidates) {
      const err = Math.max(Math.abs(wmm - tw) / tw, Math.abs(hmm - th) / th);
      if (err < bestErr) {
        bestErr = err;
        best = { key, orientation, wmm: tw, hmm: th };
      }
    }
  }
  return best && bestErr <= tolerance ? best : null;
}
