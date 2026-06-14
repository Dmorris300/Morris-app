import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID   = "labour-allocation";
const TOOL_NAME = "Labour Allocation";
const TOOL_INFO =
  "Daily labour schedule for subcontractor bosses — every worker, where they are going, who they report to, what time they start, what they are doing, and any kit they need to take. Also serves as the daily record of who was deployed where.";

const isoToday = () => new Date().toISOString().slice(0, 10);

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Monday of the week the supplied ISO date falls in.
function mondayOf(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  const dow = d.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const offset = (dow + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

// Hours between two HH:MM times. Returns a number (e.g. 9) or 0 if invalid / negative.
function hoursBetween(startHHMM, endHHMM) {
  if (!startHHMM || !endHHMM) return 0;
  const ms = startHHMM.match(/^(\d{2}):(\d{2})$/);
  const me = endHHMM.match(/^(\d{2}):(\d{2})$/);
  if (!ms || !me) return 0;
  const s = parseInt(ms[1], 10) * 60 + parseInt(ms[2], 10);
  const e = parseInt(me[1], 10) * 60 + parseInt(me[2], 10);
  if (e <= s) return 0;
  return +((e - s) / 60).toFixed(2);
}

function makeRow() {
  return {
    id: crypto.randomUUID(),
    worker: "",
    role: "",
    project: "",
    siteAddress: "",
    reportingTo: "",
    startTime: "07:30",
    finishTime: "16:30",
    task: "",
    notes: "",
  };
}

export default function LabourAllocation() {
  const { user, refresh } = useAuth();

  // SECTION 1 — ALLOCATION DETAILS
  const [allocationDate, setAllocationDate] = useState(isoToday());
  const weekCommencing                       = mondayOf(allocationDate);
  const [allocatedBy]                        = useState(user?.fullName || "");

  // SECTION 2 — ROWS
  const [rows, setRows] = useState([makeRow()]);

  // SECTION 4 — SIGN OFF
  const signOffDate = isoToday();
  const [liveSignature, setLiveSignature] = useState("");

  // Output
  const [infoOpen, setInfoOpen]       = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [result, setResult]           = useState("");
  const [refNumber, setRefNumber]     = useState("");

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

  const decorated = useMemo(
    () => rows.map((r) => ({ ...r, hours: hoursBetween(r.startTime, r.finishTime) })),
    [rows]
  );

  // Summary
  const summary = useMemo(() => {
    const populated = decorated.filter((r) => (r.worker || "").trim().length > 0);
    const totalHours = populated.reduce((s, r) => s + r.hours, 0);
    const sites = new Set(
      populated
        .map((r) => (r.project || "").trim().toLowerCase())
        .filter((x) => x.length > 0)
    );
    return {
      count: populated.length,
      totalHours: +totalHours.toFixed(2),
      sites: sites.size,
    };
  }, [decorated]);

  const onGenerate = async () => {
    const populated = decorated.filter((r) => (r.worker || "").trim().length > 0);
    if (populated.length === 0) { toast.error("Add at least one worker to the allocation"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const itemsBlock = populated.map((r) => {
      return [
        `Worker Name: ${r.worker}`,
        `Trade / Role: ${r.role || "—"}`,
        `Job / Project: ${r.project || "—"}`,
        `Site Address: ${r.siteAddress || "—"}`,
        `Reporting To: ${r.reportingTo || "—"}`,
        `Start Time: ${r.startTime}`,
        `Finish Time: ${r.finishTime}`,
        `Hours: ${r.hours.toFixed(2)}`,
        `Task / Scope for the Day: ${r.task || "—"}`,
        `Notes: ${r.notes || "—"}`,
      ].join(" | ");
    }).join("\n");

    const promptTemplate = `Produce a UK DAILY LABOUR ALLOCATION. Plain direct construction English. No padding. No banned consultant words. Daily schedule issued by a subcontractor boss to deploy their workforce.

1. HEADER — DOCUMENT REFERENCE, DATE (use {allocationDate} in DD/MM/YYYY format for DATE).

2. TITLE — exactly: 'DAILY LABOUR ALLOCATION — {allocationDate}'.

3. ALLOCATION DETAILS — list on separate lines:
   Date of Allocation: {allocationDate}
   Week Commencing: {weekCommencing}
   Allocated by: {allocatedBy}
   Company: {companyName}
   Trade: {trade}
   Contact Telephone: {phone}

4. LABOUR ALLOCATION — print this header line then each worker below verbatim on its own block, preserving the pipe-delimited structure exactly as supplied:
{itemsBlock}

5. SUMMARY — print on separate lines (use the supplied values — never recalculate):
   Total workers allocated today: {count}
   Total hours allocated across all workers: {totalHours}
   Number of different sites covered: {sites}

6. FOOTER — print verbatim on its own line:
   This allocation has been issued by {allocatedBy} on {allocationDate}. Workers should report any issues or changes directly to the number above.

7. SIGN-OFF — single sign-off:
   Issued by: {allocatedBy}
   Company: {companyName}
   Date: {allocationDate}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Use HH:MM (24-hour) for times.
- Never invent workers, times or tasks. Use only the supplied rows.
- Never use abbreviations such as 'N/A', 'TBC' or '&'. Write words in full.
- Skip blank optional fields cleanly. Use '—' only where supplied.
- No banned consultant words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          allocationDate: ukDate(allocationDate),
          weekCommencing: ukDate(weekCommencing),
          allocatedBy: allocatedBy || user?.fullName || "—",
          companyName: user?.companyName || "—",
          trade: user?.trade || "—",
          phone: user?.contactNumber || user?.phone || "(telephone)",
          itemsBlock,
          count: String(summary.count),
          totalHours: summary.totalHours.toFixed(2),
          sites: String(summary.sites),
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Labour Allocation generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Labour Allocation — ${allocationDate}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-labour-allocation">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Contractors</div>
          <h1 className="font-display text-4xl md:text-5xl">Labour Allocation</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="la-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="la-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 — ALLOCATION DETAILS */}
      <Section title="Allocation Details" testId="la-section-1" icon={<Users size={14}/>}>
        <Grid>
          <Inp label="Date of Allocation" value={allocationDate} onChange={setAllocationDate} type="date" testId="la-date" helper="Displayed in DD/MM/YYYY on the document" />
          <ReadOnly label="Week Commencing" value={ukDate(weekCommencing) || "—"} testId="la-week" helper="Auto-calculated — Monday of the current week" />
          <ReadOnly label="Allocated by" value={allocatedBy || "—"} testId="la-allocatedby" helper="Auto-populated from your profile" />
        </Grid>
      </Section>

      {/* SECTION 2 — LABOUR ALLOCATION TABLE */}
      <Section title="Labour Allocation" testId="la-section-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 1500 }}>
            <thead className="text-[10px] uppercase tracking-widest text-[#706D66]">
              <tr>
                <th className="text-left py-2 pr-2">Worker Name</th>
                <th className="text-left pr-2">Trade / Role</th>
                <th className="text-left pr-2">Job / Project</th>
                <th className="text-left pr-2">Site Address</th>
                <th className="text-left pr-2">Reporting To</th>
                <th className="text-left pr-2 whitespace-nowrap">Start Time</th>
                <th className="text-left pr-2 whitespace-nowrap">Finish Time</th>
                <th className="text-right pr-2">Hours</th>
                <th className="text-left pr-2">Task / Scope for the Day</th>
                <th className="text-left pr-2">Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {decorated.map((r, idx) => (
                <tr key={r.id} className="border-t border-[#F0EDE8]/5 align-top" data-testid={`la-row-${idx}`}>
                  <td className="pr-2"><input className="input-base !py-1 !text-sm" value={r.worker} onChange={(e) => updateRow(r.id, "worker", e.target.value)} data-testid={`la-row-${idx}-worker`} /></td>
                  <td className="pr-2"><input className="input-base !py-1 !text-sm" placeholder={`e.g. "Duct Fitter"`} value={r.role} onChange={(e) => updateRow(r.id, "role", e.target.value)} data-testid={`la-row-${idx}-role`} /></td>
                  <td className="pr-2"><input className="input-base !py-1 !text-sm" value={r.project} onChange={(e) => updateRow(r.id, "project", e.target.value)} data-testid={`la-row-${idx}-project`} /></td>
                  <td className="pr-2"><input className="input-base !py-1 !text-sm" value={r.siteAddress} onChange={(e) => updateRow(r.id, "siteAddress", e.target.value)} data-testid={`la-row-${idx}-address`} /></td>
                  <td className="pr-2"><input className="input-base !py-1 !text-sm" placeholder="Site contact / supervisor" value={r.reportingTo} onChange={(e) => updateRow(r.id, "reportingTo", e.target.value)} data-testid={`la-row-${idx}-reportingto`} /></td>
                  <td className="pr-2"><input type="time" className="input-base !py-1 !text-sm" value={r.startTime} onChange={(e) => updateRow(r.id, "startTime", e.target.value)} data-testid={`la-row-${idx}-start`} /></td>
                  <td className="pr-2"><input type="time" className="input-base !py-1 !text-sm" value={r.finishTime} onChange={(e) => updateRow(r.id, "finishTime", e.target.value)} data-testid={`la-row-${idx}-finish`} /></td>
                  <td className="pr-2 whitespace-nowrap text-right">
                    <div className="px-2 py-1 rounded text-xs font-mono inline-block" style={{ background: "rgba(15,15,15,0.4)", border: "1px solid rgba(160,157,148,0.18)", color: "#F0EDE8" }} data-testid={`la-row-${idx}-hours`}>
                      {r.hours.toFixed(2)}
                    </div>
                  </td>
                  <td className="pr-2"><input className="input-base !py-1 !text-sm" placeholder="What are they doing today?" value={r.task} onChange={(e) => updateRow(r.id, "task", e.target.value)} data-testid={`la-row-${idx}-task`} /></td>
                  <td className="pr-2"><input className="input-base !py-1 !text-sm" placeholder={`e.g. "Take pipe bender"`} value={r.notes} onChange={(e) => updateRow(r.id, "notes", e.target.value)} data-testid={`la-row-${idx}-notes`} /></td>
                  <td className="text-right"><button onClick={() => removeRow(r.id)} className="text-[#706D66] hover:text-red-400" data-testid={`la-row-${idx}-remove`}><Trash2 size={14}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addRow} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="la-add-row">
          <Plus size={12}/> Add Worker
        </button>
      </Section>

      {/* SECTION 3 — SUMMARY */}
      <Section title="Allocation Summary" testId="la-section-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <Stat label="Total workers allocated today" value={String(summary.count)} testId="la-sum-count" />
          <Stat label="Total hours allocated across all workers" value={summary.totalHours.toFixed(2)} testId="la-sum-hours" />
          <Stat label="Number of different sites covered" value={String(summary.sites)} testId="la-sum-sites" />
        </div>
      </Section>

      {/* SIGN OFF */}
      <Section title="Sign Off" testId="la-section-signoff">
        <LiveSignatureBlock
          label="Allocator signature"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="la-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="la-sig-date">
          Date: {ukDate(signOffDate) || "—"}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="la-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Labour Allocation</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="la-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated allocation</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Daily Labour Allocation — ${ukDate(allocationDate)}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="la-output">{result}</pre>
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
function Inp({ label, value, onChange, type = "text", testId, helper }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} className="input-base" data-testid={testId} />
      {helper && <div className="text-[10px] text-[#706D66] mt-1">{helper}</div>}
    </label>
  );
}
function ReadOnly({ label, value, testId, helper }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <div className="input-base !cursor-default" data-testid={testId}>{value}</div>
      {helper && <div className="text-[10px] text-[#706D66] mt-1">{helper}</div>}
    </label>
  );
}
function Stat({ label, value, testId }) {
  return (
    <div
      data-testid={testId}
      className="p-4 rounded"
      style={{ background: "rgba(15,15,15,0.6)", border: "1px solid rgba(160,157,148,0.18)" }}
    >
      <div className="text-[10px] uppercase tracking-widest text-[#706D66] mb-1">{label}</div>
      <div className="font-display text-2xl" style={{ color: "#F0EDE8" }}>{value}</div>
    </div>
  );
}
