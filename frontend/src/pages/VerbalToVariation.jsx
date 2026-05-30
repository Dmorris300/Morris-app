import { useState, useRef } from "react";
import ToolHeader, { ResultActions } from "../components/ToolHeader";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { Mic, MicOff, Loader2, Wand2 } from "lucide-react";

const TOOL = {
  id: "verbal-to-variation",
  name: "Verbal to Variation",
  section: "documents",
  info: "Record yourself describing a verbal instruction you received on site (who said it, what they asked you to do, when). Morris transcribes it and converts it into a formal variation letter. ready to send before you've left site.",
};

export default function VerbalToVariation() {
  const { user, refresh } = useAuth();
  const [infoOpen, setInfoOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState("");
  const recRef = useRef(null);
  const supported = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  const start = () => {
    if (!supported) { toast.error("Voice not supported on this browser. Type your instruction below."); return; }
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
    setGenerating(true); setResult("");
    try {
      const r = await api.post("/generate", {
        toolId: TOOL.id,
        toolName: TOOL.name,
        promptTemplate: "Take this verbal instruction from a UK construction site and turn it into a formal Variation Letter / Confirmation of Verbal Instruction (CVI) addressed to the issuing party. Reference HGCRA 1996 and request written authorisation. Use UK construction conventions. If the transcript is empty or thin, produce a clean template the user can edit and send.",
        userInputs: { verbalInstruction: transcript || "(no transcript provided. produce a clean template)" },
        trade: user?.trade, companyName: user?.companyName, fullName: user?.fullName,
      });
      setResult(r.data.content);
      const recent = ["verbal-to-variation", ...(user?.recentlyUsed || []).filter(x => x !== "verbal-to-variation")].slice(0, 5);
      await api.post("/profile/update", { recentlyUsed: recent });
      await refresh();
    } catch (e) { toast.error("Generation failed"); }
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
            <div className="mt-4 text-sm text-[#A19D94]">{recording ? "Recording… tap to stop" : (supported ? "Tap to record" : "Voice not supported. type below")}</div>
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
          <button onClick={onGenerate} className="btn-primary w-full mt-4 flex items-center justify-center gap-2" disabled={generating} data-testid="generate-variation-btn">
            {generating ? <><Loader2 size={16} className="animate-spin" /> Writing…</> : <><Wand2 size={16} /> Turn into Variation Letter</>}
          </button>
        </div>
        <div className="card-dark p-6 min-h-[400px]">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4">Formal Variation Letter</div>
          {generating && <div className="flex flex-col items-center py-12 gap-4 text-[#A19D94]"><div className="spinner" /><div className="text-sm">Drafting your letter…</div></div>}
          {!generating && !result && <div className="text-sm text-[#706D66] italic">Your variation letter will appear here.</div>}
          {result && (
            <>
              <div className="tool-result text-sm" data-testid="generated-content">{result}</div>
              <ResultActions title="Verbal Instruction. Variation Letter" content={result} toolId={TOOL.id} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
