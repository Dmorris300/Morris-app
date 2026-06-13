import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID   = "snagging-list";
const TOOL_NAME = "Snagging List";
const TOOL_INFO =
  "A formal snagging list with project, inspection and item-level detail. Used at handover to record every defect that must be put right. The list keeps a live count of high / medium / low severity items open and the overall percentage of snags resolved.";

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoNowMin = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function ukDateTime(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
}

const INSPECTOR_ROLES = [
  "Client", "Site Manager", "Quantity Surveyor", "Architect",
  "Building Surveyor", "Building Control", "Contractor", "Subcontractor", "Other",
];

const SEVERITY_OPTIONS = [
  "Low — Cosmetic (does not affect function)",
  "Medium — Functional (affects performance or use)",
  "High — Urgent Safety (must be rectified immediately)",
];
const STATUS_OPTIONS = ["Open", "In Progress", "Closed"];

function severityBand(s) {
  if (!s) return "—";
  if (s.startsWith("High")) return "High";
  if (s.startsWith("Medium")) return "Medium";
  if (s.startsWith("Low")) return "Low";
  return s;
}

function snagRef(i) { return `S-${String(i + 1).padStart(3, "0")}`; }
function makeSnag() {
  return {
    id: crypto.randomUUID(),
    location: "",
    item: "",
    defect: "",
    severity: "Low — Cosmetic (does not affect function)",
    status: "Open",
    target: "",
    dateClosed: "",
    notes: "",
  };
}

export default function SnaggingList() {
  const { user, refresh } = useAuth();

  // EXISTING fields — kept exactly as they are
  const [projectName, setProjectName]                 = useState("");
  const [projectAddress, setProjectAddress]           = useState("");
  const [unitPlotNumber, setUnitPlotNumber]           = useState("");
  const [inspectionDate, setInspectionDate]           = useState(isoNowMin());
  const [inspectedByName, setInspectedByName]         = useState(user?.fullName || "");
  const [inspectedByRole, setInspectedByRole]         = useState("Client");
  const [contractorRepresentative, setContractorRep]  = useState("");

  // NEW — dynamic snags table (replaces the old textarea)
  const [snags, setSnags] = useState([makeSnag()]);

  // Output / sign-off
  const [infoOpen, setInfoOpen]           = useState(false);
  const [generating, setGenerating]       = useState(false);
  const [result, setResult]               = useState("");
  const [refNumber, setRefNumber]         = useState("");
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

  const updateSnag = (id, field, value) =>
    setSnags((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const removeSnag = (id) =>
    setSnags((rs) => rs.filter((r) => r.id !== id));
  const addSnag = () => setSnags((rs) => [...rs, makeSnag()]);

  const decorated = useMemo(
    () => snags.map((s, i) => ({ ...s, ref: snagRef(i), band: severityBand(s.severity) })),
    [snags]
  );

  // Live summary
  const summary = useMemo(() => {
    const populated = decorated.filter((r) => (r.defect || "").trim() || (r.location || "").trim() || (r.item || "").trim());
    let highOpen = 0, mediumOpen = 0, lowOpen = 0, closed = 0;
    for (const r of populated) {
      const open = r.status !== "Closed";
      if (open) {
        if (r.band === "High") highOpen += 1;
        else if (r.band === "Medium") mediumOpen += 1;
        else if (r.band === "Low") lowOpen += 1;
      } else {
        closed += 1;
      }
    }
    const total = populated.length;
    const percent = total > 0 ? Math.round((closed / total) * 100) : 0;
    return { total, highOpen, mediumOpen, lowOpen, closed, percent };
  }, [decorated]);

  const onGenerate = async () => {
    if (!projectName.trim()) { toast.error("Add the project name"); return; }
    if (!inspectedByName.trim()) { toast.error("Add the inspector name"); return; }
    const populated = decorated.filter((r) => (r.defect || "").trim());
    if (populated.length === 0) { toast.error("Add at least one snag item with a defect description"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const snagsBlock = populated.map((r) => {
      const closedBit = r.status === "Closed" && r.dateClosed
        ? ` | Date Closed: ${ukDate(r.dateClosed)}`
        : "";
      return [
        `Snag ${r.ref}`,
        `Location: ${r.location || "—"}`,
        `Item / Element: ${r.item || "—"}`,
        `Defect Description: ${r.defect}`,
        `Severity: ${r.severity}`,
        `Status: ${r.status}`,
        `Target Completion Date: ${ukDate(r.target) || "—"}${closedBit}`,
        `Notes / Photo Reference: ${r.notes || "—"}`,
      ].join(" | ");
    }).join("\n");

    const promptTemplate = `Produce a formal UK SNAGGING LIST. Plain direct construction English. No padding. No banned consultant words. Formal inspection record used at handover.

1. HEADER — DOCUMENT REFERENCE (use SNG-NNN format taken from the document reference), DATE.

2. TITLE — exactly: 'SNAGGING LIST — {projectName} — {inspectionDate}'.

3. INSPECTION DETAILS — list on separate lines:
   Project Name: {projectName}
   Project Address: {projectAddress}
   Unit / Plot Number: {unitPlotNumber}
   Inspection Date and Time: {inspectionDate}
   Inspected by: {inspectedByName}
   Inspector Role: {inspectedByRole}
   Contractor Representative: {contractorRepresentative}

4. SNAG ITEMS — print this header line then each snag verbatim on its own line, preserving the pipe-delimited structure exactly as supplied. Keep the auto-generated Snag Number prefix:
{snagsBlock}

5. SEVERITY KEY — print verbatim on its own line:
   SEVERITY KEY: Low — Cosmetic (does not affect function). Medium — Functional (affects performance or use). High — Urgent Safety (must be rectified immediately).

6. SUMMARY — print on separate lines (use values supplied — never recalculate):
   Total snags raised: {totalCount}
   High severity snags open: {highOpen}
   Medium severity snags open: {mediumOpen}
   Low severity snags open: {lowOpen}
   Snags closed / completed: {closedCount}
   Percentage complete: {percent}% of snags resolved

7. STATEMENT — print verbatim on its own line in capitals:
   THIS SNAGGING LIST IS AN OFFICIAL INSPECTION RECORD AND MUST BE ACTIONED WITHIN THE AGREED TIMESCALES.

8. NEXT ACTIONS — print verbatim as one paragraph:
   The contractor representative shall update the Status column upon completion of each item and re-issue the list to the inspector. Each closed snag must be supported by photographic evidence or a witnessed sign-off.

9. INSPECTED BY — sign-off block:
   Inspector: {inspectedByName}
   Role: {inspectedByRole}
   Date: {inspectionDate}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

10. CONTRACTOR REPRESENTATIVE ACKNOWLEDGEMENT — block:
    Name: {contractorRepresentative}
    Signed: __________________________
    Date: __________________________

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Never invent snag items. Use only the supplied rows.
- Never use abbreviations such as 'N/A', 'TBC' or '&'. Write words in full.
- Skip blank optional fields cleanly. Use '—' only where supplied.
- No banned words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          projectName,
          projectAddress: projectAddress || "—",
          unitPlotNumber: unitPlotNumber || "—",
          inspectionDate: ukDateTime(inspectionDate),
          inspectedByName,
          inspectedByRole,
          contractorRepresentative: contractorRepresentative || "—",
          snagsBlock,
          totalCount: String(summary.total),
          highOpen: String(summary.highOpen),
          mediumOpen: String(summary.mediumOpen),
          lowOpen: String(summary.lowOpen),
          closedCount: String(summary.closed),
          percent: String(summary.percent),
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Snagging List generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Snagging List — ${projectName || "project"}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-snagging-list">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Site Tools</div>
          <h1 className="font-display text-4xl md:text-5xl">Snagging List</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="snag-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="snag-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 — INSPECTION DETAILS (existing fields, unchanged) */}
      <Section title="Inspection Details" testId="snag-section-1" icon={<ClipboardCheck size={14}/>}>
        <Grid>
          <Inp label="Project Name" value={projectName} onChange={setProjectName} testId="snag-project" />
          <Inp label="Project Address" value={projectAddress} onChange={setProjectAddress} testId="snag-address" />
          <Inp label="Unit / Plot Number" value={unitPlotNumber} onChange={setUnitPlotNumber} testId="snag-unit" />
          <Inp label="Inspection Date and Time" value={inspectionDate} onChange={setInspectionDate} type="datetime-local" testId="snag-date" />
          <Inp label="Inspected by (Name)" value={inspectedByName} onChange={setInspectedByName} testId="snag-inspector" />
          <Drop label="Inspector Role" value={inspectedByRole} onChange={setInspectedByRole} options={INSPECTOR_ROLES} testId="snag-role" />
          <Inp label="Contractor Representative (full name + company)" value={contractorRepresentative} onChange={setContractorRep} testId="snag-contractor" />
        </Grid>
      </Section>

      {/* SECTION 2 — SNAG ITEMS TABLE (replaces the old textarea) */}
      <Section title="Snag Items" testId="snag-section-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 1400 }}>
            <thead className="text-[10px] uppercase tracking-widest text-[#706D66]">
              <tr>
                <th className="text-left py-2 pr-2 whitespace-nowrap">Snag Number</th>
                <th className="text-left pr-2">Location</th>
                <th className="text-left pr-2">Item / Element</th>
                <th className="text-left pr-2">Defect Description</th>
                <th className="text-left pr-2">Severity</th>
                <th className="text-left pr-2">Status</th>
                <th className="text-left pr-2 whitespace-nowrap">Target Completion Date</th>
                <th className="text-left pr-2 whitespace-nowrap">Date Closed</th>
                <th className="text-left pr-2">Notes / Photo Reference</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {decorated.map((r, idx) => (
                <tr key={r.id} className="border-t border-[#F0EDE8]/5 align-top" data-testid={`snag-row-${idx}`}>
                  <td className="py-1 pr-2 text-[#E8A020] text-xs font-mono whitespace-nowrap" data-testid={`snag-row-${idx}-ref`}>{r.ref}</td>
                  <td className="pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder={`e.g. "Kitchen ceiling"`} value={r.location} onChange={(e) => updateSnag(r.id, "location", e.target.value)} data-testid={`snag-row-${idx}-location`} />
                  </td>
                  <td className="pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder={`e.g. "Ductwork joint"`} value={r.item} onChange={(e) => updateSnag(r.id, "item", e.target.value)} data-testid={`snag-row-${idx}-item`} />
                  </td>
                  <td className="pr-2">
                    <textarea rows={2} className="input-base !py-1 !text-sm" placeholder="Describe the defect clearly and specifically" value={r.defect} onChange={(e) => updateSnag(r.id, "defect", e.target.value)} data-testid={`snag-row-${idx}-defect`} />
                  </td>
                  <td className="pr-2">
                    <select className="input-base !py-1 !text-sm" value={r.severity} onChange={(e) => updateSnag(r.id, "severity", e.target.value)} data-testid={`snag-row-${idx}-severity`}>
                      {SEVERITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="pr-2">
                    <select className="input-base !py-1 !text-sm" value={r.status} onChange={(e) => updateSnag(r.id, "status", e.target.value)} data-testid={`snag-row-${idx}-status`}>
                      {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="pr-2">
                    <input type="date" className="input-base !py-1 !text-sm" value={r.target} onChange={(e) => updateSnag(r.id, "target", e.target.value)} data-testid={`snag-row-${idx}-target`} />
                  </td>
                  <td className="pr-2">
                    {r.status === "Closed" ? (
                      <input type="date" className="input-base !py-1 !text-sm" value={r.dateClosed} onChange={(e) => updateSnag(r.id, "dateClosed", e.target.value)} data-testid={`snag-row-${idx}-closed`} />
                    ) : (
                      <div className="text-[10px] text-[#706D66] py-2">Available once Closed</div>
                    )}
                  </td>
                  <td className="pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder={`e.g. "Photo 3, see attached"`} value={r.notes} onChange={(e) => updateSnag(r.id, "notes", e.target.value)} data-testid={`snag-row-${idx}-notes`} />
                  </td>
                  <td className="text-right">
                    <button onClick={() => removeSnag(r.id)} className="text-[#706D66] hover:text-red-400" data-testid={`snag-row-${idx}-remove`}><Trash2 size={14}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addSnag} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="snag-add-row">
          <Plus size={12}/> Add Snag
        </button>
      </Section>

      {/* SECTION 3 — SUMMARY */}
      <Section title="Snag Summary" testId="snag-section-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Stat label="Total snags raised" value={String(summary.total)} testId="snag-sum-total" />
          <Stat label="High severity snags open" value={String(summary.highOpen)} danger={summary.highOpen > 0} testId="snag-sum-high" />
          <Stat label="Medium severity snags open" value={String(summary.mediumOpen)} warn={summary.mediumOpen > 0} testId="snag-sum-medium" />
          <Stat label="Low severity snags open" value={String(summary.lowOpen)} testId="snag-sum-low" />
          <Stat label="Snags closed / completed" value={String(summary.closed)} testId="snag-sum-closed" />
          <Stat
            label="Percentage complete"
            value={`${summary.percent}% of snags resolved`}
            highlight={summary.total > 0 && summary.percent === 100}
            testId="snag-sum-percent"
          />
        </div>
      </Section>

      {/* SIGN OFF */}
      <Section title="Sign Off" testId="snag-section-signoff">
        <LiveSignatureBlock
          label="Inspector signature"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="snag-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="snag-sig-date">
          Inspection Date and Time: {ukDateTime(inspectionDate) || "—"}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="snag-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Snagging List</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="snag-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated snagging list</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Snagging List — ${projectName}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="snag-output">{result}</pre>
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
function Inp({ label, value, onChange, type = "text", testId, placeholder }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} className="input-base" placeholder={placeholder} data-testid={testId} />
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
function Stat({ label, value, testId, warn, danger, highlight }) {
  let color = "#F0EDE8";
  let border = "rgba(160,157,148,0.18)";
  let bg = "rgba(15,15,15,0.6)";
  if (warn)      { color = "#E8A020"; border = "#E8A020"; bg = "rgba(232,160,32,0.10)"; }
  if (danger)    { color = "#FF6B6B"; border = "#FF6B6B"; bg = "rgba(255,107,107,0.10)"; }
  if (highlight) { color = "#7FE08A"; border = "#7FE08A"; bg = "rgba(127,224,138,0.10)"; }
  return (
    <div
      data-testid={testId}
      className="p-4 rounded"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <div className="text-[10px] uppercase tracking-widest text-[#706D66] mb-1">{label}</div>
      <div className="font-display text-2xl" style={{ color }}>{value}</div>
    </div>
  );
}
