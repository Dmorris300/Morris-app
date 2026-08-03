// Morris — Business Hub V2
// Business overview, not project overview. Live counts, pipeline, team, KPIs.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Briefcase, TrendingUp, Users, PlayCircle, Flag, Wallet, FileText,
  Calendar, ShoppingCart, ArrowRight, RefreshCw, Archive, Award,
  CheckCircle2, AlertTriangle, PieChart, UserPlus,
} from "lucide-react";
import api from "../lib/api";
import { getToolData } from "../lib/tool-persistence";
import { fGBP } from "../lib/finance";

const TABS = ["overview", "projects", "team", "insights"];
const TAB_LABELS = { overview: "Overview", projects: "Projects", team: "Team", insights: "Insights" };

const N = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoDaysFromNow = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const ukDate = (iso) => {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

const ACTIVE_STATUSES = new Set(["planning", "active", "awaiting_payment", "invoiced", "on_hold"]);
const COMPLETED_STATUSES = new Set(["completed", "paid"]);
const ARCHIVED_STATUSES = new Set(["archived"]);
const AT_RISK_STATUSES = new Set(["on_hold", "disputed"]);

// ---------------- Business data aggregator ----------------

async function loadBusinessData() {
  const [jobsRes, docsRes, teamRes] = await Promise.allSettled([
    api.get("/jobs"), api.get("/documents"), api.get("/team/members"),
  ]);
  const jobs = jobsRes.status === "fulfilled" && Array.isArray(jobsRes.value.data) ? jobsRes.value.data : [];
  const docs = docsRes.status === "fulfilled" && Array.isArray(docsRes.value.data) ? docsRes.value.data : [];
  const team = teamRes.status === "fulfilled" ? teamRes.value.data : { members: [], pendingInvites: [], seats: { used: 0, limit: 0 }, plan: null };

  const today = isoToday();
  const in7 = isoDaysFromNow(7);

  const active = [];
  const completed = [];
  const archived = [];
  const atRisk = [];
  const startingThisWeek = [];
  const finishingThisWeek = [];
  let pipelineValue = 0;

  for (const j of jobs) {
    const status = (j.status || "").toLowerCase();
    if (ACTIVE_STATUSES.has(status)) {
      active.push(j);
      pipelineValue += N(j.contractValue);
    }
    if (COMPLETED_STATUSES.has(status)) completed.push(j);
    if (ARCHIVED_STATUSES.has(status)) archived.push(j);
    if (AT_RISK_STATUSES.has(status)) atRisk.push(j);
    if (j.startDate && j.startDate >= today && j.startDate <= in7) startingThisWeek.push(j);
    if (j.expectedCompletion && j.expectedCompletion >= today && j.expectedCompletion <= in7) finishingThisWeek.push(j);
  }

  // Document counts
  const docCounts = {};
  for (const d of docs) {
    const t = d.toolId || d.type || "other";
    docCounts[t] = (docCounts[t] || 0) + 1;
  }

  // Payment tracker rows for revenue this month
  const invoiceRows = getToolData("payment-tracker", []) || [];
  const monthPrefix = today.slice(0, 7);
  let revenueThisMonth = 0;
  let outstandingWorkValue = 0;
  for (const r of invoiceRows) {
    if ((r.dateReceived || "").startsWith(monthPrefix)) revenueThisMonth += N(r.amountReceived);
    const remaining = Math.max(0, N(r.invoiceAmount) - N(r.amountReceived));
    if (remaining > 0) outstandingWorkValue += remaining;
  }

  // Outstanding quotes = quote-builder docs not linked to an invoice (rough proxy: latest 30 days)
  const thirtyAgo = isoDaysFromNow(-30);
  const outstandingQuotes = docs.filter((d) => (d.toolId === "quote-builder") && (d.createdAt || "") >= thirtyAgo).length;
  const outstandingVariations = docs.filter((d) => (d.toolId === "variation-letter") && (d.createdAt || "") >= thirtyAgo).length;
  const purchaseOrders = docs.filter((d) => (d.toolId === "purchase-order")).length;

  // Revenue history (12 months) from Payment Tracker
  const revenueByMonth = {};
  for (const r of invoiceRows) {
    const ym = (r.dateReceived || "").slice(0, 7);
    if (ym) revenueByMonth[ym] = (revenueByMonth[ym] || 0) + N(r.amountReceived);
  }
  const growth = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    growth.push({ ym, revenue: revenueByMonth[ym] || 0 });
  }

  // Completion rate: completed / (completed + active)
  const totalTracked = completed.length + active.length;
  const completionRate = totalTracked > 0 ? Math.round((completed.length / totalTracked) * 100) : 0;

  // Contract value on active work
  const activeContractValue = active.reduce((s, j) => s + N(j.contractValue), 0);

  return {
    jobs, docs, docCounts, team,
    active, completed, archived, atRisk,
    startingThisWeek, finishingThisWeek,
    pipelineValue, activeContractValue, outstandingWorkValue,
    revenueThisMonth, growth,
    completionRate,
    outstandingQuotes, outstandingVariations, purchaseOrders,
  };
}

// ---------------- Shared cards ----------------

function KpiCard({ label, value, sub, icon: Icon, to, tone, testId }) {
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

// Growth summary table (last 12 months). Replaces the previous SVG line
// chart per Morris Global Design Standard (No Charts).
function GrowthSummary({ data }) {
  if (!data || data.length === 0) return null;
  const monthLabel = (ym) => {
    if (!ym || !ym.includes("-")) return ym;
    const [y, m] = ym.split("-");
    const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${names[parseInt(m, 10) - 1]} ${y.slice(2)}`;
  };
  const total = data.reduce((s, x) => s + (x.revenue || 0), 0);
  const avg = total / data.length;
  const best = data.reduce((b, x) => (x.revenue || 0) > (b?.revenue || 0) ? x : b, data[0]);
  const latest = data[data.length - 1] || {};
  const prev = data[data.length - 2] || {};
  const mom = prev.revenue > 0 ? Math.round((((latest.revenue || 0) - prev.revenue) / prev.revenue) * 100) : null;
  const rowsPerCol = Math.ceil(data.length / 2);
  const cols = [data.slice(0, rowsPerCol), data.slice(rowsPerCol)];
  return (
    <div className="card-dark p-5" data-testid="business-growth-summary">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">Business growth — last 12 months</div>
        <div className="text-[11px] text-[#A19D94]">Total {fGBP(total)} · Avg {fGBP(Math.round(avg))} / month</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="rounded-md border border-[#2a2620] p-3">
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#706D66]">Latest month</div>
          <div className="text-lg text-[#F0EDE8] mt-1">{fGBP(latest.revenue || 0)}</div>
          <div className="text-[11px] text-[#A19D94] mt-0.5">{monthLabel(latest.ym)} {mom !== null && <span className={mom >= 0 ? "text-[#68D391]" : "text-[#F27C7C]"}>· {mom >= 0 ? "+" : ""}{mom}% vs prev</span>}</div>
        </div>
        <div className="rounded-md border border-[#2a2620] p-3">
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#706D66]">Best month</div>
          <div className="text-lg text-[#68D391] mt-1">{fGBP(best?.revenue || 0)}</div>
          <div className="text-[11px] text-[#A19D94] mt-0.5">{monthLabel(best?.ym)}</div>
        </div>
        <div className="rounded-md border border-[#2a2620] p-3">
          <div className="text-[10px] uppercase tracking-[0.15em] text-[#706D66]">Monthly average</div>
          <div className="text-lg text-[#F0EDE8] mt-1">{fGBP(Math.round(avg))}</div>
          <div className="text-[11px] text-[#A19D94] mt-0.5">Across {data.length} month{data.length === 1 ? "" : "s"}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {cols.map((col, ci) => (
          <table key={ci} className="w-full">
            <tbody>
              {col.map((d) => (
                <tr key={d.ym} className="border-b border-[#2a2620]/60 last:border-0">
                  <td className="py-1.5 text-[#A19D94] w-24">{monthLabel(d.ym)}</td>
                  <td className="py-1.5 text-right text-[#F0EDE8]">{fGBP(d.revenue || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </div>
  );
}

// ---------------- Overview tab ----------------

function OverviewTab({ d }) {
  return (
    <div data-testid="business-overview-tab">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Active projects" value={String(d.active.length)} sub={`${fGBP(d.activeContractValue)} on the books`} icon={Briefcase} tone="gold" to="/app/jobs" testId="kpi-active" />
        <KpiCard label="Completed" value={String(d.completed.length)} sub="All time" icon={CheckCircle2} tone="green" to="/app/jobs" testId="kpi-completed" />
        <KpiCard label="Starting this week" value={String(d.startingThisWeek.length)} sub={d.startingThisWeek.length === 0 ? "Nothing due" : "Get your kit ready"} icon={PlayCircle} testId="kpi-starting" />
        <KpiCard label="Finishing this week" value={String(d.finishingThisWeek.length)} sub={d.finishingThisWeek.length === 0 ? "No end dates hit" : "Wrap-up phase"} icon={Flag} testId="kpi-finishing" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
        <KpiCard label="Pipeline value" value={fGBP(d.pipelineValue)} sub="Contract value on active work" tone="gold" icon={TrendingUp} testId="kpi-pipeline" />
        <KpiCard label="Outstanding quotes" value={String(d.outstandingQuotes)} sub="Sent in last 30 days" icon={FileText} to="/app/history" testId="kpi-quotes" />
        <KpiCard label="Outstanding variations" value={String(d.outstandingVariations)} sub="Issued in last 30 days" icon={FileText} to="/app/history" testId="kpi-variations" />
        <KpiCard label="Purchase orders" value={String(d.purchaseOrders)} sub="Raised all time" icon={ShoppingCart} to="/app/history" testId="kpi-pos" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-6">
        <div className="card-dark p-5" data-testid="team-overview-card">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">Team overview</div>
            <Users size={14} className="text-[#706D66]" />
          </div>
          <div className="mt-3 font-display text-3xl text-[#F0EDE8]">{d.team?.members?.length || 0}</div>
          <div className="text-xs text-[#A19D94] mt-1">
            {d.team?.pendingInvites?.length || 0} pending invite{(d.team?.pendingInvites?.length || 0) === 1 ? "" : "s"} · {d.team?.seats?.used || 0}/{d.team?.seats?.limit ?? "—"} seats used
          </div>
          <Link to="/app/team" className="inline-flex items-center gap-1 text-xs text-[#E8A020] hover:underline mt-3">Manage team <ArrowRight size={12} /></Link>
        </div>
        <div className="card-dark p-5" data-testid="kpi-headline-card">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">Business KPIs</div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between text-[#F0EDE8]"><span>Completion rate</span><span>{d.completionRate}%</span></div>
            <div className="flex justify-between text-[#F0EDE8]"><span>Revenue this month</span><span>{fGBP(d.revenueThisMonth)}</span></div>
            <div className="flex justify-between text-[#F0EDE8]"><span>Outstanding work</span><span>{fGBP(d.outstandingWorkValue)}</span></div>
            <div className="flex justify-between text-[#F0EDE8]"><span>Active contracts</span><span>{d.active.length}</span></div>
            <div className="flex justify-between text-[#F0EDE8]"><span>At risk (on-hold / disputed)</span><span className={d.atRisk.length > 0 ? "text-[#F27C7C]" : ""}>{d.atRisk.length}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- Projects tab ----------------

function ProjectGroup({ title, jobs, tone, emptyText, testId }) {
  const t = tone === "red" ? "border-[#F27C7C]/30" : tone === "gold" ? "border-[#E8A020]/30" : "border-[#2a2620]";
  return (
    <div className="mb-6" data-testid={testId}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020]">{title}</div>
        <div className="text-xs text-[#A19D94]">{jobs.length} project{jobs.length === 1 ? "" : "s"}</div>
      </div>
      {jobs.length === 0 ? (
        <div className={`card-dark p-6 text-sm text-[#A19D94] text-center border ${t}`}>{emptyText}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {jobs.map((j) => (
            <Link key={j.id} to={`/app/jobs/${j.id}`} className="card-dark p-4 hover:border-[#E8A020]/40 transition block" data-testid={`project-card-${j.id}`}>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#706D66]">{j.ref || "JOB"}</div>
              <div className="text-sm text-[#F0EDE8] font-medium mt-1 truncate">{j.projectName || j.clientName || "Unnamed"}</div>
              {j.address && <div className="text-xs text-[#A19D94] mt-1 truncate">{j.address}</div>}
              <div className="text-xs text-[#A19D94] mt-2 flex items-center gap-3">
                <span className="capitalize">{(j.status || "—").replace("_", " ")}</span>
                {j.contractValue > 0 && <span>{fGBP(j.contractValue)}</span>}
              </div>
              {(j.startDate || j.expectedCompletion) && (
                <div className="text-[10px] text-[#706D66] mt-2 flex items-center gap-1">
                  <Calendar size={10} />
                  {j.startDate && <span>{ukDate(j.startDate)}</span>}
                  {j.startDate && j.expectedCompletion && <span>→</span>}
                  {j.expectedCompletion && <span>{ukDate(j.expectedCompletion)}</span>}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectsTab({ d }) {
  return (
    <div data-testid="business-projects-tab">
      <div className="flex justify-end mb-4">
        <Link to="/app/jobs" className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040]">
          Open Job Tracker <ArrowRight size={14} />
        </Link>
      </div>
      <ProjectGroup title="Active" jobs={d.active} tone="gold" emptyText="No active projects yet — create one in the Job Tracker." testId="projects-active-group" />
      {d.atRisk.length > 0 && (
        <ProjectGroup title="At risk (on hold / disputed)" jobs={d.atRisk} tone="red" emptyText="" testId="projects-at-risk-group" />
      )}
      <ProjectGroup title="Completed" jobs={d.completed} tone="default" emptyText="Nothing completed yet." testId="projects-completed-group" />
      <ProjectGroup title="Archived" jobs={d.archived} tone="default" emptyText="Nothing archived." testId="projects-archived-group" />
    </div>
  );
}

// ---------------- Team tab ----------------

function TeamTab({ d }) {
  const team = d.team || { members: [], pendingInvites: [], seats: { used: 0, limit: 0 }, plan: null };
  const members = team.members || [];
  const invites = team.pendingInvites || [];
  return (
    <div data-testid="business-team-tab">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <KpiCard label="Team members" value={String(members.length)} sub={`Plan: ${team.plan || "—"}`} icon={Users} testId="team-kpi-members" />
        <KpiCard label="Seats used" value={`${team.seats?.used || 0} / ${team.seats?.limit ?? "—"}`} sub="Limit set by your plan" icon={Award} testId="team-kpi-seats" />
        <KpiCard label="Pending invites" value={String(invites.length)} sub={invites.length === 0 ? "Nothing outstanding" : "Waiting on acceptance"} icon={UserPlus} testId="team-kpi-invites" />
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020]">Members</div>
        <Link to="/app/team" className="inline-flex items-center gap-2 text-xs text-[#E8A020] hover:underline">
          Manage team <ArrowRight size={12} />
        </Link>
      </div>
      {members.length === 0 ? (
        <div className="card-dark p-8 text-center" data-testid="team-empty">
          <div className="mx-auto w-10 h-10 rounded-md bg-[#1e1a12] text-[#E8A020] flex items-center justify-center mb-3"><UserPlus size={16} /></div>
          <div className="text-base text-[#F0EDE8]">Nobody on your team yet</div>
          <div className="text-xs text-[#A19D94] mt-1">Invite your crew from Team Management.</div>
          <Link to="/app/team" className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium">
            <UserPlus size={14} /> Invite a team member
          </Link>
        </div>
      ) : (
        <div className="card-dark overflow-x-auto" data-testid="team-members-table">
          <table className="w-full text-sm">
            <thead className="text-[#A19D94] text-[10px] uppercase tracking-[0.2em]">
              <tr>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Role</th>
                <th className="text-left p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-[#2a2620]">
                  <td className="p-3 text-[#F0EDE8]">{m.fullName || m.username || "—"}</td>
                  <td className="p-3 text-[#A19D94] truncate max-w-[240px]">{m.email || "—"}</td>
                  <td className="p-3 text-xs text-[#F0EDE8] capitalize">{m.teamRole || "member"}</td>
                  <td className="p-3 text-xs">
                    {m.verified === false ? <span className="text-[#F27C7C]">Unverified</span> : <span className="text-[#68D391]">Active</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {invites.length > 0 && (
        <div className="mt-6">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Pending invites</div>
          <div className="space-y-2">
            {invites.map((inv, idx) => (
              <div key={inv.id || idx} className="card-dark p-3 flex justify-between items-center">
                <div>
                  <div className="text-sm text-[#F0EDE8]">{inv.email || inv.username || "Invited user"}</div>
                  <div className="text-xs text-[#A19D94]">Role: {inv.role || "member"} · Sent {ukDate((inv.sentAt || "").slice(0, 10))}</div>
                </div>
                <Link to="/app/team" className="text-xs text-[#E8A020] hover:underline">Manage</Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Insights tab ----------------

function InsightsTab({ d }) {
  const avgValue = d.active.length > 0 ? d.activeContractValue / d.active.length : 0;
  return (
    <div data-testid="business-insights-tab">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Completion rate" value={`${d.completionRate}%`} sub={`${d.completed.length} of ${d.completed.length + d.active.length} logged`} icon={PieChart} tone={d.completionRate >= 70 ? "green" : "gold"} testId="ins-completion" />
        <KpiCard label="Revenue this month" value={fGBP(d.revenueThisMonth)} sub="Cash received in current month" icon={TrendingUp} tone="green" testId="ins-revenue" />
        <KpiCard label="Outstanding work" value={fGBP(d.outstandingWorkValue)} sub="Unpaid balance on tracker" tone="gold" icon={Wallet} testId="ins-outstanding" />
        <KpiCard label="Active contracts" value={String(d.active.length)} sub={`Avg value ${fGBP(avgValue)}`} icon={Briefcase} testId="ins-contracts" />
      </div>

      <div className="mt-6">
        <GrowthSummary data={d.growth} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-6">
        <div className="card-dark p-5" data-testid="insight-signals">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">Business signals</div>
          <ul className="mt-3 space-y-2 text-sm text-[#F0EDE8]">
            {d.atRisk.length > 0 && <li className="flex items-start gap-2 text-[#F27C7C]"><AlertTriangle size={14} className="mt-0.5" /> {d.atRisk.length} project{d.atRisk.length === 1 ? "" : "s"} at risk (on-hold or disputed)</li>}
            {d.startingThisWeek.length > 0 && <li className="flex items-start gap-2"><PlayCircle size={14} className="mt-0.5 text-[#E8A020]" /> {d.startingThisWeek.length} project{d.startingThisWeek.length === 1 ? "" : "s"} start this week</li>}
            {d.finishingThisWeek.length > 0 && <li className="flex items-start gap-2"><Flag size={14} className="mt-0.5 text-[#E8A020]" /> {d.finishingThisWeek.length} project{d.finishingThisWeek.length === 1 ? "" : "s"} finish this week</li>}
            {d.outstandingWorkValue > 0 && <li className="flex items-start gap-2 text-[#E8A020]"><Wallet size={14} className="mt-0.5" /> {fGBP(d.outstandingWorkValue)} outstanding — consider chasing overdue invoices</li>}
            {d.completionRate >= 80 && <li className="flex items-start gap-2 text-[#68D391]"><CheckCircle2 size={14} className="mt-0.5" /> Strong completion rate ({d.completionRate}%)</li>}
            {d.completionRate === 0 && d.completed.length === 0 && d.active.length === 0 && <li className="flex items-start gap-2 text-[#A19D94]"><Briefcase size={14} className="mt-0.5" /> No projects yet — create one in the Job Tracker.</li>}
          </ul>
        </div>
        <div className="card-dark p-5" data-testid="insight-quick-actions">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">Quick actions</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link to="/app/jobs" className="text-xs text-[#F0EDE8] hover:text-[#E8A020] transition py-2 px-3 rounded-md bg-[#1e1a12]">New project</Link>
            <Link to="/app/tool/quote-builder" className="text-xs text-[#F0EDE8] hover:text-[#E8A020] transition py-2 px-3 rounded-md bg-[#1e1a12]">Send a quote</Link>
            <Link to="/app/tool/purchase-order" className="text-xs text-[#F0EDE8] hover:text-[#E8A020] transition py-2 px-3 rounded-md bg-[#1e1a12]">Raise PO</Link>
            <Link to="/app/team" className="text-xs text-[#F0EDE8] hover:text-[#E8A020] transition py-2 px-3 rounded-md bg-[#1e1a12]">Invite team</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- Shell ----------------

export default function BusinessHubV2() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const d = await loadBusinessData();
      setData(d);
    } catch (e) {
      setError(e.message || "Failed to load Business Hub");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="hub-business">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Hub</div>
            <h1 className="font-display text-4xl sm:text-5xl text-[#F0EDE8]">Business</h1>
            <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">Your business at a glance — projects, team, pipeline and KPIs. This isn&apos;t about any single job — it&apos;s how the whole operation is running.</p>
          </div>
          <button onClick={load} className="text-xs text-[#A19D94] hover:text-[#E8A020] transition flex items-center gap-1" data-testid="business-refresh">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </header>

      <div className="flex gap-1 mb-6 border-b border-[#2a2620] overflow-x-auto" data-testid="business-tabs">
        {TABS.map((id) => (
          <button key={id} onClick={() => setTab(id)} data-testid={`business-tab-${id}`}
            className={`px-4 py-2 text-sm transition whitespace-nowrap ${tab === id ? "text-[#E8A020] border-b-2 border-[#E8A020] -mb-px" : "text-[#A19D94] hover:text-[#F0EDE8]"}`}>
            {TAB_LABELS[id]}
          </button>
        ))}
      </div>

      {loading && <div className="card-dark p-10 text-center text-sm text-[#A19D94]" data-testid="business-loading">Loading your business...</div>}
      {error && !loading && <div className="card-dark p-6 text-sm text-[#F27C7C]" data-testid="business-error">{error}</div>}
      {data && !loading && !error && (
        <>
          {tab === "overview" && <OverviewTab d={data} />}
          {tab === "projects" && <ProjectsTab d={data} />}
          {tab === "team" && <TeamTab d={data} />}
          {tab === "insights" && <InsightsTab d={data} />}
        </>
      )}
    </div>
  );
}
