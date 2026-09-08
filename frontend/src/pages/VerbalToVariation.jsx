import { useState, useRef } from "react";
import ToolHeader, { ResultActions } from "../components/ToolHeader";
import LiveSignatureBlock from "../components/LiveSignatureBlock";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { Mic, MicOff, Loader2, Wand2, AlertCircle } from "lucide-react";
import { VARIATION_STATUS_ORDER } from "../lib/uk-format";

const TOOL = {
  id: "verbal-to-variation",
  name: "Verbal to Variation",
  section: "documents",
  info: "Record yourself describing a verbal instruction you received on site (who said it, what they asked you to do, when). Morris transcribes it and converts it into a formal variation letter. Ready to send before you've left site. If the transcript is thin or the voice API isn't available, fill in the structured fields below and Morris will draft a clean Variation Letter from those.",
};

const isoToday = () => new Date().toISOString().slice(0, 10);

export default function VerbalToVariation() {
  const { user, refresh } = useAuth();
  const [infoOpen, setInfoOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState("");
  const [refNumber, setRefNumber] = useState("");
  const [genError, setGenError] = useState("");
  const [liveSignature, setLiveSignature] = useState("");
  const [clientSignature, setClientSignature] = useState("");

  // Structured fallback fields so the tool never relies purely on transcript
  // inference. Users can dictate AND fill in / correct these before drafting.
  const [project, setProject] = useState("");
  const [instructedBy, setInstructedBy] = useState("");
  const [instructionDate, setInstructionDate] = useState(isoToday());
  const [description, setDescription] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [additionalDays, setAdditionalDays] = useState("");
  const [status, setStatus] = useState("Draft");
  const [reference, setReference] = useState("");

  const recRef = useRef(null);
  const supported = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  const start = () => {
    if (!supported) { toast.error("Voice not supported on this browser. Type your instruction below or use the structured fields."); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = "en-GB"; r.continuous = true; r.interimResults = true;
    r.onresult = (e) => {
      let txt = "";
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript + " ";
      setTranscript(txt.trim());
    };
    r.onerror = (e) => { toast.error("Voice error: " + e.error); setRecording(false); };
    r.onend = () => setRecording(false);
    r.start(); recRef.current = r; setRecording(true);
  };
  const stop = () => { if (recRef.current) recRef.current.stop(); setRecording(false); };

  const onGenerate = async () => {
    setGenerating(true); setResult(""); setRefNumber(""); setGenError("");
    try {
      const structured = {
        verbalInstruction: transcript || "(no transcript provided)",
        project: project || "",
        instructedBy: instructedBy || "",
        instructionDate: instructionDate || "",
        description: description || "",
        estimatedValue: estimatedValue || "",
        additionalDays: additionalDays || "",
        status: status || "Draft",
        reference: reference || "",
      };
      const r = await api.post("/generate", {
        toolId: TOOL.id,
        toolName: TOOL.name,
        promptTemplate:
          "Take this verbal instruction from a UK construction site and turn it into a formal Variation Letter / Confirmation of Verbal Instruction (CVI) addressed to the issuing party. " +
          "Use the STRUCTURED fields as the source of truth for project, instructor, date, description, estimated value, additional programme days, status and reference. " +
          "The transcript is supporting evidence — quote it verbatim in a 'Verbal instruction — as recorded' block if it is non-empty. " +
          "Reference the Housing Grants, Construction and Regeneration Act 1996 in the authorisation section. " +
          "Use UK construction conventions and DD/MM/YYYY dates. " +
          "If both the transcript and every structured field are empty, produce a clean fillable template the user can complete offline.",
        userInputs: structured,
        trade: user?.trade, companyName: user?.companyName, fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = ["verbal-to-variation", ...(user?.recentlyUsed || []).filter(x => x !== "verbal-to-variation")].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* non-fatal */ }
      toast.success("Variation Letter drafted.");
    } catch (err) {
      const s = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (s === 401) {
        // Global interceptor is handling session-expired UX; keep form data.
      } else if (s === 402) {
        setGenError(typeof detail === "string" ? detail : "Free plan limit reached — please upgrade to keep drafting.");
        toast.error("Free plan limit reached.");
      } else if (s === 429) {
        setGenError("Morris is busy right now — please wait a moment and try again. Your inputs are preserved.");
        toast.error("Server busy — try again shortly.");
      } else if (!err?.response) {
        setGenError("Network error — Morris couldn't reach the server. Your inputs are preserved.");
        toast.error("Network error.");
      } else {
        setGenError(typeof detail === "string" ? detail : "Generation failed — your inputs are preserved, please try again.");
        toast.error("Generation failed.");
      }
    }
    finally { setGenerating(false); }
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid="page-verbal-to-variation">
      <ToolHeader tool={TOOL} infoOpen={infoOpen} setInfoOpen={setInfoOpen} />
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card-dark p-6">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4">Record verbal instruction</div>
          <div className="flex flex-col items-center justify-center py-6">
            <button
              onClick={recording ? stop : start}
              className={`w-28 h-28 rounded-full flex items-center justify-center transition-all ${recording ? "bg-[#E8A020] text-[#060606]" : "bg-[#121212] border border-[#E8A020]/40 text-[#E8A020]"}`}
              data-testid="mic-btn"
            >
              {recording ? <MicOff size={36} /> : <Mic size={36} />}
            </button>
            <div className="mt-4 text-sm text-[#A19D94]">{recording ? "Recording… tap to stop" : (supported ? "Tap to record" : "Voice not supported. Type below or use the structured fields.")}</div>
          </div>
          <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2 mt-4">Transcript</div>
          <textarea
            rows={6}
            className="input-base resize-y"
            placeholder="What was said on site… (e.g. 'The site foreman just told me to add another fire damper at level 3 grid B7…')"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            data-testid="transcript-textarea"
          />

          {/* Structured fallback fields. Users can dictate AND edit these
              before generating. Morris uses these as the source of truth. */}
          <div className="mt-5 pt-5 border-t border-[#F0EDE8]/10" data-testid="v2v-structured-block">
            <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Structured details (review before generating)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FieldText label="Project / Site" value={project} onChange={setProject} testId="v2v-project" />
              <FieldText label="Instructed by (name + role)" value={instructedBy} onChange={setInstructedBy} testId="v2v-instructed-by" />
              <FieldText label="Instruction date" value={instructionDate} onChange={setInstructionDate} type="date" testId="v2v-instruction-date" />
              <FieldText label="Reference (optional, e.g. VO-005)" value={reference} onChange={setReference} testId="v2v-reference" />
              <div className="sm:col-span-2">
                <div className="text-[10px] uppercase tracking-widest text-[#A19D94] mb-1">Description / scope</div>
                <textarea
                  rows={2}
                  className="input-base resize-y"
                  placeholder="What extra work or change was instructed? Where on site?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  data-testid="v2v-description"
                />
              </div>
              <FieldText label="Estimated variation value (£)" value={estimatedValue} onChange={setEstimatedValue} type="number" testId="v2v-estimated-value" />
              <FieldText label="Additional programme days" value={additionalDays} onChange={setAdditionalDays} type="number" testId="v2v-additional-days" />
              <FieldSelect
                label="Status"
                value={status}
                onChange={setStatus}
                options={VARIATION_STATUS_ORDER}
                testId="v2v-status"
              />
            </div>
          </div>

          <div className="mt-5 space-y-3" data-testid="signature-pads">
            <LiveSignatureBlock
              label="Your Signature"
              subtitle="Sign here as the contractor / sender"
              value={liveSignature}
              onChange={setLiveSignature}
              savedSignature={user?.signature}
              testIdPrefix="live-sig"
            />
            <LiveSignatureBlock
              label="Client or Contractor Signature"
              subtitle="Optional. Leave blank for the recipient to sign on the printed PDF"
              value={clientSignature}
              onChange={setClientSignature}
              savedSignature={null}
              allowBlank
              testIdPrefix="client-sig"
            />
          </div>
          <button onClick={onGenerate} className="btn-primary w-full mt-4 flex items-center justify-center gap-2" disabled={generating} data-testid="generate-variation-btn">
            {generating ? <><Loader2 size={16} className="animate-spin" /> Writing…</> : <><Wand2 size={16} /> Turn into Variation Letter</>}
          </button>
          {genError && (
            <div
              className="mt-3 p-3 rounded flex items-start gap-2 text-sm"
              style={{ border: "1px solid rgba(229,99,90,0.4)", background: "rgba(229,99,90,0.08)", color: "#F0EDE8" }}
              data-testid="v2v-gen-error"
            >
              <AlertCircle size={16} className="text-[#E5635A] mt-0.5 flex-shrink-0" />
              <div>{genError}</div>
            </div>
          )}
        </div>
        <div className="card-dark p-6 min-h-[400px]">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4 flex items-center justify-between gap-3">
            <span>Formal Variation Letter</span>
            {refNumber && (
              <span className="text-[10px] tracking-[0.2em] text-[#E8A020]" data-testid="v2v-ref-number">REF: {refNumber}</span>
            )}
          </div>
          {generating && <div className="flex flex-col items-center py-12 gap-4 text-[#A19D94]"><div className="spinner" /><div className="text-sm">Drafting your letter…</div></div>}
          {!generating && !result && <div className="text-sm text-[#706D66] italic">Your variation letter will appear here.</div>}
          {result && (
            <>
              <div className="tool-result text-sm" data-testid="generated-content">{result}</div>
              <ResultActions title="Verbal Instruction. Variation Letter" content={result} toolId={TOOL.id} refNumber={refNumber} liveSignature={liveSignature} clientSignature={clientSignature} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldText({ label, value, onChange, type = "text", testId }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <input
        type={type}
        className="input-base !py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      />
    </label>
  );
}

function FieldSelect({ label, value, onChange, options, testId }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <select
        className="input-base !py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
