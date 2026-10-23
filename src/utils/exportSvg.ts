import { OSMFeatureType } from '../components/DataSelector';
import { StyleMap } from './exportStyles';
import { ExportOptions } from './paperSizes';
import { CategoryMap, computeScaleBar } from './exportGeometry';

// Order matches the map preview and PDF: greenery (fill) below everything,
// then water, railways, streets, buildings, trees on top.
const CATEGORY_ORDER: OSMFeatureType[] = ['greenery', 'water', 'railways', 'streets', 'buildings'];

const CATEGORY_LABELS: Record<OSMFeatureType, string> = {
  water: 'Water',
  streets: 'Streets',
  buildings: 'Buildings',
  railways: 'Railways',
  trees: 'Trees',
  greenery: 'Greenery',
};

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pathFromCoords(coords: [number, number][], project: (c: [number, number]) => [number, number], close: boolean): string {
  const pts = coords.map(project).filter(([x, y]) => !isNaN(x) && !isNaN(y));
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)} `;
  for (let i = 1; i < pts.length; i++) d += `L ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)} `;
  if (close) d += 'Z';
  return d;
}

export interface BuildSvgParams {
  wmm: number;
  hmm: number;
  categories: CategoryMap;
  project: (c: [number, number]) => [number, number];
  layerStyles: StyleMap;
  trueWidthMeters: number;
  exportOptions: ExportOptions;
}

// Builds a standalone SVG string with one named <g> per OSM feature
// category (id + data-name), so design tools like Illustrator import each
// category as a real, independently selectable group/layer — instead of
// everything flattened, selectable only by matching fill/stroke color (the
// only option with the plain PDF export, since the PDF library in use has
// no support for PDF layers / Optional Content Groups).
export function buildExportSvg(params: BuildSvgParams): string {
  const { wmm, hmm, categories, project, layerStyles, trueWidthMeters, exportOptions } = params;
  const inset = 10;
  const pageScale = Math.min(2.2, Math.max(0.6, Math.sqrt((wmm * hmm) / (210 * 297))));

  const groups: string[] = [];

  CATEGORY_ORDER.forEach(type => {
    const feats = categories[type];
    if (!feats || feats.length === 0) return;
    const style = layerStyles[type];
    const paths: string[] = [];
    feats.forEach(f => {
      if (f.geometry.type === 'LineString') {
        const d = pathFromCoords(f.geometry.coordinates as [number, number][], project, false);
        if (d) paths.push(`<path d="${d}"/>`);
      } else if (f.geometry.type === 'Polygon') {
        const ring = (f.geometry.coordinates as [number, number][][])[0];
        const d = pathFromCoords(ring, project, true);
        if (d) paths.push(`<path d="${d}"/>`);
      }
    });
    if (paths.length === 0) return;
    const [r, g, b] = style.color;
    const dashAttr = style.dash ? ` stroke-dasharray="${style.dash[0]} ${style.dash[1]}"` : '';
    const fillAttr = style.fill ? `fill="rgb(${r},${g},${b})" fill-opacity="${style.fillOpacity}"` : 'fill="none"';
    groups.push(
      `<g id="${type}" data-name="${escapeXml(CATEGORY_LABELS[type])}" stroke="rgb(${r},${g},${b})" stroke-width="${style.lineWidth}" ${fillAttr}${dashAttr} stroke-linejoin="round" stroke-linecap="round">\n` +
      paths.join('\n') + `\n</g>`
    );
  });

  // Trees as their own group of filled circles
  const treeFeats = categories.trees;
  if (treeFeats && treeFeats.length > 0) {
    const style = layerStyles.trees;
    const [r, g, b] = style.color;
    const circles: string[] = [];
    treeFeats.forEach(f => {
      if (f.geometry.type !== 'Point') return;
      const [x, y] = project(f.geometry.coordinates as [number, number]);
      if (isNaN(x) || isNaN(y)) return;
      circles.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${style.pointRadius ?? 0.8}"/>`);
    });
    if (circles.length > 0) {
      groups.push(`<g id="trees" data-name="${escapeXml(CATEGORY_LABELS.trees)}" fill="rgb(${r},${g},${b})" stroke="none">\n${circles.join('\n')}\n</g>`);
    }
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
<rect width="${wmm}" height="${hmm}" fill="#ffffff"/>
${groups.join('\n')}
${scaleBarGroup}
${northArrowGroup}
${titleText}
</svg>`;
}
