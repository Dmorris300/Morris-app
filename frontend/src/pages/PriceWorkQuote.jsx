import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";
import DraftSaveButton from "../components/DraftSaveButton";
import { draftIdFromQuery, clearDraftQueryParam, fetchDraft } from "../lib/drafts";

const TOOL_ID   = "price-work-quote";
const TOOL_NAME = "Price Work Quote";
const TOOL_INFO =
  "Produces a professional itemised priced schedule for price-work jobs — where you are paid a fixed rate per unit of work completed. Auto-calculates line totals, subtotal, VAT and total quote value, then prints a clean document with a detachable acceptance slip at the bottom for the contractor to sign and return.";

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoPlusDays = (days) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

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

const UNIT_OPTIONS = [
  "Square metre",
  "Linear metre",
  "Each",
  "Per floor",
  "Per room",
  "Per point",
  "Per run",
  "Lump sum",
  "Other",
];

const PAYMENT_TERMS = ["14 days", "30 days", "On completion", "Other"];
const VAT_RATES = ["20%", "5%", "0%"];

function makeRow() {
  return {
    id: crypto.randomUUID(),
    description: "",
    unit: "Square metre",
    quantity: "",
    rate: "",
    notes: "",
  };
}

export default function PriceWorkQuote() {
  const { user, refresh } = useAuth();

  // SECTION 1 — QUOTE DETAILS
  const [quoteRef, setQuoteRef]         = useState("PW-001");
  const [quoteDate, setQuoteDate]       = useState(isoToday());
  const [validUntil, setValidUntil]     = useState(isoPlusDays(30));
  const [project, setProject]           = useState("");
  const [siteAddress, setSiteAddress]   = useState("");
  const [quotedTo, setQuotedTo]         = useState("");
  const [contactName, setContactName]   = useState("");

  // SECTION 2 — SCOPE
  const [scope, setScope]               = useState("");
  const [drawingRef, setDrawingRef]     = useState("");

  // SECTION 3 — ROWS
  const [rows, setRows]                 = useState([makeRow()]);

  // SECTION 4 — TOTALS
  const [vatRegistered, setVatRegistered] = useState(Boolean(user?.vatRegistered));
  const [vatRate, setVatRate]             = useState("20%");

  // SECTION 5 — TERMS
  const [paymentTerms, setPaymentTerms]       = useState("30 days");
  const [paymentTermsOther, setPaymentTermsOther] = useState("");
  const [included, setIncluded]               = useState("");
  const [excluded, setExcluded]               = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  // Output / sign-off
  const [infoOpen, setInfoOpen]         = useState(false);
  const [generating, setGenerating]     = useState(false);
  const [result, setResult]             = useState("");
  const [refNumber, setRefNumber]       = useState("");
  const [liveSignature, setLiveSignature] = useState("");

  // ---------- Draft save/resume ----------
  const getDraftData = () => ({
    quoteRef, quoteDate, validUntil, project, siteAddress, quotedTo,
    contactName, scope, drawingRef, rows, vatRegistered, vatRate,
    paymentTerms, paymentTermsOther, included, excluded, additionalNotes,
    result, refNumber, liveSignature,
  });
  const draftRestoredFor = useRef(null);
  useEffect(() => {
    const id = draftIdFromQuery();
    if (!id || draftRestoredFor.current === id) return;
    draftRestoredFor.current = id;
    (async () => {
      try {
        const d = await fetchDraft(id);
        if (!d || d.toolId !== TOOL_ID) return;
        const p = d.data || {};
        if (p.quoteRef !== undefined) setQuoteRef(p.quoteRef);
        if (p.quoteDate !== undefined) setQuoteDate(p.quoteDate);
        if (p.validUntil !== undefined) setValidUntil(p.validUntil);
        if (p.project !== undefined) setProject(p.project);
        if (p.siteAddress !== undefined) setSiteAddress(p.siteAddress);
        if (p.quotedTo !== undefined) setQuotedTo(p.quotedTo);
        if (p.contactName !== undefined) setContactName(p.contactName);
        if (p.scope !== undefined) setScope(p.scope);
        if (p.drawingRef !== undefined) setDrawingRef(p.drawingRef);
        if (Array.isArray(p.rows)) setRows(p.rows);
        if (p.vatRegistered !== undefined) setVatRegistered(p.vatRegistered);
        if (p.vatRate !== undefined) setVatRate(p.vatRate);
        if (p.paymentTerms !== undefined) setPaymentTerms(p.paymentTerms);
        if (p.paymentTermsOther !== undefined) setPaymentTermsOther(p.paymentTermsOther);
        if (p.included !== undefined) setIncluded(p.included);
        if (p.excluded !== undefined) setExcluded(p.excluded);
        if (p.additionalNotes !== undefined) setAdditionalNotes(p.additionalNotes);
        if (p.result !== undefined) setResult(p.result);
        if (p.refNumber !== undefined) setRefNumber(p.refNumber);
        if (p.liveSignature !== undefined) setLiveSignature(p.liveSignature);
        toast.success("Draft restored");
      } catch (e) {
        if (process.env.NODE_ENV !== "production") console.error("Quote draft restore failed", e);
      } finally { clearDraftQueryParam(); }
    })();
  }, []); // run once on mount

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

  // Decorated rows with line totals
  const decorated = useMemo(() => {
    return rows.map((r, i) => {
      const qty = N(r.quantity);
      const rate = N(r.rate);
      const lineTotal = qty * rate;
      return { ...r, lineNumber: i + 1, lineTotal };
    });
  }, [rows]);

  const subtotal = useMemo(
    () => decorated.reduce((s, r) => s + (r.lineTotal || 0), 0),
    [decorated]
  );
  const vatPercent = vatRegistered ? N(vatRate.replace("%", "")) / 100 : 0;
  const vatAmount = +(subtotal * vatPercent).toFixed(2);
  const grandTotal = +(subtotal + vatAmount).toFixed(2);

  const onGenerate = async () => {
    if (!project.trim())   { toast.error("Add the project name"); return; }
    if (!quotedTo.trim())  { toast.error("Add who the quote is for"); return; }
    const populated = decorated.filter((r) => (r.description || "").trim().length > 0);
    if (populated.length === 0) { toast.error("Add at least one priced item"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const itemsBlock = populated.map((r) => {
      return [
        `Item ${r.lineNumber}.`,
        `Description: ${r.description}`,
        `Unit: ${r.unit}`,
        `Quantity: ${r.quantity || "0"}`,
        `Rate: ${money(N(r.rate))} per ${r.unit.toLowerCase()}`,
        `Line Total: ${money(r.lineTotal)}`,
        `Notes: ${r.notes || "—"}`,
      ].join(" | ");
    }).join("\n");

    const totalsBlock = vatRegistered
      ? [
          `Subtotal (excluding VAT): ${money(subtotal)}`,
          `VAT Rate: ${vatRate}`,
          `VAT Amount: ${money(vatAmount)}`,
          `TOTAL QUOTE VALUE: ${money(grandTotal)}`,
        ].join("\n   ")
      : [
          `Subtotal: ${money(subtotal)}`,
          `VAT: Not applicable — supplier is not VAT registered`,
          `TOTAL QUOTE VALUE: ${money(grandTotal)}`,
        ].join("\n   ");

    const paymentTermsResolved = paymentTerms === "Other"
      ? (paymentTermsOther.trim() || "As agreed")
      : paymentTerms;

    const promptTemplate = `Produce a UK PRICE WORK QUOTE (priced schedule of works). Plain direct construction English. No padding. No banned consultant words. This document is sent to a main contractor or client and must read as a professional quote.

1. HEADER — DOCUMENT REFERENCE: {quoteRef}. DATE: {quoteDate} in DD/MM/YYYY format.

2. TITLE — exactly: 'PRICE WORK SCHEDULE — {project} — {quoteRef}'.

3. QUOTE DETAILS — list on separate lines:
   Quote Reference Number: {quoteRef}
   Date of Quote: {quoteDate}
   Quote Valid Until: {validUntil}
   Project Name: {project}
   Site Address: {siteAddress}
   Quoted To: {quotedTo}
   Contact Name: {contactName}
   Quoted By Company: {companyName}
   Trade: {trade}

4. SCOPE OF WORKS — short paragraph using the supplied brief description verbatim. Append the drawing/specification reference on its own line if supplied:
   Brief Description of Works: {scope}
   Drawing / Specification Reference: {drawingRef}

5. PRICED SCHEDULE — print this header line then each item below verbatim on its own line, preserving the pipe-delimited structure exactly as supplied:
{itemsBlock}

6. TOTALS — print on separate lines (use the values supplied — never recalculate):
   {totalsBlock}

7. TERMS AND CONDITIONS — list on separate lines, skipping anything blank:
   Payment Terms: {paymentTermsResolved}
   What is Included: {included}
   What is Excluded: {excluded}
   Additional Notes / Conditions: {additionalNotes}

8. QUOTED BY — sign-off block:
   Quoted by: {quotedByName}
   Position: {quotedByRole}
   Company: {companyName}
   Date: {quoteDate}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

9. ACCEPTANCE OF PRICE WORK QUOTE — print as a clearly separated section at the bottom of the document with the heading 'ACCEPTANCE OF PRICE WORK QUOTE' in capitals. Then print verbatim:
   I / We confirm acceptance of the above priced schedule of works at the total value stated. Works to proceed in accordance with the terms outlined above.

   Then print the following acceptance lines on separate lines, each followed by a blank signature line (an underscore line):
   Accepted by (Name): __________________________
   Position: __________________________
   Company: __________________________
   Date: __________________________
   Signature: __________________________

10. FOOTER — print verbatim on its own line:
    This quote is valid until {validUntil}. All prices exclude any variations instructed after the date of this document.

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Never invent items, quantities, rates or totals. Use only the supplied rows and the supplied totals block.
- Never use abbreviations such as 'N/A', 'TBC', 'qty', '&', 'inc.' or 'excl.'. Write words in full.
- Skip blank optional fields cleanly. Use '—' only where supplied.
- No banned words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct. Reads as a real priced quote from one professional to another.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          quoteRef,
          quoteDate: ukDate(quoteDate),
          validUntil: ukDate(validUntil),
          project,
          siteAddress: siteAddress || "—",
          quotedTo,
          contactName: contactName || "—",
          companyName: user?.companyName || "—",
          trade: user?.trade || "—",
          scope: scope || "—",
          drawingRef: drawingRef || "—",
          itemsBlock,
          totalsBlock,
          paymentTermsResolved,
          included: included || "—",
          excluded: excluded || "—",
          additionalNotes: additionalNotes || "—",
          quotedByName: user?.fullName || "—",
          quotedByRole: user?.signatureRole || "Director",
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Price Work Quote generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Price Work Quote — ${project || "project"} — ${quoteRef}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-price-work-quote">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Finance</div>
          <h1 className="font-display text-4xl md:text-5xl">Price Work Quote</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="pwq-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="pwq-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 — QUOTE DETAILS */}
      <Section title="Quote Details" testId="pwq-section-1" icon={<ClipboardList size={14}/>}>
        <Grid>
          <Inp label="Quote Reference Number" value={quoteRef} onChange={setQuoteRef} testId="pwq-ref" helper={`Auto-suggested next number — edit if needed`} />
          <Inp label="Date of Quote" value={quoteDate} onChange={setQuoteDate} type="date" testId="pwq-date" />
          <Inp label="Quote Valid Until" value={validUntil} onChange={setValidUntil} type="date" testId="pwq-validuntil" helper="Defaults to 30 days from today" />
          <Inp label="Project Name" value={project} onChange={setProject} testId="pwq-project" />
          <Inp label="Site Address" value={siteAddress} onChange={setSiteAddress} testId="pwq-site" />
          <Inp label="Quoted To (Main Contractor / Client Name)" value={quotedTo} onChange={setQuotedTo} testId="pwq-quotedto" />
          <Inp label="Contact Name (optional)" value={contactName} onChange={setContactName} testId="pwq-contact" />
        </Grid>
      </Section>

      {/* SECTION 2 — SCOPE OF WORKS */}
      <Section title="Scope of Works" testId="pwq-section-2">
        <div className="grid gap-4">
          <Area
            label="Brief Description of Works"
            value={scope}
            onChange={setScope}
            placeholder={`Summarise what this price covers overall — e.g. "Supply and fix all ductwork to floors 1 to 3 as per drawing issue 2"`}
            testId="pwq-scope"
          />
          <Inp label="Drawing / Specification Reference (optional)" value={drawingRef} onChange={setDrawingRef} testId="pwq-drawing" />
        </div>
      </Section>

      {/* SECTION 3 — PRICED SCHEDULE (CARD LIST) */}
      <Section title="Priced Schedule" testId="pwq-section-3">
        <div className="grid gap-4">
          {decorated.map((r, idx) => (
            <div
              key={r.id}
              className="rounded p-4 md:p-5"
              style={{
                background: "rgba(15,15,15,0.5)",
                border: "1px solid rgba(160,157,148,0.18)",
              }}
              data-testid={`pwq-row-${idx}`}
            >
              <div className="flex items-center justify-between mb-4">
                <div
                  className="text-xs uppercase tracking-widest text-[#E8A020] font-mono"
                  data-testid={`pwq-row-${idx}-num`}
                >
                  Item {r.lineNumber}
                </div>
                <button
                  onClick={() => removeRow(r.id)}
                  className="text-[#706D66] hover:text-red-400 flex items-center gap-1 text-xs"
                  data-testid={`pwq-row-${idx}-remove`}
                >
                  <Trash2 size={14}/> Remove
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2 lg:col-span-3">
                  <Inp
                    label="Description of Work"
                    value={r.description}
                    onChange={(v) => updateRow(r.id, "description", v)}
                    placeholder={`e.g. "100 millimetre circular ductwork straight"`}
                    testId={`pwq-row-${idx}-description`}
                  />
                </div>
                <Drop
                  label="Unit"
                  value={r.unit}
                  onChange={(v) => updateRow(r.id, "unit", v)}
                  options={UNIT_OPTIONS}
                  testId={`pwq-row-${idx}-unit`}
                />
                <Inp
                  label="Quantity"
                  type="number"
                  value={r.quantity}
                  onChange={(v) => updateRow(r.id, "quantity", v)}
                  testId={`pwq-row-${idx}-quantity`}
                />
                <Inp
                  label="Rate (£)"
                  type="number"
                  value={r.rate}
                  onChange={(v) => updateRow(r.id, "rate", v)}
                  testId={`pwq-row-${idx}-rate`}
                />
                <div className="sm:col-span-2 lg:col-span-3">
                  <Inp
                    label="Notes"
                    value={r.notes}
                    onChange={(v) => updateRow(r.id, "notes", v)}
                    placeholder={`e.g. "subject to access"`}
                    testId={`pwq-row-${idx}-notes`}
                  />
                </div>
              </div>

              <div
                className="mt-4 pt-4 flex items-center justify-between"
                style={{ borderTop: "1px solid rgba(160,157,148,0.18)" }}
              >
                <div className="text-[10px] uppercase tracking-widest text-[#706D66]">Line Total</div>
                <div
                  className="font-display text-2xl text-[#E8A020]"
                  data-testid={`pwq-row-${idx}-linetotal`}
                >
                  {money(r.lineTotal)}
                </div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={addRow} className="btn-secondary flex items-center gap-2 text-xs mt-4" data-testid="pwq-add-row">
          <Plus size={12}/> Add Item
        </button>
      </Section>

      {/* SECTION 4 — TOTALS */}
      <Section title="Totals" testId="pwq-section-4">
        <div className="grid sm:grid-cols-2 gap-4 mb-5">
          <label className="block">
            <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">VAT Registered?</div>
            <div className="flex gap-2" data-testid="pwq-vat-toggle">
              <button
                type="button"
                onClick={() => setVatRegistered(true)}
                className={`px-4 py-2 rounded text-xs ${vatRegistered ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94]"}`}
                data-testid="pwq-vat-yes"
              >Yes</button>
              <button
                type="button"
                onClick={() => setVatRegistered(false)}
                className={`px-4 py-2 rounded text-xs ${!vatRegistered ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94]"}`}
                data-testid="pwq-vat-no"
              >No</button>
            </div>
          </label>
          {vatRegistered && (
            <Drop label="VAT Rate" value={vatRate} onChange={setVatRate} options={VAT_RATES} testId="pwq-vat-rate" />
          )}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <TotalStat label="Subtotal" value={money(subtotal)} testId="pwq-subtotal" />
          {vatRegistered ? (
            <>
              <TotalStat label={`VAT (${vatRate})`} value={money(vatAmount)} testId="pwq-vat-amount" />
              <TotalStat label="Total Quote Value" value={money(grandTotal)} testId="pwq-total" highlight />
            </>
          ) : (
            <TotalStat label="Total Quote Value" value={money(grandTotal)} testId="pwq-total" highlight />
          )}
        </div>
      </Section>

      {/* SECTION 5 — TERMS */}
      <Section title="Terms and Conditions" testId="pwq-section-5">
        <Grid>
          <Drop label="Payment Terms" value={paymentTerms} onChange={setPaymentTerms} options={PAYMENT_TERMS} testId="pwq-payment-terms" />
          {paymentTerms === "Other" && (
            <Inp label="Specify Other Payment Terms" value={paymentTermsOther} onChange={setPaymentTermsOther} testId="pwq-payment-other" />
          )}
        </Grid>
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <Area label="What is Included (optional)" value={included} onChange={setIncluded} placeholder={`e.g. "All labour, fixings and consumables"`} testId="pwq-included" />
          <Area label="What is Excluded (optional)" value={excluded} onChange={setExcluded} placeholder={`e.g. "Making good, builder's work, scaffolding"`} testId="pwq-excluded" />
        </div>
        <div className="mt-4">
          <Area label="Additional Notes / Conditions (optional)" value={additionalNotes} onChange={setAdditionalNotes} testId="pwq-additional" />
        </div>
      </Section>

      {/* SECTION 6 — SIGN OFF */}
      <Section title="Quoted by — Sign Off" testId="pwq-section-6">
        <LiveSignatureBlock
          label="Quoted by"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="pwq-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="pwq-sig-date">
          Date: {ukDate(quoteDate) || "—"}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="pwq-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Price Work Quote</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="pwq-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated quote</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Price Work Quote — ${project} — ${quoteRef}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="pwq-output">{result}</pre>
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
function Area({ label, value, onChange, placeholder, testId }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
        className="input-base"
        data-testid={testId}
      />
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
