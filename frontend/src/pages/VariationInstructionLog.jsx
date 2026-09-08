import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, AlertTriangle, Layers } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID = "variation-instruction-log";
const TOOL_NAME = "Variation Instruction Log";
const TOOL_INFO =
  "A live register of every variation, extra and change instructed by the client or main contractor. Add rows throughout the project so no variation is forgotten or unpaid. The summary panel updates in real time.";

const isoToday = () => new Date().toISOString().slice(0, 10);

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const HOW_OPTIONS = ["Written instruction", "Email", "WhatsApp", "Verbal only", "Drawing", "Other"];
const STATUS_OPTIONS = ["Pending", "Submitted", "Agreed", "Disputed", "Paid", "Withdrawn"];

function makeRow() {
  return {
    id: crypto.randomUUID(),
    dateInstructed: "",
    instructedBy: "",
    how: "",
    description: "",
    estimatedValue: "",
    agreedValue: "",
    submitted: false,
    dateSubmitted: "",
    status: "Pending",
    notes: "",
  };
}

const N = (v) => parseFloat(v) || 0;
const fmtMoney = (n) =>
  `£${(Number(n) || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function VariationInstructionLog() {
  const { user, refresh } = useAuth();

  // SECTION 1
  const [project, setProject]               = useState("");
  const [contractor, setContractor]         = useState("");
  const [contractRef, setContractRef]       = useState("");
  const [logStarted, setLogStarted]         = useState(isoToday());

  // SECTION 2 — the log table
  const [rows, setRows] = useState([makeRow()]);

  // Sign-off / output
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

  // Auto reference: VI-001, VI-002...
  const refFor = (idx) => `VI-${String(idx + 1).padStart(3, "0")}`;

  const updateRow = (id, field, value) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const removeRow = (id) =>
    setRows((rs) => rs.filter((r) => r.id !== id));
  const addRow = () => setRows((rs) => [...rs, makeRow()]);

  // SUMMARY calculations
  const summary = useMemo(() => {
    const populated = rows.filter((r) => r.description.trim() || N(r.estimatedValue) > 0);
    let totalEst = 0, totalAgreed = 0, totalPaid = 0;
    let pending = 0, submitted = 0, disputed = 0, outstanding = 0;
    for (const r of populated) {
      const est = N(r.estimatedValue);
      const ag  = N(r.agreedValue);
      totalEst += est;
      totalAgreed += ag;
      if (r.status === "Paid") totalPaid += (ag > 0 ? ag : est);
      if (r.status === "Pending") pending++;
      if (r.status === "Submitted") submitted++;
      if (r.status === "Disputed") disputed++;
      if (r.status !== "Paid" && r.status !== "Withdrawn") {
        outstanding += (ag > 0 ? ag : est);
      }
    }
    return { count: populated.length, totalEst, totalAgreed, totalPaid, pending, submitted, disputed, outstanding };
  }, [rows]);

  const onGenerate = async () => {
    if (!project.trim()) { toast.error("Add a project name"); return; }
    const populated = rows.filter((r) => r.description.trim() || N(r.estimatedValue) > 0);
    if (populated.length === 0) { toast.error("Add at least one variation"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    // Build the variations block — one per line with all columns
    const rowsBlock = populated.map((r, i) => {
      const ref = refFor(i);
      const dateInstr = ukDate(r.dateInstructed) || "—";
      const sub = r.submitted ? `Yes${r.dateSubmitted ? ` (${ukDate(r.dateSubmitted)})` : ""}` : "No";
      return [
        `Reference: ${ref}`,
        `Date Instructed: ${dateInstr}`,
        `Instructed by: ${r.instructedBy || "—"}`,
        `How: ${r.how || "—"}`,
        `Description: ${r.description || "—"}`,
        `Estimated Value: ${r.estimatedValue ? fmtMoney(r.estimatedValue) : "—"}`,
        `Agreed Value: ${r.agreedValue ? fmtMoney(r.agreedValue) : "—"}`,
        `Variation Order Submitted: ${sub}`,
        `Status: ${r.status || "Pending"}`,
        `Notes: ${r.notes || "—"}`,
      ].join(" | ");
    }).join("\n");

    const promptTemplate = `Produce a UK VARIATION INSTRUCTION LOG. Plain direct construction English. No padding. No banned consultant words. This is a live project register printed as a tidy table.

1. HEADER — DOCUMENT REFERENCE, DATE (use today in DD/MM/YYYY format).

2. TITLE — exactly: 'VARIATION INSTRUCTION LOG — {project} — {logStarted}'.

3. PROJECT DETAILS — list on separate lines (skip any that are blank cleanly):
   Project Name: {project}
   Main Contractor / Client: {contractor}
   Contract Reference / Order Number: {contractRef}
   Log Started: {logStarted}

4. VARIATION LOG — print this header line then each row below verbatim, one variation per line, preserving the pipe-delimited column order exactly as supplied. Do not rewrite or shorten the row text:
{rowsBlock}

5. SUMMARY PANEL — list on separate lines exactly:
   Total number of variations logged: {count}
   Total estimated value: {totalEst}
   Total agreed value: {totalAgreed}
   Total paid: {totalPaid}
   Number of variations pending: {pending}
   Number of variations submitted but not yet agreed: {submitted}
   Number of variations disputed: {disputed}
   Outstanding amount not yet paid: {outstanding}

6. IMPORTANT NOTE — print verbatim as a single paragraph:
   Verbal instructions are not guaranteed payment. Always follow up a verbal instruction with a written Variation Order as soon as possible. Use the Verbal to Variation tool to generate one in seconds.

7. FOOTER — print verbatim on its own line:
   This log should be updated throughout the project. All verbal instructions should be confirmed in writing. Retain this document with the project file.

8. SIGN-OFF — single sign-off:
   Compiled by: {compiledBy}
   Date: {logStarted}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

Rules:
- Use DD/MM/YYYY for every date in the body. Never YYYY-MM-DD.
- Never invent rows. Use only the supplied data.
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
          project,
          contractor,
          contractRef,
          logStarted: ukDate(logStarted),
          compiledBy: user?.fullName || "",
          rowsBlock,
          count: String(summary.count),
          totalEst: fmtMoney(summary.totalEst),
          totalAgreed: fmtMoney(summary.totalAgreed),
          totalPaid: fmtMoney(summary.totalPaid),
          pending: String(summary.pending),
          submitted: String(summary.submitted),
          disputed: String(summary.disputed),
          outstanding: fmtMoney(summary.outstanding),
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Variation Instruction Log generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Variation Instruction Log — ${project || "project"}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-vil">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Site Tools</div>
          <h1 className="font-display text-4xl md:text-5xl">Variation Instruction Log</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="vil-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="vil-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 */}
      <Section title="Project Details" testId="vil-section-1">
        <Grid>
          <Inp label="Project Name"                 value={project}     onChange={setProject}     testId="vil-project" />
          <Inp label="Main Contractor / Client"      value={contractor}  onChange={setContractor}  testId="vil-contractor" />
          <Inp label="Contract Reference / Order Number (optional)" value={contractRef} onChange={setContractRef} testId="vil-contract-ref" />
          <Inp label="Log Started"                   value={logStarted}  onChange={setLogStarted}  type="date" testId="vil-log-started" />
        </Grid>
      </Section>

      {/* SECTION 2 — VARIATION LOG (two-row card layout, replaces the
          overflow-scrolled 12-column table. All fields and calculations
          preserved; long descriptions stay readable.) */}
      <Section title="Variation Log" testId="vil-section-2" icon={<Layers size={14}/>}>
        <div className="grid gap-3" data-testid="vil-rows">
          {rows.map((r, idx) => (
            <div
              key={r.id}
              className="rounded p-4"
              style={{ background: "rgba(15,15,15,0.5)", border: "1px solid rgba(160,157,148,0.18)" }}
              data-testid={`vil-row-${idx}`}
            >
              {/* Row 1 — Reference | Date Instructed | Instructed by | How | Status */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-2">
                  <FieldLabel>Reference</FieldLabel>
                  <div className="text-[#E8A020] text-xs font-mono py-2" data-testid={`vil-${idx}-ref`}>{refFor(idx)}</div>
                </div>
                <div className="md:col-span-2">
                  <FieldLabel>Date Instructed</FieldLabel>
                  <input type="date" className="input-base !py-2 !text-sm" value={r.dateInstructed} onChange={(e) => updateRow(r.id, "dateInstructed", e.target.value)} data-testid={`vil-${idx}-date-instructed`} />
                </div>
                <div className="md:col-span-4">
                  <FieldLabel>Instructed by</FieldLabel>
                  <input className="input-base !py-2 !text-sm" placeholder={`e.g. "John Smith — Site Manager"`} value={r.instructedBy} onChange={(e) => updateRow(r.id, "instructedBy", e.target.value)} data-testid={`vil-${idx}-instructed-by`} />
                </div>
                <div className="md:col-span-2">
                  <FieldLabel>How</FieldLabel>
                  <select className="input-base !py-2 !text-sm" value={r.how} onChange={(e) => updateRow(r.id, "how", e.target.value)} data-testid={`vil-${idx}-how`}>
                    <option value="">— Choose —</option>
                    {HOW_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <FieldLabel>Status</FieldLabel>
                  <select className="input-base !py-2 !text-sm" value={r.status} onChange={(e) => updateRow(r.id, "status", e.target.value)} data-testid={`vil-${idx}-status`}>
                    {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 2 — Description | Estimated | Agreed | Submitted? | Date Submitted */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end mt-3">
                <div className="md:col-span-5">
                  <FieldLabel>Description</FieldLabel>
                  <textarea
                    rows={2}
                    className="input-base !py-2 !text-sm resize-y"
                    placeholder="Describe what was asked for and where on site"
                    value={r.description}
                    onChange={(e) => updateRow(r.id, "description", e.target.value)}
                    data-testid={`vil-${idx}-description`}
                  />
                </div>
                <div className="md:col-span-2">
                  <FieldLabel>Estimated (£)</FieldLabel>
                  <input type="number" step="0.01" className="input-base !py-2 !text-sm text-right" value={r.estimatedValue} onChange={(e) => updateRow(r.id, "estimatedValue", e.target.value)} data-testid={`vil-${idx}-estimated`} />
                </div>
                <div className="md:col-span-2">
                  <FieldLabel>Agreed (£)</FieldLabel>
                  <input type="number" step="0.01" className="input-base !py-2 !text-sm text-right" value={r.agreedValue} onChange={(e) => updateRow(r.id, "agreedValue", e.target.value)} data-testid={`vil-${idx}-agreed`} />
                </div>
                <div className="md:col-span-1">
                  <FieldLabel>Submitted?</FieldLabel>
                  <button
                    type="button"
                    onClick={() => updateRow(r.id, "submitted", !r.submitted)}
                    className="w-full px-2 py-2 rounded text-xs uppercase tracking-widest transition"
                    style={{
                      background: r.submitted ? "rgba(232,160,32,0.12)" : "transparent",
                      border: `1px solid ${r.submitted ? "#E8A020" : "rgba(160,157,148,0.25)"}`,
                      color: r.submitted ? "#E8A020" : "#A19D94",
                    }}
                    data-testid={`vil-${idx}-submitted`}
                  >
                    {r.submitted ? "Yes" : "No"}
                  </button>
                </div>
                <div className="md:col-span-2">
                  <FieldLabel>Date Submitted</FieldLabel>
                  {r.submitted ? (
                    <input type="date" className="input-base !py-2 !text-sm" value={r.dateSubmitted} onChange={(e) => updateRow(r.id, "dateSubmitted", e.target.value)} data-testid={`vil-${idx}-date-submitted`} />
                  ) : (
                    <div className="text-xs text-[#706D66] py-2">—</div>
                  )}
                </div>
              </div>

              {/* Row 3 — Notes | Delete */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end mt-3">
                <div className="md:col-span-11">
                  <FieldLabel>Notes</FieldLabel>
                  <input className="input-base !py-2 !text-sm" placeholder="Notes" value={r.notes} onChange={(e) => updateRow(r.id, "notes", e.target.value)} data-testid={`vil-${idx}-notes`} />
                </div>
                <div className="md:col-span-1 flex justify-end pb-2">
                  <button onClick={() => removeRow(r.id)} className="text-[#706D66] hover:text-red-400" data-testid={`vil-${idx}-remove`} aria-label="Remove instruction"><Trash2 size={16}/></button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={addRow} className="btn-secondary flex items-center gap-2 text-xs mt-3" data-testid="vil-add">
          <Plus size={12}/> Add Variation
        </button>
      </Section>

      {/* SECTION 3 — SUMMARY */}
      <Section title="Summary" testId="vil-section-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <Stat label="Total variations logged"        value={String(summary.count)}     testId="vil-stat-count" />
          <Stat label="Total estimated value"          value={fmtMoney(summary.totalEst)}    testId="vil-stat-est" />
          <Stat label="Total agreed value"             value={fmtMoney(summary.totalAgreed)} testId="vil-stat-agreed" />
          <Stat label="Total paid"                     value={fmtMoney(summary.totalPaid)}   testId="vil-stat-paid" />
          <Stat label="Pending (not yet submitted)"    value={String(summary.pending)}      testId="vil-stat-pending" />
          <Stat label="Submitted, not yet agreed"      value={String(summary.submitted)}    testId="vil-stat-submitted" />
          <Stat label="Disputed"                       value={String(summary.disputed)}     testId="vil-stat-disputed" />
          <Stat label="Outstanding (not yet paid)"     value={fmtMoney(summary.outstanding)} testId="vil-stat-outstanding" highlight />
        </div>

        {/* SECTION 4 — Important Note */}
        <div
          className="p-4 rounded flex items-start gap-3"
          style={{ border: "2px solid #E8A020", background: "rgba(232,160,32,0.10)" }}
          data-testid="vil-important-note"
        >
          <AlertTriangle size={20} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
          <div className="text-sm text-[#F0EDE8] leading-relaxed">
            <strong className="text-[#E8A020]">Important:</strong> Verbal instructions are not guaranteed payment.
            Always follow up a verbal instruction with a written Variation Order as soon as possible.
            <Link to="/app/wow/verbal-to-variation" className="text-[#E8A020] underline ml-1" data-testid="vil-vtv-link">
              Use the Verbal to Variation tool to generate one in seconds.
            </Link>
          </div>
        </div>
      </Section>

      {/* Sign-off */}
      <Section title="Sign Off" testId="vil-section-signoff">
        <LiveSignatureBlock
          label="Compiled by signature"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="vil-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="vil-sig-date">
          Date: {ukDate(logStarted) || "—"}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="vil-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Variation Instruction Log</>}
      </button>

      {/* OUTPUT */}
      {result && (
        <div className="card-dark p-6 mt-6" data-testid="vil-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated log</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Variation Instruction Log — ${project}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="vil-output">{result}</pre>
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
function FieldLabel({ children }) {
  return <div className="text-[10px] uppercase tracking-widest text-[#A19D94] mb-1">{children}</div>;
}

function Inp({ label, value, onChange, type = "text", testId }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="input-base"
        data-testid={testId}
      />
    </label>
  );
}

function Stat({ label, value, testId, highlight }) {
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
      <div className="font-display text-2xl" style={{ color: highlight ? "#E8A020" : "#F0EDE8" }}>{value}</div>
    </div>
  );
}
