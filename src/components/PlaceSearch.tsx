import React, { useState } from 'react';
import axios from 'axios';
import { useI18n } from '../i18n/I18nContext';

interface PlaceResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface PlaceSearchProps {
  onSelect: (lon: number, lat: number) => void;
}

// Address/place search via OpenStreetMap's Nominatim. Searches only on
// submit (not per keystroke), as Nominatim's usage policy asks.
const PlaceSearch: React.FC<PlaceSearchProps> = ({ onSelect }) => {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setFailed(false);
    try {
      const res = await axios.get<PlaceResult[]>('https://nominatim.openstreetmap.org/search', {
        params: { q, format: 'jsonv2', limit: 5, 'accept-language': lang },
        timeout: 10000,
      });
      const list = Array.isArray(res.data) ? res.data : [];
      // A single hit: go straight there.
      if (list.length === 1) {
        onSelect(Number(list[0].lon), Number(list[0].lat));
        setResults(null);
      } else {
        setResults(list);
      }
    } catch {
      setFailed(true);
      setResults(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="qsp-search" onSubmit={search} role="search">
      <div className="qsp-search__row">
        <input
          className="qsp-input"
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
        />
        <button className="qsp-search__btn" type="submit" disabled={busy}>{busy ? '…' : t('searchButton')}</button>
      </div>
      {failed && <div className="qsp-field__hint qsp-field__hint--warn">{t('searchFailed')}</div>}
      {results && results.length === 0 && <div className="qsp-field__hint">{t('searchNoResults')}</div>}
      {results && results.length > 0 && (
        <ul className="qsp-search__results">
          {results.map(r => (
            <li key={`${r.lat},${r.lon}`}>
              <button
                type="button"
                onClick={() => {
                  onSelect(Number(r.lon), Number(r.lat));
                  setResults(null);
                }}
              >
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
};

export default PlaceSearch;
