import React from 'react';
import { ExportOptions, PAPER_SIZES } from '../utils/paperSizes';
import { useI18n } from '../i18n/I18nContext';
import { TREES_MAX_SCALE } from '../utils/overpass';

interface ExportPanelProps {
  onExport: (options: ExportOptions) => void;
  onExportSVG: (options: ExportOptions) => void;
  exportOptions: ExportOptions;
  onExportOptionsChange: (opts: ExportOptions) => void;
  bboxAreaKm2: number;
  largeAreaKm2: number;
  hasData: boolean;
}

const ExportPanel: React.FC<ExportPanelProps> = ({ onExport, onExportSVG, exportOptions, onExportOptionsChange, bboxAreaKm2, largeAreaKm2, hasData }) => {
  const { t } = useI18n();
  const { scale, paperSize, orientation } = exportOptions;
  const largeArea = bboxAreaKm2 > largeAreaKm2;
  const isCustom = paperSize === 'Custom';

  return (
    <form onSubmit={e => { e.preventDefault(); if (hasData) onExport(exportOptions); }}>
      <label className="qsp-field">
        <span className="qsp-field__label">{t('scaleLabel', { scale: scale.toLocaleString() })}</span>
        <input
          className="qsp-input"
          type="number"
          min={1}
          step={1}
          value={scale}
          onChange={e => {
            const next = Number(e.target.value);
            onExportOptionsChange({ ...exportOptions, scale: Number.isFinite(next) && next > 0 ? next : 1 });
          }}
        />
      </label>
      <label className="qsp-field">
        <span className="qsp-field__label">{t('paperSizeLabel')}</span>
        <select
          className="qsp-select"
          value={paperSize}
          onChange={e => onExportOptionsChange({ ...exportOptions, paperSize: e.target.value })}
        >
          {Object.keys(PAPER_SIZES).map(key => (
            <option key={key} value={key}>{key}</option>
          ))}
          <option value="Custom">{t('customOption')}</option>
        </select>
      </label>

      {isCustom ? (
        <div className="qsp-field" style={{ display: 'flex', gap: 10 }}>
          <label style={{ flex: 1 }}>
            <span className="qsp-field__label">{t('widthLabel')}</span>
            <input
              className="qsp-input"
              type="number"
              min={10}
              step={1}
              value={exportOptions.customWidthMm ?? 210}
              onChange={e => {
                const next = Number(e.target.value);
                onExportOptionsChange({ ...exportOptions, customWidthMm: Number.isFinite(next) && next > 0 ? next : 10 });
              }}
            />
          </label>
          <label style={{ flex: 1 }}>
            <span className="qsp-field__label">{t('heightLabel')}</span>
            <input
              className="qsp-input"
              type="number"
              min={10}
              step={1}
              value={exportOptions.customHeightMm ?? 297}
              onChange={e => {
                const next = Number(e.target.value);
                onExportOptionsChange({ ...exportOptions, customHeightMm: Number.isFinite(next) && next > 0 ? next : 10 });
              }}
            />
          </label>
        </div>
      ) : (
        <label className="qsp-field">
          <span className="qsp-field__label">{t('orientationLabel')}</span>
          <select
            className="qsp-select"
            value={orientation}
            onChange={e => onExportOptionsChange({ ...exportOptions, orientation: e.target.value as 'portrait' | 'landscape' })}
          >
            <option value="portrait">{t('portrait')}</option>
            <option value="landscape">{t('landscape')}</option>
          </select>
        </label>
      )}

      <div className="qsp-field__hint">
        {t('exportAreaHint', { area: bboxAreaKm2.toFixed(2) })}
      </div>
      {scale > TREES_MAX_SCALE && (
        <div className="qsp-field__hint">{t('treesOmittedHint', { max: TREES_MAX_SCALE.toLocaleString() })}</div>
      )}
      {largeArea && (
        <div className="qsp-field__hint qsp-field__hint--warn">{t('largeAreaWarning')}</div>
      )}
      <div style={{ height: 14 }} />
      {hasData ? (
        <>
          <button className="qsp-btn" type="submit">
            {t('exportButton')}
          </button>
          <button
            className="qsp-btn qsp-btn--secondary"
            type="button"
            style={{ marginTop: 8 }}
            onClick={() => onExportSVG(exportOptions)}
            title={t('exportSvgHint')}
          >
            {t('exportSvgButton')}
          </button>
        </>
      ) : (
        <div className="qsp-field__hint">{t('exportHintNoData')}</div>
      )}
    </form>
  );
};

export default ExportPanel;
