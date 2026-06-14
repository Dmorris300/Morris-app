import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getToolById, isDualSignoff } from "../lib/tools-config";
import ToolHeader, { ResultActions } from "../components/ToolHeader";
import LiveSignatureBlock from "../components/LiveSignatureBlock";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";

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
  // Numeric/count fields must never be auto-prefilled as dates, even if the field name starts with 'day*'.
  if (field.type === "number") return "";
  const isDaysCount = /(daysLost|days_lost|daysclaimed|days_claimed|daysclaim|hoursstanding|hours_standing|menstanding|men_standing)/i.test(field.name);
  if (isDaysCount) return "";
  // Invoice / reference number / order number fields are NOT dates. The previous regex matched 'inv*' which incorrectly prefilled
  // invoice number / invoice reference / invoice amount fields with today's date.
  const isInvoiceNonDate = /^(invNo|invoiceNo|invoiceNumber|invoiceRef|invoiceReference|invoiceAmount|invAmount|invNumber|invRef|orderNo|orderNumber|orderRef|poNumber|poRef|appNo|applicationNo|applicationNumber|jobNo|jobNumber|refNumber|reference)$/i.test(field.name);
  if (isInvoiceNonDate) return "";
  const looksLikeDate = field.type === "date"
    || /(^|_)(date)(s)?$/i.test(field.name)
    || /^(date|valid|review|start|end|expir|handover|tax(point)?|completion|week)/i.test(field.name)
    || /^(invDate|invoiceDate)$/i.test(field.name);
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
  const [liveSignature, setLiveSignature] = useState("");
  const [clientSignature, setClientSignature] = useState("");
  const [attachedPhoto, setAttachedPhoto] = useState(null);
  const dual = isDualSignoff(toolId);

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
    setLiveSignature("");
    setClientSignature("");

    // Pick up any pending photo intent from Photo to Document. If the user
    // landed here via that tool, the photo is in localStorage tagged to this
    // toolId. We pull it once and clear it so it doesn't leak into other tools.
    try {
      const raw = localStorage.getItem("morris_photo_intent_v1");
      if (raw) {
        const intent = JSON.parse(raw);
        if (intent?.toolId === toolId && intent?.photo) {
          setAttachedPhoto(intent.photo);
        }
        localStorage.removeItem("morris_photo_intent_v1");
      } else {
        setAttachedPhoto(null);
      }
    } catch {
      setAttachedPhoto(null);
    }
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
  if (tool.id === "payment-chaser") return <RedirectTo path="/app/payment-chaser" />;
  if (tool.id === "self-assessment-prep") return <RedirectTo path="/app/self-assessment-prep" />;
  if (tool.id === "measurement-record") return <RedirectTo path="/app/measurement-record" />;
  if (tool.id === "prestart-meeting") return <RedirectTo path="/app/prestart-meeting" />;
  if (tool.id === "tool-register") return <RedirectTo path="/app/tool-register" />;
  if (tool.id === "noise-assessment") return <RedirectTo path="/app/noise-assessment" />;
  if (tool.id === "working-at-height-rescue") return <RedirectTo path="/app/working-at-height-rescue" />;
  if (tool.id === "manual-handling") return <RedirectTo path="/app/manual-handling" />;
  if (tool.id === "variation-instruction-log") return <RedirectTo path="/app/variation-instruction-log" />;
  if (tool.id === "retention-chaser") return <RedirectTo path="/app/retention-chaser" />;
  if (tool.id === "subbie-mgmt") return <RedirectTo path="/app/subbie-mgmt" />;
  if (tool.id === "meeting-notes") return <RedirectTo path="/app/meeting-notes" />;
  if (tool.id === "weather-log") return <RedirectTo path="/app/weather-log" />;
  if (tool.id === "risk-register") return <RedirectTo path="/app/risk-register" />;
  if (tool.id === "apprentice-manager") return <RedirectTo path="/app/apprentice-manager" />;
  if (tool.id === "procurement-schedule") return <RedirectTo path="/app/procurement-schedule" />;
  if (tool.id === "price-work-quote") return <RedirectTo path="/app/price-work-quote" />;
  if (tool.id === "rate-increase-letter") return <RedirectTo path="/app/rate-increase-letter" />;
  if (tool.id === "snagging-list") return <RedirectTo path="/app/snagging-list" />;
  if (tool.id === "contract-review") return <RedirectTo path="/app/contract-review" />;
  if (tool.id === "hmrc-correspondence") return <RedirectTo path="/app/hmrc-correspondence" />;
  if (tool.id === "bad-debt-letter") return <RedirectTo path="/app/bad-debt-letter" />;
  if (tool.id === "pricework-variation-tracker") return <RedirectTo path="/app/pricework-variation-tracker" />;
  if (tool.id === "tender-letter") return <RedirectTo path="/app/tender-letter" />;
  if (tool.id === "payment-tracker") return <RedirectTo path="/app/payment-tracker" />;
  if (tool.id === "cis-calculator") return <RedirectTo path="/app/cis-calculator" />;
  if (tool.id === "delivery-record") return <RedirectTo path="/app/delivery-record" />;
  if (tool.id === "labour-allocation") return <RedirectTo path="/app/labour-allocation" />;
  if (tool.id === "purchase-order") return <RedirectTo path="/app/purchase-order" />;

  const onGenerate = async () => {
    if (missingRequired.length > 0) {
      setMissing(missingRequired);
      toast.error(`Please complete: ${missingRequired.join(", ")}`);
      return;
    }
    setMissing([]);
    setGenerating(true); setResult(""); setRefNumber("");
    try {
      // Flatten any array values (from checkbox groups) into comma-separated strings
      // so the AI prompt reads naturally.
      const flatValues = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : v])
      );
      const r = await api.post("/generate", {
        toolId: tool.id,
        toolName: tool.name,
        promptTemplate: tool.promptTemplate,
        userInputs: flatValues,
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

      {tool.warningBanner && (
        <div
          className="mb-6 p-4 rounded flex items-start gap-3"
          style={{ border: "2px solid #E8A020", background: "rgba(232,160,32,0.08)" }}
          data-testid="tool-warning-banner"
        >
          <AlertTriangle size={20} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
          <p className="text-sm text-[#F0EDE8] leading-relaxed">{tool.warningBanner}</p>
        </div>
      )}

      {attachedPhoto && (
        <div
          className="mb-4 p-3 rounded flex items-center gap-3 flex-wrap"
          style={{ border: "1px solid rgba(232,160,32,0.35)", background: "rgba(232,160,32,0.06)" }}
          data-testid="attached-photo-banner"
        >
          <img src={attachedPhoto} alt="Attached" className="w-20 h-20 rounded object-cover border border-[#E8A020]/40" data-testid="attached-photo-thumb" />
          <div className="flex-1 min-w-[160px]">
            <div className="text-xs uppercase tracking-widest text-[#E8A020]">Photo attached via Photo to Document</div>
            <div className="text-[11px] text-[#A19D94] mt-0.5">This image will be embedded in the final PDF as evidence.</div>
          </div>
          <button
            type="button"
            onClick={() => setAttachedPhoto(null)}
            className="text-[10px] uppercase tracking-widest text-[#706D66] hover:text-[#E5635A]"
            data-testid="attached-photo-remove"
          >
            Remove
          </button>
        </div>
      )}

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
                  ) : field.type === "checkboxes" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid={`field-${field.name}`}>
                      {(field.options || []).map((opt) => {
                        const value = typeof opt === "string" ? opt : opt.value;
                        const label = typeof opt === "string" ? opt : opt.label;
                        const current = Array.isArray(values[field.name]) ? values[field.name] : [];
                        const checked = current.includes(value);
                        return (
                          <label
                            key={value}
                            className="flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition"
                            style={{
                              background: checked ? "rgba(232,160,32,0.08)" : "transparent",
                              border: `1px solid ${checked ? "rgba(232,160,32,0.45)" : "rgba(160,157,148,0.2)"}`,
                            }}
                            data-testid={`field-${field.name}-${value.replace(/\s+/g, '-').toLowerCase()}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const next = checked ? current.filter((v) => v !== value) : [...current, value];
                                setValues({ ...values, [field.name]: next });
                              }}
                              className="accent-[#E8A020]"
                            />
                            <span className="text-sm" style={{ color: checked ? "#E8A020" : "#F0EDE8" }}>{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : field.type === "toggle" ? (
                    <div className="grid grid-cols-2 gap-2" data-testid={`field-${field.name}`}>
                      {["Yes", "No"].map((opt) => {
                        const active = (values[field.name] || "") === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setValues({ ...values, [field.name]: opt })}
                            className="px-3 py-2 rounded text-xs uppercase tracking-widest transition"
                            style={{
                              background: active ? "rgba(232,160,32,0.12)" : "transparent",
                              border: `1px solid ${active ? "#E8A020" : "rgba(160,157,148,0.25)"}`,
                              color: active ? "#E8A020" : "#A19D94",
                            }}
                            data-testid={`field-${field.name}-${opt.toLowerCase()}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
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
                  {field.helperText && (
                    <div className="text-[10px] text-[#706D66] mt-1 leading-relaxed">{field.helperText}</div>
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

            {/* Live signature pad(s) — appear above the Generate button on every tool. */}
            <div className="space-y-3 pt-2 border-t border-[#1a1a1a]" data-testid="signature-pads">
              <LiveSignatureBlock
                label={dual ? "Your Signature" : "Sign before generating"}
                subtitle={dual ? "Sign here as the contractor / sender" : "Your signature is stamped on the generated PDF"}
                value={liveSignature}
                onChange={setLiveSignature}
                savedSignature={user?.signature}
                testIdPrefix="live-sig"
              />
              {dual && (
                <LiveSignatureBlock
                  label="Client or Contractor Signature"
                  subtitle="Optional. Leave blank for the recipient to sign on the printed PDF"
                  value={clientSignature}
                  onChange={setClientSignature}
                  savedSignature={null}
                  allowBlank
                  testIdPrefix="client-sig"
                />
              )}
            </div>

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
              <ResultActions title={tool.name} content={result} toolId={tool.id} refNumber={refNumber} liveSignature={liveSignature} clientSignature={clientSignature} photo={attachedPhoto} photoCaption={attachedPhoto ? `Site photograph attached via Photo to Document.` : undefined} />
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
