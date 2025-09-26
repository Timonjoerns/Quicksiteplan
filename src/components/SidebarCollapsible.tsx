import React, { useState } from 'react';
import DataSelector from './DataSelector';
import ExportPanel from './ExportPanel';

import { OSMFeatureType } from './DataSelector';

interface SidebarCollapsibleProps {
  loading: boolean;
  error: string | null;
  selectedTypes: OSMFeatureType[];
  setSelectedTypes: (types: OSMFeatureType[]) => void;
  exportOptions: any;
  setExportOptions: (opts: any) => void;
  handleExport: (opts: { scale: number; paperSize: string; orientation: string }) => void;
}

const SidebarCollapsible: React.FC<SidebarCollapsibleProps> = ({ loading, error, selectedTypes, setSelectedTypes, exportOptions, setExportOptions, handleExport }) => {
  // Sidebar is always open now
  const [featuresOpen, setFeaturesOpen] = useState(true);
  const [exportOpen, setExportOpen] = useState(true);
  return (
    <div style={{
      position: 'absolute', top: 40, left: 40, width: 320, padding: 32,
      background: 'rgba(255,255,255,0.35)',
      borderRadius: 24,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      backdropFilter: 'blur(18px)',
      WebkitBackdropFilter: 'blur(18px)',
      boxSizing: 'border-box',
      overflowY: 'auto',
      zIndex: 20,
      display: 'flex', flexDirection: 'column', gap: 0,
      transition: 'width 0.3s cubic-bezier(.4,2,.6,1), padding 0.3s cubic-bezier(.4,2,.6,1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
        <h2 style={{ fontWeight: 700, fontSize: 28, margin: 0, letterSpacing: '-1px', color: '#222', textShadow: '0 1px 8px rgba(255,255,255,0.18)', flex: 1, opacity: 1, transition: 'opacity 0.2s' }}>Quick Site Plan</h2>
      </div>
      {/* Features Section */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ fontWeight: 600, fontSize: 15, color: '#222', marginBottom: 8, display: 'block', letterSpacing: '0.01em', cursor: 'pointer' }} onClick={() => setFeaturesOpen(f => !f)}>
          Features
          <span style={{ float: 'right', fontSize: 18, color: '#1976d2', transition: 'transform 0.2s', transform: featuresOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
        </label>
        {featuresOpen && (
          <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', transition: 'max-height 0.3s', overflow: 'hidden' }}>
            <DataSelector selected={selectedTypes} onChange={setSelectedTypes} />
          </div>
        )}
      </div>
      <div style={{ height: 1, background: 'rgba(0,0,0,0.07)', margin: '0 -32px 18px -32px' }} />
      {/* Export Section */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ fontWeight: 600, fontSize: 15, color: '#222', marginBottom: 8, display: 'block', letterSpacing: '0.01em', cursor: 'pointer' }} onClick={() => setExportOpen(e => !e)}>
          Export
          <span style={{ float: 'right', fontSize: 18, color: '#1976d2', transition: 'transform 0.2s', transform: exportOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
        </label>
        {exportOpen && (
          <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)', transition: 'max-height 0.3s', overflow: 'hidden' }}>
            <ExportPanel
              onExport={({ scale, paperSize, orientation }) => handleExport({ scale, paperSize, orientation })}
              exportOptions={exportOptions}
              onExportOptionsChange={setExportOptions}
            />
          </div>
        )}
      </div>
      {loading && <div style={{ color: '#333', fontWeight: 500, marginTop: 12, fontSize: 15, letterSpacing: '0.01em' }}>Loading OSM data...</div>}
      {error && <div style={{ color: '#d32f2f', fontWeight: 500, marginTop: 12, fontSize: 15, letterSpacing: '0.01em' }}>{error}</div>}
    </div>
  );
};

export default SidebarCollapsible;