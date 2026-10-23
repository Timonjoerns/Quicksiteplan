import { OSMFeatureType } from '../components/DataSelector';
import { Dictionary } from '../i18n/translations';

export const LAYER_LABEL_KEYS: Record<OSMFeatureType, keyof Dictionary> = {
  water: 'layerWater',
  streets: 'layerStreets',
  buildings: 'layerBuildings',
  railways: 'layerRailways',
  trees: 'layerTrees',
  greenery: 'layerGreenery',
};
