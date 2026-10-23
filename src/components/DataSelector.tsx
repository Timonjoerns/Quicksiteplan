import React from 'react';
import { useI18n } from '../i18n/I18nContext';

export type OSMFeatureType =
  | 'water'
  | 'streets'
  | 'buildings'
  | 'railways'
  | 'trees'
  | 'greenery'
  | 'contours';

interface DataSelectorProps {
  selected: OSMFeatureType[];
  onChange: (selected: OSMFeatureType[]) => void;
}

const DataSelector: React.FC<DataSelectorProps> = ({ selected, onChange }) => {
  const { t } = useI18n();

  const options: { label: string; value: OSMFeatureType }[] = [
    { label: t('layerWater'), value: 'water' },
    { label: t('layerStreets'), value: 'streets' },
    { label: t('layerBuildings'), value: 'buildings' },
    { label: t('layerRailways'), value: 'railways' },
    { label: t('layerTrees'), value: 'trees' },
    { label: t('layerGreenery'), value: 'greenery' },
    { label: t('layerContours'), value: 'contours' },
  ];

  const handleChange = (value: OSMFeatureType) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };
  return (
    <div className="qsp-field-list">
      {options.map((opt) => (
        <label key={opt.value} className="qsp-checkbox-row">
          <input
            type="checkbox"
            checked={selected.includes(opt.value)}
            onChange={() => handleChange(opt.value)}
          />
          <span>{opt.label}</span>
        </label>
      ))}
      <div className="qsp-selector-count">
        {t('layersSelected', { count: selected.length, total: options.length })}
      </div>
    </div>
  );
};

export default DataSelector;
