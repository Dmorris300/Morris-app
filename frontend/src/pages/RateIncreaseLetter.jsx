import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, FileText, Mail, Download, Copy, Info, Star, X, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadPdf } from "../lib/pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const TOOL_ID   = "rate-increase-letter";
const TOOL_NAME = "Rate Increase Letter";
const TOOL_INFO =
  "Produces a formal letter notifying a main contractor or client that your rate is going up. Reads as a justified business notification — old rate, new rate, percentage increase, the reasons behind it, the effective date and the notice period. Closes professionally and invites the recipient to discuss.";

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

const REASON_OPTIONS = [
  "Increase in material costs",
  "Increase in fuel and travel costs",
  "National Minimum Wage / Living Wage increase",
  "Increased insurance and certification costs",
  "General cost of living / inflation",
  "Market rate adjustment",
];
const NOTICE_OPTIONS = ["Immediate", "2 weeks", "4 weeks", "On next contract renewal"];

export default function RateIncreaseLetter() {
  const { user, refresh } = useAuth();

  // NEW fields (before Old Rate)
  const [addressedTo, setAddressedTo]       = useState("");
  const [rateDescription, setRateDescription] = useState("");
  const [letterDate, setLetterDate]         = useState(isoToday());

  // Existing fields (kept)
  const [oldRate, setOldRate] = useState("");
  const [newRate, setNewRate] = useState("");
  const [effective, setEffective] = useState("");

  // NEW fields (after Effective From)
  const [reasons, setReasons]               = useState([]);
  const [otherReason, setOtherReason]       = useState("");
  const [noticePeriod, setNoticePeriod]     = useState("4 weeks");
  const [affectsOngoing, setAffectsOngoing] = useState("Yes");
  const [additional, setAdditional]         = useState("");

  // Output / sign-off
  const [infoOpen, setInfoOpen]             = useState(false);
  const [generating, setGenerating]         = useState(false);
  const [result, setResult]                 = useState("");
  const [refNumber, setRefNumber]           = useState("");
  const [liveSignature, setLiveSignature]   = useState("");

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

  const toggleReason = (r) => {
    setReasons((cur) => cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]);
  };

  // Auto-calculated percentage increase
  const percentIncrease = useMemo(() => {
    const o = N(oldRate);
    const n = N(newRate);
    if (o <= 0 || n <= 0) return null;
    return +(((n - o) / o) * 100).toFixed(1);
  }, [oldRate, newRate]);

  const onGenerate = async () => {
    if (!addressedTo.trim()) { toast.error("Add who the letter is addressed to"); return; }
    if (!rateDescription.trim()) { toast.error("Add your trade / rate description"); return; }
    if (!oldRate || N(oldRate) <= 0) { toast.error("Add your current rate"); return; }
    if (!newRate || N(newRate) <= 0) { toast.error("Add your new rate"); return; }
    if (!effective) { toast.error("Set the effective from date"); return; }

    setGenerating(true); setResult(""); setRefNumber("");

    const reasonsForPrompt = [
      ...reasons,
      ...(otherReason.trim() ? [otherReason.trim()] : []),
    ];
    const reasonsBlock = reasonsForPrompt.length
      ? reasonsForPrompt.map((r, i) => `   ${i + 1}. ${r}`).join("\n")
      : "   (No specific reasons selected)";

    const ongoingNote = affectsOngoing === "No"
      ? "This rate applies to new works only. Current ongoing projects will be completed at the existing agreed rate."
      : "";

    const promptTemplate = `Produce a UK RATE INCREASE LETTER. Plain direct construction English. No padding. No banned consultant words. Formal letter from one working professional to a main contractor or client. Reads as a justified business notification — not a bare demand for more money.

1. HEADER — DOCUMENT REFERENCE, DATE (use {letterDate} in DD/MM/YYYY format for DATE).

2. SENDER BLOCK — print the sender's company details on separate lines:
   {companyName}
   Trade: {trade}
   Sender: {senderName}

3. RECIPIENT — print on its own line:
   To: {addressedTo}

4. SUBJECT LINE — print on its own line in title case:
   Subject: Notification of Rate Increase — {rateDescription}

5. OPENING — short opening paragraph addressed to the recipient. Politely thanking them for their continued business and explaining you are writing to formally notify them of a change to your rate for {rateDescription}.

6. RATE CHANGE — print on separate lines:
   Current rate (per day / unit): {oldRate}
   New rate (per day / unit): {newRate}
   Percentage increase: {percentIncreaseLine}
   Effective from: {effective}
   Notice period given: {noticePeriod}

7. REASONS — short lead-in line then list the reasons verbatim, one per numbered line:
   The reasons for this adjustment are:
{reasonsBlock}

8. ONGOING WORK — if the supplied ongoingNote is not blank, include it as its own paragraph verbatim. If it is blank, skip this section entirely.
   {ongoingNote}

9. ADDITIONAL COMMENTS — if supplied, include verbatim as its own short paragraph:
   {additional}

10. CLOSING — short closing paragraph thanking the client for their continued business and inviting them to get in touch to discuss if needed.

11. SIGN-OFF — single sender sign-off:
    Yours sincerely
    {senderName}
    {senderRole}
    {companyName}
    Date: {letterDate}
    Signature: (auto-insert user's saved signature if held; otherwise leave a signature line)

Rules:
- Use DD/MM/YYYY for every date in the document body. Never YYYY-MM-DD.
- Never invent reasons, dates or rates. Use only what is supplied.
- Never use abbreviations such as 'N/A', 'TBC', '&', 'inc.' or 'excl.'. Write words in full.
- Skip blank optional sections cleanly. Do not print '—' for a whole paragraph.
- No banned words: 'kinetic', 'utilise', 'endeavour', 'facilitate', 'prior to', 'operatives are advised', 'in order to'.
- Short sentences. Confident. Direct. Reads as a real professional letter, not a demand.`;

    try {
      const r = await api.post("/generate", {
        toolId: TOOL_ID,
        toolName: TOOL_NAME,
        promptTemplate,
        userInputs: {
          letterDate: ukDate(letterDate),
          companyName: user?.companyName || "—",
          trade: user?.trade || "—",
          senderName: user?.fullName || "—",
          senderRole: user?.signatureRole || "Director",
          addressedTo,
          rateDescription,
          oldRate: money(N(oldRate)),
          newRate: money(N(newRate)),
          percentIncreaseLine: percentIncrease === null
            ? "—"
            : `This represents a ${percentIncrease}% increase`,
          effective: ukDate(effective),
          noticePeriod,
          reasonsBlock,
          ongoingNote,
          additional: additional.trim() || "",
        },
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      setRefNumber(r.data.refNumber || "");
      const recent = [TOOL_ID, ...(user?.recentlyUsed || []).filter((x) => x !== TOOL_ID)].slice(0, 5);
      try { await api.post("/profile/update", { recentlyUsed: recent }); await refresh(); } catch { /* ignore */ }
      toast.success("Rate Increase Letter generated. Saved to your Vault.");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not generate. Try again.");
    } finally { setGenerating(false); }
  };

  const onCopy = () => { navigator.clipboard.writeText(result); toast.success("Copied"); };
  const onDownload = () => {
    const userWithSig = { ...(user || {}), signature: liveSignature || user?.signature };
    downloadPdf({ title: `Rate Increase Letter — ${addressedTo || "client"}`, content: result, user: userWithSig });
    toast.success("PDF downloaded");
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-rate-increase-letter">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ChevronLeft size={14}/> Back to dashboard
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Sole Trader</div>
          <h1 className="font-display text-4xl md:text-5xl">Rate Increase Letter</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="ril-info-btn"><Info size={14}/> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="ril-fav-btn"><Star size={14} fill={isFav ? "#E8A020" : "none"}/> Favourite</button>
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

      {/* SECTION 1 — LETTER DETAILS */}
      <Section title="Letter Details" testId="ril-section-1" icon={<TrendingUp size={14}/>}>
        <Grid>
          <Inp label="Addressed To (Main Contractor / Client Name)" value={addressedTo} onChange={setAddressedTo} testId="ril-addressed" />
          <Inp label="Your Trade / Rate Description" value={rateDescription} onChange={setRateDescription} testId="ril-description" placeholder={`e.g. "Day rate for duct fitting"`} />
          <Inp label="Date of Letter" value={letterDate} onChange={setLetterDate} type="date" testId="ril-date" />
        </Grid>
      </Section>

      {/* SECTION 2 — RATES */}
      <Section title="Rates" testId="ril-section-2">
        <Grid>
          <Inp label="Current rate per day / unit (£)" value={oldRate} onChange={setOldRate} type="number" testId="ril-oldrate" />
          <Inp label="New rate per day / unit (£)" value={newRate} onChange={setNewRate} type="number" testId="ril-newrate" />
          <ReadOnly
            label="Percentage Increase"
            value={percentIncrease === null ? "—" : `This represents a ${percentIncrease}% increase`}
            testId="ril-percent"
            highlight={percentIncrease !== null}
          />
          <Inp label="Effective From" value={effective} onChange={setEffective} type="date" testId="ril-effective" />
        </Grid>
      </Section>

      {/* SECTION 3 — REASONS */}
      <Section title="Reason for Increase" testId="ril-section-3">
        <div className="text-xs text-[#A19D94] mb-3">Select all that apply.</div>
        <div className="grid sm:grid-cols-2 gap-3">
          {REASON_OPTIONS.map((r) => {
            const active = reasons.includes(r);
            return (
              <button
                key={r}
                type="button"
                onClick={() => toggleReason(r)}
                data-testid={`ril-reason-${REASON_OPTIONS.indexOf(r)}`}
                className="text-left p-3 rounded text-sm transition-colors"
                style={{
                  background: active ? "rgba(232,160,32,0.10)" : "rgba(15,15,15,0.6)",
                  border: `1px solid ${active ? "#E8A020" : "rgba(160,157,148,0.18)"}`,
                  color: active ? "#E8A020" : "#F0EDE8",
                }}
              >
                <span className="mr-2">{active ? "✓" : "○"}</span>{r}
              </button>
            );
          })}
        </div>
        <div className="mt-4">
          <Inp label="Other (free text)" value={otherReason} onChange={setOtherReason} testId="ril-other-reason" placeholder="Any other reason — written in full" />
        </div>
      </Section>

      {/* SECTION 4 — NOTICE + ONGOING */}
      <Section title="Notice and Ongoing Work" testId="ril-section-4">
        <Grid>
          <Drop label="Notice Period Being Given" value={noticePeriod} onChange={setNoticePeriod} options={NOTICE_OPTIONS} testId="ril-notice" />
          <label className="block">
            <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">Does this affect current ongoing jobs?</div>
            <div className="flex gap-2" data-testid="ril-ongoing-toggle">
              {["Yes", "No"].map((v) => {
                const active = affectsOngoing === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAffectsOngoing(v)}
                    className={`px-4 py-2 rounded text-xs ${active ? "bg-[#E8A020] text-[#0F0F0F]" : "border border-[#A19D94]/30 text-[#A19D94]"}`}
                    data-testid={`ril-ongoing-${v.toLowerCase()}`}
                  >{v}</button>
                );
              })}
            </div>
            {affectsOngoing === "No" && (
              <div className="text-[10px] text-[#E8A020] mt-2" data-testid="ril-ongoing-note">
                The document will include: &quot;This rate applies to new works only. Current ongoing projects will be completed at the existing agreed rate.&quot;
              </div>
            )}
          </label>
        </Grid>
        <div className="mt-4">
          <Area label="Additional Comments (optional)" value={additional} onChange={setAdditional} placeholder="Anything else you want to include in the letter" testId="ril-additional" />
        </div>
      </Section>

      {/* SECTION 5 — SIGN OFF */}
      <Section title="Sign Off" testId="ril-section-signoff">
        <LiveSignatureBlock
          label="Sender signature"
          subtitle="Your signature is stamped on the generated PDF"
          value={liveSignature}
          onChange={setLiveSignature}
          savedSignature={user?.signature}
          testIdPrefix="ril-sig"
        />
        <div className="mt-3 text-xs text-[#706D66]" data-testid="ril-sig-date">
          Date: {ukDate(letterDate) || "—"}
        </div>
      </Section>

      <button onClick={onGenerate} disabled={generating} className="btn-primary w-full flex items-center justify-center gap-2 mt-5" data-testid="ril-generate">
        {generating ? "Generating…" : <><FileText size={14}/> Generate Rate Increase Letter</>}
      </button>

      {result && (
        <div className="card-dark p-6 mt-6" data-testid="ril-output-block">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Generated letter</div>
          <div className="flex gap-2 mb-3 flex-wrap">
            <button onClick={onCopy} className="btn-secondary flex items-center gap-2 text-xs"><Copy size={12}/> Copy</button>
            <button onClick={onDownload} className="btn-secondary flex items-center gap-2 text-xs"><Download size={12}/> PDF</button>
            <a href={`mailto:?subject=${encodeURIComponent(`Rate Increase — ${addressedTo}`)}&body=${encodeURIComponent(result)}`} className="btn-secondary flex items-center gap-2 text-xs"><Mail size={12}/> Email</a>
          </div>
          {refNumber && <div className="text-[10px] text-[#706D66] mb-2">Ref: {refNumber}</div>}
          <pre className="text-sm text-[#F0EDE8] whitespace-pre-wrap font-sans leading-relaxed" data-testid="ril-output">{result}</pre>
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
function ReadOnly({ label, value, testId, highlight }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <div
        className="input-base !cursor-default"
        data-testid={testId}
        style={highlight ? { color: "#E8A020", borderColor: "#E8A020" } : {}}
      >{value}</div>
    </label>
  );
}
