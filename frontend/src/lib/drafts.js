// Drafts API client + helpers. Drafts persist mid-form state per-user, per-tool.
// Each tool decides what to serialise into `data` — Generic tools save the
// values object + AI result; dedicated tools save their bespoke state shape.
import api from "./api";

export async function listDrafts() {
  const r = await api.get("/drafts");
  return r.data;
}

export async function fetchDraft(draftId) {
  const r = await api.get(`/drafts/${draftId}`);
  return r.data;
}

export async function saveDraft({ toolId, toolName, title, data, draftId }) {
  const r = await api.post("/drafts", { toolId, toolName, title, data, draftId });
  return r.data; // returns the saved doc (with id)
}

export async function deleteDraft(draftId) {
  await api.delete(`/drafts/${draftId}`);
}

// Best-effort title from the first meaningful string in the data payload.
// Used when the user hasn't named the draft explicitly. Long values are
// truncated so the Drafts list reads cleanly.
export function deriveDraftTitle(toolName, data) {
  const candidates = [
    data?.values?.site, data?.values?.project, data?.values?.jobReference,
    data?.values?.task, data?.values?.client, data?.values?.clientName,
    data?.values?.contractor, data?.values?.subject, data?.values?.title,
    data?.site, data?.project, data?.jobReference, data?.task, data?.client,
    data?.clientName, data?.formData?.task, data?.formData?.site,
    data?.formData?.client, data?.formData?.project,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      const s = c.trim();
      return `${toolName} · ${s.slice(0, 60)}${s.length > 60 ? "…" : ""}`;
    }
  }
  const stamp = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return `${toolName} · ${stamp}`;
}

// Returns the draft id from the current URL query if the user opened this tool
// via "Resume draft" from the Drafts list. Tools call this on mount.
export function draftIdFromQuery() {
  try {
    const sp = new URLSearchParams(window.location.search);
    return sp.get("draft") || null;
  } catch { return null; }
}

// Strip the draft query param after the form has been hydrated so a refresh
// doesn't double-hydrate. Uses replaceState to avoid adding history entries.
export function clearDraftQueryParam() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has("draft")) {
      url.searchParams.delete("draft");
      window.history.replaceState({}, "", url.toString());
    }
  } catch { /* ignore */ }
}
