import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, AlertTriangle, CloudRain } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID = "weather-log";
const TOOL_NAME = "Weather Log";
const TOOL_INFO =
  "A live daily weather log. Add a row every working day to build contemporaneous evidence that supports delay claims and Extension of Time claims. A continuous log is far more credible than entries made only on bad days.";

const isoToday = () => new Date().toISOString().slice(0, 10);

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const WIND_OPTIONS         = ["Calm", "Light breeze", "Moderate wind", "Strong wind", "Gale force"];
const RAIN_OPTIONS         = ["None", "Light rain", "Heavy rain", "Torrential", "Hail", "Snow"];
const VISIBILITY_OPTIONS   = ["Good", "Reduced", "Poor", "Fog"];
const CONDITIONS_OPTIONS   = ["Fine", "Overcast", "Wet", "Icy", "Extremely hot", "Stormy"];
const PROCEED_OPTIONS      = ["Yes — full day", "Yes — reduced output", "Partially stopped", "Stopped entirely"];

function makeRow() {
  return {
    id: crypto.randomUUID(),
    date: isoToday(),
    temperature: "",
    wind: "",
    rain: "",
    visibility: "",
    conditions: "",
    proceed: "Yes — full day",
    hoursLost: "",
    impact: "",
    worksAffected: "",
  };
}

const N = (v) => parseFloat(v) || 0;

export default function WeatherLog() {
  const { user, refresh } = useAuth();

  // SECTION 1
  const [project, setProject]         = useState("");
  const [siteAddress, setSiteAddress] = useState("");

  // SECTION 2
  const [rows, setRows] = useState([makeRow()]);

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

  const updateRow = (id, field, value) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const removeRow = (id) =>
    setRows((rs) => rs.filter((r) => r.id !== id));
  const addRow = () => setRows((rs) => [...rs, makeRow()]);

  const summary = useMemo(() => {
    const pop = rows.filter((r) => r.date || r.impact || r.conditions);
    let stoppedFully = 0, stoppedPartial = 0, hoursLost = 0;
    let minDate = "", maxDate = "";
    for (const r of pop) {
      if (r.proceed === "Stopped entirely") stoppedFully++;
      if (r.proceed === "Partially stopped") stoppedPartial++;
      hoursLost += N(r.hoursLost);
      if (r.date) {
        if (!minDate || r.date < minDate) minDate = r.date;
        if (!maxDate || r.date > maxDate) maxDate = r.date;
      }
    }
    return {
      total: pop.length,
      stoppedFully,
      stoppedPartial,
      hoursLost,
      range: minDate && maxDate ? `${ukDate(minDate)} — ${ukDate(maxDate)}` : "—",
      first: minDate,
      last: maxDate,
    };
  }, [rows]);

  const onGenerate = async () => {
    if (!project.trim())                { toast.error("Add a project name"); return; }
    const pop = rows.filter((r) => r.date && (r.conditions || r.impact || r.proceed));
    if (pop.length === 0)               { toast.error("Add at least one day's entry"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const rowsBlock = pop
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r, i) => [
        `${i + 1}.`,
        `Date: ${ukDate(r.date)}`,
        `Temperature: ${r.temperature ? `${r.temperature}°C` : "—"}`,
        `Wind: ${r.wind || "—"}`,
        `Rainfall: ${r.rain || "—"}`,
        `Visibility: ${r.visibility || "—"}`,
        `Overall Conditions: ${r.conditions || "—"}`,
        `Did work proceed: ${r.proceed || "—"}`,
        `Hours Lost: ${r.hoursLost ? `${r.hoursLost} hours` : "—"}`,
        `Impact on Works: ${r.impact || "—"}`,
        `Works Affected: ${r.worksAffected || "—"}`,
      ].join(" | ")).join("\n");

    const promptTemplate = `Produce a UK WEATHER LOG. Plain direct construction English. No padding. No banned consultant words. This is a contemporaneous daily site record used as evidence for weather-related delays and Extension of Time claims.

1. HEADER — DOCUMENT REFERENCE, DATE (use today in DD/MM/YYYY format).

2. TITLE — exactly: 'WEATHER LOG — {project} — {dateRange}'.

3. PROJECT DETAILS — list on separate lines (skip blanks cleanly):
   Project Name: {project}
   Site Address: {siteAddress}
   Date Range Covered: {dateRange}

4. DAILY WEATHER LOG — print this header line then each daily entry verbatim, one day per line, preserving the pipe-delimited structure exactly as supplied. Do not rewrite or shorten:
{rowsBlock}

5. SUMMARY — list on separate lines exactly:
   Total days logged: {total}
   Total days work fully stopped: {stoppedFully}
   Total days work partially stopped: {stoppedPartial}
   Total hours lost to weather: {hoursLost}
   Date range covered: {dateRange}

6. FOOTER — print verbatim on its own paragraph:
   This log has been maintained on a daily basis as a contemporaneous record of weather conditions affecting the works. It is available for inspection upon request.

7. SIGN-OFF — single sign-off:
   Maintained by: {maintainedBy}
   Date: {today}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

Rules:
- Use DD/MM/YYYY for every date in the body. Never YYYY-MM-DD.
- Never invent days or values. Use only the supplied rows.
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
          project,
          siteAddress,
          today: ukDate(isoToday()),
          maintainedBy: user?.fullName || "",
          dateRange: summary.range,
          rowsBlock,
          total: String(summary.total),
          stoppedFully: String(summary.stoppedFully),
          stoppedPartial: String(summary.stoppedPartial),
          hoursLost: String(summary.hoursLost),
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Weather Log generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Weather Log — ${project || "project"}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-weather-log">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Site Tools</div>
          <h1 className="font-display text-4xl md:text-5xl">Weather Log</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="wl-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="wl-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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
      <Section title="Project Details" testId="wl-section-1">
        <div className="grid sm:grid-cols-2 gap-4">
          <Inp label="Project Name"  value={project}     onChange={setProject}     testId="wl-project" />
          <Inp label="Site Address"  value={siteAddress} onChange={setSiteAddress} testId="wl-site-address" />
        </div>
      </Section>

      {/* SECTION 2 — LOG */}
      <Section title="Daily Weather Log" testId="wl-section-2" icon={<CloudRain size={14}/>}>
        <div className="space-y-3">
          {rows.map((r, idx) => (
            <div
              key={r.id}
              className="p-4 rounded"
              style={{ background: "rgba(15,15,15,0.6)", border: "1px solid rgba(160,157,148,0.18)" }}
              data-testid={`wl-row-${idx}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] uppercase tracking-widest text-[#E8A020]">
                  Day #{idx + 1}{r.date ? ` — ${ukDate(r.date)}` : ""}
                </div>
                <button onClick={() => removeRow(r.id)} className="text-[#706D66] hover:text-red-400" data-testid={`wl-${idx}-remove`}><Trash2 size={14}/></button>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <Inp  label="Date"                   type="date"   value={r.date}        onChange={(v) => updateRow(r.id, "date", v)}        testId={`wl-${idx}-date`} />
                <Inp  label="Temperature (°C)"       type="number" value={r.temperature} onChange={(v) => updateRow(r.id, "temperature", v)} testId={`wl-${idx}-temperature`} />
                <Drop label="Wind Conditions"        value={r.wind}        onChange={(v) => updateRow(r.id, "wind", v)}        options={WIND_OPTIONS}       testId={`wl-${idx}-wind`} />
                <Drop label="Rainfall"               value={r.rain}        onChange={(v) => updateRow(r.id, "rain", v)}        options={RAIN_OPTIONS}       testId={`wl-${idx}-rain`} />
                <Drop label="Visibility"             value={r.visibility}  onChange={(v) => updateRow(r.id, "visibility", v)}  options={VISIBILITY_OPTIONS} testId={`wl-${idx}-visibility`} />
                <Drop label="Overall Conditions"     value={r.conditions}  onChange={(v) => updateRow(r.id, "conditions", v)}  options={CONDITIONS_OPTIONS} testId={`wl-${idx}-conditions`} />
                <Drop label="Did work proceed?"      value={r.proceed}     onChange={(v) => updateRow(r.id, "proceed", v)}     options={PROCEED_OPTIONS}    testId={`wl-${idx}-proceed`} />
                <Inp  label="Hours Lost (optional)"  type="number" value={r.hoursLost} onChange={(v) => updateRow(r.id, "hoursLost", v)} testId={`wl-${idx}-hours-lost`} helper="Estimated hours of productive work lost due to weather" />
                <Inp  label="Impact on Works"        value={r.impact}        onChange={(v) => updateRow(r.id, "impact", v)}        testId={`wl-${idx}-impact`}        placeholder="How did the weather affect specific activities" />
                <Inp  label="Works Affected (optional)" value={r.worksAffected} onChange={(v) => updateRow(r.id, "worksAffected", v)} testId={`wl-${idx}-works`}         placeholder="Which tasks / areas were impacted" />
              </div>
            </div>
          ))}
        </div>
        <button onClick={addRow} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="wl-add">
          <Plus size={12}/> Add Day
        </button>
      </Section>

      {/* SECTION 3 — SUMMARY */}
      <Section title="Summary" testId="wl-section-3">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Stat label="Total days logged"                value={String(summary.total)}          testId="wl-stat-total" />
          <Stat label="Days work fully stopped"          value={String(summary.stoppedFully)}   testId="wl-stat-stopped"  warn={summary.stoppedFully > 0} />
          <Stat label="Days work partially stopped"      value={String(summary.stoppedPartial)} testId="wl-stat-partial"  warn={summary.stoppedPartial > 0} />
          <Stat label="Total hours lost to weather"      value={String(summary.hoursLost)}      testId="wl-stat-hours"    warn={summary.hoursLost > 0} />
          <div className="p-4 rounded col-span-2" style={{ background: "rgba(15,15,15,0.6)", border: "1px solid rgba(160,157,148,0.18)" }} data-testid="wl-stat-range">
            <div className="text-[10px] uppercase tracking-widest text-[#706D66] mb-1">Date range covered</div>
            <div className="font-display text-2xl text-[#F0EDE8]">{summary.range}</div>
          </div>
        </div>
      </Section>

      {/* SECTION 4 — IMPORTANT NOTE */}
      <div
        className="mb-5 p-5 rounded flex items-start gap-3"
        style={{ border: "2px solid #E8A020", background: "rgba(232,160,32,0.10)" }}
        data-testid="wl-important-note"
      >
        <AlertTriangle size={22} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
        <div className="text-sm text-[#F0EDE8] leading-relaxed">
          A contemporaneous weather log is your evidence when claiming a weather-related delay.
          Record conditions every working day, even when weather is fine — a continuous log is far more credible than entries made only on bad days.
          This log can be used to support a Delay Notice or Extension of Time claim.
        </div>
      </div>

      {/* SIGN OFF */}
      <Section title="Sign Off" testId="wl-section-signoff">
        <LiveSignatureBlock
          label="Maintained by signature"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="wl-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="wl-sig-date">
          Date: {ukDate(isoToday())}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="wl-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Weather Log</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="wl-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated log</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Weather Log — ${project}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="wl-output">{result}</pre>
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

function Inp({ label, value, onChange, type = "text", testId, helper, placeholder }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="input-base"
        placeholder={placeholder}
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
