import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ToolHeader from "../components/ToolHeader";
import { toast } from "sonner";
import { Camera, Upload, X, ArrowRight, IdCard } from "lucide-react";

const TOOL = {
  id: "photo-to-document",
  name: "Photo to Document",
  section: "documents",
  info: "Snap a photo from site and attach it to any of your usual document forms. The original photo is embedded in the generated PDF as evidence.",
};

// Allowlist of doc types per the new spec.
const DOC_TYPES = [
  { id: "rams", label: "RAMS" },
  { id: "variation-letter", label: "Variation Order" },
  { id: "site-diary", label: "Site Diary" },
  { id: "snagging-list", label: "Snagging List" },
  { id: "complaint-letter", label: "Complaint Letter" },
  { id: "quote-builder", label: "Quote" },
  { id: "incident-log", label: "Incident Report" },
];

const STORAGE_KEY = "morris_photo_intent_v1";

export default function PhotoToDocument() {
  const [infoOpen, setInfoOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [docType, setDocType] = useState("variation-letter");
  const fileRef = useRef(null);
  const nav = useNavigate();

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

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    try {
      const dataUrl = await compress(f);
      setPreview(dataUrl);
      toast.success("Photo ready. Pick a document type and continue.");
    } catch {
      toast.error("Could not read that image");
    }
  };

  const clearPhoto = () => {
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onContinue = () => {
    if (!preview) { toast.error("Add a photo first"); return; }
    // Store the photo + target tool in localStorage so the next page
    // (GenericToolPage) can pick it up. We keep it local. Cleared on use.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        toolId: docType,
        photo: preview,
        createdAt: Date.now(),
      }));
    } catch (e) {
      // localStorage quota exceeded — fall back to in-memory hand-off via state
      toast.error("Photo too large to attach. Try a smaller image.");
      return;
    }
    nav(`/app/tool/${docType}`);
  };

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto" data-testid="page-photo-to-document">
      <ToolHeader tool={TOOL} infoOpen={infoOpen} setInfoOpen={setInfoOpen} />

      {/* Step 1: photo */}
      <div className="card-dark p-6 mb-4" data-testid="photo-step-1">
        <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Step 1. Add a photo</div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" data-testid="photo-input" />
        <div className="flex gap-2 mb-4 flex-wrap">
          <button onClick={() => fileRef.current?.click()} className="btn-secondary flex items-center gap-2" data-testid="capture-photo-btn">
            <Camera size={16} /> Take photo
          </button>
          <button onClick={() => fileRef.current?.click()} className="btn-secondary flex items-center gap-2" data-testid="upload-photo-btn">
            <Upload size={16} /> Upload from device
          </button>
          {preview && (
            <button onClick={clearPhoto} className="btn-secondary flex items-center gap-2 text-[#E5635A]" data-testid="clear-photo-btn">
              <X size={14} /> Clear
            </button>
          )}
        </div>
        {preview ? (
          <div className="rounded-md overflow-hidden border border-[#E8A020]/30">
            <img src={preview} alt="Selected" className="w-full max-h-80 object-contain bg-black" data-testid="photo-preview" />
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-[#3d3d3d] bg-[#0a0a0a] p-10 flex flex-col items-center justify-center text-[#706D66]" data-testid="photo-empty">
            <IdCard size={28} className="text-[#3d3d3d] mb-2" />
            <div className="text-xs">No photo yet. Snap one from site or upload from your device.</div>
          </div>
        )}
      </div>

      {/* Step 2: doc type */}
      <div className="card-dark p-6 mb-4" data-testid="photo-step-2">
        <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Step 2. Choose the document type</div>
        <select className="input-base" value={docType} onChange={(e) => setDocType(e.target.value)} data-testid="doctype-select">
          {DOC_TYPES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
        <p className="text-[11px] text-[#706D66] mt-2">Morris will open the {DOC_TYPES.find(d => d.id === docType)?.label} form for you to fill in. The photo will be attached to the final PDF as evidence.</p>
      </div>

      {/* Step 3: go */}
      <button
        onClick={onContinue}
        className="btn-primary w-full flex items-center justify-center gap-2"
        disabled={!preview}
        data-testid="continue-btn"
      >
        Continue to the {DOC_TYPES.find(d => d.id === docType)?.label} form <ArrowRight size={14} />
      </button>
    </div>
  );
}
