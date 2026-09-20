import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, ClipboardList, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";
import DraftSaveButton from "../components/DraftSaveButton";
import { draftIdFromQuery, clearDraftQueryParam, fetchDraft } from "../lib/drafts";
import { QUOTE_STATUS_ORDER } from "../lib/uk-format";
import { registerRecoverySource, consumeRecoverySnapshot } from "../lib/session-recovery";

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
    // AFP-PWQ-SCHEDULE-01 (Sep 2026) — extended schedule row. New fields
    // `location` and `drawingRef` are optional and default to "" so old
    // saved drafts / re-opened quotes without these fields still render
    // cleanly. `itemNo` is derived from array index (see `decorated`
    // memo) and `amount` is derived from qty × rate — neither is stored.
    location: "",
    description: "",
    drawingRef: "",
    unit: "Square metre",
    quantity: "",
    rate: "",
    notes: "",
  };
}

// AFP-PWQ-SCHEDULE-01 (Sep 2026) — mirrors the VO-PRICE-INPUT-01
// helpers on VariationOrders.jsx so numeric fields don't stack "0"s
// (e.g. typing 1400 into a "0"-initialised Rate field produces 01400).
// Preserves "0", "0.5", "-0.25"; strips "01400" → "1400". Also exposes
// a select-all-on-focus handler so tapping into the field just retypes.
function _stripLeadingZeros(v) {
  const s = String(v ?? "");
  if (s === "" || s === "-") return s;
  return s.replace(/^(-?)0+(?=\d)/, "$1");
}
function _numFocus(e) { try { e.target.select(); } catch { /* older browsers */ } }

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
  const [genError, setGenError]         = useState("");
  const [liveSignature, setLiveSignature] = useState("");
  // P1b — separate client acceptance signature. `savedSignature={null}` on
  // the block below ensures the "Use Saved Signature" button on the client
  // block does NOT pick up the logged-in user's own vault signature.
  const [clientSignature, setClientSignature] = useState("");
  // P1b — new fields
  const [quoteStatus, setQuoteStatus]                     = useState("Draft");
  const [programme, setProgramme]                         = useState("");
  const [linkedVariationRef, setLinkedVariationRef]       = useState("");

  // ---------- Draft save/resume ----------
  const getDraftData = () => ({
    quoteRef, quoteDate, validUntil, project, siteAddress, quotedTo,
    contactName, scope, drawingRef, rows, vatRegistered, vatRate,
    paymentTerms, paymentTermsOther, included, excluded, additionalNotes,
    result, refNumber, liveSignature, clientSignature,
    quoteStatus, programme, linkedVariationRef,
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
        if (p.clientSignature !== undefined) setClientSignature(p.clientSignature);
        if (p.quoteStatus !== undefined) setQuoteStatus(p.quoteStatus);
        if (p.programme !== undefined) setProgramme(p.programme);
        if (p.linkedVariationRef !== undefined) setLinkedVariationRef(p.linkedVariationRef);
        toast.success("Draft restored");
      } catch (e) {
        if (process.env.NODE_ENV !== "production") console.error("Quote draft restore failed", e);
      } finally { clearDraftQueryParam(); }
    })();
  }, []); // run once on mount

  // ---------- Session-expiry recovery ----------
  // Restore any snapshot the api.js 401 interceptor wrote for us before
  // redirecting to /login. Runs once on mount and clears the snapshot.
  useEffect(() => {
    const snap = consumeRecoverySnapshot(TOOL_ID);
    if (!snap || !snap.data) return;
    const p = snap.data;
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
    if (p.liveSignature !== undefined) setLiveSignature(p.liveSignature);
    if (p.clientSignature !== undefined) setClientSignature(p.clientSignature);
    if (p.quoteStatus !== undefined) setQuoteStatus(p.quoteStatus);
    if (p.programme !== undefined) setProgramme(p.programme);
    if (p.linkedVariationRef !== undefined) setLinkedVariationRef(p.linkedVariationRef);
    toast.success("Restored your unsaved Price Work Quote from before you signed out.");
  }, []);

  // Register a live snapshot source so the 401 interceptor can capture the
  // current form state before redirecting.
  useEffect(() => {
    const unregister = registerRecoverySource(TOOL_ID, () => getDraftData());
    return unregister;
  });

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
    // PWQ-VALIDATION-01 (Sep 2026) — a "priced item" is any row the user
    // meaningfully filled in. Previously the gate was description-only,
    // which was fragile: a row with a real £500 line total but a blank
    // (or paste-sanitised, or draft-restore-race) description would be
    // silently discarded and the user would get "Add at least one priced
    // item" while looking at £500 on the exact row. Now we accept a row
    // if it has a description OR real financial content (qty × rate > 0)
    // OR any of the extended schedule text fields the user could have
    // typed against instead of description (location / drawing ref /
    // notes). Downstream itemsBlock generation is unchanged — it already
    // tolerates missing optional fields via "—".
    const populated = decorated.filter((r) => {
      const hasDescription = (r.description || "").trim().length > 0;
      const hasPricedFigures = N(r.quantity) > 0 && N(r.rate) > 0;
      const hasSchedText = (r.location || "").trim().length > 0
                        || (r.drawingRef || "").trim().length > 0
                        || (r.notes || "").trim().length > 0;
      return hasDescription || hasPricedFigures || hasSchedText;
    });
    if (populated.length === 0) { toast.error("Add at least one priced item"); return; }

    setGenerating(true); setResult(""); setRefNumber(""); setGenError("");

    const itemsBlock = populated.map((r) => {
      // AFP-PWQ-SCHEDULE-01 (Sep 2026) — every extended column is fed
      // pipe-delimited to the LLM prompt so the PDF renders every field
      // that appears on-screen. Optional fields (Location, Drawing/Ref,
      // Notes) collapse to `—` so an unpopulated row still reads cleanly.
      return [
        `Item ${r.lineNumber}.`,
        `Location: ${(r.location || "").trim() || "—"}`,
        `Description: ${r.description}`,
        `Drawing / Ref: ${(r.drawingRef || "").trim() || "—"}`,
        `Unit: ${r.unit}`,
        `Quantity: ${r.quantity || "0"}`,
        `Rate: ${money(N(r.rate))} per ${r.unit.toLowerCase()}`,
        `Amount: ${money(r.lineTotal)}`,
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
   Quote Status: {quoteStatus}
   Linked Variation Reference: {linkedVariationRef}
   Date of Quote: {quoteDate}
   Quote Valid Until: {validUntil}
   Programme / Duration: {programme}
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

8. ACCEPTANCE OF PRICE WORK QUOTE — print the heading 'ACCEPTANCE OF PRICE WORK QUOTE' in capitals on its own line, then print the following paragraph verbatim on the next line. Do NOT append any 'Accepted by / Position / Company / Date / Signature' lines under this heading — the mandatory sign-off block appended at the end of the document is the single authoritative place for those fields:
   I / We confirm acceptance of the above priced schedule of works at the total value stated. This quote is valid until {validUntil}. Works to proceed in accordance with the programme, payment terms and inclusions/exclusions set out above. Any additional works instructed after acceptance will be priced separately as a Variation.

9. FOOTER — print verbatim on its own line:
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
          quoteStatus: quoteStatus || "Draft",
          programme: programme || "—",
          linkedVariationRef: linkedVariationRef || "—",
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
      const s = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (s === 401) {
        // Global api interceptor is handling session-expired UX. Preserve form state.
      } else if (s === 402) {
        setGenError(typeof detail === "string" ? detail : "Free plan limit reached — please upgrade to keep generating quotes.");
        toast.error("Free plan limit reached.");
      } else if (s === 429) {
        setGenError("Morris is busy — please wait a moment and try again. Your inputs are preserved.");
        toast.error("Server busy — try again shortly.");
      } else if (!err?.response) {
        setGenError("Network error — Morris couldn't reach the server. Your inputs are preserved.");
        toast.error("Network error.");
      } else {
        setGenError(typeof detail === "string" ? detail : "Generation failed — your inputs are preserved, please try again.");
        toast.error("Generation failed.");
      }
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Price Work Quote — ${project || "project"} — ${quoteRef}`, content: result, user: userWithSig, clientSignature });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-[1280px] mx-auto" data-testid="page-price-work-quote">
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
          <Drop label="Quote Status" value={quoteStatus} onChange={setQuoteStatus} options={QUOTE_STATUS_ORDER} testId="pwq-status" />
          <Inp label="Date of Quote" value={quoteDate} onChange={setQuoteDate} type="date" testId="pwq-date" />
          <Inp label="Quote Valid Until" value={validUntil} onChange={setValidUntil} type="date" testId="pwq-validuntil" helper="Defaults to 30 days from today" />
          <Inp label="Programme / Duration" value={programme} onChange={setProgramme} testId="pwq-programme" helper="e.g. 3 weeks from acceptance, or start 15/03/2026" />
          <Inp label="Linked Variation Reference (optional)" value={linkedVariationRef} onChange={setLinkedVariationRef} testId="pwq-linked-vo" helper="e.g. VO-005 — if this quote covers a specific variation" />
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

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
                {/* Location — optional, e.g. "Level 2 / Zone B" */}
                <div className="lg:col-span-3">
                  <Inp
                    label="Location (optional)"
                    value={r.location ?? ""}
                    onChange={(v) => updateRow(r.id, "location", v)}
                    placeholder={`e.g. "Level 2 / Zone B"`}
                    testId={`pwq-row-${idx}-location`}
                  />
                </div>
                {/* Drawing / Specification Reference — optional */}
                <div className="lg:col-span-3">
                  <Inp
                    label="Drawing / Ref (optional)"
                    value={r.drawingRef ?? ""}
                    onChange={(v) => updateRow(r.id, "drawingRef", v)}
                    placeholder={`e.g. "M-204 Rev C"`}
                    testId={`pwq-row-${idx}-drawing-ref`}
                  />
                </div>
                {/* Description of Work — required content */}
                <div className="sm:col-span-2 lg:col-span-6">
                  <Inp
                    label="Description of Work"
                    value={r.description}
                    onChange={(v) => updateRow(r.id, "description", v)}
                    placeholder={`e.g. "100 millimetre circular ductwork straight"`}
                    testId={`pwq-row-${idx}-description`}
                  />
                </div>
                {/* Unit / Quantity / Rate / Amount — one wide row on desktop */}
                <div className="lg:col-span-3">
                  <Drop
                    label="Unit"
                    value={r.unit}
                    onChange={(v) => updateRow(r.id, "unit", v)}
                    options={UNIT_OPTIONS}
                    testId={`pwq-row-${idx}-unit`}
                  />
                </div>
                <div className="lg:col-span-3">
                  <Inp
                    label="Quantity"
                    type="number"
                    value={r.quantity}
                    onChange={(v) => updateRow(r.id, "quantity", _stripLeadingZeros(v))}
                    onFocus={_numFocus}
                    testId={`pwq-row-${idx}-quantity`}
                  />
                </div>
                <div className="lg:col-span-3">
                  <Inp
                    label="Rate (£)"
                    type="number"
                    value={r.rate}
                    onChange={(v) => updateRow(r.id, "rate", _stripLeadingZeros(v))}
                    onFocus={_numFocus}
                    testId={`pwq-row-${idx}-rate`}
                  />
                </div>
                {/* Amount — read-only, auto-calculated Qty × Rate */}
                <div className="lg:col-span-3">
                  <label className="block">
                    <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">Amount (£)</div>
                    <div
                      className="input-base flex items-center justify-end tabular-nums text-[#E8A020] font-mono"
                      data-testid={`pwq-row-${idx}-amount`}
                      aria-readonly="true"
                    >
                      {money(r.lineTotal)}
                    </div>
                    <div className="text-[10px] text-[#706D66] mt-1">Auto-calculated: Quantity × Rate</div>
                  </label>
                </div>
                {/* Notes — kept from previous version, no functionality removed */}
                <div className="sm:col-span-2 lg:col-span-12">
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

      {/* SECTION 7 — CLIENT ACCEPTANCE (P1b). Deliberately NOT wired to the
          logged-in user's saved signature — the "Use Saved Signature" button
          must never apply the sender's own signature as the client's. */}
      <Section title="Client / Recipient Acceptance (optional)" testId="pwq-section-7">
        <div className="text-xs text-[#A19D94] mb-3 leading-relaxed">
          Leave blank for the client to sign on the printed PDF, or capture their signature here on site.
          The logged-in user's saved signature is intentionally not usable here.
        </div>
        <LiveSignatureBlock
          label="Client / Recipient Signature"
          subtitle="Optional. Applies to the ACCEPTANCE section of the PDF."
          value={clientSignature}
          onChange={setClientSignature}
          savedSignature={null}
          allowBlank
          testIdPrefix="pwq-client-sig"
        />
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="pwq-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Price Work Quote</>}
      </button>
      {genError && (
        <div
          className="mt-3 p-3 rounded flex items-start gap-2 text-sm"
          style={{ border: "1px solid rgba(229,99,90,0.4)", background: "rgba(229,99,90,0.08)", color: "#F0EDE8" }}
          data-testid="pwq-gen-error"
        >
          <AlertCircle size={16} className="text-[#E5635A] mt-0.5 flex-shrink-0" />
          <div>{genError}</div>
        </div>
      )}

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
function Inp({ label, value, onChange, type = "text", testId, helper, placeholder, onFocus }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} onFocus={onFocus} className="input-base" placeholder={placeholder} data-testid={testId} />
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
