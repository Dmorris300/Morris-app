import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, AlertTriangle, LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID = "working-at-height-rescue";
const TOOL_NAME = "Working at Height Rescue Plan";
const TOOL_INFO =
  "Mandatory rescue plan under the Work at Height Regulations 2005. Must be in place before any work at height begins, particularly where fall arrest equipment is used.";

const isoToday = () => new Date().toISOString().slice(0, 10);

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const ACCESS_OPTIONS = [
  "Ladder",
  "Step ladder",
  "Podium steps",
  "Mobile scaffold tower (PASMA)",
  "Fixed scaffold",
  "Mobile Elevating Work Platform (MEWP / Cherry Picker)",
  "Scissor lift",
  "Roof ladder / cat ladder",
  "Rope access",
];

const FALL_PROTECTION_OPTIONS = [
  "Safety harness and lanyard",
  "Inertia reel / self-retracting lanyard",
  "Work restraint system",
  "Edge protection / guard rails",
  "Safety netting",
  "Soft landing system",
  "None (low risk activity)",
];

const RESCUE_EQUIPMENT_ITEMS = [
  { key: "firstAid",       label: "First aid kit" },
  { key: "aed",            label: "Defibrillator (AED)" },
  { key: "rescueLadder",   label: "Rescue ladder or secondary means of access" },
  { key: "mewp",           label: "Mobile Elevating Work Platform available for rescue" },
  { key: "harnessKit",     label: "Harness rescue kit / lowering device" },
  { key: "stretcher",      label: "Stretcher or casualty handling equipment" },
  { key: "radio",          label: "Two-way radio or communication device" },
];

const SCENARIO_1_DEFAULT = `1. Do not leave the casualty unattended.
2. Call for help immediately.
3. If conscious, instruct the casualty to push their legs down to reduce suspension trauma risk.
4. Deploy rescue equipment / lower casualty to ground as quickly as safely possible.
5. Once on the ground, lay the casualty flat — do not leave them seated upright.
6. Call 999.
7. Monitor for suspension trauma symptoms: nausea, faintness, difficulty breathing.`;

const SCENARIO_2_DEFAULT = `1. Do not move the casualty unless there is immediate danger.
2. Call 999.
3. Administer first aid if trained to do so.
4. Keep casualty warm and still.
5. Clear the area and preserve the scene.
6. Notify principal contractor / site manager immediately.`;

const SCENARIO_3_DEFAULT = `1. Establish communication with the casualty.
2. Use access equipment to reach the casualty if safe to do so.
3. Call 999 and describe the situation including the height and access constraints.
4. Do not attempt to move the casualty from height unless trained and equipped to do so safely.`;

const SCENARIO_4_DEFAULT = `1. Do not enter the void / excavation without checking for hazardous atmosphere.
2. Call 999 immediately.
3. Lower first aid equipment to the casualty if possible.
4. Wait for emergency services trained in confined space rescue.`;

const COMMS_OPTIONS = ["Mobile phone", "Two-way radio", "Hand signals", "Shouting", "Other"];

function makeWorker() {
  return { id: crypto.randomUUID(), name: "", role: "", signed: false };
}

export default function WorkingAtHeightRescue() {
  const { user, refresh } = useAuth();

  // SECTION 1
  const [project, setProject]         = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [planDate, setPlanDate]       = useState(isoToday());
  const [activityDescription, setActivityDescription] = useState("");
  const [workingHeight, setWorkingHeight] = useState("");
  const [duration, setDuration]       = useState("");

  // SECTION 2
  const [access, setAccess]                     = useState([]);
  const [accessOther, setAccessOther]           = useState("");
  const [fallProtection, setFallProtection]     = useState([]);
  const [fallProtectionOther, setFallProtectionOther] = useState("");

  // SECTION 3
  const [rescueName, setRescueName]           = useState("");
  const [rescuePhone, setRescuePhone]         = useState("");
  const [rescueTraining, setRescueTraining]   = useState("");
  const [backupName, setBackupName]           = useState("");
  const [backupPhone, setBackupPhone]         = useState("");

  // SECTION 4
  const [equipment, setEquipment]                 = useState({});
  const [equipmentLocation, setEquipmentLocation] = useState("");
  const [emergencyContact, setEmergencyContact]   = useState("Emergency: 999");

  // SECTION 5
  const [scenario1, setScenario1] = useState(SCENARIO_1_DEFAULT);
  const [scenario2, setScenario2] = useState(SCENARIO_2_DEFAULT);
  const [scenario3, setScenario3] = useState(SCENARIO_3_DEFAULT);
  const [showScenario4, setShowScenario4] = useState(false);
  const [scenario4, setScenario4] = useState(SCENARIO_4_DEFAULT);
  const [extraScenarios, setExtraScenarios] = useState("");

  // SECTION 6
  const [commsMethod, setCommsMethod]   = useState("");
  const [commsOther, setCommsOther]     = useState("");
  const [alarmSignal, setAlarmSignal]   = useState("");
  const [musterPoint, setMusterPoint]   = useState("");

  // SECTION 7
  const [workers, setWorkers] = useState([makeWorker()]);

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

  const toggleAccess = (opt) =>
    setAccess((cur) => cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt]);
  const toggleFall = (opt) =>
    setFallProtection((cur) => cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt]);

  const setEq = (key, val) => setEquipment((s) => ({ ...s, [key]: val }));

  const updateWorker = (id, field, value) =>
    setWorkers((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const removeWorker = (id) =>
    setWorkers((rows) => rows.filter((r) => r.id !== id));
  const addWorker = () => setWorkers((rows) => [...rows, makeWorker()]);

  const onGenerate = async () => {
    if (!project.trim())              { toast.error("Add a project / site name"); return; }
    if (!activityDescription.trim())  { toast.error("Describe the work at height activity"); return; }
    if (!rescueName.trim())           { toast.error("Nominate a rescue person"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const accessList = [...access, ...(accessOther ? [`Other: ${accessOther}`] : [])];
    const fallList = [...fallProtection, ...(fallProtectionOther ? [`Other: ${fallProtectionOther}`] : [])];

    const equipBlock = RESCUE_EQUIPMENT_ITEMS.map((it) => {
      const v = equipment[it.key] || "Not Required";
      return `   ${it.label}: ${v}`;
    }).join("\n");

    const workersBlock = workers
      .filter((w) => w.name.trim() || w.role.trim())
      .map((w, i) => `   ${i + 1}. Name: ${w.name || "—"} | Role: ${w.role || "—"} | Signature: ____________________________`)
      .join("\n") || "   (No workers recorded)";

    const commsRendered = commsMethod === "Other" && commsOther ? `Other: ${commsOther}` : commsMethod;

    const promptTemplate = `Produce a UK WORKING AT HEIGHT RESCUE PLAN under the Work at Height Regulations 2005. Plain direct construction English. No padding. No banned consultant words. This is a legal-grade life-safety document.

1. HEADER — DOCUMENT REFERENCE, DATE (use {planDate} in DD/MM/YYYY format).

2. TITLE — exactly: 'WORKING AT HEIGHT RESCUE PLAN — {project} — {planDate}'.

3. CRITICAL WARNING — print verbatim as a single bold-styled paragraph at the very top of the body, before any other section:
   A rescue plan is legally required before work at height begins. It is not the duty of emergency services to rescue a suspended worker. You must have your own plan in place. Suspension trauma can be fatal within minutes.

4. SECTION 1 — JOB DETAILS — list on separate lines (skip any blank cleanly):
   Project / Site: {project}
   Site Address: {siteAddress}
   Date: {planDate}
   Planned by: {plannedBy}
   Description of Work at Height Activity: {activityDescription}
   Working Height: {workingHeight} metres
   Estimated Duration: {duration}

5. SECTION 2 — ACCESS EQUIPMENT BEING USED — list:
   Access Equipment: {accessList}
   Fall Protection in Use: {fallList}

6. SECTION 3 — RESCUE PERSONNEL — list on separate lines (skip blanks):
   Nominated Rescue Person: {rescueName}
   Rescue Person Contact Number: {rescuePhone}
   Rescue Person Training / Qualification: {rescueTraining}
   Backup Rescue Person: {backupName}
   Backup Contact Number: {backupPhone}

7. SECTION 4 — RESCUE EQUIPMENT ON SITE — print this header, then each item verbatim with its response after a colon:
{equipBlock}
   Location of Rescue Equipment on Site: {equipmentLocation}
   Emergency Services Contact: {emergencyContact}

8. SECTION 5 — RESCUE PROCEDURES — print these scenario headings then each step on its own numbered line exactly as supplied. Do not rewrite or shorten:
   Scenario 1 — Worker Falls and is Suspended in Harness:
{scenario1}

   Scenario 2 — Worker Falls and is Injured:
{scenario2}

   Scenario 3 — Worker Suffers Medical Emergency at Height:
{scenario3}

   {scenario4Block}
   {extraScenariosLine}

9. SECTION 6 — COMMUNICATION PLAN — list on separate lines:
   Communication method: {commsRendered}
   Signal to raise the alarm: {alarmSignal}
   Site muster point: {musterPoint}

10. SECTION 7 — WORKERS BRIEFED — print this header line then the worker block verbatim, one per line preserving the pipe structure and signature line:
{workersBlock}

11. SECTION 8 — PLAN AUTHORISED BY — single authorising sign-off:
    Authorised by: {plannedBy}
    Date: {planDate}
    Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

12. LEGAL REFERENCE — print verbatim as a single paragraph:
    This rescue plan has been prepared in accordance with the Work at Height Regulations 2005. A rescue plan must be in place before work at height begins. Where fall arrest equipment is in use, this plan is a legal requirement.

13. FOOTER — print verbatim on its own line:
    This plan must be readily available on site at all times during work at height activities. Review if working conditions change.

Rules:
- Use DD/MM/YYYY for every date. Never YYYY-MM-DD.
- Never invent rescue equipment, workers, scenarios or contact details. Use only the supplied data.
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
          planDate: ukDate(planDate),
          plannedBy: user?.fullName || "",
          activityDescription,
          workingHeight: workingHeight || "—",
          duration,
          accessList: accessList.length ? accessList.join(", ") : "(none selected)",
          fallList: fallList.length ? fallList.join(", ") : "(none selected)",
          rescueName,
          rescuePhone,
          rescueTraining,
          backupName,
          backupPhone,
          equipBlock,
          equipmentLocation,
          emergencyContact,
          scenario1,
          scenario2,
          scenario3,
          scenario4Block: showScenario4
            ? `Scenario 4 — Worker Falls Below Ground Level:\n${scenario4}\n`
            : "",
          extraScenariosLine: extraScenarios ? `Additional Site-Specific Scenarios: ${extraScenarios}` : "",
          commsRendered,
          alarmSignal,
          musterPoint,
          workersBlock,
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Working at Height Rescue Plan generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Working at Height Rescue Plan — ${project || "site"}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-wah-rescue">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Site Tools</div>
          <h1 className="font-display text-4xl md:text-5xl">Working at Height Rescue Plan</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="wah-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="wah-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
        </div>
      </div>

      {/* PROMINENT WARNING BANNER */}
      <div
        className="mb-6 p-5 rounded flex items-start gap-3"
        style={{ border: "2px solid #E8A020", background: "rgba(232,160,32,0.10)" }}
        data-testid="wah-warning-banner"
      >
        <AlertTriangle size={24} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
        <p className="text-sm md:text-base font-bold text-[#F0EDE8] leading-relaxed">
          A rescue plan is legally required before work at height begins.
          It is not the duty of emergency services to rescue a suspended worker — you must have your own plan in place.
          Suspension trauma can be fatal within minutes.
        </p>
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
      <Section title="Job Details" testId="wah-section-1">
        <Grid>
          <Inp label="Project Name / Site" value={project}     onChange={setProject}     testId="wah-project" />
          <Inp label="Site Address"        value={siteAddress} onChange={setSiteAddress} testId="wah-site-address" />
          <Inp label="Date"                value={planDate}    onChange={setPlanDate}    type="date" testId="wah-date" />
          <Inp label="Planned by (auto from profile)" value={user?.fullName || ""} onChange={() => {}} readOnly testId="wah-planned-by" />
          <Inp label="Working Height (metres)"        value={workingHeight} onChange={setWorkingHeight} type="number" testId="wah-height" />
          <Inp label="Estimated Duration of Work at Height" value={duration} onChange={setDuration} testId="wah-duration" helper={`e.g. "2 hours", "Full day"`} />
        </Grid>
        <Area
          label="Description of Work at Height Activity"
          value={activityDescription}
          onChange={setActivityDescription}
          testId="wah-activity"
          helper="What work is being carried out at height? Be specific."
        />
      </Section>

      {/* SECTION 2 */}
      <Section title="Access Equipment Being Used" testId="wah-section-2">
        <Label>Type of Access Equipment</Label>
        <CheckboxGrid options={ACCESS_OPTIONS} value={access} onChange={toggleAccess} testIdBase="wah-access" />
        <Inp label="Other (free text)" value={accessOther} onChange={setAccessOther} testId="wah-access-other" />

        <div className="mt-5">
          <Label>Fall Protection in Use</Label>
          <CheckboxGrid options={FALL_PROTECTION_OPTIONS} value={fallProtection} onChange={toggleFall} testIdBase="wah-fall" />
          <Inp label="Other (free text)" value={fallProtectionOther} onChange={setFallProtectionOther} testId="wah-fall-other" />
        </div>
      </Section>

      {/* SECTION 3 */}
      <Section title="Rescue Personnel" testId="wah-section-3">
        <Grid>
          <Inp label="Nominated Rescue Person (Name)" value={rescueName}  onChange={setRescueName}  testId="wah-rescue-name" helper="The person responsible for carrying out the rescue" />
          <Inp label="Rescue Person Contact Number"   value={rescuePhone} onChange={setRescuePhone} testId="wah-rescue-phone" />
          <Inp label="Rescue Person Training / Qualification" value={rescueTraining} onChange={setRescueTraining} testId="wah-rescue-training" helper={`e.g. "Working at Height trained", "IPAF operator", "First Aid at Work"`} />
          <Inp label="Backup Rescue Person (Name) (optional)" value={backupName}  onChange={setBackupName}  testId="wah-backup-name" />
          <Inp label="Backup Contact Number (optional)"       value={backupPhone} onChange={setBackupPhone} testId="wah-backup-phone" />
        </Grid>
      </Section>

      {/* SECTION 4 */}
      <Section title="Rescue Equipment on Site" testId="wah-section-4" icon={<LifeBuoy size={14}/>}>
        <div className="space-y-3 mb-4">
          {RESCUE_EQUIPMENT_ITEMS.map((it) => {
            const v = equipment[it.key] || "";
            return (
              <div
                key={it.key}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded"
                style={{ background: "rgba(15,15,15,0.6)", border: "1px solid rgba(160,157,148,0.12)" }}
                data-testid={`wah-eq-${it.key}`}
              >
                <div className="text-sm text-[#F0EDE8] flex-1">{it.label}</div>
                <TriToggle options={["Yes", "No", "Not Required"]} value={v} onChange={(val) => setEq(it.key, val)} testIdBase={`wah-eq-${it.key}-toggle`} />
              </div>
            );
          })}
        </div>
        <Inp label="Location of Rescue Equipment on Site" value={equipmentLocation} onChange={setEquipmentLocation} testId="wah-equipment-location" helper="Where is the rescue equipment stored?" />
        <div className="mt-3">
          <Inp label="Emergency Services Contact" value={emergencyContact} onChange={setEmergencyContact} testId="wah-emergency-contact" helper="Nearest hospital or ambulance rendezvous point" />
        </div>
      </Section>

      {/* SECTION 5 */}
      <Section title="Rescue Procedures" testId="wah-section-5">
        <div className="text-xs text-[#A19D94] mb-4">Document the step-by-step procedure for each scenario that applies to this job</div>

        <Area
          label="Scenario 1 — Worker Falls and is Suspended in Harness"
          value={scenario1}
          onChange={setScenario1}
          rows={8}
          testId="wah-scenario-1"
        />
        <Area
          label="Scenario 2 — Worker Falls and is Injured"
          value={scenario2}
          onChange={setScenario2}
          rows={7}
          testId="wah-scenario-2"
        />
        <Area
          label="Scenario 3 — Worker Suffers Medical Emergency at Height"
          value={scenario3}
          onChange={setScenario3}
          rows={6}
          testId="wah-scenario-3"
        />

        <label className="flex items-center gap-2 mb-3 mt-4 cursor-pointer" data-testid="wah-scenario-4-toggle-wrap">
          <input
            type="checkbox"
            className="accent-[#E8A020]"
            checked={showScenario4}
            onChange={(e) => setShowScenario4(e.target.checked)}
            data-testid="wah-scenario-4-toggle"
          />
          <span className="text-sm text-[#F0EDE8]">Include Scenario 4 — Worker Falls Below Ground Level</span>
        </label>
        {showScenario4 && (
          <Area
            label="Scenario 4 — Worker Falls Below Ground Level"
            value={scenario4}
            onChange={setScenario4}
            rows={6}
            testId="wah-scenario-4"
          />
        )}
        <Area
          label="Any Additional Site-Specific Scenarios (optional)"
          value={extraScenarios}
          onChange={setExtraScenarios}
          testId="wah-extra-scenarios"
        />
      </Section>

      {/* SECTION 6 */}
      <Section title="Communication Plan" testId="wah-section-6">
        <Grid>
          <div>
            <Label>How will workers at height communicate with those below?</Label>
            <select
              value={commsMethod}
              onChange={(e) => setCommsMethod(e.target.value)}
              className="input-base"
              data-testid="wah-comms-method"
            >
              <option value="">— Choose —</option>
              {COMMS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          {commsMethod === "Other" && (
            <Inp label="Other (free text)" value={commsOther} onChange={setCommsOther} testId="wah-comms-other" />
          )}
          <Inp label="Signal or method to raise the alarm" value={alarmSignal} onChange={setAlarmSignal} testId="wah-alarm-signal" helper={`e.g. "Shout HELP three times", "Radio Channel 1"`} />
          <Inp label="Site assembly point / muster point"  value={musterPoint} onChange={setMusterPoint} testId="wah-muster" />
        </Grid>
      </Section>

      {/* SECTION 7 */}
      <Section title="Workers Briefed" testId="wah-section-7">
        <div className="text-xs text-[#A19D94] mb-3">
          All workers involved in the task must confirm they have read and understood this rescue plan.
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-[#706D66]">
              <tr>
                <th className="text-left py-2">Name</th>
                <th className="text-left">Role</th>
                <th className="text-left">Signed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w, idx) => (
                <tr key={w.id} className="border-t border-[#F0EDE8]/5" data-testid={`wah-worker-${idx}`}>
                  <td className="py-1 pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder="Full Name" value={w.name} onChange={(e) => updateWorker(w.id, "name", e.target.value)} data-testid={`wah-worker-${idx}-name`} />
                  </td>
                  <td className="pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder="Role" value={w.role} onChange={(e) => updateWorker(w.id, "role", e.target.value)} data-testid={`wah-worker-${idx}-role`} />
                  </td>
                  <td className="pr-2">
                    <button
                      type="button"
                      onClick={() => updateWorker(w.id, "signed", !w.signed)}
                      className="px-3 py-1 rounded text-xs uppercase tracking-widest transition"
                      style={{
                        background: w.signed ? "rgba(232,160,32,0.12)" : "transparent",
                        border: `1px solid ${w.signed ? "#E8A020" : "rgba(160,157,148,0.25)"}`,
                        color: w.signed ? "#E8A020" : "#A19D94",
                      }}
                      data-testid={`wah-worker-${idx}-signed`}
                    >
                      {w.signed ? "Signed" : "Pending"}
                    </button>
                  </td>
                  <td className="text-right">
                    <button onClick={() => removeWorker(w.id)} className="text-[#706D66] hover:text-red-400" data-testid={`wah-worker-${idx}-remove`}><Trash2 size={14}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addWorker} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="wah-add-worker">
          <Plus size={12}/> Add Worker
        </button>
      </Section>

      {/* SECTION 8 — AUTHORISATION */}
      <Section title="Plan Authorised by" testId="wah-section-8">
        <LiveSignatureBlock
          label="Authoriser signature"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="wah-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="wah-sig-date">
          Date: {ukDate(planDate) || "—"}
        </div>
        <div
          className="mt-4 p-4 rounded text-xs text-[#F0EDE8] leading-relaxed"
          style={{ border: "1px solid rgba(232,160,32,0.25)", background: "rgba(232,160,32,0.05)" }}
          data-testid="wah-legal-ref"
        >
          This rescue plan has been prepared in accordance with the Work at Height Regulations 2005.
          A rescue plan must be in place before work at height begins.
          Where fall arrest equipment is in use, this plan is a legal requirement.
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="wah-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Working at Height Rescue Plan</>}
      </button>

      {/* OUTPUT */}
      {result && (
        <div className="card-dark p-6 mt-6" data-testid="wah-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated rescue plan</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Working at Height Rescue Plan — ${project}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="wah-output">{result}</pre>
        </div>
      )}
    </div>
  );
}

// ---------- Small reusable bits ----------
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

function Label({ children }) {
  return <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">{children}</div>;
}

function Inp({ label, value, onChange, type = "text", testId, helper, readOnly }) {
  return (
    <label className="block">
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
    <label className="block mt-3">
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

function CheckboxGrid({ options, value, onChange, testIdBase }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3" data-testid={testIdBase}>
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
            data-testid={`${testIdBase}-${opt.replace(/\s+/g, "-").toLowerCase().replace(/[()/]/g, "")}`}
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
