import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, AlertTriangle, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import { PRICING_BASIS } from "../lib/uk-format";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID   = "pricework-variation-tracker";
const TOOL_NAME = "Price Work Variation Tracker";
const TOOL_INFO =
  "Live running tracker for every variation and additional item on a price-work contract. Auto-calculates each line total and rolls up totals by status (agreed, pending, disputed, paid). Shows the revised contract value and the amount still outstanding. Update throughout the project.";

const isoToday = () => new Date().toISOString().slice(0, 10);

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const N = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const money = (n) =>
  `£${(Number(n) || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Canonical pricing basis list — shared with Quote Builder / Profit Calc.
// Legacy row values not in the canonical list are still preserved (rendered
// as a passthrough <option/> in the row's select), so upgrading this list
// never blanks existing tracker rows.
const UNIT_OPTIONS = PRICING_BASIS;
const STATUS_OPTIONS = [
  "Pending agreement",
  "Agreed",
  "Disputed",
  "Included in application",
  "Paid",
];

function refForIndex(i) { return `PV-${String(i + 1).padStart(3, "0")}`; }

function makeRow() {
  return {
    id: crypto.randomUUID(),
    date: "",
    description: "",
    instructedBy: "",
    unit: "Square metre",
    quantity: "",
    rate: "",
    status: "Pending agreement",
    notes: "",
  };
}

export default function PriceWorkVariationTracker() {
  const { user, refresh } = useAuth();

  // SECTION 1 — JOB DETAILS
  const [project, setProject]               = useState("");
  const [mainContractor, setMainContractor] = useState("");
  const [contractRef, setContractRef]       = useState("");
  const [contractValue, setContractValue]   = useState("");
  const [trackerStarted, setTrackerStarted] = useState(isoToday());

  // SECTION 2 — ROWS
  const [rows, setRows] = useState([makeRow()]);

  // Output / sign-off
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

  const decorated = useMemo(() => {
    return rows.map((r, i) => {
      const lineTotal = N(r.quantity) * N(r.rate);
      return { ...r, ref: refForIndex(i), lineTotal };
    });
  }, [rows]);

  // Live summary
  const summary = useMemo(() => {
    const populated = decorated.filter((r) => (r.description || "").trim().length > 0);
    let totalAll = 0, agreed = 0, pending = 0, disputed = 0, paid = 0, application = 0;
    for (const r of populated) {
      const v = r.lineTotal;
      totalAll += v;
      if (r.status === "Agreed") agreed += v;
      else if (r.status === "Pending agreement") pending += v;
      else if (r.status === "Disputed") disputed += v;
      else if (r.status === "Paid") paid += v;
      else if (r.status === "Included in application") application += v;
    }
    const original = N(contractValue);
    const revisedTotal = original + totalAll;
    // Outstanding = everything that isn't already paid
    const outstanding = totalAll - paid;
    return {
      count: populated.length,
      totalAll: +totalAll.toFixed(2),
      agreed: +agreed.toFixed(2),
      pending: +pending.toFixed(2),
      disputed: +disputed.toFixed(2),
      paid: +paid.toFixed(2),
      application: +application.toFixed(2),
      original,
      revisedTotal: +revisedTotal.toFixed(2),
      outstanding: +outstanding.toFixed(2),
    };
  }, [decorated, contractValue]);

  const onGenerate = async () => {
    if (!project.trim())        { toast.error("Add the project name"); return; }
    if (!mainContractor.trim()) { toast.error("Add the main contractor or client"); return; }
    const populated = decorated.filter((r) => (r.description || "").trim().length > 0);
    if (populated.length === 0) { toast.error("Add at least one variation to the tracker"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const itemsBlock = populated.map((r) => {
      return [
        `Reference Number: ${r.ref}`,
        `Date: ${ukDate(r.date) || "—"}`,
        `Description of Variation: ${r.description}`,
        `Instructed by: ${r.instructedBy || "—"}`,
        `Unit: ${r.unit}`,
        `Quantity: ${r.quantity || "0"}`,
        `Rate: ${money(N(r.rate))} per ${r.unit.toLowerCase()}`,
        `Line Total: ${money(r.lineTotal)}`,
        `Status: ${r.status}`,
        `Notes: ${r.notes || "—"}`,
      ].join(" | ");
    }).join("\n");

    const promptTemplate = `Produce a UK PRICE WORK VARIATION TRACKER. Plain direct construction English. No padding. No banned consultant words. Live running tracker of every variation on a price-work contract.

1. HEADER — DOCUMENT REFERENCE, DATE (use {trackerStarted} in DD/MM/YYYY format for DATE).

2. TITLE — exactly: 'PRICE WORK VARIATION TRACKER — {project} — {trackerStarted}'.

3. JOB DETAILS — list on separate lines:
   Project Name: {project}
   Main Contractor / Client: {mainContractor}
   Original Contract Reference: {contractRef}
   Original Contract Value: {originalContractValue}
   Date Tracker Started: {trackerStarted}
   Company Name: {companyName}
   Trade: {trade}

4. VARIATION TRACKER — print this header line then each item below verbatim on its own block, preserving the pipe-delimited structure exactly as supplied:
{itemsBlock}

5. SUMMARY — print on separate lines (use the values supplied — never recalculate):
   Total number of variations logged: {count}
   Total value of all variations: {totalAll}
   Total value Agreed: {agreedValue}
   Total value Pending: {pendingValue}
   Total value Disputed: {disputedValue}
   Total value Included in Application: {applicationValue}
   Total value Paid: {paidValue}
   Original Contract Value: {originalContractValue}
   Revised Contract Total: {revisedTotal}
   Outstanding Amount (not yet paid): {outstandingValue}

6. IMPORTANT NOTE — print verbatim as one paragraph:
   Always raise a Variation Order for each item before submitting your application. Unsubmitted variations are harder to claim. Use the Price Work Quote tool to formalise agreed rates.

7. FOOTER — print verbatim on its own line:
   All variations should be agreed in writing before inclusion in a payment application. This tracker should be retained with the project file.

8. SIGN-OFF — single sign-off:
   Tracker Maintained by: {senderName}
   Company: {companyName}
   Date: {trackerStarted}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Never invent items, quantities, rates or totals. Use only the supplied rows and the supplied totals.
- Never use abbreviations such as 'N/A', 'TBC', 'qty', '&' or 'inc.'. Write words in full.
- Skip blank optional fields cleanly. Use '—' only where supplied.
- No banned words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          trackerStarted: ukDate(trackerStarted),
          project,
          mainContractor,
          contractRef: contractRef || "—",
          originalContractValue: contractValue ? money(N(contractValue)) : "—",
          companyName: user?.companyName || "—",
          trade: user?.trade || "—",
          senderName: user?.fullName || "—",
          itemsBlock,
          count: String(summary.count),
          totalAll: money(summary.totalAll),
          agreedValue: money(summary.agreed),
          pendingValue: money(summary.pending),
          disputedValue: money(summary.disputed),
          applicationValue: money(summary.application),
          paidValue: money(summary.paid),
          revisedTotal: money(summary.revisedTotal),
          outstandingValue: money(summary.outstanding),
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Price Work Variation Tracker generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Price Work Variation Tracker — ${project || "project"}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-pricework-variation-tracker">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Price Work</div>
          <h1 className="font-display text-4xl md:text-5xl">Price Work Variation Tracker</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="pvt-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="pvt-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 — JOB DETAILS */}
      <Section title="Job Details" testId="pvt-section-1" icon={<BarChart3 size={14}/>}>
        <Grid>
          <Inp label="Project Name" value={project} onChange={setProject} testId="pvt-project" />
          <Inp label="Main Contractor / Client" value={mainContractor} onChange={setMainContractor} testId="pvt-contractor" />
          <Inp label="Original Contract Reference (optional)" value={contractRef} onChange={setContractRef} testId="pvt-ref" />
          <Inp label="Original Contract Value (£) — optional" value={contractValue} onChange={setContractValue} type="number" testId="pvt-value" helper="Your original agreed price work total" />
          <Inp label="Date Tracker Started" value={trackerStarted} onChange={setTrackerStarted} type="date" testId="pvt-started" />
        </Grid>
      </Section>

      {/* SECTION 2 — VARIATION TABLE */}
      <Section title="Variation Tracker" testId="pvt-section-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 1400 }}>
            <thead className="text-[10px] uppercase tracking-widest text-[#706D66]">
              <tr>
                <th className="text-left py-2 pr-2 whitespace-nowrap">Reference Number</th>
                <th className="text-left pr-2">Date</th>
                <th className="text-left pr-2">Description of Variation</th>
                <th className="text-left pr-2">Instructed by</th>
                <th className="text-left pr-2">Unit</th>
                <th className="text-right pr-2">Quantity</th>
                <th className="text-right pr-2">Rate (£)</th>
                <th className="text-right pr-2 whitespace-nowrap">Line Total (£)</th>
                <th className="text-left pr-2">Status</th>
                <th className="text-left pr-2">Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {decorated.map((r, idx) => (
                <tr key={r.id} className="border-t border-[#F0EDE8]/5 align-top" data-testid={`pvt-row-${idx}`}>
                  <td className="py-1 pr-2 text-[#E8A020] text-xs font-mono whitespace-nowrap" data-testid={`pvt-row-${idx}-ref`}>{r.ref}</td>
                  <td className="pr-2">
                    <input type="date" className="input-base !py-1 !text-sm" value={r.date} onChange={(e) => updateRow(r.id, "date", e.target.value)} data-testid={`pvt-row-${idx}-date`} />
                  </td>
                  <td className="pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder="What extra work or change was instructed?" value={r.description} onChange={(e) => updateRow(r.id, "description", e.target.value)} data-testid={`pvt-row-${idx}-description`} />
                  </td>
                  <td className="pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder="(optional)" value={r.instructedBy} onChange={(e) => updateRow(r.id, "instructedBy", e.target.value)} data-testid={`pvt-row-${idx}-instructedby`} />
                  </td>
                  <td className="pr-2">
                    <select className="input-base !py-1 !text-sm" value={r.unit} onChange={(e) => updateRow(r.id, "unit", e.target.value)} data-testid={`pvt-row-${idx}-unit`}>
                      {r.unit && !UNIT_OPTIONS.includes(r.unit) && <option value={r.unit}>{r.unit}</option>}
                      {UNIT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="pr-2">
                    <input type="number" min="0" step="0.01" className="input-base !py-1 !text-sm text-right" value={r.quantity} onChange={(e) => updateRow(r.id, "quantity", e.target.value)} data-testid={`pvt-row-${idx}-quantity`} />
                  </td>
                  <td className="pr-2">
                    <input type="number" min="0" step="0.01" className="input-base !py-1 !text-sm text-right" value={r.rate} onChange={(e) => updateRow(r.id, "rate", e.target.value)} data-testid={`pvt-row-${idx}-rate`} />
                  </td>
                  <td className="pr-2 whitespace-nowrap text-right">
                    <div
                      className="px-2 py-1 rounded text-xs font-mono inline-block"
                      style={{ background: "rgba(15,15,15,0.4)", border: "1px solid rgba(160,157,148,0.18)", color: "#F0EDE8" }}
                      data-testid={`pvt-row-${idx}-linetotal`}
                    >{money(r.lineTotal)}</div>
                  </td>
                  <td className="pr-2">
                    <select className="input-base !py-1 !text-sm" value={r.status} onChange={(e) => updateRow(r.id, "status", e.target.value)} data-testid={`pvt-row-${idx}-status`}>
                      {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder="Notes" value={r.notes} onChange={(e) => updateRow(r.id, "notes", e.target.value)} data-testid={`pvt-row-${idx}-notes`} />
                  </td>
                  <td className="text-right">
                    <button onClick={() => removeRow(r.id)} className="text-[#706D66] hover:text-red-400" data-testid={`pvt-row-${idx}-remove`}><Trash2 size={14}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addRow} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="pvt-add-row">
          <Plus size={12}/> Add Variation
        </button>
      </Section>

      {/* SECTION 3 — SUMMARY */}
      <Section title="Tracker Summary" testId="pvt-section-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Stat label="Total variations logged" value={String(summary.count)} testId="pvt-sum-count" />
          <Stat label="Total value of all variations" value={money(summary.totalAll)} testId="pvt-sum-totalall" />
          <Stat label="Total value Agreed" value={money(summary.agreed)} testId="pvt-sum-agreed" />
          <Stat label="Total value Pending" value={money(summary.pending)} testId="pvt-sum-pending" />
          <Stat label="Total value Disputed" value={money(summary.disputed)} testId="pvt-sum-disputed" danger={summary.disputed > 0} />
          <Stat label="Total value Paid" value={money(summary.paid)} testId="pvt-sum-paid" />
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mt-5">
          <Stat
            label="Revised Contract Total (Original + Variations)"
            value={money(summary.revisedTotal)}
            testId="pvt-sum-revised"
            highlight
          />
          <Stat
            label="Outstanding Amount (not yet paid)"
            value={money(summary.outstanding)}
            testId="pvt-sum-outstanding"
            highlight={summary.outstanding > 0}
          />
        </div>
      </Section>

      {/* SECTION 4 — IMPORTANT NOTE */}
      <div
        className="card-dark p-5 mb-5 flex items-start gap-3"
        style={{ borderColor: "#E8A020", background: "rgba(232,160,32,0.08)" }}
        data-testid="pvt-note"
      >
        <AlertTriangle size={18} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
        <div className="text-sm text-[#F0EDE8] leading-relaxed">
          Always raise a Variation Order for each item before submitting your application. Unsubmitted variations are harder to claim. Use the Price Work Quote tool to formalise agreed rates.
        </div>
      </div>

      {/* SIGN OFF */}
      <Section title="Sign Off" testId="pvt-section-signoff">
        <LiveSignatureBlock
          label="Tracker signature"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="pvt-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="pvt-sig-date">
          Date: {ukDate(trackerStarted) || "—"}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="pvt-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Variation Tracker</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="pvt-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated tracker</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Price Work Variation Tracker — ${project}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="pvt-output">{result}</pre>
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
function Stat({ label, value, testId, warn, danger, highlight }) {
  let color = "#F0EDE8";
  let border = "rgba(160,157,148,0.18)";
  let bg = "rgba(15,15,15,0.6)";
  if (warn)      { color = "#E8A020"; border = "#E8A020"; bg = "rgba(232,160,32,0.10)"; }
  if (danger)    { color = "#FF6B6B"; border = "#FF6B6B"; bg = "rgba(255,107,107,0.10)"; }
  if (highlight) { color = "#E8A020"; border = "#E8A020"; bg = "rgba(232,160,32,0.10)"; }
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
