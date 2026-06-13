import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, Wrench, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID = "tool-register";
const TOOL_NAME = "Tool and Equipment Register";
const TOOL_INFO =
  "Records all tools and equipment brought to site, confirms condition and ownership, and tracks inspection and PAT testing status. Acts as a site inventory and legal record of equipment safety compliance.";

const isoToday = () => new Date().toISOString().slice(0, 10);

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Days between today and the given ISO date. Returns null if not parseable.
function daysUntil(iso) {
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const target = new Date(`${iso}T00:00:00Z`);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const diff = Math.round((target - today) / 86400000);
  return diff;
}

const OWNERSHIP = ["Myself", "My Company", "Hired", "Client supplied", "Other"];
const CONDITION = ["Good", "Fair", "Poor", "Damaged"];
const PAT_STATUS = ["Yes", "No", "Not Required"];

function makeItem() {
  return {
    id: crypto.randomUUID(),
    description: "",
    makeModel: "",
    serial: "",
    ownedBy: "Myself",
    condition: "Good",
    patTested: "Not Required",
    patExpiry: "",
    inspectionDue: "",
    notes: "",
  };
}

export default function ToolRegister() {
  const { user, refresh } = useAuth();

  // SECTION 1
  const [project, setProject]         = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [registerDate, setRegisterDate] = useState(isoToday());

  // SECTION 2
  const [items, setItems] = useState([makeItem()]);

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

  const updateItem = (id, field, value) =>
    setItems((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const removeItem = (id) =>
    setItems((rows) => rows.filter((r) => r.id !== id));
  const addItem = () => setItems((rows) => [...rows, makeItem()]);

  // ---------- Summary calculations ----------
  const summary = useMemo(() => {
    const populated = items.filter((it) => (it.description || "").trim().length > 0);
    let patWarn = 0;
    let hired = 0;
    for (const it of populated) {
      if (it.ownedBy === "Hired") hired++;
      if (it.patTested === "Yes" && it.patExpiry) {
        const d = daysUntil(it.patExpiry);
        if (d !== null && d <= 30) patWarn++;
      }
    }
    return { total: populated.length, patWarn, hired };
  }, [items]);

  const onGenerate = async () => {
    if (!project.trim())     { toast.error("Add a project / site name"); return; }
    if (!registerDate)       { toast.error("Select a date"); return; }
    const populated = items.filter((it) => (it.description || "").trim().length > 0);
    if (populated.length === 0) { toast.error("Add at least one item to the register"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    // Build the items table block (one row per line, pipe-delimited)
    const itemsBlock = populated.map((it, i) => {
      const patBit = it.patTested === "Yes" && it.patExpiry
        ? `Yes (expires ${ukDate(it.patExpiry)})`
        : it.patTested;
      const inspectBit = it.inspectionDue ? ukDate(it.inspectionDue) : "—";
      return [
        `${i + 1}.`,
        `Item: ${it.description}`,
        `Make/Model: ${it.makeModel || "—"}`,
        `Serial/Asset Reference: ${it.serial || "—"}`,
        `Owned by: ${it.ownedBy}`,
        `Condition: ${it.condition}`,
        `PAT Tested: ${patBit}`,
        `Inspection / Service Due: ${inspectBit}`,
        `Notes: ${it.notes || "—"}`,
      ].join(" | ");
    }).join("\n");

    // Warning list of items with PAT expiring within 30 days
    const warnList = populated
      .filter((it) => {
        if (it.patTested !== "Yes" || !it.patExpiry) return false;
        const d = daysUntil(it.patExpiry);
        return d !== null && d <= 30;
      })
      .map((it) => {
        const d = daysUntil(it.patExpiry);
        const phrase = d < 0 ? `OVERDUE by ${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"}` : `expires in ${d} day${d === 1 ? "" : "s"}`;
        return `   ${it.description} — PAT ${phrase} (${ukDate(it.patExpiry)})`;
      })
      .join("\n");

    const promptTemplate = `Produce a UK TOOL AND EQUIPMENT REGISTER. Plain direct construction English. No padding. No banned consultant words. This is a formal site record signed off by the operative who brought the tools onto site.

1. HEADER — DOCUMENT REFERENCE, DATE (use {registerDate} in DD/MM/YYYY format for DATE).

2. TITLE — exactly: 'TOOL AND EQUIPMENT REGISTER — {project} — {registerDate}'.

3. REGISTER DETAILS — list on separate lines:
   Project / Site: {project}
   Site Address: {siteAddress}
   Date: {registerDate}
   Operative Name: {operativeName}
   Company Name: {companyName}
   Trade: {trade}

4. EQUIPMENT LIST — print this header line, then each item below verbatim on its own line, preserving the pipe-delimited structure exactly as supplied:
{itemsBlock}

5. SUMMARY — print on separate lines:
   Total items registered: {totalItems}
   Items with PAT test overdue or expiring within 30 days: {patWarn}
   Hired items on site: {hiredItems}

{warnSection}

6. DECLARATION — print verbatim as one paragraph:
   I confirm that the tools and equipment listed above are present on site, are in the condition stated, and where required have been inspected and PAT tested in accordance with current regulations. I accept responsibility for the safe use and storage of these items whilst on site.

7. SIGN-OFF — single operative sign-off:
   Operative: {operativeName}
   Date: {registerDate}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

8. FOOTER — print verbatim as a small note paragraph:
   Portable electrical equipment on construction sites must be PAT tested. 110v equipment is recommended for all site use. Records should be retained for the duration of the project.

Rules:
- Use the register date in DD/MM/YYYY format throughout. Never YYYY-MM-DD in the document body.
- Never invent items, dates or values. Use only what is supplied.
- Never use abbreviations such as 'N/A', 'TBC' or '&'. Write the full word.
- Skip any blank field cleanly. Use '—' only where supplied.
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
          registerDate: ukDate(registerDate),
          operativeName: user?.fullName || "",
          companyName: user?.companyName || "",
          trade: user?.trade || "",
          itemsBlock,
          totalItems: String(summary.total),
          patWarn: String(summary.patWarn),
          hiredItems: String(summary.hired),
          warnSection: warnList
            ? `PAT EXPIRY WARNINGS — the following items are flagged as overdue or expiring within 30 days. Address before continued use:\n${warnList}`
            : "",
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Tool and Equipment Register generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Tool and Equipment Register — ${project || "site"}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-tool-register">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Site Tools</div>
          <h1 className="font-display text-4xl md:text-5xl">Tool and Equipment Register</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="ter-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="ter-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 — REGISTER DETAILS */}
      <Section title="Register Details" testId="ter-section-1">
        <Grid>
          <Inp label="Project Name / Site"   value={project}      onChange={setProject}      testId="ter-project" />
          <Inp label="Site Address"          value={siteAddress}  onChange={setSiteAddress}  testId="ter-site-address" />
          <Inp label="Date"                  value={registerDate} onChange={setRegisterDate} type="date" testId="ter-date" />
          <Inp label="Operative Name (auto from profile)" value={user?.fullName || ""} onChange={() => {}} readOnly testId="ter-operative" />
          <Inp label="Company Name (auto from profile)"   value={user?.companyName || ""} onChange={() => {}} readOnly testId="ter-company" />
          <Inp label="Trade (auto from profile)"          value={user?.trade || ""} onChange={() => {}} readOnly testId="ter-trade" />
        </Grid>
      </Section>

      {/* SECTION 2 — EQUIPMENT LIST */}
      <Section title="Equipment List" testId="ter-section-2" icon={<Wrench size={14}/>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-[#706D66]">
              <tr>
                <th className="text-left py-2">Item Description</th>
                <th className="text-left">Make / Model</th>
                <th className="text-left">Serial / Asset Ref</th>
                <th className="text-left">Owned by</th>
                <th className="text-left">Condition</th>
                <th className="text-left">PAT Tested?</th>
                <th className="text-left">PAT Expiry</th>
                <th className="text-left">Inspection Due</th>
                <th className="text-left">Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const showPatExpiry = it.patTested === "Yes";
                const patWarn = showPatExpiry && it.patExpiry && (daysUntil(it.patExpiry) ?? 99) <= 30;
                return (
                  <tr key={it.id} className="border-t border-[#F0EDE8]/5 align-top" data-testid={`ter-row-${idx}`}>
                    <td className="py-1 pr-2">
                      <input className="input-base !py-1 !text-sm" placeholder="e.g. 110v Angle Grinder" value={it.description} onChange={(e) => updateItem(it.id, "description", e.target.value)} data-testid={`ter-${idx}-desc`} />
                    </td>
                    <td className="pr-2">
                      <input className="input-base !py-1 !text-sm" placeholder="Make/Model" value={it.makeModel} onChange={(e) => updateItem(it.id, "makeModel", e.target.value)} data-testid={`ter-${idx}-makeModel`} />
                    </td>
                    <td className="pr-2">
                      <input className="input-base !py-1 !text-sm" placeholder="Serial / Asset" value={it.serial} onChange={(e) => updateItem(it.id, "serial", e.target.value)} data-testid={`ter-${idx}-serial`} />
                    </td>
                    <td className="pr-2">
                      <select className="input-base !py-1 !text-sm" value={it.ownedBy} onChange={(e) => updateItem(it.id, "ownedBy", e.target.value)} data-testid={`ter-${idx}-owned`}>
                        {OWNERSHIP.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                    <td className="pr-2">
                      <select className="input-base !py-1 !text-sm" value={it.condition} onChange={(e) => updateItem(it.id, "condition", e.target.value)} data-testid={`ter-${idx}-condition`}>
                        {CONDITION.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="pr-2">
                      <select className="input-base !py-1 !text-sm" value={it.patTested} onChange={(e) => updateItem(it.id, "patTested", e.target.value)} data-testid={`ter-${idx}-pat`}>
                        {PAT_STATUS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td className="pr-2">
                      {showPatExpiry ? (
                        <input
                          type="date"
                          className="input-base !py-1 !text-sm"
                          value={it.patExpiry}
                          onChange={(e) => updateItem(it.id, "patExpiry", e.target.value)}
                          style={patWarn ? { borderColor: "#E8A020" } : undefined}
                          data-testid={`ter-${idx}-patExpiry`}
                        />
                      ) : (
                        <div className="text-xs text-[#706D66]">—</div>
                      )}
                    </td>
                    <td className="pr-2">
                      <input type="date" className="input-base !py-1 !text-sm" value={it.inspectionDue} onChange={(e) => updateItem(it.id, "inspectionDue", e.target.value)} data-testid={`ter-${idx}-inspectionDue`} />
                    </td>
                    <td className="pr-2">
                      <input className="input-base !py-1 !text-sm" placeholder="Notes" value={it.notes} onChange={(e) => updateItem(it.id, "notes", e.target.value)} data-testid={`ter-${idx}-notes`} />
                    </td>
                    <td className="text-right">
                      <button onClick={() => removeItem(it.id)} className="text-[#706D66] hover:text-red-400" data-testid={`ter-${idx}-remove`}><Trash2 size={14}/></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button onClick={addItem} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="ter-add-item">
          <Plus size={12}/> Add Item
        </button>
      </Section>

      {/* SECTION 3 — SUMMARY */}
      <Section title="Summary" testId="ter-section-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Stat label="Total items registered" value={String(summary.total)} testId="ter-stat-total" />
          <Stat
            label="PAT overdue or expiring within 30 days"
            value={String(summary.patWarn)}
            testId="ter-stat-pat"
            warn={summary.patWarn > 0}
          />
          <Stat label="Hired items on site" value={String(summary.hired)} testId="ter-stat-hired" />
        </div>
        {summary.patWarn > 0 && (
          <div
            className="mt-4 p-3 rounded flex items-start gap-2"
            style={{ border: "1px solid #E8A020", background: "rgba(232,160,32,0.08)" }}
            data-testid="ter-pat-warning"
          >
            <AlertTriangle size={16} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
            <div className="text-xs text-[#F0EDE8] leading-relaxed">
              {summary.patWarn} item{summary.patWarn === 1 ? "" : "s"} flagged for PAT testing. Replace or re-test before continued use on site.
            </div>
          </div>
        )}
      </Section>

      {/* SECTION 4 — DECLARATION */}
      <Section title="Declaration" testId="ter-section-4">
        <div
          className="p-4 rounded mb-4 text-sm text-[#F0EDE8] leading-relaxed"
          style={{ border: "1px solid rgba(232,160,32,0.25)", background: "rgba(232,160,32,0.05)" }}
          data-testid="ter-declaration-text"
        >
          I confirm that the tools and equipment listed above are present on site, are in the condition stated,
          and where required have been inspected and PAT tested in accordance with current regulations.
          I accept responsibility for the safe use and storage of these items whilst on site.
        </div>

        <LiveSignatureBlock
          label="Operative signature"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="ter-sig"
        />

        <div className="mt-3 text-xs text-[#706D66]" data-testid="ter-sig-date">
          Date: {ukDate(registerDate) || "—"}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="ter-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Tool and Equipment Register</>}
      </button>

      {/* OUTPUT */}
      {result && (
        <div className="card-dark p-6 mt-6" data-testid="ter-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated register</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Tool and Equipment Register — ${project}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="ter-output">{result}</pre>
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

function Inp({ label, value, onChange, type = "text", testId, readOnly }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="input-base"
        readOnly={readOnly}
        data-testid={testId}
      />
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
      <div className="font-display text-3xl" style={{ color: warn ? "#E8A020" : "#F0EDE8" }}>{value}</div>
    </div>
  );
}
