import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, AlertTriangle, Gavel } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";
import DraftSaveButton from "../components/DraftSaveButton";
import useToolDraft from "../hooks/useToolDraft";

const TOOL_ID   = "bad-debt-letter";
const TOOL_NAME = "Bad Debt Letter";
const TOOL_INFO =
  "Final demand letter before referral to a debt recovery agency or the courts. Auto-calculates statutory interest (8% over Bank of England base rate) and statutory compensation (£40 / £70 / £100 bands) under the Late Payment of Commercial Debts (Interest) Act 1998. Firm but professional tone — no aggressive language.";

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoPlusDays = (days) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function daysBetween(isoStart, isoEnd) {
  if (!isoStart || !isoEnd) return null;
  const a = new Date(`${isoStart}T00:00:00Z`);
  const b = new Date(`${isoEnd}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
}

const N = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const money = (n) =>
  `£${(Number(n) || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Bank of England base rate is updated by the MPC. As of latest published rate this is 4.75%.
// Statutory interest under the Late Payment of Commercial Debts (Interest) Act 1998 is 8% + base.
const BANK_BASE_RATE_PCT = 4.75;
const STATUTORY_INTEREST_PCT = BANK_BASE_RATE_PCT + 8;

function statutoryCompensation(amount) {
  const a = N(amount);
  if (a <= 0)        return 0;
  if (a < 1000)      return 40;
  if (a < 10000)     return 70;
  return 100;
}

const NEXT_STEPS = [
  "Referral to a commercial debt recovery agency",
  "Small Claims Court (up to £10,000)",
  "County Court claim (over £10,000)",
  "Adjudication under the Scheme for Construction Contracts",
  "All of the above",
];

export default function BadDebtLetter() {
  const { user, refresh } = useAuth();

  // NEW field (before Debtor)
  const [letterDate, setLetterDate]       = useState(isoToday());

  // EXISTING fields (kept)
  const [debtor, setDebtor]               = useState("");
  const [originalDate, setOriginalDate]   = useState("");
  const [originalAmount, setOriginalAmount] = useState("");

  // NEW fields (after Original Invoice Date)
  const [invoiceNumber, setInvoiceNumber]       = useState("");
  const [worksDescription, setWorksDescription] = useState("");
  const [outstanding, setOutstanding]           = useState("");
  const [previousChases, setPreviousChases]     = useState("");

  // Statutory interest: auto-calc toggle + manual override
  const [interestAuto, setInterestAuto]   = useState(true);
  const [interestManual, setInterestManual] = useState("");
  // Statutory compensation is auto from band, but can be overridden
  const [compensationAuto, setCompensationAuto] = useState(true);
  const [compensationManual, setCompensationManual] = useState("");

  const [finalDeadline, setFinalDeadline] = useState(isoPlusDays(7));
  const [nextStep, setNextStep]           = useState("Referral to a commercial debt recovery agency");

  // Output / sign-off
  const [infoOpen, setInfoOpen]           = useState(false);
  const [generating, setGenerating]       = useState(false);
  const [result, setResult]               = useState("");
  const [refNumber, setRefNumber]         = useState("");
  const [liveSignature, setLiveSignature] = useState("");

  // ---------- Draft save/resume ----------
  const getDraftData = () => ({
    letterDate, debtor, originalDate, originalAmount, invoiceNumber,
    worksDescription, outstanding, previousChases, interestAuto,
    interestManual, compensationAuto, compensationManual, finalDeadline,
    nextStep, result, refNumber, liveSignature,
  });
  useToolDraft(TOOL_ID, (p) => {
    if (p.letterDate !== undefined) setLetterDate(p.letterDate);
    if (p.debtor !== undefined) setDebtor(p.debtor);
    if (p.originalDate !== undefined) setOriginalDate(p.originalDate);
    if (p.originalAmount !== undefined) setOriginalAmount(p.originalAmount);
    if (p.invoiceNumber !== undefined) setInvoiceNumber(p.invoiceNumber);
    if (p.worksDescription !== undefined) setWorksDescription(p.worksDescription);
    if (p.outstanding !== undefined) setOutstanding(p.outstanding);
    if (p.previousChases !== undefined) setPreviousChases(p.previousChases);
    if (p.interestAuto !== undefined) setInterestAuto(p.interestAuto);
    if (p.interestManual !== undefined) setInterestManual(p.interestManual);
    if (p.compensationAuto !== undefined) setCompensationAuto(p.compensationAuto);
    if (p.compensationManual !== undefined) setCompensationManual(p.compensationManual);
    if (p.finalDeadline !== undefined) setFinalDeadline(p.finalDeadline);
    if (p.nextStep !== undefined) setNextStep(p.nextStep);
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

  // Days overdue (today − original invoice date)
  const daysOverdue = useMemo(() => {
    const n = daysBetween(originalDate, isoToday());
    return n === null || n < 0 ? null : n;
  }, [originalDate]);

  // Auto-calculated statutory interest
  // Annual rate = base + 8% applied pro-rata to days overdue on the outstanding amount.
  const interestAutoValue = useMemo(() => {
    const o = N(outstanding);
    if (o <= 0 || daysOverdue === null) return 0;
    const annual = (STATUTORY_INTEREST_PCT / 100) * o;
    return +(annual * (daysOverdue / 365)).toFixed(2);
  }, [outstanding, daysOverdue]);

  const interestValue = interestAuto ? interestAutoValue : N(interestManual);

  // Statutory compensation — banded against the original invoice amount
  const compensationAutoValue = useMemo(
    () => statutoryCompensation(originalAmount),
    [originalAmount]
  );
  const compensationValue = compensationAuto ? compensationAutoValue : N(compensationManual);

  const totalDue = +(N(outstanding) + interestValue + compensationValue).toFixed(2);

  // Deadline check — must be at least 7 days ahead
  const deadlineDays = daysBetween(isoToday(), finalDeadline);
  const deadlineTooSoon = deadlineDays !== null && deadlineDays < 7;

  const onGenerate = async () => {
    if (!debtor.trim())          { toast.error("Add the debtor name"); return; }
    if (!originalDate)           { toast.error("Set the original invoice date"); return; }
    if (!invoiceNumber.trim())   { toast.error("Add the invoice number"); return; }
    if (N(outstanding) <= 0)     { toast.error("Add the amount outstanding"); return; }
    if (!finalDeadline)          { toast.error("Set a final payment deadline"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const promptTemplate = `Produce a FINAL DEMAND LETTER under the Late Payment of Commercial Debts (Interest) Act 1998. Plain English. Firm but professional. No padding. No banned consultant words. NO AGGRESSIVE LANGUAGE. This is the last letter before referral to a debt recovery agency, the courts, or adjudication.

1. HEADER — DOCUMENT REFERENCE, DATE (use {letterDate} in DD/MM/YYYY format for DATE).

2. TITLE — print on its own line in capitals, prominent:
   NOTICE OF BAD DEBT — FINAL DEMAND

3. SENDER BLOCK — print on consecutive lines:
   {companyName}
   Trade: {trade}
   Sender: {senderName}

4. RECIPIENT — print on its own line:
   To: {debtor}

5. SUBJECT LINE — print on its own line:
   Subject: Final Demand — Invoice {invoiceNumber} — Outstanding Sum

6. OPENING PARAGRAPH — short, firm, professional. State this is the FINAL written demand for payment of invoice {invoiceNumber} dated {originalDate} for {worksDescription}.

7. ACCOUNT SUMMARY — list on separate lines:
   Invoice Number: {invoiceNumber}
   Original Invoice Date: {originalDate}
   Description of Works: {worksDescription}
   Original Invoice Amount: {originalAmount}
   Amount Outstanding: {outstanding}
   Days Overdue: {daysOverdueLine}

8. PREVIOUS RECOVERY ATTEMPTS — short lead-in line then the supplied list verbatim. If blank, state that previous chase correspondence has been ignored:
   Previous recovery attempts:
{previousChasesBlock}

9. STATUTORY ENTITLEMENT — print verbatim as one short paragraph then the figures on separate lines:
   Under the Late Payment of Commercial Debts (Interest) Act 1998, this debt now attracts statutory interest at 8% above the Bank of England base rate, together with fixed statutory compensation depending on the size of the debt. The amounts due are as follows:

   Outstanding Principal: {outstanding}
   Statutory Interest (calculated at {statRateLine}): {interestValue}
   Statutory Compensation (per the Act's banded amounts): {compensationValue}
   TOTAL AMOUNT NOW DUE: {totalDue}

10. PAYMENT DEADLINE — print verbatim as one paragraph in firm but professional language:
    Payment of the TOTAL AMOUNT NOW DUE must be received in full by no later than {finalDeadline}. This deadline is final. No further reminders will be issued.

11. CONSEQUENCES OF NON-PAYMENT — print verbatim as one paragraph stating exactly what will happen if payment is not received by the deadline:
    Failure to make payment by the deadline above will result in the following action being taken without further notice: {nextStep}. All recovery costs, court fees and additional interest accruing after the deadline will be claimed in addition to the sums above.

12. INVITATION TO RESOLVE — short paragraph confirming you remain willing to receive payment up to the deadline without further action, and inviting the debtor to contact you immediately if they wish to discuss settlement or a payment plan.

13. DISCLAIMER — print verbatim as one small paragraph at the very bottom of the letter:
    This letter has been sent without prejudice to any other rights or remedies available.

14. SIGN-OFF — single sender sign-off:
    Yours faithfully
    {senderName}
    {senderRole}
    {companyName}
    Date: {letterDate}
    Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Never invent figures, dates or chase attempts. Use only the supplied values.
- Never use abbreviations such as 'N/A', 'TBC' or '&'. Write words in full.
- Skip blank optional fields cleanly. Use '—' only where supplied.
- No banned consultant words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Firm. Professional. Factual. NO threats, NO insults, NO aggressive language. Reads as a final business demand from a working professional.`;

    const daysOverdueLine = daysOverdue === null
      ? "—"
      : `${daysOverdue} day${daysOverdue === 1 ? "" : "s"}`;
    const previousChasesBlock = previousChases.trim()
      ? previousChases.split("\n").filter(Boolean).map((l, i) => `   ${i + 1}. ${l.trim()}`).join("\n")
      : "   Previous chase correspondence has been issued and remains unanswered.";

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          letterDate: ukDate(letterDate),
          companyName: user?.companyName || "—",
          trade: user?.trade || "—",
          senderName: user?.fullName || "—",
          senderRole: user?.signatureRole || "Director",
          debtor,
          invoiceNumber,
          originalDate: ukDate(originalDate),
          worksDescription: worksDescription || "—",
          originalAmount: money(N(originalAmount)),
          outstanding: money(N(outstanding)),
          daysOverdueLine,
          previousChasesBlock,
          statRateLine: `${STATUTORY_INTEREST_PCT.toFixed(2)}% per annum (8% over the Bank of England base rate of ${BANK_BASE_RATE_PCT}%)`,
          interestValue: money(interestValue),
          compensationValue: money(compensationValue),
          totalDue: money(totalDue),
          finalDeadline: ukDate(finalDeadline),
          nextStep,
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Bad Debt Letter generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Bad Debt Letter — ${debtor || "debtor"}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-bad-debt-letter">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Documents</div>
          <h1 className="font-display text-4xl md:text-5xl">Bad Debt Letter</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="bdl-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="bdl-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 — LETTER DETAILS */}
      <Section title="Letter Details" testId="bdl-section-1" icon={<Gavel size={14}/>}>
        <Grid>
          <Inp label="Date of Letter" value={letterDate} onChange={setLetterDate} type="date" testId="bdl-date" />
          <Inp label="Debtor (Recipient)" value={debtor} onChange={setDebtor} testId="bdl-debtor" />
          <Inp label="Original Invoice Date" value={originalDate} onChange={setOriginalDate} type="date" testId="bdl-original-date" />
          <Inp label="Invoice Number" value={invoiceNumber} onChange={setInvoiceNumber} testId="bdl-invoice-number" />
          <Inp label="Description of Works" value={worksDescription} onChange={setWorksDescription} testId="bdl-works" placeholder={`e.g. "Second fix electrical installation, Phase 2"`} />
        </Grid>
      </Section>

      {/* SECTION 2 — AMOUNTS */}
      <Section title="Amounts" testId="bdl-section-2">
        <Grid>
          <Inp label="Original Invoice Amount (£)" value={originalAmount} onChange={setOriginalAmount} type="number" testId="bdl-original-amount" />
          <Inp label="Amount Outstanding (£)" value={outstanding} onChange={setOutstanding} type="number" testId="bdl-outstanding" helper="If partial payment has been received, enter the remaining balance" />
          <ReadOnly
            label="Days Overdue"
            value={daysOverdue === null ? "—" : `${daysOverdue} day${daysOverdue === 1 ? "" : "s"}`}
            testId="bdl-days"
            helper="Counted from the original invoice date to today"
          />
        </Grid>

        {/* Statutory interest */}
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1 flex items-center gap-3">
              Statutory Interest (£)
              <span className="flex gap-1 text-[10px]" data-testid="bdl-interest-toggle">
                <button
                  type="button"
                  onClick={() => setInterestAuto(true)}
                  className={`px-2 py-1 rounded ${interestAuto ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94]"}`}
                  data-testid="bdl-interest-auto"
                >Auto</button>
                <button
                  type="button"
                  onClick={() => setInterestAuto(false)}
                  className={`px-2 py-1 rounded ${!interestAuto ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94]"}`}
                  data-testid="bdl-interest-manual-toggle"
                >Manual</button>
              </span>
            </div>
            {interestAuto ? (
              <div className="input-base !cursor-default" data-testid="bdl-interest-display" style={{ color: "#E8A020" }}>
                {money(interestAutoValue)}
              </div>
            ) : (
              <input
                type="number"
                value={interestManual}
                onChange={(e) => setInterestManual(e.target.value)}
                className="input-base"
                data-testid="bdl-interest-manual"
              />
            )}
            <div className="text-[10px] text-[#706D66] mt-1">
              {`8% above the Bank of England base rate (currently ${BANK_BASE_RATE_PCT}%) → ${STATUTORY_INTEREST_PCT.toFixed(2)}% per annum applied to the outstanding amount over ${daysOverdue ?? 0} day${(daysOverdue ?? 0) === 1 ? "" : "s"}.`}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1 flex items-center gap-3">
              Statutory Compensation (£)
              <span className="flex gap-1 text-[10px]" data-testid="bdl-comp-toggle">
                <button
                  type="button"
                  onClick={() => setCompensationAuto(true)}
                  className={`px-2 py-1 rounded ${compensationAuto ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94]"}`}
                  data-testid="bdl-comp-auto"
                >Auto</button>
                <button
                  type="button"
                  onClick={() => setCompensationAuto(false)}
                  className={`px-2 py-1 rounded ${!compensationAuto ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94]"}`}
                  data-testid="bdl-comp-manual-toggle"
                >Manual</button>
              </span>
            </div>
            {compensationAuto ? (
              <div className="input-base !cursor-default" data-testid="bdl-comp-display" style={{ color: "#E8A020" }}>
                {money(compensationAutoValue)}
              </div>
            ) : (
              <input
                type="number"
                value={compensationManual}
                onChange={(e) => setCompensationManual(e.target.value)}
                className="input-base"
                data-testid="bdl-comp-manual"
              />
            )}
            <div className="text-[10px] text-[#706D66] mt-1">
              Banded under the Late Payment of Commercial Debts (Interest) Act 1998: Under £1,000 → £40 / £1,000–£9,999 → £70 / £10,000 or more → £100. Banded against the original invoice amount.
            </div>
          </div>
        </div>

        {/* Total */}
        <div className="mt-5">
          <div
            data-testid="bdl-total"
            className="p-4 rounded"
            style={{ background: "rgba(232,160,32,0.10)", border: "1px solid #E8A020" }}
          >
            <div className="text-[10px] uppercase tracking-widest text-[#706D66] mb-1">Total Amount Now Due</div>
            <div className="font-display text-3xl" style={{ color: "#E8A020" }}>{money(totalDue)}</div>
            <div className="text-[10px] text-[#706D66] mt-1">
              Outstanding + Statutory Interest + Statutory Compensation
            </div>
          </div>
        </div>
      </Section>

      {/* SECTION 3 — PREVIOUS CHASES */}
      <Section title="Previous Recovery Attempts" testId="bdl-section-3">
        <Area
          label="Previous Chase Attempts"
          value={previousChases}
          onChange={setPreviousChases}
          rows={5}
          placeholder={`List all previous attempts with dates, one per line — e.g.\nPhone call 01/04\nPayment Chaser Stage 1 sent 15/04\nStage 2 sent 01/05\nStage 3 Final Notice sent 15/05`}
          testId="bdl-chases"
        />
      </Section>

      {/* SECTION 4 — DEADLINE + NEXT STEP */}
      <Section title="Deadline and Next Step" testId="bdl-section-4">
        <Grid>
          <Inp label="Final Payment Deadline" value={finalDeadline} onChange={setFinalDeadline} type="date" testId="bdl-deadline" helper="Give 7 days from today as a minimum" />
          <Drop label="Next Step if Unpaid" value={nextStep} onChange={setNextStep} options={NEXT_STEPS} testId="bdl-nextstep" />
        </Grid>
        {deadlineTooSoon && (
          <div
            className="mt-4 p-3 rounded flex items-start gap-2"
            style={{ border: "1px solid #E8A020", background: "rgba(232,160,32,0.08)" }}
            data-testid="bdl-deadline-warning"
          >
            <AlertTriangle size={16} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
            <div className="text-xs text-[#F0EDE8] leading-relaxed">
              The final deadline should be at least 7 days from today. A shorter deadline weakens the legal position before court or adjudication action.
            </div>
          </div>
        )}
      </Section>

      {/* SIGN OFF */}
      <Section title="Sign Off" testId="bdl-section-signoff">
        <LiveSignatureBlock
          label="Sender signature"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="bdl-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="bdl-sig-date">
          Date: {ukDate(letterDate) || "—"}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="bdl-generate">
        {generating ? "Drafting…" : <><FileText size={14}/> Generate Bad Debt Letter</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="bdl-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated letter</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Bad Debt — ${debtor}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="bdl-output">{result}</pre>
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
function ReadOnly({ label, value, testId, helper }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <div className="input-base !cursor-default" data-testid={testId}>{value}</div>
      {helper && <div className="text-[10px] text-[#706D66] mt-1">{helper}</div>}
    </label>
  );
}
