import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getToolById } from "../lib/tools-config";
import ToolHeader, { ResultActions } from "../components/ToolHeader";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const todayIso = () => new Date().toISOString().slice(0, 10);
const inOneYearIso = () => {
  const d = new Date(); d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};
const inDaysIso = (n) => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// Required-field gating has been removed globally: every field is optional and the
// generate button is always clickable. Morris will simply leave unfilled sections
// blank (or use sensible placeholders) in the generated document.
const isRequired = (_field) => false;

// Auto-default value for date-style fields. Supports field.prefill = 'today' | 'today+Nd'.
// Also defensive matching by field.name patterns so date inputs without explicit prefill still pre-populate.
const autoDefaultFor = (field) => {
  if (field.prefill === "today") return todayIso();
  if (typeof field.prefill === "string" && field.prefill.startsWith("today+")) {
    const m = field.prefill.match(/^today\+(\d+)d$/);
    if (m) return inDaysIso(parseInt(m[1], 10));
  }
  const name = (field.name || "").toLowerCase();
  const looksLikeDate = field.type === "date"
    || /(^|_)(date)(s)?$/i.test(field.name)
    || /^(date|valid|review|start|end|expir|handover|tax(point)?|completion|inv(oice)?|week|day)/i.test(field.name);
  if (!looksLikeDate) return "";
  if (name.includes("review")) return inOneYearIso();
  if (name.includes("valid")) return inDaysIso(30);
  if (name.includes("deadline")) return inDaysIso(7);
  return todayIso();
};

export default function GenericToolPage() {
  const { toolId } = useParams();
  const nav = useNavigate();
  const tool = getToolById(toolId);
  const { user, refresh } = useAuth();
  const [infoOpen, setInfoOpen] = useState(false);
  const [values, setValues] = useState({});
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState("");
  const [refNumber, setRefNumber] = useState("");
  const [missing, setMissing] = useState([]);

  // Initialise values with auto-defaults whenever the tool changes
  useEffect(() => {
    if (!tool) return;
    const init = {};
    (tool.fields || []).forEach((f) => {
      const d = autoDefaultFor(f);
      if (d) init[f.name] = d;
    });
    setValues(init);
    setResult("");
    setRefNumber("");
    setInfoOpen(false);
    setMissing([]);
  }, [toolId, tool]);

  // No required-field gating — users can generate with whatever they've entered.
  const missingRequired = [];

  if (!tool) {
    return <div className="p-8 text-[#A19D94]">Tool not found.</div>;
  }

  // Tools that are widgets, not generic forms
  if (tool.id === "earnings-dashboard") return <RedirectTo path="/app/earnings" />;
  if (tool.id === "mileage-tracker") return <RedirectTo path="/app/mileage" />;
  if (tool.id === "vat-threshold") return <RedirectTo path="/app/vat" />;
  if (tool.id === "cis-refund-predictor") return <RedirectTo path="/app/cis-predictor" />;

  const onGenerate = async () => {
    if (missingRequired.length > 0) {
      setMissing(missingRequired);
      toast.error(`Please complete: ${missingRequired.join(", ")}`);
      return;
    }
    setMissing([]);
    setGenerating(true); setResult(""); setRefNumber("");
    try {
      const r = await api.post("/generate", {
        toolId: tool.id,
        toolName: tool.name,
        promptTemplate: tool.promptTemplate,
        userInputs: values,
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      // update recently used
      const recent = [tool.id, ...(user?.recentlyUsed || []).filter(x => x !== tool.id)].slice(0, 5);
      await api.post("/profile/update", { recentlyUsed: recent });
      await refresh();
      toast.success("Document generated. Saved to your Vault.");
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 402) {
        toast.error(typeof detail === "string" ? detail : "Free plan limit reached");
        nav("/app/billing");
      } else {
        toast.error(typeof detail === "string" ? detail : "Generation failed");
      }
    } finally { setGenerating(false); }
  };

  const generateDisabled = generating;

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid={`tool-page-${tool.id}`}>
      <ToolHeader tool={tool} infoOpen={infoOpen} setInfoOpen={setInfoOpen} />

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card-dark p-6">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4">Inputs</div>
          <div className="space-y-4">
            {(tool.fields || []).map((field) => {
              const required = isRequired(field);
              const isMissingFlagged = missing.includes(field.label);
              return (
                <div key={field.name}>
                  <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2 flex items-center gap-1">
                    <span>{field.label}</span>
                    {required && <span className="text-[#E8A020]" data-testid={`req-${field.name}`}>*</span>}
                  </div>
                  {field.type === "textarea" ? (
                    <textarea
                      rows={4}
                      className={`input-base resize-y ${isMissingFlagged ? "border-red-500" : ""}`}
                      placeholder={field.placeholder}
                      value={values[field.name] || ""}
                      onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                      data-testid={`field-${field.name}`}
                    />
                  ) : field.type === "select" ? (
                    <select
                      className={`input-base ${isMissingFlagged ? "border-red-500" : ""}`}
                      value={values[field.name] || ""}
                      onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                      data-testid={`field-${field.name}`}
                    >
                      <option value="">— Choose —</option>
                      {(field.options || []).map((opt) => {
                        const value = typeof opt === "string" ? opt : opt.value;
                        const label = typeof opt === "string" ? opt : opt.label;
                        return <option key={value} value={value}>{label}</option>;
                      })}
                    </select>
                  ) : (
                    <input
                      type={field.type || "text"}
                      className={`input-base ${isMissingFlagged ? "border-red-500" : ""}`}
                      placeholder={field.placeholder}
                      value={values[field.name] || ""}
                      onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                      data-testid={`field-${field.name}`}
                    />
                  )}
                </div>
              );
            })}
            {(!tool.fields || tool.fields.length === 0) && (
              <p className="text-sm text-[#A19D94]">No inputs needed — just hit generate. Morris will use your profile and trade.</p>
            )}
            {missing.length > 0 && (
              <div className="text-xs text-red-400" data-testid="missing-fields">
                Please complete: {missing.join(", ")}
              </div>
            )}
            <button
              onClick={onGenerate}
              className={`btn-primary w-full flex items-center justify-center gap-2 ${generateDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
              disabled={generateDisabled}
              data-testid="generate-btn"
            >
              {generating ? <><Loader2 size={16} className="animate-spin" /> Generating…</> : "Generate document"}
            </button>
          </div>
        </div>

        <div className="card-dark p-6 min-h-[400px]">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4 flex items-center justify-between gap-3">
            <span>Result</span>
            {refNumber && (
              <span className="text-[10px] tracking-[0.2em] text-[#E8A020]" data-testid="ref-number">
                REF: {refNumber}
              </span>
            )}
          </div>
          {generating && (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-[#A19D94]">
              <div className="spinner" />
              <div className="text-sm">Morris is writing your {tool.name.toLowerCase()}…</div>
            </div>
          )}
          {!generating && !result && (
            <div className="text-sm text-[#706D66] italic">Your generated document will appear here.</div>
          )}
          {result && (
            <>
              <div className="tool-result text-sm" data-testid="generated-content">{result}</div>
              <ResultActions title={tool.name} content={result} toolId={tool.id} refNumber={refNumber} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RedirectTo({ path }) {
  const nav = useNavigate();
  useEffect(() => { nav(path, { replace: true }); }, [path]);
  return null;
}
