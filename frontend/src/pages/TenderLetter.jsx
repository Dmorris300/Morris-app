import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Mailbox } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID   = "tender-letter";
const TOOL_NAME = "Tender Letter";
const TOOL_INFO =
  "Professional cover letter accompanying a tender submission. Includes scope, inclusions, exclusions, programme, payment terms, price status and the attachments enclosed — everything a main contractor or client needs to assess the tender.";

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

const N = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const money = (n) =>
  `£${(Number(n) || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PAYMENT_TERMS = ["14 days", "30 days", "Monthly valuations", "On completion", "Other"];
const PRICE_STATUS = [
  "Fixed price — not subject to change",
  "Fixed for tender validity period only",
  "Subject to survey / further information",
  "Indicative only — to be confirmed on receipt of full information",
];
const ATTACHMENT_OPTIONS = [
  "Priced schedule / bill of quantities",
  "Programme",
  "Company profile",
  "Insurance certificates",
  "RAMS",
  "CSCS cards",
  "References",
];

export default function TenderLetter() {
  const { user, refresh } = useAuth();

  // NEW fields (before Client)
  const [tenderDate, setTenderDate]   = useState(isoToday());
  const [tenderRef, setTenderRef]     = useState("TL-001");

  // EXISTING fields (kept)
  const [client, setClient]           = useState("");
  const [project, setProject]         = useState("");
  const [tenderSum, setTenderSum]     = useState("");

  // NEW fields (after Tender Sum)
  const [scope, setScope]             = useState("");
  const [included, setIncluded]       = useState("");
  const [excluded, setExcluded]       = useState("");
  const [validUntil, setValidUntil]   = useState(isoPlusDays(30));
  const [programme, setProgramme]     = useState("");
  const [proposedStart, setProposedStart] = useState("");
  const [paymentTerms, setPaymentTerms]   = useState("30 days");
  const [paymentTermsOther, setPaymentTermsOther] = useState("");
  const [priceStatus, setPriceStatus] = useState("Fixed for tender validity period only");
  const [keyPoints, setKeyPoints]     = useState("");
  const [attachments, setAttachments] = useState([]);
  const [attachmentsOther, setAttachmentsOther] = useState("");

  // Output / sign-off
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

  const toggleAttachment = (a) => {
    setAttachments((cur) => cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]);
  };

  const onGenerate = async () => {
    if (!client.trim())  { toast.error("Add the client name"); return; }
    if (!project.trim()) { toast.error("Add the project name"); return; }
    if (N(tenderSum) <= 0) { toast.error("Add the tender sum"); return; }
    if (!scope.trim())   { toast.error("Describe the scope of works your price covers"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const resolvedPaymentTerms = paymentTerms === "Other"
      ? (paymentTermsOther.trim() || "As agreed")
      : paymentTerms;

    const attachmentsForPrompt = [
      ...attachments,
      ...(attachmentsOther.trim() ? [attachmentsOther.trim()] : []),
    ];
    const attachmentsBlock = attachmentsForPrompt.length
      ? attachmentsForPrompt.map((a, i) => `   ${i + 1}. ${a}`).join("\n")
      : "   (No attachments listed)";

    const promptTemplate = `Produce a UK TENDER SUBMISSION COVER LETTER. Plain direct construction English. Confident and professional but not boastful. No padding. No banned consultant words.

1. HEADER — DOCUMENT REFERENCE: {tenderRef}. DATE: {tenderDate} in DD/MM/YYYY format.

2. SENDER BLOCK — print on consecutive lines:
   {companyName}
   Trade: {trade}
   Sender: {senderName}

3. RECIPIENT — print on its own line:
   To: {client}

4. SUBJECT LINE — print on its own line:
   Subject: Tender Submission — {project} — Reference {tenderRef}

5. OPENING PARAGRAPH — short, professional opening. Thanking the recipient for the invitation to tender for {project} and confirming that this letter accompanies the formal submission.

6. TENDER DETAILS — list on separate lines:
   Tender Reference Number: {tenderRef}
   Date of Tender: {tenderDate}
   Project: {project}
   Tender Sum: {tenderSumValue}
   Tender Valid Until: {validUntil}
   Status of Price: {priceStatus}

7. SCOPE OF WORKS — short paragraph using the supplied scope verbatim:
   Scope of Works: {scope}

8. INCLUSIONS — list on separate lines, skipping cleanly if blank:
   What is Included: {included}

9. EXCLUSIONS — list on separate lines, skipping cleanly if blank:
   What is Excluded: {excluded}

10. PROGRAMME — list on separate lines:
    Proposed Programme: {programme}
    Proposed Start Date: {proposedStart}

11. PAYMENT TERMS — print on its own line:
    Payment Terms Requested: {resolvedPaymentTerms}

12. KEY POINTS / WHY CHOOSE US — if {keyPoints} is not blank, include verbatim as one short paragraph. If blank, skip this section.
    {keyPoints}

13. ATTACHMENTS ENCLOSED — short lead-in line then the supplied attachments verbatim, one per numbered line:
    The following documents are enclosed in support of this tender:
{attachmentsBlock}

14. CLOSING PARAGRAPH — short closing paragraph confirming the submitting company looks forward to the recipient's consideration and inviting them to contact you on the details below with any queries.

15. SIGN-OFF — single sender sign-off:
    Yours sincerely
    {senderName}
    {senderRole}
    {companyName}
    Email: {email}
    Telephone: {phone}
    Date: {tenderDate}
    Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

16. FOOTER — print verbatim on its own line:
    This tender is submitted in good faith and is valid until {validUntil}. The submitting company reserves the right to withdraw or amend this tender prior to acceptance.

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Never invent figures, dates or attachments. Use only the supplied values.
- Never use abbreviations such as 'N/A', 'TBC', '&', 'inc.' or 'excl.'. Write words in full. RAMS and CSCS are acceptable because they are industry standard names.
- Skip blank optional sections cleanly. Do not print '—' for a whole paragraph.
- No banned consultant words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Professional. Reads as a real tender cover letter from a working professional.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          tenderDate: ukDate(tenderDate),
          tenderRef,
          companyName: user?.companyName || "—",
          trade: user?.trade || "—",
          senderName: user?.fullName || "—",
          senderRole: user?.signatureRole || "Director",
          email: user?.email || "(email)",
          phone: user?.contactNumber || user?.phone || "(telephone)",
          client,
          project,
          tenderSumValue: money(N(tenderSum)),
          scope,
          included: included.trim() || "(not stated)",
          excluded: excluded.trim() || "",
          validUntil: ukDate(validUntil),
          programme: programme || "(to be confirmed)",
          proposedStart: ukDate(proposedStart) || "(to be agreed on award)",
          resolvedPaymentTerms,
          priceStatus,
          keyPoints: keyPoints.trim() || "",
          attachmentsBlock,
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Tender Letter generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Tender Letter — ${client || "client"} — ${tenderRef}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-tender-letter">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Contractors</div>
          <h1 className="font-display text-4xl md:text-5xl">Tender Letter</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="tl-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="tl-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 — TENDER DETAILS */}
      <Section title="Tender Details" testId="tl-section-1" icon={<Mailbox size={14}/>}>
        <Grid>
          <Inp label="Date of Tender" value={tenderDate} onChange={setTenderDate} type="date" testId="tl-date" />
          <Inp label="Tender Reference Number" value={tenderRef} onChange={setTenderRef} testId="tl-ref" helper="Auto-suggested — edit if needed" />
          <Inp label="Client (recipient)" value={client} onChange={setClient} testId="tl-client" />
          <Inp label="Project" value={project} onChange={setProject} testId="tl-project" />
          <Inp label="Tender Sum (£)" value={tenderSum} onChange={setTenderSum} type="number" testId="tl-sum" />
          <Inp label="Tender Valid Until" value={validUntil} onChange={setValidUntil} type="date" testId="tl-validuntil" helper="Defaults to 30 days from today" />
        </Grid>
      </Section>

      {/* SECTION 2 — SCOPE */}
      <Section title="Scope of Works" testId="tl-section-2">
        <Area
          label="Scope of Works"
          value={scope}
          onChange={setScope}
          rows={4}
          placeholder="What does your price cover? Be specific about what you are tendering for"
          testId="tl-scope"
        />
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Area label="What is Included" value={included} onChange={setIncluded} placeholder={`e.g. "All labour, fixings, consumables, supervision"`} testId="tl-included" />
          <Area label="What is Excluded (optional)" value={excluded} onChange={setExcluded} placeholder={`e.g. "Making good, builder's work, scaffolding, materials unless stated"`} testId="tl-excluded" />
        </div>
      </Section>

      {/* SECTION 3 — PROGRAMME + PAYMENT */}
      <Section title="Programme and Commercial" testId="tl-section-3">
        <Grid>
          <Inp label="Proposed Programme" value={programme} onChange={setProgramme} testId="tl-programme" placeholder={`e.g. "6 weeks, 3 days per floor"`} />
          <Inp label="Proposed Start Date (optional)" value={proposedStart} onChange={setProposedStart} type="date" testId="tl-start" />
          <Drop label="Payment Terms Requested" value={paymentTerms} onChange={setPaymentTerms} options={PAYMENT_TERMS} testId="tl-payment-terms" />
          {paymentTerms === "Other" && (
            <Inp label="Specify Other Payment Terms" value={paymentTermsOther} onChange={setPaymentTermsOther} testId="tl-payment-other" />
          )}
          <Drop label="Is this price fixed?" value={priceStatus} onChange={setPriceStatus} options={PRICE_STATUS} testId="tl-price-status" />
        </Grid>
      </Section>

      {/* SECTION 4 — KEY POINTS */}
      <Section title="Key Points / Why Choose Us (optional)" testId="tl-section-4">
        <Area
          label="Key Points"
          value={keyPoints}
          onChange={setKeyPoints}
          rows={4}
          placeholder={`e.g. "20 years' experience on similar refits, locally based, previous works for this client at site X completed on time and budget"`}
          testId="tl-keypoints"
        />
      </Section>

      {/* SECTION 5 — ATTACHMENTS */}
      <Section title="Attachments Enclosed" testId="tl-section-5">
        <div className="grid sm:grid-cols-2 gap-3">
          {ATTACHMENT_OPTIONS.map((a, i) => {
            const active = attachments.includes(a);
            return (
              <button
                key={a}
                type="button"
                onClick={() => toggleAttachment(a)}
                data-testid={`tl-attach-${i}`}
                className="text-left p-3 rounded text-sm transition-colors"
                style={{
                  background: active ? "rgba(232,160,32,0.10)" : "rgba(15,15,15,0.6)",
                  border: `1px solid ${active ? "#E8A020" : "rgba(160,157,148,0.18)"}`,
                  color: active ? "#E8A020" : "#F0EDE8",
                }}
              >
                <span className="mr-2">{active ? "✓" : "○"}</span>{a}
              </button>
            );
          })}
        </div>
        <div className="mt-3">
          <Inp label="Other Attachment (free text)" value={attachmentsOther} onChange={setAttachmentsOther} testId="tl-attach-other" />
        </div>
      </Section>

      {/* SIGN OFF */}
      <Section title="Sign Off" testId="tl-section-signoff">
        <LiveSignatureBlock
          label="Sender signature"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="tl-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="tl-sig-date">
          Date: {ukDate(tenderDate) || "—"}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="tl-generate">
        {generating ? "Drafting…" : <><FileText size={14}/> Generate Tender Letter</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="tl-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated letter</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Tender Submission — ${project} — ${tenderRef}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="tl-output">{result}</pre>
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
