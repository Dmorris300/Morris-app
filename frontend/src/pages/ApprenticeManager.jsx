import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, AlertTriangle, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID = "apprentice-manager";
const TOOL_NAME = "Apprentice Manager";
const TOOL_INFO =
  "Live tracker for an apprentice you are managing. Records on the job competencies, off the job training hours (20% legal minimum), and progress against the apprenticeship standard.";

const isoToday = () => new Date().toISOString().slice(0, 10);

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const YEAR_OPTIONS    = ["Year 1", "Year 2", "Year 3", "Year 4"];
const PERIOD_OPTIONS  = ["Monthly", "Quarterly", "Six monthly", "Annual"];
const COMPETENT_OPTIONS = ["Yes", "Not yet", "Progressing"];

// Off the job legal minimum (20%) and standard working week (30 hours per gov.uk apprentice guidance)
const OTJ_MIN_PERCENT     = 20;
const STANDARD_WEEK_HOURS = 30;

const N = (v) => parseFloat(v) || 0;

function makeSkill() {
  return { id: crypto.randomUUID(), skill: "", dateAchieved: "", competent: "Progressing", notes: "" };
}
function makeTraining() {
  return { id: crypto.randomUUID(), date: "", activity: "", hours: "", deliveredBy: "" };
}

export default function ApprenticeManager() {
  const { user, refresh } = useAuth();

  // SECTION 1
  const [name, setName]                         = useState("");
  const [dob, setDob]                           = useState("");
  const [standard, setStandard]                 = useState("");
  const [trainingProvider, setTrainingProvider] = useState("");
  const [startDate, setStartDate]               = useState("");
  const [endDate, setEndDate]                   = useState("");
  const [year, setYear]                         = useState("");
  const [weeklyWage, setWeeklyWage]             = useState("");

  // SECTION 2
  const [reviewDate, setReviewDate]   = useState(isoToday());
  const [reviewPeriod, setReviewPeriod] = useState("");
  const [reviewerName, setReviewerName] = useState(user?.fullName || "");

  // SECTION 3
  const [skills, setSkills] = useState([makeSkill()]);

  // SECTION 4
  const [trainings, setTrainings] = useState([makeTraining()]);

  // Sign-off / output
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

  const updateSkill = (id, field, value) =>
    setSkills((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const removeSkill = (id) =>
    setSkills((rs) => rs.filter((r) => r.id !== id));
  const addSkill = () => setSkills((rs) => [...rs, makeSkill()]);

  const updateTraining = (id, field, value) =>
    setTrainings((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const removeTraining = (id) =>
    setTrainings((rs) => rs.filter((r) => r.id !== id));
  const addTraining = () => setTrainings((rs) => [...rs, makeTraining()]);

  // OTJ training calculations — % of total weeks worked × standard week hours
  const otjSummary = useMemo(() => {
    const totalHours = trainings.reduce((s, t) => s + N(t.hours), 0);
    if (!startDate || !reviewDate || totalHours <= 0) {
      return { totalHours, percent: 0, weeksElapsed: 0, expected: 0 };
    }
    const sd = new Date(startDate);
    const rd = new Date(reviewDate);
    const weeks = Math.max(1, Math.floor((rd - sd) / (1000 * 60 * 60 * 24 * 7)));
    const expectedWorkingHours = weeks * STANDARD_WEEK_HOURS;
    const percent = expectedWorkingHours > 0
      ? +(totalHours / expectedWorkingHours * 100).toFixed(1)
      : 0;
    return { totalHours, percent, weeksElapsed: weeks, expected: expectedWorkingHours };
  }, [trainings, startDate, reviewDate]);

  const otjBelow = otjSummary.percent > 0 && otjSummary.percent < OTJ_MIN_PERCENT;

  const onGenerate = async () => {
    if (!name.trim())          { toast.error("Add the apprentice's name"); return; }
    if (!reviewDate)           { toast.error("Set a review date"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const skillsBlock = skills
      .filter((s) => s.skill.trim())
      .map((s, i) => `   ${i + 1}. Skill: ${s.skill} | Date Achieved: ${ukDate(s.dateAchieved) || "—"} | Assessed as Competent: ${s.competent} | Notes: ${s.notes || "—"}`)
      .join("\n") || "   (No skills recorded this period)";

    const trainingBlock = trainings
      .filter((t) => t.activity.trim() || N(t.hours) > 0)
      .map((t, i) => `   ${i + 1}. Date: ${ukDate(t.date) || "—"} | Activity: ${t.activity || "—"} | Hours: ${t.hours || "0"} | Delivered by: ${t.deliveredBy || "—"}`)
      .join("\n") || "   (No off the job training recorded this period)";

    const promptTemplate = `Produce a UK APPRENTICE PROGRESS REVIEW. Plain direct construction English. No padding. No banned consultant words. Formal contemporaneous record used to evidence apprenticeship compliance and progress.

1. HEADER — DOCUMENT REFERENCE, DATE (use {reviewDate} in DD/MM/YYYY format).

2. TITLE — exactly: 'APPRENTICE PROGRESS REVIEW — {name} — {reviewDate}'.

3. APPRENTICE DETAILS — list on separate lines (skip blanks cleanly):
   Apprentice Name: {name}
   Date of Birth: {dob}
   Apprenticeship Standard / Course: {standard}
   Training Provider / College: {trainingProvider}
   Apprenticeship Start Date: {startDate}
   Expected End Date / EPA Date: {endDate}
   Current Year of Apprenticeship: {year}
   Current Weekly Wage: £{weeklyWage}

4. REVIEW PERIOD — list on separate lines:
   Review Date: {reviewDate}
   Review Period: {reviewPeriod}
   Supervisor / Reviewer Name: {reviewerName}

5. ON THE JOB SKILLS LOG — print this header line then the skills block verbatim, one per line, preserving the pipe-delimited structure:
{skillsBlock}

6. OFF THE JOB TRAINING LOG — print this header line then the training block verbatim, one session per line, preserving the pipe-delimited structure:
{trainingBlock}

7. OFF THE JOB TRAINING SUMMARY — list on separate lines:
   Total off the job training hours logged: {otjHours}
   Weeks elapsed since apprenticeship start: {otjWeeks}
   Expected working hours over period (30 hours per week): {otjExpected}
   Percentage of working hours in off the job training: {otjPercent}%
   Legal minimum: 20%
   {otjStatusLine}

8. COMPLIANCE NOTE — print verbatim as one paragraph:
   Apprentices must spend a minimum of 20% of their working hours in off the job training. This is a legal requirement of the apprenticeship. Check the current National Minimum Wage for apprentices at gov.uk.

9. SIGN-OFF — supervisor sign-off:
   Reviewer: {reviewerName}
   Date: {reviewDate}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

10. FOOTER — print verbatim on its own line:
    This review should be retained with the apprenticeship file and shared with the training provider.

Rules:
- Use DD/MM/YYYY for every date. Never YYYY-MM-DD.
- Never invent skills or training sessions. Use only the supplied rows.
- Never use abbreviations such as 'N/A', 'TBC' or '&'. Write words in full.
- Skip blank fields cleanly. Use '—' only where supplied.
- No banned words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          name,
          dob: ukDate(dob),
          standard,
          trainingProvider,
          startDate: ukDate(startDate),
          endDate: ukDate(endDate),
          year,
          weeklyWage: weeklyWage || "—",
          reviewDate: ukDate(reviewDate),
          reviewPeriod,
          reviewerName,
          skillsBlock,
          trainingBlock,
          otjHours: String(otjSummary.totalHours),
          otjWeeks: String(otjSummary.weeksElapsed),
          otjExpected: String(otjSummary.expected),
          otjPercent: String(otjSummary.percent),
          otjStatusLine: otjBelow
            ? "WARNING: Off the job training is currently below the 20% legal minimum. Increase off the job training hours to remain compliant."
            : (otjSummary.percent >= OTJ_MIN_PERCENT
                ? "Status: Meeting the 20% legal minimum."
                : "Status: Insufficient data to calculate."),
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Apprentice Progress Review generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Apprentice Progress Review — ${name || "apprentice"}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-apprentice-manager">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Sole Trader</div>
          <h1 className="font-display text-4xl md:text-5xl">Apprentice Manager</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="am-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="am-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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
      <Section title="Apprentice Details" testId="am-section-1" icon={<GraduationCap size={14}/>}>
        <Grid>
          <Inp label="Apprentice Name" value={name} onChange={setName} testId="am-name" />
          <Inp label="Date of Birth" value={dob} onChange={setDob} type="date" testId="am-dob" />
          <Inp label="Apprenticeship Standard / Course" value={standard} onChange={setStandard} testId="am-standard" placeholder={`e.g. "Construction Contracting Operations"`} />
          <Inp label="Training Provider / College" value={trainingProvider} onChange={setTrainingProvider} testId="am-provider" />
          <Inp label="Apprenticeship Start Date" value={startDate} onChange={setStartDate} type="date" testId="am-start-date" />
          <Inp label="Expected End Date / EPA Date" value={endDate} onChange={setEndDate} type="date" testId="am-end-date" />
          <Drop label="Current Year of Apprenticeship" value={year} onChange={setYear} options={YEAR_OPTIONS} testId="am-year" />
          <Inp label="Current Weekly Wage (£)" value={weeklyWage} onChange={setWeeklyWage} type="number" testId="am-wage" helper="Check the current National Minimum Wage for apprentices at gov.uk" />
        </Grid>
      </Section>

      {/* SECTION 2 */}
      <Section title="Progress Review" testId="am-section-2">
        <Grid>
          <Inp label="Review Date" value={reviewDate} onChange={setReviewDate} type="date" testId="am-review-date" />
          <Drop label="Review Period" value={reviewPeriod} onChange={setReviewPeriod} options={PERIOD_OPTIONS} testId="am-review-period" />
          <Inp label="Supervisor / Reviewer Name" value={reviewerName} onChange={setReviewerName} testId="am-reviewer" helper="Auto-populated from your profile. Edit if needed." />
        </Grid>
      </Section>

      {/* SECTION 3 — SKILLS */}
      <Section title="On the Job Skills Log" testId="am-section-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-[#706D66]">
              <tr>
                <th className="text-left py-2 w-2/5">Skill / Task</th>
                <th className="text-left">Date Achieved</th>
                <th className="text-left">Assessed as Competent?</th>
                <th className="text-left">Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {skills.map((s, idx) => (
                <tr key={s.id} className="border-t border-[#F0EDE8]/5 align-top" data-testid={`am-skill-${idx}`}>
                  <td className="py-1 pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder={`e.g. "Installed first fix ductwork unaided"`} value={s.skill} onChange={(e) => updateSkill(s.id, "skill", e.target.value)} data-testid={`am-skill-${idx}-text`} />
                  </td>
                  <td className="pr-2">
                    <input type="date" className="input-base !py-1 !text-sm" value={s.dateAchieved} onChange={(e) => updateSkill(s.id, "dateAchieved", e.target.value)} data-testid={`am-skill-${idx}-date`} />
                  </td>
                  <td className="pr-2">
                    <select className="input-base !py-1 !text-sm" value={s.competent} onChange={(e) => updateSkill(s.id, "competent", e.target.value)} data-testid={`am-skill-${idx}-competent`}>
                      {COMPETENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder="Notes" value={s.notes} onChange={(e) => updateSkill(s.id, "notes", e.target.value)} data-testid={`am-skill-${idx}-notes`} />
                  </td>
                  <td className="text-right">
                    <button onClick={() => removeSkill(s.id)} className="text-[#706D66] hover:text-red-400" data-testid={`am-skill-${idx}-remove`}><Trash2 size={14}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addSkill} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="am-add-skill">
          <Plus size={12}/> Add Skill
        </button>
      </Section>

      {/* SECTION 4 — OTJ TRAINING */}
      <Section title="Off the Job Training Log" testId="am-section-4">
        <div
          className="mb-4 p-3 rounded flex items-start gap-2"
          style={{ border: "1px solid rgba(232,160,32,0.25)", background: "rgba(232,160,32,0.05)" }}
          data-testid="am-otj-note"
        >
          <Info size={14} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
          <div className="text-xs text-[#A19D94] leading-relaxed">
            Apprentices must spend a minimum of <span className="text-[#E8A020] font-semibold">20% of their working hours</span> in off the job training.
            This is a legal requirement of the apprenticeship.
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-[#706D66]">
              <tr>
                <th className="text-left py-2">Date</th>
                <th className="text-left w-2/5">Training Activity</th>
                <th className="text-right">Hours</th>
                <th className="text-left">Delivered by</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {trainings.map((t, idx) => (
                <tr key={t.id} className="border-t border-[#F0EDE8]/5 align-top" data-testid={`am-tr-${idx}`}>
                  <td className="py-1 pr-2">
                    <input type="date" className="input-base !py-1 !text-sm" value={t.date} onChange={(e) => updateTraining(t.id, "date", e.target.value)} data-testid={`am-tr-${idx}-date`} />
                  </td>
                  <td className="pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder={`e.g. "College day — Health and Safety unit"`} value={t.activity} onChange={(e) => updateTraining(t.id, "activity", e.target.value)} data-testid={`am-tr-${idx}-activity`} />
                  </td>
                  <td className="pr-1">
                    <input type="number" step="0.5" className="input-base !py-1 !text-sm text-right" value={t.hours} onChange={(e) => updateTraining(t.id, "hours", e.target.value)} data-testid={`am-tr-${idx}-hours`} />
                  </td>
                  <td className="pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder={`e.g. "College", "Employer"`} value={t.deliveredBy} onChange={(e) => updateTraining(t.id, "deliveredBy", e.target.value)} data-testid={`am-tr-${idx}-by`} />
                  </td>
                  <td className="text-right">
                    <button onClick={() => removeTraining(t.id)} className="text-[#706D66] hover:text-red-400" data-testid={`am-tr-${idx}-remove`}><Trash2 size={14}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addTraining} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="am-add-tr">
          <Plus size={12}/> Add Training Session
        </button>

        {/* OTJ Running total */}
        <div className="mt-5 grid sm:grid-cols-2 gap-3">
          <Stat label="Total off the job training hours logged" value={String(otjSummary.totalHours)} testId="am-otj-hours" />
          <Stat
            label={`Of working hours (min required: ${OTJ_MIN_PERCENT}%)`}
            value={otjSummary.percent ? `${otjSummary.percent}%` : "—"}
            testId="am-otj-percent"
            warn={otjBelow}
          />
        </div>
        {otjBelow && (
          <div
            className="mt-3 p-3 rounded flex items-start gap-2"
            style={{ border: "1px solid #E8A020", background: "rgba(232,160,32,0.08)" }}
            data-testid="am-otj-warning"
          >
            <AlertTriangle size={16} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
            <div className="text-xs text-[#F0EDE8] leading-relaxed">
              Off the job training is currently below the 20% legal minimum. Increase off the job training hours to remain compliant with apprenticeship rules.
            </div>
          </div>
        )}
        {otjSummary.weeksElapsed > 0 && (
          <div className="text-[10px] text-[#706D66] mt-2">
            Based on {otjSummary.weeksElapsed} weeks elapsed since the apprenticeship start date and a {STANDARD_WEEK_HOURS}-hour standard working week
            (expected working hours: {otjSummary.expected}).
          </div>
        )}
      </Section>

      {/* SIGN-OFF */}
      <Section title="Sign Off" testId="am-section-signoff">
        <LiveSignatureBlock
          label="Reviewer signature"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="am-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="am-sig-date">
          Date: {ukDate(reviewDate) || "—"}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="am-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Apprentice Progress Review</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="am-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated review</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Apprentice Progress Review — ${name}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="am-output">{result}</pre>
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
        <option value="">— Choose —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
function Stat({ label, value, testId, warn }) {
  return (
    <div
      data-testid={testId}
      className="p-4 rounded"
      style={{
        background: warn ? "rgba(232,160,32,0.10)" : "rgba(15,15,15,0.6)",
        border: `1px solid ${warn ? "#E8A020" : "rgba(160,157,148,0.18)"}`,
      }}
    >
      <div className="text-[10px] uppercase tracking-widest text-[#706D66] mb-1">{label}</div>
      <div className="font-display text-2xl" style={{ color: warn ? "#E8A020" : "#F0EDE8" }}>{value}</div>
    </div>
  );
}
