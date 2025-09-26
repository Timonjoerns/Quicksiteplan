import React from 'react';

export type OSMFeatureType =
  | 'water'
  | 'streets'
  | 'buildings'
  | 'railways';

interface DataSelectorProps {
  selected: OSMFeatureType[];
  onChange: (selected: OSMFeatureType[]) => void;
}

const options: { label: string; value: OSMFeatureType }[] = [
  { label: 'Water Bodies', value: 'water' },
  { label: 'Streets', value: 'streets' },
  { label: 'Buildings', value: 'buildings' },
  { label: 'Railways', value: 'railways' },
];

const DataSelector: React.FC<DataSelectorProps> = ({ selected, onChange }) => {
  const handleChange = (value: OSMFeatureType) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };
  return (
    <div>
      <h3>Select OSM Data Types</h3>
      {options.map((opt) => (
        <label key={opt.value} style={{ display: 'block' }}>
          <input
            type="checkbox"
            checked={selected.includes(opt.value)}
            onChange={() => handleChange(opt.value)}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
};

export default DataSelector;
