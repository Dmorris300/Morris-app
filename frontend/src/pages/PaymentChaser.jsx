import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { toast } from "sonner";
import { ChevronLeft, FileText, Mail, MessageSquare, Phone, Download, Copy, Info, Star, X, Link2 } from "lucide-react";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";
import { Link } from "react-router-dom";
import { listDrafts, fetchDraft } from "../lib/drafts";

// Chase history — local, per-browser. Records every generated chase against
// the invoice being chased so Stage 2/3 letters can reference real previous
// chase dates without the LLM inventing them.
const CHASE_HISTORY_KEY = "morris_chase_history_v1";
function readChaseHistory() {
  try {
    const raw = localStorage.getItem(CHASE_HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed : {};
  } catch { return {}; }
}
function writeChaseHistory(map) {
  try { localStorage.setItem(CHASE_HISTORY_KEY, JSON.stringify(map)); } catch { /* quota */ }
}
function historyKey(invNo) {
  return (invNo || "").trim().toLowerCase();
}
function recordChase(invNo, stage) {
  const k = historyKey(invNo);
  if (!k) return;
  const map = readChaseHistory();
  const arr = Array.isArray(map[k]) ? map[k] : [];
  arr.push({ stage, date: new Date().toISOString() });
  map[k] = arr.slice(-10); // cap history depth
  writeChaseHistory(map);
}
function historyFor(invNo) {
  const k = historyKey(invNo);
  return readChaseHistory()[k] || [];
}
function ukDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB");
}

// Bank of England base rate at the time of writing — manually maintained.
// To update: change this single constant when the BoE changes the base rate.
const BOE_BASE_RATE = 0.0475; // 4.75% (Feb 2026 — check on next BoE MPC meeting)
const BOE_BASE_RATE_AS_OF = "1 February 2026";
const STATUTORY_INTEREST_RATE = BOE_BASE_RATE + 0.08; // 8% above base, per Late Payment Act 1998

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoInDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function compensationFor(outstanding) {
  const v = Number(outstanding) || 0;
  if (v < 1000) return 40;
  if (v < 10000) return 70;
  return 100;
}

function daysBetween(isoFrom, isoTo) {
  if (!isoFrom || !isoTo) return 0;
  const a = new Date(isoFrom); const b = new Date(isoTo);
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

const STAGES = [
  { id: 1, label: "Stage 1 — First Reminder", sub: "Polite, assumes oversight" },
  { id: 2, label: "Stage 2 — Second Reminder", sub: "Firm, references previous chase" },
  { id: 3, label: "Stage 3 — Final Notice", sub: "Letter Before Action-style — seek legal advice" },
];

const fGBP = (n) => `£${(Number(n) || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TOOL_ID = "payment-chaser";
const TOOL_NAME = "Payment Chaser";
const TOOL_INFO = "A three-stage payment chaser. Stage 1 polite reminder, Stage 2 firm with statutory interest, Stage 3 Letter Before Action under the Late Payment of Commercial Debts (Interest) Act 1998 — compensation and final 7-day deadline auto-applied.";

export default function PaymentChaser() {
  const { user, refresh } = useAuth();
  const [stage, setStage] = useState(1);
  const [form, setForm] = useState({
    clientName: "",
    clientAddress: "",
    invNo: "", // BUG FIXED: plain text, no default
    invDate: isoToday(),
    invAmount: "",
    outstanding: "",
    description: "",
    previousChases: "",
    paymentDeadline: isoInDays(7),
    addStatutoryInterest: "Yes",
    paymentDetails: "",
    bankNameEdit: user?.bankName || "",
    sortCodeEdit: user?.sortCode || "",
    accountNumberEdit: user?.accountNumber || "",
    // Optional construction payment context — only surface in the letter
    // when the user supplies a value.
    projectName: "",
    contractRef: "",
    paymentAppRef: "",
    finalDateForPayment: "",
    payNoticeInfo: "",
  });
  const [linkedTrackerInvoice, setLinkedTrackerInvoice] = useState(null); // { draftId, rowId } when a tracker row is linked
  const [trackerRows, setTrackerRows] = useState([]); // outstanding rows loaded from Payment Tracker draft
  const [trackerLoading, setTrackerLoading] = useState(false);
  const [trackerModalOpen, setTrackerModalOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState("");
  const [refNumber, setRefNumber] = useState("");
  const [liveSignature, setLiveSignature] = useState("");
  const [clientSignature, setClientSignature] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);

  const isFav = (user?.favourites || []).includes(TOOL_ID);
  const toggleFav = async () => {
    const cur = user?.favourites || [];
    const next = isFav ? cur.filter((x) => x !== TOOL_ID) : [...cur, TOOL_ID];
    try { await api.post("/profile/update", { favourites: next }); await refresh(); toast.success(isFav ? "Removed from favourites" : "Added to favourites"); }
    catch { toast.error("Could not update favourites"); }
  };

  // ---------- Payment Tracker import ----------
  // Loads the user's Payment Tracker draft(s) and offers any row that still
  // has an outstanding balance. Purely additive — the user can still fill
  // the form manually without ever opening this modal.
  const openTrackerImport = async () => {
    setTrackerLoading(true); setTrackerModalOpen(true);
    try {
      const drafts = await listDrafts();
      const ptDrafts = (Array.isArray(drafts) ? drafts : []).filter((d) => d.toolId === "payment-tracker");
      if (ptDrafts.length === 0) {
        setTrackerRows([]);
        return;
      }
      // Pull the newest draft's full data
      const latest = ptDrafts.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))[0];
      const full = await fetchDraft(latest.id);
      const rows = Array.isArray(full?.data?.rows) ? full.data.rows : [];
      const outstanding = rows
        .map((r) => {
          const inv = Number(r.invoiceAmount) || 0;
          const cisPct = Number(String(r.cisRate || "0").replace("%", "")) / 100;
          const cis = +(inv * cisPct).toFixed(2);
          const net = +(inv - cis).toFixed(2);
          const received = Number(r.amountReceived) || 0;
          const outstandingAmt = +(net - received).toFixed(2);
          return { ...r, draftId: latest.id, outstandingAmt };
        })
        .filter((r) => (r.invoiceNumber || "").trim() && r.outstandingAmt > 0 && r.status !== "Paid in full" && r.status !== "Written off");
      setTrackerRows(outstanding);
    } catch {
      toast.error("Could not load Payment Tracker");
      setTrackerRows([]);
    } finally { setTrackerLoading(false); }
  };

  const importTrackerRow = (row) => {
    setForm((f) => ({
      ...f,
      clientName: row.contractor || f.clientName,
      projectName: row.project || f.projectName,
      invNo: row.invoiceNumber || f.invNo,
      invDate: row.invoiceDate || f.invDate,
      invAmount: String(row.invoiceAmount ?? f.invAmount ?? ""),
      outstanding: String(row.outstandingAmt ?? f.outstanding ?? ""),
      description: row.notes || f.description,
      paymentDeadline: row.paymentDueDate || f.paymentDeadline,
    }));
    setLinkedTrackerInvoice({ draftId: row.draftId, rowId: row.id });
    setTrackerModalOpen(false);
    toast.success(`Linked to Payment Tracker · ${row.invoiceNumber}`);
  };

  // ---------- Auto-fill previous chases from local history ----------
  // Runs whenever the invoice number is changed. Only fills the field when
  // it's currently empty so we don't overwrite anything the user typed.
  useEffect(() => {
    if (!form.invNo || form.previousChases) return;
    const hist = historyFor(form.invNo);
    if (hist.length === 0) return;
    const lines = hist.map((h) => {
      const stageLabel = h.stage === 3 ? "Final notice" : h.stage === 2 ? "Second reminder" : "First reminder";
      return `${stageLabel} sent ${ukDate(h.date)}`;
    });
    setForm((f) => ({ ...f, previousChases: lines.join("\n") }));
  }, [form.invNo]);

  // Live calcs
  const outstandingN = parseFloat(form.outstanding) || 0;
  const daysOverdue = useMemo(() => daysBetween(form.invDate, isoToday()), [form.invDate]);
  const showInterest = stage >= 2 && form.addStatutoryInterest === "Yes" && outstandingN > 0 && daysOverdue > 0;
  const interestAccrued = showInterest
    ? +(outstandingN * STATUTORY_INTEREST_RATE * (daysOverdue / 365)).toFixed(2)
    : 0;
  const compensation = stage === 3 && outstandingN > 0 ? compensationFor(outstandingN) : 0;
  const totalDue = +(outstandingN + interestAccrued + compensation).toFixed(2);

  const onGenerate = async () => {
    setGenerating(true); setResult(""); setRefNumber("");
    try {
      // Build a stage-aware prompt template inline so the AI gets the right tone.
      const prevHistory = historyFor(form.invNo);
      const promptTemplate = `Produce a UK Payment Chaser letter. Plain direct English. No padding. No banned consultant words.

STAGE: ${stage} of 3.
${stage === 1 ? "STAGE 1 — FIRST REMINDER (polite, assumes oversight). Tone: professional but friendly. Do not threaten legal action. Do not include statutory interest or compensation lines." : ""}
${stage === 2 ? "STAGE 2 — SECOND REMINDER (firm, references previous chase). Tone: firm, courteous, signals next steps. If real previous chase dates are supplied in {previousChases}, open with: 'Further to our previous payment reminder dated <that date>…'. NEVER invent a previous chase date — if none are supplied, open with a generic 'Further to our previous reminder…' and DO NOT quote a date. Mention that statutory interest is being applied ONLY if {interestAccrued} is greater than zero. Quote the Late Payment of Commercial Debts (Interest) Act 1998 by name. Do not include compensation yet." : ""}
${stage === 3 ? "STAGE 3 — FINAL NOTICE / LETTER BEFORE ACTION-style wording. Heading exactly: 'FINAL NOTICE FOR PAYMENT'. Tone: formal, firm, no apology. Reference all previous correspondence supplied in {previousChases} — NEVER invent a previous chase date. Quote the Late Payment of Commercial Debts (Interest) Act 1998 by name. Include statutory interest AND statutory compensation. Give a FINAL 7-day deadline. State plainly: 'Failure to pay the total amount due within 7 days may result in this matter being referred to debt recovery and/or county court proceedings.' Reserve the right to claim reasonable recovery costs. IMPORTANT: append this sentence verbatim as a separate paragraph before the sign-off: 'This document is provided as a formal final demand. It does not automatically satisfy every pre-action requirement for a court claim. If the matter proceeds to litigation, the sender is advised to seek independent legal advice.'" : ""}

Structure:
1. HEADER — DOCUMENT REFERENCE, DATE.
2. TO — ${form.clientName} at the address supplied.
3. FROM — Issued-by block from profile (auto).
4. SUBJECT line — Stage 1: 'Payment reminder — invoice {invNo}'. Stage 2: 'Second reminder — invoice {invNo} overdue {daysOverdue} days'. Stage 3: 'FINAL NOTICE FOR PAYMENT — invoice {invNo}'.
5. OPENING paragraph — appropriate to the stage. Stage 2/3: open by referencing the earliest real previous chase date from {previousChases} where supplied.
6. INVOICE DETAILS — lines:
   Invoice number: {invNo}
   Invoice date: {invDate}
   Invoice amount: £{invAmount}
   Description of works: {description}
   Amount outstanding: £{outstanding}
   Days overdue: {daysOverdue}
${stage >= 2 ? "   Statutory interest accrued: £{interestAccrued}\n" : ""}${stage === 3 ? "   Statutory compensation: £{compensation}\n   TOTAL NOW DUE: £{totalDue}\n" : ""}
${stage === 2 ? "7. PREVIOUS CORRESPONDENCE — list {previousChases} verbatim with the dates the user supplied. If blank, write 'A first reminder was issued previously.' — do NOT quote a specific date.\n" : ""}${stage === 3 ? "7. PREVIOUS CORRESPONDENCE — list all {previousChases} verbatim with the dates the user supplied. If blank, write 'Previous reminders have been issued.' — do NOT quote a specific date.\n" : ""}
${stage >= 2 ? "8. STATUTORY POSITION — one short paragraph naming the Late Payment of Commercial Debts (Interest) Act 1998 and stating interest accrues at 8% above the Bank of England base rate.\n" : ""}
9. PAYMENT DETAILS — print the bank details supplied. Format sort codes as NN-NN-NN:
   {paymentDetails}
${form.projectName || form.contractRef || form.paymentAppRef || form.finalDateForPayment || form.payNoticeInfo ? `10. CONSTRUCTION PAYMENT CONTEXT — include ONLY the fields the user supplied:${form.projectName ? " Project: {projectName}." : ""}${form.contractRef ? " Contract reference: {contractRef}." : ""}${form.paymentAppRef ? " Payment application / certificate reference: {paymentAppRef}." : ""}${form.finalDateForPayment ? " Final date for payment: {finalDateForPayment}." : ""}${form.payNoticeInfo ? " Payment notice / Pay Less Notice status: {payNoticeInfo}." : ""}\n` : ""}
11. DEADLINE — one bold line. Stage 1 / Stage 2: 'Please settle this invoice by {paymentDeadline}.' Stage 3: 'Payment in full of £{totalDue} is required within 7 days of the date of this notice.'
${stage === 3 ? "12. CONSEQUENCES OF NON-PAYMENT — one short paragraph as set out above, followed by the professional-review disclaimer paragraph verbatim.\n" : ""}
${stage === 1 ? "13. CLOSE — polite single-line close.\n" : "13. CLOSE — formal close.\n"}
${stage === 3 ? "14. SIGN-OFF — dual sign-off block (yours signed; recipient signature is for acknowledgement of receipt only — it does NOT indicate agreement to the claim).\n" : "SIGN-OFF — single contractor sign-off block from profile.\n"}

Rules: never invent dates, contractual clauses, notices, amounts or legal rights. Use ONLY the information supplied. Maintain a clear distinction between an ordinary payment reminder (Stage 1), a firm reminder with statutory interest (Stage 2), and a final demand with disclaimer (Stage 3). If a field is blank, drop the line cleanly. No 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised'. Short sentences. Firm but plain.`;

      const paymentDetailsBlock = (form.paymentDetails || "").trim() || [
        form.bankNameEdit && `Bank: ${form.bankNameEdit}`,
        form.sortCodeEdit && `Sort code: ${form.sortCodeEdit}`,
        form.accountNumberEdit && `Account: ${form.accountNumberEdit}`,
        user?.companyName && `Account name: ${user.companyName}`,
      ].filter(Boolean).join("\n");

      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          stage,
          clientName: form.clientName,
          clientAddress: form.clientAddress,
          invNo: form.invNo,
          invDate: form.invDate,
          invAmount: form.invAmount,
          outstanding: form.outstanding,
          description: form.description,
          previousChases: form.previousChases,
          paymentDeadline: stage === 3 ? isoInDays(7) : form.paymentDeadline,
          daysOverdue,
          interestAccrued: interestAccrued.toFixed(2),
          compensation,
          totalDue: totalDue.toFixed(2),
          paymentDetails: paymentDetailsBlock,
          // Optional construction context — only surface in output when supplied
          projectName: form.projectName,
          contractRef: form.contractRef,
          paymentAppRef: form.paymentAppRef,
          finalDateForPayment: form.finalDateForPayment,
          payNoticeInfo: form.payNoticeInfo,
          linkedFromPaymentTracker: !!linkedTrackerInvoice,
          chaseHistorySnapshot: prevHistory,
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      // Record this chase in local history so the NEXT stage picks up the date.
      recordChase(form.invNo, stage);
      toast.success("Letter generated");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `${TOOL_NAME} — ${form.invNo || "invoice"}`, content: result, user: userWithSig, clientSignature: stage === 3 ? clientSignature : null });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid="page-payment-chaser">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14} /> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Finance</div>
          <h1 className="font-display text-4xl md:text-5xl">Payment Chaser</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="pc-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="pc-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* ---------- Payment Tracker import modal ---------- */}
      {trackerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
          onClick={() => setTrackerModalOpen(false)}
          data-testid="pc-tracker-modal">
          <div onClick={(e) => e.stopPropagation()} className="card-dark max-w-2xl w-full p-6" style={{ borderColor: "#E8A020" }}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-display text-2xl text-[#F0EDE8]">Import from Payment Tracker</h3>
                <div className="text-[11px] text-[#706D66] mt-1">Pick an outstanding invoice from your latest saved Payment Tracker draft. You can still edit every field before generating the letter.</div>
              </div>
              <button onClick={() => setTrackerModalOpen(false)} className="text-[#A19D94]"><X size={18}/></button>
            </div>
            {trackerLoading ? (
              <div className="text-sm text-[#A19D94] py-8 text-center">Loading Payment Tracker…</div>
            ) : trackerRows.length === 0 ? (
              <div className="text-sm text-[#A19D94] py-6 text-center" data-testid="pc-tracker-empty">
                No outstanding invoices found in Payment Tracker. Save a Payment Tracker draft with at least one outstanding row, then try again.
              </div>
            ) : (
              <div className="space-y-2 max-h-[50vh] overflow-y-auto" data-testid="pc-tracker-rows">
                {trackerRows.map((row, i) => (
                  <button
                    key={row.id || i}
                    onClick={() => importTrackerRow(row)}
                    className="w-full text-left p-3 rounded transition hover:border-[#E8A020]"
                    style={{ background: "rgba(15,15,15,0.5)", border: "1px solid rgba(160,157,148,0.2)" }}
                    data-testid={`pc-tracker-row-${i}`}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <div className="text-sm text-[#F0EDE8] font-semibold">{row.invoiceNumber || "(no invoice number)"}</div>
                        <div className="text-[11px] text-[#A19D94] mt-1">{row.contractor || "—"} · {row.project || "—"}</div>
                        {row.paymentDueDate && (
                          <div className="text-[10px] text-[#706D66] mt-0.5">Due {ukDate(row.paymentDueDate)}</div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-widest text-[#706D66]">Outstanding</div>
                        <div className="font-display text-lg text-[#E8A020]">{fGBP(row.outstandingAmt)}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ---------- FORM ---------- */}
        <div className="card-dark p-6 space-y-4">
          {/* STAGE SELECTOR — at the very top */}
          <div data-testid="pc-stage-selector">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <div className="text-xs uppercase tracking-widest text-[#E8A020]">Chase stage</div>
              <button
                type="button"
                onClick={openTrackerImport}
                className="btn-secondary flex items-center gap-2 text-[11px]"
                data-testid="pc-import-tracker"
              >
                <Link2 size={12} /> Import from Payment Tracker
              </button>
            </div>
            {linkedTrackerInvoice && (
              <div
                className="mb-3 px-3 py-2 rounded text-[11px] flex items-center gap-2"
                style={{ background: "rgba(232,160,32,0.10)", border: "1px solid rgba(232,160,32,0.4)", color: "#E8A020" }}
                data-testid="pc-linked-badge"
              >
                <Link2 size={12} /> Linked to Payment Tracker · Invoice {form.invNo}
                <button
                  onClick={() => setLinkedTrackerInvoice(null)}
                  className="ml-auto text-[#A19D94] hover:text-[#F0EDE8]"
                  data-testid="pc-unlink"
                  title="Unlink"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            <div className="grid sm:grid-cols-3 gap-2">
              {STAGES.map((s) => {
                const active = stage === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setStage(s.id)}
                    className="text-left p-3 rounded transition"
                    style={{
                      background: active ? "rgba(232,160,32,0.1)" : "transparent",
                      border: `1px solid ${active ? "#E8A020" : "rgba(160,157,148,0.2)"}`,
                      color: active ? "#E8A020" : "#A19D94",
                    }}
                    data-testid={`pc-stage-${s.id}`}
                  >
                    <div className="text-xs uppercase tracking-widest font-bold leading-tight">{s.label}</div>
                    <div className="text-[10px] text-[#706D66] mt-1">{s.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <Section title="Recipient">
            <Inp label="Client name" value={form.clientName} onChange={(v) => setForm({ ...form, clientName: v })} testId="pc-client-name" />
            <Inp label="Client address" value={form.clientAddress} onChange={(v) => setForm({ ...form, clientAddress: v })} testId="pc-client-address" />
          </Section>

          <Section title="Invoice details">
            <Inp label="Original invoice number being chased" value={form.invNo} onChange={(v) => setForm({ ...form, invNo: v })} placeholder="e.g. INV-2026-014" testId="pc-inv-no" />
            <Inp label="Original invoice date" type="date" value={form.invDate} onChange={(v) => setForm({ ...form, invDate: v })} testId="pc-inv-date" />
            <Inp label="Description of works" value={form.description} onChange={(v) => setForm({ ...form, description: v })} placeholder="Brief description of what the invoice was for" testId="pc-description" />
            <div className="grid grid-cols-2 gap-3">
              <Inp label="Original invoice amount (£)" type="number" value={form.invAmount} onChange={(v) => setForm({ ...form, invAmount: v })} testId="pc-inv-amount" />
              <Inp label="Amount outstanding (£)" type="number" value={form.outstanding} onChange={(v) => setForm({ ...form, outstanding: v })} testId="pc-outstanding" />
            </div>
            <div className="text-sm text-[#A19D94]" data-testid="pc-days-overdue">
              This invoice is <span className="text-[#E8A020] font-semibold">{daysOverdue}</span> day{daysOverdue === 1 ? "" : "s"} overdue
            </div>
          </Section>

          {stage >= 2 && (
            <Section title="Statutory interest">
              <div>
                <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">Add statutory interest?</div>
                <div className="grid grid-cols-2 gap-2" data-testid="pc-interest-toggle">
                  {["Yes", "No"].map((opt) => {
                    const active = form.addStatutoryInterest === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => setForm({ ...form, addStatutoryInterest: opt })}
                        className="px-3 py-2 rounded text-xs uppercase tracking-widest transition"
                        style={{
                          background: active ? "rgba(232,160,32,0.12)" : "transparent",
                          border: `1px solid ${active ? "#E8A020" : "rgba(160,157,148,0.25)"}`,
                          color: active ? "#E8A020" : "#A19D94",
                        }}
                        data-testid={`pc-interest-${opt.toLowerCase()}`}
                      >{opt}</button>
                    );
                  })}
                </div>
                <div className="text-[10px] text-[#706D66] mt-2">
                  Late Payment of Commercial Debts (Interest) Act 1998. Rate: 8% + BoE base ({(BOE_BASE_RATE * 100).toFixed(2)}% as of {BOE_BASE_RATE_AS_OF}) = {(STATUTORY_INTEREST_RATE * 100).toFixed(2)}% per annum.
                </div>
              </div>
            </Section>
          )}

          {stage >= 2 && (
            <Section title="Previous correspondence">
              <Inp label="Previous chase attempts (dates)" value={form.previousChases} onChange={(v) => setForm({ ...form, previousChases: v })} placeholder="e.g. First reminder sent 12 Feb 2026" testId="pc-previous" />
            </Section>
          )}

          <Section title="Payment details (auto from profile — edit if needed)">
            <div className="grid grid-cols-2 gap-3">
              <Inp label="Bank name" value={form.bankNameEdit} onChange={(v) => setForm({ ...form, bankNameEdit: v })} testId="pc-bank-name" />
              <Inp label="Sort code" value={form.sortCodeEdit} onChange={(v) => setForm({ ...form, sortCodeEdit: v })} testId="pc-sort-code" />
            </div>
            <Inp label="Account number" value={form.accountNumberEdit} onChange={(v) => setForm({ ...form, accountNumberEdit: v })} testId="pc-account-number" />
          </Section>

          {stage < 3 && (
            <Section title="Deadline">
              <Inp label="Deadline for payment" type="date" value={form.paymentDeadline} onChange={(v) => setForm({ ...form, paymentDeadline: v })} testId="pc-deadline" />
            </Section>
          )}
          {stage === 3 && (
            <div className="p-3 rounded text-xs" style={{ background: "rgba(229,99,90,0.06)", border: "1px solid rgba(229,99,90,0.3)", color: "#E5635A" }} data-testid="pc-stage3-notice">
              Stage 3 generates a formal final demand with Letter Before Action-style wording. A 7-day final deadline is applied. This document does not automatically satisfy every pre-action requirement for a court claim — if the matter proceeds to litigation, seek independent legal advice.
            </div>
          )}

          <Section title="Construction payment context (optional)">
            <div className="text-[10px] text-[#706D66] -mt-1">
              Only fill the fields that apply to your invoice. Empty fields will not appear in the generated letter.
            </div>
            <Inp label="Project / site name" value={form.projectName} onChange={(v) => setForm({ ...form, projectName: v })} placeholder="e.g. Riverside Commercial Phase 2" testId="pc-project-name" />
            <div className="grid grid-cols-2 gap-3">
              <Inp label="Contract reference" value={form.contractRef} onChange={(v) => setForm({ ...form, contractRef: v })} testId="pc-contract-ref" />
              <Inp label="Payment application / certificate ref" value={form.paymentAppRef} onChange={(v) => setForm({ ...form, paymentAppRef: v })} testId="pc-payment-app-ref" />
            </div>
            <Inp label="Final date for payment (if known)" type="date" value={form.finalDateForPayment} onChange={(v) => setForm({ ...form, finalDateForPayment: v })} testId="pc-final-date" />
            <Inp label="Payment notice / Pay Less Notice status (if any)" value={form.payNoticeInfo} onChange={(v) => setForm({ ...form, payNoticeInfo: v })} placeholder="e.g. Payment Notice PN-04 issued 12 Jun 2026, no Pay Less Notice served." testId="pc-pay-notice-info" />
          </Section>

          {/* ---------- TOTALS PANEL ---------- */}
          <div className="p-4 rounded space-y-2 text-sm" style={{ background: "rgba(232,160,32,0.06)", border: "1px solid rgba(232,160,32,0.3)" }} data-testid="pc-totals">
            <Row label="Outstanding" value={fGBP(outstandingN)} />
            {showInterest && <Row label={`Statutory interest accrued (${daysOverdue} days @ ${(STATUTORY_INTEREST_RATE * 100).toFixed(2)}%)`} value={fGBP(interestAccrued)} />}
            {stage === 3 && outstandingN > 0 && <Row label="Statutory compensation" value={fGBP(compensation)} />}
            <div className="border-t border-[#E8A020]/30 pt-2">
              <Row label={<span className="font-bold uppercase tracking-widest text-[10px]">Total amount now due</span>} value={<span className="font-display text-2xl text-[#E8A020]">{fGBP(totalDue)}</span>} testId="pc-total-due" />
            </div>
          </div>

          {/* Signature pad(s) — dual on Stage 3 (Letter Before Action) */}
          <div className="space-y-3 pt-2 border-t border-[#1a1a1a]">
            <LiveSignatureBlock label={stage === 3 ? "Your signature" : "Sign before generating"} value={liveSignature} onChange={setLiveSignature} savedSignature={user?.signature} testIdPrefix="pc-sig-self" />
            {stage === 3 && (
              <LiveSignatureBlock label="Recipient acknowledgement (optional)" value={clientSignature} onChange={setClientSignature} testIdPrefix="pc-sig-client" />
            )}
          </div>

          <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2" data-testid="pc-generate">
            {generating ? "Generating…" : <><FileText size={14}/> Generate letter</>}
          </button>
        </div>

        {/* ---------- OUTPUT ---------- */}
        <div className="card-dark p-6">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated letter</div>
          {!result ? (
            <div className="text-sm text-[#706D66] italic">Fill in the form and click Generate.</div>
          ) : (
            <>
              <div className="flex gap-2 mb-3 flex-wrap" data-testid="pc-actions">
                <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
                <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
                <a href={`mailto:?subject=${encodeURIComponent(stage === 3 ? "NOTICE OF INTENTION TO PURSUE LEGAL ACTION" : `Payment reminder — invoice ${form.invNo}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
                <a href={`sms:?body=${encodeURIComponent(`Re invoice ${form.invNo}: ${fGBP(totalDue)} now due. See letter sent. ${user?.fullName || ""}`)}`} className="btn-secondary flex items-center gap-2 text-xs"><Phone size={12}/> SMS</a>
                <a href={`https://wa.me/?text=${encodeURIComponent(result)}`} target="_blank" rel="noreferrer" className="btn-secondary flex items-center gap-2 text-xs"><MessageSquare size={12}/> WhatsApp</a>
              </div>
              {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
              <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="pc-output">{result}</pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] pt-2">{title}</div>
      {children}
    </div>
  );
}

function Inp({ label, value, onChange, type = "text", placeholder, testId }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-base"
        data-testid={testId}
      />
    </label>
  );
}

function Row({ label, value, testId }) {
  return (
    <div className="flex items-center justify-between" data-testid={testId}>
      <span className="text-[#A19D94]">{label}</span>
      <span className="tabular-nums" style={{ color: "#F0EDE8" }}>{value}</span>
    </div>
  );
}
