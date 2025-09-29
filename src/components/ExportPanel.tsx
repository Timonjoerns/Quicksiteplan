import React from 'react';


interface ExportPanelProps {
  onExport: (options: { scale: number; paperSize: string; orientation: string }) => void;
  exportOptions: { scale: number; paperSize: string; orientation: string };
  onExportOptionsChange: (opts: { scale: number; paperSize: string; orientation: string }) => void;
}

const ExportPanel: React.FC<ExportPanelProps> = ({ onExport, exportOptions, onExportOptionsChange }) => {
  const { scale, paperSize, orientation } = exportOptions;
  return (
    <form
      style={{
        display: 'flex', flexDirection: 'column', gap: 16,
      }}
      onSubmit={e => { e.preventDefault(); onExport({ scale, paperSize, orientation }); }}
    >
      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 2, color: '#222' }}>Export Map</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ fontSize: 14, color: '#333', fontWeight: 500, marginBottom: 2 }}>
          Scale
          <input
            type="number"
            value={scale}
            onChange={e => onExportOptionsChange({ ...exportOptions, scale: Number(e.target.value) })}
            style={{
              width: '100%',
              maxWidth: 140,
              marginTop: 4,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1.5px solid #e0e4ea',
              background: 'rgba(255,255,255,0.7)',
              fontSize: 15,
              fontWeight: 500,
              outline: 'none',
              boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
              transition: 'border 0.2s',
              appearance: 'none',
              WebkitAppearance: 'none',
              MozAppearance: 'none',
            }}
          />
        </label>
        <label style={{ fontSize: 14, color: '#333', fontWeight: 500, marginBottom: 2 }}>
          Paper Size
          <select
            value={paperSize}
            onChange={e => onExportOptionsChange({ ...exportOptions, paperSize: e.target.value })}
            style={{
              width: '100%',
              marginTop: 4,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1.5px solid #e0e4ea',
              background: 'rgba(255,255,255,0.7)',
              fontSize: 15,
              fontWeight: 500,
              outline: 'none',
              appearance: 'none',
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
              transition: 'border 0.2s',
            }}
          >
            <option value="A4">A4</option>
            <option value="A3">A3</option>
            <option value="A2">A2</option>
            <option value="A1">A1</option>
            <option value="A0">A0</option>
          </select>
        </label>
        <label style={{ fontSize: 14, color: '#333', fontWeight: 500, marginBottom: 2 }}>
          Orientation
          <select
            value={orientation}
            onChange={e => onExportOptionsChange({ ...exportOptions, orientation: e.target.value })}
            style={{
              width: '100%',
              marginTop: 4,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1.5px solid #e0e4ea',
              background: 'rgba(255,255,255,0.7)',
              fontSize: 15,
              fontWeight: 500,
              outline: 'none',
              appearance: 'none',
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
              transition: 'border 0.2s',
            }}
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>
      </div>
      <button
        type="submit"
        style={{
          marginTop: 8,
          width: '100%',
          padding: '12px 0',
          borderRadius: 10,
          border: 'none',
          background: 'linear-gradient(90deg, #1976d2 0%, #21a1ff 100%)',
          color: '#fff',
          fontWeight: 700,
          fontSize: 16,
          letterSpacing: '0.03em',
          boxShadow: '0 2px 12px rgba(25,118,210,0.10)',
          cursor: 'pointer',
          transition: 'background 0.2s',
        }}
      >
        Export as PDF
      </button>
    </form>
  );
};

export default ExportPanel;
