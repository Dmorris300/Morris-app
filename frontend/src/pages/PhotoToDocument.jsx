import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ToolHeader from "../components/ToolHeader";
import { toast } from "sonner";
import { Camera, Upload, X, ArrowRight, IdCard, RotateCcw, Check, ChevronDown, ChevronUp } from "lucide-react";

const TOOL = {
  id: "photo-to-document",
  name: "Photo to Document",
  section: "documents",
  info: "Snap up to 5 photos from site and attach them to any of your usual document forms. Each photo is stamped with date, time and location, and embedded in the generated PDF under a 'Photographic Evidence' section.",
};

const MOST_USEFUL = [
  { id: "snagging-list",    label: "Snagging List" },
  { id: "incident-report",  label: "Incident Report" },
  { id: "delivery-record",  label: "Delivery Record" },
  { id: "site-diary",       label: "Site Diary" },
  { id: "asbestos-record",  label: "Asbestos Record" },
  { id: "dispute-timeline", label: "Dispute Timeline" },
  { id: "variation-letter", label: "Variation Order" },
  { id: "complaint-letter", label: "Complaint Letter" },
];

const OTHER_DOC_TYPES = [
  { id: "rams",                  label: "RAMS" },
  { id: "quote-builder",         label: "Quote" },
  { id: "incident-log",          label: "Incident Log" },
  { id: "scope-of-works",        label: "Scope of Works" },
  { id: "contract-review",       label: "Contract Review" },
  { id: "meeting-notes",         label: "Meeting Notes" },
  { id: "toolbox-talk",          label: "Toolbox Talk" },
  { id: "defects-tracker",       label: "Defects Tracker" },
  { id: "weather-log",           label: "Weather Log" },
  { id: "measurement-record",    label: "Measurement Record" },
  { id: "purchase-order",        label: "Purchase Order" },
  { id: "progress-report",       label: "Progress Report" },
  { id: "site-access-permit",    label: "Site Access Permit" },
];

const STORAGE_KEY      = "morris_photo_intent_v1";
const LIBRARY_KEY      = "morris_photo_library_v1";
const MAX_PHOTOS       = 5;
const MAX_LIBRARY_SIZE = 200;

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

// Stamp date/time/location onto the bottom-left of the image. Returns a JPEG dataURL.
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

function appendToLibrary(entry) {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const next = [entry, ...list].slice(0, MAX_LIBRARY_SIZE);
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(next));
  } catch { /* ignore quota errors */ }
}

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

export default function PhotoToDocument() {
  const [infoOpen, setInfoOpen] = useState(false);
  // Photos already accepted (after Use Photo): [{ id, dataUrl, note, capturedAt, ukDate, time, location }]
  const [photos, setPhotos] = useState([]);
  // Pending preview before user accepts Retake / Use Photo
  const [pending, setPending] = useState(null);
  const [docType, setDocType] = useState("snagging-list");
  const [showOther, setShowOther] = useState(false);
  const fileRef = useRef(null);
  const nav = useNavigate();

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    if (photos.length >= MAX_PHOTOS) { toast.error(`Maximum ${MAX_PHOTOS} photos per document`); return; }
    try {
      const dataUrl = await compress(f);
      const stamp = nowParts();
      const location = await getLocationLabel();
      const stamped = await stampImage(dataUrl, { ukDate: stamp.ukDate, time: stamp.time, location });
      setPending({
        id: crypto.randomUUID(),
        dataUrl: stamped,
        note: "",
        capturedAt: stamp.capturedAt,
        ukDate: stamp.ukDate,
        time: stamp.time,
        location: location || "",
      });
      toast.success("Photo captured. Review and choose Use Photo or Retake.");
    } catch {
      toast.error("Could not read that image");
    }
  };

  const usePhoto = () => {
    if (!pending) return;
    setPhotos((curr) => [...curr, pending]);
    setPending(null);
  };
  const retakePhoto = () => {
    setPending(null);
    fileRef.current?.click();
  };

  const removePhoto = (id) => setPhotos((curr) => curr.filter((p) => p.id !== id));
  const updateNote = (id, note) => setPhotos((curr) => curr.map((p) => (p.id === id ? { ...p, note } : p)));

  const docLabel = (id) =>
    [...MOST_USEFUL, ...OTHER_DOC_TYPES].find((d) => d.id === id)?.label || "document";

  const onContinue = () => {
    if (photos.length === 0) { toast.error("Add at least one photo first"); return; }
    // Persist library entries — one per photo — so they appear in Site Photo Library
    photos.forEach((p) => {
      appendToLibrary({
        id: p.id,
        thumbnail: p.dataUrl,
        capturedAt: p.capturedAt,
        ukDate: p.ukDate,
        time: p.time,
        location: p.location,
        note: p.note,
        docType,
        docTypeLabel: docLabel(docType),
        projectName: "",
      });
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        toolId: docType,
        // Keep `photo` for backward-compat (first photo) plus the new array.
        photo: photos[0].dataUrl,
        photoCaption: photos[0].note || `Evidence photo — ${photos[0].ukDate} ${photos[0].time}${photos[0].location ? ` · ${photos[0].location}` : ""}`,
        photos,
        createdAt: Date.now(),
      }));
    } catch {
      toast.error("Photos too large to attach. Try fewer or smaller images.");
      return;
    }
    nav(`/app/tool/${docType}`);
  };

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto" data-testid="page-photo-to-document">
      <ToolHeader tool={TOOL} infoOpen={infoOpen} setInfoOpen={setInfoOpen} />

      {/* Step 1: photos */}
      <div className="card-dark p-6 mb-4" data-testid="photo-step-1">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-widest text-[#E8A020]">Step 1. Add photos (up to {MAX_PHOTOS})</div>
          <div className="text-[10px] text-[#706D66]">{photos.length} / {MAX_PHOTOS}</div>
        </div>

        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" data-testid="photo-input" />

        {pending ? (
          <div className="rounded-md overflow-hidden border border-[#E8A020]/30" data-testid="photo-pending-block">
            <img src={pending.dataUrl} alt="Pending" className="w-full max-h-80 object-contain bg-black" data-testid="photo-pending" />
            <div className="flex gap-2 p-3 bg-[#0a0a0a] flex-wrap">
              <button onClick={retakePhoto} className="btn-secondary flex items-center gap-2 text-xs" data-testid="photo-retake-btn">
                <RotateCcw size={14}/> Retake
              </button>
              <button onClick={usePhoto} className="btn-primary flex items-center gap-2 text-xs" data-testid="photo-use-btn">
                <Check size={14}/> Use Photo
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-4 flex-wrap">
              <button
                onClick={() => fileRef.current?.click()}
                className="btn-secondary flex items-center gap-2"
                disabled={photos.length >= MAX_PHOTOS}
                data-testid="capture-photo-btn"
              >
                <Camera size={16} /> Take photo
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="btn-secondary flex items-center gap-2"
                disabled={photos.length >= MAX_PHOTOS}
                data-testid="upload-photo-btn"
              >
                <Upload size={16} /> Upload from device
              </button>
            </div>

            {photos.length === 0 ? (
              <div className="rounded-md border border-dashed border-[#3d3d3d] bg-[#0a0a0a] p-10 flex flex-col items-center justify-center text-[#706D66]" data-testid="photo-empty">
                <IdCard size={28} className="text-[#3d3d3d] mb-2" />
                <div className="text-xs text-center max-w-xs">
                  No photos yet. Snap up to {MAX_PHOTOS} from site or upload from your device. Each will be stamped with date, time and location.
                </div>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="photos-list">
                {photos.map((p, idx) => (
                  <div key={p.id} className="rounded-md overflow-hidden border border-[#A19D94]/20 bg-[#0a0a0a]" data-testid={`photo-thumb-${idx}`}>
                    <div className="relative">
                      <img src={p.dataUrl} alt={`Photo ${idx + 1}`} className="w-full h-32 object-cover" />
                      <button
                        onClick={() => removePhoto(p.id)}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-[#0a0a0a]/80 text-[#FF8A8A] hover:bg-[#DC3C3C] hover:text-white flex items-center justify-center"
                        title="Remove this photo"
                        data-testid={`photo-thumb-${idx}-remove`}
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <div className="p-2">
                      <input
                        type="text"
                        value={p.note}
                        onChange={(e) => updateNote(p.id, e.target.value)}
                        placeholder="e.g. Crack in beam, north corner of plant room"
                        className="input-base !py-1 !text-xs"
                        data-testid={`photo-thumb-${idx}-note`}
                      />
                      <div className="text-[9px] text-[#706D66] mt-1 truncate">
                        {p.ukDate} · {p.time}{p.location ? ` · ${p.location}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Step 2: doc type */}
      <div className="card-dark p-6 mb-4" data-testid="photo-step-2">
        <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Step 2. Choose the document type</div>

        <div className="text-[10px] uppercase tracking-widest text-[#A19D94] mb-2">Most useful for photos</div>
        <div className="grid sm:grid-cols-2 gap-2 mb-3" data-testid="doctype-most-useful">
          {MOST_USEFUL.map((d) => (
            <button
              key={d.id}
              onClick={() => setDocType(d.id)}
              className={`px-3 py-2 rounded text-xs text-left ${docType === d.id ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94] hover:text-[#F0EDE8]"}`}
              data-testid={`doctype-option-${d.id}`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowOther((v) => !v)}
          className="text-xs text-[#A19D94] hover:text-[#E8A020] flex items-center gap-1"
          data-testid="doctype-toggle-other"
        >
          {showOther ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
          {showOther ? "Hide other document types" : "Show all document types"}
        </button>

        {showOther && (
          <div className="grid sm:grid-cols-2 gap-2 mt-3" data-testid="doctype-other">
            {OTHER_DOC_TYPES.map((d) => (
              <button
                key={d.id}
                onClick={() => setDocType(d.id)}
                className={`px-3 py-2 rounded text-xs text-left ${docType === d.id ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94] hover:text-[#F0EDE8]"}`}
                data-testid={`doctype-option-${d.id}`}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}

        <p className="text-[11px] text-[#706D66] mt-3">
          Morris will open the {docLabel(docType)} form. All photos and notes will be attached to the final PDF under a "Photographic Evidence" section.
        </p>
      </div>

      {/* Step 3 */}
      <button
        onClick={onContinue}
        className="btn-primary w-full flex items-center justify-center gap-2"
        disabled={photos.length === 0}
        data-testid="continue-btn"
      >
        Continue to the {docLabel(docType)} form <ArrowRight size={14} />
      </button>
    </div>
  );
}
