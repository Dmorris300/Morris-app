import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, NotebookText } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID = "meeting-notes";
const TOOL_NAME = "Meeting Notes";
const TOOL_INFO =
  "Capture a clean professional record of a site meeting: attendees, points discussed, decisions made, actions arising, and the next meeting. Outputs a tidy minute set ready to circulate.";

const isoToday = () => new Date().toISOString().slice(0, 10);

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const LOCATION_OPTIONS = [
  "On site",
  "Office",
  "Phone call",
  "Video call (Teams / Zoom)",
  "Other",
];

function makeAttendee() {
  return { id: crypto.randomUUID(), name: "", company: "", role: "" };
}
function makeAction() {
  return { id: crypto.randomUUID(), action: "", responsible: "", dueDate: "" };
}

export default function MeetingNotes() {
  const { user, refresh } = useAuth();

  // Header section
  const [project, setProject]     = useState("");
  const [subject, setSubject]     = useState("");
  const [meetingDate, setMeetingDate] = useState(isoToday());
  const [meetingTime, setMeetingTime] = useState("");
  const [location, setLocation]   = useState("");
  const [locationOther, setLocationOther] = useState("");
  const [chairedBy, setChairedBy] = useState(user?.fullName || "");

  // Attendees
  const [attendees, setAttendees] = useState([makeAttendee()]);

  // Body
  const [pointsDiscussed, setPointsDiscussed] = useState("");
  const [decisions, setDecisions] = useState("");

  // Actions
  const [actions, setActions]   = useState([]);

  // Next meeting
  const [nextMeetingDate, setNextMeetingDate] = useState("");
  const [nextMeetingLocation, setNextMeetingLocation] = useState("");

  // sign-off / output
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

  const updateAttendee = (id, field, value) =>
    setAttendees((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const removeAttendee = (id) =>
    setAttendees((rs) => rs.filter((r) => r.id !== id));
  const addAttendee = () => setAttendees((rs) => [...rs, makeAttendee()]);

  const updateAction = (id, field, value) =>
    setActions((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const removeAction = (id) =>
    setActions((rs) => rs.filter((r) => r.id !== id));
  const addAction = () => setActions((rs) => [...rs, makeAction()]);

  const onGenerate = async () => {
    if (!subject.trim())          { toast.error("Add a meeting subject"); return; }
    if (!meetingDate)             { toast.error("Select a meeting date"); return; }
    if (!pointsDiscussed.trim())  { toast.error("Add the points discussed"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const locRendered = location === "Other" && locationOther ? `Other: ${locationOther}` : location;

    const attendeesBlock = attendees
      .filter((a) => a.name.trim() || a.company.trim() || a.role.trim())
      .map((a, i) => `   ${i + 1}. Name: ${a.name || "—"} | Company: ${a.company || "—"} | Role: ${a.role || "—"}`)
      .join("\n") || "   (No attendees recorded)";

    const actionsBlock = actions.length === 0
      ? "   (No actions recorded)"
      : actions
          .filter((x) => x.action.trim() || x.responsible.trim())
          .map((x, i) => `   ${i + 1}. Action: ${x.action || "—"} | Responsible Person: ${x.responsible || "—"} | Due Date: ${ukDate(x.dueDate) || "—"}`)
          .join("\n");

    const promptTemplate = `Produce a clean UK MEETING NOTES record. Plain direct construction English. No padding. No banned consultant words. This is a tidy professional minute set ready to circulate.

1. HEADER — DOCUMENT REFERENCE, DATE (use {meetingDate} in DD/MM/YYYY format for DATE).

2. TITLE — exactly: 'MEETING NOTES — {subject} — {meetingDate}'.

3. MEETING DETAILS — list on separate lines (skip any blank cleanly):
   Project / Job Reference: {project}
   Subject: {subject}
   Date: {meetingDate}
   Time: {meetingTime}
   Location / How Held: {locRendered}
   Chaired by: {chairedBy}

4. ATTENDEES — print this header line then the attendee block verbatim, one per line, preserving the pipe-delimited structure:
{attendeesBlock}

5. POINTS DISCUSSED — print verbatim from the supplied points. Keep numbered if numbered. Do not rewrite or shorten:
{pointsDiscussed}

6. DECISIONS MADE — print verbatim from the supplied decisions. Skip cleanly if blank:
{decisionsLine}

7. ACTIONS ARISING — print this header line then each action verbatim, one per line, preserving the pipe-delimited structure:
{actionsBlock}

8. NEXT MEETING — list on separate lines if supplied (skip cleanly otherwise):
   Next Meeting Date: {nextMeetingDate}
   Next Meeting Location / Format: {nextMeetingLocation}

9. SIGN-OFF — single chair sign-off:
   Chaired by: {chairedBy}
   Date: {meetingDate}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

10. FOOTER — print verbatim on its own paragraph:
    These notes are a record of the meeting and should be circulated to all attendees within 24 hours. Any corrections should be notified within 5 working days.

Rules:
- Use DD/MM/YYYY for every date. Never YYYY-MM-DD.
- Never invent attendees, actions or decisions. Use only the supplied data.
- Never use abbreviations such as 'N/A', 'TBC' or '&'. Write words in full.
- Skip blank fields cleanly. Do not print '—' for whole lines.
- No banned words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          project,
          subject,
          meetingDate: ukDate(meetingDate),
          meetingTime,
          locRendered,
          chairedBy,
          attendeesBlock,
          pointsDiscussed,
          decisionsLine: decisions ? decisions : "",
          actionsBlock,
          nextMeetingDate: ukDate(nextMeetingDate),
          nextMeetingLocation,
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Meeting notes generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Meeting Notes — ${subject || "meeting"}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-meeting-notes">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Site Tools</div>
          <h1 className="font-display text-4xl md:text-5xl">Meeting Notes</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="mn-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="mn-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* MEETING DETAILS */}
      <Section title="Meeting Details" testId="mn-section-details" icon={<NotebookText size={14}/>}>
        <Grid>
          <Inp label="Project Name / Job Reference" value={project} onChange={setProject} testId="mn-project" />
          <Inp label="Meeting Subject"             value={subject} onChange={setSubject} testId="mn-subject" />
          <Inp label="Date"                        value={meetingDate} onChange={setMeetingDate} type="date" testId="mn-date" />
          <Inp label="Time of Meeting"             value={meetingTime} onChange={setMeetingTime} type="time" testId="mn-time" />
          <Drop label="Location / How Held"        value={location} onChange={setLocation} options={LOCATION_OPTIONS} testId="mn-location" />
          {location === "Other" && (
            <Inp label="Other (free text)"         value={locationOther} onChange={setLocationOther} testId="mn-location-other" />
          )}
          <Inp label="Chaired by"                  value={chairedBy} onChange={setChairedBy} testId="mn-chaired-by" helper="Auto-populated from your profile. Edit if needed." />
        </Grid>
      </Section>

      {/* ATTENDEES */}
      <Section title="Attendees" testId="mn-section-attendees">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-[#706D66]">
              <tr>
                <th className="text-left py-2">Name</th>
                <th className="text-left">Company</th>
                <th className="text-left">Role</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {attendees.map((a, idx) => (
                <tr key={a.id} className="border-t border-[#F0EDE8]/5" data-testid={`mn-att-${idx}`}>
                  <td className="py-1 pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder="Full Name" value={a.name} onChange={(e) => updateAttendee(a.id, "name", e.target.value)} data-testid={`mn-att-${idx}-name`} />
                  </td>
                  <td className="pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder="Company" value={a.company} onChange={(e) => updateAttendee(a.id, "company", e.target.value)} data-testid={`mn-att-${idx}-company`} />
                  </td>
                  <td className="pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder="Role" value={a.role} onChange={(e) => updateAttendee(a.id, "role", e.target.value)} data-testid={`mn-att-${idx}-role`} />
                  </td>
                  <td className="text-right">
                    <button onClick={() => removeAttendee(a.id)} className="text-[#706D66] hover:text-red-400" data-testid={`mn-att-${idx}-remove`}><Trash2 size={14}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addAttendee} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="mn-add-attendee">
          <Plus size={12}/> Add Attendee
        </button>
      </Section>

      {/* POINTS DISCUSSED */}
      <Section title="Points Discussed" testId="mn-section-points">
        <textarea
          rows={7}
          value={pointsDiscussed}
          onChange={(e) => setPointsDiscussed(e.target.value)}
          className="input-base resize-y"
          placeholder="Capture what was talked through. Number items if useful."
          data-testid="mn-points-discussed"
        />
      </Section>

      {/* DECISIONS */}
      <Section title="Decisions Made" testId="mn-section-decisions">
        <textarea
          rows={4}
          value={decisions}
          onChange={(e) => setDecisions(e.target.value)}
          className="input-base resize-y"
          placeholder="Record any decisions agreed in this meeting (optional)"
          data-testid="mn-decisions"
        />
      </Section>

      {/* ACTIONS */}
      <Section title="Actions Arising" testId="mn-section-actions">
        {actions.length === 0 ? (
          <button onClick={addAction} className="btn-secondary flex items-center gap-2 text-xs" data-testid="mn-add-action-first">
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
                    <tr key={x.id} className="border-t border-[#F0EDE8]/5" data-testid={`mn-act-${idx}`}>
                      <td className="py-1 pr-2">
                        <input className="input-base !py-1 !text-sm" placeholder="Action" value={x.action} onChange={(e) => updateAction(x.id, "action", e.target.value)} data-testid={`mn-act-${idx}-text`} />
                      </td>
                      <td className="pr-2">
                        <input className="input-base !py-1 !text-sm" placeholder="Responsible" value={x.responsible} onChange={(e) => updateAction(x.id, "responsible", e.target.value)} data-testid={`mn-act-${idx}-resp`} />
                      </td>
                      <td className="pr-2">
                        <input type="date" className="input-base !py-1 !text-sm" value={x.dueDate} onChange={(e) => updateAction(x.id, "dueDate", e.target.value)} data-testid={`mn-act-${idx}-due`} />
                      </td>
                      <td className="text-right">
                        <button onClick={() => removeAction(x.id)} className="text-[#706D66] hover:text-red-400" data-testid={`mn-act-${idx}-remove`}><Trash2 size={14}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={addAction} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="mn-add-action">
              <Plus size={12}/> Add Action
            </button>
          </>
        )}
      </Section>

      {/* NEXT MEETING */}
      <Section title="Next Meeting (optional)" testId="mn-section-next">
        <Grid>
          <Inp label="Next Meeting Date"            value={nextMeetingDate}     onChange={setNextMeetingDate}     type="date" testId="mn-next-date" />
          <Inp label="Next Meeting Location / Format" value={nextMeetingLocation} onChange={setNextMeetingLocation} testId="mn-next-location" />
        </Grid>
      </Section>

      {/* SIGN-OFF */}
      <Section title="Sign Off" testId="mn-section-signoff">
        <LiveSignatureBlock
          label="Chair signature"
          subtitle="Your signature is stamped on the generated PDF as the meeting chair"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="mn-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="mn-sig-date">
          Date: {ukDate(meetingDate) || "—"}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="mn-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Meeting Notes</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="mn-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated minutes</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Meeting Notes — ${subject}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="mn-output">{result}</pre>
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

function Inp({ label, value, onChange, type = "text", testId, helper }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="input-base"
        data-testid={testId}
      />
      {helper && <div className="text-[10px] text-[#706D66] mt-1">{helper}</div>}
    </label>
  );
}

function Drop({ label, value, onChange, options, testId }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} className="input-base" data-testid={testId}>
        <option value="">— Choose —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
