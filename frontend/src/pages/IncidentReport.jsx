// Morris — Incident Report V2 (Flagship Incident Investigation & Management)
// Dashboard-first: stat cards, filters, favourites, recent, templates.
// 9-step wizard: Project → Incident → People → Evidence → Investigation (Five Whys)
// → Risk Review → CAPA → Linked Docs → Sign-off (triple).

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Plus, Search, RefreshCw, Trash2, Edit2, X, ChevronLeft, ChevronRight,
  ClipboardList, AlertTriangle, Users, Camera, HelpCircle,
  Shield, ListChecks, Link2, Download, PenTool, Copy, Star, Save,
  AlertOctagon, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import AttachMedia from "../components/AttachMedia";
import SignaturePad from "../components/SignaturePad";
import { downloadIncidentReportPdf, incidentReportPdfBlobUrl } from "../lib/incident-report-pdf";
import { saveToolData } from "../lib/tool-persistence";

const TOOL_ID = "incident-report";
const DRAFT_KEY = "morris.tool_draft.incident-report";

const WIZARD_STEPS = [
  { id: 1, key: "project",       label: "Project",          icon: ClipboardList },
  { id: 2, key: "incident",      label: "Incident",         icon: AlertTriangle },
  { id: 3, key: "people",        label: "People",           icon: Users },
  { id: 4, key: "evidence",      label: "Evidence",         icon: Camera },
  { id: 5, key: "investigation", label: "Investigation",    icon: HelpCircle },
  { id: 6, key: "risk-review",   label: "Risk Review",      icon: Shield },
  { id: 7, key: "capa",          label: "CAPA",             icon: ListChecks },
  { id: 8, key: "linked",        label: "Linked Docs",      icon: Link2 },
  { id: 9, key: "signoff",       label: "Sign-off",         icon: Download },
];

const INCIDENT_TYPES = ["Injury", "Near Miss", "Property Damage", "Environmental", "Dangerous Occurrence", "Vehicle", "Security", "Other"];
const SEVERITIES = ["Low", "Medium", "High", "Critical"];
const STATUSES = ["Open", "Under Investigation", "Corrective Actions", "Closed"];
const RIDDOR_CATS = ["Fatality", "Specified injury", "Over-7-day incapacitation", "Occupational disease", "Dangerous occurrence", "Gas incident", "Not RIDDOR reportable"];
const RISK_REVIEW_KEYS = [
  { key: "ramsUpdate", label: "Does the RAMS require updating?" },
  { key: "methodStatementUpdate", label: "Does the Method Statement require updating?" },
  { key: "coshhUpdate", label: "Is a COSHH Assessment affected?" },
  { key: "toolboxTalkRequired", label: "Is a Toolbox Talk required?" },
  { key: "riskAssessmentReview", label: "Does the Risk Assessment need reviewing?" },
];

const inputClass = "w-full bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none";
const Label = ({ children }) => <label className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">{children}</label>;
const Field = ({ label, children, hint }) => (
  <div>
    <Label>{label}</Label>
    <div className="mt-1">{children}</div>
    {hint && <div className="text-[11px] text-[#706D66] mt-1">{hint}</div>}
  </div>
);

const emptyEntry = () => ({
  projectId: "", projectName: "", clientName: "", siteAddress: "", principalContractor: "", documentRef: "",
  incidentType: "", severity: "Medium", status: "Open",
  date: new Date().toISOString().slice(0, 10), time: new Date().toTimeString().slice(0, 5),
  location: "", description: "", immediateActions: "", reportedBy: "",
  riddorReportable: false, riddorCategory: "", riddorReference: "",
  injuredPersons: [], witnesses: [], supervisor: "", firstAider: "",
  photos: [], drawings: [],
  immediateCause: "", underlyingCause: "", rootCause: "",
  fiveWhys: [{ id: crypto.randomUUID(), q: "Why did this happen?", a: "" }],
  riskReview: { ramsUpdate: false, methodStatementUpdate: false, coshhUpdate: false, toolboxTalkRequired: false, riskAssessmentReview: false, notes: {} },
  capa: [],
  linkedDocuments: { rams: [], methodStatement: [], coshh: [], toolboxTalk: [], riskRegister: [], siteDiary: [] },
  notes: "",
  preparedBy: "", preparedSignature: "",
  reviewedBy: "", reviewedSignature: "",
  approvedBy: "", approvedSignature: "",
  isFavourite: false,
});

function saveDraft(d) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ } }
function loadDraft() { try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }

export default function IncidentReportV2() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const initialProjectId = params.get("projectId") || "";
  const openParamId = params.get("open") || "";

  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterProject, setFilterProject] = useState(initialProjectId);
  const [filterType, setFilterType] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [editing, setEditing] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [eRes, sRes, tRes, jRes] = await Promise.allSettled([
        api.get("/incident-report/entries"),
        api.get("/incident-report/stats"),
        api.get("/incident-report/templates"),
        api.get("/jobs"),
      ]);
      if (eRes.status === "fulfilled") setEntries(eRes.value.data);
      if (sRes.status === "fulfilled") setStats(sRes.value.data);
      if (tRes.status === "fulfilled") setTemplates(tRes.value.data);
      if (jRes.status === "fulfilled") setJobs(jRes.value.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);

  // Auto-open if ?open=<id>
  useEffect(() => {
    if (openParamId && entries.length > 0 && !wizardOpen) {
      const found = entries.find(e => e.id === openParamId);
      if (found) openEdit(found);
    }
  }, [openParamId, entries]);

  const openNew = (fromTemplate = null) => {
    let base = emptyEntry();
    if (initialProjectId) {
      const j = jobs.find(x => x.id === initialProjectId);
      if (j) { base.projectId = j.id; base.projectName = j.projectName || j.clientName || ""; base.clientName = j.clientName || ""; base.siteAddress = j.address || ""; }
    }
    if (fromTemplate) {
      base = { ...base, ...(fromTemplate.payload || {}), id: undefined, date: base.date, time: base.time };
    } else {
      const savedDraft = loadDraft();
      if (savedDraft && !savedDraft.id) base = { ...base, ...savedDraft, id: undefined };
    }
    setEditing(base); setWizardOpen(true);
  };
  const openEdit = (e) => { setEditing({ ...emptyEntry(), ...e }); setWizardOpen(true); };
  const duplicate = (e) => {
    const copy = { ...e }; delete copy.id; delete copy.createdAt; delete copy.updatedAt; delete copy._id;
    copy.date = new Date().toISOString().slice(0, 10); copy.time = new Date().toTimeString().slice(0, 5); copy.status = "Open";
    setEditing({ ...emptyEntry(), ...copy }); setWizardOpen(true);
  };
  const deleteEntry = async (e) => {
    if (!window.confirm(`Delete incident ${e.incidentType || ""} on ${e.date}?`)) return;
    try { await api.delete(`/incident-report/entries/${e.id}`); toast.success("Deleted"); await loadAll(); }
    catch { toast.error("Delete failed"); }
  };
  const toggleFav = async (e) => {
    try { await api.patch(`/incident-report/entries/${e.id}`, { isFavourite: !e.isFavourite }); await loadAll(); }
    catch { toast.error("Failed"); }
  };
  const deleteTemplate = async (id) => {
    if (!window.confirm("Delete template?")) return;
    try { await api.delete(`/incident-report/templates/${id}`); setTemplates(templates.filter(x => x.id !== id)); toast.success("Deleted"); }
    catch { toast.error("Failed"); }
  };

  const projects = useMemo(() => { const s = new Set(); entries.forEach(a => a.projectName && s.add(a.projectName)); return [...s]; }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(e => {
      if (q) {
        const hay = `${e.projectName || ""} ${e.location || ""} ${e.description || ""} ${e.incidentType || ""} ${e.reportedBy || ""} ${e.rootCause || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterProject) {
        const okId = e.projectId === filterProject;
        const okName = e.projectName === filterProject;
        if (!okId && !okName) return false;
      }
      if (filterType && e.incidentType !== filterType) return false;
      if (filterSeverity && e.severity !== filterSeverity) return false;
      if (filterStatus && e.status !== filterStatus) return false;
      return true;
    });
  }, [entries, query, filterProject, filterType, filterSeverity, filterStatus]);

  const favourites = entries.filter(e => e.isFavourite);
  const recent = [...entries].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="incident-report-page">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Health & Safety</div>
          <h1 className="font-display text-3xl sm:text-4xl text-[#F0EDE8]">Incident Report</h1>
          <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">Record, investigate, track and close workplace incidents. Regulator-ready reports for clients, principal contractors and internal company records.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll} className="text-xs text-[#A19D94] hover:text-[#E8A020] flex items-center gap-1" data-testid="ir-refresh"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh</button>
          <button onClick={() => openNew()} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040]" data-testid="ir-new-btn"><Plus size={14} /> New Incident</button>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Total incidents" value={stats?.total ?? 0} icon={ClipboardList} testId="ir-stat-total" />
        <StatCard label="Open" value={stats?.open ?? 0} icon={AlertOctagon} tone="gold" testId="ir-stat-open" />
        <StatCard label="Closed" value={stats?.closed ?? 0} icon={CheckCircle2} tone="green" testId="ir-stat-closed" />
        <StatCard label="High priority" value={stats?.highPriority ?? 0} icon={AlertTriangle} tone="red" testId="ir-stat-high" />
        <StatCard label="Near misses" value={stats?.nearMisses ?? 0} icon={AlertTriangle} tone="gold" testId="ir-stat-nearmiss" />
        <StatCard label="CAPA outstanding" value={stats?.capaOutstanding ?? 0} icon={ListChecks} tone="gold" testId="ir-stat-capa" />
      </div>

      {/* Under investigation strip */}
      <div className="mb-6">
        <div className="card-dark p-3 flex items-center gap-3">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020]">Under investigation</div>
          <div className="text-2xl text-[#F0EDE8] font-display" data-testid="ir-stat-investigation">{stats?.underInvestigation ?? 0}</div>
          <div className="text-xs text-[#A19D94] flex-1 truncate">Incidents currently being investigated across all projects.</div>
        </div>
      </div>

      {/* Favourites & Recent */}
      {(favourites.length > 0 || recent.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {favourites.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2 flex items-center gap-1"><Star size={12} /> Favourites</div>
              <div className="grid grid-cols-1 gap-2">{favourites.slice(0, 3).map(e => <MiniRow key={e.id} e={e} onOpen={() => openEdit(e)} />)}</div>
            </div>
          )}
          {recent.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Recent incidents</div>
              <div className="grid grid-cols-1 gap-2">{recent.slice(0, 3).map(e => <MiniRow key={e.id} e={e} onOpen={() => openEdit(e)} />)}</div>
            </div>
          )}
        </div>
      )}

      {templates.length > 0 && (
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Templates</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {templates.map(t => (
              <div key={t.id} className="card-dark p-3 flex items-start justify-between gap-2" data-testid={`ir-template-${t.id}`}>
                <button onClick={() => openNew(t)} className="text-left flex-1 min-w-0">
                  <div className="text-sm text-[#F0EDE8] truncate">{t.name}</div>
                  <div className="text-[11px] text-[#A19D94] truncate">Incident template</div>
                </button>
                <button onClick={() => deleteTemplate(t.id)} className="text-[#706D66] hover:text-[#F27C7C] p-1"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card-dark p-4 mb-4" data-testid="ir-filters">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="relative md:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search project, description, location, root cause..." className={`${inputClass} pl-9`} data-testid="ir-search" />
          </div>
          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className={inputClass} data-testid="ir-filter-project">
            <option value="">All projects</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={inputClass} data-testid="ir-filter-type">
            <option value="">All types</option>
            {INCIDENT_TYPES.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)} className={inputClass} data-testid="ir-filter-severity">
              <option value="">All severity</option>
              {SEVERITIES.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={inputClass} data-testid="ir-filter-status">
              <option value="">All status</option>
              {STATUSES.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card-dark p-8 text-center text-sm text-[#A19D94]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card-dark p-10 text-center" data-testid="ir-empty">
          <AlertTriangle size={28} className="mx-auto text-[#E8A020] mb-3" />
          <div className="text-base text-[#F0EDE8]">No incidents {entries.length > 0 ? "match your filters" : "logged yet"}</div>
          {entries.length === 0 && <div className="text-xs text-[#A19D94] mt-1 max-w-sm mx-auto">Record every injury, near miss and dangerous occurrence — even the ones you think are minor. A tidy incident record protects the business and improves the site.</div>}
          <button onClick={() => openNew()} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium">
            <Plus size={14} /> Log your first incident
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(e => <EntryRow key={e.id} e={e} onEdit={() => openEdit(e)} onDelete={() => deleteEntry(e)} onDuplicate={() => duplicate(e)} onFav={() => toggleFav(e)} />)}
        </div>
      )}

      {wizardOpen && editing && (
        <IncidentWizard
          initial={editing}
          user={user}
          jobs={jobs}
          onClose={() => { setWizardOpen(false); setEditing(null); }}
          onSaved={async () => { await loadAll(); setWizardOpen(false); setEditing(null); }}
          onTemplatesChanged={setTemplates}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone, testId }) {
  const t = tone === "red" ? "text-[#F27C7C]" : tone === "green" ? "text-[#68D391]" : tone === "gold" ? "text-[#E8A020]" : "text-[#F0EDE8]";
  return (
    <div className="card-dark p-4" data-testid={testId}>
      <div className="flex items-center justify-between"><Label>{label}</Label>{Icon && <Icon size={13} className="text-[#706D66]" />}</div>
      <div className={`mt-2 font-display text-3xl ${t}`}>{value}</div>
    </div>
  );
}

function SeverityBadge({ severity, status }) {
  const isHigh = severity === "High" || severity === "Critical";
  const isClosed = status === "Closed";
  const cls = isClosed ? "border-[#68D391]/40 text-[#68D391]" : isHigh ? "border-[#F27C7C]/40 text-[#F27C7C]" : "border-[#E8A020]/40 text-[#E8A020]";
  return <span className={`text-[10px] px-2 py-0.5 rounded-full border ${cls}`}>{severity || "—"}</span>;
}

function EntryRow({ e, onEdit, onDelete, onDuplicate, onFav }) {
  const capaOpen = (e.capa || []).filter(a => (a.status || "Open").toLowerCase() !== "done" && (a.status || "Open").toLowerCase() !== "closed" && (a.status || "Open").toLowerCase() !== "complete" && (a.status || "Open").toLowerCase() !== "completed").length;
  return (
    <div className="card-dark p-4 flex items-start gap-3" data-testid={`ir-row-${e.id}`}>
      <button onClick={onFav} className={`p-1 mt-1 ${e.isFavourite ? "text-[#E8A020]" : "text-[#706D66] hover:text-[#E8A020]"}`} aria-label="Favourite"><Star size={14} fill={e.isFavourite ? "#E8A020" : "none"} /></button>
      <button onClick={onEdit} className="text-left flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base text-[#F0EDE8] font-medium truncate">{e.incidentType || "Incident"}{e.projectName ? ` · ${e.projectName}` : ""}</span>
          <SeverityBadge severity={e.severity} status={e.status} />
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#2a2620] text-[#A19D94]">{e.status || "Open"}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#2a2620] text-[#A19D94]">{e.date || "—"} {e.time || ""}</span>
          {capaOpen > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#F27C7C]/40 text-[#F27C7C]">{capaOpen} CAPA open</span>}
        </div>
        <div className="text-xs text-[#A19D94] mt-1 truncate">{e.location || "—"} · {e.description ? e.description.slice(0, 120) : "No description"}</div>
      </button>
      <div className="flex gap-1 shrink-0">
        <button onClick={onEdit} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`ir-row-edit-${e.id}`}><Edit2 size={14} /></button>
        <button onClick={onDuplicate} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`ir-row-dup-${e.id}`}><Copy size={14} /></button>
        <button onClick={onDelete} className="p-2 text-[#A19D94] hover:text-[#F27C7C]" data-testid={`ir-row-delete-${e.id}`}><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

function MiniRow({ e, onOpen }) {
  return (
    <button onClick={onOpen} className="card-dark p-3 text-left hover:border-[#E8A020]/40">
      <div className="text-sm text-[#F0EDE8] truncate">{e.incidentType || "Incident"} <span className="text-[11px] text-[#A19D94]">· {e.projectName || "—"} · {e.date}</span></div>
      <div className="text-[11px] text-[#A19D94] truncate">{e.severity || "—"} · {e.status || "Open"} · {e.location || "no location"}</div>
    </button>
  );
}

// ================================================================
// WIZARD
// ================================================================
function IncidentWizard({ initial, user, jobs, onClose, onSaved, onTemplatesChanged }) {
  const [data, setData] = useState(initial);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [docs, setDocs] = useState([]);
  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [signingOpen, setSigningOpen] = useState(null); // "prepared" | "reviewed" | "approved"

  useEffect(() => { api.get("/documents").then(r => setDocs(Array.isArray(r.data) ? r.data : [])).catch(() => {}); }, []);
  useEffect(() => { if (user?.fullName && !data.reportedBy) setData(d => ({ ...d, reportedBy: user.fullName })); }, [user?.fullName]);
  useEffect(() => { if (user?.fullName && !data.preparedBy) setData(d => ({ ...d, preparedBy: user.fullName })); }, [user?.fullName]);
  useEffect(() => { if (!data.id) { const t = setTimeout(() => saveDraft(data), 500); return () => clearTimeout(t); } }, [data]);

  const pickProject = (id) => {
    const j = jobs.find(x => x.id === id);
    if (!j) return;
    setData(d => ({ ...d, projectId: j.id, projectName: j.projectName || j.clientName || d.projectName, clientName: j.clientName || d.clientName, siteAddress: j.address || d.siteAddress, principalContractor: j.principalContractor || d.principalContractor }));
  };
  const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));

  const generatePreview = () => {
    try { setPreviewUrl(incidentReportPdfBlobUrl({ data, user, today: new Date().toLocaleDateString("en-GB") })); }
    catch (e) { toast.error("Preview failed"); }
  };

  const saveEntry = async () => {
    if (!data.date) { toast.error("Incident date is required"); setStep(2); return; }
    if (!data.incidentType) { toast.error("Incident type is required"); setStep(2); return; }
    setSaving(true);
    try {
      let saved;
      if (data.id) {
        const r = await api.patch(`/incident-report/entries/${data.id}`, data); saved = r.data;
      } else {
        const r = await api.post("/incident-report/entries", data); saved = r.data;
      }
      try {
        await api.post("/documents/save", {
          title: `Incident Report — ${data.incidentType || "Incident"} — ${data.projectName || "Project"} — ${data.date}`,
          toolId: TOOL_ID,
          refNumber: data.documentRef || `IR-${(saved.id || "").slice(0, 8)}`,
          jobId: data.projectId || null,
          content: buildSummary(data),
          metadata: { ...data, id: saved.id, photos: (data.photos || []).map(p => ({ id: p.id, url: p.url, caption: p.description || p.caption })) },
        });
      } catch { /* soft-fail */ }
      downloadIncidentReportPdf({ data: { ...data, id: saved.id }, user, today: new Date().toLocaleDateString("en-GB") });
      try { saveToolData(TOOL_ID, { generatedAt: new Date().toISOString(), projectId: data.projectId || null, date: data.date, id: saved.id, severity: data.severity, status: data.status }); } catch { /* ignore */ }
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      toast.success("Incident saved");
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const saveAsTemplate = async () => {
    if (!tplName.trim()) return toast.error("Template name required");
    try {
      const payload = { ...data, id: undefined, date: undefined, time: undefined, description: "", immediateActions: "", photos: [], drawings: [], capa: [], injuredPersons: [], witnesses: [], preparedSignature: "", reviewedSignature: "", approvedSignature: "", notes: "" };
      await api.post("/incident-report/templates", { name: tplName.trim(), payload });
      toast.success("Template saved");
      setTplModalOpen(false); setTplName("");
      try { const tRes = await api.get("/incident-report/templates"); if (Array.isArray(tRes.data)) onTemplatesChanged(tRes.data); } catch { /* ignore */ }
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-y-auto" data-testid="ir-wizard">
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-5xl mx-auto card-dark p-5 md:p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-1">{data.id ? "Edit" : "New"} Incident Report</div>
              <h2 className="font-display text-2xl text-[#F0EDE8]">{data.incidentType || "Untitled"} <span className="text-sm text-[#A19D94]">· {data.projectName || "no project"} · {data.date || "no date"}</span></h2>
            </div>
            <button onClick={onClose} className="text-[#A19D94] hover:text-[#F0EDE8]" data-testid="ir-wizard-close"><X size={20} /></button>
          </div>

          <div className="flex justify-end mb-3">
            <button onClick={() => setTplModalOpen(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="ir-save-template-btn">
              <Save size={12} /> Save as template
            </button>
          </div>

          <div className="overflow-x-auto mb-5" data-testid="ir-stepper">
            <div className="flex gap-1 min-w-max">
              {WIZARD_STEPS.map(s => (
                <button key={s.id} onClick={() => setStep(s.id)} data-testid={`ir-step-${s.id}`}
                  className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${step === s.id ? "bg-[#E8A020] text-black" : step > s.id ? "bg-[#1e1a12] text-[#68D391] border border-[#68D391]/30" : "bg-[#0f0d09] text-[#A19D94] border border-[#2a2620]"}`}>
                  {s.id}. {s.label}
                </button>
              ))}
            </div>
          </div>

          {step === 1 && <StepProject data={data} setData={setData} pickProject={pickProject} jobs={jobs} user={user} set={set} />}
          {step === 2 && <StepIncident data={data} setData={setData} set={set} />}
          {step === 3 && <StepPeople data={data} setData={setData} set={set} />}
          {step === 4 && <StepEvidence data={data} setData={setData} set={set} />}
          {step === 5 && <StepInvestigation data={data} setData={setData} set={set} />}
          {step === 6 && <StepRiskReview data={data} setData={setData} />}
          {step === 7 && <StepCapa data={data} setData={setData} />}
          {step === 8 && <StepLinked data={data} setData={setData} docs={docs} />}
          {step === 9 && <StepSignoff data={data} user={user} previewUrl={previewUrl} onPreview={generatePreview} onSave={saveEntry} saving={saving} onOpenSign={setSigningOpen} set={set} />}

          <div className="flex items-center justify-between mt-6">
            <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94] disabled:opacity-40" data-testid="ir-btn-prev"><ChevronLeft size={14} /> Back</button>
            <span className="text-xs text-[#706D66]">Step {step} of {WIZARD_STEPS.length}</span>
            <button onClick={() => setStep(Math.min(WIZARD_STEPS.length, step + 1))} disabled={step === WIZARD_STEPS.length} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-40" data-testid="ir-btn-next">Next <ChevronRight size={14} /></button>
          </div>
        </div>

        {tplModalOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="ir-template-modal">
            <div className="card-dark p-6 max-w-md w-full">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-display text-2xl text-[#F0EDE8]">Save as template</h3>
                <button onClick={() => setTplModalOpen(false)} className="text-[#A19D94]"><X size={18} /></button>
              </div>
              <p className="text-xs text-[#A19D94] mb-3">Saves a reusable skeleton (type, severity, risk-review checklist). One-off content (description, photos, witnesses, actions) is stripped.</p>
              <Field label="Template name"><input className={inputClass} value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Slip / Trip / Fall — Standard" data-testid="ir-template-name" /></Field>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setTplModalOpen(false)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button>
                <button onClick={saveAsTemplate} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="ir-template-save">Save template</button>
              </div>
            </div>
          </div>
        )}

        {signingOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="ir-sign-modal">
            <div className="card-dark p-5 max-w-lg w-full">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-display text-xl text-[#F0EDE8]">{{ prepared: "Prepared by", reviewed: "Reviewed by", approved: "Approved by" }[signingOpen] || "Signature"}</h3>
                <button onClick={() => setSigningOpen(null)} className="text-[#A19D94]"><X size={18} /></button>
              </div>
              <SignaturePad
                value={signingOpen === "reviewed" ? (data.reviewedSignature || "") : signingOpen === "approved" ? (data.approvedSignature || "") : (data.preparedSignature || "")}
                onChange={(v) => set(signingOpen === "reviewed" ? "reviewedSignature" : signingOpen === "approved" ? "approvedSignature" : "preparedSignature")(v)}
              />
              <div className="flex gap-2 mt-3">
                <button onClick={() => setSigningOpen(null)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button>
                <button onClick={() => setSigningOpen(null)} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="ir-sign-done">Done</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Steps ----

function StepProject({ data, setData, pickProject, jobs, user, set }) {
  return (
    <div className="space-y-4" data-testid="ir-step-1-project">
      {jobs.length > 0 && (
        <Field label="Link to project (recommended)" hint="Auto-fills client, site and principal contractor. Adds a timeline event when saved.">
          <select value={data.projectId} onChange={(e) => pickProject(e.target.value)} className={inputClass} data-testid="ir-link-project">
            <option value="">Not linked</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.projectName || j.clientName} — {j.address || "no address"}</option>)}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Project name"><input className={inputClass} value={data.projectName} onChange={(e) => set("projectName")(e.target.value)} data-testid="ir-projectName" /></Field>
        <Field label="Client"><input className={inputClass} value={data.clientName} onChange={(e) => set("clientName")(e.target.value)} data-testid="ir-clientName" /></Field>
        <Field label="Principal contractor"><input className={inputClass} value={data.principalContractor} onChange={(e) => set("principalContractor")(e.target.value)} /></Field>
        <Field label="Site address"><textarea className={`${inputClass} min-h-[52px]`} value={data.siteAddress} onChange={(e) => set("siteAddress")(e.target.value)} data-testid="ir-siteAddress" /></Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Date *"><input type="date" className={inputClass} value={data.date} onChange={(e) => set("date")(e.target.value)} data-testid="ir-date" /></Field>
        <Field label="Time"><input type="time" className={inputClass} value={data.time} onChange={(e) => set("time")(e.target.value)} data-testid="ir-time" /></Field>
        <Field label="Reported by" hint="Person raising this incident report."><input className={inputClass} value={data.reportedBy || user?.fullName || ""} onChange={(e) => set("reportedBy")(e.target.value)} data-testid="ir-reportedBy" /></Field>
      </div>
    </div>
  );
}

function StepIncident({ data, setData, set }) {
  return (
    <div className="space-y-4" data-testid="ir-step-2-incident">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Incident type *">
          <select className={inputClass} value={data.incidentType} onChange={(e) => set("incidentType")(e.target.value)} data-testid="ir-incidentType">
            <option value="">Select type</option>
            {INCIDENT_TYPES.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Severity">
          <select className={inputClass} value={data.severity} onChange={(e) => set("severity")(e.target.value)} data-testid="ir-severity">
            {SEVERITIES.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className={inputClass} value={data.status} onChange={(e) => set("status")(e.target.value)} data-testid="ir-status">
            {STATUSES.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Exact location on site"><input className={inputClass} value={data.location} onChange={(e) => set("location")(e.target.value)} placeholder="e.g. Level 2 south, plant room, adjacent to riser" data-testid="ir-location" /></Field>
      <Field label="What happened" hint="Neutral description of events in chronological order. Facts only — no blame."><textarea className={`${inputClass} min-h-[120px]`} value={data.description} onChange={(e) => set("description")(e.target.value)} data-testid="ir-description" /></Field>
      <Field label="Immediate actions taken on site" hint="First aid administered, area made safe, HSE informed, etc."><textarea className={`${inputClass} min-h-[80px]`} value={data.immediateActions} onChange={(e) => set("immediateActions")(e.target.value)} data-testid="ir-immediateActions" /></Field>
      <div className="card-dark p-3 border-l-2 border-[#F27C7C]">
        <div className="flex items-center gap-2 mb-2">
          <input type="checkbox" checked={data.riddorReportable || false} onChange={(e) => set("riddorReportable")(e.target.checked)} data-testid="ir-riddorReportable" />
          <span className="text-sm text-[#F0EDE8]">RIDDOR reportable</span>
        </div>
        {data.riddorReportable && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="RIDDOR category">
              <select className={inputClass} value={data.riddorCategory || ""} onChange={(e) => set("riddorCategory")(e.target.value)} data-testid="ir-riddorCategory">
                <option value="">Select category</option>
                {RIDDOR_CATS.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="RIDDOR reference number" hint="Once submitted at hse.gov.uk you'll receive a reference — record it here."><input className={inputClass} value={data.riddorReference || ""} onChange={(e) => set("riddorReference")(e.target.value)} placeholder="e.g. F2508-XXXXX" data-testid="ir-riddorReference" /></Field>
          </div>
        )}
      </div>
    </div>
  );
}

function StepPeople({ data, setData, set }) {
  const inj = data.injuredPersons || [];
  const wit = data.witnesses || [];
  return (
    <div className="space-y-5" data-testid="ir-step-3-people">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Supervisor"><input className={inputClass} value={data.supervisor} onChange={(e) => set("supervisor")(e.target.value)} data-testid="ir-supervisor" /></Field>
        <Field label="First aider (if attended)"><input className={inputClass} value={data.firstAider} onChange={(e) => set("firstAider")(e.target.value)} data-testid="ir-firstAider" /></Field>
      </div>
      <PeopleTable testId="ir-injured" title="Injured / affected persons" list={inj}
        cols={[{ k: "name", label: "Name" }, { k: "company", label: "Company" }, { k: "role", label: "Role / trade" }, { k: "injury", label: "Injury / effect" }, { k: "treatment", label: "First-aid / treatment given" }]}
        add={() => setData(d => ({ ...d, injuredPersons: [...(d.injuredPersons || []), { id: crypto.randomUUID(), name: "", company: "", role: "", injury: "", treatment: "" }] }))}
        upd={(id, p) => setData(d => ({ ...d, injuredPersons: d.injuredPersons.map(x => x.id === id ? { ...x, ...p } : x) }))}
        del={(id) => setData(d => ({ ...d, injuredPersons: d.injuredPersons.filter(x => x.id !== id) }))}
      />
      <PeopleTable testId="ir-witness" title="Witnesses" list={wit}
        cols={[{ k: "name", label: "Name" }, { k: "company", label: "Company" }, { k: "role", label: "Role / trade" }, { k: "statement", label: "Witness statement", textarea: true }]}
        add={() => setData(d => ({ ...d, witnesses: [...(d.witnesses || []), { id: crypto.randomUUID(), name: "", company: "", role: "", statement: "" }] }))}
        upd={(id, p) => setData(d => ({ ...d, witnesses: d.witnesses.map(x => x.id === id ? { ...x, ...p } : x) }))}
        del={(id) => setData(d => ({ ...d, witnesses: d.witnesses.filter(x => x.id !== id) }))}
      />
    </div>
  );
}

function PeopleTable({ testId, title, list, cols, add, upd, del }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">{title}</div>
        <button onClick={add} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#E8A020] text-black text-xs font-medium" data-testid={`${testId}-add`}><Plus size={12} /> Add</button>
      </div>
      {list.length === 0 && <div className="card-dark p-4 text-center text-xs text-[#A19D94]">None logged.</div>}
      {list.map((row, i) => (
        <div key={row.id} className="card-dark p-3 mb-2" data-testid={`${testId}-row-${i + 1}`}>
          <div className="flex items-center justify-between mb-2"><span className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">#{i + 1}</span><button onClick={() => del(row.id)} className="text-[#A19D94] hover:text-[#F27C7C]"><Trash2 size={14} /></button></div>
          <div className={`grid grid-cols-1 md:grid-cols-${Math.min(cols.length, 4)} gap-2`}>
            {cols.map(c => (
              <Field key={c.k} label={c.label}>
                {c.textarea ? (
                  <textarea className={`${inputClass} min-h-[64px]`} value={row[c.k] || ""} onChange={(e) => upd(row.id, { [c.k]: e.target.value })} data-testid={`${testId}-${c.k}-${i + 1}`} />
                ) : (
                  <input className={inputClass} value={row[c.k] || ""} onChange={(e) => upd(row.id, { [c.k]: e.target.value })} data-testid={`${testId}-${c.k}-${i + 1}`} />
                )}
              </Field>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StepEvidence({ data, setData, set }) {
  return (
    <div className="space-y-5" data-testid="ir-step-4-evidence">
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020] mb-2">Site photos</div>
        <p className="text-xs text-[#A19D94] mb-2">Photos of the scene, damage, injuries (with consent), unsafe conditions. Stored in the Photo Vault.</p>
        <AttachMedia toolId={TOOL_ID} toolLabel="Incident Report" jobId={data.projectId || null} category="incident-report"
          value={data.photos || []} onChange={(list) => set("photos")(list)} testIdPrefix="ir-attach" />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020] mb-2">Drawings & diagrams</div>
        <p className="text-xs text-[#A19D94] mb-2">Marked-up layout, sketch of the sequence of events. Optional but useful.</p>
        <AttachMedia toolId={TOOL_ID} toolLabel="Incident Report" jobId={data.projectId || null} category="incident-drawing"
          value={data.drawings || []} onChange={(list) => set("drawings")(list)} testIdPrefix="ir-drawing" />
      </div>
    </div>
  );
}

function StepInvestigation({ data, setData, set }) {
  const whys = data.fiveWhys || [];
  const addWhy = () => setData(d => ({ ...d, fiveWhys: [...(d.fiveWhys || []), { id: crypto.randomUUID(), q: "Why?", a: "" }] }));
  const updWhy = (id, patch) => setData(d => ({ ...d, fiveWhys: d.fiveWhys.map(x => x.id === id ? { ...x, ...patch } : x) }));
  const delWhy = (id) => setData(d => ({ ...d, fiveWhys: d.fiveWhys.filter(x => x.id !== id) }));
  return (
    <div className="space-y-5" data-testid="ir-step-5-investigation">
      <div className="card-dark p-3 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">
        <strong className="text-[#E8A020]">Guidance:</strong> Investigate the incident thoroughly and neutrally. Focus on causes, not blame. Use the Five Whys to drive past the immediate cause to the underlying and root causes.
      </div>
      <Field label="Immediate cause" hint="The unsafe act or condition that directly led to the incident."><textarea className={`${inputClass} min-h-[64px]`} value={data.immediateCause} onChange={(e) => set("immediateCause")(e.target.value)} data-testid="ir-immediateCause" /></Field>
      <Field label="Underlying cause" hint="The organisational or workplace factors that allowed the immediate cause to occur."><textarea className={`${inputClass} min-h-[64px]`} value={data.underlyingCause} onChange={(e) => set("underlyingCause")(e.target.value)} data-testid="ir-underlyingCause" /></Field>
      <Field label="Root cause" hint="The single most fundamental reason. Fix this and the incident cannot recur in the same way."><textarea className={`${inputClass} min-h-[64px]`} value={data.rootCause} onChange={(e) => set("rootCause")(e.target.value)} data-testid="ir-rootCause" /></Field>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Five Whys analysis</div>
          <button onClick={addWhy} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#E8A020] text-black text-xs font-medium" data-testid="ir-add-why"><Plus size={12} /> Add why</button>
        </div>
        {whys.length === 0 && <div className="card-dark p-4 text-center text-xs text-[#A19D94]">Add at least one Why to record the investigation chain.</div>}
        {whys.map((w, i) => (
          <div key={w.id} className="card-dark p-3 mb-2" data-testid={`ir-why-${i + 1}`}>
            <div className="flex items-center justify-between mb-2"><span className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Why #{i + 1}</span><button onClick={() => delWhy(w.id)} className="text-[#A19D94] hover:text-[#F27C7C]"><Trash2 size={14} /></button></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Field label="Question"><input className={inputClass} value={w.q} onChange={(e) => updWhy(w.id, { q: e.target.value })} placeholder="e.g. Why did the operative slip?" data-testid={`ir-why-q-${i + 1}`} /></Field>
              <Field label="Answer"><input className={inputClass} value={w.a} onChange={(e) => updWhy(w.id, { a: e.target.value })} placeholder="e.g. Because oil had leaked from the mixer" data-testid={`ir-why-a-${i + 1}`} /></Field>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepRiskReview({ data, setData }) {
  const rr = data.riskReview || {};
  const toggle = (key) => setData(d => ({ ...d, riskReview: { ...rr, [key]: !rr[key] } }));
  const updateNote = (key, v) => setData(d => ({ ...d, riskReview: { ...rr, notes: { ...(rr.notes || {}), [key]: v } } }));
  return (
    <div className="space-y-3" data-testid="ir-step-6-risk-review">
      <div className="card-dark p-3 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">
        <strong className="text-[#E8A020]">Consider each question below.</strong> Ticking a box does not automatically update the document — it creates a review action so you can update the RAMS/COSHH/etc yourself and confirm it is right.
      </div>
      {RISK_REVIEW_KEYS.map(({ key, label }) => (
        <div key={key} className="card-dark p-3" data-testid={`ir-rr-${key}`}>
          <div className="flex items-start gap-3">
            <input type="checkbox" checked={!!rr[key]} onChange={() => toggle(key)} className="mt-1" data-testid={`ir-rr-check-${key}`} />
            <div className="flex-1">
              <div className="text-sm text-[#F0EDE8]">{label}</div>
              {rr[key] && (
                <div className="mt-2">
                  <Field label="Action / note">
                    <input className={inputClass} value={(rr.notes && rr.notes[key]) || ""} onChange={(e) => updateNote(key, e.target.value)} placeholder="e.g. Update RAMS control measure for spill containment" data-testid={`ir-rr-note-${key}`} />
                  </Field>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StepCapa({ data, setData }) {
  const list = data.capa || [];
  const add = () => setData(d => ({ ...d, capa: [...(d.capa || []), { id: crypto.randomUUID(), description: "", responsible: "", dueDate: "", priority: "Medium", status: "Open" }] }));
  const upd = (id, patch) => setData(d => ({ ...d, capa: d.capa.map(x => x.id === id ? { ...x, ...patch } : x) }));
  const del = (id) => setData(d => ({ ...d, capa: d.capa.filter(x => x.id !== id) }));
  return (
    <div data-testid="ir-step-7-capa">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Corrective & Preventive Actions</div>
        <button onClick={add} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#E8A020] text-black text-xs font-medium" data-testid="ir-capa-add"><Plus size={12} /> Add action</button>
      </div>
      {list.length === 0 && <div className="card-dark p-4 text-center text-xs text-[#A19D94]">No corrective actions logged. Every incident should drive at least one action to prevent recurrence.</div>}
      {list.map((row, i) => (
        <div key={row.id} className="card-dark p-3 mb-2" data-testid={`ir-capa-row-${i + 1}`}>
          <div className="flex items-center justify-between mb-2"><span className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Action #{i + 1}</span><button onClick={() => del(row.id)} className="text-[#A19D94] hover:text-[#F27C7C]"><Trash2 size={14} /></button></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Field label="Action required"><textarea className={`${inputClass} min-h-[52px]`} value={row.description || ""} onChange={(e) => upd(row.id, { description: e.target.value })} data-testid={`ir-capa-description-${i + 1}`} /></Field>
            <Field label="Responsible person"><input className={inputClass} value={row.responsible || ""} onChange={(e) => upd(row.id, { responsible: e.target.value })} data-testid={`ir-capa-responsible-${i + 1}`} /></Field>
            <Field label="Due date"><input type="date" className={inputClass} value={row.dueDate || ""} onChange={(e) => upd(row.id, { dueDate: e.target.value })} data-testid={`ir-capa-due-${i + 1}`} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Priority">
                <select className={inputClass} value={row.priority || "Medium"} onChange={(e) => upd(row.id, { priority: e.target.value })} data-testid={`ir-capa-priority-${i + 1}`}>
                  {["Low", "Medium", "High", "Critical"].map(x => <option key={x} value={x}>{x}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select className={inputClass} value={row.status || "Open"} onChange={(e) => upd(row.id, { status: e.target.value })} data-testid={`ir-capa-status-${i + 1}`}>
                  {["Open", "In progress", "Blocked", "Done"].map(x => <option key={x} value={x}>{x}</option>)}
                </select>
              </Field>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StepLinked({ data, setData, docs }) {
  const KINDS = [
    { key: "rams", label: "RAMS", tools: ["rams"] },
    { key: "methodStatement", label: "Method Statement", tools: ["method-statement"] },
    { key: "coshh", label: "COSHH", tools: ["coshh"] },
    { key: "toolboxTalk", label: "Toolbox Talks", tools: ["toolbox-talk"] },
    { key: "riskRegister", label: "Risk Assessments", tools: ["risk-register"] },
    { key: "siteDiary", label: "Site Diary", tools: ["site-diary"] },
  ];
  const linked = data.linkedDocuments || {};
  const toggle = (kind, doc) => {
    const list = linked[kind] || [];
    const on = list.some(d => d.id === doc.id);
    const next = on ? list.filter(d => d.id !== doc.id) : [...list, { id: doc.id, title: doc.title, refNumber: doc.refNumber, toolId: doc.toolId }];
    setData(d => ({ ...d, linkedDocuments: { ...linked, [kind]: next } }));
  };
  return (
    <div className="space-y-4" data-testid="ir-step-8-linked">
      {KINDS.map(k => {
        const avail = docs.filter(d => k.tools.includes(d.toolId));
        const selected = linked[k.key] || [];
        return (
          <div key={k.key}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">{k.label}</div>
              <div className="text-xs text-[#706D66]">{selected.length} linked · {avail.length} available</div>
            </div>
            {avail.length === 0 ? <div className="card-dark p-3 text-xs text-[#706D66]">No {k.label} documents yet.</div> : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {avail.slice(0, 6).map(d => {
                  const on = selected.some(x => x.id === d.id);
                  return (
                    <button key={d.id} onClick={() => toggle(k.key, d)} type="button" className={`card-dark p-3 text-left ${on ? "border-[#E8A020]/60 bg-[#E8A020]/5" : "hover:border-[#E8A020]/40"}`} data-testid={`ir-link-${d.id}`}>
                      <div className="flex items-start gap-2">
                        <div className={`mt-1 w-4 h-4 rounded border ${on ? "bg-[#E8A020] border-[#E8A020]" : "border-[#2a2620]"}`}>{on && <CheckCircle2 size={14} className="text-black" />}</div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-[#F0EDE8] truncate">{d.title}</div>
                          <div className="text-[11px] text-[#A19D94]">{d.refNumber || "no ref"} · {(d.createdAt || "").slice(0, 10)}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepSignoff({ data, user, previewUrl, onPreview, onSave, saving, onOpenSign, set }) {
  const openCapa = (data.capa || []).filter(a => (a.status || "Open").toLowerCase() !== "done" && (a.status || "Open").toLowerCase() !== "closed" && (a.status || "Open").toLowerCase() !== "complete" && (a.status || "Open").toLowerCase() !== "completed").length;
  return (
    <div className="space-y-5" data-testid="ir-step-9-signoff">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <div className="card-dark p-3"><Label>Type</Label><div className="text-lg text-[#F0EDE8] mt-1 truncate">{data.incidentType || "—"}</div></div>
        <div className="card-dark p-3"><Label>Severity</Label><div className="text-lg text-[#F0EDE8] mt-1">{data.severity || "—"}</div></div>
        <div className="card-dark p-3"><Label>Injured</Label><div className="text-lg text-[#F0EDE8] mt-1">{(data.injuredPersons || []).length}</div></div>
        <div className="card-dark p-3"><Label>Witnesses</Label><div className="text-lg text-[#F0EDE8] mt-1">{(data.witnesses || []).length}</div></div>
        <div className="card-dark p-3"><Label>Photos</Label><div className="text-lg text-[#F0EDE8] mt-1">{(data.photos || []).length}</div></div>
        <div className="card-dark p-3"><Label>CAPA open</Label><div className={`text-lg mt-1 ${openCapa > 0 ? "text-[#E8A020]" : "text-[#F0EDE8]"}`}>{openCapa}</div></div>
      </div>

      <Field label="Additional notes" hint="Anything relevant for the sign-off record."><textarea className={`${inputClass} min-h-[64px]`} value={data.notes} onChange={(e) => set("notes")(e.target.value)} data-testid="ir-notes" /></Field>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SignBox title="Prepared by" name={data.preparedBy || user?.fullName || ""} sig={data.preparedSignature} onChangeName={(v) => set("preparedBy")(v)} onSign={() => onOpenSign("prepared")} testId="prepared" />
        <SignBox title="Reviewed by" name={data.reviewedBy} sig={data.reviewedSignature} onChangeName={(v) => set("reviewedBy")(v)} onSign={() => onOpenSign("reviewed")} testId="reviewed" />
        <SignBox title="Approved by" name={data.approvedBy} sig={data.approvedSignature} onChangeName={(v) => set("approvedBy")(v)} onSign={() => onOpenSign("approved")} testId="approved" />
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={onPreview} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#F0EDE8] hover:border-[#E8A020]" data-testid="ir-preview-btn"><RefreshCw size={14} /> {previewUrl ? "Refresh" : "Generate"} preview</button>
        <button onClick={onSave} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-60" data-testid="ir-save-btn">
          <Download size={16} /> {saving ? "Saving..." : "Save & Generate PDF"}
        </button>
      </div>

      {previewUrl && <iframe title="Incident Report Preview" src={previewUrl} className="w-full h-[500px] rounded-md border border-[#2a2620] bg-white" data-testid="ir-preview-iframe" />}

      <div className="card-dark p-4 text-xs text-[#706D66] space-y-1">
        <div>Save records the incident, downloads the professional PDF, adds it to your Document Library and emits an event on the linked project timeline.</div>
        <div>Any Corrective Action past its due date will appear on the Command Centre until it is closed.</div>
      </div>
    </div>
  );
}

function SignBox({ title, name, sig, onChangeName, onSign, testId }) {
  return (
    <div className="card-dark p-4">
      <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-3">{title}</div>
      <Field label="Name"><input className={inputClass} value={name || ""} onChange={(e) => onChangeName(e.target.value)} data-testid={`ir-${testId}-name`} /></Field>
      <div className="mt-3">
        <Label>Signature</Label>
        <div className="mt-1 flex items-center gap-3">
          {sig ? (
            <img alt="Signature" src={sig} className="h-12 w-40 rounded-md border border-[#2a2620] bg-white" />
          ) : (
            <div className="h-12 w-40 rounded-md border border-dashed border-[#2a2620] flex items-center justify-center text-[10px] text-[#706D66]">Not signed</div>
          )}
          <button onClick={onSign} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid={`ir-sign-${testId}`}><PenTool size={12} /> {sig ? "Re-sign" : "Sign"}</button>
        </div>
      </div>
    </div>
  );
}

function buildSummary(d) {
  return `INCIDENT REPORT — ${d.incidentType || "Incident"} — ${d.projectName || "Project"} — ${d.date || ""}\nSeverity: ${d.severity || "—"} · Status: ${d.status || "Open"}\nLocation: ${d.location || "—"}\nRoot cause: ${d.rootCause || "—"}\nCAPA: ${(d.capa || []).length}  ·  Photos: ${(d.photos || []).length}  ·  Witnesses: ${(d.witnesses || []).length}`;
}
