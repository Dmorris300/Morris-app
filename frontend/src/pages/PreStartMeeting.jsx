import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID = "prestart-meeting";
const TOOL_NAME = "Pre-Start Meeting Checklist";
const TOOL_INFO =
  "Completed before works begin on a project or new phase. Confirms all parties have been briefed on scope, health and safety, site rules, programme, and responsibilities. Everyone present signs it off.";

const isoToday = () => new Date().toISOString().slice(0, 10);

// Convert ISO YYYY-MM-DD to UK display DD/MM/YYYY. Returns empty if not parseable.
function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const HS_ITEMS = [
  { key: "ramsInPlace",       label: "RAMS (Risk Assessment and Method Statement) in place and reviewed" },
  { key: "ramsCommunicated",  label: "RAMS communicated to all operatives" },
  { key: "induction",         label: "Site induction completed" },
  { key: "ppe",               label: "PPE requirements confirmed" },
  { key: "workingAtHeight",   label: "Working at height controls in place (if applicable)" },
  { key: "permitToWork",      label: "Permit to work required and obtained (if applicable)" },
  { key: "asbestos",          label: "Asbestos survey / register checked" },
  { key: "firstAid",          label: "First aid provision confirmed" },
  { key: "fireEvac",          label: "Fire evacuation procedure known" },
  { key: "emergencyContacts", label: "Emergency contact numbers obtained" },
  { key: "welfare",           label: "Welfare facilities confirmed (toilets, water, rest area)" },
];

const LOGISTICS_ITEMS = [
  { key: "siteAccess",       label: "Site access confirmed" },
  { key: "parkingDelivery",  label: "Parking / delivery access confirmed" },
  { key: "storage",          label: "Materials storage area agreed" },
  { key: "waste",            label: "Waste disposal arrangements confirmed" },
  { key: "hours",            label: "Working hours agreed" },
  { key: "noiseDust",        label: "Noise / dust restrictions noted" },
  { key: "neighbours",       label: "Neighbouring properties / occupants notified (if required)" },
  { key: "services",         label: "Services located (gas, electric, water, telecoms)" },
];

const TRI_OPTIONS = ["Yes", "No", "Not Applicable"];

function makeAttendee() {
  return { id: crypto.randomUUID(), name: "", company: "", role: "", signed: false };
}
function makeAction() {
  return { id: crypto.randomUUID(), action: "", responsible: "", dueDate: "" };
}

export default function PreStartMeeting() {
  const { user, refresh } = useAuth();

  // SECTION 1
  const [project, setProject]               = useState("");
  const [siteAddress, setSiteAddress]       = useState("");
  const [meetingDate, setMeetingDate]       = useState(isoToday());
  const [meetingTime, setMeetingTime]       = useState("");
  const [heldBy, setHeldBy]                 = useState(user?.fullName || "");
  const [mainContractor, setMainContractor] = useState("");

  // SECTION 2
  const [worksDescription, setWorksDescription] = useState("");
  const [plannedStart, setPlannedStart]         = useState("");
  const [plannedEnd, setPlannedEnd]             = useState("");
  const [contractRef, setContractRef]           = useState("");

  // SECTION 3 — HS checklist (tri-state)
  const [hsChecks, setHsChecks] = useState({});
  const [hsNotes, setHsNotes]   = useState("");

  // SECTION 4 — Logistics checklist (tri-state)
  const [logChecks, setLogChecks] = useState({});
  const [logNotes, setLogNotes]   = useState("");

  // SECTION 5 — Programme
  const [drawingsAvailable, setDrawingsAvailable] = useState(""); // Yes / No / Partial
  const [outstandingInfo, setOutstandingInfo]     = useState("");
  const [milestones, setMilestones]               = useState("");
  const [otherTrades, setOtherTrades]             = useState(""); // Yes / No
  const [whichTrades, setWhichTrades]             = useState("");
  const [interfaceCoordination, setInterfaceCoordination] = useState("");

  // SECTION 6 — Attendees
  const [attendees, setAttendees] = useState([makeAttendee()]);

  // SECTION 7 — Actions
  const [actions, setActions] = useState([]);

  // Output state
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

  const setHs = (key, val)  => setHsChecks((s)  => ({ ...s, [key]: val }));
  const setLog = (key, val) => setLogChecks((s) => ({ ...s, [key]: val }));

  const updateAttendee = (id, field, value) =>
    setAttendees((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const removeAttendee = (id) =>
    setAttendees((rows) => rows.filter((r) => r.id !== id));
  const addAttendee = () => setAttendees((rows) => [...rows, makeAttendee()]);

  const updateAction = (id, field, value) =>
    setActions((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const removeAction = (id) =>
    setActions((rows) => rows.filter((r) => r.id !== id));
  const addAction = () => setActions((rows) => [...rows, makeAction()]);

  const onGenerate = async () => {
    if (!project.trim())        { toast.error("Add a project name"); return; }
    if (!meetingDate)           { toast.error("Select a meeting date"); return; }
    if (attendees.length === 0) { toast.error("Add at least one attendee"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    // Build human-readable blocks for the AI prompt
    const hsBlock = HS_ITEMS.map((it) => {
      const v = hsChecks[it.key] || "Not Applicable";
      return `   ${it.label}: ${v}`;
    }).join("\n");

    const logBlock = LOGISTICS_ITEMS.map((it) => {
      const v = logChecks[it.key] || "Not Applicable";
      return `   ${it.label}: ${v}`;
    }).join("\n");

    const attendeesBlock = attendees
      .filter((a) => a.name.trim() || a.company.trim() || a.role.trim())
      .map((a, i) => `   ${i + 1}. Name: ${a.name || "—"} | Company: ${a.company || "—"} | Role: ${a.role || "—"} | Signature: ____________________________`)
      .join("\n") || "   (No attendees recorded)";

    const actionsBlock = actions.length === 0
      ? "   (No actions recorded)"
      : actions
          .filter((x) => x.action.trim() || x.responsible.trim())
          .map((x, i) => `   ${i + 1}. Action: ${x.action || "—"} | Responsible: ${x.responsible || "—"} | Due: ${ukDate(x.dueDate) || "—"}`)
          .join("\n");

    const promptTemplate = `Produce a UK PRE-START MEETING CHECKLIST. Plain direct construction English. No padding. No banned consultant words. This is a formal site record signed off by every attendee.

1. HEADER — DOCUMENT REFERENCE, DATE (use the meeting date {meetingDate} in DD/MM/YYYY format for DATE).

2. TITLE — exactly: 'PRE-START MEETING CHECKLIST — {project} — {meetingDate}'.

3. SECTION 1 — PROJECT DETAILS — list on separate lines (skip any that are blank cleanly):
   Project Name: {project}
   Site Address: {siteAddress}
   Date of Meeting: {meetingDate}
   Time of Meeting: {meetingTime}
   Meeting Held by: {heldBy}
   Main Contractor / Client: {mainContractor}

4. SECTION 2 — SCOPE OF WORKS — list on separate lines (skip blanks):
   Description of Works: {worksDescription}
   Trade / Discipline: {trade}
   Planned Start Date: {plannedStart}
   Planned Completion Date: {plannedEnd}
   Contract / Order Reference: {contractRef}

5. SECTION 3 — HEALTH AND SAFETY CHECKLIST — print this header, then each item below verbatim on its own line, showing the response after a colon:
{hsBlock}
   {hsNotesLine}

6. SECTION 4 — SITE LOGISTICS CHECKLIST — print this header, then each item below verbatim on its own line, showing the response after a colon:
{logBlock}
   {logNotesLine}

7. SECTION 5 — PROGRAMME AND INFORMATION — list on separate lines (skip blanks):
   All drawings and specifications available: {drawingsAvailable}
   Outstanding information required: {outstandingInfo}
   Key milestones or deadlines: {milestones}
   Other trades on site at same time: {otherTrades}
   {whichTradesLine}
   Interface / coordination required with other trades: {interfaceCoordination}

8. SECTION 6 — ATTENDEES — print exactly this header line then the table block verbatim. Keep one attendee per line with the same pipe-separated structure provided. Include a Signature column with an underline:
{attendeesBlock}

9. SECTION 7 — ACTIONS ARISING — print exactly this header line then the actions block verbatim, one per line:
{actionsBlock}

10. FOOTER — print verbatim on its own paragraph:
   By signing this document, attendees confirm they have been briefed on and understand the contents of this pre-start meeting.

11. SIGN-OFF — Meeting chair single sign-off:
   Meeting chair: {heldBy}
   Date: {meetingDate}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

Rules:
- Use the meeting date in DD/MM/YYYY format. Never YYYY-MM-DD in the document body.
- Never invent attendees, actions or checklist responses. Use only what is supplied.
- Never use abbreviations anywhere in the document. Always write 'and' instead of '&', 'Not Applicable' instead of 'N/A', 'Personal Protective Equipment' if the context calls for it (but 'PPE' is acceptable as the term used in industry).
- Skip any blank field cleanly. Do not print '—' or 'TBC' or '[Insert]'.
- No banned words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          project,
          siteAddress,
          meetingDate: ukDate(meetingDate),
          meetingTime,
          heldBy,
          mainContractor,
          worksDescription,
          trade: user?.trade || "",
          plannedStart: ukDate(plannedStart),
          plannedEnd: ukDate(plannedEnd),
          contractRef,
          hsBlock,
          hsNotesLine: hsNotes ? `Additional Health and Safety Notes: ${hsNotes}` : "",
          logBlock,
          logNotesLine: logNotes ? `Additional Site Notes: ${logNotes}` : "",
          drawingsAvailable,
          outstandingInfo,
          milestones,
          otherTrades,
          whichTradesLine: otherTrades === "Yes" && whichTrades ? `Which trades: ${whichTrades}` : "",
          interfaceCoordination,
          attendeesBlock,
          actionsBlock,
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      // recently used
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Pre-start meeting checklist generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Pre-Start Meeting — ${project || "site"}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-prestart-meeting">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Site Tools</div>
          <h1 className="font-display text-4xl md:text-5xl">Pre-Start Meeting Checklist</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="psm-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="psm-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 — PROJECT DETAILS */}
      <Section title="Project Details" testId="psm-section-1">
        <Grid>
          <Inp label="Project Name"             value={project}        onChange={setProject}        testId="psm-project" />
          <Inp label="Site Address"             value={siteAddress}    onChange={setSiteAddress}    testId="psm-site-address" />
          <Inp label="Date of Meeting"          value={meetingDate}    onChange={setMeetingDate}    type="date" testId="psm-meeting-date" />
          <Inp label="Time of Meeting"          value={meetingTime}    onChange={setMeetingTime}    type="time" testId="psm-meeting-time" />
          <Inp label="Meeting Held by"          value={heldBy}         onChange={setHeldBy}         testId="psm-held-by" helper="Auto-populated from your profile. Edit if needed." />
          <Inp label="Main Contractor / Client" value={mainContractor} onChange={setMainContractor} testId="psm-main-contractor" />
        </Grid>
      </Section>

      {/* SECTION 2 — SCOPE OF WORKS */}
      <Section title="Scope of Works" testId="psm-section-2">
        <Area
          label="Description of Works"
          helper="What work is being carried out? Be specific."
          value={worksDescription}
          onChange={setWorksDescription}
          testId="psm-works-description"
        />
        <Grid>
          <Inp label="Trade / Discipline (auto from profile)" value={user?.trade || ""} onChange={() => {}} readOnly testId="psm-trade" />
          <Inp label="Planned Start Date"             value={plannedStart} onChange={setPlannedStart} type="date" testId="psm-planned-start" />
          <Inp label="Planned Completion Date"        value={plannedEnd}   onChange={setPlannedEnd}   type="date" testId="psm-planned-end" />
          <Inp label="Contract / Order Reference (optional)" value={contractRef}  onChange={setContractRef}  testId="psm-contract-ref" />
        </Grid>
      </Section>

      {/* SECTION 3 — HEALTH AND SAFETY */}
      <Section title="Health and Safety" testId="psm-section-3" icon={<ListChecks size={14}/>}>
        <ChecklistGrid items={HS_ITEMS} values={hsChecks} onChange={setHs} testIdBase="psm-hs" />
        <Area
          label="Additional Health and Safety Notes (optional)"
          value={hsNotes}
          onChange={setHsNotes}
          testId="psm-hs-notes"
        />
      </Section>

      {/* SECTION 4 — SITE LOGISTICS */}
      <Section title="Site Logistics" testId="psm-section-4" icon={<ListChecks size={14}/>}>
        <ChecklistGrid items={LOGISTICS_ITEMS} values={logChecks} onChange={setLog} testIdBase="psm-log" />
        <Area
          label="Additional Site Notes (optional)"
          value={logNotes}
          onChange={setLogNotes}
          testId="psm-log-notes"
        />
      </Section>

      {/* SECTION 5 — PROGRAMME */}
      <Section title="Programme and Information" testId="psm-section-5">
        <div className="mb-4">
          <Label>All drawings and specifications available?</Label>
          <TriToggle
            options={["Yes", "No", "Partial"]}
            value={drawingsAvailable}
            onChange={setDrawingsAvailable}
            testIdBase="psm-drawings"
          />
        </div>
        <Area
          label="Outstanding information required (optional)"
          helper="List anything still needed before or during works"
          value={outstandingInfo}
          onChange={setOutstandingInfo}
          testId="psm-outstanding-info"
        />
        <Area
          label="Key milestones or deadlines (optional)"
          value={milestones}
          onChange={setMilestones}
          testId="psm-milestones"
        />
        <div className="mb-4">
          <Label>Other trades on site at same time?</Label>
          <TriToggle
            options={["Yes", "No"]}
            value={otherTrades}
            onChange={setOtherTrades}
            testIdBase="psm-other-trades"
          />
        </div>
        {otherTrades === "Yes" && (
          <Inp
            label="Which trades?"
            value={whichTrades}
            onChange={setWhichTrades}
            testId="psm-which-trades"
          />
        )}
        <Area
          label="Interface / coordination required with other trades (optional)"
          value={interfaceCoordination}
          onChange={setInterfaceCoordination}
          testId="psm-interface"
        />
      </Section>

      {/* SECTION 6 — ATTENDEES */}
      <Section title="Attendees" testId="psm-section-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-[#706D66]">
              <tr>
                <th className="text-left py-2">Name</th>
                <th className="text-left">Company</th>
                <th className="text-left">Role</th>
                <th className="text-left">Signed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {attendees.map((a, idx) => (
                <tr key={a.id} className="border-t border-[#F0EDE8]/5" data-testid={`psm-attendee-row-${idx}`}>
                  <td className="py-1 pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder="Full Name" value={a.name} onChange={(e) => updateAttendee(a.id, "name", e.target.value)} data-testid={`psm-attendee-${idx}-name`} />
                  </td>
                  <td className="pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder="Company" value={a.company} onChange={(e) => updateAttendee(a.id, "company", e.target.value)} data-testid={`psm-attendee-${idx}-company`} />
                  </td>
                  <td className="pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder="Role" value={a.role} onChange={(e) => updateAttendee(a.id, "role", e.target.value)} data-testid={`psm-attendee-${idx}-role`} />
                  </td>
                  <td className="pr-2">
                    <button
                      type="button"
                      onClick={() => updateAttendee(a.id, "signed", !a.signed)}
                      className="px-3 py-1 rounded text-xs uppercase tracking-widest transition"
                      style={{
                        background: a.signed ? "rgba(232,160,32,0.12)" : "transparent",
                        border: `1px solid ${a.signed ? "#E8A020" : "rgba(160,157,148,0.25)"}`,
                        color: a.signed ? "#E8A020" : "#A19D94",
                      }}
                      data-testid={`psm-attendee-${idx}-signed`}
                    >
                      {a.signed ? "Signed" : "Pending"}
                    </button>
                  </td>
                  <td className="text-right">
                    <button onClick={() => removeAttendee(a.id)} className="text-[#706D66] hover:text-red-400" data-testid={`psm-attendee-${idx}-remove`}><Trash2 size={14}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addAttendee} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="psm-add-attendee">
          <Plus size={12}/> Add Attendee
        </button>
      </Section>

      {/* SECTION 7 — ACTIONS */}
      <Section title="Actions Arising" testId="psm-section-7">
        {actions.length === 0 ? (
          <button onClick={addAction} className="btn-secondary flex items-center gap-2 text-xs" data-testid="psm-add-action-first">
            <Plus size={12}/> Add Action
          </button>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-widest text-[#706D66]">
                  <tr>
                    <th className="text-left py-2 w-2/5">Action</th>
                    <th className="text-left">Responsible Person</th>
                    <th className="text-left">Due Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((x, idx) => (
                    <tr key={x.id} className="border-t border-[#F0EDE8]/5" data-testid={`psm-action-row-${idx}`}>
                      <td className="py-1 pr-2">
                        <input className="input-base !py-1 !text-sm" placeholder="Action" value={x.action} onChange={(e) => updateAction(x.id, "action", e.target.value)} data-testid={`psm-action-${idx}-text`} />
                      </td>
                      <td className="pr-2">
                        <input className="input-base !py-1 !text-sm" placeholder="Responsible" value={x.responsible} onChange={(e) => updateAction(x.id, "responsible", e.target.value)} data-testid={`psm-action-${idx}-resp`} />
                      </td>
                      <td className="pr-2">
                        <input type="date" className="input-base !py-1 !text-sm" value={x.dueDate} onChange={(e) => updateAction(x.id, "dueDate", e.target.value)} data-testid={`psm-action-${idx}-due`} />
                      </td>
                      <td className="text-right">
                        <button onClick={() => removeAction(x.id)} className="text-[#706D66] hover:text-red-400" data-testid={`psm-action-${idx}-remove`}><Trash2 size={14}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={addAction} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="psm-add-action">
              <Plus size={12}/> Add Action
            </button>
          </>
        )}
      </Section>

      <LiveSignatureBlock
        label="Meeting chair signature"
        subtitle="Your signature is stamped on the generated PDF as the meeting chair"
        value={liveSignature}
        onChange={setLiveSignature}
        savedSignature={user?.signature}
        testIdPrefix="psm-sig"
      />

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="psm-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Pre-Start Meeting Checklist</>}
      </button>

      {/* OUTPUT */}
      {result && (
        <div className="card-dark p-6 mt-6" data-testid="psm-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated checklist</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Pre-Start Meeting — ${project}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="psm-output">{result}</pre>
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
    <label className="block mb-3">
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

function Area({ label, value, onChange, testId, helper }) {
  return (
    <label className="block mb-4">
      <Label>{label}</Label>
      <textarea
        rows={3}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="input-base resize-y"
        data-testid={testId}
      />
      {helper && <div className="text-[10px] text-[#706D66] mt-1">{helper}</div>}
    </label>
  );
}

function TriToggle({ options = TRI_OPTIONS, value, onChange, testIdBase }) {
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

function ChecklistGrid({ items, values, onChange, testIdBase }) {
  return (
    <div className="space-y-3 mb-4">
      {items.map((it) => {
        const v = values[it.key] || "";
        return (
          <div
            key={it.key}
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded"
            style={{ background: "rgba(15,15,15,0.6)", border: "1px solid rgba(160,157,148,0.12)" }}
            data-testid={`${testIdBase}-${it.key}`}
          >
            <div className="text-sm text-[#F0EDE8] flex-1">{it.label}</div>
            <TriToggle value={v} onChange={(val) => onChange(it.key, val)} testIdBase={`${testIdBase}-${it.key}-toggle`} />
          </div>
        );
      })}
    </div>
  );
}
