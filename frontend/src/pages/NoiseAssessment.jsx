import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, Volume2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID = "noise-assessment";
const TOOL_NAME = "Noise Assessment";
const TOOL_INFO =
  "Noise risk assessment under the Control of Noise at Work Regulations 2005. Captures noise sources, exposure levels, duration, and control measures, and auto-classifies the risk level using the HSE legal action values.";

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

// Risk band lookup. Returns { id, label, hex, bg }.
// Bands are exactly per Control of Noise at Work Regulations 2005.
function riskFor(db) {
  const n = parseFloat(db);
  if (!Number.isFinite(n) || n <= 0) {
    return { id: "none", label: "—", hex: "#706D66", bg: "transparent" };
  }
  if (n < 80) {
    return { id: "low",   label: "Low Risk — No action required",
             hex: "#22C55E", bg: "rgba(34,197,94,0.12)" };
  }
  if (n < 85) {
    return { id: "lower", label: "Lower Action Value — Information and training required",
             hex: "#E8A020", bg: "rgba(232,160,32,0.12)" };
  }
  if (n < 87) {
    return { id: "upper", label: "Upper Action Value — Hearing protection must be provided and enforced",
             hex: "#F97316", bg: "rgba(249,115,22,0.12)" };
  }
  return     { id: "limit", label: "Exposure Limit Exceeded — Work must stop until controls are in place",
               hex: "#EF4444", bg: "rgba(239,68,68,0.12)" };
}

const RISK_RANK = { none: 0, low: 1, lower: 2, upper: 3, limit: 4 };

const CONTROL_ITEMS = [
  { key: "engineering",   label: "Engineering controls in place (e.g. acoustic screens, silencers, damping)" },
  { key: "quieter",       label: "Quieter equipment or methods being used where possible" },
  { key: "hpeProvided",   label: "Hearing Protection Equipment provided to all exposed workers" },
  { key: "hpeEnforced",   label: "Hearing Protection Equipment use being enforced" },
  { key: "hpz",           label: "Hearing Protection Zone established and signed" },
  { key: "trained",       label: "Workers informed and trained on noise risks" },
  { key: "rotation",      label: "Exposure time being limited or rotated between workers" },
  { key: "surveillance",  label: "Health surveillance arranged for workers regularly above 85 dB(A)" },
];

const TRI = ["Yes", "No", "Not Applicable"];

function makeSource() {
  return { id: crypto.randomUUID(), source: "", db: "", hours: "", distance: "" };
}

export default function NoiseAssessment() {
  const { user, refresh } = useAuth();

  // SECTION 1
  const [project, setProject]         = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [assessmentDate, setAssessmentDate] = useState(isoToday());
  const [activity, setActivity]       = useState("");

  // SECTION 2
  const [sources, setSources] = useState([makeSource()]);

  // SECTION 3
  const [workersCount, setWorkersCount]     = useState("");
  const [workerNames, setWorkerNames]       = useState("");
  const [regularlyAbove85, setRegularlyAbove85] = useState("");

  // SECTION 4
  const [controls, setControls]       = useState({});
  const [additionalControls, setAdditionalControls] = useState("");

  // SECTION 5
  const [proceedAssessment, setProceedAssessment] = useState("");
  const [reviewDate, setReviewDate]   = useState(inOneYearIso());

  // Output / signature
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

  const setControl = (key, val) => setControls((s) => ({ ...s, [key]: val }));

  const updateSource = (id, field, value) =>
    setSources((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const removeSource = (id) =>
    setSources((rows) => rows.filter((r) => r.id !== id));
  const addSource = () => setSources((rows) => [...rows, makeSource()]);

  // Overall risk = highest band across all populated rows
  const overall = useMemo(() => {
    let highest = riskFor(0);
    for (const s of sources) {
      const r = riskFor(s.db);
      if (RISK_RANK[r.id] > RISK_RANK[highest.id]) highest = r;
    }
    return highest;
  }, [sources]);

  const onGenerate = async () => {
    if (!project.trim())                                  { toast.error("Add a project / site name"); return; }
    if (!assessmentDate)                                  { toast.error("Select an assessment date"); return; }
    const populated = sources.filter((s) => (s.source || "").trim() || parseFloat(s.db) > 0);
    if (populated.length === 0)                            { toast.error("Add at least one noise source"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const sourcesBlock = populated.map((s, i) => {
      const risk = riskFor(s.db);
      return [
        `${i + 1}.`,
        `Source: ${s.source || "—"}`,
        `Estimated Noise Level: ${s.db ? `${s.db} dB(A)` : "—"}`,
        `Duration Per Day: ${s.hours ? `${s.hours} hours` : "—"}`,
        `Distance from Worker: ${s.distance ? `${s.distance} metres` : "—"}`,
        `Risk Level: ${risk.label}`,
      ].join(" | ");
    }).join("\n");

    const controlsBlock = CONTROL_ITEMS.map((it) => {
      const v = controls[it.key] || "Not Applicable";
      return `   ${it.label}: ${v}`;
    }).join("\n");

    const surveillanceNote = regularlyAbove85 === "Yes"
      ? "Health surveillance (regular hearing checks) is required under the Control of Noise at Work Regulations 2005."
      : "";

    const promptTemplate = `Produce a UK NOISE RISK ASSESSMENT under the Control of Noise at Work Regulations 2005. Plain direct construction English. No padding. No banned consultant words. This is a legal-grade compliance document.

1. HEADER — DOCUMENT REFERENCE, DATE (use {assessmentDate} in DD/MM/YYYY format), REVIEW DATE ({reviewDate} in DD/MM/YYYY).

2. TITLE — exactly: 'NOISE RISK ASSESSMENT — {project} — {assessmentDate}'.

3. ASSESSMENT DETAILS — list on separate lines:
   Project / Site: {project}
   Site Address: {siteAddress}
   Date of Assessment: {assessmentDate}
   Assessed by: {assessedBy}
   Trade / Activity Being Assessed: {activity}

4. NOISE SOURCES — print this header line, then each row below verbatim on its own line, preserving the pipe-delimited structure exactly as supplied. The Risk Level text on each row must be kept verbatim — do not shorten or rephrase:
{sourcesBlock}

5. WORKERS AFFECTED — list on separate lines:
   Number of Workers Exposed: {workersCount}
   Names of Workers Exposed: {workerNames}
   Workers regularly exposed above 85 dB(A): {regularlyAbove85}
   {surveillanceLine}

6. CONTROL MEASURES — print this header, then each item verbatim with its response after a colon:
{controlsBlock}
   {additionalControlsLine}

7. OVERALL ASSESSMENT OUTCOME — print on separate lines exactly:
   Overall Site Risk Level: {overallLabel}
   Is this assessment adequate to proceed with works: {proceedAssessment}
   Review Date: {reviewDate}

8. LEGAL REFERENCE — print verbatim as a single paragraph:
   This assessment has been completed in accordance with the Control of Noise at Work Regulations 2005. Lower Exposure Action Value: 80 dB(A). Upper Exposure Action Value: 85 dB(A). Exposure Limit Value: 87 dB(A).

9. DISCLAIMER — print verbatim on its own line:
   This assessment should be reviewed whenever working conditions change, following any incident, or at least annually.

10. SIGN-OFF — single sign-off:
    Assessed by: {assessedBy}
    Date: {assessmentDate}
    Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

Rules:
- Use DD/MM/YYYY for every date in the body. Never YYYY-MM-DD.
- Never invent rows, values, or controls. Use only the supplied data.
- Never use abbreviations like 'N/A', 'TBC' or '&'. Write words in full.
- Skip a blank field cleanly. Do not print '—' for whole sections.
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
          assessedBy: user?.fullName || "",
          activity,
          sourcesBlock,
          workersCount,
          workerNames,
          regularlyAbove85,
          surveillanceLine: surveillanceNote ? surveillanceNote : "",
          controlsBlock,
          additionalControlsLine: additionalControls
            ? `Additional Control Measures: ${additionalControls}`
            : "",
          overallLabel: overall.label,
          proceedAssessment,
          reviewDate: ukDate(reviewDate),
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Noise risk assessment generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Noise Risk Assessment — ${project || "site"}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-noise-assessment">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Site Tools</div>
          <h1 className="font-display text-4xl md:text-5xl">Noise Assessment</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="na-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="na-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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
      <Section title="Assessment Details" testId="na-section-1">
        <Grid>
          <Inp label="Project Name / Site" value={project}        onChange={setProject}        testId="na-project" />
          <Inp label="Site Address"        value={siteAddress}    onChange={setSiteAddress}    testId="na-site-address" />
          <Inp label="Date of Assessment"  value={assessmentDate} onChange={setAssessmentDate} type="date" testId="na-date" />
          <Inp label="Assessed by (auto from profile)" value={user?.fullName || ""} onChange={() => {}} readOnly testId="na-assessed-by" />
          <Inp label="Trade / Activity Being Assessed" value={activity} onChange={setActivity} testId="na-activity" helper="e.g. Duct installation, Concrete breaking, Grinding" />
        </Grid>
      </Section>

      {/* SECTION 2 */}
      <Section title="Noise Sources" testId="na-section-2" icon={<Volume2 size={14}/>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-[#706D66]">
              <tr>
                <th className="text-left py-2">Noise Source / Equipment</th>
                <th className="text-right">Noise Level (dB(A))</th>
                <th className="text-right">Duration (hours)</th>
                <th className="text-right">Distance (m)</th>
                <th className="text-left pl-3">Risk Level</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s, idx) => {
                const r = riskFor(s.db);
                return (
                  <tr key={s.id} className="border-t border-[#F0EDE8]/5 align-top" data-testid={`na-row-${idx}`}>
                    <td className="py-1 pr-2">
                      <input className="input-base !py-1 !text-sm" placeholder="e.g. Angle Grinder" value={s.source} onChange={(e) => updateSource(s.id, "source", e.target.value)} data-testid={`na-${idx}-source`} />
                    </td>
                    <td className="pr-1">
                      <input type="number" step="0.1" className="input-base !py-1 !text-sm text-right" value={s.db} onChange={(e) => updateSource(s.id, "db", e.target.value)} data-testid={`na-${idx}-db`} />
                    </td>
                    <td className="pr-1">
                      <input type="number" step="0.1" className="input-base !py-1 !text-sm text-right" value={s.hours} onChange={(e) => updateSource(s.id, "hours", e.target.value)} data-testid={`na-${idx}-hours`} />
                    </td>
                    <td className="pr-1">
                      <input type="number" step="0.1" className="input-base !py-1 !text-sm text-right" value={s.distance} onChange={(e) => updateSource(s.id, "distance", e.target.value)} data-testid={`na-${idx}-distance`} />
                    </td>
                    <td className="pl-3 pr-2">
                      <div
                        className="text-xs px-2 py-1 rounded leading-snug"
                        style={{ background: r.bg, border: `1px solid ${r.hex}`, color: r.hex }}
                        data-testid={`na-${idx}-risk`}
                      >
                        {r.label}
                      </div>
                    </td>
                    <td className="text-right">
                      <button onClick={() => removeSource(s.id)} className="text-[#706D66] hover:text-red-400" data-testid={`na-${idx}-remove`}><Trash2 size={14}/></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button onClick={addSource} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="na-add-source">
          <Plus size={12}/> Add Noise Source
        </button>
      </Section>

      {/* SECTION 3 */}
      <Section title="Workers Affected" testId="na-section-3">
        <Grid>
          <Inp label="Number of Workers Exposed" value={workersCount} onChange={setWorkersCount} type="number" testId="na-workers-count" />
        </Grid>
        <Area
          label="Names of Workers Exposed (optional)"
          value={workerNames}
          onChange={setWorkerNames}
          testId="na-worker-names"
        />
        <div className="mt-2">
          <Label>Are any workers regularly exposed above 85 dB(A)?</Label>
          <TriToggle
            options={["Yes", "No"]}
            value={regularlyAbove85}
            onChange={setRegularlyAbove85}
            testIdBase="na-regularly-85"
          />
          {regularlyAbove85 === "Yes" && (
            <div
              className="mt-3 p-3 rounded flex items-start gap-2"
              style={{ border: "1px solid #E8A020", background: "rgba(232,160,32,0.08)" }}
              data-testid="na-surveillance-warning"
            >
              <AlertTriangle size={16} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
              <div className="text-xs text-[#F0EDE8] leading-relaxed">
                Health surveillance (regular hearing checks) is required under the Control of Noise at Work Regulations 2005.
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* SECTION 4 */}
      <Section title="Control Measures" testId="na-section-4">
        <div className="space-y-3 mb-4">
          {CONTROL_ITEMS.map((it) => {
            const v = controls[it.key] || "";
            return (
              <div
                key={it.key}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded"
                style={{ background: "rgba(15,15,15,0.6)", border: "1px solid rgba(160,157,148,0.12)" }}
                data-testid={`na-control-${it.key}`}
              >
                <div className="text-sm text-[#F0EDE8] flex-1">{it.label}</div>
                <TriToggle value={v} onChange={(val) => setControl(it.key, val)} testIdBase={`na-control-${it.key}-toggle`} />
              </div>
            );
          })}
        </div>
        <Area
          label="Additional Control Measures (optional)"
          value={additionalControls}
          onChange={setAdditionalControls}
          testId="na-additional-controls"
        />
      </Section>

      {/* SECTION 5 */}
      <Section title="Overall Assessment Outcome" testId="na-section-5">
        <div className="mb-4">
          <Label>Overall Site Risk Level (auto from highest noise source)</Label>
          <div
            className="px-4 py-3 rounded font-display text-lg"
            style={{ background: overall.bg, border: `1px solid ${overall.hex}`, color: overall.hex }}
            data-testid="na-overall-risk"
          >
            {overall.label}
          </div>
        </div>
        <div className="mb-4">
          <Label>Is this assessment adequate to proceed with works?</Label>
          <TriToggle
            options={["Yes", "No", "Further assessment required"]}
            value={proceedAssessment}
            onChange={setProceedAssessment}
            testIdBase="na-proceed"
          />
        </div>
        <Inp label="Review Date" value={reviewDate} onChange={setReviewDate} type="date" testId="na-review-date" helper="When will this assessment be reviewed or updated?" />
      </Section>

      {/* SECTION 6 — SIGN OFF */}
      <Section title="Sign Off" testId="na-section-6">
        <LiveSignatureBlock
          label="Assessor signature"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="na-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="na-sig-date">
          Date: {ukDate(assessmentDate) || "—"}
        </div>
        <div
          className="mt-4 p-4 rounded text-xs text-[#F0EDE8] leading-relaxed"
          style={{ border: "1px solid rgba(232,160,32,0.25)", background: "rgba(232,160,32,0.05)" }}
          data-testid="na-legal-ref"
        >
          This assessment has been completed in accordance with the Control of Noise at Work Regulations 2005.
          Lower Exposure Action Value: 80 dB(A). Upper Exposure Action Value: 85 dB(A). Exposure Limit Value: 87 dB(A).
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="na-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Noise Risk Assessment</>}
      </button>

      {/* OUTPUT */}
      {result && (
        <div className="card-dark p-6 mt-6" data-testid="na-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated assessment</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Noise Risk Assessment — ${project}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="na-output">{result}</pre>
        </div>
      )}
    </div>
  );
}

// ---------- Small reusable bits ----------
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

function Grid({ children }) {
  return <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>;
}

function Label({ children }) {
  return <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">{children}</div>;
}

function Inp({ label, value, onChange, type = "text", testId, helper, readOnly }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="input-base"
        readOnly={readOnly}
        data-testid={testId}
      />
      {helper && <div className="text-[10px] text-[#706D66] mt-1">{helper}</div>}
    </label>
  );
}

function Area({ label, value, onChange, testId, helper }) {
  return (
    <label className="block mt-3">
      <Label>{label}</Label>
      <textarea
        rows={3}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="input-base resize-y"
        data-testid={testId}
      />
      {helper && <div className="text-[10px] text-[#706D66] mt-1">{helper}</div>}
    </label>
  );
}

function TriToggle({ options = TRI, value, onChange, testIdBase }) {
  return (
    <div className="flex gap-2 flex-wrap" data-testid={testIdBase}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(active ? "" : opt)}
            className="px-3 py-2 rounded text-xs uppercase tracking-widest transition"
            style={{
              background: active ? "rgba(232,160,32,0.12)" : "transparent",
              border: `1px solid ${active ? "#E8A020" : "rgba(160,157,148,0.25)"}`,
              color: active ? "#E8A020" : "#A19D94",
            }}
            data-testid={`${testIdBase}-${opt.replace(/\s+/g, "-").toLowerCase()}`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
