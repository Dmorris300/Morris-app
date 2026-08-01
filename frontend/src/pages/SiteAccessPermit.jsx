import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, ShieldAlert, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";
import AttachMedia, { recordDocMediaUsage } from "../components/AttachMedia";
import DraftSaveButton from "../components/DraftSaveButton";
import useToolDraft from "../hooks/useToolDraft";

const TOOL_ID   = "site-access-permit";
const TOOL_NAME = "Site Access Permit";
const TOOL_INFO =
  "Permit to work formally authorising a named person or team to access a controlled or restricted area of site. Identifies the hazards, states the controls, specifies the time window and is signed by both the issuing authority and the permit holder. Returned to the issuing authority on completion.";

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoNowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const isoLocalPlusHours = (h) => {
  const d = new Date();
  d.setHours(d.getHours() + h);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function ukDateTime(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
}

const PERMIT_TYPES = [
  "General site access",
  "Restricted zone access",
  "Rooftop or working at height access",
  "Plant room or mechanical room access",
  "Electrical intake or substation access",
  "Excavation or confined space access",
  "Hot works area access",
  "Asbestos controlled area access",
  "Other",
];

const HAZARDS = [
  { id: "h-electrical", label: "Live electrical equipment present" },
  { id: "h-asbestos",   label: "Asbestos containing materials present or suspected" },
  { id: "h-height",     label: "Working at height risk" },
  { id: "h-confined",   label: "Confined space" },
  { id: "h-overhead",   label: "Overhead obstructions" },
  { id: "h-plant",      label: "Moving plant or vehicles" },
  { id: "h-fragile",    label: "Fragile surfaces" },
  { id: "h-excavation", label: "Excavations or voids" },
  { id: "h-substances", label: "Hazardous substances" },
  { id: "h-others",     label: "Other trades working in same area" },
  { id: "h-lighting",   label: "Poor lighting" },
  { id: "h-access",     label: "Restricted access or egress" },
];

const PPE_OPTIONS = [
  "Hard hat",
  "Safety boots",
  "High visibility vest",
  "Safety glasses",
  "Gloves",
  "Dust mask or respirator",
  "Hearing protection",
  "Harness",
  "Other",
];

const YNN_OPTIONS = ["Yes", "No", "Not Applicable"];

export default function SiteAccessPermit() {
  const { user, refresh } = useAuth();

  // SECTION 1 — PERMIT DETAILS
  const [project, setProject]         = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [permitRef, setPermitRef]     = useState("SAP-001");
  const [issueDate, setIssueDate]     = useState(isoToday());
  const [permitType, setPermitType]   = useState("General site access");
  const [permitTypeOther, setPermitTypeOther] = useState("");

  // Photo Vault attachments
  const [attachedMedia, setAttachedMedia] = useState([]);

  // SECTION 2 — ACCESS DETAILS
  const [location, setLocation]       = useState("");
  const [validFrom, setValidFrom]     = useState(isoNowLocal());
  const [validTo, setValidTo]         = useState(isoLocalPlusHours(8));
  const [reason, setReason]           = useState("");

  // SECTION 3 — PERMIT HOLDER
  const [holderName, setHolderName]   = useState("");
  const [holderCompany, setHolderCompany] = useState("");
  const [holderRole, setHolderRole]   = useState("");
  const [partySize, setPartySize]     = useState("");

  // SECTION 4 — HAZARDS
  const [hazards, setHazards]         = useState(() => Object.fromEntries(HAZARDS.map((h) => [h.id, "Not Applicable"])));
  const [additionalHazards, setAdditionalHazards] = useState("");

  // SECTION 5 — CONDITIONS OF ENTRY
  const [ppe, setPpe]                 = useState([]);
  const [ppeOther, setPpeOther]       = useState("");
  const [controls, setControls]       = useState("");
  const [conditions, setConditions]   = useState("");
  const [emergencyProc, setEmergencyProc] = useState("");

  // SECTION 6 — SIGN OFF
  const [issuerSignature, setIssuerSignature] = useState("");
  const [holderSignature, setHolderSignature] = useState("");
  const signOffAt = isoNowLocal();

  // SECTION 7 — PERMIT CLOSURE
  const [worksCompleted, setWorksCompleted] = useState(false);
  const [areaSafe, setAreaSafe]             = useState(false);
  const [closedBy, setClosedBy]             = useState("");
  const [closedAt, setClosedAt]             = useState("");

  // Output
  const [infoOpen, setInfoOpen]         = useState(false);
  const [generating, setGenerating]     = useState(false);
  const [result, setResult]             = useState("");
  const [refNumber, setRefNumber]       = useState("");

  // ---------- Draft save/resume ----------
  const getDraftData = () => ({
    project, siteAddress, permitRef, issueDate, permitType, permitTypeOther,
    location, validFrom, validTo, reason, holderName, holderCompany,
    holderRole, partySize, hazards, additionalHazards, ppe, ppeOther,
    controls, conditions, emergencyProc, issuerSignature, holderSignature,
    worksCompleted, areaSafe, closedBy, closedAt, result, refNumber,
  });
  useToolDraft(TOOL_ID, (p) => {
    if (p.project !== undefined) setProject(p.project);
    if (p.siteAddress !== undefined) setSiteAddress(p.siteAddress);
    if (p.permitRef !== undefined) setPermitRef(p.permitRef);
    if (p.issueDate !== undefined) setIssueDate(p.issueDate);
    if (p.permitType !== undefined) setPermitType(p.permitType);
    if (p.permitTypeOther !== undefined) setPermitTypeOther(p.permitTypeOther);
    if (p.location !== undefined) setLocation(p.location);
    if (p.validFrom !== undefined) setValidFrom(p.validFrom);
    if (p.validTo !== undefined) setValidTo(p.validTo);
    if (p.reason !== undefined) setReason(p.reason);
    if (p.holderName !== undefined) setHolderName(p.holderName);
    if (p.holderCompany !== undefined) setHolderCompany(p.holderCompany);
    if (p.holderRole !== undefined) setHolderRole(p.holderRole);
    if (p.partySize !== undefined) setPartySize(p.partySize);
    if (p.hazards && typeof p.hazards === "object") setHazards(p.hazards);
    if (p.additionalHazards !== undefined) setAdditionalHazards(p.additionalHazards);
    if (Array.isArray(p.ppe)) setPpe(p.ppe);
    if (p.ppeOther !== undefined) setPpeOther(p.ppeOther);
    if (p.controls !== undefined) setControls(p.controls);
    if (p.conditions !== undefined) setConditions(p.conditions);
    if (p.emergencyProc !== undefined) setEmergencyProc(p.emergencyProc);
    if (p.issuerSignature !== undefined) setIssuerSignature(p.issuerSignature);
    if (p.holderSignature !== undefined) setHolderSignature(p.holderSignature);
    if (p.worksCompleted !== undefined) setWorksCompleted(p.worksCompleted);
    if (p.areaSafe !== undefined) setAreaSafe(p.areaSafe);
    if (p.closedBy !== undefined) setClosedBy(p.closedBy);
    if (p.closedAt !== undefined) setClosedAt(p.closedAt);
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

  const setHazard = (id, value) =>
    setHazards((curr) => ({ ...curr, [id]: value }));
  const togglePpe = (opt) => {
    setPpe((curr) => curr.includes(opt) ? curr.filter((x) => x !== opt) : [...curr, opt]);
  };

  const permitTypeResolved = permitType === "Other"
    ? (permitTypeOther.trim() || "Other")
    : permitType;

  const hazardsListYes = useMemo(
    () => HAZARDS.filter((h) => hazards[h.id] === "Yes").map((h) => h.label),
    [hazards]
  );

  const onGenerate = async () => {
    if (!project.trim())     { toast.error("Add the project name / site"); return; }
    if (!location.trim())    { toast.error("Add the exact location to be accessed"); return; }
    if (!holderName.trim())  { toast.error("Add the name of the permit holder"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const hazardsBlock = HAZARDS.map((h) =>
      `${h.label}: ${hazards[h.id] || "Not Applicable"}`
    ).join("\n   ");

    const ppeResolved = ppe.map((p) => p === "Other" ? (ppeOther.trim() || "Other") : p);
    const ppeBlock = ppeResolved.length > 0 ? ppeResolved.join(", ") : "None specified";

    const closureBlock = [
      `Works Completed: ${worksCompleted ? "Yes" : "No"}`,
      `Area Left Safe and Secure: ${areaSafe ? "Yes" : "No"}`,
      `Permit Closed by: ${closedBy || "—"}`,
      `Date and Time of Closure: ${closedAt ? ukDateTime(closedAt) : "—"}`,
      `Closing Signature: __________________________`,
    ].join("\n   ");

    const promptTemplate = `Produce a UK SITE ACCESS PERMIT (permit to work). Plain direct construction English. No padding. No banned consultant words. Full words only — never use abbreviations such as 'N/A', 'TBC', 'qty', '&', 'inc.', 'excl.', 'approx.' or 'etc.'. This document formally authorises a named person or team to access a controlled or restricted area of site.

1. HEADER — DOCUMENT REFERENCE: {permitRef}. DATE OF ISSUE: {issueDateUk} in DD/MM/YYYY format.

2. TITLE — exactly: 'SITE ACCESS PERMIT — {permitRef} — {issueDateUk}'.

3. PERMIT DETAILS — list on separate lines:
   Project Name / Site: {project}
   Site Address: {siteAddress}
   Permit Reference Number: {permitRef}
   Date of Issue: {issueDateUk}
   Permit Type: {permitTypeResolved}
   Issued by Company: {companyName}
   Trade: {trade}

4. ACCESS DETAILS — list on separate lines:
   Exact Location or Area to be Accessed: {location}
   Valid From: {validFromUk}
   Valid To: {validToUk}
   Reason for Access: {reason}

5. PERMIT HOLDER (Person Being Granted Access) — list on separate lines:
   Name of Permit Holder: {holderName}
   Company: {holderCompany}
   Trade or Role: {holderRole}
   Number of People in the Party: {partySize}

6. HAZARDS IN THIS AREA — print each hazard on its own line with the response supplied:
   {hazardsBlock}
   Additional Hazards: {additionalHazards}

7. CONDITIONS OF ENTRY — print on separate lines:
   PPE Required for Entry: {ppeBlock}
   Controls in Place: {controls}
   Specific Conditions of This Permit: {conditions}
   Emergency Procedure for This Area: {emergencyProc}

8. SIGN OFF — print two clearly separated signature blocks:

   PERMIT ISSUING AUTHORITY
   Issued by: {issuedByName}
   Position: {issuedByRole}
   Company: {companyName}
   Date and Time of Sign Off: {signOffAtUk}
   Signature: (auto-insert issuer signature if held; otherwise leave a signature line)

   PERMIT HOLDER
   Name: {holderName}
   I confirm I have read and understood the conditions of this permit.
   Date and Time of Sign Off: {signOffAtUk}
   Signature: (auto-insert holder signature if held; otherwise leave a signature line)

9. PERMIT CLOSURE — print as a clearly separated section at the bottom of the document with the heading 'PERMIT CLOSURE' in capitals. Then print on separate lines:
   {closureBlock}

10. FOOTER — print verbatim on its own line:
    This permit is only valid for the time period, area, and persons stated above. Any extension must be authorised in writing. This permit must be returned to the issuing authority on completion of works.

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD. Include time as HH:MM on a 24 hour clock where supplied.
- Never invent hazards, controls, names or facts. Use only the supplied values.
- Full words only — write every word out in full. Never abbreviate.
- Skip blank optional fields cleanly. Use '—' only where supplied.
- No banned words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct. Reads as a real permit to work from a competent issuing authority.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          permitRef,
          issueDateUk: ukDate(issueDate),
          project,
          siteAddress: siteAddress || "—",
          permitTypeResolved,
          companyName: user?.companyName || "—",
          trade: user?.trade || "—",
          location,
          validFromUk: ukDateTime(validFrom),
          validToUk: ukDateTime(validTo),
          reason: reason || "—",
          holderName,
          holderCompany: holderCompany || "—",
          holderRole: holderRole || "—",
          partySize: partySize || "—",
          hazardsBlock,
          additionalHazards: additionalHazards || "—",
          ppeBlock,
          controls: controls || "—",
          conditions: conditions || "—",
          emergencyProc: emergencyProc || "—",
          issuedByName: user?.fullName || "—",
          issuedByRole: user?.signatureRole || "Director",
          signOffAtUk: ukDateTime(signOffAt),
          closureBlock,
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Site Access Permit generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    // Use issuer signature on the PDF (saved signature stamps the document).
    const userWithSig = { ...(user || {}), signature: issuerSignature || user?.signature };
    downloadPdf({ title: `Site Access Permit — ${permitRef} — ${ukDate(issueDate)}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-site-access-permit">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Site</div>
          <h1 className="font-display text-4xl md:text-5xl">Site Access Permit</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="sap-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="sap-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 — PERMIT DETAILS */}
      <Section title="Permit Details" testId="sap-section-1" icon={<KeyRound size={14}/>}>
        <Grid>
          <Inp label="Project Name / Site" value={project} onChange={setProject} testId="sap-project" />
          <Inp label="Site Address" value={siteAddress} onChange={setSiteAddress} testId="sap-site" />
          <Inp label="Permit Reference Number" value={permitRef} onChange={setPermitRef} testId="sap-ref" helper="Auto-suggested next number — edit if needed" />
          <Inp label="Date of Issue" type="date" value={issueDate} onChange={setIssueDate} testId="sap-issue-date" />
          <Drop label="Permit Type" value={permitType} onChange={setPermitType} options={PERMIT_TYPES} testId="sap-type" />
          {permitType === "Other" && (
            <Inp label="Specify Other Permit Type" value={permitTypeOther} onChange={setPermitTypeOther} testId="sap-type-other" />
          )}
        </Grid>
      </Section>

      {/* SECTION 2 — ACCESS DETAILS */}
      <Section title="Access Details" testId="sap-section-2">
        <Grid>
          <div className="sm:col-span-2 lg:col-span-3">
            <Inp label="Exact Location or Area to be Accessed" value={location} onChange={setLocation} placeholder="Be specific about which area, floor, room or zone" testId="sap-location" />
          </div>
          <Inp label="Valid From" type="datetime-local" value={validFrom} onChange={setValidFrom} testId="sap-valid-from" />
          <Inp label="Valid To" type="datetime-local" value={validTo} onChange={setValidTo} testId="sap-valid-to" />
        </Grid>
        <div className="mt-4">
          <Area label="Reason for Access" value={reason} onChange={setReason} placeholder="What work is being carried out in this area?" testId="sap-reason" />
        </div>
      </Section>

      {/* SECTION 3 — PERMIT HOLDER */}
      <Section title="Permit Holder — Person Being Granted Access" testId="sap-section-3">
        <Grid>
          <Inp label="Name of Permit Holder" value={holderName} onChange={setHolderName} testId="sap-holder-name" />
          <Inp label="Company" value={holderCompany} onChange={setHolderCompany} testId="sap-holder-company" />
          <Inp label="Trade or Role" value={holderRole} onChange={setHolderRole} testId="sap-holder-role" />
          <Inp label="Number of People in the Party" type="number" value={partySize} onChange={setPartySize} testId="sap-party-size" />
        </Grid>
      </Section>

      {/* SECTION 4 — HAZARDS */}
      <Section title="Hazards in this Area" testId="sap-section-4" icon={<ShieldAlert size={14}/>}>
        <div className="text-[10px] text-[#706D66] mb-3 uppercase tracking-widest">Yes / No / Not Applicable</div>
        <div className="grid gap-2 mb-4">
          {HAZARDS.map((h) => (
            <div
              key={h.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded"
              style={{ background: "rgba(15,15,15,0.4)", border: "1px solid rgba(160,157,148,0.15)" }}
              data-testid={`sap-hazard-${h.id}`}
            >
              <div className="text-sm text-[#F0EDE8] sm:flex-1">{h.label}</div>
              <div className="flex gap-2">
                {YNN_OPTIONS.map((opt) => {
                  const active = hazards[h.id] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setHazard(h.id, opt)}
                      className={`px-3 py-1.5 rounded text-xs ${active ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94] hover:text-[#F0EDE8]"}`}
                      data-testid={`sap-hazard-${h.id}-${opt.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <Inp label="Additional Hazards (optional)" value={additionalHazards} onChange={setAdditionalHazards} testId="sap-additional-hazards" />

        {hazardsListYes.length > 0 && (
          <div
            className="mt-4 rounded p-4"
            style={{ background: "rgba(232,160,32,0.08)", border: "1px solid #E8A020" }}
            data-testid="sap-hazards-summary"
          >
            <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-2">Live hazard summary</div>
            <div className="text-sm text-[#F0EDE8]">
              {hazardsListYes.length} hazard{hazardsListYes.length === 1 ? "" : "s"} flagged Yes — controls must be in place before entry.
            </div>
          </div>
        )}
      </Section>

      {/* SECTION 5 — CONDITIONS OF ENTRY */}
      <Section title="Conditions of Entry" testId="sap-section-5">
        <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">PPE Required for Entry</div>
        <div className="flex flex-wrap gap-2 mb-4" data-testid="sap-ppe">
          {PPE_OPTIONS.map((opt) => {
            const active = ppe.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => togglePpe(opt)}
                className={`px-3 py-1.5 rounded text-xs ${active ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94] hover:text-[#F0EDE8]"}`}
                data-testid={`sap-ppe-${opt.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              >
                {opt}
              </button>
            );
          })}
        </div>
        {ppe.includes("Other") && (
          <div className="mb-4">
            <Inp label="Specify Other PPE" value={ppeOther} onChange={setPpeOther} testId="sap-ppe-other" />
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <Area label="Controls in Place" value={controls} onChange={setControls} placeholder="What controls are in place to manage the hazards above?" testId="sap-controls" />
          <Area label="Specific Conditions of This Permit" value={conditions} onChange={setConditions} placeholder="Any specific rules or restrictions that apply" testId="sap-conditions" />
        </div>
        <div className="mt-4">
          <Area label="Emergency Procedure for This Area" value={emergencyProc} onChange={setEmergencyProc} placeholder="Evacuation route, muster point, first aid location" testId="sap-emergency" />
        </div>
      </Section>

      {/* SECTION 6 — SIGN OFF */}
      <Section title="Sign Off — Dual Signature" testId="sap-section-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <ReadOnly label="Issued by (Name)" value={user?.fullName || "—"} testId="sap-issued-by" />
          <ReadOnly label="Position" value={user?.signatureRole || "Director"} testId="sap-issuer-role" />
          <ReadOnly label="Date and Time of Sign Off" value={ukDateTime(signOffAt)} testId="sap-signoff-at" />
        </div>

        <AttachMedia toolId="site-access-permit" toolLabel="Site Instruction / Access Permit" value={attachedMedia} onChange={setAttachedMedia} testIdPrefix="sap-media" />

        <div className="mb-5">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-2">Permit Issuing Authority</div>
          <LiveSignatureBlock
            label="Issuer Signature"
            subtitle="Your signature is stamped on the generated PDF"
            value={issuerSignature}
            onChange={setIssuerSignature}
            savedSignature={user?.signature}
            testIdPrefix="sap-issuer-sig"
          />
        </div>

        <div>
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-2">Permit Holder</div>
          <div className="text-xs text-[#A19D94] mb-2">I confirm I have read and understood the conditions of this permit.</div>
          <LiveSignatureBlock
            label="Permit Holder Signature"
            subtitle="Holder signs at the time of permit issue"
            value={holderSignature}
            onChange={setHolderSignature}
            savedSignature={null}
            testIdPrefix="sap-holder-sig"
          />
        </div>
      </Section>

      {/* SECTION 7 — PERMIT CLOSURE */}
      <Section title="Permit Closure" testId="sap-section-7">
        <div className="text-xs text-[#A19D94] mb-3">Complete this section when the works are finished and the area is left safe.</div>
        <Grid>
          <YesNo label="Works Completed?" value={worksCompleted} onChange={setWorksCompleted} testId="sap-works-completed" />
          <YesNo label="Area Left Safe and Secure?" value={areaSafe} onChange={setAreaSafe} testId="sap-area-safe" />
          <Inp label="Permit Closed by" value={closedBy} onChange={setClosedBy} testId="sap-closed-by" />
          <Inp label="Date and Time of Closure" type="datetime-local" value={closedAt} onChange={setClosedAt} testId="sap-closed-at" />
        </Grid>
        <div className="mt-3 text-xs text-[#706D66]" data-testid="sap-closing-signature-line">
          Closing Signature: __________________________
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="sap-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Site Access Permit</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="sap-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated permit</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Site Access Permit — ${permitRef}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="sap-output">{result}</pre>
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
