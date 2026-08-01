// Morris Photo Vault — frontend client for the media library.
//
// Everything server-scoped goes through the backend (`/api/media/*`).
// Offline handling: uploads fall through to `queueUpload` which stores them in
// IndexedDB and flushes when the browser regains connectivity.

import api, { API } from "./api";
import { addToQueue, drainQueue, subscribeQueue, queueSize, backedOffUntil } from "./media-offline-queue";

// --- category / doc-type constants (kept in sync with backend/photo_vault.py) ---
export const MEDIA_CATEGORIES = [
  "Before Works", "Completed Works", "Damage", "Defects", "Deliveries",
  "Health & Safety", "Materials", "Progress", "Snagging", "Variations", "Other",
];

// Human-friendly labels for the tools that can attach media. Keyed by toolId so
// the "Referenced by" pill on a media item and the AttachMedia origin tag stay
// in sync everywhere.
export const MEDIA_SUPPORTED_TOOLS = [
  { id: "rams",                    label: "RAMS" },
  { id: "coshh",                   label: "COSHH Assessment" },
  { id: "toolbox-talk",            label: "Toolbox Talk" },
  { id: "site-access-permit",      label: "Site Instruction" },
  { id: "incident-report",         label: "Incident Report" },
  { id: "quote-builder",           label: "Quote" },
  { id: "variation-letter",        label: "Variation Order" },
  { id: "application-for-payment", label: "Application for Payment" },
  { id: "cis-invoice",             label: "Invoice" },
  { id: "payment-chaser",          label: "Payment Chase" },
  { id: "commercial-report",       label: "Commercial Report" },
  { id: "contract-review",         label: "Contract Review" },
  { id: "eot-claim",               label: "Extension of Time" },
  { id: "site-diary",              label: "Site Diary" },
  { id: "multiuser-site-diary",    label: "Site Diary" },
  { id: "progress-report",         label: "Progress Report" },
  { id: "snagging-list",           label: "Snagging List" },
  { id: "defects-tracker",         label: "Defect Report" },
];

export const isMediaSupportedTool = (toolId) => MEDIA_SUPPORTED_TOOLS.some((t) => t.id === toolId);

// --- token helpers (image src cannot send auth headers, so we append ?auth=) ---
export function fileSrc(media, variant = "original") {
  const token = localStorage.getItem("morris_token") || "";
  return `${API}/media/${media.id}/file?variant=${variant}&auth=${encodeURIComponent(token)}`;
}

// Thumbnails fall back to the original if no dedicated thumb was uploaded.
export function thumbSrc(media) {
  if (media.thumbPath) return fileSrc(media, "thumb");
  if (media.kind === "video" && media.posterPath) return fileSrc(media, "poster");
  return fileSrc(media, "original");
}

// --- API surface ---
export const listMedia = (params = {}) => api.get("/media", { params }).then((r) => r.data);
export const getMedia = (id) => api.get(`/media/${id}`).then((r) => r.data);
export const updateMedia = (id, patch) => api.patch(`/media/${id}`, patch).then((r) => r.data);
export const stats = () => api.get("/media/stats").then((r) => r.data);
export const addUsage = (id, { docId, docType, docTitle }) =>
  api.post(`/media/${id}/usage`, { docId, docType, docTitle }).then((r) => r.data);
export const removeUsage = (id, docId) => api.delete(`/media/${id}/usage/${docId}`).then((r) => r.data);
export const deleteMedia = (id, { force = false } = {}) =>
  api.delete(`/media/${id}${force ? "?force=true" : ""}`).then((r) => r.data);

// Convert Vault media items into the shape the PDF library's photo evidence
// annex expects: [{ dataUrl, note, ukDate, time, location }]. For images we
// fetch the full-size original; for videos we use the poster (or thumb) so
// the PDF still gets a still frame + a "(Video)" note.
export async function mediaListToPdfPhotos(list) {
  if (!list || list.length === 0) return [];
  const token = localStorage.getItem("morris_token") || "";
  const out = [];
  for (const m of list) {
    try {
      const variant = m.kind === "video" ? (m.posterPath ? "poster" : "thumb") : "original";
      const url = `${API}/media/${m.id}/file?variant=${variant}&auth=${encodeURIComponent(token)}`;
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const blob = await resp.blob();
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result); r.onerror = rej;
        r.readAsDataURL(blob);
      });
      const parts = [];
      if (m.description) parts.push(m.description);
      if (m.category) parts.push(m.category);
      if (m.notes) parts.push(m.notes);
      const note = parts.filter(Boolean).join(" — ") + (m.kind === "video" ? " (Video still)" : "");
      out.push({
        dataUrl,
        note: note || m.originalFilename || "",
        ukDate: m.dateTaken ? new Date(m.dateTaken).toLocaleDateString("en-GB") : "",
        time: "",
        location: m.site || "",
      });
    } catch { /* skip broken items — PDF still renders the rest */ }
  }
  return out;
}

// --- upload plumbing ---
// Compress arbitrary image → JPEG blob capped at maxW/quality. Also returns a
// 400px square thumbnail. Videos are uploaded as-is (poster generated separately).
export async function processImage(file, maxW = 1920, quality = 0.85) {
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject; r.onload = () => resolve(r.result);
    r.readAsDataURL(file);
  });
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxW / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d").drawImage(img, 0, 0, w, h);
  const mainBlob = await new Promise((res) => c.toBlob(res, "image/jpeg", quality));

  // Thumbnail — 400px square, cropped centre.
  const tc = document.createElement("canvas");
  tc.width = 400; tc.height = 400;
  const s = Math.min(img.width, img.height);
  const sx = (img.width - s) / 2;
  const sy = (img.height - s) / 2;
  tc.getContext("2d").drawImage(img, sx, sy, s, s, 0, 0, 400, 400);
  const thumbBlob = await new Promise((res) => tc.toBlob(res, "image/jpeg", 0.7));

  return { main: mainBlob, thumb: thumbBlob };
}

// Extract a poster (first-frame) from a video File. Best-effort; returns null on failure.
export async function extractVideoPoster(file) {
  try {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true; video.playsInline = true; video.src = url;
    await new Promise((res, rej) => {
      video.onloadeddata = res; video.onerror = rej;
      setTimeout(rej, 8000);
    });
    // Nudge to a frame past 0 so we don't get a black poster on some codecs.
    try { video.currentTime = Math.min(1, (video.duration || 1) / 2); } catch { /* ignore */ }
    await new Promise((res) => { video.onseeked = res; setTimeout(res, 800); });
    const c = document.createElement("canvas");
    const w = 720, h = Math.round((video.videoHeight / video.videoWidth) * 720) || 480;
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(video, 0, 0, w, h);
    URL.revokeObjectURL(url);
    return await new Promise((res) => c.toBlob(res, "image/jpeg", 0.75));
  } catch { return null; }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onerror = reject; i.onload = () => resolve(i); i.src = src;
  });
}

// Upload a single File. Prefers online path; falls back to offline queue.
// `meta` may include: project, jobId, client, site, category, description, notes, dateTaken
export async function uploadMedia(file, meta = {}, { forceOffline = false } = {}) {
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  if (forceOffline || !online) {
    return queueUpload(file, meta);
  }
  try {
    return await sendUpload(file, meta);
  } catch (err) {
    // Any network-level failure → fall back to the offline queue.
    if (!err?.response) return queueUpload(file, meta);
    throw err;
  }
}

async function sendUpload(file, meta) {
  const form = new FormData();
  const isImage = (file.type || "").startsWith("image/");
  const isVideo = (file.type || "").startsWith("video/");

  if (isImage) {
    const { main, thumb } = await processImage(file);
    form.append("file", main, (file.name || "photo.jpg").replace(/\.\w+$/, ".jpg"));
    form.append("thumbnail", thumb, "thumb.jpg");
  } else if (isVideo) {
    form.append("file", file, file.name || "video.mp4");
    const poster = await extractVideoPoster(file);
    if (poster) form.append("poster", poster, "poster.jpg");
  } else {
    throw new Error("Unsupported file type");
  }

  Object.entries(meta || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).length > 0) form.append(k, v);
  });

  const { data } = await api.post("/media", form, {
    headers: { "Content-Type": "multipart/form-data" },
    // videos can be large — allow up to 3 minutes
    timeout: 180000,
  });
  return data;
}

async function queueUpload(file, meta) {
  await addToQueue({ file, meta });
  return { queued: true };
}

// Re-export the offline queue plumbing so callers don't need a second import.
export { drainQueue, subscribeQueue, queueSize, backedOffUntil };

// Kick a drain whenever the tab comes back online. Attach once.
if (typeof window !== "undefined" && !window.__morrisMediaQueueBound) {
  window.__morrisMediaQueueBound = true;
  window.addEventListener("online", () => { drainQueue(sendUpload); });
  // And on load, in case items were queued in a prior session.
  setTimeout(() => { if (navigator.onLine) drainQueue(sendUpload); }, 1500);
}
