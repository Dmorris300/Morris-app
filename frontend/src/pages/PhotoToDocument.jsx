import { useState, useRef } from "react";
import ToolHeader, { ResultActions } from "../components/ToolHeader";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { Camera, Loader2, Wand2, Upload, ScanText, X } from "lucide-react";

const TOOL = {
  id: "photo-to-document",
  name: "Photo to Document",
  section: "documents",
  info: "Photograph a scribbled note, drawing or scrap of paper from site. Morris reads the text in your photo automatically using AI vision, produces a clean professional document, and embeds the original photo as evidence.",
};

export default function PhotoToDocument() {
  const { user, refresh } = useAuth();
  const [infoOpen, setInfoOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [imageDescription, setImageDescription] = useState("");
  const [description, setDescription] = useState("");
  const [docType, setDocType] = useState("variation letter");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState("");
  const [refNumber, setRefNumber] = useState("");
  const fileRef = useRef(null);

  const onFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      setPreview(dataUrl);
      // Auto-OCR with Claude vision the moment a photo is loaded
      setExtracting(true);
      setTranscription(""); setImageDescription("");
      try {
        const r = await api.post("/vision/extract", { image: dataUrl });
        const raw = r.data.result || "";
        const tMatch = raw.match(/TRANSCRIPTION:\s*([\s\S]*?)(?=\n\s*DESCRIPTION:|$)/i);
        const dMatch = raw.match(/DESCRIPTION:\s*([\s\S]*)$/i);
        const t = (tMatch ? tMatch[1] : raw).trim();
        const d = (dMatch ? dMatch[1] : "").trim();
        setTranscription(t);
        setImageDescription(d);
        // Pre-fill the description field with the transcription so the user can edit if needed
        setDescription(prev => prev ? prev : t);
        toast.success("Photo read. Edit the text below before generating.");
      } catch (e) {
        if (process.env.NODE_ENV !== "production") console.error("Vision OCR failed", e);
        toast.error("Could not read the photo automatically. Type the contents below.");
      } finally {
        setExtracting(false);
      }
    };
    reader.readAsDataURL(f);
  };

  const clearPhoto = () => {
    setPreview(null); setTranscription(""); setImageDescription(""); setDescription("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const onGenerate = async () => {
    if (!description.trim()) { toast.error("Add or confirm the contents of the photo before generating"); return; }
    setGenerating(true); setResult(""); setRefNumber("");
    try {
      const r = await api.post("/generate", {
        toolId: TOOL.id,
        toolName: TOOL.name,
        promptTemplate: `The user has photographed a handwritten site note. The photo has been transcribed by AI vision and the user has confirmed the contents below. Convert it into a clean professional ${docType} suitable for issuing to a client or main contractor. Use UK construction conventions. Where the transcription mentions names, dates, quantities, costs or instructions, preserve them faithfully. The original photo will be attached to the PDF as evidence — refer to it in the body as 'Attached photograph (original site note)'.`,
        userInputs: {
          documentType: docType,
          aiTranscription: transcription || description,
          imageDescription: imageDescription,
          userConfirmedContents: description,
        },
        trade: user?.trade, companyName: user?.companyName, fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = ["photo-to-document", ...(user?.recentlyUsed || []).filter(x => x !== "photo-to-document")].slice(0, 5);
      await api.post("/profile/update", { recentlyUsed: recent });
      await refresh();
      toast.success("Document generated. Saved to your Vault.");
    } catch { toast.error("Generation failed"); }
    finally { setGenerating(false); }
  };

  const photoCaption = preview ? `Original site photograph. ${imageDescription ? imageDescription + " " : ""}Captured ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}.` : "";

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid="page-photo-to-document">
      <ToolHeader tool={TOOL} infoOpen={infoOpen} setInfoOpen={setInfoOpen} />
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card-dark p-6">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4">Snap or upload — Morris reads it for you</div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" data-testid="photo-input" />
          <div className="flex gap-2 mb-4 flex-wrap">
            <button onClick={() => fileRef.current?.click()} className="btn-secondary flex items-center gap-2" data-testid="capture-photo-btn">
              <Camera size={16} /> Take photo
            </button>
            <button onClick={() => { if (fileRef.current) { fileRef.current.removeAttribute("capture"); fileRef.current.click(); fileRef.current.setAttribute("capture", "environment"); } }} className="btn-secondary flex items-center gap-2" data-testid="upload-photo-btn">
              <Upload size={16} /> Upload
            </button>
            {preview && (
              <button onClick={clearPhoto} className="btn-secondary flex items-center gap-2 text-[#E5635A]" data-testid="clear-photo-btn">
                <X size={14} /> Clear
              </button>
            )}
          </div>
          {preview && (
            <div className="mb-4 rounded-md overflow-hidden border border-[#E8A020]/30 relative">
              <img src={preview} alt="Preview" className="w-full max-h-64 object-contain bg-black" data-testid="photo-preview" />
              {extracting && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3" data-testid="extracting-overlay">
                  <Loader2 size={24} className="animate-spin text-[#E8A020]" />
                  <div className="text-xs uppercase tracking-widest text-[#E8A020] flex items-center gap-2"><ScanText size={14}/> Reading the photo</div>
                </div>
              )}
            </div>
          )}
          {transcription && !extracting && (
            <div className="mb-4 p-3 rounded border border-[#E8A020]/30 bg-[#E8A020]/5" data-testid="ocr-transcription">
              <div className="text-[10px] uppercase tracking-widest text-[#E8A020] flex items-center gap-2 mb-2">
                <ScanText size={12}/> AI transcription
              </div>
              <div className="text-xs text-[#F0EDE8] whitespace-pre-wrap">{transcription}</div>
              {imageDescription && (
                <div className="text-[11px] text-[#A19D94] italic mt-2 pt-2 border-t border-[#E8A020]/15">{imageDescription}</div>
              )}
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
            <option>daywork sheet</option>
            <option>verbal instruction confirmation</option>
          </select>
          <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">Confirm the contents (edit if AI missed anything)</div>
          <textarea
            rows={6}
            className="input-base resize-y"
            placeholder={extracting ? "Reading the photo…" : "The AI transcription will appear here. Edit before generating if needed."}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-testid="photo-description"
          />
          <button onClick={onGenerate} className="btn-primary w-full mt-4 flex items-center justify-center gap-2" disabled={generating || extracting} data-testid="generate-photo-btn">
            {generating ? <><Loader2 size={16} className="animate-spin" /> Writing…</> : <><Wand2 size={16} /> Convert to document</>}
          </button>
        </div>
        <div className="card-dark p-6 min-h-[400px]">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4 flex items-center justify-between gap-2">
            <span>Generated document</span>
            {refNumber && <span className="text-[10px] text-[#A19D94] normal-case tracking-normal" data-testid="ref-badge">REF: {refNumber}</span>}
          </div>
          {generating && <div className="flex flex-col items-center py-12 gap-4 text-[#A19D94]"><div className="spinner" /><div className="text-sm">Cleaning it up…</div></div>}
          {!generating && !result && <div className="text-sm text-[#706D66] italic">Snap a photo. Morris reads it. Your professional document appears here. The photo is embedded as evidence in the PDF.</div>}
          {result && (
            <>
              <div className="tool-result text-sm" data-testid="generated-content">{result}</div>
              <ResultActions title={`Photo to Document. ${docType}`} content={result} toolId={TOOL.id} photo={preview} photoCaption={photoCaption} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
