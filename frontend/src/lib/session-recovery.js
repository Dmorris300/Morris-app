// Session-expiry recovery bridge.
//
// When a 401 forces the API interceptor to redirect a user to /login, the
// tool component unmounts and any unsaved form state dies with it. To make
// re-login non-destructive we let each tool register a `getSnapshot` fn on
// mount; the interceptor calls it immediately before redirect, stashes the
// snapshot in localStorage, and the tool consumes-and-clears the snapshot
// on remount after successful login.
//
// Only one snapshot at a time — a user is only looking at one tool when
// their session drops. Snapshots older than 24h are treated as stale.
//
// Kept intentionally minimal and defensive: every call is wrapped in a
// try/catch so a broken snapshot can never block the 401 redirect or the
// tool's normal mount cycle.

const KEY = "morris_session_recovery_v1";
const TTL_MS = 24 * 60 * 60 * 1000;

let activeSource = null;

// Pages call this in a useEffect on mount. `getSnapshot` must return the
// serialisable state you want restored (matching the shape your restore
// path expects). Returns an unregister fn for the useEffect cleanup.
export function registerRecoverySource(toolId, getSnapshot) {
  activeSource = { toolId, getSnapshot };
  return () => {
    if (activeSource && activeSource.toolId === toolId) activeSource = null;
  };
}

// Called by the api.js response interceptor on 401, before redirecting.
export function snapshotActiveToolBeforeRedirect() {
  try {
    if (!activeSource) return;
    const snap = typeof activeSource.getSnapshot === "function" ? activeSource.getSnapshot() : null;
    if (!snap || typeof snap !== "object") return;
    const path = typeof window !== "undefined" ? window.location.pathname + window.location.search : "";
    const payload = { toolId: activeSource.toolId, path, data: snap, savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch { /* never let recovery logic block the redirect */ }
}

// Pages call this on mount. If a matching snapshot exists, it's returned
// AND cleared so a subsequent refresh doesn't re-hydrate the same payload.
export function consumeRecoverySnapshot(toolId) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (!snap || snap.toolId !== toolId) return null;
    if (Date.now() - (snap.savedAt || 0) > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    localStorage.removeItem(KEY);
    return snap;
  } catch { return null; }
}

// Peek without consuming — used by /login to redirect the user back to the
// tool they were on after a successful sign-in, if desired later. Not wired
// in yet; kept here so we don't need to change the module surface again.
export function peekRecoveryPath() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (!snap) return null;
    if (Date.now() - (snap.savedAt || 0) > TTL_MS) return null;
    return snap.path || null;
  } catch { return null; }
}
