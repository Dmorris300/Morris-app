// AttachMedia — the reusable "attach photos & videos" widget for any Morris tool.
//
// Behaviour:
//   - Preview strip of currently attached items with quick remove.
//   - "Attach from Vault" opens a searchable picker of the user's Photo Vault.
//   - "Take Photo" / "Record Video" / "Upload" upload straight into the Vault
//     (with the tool's toolId + jobId prefilled) and attach the new item.
//   - On save, the parent tool records usage via `addUsage()` so the Vault
//     tracks which documents reference each media item.
//
// Value shape returned to parent (`onChange(list)`):
//   [{ id, kind, description, thumbPath, storagePath, ... }]  (full media docs)

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Video, Upload, ImagePlus, X, Search, Play, Loader2, ImageIcon } from "lucide-react";
import { listMedia, uploadMedia, thumbSrc, MEDIA_CATEGORIES, addUsage as recordUsage, removeUsage as clearUsage } from "../lib/media";

export default function AttachMedia({
  toolId,
  toolLabel,
  jobId,
  category,
  value = [],
  onChange,
  compact = false,
  testIdPrefix = "attach-media",
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef(null);
  const videoRef = useRef(null);
  const uploadRef = useRef(null);

  const attach = (m) => {
    if (value.some((x) => x.id === m.id)) return;
    onChange([...(value || []), m]);
  };
  const detach = (id) => {
    onChange((value || []).filter((x) => x.id !== id));
  };

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (!files.length) return;
    setUploading(true);
    try {
      for (const f of files) {
        try {
          const meta = {};
          if (jobId) meta.jobId = jobId;
          if (category) meta.category = category;
          if (toolId) meta.tool = toolId;
          if (toolLabel) meta.description = `${toolLabel} — ${f.name}`;
          const res = await uploadMedia(f, meta);
          if (res?.queued) {
            toast.info("Queued — will attach once you're back online");
          } else if (res?.id) {
            attach(res);
          }
        } catch (err) {
          console.error("Attach upload failed", err);
          toast.error("Upload failed for one file");
        }
      }
    } finally {
      setUploading(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (videoRef.current) videoRef.current.value = "";
      if (uploadRef.current) uploadRef.current.value = "";
    }
  };

  return (
    <div className="rounded-md border border-[#F0EDE8]/10 bg-[#0d0d0d] p-3" data-testid={`${testIdPrefix}-root`}>
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="text-sm text-[#F0EDE8] inline-flex items-center gap-2">
          <ImagePlus size={16} className="text-[#E8A020]" />
          <span>Photos & videos</span>
          {value.length > 0 && <span className="text-xs text-[#A19D94]">({value.length})</span>}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handleFiles(e.target.files)} data-testid={`${testIdPrefix}-camera-input`} />
          <input ref={videoRef} type="file" accept="video/*" capture="environment" hidden onChange={(e) => handleFiles(e.target.files)} data-testid={`${testIdPrefix}-video-input`} />
          <input ref={uploadRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => handleFiles(e.target.files)} data-testid={`${testIdPrefix}-upload-input`} />
          <button onClick={() => setPickerOpen(true)} disabled={uploading}
            className="text-xs px-2.5 py-1.5 rounded-md bg-[#1a1a1a] text-[#F0EDE8] border border-[#F0EDE8]/10 hover:border-[#E8A020]/40 inline-flex items-center gap-1.5 disabled:opacity-50"
            data-testid={`${testIdPrefix}-open-picker`}
          ><Search size={12} /> Vault</button>
          <button onClick={() => cameraRef.current?.click()} disabled={uploading}
            className="text-xs px-2.5 py-1.5 rounded-md bg-[#1a1a1a] text-[#F0EDE8] border border-[#F0EDE8]/10 hover:border-[#E8A020]/40 inline-flex items-center gap-1.5 disabled:opacity-50"
            data-testid={`${testIdPrefix}-photo-btn`}
          ><Camera size={12} /> Photo</button>
          {!compact && (
            <button onClick={() => videoRef.current?.click()} disabled={uploading}
              className="text-xs px-2.5 py-1.5 rounded-md bg-[#1a1a1a] text-[#F0EDE8] border border-[#F0EDE8]/10 hover:border-[#E8A020]/40 inline-flex items-center gap-1.5 disabled:opacity-50"
              data-testid={`${testIdPrefix}-video-btn`}
            ><Video size={12} /> Video</button>
          )}
          <button onClick={() => uploadRef.current?.click()} disabled={uploading}
            className="text-xs px-2.5 py-1.5 rounded-md bg-[#1a1a1a] text-[#F0EDE8] border border-[#F0EDE8]/10 hover:border-[#E8A020]/40 inline-flex items-center gap-1.5 disabled:opacity-50"
            data-testid={`${testIdPrefix}-file-btn`}
          ><Upload size={12} /> File</button>
          {uploading && <Loader2 size={14} className="text-[#E8A020] animate-spin" data-testid={`${testIdPrefix}-uploading`} />}
        </div>
      </div>

      {value.length === 0 ? (
        <p className="text-xs text-[#706D66]" data-testid={`${testIdPrefix}-empty`}>
          No media attached yet. Attach from your Vault or capture directly.
        </p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2" data-testid={`${testIdPrefix}-grid`}>
          {value.map((m) => (
            <div key={m.id} className="relative aspect-square rounded overflow-hidden bg-[#0d0d0d] border border-[#F0EDE8]/5" data-testid={`${testIdPrefix}-item-${m.id}`}>
              <img src={thumbSrc(m)} alt="" className="w-full h-full object-cover" loading="lazy" />
              {m.kind === "video" && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <Play size={20} className="text-white/80 drop-shadow" />
                </div>
              )}
              <button onClick={() => detach(m.id)}
                className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white hover:bg-red-500"
                title="Remove"
                data-testid={`${testIdPrefix}-remove-${m.id}`}
              ><X size={10} /></button>
            </div>
          ))}
        </div>
      )}

      {pickerOpen && (
        <VaultPicker
          selectedIds={value.map((v) => v.id)}
          jobId={jobId}
          onClose={() => setPickerOpen(false)}
          onPick={(m) => { attach(m); setPickerOpen(false); }}
        />
      )}
    </div>
  );
}

function VaultPicker({ selectedIds, jobId, onClose, onPick }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [scope, setScope] = useState(jobId ? "project" : "all");

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (scope === "project" && jobId) params.jobId = jobId;
    if (scope === "recent") params.section = "recent";
    if (scope === "favourites") params.section = "favourites";
    if (category) params.category = category;
    if (q) params.q = q;
    listMedia(params).then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  }, [q, category, scope, jobId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose} data-testid="attach-media-picker">
      <div className="bg-[#0d0d0d] border border-[#F0EDE8]/10 rounded-lg max-w-4xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-[#F0EDE8]/5 flex items-center justify-between">
          <h3 className="text-lg text-[#F0EDE8] font-medium">Photo Vault</h3>
          <button onClick={onClose} className="text-[#A19D94] hover:text-white" data-testid="attach-media-picker-close"><X size={18} /></button>
        </div>
        <div className="p-3 border-b border-[#F0EDE8]/5 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
            <input value={q} onChange={(e) => setQuery(e.target.value)} placeholder="Search…"
              className="w-full bg-[#121212] border border-[#F0EDE8]/10 text-sm rounded-md py-1.5 pl-8 pr-3 text-[#F0EDE8]"
              data-testid="attach-media-picker-search" />
          </div>
          <select value={scope} onChange={(e) => setScope(e.target.value)}
            className="bg-[#121212] border border-[#F0EDE8]/10 text-sm rounded-md py-1.5 px-2 text-[#F0EDE8]" data-testid="attach-media-picker-scope">
            <option value="all">All media</option>
            {jobId && <option value="project">This project</option>}
            <option value="recent">Recent</option>
            <option value="favourites">Favourites</option>
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="bg-[#121212] border border-[#F0EDE8]/10 text-sm rounded-md py-1.5 px-2 text-[#F0EDE8]" data-testid="attach-media-picker-category">
            <option value="">All categories</option>
            {MEDIA_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="py-10 text-center text-[#706D66]"><Loader2 size={16} className="animate-spin inline mr-2" /> Loading…</div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-[#706D66]">
              <ImageIcon size={32} className="mx-auto mb-2 opacity-40" />
              <p>Nothing matches. Try uploading first from the tool bar above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {items.map((m) => {
                const already = selectedIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => !already && onPick(m)}
                    disabled={already}
                    className={`relative aspect-square rounded overflow-hidden border ${already ? "border-[#E8A020]/40 opacity-50" : "border-[#F0EDE8]/10 hover:border-[#E8A020]/50"}`}
                    data-testid={`attach-media-picker-item-${m.id}`}
                  >
                    <img src={thumbSrc(m)} alt="" className="w-full h-full object-cover" loading="lazy" />
                    {m.kind === "video" && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <Play size={20} className="text-white/80" />
                      </div>
                    )}
                    {already && (
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] bg-black/50 text-[#E8A020] font-medium">Attached</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Convenience: record which document uses which media. Call after saving/generating.
export async function recordDocMediaUsage(mediaList, { docId, docType, docTitle }) {
  if (!mediaList || !docId) return;
  await Promise.all(mediaList.map((m) => recordUsage(m.id, { docId, docType, docTitle }).catch(() => {})));
}

// Convenience: clear usage when a document is deleted / re-generated with a
// different media set.
export async function clearDocMediaUsage(mediaList, docId) {
  if (!mediaList || !docId) return;
  await Promise.all(mediaList.map((m) => clearUsage(m.id, docId).catch(() => {})));
}
