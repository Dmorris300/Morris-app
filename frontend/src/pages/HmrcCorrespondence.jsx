import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Landmark, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID   = "hmrc-correspondence";
const TOOL_NAME = "HMRC Correspondence";
const TOOL_INFO =
  "Drafts a professional response to a letter from HMRC. Includes your name, UTR, National Insurance number and the HMRC reference exactly where HMRC need to see them. Pitched at sole traders and small subcontractors who do not have an accountant on retainer.";

const isoToday = () => new Date().toISOString().slice(0, 10);

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function daysUntil(iso) {
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const target = new Date(`${iso}T00:00:00Z`);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

const ISSUE_TYPES = [
  "Self Assessment tax return query",
  "Payment demand / tax bill",
  "CIS refund query",
  "Late filing penalty",
  "Late payment penalty",
  "Compliance check / investigation",
  "Request for information",
  "Tax code query",
  "Underpayment notice",
  "Other",
];

const OUTCOME_OPTIONS = [
  "Pay the amount owed",
  "Dispute the amount",
  "Request a payment plan",
  "Request an extension of time to respond",
  "Provide information requested",
  "Appeal a penalty",
  "Other",
];

const SUPPORTING_DOCS = [
  "CIS payment statements",
  "Self Assessment tax return copy",
  "Bank statements",
  "Invoices / receipts",
  "Previous HMRC correspondence",
  "Accountant correspondence",
];

export default function HmrcCorrespondence() {
  const { user, refresh } = useAuth();

  // NEW fields (before Their Letter)
  const [fullName, setFullName]       = useState(user?.fullName || "");
  const [utr, setUtr]                 = useState(user?.utr || "");
  const [niNumber, setNiNumber]       = useState(user?.nationalInsuranceNumber || "");
  const [hmrcRef, setHmrcRef]         = useState("");
  const [letterDateFromHmrc, setLetterDateFromHmrc] = useState("");
  const [deadline, setDeadline]       = useState("");
  const [issueType, setIssueType]     = useState("Self Assessment tax return query");
  const [issueTypeOther, setIssueTypeOther] = useState("");

  // EXISTING fields (renamed labels only)
  const [hmrcLetter, setHmrcLetter]   = useState("");
  const [yourPosition, setYourPosition] = useState("");

  // NEW fields (after Your Position)
  const [outcome, setOutcome]               = useState("Provide information requested");
  const [outcomeOther, setOutcomeOther]     = useState("");
  const [supportingDocs, setSupportingDocs] = useState([]);
  const [supportingDocsOther, setSupportingDocsOther] = useState("");

  // Output / sign-off
  const letterDate = isoToday();
  const [infoOpen, setInfoOpen]             = useState(false);
  const [generating, setGenerating]         = useState(false);
  const [result, setResult]                 = useState("");
  const [refNumber, setRefNumber]           = useState("");
  const [liveSignature, setLiveSignature]   = useState("");

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

  const toggleDoc = (d) => {
    setSupportingDocs((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]);
  };

  // Deadline warning logic
  const deadlineState = useMemo(() => {
    const d = daysUntil(deadline);
    if (d === null) return { d: null, warn: false, msg: "" };
    if (d < 0)  return { d, warn: true,  msg: `Response deadline has passed (${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} ago). Send your reply immediately.` };
    if (d <= 14) return { d, warn: true, msg: `Response deadline is approaching — act promptly. ${d} day${d === 1 ? "" : "s"} remaining.` };
    return { d, warn: false, msg: `${d} day${d === 1 ? "" : "s"} until the deadline.` };
  }, [deadline]);

  const onGenerate = async () => {
    if (!fullName.trim()) { toast.error("Add your full name"); return; }
    if (!utr.trim())      { toast.error("Add your UTR number"); return; }
    if (!hmrcRef.trim())  { toast.error("Add the HMRC reference number from their letter"); return; }
    if (hmrcLetter.trim().length < 20) { toast.error("Summarise the HMRC letter so the response can address it"); return; }
    if (yourPosition.trim().length < 20) { toast.error("Explain your position so the response can be drafted"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const resolvedIssue   = issueType   === "Other" ? (issueTypeOther.trim()  || "Other matter")  : issueType;
    const resolvedOutcome = outcome     === "Other" ? (outcomeOther.trim()    || "Other outcome") : outcome;

    const docsForPrompt = [
      ...supportingDocs,
      ...(supportingDocsOther.trim() ? [supportingDocsOther.trim()] : []),
    ];
    const docsBlock = docsForPrompt.length
      ? docsForPrompt.map((d, i) => `   ${i + 1}. ${d}`).join("\n")
      : "   (No supporting documents listed)";

    const deadlineLine = deadline
      ? `${ukDate(deadline)}${deadlineState.warn ? " — RESPONSE DEADLINE APPROACHING" : ""}`
      : "Not stated";

    const promptTemplate = `Produce a formal UK LETTER TO HMRC from a sole trader. Plain English. Polite, factual, professional. No padding. No banned consultant words. Replies to a letter HMRC have sent the user.

1. HEADER — DOCUMENT REFERENCE, DATE (use {letterDate} in DD/MM/YYYY format).

2. SENDER BLOCK — print on its own block, exactly as HMRC require (right-aligned in the user's mind, but on consecutive lines is fine):
   {fullName}
   {companyName}
   UTR: {utr}
   National Insurance Number: {niNumberLine}

3. RECIPIENT BLOCK — print on consecutive lines:
   HM Revenue and Customs
   (HMRC office address — leave blank for the user to add the address from their letter)

4. SUBJECT LINE — print on its own line in bold style:
   Subject: Response to HMRC letter dated {letterDateFromHmrc} — Reference {hmrcRef}

5. OPENING PARAGRAPH — short, polite opening. Reference the HMRC letter dated {letterDateFromHmrc} bearing reference {hmrcRef}. State that you are writing in response and acknowledge the matter.

6. THE MATTER — set out the issue in plain English. Summarise what HMRC have said using the supplied summary verbatim where possible. State the type of issue as: {resolvedIssue}.

7. YOUR RESPONSE — set out the user's position in plain English using the supplied position verbatim where possible. Be factual, not emotional. Reference the relevant tax year or period if it appears in the supplied text.

8. OUTCOME REQUESTED — state clearly the outcome the user is seeking: {resolvedOutcome}. If the outcome is a payment plan or appeal, briefly explain the grounds.

9. SUPPORTING DOCUMENTS — short lead-in line then list the supporting documents verbatim, one per numbered line. If none are listed, state that supporting documents are available on request:
   The following documents are available to support this response:
{docsBlock}

10. DEADLINE ACKNOWLEDGEMENT — short paragraph acknowledging the response deadline ({deadlineLine}) and confirming that this reply is being submitted within that period. Skip cleanly if the deadline is blank.

11. CLOSING PARAGRAPH — short closing paragraph. Thank the officer for their attention. Invite them to contact you on the details below if anything further is needed. Confirm willingness to cooperate fully.

12. CONTACT DETAILS — list on separate lines:
    Yours faithfully
    {fullName}
    {companyName}
    Email: {email}
    Telephone: {phone}

13. DISCLAIMER — print verbatim as one small paragraph at the very bottom of the letter:
    This letter has been drafted as a guide only. For complex tax matters or disputes involving significant sums, always seek advice from a qualified accountant or tax adviser.

14. SIGNATURE — leave a signature line above the printed name, or insert the user's saved signature if held.

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Print the UTR, National Insurance Number and HMRC Reference exactly as supplied — do not redact, abbreviate or reformat. If a value is blank, omit that line cleanly.
- Never invent figures, tax years or facts.
- Never use abbreviations such as 'N/A', 'TBC', '&', 'inc.' or 'excl.'. Write words in full. 'UTR' and 'HMRC' and 'CIS' and 'PAYE' are acceptable because they are HMRC's own terminology.
- Skip blank optional fields cleanly. Do not print '—' for a whole paragraph.
- No banned consultant words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Polite. Factual. Reads as a real letter from a working sole trader to HMRC.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          letterDate: ukDate(letterDate),
          fullName,
          companyName: user?.companyName || "",
          utr,
          niNumberLine: niNumber.trim() || "(not provided)",
          hmrcRef,
          letterDateFromHmrc: ukDate(letterDateFromHmrc) || "(not stated)",
          deadlineLine,
          resolvedIssue,
          resolvedOutcome,
          docsBlock,
          email: user?.email || "(email)",
          phone: user?.contactNumber || user?.phone || "(telephone)",
          hmrcLetter,
          yourPosition,
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("HMRC Correspondence draft generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `HMRC Correspondence — ${hmrcRef || fullName}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-hmrc-correspondence">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Sole Trader</div>
          <h1 className="font-display text-4xl md:text-5xl">HMRC Correspondence</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="hmrc-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="hmrc-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 — YOUR REFERENCES */}
      <Section title="Your References" testId="hmrc-section-1" icon={<Landmark size={14}/>}>
        <Grid>
          <Inp label="Your Full Name" value={fullName} onChange={setFullName} testId="hmrc-fullname" helper="Auto-populated from your profile" />
          <Inp label="Your UTR Number" value={utr} onChange={setUtr} testId="hmrc-utr" helper="Your Unique Taxpayer Reference — found on any previous HMRC correspondence or your Self Assessment registration" />
          <Inp label="Your National Insurance Number (optional)" value={niNumber} onChange={setNiNumber} testId="hmrc-ni" />
        </Grid>
      </Section>

      {/* SECTION 2 — HMRC LETTER DETAILS */}
      <Section title="HMRC Letter Details" testId="hmrc-section-2">
        <Grid>
          <Inp label="HMRC Reference Number" value={hmrcRef} onChange={setHmrcRef} testId="hmrc-ref" helper="The reference number shown on their letter" />
          <Inp label="Date of HMRC Letter" value={letterDateFromHmrc} onChange={setLetterDateFromHmrc} type="date" testId="hmrc-letterdate" />
          <Inp label="Deadline for Response" value={deadline} onChange={setDeadline} type="date" testId="hmrc-deadline" />
          <Drop label="Type of Letter / Issue" value={issueType} onChange={setIssueType} options={ISSUE_TYPES} testId="hmrc-issue" />
          {issueType === "Other" && (
            <Inp label="Specify Other Issue Type" value={issueTypeOther} onChange={setIssueTypeOther} testId="hmrc-issue-other" />
          )}
        </Grid>
        {deadlineState.warn && (
          <div
            className="mt-4 p-3 rounded flex items-start gap-2"
            style={{ border: "1px solid #E8A020", background: "rgba(232,160,32,0.08)" }}
            data-testid="hmrc-deadline-warning"
          >
            <AlertTriangle size={16} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
            <div className="text-xs text-[#F0EDE8] leading-relaxed">{deadlineState.msg}</div>
          </div>
        )}
      </Section>

      {/* SECTION 3 — LETTER + POSITION (existing fields, renamed labels) */}
      <Section title="The Matter" testId="hmrc-section-3">
        <Area
          label="Summary of HMRC Letter"
          value={hmrcLetter}
          onChange={setHmrcLetter}
          placeholder="Paste the key points from the letter or summarise what HMRC are saying"
          testId="hmrc-letter"
          rows={6}
        />
        <div className="mt-4">
          <Area
            label="Your Response / Position"
            value={yourPosition}
            onChange={setYourPosition}
            placeholder="Explain your position clearly — do you agree, disagree, or need more time? Include any relevant facts"
            testId="hmrc-position"
            rows={6}
          />
        </div>
      </Section>

      {/* SECTION 4 — OUTCOME + SUPPORTING DOCS */}
      <Section title="Outcome and Supporting Documents" testId="hmrc-section-4">
        <Grid>
          <Drop label="What outcome are you seeking?" value={outcome} onChange={setOutcome} options={OUTCOME_OPTIONS} testId="hmrc-outcome" />
          {outcome === "Other" && (
            <Inp label="Specify Other Outcome" value={outcomeOther} onChange={setOutcomeOther} testId="hmrc-outcome-other" />
          )}
        </Grid>

        <div className="mt-4">
          <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">Supporting Documents Available</div>
          <div className="grid sm:grid-cols-2 gap-3">
            {SUPPORTING_DOCS.map((d, i) => {
              const active = supportingDocs.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDoc(d)}
                  data-testid={`hmrc-doc-${i}`}
                  className="text-left p-3 rounded text-sm transition-colors"
                  style={{
                    background: active ? "rgba(232,160,32,0.10)" : "rgba(15,15,15,0.6)",
                    border: `1px solid ${active ? "#E8A020" : "rgba(160,157,148,0.18)"}`,
                    color: active ? "#E8A020" : "#F0EDE8",
                  }}
                >
                  <span className="mr-2">{active ? "✓" : "○"}</span>{d}
                </button>
              );
            })}
          </div>
          <div className="mt-3">
            <Inp label="Other Supporting Document (free text)" value={supportingDocsOther} onChange={setSupportingDocsOther} testId="hmrc-doc-other" />
          </div>
        </div>
      </Section>

      {/* SIGN OFF */}
      <Section title="Sign Off" testId="hmrc-section-signoff">
        <LiveSignatureBlock
          label="Sender signature"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="hmrc-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="hmrc-sig-date">
          Date: {ukDate(letterDate) || "—"}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="hmrc-generate">
        {generating ? "Drafting…" : <><FileText size={14}/> Generate HMRC Letter</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="hmrc-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated letter</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`HMRC Correspondence — ${hmrcRef}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="hmrc-output">{result}</pre>
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
