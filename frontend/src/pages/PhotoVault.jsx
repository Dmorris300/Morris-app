// Photo Vault — central media library under Account.
// Layout mirrors the existing Morris admin pages (dark charcoal + gold accents).
//
// Sections: All Media / Projects / Unassigned / Favourites / Recently Added.
// Grid + list view, search + filter by category/date, upload + inline capture,
// project linking pulled from the user's Jobs list.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Camera, Video, Upload, Search, Trash2, X, Star, StarOff, Play, Grid3x3,
  List, FolderOpen, Inbox, Clock, ImageIcon, Loader2, CheckCircle2, WifiOff,
} from "lucide-react";
import api from "../lib/api";
import {
  MEDIA_CATEGORIES, listMedia, updateMedia, deleteMedia, uploadMedia, listAlbums,
  thumbSrc, fileSrc, queueSize, subscribeQueue, backedOffUntil,
} from "../lib/media";

const SECTIONS = [
  { id: "all",         label: "All Media",       icon: ImageIcon },
  { id: "projects",    label: "Projects",        icon: FolderOpen },
  { id: "albums",      label: "Albums",          icon: FolderOpen },
  { id: "unassigned",  label: "Unassigned",      icon: Inbox },
  { id: "favourites",  label: "Favourites",      icon: Star },
  { id: "recent",      label: "Recently Added",  icon: Clock },
];

const bytesLabel = (n) => {
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

export default function PhotoVault() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState(searchParams.get("jobId") ? "projects" : "all");
  const [category, setCategory] = useState("");
  const [q, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [view, setView] = useState("grid");
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(searchParams.get("jobId") || "");
  const [albums, setAlbums] = useState([]);
  const [selectedAlbum, setSelectedAlbum] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [detail, setDetail] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const cameraRef = useRef(null);
  const uploadRef = useRef(null);
  const videoRef = useRef(null);

  const online = typeof navigator === "undefined" ? true : navigator.onLine;

  // Load jobs once for the project dropdown.
  useEffect(() => {
    const loadJobs = () => api.get("/jobs").then((r) => setJobs(r.data || [])).catch(() => setJobs([]));
    const loadAlbums = () => listAlbums().then(setAlbums).catch(() => setAlbums([]));
    loadJobs();
    loadAlbums();
    window.addEventListener("morris:jobs-updated", loadJobs);
    window.addEventListener("morris:albums-updated", loadAlbums);
    queueSize().then(setPendingCount);
    const unsub = subscribeQueue(() => queueSize().then(setPendingCount));
    // Best-effort one-time migration of the retired Site Photo Library.
    migrateLegacyLibrary().then(() => { queueSize().then(setPendingCount); loadAlbums(); });
    return () => {
      unsub();
      window.removeEventListener("morris:jobs-updated", loadJobs);
      window.removeEventListener("morris:albums-updated", loadAlbums);
    };
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (section === "projects") {
        params.section = selectedJob ? "project" : "all";
      } else if (section === "albums") {
        params.section = selectedAlbum ? "album" : "all";
      } else {
        params.section = section;
      }
      if (selectedJob) params.jobId = selectedJob;
      if (selectedAlbum) params.album = selectedAlbum;
      if (category) params.category = category;
      if (q) params.q = q;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const rows = await listMedia(params);
      setItems(rows);
    } catch (e) {
      if (e?.response?.status === 401) toast.error("Please log in again");
      else toast.error("Could not load Photo Vault");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [section, selectedJob, selectedAlbum, category, dateFrom, dateTo]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [q]);

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) =>
      f.type.startsWith("image/") || f.type.startsWith("video/")
    );
    if (files.length === 0) { toast.error("No photos or videos selected"); return; }
    const job = jobs.find((j) => j.id === selectedJob);
    setUploading(true);
    let uploaded = 0, queued = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setUploadStatus(`Processing ${i + 1} of ${files.length}…`);
      try {
        const meta = {};
        if (job) {
          meta.jobId = job.id;
          if (job.clientName) meta.client = job.clientName;
          if (job.address) meta.site = job.address;
        }
        if (category && category !== "" && section !== "all") meta.category = category;
        const res = await uploadMedia(f, meta);
        if (res?.queued) queued += 1; else uploaded += 1;
      } catch (err) {
        console.error("Upload failed", err);
      }
    }
    setUploading(false); setUploadStatus("");
    if (cameraRef.current) cameraRef.current.value = "";
    if (uploadRef.current) uploadRef.current.value = "";
    if (videoRef.current) videoRef.current.value = "";
    if (uploaded) toast.success(`Uploaded ${uploaded} file${uploaded === 1 ? "" : "s"}`);
    if (queued) toast.info(`${queued} file${queued === 1 ? "" : "s"} queued — will sync when back online`);
    queueSize().then(setPendingCount);
    load();
  };

  const toggleFav = async (m) => {
    try {
      const updated = await updateMedia(m.id, { favourite: !m.favourite });
      setItems((prev) => prev.map((x) => (x.id === m.id ? updated : x)));
      if (detail?.id === m.id) setDetail(updated);
    } catch { toast.error("Could not update"); }
  };

  const doDelete = async (m, force = false) => {
    try {
      const res = await deleteMedia(m.id, { force });
      if (res?.requiresConfirm) {
        setConfirmDelete({ media: m, usage: res.usage || [] });
        return;
      }
      setItems((prev) => prev.filter((x) => x.id !== m.id));
      setDetail(null); setConfirmDelete(null);
      toast.success("Media deleted");
    } catch { toast.error("Delete failed"); }
  };

  const projectsList = useMemo(() => jobs.slice().sort((a, b) => (a.clientName || "").localeCompare(b.clientName || "")), [jobs]);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-photo-vault">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold text-[#F0EDE8] flex items-center gap-3">
            <ImageIcon size={26} className="text-[#E8A020]" />
            <span>Photo Vault</span>
          </h1>
          <p className="text-sm text-[#A19D94] mt-1 max-w-xl">
            Your central library of site photos and videos. Upload once, reuse everywhere across Morris.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!online && (
            <span className="inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-md bg-[#3a2314] text-[#E5635A] border border-[#E5635A]/30" data-testid="vault-offline-badge">
              <WifiOff size={14} /> Offline
            </span>
          )}
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-md bg-[#1e1a12] text-[#E8A020] border border-[#E8A020]/30" data-testid="vault-pending-count">
              <Clock size={14} /> {pendingCount} pending
            </span>
          )}
        </div>
      </div>

      {/* Upload row */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handleFiles(e.target.files)} data-testid="vault-camera-input" />
        <input ref={uploadRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => handleFiles(e.target.files)} data-testid="vault-upload-input" />
        <input ref={videoRef} type="file" accept="video/*" capture="environment" hidden onChange={(e) => handleFiles(e.target.files)} data-testid="vault-video-input" />
        <button
          onClick={() => cameraRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-[#E8A020] text-[#0a0a0a] font-medium hover:bg-[#F0B040] disabled:opacity-50 text-sm"
          data-testid="vault-take-photo-btn"
        ><Camera size={16} /> Take Photo</button>
        <button
          onClick={() => videoRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-[#1a1a1a] text-[#F0EDE8] border border-[#F0EDE8]/10 hover:border-[#E8A020]/50 disabled:opacity-50 text-sm"
          data-testid="vault-record-video-btn"
        ><Video size={16} /> Record Video</button>
        <button
          onClick={() => uploadRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-[#1a1a1a] text-[#F0EDE8] border border-[#F0EDE8]/10 hover:border-[#E8A020]/50 disabled:opacity-50 text-sm"
          data-testid="vault-upload-btn"
        ><Upload size={16} /> Upload Files</button>
        {uploading && (
          <span className="inline-flex items-center gap-2 text-xs text-[#A19D94]">
            <Loader2 size={14} className="animate-spin" /> {uploadStatus || "Uploading…"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        {/* Sections rail */}
        <aside className="md:sticky md:top-4 md:self-start">
          <nav className="space-y-1" data-testid="vault-sections">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setSection(s.id);
                    if (s.id !== "projects") setSelectedJob("");
                    if (s.id !== "albums") setSelectedAlbum("");
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-md text-sm inline-flex items-center gap-2 border ${active ? "bg-[#1e1a12] text-[#E8A020] border-[#E8A020]/40" : "bg-transparent text-[#A19D94] border-transparent hover:bg-[#141414]"}`}
                  data-testid={`vault-section-${s.id}`}
                >
                  <Icon size={14} /> {s.label}
                </button>
              );
            })}
          </nav>

          {section === "projects" && (
            <div className="mt-4" data-testid="vault-project-picker">
              <p className="text-xs uppercase tracking-wide text-[#706D66] mb-2">Projects</p>
              <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                <button
                  onClick={() => setSelectedJob("")}
                  className={`w-full text-left px-3 py-1.5 rounded text-xs ${!selectedJob ? "bg-[#1e1a12] text-[#E8A020]" : "text-[#A19D94] hover:bg-[#141414]"}`}
                >All projects</button>
                {projectsList.length === 0 && (
                  <p className="text-xs text-[#706D66] px-3">No jobs yet. <Link to="/app/jobs" className="text-[#E8A020]">Create one</Link>.</p>
                )}
                {projectsList.map((j) => (
                  <button
                    key={j.id}
                    onClick={() => setSelectedJob(j.id)}
                    className={`w-full text-left px-3 py-1.5 rounded text-xs truncate ${selectedJob === j.id ? "bg-[#1e1a12] text-[#E8A020]" : "text-[#A19D94] hover:bg-[#141414]"}`}
                    data-testid={`vault-project-${j.id}`}
                    title={`${j.ref || ""} — ${j.clientName || ""}`}
                  >{j.clientName || j.ref || "Untitled"}</button>
                ))}
              </div>
            </div>
          )}
          {section === "albums" && (
            <div className="mt-4" data-testid="vault-album-picker">
              <p className="text-xs uppercase tracking-wide text-[#706D66] mb-2">Albums</p>
              <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                <button
                  onClick={() => setSelectedAlbum("")}
                  className={`w-full text-left px-3 py-1.5 rounded text-xs ${!selectedAlbum ? "bg-[#1e1a12] text-[#E8A020]" : "text-[#A19D94] hover:bg-[#141414]"}`}
                >All albums</button>
                {albums.length === 0 && (
                  <p className="text-xs text-[#706D66] px-3">No albums yet. Add one from any media&apos;s detail panel.</p>
                )}
                {albums.map((a) => (
                  <button
                    key={a.name}
                    onClick={() => setSelectedAlbum(a.name)}
                    className={`w-full text-left px-3 py-1.5 rounded text-xs flex items-center justify-between gap-2 ${selectedAlbum === a.name ? "bg-[#1e1a12] text-[#E8A020]" : "text-[#A19D94] hover:bg-[#141414]"}`}
                    data-testid={`vault-album-${a.name}`}
                  >
                    <span className="truncate">{a.name}</span>
                    <span className="text-[10px] text-[#706D66]">{a.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Main content */}
        <div>
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
              <input
                value={q}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search photos & videos…"
                className="w-full bg-[#121212] border border-[#F0EDE8]/10 text-sm rounded-md py-2 pl-8 pr-3 text-[#F0EDE8] focus:outline-none focus:border-[#E8A020]/50"
                data-testid="vault-search-input"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-[#121212] border border-[#F0EDE8]/10 text-sm rounded-md py-2 px-3 text-[#F0EDE8]"
              data-testid="vault-category-filter"
            >
              <option value="">All categories</option>
              {MEDIA_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="bg-[#121212] border border-[#F0EDE8]/10 text-sm rounded-md py-2 px-2 text-[#F0EDE8]" data-testid="vault-date-from" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="bg-[#121212] border border-[#F0EDE8]/10 text-sm rounded-md py-2 px-2 text-[#F0EDE8]" data-testid="vault-date-to" />
            <div className="inline-flex rounded-md border border-[#F0EDE8]/10 overflow-hidden">
              <button onClick={() => setView("grid")} className={`px-2 py-2 ${view === "grid" ? "bg-[#1e1a12] text-[#E8A020]" : "text-[#A19D94]"}`} data-testid="vault-view-grid" title="Grid view"><Grid3x3 size={14} /></button>
              <button onClick={() => setView("list")} className={`px-2 py-2 ${view === "list" ? "bg-[#1e1a12] text-[#E8A020]" : "text-[#A19D94]"}`} data-testid="vault-view-list" title="List view"><List size={14} /></button>
            </div>
          </div>

          {loading ? (
            <div className="py-24 text-center text-[#706D66]"><Loader2 size={20} className="animate-spin inline mr-2" /> Loading…</div>
          ) : items.length === 0 ? (
            <div className="py-24 text-center text-[#706D66]" data-testid="vault-empty-state">
              <ImageIcon size={40} className="mx-auto mb-3 opacity-40" />
              <p>No media yet in this view.</p>
              <p className="text-xs mt-1">Tap Take Photo, Record Video, or Upload Files above.</p>
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3" data-testid="vault-grid">
              {items.map((m) => (
                <MediaTile key={m.id} m={m} onOpen={() => setDetail(m)} onFav={() => toggleFav(m)} />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-[#F0EDE8]/5 border border-[#F0EDE8]/5 rounded-md bg-[#0d0d0d]" data-testid="vault-list">
              {items.map((m) => <MediaRow key={m.id} m={m} onOpen={() => setDetail(m)} onFav={() => toggleFav(m)} />)}
            </div>
          )}
        </div>
      </div>

      {detail && (
        <MediaDetail
          media={detail}
          jobs={jobs}
          onClose={() => setDetail(null)}
          onUpdated={(u) => { setItems((prev) => prev.map((x) => (x.id === u.id ? u : x))); setDetail(u); }}
          onDelete={() => doDelete(detail)}
        />
      )}

      {confirmDelete && (
        <DeleteConfirm
          data={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => doDelete(confirmDelete.media, true)}
        />
      )}
    </div>
  );
}

// ------------ subcomponents ------------

function MediaTile({ m, onOpen, onFav }) {
  return (
    <div className="relative group aspect-square rounded-md overflow-hidden bg-[#0d0d0d] border border-[#F0EDE8]/5" data-testid={`vault-tile-${m.id}`}>
      <button onClick={onOpen} className="absolute inset-0 w-full h-full" data-testid={`vault-tile-open-${m.id}`}>
        <img src={thumbSrc(m)} alt={m.description || m.originalFilename} className="w-full h-full object-cover" loading="lazy" />
      </button>
      {m.kind === "video" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Play size={36} className="text-white/80 drop-shadow" />
        </div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onFav(); }}
        className={`absolute top-1.5 right-1.5 p-1.5 rounded-full ${m.favourite ? "bg-[#E8A020] text-[#0a0a0a]" : "bg-black/50 text-white opacity-0 group-hover:opacity-100"} transition-opacity`}
        title={m.favourite ? "Remove from favourites" : "Add to favourites"}
        data-testid={`vault-tile-fav-${m.id}`}
      >
        {m.favourite ? <Star size={12} /> : <StarOff size={12} />}
      </button>
      {m.category && (
        <span className="absolute bottom-1.5 left-1.5 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white truncate max-w-[80%]">{m.category}</span>
      )}
    </div>
  );
}

function MediaRow({ m, onOpen, onFav }) {
  return (
    <div className="flex items-center gap-3 p-2.5" data-testid={`vault-row-${m.id}`}>
      <button onClick={onOpen} className="flex items-center gap-3 flex-1 text-left">
        <img src={thumbSrc(m)} alt="" className="w-14 h-14 object-cover rounded" loading="lazy" />
        <div className="min-w-0">
          <div className="text-sm text-[#F0EDE8] truncate">{m.description || m.originalFilename}</div>
          <div className="text-xs text-[#706D66] flex items-center gap-2 flex-wrap">
            {m.kind === "video" ? <span className="text-[#E8A020]">Video</span> : <span>Photo</span>}
            <span>·</span>
            <span>{m.dateTaken || m.createdAt?.slice(0, 10)}</span>
            {m.category && <><span>·</span><span>{m.category}</span></>}
            {(m.usage?.length || 0) > 0 && <><span>·</span><span className="text-[#E8A020]">Used in {m.usage.length}</span></>}
          </div>
        </div>
      </button>
      <button onClick={onFav} className="text-[#A19D94] hover:text-[#E8A020]" title="Favourite" data-testid={`vault-row-fav-${m.id}`}>
        {m.favourite ? <Star size={16} className="text-[#E8A020]" /> : <StarOff size={16} />}
      </button>
    </div>
  );
}

function MediaDetail({ media, jobs, onClose, onUpdated, onDelete }) {
  const [existingAlbums, setExistingAlbums] = useState([]);
  useEffect(() => { listAlbums().then((a) => setExistingAlbums(a || [])).catch(() => {}); }, []);
  const [f, setF] = useState({
    description: media.description || "",
    notes: media.notes || "",
    category: media.category || "",
    customCategory: media.customCategory || "",
    jobId: media.jobId || "",
    project: media.project || "",
    client: media.client || "",
    site: media.site || "",
    dateTaken: media.dateTaken || "",
    album: media.album || "",
    tool: media.tool || "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const patch = { ...f };
      // If job selected, auto-fill client/site.
      if (f.jobId) {
        const j = jobs.find((x) => x.id === f.jobId);
        if (j) {
          patch.client = patch.client || j.clientName || "";
          patch.site = patch.site || j.address || "";
        }
      }
      const updated = await updateMedia(media.id, patch);
      onUpdated(updated);
      // If album changed, refresh the albums list in the parent Vault.
      if ((patch.album || "") !== (media.album || "")) {
        window.dispatchEvent(new CustomEvent("morris:albums-updated"));
      }
      toast.success("Saved");
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose} data-testid="vault-detail-modal">
      <div className="bg-[#0d0d0d] border border-[#F0EDE8]/10 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row" onClick={(e) => e.stopPropagation()}>
        <div className="md:w-2/3 bg-black flex items-center justify-center min-h-[240px] max-h-[90vh] overflow-hidden">
          {media.kind === "video" ? (
            <video src={fileSrc(media, "original")} controls className="w-full max-h-[85vh]" data-testid="vault-detail-video" />
          ) : (
            <img src={fileSrc(media, "original")} alt="" className="w-full max-h-[85vh] object-contain" data-testid="vault-detail-image" />
          )}
        </div>
        <div className="md:w-1/3 p-4 overflow-y-auto border-l border-[#F0EDE8]/5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg text-[#F0EDE8] font-medium">Details</h3>
            <button onClick={onClose} className="text-[#A19D94] hover:text-white" data-testid="vault-detail-close"><X size={18} /></button>
          </div>
          <div className="text-xs text-[#706D66] space-y-1 mb-4">
            <div>Uploaded {media.createdAt?.slice(0, 10)} · {bytesLabel(media.size)}</div>
            <div>By {media.uploader}</div>
          </div>

          <Field label="Description">
            <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={inputCls} data-testid="vault-detail-description" />
          </Field>
          <Field label="Notes">
            <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={3} className={inputCls} data-testid="vault-detail-notes" />
          </Field>
          <Field label="Category">
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className={inputCls} data-testid="vault-detail-category">
              <option value="">— None —</option>
              {MEDIA_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          {f.category === "Other" && (
            <Field label="Custom category">
              <input value={f.customCategory} onChange={(e) => setF({ ...f, customCategory: e.target.value })} className={inputCls} data-testid="vault-detail-custom-category" />
            </Field>
          )}
          <Field label="Project">
            <div className="flex gap-2">
              <select
                value={f.jobId}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    const name = window.prompt("New project — client or project name");
                    if (!name || !name.trim()) return;
                    api.post("/jobs", { clientName: name.trim() })
                      .then((r) => {
                        const created = r.data;
                        // caller will refresh jobs list on next open
                        setF((prev) => ({ ...prev, jobId: created.id, client: created.clientName || "" }));
                        toast.success("Project created — remember to Save");
                        // hint parent to reload jobs
                        window.dispatchEvent(new CustomEvent("morris:jobs-updated"));
                      })
                      .catch(() => toast.error("Could not create project"));
                    return;
                  }
                  setF({ ...f, jobId: e.target.value });
                }}
                className={inputCls}
                data-testid="vault-detail-project"
              >
                <option value="">— Unassigned —</option>
                <option value="__new__">+ Create new project…</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.clientName || j.ref}</option>)}
              </select>
            </div>
          </Field>
          <Field label="Client"><input value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} className={inputCls} data-testid="vault-detail-client" /></Field>
          <Field label="Site / address"><input value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })} className={inputCls} data-testid="vault-detail-site" /></Field>
          <Field label="Album">
            <input
              value={f.album}
              onChange={(e) => setF({ ...f, album: e.target.value })}
              className={inputCls}
              placeholder="e.g. 'Client walkarounds', 'Damage 2026'…"
              list="vault-existing-albums"
              data-testid="vault-detail-album"
            />
            <datalist id="vault-existing-albums">
              {existingAlbums.map((a) => <option key={a.name} value={a.name} />)}
            </datalist>
          </Field>
          <Field label="Date taken"><input type="date" value={f.dateTaken} onChange={(e) => setF({ ...f, dateTaken: e.target.value })} className={inputCls} data-testid="vault-detail-date-taken" /></Field>
          {media.tool && (
            <div className="mb-3 text-xs text-[#706D66]" data-testid="vault-detail-tool-stamp">
              Captured from <span className="text-[#E8A020]">{media.tool}</span>
            </div>
          )}

          {(media.usage?.length || 0) > 0 && (
            <div className="mt-3">
              <p className="text-xs uppercase tracking-wide text-[#706D66] mb-1">Referenced by</p>
              <ul className="text-xs text-[#F0EDE8] space-y-1">
                {media.usage.map((u) => (
                  <li key={u.docId} className="flex items-center gap-2">
                    <CheckCircle2 size={12} className="text-[#E8A020]" />
                    <span>{u.docTitle || u.docType}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between mt-4">
            <button onClick={onDelete} className="text-red-400 hover:text-red-300 text-sm inline-flex items-center gap-1" data-testid="vault-detail-delete">
              <Trash2 size={14} /> Delete
            </button>
            <button onClick={save} disabled={saving} className="bg-[#E8A020] text-[#0a0a0a] px-4 py-2 rounded-md text-sm font-medium hover:bg-[#F0B040] disabled:opacity-50" data-testid="vault-detail-save">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirm({ data, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" data-testid="vault-delete-confirm">
      <div className="bg-[#0d0d0d] border border-[#E5635A]/40 rounded-lg max-w-md w-full p-5">
        <h3 className="text-lg text-[#F0EDE8] font-medium mb-2">Delete this media?</h3>
        <p className="text-sm text-[#A19D94] mb-3">
          This file is referenced in <span className="text-[#E8A020]">{data.usage.length}</span> document(s).
          Deleting it will remove the visual from those documents.
        </p>
        <ul className="text-xs text-[#F0EDE8] mb-4 max-h-40 overflow-y-auto space-y-1">
          {data.usage.map((u) => <li key={u.docId}>· {u.docTitle || u.docType}</li>)}
        </ul>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-[#A19D94] hover:text-white" data-testid="vault-delete-cancel">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm bg-[#E5635A] text-white rounded-md hover:bg-[#F0736A]" data-testid="vault-delete-confirm-btn">Delete anyway</button>
        </div>
      </div>
    </div>
  );
}

// ------------ helpers ------------
const inputCls = "w-full bg-[#121212] border border-[#F0EDE8]/10 text-sm rounded-md py-2 px-3 text-[#F0EDE8] focus:outline-none focus:border-[#E8A020]/50";
function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="block text-xs uppercase tracking-wide text-[#706D66] mb-1">{label}</label>
      {children}
    </div>
  );
}

// One-time migration from the retired "Site Photo Library" localStorage bucket.
// Silently uploads any dataURLs found there and clears the key so we never
// migrate twice.
async function migrateLegacyLibrary() {
  try {
    const MIGRATED_FLAG = "morris_photo_library_migrated_v1";
    if (localStorage.getItem(MIGRATED_FLAG)) return;
    const raw = localStorage.getItem("morris_photo_library_v1");
    if (!raw) { localStorage.setItem(MIGRATED_FLAG, "1"); return; }
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) { localStorage.setItem(MIGRATED_FLAG, "1"); return; }
    for (const item of arr) {
      try {
        const src = item.dataUrl || item.thumbnail;
        if (!src || !src.startsWith("data:")) continue;
        const blob = await (await fetch(src)).blob();
        const file = new File([blob], `legacy-${item.id || Date.now()}.jpg`, { type: blob.type || "image/jpeg" });
        const meta = {
          description: item.docTypeLabel ? `${item.docTypeLabel}${item.note ? ` — ${item.note}` : ""}` : (item.note || ""),
          notes: item.location ? `Location: ${item.location}` : "",
          dateTaken: (item.ukDate || "").split("/").reverse().join("-") || undefined,
        };
        // Fire and forget — offline queue handles retries.
        await uploadMedia(file, meta).catch(() => {});
      } catch { /* skip broken items */ }
    }
    localStorage.setItem(MIGRATED_FLAG, "1");
    // Clear the old bucket to reclaim quota.
    try { localStorage.removeItem("morris_photo_library_v1"); } catch { /* noop */ }
  } catch { /* migration is best-effort */ }
}
