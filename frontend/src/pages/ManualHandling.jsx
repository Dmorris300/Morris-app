import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, AlertTriangle, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID = "manual-handling";
const TOOL_NAME = "Manual Handling Assessment";
const TOOL_INFO =
  "TILE-framework manual handling assessment under the Manual Handling Operations Regulations 1992. Captures Task / Individual / Load / Environment and the controls in place. Legal requirement — breach is a criminal offence even where no injury occurs.";

const isoToday = () => new Date().toISOString().slice(0, 10);
const inOneYearIso = () => {
  const d = new Date(); d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// HSE guideline lookup band for the weight entry
function weightBand(weight) {
  const w = parseFloat(weight);
  if (!Number.isFinite(w) || w <= 0) {
    return { id: "none", label: "—", hex: "#706D66", bg: "transparent" };
  }
  if (w < 16) {
    return { id: "ok", label: "Within HSE guidelines for most workers under ideal conditions",
             hex: "#22C55E", bg: "rgba(34,197,94,0.12)" };
  }
  if (w <= 25) {
    return { id: "caution",
             label: "Caution — within guidelines for men under ideal conditions only. Assess posture and frequency carefully.",
             hex: "#E8A020", bg: "rgba(232,160,32,0.12)" };
  }
  return { id: "over",
           label: "Above HSE guideline figures — mechanical assistance should be considered",
           hex: "#EF4444", bg: "rgba(239,68,68,0.12)" };
}

// Risk band derivation
function riskLabel(id) {
  if (id === "low")    return { id, label: "Low Risk",    hex: "#22C55E", bg: "rgba(34,197,94,0.12)" };
  if (id === "medium") return { id, label: "Medium Risk", hex: "#E8A020", bg: "rgba(232,160,32,0.12)" };
  return                       { id: "high", label: "High Risk", hex: "#EF4444", bg: "rgba(239,68,68,0.12)" };
}

// Heuristic: how many risk factors are present across T / I / L / E?
function deriveRisk({
  handlingTypes, postures, frequency, distance,
  unusualStrength, healthRisk, training,
  weightId, bulky, unstable, hazardous, weightMarked,
  floor, space, lighting, weather, steps,
}) {
  let n = 0;
  // Task
  if ((handlingTypes || []).includes("Repetitive handling")) n++;
  if ((postures || []).filter((p) => p && p !== "None of the above").length >= 2) n++;
  if (parseFloat(distance) > 10) n++;
  if (frequency === "Continuously throughout shift" || frequency === "Several times per day") n++;
  // Individual
  if (unusualStrength === "Yes") n++;
  if (healthRisk === "Yes") n++;
  if (training === "No" || training === "Not yet") n++;
  // Load
  if (weightId === "caution") n++;
  if (weightId === "over") n += 2;
  if (bulky === "Yes") n++;
  if (unstable === "Yes") n++;
  if (hazardous === "Yes") n++;
  if (weightMarked === "No") n++;
  // Environment
  if (floor && floor !== "Level and clear") n++;
  if (space === "Very restricted" || space === "Confined space") n++;
  if (space === "Slightly restricted") n++;
  if (lighting === "Poor") n++;
  if (lighting === "Adequate") n++;
  if (weather && weather !== "Normal") n++;
  if (steps === "Yes") n++;

  if (n <= 2) return riskLabel("low");
  if (n <= 5) return riskLabel("medium");
  return         riskLabel("high");
}

const HANDLING_TYPES = ["Lifting", "Lowering", "Carrying", "Pushing", "Pulling", "Holding / supporting", "Repetitive handling"];
const POSTURE_OPTIONS = [
  "Twisting", "Stooping / bending", "Reaching above shoulder height",
  "Reaching at arm's length", "Confined space working", "Working on uneven surface", "None of the above",
];
const FREQUENCY_OPTIONS = ["Once only", "Several times per day", "Continuously throughout shift", "Several times per week"];
const FLOOR_OPTIONS = ["Level and clear", "Uneven", "Wet or slippery", "Obstructed", "Outdoor", "Other"];
const SPACE_OPTIONS = ["Adequate space", "Slightly restricted", "Very restricted", "Confined space"];
const LIGHTING_OPTIONS = ["Good", "Adequate", "Poor"];
const WEATHER_OPTIONS = ["Normal", "Hot", "Cold", "Wet", "Windy"];
const MECH_AIDS = ["Sack truck / trolley", "Pallet truck", "Forklift", "Hoist or crane", "Conveyor", "None available"];
const CONTROL_MEASURES = [
  "Task broken into smaller loads",
  "Two person lift required",
  "Mechanical aid being used",
  "Rest breaks being provided",
  "Route cleared and obstacles removed",
  "Appropriate footwear being worn",
  "Gloves being worn",
  "Workers trained in correct lifting technique",
];
const RESIDUAL_OPTIONS = ["Low", "Medium", "High"];

export default function ManualHandling() {
  const { user, refresh } = useAuth();

  // SECTION 1
  const [project, setProject]               = useState("");
  const [siteAddress, setSiteAddress]       = useState("");
  const [assessmentDate, setAssessmentDate] = useState(isoToday());
  const [canAvoid, setCanAvoid]             = useState("");

  // SECTION 2 — TASK
  const [taskDescription, setTaskDescription] = useState("");
  const [handlingTypes, setHandlingTypes]     = useState([]);
  const [postures, setPostures]               = useState([]);
  const [distance, setDistance]               = useState("");
  const [frequency, setFrequency]             = useState("");

  // SECTION 3 — INDIVIDUAL
  const [unusualStrength, setUnusualStrength] = useState("");
  const [healthRisk, setHealthRisk]           = useState("");
  const [healthRiskDesc, setHealthRiskDesc]   = useState("");
  const [training, setTraining]               = useState("");
  const [peopleInvolved, setPeopleInvolved]   = useState("");

  // SECTION 4 — LOAD
  const [loadDescription, setLoadDescription] = useState("");
  const [weight, setWeight]                   = useState("");
  const [bulky, setBulky]                     = useState("");
  const [unstable, setUnstable]               = useState("");
  const [hazardous, setHazardous]             = useState("");
  const [hazardousDesc, setHazardousDesc]     = useState("");
  const [weightMarked, setWeightMarked]       = useState("");

  // SECTION 5 — ENVIRONMENT
  const [floor, setFloor]     = useState("");
  const [space, setSpace]     = useState("");
  const [lighting, setLighting] = useState("");
  const [weather, setWeather] = useState("");
  const [steps, setSteps]     = useState("");

  // SECTION 7 — CONTROLS
  const [mechanicalAids, setMechanicalAids]       = useState([]);
  const [controlMeasures, setControlMeasures]     = useState([]);
  const [controlsOther, setControlsOther]         = useState("");
  const [residualRisk, setResidualRisk]           = useState("");
  const [reviewDate, setReviewDate]               = useState(inOneYearIso());

  // Sign-off
  const [infoOpen, setInfoOpen]       = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [result, setResult]           = useState("");
  const [refNumber, setRefNumber]     = useState("");
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

  const toggleIn = (list, setter, val) =>
    setter(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);

  const wBand = weightBand(weight);
  const overall = useMemo(() => deriveRisk({
    handlingTypes, postures, frequency, distance,
    unusualStrength, healthRisk, training,
    weightId: wBand.id, bulky, unstable, hazardous, weightMarked,
    floor, space, lighting, weather, steps,
  }), [handlingTypes, postures, frequency, distance, unusualStrength, healthRisk, training, wBand.id, bulky, unstable, hazardous, weightMarked, floor, space, lighting, weather, steps]);

  const onGenerate = async () => {
    if (!project.trim())          { toast.error("Add a project / site name"); return; }
    if (!taskDescription.trim())  { toast.error("Describe the task"); return; }
    if (!loadDescription.trim())  { toast.error("Describe the load"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const mechAidsRendered = mechanicalAids.length ? mechanicalAids.join(", ") : "(none selected)";
    const controlsList = [...controlMeasures, ...(controlsOther ? [`Other: ${controlsOther}`] : [])];
    const controlsRendered = controlsList.length ? controlsList.join(", ") : "(none selected)";

    const promptTemplate = `Produce a UK MANUAL HANDLING RISK ASSESSMENT using the HSE TILE framework, prepared under the Manual Handling Operations Regulations 1992. Plain direct construction English. No padding. No banned consultant words. This is a legal-grade compliance document.

1. HEADER — DOCUMENT REFERENCE, DATE (use {assessmentDate} in DD/MM/YYYY format), REVIEW DATE ({reviewDate} in DD/MM/YYYY).

2. TITLE — exactly: 'MANUAL HANDLING RISK ASSESSMENT — {loadDescription} — {assessmentDate}'.

3. ASSESSMENT DETAILS — list on separate lines (skip blanks cleanly):
   Project / Site: {project}
   Site Address: {siteAddress}
   Date of Assessment: {assessmentDate}
   Assessed by: {assessedBy}
   Department / Trade: {trade}
   Can the task be avoided entirely: {canAvoid}

4. T — TASK — list on separate lines (skip blanks):
   Description of Task: {taskDescription}
   Type of Handling: {handlingTypes}
   Posture / Movement Involved: {postures}
   Distance Load is Carried: {distance} metres
   Frequency: {frequency}

5. I — INDIVIDUAL — list on separate lines:
   Does the task require unusual strength or height: {unusualStrength}
   Could the task create a risk for anyone with a health condition or injury: {healthRisk}
   {healthRiskLine}
   Manual handling training: {training}
   Number of people involved: {peopleInvolved}

6. L — LOAD — list on separate lines:
   Description of Load: {loadDescription}
   Weight: {weight} kilograms
   HSE Guideline Check: {hseLabel}
   Is the load bulky or difficult to grip: {bulky}
   Is the load unstable or does the contents shift: {unstable}
   Sharp edges, temperatures or other hazards with the load: {hazardous}
   {hazardousLine}
   Weight clearly marked on the load: {weightMarked}

7. E — ENVIRONMENT — list on separate lines:
   Floor Surface: {floor}
   Space Constraints: {space}
   Lighting: {lighting}
   Temperature / Weather Conditions: {weather}
   Steps, ramps or changes in level: {steps}

8. OVERALL RISK LEVEL — print prominently as its own headed line:
   Overall Risk Level: {overallLabel}

9. CONTROL MEASURES — list on separate lines:
   Mechanical Aids Available: {mechanicalAids}
   Control Measures Being Implemented: {controlsList}
   Residual Risk After Controls: {residualRisk}
   Review Date: {reviewDate}

10. LEGAL REFERENCE — print verbatim as a single paragraph:
    This assessment has been completed in accordance with the Manual Handling Operations Regulations 1992. There is no legal maximum weight limit — each task must be assessed on its individual merits using the TILE framework. HSE guideline figures: 25 kilograms for men, 16 kilograms for women under ideal conditions.

11. FOOTER — print verbatim on its own line:
    This assessment must be reviewed whenever the task or working conditions change, or following any manual handling injury.

12. SIGN-OFF — single assessor sign-off:
    Assessed by: {assessedBy}
    Date: {assessmentDate}
    Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

Rules:
- Use DD/MM/YYYY for every date in the body. Never YYYY-MM-DD.
- Never invent values. Use only the supplied data.
- Never use abbreviations such as 'N/A', 'TBC' or '&'. Write words in full.
- Skip blank fields cleanly. Do not print '—' for whole lines.
- No banned words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct. Legal-grade.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          project,
          siteAddress,
          assessmentDate: ukDate(assessmentDate),
          assessedBy: user?.fullName || "",
          trade: user?.trade || "",
          canAvoid,
          taskDescription,
          handlingTypes: handlingTypes.length ? handlingTypes.join(", ") : "(none selected)",
          postures: postures.length ? postures.join(", ") : "(none selected)",
          distance: distance || "—",
          frequency,
          unusualStrength,
          healthRisk,
          healthRiskLine: healthRisk === "Yes" && healthRiskDesc ? `Health risk description: ${healthRiskDesc}` : "",
          training,
          peopleInvolved,
          loadDescription,
          weight: weight || "—",
          hseLabel: wBand.label,
          bulky,
          unstable,
          hazardous,
          hazardousLine: hazardous === "Yes" && hazardousDesc ? `Hazard description: ${hazardousDesc}` : "",
          weightMarked,
          floor,
          space,
          lighting,
          weather,
          steps,
          overallLabel: overall.label,
          mechanicalAids: mechAidsRendered,
          controlsList: controlsRendered,
          residualRisk,
          reviewDate: ukDate(reviewDate),
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Manual handling assessment generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Manual Handling Assessment — ${loadDescription || "task"}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-manual-handling">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Site Tools</div>
          <h1 className="font-display text-4xl md:text-5xl">Manual Handling Assessment</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="mh-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="mh-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 */}
      <Section title="Assessment Details" testId="mh-section-1">
        <Grid>
          <Inp label="Project Name / Site" value={project}        onChange={setProject}        testId="mh-project" />
          <Inp label="Site Address"        value={siteAddress}    onChange={setSiteAddress}    testId="mh-site-address" />
          <Inp label="Date of Assessment"  value={assessmentDate} onChange={setAssessmentDate} type="date" testId="mh-date" />
          <Inp label="Assessed by (auto from profile)"        value={user?.fullName || ""} onChange={() => {}} readOnly testId="mh-assessed-by" />
          <Inp label="Department / Trade (auto from profile)" value={user?.trade || ""}    onChange={() => {}} readOnly testId="mh-trade" />
        </Grid>
        <div className="mt-4">
          <Label>Can this manual handling task be avoided entirely?</Label>
          <TriToggle options={["Yes", "No", "Partially"]} value={canAvoid} onChange={setCanAvoid} testIdBase="mh-can-avoid" />
          <div className="text-[10px] text-[#706D66] mt-2 leading-relaxed">
            The regulations require you to avoid hazardous manual handling wherever reasonably practicable.
            Only proceed with the assessment if the task cannot be avoided.
          </div>
        </div>
      </Section>

      {/* SECTION 2 — T */}
      <Section title="T — Task" subtitle="Describe what the person is physically doing" testId="mh-section-2">
        <Area label="Description of Task" value={taskDescription} onChange={setTaskDescription} testId="mh-task-description" helper="What manual handling is involved? e.g. lifting ductwork sections from van to first floor, carrying cable drums across site" />
        <div className="mt-4">
          <Label>Type of Handling</Label>
          <CheckboxGrid options={HANDLING_TYPES} value={handlingTypes} onChange={(v) => toggleIn(handlingTypes, setHandlingTypes, v)} testIdBase="mh-handling" />
        </div>
        <div className="mt-4">
          <Label>Posture / Movement Involved</Label>
          <CheckboxGrid options={POSTURE_OPTIONS} value={postures} onChange={(v) => toggleIn(postures, setPostures, v)} testIdBase="mh-postures" />
        </div>
        <Grid>
          <Inp label="Distance Load is Carried (metres) (optional)" value={distance} onChange={setDistance} type="number" testId="mh-distance" />
          <Drop label="How frequently is this task carried out?" value={frequency} onChange={setFrequency} options={FREQUENCY_OPTIONS} testId="mh-frequency" />
        </Grid>
      </Section>

      {/* SECTION 3 — I */}
      <Section title="I — Individual" subtitle="Consider who is carrying out the task" testId="mh-section-3">
        <div className="mb-4">
          <Label>Does the task require unusual strength or height?</Label>
          <TriToggle options={["Yes", "No"]} value={unusualStrength} onChange={setUnusualStrength} testIdBase="mh-strength" />
        </div>
        <div className="mb-4">
          <Label>Could the task create a risk for anyone with a health condition or injury?</Label>
          <TriToggle options={["Yes", "No"]} value={healthRisk} onChange={setHealthRisk} testIdBase="mh-health" />
          {healthRisk === "Yes" && (
            <Inp label="Describe the risk" value={healthRiskDesc} onChange={setHealthRiskDesc} testId="mh-health-desc" />
          )}
        </div>
        <div className="mb-4">
          <Label>Have the workers involved received manual handling training?</Label>
          <TriToggle options={["Yes", "No", "Not yet"]} value={training} onChange={setTraining} testIdBase="mh-training" />
        </div>
        <Grid>
          <Inp label="Number of people involved in the task" value={peopleInvolved} onChange={setPeopleInvolved} type="number" testId="mh-people" />
        </Grid>
      </Section>

      {/* SECTION 4 — L */}
      <Section title="L — Load" subtitle="Consider the object or material being handled" testId="mh-section-4" icon={<PackageOpen size={14}/>}>
        <Grid>
          <Inp label="Description of Load / Item" value={loadDescription} onChange={setLoadDescription} testId="mh-load-description" />
          <Inp label="Weight (kilograms)" value={weight} onChange={setWeight} type="number" testId="mh-weight" />
        </Grid>
        <div className="mt-3">
          <Label>HSE Guideline Check</Label>
          <div
            className="px-4 py-3 rounded text-sm"
            style={{ background: wBand.bg, border: `1px solid ${wBand.hex}`, color: wBand.hex }}
            data-testid="mh-hse-band"
          >
            {wBand.label}
          </div>
        </div>
        <div className="mt-4">
          <Label>Is the load bulky or difficult to grip?</Label>
          <TriToggle options={["Yes", "No"]} value={bulky} onChange={setBulky} testIdBase="mh-bulky" />
        </div>
        <div className="mt-3">
          <Label>Is the load unstable or does the contents shift?</Label>
          <TriToggle options={["Yes", "No"]} value={unstable} onChange={setUnstable} testIdBase="mh-unstable" />
        </div>
        <div className="mt-3">
          <Label>Are there sharp edges, extreme temperatures, or other hazards with the load?</Label>
          <TriToggle options={["Yes", "No"]} value={hazardous} onChange={setHazardous} testIdBase="mh-hazardous" />
          {hazardous === "Yes" && (
            <Inp label="Describe" value={hazardousDesc} onChange={setHazardousDesc} testId="mh-hazardous-desc" />
          )}
        </div>
        <div className="mt-3">
          <Label>Is the weight clearly marked on the load?</Label>
          <TriToggle options={["Yes", "No", "Not Applicable"]} value={weightMarked} onChange={setWeightMarked} testIdBase="mh-weight-marked" />
        </div>
      </Section>

      {/* SECTION 5 — E */}
      <Section title="E — Environment" subtitle="Consider the conditions where the task takes place" testId="mh-section-5">
        <Grid>
          <Drop label="Floor Surface" value={floor} onChange={setFloor} options={FLOOR_OPTIONS} testId="mh-floor" />
          <Drop label="Space Constraints" value={space} onChange={setSpace} options={SPACE_OPTIONS} testId="mh-space" />
          <Drop label="Lighting" value={lighting} onChange={setLighting} options={LIGHTING_OPTIONS} testId="mh-lighting" />
          <Drop label="Temperature / Weather Conditions" value={weather} onChange={setWeather} options={WEATHER_OPTIONS} testId="mh-weather" />
        </Grid>
        <div className="mt-3">
          <Label>Are there steps, ramps, or changes in level?</Label>
          <TriToggle options={["Yes", "No"]} value={steps} onChange={setSteps} testIdBase="mh-steps" />
        </div>
      </Section>

      {/* SECTION 6 — RISK RATING */}
      <Section title="Risk Rating" testId="mh-section-6">
        <Label>Overall Risk Level (auto-calculated from TILE responses)</Label>
        <div
          className="px-4 py-4 rounded font-display text-xl"
          style={{ background: overall.bg, border: `1px solid ${overall.hex}`, color: overall.hex }}
          data-testid="mh-overall-risk"
        >
          {overall.label}
        </div>
        {overall.id === "high" && (
          <div
            className="mt-3 p-3 rounded flex items-start gap-2"
            style={{ border: "1px solid #EF4444", background: "rgba(239,68,68,0.08)" }}
            data-testid="mh-high-warning"
          >
            <AlertTriangle size={16} className="text-[#EF4444] mt-0.5 flex-shrink-0" />
            <div className="text-xs text-[#F0EDE8] leading-relaxed">
              Multiple risk factors present. Mechanical assistance or task redesign required. Do not proceed until controls are in place.
            </div>
          </div>
        )}
      </Section>

      {/* SECTION 7 */}
      <Section title="Control Measures" testId="mh-section-7">
        <Label>Mechanical Aids Available</Label>
        <CheckboxGrid options={MECH_AIDS} value={mechanicalAids} onChange={(v) => toggleIn(mechanicalAids, setMechanicalAids, v)} testIdBase="mh-mech-aids" />

        <div className="mt-5">
          <Label>Control Measures Being Implemented</Label>
          <CheckboxGrid options={CONTROL_MEASURES} value={controlMeasures} onChange={(v) => toggleIn(controlMeasures, setControlMeasures, v)} testIdBase="mh-controls" />
          <Inp label="Other (free text)" value={controlsOther} onChange={setControlsOther} testId="mh-controls-other" />
        </div>
        <Grid>
          <Drop label="Residual Risk After Controls" value={residualRisk} onChange={setResidualRisk} options={RESIDUAL_OPTIONS} testId="mh-residual" />
          <Inp label="Review Date" value={reviewDate} onChange={setReviewDate} type="date" testId="mh-review-date" helper="When will this assessment be reviewed?" />
        </Grid>
      </Section>

      {/* SECTION 8 — SIGN OFF */}
      <Section title="Sign Off" testId="mh-section-8">
        <LiveSignatureBlock
          label="Assessor signature"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="mh-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="mh-sig-date">
          Date: {ukDate(assessmentDate) || "—"}
        </div>
        <div
          className="mt-4 p-4 rounded text-xs text-[#F0EDE8] leading-relaxed"
          style={{ border: "1px solid rgba(232,160,32,0.25)", background: "rgba(232,160,32,0.05)" }}
          data-testid="mh-legal-ref"
        >
          This assessment has been completed in accordance with the Manual Handling Operations Regulations 1992.
          There is no legal maximum weight limit — each task must be assessed on its individual merits using the TILE framework.
          HSE guideline figures: 25 kilograms for men, 16 kilograms for women under ideal conditions.
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="mh-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Manual Handling Assessment</>}
      </button>

      {/* OUTPUT */}
      {result && (
        <div className="card-dark p-6 mt-6" data-testid="mh-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated assessment</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Manual Handling Assessment — ${loadDescription}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="mh-output">{result}</pre>
        </div>
      )}
    </div>
  );
}

// ---------- Small reusable bits ----------
function Section({ title, subtitle, children, testId, icon }) {
  return (
    <div className="card-dark p-6 mb-5" data-testid={testId}>
      <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-1 flex items-center gap-2">
        {icon}{title}
      </div>
      {subtitle && <div className="text-[10px] text-[#706D66] mb-4">{subtitle}</div>}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  );
}

function Grid({ children }) {
  return <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">{children}</div>;
}

function Label({ children }) {
  return <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">{children}</div>;
}

function Inp({ label, value, onChange, type = "text", testId, helper, readOnly }) {
  return (
    <label className="block mt-3">
      <Label>{label}</Label>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="input-base"
        readOnly={readOnly}
        data-testid={testId}
      />
      {helper && <div className="text-[10px] text-[#706D66] mt-1">{helper}</div>}
    </label>
  );
}

function Area({ label, value, onChange, testId, helper, rows = 4 }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <textarea
        rows={rows}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="input-base resize-y"
        data-testid={testId}
      />
      {helper && <div className="text-[10px] text-[#706D66] mt-1">{helper}</div>}
    </label>
  );
}

function Drop({ label, value, onChange, options, testId }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} className="input-base" data-testid={testId}>
        <option value="">— Choose —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function CheckboxGrid({ options, value, onChange, testIdBase }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid={testIdBase}>
      {options.map((opt) => {
        const checked = value.includes(opt);
        return (
          <label
            key={opt}
            className="flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition"
            style={{
              background: checked ? "rgba(232,160,32,0.08)" : "transparent",
              border: `1px solid ${checked ? "rgba(232,160,32,0.45)" : "rgba(160,157,148,0.2)"}`,
            }}
            data-testid={`${testIdBase}-${opt.replace(/\s+/g, "-").toLowerCase().replace(/[()/']/g, "")}`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onChange(opt)}
              className="accent-[#E8A020]"
            />
            <span className="text-sm" style={{ color: checked ? "#E8A020" : "#F0EDE8" }}>{opt}</span>
          </label>
        );
      })}
    </div>
  );
}

function TriToggle({ options, value, onChange, testIdBase }) {
  return (
    <div className="flex gap-2 flex-wrap" data-testid={testIdBase}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(active ? "" : opt)}
            className="px-3 py-2 rounded text-xs uppercase tracking-widest transition"
            style={{
              background: active ? "rgba(232,160,32,0.12)" : "transparent",
              border: `1px solid ${active ? "#E8A020" : "rgba(160,157,148,0.25)"}`,
              color: active ? "#E8A020" : "#A19D94",
            }}
            data-testid={`${testIdBase}-${opt.replace(/\s+/g, "-").toLowerCase()}`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
