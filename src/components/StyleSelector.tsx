import React from 'react';

interface StyleSelectorProps {
  styles: { name: string; url: string }[];
  selected: string;
  onChange: (url: string) => void;
  onUpload: (file: File) => void;
}

const StyleSelector: React.FC<StyleSelectorProps> = ({ styles, selected, onChange, onUpload }) => {
  return (
    <div>
      <h3>Map Style</h3>
      <select value={selected} onChange={e => onChange(e.target.value)}>
        {styles.map(style => (
          <option key={style.url} value={style.url}>{style.name}</option>
        ))}
      </select>
      <input type="file" accept="application/json" onChange={e => {
        if (e.target.files && e.target.files[0]) onUpload(e.target.files[0]);
      }} />
    </div>
  );
};

export default StyleSelector;
