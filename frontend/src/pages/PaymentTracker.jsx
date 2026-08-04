// Morris — Payment Tracker V2 (cash-flow dashboard)
// Redesigned per MORRIS V2 PAYMENT TRACKER DESIGN UPDATE:
//   • No pie chart. KPI cards + main payment table + project summary panel.
//   • Consumes Invoice Builder V2 as the single source of truth for money.
//   • Answers: Who owes me money? How much is overdue? What needs my attention today?

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  RefreshCw, Search, Bell, ExternalLink, CheckCircle2, Eye, X,
  PoundSterling, ChevronRight, Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";

const isoToday = () => new Date().toISOString().slice(0, 10);
const fGBP = (n) => `£${(Number(n) || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const daysBetween = (a, b) => {
  if (!a || !b) return null;
  const A = new Date(a); const B = new Date(b);
  return Math.round((A - B) / 86400000);
};

const inputClass = "w-full bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none";
const Label = ({ children }) => <label className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">{children}</label>;

const STATUS_BADGE = {
  Draft:       "border-[#2a2620] text-[#A19D94]",
  Sent:        "border-[#E8A020]/40 text-[#E8A020]",
  "Part Paid": "border-[#A0A0F0]/40 text-[#A0A0F0]",
  Paid:        "border-[#68D391]/40 text-[#68D391]",
  Overdue:     "border-[#F27C7C]/40 text-[#F27C7C]",
  Cancelled:   "border-[#706D66]/40 text-[#706D66]",
};

// Green/Amber/Red status tone helper for KPIs
function toneFor(kind, value) {
  if (kind === "overdue") return value > 0 ? "red" : "green";
  if (kind === "outstanding") return value > 5000 ? "amber" : value > 0 ? "amber" : "green";
  return "default";
}

export default function PaymentTracker() {
  const [invoices, setInvoices]   = useState([]);
  const [jobs, setJobs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [query, setQuery]         = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectSummary, setProjectSummary] = useState(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [iRes, jRes] = await Promise.allSettled([
        api.get("/invoice-builder/invoices"),
        api.get("/jobs"),
      ]);
      if (iRes.status === "fulfilled") setInvoices(iRes.value.data);
      if (jRes.status === "fulfilled") setJobs(jRes.value.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);

  // Load per-project summary panel (Contract + Variations + AFPs + Invoices + Paid + Outstanding)
  useEffect(() => {
    if (!selectedProjectId) { setProjectSummary(null); return; }
    (async () => {
      try {
        const [jobStats, voSummary, afpSummary, projInv] = await Promise.allSettled([
          api.get(`/jobs/${selectedProjectId}/stats`),
          api.get(`/variation-orders/project/${selectedProjectId}/summary`),
          api.get(`/applications-for-payment/project/${selectedProjectId}/summary`),
          api.get(`/invoice-builder/invoices?projectId=${selectedProjectId}`),
        ]);
        setProjectSummary({
          projectId: selectedProjectId,
          jobStats: jobStats.status === "fulfilled" ? jobStats.value.data : null,
          voSummary: voSummary.status === "fulfilled" ? voSummary.value.data : null,
          afpSummary: afpSummary.status === "fulfilled" ? afpSummary.value.data : null,
          invoices: projInv.status === "fulfilled" ? projInv.value.data : [],
        });
      } catch { setProjectSummary(null); }
    })();
  }, [selectedProjectId]);

  // KPI computation
  const kpis = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString().slice(0, 10);
    const in7 = new Date(today); in7.setDate(today.getDate() + 7);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    let outstanding = 0, overdue = 0, dueThisWeek = 0, paidThisMonth = 0, overdueCount = 0;
    const paymentLags = [];
    invoices.forEach(inv => {
      const st = inv.status || "Draft";
      const total = (inv.totals || {}).totalDue || 0;
      const paid = inv.paidTotal || 0;
      const balance = inv.balance ?? Math.max(0, total - paid);
      const due = inv.dueDate || "";
      if (st !== "Paid" && st !== "Cancelled" && st !== "Draft") outstanding += balance;
      if (st === "Overdue") { overdue += balance; overdueCount++; }
      if (due && due >= todayIso && due <= in7.toISOString().slice(0, 10) && (st === "Sent" || st === "Part Paid")) dueThisWeek += balance;
      // "Paid this month" — sum of payments recorded in the current calendar month
      (inv.payments || []).forEach(p => {
        if (p.date && p.date >= monthStart) paidThisMonth += Number(p.amount) || 0;
      });
      // Average payment time = date of first payment - invoiceDate for fully paid invoices
      if (st === "Paid" && inv.invoiceDate && (inv.payments || []).length > 0) {
        const first = inv.payments.reduce((a, p) => (a && a < p.date ? a : p.date), null);
        const lag = daysBetween(first, inv.invoiceDate);
        if (lag != null && lag >= 0) paymentLags.push(lag);
      }
    });
    const avgLag = paymentLags.length > 0 ? Math.round(paymentLags.reduce((a, b) => a + b, 0) / paymentLags.length) : null;
    return { outstanding, overdue, dueThisWeek, paidThisMonth, overdueCount, avgLag, totalOutstandingCount: invoices.filter(x => (x.status === "Sent" || x.status === "Part Paid" || x.status === "Overdue")).length };
  }, [invoices]);

  const filtered = useMemo(() => {
    const s = (query || "").trim().toLowerCase();
    return invoices.filter(inv => {
      if (inv.status === "Cancelled" || inv.status === "Draft") return false;
      if (s) {
        const hay = `${inv.invoiceRef || ""} ${inv.projectName || ""} ${inv.clientName || ""} ${inv.clientCompany || ""} ${inv.poNumber || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (filterStatus && (inv.status || "Sent") !== filterStatus) return false;
      if (filterProject && inv.projectId !== filterProject) return false;
      return true;
    }).sort((a, b) => {
      // Overdue first, then earliest due date first
      const aOd = a.status === "Overdue" ? 0 : 1;
      const bOd = b.status === "Overdue" ? 0 : 1;
      if (aOd !== bOd) return aOd - bOd;
      return (a.dueDate || "") > (b.dueDate || "") ? 1 : -1;
    });
  }, [invoices, query, filterStatus, filterProject]);

  const markPaid = async (inv) => {
    try {
      const balance = inv.balance ?? ((inv.totals || {}).totalDue || 0) - (inv.paidTotal || 0);
      if (balance <= 0) return;
      await api.post(`/invoice-builder/invoices/${inv.id}/payment`, {
        amount: balance, date: isoToday(), method: "Payment Tracker quick-action",
      });
      toast.success("Marked as paid");
      await loadAll();
    } catch { toast.error("Failed"); }
  };
  const sendReminder = async (inv) => {
    try {
      await api.post(`/invoice-builder/invoices/${inv.id}/remind`);
      toast.success(`Reminder #${(inv.remindCount || 0) + 1} logged`);
      await loadAll();
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="payment-tracker-page">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Finance</div>
          <h1 className="font-display text-3xl sm:text-4xl text-[#F0EDE8]">Payment Tracker</h1>
          <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">Who owes you money — how much, and how overdue. Live cash-flow view across every invoice, with one-click chase and mark-as-paid.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={loadAll} className="text-xs text-[#A19D94] hover:text-[#E8A020] flex items-center gap-1" data-testid="pt-refresh"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh</button>
          <Link to="/app/invoice-builder" className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040]" data-testid="pt-open-invoices">Open Invoice Builder <ExternalLink size={12} /></Link>
        </div>
      </header>

      {/* KPI cards — Green / Amber / Red status */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard label="Total Outstanding" value={fGBP(kpis.outstanding)} tone={toneFor("outstanding", kpis.outstanding)} sub={`${kpis.totalOutstandingCount} invoice${kpis.totalOutstandingCount === 1 ? "" : "s"}`} testId="pt-kpi-outstanding" />
        <KpiCard label="Overdue" value={fGBP(kpis.overdue)} tone={toneFor("overdue", kpis.overdue)} sub={`${kpis.overdueCount} invoice${kpis.overdueCount === 1 ? "" : "s"}`} testId="pt-kpi-overdue" />
        <KpiCard label="Due This Week" value={fGBP(kpis.dueThisWeek)} tone={kpis.dueThisWeek > 0 ? "amber" : "green"} sub="Next 7 days" testId="pt-kpi-due-week" />
        <KpiCard label="Paid This Month" value={fGBP(kpis.paidThisMonth)} tone="green" sub="Calendar month to date" testId="pt-kpi-paid-month" />
        <KpiCard label="Outstanding Value" value={fGBP(kpis.outstanding)} tone={toneFor("outstanding", kpis.outstanding)} sub="Sum awaiting payment" testId="pt-kpi-outstanding-value" />
        <KpiCard label="Avg. Payment Time" value={kpis.avgLag != null ? `${kpis.avgLag} days` : "—"} tone={kpis.avgLag != null && kpis.avgLag <= 30 ? "green" : kpis.avgLag != null && kpis.avgLag <= 60 ? "amber" : "default"} sub="Invoice → payment" testId="pt-kpi-avg-time" />
      </div>

      {/* Filters */}
      <div className="card-dark p-4 mb-4" data-testid="pt-filters">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search invoice, client, project, PO…" className={`${inputClass} pl-9`} data-testid="pt-search" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={inputClass} data-testid="pt-filter-status">
            <option value="">All statuses</option>
            {["Sent", "Part Paid", "Overdue", "Paid"].map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className={inputClass} data-testid="pt-filter-project">
            <option value="">All projects</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.projectName || j.clientName}</option>)}
          </select>
        </div>
      </div>

      <div className={`grid gap-4 ${selectedProjectId ? "lg:grid-cols-[1fr_360px]" : ""}`}>
        {/* Main payment table */}
        <div className="min-w-0">
          {loading ? (
            <div className="card-dark p-8 text-center text-sm text-[#A19D94]">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="card-dark p-10 text-center" data-testid="pt-empty">
              <PoundSterling size={28} className="mx-auto text-[#E8A020] mb-3" />
              <div className="text-base text-[#F0EDE8]">{invoices.length === 0 ? "No invoices yet" : "No invoices match your filters"}</div>
              <p className="text-xs text-[#A19D94] mt-2 max-w-md mx-auto">Raise your first invoice from the Invoice Builder and it will appear here.</p>
              <Link to="/app/invoice-builder" className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium">Open Invoice Builder</Link>
            </div>
          ) : (
            <div className="card-dark overflow-hidden max-w-full" data-testid="pt-table">
              <div className="overflow-x-auto max-w-full">
                <table className="min-w-[720px] w-full text-sm">
                  <thead className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] bg-[#0f0d09]">
                    <tr>
                      <th className="text-left p-3">Client / Project</th>
                      <th className="text-left p-3">Invoice / Ref</th>
                      <th className="text-right p-3">Amount</th>
                      <th className="text-left p-3">Due</th>
                      <th className="text-right p-3">Days</th>
                      <th className="text-left p-3">Status</th>
                      <th className="text-right p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(inv => {
                      const total = (inv.totals || {}).totalDue || 0;
                      const paid = inv.paidTotal || 0;
                      const balance = inv.balance ?? Math.max(0, total - paid);
                      // days = dueDate - today. Positive => days remaining, negative => days overdue.
                      const days = inv.dueDate ? daysBetween(inv.dueDate, isoToday()) : null;
                      const isOverdue = inv.status === "Overdue";
                      return (
                        <tr key={inv.id} className={`border-t border-[#1a1a1a] hover:bg-[#0f0d09] ${isOverdue ? "bg-[#1a0e0e]/40" : ""}`} data-testid={`pt-row-${inv.id}`}>
                          <td className="p-3">
                            <button onClick={() => setSelectedProjectId(inv.projectId || "")} className="text-left group" disabled={!inv.projectId}>
                              <div className="text-[#F0EDE8] group-hover:text-[#E8A020] truncate max-w-[240px]">{inv.clientCompany || inv.clientName || "—"}</div>
                              <div className="text-[11px] text-[#A19D94] truncate max-w-[240px]">{inv.projectName || "—"}</div>
                            </button>
                          </td>
                          <td className="p-3 text-[#F0EDE8]">{inv.invoiceRef || "—"}<div className="text-[11px] text-[#A19D94]">{inv.linkedApplicationRef ? `← ${inv.linkedApplicationRef}` : ""}</div></td>
                          <td className="p-3 text-right">
                            <div className="text-[#F0EDE8]">{fGBP(total)}</div>
                            {paid > 0 && paid < total && <div className="text-[11px] text-[#A0A0F0]">Paid {fGBP(paid)} · Bal {fGBP(balance)}</div>}
                          </td>
                          <td className="p-3 text-[#A19D94]">{inv.dueDate || "—"}</td>
                          <td className="p-3 text-right">
                            {days == null ? "—" : days < 0 ? (
                              <span className="text-[#F27C7C]">{Math.abs(days)}d over</span>
                            ) : days === 0 ? (
                              <span className="text-[#E8A020]">Today</span>
                            ) : (
                              <span className="text-[#A19D94]">{days}d</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_BADGE[inv.status] || STATUS_BADGE.Draft}`}>{inv.status || "Sent"}</span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1 justify-end">
                              <Link to={`/app/invoice-builder?open=${inv.id}`} className="p-1.5 text-[#A19D94] hover:text-[#E8A020]" title="View" data-testid={`pt-view-${inv.id}`}><Eye size={13} /></Link>
                              {inv.projectId && <Link to={`/app/jobs/${inv.projectId}`} className="p-1.5 text-[#A19D94] hover:text-[#E8A020]" title="Open Project" data-testid={`pt-project-${inv.id}`}><Briefcase size={13} /></Link>}
                              {inv.status !== "Paid" && <button onClick={() => sendReminder(inv)} className="p-1.5 text-[#A19D94] hover:text-[#F27C7C]" title="Send Reminder" data-testid={`pt-remind-${inv.id}`}><Bell size={13} /></button>}
                              {inv.status !== "Paid" && balance > 0 && <button onClick={() => markPaid(inv)} className="p-1.5 text-[#A19D94] hover:text-[#68D391]" title="Mark as Paid" data-testid={`pt-paid-${inv.id}`}><CheckCircle2 size={13} /></button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Project Summary panel */}
        {selectedProjectId && (
          <ProjectSummaryPanel
            summary={projectSummary}
            job={jobs.find(j => j.id === selectedProjectId)}
            onClose={() => { setSelectedProjectId(""); setProjectSummary(null); }}
          />
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, tone, sub, testId }) {
  const cls = tone === "red" ? "text-[#F27C7C]" : tone === "amber" ? "text-[#E8A020]" : tone === "green" ? "text-[#68D391]" : "text-[#F0EDE8]";
  return (
    <div className="card-dark p-4" data-testid={testId}>
      <Label>{label}</Label>
      <div className={`mt-2 font-display text-2xl ${cls}`}>{value}</div>
      {sub && <div className="text-[11px] text-[#A19D94] mt-1">{sub}</div>}
    </div>
  );
}

function ProjectSummaryPanel({ summary, job, onClose }) {
  if (!summary) return <div className="card-dark p-4 text-sm text-[#A19D94]">Loading project…</div>;
  const stats = summary.jobStats || {};
  const vo = summary.voSummary || {};
  const afp = summary.afpSummary || {};
  const invoices = summary.invoices || [];
  const invoicedTotal = invoices.reduce((a, i) => a + ((i.totals || {}).totalDue || 0), 0);
  const paidTotal = invoices.reduce((a, i) => a + (i.paidTotal || 0), 0);
  const outstanding = invoices.reduce((a, i) => a + (i.balance ?? 0), 0);
  return (
    <div className="card-dark p-4 h-fit" data-testid="pt-project-summary">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020]">Project</div>
          <h3 className="font-display text-lg text-[#F0EDE8] truncate max-w-[280px]">{job?.projectName || job?.clientName || "Project"}</h3>
        </div>
        <button onClick={onClose} className="text-[#A19D94] hover:text-[#F0EDE8]" data-testid="pt-project-close"><X size={16} /></button>
      </div>
      <div className="space-y-2">
        <Row label="Original contract" value={fGBP(stats.originalContractValue || job?.contractValue || 0)} />
        <Row label={`Approved variations (${vo.counts?.Approved || 0})`} value={fGBP(vo.approvedValue || 0)} tone="gold" />
        <Row label="Revised contract" value={fGBP(stats.revisedContractValue || 0)} bold />
        <div className="border-t border-[#1a1a1a] my-3" />
        <Row label={`Applications for Payment (${afp.previousApplications?.length || 0})`} value={fGBP(afp.previouslyCertifiedTotal || 0)} sub="Certified to date" />
        <Row label={`Invoices raised (${invoices.length})`} value={fGBP(invoicedTotal)} />
        <Row label="Payments received" value={fGBP(paidTotal)} tone="green" />
        <div className="border-t border-[#1a1a1a] my-3" />
        <Row label="Outstanding balance" value={fGBP(outstanding)} tone={outstanding > 0 ? "gold" : "green"} bold />
      </div>
      <div className="mt-4 space-y-1">
        <Link to={`/app/jobs/${summary.projectId}`} className="w-full flex items-center justify-between px-3 py-2 rounded-md border border-[#2a2620] text-sm text-[#F0EDE8] hover:border-[#E8A020]" data-testid="pt-open-project"><span>Open project workspace</span><ChevronRight size={14} /></Link>
        <Link to={`/app/invoice-builder?projectId=${summary.projectId}`} className="w-full flex items-center justify-between px-3 py-2 rounded-md border border-[#2a2620] text-sm text-[#F0EDE8] hover:border-[#E8A020]" data-testid="pt-open-invoices-project"><span>See all invoices for this project</span><ChevronRight size={14} /></Link>
      </div>
    </div>
  );
}

function Row({ label, value, sub, tone, bold }) {
  const cls = tone === "gold" ? "text-[#E8A020]" : tone === "green" ? "text-[#68D391]" : "text-[#F0EDE8]";
  return (
    <div className="flex items-start justify-between">
      <div className="text-xs text-[#A19D94]">
        {label}
        {sub && <div className="text-[10px] text-[#706D66]">{sub}</div>}
      </div>
      <div className={`text-sm ${cls} ${bold ? "font-medium" : ""}`}>{value}</div>
    </div>
  );
}
