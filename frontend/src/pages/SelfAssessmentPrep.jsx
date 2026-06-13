import { useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { toast } from "sonner";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, AlertCircle, Receipt } from "lucide-react";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";
import { Link } from "react-router-dom";

// HMRC bands (2024/25 onwards — these are the bands in force for the supported years).
// If a band changes, update once here.
const PERSONAL_ALLOWANCE = 12570;
const BASIC_RATE_TOP = 50270;
const BASIC_RATE = 0.20;
const HIGHER_RATE = 0.40;
const CLASS4_RATE_MAIN = 0.06; // 6% between £12,570 and £50,270 (per spec)
const CLASS4_RATE_ABOVE = 0.02; // 2% above £50,270

const TAX_YEARS = ["2023/24", "2024/25", "2025/26", "2026/27"];
const DEFAULT_TAX_YEAR = "2025/26";

const fGBP = (n) => `£${(Number(n) || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toN = (v) => parseFloat(v) || 0;

const TOOL_ID = "self-assessment-prep";
const TOOL_NAME = "Self Assessment Prep";
const TOOL_INFO = "A preparation aid for your annual UK Self Assessment tax return. Captures your income, expenses and CIS deductions for the year, calculates an estimate of your tax position, and produces a clean prep sheet you can hand to an accountant or use yourself. Not a filing tool.";

// Calculate income tax: 20% on profit above PA up to higher rate top, then 40% above.
function incomeTaxBreakdown(taxableProfit) {
  const taxable = Math.max(0, taxableProfit - PERSONAL_ALLOWANCE);
  if (taxable === 0) return { basic: 0, higher: 0, total: 0 };
  const inBasic = Math.min(taxable, BASIC_RATE_TOP - PERSONAL_ALLOWANCE);
  const inHigher = Math.max(0, taxable - (BASIC_RATE_TOP - PERSONAL_ALLOWANCE));
  return {
    basic: +(inBasic * BASIC_RATE).toFixed(2),
    higher: +(inHigher * HIGHER_RATE).toFixed(2),
    total: +(inBasic * BASIC_RATE + inHigher * HIGHER_RATE).toFixed(2),
  };
}

function class4Breakdown(taxableProfit) {
  if (taxableProfit <= PERSONAL_ALLOWANCE) return { main: 0, above: 0, total: 0 };
  const inMain = Math.min(taxableProfit, BASIC_RATE_TOP) - PERSONAL_ALLOWANCE;
  const above = Math.max(0, taxableProfit - BASIC_RATE_TOP);
  return {
    main: +(inMain * CLASS4_RATE_MAIN).toFixed(2),
    above: +(above * CLASS4_RATE_ABOVE).toFixed(2),
    total: +(inMain * CLASS4_RATE_MAIN + above * CLASS4_RATE_ABOVE).toFixed(2),
  };
}

export default function SelfAssessmentPrep() {
  const { user, refresh } = useAuth();
  const [infoOpen, setInfoOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState("");
  const [refNumber, setRefNumber] = useState("");
  const [liveSignature, setLiveSignature] = useState("");

  const [form, setForm] = useState({
    fullName: user?.fullName || "",
    utr: user?.utr || "",
    taxYear: DEFAULT_TAX_YEAR,
    cisRate: "20%",
    grossIncome: "",
    materialsExcluded: "",
    otherIncome: "",
    expMaterials: "",
    expTools: "",
    expTravel: "",
    expPpe: "",
    expPhone: "",
    expTraining: "",
    expInsurance: "",
    expAccountancy: "",
    expOtherLabel: "",
    expOtherAmount: "",
    cisDeducted: "",
    haveStatements: "Yes",
  });

  // Keep the auto-populated profile values in sync if the user refreshes
  // (initial state covers the first render; nothing further needed)

  const isFav = (user?.favourites || []).includes(TOOL_ID);
  const toggleFav = async () => {
    const cur = user?.favourites || [];
    const next = isFav ? cur.filter((x) => x !== TOOL_ID) : [...cur, TOOL_ID];
    try { await api.post("/profile/update", { favourites: next }); await refresh(); toast.success(isFav ? "Removed from favourites" : "Added to favourites"); }
    catch { toast.error("Could not update favourites"); }
  };

  // Live totals
  const totals = useMemo(() => {
    const grossIncome = toN(form.grossIncome) + toN(form.otherIncome) + toN(form.materialsExcluded);
    const totalExpenses = ["expMaterials","expTools","expTravel","expPpe","expPhone","expTraining","expInsurance","expAccountancy"]
      .reduce((a, k) => a + toN(form[k]), 0) + toN(form.expOtherAmount);
    const taxableProfit = Math.max(0, grossIncome - totalExpenses);
    const incomeTax = incomeTaxBreakdown(taxableProfit);
    const class4 = class4Breakdown(taxableProfit);
    const liability = +(incomeTax.total + class4.total).toFixed(2);
    const cisDeducted = toN(form.cisDeducted);
    const delta = +(cisDeducted - liability).toFixed(2);
    return { grossIncome, totalExpenses, taxableProfit, incomeTax, class4, liability, cisDeducted, delta };
  }, [form]);

  const utrValid = /^\d{10}$/.test((form.utr || "").trim());
  const utrShown = (form.utr || "").trim();

  const onGenerate = async () => {
    setGenerating(true); setResult(""); setRefNumber("");
    try {
      const otherExpLine = form.expOtherLabel && toN(form.expOtherAmount) > 0
        ? `${form.expOtherLabel}: £${toN(form.expOtherAmount).toFixed(2)}`
        : "";
      const promptTemplate = `Produce a UK SELF ASSESSMENT PREPARATION sheet for a CIS-registered sole trader subcontractor. Plain direct construction English. No padding. No banned consultant words. This is a prep document — NOT a filed return.

1. HEADER — DOCUMENT REFERENCE, DATE.

2. TITLE — exactly: 'SELF ASSESSMENT PREPARATION — {taxYear}'.

3. YOUR DETAILS — list on separate lines:
   Full name: {fullName}
   UTR: {utr}
   Tax year: {taxYear}
   CIS deduction rate during the year: {cisRate}

4. INCOME (SA103S short form Q9 / Q10 area) — list on separate lines, skip any with £0:
   Gross construction income (turnover): £{grossIncome}
   Materials supplied and invoiced separately (excluded from CIS): £{materialsExcluded}
   Other self-employed income: £{otherIncome}
   ___________________________________________________________
   TOTAL INCOME                                   £{totalIncome}

5. ALLOWABLE EXPENSES (SA103S Q11 area) — list on separate lines, skip any with £0:
   Materials & consumables purchased: £{expMaterials}
   Tools & equipment: £{expTools}
   Vehicle & travel costs: £{expTravel}
   PPE & workwear: £{expPpe}
   Phone & communication: £{expPhone}
   Training & certification: £{expTraining}
   Insurance: £{expInsurance}
   Accountancy / professional fees: £{expAccountancy}
   ${otherExpLine ? "Other: " + otherExpLine : ""}
   ___________________________________________________________
   TOTAL ALLOWABLE EXPENSES                       £{totalExpenses}

6. CALCULATED POSITION — full transparent maths:
   Taxable profit (income − expenses): £{taxableProfit}
   Less personal allowance: £12,570
   Taxable income: £{taxableIncome}
   Income Tax — 20% band: £{incomeTaxBasic}
   ${totals.incomeTax.higher > 0 ? "Income Tax — 40% on amount above £50,270: £" + totals.incomeTax.higher.toFixed(2) : ""}
   Class 4 NI — 6% band: £{class4Main}
   ${totals.class4.above > 0 ? "Class 4 NI — 2% above £50,270: £" + totals.class4.above.toFixed(2) : ""}
   ___________________________________________________________
   TOTAL TAX & NI LIABILITY                       £{liability}
   Less CIS deducted by contractors             - £{cisDeducted}
   ___________________________________________________________
   ${totals.delta >= 0 ? "ESTIMATED REFUND DUE FROM HMRC                 £" + totals.delta.toFixed(2) : "ESTIMATED BALANCE TO PAY HMRC                  £" + Math.abs(totals.delta).toFixed(2)}

7. CIS STATEMENT POSITION — one short line stating: 'CIS payment statements held for the year: {haveStatements}.'
${form.haveStatements !== "Yes" ? "Add a follow-up line: 'Action required: contact the relevant contractors to obtain the missing CIS payment statements before the Self Assessment is filed.'" : ""}

8. KEY DATES & ACTIONS — three short lines:
   - Online filing deadline for {taxYear}: 31 January following the tax year end.
   - Balancing payment due: 31 January.
   - First payment on account: 31 January / 31 July if liability over £1,000.

9. DISCLAIMER — print this as a final boxed block, verbatim:
   This document is a preparation aid only and does not constitute a filed tax return or professional tax advice. Figures are estimates based on the inputs supplied. Your actual liability depends on your full circumstances. Always verify with a qualified accountant before filing.

10. SIGN-OFF — single record-keeper sign-off block:
    Prepared by: (auto from profile — full name)
    Date: today
    Signature: (auto-insert user's saved signature if held)

Rules: never invent figures. If a number is zero, drop the line cleanly — do NOT write £0.00. No square-bracket placeholders. No 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised'. Short sentences. A tradesperson must be able to read it out loud to their accountant without stumbling.`;

      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          fullName: form.fullName,
          utr: utrShown,
          taxYear: form.taxYear,
          cisRate: form.cisRate,
          grossIncome: toN(form.grossIncome).toFixed(2),
          materialsExcluded: toN(form.materialsExcluded).toFixed(2),
          otherIncome: toN(form.otherIncome).toFixed(2),
          totalIncome: totals.grossIncome.toFixed(2),
          expMaterials: toN(form.expMaterials).toFixed(2),
          expTools: toN(form.expTools).toFixed(2),
          expTravel: toN(form.expTravel).toFixed(2),
          expPpe: toN(form.expPpe).toFixed(2),
          expPhone: toN(form.expPhone).toFixed(2),
          expTraining: toN(form.expTraining).toFixed(2),
          expInsurance: toN(form.expInsurance).toFixed(2),
          expAccountancy: toN(form.expAccountancy).toFixed(2),
          expOtherLabel: form.expOtherLabel,
          expOtherAmount: toN(form.expOtherAmount).toFixed(2),
          totalExpenses: totals.totalExpenses.toFixed(2),
          taxableProfit: totals.taxableProfit.toFixed(2),
          taxableIncome: Math.max(0, totals.taxableProfit - PERSONAL_ALLOWANCE).toFixed(2),
          incomeTaxBasic: totals.incomeTax.basic.toFixed(2),
          incomeTaxHigher: totals.incomeTax.higher.toFixed(2),
          class4Main: totals.class4.main.toFixed(2),
          class4Above: totals.class4.above.toFixed(2),
          liability: totals.liability.toFixed(2),
          cisDeducted: totals.cisDeducted.toFixed(2),
          deltaValue: Math.abs(totals.delta).toFixed(2),
          deltaLabel: totals.delta >= 0 ? "ESTIMATED REFUND DUE FROM HMRC" : "ESTIMATED BALANCE TO PAY HMRC",
          haveStatements: form.haveStatements,
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      toast.success("Prep sheet generated");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Self Assessment Prep — ${form.taxYear}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  const set = (k) => (v) => setForm({ ...form, [k]: v });

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid="page-sa-prep">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Finance · Sole Trader</div>
          <h1 className="font-display text-4xl md:text-5xl">Self Assessment Prep</h1>
          <p className="text-[#A19D94] mt-2 text-sm">Pulls every line together so you can hand it to an accountant or use it yourself.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="sa-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="sa-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ---------- LEFT: FORM ---------- */}
        <div className="card-dark p-6 space-y-5">
          {/* SECTION 1 — YOUR DETAILS */}
          <Section title="1 · Your details">
            <Inp label="Full name (auto from profile)" value={form.fullName} onChange={set("fullName")} testId="sa-fullname" />
            <Inp
              label={`UTR number (10 digits)${utrShown && !utrValid ? " — looks invalid" : ""}`}
              value={form.utr}
              onChange={set("utr")}
              placeholder="e.g. 1234567890"
              error={utrShown && !utrValid}
              testId="sa-utr"
            />
            <Drop label="Tax year" value={form.taxYear} onChange={set("taxYear")} options={TAX_YEARS} testId="sa-tax-year" />
            <Drop label="CIS deduction rate" value={form.cisRate} onChange={set("cisRate")} options={["20% (registered)","30% (unregistered)","0% (gross payment status)"]} testId="sa-cis-rate" />
          </Section>

          {/* SECTION 2 — INCOME */}
          <Section title="2 · Income">
            <Inp label="Gross construction income" helper="Total invoiced to contractors BEFORE CIS deductions (your full turnover)" type="number" value={form.grossIncome} onChange={set("grossIncome")} testId="sa-gross-income" />
            <Inp label="Materials costs excluded from CIS (optional)" helper="Materials you supplied and invoiced separately — excluded from CIS deductions" type="number" value={form.materialsExcluded} onChange={set("materialsExcluded")} testId="sa-mats-excluded" />
            <Inp label="Any other self-employed income (optional)" type="number" value={form.otherIncome} onChange={set("otherIncome")} testId="sa-other-income" />
          </Section>

          {/* SECTION 3 — EXPENSES */}
          <Section title="3 · Expenses">
            <p className="text-xs text-[#706D66] mb-2">Enter what applies to you — leave blank if not relevant.</p>
            <div className="grid grid-cols-2 gap-3">
              <Inp label="Materials & consumables" type="number" value={form.expMaterials} onChange={set("expMaterials")} testId="sa-exp-materials" />
              <Inp label="Tools & equipment" type="number" value={form.expTools} onChange={set("expTools")} testId="sa-exp-tools" />
              <Inp label="Vehicle & travel costs" type="number" value={form.expTravel} onChange={set("expTravel")} testId="sa-exp-travel" />
              <Inp label="PPE & workwear" type="number" value={form.expPpe} onChange={set("expPpe")} testId="sa-exp-ppe" />
              <Inp label="Phone & communication" type="number" value={form.expPhone} onChange={set("expPhone")} testId="sa-exp-phone" />
              <Inp label="Training & certification" type="number" value={form.expTraining} onChange={set("expTraining")} testId="sa-exp-training" />
              <Inp label="Insurance" type="number" value={form.expInsurance} onChange={set("expInsurance")} testId="sa-exp-insurance" />
              <Inp label="Accountancy / professional fees" type="number" value={form.expAccountancy} onChange={set("expAccountancy")} testId="sa-exp-accountancy" />
            </div>
            <div className="grid grid-cols-[1fr_140px] gap-3">
              <Inp label="Other allowable expense (label)" value={form.expOtherLabel} onChange={set("expOtherLabel")} placeholder="e.g. Site parking" testId="sa-exp-other-label" />
              <Inp label="Amount" type="number" value={form.expOtherAmount} onChange={set("expOtherAmount")} testId="sa-exp-other-amount" />
            </div>
            <div className="flex items-center justify-between p-3 rounded" style={{ background: "rgba(232,160,32,0.06)", border: "1px solid rgba(232,160,32,0.2)" }}>
              <span className="text-xs uppercase tracking-widest text-[#A19D94] flex items-center gap-2"><Receipt size={12}/> Total allowable expenses</span>
              <span className="font-display text-2xl text-[#E8A020]" data-testid="sa-total-expenses">{fGBP(totals.totalExpenses)}</span>
            </div>
          </Section>

          {/* SECTION 4 — CIS */}
          <Section title="4 · CIS deductions">
            <Inp label="Total CIS deducted by contractors" helper="Total shown on your CIS payment statements for the year" type="number" value={form.cisDeducted} onChange={set("cisDeducted")} testId="sa-cis-deducted" />
            <Drop label="Do you have all your CIS payment statements?" value={form.haveStatements} onChange={set("haveStatements")} options={["Yes","No","Some missing"]} testId="sa-have-statements" />
            {form.haveStatements !== "Yes" && (
              <div className="text-xs flex items-start gap-2 text-[#E8A020] p-2 rounded" style={{ background: "rgba(232,160,32,0.06)" }} data-testid="sa-statements-warning">
                <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                <span>Contact your contractors to obtain missing statements before filing.</span>
              </div>
            )}
          </Section>

          <LiveSignatureBlock
            label="Sign before generating"
            subtitle="Your signature appears on the bottom of the prep sheet"
            value={liveSignature}
            onChange={setLiveSignature}
            savedSignature={user?.signature}
            testIdPrefix="sa-sig"
          />

          <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2" data-testid="sa-generate">
            {generating ? "Generating…" : <><FileText size={14}/> Generate prep sheet</>}
          </button>
        </div>

        {/* ---------- RIGHT: LIVE SUMMARY + OUTPUT ---------- */}
        <div className="space-y-6">
          {/* LIVE CALC SUMMARY */}
          <div className="card-dark p-6" data-testid="sa-summary">
            <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4">Calculated summary — updates live</div>
            <Row label="Gross income" value={fGBP(totals.grossIncome)} testId="sa-sum-gross" />
            <Row label="Less allowable expenses" value={`− ${fGBP(totals.totalExpenses)}`} testId="sa-sum-exp" />
            <Row label="Taxable profit" value={fGBP(totals.taxableProfit)} strong testId="sa-sum-profit" />
            <div className="my-3 border-t border-[#1a1a1a]"/>
            <Row label="Income tax — 20% (profit above £12,570)" value={fGBP(totals.incomeTax.basic)} testId="sa-sum-tax-basic" />
            {totals.incomeTax.higher > 0 && (
              <Row label="Income tax — 40% (above £50,270)" value={fGBP(totals.incomeTax.higher)} muted testId="sa-sum-tax-higher" />
            )}
            <Row label="Class 4 NI — 6% (£12,570 to £50,270)" value={fGBP(totals.class4.main)} testId="sa-sum-ni-main" />
            {totals.class4.above > 0 && (
              <Row label="Class 4 NI — 2% above £50,270" value={fGBP(totals.class4.above)} muted testId="sa-sum-ni-above" />
            )}
            <div className="my-3 border-t border-[#1a1a1a]"/>
            <Row label="Total tax & NI due" value={fGBP(totals.liability)} strong testId="sa-sum-liability" />
            <Row label="Less CIS already deducted" value={`− ${fGBP(totals.cisDeducted)}`} testId="sa-sum-cis" />
            <div className="my-3 border-t border-[#1a1a1a]"/>
            <div className="flex items-center justify-between" data-testid="sa-sum-delta">
              <span className="text-xs uppercase tracking-widest text-[#A19D94]">
                {totals.delta >= 0 ? "Estimated refund from HMRC" : "Estimated balance to pay HMRC"}
              </span>
              <span className="font-display text-4xl" style={{ color: totals.delta >= 0 ? "#E8A020" : "#E5635A" }}>
                {fGBP(Math.abs(totals.delta))}
              </span>
            </div>
            <p className="text-xs text-[#706D66] mt-4 leading-relaxed">
              This is an estimate only. Your actual liability depends on your full circumstances. Always verify with a qualified accountant before filing.
            </p>
          </div>

          {/* GENERATED OUTPUT */}
          <div className="card-dark p-6">
            <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated prep sheet</div>
            {!result ? (
              <div className="text-sm text-[#706D66] italic">Click Generate to produce the formal sheet.</div>
            ) : (
              <>
                <div className="flex gap-2 mb-3 flex-wrap">
                  <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
                  <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
                  <a href={`mailto:?subject=${encodeURIComponent(`Self Assessment Prep — ${form.taxYear}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email to accountant</a>
                </div>
                {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
                <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="sa-output">{result}</pre>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020]">{title}</div>
      {children}
    </div>
  );
}

function Inp({ label, value, onChange, type = "text", placeholder, testId, helper, error }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`input-base ${error ? "border-red-500" : ""}`}
        data-testid={testId}
        step={type === "number" ? "0.01" : undefined}
      />
      {helper && <div className="text-[10px] text-[#706D66] mt-1 leading-relaxed">{helper}</div>}
    </label>
  );
}

function Drop({ label, value, onChange, options, testId }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input-base" data-testid={testId}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Row({ label, value, strong, muted, testId }) {
  return (
    <div className="flex items-center justify-between py-1" data-testid={testId}>
      <span className={`text-xs uppercase tracking-widest ${muted ? "text-[#706D66]" : "text-[#A19D94]"}`}>{label}</span>
      <span className={`tabular-nums ${strong ? "font-display text-xl text-[#F0EDE8]" : "text-sm text-[#F0EDE8]"}`}>{value}</span>
    </div>
  );
}
