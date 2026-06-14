import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID   = "purchase-order";
const TOOL_NAME = "Purchase Order";
const TOOL_INFO =
  "Formal purchase order sent to a supplier to order materials or equipment. Creates a reference number that ties back to your Delivery Record and the supplier invoice, and protects you if the wrong items arrive or prices are later disputed.";

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

const UNIT_OPTIONS = ["Each", "Box", "Roll", "Length", "Sheet", "Bag", "Pallet", "Set", "Other"];
const PAYMENT_TERMS = ["30 days", "14 days", "On delivery", "Other"];
const VAT_RATES = ["20%", "5%", "0%"];

function makeRow() {
  return {
    id: crypto.randomUUID(),
    description: "",
    productRef: "",
    quantity: "",
    unit: "Each",
    unitPrice: "",
    notes: "",
  };
}

export default function PurchaseOrder() {
  const { user, refresh } = useAuth();

  // SECTION 1 — ORDER
  const [poNumber, setPoNumber]               = useState("PO-001");
  const [orderDate, setOrderDate]             = useState(isoToday());
  const [requiredDelivery, setRequiredDelivery] = useState("");
  const [projectRef, setProjectRef]           = useState("");

  // SECTION 2 — SUPPLIER
  const [supplierName, setSupplierName]       = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
  const [supplierContact, setSupplierContact] = useState("");
  const [supplierPhone, setSupplierPhone]     = useState("");

  // SECTION 3 — DELIVERY
  const [deliveryAddress, setDeliveryAddress] = useState(user?.siteAddress || "");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");

  // SECTION 4 — ITEMS
  const [rows, setRows] = useState([makeRow()]);

  // SECTION 5 — TOTALS
  const [vatRegistered, setVatRegistered] = useState(Boolean(user?.vatRegistered));
  const [vatRate, setVatRate]             = useState("20%");

  // SECTION 6 — TERMS
  const [paymentTerms, setPaymentTerms]               = useState("30 days");
  const [paymentTermsOther, setPaymentTermsOther]     = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");

  // SIGN OFF
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
    () => rows.map((r, i) => ({ ...r, lineNumber: i + 1, lineTotal: N(r.quantity) * N(r.unitPrice) })),
    [rows]
  );

  const subtotal = useMemo(
    () => decorated.reduce((s, r) => s + r.lineTotal, 0),
    [decorated]
  );
  const vatPct = vatRegistered ? N(vatRate.replace("%", "")) / 100 : 0;
  const vatAmount = +(subtotal * vatPct).toFixed(2);
  const grandTotal = +(subtotal + vatAmount).toFixed(2);

  const onGenerate = async () => {
    if (!supplierName.trim()) { toast.error("Add the supplier name"); return; }
    if (!deliveryAddress.trim()) { toast.error("Add the delivery address"); return; }
    const populated = decorated.filter((r) => (r.description || "").trim().length > 0);
    if (populated.length === 0) { toast.error("Add at least one item to the order"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const itemsBlock = populated.map((r) => {
      return [
        `Item ${r.lineNumber}`,
        `Description: ${r.description}`,
        `Catalogue / Product Reference: ${r.productRef || "—"}`,
        `Quantity: ${r.quantity || "0"}`,
        `Unit: ${r.unit}`,
        `Unit Price: ${money(N(r.unitPrice))} per ${r.unit.toLowerCase()}`,
        `Line Total: ${money(r.lineTotal)}`,
        `Notes: ${r.notes || "—"}`,
      ].join(" | ");
    }).join("\n");

    const totalsBlock = vatRegistered
      ? [
          `Subtotal (excluding VAT): ${money(subtotal)}`,
          `VAT Rate: ${vatRate}`,
          `VAT Amount: ${money(vatAmount)}`,
          `TOTAL ORDER VALUE: ${money(grandTotal)}`,
        ].join("\n   ")
      : [
          `Subtotal: ${money(subtotal)}`,
          `VAT: Not applicable — supplier is not VAT registered`,
          `TOTAL ORDER VALUE: ${money(grandTotal)}`,
        ].join("\n   ");

    const resolvedPaymentTerms = paymentTerms === "Other"
      ? (paymentTermsOther.trim() || "As agreed")
      : paymentTerms;

    const promptTemplate = `Produce a UK PURCHASE ORDER. Plain direct construction English. No padding. No banned consultant words. Formal order sent to a supplier.

1. HEADER — DOCUMENT REFERENCE: {poNumber}. DATE: {orderDate} in DD/MM/YYYY format.

2. TITLE — exactly: 'PURCHASE ORDER — {poNumber} — {orderDate}'.

3. ORDER DETAILS — list on separate lines:
   Purchase Order Number: {poNumber}
   Date of Order: {orderDate}
   Required Delivery Date: {requiredDelivery}
   Project / Job Reference: {projectRef}
   Ordered by Company: {companyName}
   Trade: {trade}

4. SUPPLIER DETAILS — list on separate lines:
   Supplier Name: {supplierName}
   Supplier Address: {supplierAddress}
   Supplier Contact Name: {supplierContact}
   Supplier Phone or Email: {supplierPhone}

5. DELIVERY DETAILS — list on separate lines:
   Delivery Address: {deliveryAddress}
   Delivery Instructions: {deliveryInstructions}

6. ORDER ITEMS — print this header line then each item below verbatim on its own block, preserving the pipe-delimited structure exactly as supplied:
{itemsBlock}

7. TOTALS — print on separate lines (use the supplied figures — never recalculate):
   {totalsBlock}

8. TERMS — list on separate lines:
   Payment Terms: {resolvedPaymentTerms}
   Special Instructions: {specialInstructions}

9. SIGN-OFF — single sign-off:
   Ordered by: {orderedByName}
   Position: {orderedByRole}
   Company: {companyName}
   Date: {orderDate}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

10. FOOTER — print verbatim on its own line:
    This purchase order is subject to the terms stated above. Please quote the purchase order number on all correspondence, delivery notes, and invoices. Delivery to the address stated by the required date.

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Never invent items, quantities, prices or totals. Use only the supplied rows and the supplied totals block.
- Never use abbreviations such as 'N/A', 'TBC', 'qty', '&', 'inc.' or 'excl.'. Write words in full.
- Skip blank optional fields cleanly. Use '—' only where supplied.
- No banned consultant words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          poNumber,
          orderDate: ukDate(orderDate),
          requiredDelivery: ukDate(requiredDelivery) || "—",
          projectRef: projectRef || "—",
          companyName: user?.companyName || "—",
          trade: user?.trade || "—",
          supplierName,
          supplierAddress: supplierAddress || "—",
          supplierContact: supplierContact || "—",
          supplierPhone: supplierPhone || "—",
          deliveryAddress,
          deliveryInstructions: deliveryInstructions || "—",
          itemsBlock,
          totalsBlock,
          resolvedPaymentTerms,
          specialInstructions: specialInstructions || "—",
          orderedByName: user?.fullName || "—",
          orderedByRole: user?.signatureRole || "Director",
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Purchase Order generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Purchase Order — ${poNumber} — ${supplierName || "supplier"}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-purchase-order">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Contractors</div>
          <h1 className="font-display text-4xl md:text-5xl">Purchase Order</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="po-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="po-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 — ORDER DETAILS */}
      <Section title="Order Details" testId="po-section-1" icon={<ShoppingBag size={14}/>}>
        <Grid>
          <Inp label="Purchase Order Number" value={poNumber} onChange={setPoNumber} testId="po-number" helper="Auto-suggested next number — edit if needed" />
          <Inp label="Date of Order" value={orderDate} onChange={setOrderDate} type="date" testId="po-date" />
          <Inp label="Required Delivery Date" value={requiredDelivery} onChange={setRequiredDelivery} type="date" testId="po-required" />
          <Inp label="Project / Job Reference" value={projectRef} onChange={setProjectRef} testId="po-project" placeholder="Which job is this order for?" />
        </Grid>
      </Section>

      {/* SECTION 2 — SUPPLIER DETAILS */}
      <Section title="Supplier Details" testId="po-section-2">
        <Grid>
          <Inp label="Supplier Name" value={supplierName} onChange={setSupplierName} testId="po-supplier-name" />
          <Inp label="Supplier Address (optional)" value={supplierAddress} onChange={setSupplierAddress} testId="po-supplier-address" />
          <Inp label="Supplier Contact Name (optional)" value={supplierContact} onChange={setSupplierContact} testId="po-supplier-contact" />
          <Inp label="Supplier Phone or Email (optional)" value={supplierPhone} onChange={setSupplierPhone} testId="po-supplier-phone" />
        </Grid>
      </Section>

      {/* SECTION 3 — DELIVERY DETAILS */}
      <Section title="Delivery Details" testId="po-section-3">
        <Grid>
          <Inp label="Delivery Address" value={deliveryAddress} onChange={setDeliveryAddress} testId="po-delivery-address" helper="Defaults to your site address if held — edit if different" />
          <Inp label="Delivery Instructions (optional)" value={deliveryInstructions} onChange={setDeliveryInstructions} testId="po-delivery-instructions" placeholder={`e.g. "Call on arrival", "AM delivery only"`} />
        </Grid>
      </Section>

      {/* SECTION 4 — ORDER ITEMS */}
      <Section title="Order Items" testId="po-section-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 1200 }}>
            <thead className="text-[10px] uppercase tracking-widest text-[#706D66]">
              <tr>
                <th className="text-left py-2 pr-2 whitespace-nowrap">Item Number</th>
                <th className="text-left pr-2">Description</th>
                <th className="text-left pr-2 whitespace-nowrap">Catalogue / Product Reference</th>
                <th className="text-right pr-2">Quantity</th>
                <th className="text-left pr-2">Unit</th>
                <th className="text-right pr-2">Unit Price (£)</th>
                <th className="text-right pr-2 whitespace-nowrap">Line Total (£)</th>
                <th className="text-left pr-2">Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {decorated.map((r, idx) => (
                <tr key={r.id} className="border-t border-[#F0EDE8]/5 align-top" data-testid={`po-row-${idx}`}>
                  <td className="py-1 pr-2 text-[#E8A020] text-xs font-mono whitespace-nowrap" data-testid={`po-row-${idx}-num`}>{r.lineNumber}</td>
                  <td className="pr-2"><input className="input-base !py-1 !text-sm" placeholder={`e.g. "100 millimetre Galvanised Ductwork Straight — 1.2 metre length"`} value={r.description} onChange={(e) => updateRow(r.id, "description", e.target.value)} data-testid={`po-row-${idx}-description`} /></td>
                  <td className="pr-2"><input className="input-base !py-1 !text-sm" value={r.productRef} onChange={(e) => updateRow(r.id, "productRef", e.target.value)} data-testid={`po-row-${idx}-productref`} /></td>
                  <td className="pr-2"><input type="number" min="0" step="0.01" className="input-base !py-1 !text-sm text-right" value={r.quantity} onChange={(e) => updateRow(r.id, "quantity", e.target.value)} data-testid={`po-row-${idx}-quantity`} /></td>
                  <td className="pr-2">
                    <select className="input-base !py-1 !text-sm" value={r.unit} onChange={(e) => updateRow(r.id, "unit", e.target.value)} data-testid={`po-row-${idx}-unit`}>
                      {UNIT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="pr-2"><input type="number" min="0" step="0.01" className="input-base !py-1 !text-sm text-right" value={r.unitPrice} onChange={(e) => updateRow(r.id, "unitPrice", e.target.value)} data-testid={`po-row-${idx}-price`} /></td>
                  <td className="pr-2 whitespace-nowrap text-right">
                    <div className="px-2 py-1 rounded text-xs font-mono inline-block" style={{ background: "rgba(15,15,15,0.4)", border: "1px solid rgba(160,157,148,0.18)", color: "#F0EDE8" }} data-testid={`po-row-${idx}-linetotal`}>
                      {money(r.lineTotal)}
                    </div>
                  </td>
                  <td className="pr-2"><input className="input-base !py-1 !text-sm" value={r.notes} onChange={(e) => updateRow(r.id, "notes", e.target.value)} data-testid={`po-row-${idx}-notes`} /></td>
                  <td className="text-right"><button onClick={() => removeRow(r.id)} className="text-[#706D66] hover:text-red-400" data-testid={`po-row-${idx}-remove`}><Trash2 size={14}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addRow} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="po-add-row">
          <Plus size={12}/> Add Item
        </button>
      </Section>

      {/* SECTION 5 — TOTALS */}
      <Section title="Totals" testId="po-section-5">
        <div className="grid sm:grid-cols-2 gap-4 mb-5">
          <label className="block">
            <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">VAT Registered?</div>
            <div className="flex gap-2" data-testid="po-vat-toggle">
              <button type="button" onClick={() => setVatRegistered(true)} className={`px-4 py-2 rounded text-xs ${vatRegistered ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94]"}`} data-testid="po-vat-yes">Yes</button>
              <button type="button" onClick={() => setVatRegistered(false)} className={`px-4 py-2 rounded text-xs ${!vatRegistered ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94]"}`} data-testid="po-vat-no">No</button>
            </div>
          </label>
          {vatRegistered && (
            <label className="block">
              <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">VAT Rate</div>
              <select value={vatRate} onChange={(e) => setVatRate(e.target.value)} className="input-base" data-testid="po-vat-rate">
                {VAT_RATES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          )}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <TotalStat label="Subtotal" value={money(subtotal)} testId="po-subtotal" />
          {vatRegistered ? (
            <>
              <TotalStat label={`VAT (${vatRate})`} value={money(vatAmount)} testId="po-vat-amount" />
              <TotalStat label="Total Order Value" value={money(grandTotal)} testId="po-total" highlight />
            </>
          ) : (
            <TotalStat label="Total Order Value" value={money(grandTotal)} testId="po-total" highlight />
          )}
        </div>
      </Section>

      {/* SECTION 6 — TERMS */}
      <Section title="Terms" testId="po-section-6">
        <Grid>
          <label className="block">
            <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">Payment Terms</div>
            <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} className="input-base" data-testid="po-payment-terms">
              {PAYMENT_TERMS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          {paymentTerms === "Other" && (
            <Inp label="Specify Other Payment Terms" value={paymentTermsOther} onChange={setPaymentTermsOther} testId="po-payment-other" />
          )}
        </Grid>
        <div className="mt-4">
          <label className="block">
            <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">Special Instructions (optional)</div>
            <textarea value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} rows={3} placeholder="Any specific requirements for this order" className="input-base" data-testid="po-special" />
          </label>
        </div>
      </Section>

      {/* SIGN OFF */}
      <Section title="Sign Off" testId="po-section-signoff">
        <Grid>
          <ReadOnly label="Ordered by" value={user?.fullName || "—"} testId="po-orderedby" helper="Auto-populated from your profile" />
          <ReadOnly label="Date" value={ukDate(signOffDate)} testId="po-signoff-date" helper="Today's date, automatically set" />
        </Grid>
        <div className="mt-5">
          <LiveSignatureBlock
            label="Ordered by — signature"
            subtitle="Your signature is stamped on the generated PDF"
            value={liveSignature}
            onChange={setLiveSignature}
            savedSignature={user?.signature}
            testIdPrefix="po-sig"
          />
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="po-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Purchase Order</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="po-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated purchase order</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Purchase Order ${poNumber} — ${supplierName}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="po-output">{result}</pre>
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
function TotalStat({ label, value, testId, highlight }) {
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
