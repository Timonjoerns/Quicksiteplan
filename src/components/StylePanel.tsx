import React from 'react';
import { OSMFeatureType } from './DataSelector';
import { PresetKey, StyleMap, LayerStyle, STYLE_PRESET_KEYS, SVG_ONLY_PRESETS } from '../utils/exportStyles';
import { LAYER_LABEL_KEYS } from '../utils/layerLabels';
import { useI18n } from '../i18n/I18nContext';

interface StylePanelProps {
  selectedTypes: OSMFeatureType[];
  preset: PresetKey;
  onPresetChange: (preset: PresetKey) => void;
  layerStyles: StyleMap;
  onLayerStyleChange: (type: OSMFeatureType, patch: Partial<LayerStyle>) => void;
}

const PRESET_LABEL_KEYS: Record<PresetKey, 'presetDefault' | 'presetBlueprint' | 'presetGrayscale' | 'presetBold' | 'presetSketch' | 'presetAerial'> = {
  default: 'presetDefault',
  blueprint: 'presetBlueprint',
  grayscale: 'presetGrayscale',
  bold: 'presetBold',
  sketch: 'presetSketch',
  aerial: 'presetAerial',
};

function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

const StylePanel: React.FC<StylePanelProps> = ({ selectedTypes, preset, onPresetChange, layerStyles, onLayerStyleChange }) => {
  const { t } = useI18n();

  return (
    <div>
      <label className="qsp-field">
        <span className="qsp-field__label">{t('stylePresetLabel')}</span>
        <select
          className="qsp-select"
          value={preset}
          onChange={e => onPresetChange(e.target.value as PresetKey)}
        >
          {STYLE_PRESET_KEYS.map(key => (
            <option key={key} value={key}>{t(PRESET_LABEL_KEYS[key])}</option>
          ))}
        </select>
        {SVG_ONLY_PRESETS.includes(preset) && (
          <div className="qsp-field__hint">{t('presetSvgOnlyHint')}</div>
        )}
      </label>

      <div className="qsp-style-rows">
        {selectedTypes.map(type => {
          const style = layerStyles[type];
          return (
            <div className="qsp-style-row" key={type}>
              <span className="qsp-style-row__label">{t(LAYER_LABEL_KEYS[type])}</span>
              <input
                className="qsp-style-row__swatch"
                type="color"
                value={rgbToHex(style.color)}
                onChange={e => onLayerStyleChange(type, { color: hexToRgb(e.target.value) })}
                title={t('colorLabel')}
              />
              <input
                className="qsp-style-row__width"
                type="number"
                min={0.1}
                max={5}
                step={0.1}
                value={style.lineWidth}
                onChange={e => {
                  const next = Number(e.target.value);
                  onLayerStyleChange(type, { lineWidth: Number.isFinite(next) && next > 0 ? next : 0.1 });
                }}
                title={t('lineWidthLabel')}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StylePanel;
