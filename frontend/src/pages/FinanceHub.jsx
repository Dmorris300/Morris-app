// Morris — Finance Hub V2
// Real-money dashboard with 4 tabs: Dashboard / Tax / Commercial / Reports.
// All figures pulled live from Payment Tracker, CIS payments, Expenses, Mileage
// and Tax Pot. Mobile-first, charcoal/gold, no dummy data.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Wallet, AlertTriangle, CheckCircle2, Clock, TrendingUp, ArrowUpRight,
  PiggyBank, Receipt, Calculator, FileText, Sparkles, Layers,
  ArrowRight, RefreshCw,
} from "lucide-react";
import { loadFinanceHubData, fGBP } from "../lib/finance-hub-data";

const TAB_IDS = ["dashboard", "tax", "commercial", "reports"];
const TAB_LABELS = { dashboard: "Dashboard", tax: "Tax", commercial: "Commercial", reports: "Reports" };

// ---------------- shared UI bits ----------------

function KpiCard({ label, value, sub, tone, icon: Icon, to, testId }) {
  const toneClass = tone === "red" ? "text-[#F27C7C]" : tone === "green" ? "text-[#68D391]" : tone === "gold" ? "text-[#E8A020]" : "text-[#F0EDE8]";
  const Wrap = to ? Link : "div";
  return (
    <Wrap to={to} data-testid={testId} className={`card-dark p-5 block ${to ? "hover:border-[#E8A020]/40 transition" : ""}`}>
      <div className="flex items-start justify-between">
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">{label}</div>
        {Icon && <Icon size={14} className="text-[#706D66]" />}
      </div>
      <div className={`mt-3 font-display text-3xl ${toneClass}`}>{value}</div>
      {sub && <div className="text-xs text-[#A19D94] mt-2">{sub}</div>}
    </Wrap>
  );
}

function SectionHeader({ eyebrow, title, action }) {
  return (
    <div className="flex items-end justify-between mb-4 mt-8">
      <div>
        {eyebrow && <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-1">{eyebrow}</div>}
        <h2 className="font-display text-2xl text-[#F0EDE8]">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ title, subtitle, cta, to, testId }) {
  return (
    <div className="card-dark p-8 text-center" data-testid={testId}>
      <div className="mx-auto w-10 h-10 rounded-md bg-[#1e1a12] text-[#E8A020] flex items-center justify-center mb-3">
        <Sparkles size={16} />
      </div>
      <div className="text-base text-[#F0EDE8]">{title}</div>
      {subtitle && <div className="text-xs text-[#A19D94] mt-1 max-w-sm mx-auto">{subtitle}</div>}
      {cta && to && (
        <Link to={to} className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040] transition">
          {cta} <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}

// Micro bar chart (SVG). data = [{ label, invoiced, received }]
function CashFlowChart({ data }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(1, ...data.map((d) => Math.max(d.invoiced, d.received)));
  const monthLabel = (ym) => {
    const [y, m] = ym.split("-");
    const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${names[parseInt(m, 10) - 1]} ${y.slice(2)}`;
  };
  const w = 640, h = 180, pad = 32;
  const barW = (w - pad * 2) / data.length / 2.6;
  return (
    <div className="card-dark p-5" data-testid="cashflow-chart">
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-3">Cash flow — last 6 months (invoiced vs received)</div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-40">
        <line x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} stroke="#2a2620" strokeWidth="1" />
        {data.map((d, i) => {
          const x = pad + i * ((w - pad * 2) / data.length) + ((w - pad * 2) / data.length) / 4;
          const ih = ((h - pad * 2) * d.invoiced) / max;
          const rh = ((h - pad * 2) * d.received) / max;
          return (
            <g key={d.ym}>
              <rect x={x} y={h - pad - ih} width={barW} height={ih} fill="#E8A020" opacity="0.7" rx="2" />
              <rect x={x + barW + 4} y={h - pad - rh} width={barW} height={rh} fill="#68D391" opacity="0.75" rx="2" />
              <text x={x + barW} y={h - pad + 14} fontSize="9" fill="#706D66" textAnchor="middle">{monthLabel(d.ym)}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-4 mt-2 text-[11px] text-[#A19D94]">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#E8A020]/70" /> Invoiced</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-[#68D391]/75" /> Received</span>
      </div>
    </div>
  );
}

// ---------------- Tab: Dashboard ----------------

function DashboardTab({ d }) {
  const { dashboardKpis } = d;
  return (
    <div data-testid="finance-dashboard-tab">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Outstanding" value={fGBP(dashboardKpis.outstanding.value)} sub={`${dashboardKpis.outstanding.count} invoice${dashboardKpis.outstanding.count === 1 ? "" : "s"}`} tone="gold" icon={Wallet} to="/app/payment-tracker" testId="kpi-outstanding" />
        <KpiCard label="Paid" value={fGBP(dashboardKpis.paid.value)} sub={`${dashboardKpis.paid.count} invoice${dashboardKpis.paid.count === 1 ? "" : "s"}`} tone="green" icon={CheckCircle2} to="/app/payment-tracker" testId="kpi-paid" />
        <KpiCard label="Overdue" value={fGBP(dashboardKpis.overdue.value)} sub={`${dashboardKpis.overdue.count} invoice${dashboardKpis.overdue.count === 1 ? "" : "s"}`} tone="red" icon={AlertTriangle} to="/app/payment-chaser" testId="kpi-overdue" />
        <KpiCard label="Due this month" value={fGBP(dashboardKpis.dueThisMonth.value)} sub={`${dashboardKpis.dueThisMonth.count} invoice${dashboardKpis.dueThisMonth.count === 1 ? "" : "s"}`} icon={Clock} to="/app/payment-tracker" testId="kpi-due-month" />
      </div>

      <SectionHeader eyebrow="Money flow" title="Cash flow summary" action={<Link to="/app/payment-tracker" className="text-xs text-[#E8A020] hover:underline flex items-center gap-1">Open Tracker <ArrowRight size={12} /></Link>} />
      {d.invoiceRows.length === 0 ? (
        <EmptyState title="No invoices logged yet" subtitle="Log your first invoice in the Payment Tracker and this chart will populate automatically." cta="Open Payment Tracker" to="/app/payment-tracker" testId="empty-cashflow" />
      ) : (
        <CashFlowChart data={dashboardKpis.cashFlow} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        <div className="card-dark p-5" data-testid="dash-totals">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">Totals — tax year {d.taxYearLabel}</div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between text-[#F0EDE8]"><span>Invoiced total</span><span>{fGBP(d.dashboardKpis.totalInvoiced)}</span></div>
            <div className="flex justify-between text-[#F0EDE8]"><span>Received total</span><span>{fGBP(d.dashboardKpis.totalReceived)}</span></div>
            <div className="flex justify-between text-[#F0EDE8]"><span>CIS deducted (from receipts)</span><span>{fGBP(d.cis.deduction)}</span></div>
            <div className="flex justify-between text-[#E8A020]"><span>Retention held on tracker</span><span>{fGBP(d.retentionHeld)}</span></div>
          </div>
        </div>
        <div className="card-dark p-5" data-testid="dash-quick-links">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">Quick actions</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link to="/app/payment-tracker" className="text-xs text-[#F0EDE8] hover:text-[#E8A020] transition py-2 px-3 rounded-md bg-[#1e1a12]">Log invoice</Link>
            <Link to="/app/payment-chaser" className="text-xs text-[#F0EDE8] hover:text-[#E8A020] transition py-2 px-3 rounded-md bg-[#1e1a12]">Chase payment</Link>
            <Link to="/app/tool/cis-invoice" className="text-xs text-[#F0EDE8] hover:text-[#E8A020] transition py-2 px-3 rounded-md bg-[#1e1a12]">Raise CIS invoice</Link>
            <Link to="/app/retention-chaser" className="text-xs text-[#F0EDE8] hover:text-[#E8A020] transition py-2 px-3 rounded-md bg-[#1e1a12]">Chase retention</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- Tab: Tax ----------------

function TaxTab({ d }) {
  const potPct = d.recommendedTaxPot > 0 ? Math.min(100, Math.round((d.taxPotBalance / d.recommendedTaxPot) * 100)) : 0;
  return (
    <div data-testid="finance-tax-tab">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Tax pot balance" value={fGBP(d.taxPotBalance)} sub={`Suggested: ${fGBP(d.recommendedTaxPot)}`} tone="gold" icon={PiggyBank} to="/app/taxpot" testId="kpi-taxpot" />
        <KpiCard label="CIS deducted YTD" value={fGBP(d.cis.deduction)} sub={`Across ${d.cisPayments.length} payment${d.cisPayments.length === 1 ? "" : "s"}`} tone="green" icon={Receipt} to="/app/cis-predictor" testId="kpi-cis" />
        <KpiCard label="VAT rolling 12mo" value={fGBP(d.vatRollingRevenue)} sub={`${d.vatUsedPct}% of £90k threshold`} tone={d.vatUsedPct > 80 ? "red" : "gold"} icon={Calculator} to="/app/vat" testId="kpi-vat" />
        <KpiCard label="Predicted refund" value={fGBP(d.refund.refund)} sub={d.refund.refund > 0 ? "Estimated at year end" : "Nothing owed back yet"} tone={d.refund.refund > 0 ? "green" : "default"} icon={Sparkles} to="/app/cis-predictor" testId="kpi-refund" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        <div className="card-dark p-5" data-testid="tax-pot-progress">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">Tax pot progress</div>
          <div className="mt-3 text-sm text-[#F0EDE8]">You&apos;ve set aside {fGBP(d.taxPotBalance)} of a suggested {fGBP(d.recommendedTaxPot)} ({potPct}%).</div>
          <div className="mt-3 h-2 rounded-full bg-[#1e1a12] overflow-hidden">
            <div className="h-full bg-[#E8A020]" style={{ width: `${potPct}%` }} />
          </div>
          <Link to="/app/taxpot" className="inline-flex items-center gap-1 text-xs text-[#E8A020] hover:underline mt-4">Open Tax Pot <ArrowRight size={12} /></Link>
        </div>
        <div className="card-dark p-5" data-testid="tax-summary">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">Tax summary — {d.taxYearLabel}</div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between text-[#F0EDE8]"><span>Gross labour</span><span>{fGBP(d.cis.grossLabour)}</span></div>
            <div className="flex justify-between text-[#F0EDE8]"><span>Materials</span><span>{fGBP(d.cis.materials)}</span></div>
            <div className="flex justify-between text-[#F0EDE8]"><span>Expenses + mileage</span><span>{fGBP(d.expensesTotal)}</span></div>
            <div className="flex justify-between text-[#F0EDE8]"><span>Taxable profit</span><span>{fGBP(d.refund.taxableProfit)}</span></div>
            <div className="flex justify-between text-[#F0EDE8]"><span>Income tax due</span><span>{fGBP(d.refund.incomeTax)}</span></div>
            <div className="flex justify-between text-[#F0EDE8]"><span>Class 4 NI due</span><span>{fGBP(d.refund.class4Ni)}</span></div>
            <div className="border-t border-[#2a2620] pt-2 flex justify-between text-[#E8A020]"><span>Total liability</span><span>{fGBP(d.refund.totalLiability)}</span></div>
          </div>
          <Link to="/app/self-assessment-prep" className="inline-flex items-center gap-1 text-xs text-[#E8A020] hover:underline mt-4">Open Self Assessment Prep <ArrowRight size={12} /></Link>
        </div>
      </div>
    </div>
  );
}

// ---------------- Tab: Commercial ----------------

function CommercialTab({ d }) {
  const commercialTiles = [
    { key: "application-for-payment", to: "/app/tool/application-for-payment", label: "Applications for Payment", icon: FileText, desc: "HGCRA-compliant interim applications" },
    { key: "payment-tracker", to: "/app/payment-tracker", label: "Payment Tracker", icon: Wallet, desc: `${d.invoiceRows.length} record${d.invoiceRows.length === 1 ? "" : "s"} on file` },
    { key: "payment-chaser", to: "/app/payment-chaser", label: "Payment Chasers", icon: AlertTriangle, desc: `${d.dashboardKpis.overdue.count} overdue right now` },
    { key: "final-account", to: "/app/tool/final-account", label: "Final Accounts", icon: Layers, desc: "Close-out with variation totals" },
    { key: "retention-chaser", to: "/app/retention-chaser", label: "Retentions", icon: PiggyBank, desc: fGBP(d.retentionHeld) + " on tracker" },
    { key: "cis-invoice", to: "/app/tool/cis-invoice", label: "CIS Invoice", icon: Receipt, desc: "With NI + UTR compliance" },
    { key: "quote-builder", to: "/app/tool/quote-builder", label: "Quote Builder", icon: FileText, desc: "8-point professional quote" },
    { key: "variation-letter", to: "/app/tool/variation-letter", label: "Variation Orders", icon: FileText, desc: "6-point compliance pack" },
  ];
  return (
    <div data-testid="finance-commercial-tab">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {commercialTiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.key} to={t.to} className="card-dark p-5 hover:border-[#E8A020]/40 transition block" data-testid={`commercial-tile-${t.key}`}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-md bg-[#1e1a12] text-[#E8A020] flex items-center justify-center shrink-0"><Icon size={16} /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-base text-[#F0EDE8] font-medium">{t.label}</div>
                  <div className="text-xs text-[#A19D94] mt-1">{t.desc}</div>
                </div>
                <ArrowRight size={14} className="text-[#706D66]" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- Tab: Reports ----------------

function ReportsTab({ d }) {
  // Monthly revenue & profit table (last 6 months)
  const monthly = d.dashboardKpis.cashFlow.map((m) => ({ ...m, profit: m.received - (d.expensesTotal / 12) }));
  const totalRev = monthly.reduce((s, m) => s + m.received, 0);
  const totalProfit = monthly.reduce((s, m) => s + m.profit, 0);
  return (
    <div data-testid="finance-reports-tab">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Revenue — last 6mo" value={fGBP(totalRev)} sub="Money in the bank" tone="green" icon={TrendingUp} testId="rep-total-rev" />
        <KpiCard label="Est. profit — last 6mo" value={fGBP(totalProfit)} sub="Revenue minus prorated expenses" tone={totalProfit >= 0 ? "gold" : "red"} icon={ArrowUpRight} testId="rep-total-profit" />
        <KpiCard label="Active projects" value={String(d.jobs.filter((j) => (j.status || "").toLowerCase() !== "completed").length)} sub={`${d.jobs.length} on file`} icon={Layers} to="/app/jobs" testId="rep-active" />
        <KpiCard label="Documents generated" value={String(d.docs.length)} sub="This account, all time" icon={FileText} to="/app/history" testId="rep-docs" />
      </div>

      <SectionHeader eyebrow="Monthly view" title="Monthly revenue & profit" />
      <div className="card-dark overflow-x-auto" data-testid="reports-monthly-table">
        <table className="w-full text-sm">
          <thead className="text-[#A19D94] text-[10px] uppercase tracking-[0.2em]">
            <tr>
              <th className="text-left p-3">Month</th>
              <th className="text-right p-3">Invoiced</th>
              <th className="text-right p-3">Received</th>
              <th className="text-right p-3">Est. profit</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((m) => {
              const [y, mo] = m.ym.split("-");
              const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
              return (
                <tr key={m.ym} className="border-t border-[#2a2620]">
                  <td className="p-3 text-[#F0EDE8]">{names[parseInt(mo, 10) - 1]} {y}</td>
                  <td className="p-3 text-right text-[#F0EDE8]">{fGBP(m.invoiced)}</td>
                  <td className="p-3 text-right text-[#68D391]">{fGBP(m.received)}</td>
                  <td className={`p-3 text-right ${m.profit >= 0 ? "text-[#E8A020]" : "text-[#F27C7C]"}`}>{fGBP(m.profit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SectionHeader eyebrow="By project" title="Project profitability" />
      {d.projects.length === 0 ? (
        <EmptyState title="No projects yet" subtitle="Create a project in the Job Tracker and log invoices against it to see per-project profitability." cta="Open Job Tracker" to="/app/jobs" testId="empty-projects" />
      ) : (
        <div className="card-dark overflow-x-auto" data-testid="reports-projects-table">
          <table className="w-full text-sm">
            <thead className="text-[#A19D94] text-[10px] uppercase tracking-[0.2em]">
              <tr>
                <th className="text-left p-3">Project</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Invoiced</th>
                <th className="text-right p-3">Received</th>
                <th className="text-right p-3">Balance</th>
              </tr>
            </thead>
            <tbody>
              {d.projects.slice(0, 10).map((p) => (
                <tr key={p.id} className="border-t border-[#2a2620]">
                  <td className="p-3 text-[#F0EDE8]"><Link to={`/app/jobs/${p.id}`} className="hover:text-[#E8A020]">{p.name}</Link></td>
                  <td className="p-3 text-xs text-[#A19D94]">{p.status || "—"}</td>
                  <td className="p-3 text-right text-[#F0EDE8]">{fGBP(p.invoiced)}</td>
                  <td className="p-3 text-right text-[#68D391]">{fGBP(p.received)}</td>
                  <td className="p-3 text-right text-[#E8A020]">{fGBP(p.invoiced - p.received)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------- Page shell ----------------

export default function FinanceHubV2() {
  const [tab, setTab] = useState("dashboard");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await loadFinanceHubData();
      setData(d);
    } catch (e) {
      setError(e.message || "Failed to load Finance Hub");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="hub-finance">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Hub</div>
            <h1 className="font-display text-4xl sm:text-5xl text-[#F0EDE8]">Finance</h1>
            <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">Your money in one place — invoices, tax, commercial docs and reports. All live from your Morris data.</p>
          </div>
          <button onClick={load} className="text-xs text-[#A19D94] hover:text-[#E8A020] transition flex items-center gap-1" data-testid="finance-refresh">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </header>

      <div className="flex gap-1 mb-6 border-b border-[#2a2620] overflow-x-auto" data-testid="finance-tabs">
        {TAB_IDS.map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            data-testid={`finance-tab-${id}`}
            className={`px-4 py-2 text-sm transition whitespace-nowrap ${tab === id ? "text-[#E8A020] border-b-2 border-[#E8A020] -mb-px" : "text-[#A19D94] hover:text-[#F0EDE8]"}`}
          >
            {TAB_LABELS[id]}
          </button>
        ))}
      </div>

      {loading && (
        <div className="card-dark p-10 text-center text-sm text-[#A19D94]" data-testid="finance-loading">Loading your finances...</div>
      )}
      {error && !loading && (
        <div className="card-dark p-6 text-sm text-[#F27C7C]" data-testid="finance-error">{error}</div>
      )}
      {data && !loading && !error && (
        <>
          {tab === "dashboard" && <DashboardTab d={data} />}
          {tab === "tax" && <TaxTab d={data} />}
          {tab === "commercial" && <CommercialTab d={data} />}
          {tab === "reports" && <ReportsTab d={data} />}
        </>
      )}
    </div>
  );
}
