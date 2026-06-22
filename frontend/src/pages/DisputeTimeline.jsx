import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, Plus, Trash2, ClipboardList, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";
import DraftSaveButton from "../components/DraftSaveButton";
import useToolDraft from "../hooks/useToolDraft";

const TOOL_ID   = "dispute-timeline";
const TOOL_NAME = "Dispute Timeline";
const TOOL_INFO =
  "Builds a contemporaneous chronological record of a dispute — date by date, event by event. Designed to stand up as evidence in adjudication, mediation or county court proceedings. Every event captures what happened, who was involved and what evidence is available.";

const isoToday = () => new Date().toISOString().slice(0, 10);

function ukDate(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const money = (n) =>
  `£${(Number(n) || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const NATURE_OPTIONS = [
  "Non-payment or underpayment",
  "Retention not released",
  "Variation not agreed or paid",
  "Wrongful termination",
  "Contra charges applied unfairly",
  "Defects liability dispute",
  "Delay and extension of time",
  "Liquidated damages applied",
  "Other",
];

const STATUS_OPTIONS = [
  "Ongoing — attempting to resolve",
  "Formal notice issued",
  "Referred to adjudication",
  "Referred to mediation",
  "County Court claim issued",
  "Resolved — settled",
  "Resolved — court judgment",
];

const EVENT_TYPE_OPTIONS = [
  "Written instruction received",
  "Verbal instruction received",
  "Email sent",
  "Email received",
  "Letter sent",
  "Letter received",
  "WhatsApp message sent",
  "WhatsApp message received",
  "Phone call made",
  "Phone call received",
  "Meeting held",
  "Work carried out",
  "Payment received",
  "Payment refused",
  "Document submitted",
  "Site visit",
  "Other",
];

const EVIDENCE_OPTIONS = [
  "Email",
  "Letter",
  "WhatsApp screenshot",
  "Photo",
  "Site diary entry",
  "Signed document",
  "Witness",
  "None",
];

function makeRow() {
  return {
    id: crypto.randomUUID(),
    date: isoToday(),
    time: "",
    eventType: "Email sent",
    eventTypeOther: "",
    description: "",
    whoInvolved: "",
    evidence: [],
    notes: "",
  };
}

export default function DisputeTimeline() {
  const { user, refresh } = useAuth();

  // SECTION 1 — DISPUTE DETAILS
  const [project, setProject]               = useState("");
  const [siteAddress, setSiteAddress]       = useState("");
  const [disputeRef, setDisputeRef]         = useState("DT-001");
  const [timelineStarted, setTimelineStarted] = useState(isoToday());
  const [disputeWith, setDisputeWith]       = useState("");
  const [nature, setNature]                 = useState("Non-payment or underpayment");
  const [natureOther, setNatureOther]       = useState("");
  const [amount, setAmount]                 = useState("");
  const [status, setStatus]                 = useState("Ongoing — attempting to resolve");

  // SECTION 2 — TIMELINE ROWS
  const [rows, setRows] = useState([makeRow()]);

  // Output / sign-off
  const [infoOpen, setInfoOpen]         = useState(false);
  const [generating, setGenerating]     = useState(false);
  const [result, setResult]             = useState("");
  const [refNumber, setRefNumber]       = useState("");
  const [liveSignature, setLiveSignature] = useState("");

  // ---------- Draft save/resume ----------
  const getDraftData = () => ({
    project, siteAddress, disputeRef, timelineStarted, disputeWith,
    nature, natureOther, amount, status, rows,
    result, refNumber, liveSignature,
  });
  useToolDraft(TOOL_ID, (p) => {
    if (p.project !== undefined) setProject(p.project);
    if (p.siteAddress !== undefined) setSiteAddress(p.siteAddress);
    if (p.disputeRef !== undefined) setDisputeRef(p.disputeRef);
    if (p.timelineStarted !== undefined) setTimelineStarted(p.timelineStarted);
    if (p.disputeWith !== undefined) setDisputeWith(p.disputeWith);
    if (p.nature !== undefined) setNature(p.nature);
    if (p.natureOther !== undefined) setNatureOther(p.natureOther);
    if (p.amount !== undefined) setAmount(p.amount);
    if (p.status !== undefined) setStatus(p.status);
    if (Array.isArray(p.rows)) setRows(p.rows);
    if (p.result !== undefined) setResult(p.result);
    if (p.refNumber !== undefined) setRefNumber(p.refNumber);
    if (p.liveSignature !== undefined) setLiveSignature(p.liveSignature);
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

  const toggleEvidence = (id, opt) => {
    setRows((rs) => rs.map((r) => {
      if (r.id !== id) return r;
      const has = (r.evidence || []).includes(opt);
      let next;
      if (opt === "None") {
        next = has ? [] : ["None"];
      } else {
        const without = (r.evidence || []).filter((x) => x !== "None");
        next = has ? without.filter((x) => x !== opt) : [...without, opt];
      }
      return { ...r, evidence: next };
    }));
  };

  // Sort chronologically by date then time
  const decorated = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const da = (a.date || "9999-12-31") + "T" + (a.time || "00:00");
      const db = (b.date || "9999-12-31") + "T" + (b.time || "00:00");
      return da.localeCompare(db);
    });
    return sorted.map((r, i) => ({ ...r, eventNumber: i + 1 }));
  }, [rows]);

  // Summary
  const totalEvents = decorated.length;
  const populatedDates = decorated.map((r) => r.date).filter(Boolean).sort();
  const firstDate = populatedDates[0] || "";
  const lastDate  = populatedDates[populatedDates.length - 1] || "";

  const natureResolved = nature === "Other" ? (natureOther.trim() || "Other") : nature;

  const onGenerate = async () => {
    if (!project.trim())     { toast.error("Add the project name"); return; }
    if (!disputeWith.trim()) { toast.error("Add who the dispute is with"); return; }
    const populated = decorated.filter((r) => (r.description || "").trim().length > 0);
    if (populated.length === 0) { toast.error("Add at least one event"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const eventsBlock = populated.map((r) => {
      const eventTypeFinal = r.eventType === "Other"
        ? (r.eventTypeOther.trim() || "Other")
        : r.eventType;
      const evidenceList = (r.evidence && r.evidence.length > 0) ? r.evidence.join(", ") : "None recorded";
      return [
        `Event ${r.eventNumber}.`,
        `Date: ${ukDate(r.date)}`,
        `Time: ${r.time || "—"}`,
        `Event Type: ${eventTypeFinal}`,
        `Description: ${r.description}`,
        `Who Was Involved: ${r.whoInvolved || "—"}`,
        `Evidence Available: ${evidenceList}`,
        `Notes: ${r.notes || "—"}`,
      ].join(" | ");
    }).join("\n");

    const summaryBlock = [
      `Total Number of Events Logged: ${populated.length}`,
      `Date Range: ${firstDate ? ukDate(firstDate) : "—"} to ${lastDate ? ukDate(lastDate) : "—"}`,
      `Amount in Dispute: ${money(amount)}`,
      `Current Status: ${status}`,
    ].join("\n   ");

    const promptTemplate = `Produce a UK DISPUTE TIMELINE document. Plain direct construction English. No padding. No banned consultant words. Full words only — never use abbreviations such as 'N/A', 'TBC', 'qty', '&', 'inc.', 'excl.', 'approx.' or 'etc.'. This document forms a contemporaneous record of events suitable for adjudication, mediation or county court proceedings.

1. HEADER — DOCUMENT REFERENCE: {disputeRef}. DATE: {timelineStartedUk} in DD/MM/YYYY format.

2. TITLE — exactly: 'DISPUTE TIMELINE — {project} — {disputeRef}'.

3. DISPUTE DETAILS — list on separate lines:
   Project Name: {project}
   Site Address: {siteAddress}
   Dispute Reference: {disputeRef}
   Date Timeline Started: {timelineStartedUk}
   Dispute is with: {disputeWith}
   Nature of Dispute: {natureResolved}
   Amount in Dispute: {amountFormatted}
   Current Status of Dispute: {status}
   Compiled by Company: {companyName}
   Trade: {trade}

4. CHRONOLOGICAL TIMELINE OF EVENTS — print this header line then each event below verbatim on its own line, preserving the pipe-delimited structure exactly as supplied. Events are already sorted chronologically:
{eventsBlock}

5. SUMMARY — print on separate lines (use the values supplied — never recalculate):
   {summaryBlock}

6. COMPILED BY — sign-off block:
   Compiled by: {compiledByName}
   Position: {compiledByRole}
   Company: {companyName}
   Date: {timelineStartedUk}
   Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

7. FOOTER — print verbatim on its own line:
   This timeline has been compiled as a contemporaneous record of events. It is prepared without prejudice to any other rights or remedies available.

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Never invent events, dates, parties, evidence or amounts. Use only the supplied rows and the supplied values.
- Full words only — write every word out in full. Never abbreviate.
- Skip blank optional fields cleanly. Use '—' only where supplied.
- No banned words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct. Reads as a real contemporaneous timeline from a tradesman to an adjudicator or judge.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          project,
          siteAddress: siteAddress || "—",
          disputeRef,
          timelineStartedUk: ukDate(timelineStarted),
          disputeWith,
          natureResolved,
          amountFormatted: money(amount),
          status,
          companyName: user?.companyName || "—",
          trade: user?.trade || "—",
          eventsBlock,
          summaryBlock,
          compiledByName: user?.fullName || "—",
          compiledByRole: user?.signatureRole || "Director",
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Dispute Timeline generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Dispute Timeline — ${project || "project"} — ${disputeRef}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-dispute-timeline">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Site</div>
          <h1 className="font-display text-4xl md:text-5xl">Dispute Timeline</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="dt-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="dt-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 — DISPUTE DETAILS */}
      <Section title="Dispute Details" testId="dt-section-1" icon={<ClipboardList size={14}/>}>
        <Grid>
          <Inp label="Project Name" value={project} onChange={setProject} testId="dt-project" />
          <Inp label="Site Address" value={siteAddress} onChange={setSiteAddress} testId="dt-site" />
          <Inp label="Dispute Reference" value={disputeRef} onChange={setDisputeRef} testId="dt-ref" helper="Auto-suggested next number — edit if needed" />
          <Inp label="Date Timeline Started" value={timelineStarted} onChange={setTimelineStarted} type="date" testId="dt-started" />
          <Inp label="Dispute is with" value={disputeWith} onChange={setDisputeWith} placeholder="Main contractor / client name" testId="dt-with" />
          <Drop label="Nature of Dispute" value={nature} onChange={setNature} options={NATURE_OPTIONS} testId="dt-nature" />
          {nature === "Other" && (
            <Inp label="Specify Other Nature" value={natureOther} onChange={setNatureOther} testId="dt-nature-other" />
          )}
          <Inp label="Amount in Dispute (£)" value={amount} onChange={setAmount} type="number" testId="dt-amount" />
          <Drop label="Current Status of Dispute" value={status} onChange={setStatus} options={STATUS_OPTIONS} testId="dt-status" />
        </Grid>
      </Section>

      {/* SECTION 2 — TIMELINE OF EVENTS */}
      <Section title="Timeline of Events" testId="dt-section-2">
        <div className="grid gap-4">
          {decorated.map((r, idx) => {
            const eventLabel = r.eventType === "Other"
              ? (r.eventTypeOther.trim() || "Other")
              : r.eventType;
            return (
              <div
                key={r.id}
                className="rounded p-4 md:p-5"
                style={{
                  background: "rgba(15,15,15,0.5)",
                  border: "1px solid rgba(160,157,148,0.18)",
                }}
                data-testid={`dt-row-${idx}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div
                    className="text-xs uppercase tracking-widest text-[#E8A020] font-mono"
                    data-testid={`dt-row-${idx}-num`}
                  >
                    Event {r.eventNumber}
                    {r.date ? <span className="text-[#706D66] ml-2 normal-case">— {ukDate(r.date)}{r.time ? ` at ${r.time}` : ""}</span> : null}
                  </div>
                  <button
                    onClick={() => removeRow(r.id)}
                    className="text-[#706D66] hover:text-red-400 flex items-center gap-1 text-xs"
                    data-testid={`dt-row-${idx}-remove`}
                  >
                    <Trash2 size={14}/> Remove
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Inp label="Date" type="date" value={r.date} onChange={(v) => updateRow(r.id, "date", v)} testId={`dt-row-${idx}-date`} />
                  <Inp label="Time (optional)" type="time" value={r.time} onChange={(v) => updateRow(r.id, "time", v)} testId={`dt-row-${idx}-time`} />
                  <Drop label="Event Type" value={r.eventType} onChange={(v) => updateRow(r.id, "eventType", v)} options={EVENT_TYPE_OPTIONS} testId={`dt-row-${idx}-eventtype`} />
                  {r.eventType === "Other" && (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <Inp label="Specify Other Event Type" value={r.eventTypeOther} onChange={(v) => updateRow(r.id, "eventTypeOther", v)} testId={`dt-row-${idx}-eventtype-other`} />
                    </div>
                  )}
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Area
                      label="Description"
                      value={r.description}
                      onChange={(v) => updateRow(r.id, "description", v)}
                      placeholder="Describe exactly what happened"
                      testId={`dt-row-${idx}-description`}
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Inp
                      label="Who Was Involved"
                      value={r.whoInvolved}
                      onChange={(v) => updateRow(r.id, "whoInvolved", v)}
                      placeholder="Names and roles of people involved"
                      testId={`dt-row-${idx}-who`}
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">Evidence Available</div>
                    <div className="flex flex-wrap gap-2" data-testid={`dt-row-${idx}-evidence`}>
                      {EVIDENCE_OPTIONS.map((opt) => {
                        const active = (r.evidence || []).includes(opt);
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => toggleEvidence(r.id, opt)}
                            className={`px-3 py-1.5 rounded text-xs ${active ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94] hover:text-[#F0EDE8]"}`}
                            data-testid={`dt-row-${idx}-evidence-${opt.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Inp
                      label="Notes (optional)"
                      value={r.notes}
                      onChange={(v) => updateRow(r.id, "notes", v)}
                      testId={`dt-row-${idx}-notes`}
                    />
                  </div>
                </div>

                <div
                  className="mt-4 pt-4 flex items-center justify-between"
                  style={{ borderTop: "1px solid rgba(160,157,148,0.18)" }}
                >
                  <div className="text-[10px] uppercase tracking-widest text-[#706D66]">Event Type</div>
                  <div className="font-display text-lg text-[#E8A020]" data-testid={`dt-row-${idx}-eventlabel`}>
                    {eventLabel}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <button onClick={addRow} className="btn-secondary flex items-center gap-2 text-xs mt-4" data-testid="dt-add-row">
          <Plus size={12}/> Add Event
        </button>
        <div className="mt-3 text-[10px] text-[#706D66]">Events sort automatically by date and time.</div>
      </Section>

      {/* SECTION 3 — SUMMARY */}
      <Section title="Summary" testId="dt-section-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryStat label="Total Events Logged" value={String(totalEvents)} testId="dt-summary-total" />
          <SummaryStat
            label="Date Range"
            value={firstDate || lastDate ? `${firstDate ? ukDate(firstDate) : "—"} to ${lastDate ? ukDate(lastDate) : "—"}` : "—"}
            testId="dt-summary-range"
            small
          />
          <SummaryStat label="Amount in Dispute" value={money(amount)} testId="dt-summary-amount" highlight />
          <SummaryStat label="Current Status" value={status} testId="dt-summary-status" small />
        </div>
      </Section>

      {/* SECTION 4 — IMPORTANT NOTE */}
      <div
        className="rounded p-5 mb-5 flex gap-3"
        style={{
          background: "rgba(232,160,32,0.08)",
          border: "1px solid #E8A020",
        }}
        data-testid="dt-important-note"
      >
        <AlertTriangle size={20} className="text-[#E8A020] shrink-0 mt-0.5" />
        <div className="text-sm text-[#F0EDE8] leading-relaxed">
          A contemporaneous dispute timeline is powerful evidence. Add events as they happen — do not reconstruct from memory later. Subcontractors have a statutory right to adjudication under the Scheme for Construction Contracts. Adjudication is fast, relatively low cost, and the decision is temporarily binding.
        </div>
      </div>

      {/* SECTION 5 — SIGN OFF */}
      <Section title="Compiled by — Sign Off" testId="dt-section-5">
        <LiveSignatureBlock
          label="Compiled by"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="dt-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="dt-sig-date">
          Date: {ukDate(timelineStarted) || "—"}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="dt-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Dispute Timeline</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="dt-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated timeline</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Dispute Timeline — ${project} — ${disputeRef}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="dt-output">{result}</pre>
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
function SummaryStat({ label, value, testId, highlight, small }) {
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
      <div
        className={small ? "font-display text-lg" : "font-display text-3xl"}
        style={{ color: highlight ? "#E8A020" : "#F0EDE8" }}
      >
        {value || "—"}
      </div>
    </div>
  );
}
