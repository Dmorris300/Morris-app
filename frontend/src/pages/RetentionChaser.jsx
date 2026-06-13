import { useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { toast } from "sonner";
import { ChevronLeft, FileText, Mail, MessageSquare, Phone, Download, Copy, Info, Star, X } from "lucide-react";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";
import { Link } from "react-router-dom";

// Bank of England base rate at the time of writing — manually maintained.
const BOE_BASE_RATE = 0.0475; // 4.75% (Feb 2026)
const BOE_BASE_RATE_AS_OF = "1 February 2026";
const STATUTORY_INTEREST_RATE = BOE_BASE_RATE + 0.08;

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoInDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
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
  { id: 3, label: "Stage 3 — Final Notice", sub: "Letter Before Action — Late Payment Act" },
];

const RETENTION_PCT_OPTIONS = ["3%", "5%", "Other"];
const RELEASE_OPTIONS = [
  "First half — due on Practical Completion",
  "Second half — due on expiry of Defects Liability Period",
  "Full retention (single release contract)",
];

const fGBP = (n) => `£${(Number(n) || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TOOL_ID = "retention-chaser";
const TOOL_NAME = "Retention Chaser";
const TOOL_INFO = "Three escalating letters chasing your retention release. Stage 1 polite. Stage 2 firm with statutory interest. Stage 3 Letter Before Action under the Late Payment of Commercial Debts (Interest) Act 1998 and the Scheme for Construction Contracts.";

export default function RetentionChaser() {
  const { user, refresh } = useAuth();
  const [stage, setStage] = useState(1);
  const [form, setForm] = useState({
    project: "",
    contractor: "",
    contractorAddress: "",
    originalContractValue: "",
    retentionPercent: "5%",
    retentionPercentOther: "",
    releaseStage: "First half — due on Practical Completion",
    practicalCompletionDate: isoToday(),
    defectsLiabilityEndDate: "",
    retentionAmount: "",
    originallyDueDate: isoToday(),
    previousChases: "",
    paymentDeadline: isoInDays(14),
    addStatutoryInterest: "Yes",
    bankNameEdit: user?.bankName || "",
    sortCodeEdit: user?.sortCode || "",
    accountNumberEdit: user?.accountNumber || "",
  });
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

  // Live calcs
  const retentionN = parseFloat(form.retentionAmount) || 0;
  const daysOverdue = useMemo(() => daysBetween(form.originallyDueDate, isoToday()), [form.originallyDueDate]);
  const showInterest = stage >= 2 && form.addStatutoryInterest === "Yes" && retentionN > 0 && daysOverdue > 0;
  const interestAccrued = showInterest
    ? +(retentionN * STATUTORY_INTEREST_RATE * (daysOverdue / 365)).toFixed(2)
    : 0;
  const totalDue = +(retentionN + interestAccrued).toFixed(2);

  const showSecondHalfField = form.releaseStage.startsWith("Second half");
  const effectiveRetentionPct = form.retentionPercent === "Other"
    ? (form.retentionPercentOther || "(other %)")
    : form.retentionPercent;

  const onGenerate = async () => {
    if (!form.project.trim())          { toast.error("Add a project name"); return; }
    if (!form.contractor.trim())       { toast.error("Add the main contractor / client name"); return; }
    if (retentionN <= 0)               { toast.error("Add the retention amount"); return; }

    setGenerating(true); setResult(""); setRefNumber("");
    try {
      const promptTemplate = `Produce a UK Retention Chaser letter. Plain direct construction English. No padding. No banned consultant words.

STAGE: ${stage} of 3.
${stage === 1 ? "STAGE 1 — FIRST REMINDER (polite, assumes oversight). Tone: professional but friendly. Do not threaten legal action. Do not include statutory interest. Frame as a courtesy reminder that the retention release is now due." : ""}
${stage === 2 ? "STAGE 2 — SECOND REMINDER (firm, references previous chase). Tone: firm, courteous, signals next steps. Reference any previous chase dates supplied. Mention that statutory interest is now being applied if {interestAccrued} is greater than zero. Quote the Late Payment of Commercial Debts (Interest) Act 1998 by name." : ""}
${stage === 3 ? "STAGE 3 — LETTER BEFORE ACTION. Heading exactly: 'NOTICE OF INTENTION TO PURSUE LEGAL ACTION'. Tone: formal, firm, no apology. Reference all previous correspondence ({previousChases}). Quote the Late Payment of Commercial Debts (Interest) Act 1998 AND the Scheme for Construction Contracts (England and Wales) Regulations 1998 (as amended) — both by name. Include statutory interest accrued. State the total amount now due. Give a FINAL 7-day deadline. State plainly: 'Failure to pay the total amount due within 7 days will result in this matter being referred to debt recovery proceedings or to adjudication under the Housing Grants, Construction and Regeneration Act 1996 without further notice.' Reserve the right to claim reasonable recovery costs." : ""}

Structure:
1. HEADER — DOCUMENT REFERENCE, DATE.
2. TO — {contractor} at the address supplied if any.
3. FROM — Issued-by block from profile (auto).
4. SUBJECT line — Stage 1: 'Retention release reminder — {project}'. Stage 2: 'Second reminder — Retention release overdue {daysOverdue} days — {project}'. Stage 3: 'NOTICE OF INTENTION TO PURSUE LEGAL ACTION — Retention release — {project}'.
5. OPENING paragraph — appropriate to the stage.
6. PROJECT AND RETENTION DETAILS — lines:
   Project: {project}
   Original contract value: £{originalContractValue}
   Retention percentage held: {retentionPercent}
   Retention release stage: {releaseStage}
   Practical completion date: {practicalCompletionDate}
   ${showSecondHalfField ? "Defects Liability Period end date: {defectsLiabilityEndDate}\n   " : ""}Retention amount due: £{retentionAmount}
   Originally due on: {originallyDueDate}
   Days overdue: {daysOverdue}
${stage >= 2 ? "   Statutory interest accrued: £{interestAccrued}\n   TOTAL AMOUNT NOW DUE: £{totalDue}\n" : ""}
${stage === 2 ? "7. PREVIOUS CORRESPONDENCE — list {previousChases} verbatim with dates. If blank, write 'A first reminder was issued previously.'\n" : ""}${stage === 3 ? "7. PREVIOUS CORRESPONDENCE — list all {previousChases} verbatim with dates. Reference both prior reminders.\n" : ""}
${stage >= 2 ? "8. STATUTORY POSITION — one short paragraph naming the Late Payment of Commercial Debts (Interest) Act 1998 and stating interest accrues at 8% above the Bank of England base rate." + (stage === 3 ? " Also name the Scheme for Construction Contracts (England and Wales) Regulations 1998 and the right to adjudicate under the Housing Grants, Construction and Regeneration Act 1996." : "") + "\n" : ""}
9. PAYMENT DETAILS — print the bank details supplied under the heading 'Payment should be made to:':
   {paymentDetails}
10. DEADLINE — one bold line. Stage 1 / Stage 2: 'Please release this retention by {paymentDeadline}.' Stage 3: 'Payment in full of £{totalDue} is required within 7 days of the date of this notice.'
${stage === 3 ? "11. CONSEQUENCES OF NON-PAYMENT — one short paragraph as set out above.\n" : ""}
${stage === 1 ? "11. CLOSE — polite single-line close." : "12. CLOSE — formal close."}
${stage === 3 ? "13. SIGN-OFF — global dual sign-off block (yours signed; recipient SIGN HERE box for acknowledgement of receipt).\n" : "SIGN-OFF — single contractor sign-off block from profile.\n"}

Rules: never invent. If a field is blank, drop the line cleanly. No 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised'. No abbreviations such as 'N/A' or '&' — write words in full. Use DD/MM/YYYY format for every date in the body. Short sentences. Firm but plain.`;

      const paymentDetailsBlock = [
        form.bankNameEdit && `Bank: ${form.bankNameEdit}`,
        form.sortCodeEdit && `Sort code: ${form.sortCodeEdit}`,
        form.accountNumberEdit && `Account number: ${form.accountNumberEdit}`,
        user?.companyName && `Account name: ${user.companyName}`,
      ].filter(Boolean).join("\n") || "(payment details not provided — please request in reply)";

      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          stage,
          project: form.project,
          contractor: form.contractor,
          contractorAddress: form.contractorAddress,
          originalContractValue: form.originalContractValue || "—",
          retentionPercent: effectiveRetentionPct,
          releaseStage: form.releaseStage,
          practicalCompletionDate: ukDate(form.practicalCompletionDate),
          defectsLiabilityEndDate: ukDate(form.defectsLiabilityEndDate),
          retentionAmount: form.retentionAmount,
          originallyDueDate: ukDate(form.originallyDueDate),
          previousChases: form.previousChases,
          paymentDeadline: stage === 3 ? ukDate(isoInDays(7)) : ukDate(form.paymentDeadline),
          daysOverdue,
          interestAccrued: interestAccrued.toFixed(2),
          totalDue: totalDue.toFixed(2),
          paymentDetails: paymentDetailsBlock,
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Letter generated");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `${TOOL_NAME} — ${form.project || "project"}`, content: result, user: userWithSig, clientSignature: stage === 3 ? clientSignature : null });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid="page-retention-chaser">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14} /> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Documents</div>
          <h1 className="font-display text-4xl md:text-5xl">Retention Chaser</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="rc-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="rc-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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
        {/* ---------- FORM ---------- */}
        <div className="card-dark p-6 space-y-4">
          {/* STAGE SELECTOR */}
          <div data-testid="rc-stage-selector">
            <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Chase stage</div>
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
                    data-testid={`rc-stage-${s.id}`}
                  >
                    <div className="text-xs uppercase tracking-widest font-bold leading-tight">{s.label}</div>
                    <div className="text-[10px] text-[#706D66] mt-1">{s.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <Section title="Project & Recipient">
            <Inp label="Project" value={form.project} onChange={(v) => setForm({ ...form, project: v })} testId="rc-project" />
            <Inp label="Main contractor / Client name" value={form.contractor} onChange={(v) => setForm({ ...form, contractor: v })} placeholder="Who the letter is being sent to" testId="rc-contractor" />
            <Inp label="Contractor / client address (optional)" value={form.contractorAddress} onChange={(v) => setForm({ ...form, contractorAddress: v })} testId="rc-contractor-address" />
          </Section>

          <Section title="Contract & Retention details">
            <Inp label="Original contract value (£) (optional)" type="number" value={form.originalContractValue} onChange={(v) => setForm({ ...form, originalContractValue: v })} testId="rc-original-value" />
            <div>
              <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">Retention percentage held</div>
              <div className="grid grid-cols-3 gap-2" data-testid="rc-pct-toggle">
                {RETENTION_PCT_OPTIONS.map((opt) => {
                  const active = form.retentionPercent === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => setForm({ ...form, retentionPercent: opt })}
                      className="px-3 py-2 rounded text-xs uppercase tracking-widest transition"
                      style={{
                        background: active ? "rgba(232,160,32,0.12)" : "transparent",
                        border: `1px solid ${active ? "#E8A020" : "rgba(160,157,148,0.25)"}`,
                        color: active ? "#E8A020" : "#A19D94",
                      }}
                      data-testid={`rc-pct-${opt.toLowerCase().replace("%", "")}`}
                    >{opt}</button>
                  );
                })}
              </div>
              {form.retentionPercent === "Other" && (
                <input
                  type="text"
                  placeholder="Enter percentage (e.g. 2.5%)"
                  className="input-base mt-2"
                  value={form.retentionPercentOther}
                  onChange={(e) => setForm({ ...form, retentionPercentOther: e.target.value })}
                  data-testid="rc-pct-other"
                />
              )}
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">Which retention release is this?</div>
              <select
                value={form.releaseStage}
                onChange={(e) => setForm({ ...form, releaseStage: e.target.value })}
                className="input-base"
                data-testid="rc-release-stage"
              >
                {RELEASE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <Inp label="Practical Completion Date" type="date" value={form.practicalCompletionDate} onChange={(v) => setForm({ ...form, practicalCompletionDate: v })} testId="rc-pc-date" />
            {showSecondHalfField && (
              <Inp label="Defects Liability Period End Date" type="date" value={form.defectsLiabilityEndDate} onChange={(v) => setForm({ ...form, defectsLiabilityEndDate: v })} testId="rc-dlp-end" />
            )}
            <Inp label="Retention amount due (£)" type="number" value={form.retentionAmount} onChange={(v) => setForm({ ...form, retentionAmount: v })} testId="rc-retention-amount" />
            <Inp label="Originally due on" type="date" value={form.originallyDueDate} onChange={(v) => setForm({ ...form, originallyDueDate: v })} testId="rc-due-date" />
            <div className="text-sm text-[#A19D94]" data-testid="rc-days-overdue">
              This retention is <span className="text-[#E8A020] font-semibold">{daysOverdue}</span> day{daysOverdue === 1 ? "" : "s"} overdue
            </div>
          </Section>

          {stage >= 2 && (
            <Section title="Previous correspondence">
              <label className="block">
                <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">Previous chase attempts (optional)</div>
                <textarea
                  rows={3}
                  className="input-base resize-y"
                  placeholder="Dates of any previous reminders sent. e.g. First reminder sent 12 Feb 2026"
                  value={form.previousChases}
                  onChange={(e) => setForm({ ...form, previousChases: e.target.value })}
                  data-testid="rc-previous"
                />
              </label>
            </Section>
          )}

          {stage >= 2 && (
            <Section title="Statutory interest">
              <div>
                <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">Add statutory interest?</div>
                <div className="grid grid-cols-2 gap-2" data-testid="rc-interest-toggle">
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
                        data-testid={`rc-interest-${opt.toLowerCase()}`}
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

          <Section title="Payment details (auto from profile — edit if needed)">
            <div className="grid grid-cols-2 gap-3">
              <Inp label="Bank name" value={form.bankNameEdit} onChange={(v) => setForm({ ...form, bankNameEdit: v })} testId="rc-bank-name" />
              <Inp label="Sort code" value={form.sortCodeEdit} onChange={(v) => setForm({ ...form, sortCodeEdit: v })} testId="rc-sort-code" />
            </div>
            <Inp label="Account number" value={form.accountNumberEdit} onChange={(v) => setForm({ ...form, accountNumberEdit: v })} testId="rc-account-number" />
            <div className="text-[10px] text-[#706D66] mt-1">Payment should be made to these details. Shown at the bottom of the generated letter.</div>
          </Section>

          {stage < 3 && (
            <Section title="Deadline">
              <Inp label="Deadline for retention release" type="date" value={form.paymentDeadline} onChange={(v) => setForm({ ...form, paymentDeadline: v })} testId="rc-deadline" />
            </Section>
          )}
          {stage === 3 && (
            <div className="p-3 rounded text-xs" style={{ background: "rgba(229,99,90,0.06)", border: "1px solid rgba(229,99,90,0.3)", color: "#E5635A" }} data-testid="rc-stage3-notice">
              Final 7-day deadline auto-applied. Letter Before Action is the last step before adjudication or court proceedings.
            </div>
          )}

          {/* ---------- TOTALS PANEL ---------- */}
          <div className="p-4 rounded space-y-2 text-sm" style={{ background: "rgba(232,160,32,0.06)", border: "1px solid rgba(232,160,32,0.3)" }} data-testid="rc-totals">
            <Row label="Retention amount" value={fGBP(retentionN)} />
            {showInterest && <Row label={`Statutory interest accrued (${daysOverdue} days @ ${(STATUTORY_INTEREST_RATE * 100).toFixed(2)}%)`} value={fGBP(interestAccrued)} testId="rc-interest-line" />}
            <div className="border-t border-[#E8A020]/30 pt-2">
              <Row label={<span className="font-bold uppercase tracking-widest text-[10px]">Total amount now due</span>} value={<span className="font-display text-2xl text-[#E8A020]">{fGBP(totalDue)}</span>} testId="rc-total-due" />
            </div>
          </div>

          {/* Signature pad(s) — dual on Stage 3 */}
          <div className="space-y-3 pt-2 border-t border-[#1a1a1a]">
            <LiveSignatureBlock label={stage === 3 ? "Your signature" : "Sign before generating"} value={liveSignature} onChange={setLiveSignature} savedSignature={user?.signature} testIdPrefix="rc-sig-self" />
            {stage === 3 && (
              <LiveSignatureBlock label="Recipient acknowledgement (optional)" value={clientSignature} onChange={setClientSignature} testIdPrefix="rc-sig-client" />
            )}
          </div>

          <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2" data-testid="rc-generate">
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
              <div className="flex gap-2 mb-3 flex-wrap" data-testid="rc-actions">
                <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
                <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
                <a href={`mailto:?subject=${encodeURIComponent(stage === 3 ? "NOTICE OF INTENTION TO PURSUE LEGAL ACTION — Retention" : `Retention release reminder — ${form.project}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
                <a href={`sms:?body=${encodeURIComponent(`Re retention on ${form.project}: ${fGBP(totalDue)} now due. See letter sent. ${user?.fullName || ""}`)}`} className="btn-secondary flex items-center gap-2 text-xs"><Phone size={12}/> SMS</a>
                <a href={`https://wa.me/?text=${encodeURIComponent(result)}`} target="_blank" rel="noreferrer" className="btn-secondary flex items-center gap-2 text-xs"><MessageSquare size={12}/> WhatsApp</a>
              </div>
              {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
              <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="rc-output">{result}</pre>
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
