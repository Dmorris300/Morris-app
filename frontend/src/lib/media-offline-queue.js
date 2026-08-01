// IndexedDB-backed upload queue for Photo Vault. Enables offline capture with
// automatic sync when the browser comes back online.
//
// Records the file blob + metadata + retry state. Drains through a caller-
// supplied uploader (so the queue doesn't need to know about the axios/api
// layer). Exponential back-off is capped at ~5 minutes per item.

const DB_NAME = "morris-media-queue-v1";
const STORE = "queue";
let _dbPromise = null;
const listeners = new Set();
let _draining = false;
let _backedOffUntil = 0;

function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB unavailable")); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

async function tx(mode) {
  const db = await openDb();
  return db.transaction(STORE, mode).objectStore(STORE);
}

function notify() { listeners.forEach((cb) => { try { cb(); } catch { /* noop */ } }); }

export function subscribeQueue(cb) { listeners.add(cb); return () => listeners.delete(cb); }
export function backedOffUntil() { return _backedOffUntil; }

export async function queueSize() {
  try {
    const store = await tx("readonly");
    return await new Promise((res, rej) => {
      const r = store.count(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  } catch { return 0; }
}

export async function addToQueue({ file, meta }) {
  const store = await tx("readwrite");
  const record = {
    file, meta: meta || {},
    createdAt: Date.now(),
    attempts: 0, nextAttemptAt: 0,
  };
  await new Promise((res, rej) => {
    const r = store.add(record); r.onsuccess = () => res(); r.onerror = () => rej(r.error);
  });
  notify();
  return { queued: true };
}

async function listAll() {
  const store = await tx("readonly");
  return new Promise((res, rej) => {
    const r = store.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error);
  });
}

async function remove(id) {
  const store = await tx("readwrite");
  return new Promise((res, rej) => { const r = store.delete(id); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
}

async function update(record) {
  const store = await tx("readwrite");
  return new Promise((res, rej) => { const r = store.put(record); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
}

export async function drainQueue(sendFn) {
  if (_draining) return;
  _draining = true;
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const items = await listAll();
    const now = Date.now();
    for (const item of items) {
      if ((item.nextAttemptAt || 0) > now) continue;
      try {
        await sendFn(item.file, item.meta);
        await remove(item.id);
        notify();
      } catch (err) {
        item.attempts = (item.attempts || 0) + 1;
        // Back-off: 5s, 15s, 45s, 2m, 5m (capped)
        const backoff = Math.min(5 * 60 * 1000, 5000 * Math.pow(3, item.attempts - 1));
        item.nextAttemptAt = Date.now() + backoff;
        _backedOffUntil = item.nextAttemptAt;
        await update(item);
        notify();
        // Stop this pass — retry the whole queue after back-off elapses.
        break;
      }
    }
  } finally {
    _draining = false;
  }
}
