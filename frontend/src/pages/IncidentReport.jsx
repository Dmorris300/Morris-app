import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, AlertTriangle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";
import DraftSaveButton from "../components/DraftSaveButton";
import useToolDraft from "../hooks/useToolDraft";

const TOOL_ID   = "incident-report";
const TOOL_NAME = "Incident Report";
const TOOL_INFO =
  "Site Incident Report capturing every detail an HSE inspector, employers' liability claim or accident book audit needs. Built around RIDDOR 2013 reporting obligations. Records must be retained for a minimum of 3 years.";

const isoToday = () => new Date().toISOString().slice(0, 10);

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const INCIDENT_TYPES = [
  "Injury to worker",
  "Injury to member of public",
  "Near miss (no injury)",
  "Dangerous occurrence",
  "Property or equipment damage",
  "Environmental incident",
];

const INJURY_TYPES = [
  "Cut or laceration",
  "Fracture",
  "Burn",
  "Sprain or strain",
  "Head injury",
  "Eye injury",
  "Electric shock",
  "Chemical exposure",
  "Other",
];

const TIME_OFF_OPTIONS = [
  "None",
  "Less than 7 days",
  "7 days or more",
  "Unknown",
];

const CONTRIBUTING_FACTORS = [
  "Wet or slippery surface",
  "Poor lighting",
  "Unsecured materials",
  "Working at height",
  "Defective equipment or tools",
  "No PPE or inadequate PPE",
  "Lack of training or supervision",
  "Weather conditions",
  "Third party or another trade",
  "Other",
];

const RIDDOR_REPORTED_OPTIONS = ["Yes", "No", "Not required"];

const isInjuryType = (t) =>
  t === "Injury to worker" || t === "Injury to member of public";

export default function IncidentReport() {
  const { user, refresh } = useAuth();

  // SECTION 1 — INCIDENT DETAILS
  const [incidentDate, setIncidentDate] = useState(isoToday());
  const [incidentTime, setIncidentTime] = useState("");
  const [siteAddress, setSiteAddress]   = useState("");
  const [exactLocation, setExactLocation] = useState("");
  const [incidentType, setIncidentType] = useState("Injury to worker");

  // SECTION 2 — PERSON
  const [personName, setPersonName]     = useState("");
  const [personRole, setPersonRole]     = useState("");
  const [personEmployer, setPersonEmployer] = useState("");
  const [personContact, setPersonContact] = useState("");

  // SECTION 3 — INJURY DETAILS
  const [natureOfInjury, setNatureOfInjury]     = useState("Cut or laceration");
  const [natureOfInjuryOther, setNatureOfInjuryOther] = useState("");
  const [bodyPart, setBodyPart]                 = useState("");
  const [takenToHospital, setTakenToHospital]   = useState(false);
  const [timeOff, setTimeOff]                   = useState("None");

  // SECTION 4 — WHAT HAPPENED
  const [description, setDescription] = useState("");
  const [factors, setFactors]         = useState([]);
  const [factorOther, setFactorOther] = useState("");

  // SECTION 5 — RESPONSE
  const [firstAidGiven, setFirstAidGiven] = useState(false);
  const [firstAidDetails, setFirstAidDetails] = useState("");
  const [witnesses, setWitnesses]   = useState("");
  const [immediateActions, setImmediateActions] = useState("");
  const [correctiveActions, setCorrectiveActions] = useState("");

  // SECTION 6 — RIDDOR
  const [riddorReported, setRiddorReported] = useState("Not required");
  const [riddorRef, setRiddorRef]           = useState("");
  const [riddorReportedDate, setRiddorReportedDate] = useState("");

  // Output / sign-off
  const [infoOpen, setInfoOpen]         = useState(false);
  const [generating, setGenerating]     = useState(false);
  const [result, setResult]             = useState("");
  const [refNumber, setRefNumber]       = useState("");
  const [liveSignature, setLiveSignature] = useState("");

  const reportDate = isoToday();

  // ---------- Draft save/resume ----------
  const getDraftData = () => ({
    incidentDate, incidentTime, siteAddress, exactLocation, incidentType,
    personName, personRole, personEmployer, personContact, natureOfInjury,
    natureOfInjuryOther, bodyPart, takenToHospital, timeOff, description,
    factors, factorOther, firstAidGiven, firstAidDetails, witnesses,
    immediateActions, correctiveActions, riddorReported, riddorRef,
    riddorReportedDate, result, refNumber, liveSignature,
  });
  useToolDraft(TOOL_ID, (p) => {
    if (p.incidentDate !== undefined) setIncidentDate(p.incidentDate);
    if (p.incidentTime !== undefined) setIncidentTime(p.incidentTime);
    if (p.siteAddress !== undefined) setSiteAddress(p.siteAddress);
    if (p.exactLocation !== undefined) setExactLocation(p.exactLocation);
    if (p.incidentType !== undefined) setIncidentType(p.incidentType);
    if (p.personName !== undefined) setPersonName(p.personName);
    if (p.personRole !== undefined) setPersonRole(p.personRole);
    if (p.personEmployer !== undefined) setPersonEmployer(p.personEmployer);
    if (p.personContact !== undefined) setPersonContact(p.personContact);
    if (p.natureOfInjury !== undefined) setNatureOfInjury(p.natureOfInjury);
    if (p.natureOfInjuryOther !== undefined) setNatureOfInjuryOther(p.natureOfInjuryOther);
    if (p.bodyPart !== undefined) setBodyPart(p.bodyPart);
    if (p.takenToHospital !== undefined) setTakenToHospital(p.takenToHospital);
    if (p.timeOff !== undefined) setTimeOff(p.timeOff);
    if (p.description !== undefined) setDescription(p.description);
    if (Array.isArray(p.factors)) setFactors(p.factors);
    if (p.factorOther !== undefined) setFactorOther(p.factorOther);
    if (p.firstAidGiven !== undefined) setFirstAidGiven(p.firstAidGiven);
    if (p.firstAidDetails !== undefined) setFirstAidDetails(p.firstAidDetails);
    if (p.witnesses !== undefined) setWitnesses(p.witnesses);
    if (p.immediateActions !== undefined) setImmediateActions(p.immediateActions);
    if (p.correctiveActions !== undefined) setCorrectiveActions(p.correctiveActions);
    if (p.riddorReported !== undefined) setRiddorReported(p.riddorReported);
    if (p.riddorRef !== undefined) setRiddorRef(p.riddorRef);
    if (p.riddorReportedDate !== undefined) setRiddorReportedDate(p.riddorReportedDate);
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

  const toggleFactor = (opt) => {
    setFactors((curr) => {
      const has = curr.includes(opt);
      return has ? curr.filter((x) => x !== opt) : [...curr, opt];
    });
  };

  // RIDDOR live outcome calculation (simple)
  const riddorOutcome = useMemo(() => {
    // Question tree:
    // 1. Fatal -> immediate, call HSE
    // 2. Hospitalised with specified injury -> 10 days online
    // 3. Off work 7+ days -> 15 days
    // 4. Member of public to hospital -> 10 days
    // 5. None -> not required
    const fatal = incidentType === "Dangerous occurrence" && false; // We don't have an explicit fatal question; rely on hospital + specified injury below
    // Use signals:
    const memberPublic = incidentType === "Injury to member of public" && takenToHospital;
    const specified = (incidentType === "Injury to worker") && takenToHospital &&
      ["Fracture", "Burn", "Eye injury", "Electric shock", "Chemical exposure", "Head injury"].includes(natureOfInjury);
    const offWork7 = timeOff === "7 days or more";

    if (fatal) return { level: "fatal", title: "Report immediately", action: "Call the HSE on 0345 300 9923 without delay.", color: "red" };
    if (specified) return { level: "specified", title: "Report within 10 days", action: "Submit a report at hse.gov.uk/riddor within 10 days. This is a specified injury under RIDDOR 2013.", color: "amber" };
    if (memberPublic) return { level: "public", title: "Report within 10 days", action: "A member of the public was taken to hospital. Submit a report at hse.gov.uk/riddor within 10 days.", color: "amber" };
    if (offWork7) return { level: "over7", title: "Report within 15 days", action: "The injured worker is likely off work 7 or more consecutive days. Submit a report at hse.gov.uk/riddor within 15 days.", color: "amber" };
    return { level: "none", title: "No RIDDOR report required", action: "Keep this record on file for a minimum of 3 years.", color: "green" };
  }, [incidentType, takenToHospital, natureOfInjury, timeOff]);

  const onGenerate = async () => {
    if (!siteAddress.trim())      { toast.error("Add the site name and address"); return; }
    if (!description.trim())      { toast.error("Add the description of the incident"); return; }
    if (isInjuryType(incidentType) && !personName.trim()) {
      toast.error("Add the name of the injured or involved person"); return;
    }

    setGenerating(true); setResult(""); setRefNumber("");

    const natureFinal = natureOfInjury === "Other"
      ? (natureOfInjuryOther.trim() || "Other")
      : natureOfInjury;

    const factorsFinal = factors.map((f) => f === "Other" ? (factorOther.trim() || "Other") : f);
    const factorsBlock = factorsFinal.length > 0 ? factorsFinal.join(", ") : "None identified";

    const injuryBlock = isInjuryType(incidentType)
      ? [
          `Nature of Injury: ${natureFinal}`,
          `Body Part Affected: ${bodyPart || "—"}`,
          `Taken to Hospital: ${takenToHospital ? "Yes" : "No"}`,
          `Expected Time Off Work: ${timeOff}`,
        ].join("\n   ")
      : "Not applicable — incident did not involve an injury to a person.";

    const responseBlock = [
      `First Aid Given: ${firstAidGiven ? "Yes" : "No"}`,
      firstAidGiven ? `First Aid Details: ${firstAidDetails || "—"}` : null,
      `Witnesses: ${witnesses || "—"}`,
      `Immediate Actions Taken: ${immediateActions || "—"}`,
      `Further Corrective Actions Required: ${correctiveActions || "—"}`,
    ].filter(Boolean).join("\n   ");

    const riddorOutcomeText = riddorOutcome.title + " — " + riddorOutcome.action;
    const riddorBlock = [
      `RIDDOR Outcome (system check): ${riddorOutcomeText}`,
      `Was this reported to the HSE under RIDDOR: ${riddorReported}`,
      riddorReported === "Yes" ? `RIDDOR Reference Number: ${riddorRef || "—"}` : null,
      riddorReported === "Yes" && riddorReportedDate ? `Date Reported to HSE: ${ukDate(riddorReportedDate)}` : null,
    ].filter(Boolean).join("\n   ");

    const promptTemplate = `Produce a UK SITE INCIDENT REPORT. Plain direct construction English. No padding. No banned consultant words. Full words only — never use abbreviations such as 'N/A', 'TBC', 'qty', '&', 'inc.', 'excl.', 'approx.' or 'etc.'. This document must support HSE investigation, employers' liability claims and the site accident book. Records must be retained for a minimum of 3 years.

1. HEADER — DOCUMENT REFERENCE: incident report. DATE OF REPORT: {reportDateUk} in DD/MM/YYYY format.

2. TITLE — exactly: 'SITE INCIDENT REPORT — {incidentDateUk}'.

3. INCIDENT DETAILS — list on separate lines:
   Date of Incident: {incidentDateUk}
   Time of Incident: {incidentTime}
   Site Name and Address: {siteAddress}
   Exact Location on Site: {exactLocation}
   Incident Type: {incidentType}
   Reported by Company: {companyName}
   Trade: {trade}

4. PERSON OR PERSONS INVOLVED — list on separate lines:
   Name: {personName}
   Role or Trade: {personRole}
   Employed by: {personEmployer}
   Contact Number: {personContact}

5. INJURY DETAILS — print on separate lines (use the values supplied — never recalculate):
   {injuryBlock}

6. WHAT HAPPENED — print the description of the incident verbatim as a paragraph, then list contributing factors on a separate line:
   Description of Incident: {description}
   Contributing Factors: {factorsBlock}

7. RESPONSE — print on separate lines:
   {responseBlock}

8. RIDDOR OUTCOME — print prominently:
   {riddorBlock}

9. REPORT COMPLETED BY — sign-off block:
   Completed by: {completedByName}
   Role: {completedByRole}
   Date of Report: {reportDateUk}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

10. FOOTER — print verbatim on its own line:
    This report must be retained for a minimum of 3 years. Reportable incidents must be submitted to the HSE via hse.gov.uk/riddor within the required timeframe.

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Never invent details, injuries, names or facts. Use only the supplied values.
- Full words only — write every word out in full. Never abbreviate.
- Skip blank optional fields cleanly. Use '—' only where supplied.
- No banned words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct. Reads as a real contemporaneous incident report from a site to an HSE inspector or insurer.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          reportDateUk: ukDate(reportDate),
          incidentDateUk: ukDate(incidentDate),
          incidentTime: incidentTime || "—",
          siteAddress,
          exactLocation: exactLocation || "—",
          incidentType,
          companyName: user?.companyName || "—",
          trade: user?.trade || "—",
          personName: personName || "—",
          personRole: personRole || "—",
          personEmployer: personEmployer || "—",
          personContact: personContact || "—",
          injuryBlock,
          description,
          factorsBlock,
          responseBlock,
          riddorBlock,
          completedByName: user?.fullName || "—",
          completedByRole: user?.signatureRole || "Director",
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Incident Report generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Site Incident Report — ${ukDate(incidentDate)}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  const outcomeColor = {
    red:   { bg: "rgba(220,60,60,0.10)", border: "#DC3C3C", text: "#FF8A8A" },
    amber: { bg: "rgba(232,160,32,0.10)", border: "#E8A020", text: "#E8A020" },
    green: { bg: "rgba(60,180,100,0.08)", border: "#3CB464", text: "#7FE0A0" },
  }[riddorOutcome.color];

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-incident-report">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Site</div>
          <h1 className="font-display text-4xl md:text-5xl">Incident Report</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="ir-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="ir-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
          <DraftSaveButton tool={{ id: TOOL_ID, name: TOOL_NAME }} getDraftData={getDraftData} />
        </div>
      </div>

      {/* RIDDOR WARNING BANNER */}
      <div
        className="rounded p-5 mb-5 flex gap-3"
        style={{
          background: "rgba(232,160,32,0.10)",
          border: "1px solid #E8A020",
        }}
        data-testid="ir-riddor-warning"
      >
        <AlertTriangle size={22} className="text-[#E8A020] shrink-0 mt-0.5" />
        <div className="text-sm leading-relaxed">
          <div className="font-bold text-[#E8A020] uppercase tracking-wide mb-1">RIDDOR 2013 Warning</div>
          <div className="text-[#F0EDE8]">
            Certain incidents <strong>must</strong> be reported to the HSE under RIDDOR 2013. See the RIDDOR checker below to find out if this incident requires reporting. Failure to report can result in prosecution.
          </div>
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

      {/* SECTION 1 — INCIDENT DETAILS */}
      <Section title="Incident Details" testId="ir-section-1">
        <Grid>
          <Inp label="Date of Incident" type="date" value={incidentDate} onChange={setIncidentDate} testId="ir-date" helper="Defaults to today" />
          <Inp label="Time of Incident" type="time" value={incidentTime} onChange={setIncidentTime} testId="ir-time" />
          <Inp label="Site Name and Address" value={siteAddress} onChange={setSiteAddress} testId="ir-site" />
          <Inp label="Exact Location on Site" value={exactLocation} onChange={setExactLocation} placeholder='e.g. "First floor risers, Plot 14"' testId="ir-location" />
          <Drop label="Incident Type" value={incidentType} onChange={setIncidentType} options={INCIDENT_TYPES} testId="ir-type" />
        </Grid>
      </Section>

      {/* SECTION 2 — PERSON */}
      <Section title="Person or Persons Involved" testId="ir-section-2">
        <Grid>
          <Inp label="Name of Injured or Involved Person" value={personName} onChange={setPersonName} testId="ir-person-name" />
          <Inp label="Their Role or Trade" value={personRole} onChange={setPersonRole} testId="ir-person-role" />
          <Inp label="Employed by" value={personEmployer} onChange={setPersonEmployer} testId="ir-person-employer" />
          <Inp label="Contact Number" value={personContact} onChange={setPersonContact} testId="ir-person-contact" />
        </Grid>
      </Section>

      {/* SECTION 3 — INJURY DETAILS — conditional */}
      {isInjuryType(incidentType) && (
        <Section title="Injury Details" testId="ir-section-3">
          <Grid>
            <Drop label="Nature of Injury" value={natureOfInjury} onChange={setNatureOfInjury} options={INJURY_TYPES} testId="ir-injury-nature" />
            {natureOfInjury === "Other" && (
              <Inp label="Specify Other Nature of Injury" value={natureOfInjuryOther} onChange={setNatureOfInjuryOther} testId="ir-injury-nature-other" />
            )}
            <Inp label="Body Part Affected" value={bodyPart} onChange={setBodyPart} testId="ir-body-part" />
            <YesNo label="Was the person taken to hospital?" value={takenToHospital} onChange={setTakenToHospital} testId="ir-hospital" />
            <Drop label="Expected Time Off Work" value={timeOff} onChange={setTimeOff} options={TIME_OFF_OPTIONS} testId="ir-time-off" />
          </Grid>
        </Section>
      )}

      {/* SECTION 4 — WHAT HAPPENED */}
      <Section title="What Happened" testId="ir-section-4">
        <Area
          label="Description of Incident"
          value={description}
          onChange={setDescription}
          rows={5}
          placeholder="Describe exactly what happened — chronologically and factually, without speculation"
          testId="ir-description"
        />
        <div className="mt-4">
          <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">Contributing Factors</div>
          <div className="flex flex-wrap gap-2" data-testid="ir-factors">
            {CONTRIBUTING_FACTORS.map((opt) => {
              const active = factors.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleFactor(opt)}
                  className={`px-3 py-1.5 rounded text-xs ${active ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94] hover:text-[#F0EDE8]"}`}
                  data-testid={`ir-factor-${opt.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {factors.includes("Other") && (
            <div className="mt-3">
              <Inp label="Specify Other Contributing Factor" value={factorOther} onChange={setFactorOther} testId="ir-factor-other" />
            </div>
          )}
        </div>
      </Section>

      {/* SECTION 5 — RESPONSE */}
      <Section title="Response" testId="ir-section-5">
        <Grid>
          <YesNo label="First Aid Given?" value={firstAidGiven} onChange={setFirstAidGiven} testId="ir-first-aid" />
          {firstAidGiven && (
            <Inp label="First Aid Details" value={firstAidDetails} onChange={setFirstAidDetails} testId="ir-first-aid-details" />
          )}
        </Grid>
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Area label="Witnesses (optional)" value={witnesses} onChange={setWitnesses} placeholder="Names and contact details of any witnesses" testId="ir-witnesses" />
          <Area label="Immediate Actions Taken" value={immediateActions} onChange={setImmediateActions} placeholder="What was done at the time — first aid, isolation, made safe" testId="ir-immediate" />
        </div>
        <div className="mt-4">
          <Area label="Further Corrective Actions Required" value={correctiveActions} onChange={setCorrectiveActions} placeholder="What needs to happen next to prevent recurrence" testId="ir-corrective" />
        </div>
      </Section>

      {/* SECTION 6 — RIDDOR CHECKER */}
      <Section title="RIDDOR Checker" testId="ir-section-6" icon={<ShieldAlert size={14}/>}>
        <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Do you need to report this to the HSE?</div>
        <div className="grid gap-2 mb-5 text-sm text-[#F0EDE8]">
          <RuleLine text="Was anyone killed?" outcome="YES: Report immediately. Call HSE on 0345 300 9923." />
          <RuleLine text="Was a worker hospitalised with a specified injury (fracture, amputation, loss of consciousness, etc.)?" outcome="YES: Report within 10 days at hse.gov.uk/riddor." />
          <RuleLine text="Is the injured worker likely to be off work for 7 or more consecutive days?" outcome="YES: Report within 15 days." />
          <RuleLine text="Was a member of the public injured and taken to hospital?" outcome="YES: Report within 10 days." />
          <RuleLine text="None of the above" outcome="No RIDDOR report required — keep this record on file for 3 years." />
        </div>

        <div
          className="rounded p-4 mb-5"
          style={{ background: outcomeColor.bg, border: `1px solid ${outcomeColor.border}` }}
          data-testid="ir-riddor-outcome"
        >
          <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: outcomeColor.text }}>
            Based on the details above
          </div>
          <div className="font-display text-2xl" style={{ color: outcomeColor.text }} data-testid="ir-riddor-outcome-title">
            {riddorOutcome.title}
          </div>
          <div className="text-sm text-[#F0EDE8] mt-2" data-testid="ir-riddor-outcome-action">
            {riddorOutcome.action}
          </div>
        </div>

        <Grid>
          <Drop label="Was this reported to the HSE under RIDDOR?" value={riddorReported} onChange={setRiddorReported} options={RIDDOR_REPORTED_OPTIONS} testId="ir-riddor-reported" />
          {riddorReported === "Yes" && (
            <>
              <Inp label="RIDDOR Reference Number" value={riddorRef} onChange={setRiddorRef} testId="ir-riddor-ref" />
              <Inp label="Date Reported to HSE" type="date" value={riddorReportedDate} onChange={setRiddorReportedDate} testId="ir-riddor-date" />
            </>
          )}
        </Grid>
      </Section>

      {/* SECTION 7 — SIGN OFF */}
      <Section title="Report Completed by — Sign Off" testId="ir-section-7">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <ReadOnly label="Report completed by" value={user?.fullName || "—"} testId="ir-completed-by" />
          <ReadOnly label="Role" value={user?.signatureRole || "Director"} testId="ir-completed-role" />
          <ReadOnly label="Date of Report" value={ukDate(reportDate)} testId="ir-report-date" />
        </div>
        <LiveSignatureBlock
          label="Signature"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="ir-sig"
        />
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="ir-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Incident Report</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="ir-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated report</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Site Incident Report — ${ukDate(incidentDate)}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="ir-output">{result}</pre>
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
function RuleLine({ text, outcome }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:gap-3 p-3 rounded" style={{ background: "rgba(15,15,15,0.4)", border: "1px solid rgba(160,157,148,0.15)" }}>
      <div className="text-[#F0EDE8] sm:flex-1">{text}</div>
      <div className="text-[#E8A020] text-xs sm:text-sm mt-1 sm:mt-0 sm:text-right sm:max-w-xs">{outcome}</div>
    </div>
  );
}
