import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, FolderKanban, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";
import DraftSaveButton from "../components/DraftSaveButton";
import useToolDraft from "../hooks/useToolDraft";

const TOOL_ID   = "contract-mgmt";
const TOOL_NAME = "Contract Management";
const TOOL_INFO =
  "Master register of every contract you are currently working under. Tracks key contract details, important dates, financial values and current status across all active jobs in one place. Use the Contract Review tool to check any contract before you sign it.";

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoPlusDays = (days) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const N = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const money = (n) =>
  `£${(Number(n) || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pad3 = (n) => String(n).padStart(3, "0");

const CONTRACT_TYPES = [
  "Subcontract agreement",
  "Purchase order",
  "Letter of intent",
  "Labour only",
  "Supply and fix",
  "Framework agreement",
  "Other",
];

const PAYMENT_TERMS = [
  "14 days",
  "30 days",
  "Monthly valuations",
  "On completion",
  "Other",
];

const STATUS_OPTIONS = [
  "Tender stage",
  "Letter of intent received",
  "Contract signed",
  "Works in progress",
  "Practical completion achieved",
  "Defects liability period",
  "Final account agreed",
  "Fully complete and closed",
];

// Active = not closed and not just at tender
const ACTIVE_STATUSES = new Set([
  "Letter of intent received",
  "Contract signed",
  "Works in progress",
  "Practical completion achieved",
  "Defects liability period",
  "Final account agreed",
]);

function makeRow() {
  return {
    id: crypto.randomUUID(),
    project: "",
    counterparty: "",
    contractType: "Subcontract agreement",
    contractValue: "",
    startDate: isoToday(),
    plannedEndDate: isoPlusDays(180),
    dlpEndDate: "",
    paymentTerms: "30 days",
    paymentTermsOther: "",
    retentionHeld: false,
    retentionPct: "5",
    noticePeriod: "",
    keyObligations: "",
    status: "Works in progress",
    notes: "",
  };
}

export default function ContractManagement() {
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

  const decorated = useMemo(() => {
    return rows.map((r, i) => ({ ...r, ref: `CM-${pad3(i + 1)}` }));
  }, [rows]);

  // Summary
  const today = isoToday();
  const monthEnd = (() => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() + 1, 0); // last day of current UTC month
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  })();

  const summary = useMemo(() => {
    const active = decorated.filter((r) => ACTIVE_STATUSES.has(r.status));
    const totalActive = active.length;
    const totalValue = active.reduce((s, r) => s + N(r.contractValue), 0);
    const totalRetention = active.reduce((s, r) => {
      if (!r.retentionHeld) return s;
      return s + (N(r.contractValue) * N(r.retentionPct) / 100);
    }, 0);
    const inDlp = decorated.filter((r) => r.status === "Defects liability period").length;
    const dueThisMonth = decorated.filter((r) => {
      if (!ACTIVE_STATUSES.has(r.status)) return false;
      const terms = r.paymentTerms === "Other" ? "Other" : r.paymentTerms;
      if (terms !== "Monthly valuations" && terms !== "On completion" && terms !== "14 days" && terms !== "30 days") return false;
      // Heuristic: planned end within this month indicates payment likely due
      return r.plannedEndDate && r.plannedEndDate <= monthEnd && r.plannedEndDate >= today;
    }).length;
    const loiRisk = decorated.filter((r) => r.status === "Letter of intent received").length;
    return { totalActive, totalValue, totalRetention, inDlp, dueThisMonth, loiRisk };
  }, [decorated, monthEnd, today]);

  const onGenerate = async () => {
    const populated = decorated.filter((r) => (r.project || "").trim().length > 0);
    if (populated.length === 0) { toast.error("Add at least one contract"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const rowsBlock = populated.map((r) => {
      const paymentResolved = r.paymentTerms === "Other"
        ? (r.paymentTermsOther.trim() || "As agreed")
        : r.paymentTerms;
      const retentionLine = r.retentionHeld
        ? `Yes — ${N(r.retentionPct)} percent (${money(N(r.contractValue) * N(r.retentionPct) / 100)} on this contract)`
        : "No";
      return [
        `Reference: ${r.ref}`,
        `Project Name: ${r.project}`,
        `Main Contractor or Client: ${r.counterparty || "—"}`,
        `Contract Type: ${r.contractType}`,
        `Contract Value: ${money(N(r.contractValue))}`,
        `Start Date: ${ukDate(r.startDate)}`,
        `Planned End Date: ${ukDate(r.plannedEndDate)}`,
        `Defects Liability Period End Date: ${r.dlpEndDate ? ukDate(r.dlpEndDate) : "—"}`,
        `Payment Terms: ${paymentResolved}`,
        `Retention Held: ${retentionLine}`,
        `Notice Period Required: ${r.noticePeriod || "—"}`,
        `Key Obligations: ${r.keyObligations || "—"}`,
        `Current Status: ${r.status}`,
        `Notes: ${r.notes || "—"}`,
      ].join(" | ");
    }).join("\n");

    const summaryBlock = [
      `Total Number of Active Contracts: ${summary.totalActive}`,
      `Total Combined Contract Value: ${money(summary.totalValue)}`,
      `Total Retention Held Across All Contracts: ${money(summary.totalRetention)}`,
      `Number of Contracts in Defects Liability Period: ${summary.inDlp}`,
      `Number of Contracts With Payment Terms Due This Month: ${summary.dueThisMonth}`,
      `Number of Contracts at Letter of Intent Stage (Not Yet Formally Signed): ${summary.loiRisk}`,
    ].join("\n   ");

    const promptTemplate = `Produce a UK CONTRACT REGISTER document. Plain direct construction English. No padding. No banned consultant words. Full words only — never use abbreviations such as 'N/A', 'TBC', 'qty', '&', 'inc.', 'excl.', 'approx.' or 'etc.'. This document is a master register of every contract the company is currently working under.

1. HEADER — DOCUMENT REFERENCE: contract register. DATE: {todayUk} in DD/MM/YYYY format.

2. TITLE — exactly: 'CONTRACT REGISTER — {companyName} — {todayUk}'.

3. REGISTER DETAILS — list on separate lines:
   Your Company Name: {companyName}
   Trade: {trade}
   Date Last Updated: {todayUk}
   Compiled by: {compiledByName}
   Position: {compiledByRole}

4. CONTRACT REGISTER TABLE — print this header line then each contract below verbatim on its own line, preserving the pipe-delimited structure exactly as supplied:
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
   This register should be kept up to date throughout the year. Retain all signed contracts for a minimum of 6 years.

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Never invent contracts, parties, values or dates. Use only the supplied rows and the supplied summary block.
- Full words only — write every word out in full. Never abbreviate.
- Skip blank optional fields cleanly. Use '—' only where supplied.
- No banned words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct. Reads as a real contract register from a competent subcontractor.`;

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
      toast.success("Contract Register generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Contract Register — ${user?.companyName || "company"} — ${ukDate(today)}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-contract-management">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Contractors</div>
          <h1 className="font-display text-4xl md:text-5xl">Contract Management</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="cm-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="cm-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 — REGISTER DETAILS */}
      <Section title="Register Details" testId="cm-section-1" icon={<FolderKanban size={14}/>}>
        <Grid>
          <ReadOnly label="Your Company Name" value={user?.companyName || "—"} testId="cm-company" />
          <ReadOnly label="Trade" value={user?.trade || "—"} testId="cm-trade" />
          <ReadOnly label="Date Last Updated" value={ukDate(today)} testId="cm-last-updated" />
        </Grid>
      </Section>

      {/* SECTION 2 — CONTRACT REGISTER */}
      <Section title="Contract Register" testId="cm-section-2">
        <div className="grid gap-4">
          {decorated.map((r, idx) => (
            <div
              key={r.id}
              className="rounded p-4 md:p-5"
              style={{
                background: "rgba(15,15,15,0.5)",
                border: "1px solid rgba(160,157,148,0.18)",
              }}
              data-testid={`cm-row-${idx}`}
            >
              <div className="flex items-center justify-between mb-4">
                <div
                  className="text-xs uppercase tracking-widest text-[#E8A020] font-mono"
                  data-testid={`cm-row-${idx}-ref`}
                >
                  {r.ref}
                  {r.project ? <span className="text-[#706D66] ml-2 normal-case">— {r.project}</span> : null}
                </div>
                <button
                  onClick={() => removeRow(r.id)}
                  className="text-[#706D66] hover:text-red-400 flex items-center gap-1 text-xs"
                  data-testid={`cm-row-${idx}-remove`}
                >
                  <Trash2 size={14}/> Remove
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2 lg:col-span-3">
                  <Inp label="Project Name" value={r.project} onChange={(v) => updateRow(r.id, "project", v)} testId={`cm-row-${idx}-project`} />
                </div>
                <Inp label="Main Contractor or Client" value={r.counterparty} onChange={(v) => updateRow(r.id, "counterparty", v)} testId={`cm-row-${idx}-counterparty`} />
                <Drop label="Contract Type" value={r.contractType} onChange={(v) => updateRow(r.id, "contractType", v)} options={CONTRACT_TYPES} testId={`cm-row-${idx}-type`} />
                <Inp label="Contract Value (£)" type="number" value={r.contractValue} onChange={(v) => updateRow(r.id, "contractValue", v)} testId={`cm-row-${idx}-value`} />
                <Inp label="Start Date" type="date" value={r.startDate} onChange={(v) => updateRow(r.id, "startDate", v)} testId={`cm-row-${idx}-start`} />
                <Inp label="Planned End Date" type="date" value={r.plannedEndDate} onChange={(v) => updateRow(r.id, "plannedEndDate", v)} testId={`cm-row-${idx}-end`} />
                <Inp label="Defects Liability Period End Date (optional)" type="date" value={r.dlpEndDate} onChange={(v) => updateRow(r.id, "dlpEndDate", v)} testId={`cm-row-${idx}-dlp`} />
                <Drop label="Payment Terms" value={r.paymentTerms} onChange={(v) => updateRow(r.id, "paymentTerms", v)} options={PAYMENT_TERMS} testId={`cm-row-${idx}-payment-terms`} />
                {r.paymentTerms === "Other" && (
                  <Inp label="Specify Other Payment Terms" value={r.paymentTermsOther} onChange={(v) => updateRow(r.id, "paymentTermsOther", v)} testId={`cm-row-${idx}-payment-terms-other`} />
                )}
                <YesNo label="Retention Held?" value={r.retentionHeld} onChange={(v) => updateRow(r.id, "retentionHeld", v)} testId={`cm-row-${idx}-retention-held`} />
                {r.retentionHeld && (
                  <Inp label="Retention Percentage" type="number" value={r.retentionPct} onChange={(v) => updateRow(r.id, "retentionPct", v)} helper="Usually 3 or 5 percent" testId={`cm-row-${idx}-retention-pct`} />
                )}
                <div className="sm:col-span-2 lg:col-span-3">
                  <Inp label="Notice Period Required" value={r.noticePeriod} onChange={(v) => updateRow(r.id, "noticePeriod", v)} placeholder='e.g. "14 days written notice"' testId={`cm-row-${idx}-notice`} />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Inp label="Key Obligations" value={r.keyObligations} onChange={(v) => updateRow(r.id, "keyObligations", v)} placeholder="Any specific obligations you must meet under this contract" testId={`cm-row-${idx}-obligations`} />
                </div>
                <Drop label="Current Status" value={r.status} onChange={(v) => updateRow(r.id, "status", v)} options={STATUS_OPTIONS} testId={`cm-row-${idx}-status`} />
                <div className="sm:col-span-2 lg:col-span-3">
                  <Inp label="Notes (optional)" value={r.notes} onChange={(v) => updateRow(r.id, "notes", v)} testId={`cm-row-${idx}-notes`} />
                </div>
              </div>

              <div
                className="mt-4 pt-4 flex items-center justify-between"
                style={{ borderTop: "1px solid rgba(160,157,148,0.18)" }}
              >
                <div className="text-[10px] uppercase tracking-widest text-[#706D66]">Contract Value</div>
                <div className="font-display text-2xl text-[#E8A020]" data-testid={`cm-row-${idx}-value-label`}>
                  {money(N(r.contractValue))}
                </div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={addRow} className="btn-secondary flex items-center gap-2 text-xs mt-4" data-testid="cm-add-row">
          <Plus size={12}/> Add Contract
        </button>
      </Section>

      {/* SECTION 3 — SUMMARY PANEL */}
      <Section title="Summary" testId="cm-section-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <SummaryStat label="Active Contracts"                value={summary.totalActive}                  testId="cm-sum-active" />
          <SummaryStat label="Total Combined Contract Value"    value={money(summary.totalValue)}            testId="cm-sum-value" />
          <SummaryStat label="Total Retention Held"             value={money(summary.totalRetention)}        testId="cm-sum-retention" />
          <SummaryStat label="In Defects Liability Period"      value={summary.inDlp}      testId="cm-sum-dlp"      highlight="gold" />
          <SummaryStat label="Payment Due This Month"           value={summary.dueThisMonth} testId="cm-sum-due-month" highlight="gold" />
          <SummaryStat label="Letter of Intent — Not Yet Signed" value={summary.loiRisk}    testId="cm-sum-loi"      highlight="gold" />
        </div>
      </Section>

      {/* SECTION 4 — IMPORTANT NOTE */}
      <div
        className="rounded p-5 mb-5 flex gap-3"
        style={{
          background: "rgba(232,160,32,0.08)",
          border: "1px solid #E8A020",
        }}
        data-testid="cm-important-note"
      >
        <AlertTriangle size={20} className="text-[#E8A020] shrink-0 mt-0.5" />
        <div className="text-sm text-[#F0EDE8] leading-relaxed">
          Never start work on a letter of intent alone without understanding what it covers. A letter of intent is not a full contract. Use the Contract Review tool to check any contract before signing.
        </div>
      </div>

      {/* SECTION 5 — SIGN OFF */}
      <Section title="Compiled by — Sign Off" testId="cm-section-5">
        <LiveSignatureBlock
          label="Compiled by"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="cm-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="cm-sig-date">
          Date: {ukDate(today)}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="cm-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Contract Register</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="cm-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated register</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Contract Register — ${user?.companyName || "company"}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="cm-output">{result}</pre>
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
  const palette = {
    gold: { bg: "rgba(232,160,32,0.10)", border: "#E8A020", text: "#E8A020" },
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
