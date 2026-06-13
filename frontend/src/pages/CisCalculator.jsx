import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Calculator } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID   = "cis-calculator";
const TOOL_NAME = "CIS Calculator";
const TOOL_INFO =
  "Works out CIS deduction from a mixed labour + materials invoice. CIS is deducted from the labour element only — materials are paid in full. The total CIS deducted is what you reclaim on your Self Assessment tax return.";

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

const CIS_RATES = [
  { value: "20%", label: "20% — Registered subcontractor (standard rate)" },
  { value: "30%", label: "30% — Unregistered subcontractor" },
  { value: "0%",  label: "0% — Gross payment status" },
];
const VAT_RATES = ["20%", "5%", "0%"];

export default function CisCalculator() {
  const { user, refresh } = useAuth();

  const calcDate = isoToday();
  const [labour, setLabour]     = useState("");
  const [materials, setMaterials] = useState("");
  const [cisRate, setCisRate]   = useState("20%");
  const [vatRegistered, setVatRegistered] = useState(Boolean(user?.vatRegistered));
  const [vatRate, setVatRate]   = useState("20%");

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

  // ---------- Live calculations ----------
  const calc = useMemo(() => {
    const lab = N(labour);
    const mat = N(materials);
    const gross = +(lab + mat).toFixed(2);
    const vatPct = vatRegistered ? N(vatRate.replace("%", "")) / 100 : 0;
    const vatAmount = +(gross * vatPct).toFixed(2);
    const totalInvoice = +(gross + vatAmount).toFixed(2);

    const cisPct = N(cisRate.replace("%", "")) / 100;
    const cisDeduction = +(lab * cisPct).toFixed(2);

    // Net to subcontractor: subcontractor receives the full invoice (including VAT) minus CIS deducted from labour.
    const netToSubbie = +(totalInvoice - cisDeduction).toFixed(2);
    // HMRC payment: just the CIS deducted (paid by the contractor on behalf of the subcontractor)
    const hmrcPayment = cisDeduction;

    return { lab, mat, gross, vatPct, vatAmount, totalInvoice, cisPct, cisDeduction, netToSubbie, hmrcPayment };
  }, [labour, materials, cisRate, vatRegistered, vatRate]);

  const onGenerate = async () => {
    if (N(labour) <= 0 && N(materials) <= 0) { toast.error("Enter a labour or materials amount"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const breakdownBlock = [
      `Labour amount: ${money(calc.lab)}`,
      `Materials amount: ${money(calc.mat)}`,
      `Gross invoice total (before VAT): ${money(calc.gross)}`,
      vatRegistered
        ? `VAT amount (${vatRate}): ${money(calc.vatAmount)}`
        : `VAT amount: Not applicable — supplier is not VAT registered`,
      `Total invoice value (including VAT if applicable): ${money(calc.totalInvoice)}`,
      `----`,
      `CIS deduction (${cisRate} of labour only): ${money(calc.cisDeduction)}`,
      `Net payment to subcontractor: ${money(calc.netToSubbie)}`,
      `----`,
      `Amount the contractor pays the subcontractor: ${money(calc.netToSubbie)}`,
      `Amount the contractor pays to HMRC on the subcontractor's behalf: ${money(calc.hmrcPayment)}`,
    ].join("\n");

    const promptTemplate = `Produce a UK CIS CALCULATION record. Plain direct construction English. No padding. No banned consultant words. This is a formal record of how CIS has been applied to a mixed labour + materials invoice.

1. HEADER — DOCUMENT REFERENCE, DATE (use {calcDate} in DD/MM/YYYY format for DATE).

2. TITLE — exactly: 'CIS CALCULATION — {calcDate}'.

3. CALCULATION DETAILS — list on separate lines:
   Subcontractor: {senderName}
   Company: {companyName}
   Trade: {trade}
   CIS Rate Applied: {cisRateLabel}
   VAT Status: {vatStatusLine}
   Date of Calculation: {calcDate}

4. BREAKDOWN — print this header line then each line below verbatim, preserving the structure exactly as supplied. Use the supplied figures only — never recalculate:
{breakdownBlock}

5. CIS NOTE — print verbatim as one paragraph:
   CIS is deducted from the labour element only. Materials are paid in full. Keep your CIS payment statements — you will need the total CIS deducted to claim it back on your Self Assessment tax return.

6. FOOTER — print verbatim on its own line:
   This calculation should be retained with your invoicing records for Self Assessment purposes.

7. SIGN-OFF — single sign-off:
   Calculated by: {senderName}
   Company: {companyName}
   Date: {calcDate}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Never invent figures. Use only the supplied breakdown values.
- Never use abbreviations such as 'N/A', 'TBC' or '&'. Write words in full. 'CIS', 'VAT', 'HMRC' are acceptable because they are HMRC's own terminology.
- Short sentences. Confident. Direct.`;

    const vatStatusLine = vatRegistered
      ? `VAT registered at ${vatRate}`
      : "Not VAT registered";
    const cisRateLabel = CIS_RATES.find((r) => r.value === cisRate)?.label || cisRate;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          calcDate: ukDate(calcDate),
          senderName: user?.fullName || "—",
          companyName: user?.companyName || "—",
          trade: user?.trade || "—",
          cisRateLabel,
          vatStatusLine,
          breakdownBlock,
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("CIS Calculation generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `CIS Calculation — ${calcDate}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-cis-calculator">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Finance</div>
          <h1 className="font-display text-4xl md:text-5xl">CIS Calculator</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="cis-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="cis-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 — INPUTS */}
      <Section title="Invoice Inputs" testId="cis-section-1" icon={<Calculator size={14}/>}>
        <Grid>
          <Inp label="Labour amount (£)" value={labour} onChange={setLabour} type="number" testId="cis-labour" />
          <Inp label="Materials amount (£)" value={materials} onChange={setMaterials} type="number" testId="cis-materials" />
          <label className="block">
            <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">CIS Rate</div>
            <select value={cisRate} onChange={(e) => setCisRate(e.target.value)} className="input-base" data-testid="cis-rate">
              {CIS_RATES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        </Grid>

        {/* VAT row */}
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <label className="block">
            <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">VAT Registered?</div>
            <div className="flex gap-2" data-testid="cis-vat-toggle">
              <button
                type="button"
                onClick={() => setVatRegistered(true)}
                className={`px-4 py-2 rounded text-xs ${vatRegistered ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94]"}`}
                data-testid="cis-vat-yes"
              >Yes</button>
              <button
                type="button"
                onClick={() => setVatRegistered(false)}
                className={`px-4 py-2 rounded text-xs ${!vatRegistered ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94]"}`}
                data-testid="cis-vat-no"
              >No</button>
            </div>
          </label>
          {vatRegistered && (
            <label className="block">
              <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">VAT Rate</div>
              <select value={vatRate} onChange={(e) => setVatRate(e.target.value)} className="input-base" data-testid="cis-vat-rate">
                {VAT_RATES.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          )}
        </div>
        {vatRegistered && (
          <div
            className="mt-3 p-3 rounded text-xs text-[#A19D94] leading-relaxed"
            style={{ border: "1px solid rgba(232,160,32,0.25)", background: "rgba(232,160,32,0.05)" }}
            data-testid="cis-vat-note"
          >
            VAT is calculated on the full invoice value including materials. CIS is deducted from labour only.
          </div>
        )}
      </Section>

      {/* SECTION 2 — LIVE BREAKDOWN */}
      <Section title="Live Calculated Breakdown" testId="cis-section-2">
        <div className="card-dark p-5" style={{ border: "1px solid rgba(232,160,32,0.25)" }}>
          <BreakdownLine label="Labour amount" value={money(calc.lab)} testId="cis-bd-labour" />
          <BreakdownLine label="Materials amount" value={money(calc.mat)} testId="cis-bd-materials" />
          <BreakdownLine label="Gross invoice total (before VAT)" value={money(calc.gross)} testId="cis-bd-gross" />
          {vatRegistered ? (
            <BreakdownLine label={`VAT amount (${vatRate})`} value={money(calc.vatAmount)} testId="cis-bd-vat" />
          ) : (
            <BreakdownLine label="VAT amount" value="Not applicable" testId="cis-bd-vat" muted />
          )}
          <BreakdownLine label="Total invoice value (including VAT if applicable)" value={money(calc.totalInvoice)} testId="cis-bd-total" bold />

          <Divider />

          <BreakdownLine label={`CIS deduction (${cisRate} of labour only)`} value={money(calc.cisDeduction)} testId="cis-bd-deduction" />
          <BreakdownLine label="Net payment to subcontractor" value={money(calc.netToSubbie)} testId="cis-bd-net" highlight />

          <Divider />

          <BreakdownLine label="Amount the contractor pays the subcontractor" value={money(calc.netToSubbie)} testId="cis-bd-pay-subbie" />
          <BreakdownLine label="Amount the contractor pays to HMRC on the subcontractor's behalf" value={money(calc.hmrcPayment)} testId="cis-bd-pay-hmrc" />
        </div>

        <div
          className="mt-4 p-3 rounded text-xs text-[#A19D94] leading-relaxed"
          style={{ border: "1px solid rgba(232,160,32,0.25)", background: "rgba(232,160,32,0.05)" }}
          data-testid="cis-bd-note"
        >
          CIS is deducted from the labour element only. Materials are paid in full. Keep your CIS payment statements — you will need the total CIS deducted to claim it back on your Self Assessment tax return.
        </div>
      </Section>

      {/* SIGN OFF */}
      <Section title="Sign Off" testId="cis-section-signoff">
        <LiveSignatureBlock
          label="Calculated by"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="cis-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="cis-sig-date">
          Date: {ukDate(calcDate) || "—"}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="cis-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate CIS Calculation</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="cis-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated calculation</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`CIS Calculation — ${calcDate}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="cis-output">{result}</pre>
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
function Inp({ label, value, onChange, type = "text", testId }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} className="input-base" data-testid={testId} />
    </label>
  );
}
function BreakdownLine({ label, value, testId, highlight, bold, muted }) {
  return (
    <div
      data-testid={testId}
      className="flex items-baseline justify-between gap-4 py-2"
      style={{ borderBottom: "1px dashed rgba(160,157,148,0.10)" }}
    >
      <div className="text-xs text-[#A19D94]" style={muted ? { opacity: 0.7 } : {}}>{label}</div>
      <div
        className={bold || highlight ? "font-display text-2xl" : "text-sm font-mono"}
        style={{
          color: highlight ? "#E8A020" : (muted ? "#706D66" : "#F0EDE8"),
          fontWeight: bold && !highlight ? 600 : undefined,
        }}
      >{value}</div>
    </div>
  );
}
function Divider() {
  return <div className="my-2" style={{ borderTop: "1px solid rgba(232,160,32,0.25)" }} />;
}
