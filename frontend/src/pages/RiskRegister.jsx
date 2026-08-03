// Morris — Risk Assessment V2 (Flagship central H&S record)
// Dashboard-first: 4 stat cards + recent + templates + filters.
// 12-step wizard: Project → Activity → Hazards → Persons at risk → Existing controls
// → Initial risk rating → Additional controls → Residual risk → Photos → Linked docs
// → Sign-off (triple) → Preview & Generate PDF.

import { useEffect, useMemo, useState, Fragment } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus, Search, RefreshCw, Trash2, Edit2, X, ChevronLeft, ChevronRight,
  ClipboardList, Activity, AlertTriangle, Users, Shield, TrendingDown,
  Camera, Link2, Download, PenTool, Copy, Star, Save, CheckCircle2, Sparkle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import AttachMedia from "../components/AttachMedia";
import SignaturePad from "../components/SignaturePad";
import { downloadRiskAssessmentPdf, riskAssessmentPdfBlobUrl } from "../lib/risk-assessment-pdf";
import { saveToolData } from "../lib/tool-persistence";

const TOOL_ID = "risk-register";
const DRAFT_KEY = "morris.tool_draft.risk-assessment";

const WIZARD_STEPS = [
  { id: 1,  key: "project",     label: "Project",           icon: ClipboardList },
  { id: 2,  key: "activity",    label: "Activity",          icon: Activity },
  { id: 3,  key: "hazards",     label: "Hazards",           icon: AlertTriangle },
  { id: 4,  key: "persons",     label: "Persons at Risk",   icon: Users },
  { id: 5,  key: "existing",    label: "Existing Controls", icon: Shield },
  { id: 6,  key: "initial",     label: "Initial Rating",    icon: AlertTriangle },
  { id: 7,  key: "additional",  label: "Additional Controls", icon: Sparkle },
  { id: 8,  key: "residual",    label: "Residual Rating",   icon: TrendingDown },
  { id: 9,  key: "evidence",    label: "Photos & Evidence", icon: Camera },
  { id: 10, key: "linked",      label: "Linked Docs",       icon: Link2 },
  { id: 11, key: "signoff",     label: "Sign-off",          icon: PenTool },
  { id: 12, key: "generate",    label: "Preview & Generate", icon: Download },
];

const PERSONS_AT_RISK = ["Operatives", "Subcontractors", "Visitors", "Members of Public", "Emergency Services", "Young Persons", "New/Expectant Mothers", "Others"];
const STATUSES = ["Draft", "Active", "Under Review", "Closed"];
const LIKELIHOOD = [{ v: 1, l: "1 · Rare" }, { v: 2, l: "2 · Unlikely" }, { v: 3, l: "3 · Possible" }, { v: 4, l: "4 · Likely" }, { v: 5, l: "5 · Almost certain" }];
const SEVERITY = [{ v: 1, l: "1 · Insignificant" }, { v: 2, l: "2 · Minor" }, { v: 3, l: "3 · Moderate" }, { v: 4, l: "4 · Major" }, { v: 5, l: "5 · Catastrophic" }];

const inputClass = "w-full bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none";
const Label = ({ children }) => <label className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">{children}</label>;
const Field = ({ label, children, hint }) => (
  <div>
    <Label>{label}</Label>
    <div className="mt-1">{children}</div>
    {hint && <div className="text-[11px] text-[#706D66] mt-1">{hint}</div>}
  </div>
);

function ratingFromScore(score) {
  const n = Number(score) || 0;
  if (n >= 16) return "Extreme";
  if (n >= 10) return "High";
  if (n >= 5)  return "Medium";
  if (n >= 1)  return "Low";
  return "";
}
function ratingBg(rating) {
  return {
    Low: "bg-[#68D391]/20 text-[#68D391] border-[#68D391]/40",
    Medium: "bg-[#E8C048]/20 text-[#E8C048] border-[#E8C048]/40",
    High: "bg-[#E8823C]/20 text-[#E8823C] border-[#E8823C]/40",
    Extreme: "bg-[#DC4040]/20 text-[#F27C7C] border-[#DC4040]/40",
  }[rating] || "bg-[#0f0d09] text-[#A19D94] border-[#2a2620]";
}

const emptyHazard = () => ({
  id: crypto.randomUUID(),
  hazard: "", description: "", personsAtRisk: [],
  existingControls: "",
  initialLikelihood: 3, initialSeverity: 3, initialScore: 9, initialRating: "Medium",
  additionalControls: "",
  residualLikelihood: 2, residualSeverity: 2, residualScore: 4, residualRating: "Low",
  actionOwner: "", dueDate: "", notes: "",
});

const emptyEntry = () => {
  const inOneYear = new Date(); inOneYear.setFullYear(inOneYear.getFullYear() + 1);
  return {
    projectId: "", projectName: "", clientName: "", siteAddress: "", principalContractor: "", documentRef: "",
    activity: "", activityDescription: "",
    assessmentDate: new Date().toISOString().slice(0, 10),
    reviewDate: inOneYear.toISOString().slice(0, 10),
    assessor: "", status: "Active",
    hazards: [emptyHazard()],
    personsAtRisk: ["Operatives"],
    photos: [],
    linkedDocuments: { rams: [], methodStatement: [], coshh: [], toolboxTalk: [], siteDiary: [], incidentReport: [] },
    notes: "",
    preparedBy: "", preparedSignature: "",
    reviewedBy: "", reviewedSignature: "",
    approvedBy: "", approvedSignature: "",
    isFavourite: false,
  };
};

function saveDraft(d) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ } }
function loadDraft() { try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }

export default function RiskAssessmentV2() {
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
  const [filterStatus, setFilterStatus] = useState("");
  const [filterRisk, setFilterRisk] = useState("");
  const [editing, setEditing] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [eRes, sRes, tRes, jRes] = await Promise.allSettled([
        api.get("/risk-assessment/entries"),
        api.get("/risk-assessment/stats"),
        api.get("/risk-assessment/templates"),
        api.get("/jobs"),
      ]);
      if (eRes.status === "fulfilled") setEntries(eRes.value.data);
      if (sRes.status === "fulfilled") setStats(sRes.value.data);
      if (tRes.status === "fulfilled") setTemplates(tRes.value.data);
      if (jRes.status === "fulfilled") setJobs(jRes.value.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);

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
      base = { ...base, ...(fromTemplate.payload || {}), id: undefined, assessmentDate: base.assessmentDate, reviewDate: base.reviewDate };
      // Reassign hazard ids
      if (Array.isArray(base.hazards)) base.hazards = base.hazards.map(h => ({ ...h, id: crypto.randomUUID() }));
    } else {
      const savedDraft = loadDraft();
      if (savedDraft && !savedDraft.id) base = { ...base, ...savedDraft, id: undefined };
    }
    setEditing(base); setWizardOpen(true);
  };
  const openEdit = (e) => { setEditing({ ...emptyEntry(), ...e }); setWizardOpen(true); };
  const duplicate = (e) => {
    const copy = { ...e }; delete copy.id; delete copy.createdAt; delete copy.updatedAt; delete copy._id;
    copy.assessmentDate = new Date().toISOString().slice(0, 10);
    copy.hazards = (copy.hazards || []).map(h => ({ ...h, id: crypto.randomUUID() }));
    copy.preparedSignature = ""; copy.reviewedSignature = ""; copy.approvedSignature = "";
    setEditing({ ...emptyEntry(), ...copy });
    setWizardOpen(true);
  };
  const deleteEntry = async (e) => {
    if (!window.confirm(`Delete risk assessment for "${e.activity || "activity"}"?`)) return;
    try { await api.delete(`/risk-assessment/entries/${e.id}`); toast.success("Deleted"); await loadAll(); }
    catch { toast.error("Delete failed"); }
  };
  const toggleFav = async (e) => {
    try { await api.patch(`/risk-assessment/entries/${e.id}`, { isFavourite: !e.isFavourite }); await loadAll(); }
    catch { toast.error("Failed"); }
  };
  const deleteTemplate = async (id) => {
    if (!window.confirm("Delete template?")) return;
    try { await api.delete(`/risk-assessment/templates/${id}`); setTemplates(templates.filter(x => x.id !== id)); toast.success("Deleted"); }
    catch { toast.error("Failed"); }
  };

  const projects = useMemo(() => { const s = new Set(); entries.forEach(a => a.projectName && s.add(a.projectName)); return [...s]; }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(e => {
      if (q) {
        const hazText = (e.hazards || []).map(h => `${h.hazard || ""} ${h.description || ""}`).join(" ");
        const hay = `${e.activity || ""} ${e.activityDescription || ""} ${e.projectName || ""} ${e.assessor || ""} ${hazText}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterProject) {
        if (e.projectId !== filterProject && e.projectName !== filterProject) return false;
      }
      if (filterStatus && (e.status || "Active") !== filterStatus) return false;
      if (filterRisk) {
        const has = (e.hazards || []).some(h => (h.residualRating || "").toLowerCase() === filterRisk.toLowerCase());
        if (!has) return false;
      }
      return true;
    });
  }, [entries, query, filterProject, filterStatus, filterRisk]);

  const favourites = entries.filter(e => e.isFavourite);
  const recent = [...entries].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")).slice(0, 5);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="risk-assessment-page">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Health & Safety</div>
          <h1 className="font-display text-3xl sm:text-4xl text-[#F0EDE8]">Risk Assessments</h1>
          <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">The central Health & Safety record. Identify hazards, assess risk (5×5 likelihood × severity), track controls and generate a professional PDF suitable for clients, principal contractors and audits.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll} className="text-xs text-[#A19D94] hover:text-[#E8A020] flex items-center gap-1" data-testid="ra-refresh"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh</button>
          <button onClick={() => openNew()} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040]" data-testid="ra-new-btn"><Plus size={14} /> New Risk Assessment</button>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Active assessments" value={stats?.active ?? 0} icon={Shield} tone="green" testId="ra-stat-active" />
        <StatCard label="Reviews due" value={stats?.reviewsDue ?? 0} icon={RefreshCw} tone="gold" testId="ra-stat-due" />
        <StatCard label="High risks" value={stats?.highRisks ?? 0} icon={AlertTriangle} tone="red" testId="ra-stat-high" />
        <StatCard label="Total" value={stats?.total ?? 0} icon={ClipboardList} testId="ra-stat-total" />
      </div>

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
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Recent assessments</div>
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
              <div key={t.id} className="card-dark p-3 flex items-start justify-between gap-2" data-testid={`ra-template-${t.id}`}>
                <button onClick={() => openNew(t)} className="text-left flex-1 min-w-0">
                  <div className="text-sm text-[#F0EDE8] truncate">{t.name}</div>
                  <div className="text-[11px] text-[#A19D94] truncate">Risk template</div>
                </button>
                <button onClick={() => deleteTemplate(t.id)} className="text-[#706D66] hover:text-[#F27C7C] p-1"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card-dark p-4 mb-4" data-testid="ra-filters">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="relative md:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search activity, project, hazards..." className={`${inputClass} pl-9`} data-testid="ra-search" />
          </div>
          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className={inputClass} data-testid="ra-filter-project">
            <option value="">All projects</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={inputClass} data-testid="ra-filter-status">
            <option value="">All status</option>
            {STATUSES.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <select value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)} className={inputClass} data-testid="ra-filter-risk">
            <option value="">Any residual risk</option>
            {["Low", "Medium", "High", "Extreme"].map(x => <option key={x} value={x}>{x} residual</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card-dark p-8 text-center text-sm text-[#A19D94]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card-dark p-10 text-center" data-testid="ra-empty">
          <Shield size={28} className="mx-auto text-[#E8A020] mb-3" />
          <div className="text-base text-[#F0EDE8]">No risk assessments {entries.length > 0 ? "match your filters" : "yet"}</div>
          {entries.length === 0 && <div className="text-xs text-[#A19D94] mt-1 max-w-sm mx-auto">Assess each significant activity. Well-written risk assessments are what regulators and principal contractors want to see first.</div>}
          <button onClick={() => openNew()} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium"><Plus size={14} /> Create your first</button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(e => <EntryRow key={e.id} e={e} onEdit={() => openEdit(e)} onDelete={() => deleteEntry(e)} onDuplicate={() => duplicate(e)} onFav={() => toggleFav(e)} />)}
        </div>
      )}

      {wizardOpen && editing && (
        <RiskWizard
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

function EntryRow({ e, onEdit, onDelete, onDuplicate, onFav }) {
  const hazards = e.hazards || [];
  const highs = hazards.filter(h => ["high", "extreme"].includes((h.residualRating || "").toLowerCase())).length;
  return (
    <div className="card-dark p-4 flex items-start gap-3" data-testid={`ra-row-${e.id}`}>
      <button onClick={onFav} className={`p-1 mt-1 ${e.isFavourite ? "text-[#E8A020]" : "text-[#706D66] hover:text-[#E8A020]"}`} aria-label="Favourite"><Star size={14} fill={e.isFavourite ? "#E8A020" : "none"} /></button>
      <button onClick={onEdit} className="text-left flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base text-[#F0EDE8] font-medium truncate">{e.activity || "Untitled activity"}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#2a2620] text-[#A19D94]">{e.status || "Active"}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#E8A020]/40 text-[#E8A020]">{hazards.length} hazard{hazards.length === 1 ? "" : "s"}</span>
          {highs > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#F27C7C]/40 text-[#F27C7C]">{highs} High/Extreme residual</span>}
        </div>
        <div className="text-xs text-[#A19D94] mt-1 flex flex-wrap gap-x-3">
          {e.projectName && <span>{e.projectName}</span>}
          {e.assessmentDate && <span>Assessed: {e.assessmentDate}</span>}
          {e.reviewDate && <span>Next review: {e.reviewDate}</span>}
        </div>
      </button>
      <div className="flex gap-1 shrink-0">
        <button onClick={onEdit} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`ra-row-edit-${e.id}`}><Edit2 size={14} /></button>
        <button onClick={onDuplicate} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`ra-row-dup-${e.id}`}><Copy size={14} /></button>
        <button onClick={onDelete} className="p-2 text-[#A19D94] hover:text-[#F27C7C]" data-testid={`ra-row-delete-${e.id}`}><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

function MiniRow({ e, onOpen }) {
  return (
    <button onClick={onOpen} className="card-dark p-3 text-left hover:border-[#E8A020]/40">
      <div className="text-sm text-[#F0EDE8] truncate">{e.activity || "Untitled"} <span className="text-[11px] text-[#A19D94]">· {e.projectName || "—"}</span></div>
      <div className="text-[11px] text-[#A19D94] truncate">{(e.hazards || []).length} hazards · {e.status || "Active"} · Next review {e.reviewDate || "—"}</div>
    </button>
  );
}

// ================================================================
// WIZARD
// ================================================================
function RiskWizard({ initial, user, jobs, onClose, onSaved, onTemplatesChanged }) {
  const [data, setData] = useState(initial);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [docs, setDocs] = useState([]);
  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [signingOpen, setSigningOpen] = useState(null);
  const [activeHazardIdx, setActiveHazardIdx] = useState(0);

  useEffect(() => { api.get("/documents").then(r => setDocs(Array.isArray(r.data) ? r.data : [])).catch(() => {}); }, []);
  useEffect(() => { if (user?.fullName && !data.assessor) setData(d => ({ ...d, assessor: user.fullName })); }, [user?.fullName]);
  useEffect(() => { if (user?.fullName && !data.preparedBy) setData(d => ({ ...d, preparedBy: user.fullName })); }, [user?.fullName]);
  useEffect(() => { if (!data.id) { const t = setTimeout(() => saveDraft(data), 500); return () => clearTimeout(t); } }, [data]);

  const pickProject = (id) => {
    const j = jobs.find(x => x.id === id);
    if (!j) return;
    setData(d => ({ ...d, projectId: j.id, projectName: j.projectName || j.clientName || d.projectName, clientName: j.clientName || d.clientName, siteAddress: j.address || d.siteAddress, principalContractor: j.principalContractor || d.principalContractor }));
  };
  const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));

  // Hazard operations
  const addHazard = () => setData(d => ({ ...d, hazards: [...(d.hazards || []), emptyHazard()] }));
  const updHazard = (id, patch) => setData(d => {
    const list = (d.hazards || []).map(h => {
      if (h.id !== id) return h;
      const next = { ...h, ...patch };
      const iL = Number(next.initialLikelihood) || 0, iS = Number(next.initialSeverity) || 0;
      const rL = Number(next.residualLikelihood) || 0, rS = Number(next.residualSeverity) || 0;
      next.initialScore = iL * iS;
      next.residualScore = rL * rS;
      next.initialRating = ratingFromScore(next.initialScore);
      next.residualRating = ratingFromScore(next.residualScore);
      return next;
    });
    return { ...d, hazards: list };
  });
  const delHazard = (id) => setData(d => {
    const list = (d.hazards || []).filter(h => h.id !== id);
    return { ...d, hazards: list.length > 0 ? list : [emptyHazard()] };
  });

  const generatePreview = () => {
    try { setPreviewUrl(riskAssessmentPdfBlobUrl({ data, user, today: new Date().toLocaleDateString("en-GB") })); }
    catch { toast.error("Preview failed"); }
  };

  const saveEntry = async () => {
    if (!data.activity) { toast.error("Activity is required"); setStep(2); return; }
    if (!data.assessmentDate) { toast.error("Assessment date is required"); setStep(2); return; }
    setSaving(true);
    try {
      let saved;
      if (data.id) {
        const r = await api.patch(`/risk-assessment/entries/${data.id}`, data); saved = r.data;
      } else {
        const r = await api.post("/risk-assessment/entries", data); saved = r.data;
      }
      try {
        await api.post("/documents/save", {
          title: `Risk Assessment — ${data.activity || "Activity"} — ${data.projectName || "Project"}`,
          toolId: TOOL_ID,
          refNumber: data.documentRef || `RA-${(saved.id || "").slice(0, 8)}`,
          jobId: data.projectId || null,
          content: buildSummary(saved),
          metadata: { ...saved, photos: (data.photos || []).map(p => ({ id: p.id, url: p.url, caption: p.description || p.caption })) },
        });
      } catch { /* soft-fail */ }
      downloadRiskAssessmentPdf({ data: { ...saved }, user, today: new Date().toLocaleDateString("en-GB") });
      try { saveToolData(TOOL_ID, { generatedAt: new Date().toISOString(), projectId: data.projectId || null, id: saved.id, activity: data.activity }); } catch { /* ignore */ }
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      toast.success("Risk assessment saved");
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const saveAsTemplate = async () => {
    if (!tplName.trim()) return toast.error("Template name required");
    try {
      const payload = { ...data, id: undefined, assessmentDate: undefined, reviewDate: undefined, photos: [], preparedSignature: "", reviewedSignature: "", approvedSignature: "", notes: "" };
      await api.post("/risk-assessment/templates", { name: tplName.trim(), payload });
      toast.success("Template saved");
      setTplModalOpen(false); setTplName("");
      try { const tRes = await api.get("/risk-assessment/templates"); if (Array.isArray(tRes.data)) onTemplatesChanged(tRes.data); } catch { /* ignore */ }
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
  };

  const hazards = data.hazards || [];
  const activeHazard = hazards[activeHazardIdx] || hazards[0] || emptyHazard();

  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-y-auto" data-testid="ra-wizard">
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-5xl mx-auto card-dark p-5 md:p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-1">{data.id ? "Edit" : "New"} Risk Assessment</div>
              <h2 className="font-display text-2xl text-[#F0EDE8]">{data.activity || "Untitled"} <span className="text-sm text-[#A19D94]">· {data.projectName || "no project"}</span></h2>
            </div>
            <button onClick={onClose} className="text-[#A19D94] hover:text-[#F0EDE8]" data-testid="ra-wizard-close"><X size={20} /></button>
          </div>

          <div className="flex justify-end mb-3">
            <button onClick={() => setTplModalOpen(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="ra-save-template-btn">
              <Save size={12} /> Save as template
            </button>
          </div>

          <div className="overflow-x-auto mb-5" data-testid="ra-stepper">
            <div className="flex gap-1 min-w-max">
              {WIZARD_STEPS.map(s => (
                <button key={s.id} onClick={() => setStep(s.id)} data-testid={`ra-step-${s.id}`}
                  className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${step === s.id ? "bg-[#E8A020] text-black" : step > s.id ? "bg-[#1e1a12] text-[#68D391] border border-[#68D391]/30" : "bg-[#0f0d09] text-[#A19D94] border border-[#2a2620]"}`}>
                  {s.id}. {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Hazard picker (used by steps 3, 5, 6, 7, 8) */}
          {[3, 5, 6, 7, 8].includes(step) && hazards.length > 0 && (
            <div className="mb-4 flex items-center gap-2 flex-wrap" data-testid="ra-hazard-picker">
              <Label>Hazard</Label>
              <div className="flex flex-wrap gap-2">
                {hazards.map((h, i) => (
                  <button key={h.id} onClick={() => setActiveHazardIdx(i)} className={`px-3 py-1 rounded-md text-xs border ${activeHazardIdx === i ? "border-[#E8A020] bg-[#E8A020]/10 text-[#E8A020]" : "border-[#2a2620] text-[#A19D94]"}`} data-testid={`ra-hazard-pill-${i + 1}`}>
                    #{i + 1} {h.hazard ? `· ${h.hazard.slice(0, 20)}` : ""}
                  </button>
                ))}
                <button onClick={() => { addHazard(); setActiveHazardIdx(hazards.length); }} className="px-3 py-1 rounded-md text-xs border border-[#E8A020] bg-[#E8A020] text-black" data-testid="ra-add-hazard"><Plus size={12} className="inline" /> Add hazard</button>
              </div>
            </div>
          )}

          {step === 1 && <StepProject data={data} pickProject={pickProject} jobs={jobs} user={user} set={set} />}
          {step === 2 && <StepActivity data={data} set={set} />}
          {step === 3 && <StepHazardIdent hazard={activeHazard} updHazard={updHazard} delHazard={delHazard} hazards={hazards} />}
          {step === 4 && <StepPersons data={data} setData={setData} />}
          {step === 5 && <StepExistingControls hazard={activeHazard} updHazard={updHazard} />}
          {step === 6 && <StepRating hazard={activeHazard} updHazard={updHazard} mode="initial" />}
          {step === 7 && <StepAdditionalControls hazard={activeHazard} updHazard={updHazard} />}
          {step === 8 && <StepRating hazard={activeHazard} updHazard={updHazard} mode="residual" />}
          {step === 9 && (
            <div className="space-y-3" data-testid="ra-step-9-evidence">
              <p className="text-xs text-[#A19D94]">Attach evidence photos from the Photo Vault — hazard illustrations, control measures in use, PPE.</p>
              <AttachMedia toolId={TOOL_ID} toolLabel="Risk Assessment" jobId={data.projectId || null} category="risk-assessment"
                value={data.photos || []} onChange={(list) => set("photos")(list)} testIdPrefix="ra-attach" />
            </div>
          )}
          {step === 10 && <StepLinked data={data} setData={setData} docs={docs} />}
          {step === 11 && <StepSignoff data={data} user={user} set={set} onOpenSign={setSigningOpen} />}
          {step === 12 && <StepGenerate data={data} previewUrl={previewUrl} onPreview={generatePreview} onSave={saveEntry} saving={saving} set={set} />}

          <div className="flex items-center justify-between mt-6">
            <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94] disabled:opacity-40" data-testid="ra-btn-prev"><ChevronLeft size={14} /> Back</button>
            <span className="text-xs text-[#706D66]">Step {step} of {WIZARD_STEPS.length}</span>
            <button onClick={() => setStep(Math.min(WIZARD_STEPS.length, step + 1))} disabled={step === WIZARD_STEPS.length} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-40" data-testid="ra-btn-next">Next <ChevronRight size={14} /></button>
          </div>
        </div>

        {tplModalOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="ra-template-modal">
            <div className="card-dark p-6 max-w-md w-full">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-display text-2xl text-[#F0EDE8]">Save as template</h3>
                <button onClick={() => setTplModalOpen(false)} className="text-[#A19D94]"><X size={18} /></button>
              </div>
              <p className="text-xs text-[#A19D94] mb-3">Reusable skeleton (activity + hazards + controls). Dates, photos, signatures and notes are stripped.</p>
              <Field label="Template name"><input className={inputClass} value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Working at height (MEWP)" data-testid="ra-template-name" /></Field>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setTplModalOpen(false)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button>
                <button onClick={saveAsTemplate} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="ra-template-save">Save template</button>
              </div>
            </div>
          </div>
        )}

        {signingOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="ra-sign-modal">
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
                <button onClick={() => setSigningOpen(null)} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="ra-sign-done">Done</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepProject({ data, pickProject, jobs, user, set }) {
  return (
    <div className="space-y-4" data-testid="ra-step-1-project">
      {jobs.length > 0 && (
        <Field label="Link to project (recommended)" hint="Auto-fills client, site and principal contractor.">
          <select value={data.projectId} onChange={(e) => pickProject(e.target.value)} className={inputClass} data-testid="ra-link-project">
            <option value="">Not linked</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.projectName || j.clientName} — {j.address || "no address"}</option>)}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Project name"><input className={inputClass} value={data.projectName} onChange={(e) => set("projectName")(e.target.value)} data-testid="ra-projectName" /></Field>
        <Field label="Client"><input className={inputClass} value={data.clientName} onChange={(e) => set("clientName")(e.target.value)} /></Field>
        <Field label="Principal contractor"><input className={inputClass} value={data.principalContractor} onChange={(e) => set("principalContractor")(e.target.value)} /></Field>
        <Field label="Site address"><textarea className={`${inputClass} min-h-[52px]`} value={data.siteAddress} onChange={(e) => set("siteAddress")(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Assessor"><input className={inputClass} value={data.assessor || user?.fullName || ""} onChange={(e) => set("assessor")(e.target.value)} data-testid="ra-assessor" /></Field>
        <Field label="Status">
          <select className={inputClass} value={data.status || "Active"} onChange={(e) => set("status")(e.target.value)} data-testid="ra-status">
            {STATUSES.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </Field>
      </div>
    </div>
  );
}

function StepActivity({ data, set }) {
  return (
    <div className="space-y-4" data-testid="ra-step-2-activity">
      <Field label="Activity being assessed *" hint="One activity per assessment (e.g. Working at height — MEWP)"><input className={inputClass} value={data.activity} onChange={(e) => set("activity")(e.target.value)} placeholder="e.g. Working at height — MEWP" data-testid="ra-activity" /></Field>
      <Field label="Description of the activity" hint="Scope, method, location, plant used."><textarea className={`${inputClass} min-h-[100px]`} value={data.activityDescription} onChange={(e) => set("activityDescription")(e.target.value)} data-testid="ra-activityDescription" /></Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Assessment date *"><input type="date" className={inputClass} value={data.assessmentDate} onChange={(e) => set("assessmentDate")(e.target.value)} data-testid="ra-assessmentDate" /></Field>
        <Field label="Next review date" hint="Assessments must be reviewed annually or on change of circumstance."><input type="date" className={inputClass} value={data.reviewDate} onChange={(e) => set("reviewDate")(e.target.value)} data-testid="ra-reviewDate" /></Field>
      </div>
    </div>
  );
}

function StepHazardIdent({ hazard, updHazard, delHazard, hazards }) {
  return (
    <div className="space-y-4" data-testid="ra-step-3-hazards">
      <div className="card-dark p-3 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">
        <strong className="text-[#E8A020]">Identify one hazard at a time.</strong> Add as many as you need using the pills above. Each hazard carries its own controls and risk rating.
      </div>
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Hazard #{hazards.findIndex(h => h.id === hazard.id) + 1}</div>
        {hazards.length > 1 && <button onClick={() => delHazard(hazard.id)} className="text-xs text-[#F27C7C] hover:underline"><Trash2 size={12} className="inline" /> Remove hazard</button>}
      </div>
      <Field label="Hazard *" hint="A short name (e.g. Fall from height, Manual handling, Silica dust)"><input className={inputClass} value={hazard.hazard} onChange={(e) => updHazard(hazard.id, { hazard: e.target.value })} data-testid="ra-hazard-name" /></Field>
      <Field label="Description" hint="How could this hazard cause harm?"><textarea className={`${inputClass} min-h-[80px]`} value={hazard.description} onChange={(e) => updHazard(hazard.id, { description: e.target.value })} data-testid="ra-hazard-description" /></Field>
    </div>
  );
}

function StepPersons({ data, setData }) {
  const toggle = (p) => {
    const current = data.personsAtRisk || [];
    const next = current.includes(p) ? current.filter(x => x !== p) : [...current, p];
    setData(d => ({ ...d, personsAtRisk: next }));
  };
  return (
    <div className="space-y-3" data-testid="ra-step-4-persons">
      <div className="card-dark p-3 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">
        Select every group of people who could be affected by the activity — not just your own operatives.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {PERSONS_AT_RISK.map(p => {
          const on = (data.personsAtRisk || []).includes(p);
          return (
            <button key={p} type="button" onClick={() => toggle(p)} className={`card-dark p-3 flex items-center gap-2 text-left ${on ? "border-[#E8A020]/60 bg-[#E8A020]/5" : "hover:border-[#E8A020]/40"}`} data-testid={`ra-person-${p.replace(/[^a-zA-Z]/g, "").toLowerCase()}`}>
              <div className={`w-4 h-4 rounded border ${on ? "bg-[#E8A020] border-[#E8A020]" : "border-[#2a2620]"} flex items-center justify-center`}>{on && <CheckCircle2 size={12} className="text-black" />}</div>
              <span className="text-sm text-[#F0EDE8]">{p}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepExistingControls({ hazard, updHazard }) {
  return (
    <div className="space-y-4" data-testid="ra-step-5-existing">
      <div className="card-dark p-3 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">
        List the controls <strong>already in place</strong> to reduce this hazard — PPE, training, safe systems of work.
      </div>
      <Field label={`Existing control measures for "${hazard.hazard || "hazard"}"`} hint="One control per line. Be specific — 'Harness clipped to fixed point at all times' is better than 'PPE worn'.">
        <textarea className={`${inputClass} min-h-[180px] font-mono`} value={hazard.existingControls} onChange={(e) => updHazard(hazard.id, { existingControls: e.target.value })} placeholder={"e.g. \n• MEWP operator IPAF trained and card checked\n• Harness with lanyard clipped to designated anchor\n• Exclusion zone below MEWP marked with cones and signs"} data-testid="ra-existingControls" />
      </Field>
    </div>
  );
}

function StepRating({ hazard, updHazard, mode }) {
  const isInit = mode === "initial";
  const lKey = isInit ? "initialLikelihood" : "residualLikelihood";
  const sKey = isInit ? "initialSeverity" : "residualSeverity";
  const scoreKey = isInit ? "initialScore" : "residualScore";
  const ratingKey = isInit ? "initialRating" : "residualRating";
  const score = hazard[scoreKey] || 0;
  const rating = hazard[ratingKey] || ratingFromScore(score);
  return (
    <div className="space-y-4" data-testid={`ra-step-${isInit ? 6 : 8}-rating`}>
      <div className="card-dark p-3 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">
        <strong className="text-[#E8A020]">{isInit ? "Initial risk rating" : "Residual risk rating (after additional controls)"}</strong> — score = Likelihood × Severity. Low 1-4, Medium 5-9, High 10-15, Extreme 16-25.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label={`Likelihood ${isInit ? "(with existing controls)" : "(after additional controls)"}`}>
          <select className={inputClass} value={hazard[lKey] || 3} onChange={(e) => updHazard(hazard.id, { [lKey]: Number(e.target.value) })} data-testid={`ra-${mode}-likelihood`}>
            {LIKELIHOOD.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}
          </select>
        </Field>
        <Field label={`Severity ${isInit ? "(worst-credible outcome now)" : "(worst-credible outcome after controls)"}`}>
          <select className={inputClass} value={hazard[sKey] || 3} onChange={(e) => updHazard(hazard.id, { [sKey]: Number(e.target.value) })} data-testid={`ra-${mode}-severity`}>
            {SEVERITY.map(x => <option key={x.v} value={x.v}>{x.l}</option>)}
          </select>
        </Field>
      </div>
      <div className="card-dark p-6 text-center">
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">{isInit ? "Initial" : "Residual"} risk score</div>
        <div className="mt-2 font-display text-6xl text-[#F0EDE8]" data-testid={`ra-${mode}-score`}>{score || "—"}</div>
        <div className={`mt-3 inline-block px-4 py-1.5 rounded-full text-sm border ${ratingBg(rating)}`} data-testid={`ra-${mode}-rating`}>{rating || "—"}</div>
      </div>
      <RiskMatrix likelihood={hazard[lKey]} severity={hazard[sKey]} />
    </div>
  );
}

function RiskMatrix({ likelihood, severity }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94] mb-2">5 × 5 risk matrix (cell highlighted)</div>
      <div className="inline-block border border-[#2a2620] rounded overflow-hidden">
        <div className="grid grid-cols-6 text-[10px]">
          <div className="p-2 bg-[#0f0d09] text-[#706D66]">L \ S</div>
          {[1, 2, 3, 4, 5].map(s => <div key={s} className="p-2 bg-[#0f0d09] text-[#A19D94] text-center">{s}</div>)}
          {[5, 4, 3, 2, 1].map(l => (
            <Fragment key={l}>
              <div className="p-2 bg-[#0f0d09] text-[#A19D94] text-center">{l}</div>
              {[1, 2, 3, 4, 5].map(s => {
                const score = l * s;
                const r = ratingFromScore(score);
                const active = Number(likelihood) === l && Number(severity) === s;
                return <div key={`${l}-${s}`} className={`p-2 text-center text-[10px] ${ratingBg(r)} ${active ? "ring-2 ring-[#F0EDE8]" : ""}`}>{score}</div>;
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepAdditionalControls({ hazard, updHazard }) {
  return (
    <div className="space-y-4" data-testid="ra-step-7-additional">
      <div className="card-dark p-3 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">
        List <strong>new</strong> controls needed to reduce the residual risk further (follow the hierarchy: Eliminate → Substitute → Engineering → Administrative → PPE).
      </div>
      <Field label={`Additional control measures for "${hazard.hazard || "hazard"}"`} hint="One control per line.">
        <textarea className={`${inputClass} min-h-[160px] font-mono`} value={hazard.additionalControls} onChange={(e) => updHazard(hazard.id, { additionalControls: e.target.value })} placeholder={"e.g. \n• Install temporary edge protection to reduce reliance on harness\n• Weekly toolbox talk on MEWP anchor points\n• Second person on the ground with radio"} data-testid="ra-additionalControls" />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Action owner"><input className={inputClass} value={hazard.actionOwner || ""} onChange={(e) => updHazard(hazard.id, { actionOwner: e.target.value })} placeholder="Who owns implementing the additional controls?" data-testid="ra-hazard-actionOwner" /></Field>
        <Field label="Due date"><input type="date" className={inputClass} value={hazard.dueDate || ""} onChange={(e) => updHazard(hazard.id, { dueDate: e.target.value })} data-testid="ra-hazard-dueDate" /></Field>
      </div>
    </div>
  );
}

function StepLinked({ data, setData, docs }) {
  const KINDS = [
    { key: "rams", label: "RAMS", tools: ["rams"] },
    { key: "methodStatement", label: "Method Statement", tools: ["method-statement"] },
    { key: "coshh", label: "COSHH", tools: ["coshh"] },
    { key: "toolboxTalk", label: "Toolbox Talks", tools: ["toolbox-talk"] },
    { key: "siteDiary", label: "Site Diary", tools: ["site-diary"] },
    { key: "incidentReport", label: "Incident Reports", tools: ["incident-report"] },
  ];
  const linked = data.linkedDocuments || {};
  const toggle = (kind, doc) => {
    const list = linked[kind] || [];
    const on = list.some(d => d.id === doc.id);
    const next = on ? list.filter(d => d.id !== doc.id) : [...list, { id: doc.id, title: doc.title, refNumber: doc.refNumber, toolId: doc.toolId }];
    setData(d => ({ ...d, linkedDocuments: { ...linked, [kind]: next } }));
  };
  return (
    <div className="space-y-4" data-testid="ra-step-10-linked">
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
                    <button key={d.id} onClick={() => toggle(k.key, d)} type="button" className={`card-dark p-3 text-left ${on ? "border-[#E8A020]/60 bg-[#E8A020]/5" : "hover:border-[#E8A020]/40"}`} data-testid={`ra-link-${d.id}`}>
                      <div className="flex items-start gap-2">
                        <div className={`mt-1 w-4 h-4 rounded border ${on ? "bg-[#E8A020] border-[#E8A020]" : "border-[#2a2620]"}`}>{on && <CheckCircle2 size={14} className="text-black" />}</div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-[#F0EDE8] truncate">{d.title}</div>
                          <div className="text-[11px] text-[#A19D94]">{d.refNumber || "no ref"}</div>
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

function StepSignoff({ data, user, set, onOpenSign }) {
  return (
    <div className="space-y-5" data-testid="ra-step-11-signoff">
      <div className="card-dark p-3 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">
        Every risk assessment must be prepared, reviewed and approved by named competent persons. Their signatures land on the PDF.
      </div>
      <Field label="Additional notes"><textarea className={`${inputClass} min-h-[64px]`} value={data.notes} onChange={(e) => set("notes")(e.target.value)} data-testid="ra-notes" /></Field>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SignBox title="Prepared by" name={data.preparedBy || user?.fullName || ""} sig={data.preparedSignature} onChangeName={(v) => set("preparedBy")(v)} onSign={() => onOpenSign("prepared")} testId="prepared" />
        <SignBox title="Reviewed by" name={data.reviewedBy} sig={data.reviewedSignature} onChangeName={(v) => set("reviewedBy")(v)} onSign={() => onOpenSign("reviewed")} testId="reviewed" />
        <SignBox title="Approved by" name={data.approvedBy} sig={data.approvedSignature} onChangeName={(v) => set("approvedBy")(v)} onSign={() => onOpenSign("approved")} testId="approved" />
      </div>
    </div>
  );
}

function SignBox({ title, name, sig, onChangeName, onSign, testId }) {
  return (
    <div className="card-dark p-4">
      <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-3">{title}</div>
      <Field label="Name"><input className={inputClass} value={name || ""} onChange={(e) => onChangeName(e.target.value)} data-testid={`ra-${testId}-name`} /></Field>
      <div className="mt-3">
        <Label>Signature</Label>
        <div className="mt-1 flex items-center gap-3">
          {sig ? (<img alt="Signature" src={sig} className="h-12 w-40 rounded-md border border-[#2a2620] bg-white" />) : (<div className="h-12 w-40 rounded-md border border-dashed border-[#2a2620] flex items-center justify-center text-[10px] text-[#706D66]">Not signed</div>)}
          <button onClick={onSign} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid={`ra-sign-${testId}`}><PenTool size={12} /> {sig ? "Re-sign" : "Sign"}</button>
        </div>
      </div>
    </div>
  );
}

function StepGenerate({ data, previewUrl, onPreview, onSave, saving }) {
  const hazards = data.hazards || [];
  const totalHigh = hazards.filter(h => ["High", "Extreme"].includes(h.residualRating)).length;
  return (
    <div className="space-y-4" data-testid="ra-step-12-generate">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-dark p-3"><Label>Hazards</Label><div className="text-2xl text-[#F0EDE8] mt-1">{hazards.length}</div></div>
        <div className="card-dark p-3"><Label>High/Extreme residual</Label><div className={`text-2xl mt-1 ${totalHigh > 0 ? "text-[#F27C7C]" : "text-[#68D391]"}`}>{totalHigh}</div></div>
        <div className="card-dark p-3"><Label>Photos</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.photos || []).length}</div></div>
        <div className="card-dark p-3"><Label>Next review</Label><div className="text-sm text-[#F0EDE8] mt-1">{data.reviewDate || "—"}</div></div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button onClick={onPreview} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#F0EDE8] hover:border-[#E8A020]" data-testid="ra-preview-btn"><RefreshCw size={14} /> {previewUrl ? "Refresh" : "Generate"} preview</button>
        <button onClick={onSave} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-60" data-testid="ra-save-btn">
          <Download size={16} /> {saving ? "Saving..." : "Save & Generate PDF"}
        </button>
      </div>
      {previewUrl && <iframe title="Risk Assessment Preview" src={previewUrl} className="w-full h-[500px] rounded-md border border-[#2a2620] bg-white" data-testid="ra-preview-iframe" />}
      <div className="card-dark p-4 text-xs text-[#706D66] space-y-1">
        <div>Save creates the assessment record, downloads the PDF, adds it to your Document Library and emits an event on the linked project timeline.</div>
        <div>Reviews due, and any High/Extreme residual risks, appear on the Command Centre until closed.</div>
      </div>
    </div>
  );
}

function buildSummary(d) {
  const h = (d.hazards || []).length;
  const highs = (d.hazards || []).filter(x => ["High", "Extreme"].includes(x.residualRating)).length;
  return `RISK ASSESSMENT — ${d.activity || "Activity"} — ${d.projectName || "Project"}\nAssessed: ${d.assessmentDate || "—"} · Review: ${d.reviewDate || "—"}\nHazards: ${h} · High/Extreme residual: ${highs}`;
}
