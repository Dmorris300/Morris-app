import { useState, useRef } from "react";
import ToolHeader, { ResultActions } from "../components/ToolHeader";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { Camera, Loader2, Wand2, Upload } from "lucide-react";

const TOOL = {
  id: "photo-to-document",
  name: "Photo to Document",
  section: "documents",
  info: "Photograph a scribbled note, drawing or scrap of paper from site. Morris reads what you describe in it and produces a clean, formal professional document.",
};

export default function PhotoToDocument() {
  const { user, refresh } = useAuth();
  const [infoOpen, setInfoOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [description, setDescription] = useState("");
  const [docType, setDocType] = useState("variation letter");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState("");
  const fileRef = useRef(null);

  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result);
    reader.readAsDataURL(f);
  };

  const onGenerate = async () => {
    if (!description.trim()) { toast.error("Describe what's on the photo so Morris can transcribe it"); return; }
    setGenerating(true); setResult("");
    try {
      const r = await api.post("/generate", {
        toolId: TOOL.id,
        toolName: TOOL.name,
        promptTemplate: `The user has photographed a handwritten site note. They've described what it contains below. Convert it into a clean professional ${docType} suitable for issuing to a client / main contractor. Use UK construction conventions.`,
        userInputs: { documentType: docType, contentDescription: description },
        trade: user?.trade, companyName: user?.companyName, fullName: user?.fullName,
      });
      setResult(r.data.content);
      const recent = ["photo-to-document", ...(user?.recentlyUsed || []).filter(x => x !== "photo-to-document")].slice(0, 5);
      await api.post("/profile/update", { recentlyUsed: recent });
      await refresh();
    } catch { toast.error("Generation failed"); }
    finally { setGenerating(false); }
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid="page-photo-to-document">
      <ToolHeader tool={TOOL} infoOpen={infoOpen} setInfoOpen={setInfoOpen} />
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card-dark p-6">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4">Snap or upload</div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" data-testid="photo-input" />
          <div className="flex gap-2 mb-4">
            <button onClick={() => fileRef.current?.click()} className="btn-secondary flex items-center gap-2" data-testid="capture-photo-btn">
              <Camera size={16} /> Take photo
            </button>
            <button onClick={() => { if (fileRef.current) { fileRef.current.removeAttribute("capture"); fileRef.current.click(); fileRef.current.setAttribute("capture", "environment"); } }} className="btn-secondary flex items-center gap-2" data-testid="upload-photo-btn">
              <Upload size={16} /> Upload
            </button>
          </div>
          {preview && (
            <div className="mb-4 rounded-md overflow-hidden border border-[#E8A020]/20">
              <img src={preview} alt="Preview" className="w-full max-h-64 object-contain bg-black" data-testid="photo-preview" />
            </div>
          )}
          <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">Output document type</div>
          <select className="input-base mb-4" value={docType} onChange={(e) => setDocType(e.target.value)} data-testid="doctype-select">
            <option>variation letter</option>
            <option>site instruction confirmation</option>
            <option>quote</option>
            <option>meeting notes</option>
            <option>scope of works</option>
            <option>incident report</option>
          </select>
          <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">What does the photo say?</div>
          <textarea
            rows={6}
            className="input-base resize-y"
            placeholder="Type what's written on the note in plain English…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-testid="photo-description"
          />
          <button onClick={onGenerate} className="btn-primary w-full mt-4 flex items-center justify-center gap-2" disabled={generating} data-testid="generate-photo-btn">
            {generating ? <><Loader2 size={16} className="animate-spin" /> Writing…</> : <><Wand2 size={16} /> Convert to document</>}
          </button>
        </div>
        <div className="card-dark p-6 min-h-[400px]">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4">Generated document</div>
          {generating && <div className="flex flex-col items-center py-12 gap-4 text-[#A19D94]"><div className="spinner" /><div className="text-sm">Cleaning it up…</div></div>}
          {!generating && !result && <div className="text-sm text-[#706D66] italic">Your professional document will appear here.</div>}
          {result && (
            <>
              <div className="tool-result text-sm" data-testid="generated-content">{result}</div>
              <ResultActions title={`Photo to Document. ${docType}`} content={result} toolId={TOOL.id} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
