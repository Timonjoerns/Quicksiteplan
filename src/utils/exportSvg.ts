import { OSMFeatureType } from '../components/DataSelector';
import { LayerStyle, StyleMap } from './exportStyles';
import { ExportOptions } from './paperSizes';
import { CategoryMap, computeScaleBar, areaPolygons, simplifyPts, SIMPLIFY_TOL_MM } from './exportGeometry';

// Order matches the map preview and PDF: greenery (fill) below everything,
// then contours, water, railways, streets, buildings, trees on top.
const CATEGORY_ORDER: OSMFeatureType[] = ['greenery', 'contours', 'water', 'railways', 'streets', 'buildings'];

const CATEGORY_LABELS: Record<OSMFeatureType, string> = {
  water: 'Water',
  streets: 'Streets',
  buildings: 'Buildings',
  railways: 'Railways',
  trees: 'Trees',
  greenery: 'Greenery',
  contours: 'Contour Lines',
};

// Shadows fall toward the lower right of the page; length = object height
// × SHADOW_RATIO (≈ sun at 63° elevation).
const SHADOW_DIR: [number, number] = [0.8, 0.6];
const SHADOW_RATIO = 0.5;
const SHADOW_OPACITY = 0.28;
const DEFAULT_BUILDING_HEIGHT_M = 8;
const DEFAULT_CROWN_RADIUS_M = 3;

// Real-world street widths (m) relative to a 6 m residential street; scaled
// by the style's casingMeters.
const STREET_WIDTH_FACTOR: Record<string, number> = {
  motorway: 2.3, trunk: 2.1, primary: 1.8, secondary: 1.5, tertiary: 1.3,
  motorway_link: 1.3, trunk_link: 1.3, primary_link: 1.2, secondary_link: 1.1, tertiary_link: 1,
  residential: 1, unclassified: 1, living_street: 0.9, pedestrian: 0.9,
  service: 0.65, track: 0.5, footway: 0.35, path: 0.3, cycleway: 0.35, bridleway: 0.3, steps: 0.35,
};

// Typical waterway widths (m) when the OSM way has no width tag.
const WATERWAY_WIDTH_M: Record<string, number> = { river: 20, canal: 12, stream: 3 };

type Pt = [number, number];

// Geometry now extends past the page edge (instead of being cut off point
// by point), so every map group is clipped to the page. Illustrator imports
// each as a clip group, keeping the named group structure.
const CLIP = ' clip-path="url(#page-clip)"';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const fmt = (n: number) => n.toFixed(2);
const rgb = ([r, g, b]: [number, number, number]) => `rgb(${r},${g},${b})`;

// Projects to page mm and drops points closer than the printer can show.
function projectPts(coords: Pt[], project: (c: Pt) => Pt): Pt[] {
  return simplifyPts(coords.map(project).filter(([x, y]) => !isNaN(x) && !isNaN(y)), SIMPLIFY_TOL_MM);
}

// Path data with relative moves after the first point (much shorter than
// absolute coordinates). Deltas are taken between already-rounded points,
// so rounding doesn't accumulate along the line.
function pathFromPts(pts: Pt[], close: boolean): string {
  if (pts.length < 2) return '';
  const r = (n: number) => Math.round(n * 100) / 100;
  let px = r(pts[0][0]);
  let py = r(pts[0][1]);
  let d = `M${px} ${py}l`;
  for (let i = 1; i < pts.length; i++) {
    const x = r(pts[i][0]);
    const y = r(pts[i][1]);
    const dx = Math.round((x - px) * 100) / 100;
    const dy = Math.round((y - py) * 100) / 100;
    d += `${i > 1 && dx >= 0 ? ' ' : ''}${dx}${dy >= 0 ? ' ' : ''}${dy}`;
    px = x;
    py = y;
  }
  if (close) d += 'z';
  return d;
}

// Small deterministic PRNG, so the hand-drawn jitter is stable between
// exports of the same data.
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromCoord([lon, lat]: Pt): number {
  return Math.floor(lon * 1e6) * 31 + Math.floor(lat * 1e6);
}

function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

function parseMeters(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function buildingHeight(props: GeoJSON.GeoJsonProperties): number {
  const h = parseMeters(props?.height);
  if (h) return Math.min(h, 60);
  const levels = parseMeters(props?.['building:levels']);
  if (levels) return Math.min(levels * 3 + 1, 60);
  return DEFAULT_BUILDING_HEIGHT_M;
}

// Shadow silhouette of a vertical prism: the footprint swept along the
// shadow vector. Emitted as one path of the translated footprint plus one
// quad per edge, all wound the same way so nonzero fill unions them
// instead of cutting holes where they overlap.
function prismShadowPath(ring: Pt[], d: Pt): string {
  let pts = ring.slice(0, -1);
  if (pts.length < 3) return '';
  if (signedArea(pts) < 0) pts = pts.reverse();
  const shifted = pts.map(([x, y]): Pt => [x + d[0], y + d[1]]);
  let path = pathFromPts(shifted, true);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const cross = (b[0] - a[0]) * d[1] - (b[1] - a[1]) * d[0];
    if (Math.abs(cross) < 1e-6) continue;
    const quad: Pt[] = [a, b, [b[0] + d[0], b[1] + d[1]], [a[0] + d[0], a[1] + d[1]]];
    path += ' ' + pathFromPts(cross > 0 ? quad : quad.reverse(), true);
  }
  return path;
}

// Wobbly closed outline (smoothed with quadratic curves through edge
// midpoints) — reads as a hand-drawn tree canopy.
function scribbleCircle(cx: number, cy: number, r: number, rand: () => number): string {
  const n = 14;
  const pts: Pt[] = [];
  const phase = rand() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    const rr = r * (0.86 + rand() * 0.24);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  const mid = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  let d = `M ${fmt(m0[0])} ${fmt(m0[1])} `;
  for (let i = 0; i < n; i++) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    d += `Q ${fmt(pts[i][0])} ${fmt(pts[i][1])} ${fmt(m[0])} ${fmt(m[1])} `;
  }
  return d + 'Z';
}

// A few short strokes radiating from the trunk, like the "starburst"
// texture in hand-drawn site plans.
function canopyStrokes(cx: number, cy: number, r: number, rand: () => number): string {
  let d = '';
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.6;
    const r0 = r * (0.18 + rand() * 0.1);
    const r1 = r * (0.5 + rand() * 0.2);
    d += `M ${fmt(cx + Math.cos(a) * r0)} ${fmt(cy + Math.sin(a) * r0)} L ${fmt(cx + Math.cos(a) * r1)} ${fmt(cy + Math.sin(a) * r1)} `;
  }
  return d;
}

function texturePattern(name: string, style: LayerStyle): string {
  const id = `tex-${name}`;
  const ink = rgb(style.color);
  const tint = rgb(style.fillColor ?? style.color);
  const bg = style.fill ? `<rect width="100%" height="100%" fill="${tint}" fill-opacity="${style.fillOpacity}"/>` : '';
  if (style.texture === 'lines') {
    // fine vertical lines, as in colored masterplan diagrams
    const s = 0.6;
    return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${s}" height="${s}">` +
      `${bg}<line x1="0" y1="0" x2="0" y2="${s}" stroke="${ink}" stroke-width="0.08"/></pattern>`;
  }
  if (style.texture === 'hatch') {
    const s = 1.2;
    return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${s}" height="${s}" patternTransform="rotate(45)">` +
      `${bg}<line x1="0" y1="0" x2="0" y2="${s}" stroke="${ink}" stroke-width="0.12"/></pattern>`;
  }
  // stipple: sparse irregular dots on an 8 mm tile; grain: dense fine
  // dots on a 3 mm tile, reading as photographic film grain.
  const grain = style.texture === 'grain';
  const s = grain ? 3 : 8;
  const count = grain ? 110 : 70;
  const [rMin, rVar] = grain ? [0.03, 0.06] : [0.07, 0.12];
  const rand = seededRandom(Array.from(name).reduce((h, c) => h * 31 + c.charCodeAt(0), 7));
  const dots: string[] = [];
  for (let i = 0; i < count; i++) {
    dots.push(`<circle cx="${fmt(rand() * s)}" cy="${fmt(rand() * s)}" r="${(rMin + rand() * rVar).toFixed(3)}"/>`);
  }
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${s}" height="${s}">${bg}<g fill="${ink}">${dots.join('')}</g></pattern>`;
}

export interface BuildSvgParams {
  wmm: number;
  hmm: number;
  categories: CategoryMap;
  project: (c: [number, number]) => [number, number];
  layerStyles: StyleMap;
  trueWidthMeters: number;
  exportOptions: ExportOptions;
  // Optional textured page background (e.g. the aerial preset's grain).
  background?: LayerStyle;
}

// Builds a standalone SVG string with one named <g> per OSM feature
// category (id + data-name), so design tools like Illustrator import each
// category as a real, independently selectable group/layer — instead of
// everything flattened, selectable only by matching fill/stroke color (the
// only option with the plain PDF export, since the PDF library in use has
// no support for PDF layers / Optional Content Groups).
export function buildExportSvg(params: BuildSvgParams): string {
  const { wmm, hmm, categories, project, layerStyles, trueWidthMeters, exportOptions, background } = params;
  const inset = 10;
  const pageScale = Math.min(2.2, Math.max(0.6, Math.sqrt((wmm * hmm) / (210 * 297))));
  const mmPerMeter = trueWidthMeters > 0 ? wmm / trueWidthMeters : 0;
  const shadowVec = (heightM: number): Pt => {
    const len = heightM * SHADOW_RATIO * mmPerMeter;
    return [SHADOW_DIR[0] * len, SHADOW_DIR[1] * len];
  };

  const defs: string[] = [];
  const groups: string[] = [];
  const shadowPaths: string[] = [];

  let backgroundRect = '';
  if (background) {
    if (background.texture) defs.push(texturePattern('background', background));
    const bgFill = background.texture ? 'url(#tex-background)' : rgb(background.fillColor ?? background.color);
    backgroundRect = `<rect id="background" data-name="Background" width="${wmm}" height="${hmm}" fill="${bgFill}"/>`;
  }

  const renderCategory = (type: OSMFeatureType) => {
    const feats = categories[type];
    if (!feats || feats.length === 0) return;
    const style = layerStyles[type];
    const stroke = rgb(style.color);
    const dashAttr = style.dash ? ` stroke-dasharray="${style.dash[0]} ${style.dash[1]}"` : '';

    // Double-line streets: a dark casing pass under a paper-white pass, each
    // path stroked at its real-world width, so junctions merge cleanly.
    if (type === 'streets' && style.casingMeters && mmPerMeter > 0) {
      const outer: string[] = [];
      const inner: string[] = [];
      feats.forEach(f => {
        if (f.geometry.type !== 'LineString') return;
        const d = pathFromPts(projectPts(f.geometry.coordinates as Pt[], project), false);
        if (!d) return;
        const factor = STREET_WIDTH_FACTOR[String(f.properties?.highway)] ?? 0.8;
        const w = Math.max(0.3, factor * style.casingMeters! * mmPerMeter);
        outer.push(`<path d="${d}" stroke-width="${fmt(w + 2 * style.lineWidth)}"/>`);
        inner.push(`<path d="${d}" stroke-width="${fmt(w)}"/>`);
      });
      if (outer.length === 0) return;
      groups.push(
        `<g id="streets" data-name="${CATEGORY_LABELS.streets}" fill="none"${CLIP} stroke-linejoin="round" stroke-linecap="round">\n` +
        `<g id="streets-casing" data-name="Street Edges" stroke="${stroke}">\n${outer.join('\n')}\n</g>\n` +
        `<g id="streets-surface" data-name="Street Surface" stroke="#ffffff">\n${inner.join('\n')}\n</g>\n</g>`
      );
      return;
    }

    let areaFill = 'none';
    if (style.texture) {
      defs.push(texturePattern(type, style));
      areaFill = `url(#tex-${type})`;
    } else if (style.fill) {
      areaFill = rgb(style.fillColor ?? style.color);
    }
    const fillOpacityAttr = style.fill && !style.texture && style.fillOpacity < 1 ? ` fill-opacity="${style.fillOpacity}"` : '';

    const paths: string[] = [];
    feats.forEach(f => {
      const polygons = areaPolygons(f);
      if (polygons) {
        // Outer ring + holes in one path; the group's even-odd fill rule
        // leaves islands and courtyards empty.
        const d = polygons.flatMap(rings => rings.map(r => pathFromPts(projectPts(r, project), true))).filter(Boolean).join(' ');
        if (!d) return;
        paths.push(`<path d="${d}"/>`);
        if (style.shadow && mmPerMeter > 0) {
          const vec = shadowVec(buildingHeight(f.properties));
          polygons.forEach(rings => {
            const sd = prismShadowPath(projectPts(rings[0], project), vec);
            if (sd) shadowPaths.push(`<path d="${sd}"/>`);
          });
        }
      } else if (f.geometry.type === 'LineString') {
        const d = pathFromPts(projectPts(f.geometry.coordinates as Pt[], project), false);
        if (!d) return;
        if (style.scaledLines && mmPerMeter > 0) {
          const widthM = parseMeters(f.properties?.width) ?? WATERWAY_WIDTH_M[String(f.properties?.waterway)] ?? 0;
          const w = Math.max(style.lineWidth, Math.min(widthM, 80) * mmPerMeter);
          paths.push(`<path d="${d}" fill="none" stroke-width="${fmt(w)}"/>`);
        } else if (f.properties?.contour) {
          // index contours (every 5th) drawn heavier, with their height
          const idx = f.properties.index;
          paths.push(`<path d="${d}" fill="none"${idx ? ` stroke-width="${fmt(style.lineWidth * 2.2)}"` : ''} data-ele="${f.properties.ele}"/>`);
        } else {
          paths.push(`<path d="${d}" fill="none"/>`);
        }
      }
    });
    if (paths.length === 0) return;
    groups.push(
      `<g id="${type}" data-name="${escapeXml(CATEGORY_LABELS[type])}" stroke="${style.lineWidth > 0 ? stroke : 'none'}" stroke-width="${style.lineWidth}" fill="${areaFill}" fill-rule="evenodd"${fillOpacityAttr}${dashAttr}${CLIP} stroke-linejoin="round" stroke-linecap="round">\n` +
      paths.join('\n') + `\n</g>`
    );
  };

  CATEGORY_ORDER.forEach(renderCategory);

  // Trees: scribbled canopies (sized from crown diameter, or a default) or
  // plain dots.
  const treeFeats = categories.trees;
  if (treeFeats && treeFeats.length > 0) {
    const style = layerStyles.trees;
    const color = rgb(style.color);
    const items: string[] = [];
    treeFeats.forEach(f => {
      if (f.geometry.type !== 'Point') return;
      const coord = f.geometry.coordinates as Pt;
      const [x, y] = project(coord);
      if (isNaN(x) || isNaN(y)) return;
      if (style.canopy && mmPerMeter > 0) {
        const crownM = (parseMeters(f.properties?.diameter_crown) ?? DEFAULT_CROWN_RADIUS_M * 2) / 2;
        const r = Math.max(0.6, Math.min(crownM, 12) * mmPerMeter);
        const rand = seededRandom(seedFromCoord(coord));
        const outline = scribbleCircle(x, y, r, rand);
        items.push(style.canopy === 'scribble'
          ? `<g><path d="${outline}"/><path d="${canopyStrokes(x, y, r, rand)}" fill="none"/></g>`
          : `<path d="${outline}"/>`);
        if (style.shadow) {
          const [dx, dy] = shadowVec(crownM * 2.5);
          shadowPaths.push(`<circle cx="${fmt(x + dx)}" cy="${fmt(y + dy)}" r="${fmt(r * 0.95)}"/>`);
        }
      } else {
        items.push(`<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${style.pointRadius ?? 0.8}"/>`);
      }
    });
    if (items.length > 0) {
      let canopyFill = `fill="${rgb(style.fillColor ?? style.color)}" fill-opacity="${style.fillOpacity}"`;
      if (style.texture) {
        defs.push(texturePattern('trees', style));
        canopyFill = 'fill="url(#tex-trees)"';
      }
      const canopyStroke = style.lineWidth > 0 ? `stroke="${color}" stroke-width="${style.lineWidth}" stroke-linecap="round"` : 'stroke="none"';
      const attrs = style.canopy ? `${canopyFill} ${canopyStroke}` : `fill="${color}" stroke="none"`;
      groups.push(`<g id="trees" data-name="${escapeXml(CATEGORY_LABELS.trees)}" ${attrs}${CLIP}>\n${items.join('\n')}\n</g>`);
    }
  }

  // Shadows go under buildings and trees but above streets/greenery. Group
  // opacity (not per-shape fill-opacity) keeps overlapping shadows even.
  if (shadowPaths.length > 0) {
    const idx = groups.findIndex(g => g.startsWith('<g id="buildings"') || g.startsWith('<g id="trees"'));
    const shadowGroup = `<g id="shadows" data-name="Shadows" fill="#000000" stroke="none" opacity="${SHADOW_OPACITY}"${CLIP}>\n${shadowPaths.join('\n')}\n</g>`;
    groups.splice(idx === -1 ? groups.length : idx, 0, shadowGroup);
  }

  const { length: scaleBarLength, px: scaleBarPx } = computeScaleBar(trueWidthMeters, wmm);
  const barX = inset + 12 * pageScale;
  const barY = hmm - inset - 24 * pageScale;
  const scaleBarGroup = `<g id="scale-bar" data-name="Scale Bar" stroke="rgb(26,26,26)" stroke-width="${pageScale}" fill="none">
<line x1="${barX}" y1="${barY}" x2="${barX + scaleBarPx}" y2="${barY}"/>
<line x1="${barX}" y1="${barY - 3 * pageScale}" x2="${barX}" y2="${barY + 3 * pageScale}"/>
<line x1="${barX + scaleBarPx}" y1="${barY - 3 * pageScale}" x2="${barX + scaleBarPx}" y2="${barY + 3 * pageScale}"/>
<text x="${barX + scaleBarPx / 2}" y="${barY - 4 * pageScale}" font-size="${10 * pageScale}" text-anchor="middle" fill="rgb(26,26,26)" stroke="none" font-family="sans-serif">${scaleBarLength} m</text>
</g>`;

  const arrowX = inset + 24 * pageScale;
  const arrowY = inset + 32 * pageScale;
  const arrowLen = 18 * pageScale;
  const northArrowGroup = `<g id="north-arrow" data-name="North Arrow" stroke="rgb(26,26,26)" stroke-width="${1.2 * pageScale}" fill="none">
<line x1="${arrowX}" y1="${arrowY}" x2="${arrowX}" y2="${arrowY - arrowLen}"/>
<line x1="${arrowX}" y1="${arrowY - arrowLen}" x2="${arrowX - 4 * pageScale}" y2="${arrowY - arrowLen + 7 * pageScale}"/>
<line x1="${arrowX}" y1="${arrowY - arrowLen}" x2="${arrowX + 4 * pageScale}" y2="${arrowY - arrowLen + 7 * pageScale}"/>
<text x="${arrowX}" y="${arrowY - arrowLen - 4 * pageScale}" font-size="${12 * pageScale}" text-anchor="middle" fill="rgb(26,26,26)" stroke="none" font-family="sans-serif">N</text>
</g>`;

  const paperLabel = exportOptions.paperSize === 'Custom'
    ? `${Math.round(wmm)}×${Math.round(hmm)} mm`
    : `${exportOptions.paperSize} ${exportOptions.orientation}`;
  const titleLine = `1:${exportOptions.scale.toLocaleString()}  ·  ${paperLabel}  ·  ${new Date().toLocaleDateString()}`;
  const titleText = `<text id="title-block" data-name="Title Block" x="${wmm - inset}" y="${hmm - inset}" font-size="${9 * pageScale}" text-anchor="end" fill="rgb(26,26,26)" font-family="sans-serif">${escapeXml(titleLine)}</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${wmm}mm" height="${hmm}mm" viewBox="0 0 ${wmm} ${hmm}">
<defs>
<clipPath id="page-clip"><rect width="${wmm}" height="${hmm}"/></clipPath>
${defs.join('\n')}
</defs>
<rect width="${wmm}" height="${hmm}" fill="#ffffff"/>
${backgroundRect}
${groups.join('\n')}
${scaleBarGroup}
${northArrowGroup}
${titleText}
</svg>`;
}
