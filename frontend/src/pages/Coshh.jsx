// Morris — COSHH V2 (Hazardous Substance Management)
// Dashboard-first: users arrive at a project-scoped dashboard with counts,
// filters, search, and list of assessments. Click New or Edit to open the
// full 12-step wizard in a full-screen sheet.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus, Search, RefreshCw, Trash2, Edit2, X, ChevronLeft, ChevronRight,
  ClipboardList, FlaskConical, AlertTriangle, ShieldCheck, User,
  Camera, Link2, Star, Download, Save, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import AttachMedia from "../components/AttachMedia";
import { downloadCoshhPdf, coshhPdfBlobUrl } from "../lib/coshh-pdf";
import { saveToolData } from "../lib/tool-persistence";

const HAZARD_LEVELS = ["Low", "Medium", "High"];
const REVIEW_STATUSES = ["All", "Active", "Due", "Expired"];
const inputClass = "w-full bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none";
const Label = ({ children }) => <label className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">{children}</label>;
const Field = ({ label, children, hint }) => (<div><Label>{label}</Label><div className="mt-1">{children}</div>{hint && <div className="text-[11px] text-[#706D66] mt-1">{hint}</div>}</div>);

const PPE_ITEMS = [
  { id: "gloves", label: "Gloves", mark: "G" },
  { id: "goggles", label: "Goggles / Eye", mark: "E" },
  { id: "respirator", label: "Respirator", mark: "R" },
  { id: "faceShield", label: "Face Shield", mark: "F" },
  { id: "coveralls", label: "Coveralls", mark: "C" },
  { id: "boots", label: "Safety Boots", mark: "B" },
  { id: "hearing", label: "Hearing Protection", mark: "H" },
  { id: "other", label: "Other", mark: "?" },
];

const emptyAssessment = () => ({
  projectId: "", projectName: "", clientName: "", siteAddress: "",
  assessmentDate: new Date().toISOString().slice(0, 10),
  reviewDate: "", assessor: "",
  productName: "", manufacturer: "", supplier: "", productCode: "",
  description: "", quantityUsed: "", sdsUrl: "",
  hazardClassification: "", signalWord: "Warning",
  pictograms: [], hStatements: [], pStatements: [],
  hazardLevel: "Medium",
  exposure: { howUsed: "", frequency: "", duration: "", whoExposed: "", areasAffected: "" },
  controlMeasures: { ventilation: "", dustSuppression: "", containment: "", safeHandling: "", storageRequirements: "", spillProcedures: "" },
  ppe: {},
  firstAid: { eye: "", skin: "", inhalation: "", ingestion: "" },
  fireSpill: { suitable: "", unsuitable: "", spillContainment: "", environmental: "", wasteDisposal: "" },
  photos: [],
  linkedDocuments: { rams: [], methodStatement: [], toolboxTalk: [], riskRegister: [], siteDiary: [] },
  checkedBy: "", approvedBy: "", documentRef: "", isFavourite: false,
});

const daysBetween = (iso) => {
  if (!iso) return null;
  try { return Math.floor((new Date(iso) - new Date()) / 86400000); } catch { return null; }
};
const statusOf = (a) => {
  const d = daysBetween(a.reviewDate);
  if (d == null) return "Active";
  if (d < 0) return "Expired";
  if (d <= 30) return "Due";
  return "Active";
};

export default function CoshhV2() {
  const { user } = useAuth();
  const [assessments, setAssessments] = useState([]);
  const [stats, setStats] = useState(null);
  const [hazards, setHazards] = useState({ pictograms: [], hStatements: [], pStatements: [] });
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterHazard, setFilterHazard] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [editing, setEditing] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [jobs, setJobs] = useState([]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [aRes, sRes, hRes, tRes, jRes] = await Promise.allSettled([
        api.get("/coshh/assessments"), api.get("/coshh/stats"),
        api.get("/coshh/hazards"), api.get("/coshh/templates"), api.get("/jobs"),
      ]);
      if (aRes.status === "fulfilled") setAssessments(aRes.value.data);
      if (sRes.status === "fulfilled") setStats(sRes.value.data);
      if (hRes.status === "fulfilled") setHazards(hRes.value.data);
      if (tRes.status === "fulfilled") setTemplates(tRes.value.data);
      if (jRes.status === "fulfilled") setJobs(jRes.value.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);

  const openNew = () => { setEditing(emptyAssessment()); setWizardOpen(true); };
  const openEdit = (a) => { setEditing({ ...emptyAssessment(), ...a }); setWizardOpen(true); };
  const duplicate = (a) => {
    const copy = { ...a };
    delete copy.id; delete copy.createdAt; delete copy.updatedAt; delete copy._id;
    copy.productName = `${a.productName} (copy)`;
    setEditing({ ...emptyAssessment(), ...copy });
    setWizardOpen(true);
  };
  const openFromTemplate = (tpl) => {
    const copy = { ...emptyAssessment(), ...(tpl.payload || {}), productName: tpl.productName };
    setEditing(copy);
    setWizardOpen(true);
  };
  const deleteAssessment = async (a) => {
    if (!window.confirm(`Delete COSHH for "${a.productName}"?`)) return;
    try { await api.delete(`/coshh/assessments/${a.id}`); toast.success("Deleted"); await loadAll(); }
    catch { toast.error("Delete failed"); }
  };
  const toggleFav = async (a) => {
    try { await api.patch(`/coshh/assessments/${a.id}`, { isFavourite: !a.isFavourite }); await loadAll(); }
    catch { toast.error("Failed"); }
  };
  const deleteTemplate = async (id) => {
    if (!window.confirm("Delete template?")) return;
    try { await api.delete(`/coshh/templates/${id}`); setTemplates(templates.filter(x => x.id !== id)); toast.success("Deleted"); }
    catch { toast.error("Failed"); }
  };

  const projects = useMemo(() => {
    const set = new Set();
    assessments.forEach(a => a.projectName && set.add(a.projectName));
    return [...set];
  }, [assessments]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assessments.filter(a => {
      if (q && !((a.productName || "") + (a.manufacturer || "")).toLowerCase().includes(q)) return false;
      if (filterProject && a.projectName !== filterProject) return false;
      if (filterHazard && a.hazardLevel !== filterHazard) return false;
      if (filterStatus !== "All" && statusOf(a) !== filterStatus) return false;
      return true;
    });
  }, [assessments, query, filterProject, filterHazard, filterStatus]);

  const favourites = assessments.filter(a => a.isFavourite);
  const recent = [...assessments].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")).slice(0, 5);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="coshh-page">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Health & Safety</div>
          <h1 className="font-display text-3xl sm:text-4xl text-[#F0EDE8]">COSHH</h1>
          <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">Hazardous substance management — assessments, review dates, templates and premium PDFs.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll} className="text-xs text-[#A19D94] hover:text-[#E8A020] flex items-center gap-1" data-testid="coshh-refresh"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh</button>
          <button onClick={openNew} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040]" data-testid="coshh-new-btn"><Plus size={14} /> New COSHH</button>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatCard label="Total" value={stats?.total ?? 0} icon={ClipboardList} testId="coshh-stat-total" />
        <StatCard label="Active" value={stats?.active ?? 0} icon={CheckCircle2} tone="green" testId="coshh-stat-active" />
        <StatCard label="Reviews due" value={stats?.reviewsDue ?? 0} icon={AlertTriangle} tone="gold" testId="coshh-stat-due" />
        <StatCard label="Expired" value={stats?.expired ?? 0} icon={AlertTriangle} tone="red" testId="coshh-stat-expired" />
        <StatCard label="High-risk" value={stats?.highRisk ?? 0} icon={FlaskConical} tone="red" testId="coshh-stat-highrisk" />
      </div>

      {/* Favourites & Recently used */}
      {(favourites.length > 0 || recent.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {favourites.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2 flex items-center gap-1"><Star size={12} /> Favourites</div>
              <div className="grid grid-cols-1 gap-2">
                {favourites.slice(0, 3).map(a => <MiniRow key={a.id} a={a} onOpen={() => openEdit(a)} />)}
              </div>
            </div>
          )}
          {recent.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Recently used</div>
              <div className="grid grid-cols-1 gap-2">
                {recent.slice(0, 3).map(a => <MiniRow key={a.id} a={a} onOpen={() => openEdit(a)} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Templates */}
      {templates.length > 0 && (
        <div className="mb-6">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Templates</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {templates.map(t => (
              <div key={t.id} className="card-dark p-3 flex items-start justify-between gap-2" data-testid={`coshh-template-${t.id}`}>
                <button onClick={() => openFromTemplate(t)} className="text-left flex-1 min-w-0">
                  <div className="text-sm text-[#F0EDE8] truncate">{t.name}</div>
                  <div className="text-[11px] text-[#A19D94] truncate">{t.productName}</div>
                </button>
                <button onClick={() => deleteTemplate(t.id)} className="text-[#706D66] hover:text-[#F27C7C] p-1"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & filters */}
      <div className="card-dark p-4 mb-4" data-testid="coshh-filters">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search substance or manufacturer..." className={`${inputClass} pl-9`} data-testid="coshh-search" />
          </div>
          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className={inputClass} data-testid="coshh-filter-project">
            <option value="">All projects</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterHazard} onChange={(e) => setFilterHazard(e.target.value)} className={inputClass} data-testid="coshh-filter-hazard">
            <option value="">All hazard levels</option>
            {HAZARD_LEVELS.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
        <div className="mt-3 flex gap-2 flex-wrap">
          {REVIEW_STATUSES.map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} data-testid={`coshh-filter-status-${s.toLowerCase()}`}
              className={`px-3 py-1.5 rounded-full text-xs transition ${filterStatus === s ? "bg-[#E8A020] text-black" : "bg-[#0f0d09] border border-[#2a2620] text-[#A19D94] hover:border-[#E8A020]/40"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="card-dark p-8 text-center text-sm text-[#A19D94]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card-dark p-10 text-center" data-testid="coshh-empty">
          <FlaskConical size={28} className="mx-auto text-[#E8A020] mb-3" />
          <div className="text-base text-[#F0EDE8]">No COSHH assessments {assessments.length > 0 ? "match your filters" : "yet"}</div>
          {assessments.length === 0 && <div className="text-xs text-[#A19D94] mt-1 max-w-sm mx-auto">Every hazardous substance you use should be assessed. Morris will remind you when reviews are due.</div>}
          <button onClick={openNew} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium">
            <Plus size={14} /> Create your first
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(a => <AssessmentRow key={a.id} a={a} onEdit={() => openEdit(a)} onDelete={() => deleteAssessment(a)} onDuplicate={() => duplicate(a)} onFav={() => toggleFav(a)} />)}
        </div>
      )}

      {/* Wizard */}
      {wizardOpen && editing && (
        <CoshhWizard
          initial={editing}
          user={user}
          jobs={jobs}
          hazards={hazards}
          onClose={() => { setWizardOpen(false); setEditing(null); }}
          onSaved={async () => { await loadAll(); setWizardOpen(false); setEditing(null); }}
          onTemplatesChanged={(list) => setTemplates(list)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone, testId }) {
  const t = tone === "red" ? "text-[#F27C7C]" : tone === "green" ? "text-[#68D391]" : tone === "gold" ? "text-[#E8A020]" : "text-[#F0EDE8]";
  return (
    <div className="card-dark p-4" data-testid={testId}>
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {Icon && <Icon size={13} className="text-[#706D66]" />}
      </div>
      <div className={`mt-2 font-display text-3xl ${t}`}>{value}</div>
    </div>
  );
}

function badgeForStatus(status) {
  if (status === "Expired") return "text-[#F27C7C] border-[#F27C7C]/40 bg-[#F27C7C]/5";
  if (status === "Due") return "text-[#E8A020] border-[#E8A020]/40 bg-[#E8A020]/5";
  return "text-[#68D391] border-[#68D391]/30";
}
function AssessmentRow({ a, onEdit, onDelete, onDuplicate, onFav }) {
  const status = statusOf(a);
  return (
    <div className="card-dark p-4 flex items-start gap-3" data-testid={`coshh-row-${a.id}`}>
      <button onClick={onFav} className={`p-1 mt-1 ${a.isFavourite ? "text-[#E8A020]" : "text-[#706D66] hover:text-[#E8A020]"}`} aria-label="Favourite">
        <Star size={14} fill={a.isFavourite ? "#E8A020" : "none"} />
      </button>
      <button onClick={onEdit} className="text-left flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base text-[#F0EDE8] font-medium truncate">{a.productName}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badgeForStatus(status)}`}>{status}</span>
          {a.hazardLevel && <span className={`text-[10px] px-2 py-0.5 rounded-full border ${a.hazardLevel === "High" ? "text-[#F27C7C] border-[#F27C7C]/40" : a.hazardLevel === "Medium" ? "text-[#E8A020] border-[#E8A020]/40" : "text-[#68D391] border-[#68D391]/30"}`}>{a.hazardLevel} risk</span>}
        </div>
        <div className="text-xs text-[#A19D94] mt-1 flex flex-wrap gap-x-3">
          {a.manufacturer && <span>{a.manufacturer}</span>}
          {a.projectName && <span>Project: {a.projectName}</span>}
          {a.reviewDate && <span>Review: {a.reviewDate}</span>}
        </div>
      </button>
      <div className="flex gap-1 shrink-0">
        <button onClick={onEdit} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`coshh-row-edit-${a.id}`}><Edit2 size={14} /></button>
        <button onClick={onDuplicate} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`coshh-row-duplicate-${a.id}`}>Dup</button>
        <button onClick={onDelete} className="p-2 text-[#A19D94] hover:text-[#F27C7C]" data-testid={`coshh-row-delete-${a.id}`}><Trash2 size={14} /></button>
      </div>
    </div>
  );
}
function MiniRow({ a, onOpen }) {
  return (
    <button onClick={onOpen} className="card-dark p-3 text-left hover:border-[#E8A020]/40">
      <div className="text-sm text-[#F0EDE8] truncate">{a.productName}</div>
      <div className="text-[11px] text-[#A19D94] truncate">{a.manufacturer || "—"} · {a.projectName || "No project"}</div>
    </button>
  );
}

// ================================================================
// WIZARD
// ================================================================
const WIZARD_STEPS = [
  { id: 1, label: "Project" },
  { id: 2, label: "Substance" },
  { id: 3, label: "Hazards" },
  { id: 4, label: "Exposure" },
  { id: 5, label: "Controls" },
  { id: 6, label: "PPE" },
  { id: 7, label: "First Aid" },
  { id: 8, label: "Fire & Spill" },
  { id: 9, label: "Photos" },
  { id: 10, label: "Linked" },
  { id: 11, label: "Review" },
  { id: 12, label: "Save & PDF" },
];

function CoshhWizard({ initial, user, jobs, hazards, onClose, onSaved, onTemplatesChanged }) {
  const [data, setData] = useState(initial);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [docs, setDocs] = useState([]);
  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [tplName, setTplName] = useState("");

  useEffect(() => { api.get("/documents").then(r => setDocs(Array.isArray(r.data) ? r.data : [])).catch(() => {}); }, []);
  useEffect(() => { if (user?.fullName && !data.assessor) setData(d => ({ ...d, assessor: user.fullName })); }, [user?.fullName]);

  const pickProject = (id) => {
    const j = jobs.find(x => x.id === id);
    if (!j) return;
    setData(d => ({ ...d, projectId: j.id, projectName: j.projectName || j.clientName || d.projectName, clientName: j.clientName || d.clientName, siteAddress: j.address || d.siteAddress }));
  };

  const generatePreview = () => { try { setPreviewUrl(coshhPdfBlobUrl({ data, user, today: new Date().toLocaleDateString("en-GB"), hazards })); } catch (e) { toast.error("Preview failed"); } };

  const saveAssessment = async () => {
    setSaving(true);
    try {
      let saved;
      if (data.id) {
        const r = await api.patch(`/coshh/assessments/${data.id}`, data);
        saved = r.data;
      } else {
        const r = await api.post("/coshh/assessments", data);
        saved = r.data;
      }
      // Also mirror to /documents/save so it appears in Document Library + Timeline
      try {
        await api.post("/documents/save", {
          title: `COSHH — ${data.productName}`,
          toolId: "coshh",
          refNumber: data.documentRef || `COSHH-${saved.id.slice(0, 8)}`,
          jobId: data.projectId || null,
          content: `${data.productName} — hazard level: ${data.hazardLevel}. Assessor: ${data.assessor}.`,
          metadata: { ...data, id: saved.id },
        });
      } catch { /* soft-fail */ }
      // Trigger PDF download
      downloadCoshhPdf({ data: { ...data, id: saved.id }, user, today: new Date().toLocaleDateString("en-GB"), hazards });
      try { saveToolData("coshh", { generatedAt: new Date().toISOString(), productName: data.productName, id: saved.id }); } catch { /* ignore */ }
      toast.success("COSHH saved");
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const saveAsTemplate = async () => {
    if (!tplName.trim()) return toast.error("Template name required");
    if (!data.productName.trim()) return toast.error("Product name required");
    try {
      const r = await api.post("/coshh/templates", { name: tplName.trim(), productName: data.productName, payload: data });
      toast.success("Template saved");
      setTplModalOpen(false);
      setTplName("");
      // Refresh templates in parent
      try {
        const tRes = await api.get("/coshh/templates");
        if (Array.isArray(tRes.data)) onTemplatesChanged(tRes.data);
      } catch { /* ignore */ }
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
  };

  const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));
  const setNested = (obj, key) => (v) => setData(d => ({ ...d, [obj]: { ...d[obj], [key]: v } }));

  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-y-auto" data-testid="coshh-wizard">
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-4xl mx-auto card-dark p-5 md:p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-1">{data.id ? "Edit" : "New"} COSHH assessment</div>
              <h2 className="font-display text-2xl text-[#F0EDE8]">{data.productName || "Untitled substance"}</h2>
            </div>
            <button onClick={onClose} className="text-[#A19D94] hover:text-[#F0EDE8]" data-testid="coshh-wizard-close"><X size={20} /></button>
          </div>

          <div className="overflow-x-auto mb-5">
            <div className="flex gap-1 min-w-max">
              {WIZARD_STEPS.map(s => (
                <button key={s.id} onClick={() => setStep(s.id)} data-testid={`coshh-step-${s.id}`}
                  className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${step === s.id ? "bg-[#E8A020] text-black" : step > s.id ? "bg-[#1e1a12] text-[#68D391] border border-[#68D391]/30" : "bg-[#0f0d09] text-[#A19D94] border border-[#2a2620]"}`}>
                  {s.id}. {s.label}
                </button>
              ))}
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-4">
              {jobs.length > 0 && (
                <Field label="Project (optional)" hint="Auto-fills client and site.">
                  <select value={data.projectId} onChange={(e) => pickProject(e.target.value)} className={inputClass} data-testid="coshh-project">
                    <option value="">Not linked</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.projectName || j.clientName} — {j.address || "no address"}</option>)}
                  </select>
                </Field>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Project name"><input className={inputClass} value={data.projectName} onChange={(e) => set("projectName")(e.target.value)} data-testid="coshh-projectName" /></Field>
                <Field label="Client"><input className={inputClass} value={data.clientName} onChange={(e) => set("clientName")(e.target.value)} /></Field>
                <Field label="Site"><textarea className={`${inputClass} min-h-[52px]`} value={data.siteAddress} onChange={(e) => set("siteAddress")(e.target.value)} /></Field>
                <Field label="Assessor"><input className={inputClass} value={data.assessor} onChange={(e) => set("assessor")(e.target.value)} data-testid="coshh-assessor" /></Field>
                <Field label="Assessment date"><input type="date" className={inputClass} value={data.assessmentDate} onChange={(e) => set("assessmentDate")(e.target.value)} data-testid="coshh-assessmentDate" /></Field>
                <Field label="Review date" hint="Reminders fire 30 days before this date."><input type="date" className={inputClass} value={data.reviewDate} onChange={(e) => set("reviewDate")(e.target.value)} data-testid="coshh-reviewDate" /></Field>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Product name *"><input className={inputClass} value={data.productName} onChange={(e) => set("productName")(e.target.value)} data-testid="coshh-productName" /></Field>
                <Field label="Manufacturer"><input className={inputClass} value={data.manufacturer} onChange={(e) => set("manufacturer")(e.target.value)} data-testid="coshh-manufacturer" /></Field>
                <Field label="Supplier"><input className={inputClass} value={data.supplier} onChange={(e) => set("supplier")(e.target.value)} /></Field>
                <Field label="Product code / batch"><input className={inputClass} value={data.productCode} onChange={(e) => set("productCode")(e.target.value)} /></Field>
                <Field label="Quantity used"><input className={inputClass} value={data.quantityUsed} onChange={(e) => set("quantityUsed")(e.target.value)} placeholder="e.g. 5L per week" /></Field>
                <Field label="Hazard level"><select className={inputClass} value={data.hazardLevel} onChange={(e) => set("hazardLevel")(e.target.value)} data-testid="coshh-hazardLevel">{HAZARD_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}</select></Field>
              </div>
              <Field label="Description"><textarea className={`${inputClass} min-h-[72px]`} value={data.description} onChange={(e) => set("description")(e.target.value)} /></Field>
              <Field label="Safety Data Sheet URL" hint="Link to the manufacturer's SDS PDF."><input className={inputClass} value={data.sdsUrl} onChange={(e) => set("sdsUrl")(e.target.value)} placeholder="https://..." data-testid="coshh-sdsUrl" /></Field>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-4">
              <Field label="Signal word"><select className={inputClass} value={data.signalWord} onChange={(e) => set("signalWord")(e.target.value)}><option>Warning</option><option>Danger</option></select></Field>
              <Field label="Hazard classification"><input className={inputClass} value={data.hazardClassification} onChange={(e) => set("hazardClassification")(e.target.value)} placeholder="e.g. Skin Corr. 1B" /></Field>
              <div>
                <Label>Pictograms</Label>
                <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {hazards.pictograms.map(p => {
                    const on = (data.pictograms || []).includes(p.id);
                    return (
                      <button key={p.id} onClick={() => { const cur = data.pictograms || []; set("pictograms")(on ? cur.filter(x => x !== p.id) : [...cur, p.id]); }} type="button" data-testid={`coshh-picto-${p.id}`}
                        className={`card-dark p-2 text-center transition ${on ? "border-[#E8A020]/60 bg-[#E8A020]/5" : "hover:border-[#E8A020]/30"}`}>
                        <div className="w-9 h-9 mx-auto rounded-full flex items-center justify-center font-bold text-[10px] transform rotate-45" style={{ background: p.colour, color: "#141210" }}>
                          <span className="transform -rotate-45">{p.id}</span>
                        </div>
                        <div className={`text-[10px] mt-2 ${on ? "text-[#F0EDE8]" : "text-[#A19D94]"}`}>{p.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <BulletPicker label="H-statements" value={data.hStatements || []} onChange={set("hStatements")} suggestions={hazards.hStatements} testId="coshh-h" />
              <BulletPicker label="P-statements" value={data.pStatements || []} onChange={set("pStatements")} suggestions={hazards.pStatements} testId="coshh-p" />
            </div>
          )}
          {step === 4 && (
            <div className="space-y-4">
              <Field label="How is the product used?"><textarea className={`${inputClass} min-h-[64px]`} value={data.exposure?.howUsed || ""} onChange={(e) => setNested("exposure", "howUsed")(e.target.value)} data-testid="coshh-exp-howUsed" /></Field>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Frequency of use"><input className={inputClass} value={data.exposure?.frequency || ""} onChange={(e) => setNested("exposure", "frequency")(e.target.value)} placeholder="e.g. Daily" /></Field>
                <Field label="Duration of exposure"><input className={inputClass} value={data.exposure?.duration || ""} onChange={(e) => setNested("exposure", "duration")(e.target.value)} placeholder="e.g. 30 min per shift" /></Field>
                <Field label="Who may be exposed"><input className={inputClass} value={data.exposure?.whoExposed || ""} onChange={(e) => setNested("exposure", "whoExposed")(e.target.value)} placeholder="e.g. Painter, apprentice" /></Field>
                <Field label="Areas affected"><input className={inputClass} value={data.exposure?.areasAffected || ""} onChange={(e) => setNested("exposure", "areasAffected")(e.target.value)} placeholder="e.g. Ground floor west" /></Field>
              </div>
            </div>
          )}
          {step === 5 && (
            <div className="space-y-4">
              {[
                ["ventilation", "Ventilation"],
                ["dustSuppression", "Dust suppression"],
                ["containment", "Containment"],
                ["safeHandling", "Safe handling"],
                ["storageRequirements", "Storage requirements"],
                ["spillProcedures", "Spill procedures"],
              ].map(([k, lbl]) => (
                <Field key={k} label={lbl}><textarea className={`${inputClass} min-h-[52px]`} value={data.controlMeasures?.[k] || ""} onChange={(e) => setNested("controlMeasures", k)(e.target.value)} data-testid={`coshh-cm-${k}`} /></Field>
              ))}
            </div>
          )}
          {step === 6 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {PPE_ITEMS.filter(p => p.id !== "other").map(p => {
                const on = !!data.ppe?.[p.id];
                return (
                  <button key={p.id} onClick={() => setData(d => ({ ...d, ppe: { ...d.ppe, [p.id]: !on } }))} type="button" data-testid={`coshh-ppe-${p.id}`}
                    className={`card-dark p-4 text-center transition ${on ? "border-[#E8A020]/60 bg-[#E8A020]/5" : "hover:border-[#E8A020]/30"}`}>
                    <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center font-bold ${on ? "bg-[#E8A020] text-black" : "bg-[#1e1a12] text-[#706D66]"}`}>{p.mark}</div>
                    <div className={`text-xs mt-2 ${on ? "text-[#F0EDE8]" : "text-[#A19D94]"}`}>{p.label}</div>
                  </button>
                );
              })}
              <div className="sm:col-span-4">
                <Field label="Other PPE"><input className={inputClass} value={data.ppe?.otherText || ""} onChange={(e) => setNested("ppe", "otherText")(e.target.value)} /></Field>
              </div>
            </div>
          )}
          {step === 7 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Eye contact"><textarea className={`${inputClass} min-h-[70px]`} value={data.firstAid?.eye || ""} onChange={(e) => setNested("firstAid", "eye")(e.target.value)} data-testid="coshh-fa-eye" /></Field>
              <Field label="Skin contact"><textarea className={`${inputClass} min-h-[70px]`} value={data.firstAid?.skin || ""} onChange={(e) => setNested("firstAid", "skin")(e.target.value)} data-testid="coshh-fa-skin" /></Field>
              <Field label="Inhalation"><textarea className={`${inputClass} min-h-[70px]`} value={data.firstAid?.inhalation || ""} onChange={(e) => setNested("firstAid", "inhalation")(e.target.value)} data-testid="coshh-fa-inhalation" /></Field>
              <Field label="Ingestion"><textarea className={`${inputClass} min-h-[70px]`} value={data.firstAid?.ingestion || ""} onChange={(e) => setNested("firstAid", "ingestion")(e.target.value)} data-testid="coshh-fa-ingestion" /></Field>
            </div>
          )}
          {step === 8 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Suitable extinguishing media"><input className={inputClass} value={data.fireSpill?.suitable || ""} onChange={(e) => setNested("fireSpill", "suitable")(e.target.value)} data-testid="coshh-fs-suitable" /></Field>
                <Field label="Unsuitable media"><input className={inputClass} value={data.fireSpill?.unsuitable || ""} onChange={(e) => setNested("fireSpill", "unsuitable")(e.target.value)} data-testid="coshh-fs-unsuitable" /></Field>
              </div>
              <Field label="Spill containment"><textarea className={`${inputClass} min-h-[64px]`} value={data.fireSpill?.spillContainment || ""} onChange={(e) => setNested("fireSpill", "spillContainment")(e.target.value)} data-testid="coshh-fs-spill" /></Field>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Environmental precautions"><textarea className={`${inputClass} min-h-[64px]`} value={data.fireSpill?.environmental || ""} onChange={(e) => setNested("fireSpill", "environmental")(e.target.value)} /></Field>
                <Field label="Waste disposal"><textarea className={`${inputClass} min-h-[64px]`} value={data.fireSpill?.wasteDisposal || ""} onChange={(e) => setNested("fireSpill", "wasteDisposal")(e.target.value)} /></Field>
              </div>
            </div>
          )}
          {step === 9 && (
            <div className="space-y-3">
              <p className="text-xs text-[#A19D94]">Product photo, storage location, COSHH cabinet, hazard area.</p>
              <AttachMedia toolId="coshh" toolLabel="COSHH" jobId={data.projectId || null} category="coshh" value={data.photos || []} onChange={(list) => set("photos")(list)} testIdPrefix="coshh-attach" />
            </div>
          )}
          {step === 10 && <StepLinked data={data} setData={setData} docs={docs} />}
          {step === 11 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="card-dark p-3"><Label>Pictograms</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.pictograms || []).length}</div></div>
                <div className="card-dark p-3"><Label>H-statements</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.hStatements || []).length}</div></div>
                <div className="card-dark p-3"><Label>PPE items</Label><div className="text-2xl text-[#F0EDE8] mt-1">{Object.keys(data.ppe || {}).filter(k => data.ppe[k] === true).length}</div></div>
                <div className="card-dark p-3"><Label>Photos</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.photos || []).length}</div></div>
              </div>
              <button onClick={generatePreview} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#F0EDE8] hover:border-[#E8A020]" data-testid="coshh-preview-btn"><RefreshCw size={14} /> {previewUrl ? "Refresh" : "Generate"} preview</button>
              {previewUrl && <iframe title="COSHH Preview" src={previewUrl} className="w-full h-[400px] rounded-md border border-[#2a2620] bg-white" data-testid="coshh-preview-iframe" />}
            </div>
          )}
          {step === 12 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Checked by"><input className={inputClass} value={data.checkedBy} onChange={(e) => set("checkedBy")(e.target.value)} /></Field>
                <Field label="Approved by"><input className={inputClass} value={data.approvedBy} onChange={(e) => set("approvedBy")(e.target.value)} /></Field>
              </div>
              <div className="card-dark p-4 text-xs text-[#706D66] space-y-1">
                <div>Save creates the COSHH record, downloads the PDF, adds it to your Document Library and emits a Timeline event.</div>
                <div>Review date {data.reviewDate ? `set to ${data.reviewDate}` : "not set"} — reminders fire 30 days before.</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setTplModalOpen(true)} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="coshh-save-template-btn"><Save size={12} /> Save as template</button>
                <button onClick={saveAssessment} disabled={saving} className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-60" data-testid="coshh-save-btn">
                  <Download size={16} /> {saving ? "Saving..." : "Save & Generate PDF"}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-6">
            <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94] disabled:opacity-40" data-testid="coshh-btn-prev"><ChevronLeft size={14} /> Back</button>
            <span className="text-xs text-[#706D66]">Step {step} of {WIZARD_STEPS.length}</span>
            <button onClick={() => setStep(Math.min(WIZARD_STEPS.length, step + 1))} disabled={step === WIZARD_STEPS.length} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-40" data-testid="coshh-btn-next">Next <ChevronRight size={14} /></button>
          </div>
        </div>

        {tplModalOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="coshh-template-modal">
            <div className="card-dark p-6 max-w-md w-full">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-display text-2xl text-[#F0EDE8]">Save COSHH as template</h3>
                <button onClick={() => setTplModalOpen(false)} className="text-[#A19D94]"><X size={18} /></button>
              </div>
              <Field label="Template name"><input className={inputClass} value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. CT1 Adhesive" data-testid="coshh-template-name" /></Field>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setTplModalOpen(false)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button>
                <button onClick={saveAsTemplate} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="coshh-template-save">Save template</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BulletPicker({ label, value, onChange, suggestions, testId }) {
  const [input, setInput] = useState("");
  const add = (v) => { if (v && !value.includes(v)) onChange([...value, v]); setInput(""); };
  const rm = (v) => onChange(value.filter(x => x !== v));
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 space-y-1">
        {value.map((v, i) => (
          <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-[#0f0d09] border border-[#2a2620]" data-testid={`${testId}-item-${i}`}>
            <span className="flex-1 text-xs text-[#F0EDE8]">{v}</span>
            <button onClick={() => rm(v)} className="text-[#A19D94] hover:text-[#F27C7C]"><Trash2 size={12} /></button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <input list={`${testId}-suggest`} value={input} onChange={(e) => setInput(e.target.value)} className={inputClass} placeholder="Type or pick..." data-testid={`${testId}-input`} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(input); } }} />
        <datalist id={`${testId}-suggest`}>{suggestions.map(s => <option key={s} value={s} />)}</datalist>
        <button onClick={() => add(input)} className="px-3 py-2 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8]" data-testid={`${testId}-add`}>Add</button>
      </div>
    </div>
  );
}

function StepLinked({ data, setData, docs }) {
  const KINDS = [
    { key: "rams", label: "RAMS", tools: ["rams"] },
    { key: "methodStatement", label: "Method Statement", tools: ["method-statement"] },
    { key: "toolboxTalk", label: "Toolbox Talks", tools: ["toolbox-talk"] },
    { key: "riskRegister", label: "Risk Assessments", tools: ["risk-register"] },
    { key: "siteDiary", label: "Site Diary", tools: ["site-diary", "multiuser-site-diary"] },
  ];
  const linked = data.linkedDocuments || {};
  const toggle = (kind, doc) => {
    const list = linked[kind] || [];
    const on = list.some(d => d.id === doc.id);
    const next = on ? list.filter(d => d.id !== doc.id) : [...list, { id: doc.id, title: doc.title, refNumber: doc.refNumber, toolId: doc.toolId }];
    setData(d => ({ ...d, linkedDocuments: { ...linked, [kind]: next } }));
  };
  return (
    <div className="space-y-4" data-testid="coshh-linked">
      {KINDS.map(k => {
        const avail = docs.filter(d => k.tools.includes(d.toolId));
        const selected = linked[k.key] || [];
        return (
          <div key={k.key}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">{k.label}</div>
              <div className="text-xs text-[#706D66]">{selected.length} linked</div>
            </div>
            {avail.length === 0 ? <div className="card-dark p-3 text-xs text-[#706D66]">No {k.label} documents yet.</div> : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {avail.slice(0, 6).map(d => {
                  const on = selected.some(x => x.id === d.id);
                  return (
                    <button key={d.id} onClick={() => toggle(k.key, d)} type="button" className={`card-dark p-3 text-left ${on ? "border-[#E8A020]/60 bg-[#E8A020]/5" : "hover:border-[#E8A020]/40"}`} data-testid={`coshh-link-${d.id}`}>
                      <div className="text-sm text-[#F0EDE8] truncate">{d.title}</div>
                      <div className="text-[11px] text-[#A19D94]">{d.refNumber || "no ref"} · {(d.createdAt || "").slice(0, 10)}</div>
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
