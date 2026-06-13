import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronDown, ChevronUp, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, AlertTriangle, Shield } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID = "risk-register";
const TOOL_NAME = "Risk Register";
const TOOL_INFO =
  "Risk register required under the Management of Health and Safety at Work Regulations 1999. Standard risk matrix scoring (likelihood × severity). Documents hazards, controls, and residual risk for every activity on site.";

const isoToday = () => new Date().toISOString().slice(0, 10);
const inOneYearIso = () => {
  const d = new Date(); d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Risk band lookup: 1-4 Low (green), 5-12 Medium (gold), 13-25 High (red)
function riskBand(score) {
  const n = Number(score) || 0;
  if (n <= 0)  return { id: "none", label: "—",            hex: "#706D66", bg: "transparent" };
  if (n <= 4)  return { id: "low",  label: "Low Risk",     hex: "#22C55E", bg: "rgba(34,197,94,0.12)" };
  if (n <= 12) return { id: "med",  label: "Medium Risk",  hex: "#E8A020", bg: "rgba(232,160,32,0.12)" };
  return                 { id: "high", label: "High Risk",  hex: "#EF4444", bg: "rgba(239,68,68,0.12)" };
}

const LIKELIHOOD_GUIDE = [
  "1 — Very unlikely",
  "2 — Unlikely",
  "3 — Possible",
  "4 — Likely",
  "5 — Very likely / almost certain",
];
const SEVERITY_GUIDE = [
  "1 — Negligible (minor inconvenience)",
  "2 — Minor (first aid injury)",
  "3 — Moderate (lost time injury, medical treatment)",
  "4 — Major (serious injury, hospitalisation)",
  "5 — Catastrophic (fatality or permanent disability)",
];

function makeRow() {
  return {
    id: crypto.randomUUID(),
    hazard: "",
    whoAtRisk: "",
    likelihoodBefore: 3,
    severityBefore: 3,
    controls: "",
    likelihoodAfter: 1,
    severityAfter: 1,
    responsible: "",
    action: "",
  };
}

const RANK = { none: 0, low: 1, med: 2, high: 3 };

export default function RiskRegister() {
  const { user, refresh } = useAuth();

  // SECTION 1
  const [project, setProject]               = useState("");
  const [siteAddress, setSiteAddress]       = useState("");
  const [assessmentDate, setAssessmentDate] = useState(isoToday());
  const [reviewDate, setReviewDate]         = useState(inOneYearIso());
  const [showMatrix, setShowMatrix]         = useState(false);

  // SECTION 3
  const [rows, setRows] = useState([makeRow()]);

  // sign-off / output
  const [infoOpen, setInfoOpen]       = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [result, setResult]           = useState("");
  const [refNumber, setRefNumber]     = useState("");
  const [liveSignature, setLiveSignature] = useState("");

  const isFav = (user?.favourites || []).includes(TOOL_ID);
  const toggleFav = async () => {
    const cur = user?.favourites || [];
    const next = isFav ? cur.filter((x) => x !== TOOL_ID) : [...cur, TOOL_ID];
    try {
      await api.post("/profile/update", { favourites: next });
      await refresh();
      toast.success(isFav ? "Removed from favourites" : "Added to favourites");
    } catch { toast.error("Could not update favourites"); }
  };

  const refFor = (idx) => `R-${String(idx + 1).padStart(3, "0")}`;

  const updateRow = (id, field, value) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const removeRow = (id) =>
    setRows((rs) => rs.filter((r) => r.id !== id));
  const addRow = () => setRows((rs) => [...rs, makeRow()]);

  // Overall summary
  const summary = useMemo(() => {
    const pop = rows.filter((r) => (r.hazard || "").trim());
    let highBefore = 0, highAfter = 0, medAfter = 0, lowAfter = 0;
    let worstAfter = riskBand(0);
    for (const r of pop) {
      const before = riskBand(r.likelihoodBefore * r.severityBefore);
      const after  = riskBand(r.likelihoodAfter  * r.severityAfter);
      if (before.id === "high") highBefore++;
      if (after.id === "high")  highAfter++;
      if (after.id === "med")   medAfter++;
      if (after.id === "low")   lowAfter++;
      if (RANK[after.id] > RANK[worstAfter.id]) worstAfter = after;
    }
    return { total: pop.length, highBefore, highAfter, medAfter, lowAfter, worstAfter };
  }, [rows]);

  const onGenerate = async () => {
    if (!project.trim()) { toast.error("Add a project / site name"); return; }
    const pop = rows.filter((r) => (r.hazard || "").trim());
    if (pop.length === 0) { toast.error("Add at least one hazard"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const rowsBlock = pop.map((r, i) => {
      const before = r.likelihoodBefore * r.severityBefore;
      const after  = r.likelihoodAfter  * r.severityAfter;
      const beforeBand = riskBand(before).label;
      const afterBand  = riskBand(after).label;
      return [
        `Reference: ${refFor(i)}`,
        `Hazard: ${r.hazard}`,
        `Who is at Risk: ${r.whoAtRisk || "—"}`,
        `Likelihood Before: ${r.likelihoodBefore}`,
        `Severity Before: ${r.severityBefore}`,
        `Initial Risk Rating: ${before} (${beforeBand})`,
        `Control Measures: ${r.controls || "—"}`,
        `Likelihood After: ${r.likelihoodAfter}`,
        `Severity After: ${r.severityAfter}`,
        `Residual Risk Rating: ${after} (${afterBand})`,
        `Responsible Person: ${r.responsible || "—"}`,
        `Action Required: ${r.action || "—"}`,
      ].join(" | ");
    }).join("\n");

    const promptTemplate = `Produce a UK RISK REGISTER under the Management of Health and Safety at Work Regulations 1999 and the Health and Safety at Work etc. Act 1974. Plain direct construction English. No padding. No banned consultant words. This is a legal-grade compliance document.

1. HEADER — DOCUMENT REFERENCE, DATE (use {assessmentDate} in DD/MM/YYYY format), REVIEW DATE ({reviewDate} in DD/MM/YYYY).

2. TITLE — exactly: 'RISK REGISTER — {project} — {assessmentDate}'.

3. REGISTER DETAILS — list on separate lines (skip blanks cleanly):
   Project / Site: {project}
   Site Address: {siteAddress}
   Date of Assessment: {assessmentDate}
   Assessed by: {assessedBy}
   Trade / Activity: {trade}
   Review Date: {reviewDate}

4. RISK MATRIX GUIDE — print verbatim:
   Likelihood Score: 1 Very unlikely, 2 Unlikely, 3 Possible, 4 Likely, 5 Very likely / almost certain.
   Severity Score: 1 Negligible (minor inconvenience), 2 Minor (first aid injury), 3 Moderate (lost time injury, medical treatment), 4 Major (serious injury, hospitalisation), 5 Catastrophic (fatality or permanent disability).
   Risk Rating = Likelihood × Severity. 1 to 4 Low Risk (green). 5 to 12 Medium Risk (gold). 13 to 25 High Risk (red).

5. RISK REGISTER — print this header line then each hazard row verbatim, one per line, preserving the pipe-delimited column order exactly as supplied. Keep the risk rating text exact — do not shorten:
{rowsBlock}

6. OVERALL RISK SUMMARY — list on separate lines exactly:
   Total risks identified: {total}
   High risks before controls: {highBefore}
   High risks remaining after controls: {highAfter}
   Medium risks after controls: {medAfter}
   Low risks after controls: {lowAfter}
   Overall Project Risk Level: {worstAfter}

{highWarnLine}

7. LEGAL REFERENCE — print verbatim as a single paragraph:
   This risk register has been completed in accordance with the Management of Health and Safety at Work Regulations 1999 and the Health and Safety at Work etc. Act 1974. It must be reviewed whenever the scope of work or site conditions change, and at least annually.

8. FOOTER — print verbatim on its own paragraph:
   This register must be communicated to all workers involved in the activities listed before work begins. It should be retained with the project health and safety file.

9. SIGN-OFF — single assessor sign-off:
   Assessed by: {assessedBy}
   Date: {assessmentDate}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

Rules:
- Use DD/MM/YYYY for every date in the body. Never YYYY-MM-DD.
- Never invent rows or scores. Use only the supplied data.
- Never use abbreviations such as 'N/A', 'TBC' or '&'. Write words in full.
- Skip blank fields cleanly. Use '—' only where supplied.
- No banned words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct. Legal-grade.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          project,
          siteAddress,
          assessmentDate: ukDate(assessmentDate),
          reviewDate: ukDate(reviewDate),
          assessedBy: user?.fullName || "",
          trade: user?.trade || "",
          rowsBlock,
          total: String(summary.total),
          highBefore: String(summary.highBefore),
          highAfter: String(summary.highAfter),
          medAfter: String(summary.medAfter),
          lowAfter: String(summary.lowAfter),
          worstAfter: summary.worstAfter.label,
          highWarnLine: summary.highAfter > 0
            ? "High residual risks require immediate further action before work proceeds."
            : "",
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Risk Register generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Risk Register — ${project || "project"}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-risk-register">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Site Tools</div>
          <h1 className="font-display text-4xl md:text-5xl">Risk Register</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="rr-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="rr-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
        </div>
      </div>

      {infoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={() => setInfoOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="card-dark max-w-xl w-full p-6" style={{ borderColor: "#E8A020" }}>
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-display text-2xl text-[#F0EDE8]">About this tool</h3>
              <button onClick={() => setInfoOpen(false)} className="text-[#A19D94]"><X size={18}/></button>
            </div>
            <p className="text-sm text-[#A19D94] leading-relaxed">{TOOL_INFO}</p>
          </div>
        </div>
      )}

      {/* SECTION 1 */}
      <Section title="Register Details" testId="rr-section-1">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Inp label="Project Name / Site"  value={project}        onChange={setProject}        testId="rr-project" />
          <Inp label="Site Address"         value={siteAddress}    onChange={setSiteAddress}    testId="rr-site-address" />
          <Inp label="Date of Assessment"   value={assessmentDate} onChange={setAssessmentDate} type="date" testId="rr-date" />
          <Inp label="Assessed by (auto from profile)" value={user?.fullName || ""} onChange={() => {}} readOnly testId="rr-assessed-by" />
          <Inp label="Trade / Activity (auto from profile)" value={user?.trade || ""} onChange={() => {}} readOnly testId="rr-trade" />
          <Inp label="Review Date" value={reviewDate} onChange={setReviewDate} type="date" testId="rr-review-date" helper="When will this register be reviewed?" />
        </div>
      </Section>

      {/* SECTION 2 — MATRIX GUIDE */}
      <div className="card-dark p-6 mb-5" data-testid="rr-section-2">
        <button
          onClick={() => setShowMatrix((s) => !s)}
          className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#E8A020] hover:text-[#F0EDE8] transition"
          data-testid="rr-matrix-toggle"
        >
          <Shield size={14}/>
          Risk Matrix Guide
          {showMatrix ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
        </button>
        {showMatrix && (
          <div className="mt-4 grid md:grid-cols-2 gap-4" data-testid="rr-matrix-panel">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#A19D94] mb-2">Likelihood Score</div>
              <ul className="text-sm text-[#F0EDE8] space-y-1">
                {LIKELIHOOD_GUIDE.map((g) => <li key={g}>{g}</li>)}
              </ul>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#A19D94] mb-2">Severity Score</div>
              <ul className="text-sm text-[#F0EDE8] space-y-1">
                {SEVERITY_GUIDE.map((g) => <li key={g}>{g}</li>)}
              </ul>
            </div>
            <div className="md:col-span-2 grid grid-cols-3 gap-2 mt-2">
              <BandSwatch label="1 – 4 Low Risk"     id="low" />
              <BandSwatch label="5 – 12 Medium Risk"  id="med" />
              <BandSwatch label="13 – 25 High Risk"   id="high" />
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3 — RISK TABLE */}
      <Section title="Risk Register" testId="rr-section-3">
        <div className="space-y-4">
          {rows.map((r, idx) => {
            const before = (Number(r.likelihoodBefore) || 0) * (Number(r.severityBefore) || 0);
            const after  = (Number(r.likelihoodAfter)  || 0) * (Number(r.severityAfter)  || 0);
            const beforeBand = riskBand(before);
            const afterBand  = riskBand(after);
            return (
              <div key={r.id} className="p-4 rounded" style={{ background: "rgba(15,15,15,0.6)", border: "1px solid rgba(160,157,148,0.18)" }} data-testid={`rr-row-${idx}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] uppercase tracking-widest text-[#E8A020] font-mono">{refFor(idx)}</div>
                  <button onClick={() => removeRow(r.id)} className="text-[#706D66] hover:text-red-400" data-testid={`rr-${idx}-remove`}><Trash2 size={14}/></button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Inp label="Hazard Description" value={r.hazard}      onChange={(v) => updateRow(r.id, "hazard", v)}      testId={`rr-${idx}-hazard`} placeholder="What could cause harm?" />
                  <Inp label="Who is at Risk"     value={r.whoAtRisk}   onChange={(v) => updateRow(r.id, "whoAtRisk", v)}   testId={`rr-${idx}-who`}    placeholder="e.g. Operative, other trades, public" />
                </div>
                <div className="text-[10px] uppercase tracking-widest text-[#A19D94] mt-3 mb-2">Before Controls</div>
                <div className="grid grid-cols-3 gap-3">
                  <NumPick label="Likelihood (1–5)" value={r.likelihoodBefore} onChange={(v) => updateRow(r.id, "likelihoodBefore", v)} testId={`rr-${idx}-lb`} />
                  <NumPick label="Severity (1–5)"  value={r.severityBefore}   onChange={(v) => updateRow(r.id, "severityBefore", v)}   testId={`rr-${idx}-sb`} />
                  <RiskBadge before label="Initial Risk Rating" score={before} band={beforeBand} testId={`rr-${idx}-initial`} />
                </div>
                <div className="mt-3">
                  <label className="block">
                    <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">Control Measures</div>
                    <textarea
                      rows={3}
                      value={r.controls}
                      onChange={(e) => updateRow(r.id, "controls", e.target.value)}
                      className="input-base resize-y"
                      placeholder="What steps are in place to reduce this risk?"
                      data-testid={`rr-${idx}-controls`}
                    />
                  </label>
                </div>
                <div className="text-[10px] uppercase tracking-widest text-[#A19D94] mt-3 mb-2">After Controls</div>
                <div className="grid grid-cols-3 gap-3">
                  <NumPick label="Likelihood (1–5)" value={r.likelihoodAfter} onChange={(v) => updateRow(r.id, "likelihoodAfter", v)} testId={`rr-${idx}-la`} />
                  <NumPick label="Severity (1–5)"  value={r.severityAfter}   onChange={(v) => updateRow(r.id, "severityAfter", v)}   testId={`rr-${idx}-sa`} />
                  <RiskBadge label="Residual Risk Rating" score={after} band={afterBand} testId={`rr-${idx}-residual`} />
                </div>
                <div className="grid sm:grid-cols-2 gap-3 mt-3">
                  <Inp label="Responsible Person" value={r.responsible} onChange={(v) => updateRow(r.id, "responsible", v)} testId={`rr-${idx}-responsible`} helper="Who ensures this control is in place?" />
                  <Inp label="Action Required (optional)" value={r.action} onChange={(v) => updateRow(r.id, "action", v)} testId={`rr-${idx}-action`} helper="Any further action needed" />
                </div>
              </div>
            );
          })}
        </div>
        <button onClick={addRow} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="rr-add">
          <Plus size={12}/> Add Risk
        </button>
      </Section>

      {/* SECTION 4 — SUMMARY */}
      <Section title="Overall Risk Summary" testId="rr-section-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <Stat label="Total risks identified" value={String(summary.total)} testId="rr-stat-total" />
          <Stat label="High risks BEFORE controls" value={String(summary.highBefore)} testId="rr-stat-high-before" tone={summary.highBefore > 0 ? "red" : "neutral"} />
          <Stat label="High risks AFTER controls" value={String(summary.highAfter)} testId="rr-stat-high-after" tone={summary.highAfter > 0 ? "red" : "neutral"} />
          <Stat label="Medium risks after controls" value={String(summary.medAfter)} testId="rr-stat-med-after" tone={summary.medAfter > 0 ? "gold" : "neutral"} />
          <Stat label="Low risks after controls" value={String(summary.lowAfter)} testId="rr-stat-low-after" tone={summary.lowAfter > 0 ? "green" : "neutral"} />
          <Stat label="Overall Project Risk Level" value={summary.worstAfter.label} testId="rr-stat-overall" tone={summary.worstAfter.id === "high" ? "red" : summary.worstAfter.id === "med" ? "gold" : summary.worstAfter.id === "low" ? "green" : "neutral"} />
        </div>
        {summary.highAfter > 0 && (
          <div
            className="p-3 rounded flex items-start gap-2"
            style={{ border: "1px solid #EF4444", background: "rgba(239,68,68,0.08)" }}
            data-testid="rr-high-warning"
          >
            <AlertTriangle size={16} className="text-[#EF4444] mt-0.5 flex-shrink-0" />
            <div className="text-xs text-[#F0EDE8] leading-relaxed">
              High residual risks require immediate further action before work proceeds.
            </div>
          </div>
        )}
      </Section>

      {/* SECTION 5 — SIGN OFF */}
      <Section title="Sign Off" testId="rr-section-5">
        <LiveSignatureBlock
          label="Assessor signature"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="rr-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="rr-sig-date">
          Date: {ukDate(assessmentDate) || "—"}
        </div>
        <div
          className="mt-4 p-4 rounded text-xs text-[#F0EDE8] leading-relaxed"
          style={{ border: "1px solid rgba(232,160,32,0.25)", background: "rgba(232,160,32,0.05)" }}
          data-testid="rr-legal-ref"
        >
          This risk register has been completed in accordance with the Management of Health and Safety at Work Regulations 1999
          and the Health and Safety at Work etc. Act 1974. It must be reviewed whenever the scope of work or site conditions change,
          and at least annually.
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="rr-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Risk Register</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="rr-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated register</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Risk Register — ${project}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="rr-output">{result}</pre>
        </div>
      )}
    </div>
  );
}

// ---------- bits ----------
function Section({ title, children, testId, icon }) {
  return (
    <div className="card-dark p-6 mb-5" data-testid={testId}>
      <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4 flex items-center gap-2">
        {icon}{title}
      </div>
      {children}
    </div>
  );
}

function Inp({ label, value, onChange, type = "text", testId, helper, readOnly, placeholder }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="input-base"
        readOnly={readOnly}
        placeholder={placeholder}
        data-testid={testId}
      />
      {helper && <div className="text-[10px] text-[#706D66] mt-1">{helper}</div>}
    </label>
  );
}

function NumPick({ label, value, onChange, testId }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <div className="flex gap-1" data-testid={testId}>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = Number(value) === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className="w-9 h-9 rounded text-sm font-display transition"
              style={{
                background: active ? "rgba(232,160,32,0.18)" : "transparent",
                border: `1px solid ${active ? "#E8A020" : "rgba(160,157,148,0.25)"}`,
                color: active ? "#E8A020" : "#A19D94",
              }}
              data-testid={`${testId}-${n}`}
            >{n}</button>
          );
        })}
      </div>
    </div>
  );
}

function RiskBadge({ label, score, band, testId }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <div
        className="px-3 py-2 rounded text-sm font-display"
        style={{ background: band.bg, border: `1px solid ${band.hex}`, color: band.hex }}
        data-testid={testId}
      >
        {score > 0 ? `${score} — ${band.label}` : "—"}
      </div>
    </div>
  );
}

function BandSwatch({ label, id }) {
  const b = riskBand(id === "low" ? 2 : id === "med" ? 8 : 20);
  return (
    <div className="px-3 py-2 rounded text-xs text-center font-semibold" style={{ background: b.bg, border: `1px solid ${b.hex}`, color: b.hex }}>
      {label}
    </div>
  );
}

function Stat({ label, value, testId, tone }) {
  const palette = {
    red:    { fg: "#EF4444", bg: "rgba(239,68,68,0.10)",  bd: "#EF4444" },
    gold:   { fg: "#E8A020", bg: "rgba(232,160,32,0.10)", bd: "#E8A020" },
    green:  { fg: "#22C55E", bg: "rgba(34,197,94,0.10)",  bd: "#22C55E" },
    neutral:{ fg: "#F0EDE8", bg: "rgba(15,15,15,0.6)",    bd: "rgba(160,157,148,0.18)" },
  }[tone || "neutral"];
  return (
    <div
      data-testid={testId}
      className="p-4 rounded"
      style={{ background: palette.bg, border: `1px solid ${palette.bd}` }}
    >
      <div className="text-[10px] uppercase tracking-widest text-[#706D66] mb-1">{label}</div>
      <div className="font-display text-2xl" style={{ color: palette.fg }}>{value}</div>
    </div>
  );
}
