import { useEffect, useMemo, useState } from "react";
import { Camera, X, Search, Trash2, Download, ImageOff, Info } from "lucide-react";
import { toast } from "sonner";

const LIBRARY_KEY = "morris_photo_library_v1";

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

export default function SitePhotoLibrary() {
  const [items, setItems] = useState([]);
  const [docFilter, setDocFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [viewer, setViewer] = useState(null); // photo currently open in modal
  const [infoOpen, setInfoOpen] = useState(false);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((p) => {
      if (docFilter !== "all" && p.docType !== docFilter) return false;
      if (q) {
        const hay = `${p.note || ""} ${p.location || ""} ${p.docTypeLabel || ""} ${p.ukDate || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, docFilter, query]);

  const removeOne = (id) => {
    const next = items.filter((p) => p.id !== id);
    setItems(next); saveLibrary(next);
    if (viewer?.id === id) setViewer(null);
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
          Every photo you take through <span className="text-[#E8A020]">Photo to Document</span> is automatically saved here.
          Photos are stamped with date, time and location at the moment of capture, and stored locally on this device only.
          Use this library to look back through site evidence by document type or by free-text search across notes and locations.
        </div>
      )}

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
            Use Photo to Document to capture annotated site photos. Every photo you attach to a document is automatically saved here.
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
                <div className="flex gap-2 mt-2">
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
              <div className="text-xs uppercase tracking-widest text-[#E8A020]">{viewer.docTypeLabel || "Site photo"}</div>
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
              <div className="flex gap-2 pt-3">
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
