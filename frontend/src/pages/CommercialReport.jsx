import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";
import DraftSaveButton from "../components/DraftSaveButton";
import useToolDraft from "../hooks/useToolDraft";

const TOOL_ID   = "commercial-report";
const TOOL_NAME = "Commercial Report";
const TOOL_INFO =
  "Weekly or monthly commercial position report. Pulls earned value, cost to date, invoiced and received cash, retention, forecast final account, programme position, outstanding variations, and risks/opportunities into one clean document. Use to track the commercial health of every project.";

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoMinusDays = (days) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
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
const money = (n) => {
  const num = Number(n) || 0;
  const sign = num < 0 ? "-" : "";
  return `${sign}£${Math.abs(num).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const PROGRAMME_OPTIONS = [
  "Ahead of programme",
  "On programme",
  "Slightly behind",
  "Significantly behind",
  "Programme not agreed",
];

export default function CommercialReport() {
  const { user, refresh } = useAuth();

  // SECTION 1 — REPORT DETAILS
  const [project, setProject]           = useState("");
  const [periodFrom, setPeriodFrom]     = useState(isoMinusDays(30));
  const [periodTo, setPeriodTo]         = useState(isoToday());
  const [reportDate, setReportDate]     = useState(isoToday());

  // SECTION 2 — FINANCIALS
  const [earnedValue, setEarnedValue]   = useState("");
  const [costToDate, setCostToDate]     = useState("");
  const [contractValue, setContractValue] = useState("");
  const [variationsAgreed, setVariationsAgreed] = useState("");
  const [amountInvoiced, setAmountInvoiced] = useState("");
  const [amountReceived, setAmountReceived] = useState("");
  const [retentionHeld, setRetentionHeld] = useState("");
  const [forecastFinalAccount, setForecastFinalAccount] = useState("");
  const [outstandingVariations, setOutstandingVariations] = useState("");

  // SECTION 3 — PROGRESS
  const [percentComplete, setPercentComplete] = useState("");
  const [programmeStatus, setProgrammeStatus] = useState("On programme");

  // SECTION 4 — RISKS / ACTIONS
  const [risks, setRisks]               = useState("");
  const [actions, setActions]           = useState("");

  // Output / sign-off
  const [infoOpen, setInfoOpen]         = useState(false);
  const [generating, setGenerating]     = useState(false);
  const [result, setResult]             = useState("");
  const [refNumber, setRefNumber]       = useState("");
  const [liveSignature, setLiveSignature] = useState("");

  // ---------- Draft save/resume ----------
  const getDraftData = () => ({
    project, periodFrom, periodTo, reportDate, earnedValue, costToDate,
    contractValue, variationsAgreed, amountInvoiced, amountReceived,
    retentionHeld, forecastFinalAccount, outstandingVariations,
    percentComplete, programmeStatus, risks, actions,
    result, refNumber, liveSignature,
  });
  useToolDraft(TOOL_ID, (p) => {
    if (p.project !== undefined) setProject(p.project);
    if (p.periodFrom !== undefined) setPeriodFrom(p.periodFrom);
    if (p.periodTo !== undefined) setPeriodTo(p.periodTo);
    if (p.reportDate !== undefined) setReportDate(p.reportDate);
    if (p.earnedValue !== undefined) setEarnedValue(p.earnedValue);
    if (p.costToDate !== undefined) setCostToDate(p.costToDate);
    if (p.contractValue !== undefined) setContractValue(p.contractValue);
    if (p.variationsAgreed !== undefined) setVariationsAgreed(p.variationsAgreed);
    if (p.amountInvoiced !== undefined) setAmountInvoiced(p.amountInvoiced);
    if (p.amountReceived !== undefined) setAmountReceived(p.amountReceived);
    if (p.retentionHeld !== undefined) setRetentionHeld(p.retentionHeld);
    if (p.forecastFinalAccount !== undefined) setForecastFinalAccount(p.forecastFinalAccount);
    if (p.outstandingVariations !== undefined) setOutstandingVariations(p.outstandingVariations);
    if (p.percentComplete !== undefined) setPercentComplete(p.percentComplete);
    if (p.programmeStatus !== undefined) setProgrammeStatus(p.programmeStatus);
    if (p.risks !== undefined) setRisks(p.risks);
    if (p.actions !== undefined) setActions(p.actions);
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

  // Auto-calculated values
  const revisedContractValue = useMemo(
    () => N(contractValue) + N(variationsAgreed),
    [contractValue, variationsAgreed]
  );
  const amountOutstanding = useMemo(
    () => N(amountInvoiced) - N(amountReceived),
    [amountInvoiced, amountReceived]
  );
  const forecastProfitLoss = useMemo(
    () => N(forecastFinalAccount) - N(costToDate),
    [forecastFinalAccount, costToDate]
  );

  const profitPositive = forecastProfitLoss > 0;
  const profitNegative = forecastProfitLoss < 0;

  const periodLabel = `${ukDate(periodFrom)} to ${ukDate(periodTo)}`;

  const onGenerate = async () => {
    if (!project.trim()) { toast.error("Add the project name"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const financialBlock = [
      `Contract Value: ${money(N(contractValue))}`,
      `Variations Agreed to Date: ${money(N(variationsAgreed))}`,
      `Revised Contract Value: ${money(revisedContractValue)}`,
      `Earned Value: ${money(N(earnedValue))}`,
      `Cost to Date: ${money(N(costToDate))}`,
      `Amount Invoiced to Date: ${money(N(amountInvoiced))}`,
      `Amount Received to Date: ${money(N(amountReceived))}`,
      `Amount Outstanding: ${money(amountOutstanding)}`,
      `Retention Held: ${money(N(retentionHeld))}`,
      `Outstanding Variations (Instructed but not yet Agreed): ${money(N(outstandingVariations))}`,
      `Forecast Final Account Value: ${money(N(forecastFinalAccount))}`,
      `Forecast Profit or Loss: ${money(forecastProfitLoss)}`,
    ].join("\n   ");

    const progressBlock = [
      `Percentage Complete: ${percentComplete || "—"}${percentComplete ? " percent" : ""}`,
      `Programme Status: ${programmeStatus}`,
    ].join("\n   ");

    const promptTemplate = `Produce a UK COMMERCIAL REPORT. Plain direct construction English. No padding. No banned consultant words. Full words only — never use abbreviations such as 'N/A', 'TBC', 'qty', '&', 'inc.', 'excl.', 'approx.' or 'etc.'. This report represents the commercial position of one project as understood at the date stated.

1. HEADER — DOCUMENT REFERENCE: commercial report. DATE: {reportDateUk} in DD/MM/YYYY format.

2. TITLE — exactly: 'COMMERCIAL REPORT — {project} — {periodLabel}'.

3. REPORT DETAILS — list on separate lines:
   Project Name: {project}
   Report Period: {periodLabel}
   Date of Report: {reportDateUk}
   Report Prepared by: {preparedByName}
   Position: {preparedByRole}
   Company: {companyName}
   Trade: {trade}

4. FINANCIAL POSITION — print on separate lines (use the values supplied — never recalculate):
   {financialBlock}

5. PROGRESS AND PROGRAMME — print on separate lines:
   {progressBlock}

6. FORECAST PROFIT OR LOSS — print on its own line as a clearly marked headline. If the forecast is a profit, prefix with 'FORECAST PROFIT:'. If the forecast is a loss, prefix with 'FORECAST LOSS:'. Use the value supplied:
   {profitLabel}

7. COMMERCIAL RISKS AND OPPORTUNITIES — print the supplied text verbatim as a paragraph. If empty, write '— No risks or opportunities recorded at this time —':
   {risks}

8. ACTIONS REQUIRED — print the supplied text verbatim as a paragraph. If empty, write '— No actions recorded —':
   {actions}

9. PREPARED BY — sign-off block:
   Report Prepared by: {preparedByName}
   Position: {preparedByRole}
   Company: {companyName}
   Date: {reportDateUk}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

10. FOOTER — print verbatim on its own line:
    This report represents the commercial position as understood at the date stated. It should be reviewed and updated at regular intervals throughout the project.

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Never invent figures, dates or percentages. Use only the supplied values.
- Full words only — write every word out in full. Never abbreviate.
- Skip blank optional fields cleanly. Use '—' only where supplied.
- No banned words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct. Reads as a real commercial report from a quantity surveyor or subcontractor boss.`;

    const profitLabel = profitPositive
      ? `FORECAST PROFIT: ${money(forecastProfitLoss)}`
      : profitNegative
        ? `FORECAST LOSS: ${money(Math.abs(forecastProfitLoss))}`
        : `FORECAST BREAK-EVEN: ${money(0)}`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          reportDateUk: ukDate(reportDate),
          project,
          periodLabel,
          companyName: user?.companyName || "—",
          trade: user?.trade || "—",
          financialBlock,
          progressBlock,
          profitLabel,
          risks: risks || "",
          actions: actions || "",
          preparedByName: user?.fullName || "—",
          preparedByRole: user?.signatureRole || "Director",
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Commercial Report generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Commercial Report — ${project || "project"} — ${periodLabel}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-commercial-report">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Contractors</div>
          <h1 className="font-display text-4xl md:text-5xl">Commercial Report</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="cr-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="cr-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 — REPORT DETAILS */}
      <Section title="Report Details" testId="cr-section-1" icon={<BarChart3 size={14}/>}>
        <Grid>
          <Inp label="Project Name" value={project} onChange={setProject} testId="cr-project" />
          <Inp label="Report Period — From" type="date" value={periodFrom} onChange={setPeriodFrom} testId="cr-period-from" />
          <Inp label="Report Period — To" type="date" value={periodTo} onChange={setPeriodTo} testId="cr-period-to" />
          <Inp label="Date of Report" type="date" value={reportDate} onChange={setReportDate} testId="cr-report-date" helper="Defaults to today" />
          <ReadOnly label="Report prepared by" value={user?.fullName || "—"} testId="cr-prepared-by" />
          <ReadOnly label="Position" value={user?.signatureRole || "Director"} testId="cr-prepared-role" />
        </Grid>
      </Section>

      {/* SECTION 2 — FINANCIAL POSITION */}
      <Section title="Financial Position" testId="cr-section-2">
        <Grid>
          <Inp label="Contract Value (£)" type="number" value={contractValue} onChange={setContractValue} helper="Original agreed contract value" testId="cr-contract-value" />
          <Inp label="Variations Agreed to Date (£)" type="number" value={variationsAgreed} onChange={setVariationsAgreed} helper="Total value of agreed variations added to the contract" testId="cr-variations-agreed" />
          <ReadOnly label="Revised Contract Value (£)" value={money(revisedContractValue)} testId="cr-revised-value" />
          <Inp label="Earned Value (£)" type="number" value={earnedValue} onChange={setEarnedValue} helper="Value of works completed to date" testId="cr-earned-value" />
          <Inp label="Cost to Date (£)" type="number" value={costToDate} onChange={setCostToDate} helper="Total costs incurred to date" testId="cr-cost-to-date" />
          <Inp label="Amount Invoiced to Date (£)" type="number" value={amountInvoiced} onChange={setAmountInvoiced} helper="Total value of invoices or applications submitted" testId="cr-amount-invoiced" />
          <Inp label="Amount Received to Date (£)" type="number" value={amountReceived} onChange={setAmountReceived} helper="Total payments actually received" testId="cr-amount-received" />
          <ReadOnly label="Amount Outstanding (£)" value={money(amountOutstanding)} testId="cr-amount-outstanding" />
          <Inp label="Retention Held (£) — optional" type="number" value={retentionHeld} onChange={setRetentionHeld} testId="cr-retention-held" />
          <Inp label="Outstanding Variations (£)" type="number" value={outstandingVariations} onChange={setOutstandingVariations} helper="Value of variations instructed but not yet agreed" testId="cr-outstanding-variations" />
          <Inp label="Forecast Final Account Value (£)" type="number" value={forecastFinalAccount} onChange={setForecastFinalAccount} helper="Your best estimate of the final contract value including all variations" testId="cr-forecast-final" />
          <ProfitLossStat
            label="Forecast Profit or Loss (£)"
            value={forecastProfitLoss}
            positive={profitPositive}
            negative={profitNegative}
            testId="cr-forecast-profit-loss"
          />
        </Grid>
      </Section>

      {/* SECTION 3 — PROGRESS */}
      <Section title="Progress and Programme" testId="cr-section-3">
        <Grid>
          <Inp label="Percentage Complete (%)" type="number" value={percentComplete} onChange={setPercentComplete} helper="Estimated percentage of works complete" testId="cr-percent-complete" />
          <Drop label="Programme Status" value={programmeStatus} onChange={setProgrammeStatus} options={PROGRAMME_OPTIONS} testId="cr-programme-status" />
        </Grid>
      </Section>

      {/* SECTION 4 — RISKS / ACTIONS */}
      <Section title="Commercial Risks, Opportunities and Actions" testId="cr-section-4">
        <Area
          label="Commercial Risks and Opportunities"
          value={risks}
          onChange={setRisks}
          rows={4}
          placeholder="List any risks that could affect the commercial outcome, and any opportunities to improve it"
          testId="cr-risks"
        />
        <div className="mt-4">
          <Area
            label="Actions Required"
            value={actions}
            onChange={setActions}
            rows={4}
            placeholder="What needs to happen to protect or improve the commercial position?"
            testId="cr-actions"
          />
        </div>
      </Section>

      {/* SECTION 5 — SIGN OFF */}
      <Section title="Report prepared by — Sign Off" testId="cr-section-5">
        <LiveSignatureBlock
          label="Report prepared by"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="cr-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="cr-sig-date">
          Date: {ukDate(reportDate) || "—"}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="cr-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Commercial Report</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="cr-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated report</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Commercial Report — ${project} — ${periodLabel}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="cr-output">{result}</pre>
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
function Area({ label, value, onChange, placeholder, testId, rows = 3 }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="input-base"
        data-testid={testId}
      />
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
function ProfitLossStat({ label, value, positive, negative, testId }) {
  const color = positive ? "#E8A020" : (negative ? "#FF8A8A" : "#F0EDE8");
  const border = positive ? "#E8A020" : (negative ? "#DC3C3C" : "rgba(160,157,148,0.18)");
  const bg = positive
    ? "rgba(232,160,32,0.10)"
    : (negative ? "rgba(220,60,60,0.10)" : "rgba(15,15,15,0.6)");
  return (
    <div
      data-testid={testId}
      className="p-4 rounded"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <div className="text-[10px] uppercase tracking-widest text-[#706D66] mb-1">{label}</div>
      <div className="font-display text-3xl" style={{ color }}>
        {money(value)}
      </div>
    </div>
  );
}
