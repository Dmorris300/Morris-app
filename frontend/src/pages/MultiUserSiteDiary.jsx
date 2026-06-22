import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, Users, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";
import DraftSaveButton from "../components/DraftSaveButton";
import useToolDraft from "../hooks/useToolDraft";

const TOOL_ID   = "multiuser-site-diary";
const TOOL_NAME = "Multi-User Site Diary";
const TOOL_INFO =
  "Daily site diary for subcontractor bosses running multiple gangs or teams on the same site. Each gang's activities are recorded separately, producing a structured daily record covering labour, progress, hours, materials and any issues across the whole operation.";

const isoToday = () => new Date().toISOString().slice(0, 10);

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const N = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const WEATHER_OPTIONS = [
  "Fine",
  "Overcast",
  "Light rain",
  "Heavy rain",
  "Cold",
  "Icy",
  "Hot",
  "Windy",
];

const SITE_STATUS_OPTIONS = [
  "Full operation",
  "Reduced operation",
  "Severely disrupted",
  "Site stopped",
];

const PROGRESS_OPTIONS = [
  "Ahead of programme",
  "On programme",
  "Slightly behind",
  "Significantly behind",
  "No progress today",
];

function makeGang() {
  return {
    id: crypto.randomUUID(),
    name: "",
    leader: "",
    workerCount: "",
    location: "",
    workDone: "",
    progress: "On programme",
    hoursWorked: "",
    issues: "",
    materials: "",
  };
}

export default function MultiUserSiteDiary() {
  const { user, refresh } = useAuth();

  // SECTION 1 — SITE DETAILS
  const [project, setProject]         = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [diaryDate, setDiaryDate]     = useState(isoToday());
  const [weather, setWeather]         = useState("Fine");
  const [siteStatus, setSiteStatus]   = useState("Full operation");

  // SECTION 2 — GANGS
  const [gangs, setGangs] = useState([makeGang()]);

  // SECTION 4 — OVERALL NOTES
  const [visitors, setVisitors]                 = useState("");
  const [instructions, setInstructions]         = useState("");
  const [overallNotes, setOverallNotes]         = useState("");

  // Output / sign-off
  const [infoOpen, setInfoOpen]         = useState(false);
  const [generating, setGenerating]     = useState(false);
  const [result, setResult]             = useState("");
  const [refNumber, setRefNumber]       = useState("");
  const [liveSignature, setLiveSignature] = useState("");

  // ---------- Draft save/resume ----------
  const getDraftData = () => ({
    project, siteAddress, diaryDate, weather, siteStatus, gangs,
    visitors, instructions, overallNotes, result, refNumber, liveSignature,
  });
  useToolDraft(TOOL_ID, (p) => {
    if (p.project !== undefined) setProject(p.project);
    if (p.siteAddress !== undefined) setSiteAddress(p.siteAddress);
    if (p.diaryDate !== undefined) setDiaryDate(p.diaryDate);
    if (p.weather !== undefined) setWeather(p.weather);
    if (p.siteStatus !== undefined) setSiteStatus(p.siteStatus);
    if (Array.isArray(p.gangs)) setGangs(p.gangs);
    if (p.visitors !== undefined) setVisitors(p.visitors);
    if (p.instructions !== undefined) setInstructions(p.instructions);
    if (p.overallNotes !== undefined) setOverallNotes(p.overallNotes);
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

  const updateGang = (id, field, value) =>
    setGangs((gs) => gs.map((g) => (g.id === id ? { ...g, [field]: value } : g)));
  const removeGang = (id) =>
    setGangs((gs) => gs.filter((g) => g.id !== id));
  const addGang = () => setGangs((gs) => [...gs, makeGang()]);

  const decorated = useMemo(
    () => gangs.map((g, i) => ({ ...g, gangNumber: i + 1 })),
    [gangs]
  );

  // Summary
  const summary = useMemo(() => {
    const totalGangs = decorated.length;
    const totalWorkers = decorated.reduce((s, g) => s + N(g.workerCount), 0);
    const totalHours = decorated.reduce((s, g) => s + N(g.hoursWorked), 0);
    return { totalGangs, totalWorkers, totalHours };
  }, [decorated]);

  const onGenerate = async () => {
    if (!project.trim()) { toast.error("Add the project name"); return; }
    const populated = decorated.filter((g) => (g.name || "").trim().length > 0 || (g.workDone || "").trim().length > 0);
    if (populated.length === 0) { toast.error("Add at least one gang with work carried out"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const gangsBlock = populated.map((g) => {
      return [
        `Gang ${g.gangNumber}.`,
        `Gang Name or Reference: ${g.name || "—"}`,
        `Gang Leader or Supervisor: ${g.leader || "—"}`,
        `Number of Workers: ${g.workerCount || "—"}`,
        `Location on Site: ${g.location || "—"}`,
        `Work Carried Out: ${g.workDone || "—"}`,
        `Progress Made: ${g.progress}`,
        `Hours Worked: ${g.hoursWorked || "—"}`,
        `Issues or Delays: ${g.issues || "—"}`,
        `Materials Used: ${g.materials || "—"}`,
      ].join(" | ");
    }).join("\n");

    const summaryBlock = [
      `Total Gangs on Site Today: ${summary.totalGangs}`,
      `Total Workers on Site Today: ${summary.totalWorkers}`,
      `Total Hours Worked Across All Gangs: ${summary.totalHours}`,
    ].join("\n   ");

    const overallNotesBlock = [
      `Visitors to Site Today: ${visitors || "—"}`,
      `Instructions Received Today: ${instructions || "—"}`,
      `Overall Site Notes: ${overallNotes || "—"}`,
    ].join("\n   ");

    const promptTemplate = `Produce a UK MULTI-USER SITE DIARY for one day. Plain direct construction English. No padding. No banned consultant words. Full words only — never use abbreviations such as 'N/A', 'TBC', 'qty', '&', 'inc.', 'excl.', 'approx.' or 'etc.'. This document is a contemporaneous daily record covering every gang or team on site.

1. HEADER — DOCUMENT REFERENCE: site diary. DATE: {diaryDateUk} in DD/MM/YYYY format.

2. TITLE — exactly: 'MULTI-USER SITE DIARY — {project} — {diaryDateUk}'.

3. SITE DETAILS — list on separate lines:
   Project Name: {project}
   Site Address: {siteAddress}
   Date: {diaryDateUk}
   Diary Completed by: {compiledByName}
   Position: {compiledByRole}
   Company: {companyName}
   Trade: {trade}
   Weather Conditions: {weather}
   Overall Site Status: {siteStatus}

4. GANG ACTIVITY LOG — print this header line then each gang entry below verbatim on its own line, preserving the pipe-delimited structure exactly as supplied. Separate gangs with a blank line:
{gangsBlock}

5. SITE SUMMARY — print on separate lines (use the values supplied — never recalculate):
   {summaryBlock}

6. OVERALL NOTES — print on separate lines:
   {overallNotesBlock}

7. COMPLETED BY — sign-off block:
   Diary Completed by: {compiledByName}
   Position: {compiledByRole}
   Company: {companyName}
   Date: {diaryDateUk}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

8. FOOTER — print verbatim on its own line:
   This site diary is a contemporaneous record of activities on site. It should be completed daily and retained for the duration of the project.

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Never invent gangs, workers, hours or activities. Use only the supplied gangs and the supplied summary block.
- Full words only — write every word out in full. Never abbreviate.
- Skip blank optional fields cleanly. Use '—' only where supplied.
- No banned words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct. Reads as a real daily diary from a subcontractor boss to a principal contractor.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          diaryDateUk: ukDate(diaryDate),
          project,
          siteAddress: siteAddress || "—",
          companyName: user?.companyName || "—",
          trade: user?.trade || "—",
          weather,
          siteStatus,
          gangsBlock,
          summaryBlock,
          overallNotesBlock,
          compiledByName: user?.fullName || "—",
          compiledByRole: user?.signatureRole || "Director",
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Multi-User Site Diary generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Multi-User Site Diary — ${project || "project"} — ${ukDate(diaryDate)}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-multiuser-site-diary">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Contractors</div>
          <h1 className="font-display text-4xl md:text-5xl">Multi-User Site Diary</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="msd-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="msd-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 — SITE DETAILS */}
      <Section title="Site Details" testId="msd-section-1" icon={<ClipboardList size={14}/>}>
        <Grid>
          <Inp label="Project Name" value={project} onChange={setProject} testId="msd-project" />
          <Inp label="Site Address" value={siteAddress} onChange={setSiteAddress} testId="msd-site" />
          <Inp label="Date" type="date" value={diaryDate} onChange={setDiaryDate} testId="msd-date" helper="Defaults to today" />
          <ReadOnly label="Diary completed by" value={user?.fullName || "—"} testId="msd-completed-by" />
          <Drop label="Weather Conditions" value={weather} onChange={setWeather} options={WEATHER_OPTIONS} testId="msd-weather" />
          <Drop label="Overall Site Status" value={siteStatus} onChange={setSiteStatus} options={SITE_STATUS_OPTIONS} testId="msd-site-status" />
        </Grid>
      </Section>

      {/* SECTION 2 — GANG ACTIVITY LOG */}
      <Section title="Gang Activity Log" testId="msd-section-2" icon={<Users size={14}/>}>
        <div className="grid gap-4">
          {decorated.map((g, idx) => (
            <div
              key={g.id}
              className="rounded p-4 md:p-5"
              style={{
                background: "rgba(15,15,15,0.5)",
                border: "1px solid rgba(160,157,148,0.18)",
              }}
              data-testid={`msd-gang-${idx}`}
            >
              <div className="flex items-center justify-between mb-4">
                <div
                  className="text-xs uppercase tracking-widest text-[#E8A020] font-mono"
                  data-testid={`msd-gang-${idx}-label`}
                >
                  Gang {g.gangNumber}
                  {g.name ? <span className="text-[#706D66] ml-2 normal-case">— {g.name}</span> : null}
                </div>
                <button
                  onClick={() => removeGang(g.id)}
                  className="text-[#706D66] hover:text-red-400 flex items-center gap-1 text-xs"
                  data-testid={`msd-gang-${idx}-remove`}
                >
                  <Trash2 size={14}/> Remove
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2 lg:col-span-3">
                  <Inp
                    label="Gang Name or Reference"
                    value={g.name}
                    onChange={(v) => updateGang(g.id, "name", v)}
                    placeholder='e.g. "Gang 1 — First Fix", "Ductwork Team"'
                    testId={`msd-gang-${idx}-name`}
                  />
                </div>
                <Inp label="Gang Leader or Supervisor" value={g.leader} onChange={(v) => updateGang(g.id, "leader", v)} testId={`msd-gang-${idx}-leader`} />
                <Inp label="Number of Workers" type="number" value={g.workerCount} onChange={(v) => updateGang(g.id, "workerCount", v)} testId={`msd-gang-${idx}-workers`} />
                <Inp label="Hours Worked" type="number" value={g.hoursWorked} onChange={(v) => updateGang(g.id, "hoursWorked", v)} testId={`msd-gang-${idx}-hours`} />
                <div className="sm:col-span-2 lg:col-span-3">
                  <Inp
                    label="Location on Site"
                    value={g.location}
                    onChange={(v) => updateGang(g.id, "location", v)}
                    placeholder="Where did this gang work today?"
                    testId={`msd-gang-${idx}-location`}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Area
                    label="Work Carried Out"
                    value={g.workDone}
                    onChange={(v) => updateGang(g.id, "workDone", v)}
                    placeholder="Describe what was done"
                    testId={`msd-gang-${idx}-work`}
                  />
                </div>
                <Drop label="Progress Made" value={g.progress} onChange={(v) => updateGang(g.id, "progress", v)} options={PROGRESS_OPTIONS} testId={`msd-gang-${idx}-progress`} />
                <div className="sm:col-span-2 lg:col-span-3">
                  <Area
                    label="Issues or Delays (optional)"
                    value={g.issues}
                    onChange={(v) => updateGang(g.id, "issues", v)}
                    placeholder="Any problems, delays, or matters to note"
                    testId={`msd-gang-${idx}-issues`}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Inp label="Materials Used (optional)" value={g.materials} onChange={(v) => updateGang(g.id, "materials", v)} testId={`msd-gang-${idx}-materials`} />
                </div>
              </div>

              <div
                className="mt-4 pt-4 flex items-center justify-between"
                style={{ borderTop: "1px solid rgba(160,157,148,0.18)" }}
              >
                <div className="text-[10px] uppercase tracking-widest text-[#706D66]">Progress</div>
                <div className="font-display text-lg text-[#E8A020]" data-testid={`msd-gang-${idx}-progress-label`}>
                  {g.progress}
                </div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={addGang} className="btn-secondary flex items-center gap-2 text-xs mt-4" data-testid="msd-add-gang">
          <Plus size={12}/> Add Gang
        </button>
      </Section>

      {/* SECTION 3 — SITE SUMMARY */}
      <Section title="Site Summary" testId="msd-section-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <SummaryStat label="Total Gangs on Site Today"           value={summary.totalGangs}   testId="msd-sum-gangs" />
          <SummaryStat label="Total Workers on Site Today"         value={summary.totalWorkers} testId="msd-sum-workers" />
          <SummaryStat label="Total Hours Worked Across All Gangs" value={summary.totalHours}   testId="msd-sum-hours" highlight />
        </div>
      </Section>

      {/* SECTION 4 — OVERALL NOTES */}
      <Section title="Overall Notes" testId="msd-section-4">
        <Inp label="Visitors to Site Today (optional)" value={visitors} onChange={setVisitors} placeholder="Any client, contractor, or inspector visits" testId="msd-visitors" />
        <div className="mt-4 grid gap-4">
          <Area label="Instructions Received Today (optional)" value={instructions} onChange={setInstructions} placeholder="Any verbal or written instructions received" testId="msd-instructions" />
          <Area label="Overall Site Notes (optional)" value={overallNotes} onChange={setOverallNotes} testId="msd-overall-notes" />
        </div>
      </Section>

      {/* SIGN OFF */}
      <Section title="Diary completed by — Sign Off" testId="msd-section-5">
        <LiveSignatureBlock
          label="Diary completed by"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="msd-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="msd-sig-date">
          Date: {ukDate(diaryDate) || "—"}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="msd-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Multi-User Site Diary</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="msd-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated diary</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Multi-User Site Diary — ${project} — ${ukDate(diaryDate)}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="msd-output">{result}</pre>
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
function SummaryStat({ label, value, testId, highlight }) {
  return (
    <div
      data-testid={testId}
      className="p-4 rounded"
      style={{
        background: highlight ? "rgba(232,160,32,0.10)" : "rgba(15,15,15,0.6)",
        border: `1px solid ${highlight ? "#E8A020" : "rgba(160,157,148,0.18)"}`,
      }}
    >
      <div className="text-[10px] uppercase tracking-widest text-[#706D66] mb-1">{label}</div>
      <div className="font-display text-3xl" style={{ color: highlight ? "#E8A020" : "#F0EDE8" }}>{value}</div>
    </div>
  );
}
