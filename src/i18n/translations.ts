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
  exportHintNoData: string;

  loadingText: string;
  errorAreaTooLarge: string;
  errorFetchFailed: string;

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

    exportAreaHint: 'Export area: {area} km² (max {max} km²)',
    exportButton: 'Export as PDF',
    exportHintNoData: 'Fetch OSM data first to enable export.',

    loadingText: 'Loading OSM data…',
    errorAreaTooLarge: 'Export area is too large (max {max} km²). Zoom in or reduce the scale.',
    errorFetchFailed: 'Failed to fetch OSM data. The server may be busy or rate-limiting — try again shortly.',

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

    exportAreaHint: 'Exportfläche: {area} km² (max. {max} km²)',
    exportButton: 'Als PDF exportieren',
    exportHintNoData: 'Zuerst OSM-Daten abrufen, um den Export freizuschalten.',

    loadingText: 'OSM-Daten werden geladen…',
    errorAreaTooLarge: 'Exportfläche zu groß (max. {max} km²). Zoomen Sie hinein oder verringern Sie den Maßstab.',
    errorFetchFailed: 'OSM-Daten konnten nicht geladen werden. Der Server ist evtl. ausgelastet — versuchen Sie es gleich erneut.',

    step1: 'Rahmen oder Eckpunkte ziehen, um die Exportfläche zu positionieren und zu skalieren — er rastet an DIN-Formaten ein.',
    step2: 'Gewünschte OSM-Ebenen wählen und die Daten in der Seitenleiste abrufen.',
    step3: 'Maßstab, Papierformat und Ausrichtung festlegen — oder ein eigenes Format wählen.',
    step4: 'Sobald die Daten geladen sind, den Lageplan als PDF exportieren.',
  },
};

export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? String(vars[key]) : `{${key}}`));
}
