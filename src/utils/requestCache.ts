// Small persistent cache for Overpass answers, keyed by the exact query
// (layer + tile bbox). Lets a reload or a retry of the same area skip every
// tile that already loaded. Entries expire after MAX_AGE_MS so the data
// doesn't drift too far from current OSM. Any IndexedDB failure (private
// mode, quota, blocked storage) just behaves like a cache miss.

const DB_NAME = 'qsp-cache';
const STORE = 'overpass';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

interface Entry {
  t: number;
  data: any[];
}

export async function cacheGet(key: string): Promise<any[] | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => {
        const entry = req.result as Entry | undefined;
        resolve(entry && Date.now() - entry.t < MAX_AGE_MS ? entry.data : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function cacheSet(key: string, data: any[]): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ t: Date.now(), data } as Entry, key);
    // Out of space: drop the whole cache rather than fail future writes.
    tx.onerror = () => {
      try { db.transaction(STORE, 'readwrite').objectStore(STORE).clear(); } catch { /* ignore */ }
    };
  } catch {
    /* ignore */
  }
}
