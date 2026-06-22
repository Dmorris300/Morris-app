import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";
import DraftSaveButton from "../components/DraftSaveButton";
import useToolDraft from "../hooks/useToolDraft";

const TOOL_ID   = "incident-log";
const TOOL_NAME = "Incident Log";
const TOOL_INFO =
  "Running register of all incidents, near misses and dangerous occurrences across a project. Used by subcontractor bosses to track every incident over time and demonstrate proactive health and safety management. Records must be retained for a minimum of 3 years.";

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoMinusDays = (days) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const pad3 = (n) => String(n).padStart(3, "0");

const INCIDENT_TYPES = [
  "Injury",
  "Near miss",
  "Dangerous occurrence",
  "Property damage",
  "Environmental",
  "Other",
];

const RIDDOR_OPTIONS = ["Yes", "No", "Under review"];

const STATUS_OPTIONS = [
  "Open — under investigation",
  "Actions pending",
  "Closed — resolved",
];

function makeRow() {
  return {
    id: crypto.randomUUID(),
    date: isoToday(),
    time: "",
    incidentType: "Near miss",
    description: "",
    personInvolved: "",
    location: "",
    riddor: "No",
    reportRaised: false,
    status: "Open — under investigation",
    notes: "",
  };
}

export default function IncidentLog() {
  const { user, refresh } = useAuth();

  // SECTION 1 — LOG DETAILS
  const [project, setProject]         = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [periodFrom, setPeriodFrom]   = useState(isoMinusDays(30));
  const [periodTo, setPeriodTo]       = useState(isoToday());

  // SECTION 2 — ROWS
  const [rows, setRows] = useState([makeRow()]);

  // Output / sign-off
  const [infoOpen, setInfoOpen]         = useState(false);
  const [generating, setGenerating]     = useState(false);
  const [result, setResult]             = useState("");
  const [refNumber, setRefNumber]       = useState("");
  const [liveSignature, setLiveSignature] = useState("");

  // ---------- Draft save/resume ----------
  const getDraftData = () => ({
    project, siteAddress, periodFrom, periodTo, rows,
    result, refNumber, liveSignature,
  });
  useToolDraft(TOOL_ID, (p) => {
    if (p.project !== undefined) setProject(p.project);
    if (p.siteAddress !== undefined) setSiteAddress(p.siteAddress);
    if (p.periodFrom !== undefined) setPeriodFrom(p.periodFrom);
    if (p.periodTo !== undefined) setPeriodTo(p.periodTo);
    if (Array.isArray(p.rows)) setRows(p.rows);
    if (p.result !== undefined) setResult(p.result);
    if (p.refNumber !== undefined) setRefNumber(p.refNumber);
    if (p.liveSignature !== undefined) setLiveSignature(p.liveSignature);
  });

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

  const updateRow = (id, field, value) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const removeRow = (id) =>
    setRows((rs) => rs.filter((r) => r.id !== id));
  const addRow = () => setRows((rs) => [...rs, makeRow()]);

  // Auto-numbered (sequence based on original list order)
  const decorated = useMemo(() => {
    return rows.map((r, i) => ({ ...r, ref: `IL-${pad3(i + 1)}` }));
  }, [rows]);

  // Summary
  const summary = useMemo(() => {
    const total      = decorated.length;
    const injuries   = decorated.filter((r) => r.incidentType === "Injury").length;
    const nearMisses = decorated.filter((r) => r.incidentType === "Near miss").length;
    const riddor     = decorated.filter((r) => r.riddor === "Yes").length;
    const open       = decorated.filter((r) => r.status !== "Closed — resolved").length;
    const noReport   = decorated.filter((r) => !r.reportRaised).length;
    return { total, injuries, nearMisses, riddor, open, noReport };
  }, [decorated]);

  const onGenerate = async () => {
    if (!project.trim())     { toast.error("Add the project name"); return; }
    const populated = decorated.filter((r) => (r.description || "").trim().length > 0);
    if (populated.length === 0) { toast.error("Add at least one incident with a description"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const rowsBlock = populated.map((r) => {
      return [
        `Reference: ${r.ref}`,
        `Date: ${ukDate(r.date)}`,
        `Time: ${r.time || "—"}`,
        `Incident Type: ${r.incidentType}`,
        `Brief Description: ${r.description}`,
        `Person Involved: ${r.personInvolved || "—"}`,
        `Location on Site: ${r.location || "—"}`,
        `RIDDOR Reportable: ${r.riddor}`,
        `Incident Report Raised: ${r.reportRaised ? "Yes" : "No"}`,
        `Current Status: ${r.status}`,
        `Notes: ${r.notes || "—"}`,
      ].join(" | ");
    }).join("\n");

    const summaryBlock = [
      `Total Incidents Logged: ${summary.total}`,
      `Number of Injuries: ${summary.injuries}`,
      `Number of Near Misses: ${summary.nearMisses}`,
      `Number of RIDDOR Reportable Incidents: ${summary.riddor}`,
      `Number of Open or Unresolved Incidents: ${summary.open}`,
      `Number of Incidents Where No Report Has Been Raised: ${summary.noReport}`,
    ].join("\n   ");

    const periodLabel = `${ukDate(periodFrom)} to ${ukDate(periodTo)}`;

    const promptTemplate = `Produce a UK INCIDENT LOG. Plain direct construction English. No padding. No banned consultant words. Full words only — never use abbreviations such as 'N/A', 'TBC', 'qty', '&', 'inc.', 'excl.', 'approx.' or 'etc.'. This document is a running register of incidents, near misses and dangerous occurrences across a project. It is not an individual incident report — it is a summary log used by subcontractor bosses to demonstrate proactive health and safety management.

1. HEADER — DOCUMENT REFERENCE: incident log. DATE OF LOG: {reportDateUk} in DD/MM/YYYY format.

2. TITLE — exactly: 'INCIDENT LOG — {project} — {periodLabel}'.

3. LOG DETAILS — list on separate lines:
   Project Name: {project}
   Site Address: {siteAddress}
   Log Period: {periodLabel}
   Compiled by: {compiledByName}
   Position: {compiledByRole}
   Company: {companyName}
   Trade: {trade}

4. INCIDENT LOG TABLE — print this header line then each incident below verbatim on its own line, preserving the pipe-delimited structure exactly as supplied:
{rowsBlock}

5. SUMMARY — print on separate lines (use the values supplied — never recalculate):
   {summaryBlock}

6. COMPILED BY — sign-off block:
   Compiled by: {compiledByName}
   Position: {compiledByRole}
   Company: {companyName}
   Date: {reportDateUk}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

7. FOOTER — print verbatim on its own line:
   This log must be retained for a minimum of 3 years. All RIDDOR reportable incidents must be reported to the HSE within the required timeframe. Individual Incident Reports should be raised for each entry in this log.

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Never invent incidents, dates, people, types or statuses. Use only the supplied rows and the supplied summary block.
- Full words only — write every word out in full. Never abbreviate.
- Skip blank optional fields cleanly. Use '—' only where supplied.
- No banned words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct. Reads as a real incident log from a subcontractor boss to a principal contractor or HSE inspector.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          reportDateUk: ukDate(isoToday()),
          project,
          siteAddress: siteAddress || "—",
          periodLabel,
          companyName: user?.companyName || "—",
          trade: user?.trade || "—",
          rowsBlock,
          summaryBlock,
          compiledByName: user?.fullName || "—",
          compiledByRole: user?.signatureRole || "Director",
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Incident Log generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Incident Log — ${project || "project"} — ${ukDate(periodFrom)} to ${ukDate(periodTo)}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-incident-log">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Contractors</div>
          <h1 className="font-display text-4xl md:text-5xl">Incident Log</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="il-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="il-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
          <DraftSaveButton tool={{ id: TOOL_ID, name: TOOL_NAME }} getDraftData={getDraftData} />
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

      {/* SECTION 1 — LOG DETAILS */}
      <Section title="Log Details" testId="il-section-1" icon={<ClipboardList size={14}/>}>
        <Grid>
          <Inp label="Project Name" value={project} onChange={setProject} testId="il-project" />
          <Inp label="Site Address" value={siteAddress} onChange={setSiteAddress} testId="il-site" />
          <Inp label="Log Period — From" type="date" value={periodFrom} onChange={setPeriodFrom} testId="il-period-from" />
          <Inp label="Log Period — To" type="date" value={periodTo} onChange={setPeriodTo} testId="il-period-to" />
          <ReadOnly label="Compiled by" value={user?.fullName || "—"} testId="il-compiled-by" />
          <ReadOnly label="Position" value={user?.signatureRole || "Director"} testId="il-compiled-role" />
        </Grid>
      </Section>

      {/* SECTION 2 — INCIDENT LOG TABLE */}
      <Section title="Incident Log" testId="il-section-2">
        <div className="grid gap-4">
          {decorated.map((r, idx) => (
            <div
              key={r.id}
              className="rounded p-4 md:p-5"
              style={{
                background: "rgba(15,15,15,0.5)",
                border: "1px solid rgba(160,157,148,0.18)",
              }}
              data-testid={`il-row-${idx}`}
            >
              <div className="flex items-center justify-between mb-4">
                <div
                  className="text-xs uppercase tracking-widest text-[#E8A020] font-mono"
                  data-testid={`il-row-${idx}-ref`}
                >
                  {r.ref}
                  {r.date ? <span className="text-[#706D66] ml-2 normal-case">— {ukDate(r.date)}{r.time ? ` at ${r.time}` : ""}</span> : null}
                </div>
                <button
                  onClick={() => removeRow(r.id)}
                  className="text-[#706D66] hover:text-red-400 flex items-center gap-1 text-xs"
                  data-testid={`il-row-${idx}-remove`}
                >
                  <Trash2 size={14}/> Remove
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Inp label="Date" type="date" value={r.date} onChange={(v) => updateRow(r.id, "date", v)} testId={`il-row-${idx}-date`} />
                <Inp label="Time (optional)" type="time" value={r.time} onChange={(v) => updateRow(r.id, "time", v)} testId={`il-row-${idx}-time`} />
                <Drop label="Incident Type" value={r.incidentType} onChange={(v) => updateRow(r.id, "incidentType", v)} options={INCIDENT_TYPES} testId={`il-row-${idx}-type`} />
                <div className="sm:col-span-2 lg:col-span-3">
                  <Inp
                    label="Brief Description"
                    value={r.description}
                    onChange={(v) => updateRow(r.id, "description", v)}
                    placeholder="One sentence summary of what happened"
                    testId={`il-row-${idx}-description`}
                  />
                </div>
                <Inp label="Person Involved (optional)" value={r.personInvolved} onChange={(v) => updateRow(r.id, "personInvolved", v)} testId={`il-row-${idx}-person`} />
                <Inp label="Location on Site (optional)" value={r.location} onChange={(v) => updateRow(r.id, "location", v)} testId={`il-row-${idx}-location`} />
                <Drop label="RIDDOR Reportable?" value={r.riddor} onChange={(v) => updateRow(r.id, "riddor", v)} options={RIDDOR_OPTIONS} testId={`il-row-${idx}-riddor`} />
                <YesNo label="Incident Report Raised?" value={r.reportRaised} onChange={(v) => updateRow(r.id, "reportRaised", v)} testId={`il-row-${idx}-report-raised`} />
                <Drop label="Current Status" value={r.status} onChange={(v) => updateRow(r.id, "status", v)} options={STATUS_OPTIONS} testId={`il-row-${idx}-status`} />
                <div className="sm:col-span-2 lg:col-span-3">
                  <Inp label="Notes (optional)" value={r.notes} onChange={(v) => updateRow(r.id, "notes", v)} testId={`il-row-${idx}-notes`} />
                </div>
              </div>

              <div
                className="mt-4 pt-4 flex items-center justify-between"
                style={{ borderTop: "1px solid rgba(160,157,148,0.18)" }}
              >
                <div className="text-[10px] uppercase tracking-widest text-[#706D66]">Status</div>
                <div className="font-display text-lg text-[#E8A020]" data-testid={`il-row-${idx}-status-label`}>
                  {r.status}
                </div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={addRow} className="btn-secondary flex items-center gap-2 text-xs mt-4" data-testid="il-add-row">
          <Plus size={12}/> Add Incident
        </button>
      </Section>

      {/* SECTION 3 — SUMMARY PANEL */}
      <Section title="Summary" testId="il-section-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <SummaryStat label="Total Incidents Logged"        value={summary.total}      testId="il-sum-total" />
          <SummaryStat label="Number of Injuries"            value={summary.injuries}   testId="il-sum-injuries" />
          <SummaryStat label="Number of Near Misses"         value={summary.nearMisses} testId="il-sum-near" />
          <SummaryStat label="RIDDOR Reportable Incidents"   value={summary.riddor}     testId="il-sum-riddor" />
          <SummaryStat label="Open or Unresolved Incidents"  value={summary.open}       testId="il-sum-open"     highlight />
          <SummaryStat label="No Incident Report Raised"     value={summary.noReport}   testId="il-sum-noreport" highlight />
        </div>
      </Section>

      {/* SECTION 4 — SIGN OFF */}
      <Section title="Compiled by — Sign Off" testId="il-section-4">
        <LiveSignatureBlock
          label="Compiled by"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="il-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="il-sig-date">
          Date: {ukDate(isoToday())}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="il-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Incident Log</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="il-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated log</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Incident Log — ${project}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="il-output">{result}</pre>
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
function Grid({ children }) {
  return <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>;
}
function Inp({ label, value, onChange, type = "text", testId, helper, placeholder }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} className="input-base" placeholder={placeholder} data-testid={testId} />
      {helper && <div className="text-[10px] text-[#706D66] mt-1">{helper}</div>}
    </label>
  );
}
function Drop({ label, value, onChange, options, testId }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} className="input-base" data-testid={testId}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
function YesNo({ label, value, onChange, testId }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <div className="flex gap-2" data-testid={testId}>
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`px-4 py-2 rounded text-xs ${value ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94]"}`}
          data-testid={`${testId}-yes`}
        >Yes</button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`px-4 py-2 rounded text-xs ${!value ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94]"}`}
          data-testid={`${testId}-no`}
        >No</button>
      </div>
    </label>
  );
}
function ReadOnly({ label, value, testId }) {
  return (
    <div data-testid={testId}>
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <div
        className="input-base flex items-center"
        style={{ color: "#F0EDE8", background: "rgba(15,15,15,0.4)" }}
      >
        {value}
      </div>
    </div>
  );
}
function SummaryStat({ label, value, testId, highlight }) {
  return (
    <div
      data-testid={testId}
      className="p-4 rounded"
      style={{
        background: highlight ? "rgba(232,160,32,0.10)" : "rgba(15,15,15,0.6)",
        border: `1px solid ${highlight ? "#E8A020" : "rgba(160,157,148,0.18)"}`,
      }}
    >
      <div className="text-[10px] uppercase tracking-widest text-[#706D66] mb-1">{label}</div>
      <div className="font-display text-3xl" style={{ color: highlight ? "#E8A020" : "#F0EDE8" }}>{value}</div>
    </div>
  );
}
