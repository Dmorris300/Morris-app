// Morris Project Workspace — the "digital site folder".
// Replaces the previous JobDetail with a full 7-tab workspace:
//   Overview / Documents / Photos / Finance / Tasks / Timeline / Team
//
// Backend contract:
//   GET  /api/jobs/{id}           — project record + linked documents
//   GET  /api/jobs/{id}/stats     — counts + roll-up for the Overview dashboard
//   GET  /api/jobs/{id}/events    — timeline
//   GET  /api/jobs/{id}/tasks     — task board
//   POST /api/jobs/{id}/tasks     — create task
//   PATCH/DELETE /api/tasks/{id}  — task mutations
//   GET  /api/jobs/{id}/search?q= — project-scoped unified search
//   POST /api/jobs/{id}/payments  — record payment (fires timeline event)
//
// Full spec: /app/PROJECT_WORKSPACE_SPEC.md

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, FileText, Trash2, Images, Save, ClipboardList, Wallet, Calendar,
  Users, Activity, LayoutGrid, Search, Plus, Circle, CircleDot, CheckCircle2,
  Loader2, X, Sparkles, MapPin, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";

const STATUS_COLORS = {
  planning:         { label: "Planning",         fg: "#A19D94", bg: "rgba(240,237,232,0.05)", border: "rgba(240,237,232,0.2)" },
  active:           { label: "Active",           fg: "#5BC97A", bg: "rgba(91,201,122,0.06)",  border: "rgba(91,201,122,0.35)" },
  on_hold:          { label: "On hold",          fg: "#E8A020", bg: "rgba(232,160,32,0.06)",  border: "rgba(232,160,32,0.35)" },
  awaiting_payment: { label: "Awaiting payment", fg: "#E8A020", bg: "rgba(232,160,32,0.06)",  border: "rgba(232,160,32,0.35)" },
  invoiced:         { label: "Invoiced",         fg: "#E8A020", bg: "rgba(232,160,32,0.06)",  border: "rgba(232,160,32,0.35)" },
  paid:             { label: "Paid",             fg: "#5BC97A", bg: "rgba(91,201,122,0.06)",  border: "rgba(91,201,122,0.35)" },
  disputed:         { label: "Disputed",         fg: "#E5635A", bg: "rgba(229,99,90,0.06)",   border: "rgba(229,99,90,0.4)" },
  completed:        { label: "Completed",        fg: "#A19D94", bg: "rgba(240,237,232,0.05)", border: "rgba(240,237,232,0.2)" },
  archived:         { label: "Archived",         fg: "#706D66", bg: "rgba(112,109,102,0.05)", border: "rgba(112,109,102,0.2)" },
};
const ALL_STATUSES = Object.keys(STATUS_COLORS);

const TABS = [
  { id: "overview",  label: "Overview",  icon: LayoutGrid },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "photos",    label: "Photos",    icon: Images },
  { id: "finance",   label: "Finance",   icon: Wallet },
  { id: "tasks",     label: "Tasks",     icon: ClipboardList },
  { id: "timeline",  label: "Timeline",  icon: Activity },
  { id: "team",      label: "Team",      icon: Users },
];

const fGBP = (n) => `£${Number(n || 0).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
const ukDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB") : "");

// ---- Health calculation (matches spec) ----
function computeHealth(job, stats) {
  if (!job) return "healthy";
  const now = new Date();
  const remaining = job.expectedCompletion ? Math.ceil((new Date(job.expectedCompletion) - now) / 86400000) : null;
  const isActive = job.status === "active";
  if (stats?.recentActivity?.some((e) => e.kind === "chase_sent")) return "at_risk";
  if (isActive && remaining !== null && remaining < 0) return "at_risk";
  if (isActive && remaining !== null && remaining < 7) return "watch";
  return "healthy";
}
const HEALTH_STYLES = {
  healthy: { label: "Healthy",  fg: "#5BC97A" },
  watch:   { label: "Watch",    fg: "#E8A020" },
  at_risk: { label: "At risk",  fg: "#E5635A" },
};

export default function JobDetail() {
  const { jobId } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [job, setJob] = useState(null);
  const [docs, setDocs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const activeTab = params.get("tab") || "overview";

  const load = async () => {
    setLoading(true);
    try {
      const [jr, sr] = await Promise.all([
        api.get(`/jobs/${jobId}`),
        api.get(`/jobs/${jobId}/stats`).catch(() => ({ data: null })),
      ]);
      setJob(jr.data.job);
      setDocs(jr.data.documents || []);
      setStats(sr.data);
    } catch {
      toast.error("Could not load project");
      nav("/app/jobs");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [jobId]);

  const setTab = (tab) => setParams({ tab }, { replace: true });

  const setStatus = async (status) => {
    try {
      const r = await api.patch(`/jobs/${jobId}`, { status });
      setJob(r.data);
      toast.success(`Status: ${STATUS_COLORS[status]?.label || status}`);
      load();
    } catch { toast.error("Could not update status"); }
  };

  const onDelete = async () => {
    if (!window.confirm("Delete this project? All linked documents stay in your Vault but lose their project link.")) return;
    try {
      await api.delete(`/jobs/${jobId}`);
      toast.success("Project deleted");
      nav("/app/jobs");
    } catch { toast.error("Could not delete"); }
  };

  if (loading || !job) {
    return <div className="p-10 text-[#A19D94] inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading project…</div>;
  }

  const s = STATUS_COLORS[job.status] || STATUS_COLORS.active;
  const title = job.projectName || job.clientName;

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid="page-project-workspace">
      <Link to="/app/jobs" className="text-xs text-[#A19D94] hover:text-[#E8A020] flex items-center gap-1 mb-6" data-testid="workspace-back">
        <ArrowLeft size={12} /> Back to projects
      </Link>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#706D66] mb-2">{job.ref}</div>
          <h1 className="font-display text-4xl md:text-5xl text-[#F0EDE8]" data-testid="workspace-title">{title}</h1>
          {job.projectName && job.clientName && (
            <p className="text-sm text-[#A19D94] mt-1">Client: <span className="text-[#F0EDE8]">{job.clientName}</span>{job.company ? ` · ${job.company}` : ""}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to={`/app/photo-vault?jobId=${encodeURIComponent(job.id)}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs uppercase tracking-widest text-[#E8A020] border border-[#E8A020]/40 hover:bg-[#E8A020]/10"
            data-testid="workspace-view-photos"
          ><Images size={13} /> Photos</Link>
          <select
            value={job.status}
            onChange={(e) => setStatus(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-md bg-[#121212] border border-[#F0EDE8]/10 text-[#F0EDE8] focus:outline-none focus:border-[#E8A020]/50"
            data-testid="workspace-status"
            style={{ color: s.fg, borderColor: s.border }}
          >
            {ALL_STATUSES.map((k) => <option key={k} value={k}>{STATUS_COLORS[k].label}</option>)}
          </select>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-[#F0EDE8]/10 mb-6 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {TABS.map((t) => {
            const Icon = t.icon;
            const on = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-xs uppercase tracking-widest inline-flex items-center gap-1.5 border-b-2 transition ${on ? "border-[#E8A020] text-[#E8A020]" : "border-transparent text-[#A19D94] hover:text-[#F0EDE8]"}`}
                data-testid={`workspace-tab-${t.id}`}
              >
                <Icon size={12} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "overview"  && <Overview job={job} stats={stats} health={computeHealth(job, stats)} onDelete={onDelete} />}
      {activeTab === "documents" && <Documents docs={docs} jobId={jobId} />}
      {activeTab === "photos"    && <PhotosPane jobId={jobId} />}
      {activeTab === "finance"   && <Finance job={job} stats={stats} onRecordPayment={load} />}
      {activeTab === "tasks"     && <TasksBoard jobId={jobId} onChange={load} />}
      {activeTab === "timeline"  && <Timeline jobId={jobId} />}
      {activeTab === "team"      && <TeamPlaceholder />}
    </div>
  );
}

// ==================== OVERVIEW ====================

function Overview({ job, stats, health, onDelete }) {
  const h = HEALTH_STYLES[health];
  const contractValue = Number(job.contractValue || 0);
  const paid = Number(stats?.amountPaid || 0);
  const outstanding = Number(stats?.outstanding || 0);
  const daysLeft = job.expectedCompletion ? Math.ceil((new Date(job.expectedCompletion) - new Date()) / 86400000) : null;

  return (
    <div className="space-y-6" data-testid="workspace-overview">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="workspace-summary-tiles">
        <Tile label="Contract Value" value={fGBP(contractValue)} />
        <Tile label="Amount Paid" value={fGBP(paid)} sub={paid > 0 ? "recorded" : "none yet"} />
        <Tile label="Outstanding" value={fGBP(outstanding)} sub={outstanding > 0 ? "to invoice or chase" : "all clear"} />
        <Tile label="Days Remaining" value={daysLeft === null ? "—" : (daysLeft < 0 ? `${Math.abs(daysLeft)}d over` : `${daysLeft}d`)} sub={job.expectedCompletion ? `Due ${ukDate(job.expectedCompletion)}` : "No end date"} warn={daysLeft !== null && daysLeft < 0} />
      </div>

      {/* Health + stats chips */}
      <div className="card-dark p-4 flex flex-wrap items-center gap-3">
        <div className="text-xs text-[#706D66] uppercase tracking-widest">Project Health</div>
        <span className="text-sm font-medium" style={{ color: h.fg }} data-testid="workspace-health">● {h.label}</span>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-[#A19D94]">
          <Chip label="Documents" value={stats?.documents ?? "—"} />
          <Chip label="Photos" value={stats?.photos ?? "—"} />
          <Chip label="Videos" value={stats?.videos ?? "—"} />
          <Chip label="Open Tasks" value={stats?.openTasks ?? "—"} />
          <Chip label="Open Variations" value={stats?.openVariations ?? "—"} />
          <Chip label="Site Diaries" value={stats?.siteDiaries ?? "—"} />
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <DetailBlock title="Site & Contacts">
          <Row label="Site address" value={job.address} icon={<MapPin size={12} />} />
          <Row label="Site manager" value={job.siteManager} />
          <Row label="Client contact" value={job.clientContact} />
        </DetailBlock>
        <DetailBlock title="Contract">
          <Row label="Start" value={ukDate(job.startDate)} icon={<Calendar size={12} />} />
          <Row label="Expected completion" value={ukDate(job.expectedCompletion)} icon={<Calendar size={12} />} />
          <Row label="PO number" value={job.poNumber} />
        </DetailBlock>
      </div>

      {job.notes && (
        <DetailBlock title="Project Notes">
          <p className="text-sm text-[#F0EDE8] whitespace-pre-wrap">{job.notes}</p>
        </DetailBlock>
      )}

      {/* Latest activity */}
      {stats?.recentActivity?.length > 0 && (
        <DetailBlock title="Latest Activity">
          <ul className="space-y-2">
            {stats.recentActivity.map((e) => (
              <li key={e.id} className="text-xs text-[#A19D94]">
                <span className="text-[#F0EDE8]">{e.title}</span>{e.subtitle ? ` — ${e.subtitle}` : ""}
                <span className="ml-2 text-[#706D66]">· {new Date(e.createdAt).toLocaleDateString("en-GB")}</span>
              </li>
            ))}
          </ul>
        </DetailBlock>
      )}

      {/* Danger zone */}
      <div className="pt-4 border-t border-[#F0EDE8]/5 flex justify-end">
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-300 inline-flex items-center gap-1" data-testid="workspace-delete">
          <Trash2 size={12} /> Delete project
        </button>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, warn }) {
  return (
    <div className="card-dark p-4" data-testid={`tile-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="text-[10px] uppercase tracking-widest text-[#706D66] mb-1">{label}</div>
      <div className={`text-2xl font-display ${warn ? "text-[#E5635A]" : "text-[#F0EDE8]"}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#A19D94] mt-1">{sub}</div>}
    </div>
  );
}

function Chip({ label, value }) {
  return <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#0d0d0d] border border-[#F0EDE8]/5"><span className="text-[#706D66]">{label}</span> <span className="text-[#F0EDE8]">{value}</span></span>;
}

function DetailBlock({ title, children }) {
  return (
    <div className="card-dark p-4">
      <div className="text-[10px] uppercase tracking-widest text-[#E8A020] mb-3">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value, icon }) {
  return (
    <div className="flex items-start gap-2 py-1 text-xs">
      <span className="text-[#706D66] w-32 shrink-0 inline-flex items-center gap-1">{icon}{label}</span>
      <span className="text-[#F0EDE8] flex-1 min-w-0">{value || <span className="text-[#706D66]">—</span>}</span>
    </div>
  );
}

// ==================== DOCUMENTS ====================

function Documents({ docs, jobId }) {
  if (!docs.length) {
    return (
      <div className="card-dark p-6 text-center" data-testid="workspace-documents-empty">
        <FileText size={32} className="mx-auto mb-2 text-[#706D66] opacity-40" />
        <p className="text-sm text-[#F0EDE8]">No documents yet.</p>
        <p className="text-xs text-[#706D66] mt-1">Create one from the Tools Library — it&apos;ll auto-link to this project.</p>
        <Link to={`/app/tools-library`} className="inline-flex items-center gap-1 text-xs text-[#E8A020] mt-3 hover:text-[#F0B040]">Open Tools Library <ArrowRight size={12} /></Link>
      </div>
    );
  }
  return (
    <div className="divide-y divide-[#F0EDE8]/5 border border-[#F0EDE8]/5 rounded-md bg-[#0d0d0d]" data-testid="workspace-documents-list">
      {docs.map((d) => (
        <Link key={d.id} to={`/app/history?doc=${d.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-[#141414]" data-testid={`workspace-doc-${d.id}`}>
          <div className="min-w-0">
            <div className="text-sm text-[#F0EDE8] truncate">{d.title}</div>
            <div className="text-xs text-[#706D66]">{d.toolId} · {ukDate(d.createdAt)}</div>
          </div>
          <ArrowRight size={14} className="text-[#706D66]" />
        </Link>
      ))}
    </div>
  );
}

// ==================== PHOTOS ====================

function PhotosPane({ jobId }) {
  return (
    <div className="card-dark p-6 text-center" data-testid="workspace-photos-pane">
      <Images size={32} className="mx-auto mb-2 text-[#E8A020]" />
      <p className="text-sm text-[#F0EDE8] mb-3">Photos and videos for this project live in the Vault.</p>
      <Link to={`/app/photo-vault?jobId=${encodeURIComponent(jobId)}`} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-[#0a0a0a] text-sm font-medium hover:bg-[#F0B040]" data-testid="workspace-open-vault">
        Open Vault for this project <ArrowRight size={14} />
      </Link>
    </div>
  );
}

// ==================== FINANCE ====================

function Finance({ job, stats, onRecordPayment }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const record = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) { toast.error("Enter a positive amount"); return; }
    setSaving(true);
    try {
      await api.post(`/jobs/${job.id}/payments`, { amount: val, note });
      toast.success("Payment recorded");
      setAmount(""); setNote("");
      onRecordPayment();
    } catch { toast.error("Could not record payment"); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4" data-testid="workspace-finance">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Contract Value" value={fGBP(job.contractValue)} />
        <Tile label="Amount Paid" value={fGBP(stats?.amountPaid || 0)} />
        <Tile label="Outstanding" value={fGBP(stats?.outstanding || 0)} />
        <Tile label="Open Variations" value={stats?.openVariations ?? 0} />
      </div>

      <DetailBlock title="Record Payment">
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="Amount (£)"
            className="bg-[#121212] border border-[#F0EDE8]/10 text-sm rounded-md py-2 px-3 text-[#F0EDE8] sm:w-40" data-testid="finance-amount" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)"
            className="bg-[#121212] border border-[#F0EDE8]/10 text-sm rounded-md py-2 px-3 text-[#F0EDE8] flex-1" data-testid="finance-note" />
          <button onClick={record} disabled={saving} className="bg-[#E8A020] text-[#0a0a0a] rounded-md px-4 py-2 text-sm font-medium hover:bg-[#F0B040] disabled:opacity-50" data-testid="finance-record">
            {saving ? "Saving…" : "Record"}
          </button>
        </div>
      </DetailBlock>

      <DetailBlock title="Quick Actions">
        <div className="flex flex-wrap gap-2">
          <QuickBtn to={`/app/tool/cis-invoice?jobId=${job.id}`} label="Create Invoice" testId="finance-quick-invoice" />
          <QuickBtn to={`/app/tool/application-for-payment?jobId=${job.id}`} label="New Application" testId="finance-quick-application" />
          <QuickBtn to={`/app/payment-chaser?jobId=${job.id}`} label="Start Chase" testId="finance-quick-chase" />
          <QuickBtn to={`/app/tool/variation-letter?jobId=${job.id}`} label="New Variation" testId="finance-quick-variation" />
        </div>
      </DetailBlock>
    </div>
  );
}

function QuickBtn({ to, label, testId }) {
  return (
    <Link to={to} className="text-xs px-3 py-1.5 rounded border border-[#F0EDE8]/10 text-[#F0EDE8] hover:border-[#E8A020]/40 hover:text-[#E8A020]" data-testid={testId}>{label}</Link>
  );
}

// ==================== TASKS ====================

function TasksBoard({ jobId, onChange }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");

  const load = () => {
    setLoading(true);
    api.get(`/jobs/${jobId}/tasks`).then((r) => setTasks(r.data || [])).catch(() => setTasks([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [jobId]);

  const addTask = async (kind, presetTitle) => {
    const title = presetTitle || newTitle.trim();
    if (!title) return;
    try {
      await api.post(`/jobs/${jobId}/tasks`, { title, kind });
      setNewTitle("");
      load();
      onChange && onChange();
    } catch { toast.error("Could not add task"); }
  };

  const setStatus = async (task, status) => {
    try {
      await api.patch(`/tasks/${task.id}`, { status });
      load();
      onChange && onChange();
    } catch { toast.error("Update failed"); }
  };

  const remove = async (task) => {
    if (!window.confirm("Delete this task?")) return;
    try {
      await api.delete(`/tasks/${task.id}`);
      load();
      onChange && onChange();
    } catch { toast.error("Delete failed"); }
  };

  const by = useMemo(() => ({
    not_started: tasks.filter((t) => t.status === "not_started"),
    in_progress: tasks.filter((t) => t.status === "in_progress"),
    completed: tasks.filter((t) => t.status === "completed"),
  }), [tasks]);

  const PRESETS = [
    { kind: "site_diary", title: "Write today's site diary" },
    { kind: "upload_photos", title: "Upload site photos" },
    { kind: "generate_invoice", title: "Generate invoice" },
    { kind: "complete_snagging", title: "Complete snagging list" },
  ];

  return (
    <div className="space-y-4" data-testid="workspace-tasks">
      <div className="card-dark p-4">
        <div className="text-[10px] uppercase tracking-widest text-[#E8A020] mb-3">Add task</div>
        <div className="flex gap-2 mb-3">
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTask()} placeholder="What needs doing?"
            className="flex-1 bg-[#121212] border border-[#F0EDE8]/10 text-sm rounded-md py-2 px-3 text-[#F0EDE8]" data-testid="task-new-title" />
          <button onClick={() => addTask()} className="bg-[#E8A020] text-[#0a0a0a] rounded-md px-4 py-2 text-sm font-medium hover:bg-[#F0B040]" data-testid="task-add"><Plus size={14} /></button>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.kind} onClick={() => addTask(p.kind, p.title)} className="text-xs px-2.5 py-1 rounded border border-[#F0EDE8]/10 text-[#A19D94] hover:border-[#E8A020]/40 hover:text-[#E8A020]" data-testid={`task-preset-${p.kind}`}>+ {p.title}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-[#706D66] text-sm inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <TaskCol title="Not Started" icon={Circle} testId="col-not_started" tasks={by.not_started} setStatus={setStatus} remove={remove} nextStatus="in_progress" />
          <TaskCol title="In Progress" icon={CircleDot} testId="col-in_progress" tasks={by.in_progress} setStatus={setStatus} remove={remove} nextStatus="completed" />
          <TaskCol title="Completed" icon={CheckCircle2} testId="col-completed" tasks={by.completed} setStatus={setStatus} remove={remove} nextStatus={null} />
        </div>
      )}
    </div>
  );
}

function TaskCol({ title, icon: Icon, testId, tasks, setStatus, remove, nextStatus }) {
  return (
    <div className="card-dark p-3" data-testid={`workspace-tasks-${testId}`}>
      <div className="text-[10px] uppercase tracking-widest text-[#E8A020] mb-3 flex items-center gap-1.5"><Icon size={11} /> {title} <span className="text-[#706D66]">({tasks.length})</span></div>
      {tasks.length === 0 ? (
        <p className="text-xs text-[#706D66]">Nothing here.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="p-2 rounded border border-[#F0EDE8]/5 bg-[#0a0a0a]" data-testid={`task-${t.id}`}>
              <div className="text-xs text-[#F0EDE8] break-words">{t.title}</div>
              <div className="flex items-center justify-between gap-2 mt-2">
                {nextStatus ? (
                  <button onClick={() => setStatus(t, nextStatus)} className="text-[10px] text-[#E8A020] hover:text-[#F0B040] inline-flex items-center gap-1" data-testid={`task-advance-${t.id}`}>
                    Move → {nextStatus.replace("_", " ")} <ArrowRight size={10} />
                  </button>
                ) : (
                  <span className="text-[10px] text-[#5BC97A] inline-flex items-center gap-1"><CheckCircle2 size={10} /> Done</span>
                )}
                <button onClick={() => remove(t)} className="text-[10px] text-red-400 hover:text-red-300" data-testid={`task-delete-${t.id}`}><X size={11} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ==================== TIMELINE ====================

function Timeline({ jobId }) {
  const [events, setEvents] = useState(null);
  useEffect(() => {
    api.get(`/jobs/${jobId}/events`).then((r) => setEvents(r.data || [])).catch(() => setEvents([]));
  }, [jobId]);

  if (events === null) return <div className="py-8 text-[#706D66] text-sm"><Loader2 size={14} className="animate-spin inline mr-2" /> Loading…</div>;
  if (events.length === 0) {
    return (
      <div className="card-dark p-6 text-center" data-testid="workspace-timeline-empty">
        <Activity size={32} className="mx-auto mb-2 text-[#706D66] opacity-40" />
        <p className="text-sm text-[#F0EDE8]">No events yet.</p>
        <p className="text-xs text-[#706D66] mt-1">The timeline starts when you take your first action on this project.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-1 border-l-2 border-[#E8A020]/20 pl-4" data-testid="workspace-timeline">
      {events.map((e) => (
        <li key={e.id} className="py-2 relative" data-testid={`event-${e.kind}-${e.id}`}>
          <span className="absolute -left-[22px] top-3 w-3 h-3 rounded-full bg-[#0d0d0d] border-2 border-[#E8A020]" />
          <div className="text-sm text-[#F0EDE8]">{e.title}</div>
          {e.subtitle && <div className="text-xs text-[#A19D94]">{e.subtitle}</div>}
          <div className="text-[10px] text-[#706D66] mt-1">{new Date(e.createdAt).toLocaleString("en-GB")}</div>
        </li>
      ))}
    </ul>
  );
}

// ==================== TEAM (placeholder) ====================

function TeamPlaceholder() {
  return (
    <div className="card-dark p-8 text-center" data-testid="workspace-team">
      <Sparkles size={32} className="mx-auto mb-2 text-[#E8A020] opacity-60" />
      <p className="text-base text-[#F0EDE8]">Team collaboration coming soon.</p>
      <p className="text-xs text-[#A19D94] mt-2 max-w-md mx-auto">
        Invite colleagues, assign tasks, and share this workspace. We&apos;re building the foundation now — you&apos;ll see this tab light up in a future release.
      </p>
    </div>
  );
}
