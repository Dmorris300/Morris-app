// Morris — Snagging Lists V2 (flagship defect & quality management system)
// Dashboard-first: 6 KPI cards + filters + per-project handover report.
// Focus on speed for on-site snag raising (mobile-first).

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus, Search, RefreshCw, Trash2, Edit2, X, ChevronLeft, ChevronRight,
  Camera, MessageSquare, CheckCircle2, RotateCcw, Copy, Star, Save,
  Download, AlertTriangle, UserPlus, ClipboardCheck, ShieldAlert, FileDown,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { downloadSnagPdf, snagPdfBlobUrl, downloadSnaggingReportPdf } from "../lib/snagging-pdf";
import LiveSignatureBlock from "../components/LiveSignatureBlock";

const DRAFT_KEY = "morris.tool_draft.snagging";

const inputClass = "w-full bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none";
const Label = ({ children }) => <label className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">{children}</label>;
const Field = ({ label, children, hint }) => (
  <div><Label>{label}</Label><div className="mt-1">{children}</div>{hint && <div className="text-[11px] text-[#706D66] mt-1">{hint}</div>}</div>
);

const PRI_CLASS = {
  Low: "border-[#68D391]/40 text-[#68D391]",
  Medium: "border-[#c8b464]/40 text-[#c8b464]",
  High: "border-[#E8A020]/40 text-[#E8A020]",
  Critical: "border-[#F27C7C]/40 text-[#F27C7C]",
};
const STATUS_CLASS = {
  Open: "border-[#2a2620] text-[#A19D94]",
  Assigned: "border-[#c8b464]/40 text-[#c8b464]",
  "In Progress": "border-[#E8A020]/40 text-[#E8A020]",
  "Awaiting Verification": "border-[#A0A0F0]/40 text-[#A0A0F0]",
  Closed: "border-[#68D391]/40 text-[#68D391]",
  Cancelled: "border-[#2a2620] text-[#706D66]",
};

const emptySnag = () => ({
  projectId: "", projectName: "", projectAddress: "",
  snagRef: "",
  title: "",
  description: "",
  location: "", area: "",
  trade: "General Builder", category: "Cosmetic / Finish",
  priority: "Medium", status: "Open",
  assignedTo: "", assignedEmail: "", assignedCompany: "",
  dueDate: "",
  photosBefore: [], photosAfter: [], supportingDocs: [],
});

function saveDraft(d) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ } }
function loadDraft() { try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }

export default function SnaggingList() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const openParamId = params.get("open") || "";
  const projectFilter = params.get("projectId") || "";
  const [snags, setSnags] = useState([]);
  const [stats, setStats] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [reference, setReference] = useState({ priorities: [], statuses: [], trades: [], categories: [], commonAreas: [] });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterProject, setFilterProject] = useState(projectFilter);
  const [filterAssigned, setFilterAssigned] = useState("");
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterMine, setFilterMine] = useState(false);
  const [editing, setEditing] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStartInVerify, setWizardStartInVerify] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [sRes, stRes, tRes, jRes, rRes] = await Promise.allSettled([
        api.get("/snagging/snags"),
        api.get("/snagging/stats"),
        api.get("/snagging/templates"),
        api.get("/jobs"),
        api.get("/snagging/reference"),
      ]);
      if (sRes.status === "fulfilled") setSnags(sRes.value.data);
      if (stRes.status === "fulfilled") setStats(stRes.value.data);
      if (tRes.status === "fulfilled") setTemplates(tRes.value.data);
      if (jRes.status === "fulfilled") setJobs(jRes.value.data);
      if (rRes.status === "fulfilled") setReference(rRes.value.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (openParamId && snags.length > 0 && !wizardOpen) {
      const s = snags.find(x => x.id === openParamId);
      if (s) openEdit(s);
    }
  }, [openParamId, snags]);

  const openNew = (fromTemplate = null) => {
    let base = emptySnag();
    if (fromTemplate) base = { ...base, ...(fromTemplate.payload || {}), id: undefined, status: "Open", snagRef: "" };
    else { const d = loadDraft(); if (d && !d.id) base = { ...base, ...d, id: undefined }; }
    if (filterProject && !base.projectId) {
      const j = jobs.find(x => x.id === filterProject);
      if (j) { base.projectId = j.id; base.projectName = j.projectName || j.clientName || ""; base.projectAddress = j.address || ""; }
    }
    setEditing(base); setWizardOpen(true);
  };
  const openEdit = async (s, opts = {}) => {
    try {
      const r = await api.get(`/snagging/snags/${s.id}`);
      setEditing({ ...emptySnag(), ...r.data });
    } catch { setEditing({ ...emptySnag(), ...s }); }
    setWizardStartInVerify(!!opts.startInVerify);
    setWizardOpen(true);
  };
  const duplicate = (s) => {
    const copy = { ...s }; delete copy.id; delete copy.createdAt; delete copy.updatedAt; delete copy._id;
    copy.snagRef = ""; copy.status = "Open"; copy.verifiedAt = ""; copy.closedAt = ""; copy.completionDate = "";
    copy.photosBefore = []; copy.photosAfter = []; copy.comments = []; copy.history = [];
    setEditing({ ...emptySnag(), ...copy }); setWizardOpen(true);
  };
  const del = async (s) => {
    if (!window.confirm(`Delete snag ${s.snagRef || s.title}?`)) return;
    try { await api.delete(`/snagging/snags/${s.id}`); toast.success("Deleted"); await loadAll(); }
    catch { toast.error("Delete failed"); }
  };
  const setStatus = async (s, status) => {
    try { await api.post(`/snagging/snags/${s.id}/status`, { status }); toast.success(`${status}`); await loadAll(); }
    catch { toast.error("Failed"); }
  };
  const verify = (s) => {
    // Row-level "Verify & close" opens the wizard on the target snag and
    // signals it to auto-open the verification modal. The modal captures
    // verifier name, completion date, notes, after-photo evidence and a
    // signature before the snag can be closed.
    openEdit(s, { startInVerify: true });
  };

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    return snags.filter(x => {
      if (s) {
        const hay = `${x.title || ""} ${x.description || ""} ${x.snagRef || ""} ${x.projectName || ""} ${x.area || ""} ${x.location || ""} ${x.assignedTo || ""} ${x.trade || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (filterStatus && (x.status || "Open") !== filterStatus) return false;
      if (filterPriority && (x.priority || "Medium") !== filterPriority) return false;
      if (filterProject && x.projectId !== filterProject) return false;
      if (filterAssigned && (x.assignedTo || "").toLowerCase() !== filterAssigned.toLowerCase()) return false;
      if (filterOverdue && !x.isOverdue) return false;
      if (filterMine) {
        const me = (user?.fullName || user?.username || "").toLowerCase();
        if ((x.assignedTo || "").toLowerCase() !== me) return false;
      }
      return true;
    });
  }, [snags, query, filterStatus, filterPriority, filterProject, filterAssigned, filterOverdue, filterMine, user]);

  const uniqueAssignees = useMemo(() => Array.from(new Set(snags.map(s => s.assignedTo).filter(Boolean))).sort(), [snags]);

  const generateProjectReport = async () => {
    if (!filterProject) return toast.error("Filter by a project first to generate its handover report");
    try {
      const r = await api.get(`/snagging/project/${filterProject}/summary`);
      const project = jobs.find(j => j.id === filterProject);
      downloadSnaggingReportPdf({
        project: { projectName: project?.projectName || project?.clientName || "Project", projectAddress: project?.address || "" },
        snags: r.data.snags || [],
        summary: r.data,
        user,
        today: new Date().toLocaleDateString("en-GB"),
      });
      toast.success("Snagging report generated");
    } catch (e) { toast.error(e?.response?.data?.detail || "Report failed"); }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="snagging-page">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Quality Control</div>
          <h1 className="font-display text-3xl sm:text-4xl text-[#F0EDE8]">Snagging Lists</h1>
          <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">Record, assign, verify and close every defect through to sign-off. Every action is timestamped and every photo is stored — so the handover pack builds itself.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={loadAll} className="text-xs text-[#A19D94] hover:text-[#E8A020] flex items-center gap-1" data-testid="snag-refresh"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh</button>
          <button onClick={generateProjectReport} disabled={!filterProject} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[#2a2620] text-sm text-[#F0EDE8] hover:border-[#E8A020] disabled:opacity-40" data-testid="snag-report-btn"><FileDown size={14} /> Project report</button>
          <button onClick={() => openNew()} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040]" data-testid="snag-new-btn"><Plus size={14} /> New Snag</button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Open snags" value={stats?.open ?? 0} tone="gold" testId="snag-stat-open" />
        <StatCard label="High / Critical" value={stats?.highPriority ?? 0} tone="red" icon={ShieldAlert} testId="snag-stat-high" />
        <StatCard label="Overdue" value={stats?.overdue ?? 0} tone="red" icon={AlertTriangle} testId="snag-stat-overdue" />
        <StatCard label="Closed today" value={stats?.closedToday ?? 0} tone="green" icon={CheckCircle2} testId="snag-stat-today" />
        <StatCard label="Assigned to me" value={stats?.assignedToMe ?? 0} tone="amber" icon={UserPlus} testId="snag-stat-mine" />
        <StatCard label="Closed total" value={stats?.closed ?? 0} tone="green" testId="snag-stat-closed" />
      </div>

      {templates.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Templates</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {templates.map(t => (
              <div key={t.id} className="card-dark p-3 flex items-start justify-between gap-2" data-testid={`snag-template-${t.id}`}>
                <button onClick={() => openNew(t)} className="text-left flex-1 min-w-0">
                  <div className="text-sm text-[#F0EDE8] truncate">{t.name}</div>
                  <div className="text-[11px] text-[#A19D94] truncate">Snag template</div>
                </button>
                <button onClick={async () => { if (!window.confirm("Delete template?")) return; try { await api.delete(`/snagging/templates/${t.id}`); setTemplates(templates.filter(x => x.id !== t.id)); } catch { toast.error("Failed"); } }} className="text-[#706D66] hover:text-[#F27C7C] p-1"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-dark p-4 mb-4" data-testid="snag-filters">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="relative md:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search snag ref, title, area, assignee…" className={`${inputClass} pl-9`} data-testid="snag-search" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={inputClass} data-testid="snag-filter-status">
            <option value="">All status</option>
            {(reference.statuses || []).map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className={inputClass} data-testid="snag-filter-priority">
            <option value="">All priority</option>
            {(reference.priorities || []).map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className={inputClass} data-testid="snag-filter-project">
            <option value="">All projects</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.projectName || j.clientName}</option>)}
          </select>
          <select value={filterAssigned} onChange={(e) => setFilterAssigned(e.target.value)} className={inputClass} data-testid="snag-filter-assignee">
            <option value="">All assignees</option>
            {uniqueAssignees.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3 mt-3 text-xs">
          <label className="inline-flex items-center gap-2 text-[#A19D94] cursor-pointer" data-testid="snag-filter-overdue-toggle"><input type="checkbox" checked={filterOverdue} onChange={(e) => setFilterOverdue(e.target.checked)} className="accent-[#E8A020]" /> Overdue only</label>
          <label className="inline-flex items-center gap-2 text-[#A19D94] cursor-pointer" data-testid="snag-filter-mine-toggle"><input type="checkbox" checked={filterMine} onChange={(e) => setFilterMine(e.target.checked)} className="accent-[#E8A020]" /> Assigned to me</label>
        </div>
      </div>

      {loading ? (
        <div className="card-dark p-8 text-center text-sm text-[#A19D94]">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card-dark p-10 text-center" data-testid="snag-empty">
          <ClipboardCheck size={28} className="mx-auto text-[#E8A020] mb-3" />
          <div className="text-base text-[#F0EDE8]">{snags.length === 0 ? "No snags raised yet" : "No snags match your filters"}</div>
          <p className="text-xs text-[#A19D94] mt-2 max-w-md mx-auto">Walk the site with your phone, snap a photo of every defect and raise it here. Assign it to the trade responsible and Morris keeps the audit trail so nothing slips through handover.</p>
          <button onClick={() => openNew()} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="snag-empty-new"><Plus size={14} /> Raise your first snag</button>
        </div>
      ) : (
        <div className="space-y-2">{filtered.map(s => <SnagRow key={s.id} s={s} onEdit={() => openEdit(s)} onDelete={() => del(s)} onDuplicate={() => duplicate(s)} onStatus={(x) => setStatus(s, x)} onVerify={() => verify(s)} />)}</div>
      )}

      {wizardOpen && editing && (
        <SnagWizard initial={editing} user={user} jobs={jobs} reference={reference}
          startInVerify={wizardStartInVerify}
          onClose={() => { setWizardOpen(false); setEditing(null); setWizardStartInVerify(false); }}
          onSaved={async () => { await loadAll(); setWizardOpen(false); setEditing(null); setWizardStartInVerify(false); }}
          onTemplatesChanged={setTemplates}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, tone, icon: Icon, testId }) {
  const t = tone === "red" ? "text-[#F27C7C]" : tone === "green" ? "text-[#68D391]" : tone === "gold" ? "text-[#E8A020]" : tone === "amber" ? "text-[#c8b464]" : "text-[#F0EDE8]";
  return (
    <div className="card-dark p-3" data-testid={testId}>
      <div className="flex items-center justify-between mb-1"><Label>{label}</Label>{Icon ? <Icon size={12} className="text-[#706D66]" /> : null}</div>
      <div className={`mt-1 font-display text-2xl ${t}`}>{value}</div>
    </div>
  );
}

function SnagRow({ s, onEdit, onDelete, onDuplicate, onStatus, onVerify }) {
  const status = s.status || "Open";
  const priority = s.priority || "Medium";
  const priCls = PRI_CLASS[priority] || PRI_CLASS.Medium;
  const stCls = STATUS_CLASS[status] || STATUS_CLASS.Open;
  return (
    <div className="card-dark p-4 flex items-start gap-3" data-testid={`snag-row-${s.id}`}>
      <div className={`w-1.5 self-stretch rounded-full ${priority === "Critical" ? "bg-[#F27C7C]" : priority === "High" ? "bg-[#E8A020]" : priority === "Low" ? "bg-[#68D391]" : "bg-[#c8b464]"}`} />
      <button onClick={onEdit} className="text-left flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base text-[#F0EDE8] font-medium truncate">{s.title || "Untitled snag"}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${priCls}`}>{priority}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${stCls}`}>{status}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#2a2620] text-[#A19D94]">{s.snagRef || "no ref"}</span>
          {s.isOverdue && <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#F27C7C]/40 text-[#F27C7C]">Overdue</span>}
          {(s.photosBeforeCount || 0) + (s.photosAfterCount || 0) > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#2a2620] text-[#A19D94]">📷 {(s.photosBeforeCount || 0) + (s.photosAfterCount || 0)}</span>}
        </div>
        <div className="text-xs text-[#A19D94] mt-1 truncate">
          {[s.projectName, s.area, s.location, s.assignedTo ? `→ ${s.assignedTo}` : ""].filter(Boolean).join(" · ") || "—"}
          {s.dueDate ? ` · Due ${s.dueDate}` : ""}
        </div>
      </button>
      <div className="flex gap-1 shrink-0">
        {(status === "Open" || status === "Assigned") && <button onClick={() => onStatus("In Progress")} className="p-2 text-[#A19D94] hover:text-[#E8A020]" title="Start work" data-testid={`snag-row-progress-${s.id}`}><RotateCcw size={14} /></button>}
        {status === "In Progress" && <button onClick={() => onStatus("Awaiting Verification")} className="p-2 text-[#A19D94] hover:text-[#A0A0F0]" title="Ready for verification" data-testid={`snag-row-await-${s.id}`}><ClipboardCheck size={14} /></button>}
        {status === "Awaiting Verification" && <button onClick={onVerify} className="p-2 text-[#A19D94] hover:text-[#68D391]" title="Verify & close" data-testid={`snag-row-verify-${s.id}`}><CheckCircle2 size={14} /></button>}
        <button onClick={onEdit} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`snag-row-edit-${s.id}`}><Edit2 size={14} /></button>
        <button onClick={onDuplicate} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`snag-row-dup-${s.id}`}><Copy size={14} /></button>
        <button onClick={onDelete} className="p-2 text-[#A19D94] hover:text-[#F27C7C]" data-testid={`snag-row-delete-${s.id}`}><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

// ================================================================
// WIZARD
// ================================================================
function SnagWizard({ initial, user, jobs, reference, startInVerify = false, onClose, onSaved, onTemplatesChanged }) {
  const [data, setData] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [commentText, setCommentText] = useState("");
  const [photoDraft, setPhotoDraft] = useState(null);
  const [verifyOpen, setVerifyOpen] = useState(false);

  // Auto-open the verification modal when the wizard is launched from the
  // row-level "Verify & close" action. Only fires when a persisted snag id
  // is available; otherwise the user has to save the snag first.
  useEffect(() => {
    if (startInVerify && data.id) setVerifyOpen(true);
  }, [startInVerify, data.id]);

  useEffect(() => { if (!data.id) { const t = setTimeout(() => saveDraft(data), 500); return () => clearTimeout(t); } }, [data]);

  const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));
  const pickProject = (id) => {
    const j = jobs.find(x => x.id === id); if (!j) return;
    setData(d => ({ ...d, projectId: j.id, projectName: j.projectName || j.clientName || d.projectName, projectAddress: j.address || d.projectAddress }));
  };

  const generatePreview = () => {
    try { setPreviewUrl(snagPdfBlobUrl({ data, user, today: new Date().toLocaleDateString("en-GB") })); }
    catch { toast.error("Preview failed"); }
  };

  const saveEntry = async ({ downloadAfter = true } = {}) => {
    if (!data.projectName && !data.projectId) { toast.error("Project is required"); return; }
    if (!data.title.trim()) { toast.error("Snag title is required"); return; }
    setSaving(true);
    try {
      let saved;
      const payload = { ...data };
      delete payload.isOverdue; delete payload.photosBeforeCount; delete payload.photosAfterCount; delete payload.commentsCount;
      delete payload.history; delete payload.comments;
      if (data.id) { const r = await api.patch(`/snagging/snags/${data.id}`, payload); saved = r.data; }
      else { const r = await api.post("/snagging/snags", payload); saved = r.data; }
      try {
        await api.post("/documents/save", {
          title: `Snag — ${data.title}`,
          toolId: "snagging", refNumber: saved.snagRef, jobId: data.projectId || null,
          content: `SNAG ${saved.snagRef}\n${saved.title}\nProject: ${saved.projectName || "—"}\nArea: ${saved.area || "—"}\nPriority: ${saved.priority}\nStatus: ${saved.status}\nAssigned: ${saved.assignedTo || "—"}\n\n${saved.description || ""}`,
          metadata: { ...saved },
        });
      } catch { /* soft-fail */ }
      if (downloadAfter) {
        downloadSnagPdf({ data: saved, user, today: new Date().toLocaleDateString("en-GB") });
      }
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      toast.success("Snag saved");
      setData({ ...data, ...saved });
      if (downloadAfter) onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  const addComment = async () => {
    if (!data.id) return toast.error("Save the snag first");
    if (!commentText.trim()) return;
    try {
      const r = await api.post(`/snagging/snags/${data.id}/comment`, { text: commentText });
      setData(d => ({ ...d, ...r.data }));
      setCommentText("");
    } catch { toast.error("Failed"); }
  };
  const addPhoto = async () => {
    if (!photoDraft) return;
    if (!data.id) { await saveEntry({ downloadAfter: false }); }
    const id = data.id;
    if (!id) return;
    try {
      const r = await api.post(`/snagging/snags/${id}/photos`, photoDraft);
      setData(d => ({ ...d, ...r.data }));
      setPhotoDraft(null);
      toast.success("Photo attached");
    } catch { toast.error("Failed"); }
  };
  const delPhoto = async (pid) => {
    if (!data.id) return;
    try { const r = await api.delete(`/snagging/snags/${data.id}/photos/${pid}`); setData(d => ({ ...d, ...r.data })); }
    catch { toast.error("Failed"); }
  };
  const changeStatus = async (status) => {
    if (!data.id) return toast.error("Save the snag first");
    try { const r = await api.post(`/snagging/snags/${data.id}/status`, { status }); setData(d => ({ ...d, ...r.data })); toast.success(status); }
    catch { toast.error("Failed"); }
  };
  const verifyAndClose = () => {
    if (!data.id) return toast.error("Save the snag first");
    setVerifyOpen(true);
  };
  const onVerified = (updated) => {
    setData(d => ({ ...d, ...updated }));
    setVerifyOpen(false);
    toast.success("Verified & closed");
  };

  const saveAsTemplate = async () => {
    if (!tplName.trim()) return toast.error("Template name required");
    try {
      const payload = { ...data, id: undefined, snagRef: undefined, status: "Open", photosBefore: [], photosAfter: [], comments: [], history: undefined };
      delete payload.isOverdue; delete payload.photosBeforeCount; delete payload.photosAfterCount;
      await api.post("/snagging/templates", { name: tplName.trim(), payload });
      toast.success("Template saved");
      setTplModalOpen(false); setTplName("");
      const lst = await api.get("/snagging/templates"); onTemplatesChanged(lst.data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const priCls = PRI_CLASS[data.priority || "Medium"];
  const stCls = STATUS_CLASS[data.status || "Open"];

  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-y-auto" data-testid="snag-wizard">
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-4xl mx-auto card-dark p-5 md:p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-1">{data.id ? `Edit ${data.snagRef || "Snag"}` : "New Snag"}</div>
              <h2 className="font-display text-2xl text-[#F0EDE8] truncate">{data.title || "Untitled snag"}</h2>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${priCls}`}>{data.priority || "Medium"}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${stCls}`}>{data.status || "Open"}</span>
                {data.isOverdue && <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#F27C7C]/40 text-[#F27C7C]">Overdue</span>}
              </div>
            </div>
            <button onClick={onClose} className="text-[#A19D94] hover:text-[#F0EDE8]" data-testid="snag-wizard-close"><X size={20} /></button>
          </div>

          {data.id && (
            <div className="flex flex-wrap gap-2 mb-4" data-testid="snag-quick-actions">
              {(data.status === "Open" || data.status === "Assigned") && <button onClick={() => changeStatus("In Progress")} className="text-xs px-3 py-1.5 rounded-md border border-[#2a2620] text-[#F0EDE8] hover:border-[#E8A020]" data-testid="snag-qa-progress">Mark In Progress</button>}
              {data.status === "In Progress" && <button onClick={() => changeStatus("Awaiting Verification")} className="text-xs px-3 py-1.5 rounded-md border border-[#2a2620] text-[#F0EDE8] hover:border-[#A0A0F0]" data-testid="snag-qa-await">Ready for verification</button>}
              {data.status !== "Closed" && <button onClick={verifyAndClose} className="text-xs px-3 py-1.5 rounded-md border border-[#68D391]/40 text-[#68D391] hover:bg-[#68D391]/10" data-testid="snag-qa-verify">Verify &amp; close</button>}
              {data.status === "Closed" && <button onClick={() => changeStatus("Open")} className="text-xs px-3 py-1.5 rounded-md border border-[#2a2620] text-[#F0EDE8] hover:border-[#E8A020]" data-testid="snag-qa-reopen">Re-open</button>}
              <button onClick={() => setTplModalOpen(true)} className="text-xs px-3 py-1.5 rounded-md border border-[#2a2620] text-[#F0EDE8] hover:border-[#E8A020] inline-flex items-center gap-1" data-testid="snag-save-template-btn"><Save size={12} /> Save as template</button>
            </div>
          )}

          <div className="space-y-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020] mb-2">Snag details</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Title / short description (required)"><input className={inputClass} value={data.title} onChange={(e) => set("title")(e.target.value)} placeholder="e.g. Chip in kitchen worktop" data-testid="snag-title" /></Field>
                <Field label="Project">
                  {jobs.length > 0 ? (
                    <select value={data.projectId} onChange={(e) => pickProject(e.target.value)} className={inputClass} data-testid="snag-project">
                      <option value="">Select a project</option>
                      {jobs.map(j => <option key={j.id} value={j.id}>{j.projectName || j.clientName}</option>)}
                    </select>
                  ) : (
                    <input className={inputClass} value={data.projectName} onChange={(e) => set("projectName")(e.target.value)} data-testid="snag-projectName" />
                  )}
                </Field>
                <Field label="Area / room">
                  <input className={inputClass} value={data.area} onChange={(e) => set("area")(e.target.value)} list="snag-area-list" placeholder="e.g. Kitchen, Bedroom 1" data-testid="snag-area" />
                  <datalist id="snag-area-list">{(reference.commonAreas || []).map(a => <option key={a} value={a} />)}</datalist>
                </Field>
                <Field label="Location detail" hint="Where exactly in the room"><input className={inputClass} value={data.location} onChange={(e) => set("location")(e.target.value)} placeholder="e.g. Underside of window sill" data-testid="snag-location" /></Field>
                <Field label="Trade">
                  <select className={inputClass} value={data.trade} onChange={(e) => set("trade")(e.target.value)} data-testid="snag-trade">
                    {(reference.trades || []).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Category">
                  <select className={inputClass} value={data.category} onChange={(e) => set("category")(e.target.value)}>
                    {(reference.categories || []).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <div className="md:col-span-2"><Field label="Full description"><textarea className={`${inputClass} min-h-[80px]`} value={data.description} onChange={(e) => set("description")(e.target.value)} placeholder="Describe the defect in enough detail that the trade can put it right without asking questions." data-testid="snag-description" /></Field></div>
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020] mb-2">Priority, status &amp; assignment</div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Field label="Priority">
                  <select className={inputClass} value={data.priority} onChange={(e) => set("priority")(e.target.value)} data-testid="snag-priority">
                    {(reference.priorities || []).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select className={inputClass} value={data.status} onChange={(e) => set("status")(e.target.value)} data-testid="snag-status">
                    {(reference.statuses || []).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Assigned to"><input className={inputClass} value={data.assignedTo} onChange={(e) => set("assignedTo")(e.target.value)} placeholder="Name of person responsible" data-testid="snag-assignedTo" /></Field>
                <Field label="Assigned company"><input className={inputClass} value={data.assignedCompany} onChange={(e) => set("assignedCompany")(e.target.value)} /></Field>
                <Field label="Assignee email"><input type="email" className={inputClass} value={data.assignedEmail} onChange={(e) => set("assignedEmail")(e.target.value)} /></Field>
                <Field label="Due date"><input type="date" className={inputClass} value={data.dueDate} onChange={(e) => set("dueDate")(e.target.value)} data-testid="snag-dueDate" /></Field>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Photo evidence · {((data.photosBefore || []).length + (data.photosAfter || []).length)}</div>
                <div className="flex gap-1">
                  <button onClick={() => setPhotoDraft({ kind: "before", url: "", caption: "" })} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="snag-add-before-btn"><Camera size={12} /> Add before</button>
                  <button onClick={() => setPhotoDraft({ kind: "after", url: "", caption: "" })} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#68D391]" data-testid="snag-add-after-btn"><Camera size={12} /> Add after</button>
                </div>
              </div>
              <PhotoGrid title="Before" photos={data.photosBefore || []} onDelete={delPhoto} />
              <PhotoGrid title="After" photos={data.photosAfter || []} onDelete={delPhoto} />
            </div>

            {data.id && (
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020] mb-2">Comments · {(data.comments || []).length}</div>
                <div className="space-y-2 mb-2 max-h-[240px] overflow-y-auto">
                  {(data.comments || []).map(c => (
                    <div key={c.id} className="card-dark p-3">
                      <div className="text-[11px] text-[#A19D94]">{c.by || "—"} · {(c.at || "").slice(0, 16).replace("T", " ")}</div>
                      <div className="text-sm text-[#F0EDE8] mt-1 whitespace-pre-wrap">{c.text}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add a comment…" className={inputClass} data-testid="snag-comment-input" onKeyDown={(e) => { if (e.key === "Enter") addComment(); }} />
                  <button onClick={addComment} className="px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium inline-flex items-center gap-1" data-testid="snag-comment-add"><MessageSquare size={14} /> Post</button>
                </div>
              </div>
            )}

            {data.id && (data.history || []).length > 0 && (
              <details className="card-dark p-3" data-testid="snag-history">
                <summary className="cursor-pointer text-xs text-[#A19D94]">Audit trail ({(data.history || []).length} events)</summary>
                <div className="mt-2 space-y-1 text-[11px] text-[#A19D94] max-h-[240px] overflow-y-auto">
                  {(data.history || []).slice().reverse().map(h => (
                    <div key={h.id}>{(h.at || "").slice(0, 16).replace("T", " ")} · {h.by} · <span className="text-[#F0EDE8]">{(h.kind || "").replace(/_/g, " ")}</span>{h.note ? ` — ${h.note}` : ""}</div>
                  ))}
                </div>
              </details>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-6 pt-4 border-t border-[#2a2620]">
            <button onClick={generatePreview} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[#2a2620] text-sm text-[#F0EDE8] hover:border-[#E8A020]" data-testid="snag-preview-btn"><RefreshCw size={14} /> {previewUrl ? "Refresh" : "Preview"} PDF</button>
            <button onClick={() => saveEntry()} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-60 ml-auto" data-testid="snag-save-btn"><Download size={16} /> {saving ? "Saving..." : "Save & Generate PDF"}</button>
          </div>
          {previewUrl && <iframe title="Snag Preview" src={previewUrl} className="w-full h-[400px] mt-3 rounded-md border border-[#2a2620] bg-white" data-testid="snag-preview-iframe" />}
        </div>

        {tplModalOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="snag-template-modal">
            <div className="card-dark p-6 max-w-md w-full">
              <div className="flex items-start justify-between mb-3"><h3 className="font-display text-2xl text-[#F0EDE8]">Save as template</h3><button onClick={() => setTplModalOpen(false)} className="text-[#A19D94]"><X size={18} /></button></div>
              <Field label="Template name"><input className={inputClass} value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Standard tiling snag" data-testid="snag-template-name" /></Field>
              <div className="flex gap-2 mt-4"><button onClick={() => setTplModalOpen(false)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button><button onClick={saveAsTemplate} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="snag-template-save">Save</button></div>
            </div>
          </div>
        )}

        {photoDraft && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="snag-photo-modal">
            <div className="card-dark p-5 max-w-lg w-full">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-display text-xl text-[#F0EDE8]">Attach {photoDraft.kind} photo</h3>
                <button onClick={() => setPhotoDraft(null)} className="text-[#A19D94]"><X size={18} /></button>
              </div>
              <div className="text-[11px] text-[#A19D94] mb-3">Paste a photo URL from Photo Vault or an external hosted image.</div>
              <Field label="Photo URL"><input className={inputClass} value={photoDraft.url} onChange={(e) => setPhotoDraft({ ...photoDraft, url: e.target.value })} data-testid="snag-photo-url" /></Field>
              <div className="mt-3"><Field label="Caption (optional)"><input className={inputClass} value={photoDraft.caption} onChange={(e) => setPhotoDraft({ ...photoDraft, caption: e.target.value })} data-testid="snag-photo-caption" /></Field></div>
              <div className="flex gap-2 mt-4"><button onClick={() => setPhotoDraft(null)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button><button onClick={addPhoto} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="snag-photo-save">Attach</button></div>
            </div>
          </div>
        )}

        {verifyOpen && (
          <VerifyModal
            snag={data}
            user={user}
            onAddPhoto={() => setPhotoDraft({ kind: "after", url: "", caption: "" })}
            onClose={() => setVerifyOpen(false)}
            onVerified={onVerified}
          />
        )}
      </div>
    </div>
  );
}

function PhotoGrid({ title, photos, onDelete }) {
  if (!photos || photos.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">{title} · {photos.length}</div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {photos.map(p => (
          <div key={p.id} className="relative group" data-testid={`snag-photo-${p.id}`}>
            <img src={p.thumbnailUrl || p.url} alt={p.caption || title} className="w-full h-24 object-cover rounded-md border border-[#2a2620]" />
            <button onClick={() => onDelete(p.id)} className="absolute top-1 right-1 p-1 rounded-md bg-black/60 text-[#F27C7C] opacity-0 group-hover:opacity-100"><X size={12} /></button>
            {p.caption && <div className="text-[10px] text-[#A19D94] mt-1 truncate">{p.caption}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Verification & Sign-off modal ----------------------------------------
// Opens when the user chooses "Verify & close" (from the row or wizard).
// Captures verifier name, completion date, verification notes, requires at
// least one "after" photo and a live signature. Only after Confirm & Close
// does the snag actually move to Closed. Missing info is called out inline
// AND rejected by the backend as a defensive second gate.
function VerifyModal({ snag, user, onAddPhoto, onClose, onVerified }) {
  const isoToday = () => new Date().toISOString().slice(0, 10);
  const [verifiedBy, setVerifiedBy] = useState(snag.verifiedBy || user?.fullName || user?.username || "");
  const [completionDate, setCompletionDate] = useState(snag.completionDate || isoToday());
  const [note, setNote] = useState(snag.verificationNote || "");
  const [signature, setSignature] = useState(snag.verifierSignature || "");
  const [submitting, setSubmitting] = useState(false);
  const afterCount = (snag.photosAfter || []).length;

  const missing = [];
  if (!verifiedBy.trim()) missing.push("Verifier name");
  if (!signature) missing.push("Signature");
  if (afterCount === 0) missing.push("At least one 'After' photo");
  const canSubmit = missing.length === 0 && !submitting;

  const confirm = async () => {
    if (!canSubmit) { toast.error(`Missing: ${missing.join(", ")}`); return; }
    setSubmitting(true);
    try {
      const r = await api.post(`/snagging/snags/${snag.id}/verify`, {
        verifiedBy: verifiedBy.trim(),
        completionDate,
        verificationNote: note.trim(),
        verifierSignature: signature,
      });
      onVerified(r.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not verify");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[70] overflow-y-auto" data-testid="snag-verify-modal">
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-2xl mx-auto card-dark p-5 md:p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-1">Verification & sign-off</div>
              <h2 className="font-display text-2xl text-[#F0EDE8] truncate">{snag.snagRef ? `${snag.snagRef} · ` : ""}{snag.title || "Snag"}</h2>
              <div className="text-xs text-[#A19D94] mt-1">Complete the checks below then press <span className="text-[#F0EDE8]">Confirm & Close</span>. Only after confirmation will this snag move to Closed.</div>
            </div>
            <button onClick={onClose} className="text-[#A19D94] hover:text-[#F0EDE8]" data-testid="snag-verify-close"><X size={20} /></button>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Verified by (required)">
                <input className={inputClass} value={verifiedBy} onChange={(e) => setVerifiedBy(e.target.value)} placeholder="Name of person signing off" data-testid="snag-verify-verifiedBy" />
              </Field>
              <Field label="Completion / verification date">
                <input type="date" className={inputClass} value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} data-testid="snag-verify-date" />
              </Field>
            </div>
            <Field label="Completion / verification notes">
              <textarea className={`${inputClass} min-h-[90px]`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe how the defect has been put right. This appears on the Snag Sheet PDF." data-testid="snag-verify-note" />
            </Field>

            <div className="card-dark p-3" data-testid="snag-verify-photos">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">After photos</div>
                  <div className="text-xs text-[#A19D94] mt-1">{afterCount === 0 ? "Required — at least one &apos;After&apos; photo must be attached." : `${afterCount} attached.`}</div>
                </div>
                <button onClick={onAddPhoto} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#68D391]" data-testid="snag-verify-add-after"><Camera size={12} /> Add after photo</button>
              </div>
              {afterCount === 0 && (
                <div className="mt-2 text-[11px] text-[#F27C7C] flex items-center gap-1"><AlertTriangle size={12} /> No &apos;After&apos; photo attached yet.</div>
              )}
            </div>

            <div>
              <LiveSignatureBlock
                label="Verifier signature (required)"
                subtitle="Draw with mouse, finger or stylus. Works on desktop and mobile."
                value={signature}
                onChange={setSignature}
                savedSignature={user?.signature}
                testIdPrefix="snag-verify-sig"
              />
            </div>

            {missing.length > 0 && (
              <div className="text-xs text-[#F27C7C] flex items-start gap-2" data-testid="snag-verify-missing">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>Missing before closure: <span className="text-[#F0EDE8]">{missing.join(", ")}</span></span>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse md:flex-row md:items-center gap-2 mt-6 pt-4 border-t border-[#2a2620]">
            <button onClick={onClose} className="w-full md:w-auto px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]" data-testid="snag-verify-cancel">Cancel</button>
            <button
              onClick={confirm}
              disabled={!canSubmit}
              className="w-full md:flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-[#68D391] text-black text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="snag-verify-confirm"
            >
              <CheckCircle2 size={16} /> {submitting ? "Closing…" : "Confirm & Close"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
