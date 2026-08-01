// Morris Command Centre V2 — the daily workspace.
// Six sections, in this priority order:
//   1. Dynamic greeting
//   2. Attention Required (highest priority, from /api/attention)
//   3. Today's Work (continuation cards)
//   4. Business Snapshot (four compact metrics)
//   5. Quick Actions (curated 10)
//   6. Continue Working (mixed feed: projects + drafts + docs)
//   7. Recent Projects
//
// Full spec: /app/COMMAND_CENTRE_V2_SPEC.md

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { getToolById } from "../lib/tools-config";
import {
  AlertTriangle, ArrowRight, CheckCircle2, Clock, FileText, Hammer, Images,
  Briefcase, ClipboardList, HardHat, Receipt, Truck, Wallet, Loader2,
  MapPin,
} from "lucide-react";

// ---- Greeting helpers ----
function greeting(now = new Date()) {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "Morning";
  if (h >= 12 && h < 17) return "Afternoon";
  return "Evening";
}
// Deterministic sub-line based on the day of year so it changes daily but not per render.
const SUBLINES = {
  Morning: [
    "Here's what needs your attention today.",
    "Ready to get stuck in?",
    "Let's get today's work moving.",
    "Here's what's happening across your business today.",
  ],
  Afternoon: [
    "Here's what needs your attention today.",
    "How's the day going?",
    "Let's keep the momentum up.",
  ],
  Evening: [
    "Here's what needs your attention today.",
    "Time to wrap up the day.",
    "Here's what's still open.",
  ],
};
function subline(period, seed) {
  const list = SUBLINES[period];
  const idx = Math.abs(seed) % list.length;
  return list[idx];
}
function daySeed() {
  const d = new Date();
  return d.getFullYear() * 1000 + Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
}
function firstName(user) {
  if (user?.firstName) return user.firstName;
  if (user?.fullName) return user.fullName.split(" ")[0];
  return null;
}

const fGBP = (n) => `£${Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

// ---- Quick Actions (curated 10, spec-driven) ----
const QUICK_ACTIONS = [
  { id: "jobs",                  label: "Jobs",        icon: Briefcase,    to: "/app/jobs" },
  { id: "cis-invoice",           label: "Invoice",     icon: Receipt,      to: "/app/tool/cis-invoice" },
  { id: "quote-builder",         label: "Quote",       icon: FileText,     to: "/app/tool/quote-builder" },
  { id: "variation-letter",      label: "Variation",   icon: FileText,     to: "/app/tool/variation-letter" },
  { id: "rams",                  label: "RAMS",        icon: HardHat,      to: "/app/rams" },
  { id: "multiuser-site-diary",  label: "Site Diary",  icon: ClipboardList,to: "/app/multiuser-site-diary" },
  { id: "toolbox-talk",          label: "Toolbox",     icon: HardHat,      to: "/app/tool/toolbox-talk" },
  { id: "mileage",               label: "Mileage",     icon: Truck,        to: "/app/mileage" },
  { id: "commercial-report",     label: "Report",      icon: FileText,     to: "/app/commercial-report" },
  { id: "application-for-payment", label: "Application", icon: Receipt,    to: "/app/tool/application-for-payment" },
];

const SEVERITY_STYLES = {
  urgent:  { fg: "#E5635A", border: "rgba(229,99,90,0.4)",  bg: "rgba(229,99,90,0.05)",  dot: "#E5635A" },
  warning: { fg: "#E8A020", border: "rgba(232,160,32,0.4)", bg: "rgba(232,160,32,0.05)", dot: "#E8A020" },
  info:    { fg: "#A19D94", border: "rgba(240,237,232,0.12)", bg: "rgba(240,237,232,0.02)", dot: "#706D66" },
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [attention, setAttention] = useState(null);   // null = loading
  const [jobs, setJobs] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [docs, setDocs] = useState([]);
  const [mediaStats, setMediaStats] = useState({ total: 0 });

  // Load everything in parallel.
  useEffect(() => {
    api.get("/attention").then((r) => setAttention(r.data.items || [])).catch(() => setAttention([]));
    api.get("/jobs").then((r) => setJobs(r.data || [])).catch(() => setJobs([]));
    api.get("/drafts").then((r) => setDrafts(r.data || [])).catch(() => setDrafts([]));
    api.get("/documents").then((r) => setDocs(r.data || [])).catch(() => setDocs([]));
    api.get("/media/stats").then((r) => setMediaStats(r.data || { total: 0 })).catch(() => {});
  }, []);

  const period = greeting();
  const name = firstName(user);
  const sub = subline(period, daySeed());

  // ---- Business snapshot ----
  const invoicedJobs = jobs.filter((j) => j.status === "invoiced");
  const outstanding = invoicedJobs.reduce((a, j) => a + (Number(j.contractValue) || 0), 0);
  const activeJobs = jobs.filter((j) => j.status === "active").length;
  const openDocs = drafts.length + Math.max(0, (docs || []).length);

  // ---- Today's Work ----
  // Active jobs touched in the last 3 days + fresh drafts (last 7 days).
  const todayItems = useMemo(() => {
    const now = Date.now();
    const activeRecent = jobs
      .filter((j) => j.status === "active")
      .filter((j) => {
        const t = new Date(j.updatedAt || j.createdAt || 0).getTime();
        return t && (now - t) < 1000 * 60 * 60 * 24 * 3;
      })
      .slice(0, 4);
    const freshDrafts = drafts
      .filter((d) => {
        const t = new Date(d.updatedAt || 0).getTime();
        return t && (now - t) < 1000 * 60 * 60 * 24 * 7;
      })
      .slice(0, 4);
    return { activeRecent, freshDrafts };
  }, [jobs, drafts]);

  // ---- Continue Working (dedup mixed feed) ----
  const continueList = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const d of drafts.slice(0, 8)) {
      const key = `draft:${d.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const tool = getToolById(d.toolId);
      out.push({
        key, kind: "draft",
        title: d.toolName || tool?.name || d.toolId,
        subtitle: "Draft in progress",
        updatedAt: d.updatedAt,
        route: `/app/drafts`,
      });
    }
    for (const doc of (docs || []).slice(0, 8)) {
      const key = `doc:${doc.id || doc._id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        key, kind: "doc",
        title: doc.title || "Document",
        subtitle: doc.toolId ? `${getToolById(doc.toolId)?.name || doc.toolId}` : "Saved document",
        updatedAt: doc.createdAt || doc.updatedAt,
        route: `/app/history`,
      });
    }
    return out
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      .slice(0, 5);
  }, [drafts, docs]);

  // ---- Recent Projects ----
  const pinned = jobs.filter((j) => j.pinned);
  const active = jobs.filter((j) => j.status === "active" && !j.pinned).slice(0, 6);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="dashboard-page">

      {/* -------- Greeting -------- */}
      <header className="mb-10" data-testid="cc-greeting">
        <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl leading-tight text-[#F0EDE8]" data-testid="welcome-name">
          {name ? `${period}, ${name}.` : `Welcome back.`}
        </h1>
        <p className="text-[#A19D94] text-base mt-3" data-testid="cc-subline">{sub}</p>
      </header>

      {/* -------- 1. Attention Required -------- */}
      <Section title="Attention Required" testId="cc-attention">
        {attention === null ? (
          <div className="py-8 text-[#706D66] text-sm inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Working out what needs your eyes…</div>
        ) : attention.length === 0 ? (
          <div className="card-dark p-6 flex items-start gap-3" data-testid="cc-attention-empty">
            <CheckCircle2 size={22} className="text-[#5BC97A] shrink-0 mt-0.5" />
            <div>
              <div className="text-[#F0EDE8] text-base">Everything looks good today.</div>
              <div className="text-[#A19D94] text-sm mt-1">Enjoy the peace — or start something new below.</div>
            </div>
          </div>
        ) : (
          <div className="space-y-2" data-testid="cc-attention-list">
            {attention.slice(0, 8).map((it) => (
              <AttentionRow key={it.id} item={it} onOpen={() => navigate(it.actionRoute)} />
            ))}
            {attention.length > 8 && (
              <Link to="/app/attention" className="text-xs text-[#E8A020] hover:text-[#F0B040] inline-flex items-center gap-1 mt-2" data-testid="cc-attention-see-all">
                Show all {attention.length} attention items <ArrowRight size={12} />
              </Link>
            )}
          </div>
        )}
      </Section>

      {/* -------- 2. Today's Work -------- */}
      {(todayItems.activeRecent.length + todayItems.freshDrafts.length) > 0 && (
        <Section title="Today's Work" testId="cc-today">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="cc-today-grid">
            {todayItems.activeRecent.map((j) => (
              <TodayCard
                key={`job-${j.id}`}
                title={j.clientName || j.ref}
                subtitle={j.address ? j.address : "Active project"}
                actionLabel="Continue"
                onAction={() => navigate(`/app/jobs/${j.id}`)}
                testId={`cc-today-job-${j.id}`}
              />
            ))}
            {todayItems.freshDrafts.map((d) => (
              <TodayCard
                key={`draft-${d.id}`}
                title={d.toolName || d.toolId}
                subtitle={`Draft · updated ${timeAgo(d.updatedAt)}`}
                actionLabel="Resume"
                onAction={() => navigate(`/app/drafts`)}
                testId={`cc-today-draft-${d.id}`}
              />
            ))}
          </div>
        </Section>
      )}

      {/* -------- 3. Business Snapshot -------- */}
      <Section title="Business Snapshot" testId="cc-snapshot">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="cc-snapshot-grid">
          <SnapshotTile label="Outstanding" value={fGBP(outstanding)} sub={`${invoicedJobs.length} invoice${invoicedJobs.length === 1 ? "" : "s"}`} to="/app/finance" testId="cc-snap-outstanding" />
          <SnapshotTile label="Active Projects" value={activeJobs} sub="in progress" to="/app/jobs" testId="cc-snap-projects" />
          <SnapshotTile label="Open Documents" value={openDocs} sub="drafts + saved" to="/app/drafts" testId="cc-snap-docs" />
          <SnapshotTile label="Media Stored" value={mediaStats.total || 0} sub="photos & videos" to="/app/photo-vault" testId="cc-snap-media" />
        </div>
      </Section>

      {/* -------- 4. Quick Actions -------- */}
      <Section
        title="Quick Actions"
        testId="cc-quick"
        rightSlot={<Link to="/app/tools-library" className="text-xs text-[#E8A020] hover:text-[#F0B040] inline-flex items-center gap-1" data-testid="cc-see-all-tools">See all tools <ArrowRight size={12} /></Link>}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2" data-testid="cc-quick-grid">
          {QUICK_ACTIONS.map((qa) => {
            const Icon = qa.icon;
            return (
              <Link key={qa.id} to={qa.to} className="card-dark p-4 hover:border-[#E8A020]/40 transition flex flex-col items-center justify-center text-center gap-2 min-h-[92px]" data-testid={`cc-quick-${qa.id}`}>
                <Icon size={18} className="text-[#E8A020]" />
                <span className="text-xs text-[#F0EDE8]">{qa.label}</span>
              </Link>
            );
          })}
        </div>
      </Section>

      {/* -------- 5. Continue Working -------- */}
      {continueList.length > 0 && (
        <Section title="Continue Working" testId="cc-continue">
          <div className="divide-y divide-[#F0EDE8]/5 border border-[#F0EDE8]/5 rounded-md bg-[#0d0d0d]" data-testid="cc-continue-list">
            {continueList.map((c) => (
              <button
                key={c.key}
                onClick={() => navigate(c.route)}
                className="w-full flex items-center justify-between gap-3 p-3 hover:bg-[#141414] text-left"
                data-testid={`cc-continue-${c.key.replace(/[^a-z0-9-]/gi, "")}`}
              >
                <div className="min-w-0">
                  <div className="text-sm text-[#F0EDE8] truncate">{c.title}</div>
                  <div className="text-xs text-[#706D66]">{c.subtitle} · {timeAgo(c.updatedAt)}</div>
                </div>
                <ArrowRight size={14} className="text-[#706D66]" />
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* -------- 6. Recent Projects -------- */}
      {(pinned.length + active.length) > 0 && (
        <Section title="Recent Projects" testId="cc-projects" rightSlot={<Link to="/app/jobs" className="text-xs text-[#E8A020] hover:text-[#F0B040] inline-flex items-center gap-1" data-testid="cc-projects-see-all">All projects <ArrowRight size={12} /></Link>}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="cc-projects-grid">
            {pinned.map((j) => <ProjectCard key={j.id} job={j} pinned />)}
            {active.map((j) => <ProjectCard key={j.id} job={j} />)}
          </div>
        </Section>
      )}
    </div>
  );
}

// ---- Sub-components ----

function Section({ title, children, testId, rightSlot }) {
  return (
    <section className="mb-10" data-testid={testId}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020]">{title}</h2>
        {rightSlot}
      </div>
      {children}
    </section>
  );
}

function AttentionRow({ item, onOpen }) {
  const s = SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.info;
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-md border"
      style={{ borderColor: s.border, background: s.bg }}
      data-testid={`cc-attention-item-${item.kind}-${item.projectId || "none"}`}
    >
      <span className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ background: s.dot }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[#F0EDE8]">{item.title}</div>
        {item.subtitle && <div className="text-xs text-[#A19D94] mt-0.5 truncate">{item.subtitle}</div>}
      </div>
      <button
        onClick={onOpen}
        className="text-xs px-3 py-1.5 rounded border hover:bg-[#141414] shrink-0"
        style={{ color: s.fg, borderColor: s.border }}
        data-testid={`cc-attention-action-${item.kind}-${item.projectId || "none"}`}
      >
        {item.actionLabel}
      </button>
    </div>
  );
}

function TodayCard({ title, subtitle, actionLabel, onAction, testId }) {
  return (
    <div className="card-dark p-4" data-testid={testId}>
      <div className="text-sm text-[#F0EDE8] font-medium truncate">{title}</div>
      <div className="text-xs text-[#A19D94] mt-1 truncate">{subtitle}</div>
      <button onClick={onAction} className="mt-3 text-xs text-[#E8A020] inline-flex items-center gap-1 hover:text-[#F0B040]">
        {actionLabel} <ArrowRight size={12} />
      </button>
    </div>
  );
}

function SnapshotTile({ label, value, sub, to, testId }) {
  return (
    <Link to={to} className="card-dark p-4 hover:border-[#E8A020]/40 transition block" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-widest text-[#706D66] mb-1">{label}</div>
      <div className="text-2xl text-[#F0EDE8] font-display">{value}</div>
      {sub && <div className="text-[10px] text-[#A19D94] mt-1">{sub}</div>}
    </Link>
  );
}

function ProjectCard({ job, pinned }) {
  const s = STATUS_COLORS[job.status] || STATUS_COLORS.active;
  return (
    <Link to={`/app/jobs/${job.id}`} className="card-dark p-4 hover:border-[#E8A020]/40 transition block" data-testid={`cc-project-${job.id}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[9px] uppercase tracking-[0.2em] text-[#706D66]">{job.ref || (pinned ? "Pinned" : "")}</span>
        <span className="text-[9px] uppercase tracking-[0.2em] px-2 py-0.5 rounded-full" style={{ color: s.fg, background: s.bg, border: `1px solid ${s.border}` }}>{job.status}</span>
      </div>
      <div className="text-sm text-[#F0EDE8] font-medium truncate">{job.clientName}</div>
      {job.address && <div className="text-xs text-[#A19D94] mt-1 truncate flex items-center gap-1"><MapPin size={10} /> {job.address}</div>}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#1a1a1a] text-xs">
        <span className="text-[#706D66]">{job.contractValue ? fGBP(job.contractValue) : "—"}</span>
        <span className="ml-auto text-[#706D66] inline-flex items-center gap-2">
          <Link to={`/app/photo-vault?jobId=${encodeURIComponent(job.id)}`} onClick={(e) => e.stopPropagation()} className="hover:text-[#E8A020] inline-flex items-center gap-1" data-testid={`cc-project-photos-${job.id}`}><Images size={11} /> Photos</Link>
        </span>
      </div>
    </Link>
  );
}

const STATUS_COLORS = {
  active:   { fg: "#5BC97A", bg: "rgba(91,201,122,0.06)", border: "rgba(91,201,122,0.35)" },
  invoiced: { fg: "#E8A020", bg: "rgba(232,160,32,0.06)", border: "rgba(232,160,32,0.35)" },
  disputed: { fg: "#E5635A", bg: "rgba(229,99,90,0.06)",  border: "rgba(229,99,90,0.4)" },
  paid:     { fg: "#A19D94", bg: "rgba(240,237,232,0.05)", border: "rgba(240,237,232,0.15)" },
};

function timeAgo(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!t) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
