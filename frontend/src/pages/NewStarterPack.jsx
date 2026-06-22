import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, UserPlus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";
import DraftSaveButton from "../components/DraftSaveButton";
import useToolDraft from "../hooks/useToolDraft";

const TOOL_ID   = "new-starter-pack";
const TOOL_NAME = "New Starter Pack";
const TOOL_INFO =
  "Complete new starter document pack for a worker joining a site or company. Captures worker details, right to work check, CIS status, PPE issued and a full site induction checklist. Signed by both the employer and the new starter before the worker begins site activities.";

const isoToday = () => new Date().toISOString().slice(0, 10);

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const EMPLOYMENT_STATUS_OPTIONS = [
  "Employed (PAYE)",
  "Self-employed (CIS)",
  "Limited company (CIS)",
];

const CIS_VERIFICATION_OPTIONS = [
  "Verified at 20 percent",
  "Verified at 0 percent (gross)",
  "Unverified — 30 percent applies",
  "To be verified",
];

const RIGHT_TO_WORK_OPTIONS = [
  "Passport",
  "Biometric Residence Permit",
  "Share Code verified",
  "Other",
];

const DOCUMENTS = [
  "Photo ID checked (passport or driving licence)",
  "CSCS card checked and valid",
  "Right to work document checked",
  "Public liability insurance checked (if self-employed)",
  "UTR number provided",
  "Bank details provided for payment",
];

const PPE_ITEMS = [
  "Hard hat",
  "Safety boots",
  "High visibility vest",
  "Safety glasses",
  "Gloves",
  "Hearing protection",
  "Dust mask or respirator",
];

const INDUCTION_ITEMS = [
  "Site rules and conduct explained",
  "Emergency evacuation procedure explained",
  "First aid location and first aider identified",
  "Muster point confirmed",
  "Welfare facilities shown (toilets, water, rest area)",
  "Reporting procedure explained (who to report to, how to report issues)",
  "Variation and extra works procedure explained",
  "RAMS reviewed and explained",
  "Working hours and break times confirmed",
  "Mobile phone and site rules confirmed",
  "Drug and alcohol policy explained",
  "Zero tolerance and disciplinary procedure explained",
];

const YNN_OPTIONS = ["Yes", "No", "Not Applicable"];
const YNR_OPTIONS = ["Yes", "No", "Not Required"];
const YN_OPTIONS  = ["Yes", "No"];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function NewStarterPack() {
  const { user, refresh } = useAuth();

  // SECTION 1 — SITE / EMPLOYER
  const [project, setProject]         = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [joinDate, setJoinDate]       = useState(isoToday());

  // SECTION 2 — NEW STARTER
  const [fullName, setFullName]       = useState("");
  const [dob, setDob]                 = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [phone, setPhone]             = useState("");
  const [email, setEmail]             = useState("");
  const [nokName, setNokName]         = useState("");
  const [nokRelationship, setNokRelationship] = useState("");
  const [nokPhone, setNokPhone]       = useState("");
  const [medical, setMedical]         = useState("");

  // SECTION 3 — EMPLOYMENT / CIS
  const [employment, setEmployment]   = useState("Employed (PAYE)");
  const [utr, setUtr]                 = useState("");
  const [cisVerification, setCisVerification] = useState("To be verified");
  const [rightToWorkChecked, setRightToWorkChecked] = useState(false);
  const [rightToWorkType, setRightToWorkType] = useState("Passport");
  const [niNumber, setNiNumber]       = useState("");

  // SECTION 4 — DOCUMENTS
  const [documents, setDocuments] = useState(() => Object.fromEntries(DOCUMENTS.map((d) => [d, "Not Applicable"])));
  const [cscsNumber, setCscsNumber] = useState("");
  const [cscsExpiry, setCscsExpiry] = useState("");

  // SECTION 5 — PPE
  const [ppe, setPpe] = useState(() => Object.fromEntries(PPE_ITEMS.map((p) => [p, "Not Required"])));
  const [ppeOther, setPpeOther]       = useState("");
  const [ppeOtherStatus, setPpeOtherStatus] = useState("Not Required");
  const [ppeNotes, setPpeNotes]       = useState("");

  // SECTION 6 — INDUCTION
  const [induction, setInduction] = useState(() => Object.fromEntries(INDUCTION_ITEMS.map((i) => [i, "No"])));
  const [inductionNotes, setInductionNotes] = useState("");

  // SECTION 7 — SIGN OFF
  const [employerSignature, setEmployerSignature] = useState("");
  const [starterSignature, setStarterSignature]   = useState("");
  const signDate = isoToday();

  // Output
  const [infoOpen, setInfoOpen]         = useState(false);
  const [generating, setGenerating]     = useState(false);
  const [result, setResult]             = useState("");
  const [refNumber, setRefNumber]       = useState("");

  const isCis = employment !== "Employed (PAYE)";

  // ---------- Draft save/resume ----------
  const getDraftData = () => ({
    project, siteAddress, joinDate, fullName, dob, homeAddress, phone, email,
    nokName, nokRelationship, nokPhone, medical, employment, utr,
    cisVerification, rightToWorkChecked, rightToWorkType, niNumber,
    documents, cscsNumber, cscsExpiry, ppe, ppeOther, ppeOtherStatus,
    ppeNotes, induction, inductionNotes, employerSignature, starterSignature,
    result, refNumber,
  });
  useToolDraft(TOOL_ID, (p) => {
    if (p.project !== undefined) setProject(p.project);
    if (p.siteAddress !== undefined) setSiteAddress(p.siteAddress);
    if (p.joinDate !== undefined) setJoinDate(p.joinDate);
    if (p.fullName !== undefined) setFullName(p.fullName);
    if (p.dob !== undefined) setDob(p.dob);
    if (p.homeAddress !== undefined) setHomeAddress(p.homeAddress);
    if (p.phone !== undefined) setPhone(p.phone);
    if (p.email !== undefined) setEmail(p.email);
    if (p.nokName !== undefined) setNokName(p.nokName);
    if (p.nokRelationship !== undefined) setNokRelationship(p.nokRelationship);
    if (p.nokPhone !== undefined) setNokPhone(p.nokPhone);
    if (p.medical !== undefined) setMedical(p.medical);
    if (p.employment !== undefined) setEmployment(p.employment);
    if (p.utr !== undefined) setUtr(p.utr);
    if (p.cisVerification !== undefined) setCisVerification(p.cisVerification);
    if (p.rightToWorkChecked !== undefined) setRightToWorkChecked(p.rightToWorkChecked);
    if (p.rightToWorkType !== undefined) setRightToWorkType(p.rightToWorkType);
    if (p.niNumber !== undefined) setNiNumber(p.niNumber);
    if (p.documents && typeof p.documents === "object") setDocuments(p.documents);
    if (p.cscsNumber !== undefined) setCscsNumber(p.cscsNumber);
    if (p.cscsExpiry !== undefined) setCscsExpiry(p.cscsExpiry);
    if (p.ppe && typeof p.ppe === "object") setPpe(p.ppe);
    if (p.ppeOther !== undefined) setPpeOther(p.ppeOther);
    if (p.ppeOtherStatus !== undefined) setPpeOtherStatus(p.ppeOtherStatus);
    if (p.ppeNotes !== undefined) setPpeNotes(p.ppeNotes);
    if (p.induction && typeof p.induction === "object") setInduction(p.induction);
    if (p.inductionNotes !== undefined) setInductionNotes(p.inductionNotes);
    if (p.employerSignature !== undefined) setEmployerSignature(p.employerSignature);
    if (p.starterSignature !== undefined) setStarterSignature(p.starterSignature);
    if (p.result !== undefined) setResult(p.result);
    if (p.refNumber !== undefined) setRefNumber(p.refNumber);
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

  const onGenerate = async () => {
    if (!fullName.trim())    { toast.error("Add the new starter's full name"); return; }
    if (!project.trim())     { toast.error("Add the project or company name"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const documentsBlock = DOCUMENTS.map((d) => `${d}: ${documents[d] || "Not Applicable"}`).join("\n   ");
    const ppeStandardBlock = PPE_ITEMS.map((p) => `${p}: ${ppe[p] || "Not Required"}`).join("\n   ");
    const ppeOtherLine = ppeOther.trim()
      ? `\n   ${ppeOther.trim()}: ${ppeOtherStatus}`
      : "";
    const ppeBlock = ppeStandardBlock + ppeOtherLine;
    const inductionBlock = INDUCTION_ITEMS.map((i) => `${i}: ${induction[i] || "No"}`).join("\n   ");

    const cisBlock = isCis
      ? [
          `UTR Number: ${utr || "—"}`,
          `CIS Verification Status: ${cisVerification}`,
        ].join("\n   ")
      : "Not applicable — worker is PAYE employed.";

    const rightToWorkLine = rightToWorkChecked
      ? `Right to Work Checked: Yes — ${rightToWorkType}`
      : "Right to Work Checked: No";

    const promptTemplate = `Produce a UK NEW STARTER PACK. Plain direct construction English. No padding. No banned consultant words. Full words only — never use abbreviations such as 'N/A', 'TBC', 'qty', '&', 'inc.', 'excl.', 'approx.' or 'etc.'. This document is a complete new starter induction pack signed by both employer and starter before the worker begins any site activities.

1. HEADER — DOCUMENT REFERENCE: new starter pack. DATE: {joinDateUk} in DD/MM/YYYY format.

2. TITLE — exactly: 'NEW STARTER PACK — {fullName} — {joinDateUk}'.

3. SITE AND EMPLOYER DETAILS — list on separate lines:
   Project Name or Company Name: {project}
   Site Address: {siteAddress}
   Date of Joining: {joinDateUk}
   Supervisor or Manager Name: {supervisorName}
   Position: {supervisorRole}
   Company: {companyName}
   Trade: {trade}

4. NEW STARTER DETAILS — list on separate lines:
   Full Name: {fullName}
   Date of Birth: {dobUk}
   Home Address: {homeAddress}
   Phone Number: {phone}
   Email Address: {email}
   Next of Kin or Emergency Contact Name: {nokName}
   Emergency Contact Relationship: {nokRelationship}
   Emergency Contact Phone Number: {nokPhone}
   Medical Conditions to Note: {medical}

5. EMPLOYMENT AND CIS STATUS — list on separate lines:
   Employment Status: {employment}
   {cisBlock}
   {rightToWorkLine}
   National Insurance Number: {niNumber}

6. DOCUMENTS CHECKED — print each document on its own line with the response supplied:
   {documentsBlock}
   CSCS Card Number: {cscsNumber}
   CSCS Card Expiry Date: {cscsExpiryUk}

7. PERSONAL PROTECTIVE EQUIPMENT ISSUED — print each PPE item on its own line with the response supplied:
   {ppeBlock}
   PPE Notes: {ppeNotes}

8. SITE INDUCTION CHECKLIST — print each item on its own line with the response supplied:
   {inductionBlock}
   Additional Induction Notes: {inductionNotes}

9. SIGN OFF — print two clearly separated signature blocks:

   EMPLOYER / SUPERVISOR
   Name: {supervisorName}
   Position: {supervisorRole}
   Company: {companyName}
   Date: {signDateUk}
   Signature: (auto-insert employer signature if held; otherwise leave a signature line)

   NEW STARTER
   Name: {fullName}
   I confirm I have received, read, and understood the contents of this new starter pack.
   Date: {signDateUk}
   Signature: (auto-insert new starter signature if held; otherwise leave a signature line)

10. FOOTER — print verbatim on its own line:
    This document must be completed before the worker begins any site activities. A copy should be retained by the employer and a copy given to the new starter.

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Never invent personal details, document numbers, dates or check responses. Use only the supplied values.
- Full words only — write every word out in full. Never abbreviate.
- Skip blank optional fields cleanly. Use '—' only where supplied.
- No banned words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct. Reads as a real new starter induction pack from an employer to a new worker.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          joinDateUk: ukDate(joinDate),
          project,
          siteAddress: siteAddress || "—",
          companyName: user?.companyName || "—",
          trade: user?.trade || "—",
          supervisorName: user?.fullName || "—",
          supervisorRole: user?.signatureRole || "Director",
          fullName,
          dobUk: dob ? ukDate(dob) : "—",
          homeAddress: homeAddress || "—",
          phone: phone || "—",
          email: email || "—",
          nokName: nokName || "—",
          nokRelationship: nokRelationship || "—",
          nokPhone: nokPhone || "—",
          medical: medical || "—",
          employment,
          cisBlock,
          rightToWorkLine,
          niNumber: niNumber || "—",
          documentsBlock,
          cscsNumber: cscsNumber || "—",
          cscsExpiryUk: cscsExpiry ? ukDate(cscsExpiry) : "—",
          ppeBlock,
          ppeNotes: ppeNotes || "—",
          inductionBlock,
          inductionNotes: inductionNotes || "—",
          signDateUk: ukDate(signDate),
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("New Starter Pack generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    // Employer signature stamps the PDF
    const userWithSig = { ...(user || {}), signature: employerSignature || user?.signature };
    downloadPdf({ title: `New Starter Pack — ${fullName || "worker"} — ${ukDate(joinDate)}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-new-starter-pack">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Contractors</div>
          <h1 className="font-display text-4xl md:text-5xl">New Starter Pack</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="nsp-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="nsp-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 — SITE AND EMPLOYER DETAILS */}
      <Section title="Site and Employer Details" testId="nsp-section-1" icon={<UserPlus size={14}/>}>
        <Grid>
          <Inp label="Project Name or Company Name" value={project} onChange={setProject} testId="nsp-project" />
          <Inp label="Site Address" value={siteAddress} onChange={setSiteAddress} testId="nsp-site" />
          <Inp label="Date of Joining" type="date" value={joinDate} onChange={setJoinDate} testId="nsp-join-date" helper="Defaults to today" />
          <ReadOnly label="Supervisor or Manager Name" value={user?.fullName || "—"} testId="nsp-supervisor" />
        </Grid>
      </Section>

      {/* SECTION 2 — NEW STARTER DETAILS */}
      <Section title="New Starter Details" testId="nsp-section-2">
        <Grid>
          <Inp label="Full Name" value={fullName} onChange={setFullName} testId="nsp-full-name" />
          <Inp label="Date of Birth" type="date" value={dob} onChange={setDob} testId="nsp-dob" />
          <Inp label="Phone Number" value={phone} onChange={setPhone} testId="nsp-phone" />
          <Inp label="Email Address (optional)" value={email} onChange={setEmail} testId="nsp-email" />
          <Inp label="Next of Kin or Emergency Contact Name" value={nokName} onChange={setNokName} testId="nsp-nok-name" />
          <Inp label="Emergency Contact Relationship" value={nokRelationship} onChange={setNokRelationship} placeholder='e.g. "Wife", "Father", "Partner"' testId="nsp-nok-rel" />
          <Inp label="Emergency Contact Phone Number" value={nokPhone} onChange={setNokPhone} testId="nsp-nok-phone" />
        </Grid>
        <div className="mt-4">
          <Area label="Home Address" value={homeAddress} onChange={setHomeAddress} rows={2} testId="nsp-home-address" />
        </div>
        <div className="mt-4">
          <Area
            label="Any Medical Conditions We Should Know About? (optional)"
            value={medical}
            onChange={setMedical}
            testId="nsp-medical"
          />
          <div className="text-[10px] text-[#706D66] mt-1">This information is kept confidential and used only in an emergency.</div>
        </div>
      </Section>

      {/* SECTION 3 — EMPLOYMENT AND CIS STATUS */}
      <Section title="Employment and CIS Status" testId="nsp-section-3">
        <Grid>
          <Drop label="Employment Status" value={employment} onChange={setEmployment} options={EMPLOYMENT_STATUS_OPTIONS} testId="nsp-employment" />
          {isCis && (
            <>
              <Inp label="UTR Number" value={utr} onChange={setUtr} helper="Required for CIS verification" testId="nsp-utr" />
              <Drop label="CIS Verification Status" value={cisVerification} onChange={setCisVerification} options={CIS_VERIFICATION_OPTIONS} testId="nsp-cis-verification" />
            </>
          )}
          <YesNo label="Right to Work Checked?" value={rightToWorkChecked} onChange={setRightToWorkChecked} testId="nsp-right-to-work" />
          {rightToWorkChecked && (
            <Drop label="Right to Work Document" value={rightToWorkType} onChange={setRightToWorkType} options={RIGHT_TO_WORK_OPTIONS} testId="nsp-right-to-work-type" />
          )}
          <Inp label="National Insurance Number" value={niNumber} onChange={setNiNumber} testId="nsp-ni" />
        </Grid>
      </Section>

      {/* SECTION 4 — DOCUMENTS CHECKED */}
      <Section title="Documents Checked" testId="nsp-section-4" icon={<ShieldCheck size={14}/>}>
        <div className="text-[10px] text-[#706D66] mb-3 uppercase tracking-widest">Yes / No / Not Applicable</div>
        <Checklist items={DOCUMENTS} options={YNN_OPTIONS} state={documents} setState={setDocuments} prefix="nsp-doc" />
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Inp label="CSCS Card Number (optional)" value={cscsNumber} onChange={setCscsNumber} testId="nsp-cscs-number" />
          <Inp label="CSCS Card Expiry Date (optional)" type="date" value={cscsExpiry} onChange={setCscsExpiry} testId="nsp-cscs-expiry" />
        </div>
      </Section>

      {/* SECTION 5 — PPE ISSUED */}
      <Section title="Personal Protective Equipment Issued" testId="nsp-section-5">
        <div className="text-[10px] text-[#706D66] mb-3 uppercase tracking-widest">Yes / No / Not Required</div>
        <Checklist items={PPE_ITEMS} options={YNR_OPTIONS} state={ppe} setState={setPpe} prefix="nsp-ppe" />
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Inp label='Other PPE (free text)' value={ppeOther} onChange={setPpeOther} placeholder="Specify any other PPE issued" testId="nsp-ppe-other" />
          {ppeOther.trim() && (
            <Drop label="Other PPE Status" value={ppeOtherStatus} onChange={setPpeOtherStatus} options={YNR_OPTIONS} testId="nsp-ppe-other-status" />
          )}
        </div>
        <div className="mt-4">
          <Inp label="PPE Notes (optional)" value={ppeNotes} onChange={setPpeNotes} placeholder="Any additional PPE requirements for this site" testId="nsp-ppe-notes" />
        </div>
      </Section>

      {/* SECTION 6 — INDUCTION CHECKLIST */}
      <Section title="Site Induction Checklist" testId="nsp-section-6">
        <div className="text-[10px] text-[#706D66] mb-3 uppercase tracking-widest">Yes / No</div>
        <Checklist items={INDUCTION_ITEMS} options={YN_OPTIONS} state={induction} setState={setInduction} prefix="nsp-ind" />
        <div className="mt-4">
          <Area label="Additional Induction Notes (optional)" value={inductionNotes} onChange={setInductionNotes} testId="nsp-induction-notes" />
        </div>
      </Section>

      {/* SECTION 7 — SIGN OFF */}
      <Section title="Sign Off — Dual Signature" testId="nsp-section-7">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <ReadOnly label="Employer / Supervisor Name" value={user?.fullName || "—"} testId="nsp-employer-name" />
          <ReadOnly label="Position" value={user?.signatureRole || "Director"} testId="nsp-employer-role" />
          <ReadOnly label="Date" value={ukDate(signDate)} testId="nsp-sign-date" />
        </div>

        <div className="mb-5">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-2">Employer / Supervisor</div>
          <LiveSignatureBlock
            label="Employer or Supervisor Signature"
            subtitle="Your signature is stamped on the generated PDF"
            value={employerSignature}
            onChange={setEmployerSignature}
            savedSignature={user?.signature}
            testIdPrefix="nsp-employer-sig"
          />
        </div>

        <div>
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-2">New Starter</div>
          <div className="text-xs text-[#A19D94] mb-2">I confirm I have received, read, and understood the contents of this new starter pack.</div>
          <LiveSignatureBlock
            label="New Starter Signature"
            subtitle="New starter signs at the time of induction"
            value={starterSignature}
            onChange={setStarterSignature}
            savedSignature={null}
            testIdPrefix="nsp-starter-sig"
          />
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="nsp-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate New Starter Pack</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="nsp-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated pack</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`New Starter Pack — ${fullName} — ${ukDate(joinDate)}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="nsp-output">{result}</pre>
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
function Checklist({ items, options, state, setState, prefix }) {
  return (
    <div className="grid gap-2">
      {items.map((label) => {
        const id = slug(label);
        return (
          <div
            key={label}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded"
            style={{ background: "rgba(15,15,15,0.4)", border: "1px solid rgba(160,157,148,0.15)" }}
            data-testid={`${prefix}-${id}`}
          >
            <div className="text-sm text-[#F0EDE8] sm:flex-1">{label}</div>
            <div className="flex gap-2">
              {options.map((opt) => {
                const active = state[label] === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setState((curr) => ({ ...curr, [label]: opt }))}
                    className={`px-3 py-1.5 rounded text-xs ${active ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94] hover:text-[#F0EDE8]"}`}
                    data-testid={`${prefix}-${id}-${opt.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
