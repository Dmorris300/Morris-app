import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, AlertTriangle, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID = "subbie-mgmt";
const TOOL_NAME = "Subcontractor Management";
const TOOL_INFO =
  "Live compliance register for subcontractors you engage. Tracks CIS status, insurance, RAMS, induction, payment terms, and current status. Not a one-off document — add subbies as you take them on.";

const isoToday = () => new Date().toISOString().slice(0, 10);

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const CIS_RATE_OPTIONS = ["0% (gross payment status)", "20% (registered)", "30% (unregistered / not verified)"];
const INSURANCE_OPTIONS = ["Yes", "No", "Expired"];
const RAMS_OPTIONS = ["Yes", "No", "Pending"];
const PAYMENT_TERMS = ["7 days", "14 days", "30 days", "On completion", "Other"];
const STATUS_OPTIONS = [
  "Not yet started",
  "Active on site",
  "Works complete",
  "Final payment pending",
  "Fully paid and complete",
  "Removed from job",
];

function makeRow() {
  return {
    id: crypto.randomUUID(),
    name: "",
    trade: "",
    phone: "",
    email: "",
    utr: "",
    cisVerified: false,
    cisRate: "20% (registered)",
    insurance: "",
    insuranceExpiry: "",
    rams: "",
    induction: "",
    paymentTerms: "30 days",
    paymentTermsOther: "",
    status: "Not yet started",
    notes: "",
  };
}

export default function SubcontractorManagement() {
  const { user, refresh } = useAuth();

  // SECTION 2
  const [rows, setRows] = useState([makeRow()]);

  // sign-off / output
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

  // Compliance summary
  const summary = useMemo(() => {
    const pop = rows.filter((r) => (r.name || "").trim());
    const today = isoToday();
    let notVerified = 0, insBad = 0, noRams = 0, noInduction = 0, active = 0;
    for (const r of pop) {
      if (!r.cisVerified) notVerified++;
      // Insurance bad: explicit Expired/No, OR insurance Yes but expiry in past
      if (r.insurance === "No" || r.insurance === "Expired") insBad++;
      else if (r.insurance === "Yes" && r.insuranceExpiry && r.insuranceExpiry < today) insBad++;
      else if (!r.insurance) insBad++;
      if (r.rams !== "Yes") noRams++;
      if (r.induction !== "Yes") noInduction++;
      if (r.status === "Active on site") active++;
    }
    return { total: pop.length, notVerified, insBad, noRams, noInduction, active };
  }, [rows]);

  const onGenerate = async () => {
    const pop = rows.filter((r) => (r.name || "").trim());
    if (pop.length === 0) { toast.error("Add at least one subcontractor"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const today = ukDate(isoToday());

    const subbiesBlock = pop.map((r, i) => {
      const insLine = r.insurance === "Yes" && r.insuranceExpiry
        ? `Yes (expires ${ukDate(r.insuranceExpiry)})`
        : (r.insurance || "—");
      const payment = r.paymentTerms === "Other" && r.paymentTermsOther
        ? `Other: ${r.paymentTermsOther}`
        : (r.paymentTerms || "—");
      return [
        `${i + 1}.`,
        `Subcontractor: ${r.name}`,
        `Trade / Scope: ${r.trade || "—"}`,
        `Contact: ${r.phone || "—"}`,
        `Email: ${r.email || "—"}`,
        `UTR: ${r.utr || "—"}`,
        `CIS Verified with HMRC: ${r.cisVerified ? "Yes" : "No"}`,
        `CIS Deduction Rate: ${r.cisRate}`,
        `Public Liability Insurance: ${insLine}`,
        `RAMS Received and Approved: ${r.rams || "—"}`,
        `Site Induction Completed: ${r.induction || "—"}`,
        `Payment Terms: ${payment}`,
        `Current Status: ${r.status}`,
        `Notes: ${r.notes || "—"}`,
      ].join(" | ");
    }).join("\n");

    const promptTemplate = `Produce a UK SUBCONTRACTOR REGISTER. Plain direct construction English. No padding. No banned consultant words. This is a live compliance register printed as a tidy table for project records.

1. HEADER — DOCUMENT REFERENCE, DATE (use today in DD/MM/YYYY format).

2. TITLE — exactly: 'SUBCONTRACTOR REGISTER — {companyName} — {today}'.

3. REGISTER DETAILS — list on separate lines:
   Your Company Name: {companyName}
   Date Last Updated: {today}

4. SUBCONTRACTOR REGISTER — print this header line, then each subbie below verbatim, one per line, preserving the pipe-delimited column order exactly as supplied:
{subbiesBlock}

5. COMPLIANCE SUMMARY — list on separate lines exactly:
   Total subcontractors on register: {total}
   Not yet CIS verified: {notVerified}
   Insurance expired or missing: {insBad}
   RAMS not received: {noRams}
   Site induction not completed: {noInduction}
   Currently active on site: {active}

6. CIS WARNING — print verbatim as a single paragraph headed 'IMPORTANT — CIS COMPLIANCE':
   You must verify every subcontractor with HMRC before making payment under the Construction Industry Scheme. Failure to do so means you may be liable for any tax they owe. Verify online at gov.uk/what-is-the-construction-industry-scheme or by calling the CIS Helpline on 0300 200 3210.

7. FOOTER — print verbatim on its own line:
   This register must be kept up to date throughout the project. CIS verification must be completed before any payment is made.

8. SIGN-OFF — single sign-off:
   Compiled by: {compiledBy}
   Date: {today}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

Rules:
- Use DD/MM/YYYY for every date. Never YYYY-MM-DD.
- Never invent subcontractors. Use only the supplied rows.
- Never use abbreviations such as 'N/A', 'TBC' or '&'. Write words in full.
- Skip blank fields cleanly. Use '—' only where supplied.
- No banned words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          companyName: user?.companyName || user?.fullName || "—",
          compiledBy: user?.fullName || "",
          today,
          subbiesBlock,
          total: String(summary.total),
          notVerified: String(summary.notVerified),
          insBad: String(summary.insBad),
          noRams: String(summary.noRams),
          noInduction: String(summary.noInduction),
          active: String(summary.active),
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Subcontractor Register generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Subcontractor Register — ${user?.companyName || "company"}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-subbie-mgmt">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Subcontractor Tools</div>
          <h1 className="font-display text-4xl md:text-5xl">Subcontractor Management</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="sm-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="sm-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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
      <Section title="Register Details" testId="sm-section-1">
        <div className="grid sm:grid-cols-2 gap-4">
          <Inp label="Your Company Name (auto from profile)" value={user?.companyName || ""} onChange={() => {}} readOnly testId="sm-company" />
          <Inp label="Date Last Updated" value={isoToday()} onChange={() => {}} readOnly type="date" testId="sm-updated" />
        </div>
      </Section>

      {/* SECTION 2 — REGISTER */}
      <Section title="Subcontractor Register" testId="sm-section-2" icon={<Users size={14}/>}>
        <div className="space-y-4">
          {rows.map((r, idx) => (
            <SubbieCard
              key={r.id}
              row={r}
              idx={idx}
              onChange={(field, val) => updateRow(r.id, field, val)}
              onRemove={() => removeRow(r.id)}
            />
          ))}
        </div>
        <button onClick={addRow} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="sm-add">
          <Plus size={12}/> Add Subcontractor
        </button>
      </Section>

      {/* SECTION 3 — SUMMARY */}
      <Section title="Compliance Summary" testId="sm-section-3">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Stat label="Total subcontractors on register" value={String(summary.total)} testId="sm-stat-total" />
          <Stat label="Not yet CIS verified" value={String(summary.notVerified)} testId="sm-stat-notverified" warn={summary.notVerified > 0} />
          <Stat label="Insurance expired or missing" value={String(summary.insBad)} testId="sm-stat-insbad" warn={summary.insBad > 0} />
          <Stat label="RAMS not received" value={String(summary.noRams)} testId="sm-stat-norams" warn={summary.noRams > 0} />
          <Stat label="Induction not completed" value={String(summary.noInduction)} testId="sm-stat-noinduction" warn={summary.noInduction > 0} />
          <Stat label="Currently active on site" value={String(summary.active)} testId="sm-stat-active" />
        </div>
      </Section>

      {/* SECTION 4 — CIS WARNING */}
      <div
        className="mb-5 p-5 rounded flex items-start gap-3"
        style={{ border: "2px solid #E8A020", background: "rgba(232,160,32,0.10)" }}
        data-testid="sm-cis-warning"
      >
        <AlertTriangle size={22} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
        <div className="text-sm text-[#F0EDE8] leading-relaxed">
          <strong className="text-[#E8A020]">Important — CIS Compliance:</strong> You must verify every subcontractor with HMRC
          before making payment under the Construction Industry Scheme. Failure to do so means you may be liable for any tax they owe.
          Verify online at{" "}
          <a href="https://www.gov.uk/what-is-the-construction-industry-scheme" target="_blank" rel="noreferrer" className="text-[#E8A020] underline">
            gov.uk/what-is-the-construction-industry-scheme
          </a>{" "}
          or by calling the CIS Helpline on <span className="text-[#E8A020]">0300 200 3210</span>.
        </div>
      </div>

      {/* Sign-off */}
      <Section title="Sign Off" testId="sm-section-signoff">
        <LiveSignatureBlock
          label="Compiled by signature"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="sm-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="sm-sig-date">
          Date: {ukDate(isoToday())}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="sm-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Subcontractor Register</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="sm-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated register</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Subcontractor Register — ${user?.companyName || "company"}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="sm-output">{result}</pre>
        </div>
      )}
    </div>
  );
}

// One subcontractor card (more usable than a 14-column horizontal table)
function SubbieCard({ row, idx, onChange, onRemove }) {
  return (
    <div className="p-4 rounded" style={{ background: "rgba(15,15,15,0.6)", border: "1px solid rgba(160,157,148,0.18)" }} data-testid={`sm-row-${idx}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-widest text-[#E8A020]">Subcontractor #{idx + 1}</div>
        <button onClick={onRemove} className="text-[#706D66] hover:text-red-400" data-testid={`sm-${idx}-remove`}><Trash2 size={14}/></button>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Inp label="Subcontractor Name / Company" value={row.name} onChange={(v) => onChange("name", v)} testId={`sm-${idx}-name`} />
        <Inp label="Trade / Scope of Work"        value={row.trade} onChange={(v) => onChange("trade", v)} testId={`sm-${idx}-trade`} placeholder={`e.g. "First fix electrical"`} />
        <Inp label="Contact Number"               value={row.phone} onChange={(v) => onChange("phone", v)} testId={`sm-${idx}-phone`} />
        <Inp label="Email Address (optional)"     value={row.email} onChange={(v) => onChange("email", v)} testId={`sm-${idx}-email`} />
        <Inp label="UTR Number"                   value={row.utr}   onChange={(v) => onChange("utr", v)}   testId={`sm-${idx}-utr`} helper="Required for CIS verification" />

        <div>
          <Label>CIS Verified with HMRC?</Label>
          <button
            type="button"
            onClick={() => onChange("cisVerified", !row.cisVerified)}
            className="px-3 py-2 rounded text-xs uppercase tracking-widest transition w-full"
            style={{
              background: row.cisVerified ? "rgba(34,197,94,0.12)" : "rgba(232,160,32,0.10)",
              border: `1px solid ${row.cisVerified ? "#22C55E" : "#E8A020"}`,
              color: row.cisVerified ? "#22C55E" : "#E8A020",
            }}
            data-testid={`sm-${idx}-cis-verified`}
          >
            {row.cisVerified ? "Yes — Verified with HMRC" : "No — Not yet verified"}
          </button>
          <div className="text-[10px] text-[#706D66] mt-1">You must verify every subcontractor with HMRC before paying under CIS.</div>
        </div>

        <Drop label="CIS Deduction Rate" value={row.cisRate} onChange={(v) => onChange("cisRate", v)} options={CIS_RATE_OPTIONS} testId={`sm-${idx}-cis-rate`} />
        <Drop label="Public Liability Insurance" value={row.insurance} onChange={(v) => onChange("insurance", v)} options={INSURANCE_OPTIONS} testId={`sm-${idx}-insurance`} />
        <Inp  label="Insurance Expiry Date" type="date" value={row.insuranceExpiry} onChange={(v) => onChange("insuranceExpiry", v)} testId={`sm-${idx}-ins-expiry`} />
        <Drop label="RAMS Received and Approved" value={row.rams} onChange={(v) => onChange("rams", v)} options={RAMS_OPTIONS} testId={`sm-${idx}-rams`} />
        <Drop label="Site Induction Completed" value={row.induction} onChange={(v) => onChange("induction", v)} options={["Yes", "No"]} testId={`sm-${idx}-induction`} />

        <div>
          <Label>Payment Terms</Label>
          <select
            value={row.paymentTerms}
            onChange={(e) => onChange("paymentTerms", e.target.value)}
            className="input-base"
            data-testid={`sm-${idx}-payment-terms`}
          >
            {PAYMENT_TERMS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {row.paymentTerms === "Other" && (
            <input
              type="text"
              placeholder="Other (free text)"
              className="input-base mt-2"
              value={row.paymentTermsOther}
              onChange={(e) => onChange("paymentTermsOther", e.target.value)}
              data-testid={`sm-${idx}-payment-terms-other`}
            />
          )}
        </div>
        <Drop label="Current Status" value={row.status} onChange={(v) => onChange("status", v)} options={STATUS_OPTIONS} testId={`sm-${idx}-status`} />
        <Inp label="Notes (optional)" value={row.notes} onChange={(v) => onChange("notes", v)} testId={`sm-${idx}-notes`} />
      </div>
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

function Label({ children }) {
  return <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">{children}</div>;
}

function Inp({ label, value, onChange, type = "text", testId, helper, readOnly, placeholder }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="input-base"
        readOnly={readOnly}
        placeholder={placeholder}
        data-testid={testId}
      />
      {helper && <div className="text-[10px] text-[#706D66] mt-1">{helper}</div>}
    </label>
  );
}

function Drop({ label, value, onChange, options, testId }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} className="input-base" data-testid={testId}>
        <option value="">— Choose —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
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
      <div className="font-display text-2xl" style={{ color: warn ? "#E8A020" : "#F0EDE8" }}>{value}</div>
      {warn && <div className="text-[9px] uppercase tracking-widest text-[#E8A020] mt-1">Action Required</div>}
    </div>
  );
}
