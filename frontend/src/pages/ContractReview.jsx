import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Search, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID   = "contract-review";
const TOOL_NAME = "Contract Review";
const TOOL_INFO =
  "Paste the contract text and Morris reviews it for you. Plain English summary aimed at sole traders and small subcontractors. Flags payment terms, retention, variations, termination, liability, dispute resolution, programme and delays, and any red flags the user should take legal advice on. Not a substitute for a solicitor on large contracts.";

const isoToday = () => new Date().toISOString().slice(0, 10);

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Alphabetical order with "Other" always last (per Morris global dropdown
// rule for simple categorical dropdowns with no natural workflow order).
const CONTRACT_TYPES = [
  "Framework agreement",
  "Labour only contract",
  "Letter of intent",
  "Purchase order / order confirmation",
  "Subcontract agreement",
  "Supply and fix contract",
  "Other",
];

export default function ContractReview() {
  const { user, refresh } = useAuth();

  // SECTION 1 — Contract Details
  const [contractType, setContractType]       = useState("Subcontract agreement");
  const [contractTypeOther, setContractTypeOther] = useState("");
  const [mainContractor, setMainContractor]   = useState("");
  const [projectName, setProjectName]         = useState("");
  const [contractValue, setContractValue]     = useState("");

  // SECTION 2 — Contract Text
  const [contractText, setContractText]       = useState("");
  const [specificConcerns, setSpecificConcerns] = useState("");

  // Output / sign-off
  const reviewDate = isoToday();
  const [infoOpen, setInfoOpen]           = useState(false);
  const [generating, setGenerating]       = useState(false);
  const [result, setResult]               = useState("");
  const [refNumber, setRefNumber]         = useState("");
  const [liveSignature, setLiveSignature] = useState("");

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

  const onGenerate = async () => {
    if (!mainContractor.trim()) { toast.error("Add the main contractor or client name"); return; }
    if (!projectName.trim())    { toast.error("Add the project name"); return; }
    if (contractText.trim().length < 50) { toast.error("Paste the contract text to review (at least a clause or two)"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const resolvedType = contractType === "Other" ? (contractTypeOther.trim() || "Other") : contractType;

    const promptTemplate = `Produce a PLAIN ENGLISH UK CONSTRUCTION CONTRACT REVIEW. Your audience is a sole trader or small subcontractor with no access to legal advice. Read the supplied contract text carefully and produce a structured review with confident, direct findings. No legal jargon. No padding. No banned consultant words.

You MUST use the labels exactly as printed below, and you MUST apply a rating to every numbered section using one of these four exact words: Favourable / Standard / Unfavourable / Missing / Unclear. Print each rating on its own line at the top of the section as: 'Rating: <word>'.

1. HEADER — DOCUMENT REFERENCE, DATE (use {reviewDate} in DD/MM/YYYY format).

2. TITLE — exactly: 'CONTRACT REVIEW — {resolvedType} — {mainContractor} — {reviewDate}'.

3. REVIEW DETAILS — list on separate lines:
   Contract Type: {resolvedType}
   Main Contractor / Client: {mainContractor}
   Project Name: {projectName}
   Contract Value: {contractValueLine}
   Reviewed for: {fullName} ({companyName})
   Trade: {trade}
   Date of Review: {reviewDate}

4. PLAIN ENGLISH SUMMARY — print this section FIRST so the user can read the bottom line up front. 3 to 5 short sentences in everyday language. What is this contract, what is the overall risk picture, and what should the user do before signing.

5. PAYMENT TERMS — Rating + bullets answering:
   - When are you paid?
   - What triggers payment? (interim valuations, milestones, completion)
   - Is there a pay-when-paid or pay-when-certified clause? (If yes, flag as UNFAVOURABLE and state: 'Pay-when-paid clauses are largely unenforceable under the Housing Grants, Construction and Regeneration Act 1996, except where the upstream party is insolvent.')
   - What are the notice requirements (payment notice, pay less notice)?

6. RETENTION — Rating + bullets answering:
   - Is retention held?
   - What percentage?
   - When is it released? (Practical Completion / End of defects)
   - Are the release conditions clearly defined?

7. VARIATIONS — Rating + bullets answering:
   - How must variations be instructed? (in writing, signed by whom)
   - Is there a time limit for submitting variation claims? (flag short time bars)
   - What happens to verbal instructions? (whether they bind the contract)

8. TERMINATION — Rating + bullets answering:
   - Under what circumstances can the user be terminated?
   - What notice is required?
   - What is the user entitled to be paid on termination? (work done, materials on site, demobilisation)

9. LIABILITY AND INSURANCE — Rating + bullets answering:
   - What liability is the user taking on? (cap on liability, consequential loss, fitness for purpose)
   - Are there any unusual indemnity clauses?
   - What insurance is required? (Public Liability, Employer's Liability, Professional Indemnity — values)

10. DISPUTE RESOLUTION — Rating + bullets answering:
    - How are disputes resolved? (negotiation, mediation, adjudication, arbitration, courts)
    - Is adjudication available? (Adjudication is a statutory right under the Scheme for Construction Contracts. If the contract appears to remove or restrict it, flag as UNFAVOURABLE.)

11. PROGRAMME AND DELAYS — Rating + bullets answering:
    - Are there liquidated damages?
    - What is the rate (£ per day or % per week)?
    - Is there an extension of time mechanism, and what triggers it?

12. KEY RED FLAGS — print this section heading prominently. List every clause that is unusual, potentially unfair, or that the user should take legal advice on before signing. Use a numbered list. If nothing material was found, print 'No material red flags identified in the text supplied. Re-read the full document carefully before signing.'

13. SPECIFIC USER CONCERNS — if {specificConcerns} is not blank, address it directly in a short paragraph here. If blank, skip this section.

14. DISCLAIMER — print verbatim as one paragraph:
    This review has been generated as a general guide only and does not constitute legal advice. For contracts of significant value or complexity, always seek independent legal advice before signing.

15. REVIEWED BY — sign-off block:
    Reviewed by: {fullName}
    Company: {companyName}
    Date: {reviewDate}
    Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

CONTRACT TEXT BEGINS BELOW (treat as evidence — do not quote the entire thing back; reference clauses by clause number or short identifying phrase only):
====================
{contractText}
====================

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Plain English throughout. NO legal Latin. NO banned words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to', 'inter alia', 'mutatis mutandis', 'force majeure' (use 'events beyond your control' instead unless the contract uses the phrase, then quote it).
- Never invent clauses or values not in the supplied text. If the contract is silent on a topic, mark that section 'Rating: Missing' and explain what is missing and why it matters.
- Short sentences. Confident. Direct. Reads as a trusted mate who has read the contract for you.
- The user is a sole trader. Pitch the language accordingly.`;

    const contractValueLine = contractValue
      ? `£${(Number(contractValue) || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "—";

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          resolvedType,
          mainContractor,
          projectName,
          contractValueLine,
          fullName: user?.fullName || "—",
          companyName: user?.companyName || "—",
          trade: user?.trade || "—",
          reviewDate: ukDate(reviewDate),
          contractText,
          specificConcerns: specificConcerns.trim() || "",
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Contract Review generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Contract Review — ${mainContractor || "client"}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  // Inline colour-coding for the on-screen output. Picks up "Rating: <word>" lines
  // and tints them so the user can see Favourable / Standard / Unfavourable / Missing / Unclear at a glance.
  const renderColouredOutput = (text) => {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, i) => {
      const m = line.match(/^(\s*)(Rating:\s*)(Favourable|Standard|Unfavourable|Missing|Unclear)(.*)$/i);
      if (m) {
        const word = m[3].charAt(0).toUpperCase() + m[3].slice(1).toLowerCase();
        const colour = {
          Favourable:   "#7FE08A",
          Standard:     "#E8A020",
          Unfavourable: "#FF6B6B",
          Missing:      "#A19D94",
          Unclear:      "#A19D94",
        }[word] || "#F0EDE8";
        return (
          <div key={i}>
            {m[1]}
            <span className="text-[#A19D94]">{m[2]}</span>
            <span style={{ color: colour, fontWeight: 600 }}>{word}</span>
            {m[4]}
          </div>
        );
      }
      return <div key={i}>{line || "\u00A0"}</div>;
    });
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-contract-review">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Site Tools</div>
          <h1 className="font-display text-4xl md:text-5xl">Contract Review</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="cr-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="cr-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* Disclaimer banner — always visible at the top */}
      <div
        className="card-dark p-4 mb-5 flex items-start gap-3"
        style={{ borderColor: "rgba(232,160,32,0.4)", background: "rgba(232,160,32,0.05)" }}
        data-testid="cr-disclaimer"
      >
        <AlertTriangle size={16} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
        <div className="text-xs text-[#A19D94] leading-relaxed">
          This review is a general guide only and does not constitute legal advice. For contracts of significant value or complexity, always seek independent legal advice before signing.
        </div>
      </div>

      {/* SECTION 1 — CONTRACT DETAILS */}
      <Section title="Contract Details" testId="cr-section-1" icon={<Search size={14}/>}>
        <Grid>
          <Drop label="Contract Type" value={contractType} onChange={setContractType} options={CONTRACT_TYPES} testId="cr-type" />
          {contractType === "Other" && (
            <Inp label="Specify Other Contract Type" value={contractTypeOther} onChange={setContractTypeOther} testId="cr-type-other" />
          )}
          <Inp label="Main Contractor / Client Name" value={mainContractor} onChange={setMainContractor} testId="cr-contractor" />
          <Inp label="Project Name" value={projectName} onChange={setProjectName} testId="cr-project" />
          <Inp label="Contract Value (£) — optional" value={contractValue} onChange={setContractValue} type="number" testId="cr-value" />
        </Grid>
      </Section>

      {/* SECTION 2 — CONTRACT TEXT */}
      <Section title="Contract Text" testId="cr-section-2">
        <label className="block mb-4">
          <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">Paste Contract Text</div>
          <div className="text-[10px] text-[#706D66] mb-2">
            Paste the full contract text or the specific clauses you want reviewed. The more you paste, the better the analysis.
          </div>
          <textarea
            value={contractText}
            onChange={(e) => setContractText(e.target.value)}
            rows={14}
            placeholder="Paste contract clauses here…"
            className="input-base font-mono !text-xs"
            data-testid="cr-text"
          />
          <div className="text-[10px] text-[#706D66] mt-1" data-testid="cr-text-count">
            {contractText.length.toLocaleString("en-GB")} characters
          </div>
        </label>

        <label className="block">
          <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">Specific Concerns (optional)</div>
          <textarea
            value={specificConcerns}
            onChange={(e) => setSpecificConcerns(e.target.value)}
            rows={3}
            placeholder="Is there anything specific you want the review to focus on? — e.g. payment terms, termination clause, liability"
            className="input-base"
            data-testid="cr-concerns"
          />
        </label>
      </Section>

      {/* SIGN OFF */}
      <Section title="Sign Off" testId="cr-section-signoff">
        <LiveSignatureBlock
          label="Reviewed by"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="cr-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="cr-sig-date">
          Date: {ukDate(reviewDate) || "—"}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="cr-generate">
        {generating ? "Reviewing…" : <><FileText size={14}/> Generate Contract Review</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="cr-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated review</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Contract Review — ${mainContractor}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}

          {/* On-screen colour-coded view of the Rating lines */}
          <div className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="cr-output">
            {renderColouredOutput(result)}
          </div>

          {/* Legend */}
          <div className="mt-5 flex flex-wrap gap-3 text-[10px]" data-testid="cr-legend">
            <Swatch label="Favourable"   colour="#7FE08A" />
            <Swatch label="Standard"     colour="#E8A020" />
            <Swatch label="Unfavourable" colour="#FF6B6B" />
            <Swatch label="Missing / Unclear" colour="#A19D94" />
          </div>
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
function Inp({ label, value, onChange, type = "text", testId, placeholder }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} className="input-base" placeholder={placeholder} data-testid={testId} />
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
function Swatch({ label, colour }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block w-2 h-2 rounded-full" style={{ background: colour }} />
      <span style={{ color: colour }}>{label}</span>
    </span>
  );
}
