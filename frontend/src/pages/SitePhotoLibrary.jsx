import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, X, Search, Trash2, Download, ImageOff, Info, Upload, Tag, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

const LIBRARY_KEY = "morris_photo_library_v1";
const MAX_LIBRARY_SIZE = 200;

// Doctype list — must stay in sync with Photo to Document so both flows tag
// consistently, but kept local so we don't touch PhotoToDocument.jsx.
const DOC_TYPES = [
  { id: "snagging-list",       label: "Snagging List" },
  { id: "incident-report",     label: "Incident Report" },
  { id: "delivery-record",     label: "Delivery Record" },
  { id: "site-diary",          label: "Site Diary" },
  { id: "asbestos-record",     label: "Asbestos Record" },
  { id: "dispute-timeline",    label: "Dispute Timeline" },
  { id: "variation-letter",    label: "Variation Order" },
  { id: "complaint-letter",    label: "Complaint Letter" },
  { id: "rams",                label: "RAMS" },
  { id: "quote-builder",       label: "Quote" },
  { id: "incident-log",        label: "Incident Log" },
  { id: "scope-of-works",      label: "Scope of Works" },
  { id: "contract-review",     label: "Contract Review" },
  { id: "meeting-notes",       label: "Meeting Notes" },
  { id: "toolbox-talk",        label: "Toolbox Talk" },
  { id: "defects-tracker",     label: "Defects Tracker" },
  { id: "weather-log",         label: "Weather Log" },
  { id: "measurement-record",  label: "Measurement Record" },
  { id: "purchase-order",      label: "Purchase Order" },
  { id: "progress-report",     label: "Progress Report" },
  { id: "site-access-permit",  label: "Site Access Permit" },
];

const docTypeLabel = (id) => DOC_TYPES.find((d) => d.id === id)?.label || "";

// ---------- storage ----------
function loadLibrary() {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function saveLibrary(list) {
  try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(list)); } catch { /* quota */ }
}

// ---------- helpers (local copies — do not touch Photo to Document) ----------
function nowParts() {
  const d = new Date();
  const ukDate = d.toLocaleDateString("en-GB");
  const time = d.toTimeString().slice(0, 5);
  return { ukDate, time, capturedAt: d.toISOString() };
}

async function getLocationLabel() {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    let done = false;
    const finish = (val) => { if (!done) { done = true; resolve(val); } };
    setTimeout(() => finish(null), 4000);
    navigator.geolocation.getCurrentPosition(
      (pos) => finish(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`),
      () => finish(null),
      { enableHighAccuracy: false, timeout: 3500, maximumAge: 60_000 }
    );
  });
}

// Compress arbitrary image file → JPEG dataURL, capped at maxW.
const compress = (file, maxW = 1600, quality = 0.85) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

// Burn the date/time/location stamp into the image so the metadata is
// visually welded to the evidence, matching Photo to Document's behaviour.
function stampImage(dataUrl, { ukDate, time, location }) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = reject;
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);

      const stampLines = [
        "Evidence photo — date, time and location recorded automatically.",
        `${ukDate}  ·  ${time}${location ? `  ·  ${location}` : "  ·  Location not available"}`,
      ];

      const fontSize = Math.max(14, Math.round(img.width * 0.018));
      ctx.font = `${fontSize}px Helvetica, Arial, sans-serif`;
      ctx.textBaseline = "bottom";

      const padX = Math.round(fontSize * 0.8);
      const padY = Math.round(fontSize * 0.5);
      const lineH = Math.round(fontSize * 1.25);
      const widths = stampLines.map((l) => ctx.measureText(l).width);
      const boxW = Math.max(...widths) + padX * 2;
      const boxH = lineH * stampLines.length + padY * 2;

      const x = padX;
      const y = img.height - padX;
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(x, y - boxH, boxW, boxH);
      ctx.fillStyle = "#FFFFFF";
      stampLines.forEach((line, i) => {
        ctx.fillText(line, x + padX, y - padY - (stampLines.length - 1 - i) * lineH);
      });

      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.src = dataUrl;
  });
}

// Small square thumbnail for the gallery grid.
const buildThumbnail = (dataUrl, size = 400) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = reject;
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = size; c.height = size;
      const ctx = c.getContext("2d");
      const s = Math.min(img.width, img.height);
      const sx = (img.width - s) / 2;
      const sy = (img.height - s) / 2;
      ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
      resolve(c.toDataURL("image/jpeg", 0.75));
    };
    img.src = dataUrl;
  });

const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// ============================================================
export default function SitePhotoLibrary() {
  const [items, setItems] = useState([]);
  const [docFilter, setDocFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [viewer, setViewer] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);

  // Direct-capture state
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const cameraInputRef = useRef(null);
  const uploadInputRef = useRef(null);

  // Inline tag editor state
  const [taggingId, setTaggingId] = useState(null);
  const [tagDraftType, setTagDraftType] = useState("");
  const [tagDraftNote, setTagDraftNote] = useState("");

  useEffect(() => { setItems(loadLibrary()); }, []);

  const docTypes = useMemo(() => {
    const seen = new Map();
    items.forEach((p) => {
      if (p.docType && !seen.has(p.docType)) {
        seen.set(p.docType, p.docTypeLabel || p.docType);
      }
    });
    return Array.from(seen, ([id, label]) => ({ id, label }));
  }, [items]);

  const untaggedCount = useMemo(() => items.filter((p) => !p.docType).length, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((p) => {
      if (docFilter === "untagged" && p.docType) return false;
      if (docFilter !== "all" && docFilter !== "untagged" && p.docType !== docFilter) return false;
      if (q) {
        const hay = `${p.note || ""} ${p.location || ""} ${p.docTypeLabel || ""} ${p.ukDate || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, docFilter, query]);

  // ---------- direct capture / upload ----------
  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) {
      toast.error("No images selected");
      return;
    }
    setUploading(true);
    setUploadStatus("Reading location…");
    try {
      // One geolocation lookup per batch — matches Photo to Document.
      const location = await getLocationLabel();
      const additions = [];
      for (let i = 0; i < files.length; i++) {
        setUploadStatus(`Processing photo ${i + 1} of ${files.length}…`);
        const file = files[i];
        try {
          const parts = nowParts();
          const compressed = await compress(file);
          const stamped = await stampImage(compressed, { ukDate: parts.ukDate, time: parts.time, location });
          const thumbnail = await buildThumbnail(stamped);
          additions.push({
            id: uid(),
            dataUrl: stamped,
            thumbnail,
            note: "",
            capturedAt: parts.capturedAt,
            ukDate: parts.ukDate,
            time: parts.time,
            location: location || "",
            docType: "",           // uncategorised on direct upload
            docTypeLabel: "",
            source: "direct-upload",
          });
        } catch (err) {
          console.error("photo processing failed", err);
        }
      }
      if (additions.length === 0) {
        toast.error("Could not process the selected photos");
        return;
      }
      const next = [...additions, ...items].slice(0, MAX_LIBRARY_SIZE);
      setItems(next);
      saveLibrary(next);
      toast.success(`Added ${additions.length} photo${additions.length === 1 ? "" : "s"} to library`);
    } finally {
      setUploading(false);
      setUploadStatus("");
      // Reset both inputs so the same file can be re-selected.
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  };

  const onCameraChange = (e) => handleFiles(e.target.files);
  const onUploadChange = (e) => handleFiles(e.target.files);

  // ---------- inline tagging ----------
  const startTag = (photo) => {
    setTaggingId(photo.id);
    setTagDraftType(photo.docType || "");
    setTagDraftNote(photo.note || "");
  };
  const cancelTag = () => {
    setTaggingId(null);
    setTagDraftType("");
    setTagDraftNote("");
  };
  const saveTag = () => {
    const next = items.map((p) => {
      if (p.id !== taggingId) return p;
      return {
        ...p,
        docType: tagDraftType || "",
        docTypeLabel: tagDraftType ? docTypeLabel(tagDraftType) : "",
        note: tagDraftNote.trim(),
      };
    });
    setItems(next); saveLibrary(next);
    if (viewer?.id === taggingId) {
      setViewer(next.find((p) => p.id === taggingId) || null);
    }
    toast.success("Photo updated");
    cancelTag();
  };

  // ---------- existing actions (unchanged) ----------
  const removeOne = (id) => {
    const next = items.filter((p) => p.id !== id);
    setItems(next); saveLibrary(next);
    if (viewer?.id === id) setViewer(null);
    if (taggingId === id) cancelTag();
    toast.success("Photo removed from library");
  };

  const clearAll = () => {
    if (!window.confirm("Clear the entire Site Photo Library? This cannot be undone.")) return;
    setItems([]); saveLibrary([]);
    toast.success("Library cleared");
  };

  const downloadOne = (p) => {
    const a = document.createElement("a");
    a.href = p.dataUrl || p.thumbnail;
    const safeDate = (p.ukDate || "").replace(/\//g, "-");
    const safeNote = (p.note || "site-photo").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    a.download = `morris-${safeDate}-${safeNote}.jpg`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid="page-site-photo-library">
      <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">documents</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight flex items-center gap-3">
            <span className="text-3xl md:text-4xl">🖼️</span>
            <span>Site Photo Library</span>
          </h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setInfoOpen((v) => !v)} className="btn-secondary flex items-center gap-2" data-testid="library-info-btn">
            <Info size={16} /> Info
          </button>
          {items.length > 0 && (
            <button onClick={clearAll} className="btn-secondary flex items-center gap-2 text-[#E5635A]" data-testid="library-clear-all">
              <Trash2 size={14} /> Clear all
            </button>
          )}
        </div>
      </div>

      {infoOpen && (
        <div className="card-dark p-4 text-sm text-[#A19D94] mb-4" data-testid="library-info-panel">
          Every site photo you capture is automatically saved here — whether it comes from
          <span className="text-[#E8A020]"> Photo to Document</span>, a direct camera capture,
          or a file upload from this page. Each photo is stamped with date, time and location
          at the moment of capture and stored locally on this device only. Use the search
          and doctype filters to look back through your evidence.
        </div>
      )}

      {/* Direct capture / upload bar */}
      <div className="card-dark p-4 mb-4" data-testid="library-capture-bar">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="text-xs uppercase tracking-widest text-[#706D66] flex-1 min-w-[180px]">
            Add photos directly to your library
          </div>

          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="btn-primary flex items-center gap-2 text-sm"
            disabled={uploading}
            data-testid="library-take-photo"
          >
            <Camera size={14} /> Take photo
          </button>

          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            className="btn-secondary flex items-center gap-2 text-sm"
            disabled={uploading}
            data-testid="library-upload-photos"
          >
            <Upload size={14} /> Upload photos
          </button>

          {uploading && (
            <div className="flex items-center gap-2 text-[11px] text-[#E8A020]" data-testid="library-upload-status">
              <Loader2 size={12} className="animate-spin" /> {uploadStatus || "Processing…"}
            </div>
          )}
        </div>

        {/* Hidden inputs. `capture="environment"` opens rear camera on mobile;
            desktop browsers ignore it and fall back to file picker. */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onCameraChange}
          data-testid="library-camera-input"
        />
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onUploadChange}
          data-testid="library-upload-input"
        />

        <div className="text-[10px] text-[#706D66] mt-2 leading-relaxed">
          Photos added here are stamped with the current date, time and location and stored
          on this device. You can tag them with a document type any time using the
          <span className="text-[#A19D94]"> Tag </span>
          button on each card, or leave them uncategorised — they’ll still be searchable by
          date and location.
        </div>
      </div>

      {/* Filter bar */}
      <div className="card-dark p-4 mb-4" data-testid="library-filters">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
            <input
              className="input-base !pl-9"
              placeholder="Search notes, locations or dates…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="library-search"
            />
          </div>
          <select
            className="input-base !w-auto"
            value={docFilter}
            onChange={(e) => setDocFilter(e.target.value)}
            data-testid="library-doctype-filter"
          >
            <option value="all">All document types</option>
            {untaggedCount > 0 && <option value="untagged">Untagged ({untaggedCount})</option>}
            {docTypes.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <div className="text-[11px] text-[#706D66]" data-testid="library-count">
            {filtered.length} of {items.length} photo{items.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="card-dark p-12 text-center" data-testid="library-empty">
          <ImageOff size={42} className="mx-auto text-[#3d3d3d] mb-4" />
          <div className="text-[#F0EDE8] font-semibold mb-1">No photos yet</div>
          <div className="text-sm text-[#A19D94] max-w-md mx-auto">
            Tap <span className="text-[#E8A020]">Take photo</span> or <span className="text-[#E8A020]">Upload photos</span> above,
            or capture through Photo to Document. Every photo you add is stamped with date, time and location.
          </div>
        </div>
      )}

      {/* No matches under current filter */}
      {items.length > 0 && filtered.length === 0 && (
        <div className="card-dark p-12 text-center" data-testid="library-no-matches">
          <Camera size={42} className="mx-auto text-[#3d3d3d] mb-4" />
          <div className="text-[#F0EDE8] font-semibold mb-1">No photos match your filters</div>
          <div className="text-sm text-[#A19D94]">Try a different search term or document type.</div>
        </div>
      )}

      {/* Gallery grid */}
      {filtered.length > 0 && (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="library-grid">
          {filtered.map((p, idx) => (
            <div key={p.id} className="rounded-md overflow-hidden border border-[#A19D94]/15 bg-[#0a0a0a]" data-testid={`library-card-${idx}`}>
              <button
                onClick={() => setViewer(p)}
                className="block w-full"
                data-testid={`library-card-${idx}-open`}
              >
                <img src={p.thumbnail || p.dataUrl} alt={p.note || "Site photo"} className="w-full h-40 object-cover" />
              </button>
              <div className="p-2 text-[11px] text-[#A19D94]">
                <div className="text-[#E8A020] truncate" data-testid={`library-card-${idx}-doctype`}>
                  {p.docTypeLabel || p.docType || "Untagged"}
                </div>
                <div className="text-[10px] text-[#706D66] truncate mt-0.5">
                  {p.ukDate || ""} · {p.time || ""}{p.location ? ` · ${p.location}` : ""}
                </div>
                {p.note && <div className="text-[10px] text-[#A19D94] mt-1 line-clamp-2">{p.note}</div>}

                {taggingId === p.id ? (
                  <div className="mt-2 space-y-2" data-testid={`library-card-${idx}-tag-editor`}>
                    <select
                      className="input-base !text-[11px] !py-1"
                      value={tagDraftType}
                      onChange={(e) => setTagDraftType(e.target.value)}
                      data-testid={`library-card-${idx}-tag-select`}
                    >
                      <option value="">Uncategorised</option>
                      {DOC_TYPES.map((d) => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                      ))}
                    </select>
                    <input
                      className="input-base !text-[11px] !py-1"
                      placeholder="Optional note (e.g. crack in wall, plot 4)"
                      value={tagDraftNote}
                      onChange={(e) => setTagDraftNote(e.target.value)}
                      data-testid={`library-card-${idx}-tag-note`}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveTag}
                        className="text-[10px] uppercase tracking-widest text-[#E8A020] hover:text-[#F0EDE8] flex items-center gap-1"
                        data-testid={`library-card-${idx}-tag-save`}
                      >
                        <Check size={10} /> Save
                      </button>
                      <button
                        onClick={cancelTag}
                        className="text-[10px] uppercase tracking-widest text-[#706D66] hover:text-[#F0EDE8] flex items-center gap-1"
                        data-testid={`library-card-${idx}-tag-cancel`}
                      >
                        <X size={10} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <button
                      onClick={() => startTag(p)}
                      className="text-[10px] uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] flex items-center gap-1"
                      data-testid={`library-card-${idx}-tag`}
                    >
                      <Tag size={10} /> Tag
                    </button>
                    <button
                      onClick={() => downloadOne(p)}
                      className="text-[10px] uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] flex items-center gap-1"
                      data-testid={`library-card-${idx}-download`}
                    >
                      <Download size={10} /> Save
                    </button>
                    <button
                      onClick={() => removeOne(p.id)}
                      className="text-[10px] uppercase tracking-widest text-[#A19D94] hover:text-[#E5635A] flex items-center gap-1 ml-auto"
                      data-testid={`library-card-${idx}-remove`}
                    >
                      <Trash2 size={10} /> Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Viewer modal */}
      {viewer && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setViewer(null)}
          data-testid="library-viewer"
        >
          <div
            className="bg-[#0a0a0a] border border-[#E8A020]/30 rounded-md max-w-3xl w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#A19D94]/15">
              <div className="text-xs uppercase tracking-widest text-[#E8A020]">{viewer.docTypeLabel || viewer.docType || "Site photo"}</div>
              <button onClick={() => setViewer(null)} className="text-[#A19D94] hover:text-[#F0EDE8]" data-testid="library-viewer-close">
                <X size={18} />
              </button>
            </div>
            <img src={viewer.dataUrl || viewer.thumbnail} alt={viewer.note || "Site photo"} className="w-full max-h-[60vh] object-contain bg-black" />
            <div className="p-4 text-sm text-[#A19D94] space-y-1">
              <div className="text-[#F0EDE8]">{viewer.note || <span className="italic text-[#706D66]">No note attached</span>}</div>
              <div className="text-[11px] text-[#706D66]">
                {viewer.ukDate} · {viewer.time}{viewer.location ? ` · ${viewer.location}` : " · Location not available"}
              </div>
              <div className="flex gap-2 pt-3 flex-wrap">
                <button onClick={() => { startTag(viewer); setViewer(null); }} className="btn-secondary flex items-center gap-2 text-xs" data-testid="library-viewer-tag">
                  <Tag size={14} /> Tag / edit note
                </button>
                <button onClick={() => downloadOne(viewer)} className="btn-secondary flex items-center gap-2 text-xs" data-testid="library-viewer-download">
                  <Download size={14} /> Save image
                </button>
                <button onClick={() => removeOne(viewer.id)} className="btn-secondary flex items-center gap-2 text-xs text-[#E5635A]" data-testid="library-viewer-remove">
                  <Trash2 size={14} /> Remove from library
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
