import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft, Download, Info, Star, X, Plus, Trash2, ShieldAlert, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import LiveSignatureBlock from "../components/LiveSignatureBlock";
import {
  downloadRamsPdf,
  ratingFromScore,
  composeHazardLine,
  composeCoshhLine,
} from "../lib/rams-pdf";
import { fireToolNotification } from "../lib/notification-triggers";
import { saveToolData } from "../lib/tool-persistence";

const TOOL_ID   = "rams";
const TOOL_NAME = "RAMS";
const TOOL_INFO =
  "Risk Assessment and Method Statement. Every hazard captured with structured fields, every PPE and equipment suggestion cross-checked against the hazards. Plain construction English throughout — no legal padding.";

const isoToday = () => new Date().toISOString().slice(0, 10);

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return iso || "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const EXPOSURE_ROUTES = [
  "Inhalation",
  "Skin Contact",
  "Eye Contact",
  "Ingestion",
  "Impact/Strike",
  "Fall",
  "Manual Strain",
  "Noise",
  "Other",
];

const PERSONS_OPTIONS = [
  "Site operatives",
  "Site supervisor",
  "Other trades",
  "Members of the public",
  "Visitors",
];

const TRAINING_OPTIONS = [
  "CSCS",
  "Manual Handling",
  "Asbestos Awareness",
  "PASMA",
  "IPAF",
  "Power Tool training",
  "First Aid at Work",
];

const PPE_OPTIONS = [
  "Hard hat",
  "Safety boots",
  "Hi-vis vest",
  "Safety glasses",
  "Gloves (cut-resistant)",
  "Gloves (chemical)",
  "RPE — dust mask or respirator",
  "Hearing protection",
  "Harness and lanyard",
  "Knee pads",
];

const COMMON_EQUIPMENT = [
  "CAT & Genny (cable avoidance)",
  "Step ladder",
  "Mobile tower scaffold",
  "MEWP",
  "Cordless drill",
  "SDS drill",
  "Circular saw with extraction",
  "Hand tools",
];

// Auto-suggestion rules: hazard pattern -> PPE / equipment label.
const PPE_RULES = [
  { test: (h) => h.exposureRoute === "Inhalation" || /dust|cutting|drilling|grinding/i.test(`${h.hazard} ${h.activity}`), ppe: "RPE — dust mask or respirator", reason: "Dust or cutting in the air" },
  { test: (h) => h.exposureRoute === "Noise" || /grinder|breaker|saw|impact/i.test(`${h.hazard} ${h.activity}`), ppe: "Hearing protection", reason: "Loud tools or machinery" },
  { test: (h) => /handling|lift|carry|load/i.test(`${h.hazard} ${h.activity}`) || h.exposureRoute === "Manual Strain", ppe: "Gloves (cut-resistant)", reason: "Moving materials by hand" },
  { test: (h) => /chemical|adhesive|solvent|sealant|paint/i.test(`${h.hazard} ${h.activity}`) || h.exposureRoute === "Skin Contact", ppe: "Gloves (chemical)", reason: "Chemicals or adhesives" },
  { test: (h) => h.exposureRoute === "Eye Contact" || /dust|cutting|grinding|debris/i.test(`${h.hazard} ${h.activity}`), ppe: "Safety glasses", reason: "Risk of debris in eyes" },
  { test: (h) => h.exposureRoute === "Fall" || /height|edge|roof|opening/i.test(`${h.hazard} ${h.activity}`), ppe: "Harness and lanyard", reason: "Work at height" },
];

const EQUIP_RULES = [
  { test: (h) => /struck by hidden services|underground|buried|cable/i.test(`${h.hazard} ${h.activity}`), equip: "CAT & Genny (cable avoidance)" },
  { test: (h) => h.exposureRoute === "Fall" || /height|edge|roof/i.test(`${h.hazard} ${h.activity}`), equip: "Mobile tower scaffold" },
  { test: (h) => /cutting/i.test(`${h.hazard} ${h.activity}`), equip: "Circular saw with extraction" },
];

function newHazard() {
  return {
    id: crypto.randomUUID(),
    exposureRoute: "Inhalation",
    hazard: "",
    activity: "",
    personsAffected: ["Site operatives"],
    likelihoodBefore: 3,
    severityBefore: 3,
    likelihoodAfter: 1,
    severityAfter: 3, // defaults to severityBefore
    severityManualOverride: false,
    controls: "",
  };
}

function newCoshh() {
  return {
    id: crypto.randomUUID(),
    exposureRoute: "Inhalation",
    substance: "",
    activity: "",
    controls: "",
    licensedSeparate: false,
  };
}

export default function Rams() {
  const { user, refresh } = useAuth();

  // SECTION 1 — DOCUMENT CONTROL
  const [documentRef, setDocumentRef]                   = useState("");
  const [documentRevision, setDocumentRevision]         = useState("Rev 1");
  const [clientName, setClientName]                     = useState("");
  const [principalContractor, setPrincipalContractor]   = useState("");
  const [siteAddress, setSiteAddress]                   = useState("");
  const [supervisorName, setSupervisorName]             = useState("");

  // SECTION 2 — REVISION HISTORY
  const [revisionHistory, setRevisionHistory] = useState([
    { rev: "Rev 1", date: isoToday(), description: "Initial issue", author: "" },
  ]);

  // SECTION 3 — SCOPE OF WORKS
  const [task, setTask]                                 = useState("");
  const [estimatedDuration, setEstimatedDuration]       = useState("");
  const [operativesCount, setOperativesCount]           = useState(2);
  const [workAtHeight, setWorkAtHeight]                 = useState(false);
  const [overallRiskRating, setOverallRiskRating]       = useState("Medium");

  // SECTION 5 — PERSONS AT RISK
  const [personsAtRisk, setPersonsAtRisk] = useState(["Site operatives"]);

  // SECTION 6 — TRAINING AND COMPETENCE
  const [training, setTraining] = useState(["CSCS"]);

  // SECTION 9 — HAZARDS
  const [hazards, setHazards] = useState([newHazard()]);

  // SECTION 10 — PPE
  const [ppe, setPpe] = useState([]);
  const [ppeOverrideNote, setPpeOverrideNote] = useState("");

  // SECTION 11 — EQUIPMENT
  const [equipment, setEquipment] = useState([]);

  // SECTION 12 — COSHH
  const [coshh, setCoshh] = useState([]);

  // SECTION 13 — PERMITS / NOT COVERED
  const [notCovered, setNotCovered] = useState("Hot works, confined space, live electrical work, asbestos disturbance");

  // SECTION 14 — SEQUENCE
  const [sequence, setSequence] = useState("");

  // SECTIONS 16-18 — WELFARE / ENVIRONMENTAL / EMERGENCY
  const [welfareToilets, setWelfareToilets]     = useState("");
  const [welfareWashing, setWelfareWashing]     = useState("");
  const [welfareRest, setWelfareRest]           = useState("");
  const [welfareWater, setWelfareWater]         = useState("");
  const [envWaste, setEnvWaste]                 = useState("");
  const [envDustNoise, setEnvDustNoise]         = useState("");
  const [envHours, setEnvHours]                 = useState("");
  const [envSpills, setEnvSpills]               = useState("");
  const [firstAiderName, setFirstAiderName]     = useState("");
  const [assemblyPoint, setAssemblyPoint]       = useState("");
  const [emergencyContacts, setEmergencyContacts] = useState("");

  // SIGN-OFF
  const [liveSignature, setLiveSignature] = useState("");

  // UI
  const [infoOpen, setInfoOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

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

  // --- Hazard mutators ---
  const updateHazard = (id, field, value) =>
    setHazards((hs) => hs.map((h) => (h.id === id ? { ...h, [field]: value } : h)));
  const updateHazardSeverityAfter = (id, value) => {
    setHazards((hs) => hs.map((h) => {
      if (h.id !== id) return h;
      const before = Number(h.severityBefore) || 0;
      const newV = Number(value) || 0;
      if (newV < before && !h.severityManualOverride) {
        // Severity should rarely drop unless a control truly removes that consequence.
        const ok = window.confirm(
          "Are you sure you want to lower the severity after controls? Only do this if the control genuinely removes that consequence (e.g. an isolation that removes the electricity)."
        );
        if (!ok) return h;
        return { ...h, severityAfter: newV, severityManualOverride: true };
      }
      return { ...h, severityAfter: newV };
    }));
  };
  const addHazard    = () => setHazards((hs) => [...hs, newHazard()]);
  const removeHazard = (id) => setHazards((hs) => hs.filter((h) => h.id !== id));

  // --- COSHH mutators ---
  const updateCoshh = (id, field, value) =>
    setCoshh((cs) => cs.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  const addCoshh    = () => setCoshh((cs) => [...cs, newCoshh()]);
  const removeCoshh = (id) => setCoshh((cs) => cs.filter((c) => c.id !== id));

  // --- Revision mutators ---
  const updateRevision = (i, field, value) =>
    setRevisionHistory((rs) => rs.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  const addRevision = () => setRevisionHistory((rs) => [
    ...rs,
    { rev: `Rev ${rs.length + 1}`, date: isoToday(), description: "", author: user?.fullName || "" },
  ]);
  const removeRevision = (i) => setRevisionHistory((rs) => rs.filter((_, idx) => idx !== i));

  // --- Auto-suggestion logic ---
  const ppeSuggestions = useMemo(() => {
    const seen = new Map();
    hazards.forEach((h) => {
      PPE_RULES.forEach((r) => {
        if (r.test(h) && !ppe.includes(r.ppe)) {
          seen.set(r.ppe, r.reason);
        }
      });
    });
    return Array.from(seen.entries()).map(([item, reason]) => ({ item, reason }));
  }, [hazards, ppe]);

  const equipSuggestions = useMemo(() => {
    const seen = new Set();
    hazards.forEach((h) => {
      EQUIP_RULES.forEach((r) => {
        if (r.test(h) && !equipment.includes(r.equip)) seen.add(r.equip);
      });
    });
    return Array.from(seen);
  }, [hazards, equipment]);

  // Mismatch detection — required PPE missing without override note.
  const ppeMismatches = useMemo(() => {
    return ppeSuggestions.map((s) => s.item);
  }, [ppeSuggestions]);

  const togglePpe = (item) => setPpe((curr) => curr.includes(item) ? curr.filter((x) => x !== item) : [...curr, item]);
  const toggleEquip = (item) => setEquipment((curr) => curr.includes(item) ? curr.filter((x) => x !== item) : [...curr, item]);
  const togglePerson = (item) => setPersonsAtRisk((curr) => curr.includes(item) ? curr.filter((x) => x !== item) : [...curr, item]);
  const toggleTraining = (item) => setTraining((curr) => curr.includes(item) ? curr.filter((x) => x !== item) : [...curr, item]);
  const toggleHazardPerson = (id, item) => updateHazard(id, "personsAffected",
    (hazards.find((h) => h.id === id)?.personsAffected || []).includes(item)
      ? hazards.find((h) => h.id === id).personsAffected.filter((x) => x !== item)
      : [...(hazards.find((h) => h.id === id)?.personsAffected || []), item]
  );

  // --- Export ---
  const onDownload = async () => {
    // SIGN-OFF BUG FIX: never write placeholder text into the PDF.
    // If anything required for the prepared-by block is missing, BLOCK export and
    // surface what's missing in the UI.
    const missing = [];
    if (!user?.fullName)        missing.push("Full name (Profile)");
    if (!user?.signatureRole)   missing.push("Role (Profile)");
    if (!user?.signature && !liveSignature) missing.push("Signature (Profile or this page)");
    if (!task.trim())           missing.push("Task (Scope of Works)");
    if (hazards.length === 0 || !hazards.some((h) => h.hazard.trim() && h.activity.trim())) {
      missing.push("At least one fully entered hazard (Hazard or substance + Activity)");
    }
    // Hazard entries must have all 3 required fields each
    const incompleteHazard = hazards.find((h) =>
      !h.exposureRoute || !h.hazard.trim() || !h.activity.trim()
    );
    if (incompleteHazard) missing.push("Every hazard must have Exposure route + Hazard + Activity");

    // Hazards must not be a single word per requirement
    const oneWordHazard = hazards.find((h) =>
      h.hazard.trim() && !h.activity.trim()
    );
    if (oneWordHazard) missing.push("Each hazard must include an Activity that causes the exposure");

    // COSHH entries must have all 3 required fields each
    const incompleteCoshh = coshh.find((c) =>
      !c.exposureRoute || !c.substance.trim() || !c.activity.trim()
    );
    if (incompleteCoshh) missing.push("Every COSHH entry must have Exposure route + Substance + Activity");

    // PPE mismatch guard
    if (ppeMismatches.length > 0 && !ppeOverrideNote.trim()) {
      missing.push(`Missing PPE for current hazards: ${ppeMismatches.join(", ")} — either tick the PPE or add an override note`);
    }

    if (missing.length > 0) {
      toast.error("Cannot export — please complete the highlighted fields first.");
      // Render the missing items into a single user-visible banner above the export button.
      window.dispatchEvent(new CustomEvent("morris:rams-missing", { detail: missing }));
      return;
    }

    setGenerating(true);
    try {
      const data = {
        documentRef:         documentRef || generateDefaultRef(),
        documentRevision,
        clientName,
        principalContractor,
        siteAddress,
        supervisorName,
        revisionHistory,
        task,
        estimatedDuration,
        operativesCount,
        workAtHeight,
        overallRiskRating,
        personsAtRisk,
        training,
        hazards,
        ppe,
        ppeOverrideNote,
        equipment,
        coshh,
        notCovered,
        sequence,
        welfareToilets, welfareWashing, welfareRest, welfareWater,
        envWaste, envDustNoise, envHours, envSpills,
        firstAiderName, assemblyPoint, emergencyContacts,
      };
      const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
      downloadRamsPdf({ data, user: userWithSig });
      // Persist + fire notification.
      saveToolData(TOOL_ID, [{ id: crypto.randomUUID(), title: task, reviewDueDate: addYearsIso(1) }]);
      fireToolNotification({ toolId: TOOL_ID, toolName: TOOL_NAME });
      toast.success("RAMS PDF exported.");
    } catch (err) {
      console.error(err);
      toast.error("Could not export the RAMS PDF.");
    } finally {
      setGenerating(false);
    }
  };

  // ---- UI building blocks (uses the same Inp/Drop/Area style as other dedicated tools) ----
  // Section numbering: increments only when a <Section> actually renders.
  // This means if any section is later wrapped in a `{cond && ...}` guard,
  // the visible numbering stays consecutive (1, 2, 3…) regardless of which
  // logical/template section it maps to. Reset on every render so React's
  // StrictMode double-invocation can't drift the counter.
  let _sectionNum = 0;
  const sn = () => ++_sectionNum;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-rams">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Documents</div>
          <h1 className="font-display text-4xl md:text-5xl">RAMS</h1>
          <div className="text-xs text-[#A19D94] mt-1">Risk Assessment and Method Statement</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="rams-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="rams-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
        </div>
      </div>

      {infoOpen && (
        <Modal onClose={() => setInfoOpen(false)}>
          <h3 className="font-display text-2xl text-[#F0EDE8] mb-2">About this tool</h3>
          <p className="text-sm text-[#A19D94] leading-relaxed">{TOOL_INFO}</p>
        </Modal>
      )}

      {/* 1. Document Control */}
      <Section title={`${sn()}. Document Control`} testId="rams-section-1">
        <Grid>
          <Inp label="Document Reference" value={documentRef} onChange={setDocumentRef} placeholder="Auto-generated if blank" testId="rams-doc-ref" />
          <Inp label="Current Revision" value={documentRevision} onChange={setDocumentRevision} testId="rams-doc-rev" />
          <Inp label="Client Name" value={clientName} onChange={setClientName} testId="rams-client" />
          <Inp label="Principal Contractor" value={principalContractor} onChange={setPrincipalContractor} testId="rams-pc" />
          <div className="sm:col-span-2 lg:col-span-3">
            <Area label="Site Address" value={siteAddress} onChange={setSiteAddress} testId="rams-site" />
          </div>
          <Inp label="Supervisor / Competent Person" value={supervisorName} onChange={setSupervisorName} testId="rams-supervisor" />
        </Grid>
      </Section>

      {/* 2. Revision History */}
      <Section title={`${sn()}. Revision History`} testId="rams-section-2">
        <div className="text-xs text-[#A19D94] mb-3">Add a new row each time the RAMS is reissued for the same job.</div>
        <div className="grid gap-3">
          {revisionHistory.map((r, idx) => (
            <div key={idx} className="rounded p-3 grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
              style={{ background: "rgba(15,15,15,0.4)", border: "1px solid rgba(160,157,148,0.15)" }}
              data-testid={`rams-rev-${idx}`}>
              <Inp label="Rev" value={r.rev} onChange={(v) => updateRevision(idx, "rev", v)} testId={`rams-rev-${idx}-rev`} />
              <Inp label="Date" type="date" value={r.date} onChange={(v) => updateRevision(idx, "date", v)} testId={`rams-rev-${idx}-date`} />
              <div className="lg:col-span-2"><Inp label="Description" value={r.description} onChange={(v) => updateRevision(idx, "description", v)} testId={`rams-rev-${idx}-desc`} /></div>
              <div className="flex gap-2 items-end">
                <div className="flex-1"><Inp label="Author" value={r.author} onChange={(v) => updateRevision(idx, "author", v)} testId={`rams-rev-${idx}-author`} /></div>
                <button onClick={() => removeRevision(idx)} className="text-[#706D66] hover:text-red-400 mb-2" data-testid={`rams-rev-${idx}-remove`}><Trash2 size={14}/></button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={addRevision} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="rams-rev-add"><Plus size={12}/> Add Revision</button>
      </Section>

      {/* 3. Scope of Works */}
      <Section title={`${sn()}. Scope of Works`} testId="rams-section-3">
        <Grid>
          <div className="sm:col-span-2 lg:col-span-3"><Inp label="Task" value={task} onChange={setTask} placeholder='e.g. "First fix ductwork on second floor"' testId="rams-task" /></div>
          <Inp label="Estimated Duration" value={estimatedDuration} onChange={setEstimatedDuration} placeholder='e.g. "2 weeks"' testId="rams-duration" />
          <Inp label="Number of Operatives" type="number" value={operativesCount} onChange={setOperativesCount} testId="rams-operatives" />
          <YesNo label="Work at Height" value={workAtHeight} onChange={setWorkAtHeight} testId="rams-wah" />
          <Drop label="Overall Risk Rating" value={overallRiskRating} onChange={setOverallRiskRating} options={["Low", "Medium", "High"]} testId="rams-risk" />
        </Grid>
      </Section>

      {/* 5. Persons at Risk */}
      <Section title={`${sn()}. Persons at Risk`} testId="rams-section-5">
        <CheckboxRow options={PERSONS_OPTIONS} selected={personsAtRisk} onToggle={togglePerson} testId="rams-persons" />
      </Section>

      {/* 6. Training and Competence */}
      <Section title={`${sn()}. Training and Competence`} testId="rams-section-6">
        <CheckboxRow options={TRAINING_OPTIONS} selected={training} onToggle={toggleTraining} testId="rams-training" />
      </Section>

      {/* 9. Hazards */}
      <Section title={`${sn()}. Hazard Detail and Control Measures`} testId="rams-section-9" icon={<ShieldAlert size={14}/>}>
        <div className="grid gap-4">
          {hazards.map((h, idx) => {
            const init = (Number(h.likelihoodBefore) || 0) * (Number(h.severityBefore) || 0);
            const resid = (Number(h.likelihoodAfter) || 0) * (Number(h.severityAfter ?? h.severityBefore) || 0);
            const composed = composeHazardLine(h);
            return (
              <div key={h.id} className="rounded p-4"
                style={{ background: "rgba(15,15,15,0.5)", border: "1px solid rgba(160,157,148,0.18)" }}
                data-testid={`rams-hazard-${idx}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs uppercase tracking-widest text-[#E8A020] font-mono">Hazard {idx + 1}</div>
                  <button onClick={() => removeHazard(h.id)} className="text-[#706D66] hover:text-red-400 flex items-center gap-1 text-xs" data-testid={`rams-hazard-${idx}-remove`}><Trash2 size={14}/> Remove</button>
                </div>
                <Grid>
                  <Drop label="Exposure route / mechanism" value={h.exposureRoute} onChange={(v) => updateHazard(h.id, "exposureRoute", v)} options={EXPOSURE_ROUTES} testId={`rams-hazard-${idx}-route`} />
                  <Inp label="Hazard or substance name" value={h.hazard} onChange={(v) => updateHazard(h.id, "hazard", v)} placeholder='e.g. "MDF dust"' testId={`rams-hazard-${idx}-hazard`} />
                  <Inp label="Activity that causes the exposure" value={h.activity} onChange={(v) => updateHazard(h.id, "activity", v)} placeholder='e.g. "cutting MDF with a circular saw"' testId={`rams-hazard-${idx}-activity`} />
                </Grid>

                {(h.hazard || h.activity) && (
                  <div className="mt-3 text-xs text-[#A19D94]">
                    <span className="uppercase tracking-widest text-[10px] text-[#706D66] mr-2">Plain-language line:</span>
                    <span className="text-[#F0EDE8]" data-testid={`rams-hazard-${idx}-composed`}>{composed}</span>
                  </div>
                )}

                <div className="mt-4">
                  <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">Persons affected</div>
                  <div className="flex flex-wrap gap-2" data-testid={`rams-hazard-${idx}-persons`}>
                    {PERSONS_OPTIONS.map((opt) => {
                      const active = (h.personsAffected || []).includes(opt);
                      return (
                        <button key={opt} type="button" onClick={() => toggleHazardPerson(h.id, opt)}
                          className={`px-3 py-1.5 rounded text-xs ${active ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94] hover:text-[#F0EDE8]"}`}>
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                  <Inp label="Likelihood (1–5) before" type="number" value={h.likelihoodBefore} onChange={(v) => updateHazard(h.id, "likelihoodBefore", clamp(v))} testId={`rams-hazard-${idx}-lb`} />
                  <Inp label="Severity (1–5) before" type="number" value={h.severityBefore} onChange={(v) => updateHazard(h.id, "severityBefore", clamp(v))} testId={`rams-hazard-${idx}-sb`} />
                  <RatingBadge label="Risk before" score={init} testId={`rams-hazard-${idx}-init`} />
                  <div />
                  <Inp label="Likelihood (1–5) after controls" type="number" value={h.likelihoodAfter} onChange={(v) => updateHazard(h.id, "likelihoodAfter", clamp(v))} testId={`rams-hazard-${idx}-la`} />
                  <Inp label="Severity (1–5) after controls" type="number" value={h.severityAfter ?? h.severityBefore} onChange={(v) => updateHazardSeverityAfter(h.id, clamp(v))} testId={`rams-hazard-${idx}-sa`} />
                  <RatingBadge label="Residual" score={resid} testId={`rams-hazard-${idx}-resid`} />
                </div>

                <div className="mt-4">
                  <Area label="Control measures (one per line)" value={h.controls} onChange={(v) => updateHazard(h.id, "controls", v)} rows={3} placeholder="One control per line. Plain words. e.g. 'Use M-class extraction on the saw.'" testId={`rams-hazard-${idx}-controls`} />
                </div>
              </div>
            );
          })}
        </div>
        <button onClick={addHazard} className="btn-secondary flex items-center gap-2 text-xs mt-4" data-testid="rams-hazard-add"><Plus size={12}/> Add Hazard</button>
      </Section>

      {/* 10. Control Measures and PPE */}
      <Section title={`${sn()}. Control Measures and PPE`} testId="rams-section-10">
        <CheckboxRow options={PPE_OPTIONS} selected={ppe} onToggle={togglePpe} testId="rams-ppe" />
        {ppeSuggestions.length > 0 && (
          <div className="mt-4 rounded p-3 flex flex-col gap-2"
            style={{ background: "rgba(232,160,32,0.08)", border: "1px solid #E8A020" }}
            data-testid="rams-ppe-suggestions">
            <div className="text-xs uppercase tracking-widest text-[#E8A020] flex items-center gap-2"><AlertTriangle size={12}/> Suggested PPE based on the hazards above</div>
            <div className="flex flex-wrap gap-2">
              {ppeSuggestions.map((s) => (
                <button key={s.item} type="button" onClick={() => togglePpe(s.item)}
                  className="px-3 py-1.5 rounded text-xs border border-[#E8A020]/60 text-[#E8A020] hover:bg-[#E8A020] hover:text-[#0F0F0F]"
                  title={s.reason}>+ {s.item}</button>
              ))}
            </div>
            <div className="text-[10px] text-[#A19D94]">Either tick the PPE above or add an override note below before exporting.</div>
            <Inp label="Override note (if PPE deliberately omitted)" value={ppeOverrideNote} onChange={setPpeOverrideNote} placeholder="Explain why suggested PPE is not required" testId="rams-ppe-override" />
          </div>
        )}
      </Section>

      {/* 11. Plant and Equipment */}
      <Section title={`${sn()}. Plant and Equipment`} testId="rams-section-11">
        <CheckboxRow options={COMMON_EQUIPMENT} selected={equipment} onToggle={toggleEquip} testId="rams-equipment" />
        {equipSuggestions.length > 0 && (
          <div className="mt-4 rounded p-3 flex flex-col gap-2"
            style={{ background: "rgba(232,160,32,0.08)", border: "1px solid #E8A020" }}
            data-testid="rams-equip-suggestions">
            <div className="text-xs uppercase tracking-widest text-[#E8A020] flex items-center gap-2"><AlertTriangle size={12}/> Suggested equipment based on the hazards above</div>
            <div className="flex flex-wrap gap-2">
              {equipSuggestions.map((e) => (
                <button key={e} type="button" onClick={() => toggleEquip(e)}
                  className="px-3 py-1.5 rounded text-xs border border-[#E8A020]/60 text-[#E8A020] hover:bg-[#E8A020] hover:text-[#0F0F0F]">+ {e}</button>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* 12. COSHH */}
      <Section title={`${sn()}. COSHH`} testId="rams-section-12">
        <div className="grid gap-3">
          {coshh.map((c, idx) => {
            const composed = composeCoshhLine(c);
            return (
              <div key={c.id} className="rounded p-4"
                style={{ background: "rgba(15,15,15,0.5)", border: c.licensedSeparate ? "1px solid #DC3C3C" : "1px solid rgba(160,157,148,0.18)" }}
                data-testid={`rams-coshh-${idx}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs uppercase tracking-widest text-[#E8A020] font-mono">Substance {idx + 1}</div>
                  <button onClick={() => removeCoshh(c.id)} className="text-[#706D66] hover:text-red-400 flex items-center gap-1 text-xs" data-testid={`rams-coshh-${idx}-remove`}><Trash2 size={14}/> Remove</button>
                </div>
                <Grid>
                  <Drop label="Exposure route" value={c.exposureRoute} onChange={(v) => updateCoshh(c.id, "exposureRoute", v)} options={EXPOSURE_ROUTES} testId={`rams-coshh-${idx}-route`} />
                  <Inp label="Substance name" value={c.substance} onChange={(v) => updateCoshh(c.id, "substance", v)} testId={`rams-coshh-${idx}-substance`} />
                  <Inp label="Activity that causes exposure" value={c.activity} onChange={(v) => updateCoshh(c.id, "activity", v)} testId={`rams-coshh-${idx}-activity`} />
                </Grid>
                {(c.substance || c.activity) && (
                  <div className="mt-3 text-xs"><span className="uppercase tracking-widest text-[10px] text-[#706D66] mr-2">Plain-language line:</span><span className="text-[#F0EDE8]">{composed}</span></div>
                )}
                <div className="mt-3">
                  <Area label="Controls" value={c.controls} onChange={(v) => updateCoshh(c.id, "controls", v)} rows={2} testId={`rams-coshh-${idx}-controls`} />
                </div>
                <label className="mt-3 flex items-center gap-2 text-xs text-[#F0EDE8] cursor-pointer">
                  <input type="checkbox" checked={c.licensedSeparate} onChange={(e) => updateCoshh(c.id, "licensedSeparate", e.target.checked)}
                    data-testid={`rams-coshh-${idx}-licensed`} />
                  Requires separate licensed assessment (e.g. asbestos)
                </label>
                {c.licensedSeparate && (
                  <div className="mt-2 text-xs text-[#FF8A8A]">This substance will be pulled out of the standard COSHH table and printed in its own STOP-WORK section.</div>
                )}
              </div>
            );
          })}
        </div>
        <button onClick={addCoshh} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="rams-coshh-add"><Plus size={12}/> Add COSHH Substance</button>
      </Section>

      {/* 13. Permits and Authorisations */}
      <Section title={`${sn()}. Permits and Authorisations`} testId="rams-section-13">
        <Inp label="What this RAMS does NOT cover" value={notCovered} onChange={setNotCovered} placeholder="e.g. hot works, confined space, live electrical work" testId="rams-not-covered" />
        <div className="mt-3 text-xs text-[#A19D94] leading-relaxed">
          The PDF will auto-append: <em className="text-[#F0EDE8]">{`"If the work changes and any of these activities are needed, stop work, review this RAMS and put a separate permit or assessment in place before starting again."`}</em>
        </div>
      </Section>

      {/* 14. Sequence of Operations */}
      <Section title={`${sn()}. Sequence of Operations`} testId="rams-section-14">
        <Area label="Step-by-step method (one step per line)" value={sequence} onChange={setSequence} rows={6} placeholder="Step by step. Plain words. e.g. 'Mark the cut line. Check no cables behind. Cut with extraction running.'" testId="rams-sequence" />
      </Section>

      {/* 16. Welfare */}
      <Section title={`${sn()}. Welfare Arrangements`} testId="rams-section-16">
        <Grid>
          <Inp label="Toilets"        value={welfareToilets} onChange={setWelfareToilets} testId="rams-welfare-toilets" />
          <Inp label="Washing"        value={welfareWashing} onChange={setWelfareWashing} testId="rams-welfare-washing" />
          <Inp label="Rest area"      value={welfareRest}    onChange={setWelfareRest}    testId="rams-welfare-rest" />
          <Inp label="Drinking water" value={welfareWater}   onChange={setWelfareWater}   testId="rams-welfare-water" />
        </Grid>
      </Section>

      {/* 17. Environmental */}
      <Section title={`${sn()}. Environmental Considerations`} testId="rams-section-17">
        <Grid>
          <Inp label="Waste disposal"   value={envWaste}     onChange={setEnvWaste}     testId="rams-env-waste" />
          <Inp label="Dust and noise"   value={envDustNoise} onChange={setEnvDustNoise} testId="rams-env-dustnoise" />
          <Inp label="Working hours"    value={envHours}     onChange={setEnvHours}     testId="rams-env-hours" />
          <Inp label="Spill management" value={envSpills}    onChange={setEnvSpills}    testId="rams-env-spills" />
        </Grid>
      </Section>

      {/* 18. Emergency */}
      <Section title={`${sn()}. Emergency Procedures`} testId="rams-section-18">
        <Grid>
          <Inp label="First Aider on site" value={firstAiderName} onChange={setFirstAiderName} testId="rams-emerg-fa" />
          <Inp label="Assembly point"      value={assemblyPoint}  onChange={setAssemblyPoint}  testId="rams-emerg-assembly" />
        </Grid>
        <div className="mt-4">
          <Area label="Emergency contact numbers (Role: Number — one per line)" value={emergencyContacts} onChange={setEmergencyContacts} rows={3} placeholder={"Site Manager: 07000 000000\nFirst Aider: 07000 000001\nNearest A&E: ..."} testId="rams-emerg-contacts" />
        </div>
      </Section>

      {/* 19. Sign Off */}
      <Section title={`${sn()}. Prepared by — Sign Off`} testId="rams-section-19">
        <LiveSignatureBlock
          label="Prepared by"
          subtitle="Your signature is stamped on the PDF. If neither this signature nor a profile signature is set, export is blocked."
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="rams-sig"
        />
      </Section>

      <MissingBanner />

      <button onClick={onDownload} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="rams-export">
        <Download size={14}/> {generating ? "Exporting…" : "Export RAMS PDF"}
      </button>
    </div>
  );
}

// ---------- bits ----------
function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="card-dark max-w-xl w-full p-6" style={{ borderColor: "#E8A020" }}>
        <div className="flex justify-end"><button onClick={onClose} className="text-[#A19D94]"><X size={18}/></button></div>
        {children}
      </div>
    </div>
  );
}
function Section({ title, children, testId, icon }) {
  return (
    <div className="card-dark p-6 mb-5" data-testid={testId}>
      <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4 flex items-center gap-2">{icon}{title}</div>
      {children}
    </div>
  );
}
function Grid({ children }) { return <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>; }
function Inp({ label, value, onChange, type = "text", testId, helper, placeholder }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <input type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="input-base" placeholder={placeholder} data-testid={testId} />
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
      <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} className="input-base" data-testid={testId} />
    </label>
  );
}
function YesNo({ label, value, onChange, testId }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <div className="flex gap-2" data-testid={testId}>
        <button type="button" onClick={() => onChange(true)}  className={`px-4 py-2 rounded text-xs ${value ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94]"}`} data-testid={`${testId}-yes`}>Yes</button>
        <button type="button" onClick={() => onChange(false)} className={`px-4 py-2 rounded text-xs ${!value ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94]"}`} data-testid={`${testId}-no`}>No</button>
      </div>
    </label>
  );
}
function CheckboxRow({ options, selected, onToggle, testId }) {
  return (
    <div className="flex flex-wrap gap-2" data-testid={testId}>
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button key={opt} type="button" onClick={() => onToggle(opt)}
            className={`px-3 py-1.5 rounded text-xs ${active ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94] hover:text-[#F0EDE8]"}`}
            data-testid={`${testId}-${opt.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}
function RatingBadge({ label, score, testId }) {
  const rating = score > 0 ? ratingFromScore(score) : "—";
  const palette = rating === "Low" ? { bg: "rgba(60,180,100,0.15)", text: "#7FE0A0", border: "#3CB464" }
                : rating === "Medium" ? { bg: "rgba(232,160,32,0.15)", text: "#E8A020", border: "#E8A020" }
                : rating === "High" ? { bg: "rgba(220,60,60,0.15)", text: "#FF8A8A", border: "#DC3C3C" }
                : { bg: "rgba(15,15,15,0.4)", text: "#F0EDE8", border: "rgba(160,157,148,0.18)" };
  return (
    <div data-testid={testId} className="rounded p-2 flex flex-col" style={{ background: palette.bg, border: `1px solid ${palette.border}` }}>
      <div className="text-[10px] uppercase tracking-widest text-[#706D66] mb-1">{label}</div>
      <div className="font-display text-xl" style={{ color: palette.text }}>{score > 0 ? `${score} — ${rating}` : "—"}</div>
    </div>
  );
}

function MissingBanner() {
  const [missing, setMissing] = useState([]);
  useEffect(() => {
    const onMissing = (e) => setMissing(e.detail || []);
    window.addEventListener("morris:rams-missing", onMissing);
    return () => window.removeEventListener("morris:rams-missing", onMissing);
  }, []);
  if (!missing || missing.length === 0) return null;
  return (
    <div className="rounded p-4 mb-5 flex gap-3"
      style={{ background: "rgba(220,60,60,0.10)", border: "1px solid #DC3C3C" }}
      data-testid="rams-missing-banner">
      <AlertTriangle size={20} className="text-[#FF8A8A] shrink-0 mt-0.5" />
      <div className="text-sm leading-relaxed">
        <div className="font-bold text-[#FF8A8A] uppercase tracking-wide mb-1">Cannot export — please complete the following</div>
        <ul className="list-disc list-inside text-[#F0EDE8]">
          {missing.map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      </div>
    </div>
  );
}

// ---------- utilities ----------
function clamp(v) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return "";
  return Math.max(1, Math.min(5, n));
}
function generateDefaultRef() {
  const d = new Date();
  return `RAMS-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-001`;
}
function addYearsIso(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}
