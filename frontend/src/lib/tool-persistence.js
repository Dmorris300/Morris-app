// Morris — tool persistence helper.
// Tools that drive Phase 3 proactive alerts call saveToolData(toolId, rows)
// from their onGenerate handlers so the alert engine has something to read.
// Lives under a single localStorage namespace so it's easy to inspect / wipe.

const NAMESPACE = "morris.tool_data.";

export function saveToolData(toolId, data) {
  if (!toolId) return;
  try {
    localStorage.setItem(NAMESPACE + toolId, JSON.stringify({
      data,
      savedAt: new Date().toISOString(),
    }));
    window.dispatchEvent(new CustomEvent("morris:tool-data-saved", { detail: { toolId } }));
  } catch { /* ignore quota errors */ }
}

export function getToolData(toolId, fallback = null) {
  try {
    const raw = localStorage.getItem(NAMESPACE + toolId);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && "data" in parsed ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export function clearAllToolData() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NAMESPACE)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
