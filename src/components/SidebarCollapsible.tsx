import React, { useState } from 'react';
import DataSelector from './DataSelector';
import ExportPanel from './ExportPanel';
import LoadingParticles from './LoadingParticles';
import { DownloadIcon } from './Icons';
import { ExportOptions } from '../utils/paperSizes';
import { useI18n } from '../i18n/I18nContext';

import { OSMFeatureType } from './DataSelector';

interface SidebarCollapsibleProps {
  loading: boolean;
  loadingProgress: { done: number; total: number } | null;
  error: string | null;
  hasData: boolean;
  bboxAreaKm2: number;
  maxBboxAreaKm2: number;
  selectedTypes: OSMFeatureType[];
  setSelectedTypes: (types: OSMFeatureType[]) => void;
  exportOptions: ExportOptions;
  setExportOptions: (opts: ExportOptions) => void;
  handleExport: (opts: ExportOptions) => void;
  onFetch: () => void;
}

const SidebarCollapsible: React.FC<SidebarCollapsibleProps> = ({
  loading, loadingProgress, error, hasData, bboxAreaKm2, maxBboxAreaKm2, selectedTypes, setSelectedTypes, exportOptions, setExportOptions, handleExport, onFetch,
}) => {
  const { t, lang, setLang } = useI18n();
  const [featuresOpen, setFeaturesOpen] = useState(true);
  const [exportOpen, setExportOpen] = useState(true);
  const [stepsOpen, setStepsOpen] = useState(false);

  return (
    <div className="qsp-sidebar">
      <div className="qsp-sidebar__header">
        <div className="qsp-sidebar__header-row">
          <h1 className="qsp-brand">Quicksiteplan<sup>.pdf</sup></h1>
          <div className="qsp-lang-switch" role="group" aria-label={t('languageLabel')}>
            <button type="button" className={`qsp-lang-btn${lang === 'en' ? ' qsp-lang-btn--active' : ''}`} onClick={() => setLang('en')}>EN</button>
            <button type="button" className={`qsp-lang-btn${lang === 'de' ? ' qsp-lang-btn--active' : ''}`} onClick={() => setLang('de')}>DE</button>
          </div>
        </div>
        <p className="qsp-tagline">{t('tagline')}</p>
      </div>

      <div className="qsp-section">
        <button type="button" className="qsp-section__head" onClick={() => setFeaturesOpen(f => !f)} aria-expanded={featuresOpen}>
          <span className="qsp-section__title">{t('featuresTitle')}</span>
          <span className={`qsp-section__chevron${featuresOpen ? ' qsp-section__chevron--open' : ''}`}>&#9656;</span>
        </button>
        {featuresOpen && (
          <div className="qsp-section__body">
            <DataSelector selected={selectedTypes} onChange={setSelectedTypes} />
            <button type="button" className="qsp-btn" style={{ marginTop: 14 }} onClick={onFetch} disabled={loading}>
              <DownloadIcon size={16} />
              {loading ? t('fetchButtonLoading') : t('fetchButton')}
            </button>
            {loading && (
              <LoadingParticles
                label={loadingProgress ? t('loadingTextProgress', { done: loadingProgress.done, total: loadingProgress.total }) : t('loadingText')}
              />
            )}
            {!loading && error && <div className="qsp-status qsp-status--error" style={{ margin: '14px 0 0' }}>{error}</div>}
          </div>
        )}
      </div>

      <div className="qsp-section">
        <button type="button" className="qsp-section__head" onClick={() => setExportOpen(e => !e)} aria-expanded={exportOpen}>
          <span className="qsp-section__title">{t('exportTitle')}</span>
          <span className={`qsp-section__chevron${exportOpen ? ' qsp-section__chevron--open' : ''}`}>&#9656;</span>
        </button>
        {exportOpen && (
          <div className="qsp-section__body">
            <ExportPanel
              onExport={handleExport}
              exportOptions={exportOptions}
              onExportOptionsChange={setExportOptions}
              bboxAreaKm2={bboxAreaKm2}
              maxBboxAreaKm2={maxBboxAreaKm2}
              hasData={hasData}
            />
          </div>
        )}
      </div>

      <div className="qsp-section">
        <button type="button" className="qsp-section__head" onClick={() => setStepsOpen(s => !s)} aria-expanded={stepsOpen}>
          <span className="qsp-section__title">{t('howItWorksTitle')}</span>
          <span className={`qsp-section__chevron${stepsOpen ? ' qsp-section__chevron--open' : ''}`}>&#9656;</span>
        </button>
        {stepsOpen && (
          <div className="qsp-section__body qsp-steps-body">
            <ol>
              <li><span className="qsp-step-num">1</span> {t('step1')}</li>
              <li><span className="qsp-step-num">2</span> {t('step2')}</li>
              <li><span className="qsp-step-num">3</span> {t('step3')}</li>
              <li><span className="qsp-step-num">4</span> {t('step4')}</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
};

export default SidebarCollapsible;
