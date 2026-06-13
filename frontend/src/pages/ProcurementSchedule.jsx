import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, ShoppingCart, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID   = "procurement-schedule";
const TOOL_NAME = "Procurement Schedule";
const TOOL_INFO =
  "Live schedule for planning and tracking material and equipment orders. Calculates an Order By Date from the Date Required on Site minus the supplier lead time, and flags items that are slipping or overdue. Update throughout the project as orders are placed and deliveries received.";

const isoToday = () => new Date().toISOString().slice(0, 10);

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Subtract N working days (Monday–Friday) from an ISO date.
// Returns an ISO string YYYY-MM-DD or "" if inputs are not valid.
function subtractWorkingDays(iso, days) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const n = parseInt(days, 10);
  if (!Number.isFinite(n) || n < 0) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  let remaining = n;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    const dow = d.getUTCDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return d.toISOString().slice(0, 10);
}

// Days between today and the given ISO date. Negative if in the past.
function daysFromToday(iso) {
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const target = new Date(`${iso}T00:00:00Z`);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function earliestIso(list) {
  const valid = list.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x));
  if (!valid.length) return "";
  return valid.sort()[0];
}

const UNIT_OPTIONS = ["Each", "Box", "Roll", "Length", "Sheet", "Bag", "Pallet", "Set", "Other"];
const STATUS_OPTIONS = [
  "Not yet ordered",
  "Order placed — awaiting delivery",
  "Delivered — complete",
  "Delivered — short or damaged (see delivery record)",
  "Overdue — chasing supplier",
  "Cancelled",
];

function refForIndex(i) {
  return `P-${String(i + 1).padStart(3, "0")}`;
}

function makeRow() {
  return {
    id: crypto.randomUUID(),
    description: "",
    supplier: "",
    quantity: "",
    unit: "Each",
    dateRequired: "",
    leadTime: "",
    orderPlacedDate: "",
    expectedDelivery: "",
    actualDelivery: "",
    status: "Not yet ordered",
    notes: "",
  };
}

export default function ProcurementSchedule() {
  const { user, refresh } = useAuth();

  // SECTION 1
  const [project, setProject]         = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [projectStart, setProjectStart] = useState("");
  const [createdBy]                   = useState(user?.fullName || "");
  const [dateCreated]                 = useState(isoToday());

  // SECTION 2
  const [rows, setRows] = useState([makeRow()]);

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

  const updateRow = (id, field, value) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const removeRow = (id) =>
    setRows((rs) => rs.filter((r) => r.id !== id));
  const addRow = () => setRows((rs) => [...rs, makeRow()]);

  // Decorate rows with computed Order By Date + overdue flag
  const decorated = useMemo(() => {
    return rows.map((r, i) => {
      const orderBy = subtractWorkingDays(r.dateRequired, r.leadTime);
      const d = orderBy ? daysFromToday(orderBy) : null;
      const orderBySlipped = d !== null && d < 0 && r.status === "Not yet ordered";
      return { ...r, ref: refForIndex(i), orderBy, orderBySlipped };
    });
  }, [rows]);

  // Summary
  const summary = useMemo(() => {
    const populated = decorated.filter((r) => (r.description || "").trim().length > 0);
    let notOrdered = 0;
    let notOrderedSlipped = 0;
    let awaiting = 0;
    let deliveredComplete = 0;
    let issues = 0;
    const upcoming = [];
    for (const r of populated) {
      if (r.status === "Not yet ordered") {
        notOrdered += 1;
        if (r.orderBySlipped) notOrderedSlipped += 1;
        if (r.orderBy) upcoming.push(r.orderBy);
      } else if (r.status === "Order placed — awaiting delivery") {
        awaiting += 1;
      } else if (r.status === "Delivered — complete") {
        deliveredComplete += 1;
      } else if (
        r.status === "Delivered — short or damaged (see delivery record)" ||
        r.status === "Overdue — chasing supplier"
      ) {
        issues += 1;
      }
    }
    const nextDeadline = earliestIso(upcoming);
    return {
      total: populated.length,
      notOrdered,
      notOrderedSlipped,
      awaiting,
      deliveredComplete,
      issues,
      nextDeadline,
    };
  }, [decorated]);

  const onGenerate = async () => {
    if (!project.trim())   { toast.error("Add the project name"); return; }
    if (!siteAddress.trim()) { toast.error("Add the site address"); return; }
    const populated = decorated.filter((r) => (r.description || "").trim().length > 0);
    if (populated.length === 0) { toast.error("Add at least one item to the schedule"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const itemsBlock = populated.map((r) => {
      return [
        `Reference Number: ${r.ref}`,
        `Item Description: ${r.description}`,
        `Supplier: ${r.supplier || "—"}`,
        `Quantity: ${r.quantity || "—"} ${r.unit || ""}`.trim(),
        `Date Required on Site: ${ukDate(r.dateRequired) || "—"}`,
        `Lead Time: ${r.leadTime ? `${r.leadTime} working days` : "—"}`,
        `Order By Date: ${ukDate(r.orderBy) || "—"}`,
        `Date Order Placed: ${ukDate(r.orderPlacedDate) || "—"}`,
        `Expected Delivery Date: ${ukDate(r.expectedDelivery) || "—"}`,
        `Actual Delivery Date: ${ukDate(r.actualDelivery) || "—"}`,
        `Status: ${r.status}`,
        `Notes: ${r.notes || "—"}`,
      ].join(" | ");
    }).join("\n");

    const issueList = populated
      .filter((r) => r.status === "Overdue — chasing supplier" || r.status === "Delivered — short or damaged (see delivery record)" || r.orderBySlipped)
      .map((r) => {
        const reason = r.status === "Overdue — chasing supplier"
          ? "Overdue — chasing supplier"
          : r.status === "Delivered — short or damaged (see delivery record)"
            ? "Delivered short or damaged"
            : `Order By Date has passed (${ukDate(r.orderBy)})`;
        return `   ${r.ref} — ${r.description} — ${reason}`;
      })
      .join("\n");

    const promptTemplate = `Produce a UK PROCUREMENT SCHEDULE. Plain direct construction English. No padding. No banned consultant words. This is a live working schedule used by the project team to track ordering and delivery of materials and equipment.

1. HEADER — DOCUMENT REFERENCE, DATE (use {dateCreated} in DD/MM/YYYY format for DATE).

2. TITLE — exactly: 'PROCUREMENT SCHEDULE — {project} — {dateCreated}'.

3. PROJECT DETAILS — list on separate lines:
   Project Name: {project}
   Site Address: {siteAddress}
   Project Start Date: {projectStart}
   Schedule Created by: {createdBy}
   Date Created: {dateCreated}
   Company Name: {companyName}
   Trade: {trade}

4. PROCUREMENT SCHEDULE — print this header line then each item below verbatim on its own block, preserving the pipe-delimited structure exactly as supplied. Keep one item per line:
{itemsBlock}

5. SCHEDULE SUMMARY — print on separate lines:
   Total items on schedule: {total}
   Items not yet ordered: {notOrdered}
   Of those, items where the Order By Date has already passed: {notOrderedSlipped}
   Items ordered and awaiting delivery: {awaiting}
   Items delivered complete: {deliveredComplete}
   Items overdue or with delivery issues: {issues}
   Next order deadline: {nextDeadline}

{issueSection}

6. IMPORTANT NOTE — print verbatim as one paragraph:
   Always check lead times before confirming a programme with your contractor. Materials delays are one of the most common causes of variation claims being rejected. Use the Delay Notice tool if a late delivery impacts your works.

7. FOOTER — print verbatim on its own line:
   This schedule should be reviewed regularly and updated as orders are placed and deliveries received.

8. SIGN-OFF — single sign-off:
   Schedule Created by: {createdBy}
   Date: {dateCreated}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Never invent items, suppliers, dates or values. Use only the supplied rows.
- Never use abbreviations such as 'N/A', 'TBC', 'qty', 'PO', or '&'. Write words in full.
- Skip blank optional fields cleanly. Use '—' only where supplied.
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
          projectStart: ukDate(projectStart) || "—",
          createdBy: createdBy || user?.fullName || "—",
          dateCreated: ukDate(dateCreated),
          companyName: user?.companyName || "—",
          trade: user?.trade || "—",
          itemsBlock,
          total: String(summary.total),
          notOrdered: String(summary.notOrdered),
          notOrderedSlipped: String(summary.notOrderedSlipped),
          awaiting: String(summary.awaiting),
          deliveredComplete: String(summary.deliveredComplete),
          issues: String(summary.issues),
          nextDeadline: ukDate(summary.nextDeadline) || "—",
          issueSection: issueList
            ? `ITEMS REQUIRING ATTENTION — the following items are overdue, short or damaged, or have passed their Order By Date and remain unordered:\n${issueList}`
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
      toast.success("Procurement Schedule generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Procurement Schedule — ${project || "project"}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-procurement-schedule">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Site Tools</div>
          <h1 className="font-display text-4xl md:text-5xl">Procurement Schedule</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="ps-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="ps-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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
      <Section title="Project Details" testId="ps-section-1" icon={<ShoppingCart size={14}/>}>
        <Grid>
          <Inp label="Project Name" value={project} onChange={setProject} testId="ps-project" />
          <Inp label="Site Address" value={siteAddress} onChange={setSiteAddress} testId="ps-site" />
          <Inp label="Project Start Date" value={projectStart} onChange={setProjectStart} type="date" testId="ps-start" />
          <ReadOnly label="Schedule Created by" value={createdBy || "—"} testId="ps-createdby" helper="Auto-populated from your profile" />
          <ReadOnly label="Date Created" value={ukDate(dateCreated)} testId="ps-datecreated" helper="Today's date, automatically set" />
        </Grid>
      </Section>

      {/* SECTION 2 — PROCUREMENT TABLE */}
      <Section title="Procurement Schedule" testId="ps-section-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 1500 }}>
            <thead className="text-[10px] uppercase tracking-widest text-[#706D66]">
              <tr>
                <th className="text-left py-2 pr-2 whitespace-nowrap">Reference Number</th>
                <th className="text-left pr-2">Item Description</th>
                <th className="text-left pr-2">Supplier</th>
                <th className="text-right pr-2">Quantity</th>
                <th className="text-left pr-2">Unit</th>
                <th className="text-left pr-2 whitespace-nowrap">Date Required on Site</th>
                <th className="text-right pr-2 whitespace-nowrap">Lead Time (working days)</th>
                <th className="text-left pr-2 whitespace-nowrap">Order By Date</th>
                <th className="text-left pr-2 whitespace-nowrap">Date Order Placed</th>
                <th className="text-left pr-2 whitespace-nowrap">Expected Delivery Date</th>
                <th className="text-left pr-2 whitespace-nowrap">Actual Delivery Date</th>
                <th className="text-left pr-2">Status</th>
                <th className="text-left pr-2">Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {decorated.map((r, idx) => (
                <tr key={r.id} className="border-t border-[#F0EDE8]/5 align-top" data-testid={`ps-row-${idx}`}>
                  <td className="py-1 pr-2 text-[#E8A020] text-xs font-mono whitespace-nowrap" data-testid={`ps-row-${idx}-ref`}>{r.ref}</td>
                  <td className="pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder={`e.g. "100 millimetre Galvanised Ductwork Straight — 1.2 metre length"`} value={r.description} onChange={(e) => updateRow(r.id, "description", e.target.value)} data-testid={`ps-row-${idx}-description`} />
                  </td>
                  <td className="pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder="Supplier" value={r.supplier} onChange={(e) => updateRow(r.id, "supplier", e.target.value)} data-testid={`ps-row-${idx}-supplier`} />
                  </td>
                  <td className="pr-2">
                    <input type="number" min="0" className="input-base !py-1 !text-sm text-right" value={r.quantity} onChange={(e) => updateRow(r.id, "quantity", e.target.value)} data-testid={`ps-row-${idx}-quantity`} />
                  </td>
                  <td className="pr-2">
                    <select className="input-base !py-1 !text-sm" value={r.unit} onChange={(e) => updateRow(r.id, "unit", e.target.value)} data-testid={`ps-row-${idx}-unit`}>
                      {UNIT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="pr-2">
                    <input type="date" className="input-base !py-1 !text-sm" value={r.dateRequired} onChange={(e) => updateRow(r.id, "dateRequired", e.target.value)} data-testid={`ps-row-${idx}-required`} />
                  </td>
                  <td className="pr-2">
                    <input type="number" min="0" className="input-base !py-1 !text-sm text-right" value={r.leadTime} onChange={(e) => updateRow(r.id, "leadTime", e.target.value)} data-testid={`ps-row-${idx}-leadtime`} />
                  </td>
                  <td className="pr-2 whitespace-nowrap">
                    <div
                      className="px-2 py-1 rounded text-xs font-mono"
                      style={{
                        background: r.orderBySlipped ? "rgba(232,160,32,0.15)" : "rgba(15,15,15,0.4)",
                        border: `1px solid ${r.orderBySlipped ? "#E8A020" : "rgba(160,157,148,0.18)"}`,
                        color: r.orderBySlipped ? "#E8A020" : "#F0EDE8",
                      }}
                      data-testid={`ps-row-${idx}-orderby`}
                    >
                      {ukDate(r.orderBy) || "—"}
                    </div>
                  </td>
                  <td className="pr-2">
                    <input type="date" className="input-base !py-1 !text-sm" value={r.orderPlacedDate} onChange={(e) => updateRow(r.id, "orderPlacedDate", e.target.value)} data-testid={`ps-row-${idx}-placed`} />
                  </td>
                  <td className="pr-2">
                    <input type="date" className="input-base !py-1 !text-sm" value={r.expectedDelivery} onChange={(e) => updateRow(r.id, "expectedDelivery", e.target.value)} data-testid={`ps-row-${idx}-expected`} />
                  </td>
                  <td className="pr-2">
                    <input type="date" className="input-base !py-1 !text-sm" value={r.actualDelivery} onChange={(e) => updateRow(r.id, "actualDelivery", e.target.value)} data-testid={`ps-row-${idx}-actual`} />
                  </td>
                  <td className="pr-2">
                    <select className="input-base !py-1 !text-sm" value={r.status} onChange={(e) => updateRow(r.id, "status", e.target.value)} data-testid={`ps-row-${idx}-status`}>
                      {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder="Notes" value={r.notes} onChange={(e) => updateRow(r.id, "notes", e.target.value)} data-testid={`ps-row-${idx}-notes`} />
                  </td>
                  <td className="text-right">
                    <button onClick={() => removeRow(r.id)} className="text-[#706D66] hover:text-red-400" data-testid={`ps-row-${idx}-remove`}><Trash2 size={14}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addRow} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="ps-add-row">
          <Plus size={12}/> Add Item
        </button>
        <div className="text-[10px] text-[#706D66] mt-2">
          The Order By Date is calculated automatically as the Date Required on Site minus the supplier lead time, counting working days only (Monday to Friday). It will highlight in gold if today is past that date and the item has not yet been ordered.
        </div>
      </Section>

      {/* SECTION 3 — SUMMARY */}
      <Section title="Schedule Summary" testId="ps-section-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Stat label="Total items on schedule" value={String(summary.total)} testId="ps-sum-total" />
          <Stat
            label="Items not yet ordered"
            value={
              summary.notOrderedSlipped > 0
                ? `${summary.notOrdered} (${summary.notOrderedSlipped} past Order By Date)`
                : String(summary.notOrdered)
            }
            warn={summary.notOrderedSlipped > 0}
            testId="ps-sum-notordered"
          />
          <Stat label="Ordered and awaiting delivery" value={String(summary.awaiting)} testId="ps-sum-awaiting" />
          <Stat label="Delivered — complete" value={String(summary.deliveredComplete)} testId="ps-sum-delivered" />
          <Stat label="Overdue or with delivery issues" value={String(summary.issues)} danger={summary.issues > 0} testId="ps-sum-issues" />
          <Stat
            label="Next order deadline"
            value={summary.nextDeadline ? ukDate(summary.nextDeadline) : "—"}
            highlight
            testId="ps-sum-next"
          />
        </div>
      </Section>

      {/* SECTION 4 — IMPORTANT NOTE */}
      <div
        className="card-dark p-5 mb-5 flex items-start gap-3"
        style={{ borderColor: "#E8A020", background: "rgba(232,160,32,0.08)" }}
        data-testid="ps-note"
      >
        <AlertTriangle size={18} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
        <div className="text-sm text-[#F0EDE8] leading-relaxed">
          Always check lead times before confirming a programme with your contractor. Materials delays are one of the most common causes of variation claims being rejected. Use the Delay Notice tool if a late delivery impacts your works.
        </div>
      </div>

      {/* SIGN-OFF */}
      <Section title="Sign Off" testId="ps-section-signoff">
        <LiveSignatureBlock
          label="Schedule signature"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="ps-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="ps-sig-date">
          Date: {ukDate(dateCreated) || "—"}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="ps-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Procurement Schedule</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="ps-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated schedule</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Procurement Schedule — ${project}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="ps-output">{result}</pre>
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
function ReadOnly({ label, value, testId, helper }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <div className="input-base !cursor-default" data-testid={testId}>{value}</div>
      {helper && <div className="text-[10px] text-[#706D66] mt-1">{helper}</div>}
    </label>
  );
}
function Stat({ label, value, testId, warn, danger, highlight }) {
  let color = "#F0EDE8";
  let border = "rgba(160,157,148,0.18)";
  let bg = "rgba(15,15,15,0.6)";
  if (warn)     { color = "#E8A020"; border = "#E8A020"; bg = "rgba(232,160,32,0.10)"; }
  if (danger)   { color = "#FF6B6B"; border = "#FF6B6B"; bg = "rgba(255,107,107,0.10)"; }
  if (highlight){ color = "#E8A020"; border = "#E8A020"; bg = "rgba(232,160,32,0.06)"; }
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
