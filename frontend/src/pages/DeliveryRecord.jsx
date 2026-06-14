import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, Package, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID   = "delivery-record";
const TOOL_NAME = "Delivery Record";
const TOOL_INFO =
  "Records every delivery received on site. Verifies against orders, flags short or damaged deliveries, and provides a signed record for raising disputes with suppliers or contractors. Auto-flags the overall status from the item table.";

const isoToday = () => new Date().toISOString().slice(0, 10);
const nowHHMM = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const UNIT_OPTIONS = ["Each", "Box", "Roll", "Length", "Sheet", "Bag", "Pallet", "Other"];
const CONDITION_OPTIONS = [
  "Good",
  "Damaged",
  "Short delivery",
  "Wrong item",
  "Substituted item",
];

const N = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

function makeRow() {
  return {
    id: crypto.randomUUID(),
    description: "",
    qtyOrdered: "",
    qtyReceived: "",
    unit: "Each",
    condition: "Good",
    notes: "",
  };
}

export default function DeliveryRecord() {
  const { user, refresh } = useAuth();

  // SECTION 1 — DELIVERY DETAILS
  const [project, setProject]               = useState("");
  const [siteAddress, setSiteAddress]       = useState("");
  const [deliveryDate, setDeliveryDate]     = useState(isoToday());
  const [deliveryTime, setDeliveryTime]     = useState(nowHHMM());
  const [supplier, setSupplier]             = useState("");
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState("");
  const [poRef, setPoRef]                   = useState("");
  const [driverName, setDriverName]         = useState("");
  const [vehicleReg, setVehicleReg]         = useState("");

  // SECTION 2 — ITEMS
  const [items, setItems] = useState([makeRow()]);

  // SECTION 3 — ACCEPTANCE
  const [accepted, setAccepted]   = useState("Yes"); // Yes / No / Accepted with reservations
  const [actionTaken, setActionTaken] = useState("");
  const [followUp, setFollowUp]   = useState("");

  // SECTION 4 — SIGN OFF
  const [receivedBy]                     = useState(user?.fullName || "");
  const signOffDate                      = isoToday();
  const [receiverSig, setReceiverSig]    = useState("");
  const [driverSig, setDriverSig]        = useState("");

  // Output
  const [infoOpen, setInfoOpen]         = useState(false);
  const [generating, setGenerating]     = useState(false);
  const [result, setResult]             = useState("");
  const [refNumber, setRefNumber]       = useState("");

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
    setItems((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const removeRow = (id) =>
    setItems((rs) => rs.filter((r) => r.id !== id));
  const addRow = () => setItems((rs) => [...rs, makeRow()]);

  // Decorated rows + delivery status
  const decorated = useMemo(
    () => items.map((r) => {
      const shortQty = N(r.qtyOrdered) > 0 && N(r.qtyReceived) < N(r.qtyOrdered);
      const issue = r.condition !== "Good" || shortQty;
      return { ...r, shortQty, issue };
    }),
    [items]
  );

  const overallStatus = useMemo(() => {
    const populated = decorated.filter((r) => (r.description || "").trim().length > 0);
    if (populated.length === 0) return { label: "—", clean: false };
    const anyIssue = populated.some((r) => r.issue);
    return anyIssue
      ? { label: "Delivery Incomplete or Disputed — See Notes", clean: false }
      : { label: "Delivery Complete — Accepted", clean: true };
  }, [decorated]);

  const onGenerate = async () => {
    if (!project.trim())  { toast.error("Add the project / site name"); return; }
    if (!supplier.trim()) { toast.error("Add the supplier name"); return; }
    const populated = decorated.filter((r) => (r.description || "").trim().length > 0);
    if (populated.length === 0) { toast.error("Add at least one item received"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const itemsBlock = populated.map((r) => {
      return [
        `Item Description: ${r.description}`,
        `Quantity Ordered: ${r.qtyOrdered || "—"}`,
        `Quantity Received: ${r.qtyReceived || "—"}`,
        `Unit: ${r.unit}`,
        `Condition: ${r.condition}`,
        `Notes: ${r.notes || "—"}`,
      ].join(" | ");
    }).join("\n");

    const promptTemplate = `Produce a UK DELIVERY RECORD. Plain direct construction English. No padding. No banned consultant words. Formal goods-received record used at site for verifying deliveries and raising disputes.

1. HEADER — DOCUMENT REFERENCE, DATE (use {deliveryDate} in DD/MM/YYYY format for DATE).

2. TITLE — exactly: 'DELIVERY RECORD — {supplier} — {deliveryDate}'.

3. DELIVERY DETAILS — list on separate lines:
   Project / Site: {project}
   Site Address: {siteAddress}
   Date of Delivery: {deliveryDate}
   Time of Delivery: {deliveryTime}
   Supplier / Company Name: {supplier}
   Delivery Note Number: {deliveryNoteNumber}
   Purchase Order Reference: {poRef}
   Delivered by (Driver Name): {driverName}
   Vehicle Registration: {vehicleReg}
   Received by: {receivedBy}
   Receiving Company: {companyName}

4. ITEMS RECEIVED — print this header line then each item below verbatim on its own block, preserving the pipe-delimited structure exactly as supplied:
{itemsBlock}

5. OVERALL DELIVERY STATUS — print verbatim on its own line in capitals, prominent:
   OVERALL DELIVERY STATUS: {overallStatusUpper}

6. ACCEPTANCE — print on separate lines:
   Was the delivery accepted? {accepted}
{actionFollowUpBlock}

7. FOOTER — print verbatim on its own line:
   This delivery record should be retained with the relevant purchase order and invoice. Any discrepancies should be notified to the supplier in writing within 24 hours.

8. SIGN-OFF — dual sign-off:
   Received by: {receivedBy}
   Date: {deliveryDate}
   Receiver Signature: (auto-insert receiver's signature if held; otherwise leave a signature line)

   Delivered by: {driverName}
   Driver Signature: (leave a signature line for the driver to sign; if a captured driver signature was supplied, insert it)

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Never invent items, quantities or conditions. Use only the supplied rows.
- Never use abbreviations such as 'N/A', 'TBC', 'qty', '&'. Write words in full.
- Skip blank optional fields cleanly. Use '—' only where supplied.
- No banned consultant words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct.`;

    const actionFollowUpLines = [];
    if (accepted !== "Yes" || actionTaken.trim()) {
      actionFollowUpLines.push(`   Action Taken: ${actionTaken.trim() || "(no action recorded)"}`);
    }
    if (followUp.trim()) {
      actionFollowUpLines.push(`   Follow-Up Required: ${followUp.trim()}`);
    }
    const actionFollowUpBlock = actionFollowUpLines.length ? actionFollowUpLines.join("\n") : "";

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          deliveryDate: ukDate(deliveryDate),
          deliveryTime: deliveryTime || "—",
          project,
          siteAddress: siteAddress || "—",
          supplier,
          deliveryNoteNumber: deliveryNoteNumber || "—",
          poRef: poRef || "—",
          driverName: driverName || "—",
          vehicleReg: vehicleReg || "—",
          receivedBy: receivedBy || user?.fullName || "—",
          companyName: user?.companyName || "—",
          itemsBlock,
          overallStatusUpper: overallStatus.label.toUpperCase(),
          accepted,
          actionFollowUpBlock,
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Delivery Record generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: receiverSig || user?.signature };
    downloadPdf({ title: `Delivery Record — ${supplier || "supplier"} — ${deliveryDate}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-delivery-record">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Site Tools</div>
          <h1 className="font-display text-4xl md:text-5xl">Delivery Record</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="dr-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="dr-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 — DELIVERY DETAILS */}
      <Section title="Delivery Details" testId="dr-section-1" icon={<Package size={14}/>}>
        <Grid>
          <Inp label="Project / Site" value={project} onChange={setProject} testId="dr-project" />
          <Inp label="Site Address" value={siteAddress} onChange={setSiteAddress} testId="dr-address" />
          <Inp label="Date of Delivery" value={deliveryDate} onChange={setDeliveryDate} type="date" testId="dr-date" helper="Displayed in DD/MM/YYYY on the document" />
          <Inp label="Time of Delivery" value={deliveryTime} onChange={setDeliveryTime} type="time" testId="dr-time" />
          <Inp label="Supplier / Company Name" value={supplier} onChange={setSupplier} testId="dr-supplier" />
          <Inp label="Delivery Note Number" value={deliveryNoteNumber} onChange={setDeliveryNoteNumber} testId="dr-note-number" helper="Found on the paper delivery note from the driver" />
          <Inp label="Purchase Order Reference (optional)" value={poRef} onChange={setPoRef} testId="dr-po" helper="Your order number if you have one" />
          <Inp label="Delivered by (Driver Name) — optional" value={driverName} onChange={setDriverName} testId="dr-driver" />
          <Inp label="Vehicle Registration (optional)" value={vehicleReg} onChange={setVehicleReg} testId="dr-vehicle" />
        </Grid>
      </Section>

      {/* SECTION 2 — ITEMS TABLE */}
      <Section title="Items Received" testId="dr-section-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 1200 }}>
            <thead className="text-[10px] uppercase tracking-widest text-[#706D66]">
              <tr>
                <th className="text-left py-2 pr-2">Item Description</th>
                <th className="text-right pr-2 whitespace-nowrap">Quantity Ordered</th>
                <th className="text-right pr-2 whitespace-nowrap">Quantity Received</th>
                <th className="text-left pr-2">Unit</th>
                <th className="text-left pr-2">Condition</th>
                <th className="text-left pr-2">Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {decorated.map((r, idx) => (
                <tr key={r.id} className="border-t border-[#F0EDE8]/5 align-top" data-testid={`dr-row-${idx}`}>
                  <td className="pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder={`e.g. "100 millimetre Galvanised Ductwork Straight"`} value={r.description} onChange={(e) => updateRow(r.id, "description", e.target.value)} data-testid={`dr-row-${idx}-description`} />
                  </td>
                  <td className="pr-2">
                    <input type="number" min="0" step="0.01" className="input-base !py-1 !text-sm text-right" value={r.qtyOrdered} onChange={(e) => updateRow(r.id, "qtyOrdered", e.target.value)} data-testid={`dr-row-${idx}-ordered`} />
                  </td>
                  <td className="pr-2">
                    <input
                      type="number" min="0" step="0.01"
                      className="input-base !py-1 !text-sm text-right"
                      value={r.qtyReceived}
                      onChange={(e) => updateRow(r.id, "qtyReceived", e.target.value)}
                      data-testid={`dr-row-${idx}-received`}
                      style={r.shortQty ? { color: "#E8A020", borderColor: "#E8A020" } : {}}
                    />
                  </td>
                  <td className="pr-2">
                    <select className="input-base !py-1 !text-sm" value={r.unit} onChange={(e) => updateRow(r.id, "unit", e.target.value)} data-testid={`dr-row-${idx}-unit`}>
                      {UNIT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="pr-2">
                    <select
                      className="input-base !py-1 !text-sm"
                      value={r.condition}
                      onChange={(e) => updateRow(r.id, "condition", e.target.value)}
                      data-testid={`dr-row-${idx}-condition`}
                      style={r.condition !== "Good" ? { color: "#E8A020", borderColor: "#E8A020" } : {}}
                    >
                      {CONDITION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="pr-2">
                    <input className="input-base !py-1 !text-sm" placeholder={`e.g. "outer packaging torn, product intact"`} value={r.notes} onChange={(e) => updateRow(r.id, "notes", e.target.value)} data-testid={`dr-row-${idx}-notes`} />
                  </td>
                  <td className="text-right">
                    <button onClick={() => removeRow(r.id)} className="text-[#706D66] hover:text-red-400" data-testid={`dr-row-${idx}-remove`}><Trash2 size={14}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addRow} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="dr-add-row">
          <Plus size={12}/> Add Item
        </button>
        <div className="text-[10px] text-[#706D66] mt-2">
          Quantity Received highlights in gold if it is less than Quantity Ordered. Condition highlights in gold if anything other than Good is selected.
        </div>
      </Section>

      {/* SECTION 3 — DELIVERY STATUS */}
      <Section title="Delivery Status" testId="dr-section-3">
        <div
          className="p-5 rounded mb-4"
          style={{
            background: overallStatus.clean ? "rgba(127,224,138,0.10)" : "rgba(232,160,32,0.10)",
            border: `1px solid ${overallStatus.clean ? "#7FE08A" : "#E8A020"}`,
          }}
          data-testid="dr-overall-status"
        >
          <div className="text-[10px] uppercase tracking-widest text-[#706D66] mb-1">Overall Delivery Status</div>
          <div className="font-display text-2xl" style={{ color: overallStatus.clean ? "#7FE08A" : "#E8A020" }}>
            {overallStatus.label}
          </div>
        </div>

        <label className="block mb-4">
          <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">Was the delivery accepted?</div>
          <div className="flex gap-2 flex-wrap" data-testid="dr-accepted-toggle">
            {["Yes", "No", "Accepted with reservations"].map((v) => {
              const active = accepted === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAccepted(v)}
                  className={`px-4 py-2 rounded text-xs ${active ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94]"}`}
                  data-testid={`dr-accepted-${v.toLowerCase().replace(/\s+/g, "-")}`}
                >{v}</button>
              );
            })}
          </div>
        </label>

        {accepted !== "Yes" && (
          <Area
            label="Action Taken"
            value={actionTaken}
            onChange={setActionTaken}
            rows={3}
            placeholder={`e.g. "Driver informed, supplier called, goods returned, short delivery noted on delivery note"`}
            testId="dr-action"
          />
        )}

        <div className="mt-4">
          <Area
            label="Follow-Up Required (optional)"
            value={followUp}
            onChange={setFollowUp}
            rows={2}
            placeholder={`e.g. "Replacement items to be delivered by 20/06/2026"`}
            testId="dr-followup"
          />
        </div>

        {!overallStatus.clean && overallStatus.label !== "—" && (
          <div
            className="mt-4 p-3 rounded flex items-start gap-2"
            style={{ border: "1px solid #E8A020", background: "rgba(232,160,32,0.08)" }}
            data-testid="dr-discrepancy-banner"
          >
            <AlertTriangle size={16} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
            <div className="text-xs text-[#F0EDE8] leading-relaxed">
              Any discrepancies should be notified to the supplier in writing within 24 hours. Make sure the driver has either signed your copy of the delivery note showing the issue, or you have a separate photographic record.
            </div>
          </div>
        )}
      </Section>

      {/* SECTION 4 — SIGN OFF */}
      <Section title="Sign Off" testId="dr-section-signoff">
        <Grid>
          <ReadOnly label="Received by" value={receivedBy || "—"} testId="dr-receivedby" helper="Auto-populated from your profile" />
          <ReadOnly label="Date" value={ukDate(signOffDate)} testId="dr-signoff-date" helper="Today's date, automatically set" />
        </Grid>

        <div className="grid md:grid-cols-2 gap-5 mt-5">
          <LiveSignatureBlock
            label="Receiver Signature"
            subtitle="Your signature is stamped on the generated PDF"
            value={receiverSig}
            onChange={setReceiverSig}
            savedSignature={user?.signature}
            testIdPrefix="dr-receiver-sig"
          />
          <LiveSignatureBlock
            label="Driver / Delivery Agent Signature (optional)"
            subtitle="Get the driver to sign here before they leave site"
            value={driverSig}
            onChange={setDriverSig}
            allowBlank
            testIdPrefix="dr-driver-sig"
          />
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="dr-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Delivery Record</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="dr-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated delivery record</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Delivery Record — ${supplier} — ${ukDate(deliveryDate)}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="dr-output">{result}</pre>
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
function ReadOnly({ label, value, testId, helper }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <div className="input-base !cursor-default" data-testid={testId}>{value}</div>
      {helper && <div className="text-[10px] text-[#706D66] mt-1">{helper}</div>}
    </label>
  );
}
