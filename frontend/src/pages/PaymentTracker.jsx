import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, AlertTriangle, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";
import DraftSaveButton from "../components/DraftSaveButton";
import useToolDraft from "../hooks/useToolDraft";

const TOOL_ID   = "payment-tracker";
const TOOL_NAME = "Payment Tracker";
const TOOL_INFO =
  "Live financial register of every invoice raised, CIS deducted, payment received and retention held — across all your active jobs for the tax year. The total CIS deducted figure is the number you reclaim on your Self Assessment return at year end.";

const isoToday = () => new Date().toISOString().slice(0, 10);

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function daysFromToday(iso) {
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const target = new Date(`${iso}T00:00:00Z`);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

const N = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const money = (n) =>
  `£${(Number(n) || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// UK tax year runs 6 April to 5 April. Pick the current year based on today.
function currentTaxYearLabel() {
  const d = new Date();
  const y = d.getUTCFullYear();
  // tax year boundary is 6 April
  const beforeBoundary = (d.getUTCMonth() < 3) || (d.getUTCMonth() === 3 && d.getUTCDate() < 6);
  const start = beforeBoundary ? y - 1 : y;
  const end = String((start + 1) % 100).padStart(2, "0");
  return `${start}/${end}`;
}

const TAX_YEAR_OPTIONS = ["2024/25", "2025/26", "2026/27"];
const CIS_RATES = ["0%", "20%", "30%"];
const STATUS_OPTIONS = [
  "Awaiting payment",
  "Partially paid",
  "Paid in full",
  "Overdue — chasing",
  "Disputed",
  "Written off",
];

function refForIndex(i) { return `PT-${String(i + 1).padStart(3, "0")}`; }

function makeRow() {
  return {
    id: crypto.randomUUID(),
    project: "",
    contractor: "",
    invoiceNumber: "",
    invoiceDate: "",
    invoiceAmount: "",
    cisRate: "20%",
    paymentDueDate: "",
    amountReceived: "",
    dateReceived: "",
    retentionHeld: "",
    status: "Awaiting payment",
    notes: "",
  };
}

export default function PaymentTracker() {
  const { user, refresh } = useAuth();

  // SECTION 1 — TRACKER DETAILS
  const initialTaxYear = TAX_YEAR_OPTIONS.includes(currentTaxYearLabel())
    ? currentTaxYearLabel()
    : "2025/26";
  const [taxYear, setTaxYear]         = useState(initialTaxYear);
  const dateLastUpdated               = isoToday();

  // SECTION 2 — ROWS
  const [rows, setRows] = useState([makeRow()]);

  // Output / sign-off
  const [infoOpen, setInfoOpen]       = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [result, setResult]           = useState("");
  const [refNumber, setRefNumber]     = useState("");
  const [liveSignature, setLiveSignature] = useState("");

  // ---------- Draft save/resume ----------
  const getDraftData = () => ({ taxYear, rows, result, refNumber, liveSignature });
  useToolDraft(TOOL_ID, (p) => {
    if (p.taxYear !== undefined) setTaxYear(p.taxYear);
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
    return rows.map((r, i) => {
      const inv = N(r.invoiceAmount);
      const cisPct = N(r.cisRate.replace("%", "")) / 100;
      const cis = +(inv * cisPct).toFixed(2);
      const net = +(inv - cis).toFixed(2);
      const received = N(r.amountReceived);
      const outstanding = +(net - received).toFixed(2);
      const overdueDays = r.paymentDueDate ? daysFromToday(r.paymentDueDate) : null;
      const isOverdueNow = overdueDays !== null && overdueDays < 0 && outstanding > 0 && r.status !== "Paid in full" && r.status !== "Written off";
      return { ...r, ref: refForIndex(i), cis, net, outstanding, isOverdueNow };
    });
  }, [rows]);

  const summary = useMemo(() => {
    const populated = decorated.filter((r) => (r.invoiceNumber || "").trim() || (r.project || "").trim() || N(r.invoiceAmount) > 0);
    let totalInvoiced = 0, totalCis = 0, totalNet = 0, totalReceived = 0, totalRetention = 0, totalOutstanding = 0;
    let overdueCount = 0, disputedCount = 0;
    for (const r of populated) {
      totalInvoiced  += N(r.invoiceAmount);
      totalCis       += r.cis;
      totalNet       += r.net;
      totalReceived  += N(r.amountReceived);
      totalRetention += N(r.retentionHeld);
      totalOutstanding += Math.max(r.outstanding, 0);
      if (r.status === "Overdue — chasing" || r.isOverdueNow) overdueCount += 1;
      if (r.status === "Disputed") disputedCount += 1;
    }
    return {
      count: populated.length,
      totalInvoiced:  +totalInvoiced.toFixed(2),
      totalCis:       +totalCis.toFixed(2),
      totalNet:       +totalNet.toFixed(2),
      totalReceived:  +totalReceived.toFixed(2),
      totalRetention: +totalRetention.toFixed(2),
      totalOutstanding: +totalOutstanding.toFixed(2),
      overdueCount,
      disputedCount,
    };
  }, [decorated]);

  const onGenerate = async () => {
    const populated = decorated.filter((r) => (r.invoiceNumber || "").trim() && N(r.invoiceAmount) > 0);
    if (populated.length === 0) { toast.error("Add at least one invoice with an invoice number and amount"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const itemsBlock = populated.map((r) => {
      return [
        `Reference Number: ${r.ref}`,
        `Project Name: ${r.project || "—"}`,
        `Main Contractor / Client: ${r.contractor || "—"}`,
        `Invoice Number: ${r.invoiceNumber || "—"}`,
        `Invoice Date: ${ukDate(r.invoiceDate) || "—"}`,
        `Invoice Amount (gross): ${money(N(r.invoiceAmount))}`,
        `CIS Deduction Rate: ${r.cisRate}`,
        `CIS Amount Deducted: ${money(r.cis)}`,
        `Net Amount Due: ${money(r.net)}`,
        `Payment Due Date: ${ukDate(r.paymentDueDate) || "—"}`,
        `Amount Received: ${money(N(r.amountReceived))}`,
        `Date Received: ${ukDate(r.dateReceived) || "—"}`,
        `Retention Held: ${money(N(r.retentionHeld))}`,
        `Outstanding Balance: ${money(r.outstanding)}`,
        `Status: ${r.status}`,
        `Notes: ${r.notes || "—"}`,
      ].join(" | ");
    }).join("\n");

    const promptTemplate = `Produce a UK PAYMENT TRACKER. Plain direct construction English. No padding. No banned consultant words. Live financial register of every invoice raised across all active jobs for the tax year.

1. HEADER — DOCUMENT REFERENCE, DATE (use {dateLastUpdated} in DD/MM/YYYY format for DATE).

2. TITLE — exactly: 'PAYMENT TRACKER — {taxYear} — {dateLastUpdated}'.

3. TRACKER DETAILS — list on separate lines:
   Company Name: {companyName}
   Tax Year: {taxYear}
   Date Last Updated: {dateLastUpdated}
   Maintained by: {senderName}
   Trade: {trade}

4. PAYMENT TRACKER — print this header line then each invoice below verbatim on its own block, preserving the pipe-delimited structure exactly as supplied:
{itemsBlock}

5. FINANCIAL SUMMARY — print on separate lines (use the supplied values — never recalculate):
   Total invoices on tracker: {count}
   Total invoiced this tax year: {totalInvoiced}
   Total CIS deducted: {totalCis}
   Total net amount due: {totalNet}
   Total received: {totalReceived}
   Total retention held: {totalRetention}
   Total outstanding (unpaid): {totalOutstanding}
   Number of invoices overdue: {overdueCount}
   Number of invoices disputed: {disputedCount}

6. CIS NOTE — print verbatim as one paragraph:
   Keep this tracker updated throughout the year. Your total CIS deducted figure is what you claim back on your Self Assessment tax return. Export this record to share with your accountant at year end.

7. FOOTER — print verbatim on its own line:
   This payment tracker should be retained for a minimum of 5 years for Self Assessment purposes. Total CIS deducted should be reconciled against CIS payment statements received from contractors.

8. SIGN-OFF — single sign-off:
   Tracker Maintained by: {senderName}
   Company: {companyName}
   Date: {dateLastUpdated}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Never invent invoices, dates, rates or values. Use only the supplied rows and the supplied totals.
- Never use abbreviations such as 'N/A', 'TBC', 'qty', '&' or 'inc.'. Write words in full. 'CIS' and 'UTR' are acceptable because they are HMRC's own terminology.
- Skip blank optional fields cleanly. Use '—' only where supplied.
- No banned consultant words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          dateLastUpdated: ukDate(dateLastUpdated),
          taxYear,
          companyName: user?.companyName || "—",
          senderName: user?.fullName || "—",
          trade: user?.trade || "—",
          itemsBlock,
          count: String(summary.count),
          totalInvoiced:    money(summary.totalInvoiced),
          totalCis:         money(summary.totalCis),
          totalNet:         money(summary.totalNet),
          totalReceived:    money(summary.totalReceived),
          totalRetention:   money(summary.totalRetention),
          totalOutstanding: money(summary.totalOutstanding),
          overdueCount:     String(summary.overdueCount),
          disputedCount:    String(summary.disputedCount),
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Payment Tracker generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Payment Tracker — ${taxYear}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-payment-tracker">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Contractors</div>
          <h1 className="font-display text-4xl md:text-5xl">Payment Tracker</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="pt-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="pt-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 — TRACKER DETAILS */}
      <Section title="Tracker Details" testId="pt-section-1" icon={<Wallet size={14}/>}>
        <Grid>
          <ReadOnly label="Your Company Name" value={user?.companyName || "—"} testId="pt-company" helper="Auto-populated from your profile" />
          <Drop label="Tax Year" value={taxYear} onChange={setTaxYear} options={TAX_YEAR_OPTIONS} testId="pt-taxyear" />
          <ReadOnly label="Date Last Updated" value={ukDate(dateLastUpdated)} testId="pt-updated" helper="Today's date, automatically set" />
        </Grid>
      </Section>

      {/* SECTION 2 — PAYMENT TRACKER TABLE */}
      <Section title="Payment Tracker" testId="pt-section-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 2000 }}>
            <thead className="text-[10px] uppercase tracking-widest text-[#706D66]">
              <tr>
                <th className="text-left py-2 pr-2 whitespace-nowrap">Reference Number</th>
                <th className="text-left pr-2">Project Name</th>
                <th className="text-left pr-2">Main Contractor / Client</th>
                <th className="text-left pr-2">Invoice Number</th>
                <th className="text-left pr-2 whitespace-nowrap">Invoice Date</th>
                <th className="text-right pr-2 whitespace-nowrap">Invoice Amount (£)</th>
                <th className="text-left pr-2 whitespace-nowrap">CIS Deduction Rate</th>
                <th className="text-right pr-2 whitespace-nowrap">CIS Amount Deducted (£)</th>
                <th className="text-right pr-2 whitespace-nowrap">Net Amount Due (£)</th>
                <th className="text-left pr-2 whitespace-nowrap">Payment Due Date</th>
                <th className="text-right pr-2 whitespace-nowrap">Amount Received (£)</th>
                <th className="text-left pr-2 whitespace-nowrap">Date Received</th>
                <th className="text-right pr-2 whitespace-nowrap">Retention Held (£)</th>
                <th className="text-right pr-2 whitespace-nowrap">Outstanding Balance (£)</th>
                <th className="text-left pr-2">Status</th>
                <th className="text-left pr-2">Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {decorated.map((r, idx) => (
                <tr key={r.id} className="border-t border-[#F0EDE8]/5 align-top" data-testid={`pt-row-${idx}`}>
                  <td className="py-1 pr-2 text-[#E8A020] text-xs font-mono whitespace-nowrap" data-testid={`pt-row-${idx}-ref`}>{r.ref}</td>
                  <td className="pr-2"><input className="input-base !py-1 !text-sm" value={r.project} onChange={(e) => updateRow(r.id, "project", e.target.value)} data-testid={`pt-row-${idx}-project`} /></td>
                  <td className="pr-2"><input className="input-base !py-1 !text-sm" value={r.contractor} onChange={(e) => updateRow(r.id, "contractor", e.target.value)} data-testid={`pt-row-${idx}-contractor`} /></td>
                  <td className="pr-2"><input className="input-base !py-1 !text-sm" value={r.invoiceNumber} onChange={(e) => updateRow(r.id, "invoiceNumber", e.target.value)} data-testid={`pt-row-${idx}-inv-num`} /></td>
                  <td className="pr-2"><input type="date" className="input-base !py-1 !text-sm" value={r.invoiceDate} onChange={(e) => updateRow(r.id, "invoiceDate", e.target.value)} data-testid={`pt-row-${idx}-inv-date`} /></td>
                  <td className="pr-2"><input type="number" min="0" step="0.01" className="input-base !py-1 !text-sm text-right" value={r.invoiceAmount} onChange={(e) => updateRow(r.id, "invoiceAmount", e.target.value)} data-testid={`pt-row-${idx}-inv-amount`} /></td>
                  <td className="pr-2">
                    <select className="input-base !py-1 !text-sm" value={r.cisRate} onChange={(e) => updateRow(r.id, "cisRate", e.target.value)} data-testid={`pt-row-${idx}-cis-rate`}>
                      {CIS_RATES.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="pr-2 whitespace-nowrap text-right">
                    <div className="px-2 py-1 rounded text-xs font-mono inline-block" style={{ background: "rgba(15,15,15,0.4)", border: "1px solid rgba(160,157,148,0.18)", color: "#F0EDE8" }} data-testid={`pt-row-${idx}-cis-amount`}>
                      {money(r.cis)}
                    </div>
                  </td>
                  <td className="pr-2 whitespace-nowrap text-right">
                    <div className="px-2 py-1 rounded text-xs font-mono inline-block" style={{ background: "rgba(15,15,15,0.4)", border: "1px solid rgba(160,157,148,0.18)", color: "#F0EDE8" }} data-testid={`pt-row-${idx}-net`}>
                      {money(r.net)}
                    </div>
                  </td>
                  <td className="pr-2"><input type="date" className="input-base !py-1 !text-sm" value={r.paymentDueDate} onChange={(e) => updateRow(r.id, "paymentDueDate", e.target.value)} data-testid={`pt-row-${idx}-due`} /></td>
                  <td className="pr-2"><input type="number" min="0" step="0.01" className="input-base !py-1 !text-sm text-right" value={r.amountReceived} onChange={(e) => updateRow(r.id, "amountReceived", e.target.value)} data-testid={`pt-row-${idx}-received`} /></td>
                  <td className="pr-2"><input type="date" className="input-base !py-1 !text-sm" value={r.dateReceived} onChange={(e) => updateRow(r.id, "dateReceived", e.target.value)} data-testid={`pt-row-${idx}-received-date`} /></td>
                  <td className="pr-2"><input type="number" min="0" step="0.01" className="input-base !py-1 !text-sm text-right" value={r.retentionHeld} onChange={(e) => updateRow(r.id, "retentionHeld", e.target.value)} data-testid={`pt-row-${idx}-retention`} /></td>
                  <td className="pr-2 whitespace-nowrap text-right">
                    <div
                      className="px-2 py-1 rounded text-xs font-mono inline-block"
                      style={{
                        background: r.outstanding > 0 ? "rgba(232,160,32,0.15)" : "rgba(15,15,15,0.4)",
                        border: `1px solid ${r.outstanding > 0 ? "#E8A020" : "rgba(160,157,148,0.18)"}`,
                        color: r.outstanding > 0 ? "#E8A020" : "#F0EDE8",
                      }}
                      data-testid={`pt-row-${idx}-outstanding`}
                    >{money(r.outstanding)}</div>
                  </td>
                  <td className="pr-2">
                    <select className="input-base !py-1 !text-sm" value={r.status} onChange={(e) => updateRow(r.id, "status", e.target.value)} data-testid={`pt-row-${idx}-status`}>
                      {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="pr-2"><input className="input-base !py-1 !text-sm" value={r.notes} onChange={(e) => updateRow(r.id, "notes", e.target.value)} data-testid={`pt-row-${idx}-notes`} /></td>
                  <td className="text-right"><button onClick={() => removeRow(r.id)} className="text-[#706D66] hover:text-red-400" data-testid={`pt-row-${idx}-remove`}><Trash2 size={14}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addRow} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="pt-add-row">
          <Plus size={12}/> Add Invoice
        </button>
        <div className="text-[10px] text-[#706D66] mt-2">
          CIS Amount and Net Amount are auto-calculated. Outstanding Balance = Net Amount Due minus Amount Received and highlights in gold when greater than zero.
        </div>
      </Section>

      {/* SECTION 3 — FINANCIAL SUMMARY */}
      <Section title="Financial Summary" testId="pt-section-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Stat label="Total invoiced this tax year" value={money(summary.totalInvoiced)} testId="pt-sum-invoiced" />
          <Stat label="Total CIS deducted" value={money(summary.totalCis)} testId="pt-sum-cis" />
          <Stat label="Total net amount due" value={money(summary.totalNet)} testId="pt-sum-net" />
          <Stat label="Total received" value={money(summary.totalReceived)} testId="pt-sum-received" />
          <Stat label="Total retention held" value={money(summary.totalRetention)} testId="pt-sum-retention" />
          <Stat label="Total outstanding (unpaid)" value={money(summary.totalOutstanding)} testId="pt-sum-outstanding" highlight={summary.totalOutstanding > 0} />
          <Stat label="Number of invoices overdue" value={String(summary.overdueCount)} testId="pt-sum-overdue" danger={summary.overdueCount > 0} />
          <Stat label="Number of invoices disputed" value={String(summary.disputedCount)} testId="pt-sum-disputed" warn={summary.disputedCount > 0} />
        </div>
      </Section>

      {/* SECTION 4 — CIS NOTE */}
      <div
        className="card-dark p-5 mb-5 flex items-start gap-3"
        style={{ borderColor: "#E8A020", background: "rgba(232,160,32,0.08)" }}
        data-testid="pt-cis-note"
      >
        <AlertTriangle size={18} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
        <div className="text-sm text-[#F0EDE8] leading-relaxed">
          Keep this tracker updated throughout the year. Your total CIS deducted figure is what you claim back on your Self Assessment tax return. Export this record to share with your accountant at year end.
        </div>
      </div>

      {/* SIGN OFF */}
      <Section title="Sign Off" testId="pt-section-signoff">
        <LiveSignatureBlock
          label="Tracker signature"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="pt-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="pt-sig-date">
          Date: {ukDate(dateLastUpdated) || "—"}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="pt-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Payment Tracker</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="pt-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated tracker</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Payment Tracker — ${taxYear}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="pt-output">{result}</pre>
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
function ReadOnly({ label, value, testId, helper }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <div className="input-base !cursor-default" data-testid={testId}>{value}</div>
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
function Stat({ label, value, testId, warn, danger, highlight }) {
  let color = "#F0EDE8";
  let border = "rgba(160,157,148,0.18)";
  let bg = "rgba(15,15,15,0.6)";
  if (warn)      { color = "#E8A020"; border = "#E8A020"; bg = "rgba(232,160,32,0.10)"; }
  if (danger)    { color = "#FF6B6B"; border = "#FF6B6B"; bg = "rgba(255,107,107,0.10)"; }
  if (highlight) { color = "#E8A020"; border = "#E8A020"; bg = "rgba(232,160,32,0.10)"; }
  return (
    <div
      data-testid={testId}
      className="p-4 rounded"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <div className="text-[10px] uppercase tracking-widest text-[#706D66] mb-1">{label}</div>
      <div className="font-display text-2xl" style={{ color }}>{value}</div>
    </div>
  );
}
