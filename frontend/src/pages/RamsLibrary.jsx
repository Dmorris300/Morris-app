import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, Library, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";
import DraftSaveButton from "../components/DraftSaveButton";
import useToolDraft from "../hooks/useToolDraft";

const TOOL_ID   = "rams-library";
const TOOL_NAME = "RAMS Library";
const TOOL_INFO =
  "Living register where you store, track and manage every Risk Assessment and Method Statement you have created. Record which jobs they have been issued to, track review dates and surface anything out of date before a principal contractor flags it.";

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoPlusYears = (y) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + y);
  return d.toISOString().slice(0, 10);
};

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const STATUS_OPTIONS = [
  "Current — in use",
  "Needs review — due for update",
  "Superseded — replaced by newer version",
  "Archived — no longer in use",
];

function makeRow() {
  return {
    id: crypto.randomUUID(),
    title: "",
    scope: "",
    discipline: "",
    dateCreated: isoToday(),
    dateLastReviewed: isoToday(),
    reviewDueDate: isoPlusYears(1),
    projectsIssued: "",
    version: "Version 1",
    status: "Current — in use",
    notes: "",
  };
}

export default function RamsLibrary() {
  const { user, refresh } = useAuth();

  // SECTION 2 — ROWS
  const [rows, setRows] = useState([makeRow()]);

  // Output / sign-off
  const [infoOpen, setInfoOpen]         = useState(false);
  const [generating, setGenerating]     = useState(false);
  const [result, setResult]             = useState("");
  const [refNumber, setRefNumber]       = useState("");
  const [liveSignature, setLiveSignature] = useState("");

  // ---------- Draft save/resume ----------
  const getDraftData = () => ({ rows, result, refNumber, liveSignature });
  useToolDraft(TOOL_ID, (p) => {
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

  const today = isoToday();
  const in30Days = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 30);
    return d.toISOString().slice(0, 10);
  })();

  const decorated = useMemo(() => {
    return rows.map((r) => {
      const overdue   = r.reviewDueDate && r.reviewDueDate < today &&
                        r.status !== "Archived — no longer in use" &&
                        r.status !== "Superseded — replaced by newer version";
      const dueSoon   = !overdue && r.reviewDueDate && r.reviewDueDate <= in30Days &&
                        r.status !== "Archived — no longer in use" &&
                        r.status !== "Superseded — replaced by newer version";
      return { ...r, overdue, dueSoon };
    });
  }, [rows, today, in30Days]);

  const summary = useMemo(() => {
    const total    = decorated.length;
    const inUse    = decorated.filter((r) => r.status === "Current — in use").length;
    const dueReview = decorated.filter((r) => r.status === "Needs review — due for update" || r.dueSoon).length;
    const overdue   = decorated.filter((r) => r.overdue).length;
    const archived  = decorated.filter((r) => r.status === "Archived — no longer in use").length;
    return { total, inUse, dueReview, overdue, archived };
  }, [decorated]);

  const onGenerate = async () => {
    const populated = decorated.filter((r) => (r.title || "").trim().length > 0);
    if (populated.length === 0) { toast.error("Add at least one RAMS to the register"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const rowsBlock = populated.map((r) => {
      return [
        `RAMS Title: ${r.title}`,
        `Activity or Scope Covered: ${r.scope || "—"}`,
        `Trade or Discipline: ${r.discipline || "—"}`,
        `Date Created: ${ukDate(r.dateCreated)}`,
        `Date Last Reviewed: ${ukDate(r.dateLastReviewed)}`,
        `Review Due Date: ${ukDate(r.reviewDueDate)}`,
        `Projects Issued To: ${r.projectsIssued || "—"}`,
        `Current Version: ${r.version || "—"}`,
        `Status: ${r.status}`,
        `Notes: ${r.notes || "—"}`,
      ].join(" | ");
    }).join("\n");

    const summaryBlock = [
      `Total RAMS in Library: ${summary.total}`,
      `Number Currently in Use: ${summary.inUse}`,
      `Number Due for Review: ${summary.dueReview}`,
      `Number Overdue for Review: ${summary.overdue}`,
      `Number Archived: ${summary.archived}`,
    ].join("\n   ");

    const promptTemplate = `Produce a UK RAMS LIBRARY REGISTER document. Plain direct construction English. No padding. No banned consultant words. Full words only — never use abbreviations such as 'N/A', 'TBC', 'qty', '&', 'inc.', 'excl.', 'approx.' or 'etc.'. This document is a living register of every Risk Assessment and Method Statement held by the company.

1. HEADER — DOCUMENT REFERENCE: rams library register. DATE: {todayUk} in DD/MM/YYYY format.

2. TITLE — exactly: 'RAMS LIBRARY REGISTER — {companyName} — {todayUk}'.

3. LIBRARY HEADER — list on separate lines:
   Company Name: {companyName}
   Trade: {trade}
   Date Last Updated: {todayUk}
   Compiled by: {compiledByName}
   Position: {compiledByRole}

4. RAMS REGISTER TABLE — print this header line then each RAMS below verbatim on its own line, preserving the pipe-delimited structure exactly as supplied. Highlight any Review Due Date that has passed by appending the words 'OVERDUE — review immediately' on the same line after the Review Due Date value:
{rowsBlock}

5. SUMMARY — print on separate lines (use the values supplied — never recalculate):
   {summaryBlock}

6. COMPILED BY — sign-off block:
   Compiled by: {compiledByName}
   Position: {compiledByRole}
   Company: {companyName}
   Date: {todayUk}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

7. FOOTER — print verbatim on its own line:
   This register should be maintained and kept up to date. All RAMS must be communicated to and understood by the workers carrying out the activity before work begins.

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Never invent RAMS, projects, versions or dates. Use only the supplied rows and the supplied summary block.
- Full words only — write every word out in full. Never abbreviate. Spell out 'Risk Assessment and Method Statement' the first time RAMS is used in the document body, then use 'RAMS' thereafter.
- Skip blank optional fields cleanly. Use '—' only where supplied.
- No banned words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct. Reads as a real RAMS register from a competent subcontractor.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          todayUk: ukDate(today),
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
      toast.success("RAMS Library register generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `RAMS Library Register — ${user?.companyName || "company"} — ${ukDate(today)}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-rams-library">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Contractors</div>
          <h1 className="font-display text-4xl md:text-5xl">RAMS Library</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="rl-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="rl-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 — LIBRARY HEADER */}
      <Section title="Library Header" testId="rl-section-1" icon={<Library size={14}/>}>
        <Grid>
          <ReadOnly label="Company Name" value={user?.companyName || "—"} testId="rl-company" />
          <ReadOnly label="Trade" value={user?.trade || "—"} testId="rl-trade" />
          <ReadOnly label="Date Last Updated" value={ukDate(today)} testId="rl-last-updated" />
        </Grid>
      </Section>

      {/* SECTION 2 — RAMS REGISTER TABLE */}
      <Section title="RAMS Register" testId="rl-section-2">
        <div className="grid gap-4">
          {decorated.map((r, idx) => {
            let cardBorder = "rgba(160,157,148,0.18)";
            if (r.overdue) cardBorder = "#DC3C3C";
            else if (r.dueSoon) cardBorder = "#E8A020";
            return (
              <div
                key={r.id}
                className="rounded p-4 md:p-5"
                style={{
                  background: "rgba(15,15,15,0.5)",
                  border: `1px solid ${cardBorder}`,
                }}
                data-testid={`rl-row-${idx}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div
                    className="text-xs uppercase tracking-widest text-[#E8A020] font-mono"
                    data-testid={`rl-row-${idx}-label`}
                  >
                    RAMS #{idx + 1}
                    {r.overdue && <span className="text-[#FF8A8A] ml-2 normal-case">— OVERDUE</span>}
                    {r.dueSoon && !r.overdue && <span className="text-[#E8A020] ml-2 normal-case">— Due soon</span>}
                  </div>
                  <button
                    onClick={() => removeRow(r.id)}
                    className="text-[#706D66] hover:text-red-400 flex items-center gap-1 text-xs"
                    data-testid={`rl-row-${idx}-remove`}
                  >
                    <Trash2 size={14}/> Remove
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Inp
                      label="RAMS Title"
                      value={r.title}
                      onChange={(v) => updateRow(r.id, "title", v)}
                      placeholder='e.g. "First Fix Ductwork Installation"'
                      testId={`rl-row-${idx}-title`}
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Inp
                      label="Activity or Scope Covered"
                      value={r.scope}
                      onChange={(v) => updateRow(r.id, "scope", v)}
                      placeholder="Brief description of what the RAMS covers"
                      testId={`rl-row-${idx}-scope`}
                    />
                  </div>
                  <Inp label="Trade or Discipline (optional)" value={r.discipline} onChange={(v) => updateRow(r.id, "discipline", v)} testId={`rl-row-${idx}-discipline`} />
                  <Inp label="Date Created" type="date" value={r.dateCreated} onChange={(v) => updateRow(r.id, "dateCreated", v)} testId={`rl-row-${idx}-created`} />
                  <Inp label="Date Last Reviewed" type="date" value={r.dateLastReviewed} onChange={(v) => updateRow(r.id, "dateLastReviewed", v)} testId={`rl-row-${idx}-last-reviewed`} />
                  <Inp
                    label="Review Due Date"
                    type="date"
                    value={r.reviewDueDate}
                    onChange={(v) => updateRow(r.id, "reviewDueDate", v)}
                    helper="RAMS should be reviewed at least annually or when scope of work changes"
                    testId={`rl-row-${idx}-due`}
                  />
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Inp
                      label="Projects Issued To"
                      value={r.projectsIssued}
                      onChange={(v) => updateRow(r.id, "projectsIssued", v)}
                      placeholder="List project names this RAMS has been used on"
                      testId={`rl-row-${idx}-projects`}
                    />
                  </div>
                  <Inp label="Current Version" value={r.version} onChange={(v) => updateRow(r.id, "version", v)} placeholder='e.g. "Version 2 — updated June 2026"' testId={`rl-row-${idx}-version`} />
                  <Drop label="Status" value={r.status} onChange={(v) => updateRow(r.id, "status", v)} options={STATUS_OPTIONS} testId={`rl-row-${idx}-status`} />
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Inp label="Notes (optional)" value={r.notes} onChange={(v) => updateRow(r.id, "notes", v)} testId={`rl-row-${idx}-notes`} />
                  </div>
                </div>

                <div
                  className="mt-4 pt-4 flex items-center justify-between"
                  style={{ borderTop: "1px solid rgba(160,157,148,0.18)" }}
                >
                  <div className="text-[10px] uppercase tracking-widest text-[#706D66]">Status</div>
                  <div className="font-display text-lg text-[#E8A020]" data-testid={`rl-row-${idx}-status-label`}>
                    {r.status}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <button onClick={addRow} className="btn-secondary flex items-center gap-2 text-xs mt-4" data-testid="rl-add-row">
          <Plus size={12}/> Add RAMS
        </button>
      </Section>

      {/* SECTION 3 — SUMMARY PANEL */}
      <Section title="Library Summary" testId="rl-section-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <SummaryStat label="Total RAMS in Library" value={summary.total}    testId="rl-sum-total" />
          <SummaryStat label="Currently in Use"      value={summary.inUse}    testId="rl-sum-inuse" />
          <SummaryStat label="Due for Review"        value={summary.dueReview} testId="rl-sum-due"     highlight="gold" />
          <SummaryStat label="Overdue for Review"    value={summary.overdue}  testId="rl-sum-overdue" highlight="red" />
          <SummaryStat label="Archived"              value={summary.archived} testId="rl-sum-archived" />
        </div>
      </Section>

      {/* SECTION 4 — IMPORTANT NOTE */}
      <div
        className="rounded p-5 mb-5 flex gap-3"
        style={{
          background: "rgba(232,160,32,0.08)",
          border: "1px solid #E8A020",
        }}
        data-testid="rl-important-note"
      >
        <AlertTriangle size={20} className="text-[#E8A020] shrink-0 mt-0.5" />
        <div className="text-sm text-[#F0EDE8] leading-relaxed">
          RAMS should be reviewed and updated whenever the scope of work changes, following any incident or near miss, or at least every 12 months. An out-of-date RAMS may not be accepted by a principal contractor and could leave you unprotected in the event of an incident.
        </div>
      </div>

      {/* SECTION 5 — SIGN OFF */}
      <Section title="Compiled by — Sign Off" testId="rl-section-5">
        <LiveSignatureBlock
          label="Compiled by"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="rl-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="rl-sig-date">
          Date: {ukDate(today)}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="rl-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate RAMS Library Register</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="rl-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated register</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`RAMS Library Register — ${user?.companyName || "company"}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="rl-output">{result}</pre>
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
  const palette = {
    gold: { bg: "rgba(232,160,32,0.10)", border: "#E8A020", text: "#E8A020" },
    red:  { bg: "rgba(220,60,60,0.10)",  border: "#DC3C3C", text: "#FF8A8A" },
  }[highlight];
  return (
    <div
      data-testid={testId}
      className="p-4 rounded"
      style={{
        background: palette ? palette.bg : "rgba(15,15,15,0.6)",
        border: `1px solid ${palette ? palette.border : "rgba(160,157,148,0.18)"}`,
      }}
    >
      <div className="text-[10px] uppercase tracking-widest text-[#706D66] mb-1">{label}</div>
      <div
        className="font-display text-3xl"
        style={{ color: palette ? palette.text : "#F0EDE8" }}
      >
        {value}
      </div>
    </div>
  );
}
