import { useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { toast } from "sonner";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, Ruler, ChevronDown, ChevronUp } from "lucide-react";
import { downloadPdf } from "../lib/pdf";
import { normalizeSignature } from "../lib/signature-utils";
import LiveSignatureBlock from "../components/LiveSignatureBlock";
import { Link } from "react-router-dom";

const UNITS = [
  { id: "mm",   label: "mm",            divisorToM: 1000, suffix: "mm" },
  { id: "cm",   label: "cm",            divisorToM: 100,  suffix: "cm" },
  { id: "m",    label: "metres",        divisorToM: 1,    suffix: "m" },
  { id: "ftin", label: "feet & inches", divisorToM: null, suffix: "ft" }, // displayed in feet; no SI conversion
];

const PURPOSES = [
  "Pricing / quoting",
  "Material ordering",
  "Verification of works",
  "As-built record",
  "Other",
];

const isoToday = () => new Date().toISOString().slice(0, 10);
const TOOL_ID = "measurement-record";
const TOOL_NAME = "Measurement Record";
const TOOL_INFO = "Site measurement sheet. Add as many rows as you need — Morris auto-calculates linear metres, area m², or volume m³ depending on which dimensions you fill in. Deductions section pulls voids out of the net total. Use for pricing, ordering materials, or verifying work.";

const N = (v) => parseFloat(v) || 0;
const fmt = (n, dp = 2) => (Number(n) || 0).toFixed(dp);

// Calculate a row's total in the selected unit.
// Linear:   length × qty
// Area:     length × width × qty
// Volume:   length × width × height × qty
function rowTotal(row) {
  const L = N(row.length), W = N(row.width), H = N(row.height), Q = N(row.quantity) || 1;
  if (L > 0 && W > 0 && H > 0) return { value: L * W * H * Q, kind: "volume", unit: "³" };
  if (L > 0 && W > 0)          return { value: L * W * Q,     kind: "area",   unit: "²" };
  if (L > 0)                   return { value: L * Q,         kind: "linear", unit: "" };
  return { value: 0, kind: "empty", unit: "" };
}

function makeRow() {
  return { id: crypto.randomUUID(), description: "", length: "", width: "", height: "", quantity: "1", notes: "" };
}

export default function MeasurementRecord() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({
    project: (() => { try { return localStorage.getItem("morris_meas_last_project") || ""; } catch { return ""; } })(),
    siteAddress: "",
    date: isoToday(),
    unit: "m",
    purpose: "Pricing / quoting",
    additionalNotes: "",
  });
  const [items, setItems] = useState([makeRow()]);
  const [deductions, setDeductions] = useState([]);
  const [deductOpen, setDeductOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState("");
  const [refNumber, setRefNumber] = useState("");
  const [liveSignature, setLiveSignature] = useState("");

  const isFav = (user?.favourites || []).includes(TOOL_ID);
  const toggleFav = async () => {
    const cur = user?.favourites || [];
    const next = isFav ? cur.filter((x) => x !== TOOL_ID) : [...cur, TOOL_ID];
    try { await api.post("/profile/update", { favourites: next }); await refresh(); toast.success(isFav ? "Removed from favourites" : "Added to favourites"); }
    catch { toast.error("Could not update favourites"); }
  };

  const unitDef = UNITS.find((u) => u.id === form.unit) || UNITS[2];

  // Totals per dimension kind
  const totalsFor = (rows) => {
    let linear = 0, area = 0, volume = 0;
    let n = 0;
    for (const r of rows) {
      const { value, kind } = rowTotal(r);
      if (kind === "linear") linear += value;
      else if (kind === "area") area += value;
      else if (kind === "volume") volume += value;
      if (kind !== "empty") n++;
    }
    return { linear, area, volume, n };
  };

  const main = useMemo(() => totalsFor(items), [items]);
  const ded = useMemo(() => totalsFor(deductions), [deductions]);

  const net = {
    linear: Math.max(0, main.linear - ded.linear),
    area: Math.max(0, main.area - ded.area),
    volume: Math.max(0, main.volume - ded.volume),
  };

  const updateRow = (id, field, value, isDeduction = false) => {
    const setter = isDeduction ? setDeductions : setItems;
    setter((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };
  const removeRow = (id, isDeduction = false) => {
    const setter = isDeduction ? setDeductions : setItems;
    setter((rows) => rows.filter((r) => r.id !== id));
  };
  const addRow = (isDeduction = false) => {
    const setter = isDeduction ? setDeductions : setItems;
    setter((rows) => [...rows, makeRow()]);
  };

  const onGenerate = async () => {
    if (!form.project.trim()) { toast.error("Add a project name first"); return; }
    if (main.n === 0) { toast.error("Add at least one measurement"); return; }
    setGenerating(true); setResult(""); setRefNumber("");
    try { localStorage.setItem("morris_meas_last_project", form.project); } catch { /* ignore */ }
    try {
      const rowsText = (rows) => rows.map((r, i) => {
        const { value, kind, unit } = rowTotal(r);
        if (kind === "empty") return "";
        const dims = [
          `L: ${N(r.length) || "—"}`,
          N(r.width) > 0 ? `W: ${N(r.width)}` : "",
          N(r.height) > 0 ? `H: ${N(r.height)}` : "",
          `Qty: ${N(r.quantity) || 1}`,
        ].filter(Boolean).join("  ");
        return `${i + 1}. ${r.description || "(no description)"} — ${dims} — TOTAL ${fmt(value)} ${unitDef.suffix}${unit}${r.notes ? "  · " + r.notes : ""}`;
      }).filter(Boolean).join("\n");

      const promptTemplate = `Produce a UK MEASUREMENT RECORD sheet. Plain direct construction English. No padding. No banned consultant words. This is a site record — clean, factual, table-driven.

1. HEADER — DOCUMENT REFERENCE, DATE ({date}).

2. TITLE — exactly: 'MEASUREMENT RECORD — {project} — {date}'.

3. RECORD DETAILS — list on separate lines:
   Project: {project}
   Site address: {siteAddress}
   Date measured: {date}
   Measured by: {measuredByName}
   Unit of measurement: {unitLabel}
   Purpose: {purpose}

4. MEASUREMENTS — render the measurements table cleanly. Use monospace column alignment if possible. Columns:
   #  ITEM / DESCRIPTION  L  W  H  QTY  TOTAL  NOTES
   The measurement rows are supplied verbatim below. Print each as a row, keeping the totals exactly as supplied. Do NOT recalculate.

{measurementsTable}

5. MAIN TOTALS — print on separate lines, skip any zero line cleanly:
   Total linear: {linearTotal} {unitSuffix}
   Total area: {areaTotal} {unitSuffix}²
   Total volume: {volumeTotal} {unitSuffix}³
   Number of items measured: {itemCount}

${deductions.length > 0 ? `6. DEDUCTIONS / VOIDS — render as a table the same way (columns identical to above):

{deductionsTable}

7. NET TOTALS AFTER DEDUCTIONS — print on separate lines, skip any zero line cleanly:
   Net linear after deductions: {netLinear} {unitSuffix}
   Net area after deductions: {netArea} {unitSuffix}²
   Net volume after deductions: {netVolume} {unitSuffix}³
` : ""}

${form.additionalNotes ? `${deductions.length > 0 ? "8" : "6"}. ADDITIONAL NOTES — print {additionalNotes} verbatim under this heading.` : ""}

${deductions.length > 0 ? (form.additionalNotes ? "9" : "8") : (form.additionalNotes ? "7" : "6")}. DISCLAIMER — print as a final block, verbatim:
   These measurements were taken on site and are the responsibility of the person named above. Always verify before ordering.

Rules: never invent rows. Use only the rows supplied. If a column value is blank, print '—'. No square-bracket placeholders. No 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised'. Short sentences. Keep the table tight. Do NOT add a Measured-By signature block or any other signature/sign-off panel — the global CONTRACTOR SIGN-OFF is the ONLY signature block on this document.`;

      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          project: form.project,
          siteAddress: form.siteAddress,
          date: form.date,
          measuredByName: user?.fullName || user?.username || "—",
          unitLabel: unitDef.label,
          unitSuffix: unitDef.suffix,
          purpose: form.purpose,
          measurementsTable: rowsText(items),
          deductionsTable: deductions.length > 0 ? rowsText(deductions) : "",
          linearTotal: fmt(main.linear),
          areaTotal: fmt(main.area),
          volumeTotal: fmt(main.volume, 3),
          itemCount: String(main.n),
          netLinear: fmt(net.linear),
          netArea: fmt(net.area),
          netVolume: fmt(net.volume, 3),
          additionalNotes: form.additionalNotes,
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      toast.success("Measurement sheet generated");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = async () => {
    // Belt-and-braces: `liveSignature` is already normalized (SignaturePad /
    // LiveSignatureBlock harden + trim on capture and on Use-Saved). The
    // fallback `user.signature` may still be a legacy raw canvas snapshot
    // from an older Profile save, so normalize it before the PDF renderer
    // embeds it — otherwise it prints faint grey and floats above the line.
    const rawSig = liveSignature || user?.signature || "";
    const normalizedSig = rawSig ? (await normalizeSignature(rawSig)) || rawSig : "";
    const userWithSig = { ...(user || {}), signature: normalizedSig };
    downloadPdf({ title: `Measurement Record — ${form.project || "site"}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-measurement-record">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Site Tools</div>
          <h1 className="font-display text-4xl md:text-5xl">Measurement Record</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="mr-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="mr-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* ---------- HEADER FORM ---------- */}
      <div className="card-dark p-6 mb-5">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Inp label="Project name / job reference" value={form.project} onChange={(v) => setForm({ ...form, project: v })} testId="mr-project" />
          <Inp label="Site address" value={form.siteAddress} onChange={(v) => setForm({ ...form, siteAddress: v })} testId="mr-site" />
          <Inp label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} testId="mr-date" />
          <Inp label="Measured by (auto from profile)" value={user?.fullName || ""} onChange={() => {}} testId="mr-measured-by" readOnly />
          <Drop label="Unit of measurement (applies to whole sheet)" value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} options={UNITS.map((u) => ({ value: u.id, label: u.label }))} testId="mr-unit" />
          <Drop label="Measurement purpose" value={form.purpose} onChange={(v) => setForm({ ...form, purpose: v })} options={PURPOSES} testId="mr-purpose" />
        </div>
      </div>

      {/* ---------- MEASUREMENT TABLE ---------- */}
      <MeasurementTable
        title="Measurements"
        rows={items}
        unit={unitDef.suffix}
        onChange={(id, field, value) => updateRow(id, field, value, false)}
        onRemove={(id) => removeRow(id, false)}
        onAdd={() => addRow(false)}
        testIdBase="mr-main"
      />

      {/* ---------- SUMMARY PANEL ---------- */}
      <div className="card-dark p-5 my-5" data-testid="mr-summary">
        <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Summary totals</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Total linear" value={`${fmt(main.linear)} ${unitDef.suffix}`} testId="mr-stat-linear" />
          <Stat label="Total area" value={`${fmt(main.area)} ${unitDef.suffix}²`} testId="mr-stat-area" />
          <Stat label="Total volume" value={`${fmt(main.volume, 3)} ${unitDef.suffix}³`} testId="mr-stat-volume" />
          <Stat label="Items measured" value={String(main.n)} testId="mr-stat-count" />
        </div>
      </div>

      {/* ---------- DEDUCTIONS (collapsible) ---------- */}
      <div className="card-dark mb-5" data-testid="mr-deductions-block">
        <button
          onClick={() => setDeductOpen((o) => !o)}
          className="w-full p-5 flex items-center justify-between gap-3"
          data-testid="mr-deductions-toggle"
        >
          <div className="flex items-center gap-3">
            <div className="text-xs uppercase tracking-widest text-[#E8A020]">Deductions / Voids ({deductions.length})</div>
            <span className="text-[10px] text-[#706D66]">Subtract window openings, voids, returns</span>
          </div>
          {deductOpen ? <ChevronUp size={18} className="text-[#E8A020]"/> : <ChevronDown size={18} className="text-[#A19D94]"/>}
        </button>
        {deductOpen && (
          <div className="px-5 pb-5">
            {deductions.length === 0 ? (
              <button onClick={() => addRow(true)} className="btn-secondary flex items-center gap-2 text-xs" data-testid="mr-deductions-add-first">
                <Plus size={12}/> Add first deduction
              </button>
            ) : (
              <>
                <MeasurementTable
                  title="Deductions / Voids"
                  rows={deductions}
                  unit={unitDef.suffix}
                  onChange={(id, field, value) => updateRow(id, field, value, true)}
                  onRemove={(id) => removeRow(id, true)}
                  onAdd={() => addRow(true)}
                  testIdBase="mr-ded"
                  flat
                />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 p-4 rounded" style={{ background: "rgba(232,160,32,0.06)", border: "1px solid rgba(232,160,32,0.25)" }} data-testid="mr-net-totals">
                  <Stat label="Net linear after deductions" value={`${fmt(net.linear)} ${unitDef.suffix}`} accent testId="mr-net-linear" />
                  <Stat label="Net area after deductions" value={`${fmt(net.area)} ${unitDef.suffix}²`} accent testId="mr-net-area" />
                  <Stat label="Net volume after deductions" value={`${fmt(net.volume, 3)} ${unitDef.suffix}³`} accent testId="mr-net-volume" />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ---------- ADDITIONAL NOTES ---------- */}
      <div className="card-dark p-5 mb-5">
        <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">Additional notes (optional)</div>
        <textarea
          rows={3}
          className="input-base resize-y"
          placeholder="Any site conditions, access notes, or assumptions made"
          value={form.additionalNotes}
          onChange={(e) => setForm({ ...form, additionalNotes: e.target.value })}
          data-testid="mr-additional-notes"
        />
      </div>

      <LiveSignatureBlock
        label="Sign before generating"
        subtitle="Your signature appears on the bottom of the measurement record"
        value={liveSignature}
        onChange={setLiveSignature}
        savedSignature={user?.signature}
        testIdPrefix="mr-sig"
      />

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="mr-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate measurement sheet</>}
      </button>

      {/* ---------- OUTPUT ---------- */}
      {result && (
        <div className="card-dark p-6 mt-6" data-testid="mr-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated measurement sheet</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Measurement Record — ${form.project}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="mr-output">{result}</pre>
        </div>
      )}
    </div>
  );
}

function MeasurementTable({ title, rows, unit, onChange, onRemove, onAdd, testIdBase, flat }) {
  return (
    <div className={flat ? "" : "card-dark p-5"} data-testid={`${testIdBase}-table`}>
      {!flat && <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4 flex items-center gap-2"><Ruler size={14}/> {title}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-[#706D66]">
            <tr>
              <th className="text-left py-2 w-1/3">Item / Description</th>
              <th className="text-right">L</th>
              <th className="text-right">W</th>
              <th className="text-right">H</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Total</th>
              <th className="text-left pl-2">Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const t = rowTotal(r);
              return (
                <tr key={r.id} className="border-t border-[#F0EDE8]/5" data-testid={`${testIdBase}-row-${idx}`}>
                  <td className="py-1 pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder="e.g. Living room floor" value={r.description} onChange={(e) => onChange(r.id, "description", e.target.value)} data-testid={`${testIdBase}-row-${idx}-desc`} />
                  </td>
                  <td className="pr-1"><input type="number" step="0.01" className="input-base !py-1 !text-sm text-right" value={r.length} onChange={(e) => onChange(r.id, "length", e.target.value)} data-testid={`${testIdBase}-row-${idx}-L`} /></td>
                  <td className="pr-1"><input type="number" step="0.01" className="input-base !py-1 !text-sm text-right" value={r.width} onChange={(e) => onChange(r.id, "width", e.target.value)} data-testid={`${testIdBase}-row-${idx}-W`} /></td>
                  <td className="pr-1"><input type="number" step="0.01" className="input-base !py-1 !text-sm text-right" value={r.height} onChange={(e) => onChange(r.id, "height", e.target.value)} data-testid={`${testIdBase}-row-${idx}-H`} /></td>
                  <td className="pr-1"><input type="number" step="1" className="input-base !py-1 !text-sm text-right" value={r.quantity} onChange={(e) => onChange(r.id, "quantity", e.target.value)} data-testid={`${testIdBase}-row-${idx}-Q`} /></td>
                  <td className="pr-1 text-right tabular-nums" style={{ color: t.kind === "empty" ? "#706D66" : "#E8A020" }} data-testid={`${testIdBase}-row-${idx}-total`}>
                    {t.kind === "empty" ? "—" : `${fmt(t.value, t.kind === "volume" ? 3 : 2)} ${unit}${t.unit}`}
                  </td>
                  <td className="pl-2"><input className="input-base !py-1 !text-sm" placeholder="e.g. deduct window" value={r.notes} onChange={(e) => onChange(r.id, "notes", e.target.value)} data-testid={`${testIdBase}-row-${idx}-notes`} /></td>
                  <td className="text-right pl-2"><button onClick={() => onRemove(r.id)} className="text-[#706D66] hover:text-red-400" data-testid={`${testIdBase}-row-${idx}-del`}><Trash2 size={14}/></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button onClick={onAdd} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid={`${testIdBase}-add`}>
        <Plus size={12}/> Add row
      </button>
    </div>
  );
}

function Inp({ label, value, onChange, type = "text", testId, readOnly }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        className="input-base"
        data-testid={testId}
      />
    </label>
  );
}

function Drop({ label, value, onChange, options, testId }) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input-base" data-testid={testId}>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function Stat({ label, value, testId, accent }) {
  return (
    <div data-testid={testId}>
      <div className="text-[10px] uppercase tracking-widest text-[#706D66] mb-1">{label}</div>
      <div className="font-display text-2xl" style={{ color: accent ? "#E8A020" : "#F0EDE8" }}>{value}</div>
    </div>
  );
}
