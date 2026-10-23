import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/I18nContext';

// Operator details for the Impressum and the privacy policy.
export const LEGAL_CONTACT = {
  name: 'Timon Jörns',
  street: 'Herrenhäuser Straße 8',
  city: '30419 Hannover',
  country: 'Deutschland',
  email: 'timon@joerns.info',
  // competent data protection authority for the operator's federal state
  authority: 'Die Landesbeauftragte für den Datenschutz Niedersachsen, Prinzenstraße 5, 30159 Hannover',
  updated: 'Oktober 2026',
};

export type LegalPage = 'imprint' | 'privacy';

const Address: React.FC = () => (
  <p>
    {LEGAL_CONTACT.name}<br />
    {LEGAL_CONTACT.street}<br />
    {LEGAL_CONTACT.city}<br />
    {LEGAL_CONTACT.country}
  </p>
);

// German legal texts: German law requires them, and they're the binding
// version for both UI languages.
const Imprint: React.FC = () => (
  <>
    <h3>Angaben gemäß § 5 DDG</h3>
    <Address />
    <h3>Kontakt</h3>
    <p>E-Mail: {LEGAL_CONTACT.email}</p>
    <h3>Verantwortlich für den Inhalt</h3>
    <p>{LEGAL_CONTACT.name}, Anschrift wie oben.</p>
    <h3>Haftung für Inhalte und Daten</h3>
    <p>
      Quicksiteplan ist ein kostenloses Werkzeug. Die erzeugten Pläne beruhen auf OpenStreetMap-Daten
      und frei verfügbaren Höhendaten. Sie sind keine amtlichen Vermessungsunterlagen; für Richtigkeit,
      Vollständigkeit und Aktualität wird keine Gewähr übernommen. Für Bauanträge ist in der Regel ein
      amtlicher Lageplan einer Vermessungsstelle erforderlich.
    </p>
    <h3>Datenquellen</h3>
    <p>
      Kartendaten © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap-Mitwirkende</a>,
      lizenziert unter der Open Database License (ODbL). Hintergrundkarte © <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>.
      Höhendaten: AWS Terrain Tiles; enthält veränderte Copernicus-Daten (EU-DEM) und NASA-SRTM-Daten.
    </p>
  </>
);

const Privacy: React.FC = () => (
  <>
    <h3>1. Verantwortlicher</h3>
    <Address />
    <p>E-Mail: {LEGAL_CONTACT.email}</p>

    <h3>2. Überblick</h3>
    <p>
      Diese Website setzt keine Cookies, verwendet keine Analyse- oder Tracking-Dienste und erfordert keine
      Registrierung. Personenbezogene Daten fallen nur an, soweit Ihr Browser zur Darstellung der Seite und
      für die von Ihnen ausgelösten Funktionen Verbindungen zu den unten genannten Diensten aufbaut. Dabei
      wird technisch bedingt Ihre IP-Adresse übermittelt.
    </p>

    <h3>3. Hosting</h3>
    <p>
      Die Website wird über GitHub Pages bereitgestellt (GitHub, Inc., 88 Colin P. Kelly Jr. Street,
      San Francisco, CA 94107, USA). Beim Aufruf verarbeitet GitHub Server-Logdaten (u. a. IP-Adresse,
      Zeitpunkt, abgerufene Datei, Browser-Kennung), um die Seite auszuliefern und die Sicherheit zu
      gewährleisten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einer
      sicheren und zuverlässigen Bereitstellung). GitHub ist unter dem EU-US Data Privacy Framework
      zertifiziert. Weitere Informationen: <a href="https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noreferrer">GitHub-Datenschutzerklärung</a>.
    </p>

    <h3>4. Kartendarstellung (CARTO)</h3>
    <p>
      Die Hintergrundkarte wird von CARTO (CartoDB Inc., USA) geladen. Dabei werden Ihre IP-Adresse und der
      angezeigte Kartenausschnitt an CARTO übermittelt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO
      (berechtigtes Interesse an einer funktionsfähigen Kartendarstellung).
      Informationen: <a href="https://carto.com/privacy" target="_blank" rel="noreferrer">CARTO-Datenschutz</a>.
    </p>

    <h3>5. Abruf von OpenStreetMap-Daten (Overpass API)</h3>
    <p>
      Wenn Sie „Daten abrufen“ wählen, fragt Ihr Browser die Geodaten des gewählten Ausschnitts bei
      öffentlichen Overpass-API-Servern ab: overpass.openstreetmap.fr (OpenStreetMap France, Frankreich),
      overpass-api.de (FOSSGIS e. V., Deutschland) und overpass.kumi.systems (Kumi Systems). Übermittelt
      werden Ihre IP-Adresse und die Koordinaten des Ausschnitts. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b
      bzw. f DSGVO (Bereitstellung der von Ihnen angeforderten Funktion).
    </p>

    <h3>6. Ortssuche (Nominatim)</h3>
    <p>
      Bei einer Adress- oder Ortssuche werden Ihr Suchbegriff und Ihre IP-Adresse an den Nominatim-Dienst
      der OpenStreetMap Foundation (St John’s Innovation Centre, Cowley Road, Cambridge, CB4 0WS,
      Vereinigtes Königreich) übermittelt. Für das Vereinigte Königreich besteht ein
      Angemessenheitsbeschluss der EU-Kommission. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b bzw. f DSGVO.
      Informationen: <a href="https://osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noreferrer">OSMF-Datenschutz</a>.
    </p>

    <h3>7. Höhendaten (Amazon Web Services)</h3>
    <p>
      Wenn Sie Höhenlinien abrufen, lädt Ihr Browser Höhendaten-Kacheln aus dem Dienst „AWS Terrain Tiles“
      (Amazon Web Services, Inc., USA). Dabei wird Ihre IP-Adresse übermittelt. Amazon ist unter dem
      EU-US Data Privacy Framework zertifiziert. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b bzw. f DSGVO.
    </p>

    <h3>8. Speicherung in Ihrem Browser</h3>
    <p>
      Ihre zuletzt verwendeten Einstellungen (Ausschnitt, Maßstab, Format, Stil, Ebenen) werden im
      localStorage Ihres Browsers gespeichert, abgerufene Kartendaten bis zu 7 Tage in der IndexedDB, damit
      sie nicht erneut geladen werden müssen. Diese Daten verbleiben auf Ihrem Gerät und werden nicht an uns
      übermittelt. Die Speicherung ist für die von Ihnen genutzten Funktionen erforderlich
      (§ 25 Abs. 2 Nr. 2 TDDDG). Sie können sie jederzeit über die Einstellungen Ihres Browsers löschen.
    </p>

    <h3>9. Schriftarten</h3>
    <p>Die verwendete Schriftart ist lokal eingebunden; es wird keine Verbindung zu Google-Servern aufgebaut.</p>

    <h3>10. Ihre Rechte</h3>
    <p>
      Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17),
      Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen
      Verarbeitungen auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO (Art. 21). Zudem können Sie sich bei einer
      Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO), etwa bei: {LEGAL_CONTACT.authority}.
    </p>

    <p className="qsp-legal__updated">Stand: {LEGAL_CONTACT.updated}</p>
  </>
);

interface LegalModalProps {
  page: LegalPage;
  onClose: () => void;
}

const LegalModal: React.FC<LegalModalProps> = ({ page, onClose }) => {
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Portal to <body>: rendered inside the sidebar, the dialog would be
  // trapped in its stacking context, under the map toolbar.
  return createPortal(
    <div className="qsp-legal" role="dialog" aria-modal="true" aria-label={t(page === 'imprint' ? 'imprintTitle' : 'privacyTitle')} onClick={onClose}>
      <div className="qsp-legal__panel" onClick={e => e.stopPropagation()}>
        <div className="qsp-legal__head">
          <h2>{t(page === 'imprint' ? 'imprintTitle' : 'privacyTitle')}</h2>
          <button type="button" className="qsp-legal__close" onClick={onClose} aria-label={t('closeLabel')}>×</button>
        </div>
        <div className="qsp-legal__body">
          {page === 'imprint' ? <Imprint /> : <Privacy />}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default LegalModal;
