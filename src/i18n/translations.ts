export type Lang = 'en' | 'de';

export interface Dictionary {
  tagline: string;
  featuresTitle: string;
  exportTitle: string;
  howItWorksTitle: string;
  languageLabel: string;

  layerWater: string;
  layerStreets: string;
  layerBuildings: string;
  layerRailways: string;
  layerTrees: string;
  layerGreenery: string;
  layersSelected: string;

  fetchButton: string;
  fetchButtonLoading: string;
  centerHereButton: string;

  scaleLabel: string;
  paperSizeLabel: string;
  orientationLabel: string;
  portrait: string;
  landscape: string;
  customOption: string;
  widthLabel: string;
  heightLabel: string;

  exportAreaHint: string;
  exportButton: string;
  exportSvgButton: string;
  exportSvgHint: string;
  exportHintNoData: string;

  styleTitle: string;
  stylePresetLabel: string;
  presetDefault: string;
  presetBlueprint: string;
  presetGrayscale: string;
  presetBold: string;
  presetSketch: string;
  presetAerial: string;
  presetVibrant: string;
  presetSvgOnlyHint: string;
  colorLabel: string;
  lineWidthLabel: string;

  loadingText: string;
  loadingTextProgress: string;
  largeAreaWarning: string;
  errorFetchFailed: string;
  errorPartialFetch: string;
  errorExportFailed: string;

  step1: string;
  step2: string;
  step3: string;
  step4: string;
}

export const dictionaries: Record<Lang, Dictionary> = {
  en: {
    tagline: 'OSM data → scaled site plan',
    featuresTitle: 'Features',
    exportTitle: 'Export',
    howItWorksTitle: 'How it works',
    languageLabel: 'Language',

    layerWater: 'Water Bodies',
    layerStreets: 'Streets',
    layerBuildings: 'Buildings',
    layerRailways: 'Railways',
    layerTrees: 'Trees (Points)',
    layerGreenery: 'Green Areas',
    layersSelected: '{count} / {total} layers selected',

    fetchButton: 'Fetch Data',
    fetchButtonLoading: 'Fetching…',
    centerHereButton: 'Center Here',

    scaleLabel: 'Scale (1:{scale})',
    paperSizeLabel: 'Paper Size',
    orientationLabel: 'Orientation',
    portrait: 'Portrait',
    landscape: 'Landscape',
    customOption: 'Custom',
    widthLabel: 'Width (mm)',
    heightLabel: 'Height (mm)',

    exportAreaHint: 'Export area: {area} km²',
    exportButton: 'Export as PDF',
    exportSvgButton: 'Export as SVG',
    exportSvgHint: 'Each layer (water, streets, buildings, ...) as a separate named group — ideal for Illustrator/Inkscape.',
    exportHintNoData: 'Fetch OSM data first to enable export.',

    styleTitle: 'Style',
    stylePresetLabel: 'Preset',
    presetDefault: 'Default',
    presetBlueprint: 'Blueprint (mono)',
    presetGrayscale: 'Grayscale',
    presetBold: 'Bold',
    presetSketch: 'Sketch (architectural)',
    presetAerial: 'Aerial (stippled)',
    presetVibrant: 'Vibrant',
    presetSvgOnlyHint: 'Shadows, textures, canopies, background and double-line streets appear in the SVG export only — the PDF uses a flat version.',
    colorLabel: 'Color',
    lineWidthLabel: 'Line width (mm)',

    loadingText: 'Loading OSM data…',
    loadingTextProgress: 'Loading data… {done}/{total} requests',
    largeAreaWarning: 'Large area: loading can take several minutes and exported files get big.',
    errorFetchFailed: 'Failed to fetch OSM data. The server may be busy or rate-limiting — try again shortly.',
    errorPartialFetch: 'Loaded, but these layers failed: {layers}. Try fetching again.',
    errorExportFailed: 'PDF export failed. Try again, or fetch the data again first.',

    step1: "Drag the dashed frame, or its corners, to position and size your export area — it snaps to DIN paper formats.",
    step2: 'Pick the OSM layers you want and fetch the data in the sidebar.',
    step3: 'Set scale, paper size and orientation — or choose Custom for your own size.',
    step4: 'Once data has loaded, export your site plan as a PDF.',
  },
  de: {
    tagline: 'OSM-Daten → maßstäblicher Lageplan',
    featuresTitle: 'Datenebenen',
    exportTitle: 'Export',
    howItWorksTitle: "So funktioniert's",
    languageLabel: 'Sprache',

    layerWater: 'Gewässer',
    layerStreets: 'Straßen',
    layerBuildings: 'Gebäude',
    layerRailways: 'Bahnlinien',
    layerTrees: 'Bäume (Punkte)',
    layerGreenery: 'Grünflächen',
    layersSelected: '{count} / {total} Ebenen ausgewählt',

    fetchButton: 'Daten abrufen',
    fetchButtonLoading: 'Lädt…',
    centerHereButton: 'Hier zentrieren',

    scaleLabel: 'Maßstab (1:{scale})',
    paperSizeLabel: 'Papierformat',
    orientationLabel: 'Ausrichtung',
    portrait: 'Hochformat',
    landscape: 'Querformat',
    customOption: 'Benutzerdefiniert',
    widthLabel: 'Breite (mm)',
    heightLabel: 'Höhe (mm)',

    exportAreaHint: 'Exportfläche: {area} km²',
    exportButton: 'Als PDF exportieren',
    exportSvgButton: 'Als SVG exportieren',
    exportSvgHint: 'Jede Ebene (Gewässer, Straßen, Gebäude, ...) als eigene benannte Gruppe — ideal für Illustrator/Inkscape.',
    exportHintNoData: 'Zuerst OSM-Daten abrufen, um den Export freizuschalten.',

    styleTitle: 'Stil',
    stylePresetLabel: 'Voreinstellung',
    presetDefault: 'Standard',
    presetBlueprint: 'Blaupause (mono)',
    presetGrayscale: 'Graustufen',
    presetBold: 'Kräftig',
    presetSketch: 'Skizze (Architektur)',
    presetAerial: 'Luftbild (gepunktet)',
    presetVibrant: 'Farbenfroh',
    presetSvgOnlyHint: 'Schatten, Texturen, Baumkronen, Hintergrund und doppelte Straßenlinien gibt es nur im SVG-Export — das PDF zeigt eine flache Version.',
    colorLabel: 'Farbe',
    lineWidthLabel: 'Linienstärke (mm)',

    loadingText: 'OSM-Daten werden geladen…',
    loadingTextProgress: 'Daten werden geladen… {done}/{total} Abfragen',
    largeAreaWarning: 'Große Fläche: Das Laden kann mehrere Minuten dauern, Exportdateien werden groß.',
    errorFetchFailed: 'OSM-Daten konnten nicht geladen werden. Der Server ist evtl. ausgelastet — versuchen Sie es gleich erneut.',
    errorPartialFetch: 'Geladen, aber diese Ebenen sind fehlgeschlagen: {layers}. Bitte erneut abrufen.',
    errorExportFailed: 'PDF-Export fehlgeschlagen. Erneut versuchen oder die Daten zuerst neu abrufen.',

    step1: 'Rahmen oder Eckpunkte ziehen, um die Exportfläche zu positionieren und zu skalieren — er rastet an DIN-Formaten ein.',
    step2: 'Gewünschte OSM-Ebenen wählen und die Daten in der Seitenleiste abrufen.',
    step3: 'Maßstab, Papierformat und Ausrichtung festlegen — oder ein eigenes Format wählen.',
    step4: 'Sobald die Daten geladen sind, den Lageplan als PDF exportieren.',
  },
};

export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? String(vars[key]) : `{${key}}`));
}
