import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { TOOLS, WOW_TOOLS, emojiFor, getToolById } from "../lib/tools-config";
import { recommendationsFor } from "../lib/trade-recommendations";
import { Star, FileText, Mic, Camera, Calculator, ArrowRight, TrendingUp, Clock, HardHat, AlertTriangle, ShieldCheck, IdCard, PiggyBank, Receipt, Wallet, Gauge, Hammer, Plus, Briefcase } from "lucide-react";
import { thisTaxYear, aggregateCis, refundCalc, taxPotFor, fGBPnoDp, currentTaxYearLabel } from "../lib/finance";

// ---------- Command Centre helpers ----------
function daysUntil(iso) {
  if (!iso) return null;
  const target = new Date(iso);
  if (isNaN(target.getTime())) return null;
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// Returns "green" | "amber" | "red" | "unset"
function expiryStatus(iso) {
  if (!iso) return "unset";
  const d = daysUntil(iso);
  if (d === null) return "unset";
  if (d < 30) return "red";
  if (d <= 60) return "amber";
  return "green";
}

function nextSADeadline() {
  // 31 January following each tax year end
  const now = new Date();
  const thisYearDeadline = new Date(now.getFullYear(), 0, 31); // 31 Jan this year
  return now > thisYearDeadline
    ? new Date(now.getFullYear() + 1, 0, 31)
    : thisYearDeadline;
}

const STATUS_STYLES = {
  green: { fg: "#5BC97A", bg: "rgba(91,201,122,0.06)", border: "rgba(91,201,122,0.35)" },
  amber: { fg: "#E8A020", bg: "rgba(232,160,32,0.06)", border: "rgba(232,160,32,0.35)" },
  red:   { fg: "#E5635A", bg: "rgba(229,99,90,0.06)",  border: "rgba(229,99,90,0.4)" },
  unset: { fg: "#706D66", bg: "rgba(112,109,102,0.05)", border: "rgba(112,109,102,0.25)" },
};

export default function Dashboard() {
  const { user } = useAuth();
  const [docs, setDocs] = useState([]);
  const [cis, setCis] = useState([]);
  const [jobs, setJobs] = useState([]);

  // Empty-state prompts on the Command Centre are only shown on the user's
  // first ever visit. The flag is keyed to the user id so a second account
  // on the same device still sees the welcome prompts once.
  const seenKey = user?.id ? `morris_cc_seen_${user.id}` : "morris_cc_seen";
  const [hideEmptyPrompts, setHideEmptyPrompts] = useState(() => {
    try { return !!localStorage.getItem(seenKey); } catch { return false; }
  });

  useEffect(() => {
    api.get("/documents").then(r => setDocs(r.data)).catch((e) => { if (process.env.NODE_ENV !== "production") console.error("Documents load failed", e); });
    api.get("/cis/payments").then(r => setCis(r.data)).catch((e) => { if (process.env.NODE_ENV !== "production") console.error("CIS payments load failed", e); });
    api.get("/jobs").then(r => setJobs(r.data)).catch((e) => { if (process.env.NODE_ENV !== "production") console.error("Jobs load failed", e); });
    // Mark this user as having seen the Command Centre. From the NEXT
    // dashboard mount onwards (next login, refresh after navigation, etc.)
    // the empty-state prompts will be suppressed automatically.
    try { localStorage.setItem(seenKey, String(Date.now())); } catch { /* ignore */ }
  }, [seenKey]);

  const favs = (user?.favourites || []).map(id => [...TOOLS, ...WOW_TOOLS].find(t => t.id === id)).filter(Boolean);
  const recent = (user?.recentlyUsed || []).map(id => [...TOOLS, ...WOW_TOOLS].find(t => t.id === id)).filter(Boolean);
  const recIds = recommendationsFor(user?.trade);
  const recommended = recIds.map(id => getToolById(id)).filter(Boolean);

  // ---------- Command Centre figures (all tax-year aware) ----------
  const ytdCis = thisTaxYear(cis);
  const totals = aggregateCis(ytdCis);
  const taxPot = taxPotFor(totals.net);
  const calc = refundCalc({
    grossLabourYtd: totals.grossLabour,
    materialsYtd: totals.materials,
    cisDeductedYtd: totals.deduction,
  });
  // Show refund estimate (£0 if owed); separate display for owed below if needed.
  const cisRefundEstimate = calc.refund;

  // Job tracker → finance integration
  // Outstanding invoices = sum of invoiced jobs (not paid, not disputed)
  const invoicedJobs = jobs.filter(j => j.status === "invoiced");
  const disputedJobs = jobs.filter(j => j.status === "disputed");
  const paidJobs = jobs.filter(j => j.status === "paid");
  const outstandingInvoiced = invoicedJobs.reduce((a, j) => a + (Number(j.contractValue) || 0), 0);
  const outstandingDisputed = disputedJobs.reduce((a, j) => a + (Number(j.contractValue) || 0), 0);
  const paidYtdFromJobs = paidJobs.reduce((a, j) => a + (Number(j.contractValue) || 0), 0);
  const earningsYtd = totals.grossLabour + paidYtdFromJobs;
  const activeJobs = jobs.filter(j => j.status === "active").length;

  const insuranceStatus = expiryStatus(user?.insuranceExpiry);
  const cscsStatus = expiryStatus(user?.cscsExpiry);
  const insuranceDays = daysUntil(user?.insuranceExpiry);
  const cscsDays = daysUntil(user?.cscsExpiry);

  const saDeadline = nextSADeadline();
  const saDays = daysUntil(saDeadline.toISOString().slice(0, 10));
  const recentDocs = docs.slice(0, 5);

  const formatGBP = (n) => fGBPnoDp(n);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="dashboard-page">
      <div className="mb-8">
        <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Command Centre · Tax year {currentTaxYearLabel()}</div>
        <h1 className="font-display text-5xl md:text-6xl" data-testid="welcome-name">
          {user?.fullName ? `Hello, ${user.fullName.split(" ")[0]}.` : "Hello."}
        </h1>
        <p className="text-[#A19D94] mt-3 text-sm" data-testid="cc-trade-line">
          <span className="text-[#F0EDE8]">{user?.trade || "Trade not set"}</span>
          {user?.companyName ? <> <span className="text-[#706D66]">·</span> <span className="text-[#F0EDE8]">{user.companyName}</span></> : null}
        </p>
      </div>

      {/* ---------- Command Centre top grid ---------- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4" data-testid="command-centre-stats">
        <FinanceCard
          label="Tax pot to set aside"
          value={formatGBP(taxPot)}
          subtitle="8% of net cash received"
          icon={<PiggyBank size={16} />}
          to="/app/taxpot"
          testId="cc-tax-pot"
        />
        <FinanceCard
          label={calc.delta >= 0 ? "CIS refund estimate" : "Tax owed estimate"}
          value={formatGBP(Math.abs(calc.delta))}
          subtitle={`Of ${formatGBP(totals.deduction)} deducted`}
          icon={<Receipt size={16} />}
          to="/app/cis-predictor"
          testId="cc-cis-refund"
          warn={calc.delta < 0}
        />
        <FinanceCard
          label="Outstanding invoices"
          value={formatGBP(outstandingInvoiced)}
          subtitle={
            jobs.length > 0
              ? `${invoicedJobs.length} invoiced${outstandingDisputed > 0 ? ` · ${disputedJobs.length} disputed (${formatGBP(outstandingDisputed)})` : ""}`
              : "Create a job to track"
          }
          icon={<Wallet size={16} />}
          to="/app/jobs"
          testId="cc-outstanding"
          muted={jobs.length === 0}
        />
        <FinanceCard
          label="Earnings YTD"
          value={formatGBP(earningsYtd)}
          subtitle={`${ytdCis.length} CIS payment${ytdCis.length === 1 ? "" : "s"}${paidJobs.length > 0 ? ` · ${paidJobs.length} paid job${paidJobs.length === 1 ? "" : "s"}` : ""}`}
          icon={<Gauge size={16} />}
          to="/app/earnings"
          testId="cc-earnings"
        />
      </div>

      {/* ---------- Expiry & deadline strip ---------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6" data-testid="command-centre-expiries">
        <ExpiryCard
          label="Public liability insurance"
          status={insuranceStatus}
          dateStr={user?.insuranceExpiry}
          days={insuranceDays}
          icon={<ShieldCheck size={16} />}
          ctaTo="/app/profile"
          testId="cc-insurance"
        />
        <ExpiryCard
          label="CSCS card"
          status={cscsStatus}
          dateStr={user?.cscsExpiry}
          days={cscsDays}
          icon={<IdCard size={16} />}
          ctaTo="/app/profile"
          testId="cc-cscs"
        />
        <ExpiryCard
          label="Self assessment"
          status={saDays !== null && saDays < 30 ? "amber" : "green"}
          dateStr={saDeadline.toISOString().slice(0, 10)}
          days={saDays}
          icon={<AlertTriangle size={16} />}
          ctaTo="/app/tool/self-assessment-prep"
          testId="cc-sa"
        />
      </div>

      {/* ---------- Quick actions ---------- */}
      <div className="mb-10">
        <div className="text-[10px] uppercase tracking-[0.25em] text-[#706D66] mb-3">Quick actions</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="command-centre-quick-actions">
          <QuickAction to="/app/jobs" icon={<Briefcase size={18} />} label="Jobs" testId="qa-jobs" />
          <QuickAction to="/app/tool/cis-invoice" icon={<Receipt size={18} />} label="New invoice" testId="qa-invoice" />
          <QuickAction to="/app/tool/variation-letter" icon={<Plus size={18} />} label="New variation" testId="qa-variation" />
          <QuickAction to="/app/tool/rams" icon={<Hammer size={18} />} label="New RAMS" testId="qa-rams" />
          <QuickAction to="/app/mileage" icon={<TrendingUp size={18} />} label="Log mileage" testId="qa-mileage" />
        </div>
      </div>

      {/* ---------- Recent documents ---------- */}
      {recentDocs.length > 0 && (
        <div className="mb-10" data-testid="command-centre-recent-docs">
          <h2 className="font-display text-3xl mb-4 flex items-center gap-3"><FileText size={20} className="text-[#E8A020]" /> Recent documents</h2>
          <div className="card-dark divide-y divide-[#1a1a1a]">
            {recentDocs.map(d => (
              <Link key={d.id} to="/app/history" className="flex items-center justify-between p-4 hover:bg-[#0e0e0e] transition" data-testid={`recent-doc-${d.id}`}>
                <div>
                  <div className="text-sm font-semibold text-[#F0EDE8]">{d.title}</div>
                  <div className="text-xs text-[#706D66] mt-1">{d.refNumber ? `${d.refNumber} · ` : ""}{new Date(d.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</div>
                </div>
                <ArrowRight size={14} className="text-[#706D66]" />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mb-10">
        <h2 className="font-display text-3xl mb-4">What Morris offers</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <BigCard to="/app/wow/verbal-to-variation" icon={<Mic size={24} />} title="Verbal to Variation" desc="Talk it. Send it." testId="dash-wow-verbal" />
          <BigCard to="/app/wow/photo-to-document" icon={<Camera size={24} />} title="Photo to Document" desc="Snap a scribble. Get a doc." testId="dash-wow-photo" />
          <BigCard to="/app/cis-predictor" icon={<Calculator size={24} />} title="CIS Refund Predictor" desc="See what HMRC owes you." testId="dash-wow-cis" />
        </div>
      </div>

      {user?.trade && recommended.length > 0 && (
        <div className="mb-10" data-testid="dash-recommendations">
          <div className="flex items-end justify-between flex-wrap gap-2 mb-4">
            <h2 className="font-display text-3xl flex items-center gap-3"><HardHat size={20} className="text-[#E8A020]" /> Recommended for {user.trade}</h2>
            <p className="text-xs text-[#706D66]">The paperwork most tradesmen in your trade reach for.</p>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
            {recommended.slice(0, 8).map(t => (
              <Link key={"rec-" + t.id} to={t.route || `/app/tool/${t.id}`} className="card-dark p-4 hover:border-[#E8A020]/40 transition" data-testid={`dash-rec-${t.id}`}>
                <div className="text-2xl mb-2">{emojiFor(t.id)}</div>
                <div className="text-sm font-semibold leading-tight">{t.name}</div>
                <div className="text-xs text-[#706D66] mt-1 capitalize">{t.section}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="mb-10">
          <h2 className="font-display text-3xl mb-4 flex items-center gap-3"><Clock size={20} className="text-[#E8A020]" /> Recently used</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {recent.map(t => (
              <Link key={"r-" + t.id} to={t.route || `/app/tool/${t.id}`} className="card-dark p-4 hover:border-[#E8A020]/40 transition" data-testid={`dash-recent-${t.id}`}>
                <div className="text-sm font-semibold flex items-center gap-2"><span className="text-lg">{emojiFor(t.id)}</span> {t.name}</div>
                <div className="text-xs text-[#706D66] mt-1 capitalize">{t.section}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="font-display text-3xl mb-4 flex items-center gap-3"><Star size={20} className="text-[#E8A020]" /> Favourites</h2>
        {favs.length === 0 ? (
          <div className="card-dark p-6 text-sm text-[#706D66]">Star a tool from its header to pin it here.</div>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {favs.map(t => (
              <Link key={"f-" + t.id} to={t.route || `/app/tool/${t.id}`} className="card-dark p-4 hover:border-[#E8A020]/40 transition" data-testid={`dash-fav-${t.id}`}>
                <div className="text-sm font-semibold flex items-center gap-2"><span className="text-lg">{emojiFor(t.id)}</span> {t.name}</div>
                <div className="text-xs text-[#706D66] mt-1 capitalize">{t.section}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FinanceCard({ label, value, subtitle, icon, to, testId, muted, warn }) {
  return (
    <Link
      to={to}
      className={`card-dark p-4 hover:border-[#E8A020]/40 transition block ${muted ? "opacity-70" : ""}`}
      data-testid={testId}
    >
      <div className={`flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] mb-2 ${warn ? "text-[#E5635A]" : "text-[#E8A020]"}`}>{icon}{label}</div>
      <div className="font-display text-3xl leading-tight" style={{ color: warn ? "#E5635A" : "#F0EDE8" }}>{value}</div>
      <div className="text-[10px] text-[#706D66] mt-1">{subtitle}</div>
    </Link>
  );
}

function ExpiryCard({ label, status, dateStr, days, icon, ctaTo, testId }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.unset;
  let detail;
  if (status === "unset") {
    detail = "Not set — tap to add";
  } else if (days < 0) {
    detail = `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  } else {
    detail = `${days} day${days === 1 ? "" : "s"} left`;
  }
  return (
    <Link
      to={ctaTo}
      className="block p-4 rounded transition hover:opacity-90"
      style={{ border: `1px solid ${s.border}`, background: s.bg }}
      data-testid={testId}
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: s.fg }}>
        {icon}{label}
      </div>
      <div className="text-sm font-semibold text-[#F0EDE8] mb-1">
        {dateStr ? new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "Add an expiry date"}
      </div>
      <div className="text-[10px]" style={{ color: s.fg }}>{detail}</div>
    </Link>
  );
}

function QuickAction({ to, icon, label, testId }) {
  return (
    <Link
      to={to}
      className="card-dark p-4 hover:border-[#E8A020]/40 transition flex items-center gap-3"
      data-testid={testId}
    >
      <div className="w-9 h-9 rounded flex items-center justify-center text-[#E8A020]" style={{ border: "1px solid rgba(232,160,32,0.3)", background: "rgba(232,160,32,0.06)" }}>{icon}</div>
      <div className="text-sm font-semibold text-[#F0EDE8]">{label}</div>
    </Link>
  );
}

function BigCard({ to, icon, title, desc, testId }) {
  return (
    <Link to={to} className="card-dark p-6 hover:border-[#E8A020]/40 transition group block" data-testid={testId}>
      <div className="text-[#E8A020] mb-3">{icon}</div>
      <div className="font-display text-2xl tracking-wide">{title}</div>
      <div className="text-sm text-[#A19D94] mt-1">{desc}</div>
      <div className="mt-3 flex items-center gap-1 text-xs text-[#E8A020] opacity-0 group-hover:opacity-100 transition">Open <ArrowRight size={12} /></div>
    </Link>
  );
}
