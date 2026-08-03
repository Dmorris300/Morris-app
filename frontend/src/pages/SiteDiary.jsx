// Morris — Site Diary V2 (Flagship Daily Site Management)
// Dashboard-first: users arrive at a dashboard with stat cards, filters,
// recent entries, templates and favourites. Click New/Edit to open the full
// 11-step wizard in a full-screen sheet.

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Plus, Search, RefreshCw, Trash2, Edit2, X, ChevronLeft, ChevronRight,
  ClipboardList, CloudSun, Users, Hammer, Truck, Wrench, AlertTriangle,
  FileText, Camera, Link2, CheckCircle2, Star, Download, Save, PenTool,
  Copy, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import AttachMedia from "../components/AttachMedia";
import SignaturePad from "../components/SignaturePad";
import { downloadSiteDiaryPdf, siteDiaryPdfBlobUrl } from "../lib/site-diary-pdf";
import { saveToolData } from "../lib/tool-persistence";

const TOOL_ID = "site-diary";
const DRAFT_KEY = "morris.tool_draft.site-diary";

const WIZARD_STEPS = [
  { id: 1,  key: "project",     label: "Project",             icon: ClipboardList },
  { id: 2,  key: "weather",     label: "Date & Weather",      icon: CloudSun },
  { id: 3,  key: "crew",        label: "Labour / Crew",       icon: Users },
  { id: 4,  key: "works",       label: "Works Completed",     icon: Hammer },
  { id: 5,  key: "deliveries",  label: "Deliveries",          icon: Truck },
  { id: 6,  key: "plant",       label: "Plant & Equipment",   icon: Wrench },
  { id: 7,  key: "delays",      label: "Delays & Issues",     icon: AlertTriangle },
  { id: 8,  key: "variations",  label: "Variations",          icon: FileText },
  { id: 9,  key: "photos",      label: "Photos",              icon: Camera },
  { id: 10, key: "linked",      label: "Linked Docs",         icon: Link2 },
  { id: 11, key: "review",      label: "Review & Generate",   icon: Download },
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
  date: new Date().toISOString().slice(0, 10),
  startTime: "08:00", endTime: "17:00",
  tempAM: "", tempPM: "", wind: "", rain: "", conditions: "", weatherImpact: "",
  supervisor: "", crew: [], subcontractorsOnSite: [], totalOperatives: 0,
  worksCompleted: [], worksTomorrow: "", progressPercent: "",
  deliveries: [], plant: [],
  delays: [], issues: [], instructions: [], hsObservations: [], visitors: [],
  variations: [],
  photos: [],
  linkedDocuments: { rams: [], methodStatement: [], coshh: [], toolboxTalk: [], riskRegister: [] },
  notes: "", preparedBy: "", signature: "", isFavourite: false,
});

function saveDraft(d) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ } }
function loadDraft() { try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }

export default function SiteDiaryV2() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const initialProjectId = params.get("projectId") || "";

  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterProject, setFilterProject] = useState(initialProjectId);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [editing, setEditing] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [eRes, sRes, tRes, jRes] = await Promise.allSettled([
        api.get("/site-diary/entries"),
        api.get("/site-diary/stats"),
        api.get("/site-diary/templates"),
        api.get("/jobs"),
      ]);
      if (eRes.status === "fulfilled") setEntries(eRes.value.data);
      if (sRes.status === "fulfilled") setStats(sRes.value.data);
      if (tRes.status === "fulfilled") setTemplates(tRes.value.data);
      if (jRes.status === "fulfilled") setJobs(jRes.value.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);

  const openNew = (fromTemplate = null) => {
    let base = emptyEntry();
    if (initialProjectId) {
      const j = jobs.find(x => x.id === initialProjectId);
      if (j) {
        base.projectId = j.id;
        base.projectName = j.projectName || j.clientName || "";
        base.clientName = j.clientName || "";
        base.siteAddress = j.address || "";
      }
    }
    if (fromTemplate) {
      base = { ...base, ...(fromTemplate.payload || {}), id: undefined, date: base.date };
    } else {
      const savedDraft = loadDraft();
      if (savedDraft && !savedDraft.id) base = { ...base, ...savedDraft, id: undefined };
    }
    setEditing(base); setWizardOpen(true);
  };
  const openEdit = (e) => { setEditing({ ...emptyEntry(), ...e }); setWizardOpen(true); };
  const duplicate = (e) => {
    const copy = { ...e };
    delete copy.id; delete copy.createdAt; delete copy.updatedAt; delete copy._id;
    copy.date = new Date().toISOString().slice(0, 10);
    setEditing({ ...emptyEntry(), ...copy });
    setWizardOpen(true);
  };
  const deleteEntry = async (e) => {
    if (!window.confirm(`Delete diary for ${e.projectName || "project"} on ${e.date}?`)) return;
    try { await api.delete(`/site-diary/entries/${e.id}`); toast.success("Deleted"); await loadAll(); }
    catch { toast.error("Delete failed"); }
  };
  const toggleFav = async (e) => {
    try { await api.patch(`/site-diary/entries/${e.id}`, { isFavourite: !e.isFavourite }); await loadAll(); }
    catch { toast.error("Failed"); }
  };
  const deleteTemplate = async (id) => {
    if (!window.confirm("Delete template?")) return;
    try { await api.delete(`/site-diary/templates/${id}`); setTemplates(templates.filter(x => x.id !== id)); toast.success("Deleted"); }
    catch { toast.error("Failed"); }
  };

  const projects = useMemo(() => {
    const set = new Set();
    entries.forEach(a => a.projectName && set.add(a.projectName));
    return [...set];
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(e => {
      if (q) {
        const hay = `${e.projectName || ""} ${e.clientName || ""} ${e.supervisor || ""} ${e.notes || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterProject) {
        // filterProject may be a projectId (from url) or projectName (from dropdown)
        const matchesId = e.projectId === filterProject;
        const matchesName = e.projectName === filterProject;
        if (!matchesId && !matchesName) return false;
      }
      if (filterDateFrom && (e.date || "") < filterDateFrom) return false;
      if (filterDateTo && (e.date || "") > filterDateTo) return false;
      return true;
    });
  }, [entries, query, filterProject, filterDateFrom, filterDateTo]);

  const favourites = entries.filter(e => e.isFavourite);
  const recent = [...entries].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="site-diary-page">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Health & Safety</div>
          <h1 className="font-display text-3xl sm:text-4xl text-[#F0EDE8]">Site Diary</h1>
          <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">A daily record of works, crew, weather, deliveries and delays. Contemporaneous evidence for delay claims, variations and disputes.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll} className="text-xs text-[#A19D94] hover:text-[#E8A020] flex items-center gap-1" data-testid="sd-refresh"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh</button>
          <button onClick={() => openNew()} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040]" data-testid="sd-new-btn"><Plus size={14} /> New Diary Entry</button>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatCard label="Total entries" value={stats?.total ?? 0} icon={ClipboardList} testId="sd-stat-total" />
        <StatCard label="Today" value={stats?.enteredToday ?? 0} icon={Calendar} tone="green" testId="sd-stat-today" />
        <StatCard label="This week" value={stats?.thisWeek ?? 0} icon={Calendar} testId="sd-stat-week" />
        <StatCard label="With delays" value={stats?.withDelays ?? 0} icon={AlertTriangle} tone="gold" testId="sd-stat-delays" />
        <StatCard label="Missing today" value={stats?.missingToday ?? 0} icon={AlertTriangle} tone="red" testId="sd-stat-missing" />
      </div>

      {/* Favourites & Recently used */}
      {(favourites.length > 0 || recent.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {favourites.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2 flex items-center gap-1"><Star size={12} /> Favourites</div>
              <div className="grid grid-cols-1 gap-2">
                {favourites.slice(0, 3).map(e => <MiniRow key={e.id} e={e} onOpen={() => openEdit(e)} />)}
              </div>
            </div>
          )}
          {recent.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Recent entries</div>
              <div className="grid grid-cols-1 gap-2">
                {recent.slice(0, 3).map(e => <MiniRow key={e.id} e={e} onOpen={() => openEdit(e)} />)}
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
              <div key={t.id} className="card-dark p-3 flex items-start justify-between gap-2" data-testid={`sd-template-${t.id}`}>
                <button onClick={() => openNew(t)} className="text-left flex-1 min-w-0">
                  <div className="text-sm text-[#F0EDE8] truncate">{t.name}</div>
                  <div className="text-[11px] text-[#A19D94] truncate">Day template</div>
                </button>
                <button onClick={() => deleteTemplate(t.id)} className="text-[#706D66] hover:text-[#F27C7C] p-1"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & filters */}
      <div className="card-dark p-4 mb-4" data-testid="sd-filters">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search project, supervisor, notes..." className={`${inputClass} pl-9`} data-testid="sd-search" />
          </div>
          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className={inputClass} data-testid="sd-filter-project">
            <option value="">All projects</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className={inputClass} placeholder="From" data-testid="sd-filter-from" />
            <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className={inputClass} placeholder="To" data-testid="sd-filter-to" />
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="card-dark p-8 text-center text-sm text-[#A19D94]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card-dark p-10 text-center" data-testid="sd-empty">
          <ClipboardList size={28} className="mx-auto text-[#E8A020] mb-3" />
          <div className="text-base text-[#F0EDE8]">No diary entries {entries.length > 0 ? "match your filters" : "yet"}</div>
          {entries.length === 0 && <div className="text-xs text-[#A19D94] mt-1 max-w-sm mx-auto">Log one entry per project per day. A tidy diary is the fastest way to defend a delay or variation claim later.</div>}
          <button onClick={() => openNew()} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium">
            <Plus size={14} /> Create your first
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(e => <EntryRow key={e.id} e={e} onEdit={() => openEdit(e)} onDelete={() => deleteEntry(e)} onDuplicate={() => duplicate(e)} onFav={() => toggleFav(e)} />)}
        </div>
      )}

      {/* Wizard */}
      {wizardOpen && editing && (
        <DiaryWizard
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
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {Icon && <Icon size={13} className="text-[#706D66]" />}
      </div>
      <div className={`mt-2 font-display text-3xl ${t}`}>{value}</div>
    </div>
  );
}

function EntryRow({ e, onEdit, onDelete, onDuplicate, onFav }) {
  const opCount = e.totalOperatives || (e.crew || []).length || 0;
  const delayCount = (e.delays || []).length;
  return (
    <div className="card-dark p-4 flex items-start gap-3" data-testid={`sd-row-${e.id}`}>
      <button onClick={onFav} className={`p-1 mt-1 ${e.isFavourite ? "text-[#E8A020]" : "text-[#706D66] hover:text-[#E8A020]"}`} aria-label="Favourite">
        <Star size={14} fill={e.isFavourite ? "#E8A020" : "none"} />
      </button>
      <button onClick={onEdit} className="text-left flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base text-[#F0EDE8] font-medium truncate">{e.projectName || "Untitled"}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#E8A020]/40 text-[#E8A020]">{e.date || "—"}</span>
          {delayCount > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#F27C7C]/40 text-[#F27C7C]">{delayCount} delay{delayCount === 1 ? "" : "s"}</span>}
        </div>
        <div className="text-xs text-[#A19D94] mt-1 flex flex-wrap gap-x-3">
          {e.supervisor && <span>Supervisor: {e.supervisor}</span>}
          {opCount > 0 && <span>{opCount} operative{opCount === 1 ? "" : "s"}</span>}
          {e.conditions && <span>Weather: {e.conditions}</span>}
        </div>
      </button>
      <div className="flex gap-1 shrink-0">
        <button onClick={onEdit} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`sd-row-edit-${e.id}`}><Edit2 size={14} /></button>
        <button onClick={onDuplicate} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`sd-row-dup-${e.id}`}><Copy size={14} /></button>
        <button onClick={onDelete} className="p-2 text-[#A19D94] hover:text-[#F27C7C]" data-testid={`sd-row-delete-${e.id}`}><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

function MiniRow({ e, onOpen }) {
  return (
    <button onClick={onOpen} className="card-dark p-3 text-left hover:border-[#E8A020]/40">
      <div className="text-sm text-[#F0EDE8] truncate">{e.projectName || "Untitled"} <span className="text-[11px] text-[#A19D94]">· {e.date}</span></div>
      <div className="text-[11px] text-[#A19D94] truncate">{e.supervisor || "—"} · {(e.crew || []).length} operatives · {e.conditions || "—"}</div>
    </button>
  );
}

// ================================================================
// WIZARD
// ================================================================
function DiaryWizard({ initial, user, jobs, onClose, onSaved, onTemplatesChanged }) {
  const [data, setData] = useState(initial);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [docs, setDocs] = useState([]);
  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [signingOpen, setSigningOpen] = useState(false);

  useEffect(() => { api.get("/documents").then(r => setDocs(Array.isArray(r.data) ? r.data : [])).catch(() => {}); }, []);
  useEffect(() => { if (user?.fullName && !data.supervisor) setData(d => ({ ...d, supervisor: user.fullName })); }, [user?.fullName]);
  useEffect(() => { if (user?.fullName && !data.preparedBy) setData(d => ({ ...d, preparedBy: user.fullName })); }, [user?.fullName]);
  // Autosave a "new entry" draft (only for unsaved entries) — resumes on next visit.
  useEffect(() => { if (!data.id) { const t = setTimeout(() => saveDraft(data), 500); return () => clearTimeout(t); } }, [data]);

  const pickProject = (id) => {
    const j = jobs.find(x => x.id === id);
    if (!j) return;
    setData(d => ({ ...d, projectId: j.id, projectName: j.projectName || j.clientName || d.projectName, clientName: j.clientName || d.clientName, siteAddress: j.address || d.siteAddress, principalContractor: j.principalContractor || d.principalContractor }));
  };

  const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));

  // Total operatives auto-computed from crew + subs
  const autoTotal = (data.crew || []).length + (data.subcontractorsOnSite || []).reduce((s, x) => s + (parseInt(x.operatives) || 0), 0);
  useEffect(() => { setData(d => ({ ...d, totalOperatives: autoTotal })); }, [autoTotal]);

  const generatePreview = () => {
    try { setPreviewUrl(siteDiaryPdfBlobUrl({ data, user, today: new Date().toLocaleDateString("en-GB") })); }
    catch (e) { toast.error("Preview failed"); }
  };

  const saveEntry = async () => {
    if (!data.date) { toast.error("Diary date is required"); setStep(2); return; }
    setSaving(true);
    try {
      let saved;
      if (data.id) {
        const r = await api.patch(`/site-diary/entries/${data.id}`, data);
        saved = r.data;
      } else {
        const r = await api.post("/site-diary/entries", data);
        saved = r.data;
      }
      // Mirror to /documents/save so it appears in Document Library + Timeline
      try {
        await api.post("/documents/save", {
          title: `Site Diary — ${data.projectName || "Project"} — ${data.date}`,
          toolId: TOOL_ID,
          refNumber: data.documentRef || `SD-${(saved.id || "").slice(0, 8)}`,
          jobId: data.projectId || null,
          content: buildSummary(data),
          metadata: { ...data, id: saved.id, photos: (data.photos || []).map(p => ({ id: p.id, url: p.url, caption: p.description || p.caption })) },
        });
      } catch { /* soft-fail */ }
      downloadSiteDiaryPdf({ data: { ...data, id: saved.id }, user, today: new Date().toLocaleDateString("en-GB") });
      try { saveToolData(TOOL_ID, { generatedAt: new Date().toISOString(), projectId: data.projectId || null, date: data.date, id: saved.id }); } catch { /* ignore */ }
      // Clear the "new entry" draft after successful save
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      toast.success("Site diary saved");
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const saveAsTemplate = async () => {
    if (!tplName.trim()) return toast.error("Template name required");
    try {
      const payload = { ...data, id: undefined, date: undefined, photos: [], variations: [], deliveries: [], delays: [], issues: [], instructions: [], hsObservations: [], visitors: [], worksCompleted: [], notes: "", signature: "" };
      await api.post("/site-diary/templates", { name: tplName.trim(), payload });
      toast.success("Template saved");
      setTplModalOpen(false); setTplName("");
      try {
        const tRes = await api.get("/site-diary/templates");
        if (Array.isArray(tRes.data)) onTemplatesChanged(tRes.data);
      } catch { /* ignore */ }
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-y-auto" data-testid="sd-wizard">
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-5xl mx-auto card-dark p-5 md:p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-1">{data.id ? "Edit" : "New"} Site Diary Entry</div>
              <h2 className="font-display text-2xl text-[#F0EDE8]">{data.projectName || "Untitled"} <span className="text-sm text-[#A19D94]">· {data.date || "no date"}</span></h2>
            </div>
            <button onClick={onClose} className="text-[#A19D94] hover:text-[#F0EDE8]" data-testid="sd-wizard-close"><X size={20} /></button>
          </div>

          <div className="flex justify-end mb-3">
            <button onClick={() => setTplModalOpen(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="sd-save-template-btn">
              <Save size={12} /> Save as template
            </button>
          </div>

          <div className="overflow-x-auto mb-5" data-testid="sd-stepper">
            <div className="flex gap-1 min-w-max">
              {WIZARD_STEPS.map(s => (
                <button key={s.id} onClick={() => setStep(s.id)} data-testid={`sd-step-${s.id}`}
                  className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${step === s.id ? "bg-[#E8A020] text-black" : step > s.id ? "bg-[#1e1a12] text-[#68D391] border border-[#68D391]/30" : "bg-[#0f0d09] text-[#A19D94] border border-[#2a2620]"}`}>
                  {s.id}. {s.label}
                </button>
              ))}
            </div>
          </div>

          {step === 1 && <StepProject data={data} setData={setData} pickProject={pickProject} jobs={jobs} />}
          {step === 2 && <StepWeather data={data} set={set} />}
          {step === 3 && <StepCrew data={data} setData={setData} autoTotal={autoTotal} />}
          {step === 4 && <StepWorks data={data} setData={setData} set={set} />}
          {step === 5 && <StepDeliveries data={data} setData={setData} />}
          {step === 6 && <StepPlant data={data} setData={setData} />}
          {step === 7 && <StepDelays data={data} setData={setData} />}
          {step === 8 && <StepVariations data={data} setData={setData} />}
          {step === 9 && (
            <div className="space-y-3" data-testid="sd-step-9-photos">
              <p className="text-xs text-[#A19D94]">Photos of works completed, deliveries, damage, delays, or unsafe conditions.</p>
              <AttachMedia toolId={TOOL_ID} toolLabel="Site Diary" jobId={data.projectId || null} category="site-diary"
                value={data.photos || []} onChange={(list) => set("photos")(list)} testIdPrefix="sd-attach" />
            </div>
          )}
          {step === 10 && <StepLinked data={data} setData={setData} docs={docs} />}
          {step === 11 && <StepReview data={data} user={user} previewUrl={previewUrl} onPreview={generatePreview} onSave={saveEntry} saving={saving} onOpenSign={() => setSigningOpen(true)} set={set} />}

          <div className="flex items-center justify-between mt-6">
            <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94] disabled:opacity-40" data-testid="sd-btn-prev"><ChevronLeft size={14} /> Back</button>
            <span className="text-xs text-[#706D66]">Step {step} of {WIZARD_STEPS.length}</span>
            <button onClick={() => setStep(Math.min(WIZARD_STEPS.length, step + 1))} disabled={step === WIZARD_STEPS.length} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-40" data-testid="sd-btn-next">Next <ChevronRight size={14} /></button>
          </div>
        </div>

        {tplModalOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="sd-template-modal">
            <div className="card-dark p-6 max-w-md w-full">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-display text-2xl text-[#F0EDE8]">Save as template</h3>
                <button onClick={() => setTplModalOpen(false)} className="text-[#A19D94]"><X size={18} /></button>
              </div>
              <p className="text-xs text-[#A19D94] mb-3">Saves a reusable day skeleton — standard crew, subcontractors, plant. One-off content (works, photos, delays) is stripped.</p>
              <Field label="Template name"><input className={inputClass} value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Standard First-Fix Day" data-testid="sd-template-name" /></Field>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setTplModalOpen(false)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button>
                <button onClick={saveAsTemplate} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="sd-template-save">Save template</button>
              </div>
            </div>
          </div>
        )}

        {signingOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="sd-sign-modal">
            <div className="card-dark p-5 max-w-lg w-full">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-display text-xl text-[#F0EDE8]">Sign the diary</h3>
                <button onClick={() => setSigningOpen(false)} className="text-[#A19D94]"><X size={18} /></button>
              </div>
              <SignaturePad value={data.signature || ""} onChange={(v) => set("signature")(v)} />
              <div className="flex gap-2 mt-3">
                <button onClick={() => setSigningOpen(false)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button>
                <button onClick={() => setSigningOpen(false)} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="sd-sign-done">Done</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Step components ----

function StepProject({ data, setData, pickProject, jobs }) {
  const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));
  return (
    <div className="space-y-4" data-testid="sd-step-1-project">
      {jobs.length > 0 && (
        <Field label="Link to project (recommended)" hint="Auto-fills client, site and principal contractor. Adds a timeline event when saved.">
          <select value={data.projectId} onChange={(e) => pickProject(e.target.value)} className={inputClass} data-testid="sd-link-project">
            <option value="">Not linked</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.projectName || j.clientName} — {j.address || "no address"}</option>)}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Project name"><input className={inputClass} value={data.projectName} onChange={(e) => set("projectName")(e.target.value)} data-testid="sd-projectName" /></Field>
        <Field label="Client"><input className={inputClass} value={data.clientName} onChange={(e) => set("clientName")(e.target.value)} data-testid="sd-clientName" /></Field>
        <Field label="Principal contractor"><input className={inputClass} value={data.principalContractor} onChange={(e) => set("principalContractor")(e.target.value)} data-testid="sd-pc" /></Field>
        <Field label="Site address"><textarea className={`${inputClass} min-h-[52px]`} value={data.siteAddress} onChange={(e) => set("siteAddress")(e.target.value)} data-testid="sd-siteAddress" /></Field>
      </div>
    </div>
  );
}

function StepWeather({ data, set }) {
  return (
    <div className="space-y-4" data-testid="sd-step-2-weather">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Diary date *"><input type="date" className={inputClass} value={data.date} onChange={(e) => set("date")(e.target.value)} data-testid="sd-date" /></Field>
        <Field label="Start on site"><input type="time" className={inputClass} value={data.startTime} onChange={(e) => set("startTime")(e.target.value)} data-testid="sd-startTime" /></Field>
        <Field label="End on site"><input type="time" className={inputClass} value={data.endTime} onChange={(e) => set("endTime")(e.target.value)} data-testid="sd-endTime" /></Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Conditions">
          <select className={inputClass} value={data.conditions} onChange={(e) => set("conditions")(e.target.value)} data-testid="sd-conditions">
            <option value="">—</option>
            {["Clear", "Partly Cloudy", "Overcast", "Light Rain", "Heavy Rain", "Snow", "Frost", "Fog", "Windy", "Storm"].map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Wind">
          <select className={inputClass} value={data.wind} onChange={(e) => set("wind")(e.target.value)} data-testid="sd-wind">
            <option value="">—</option>
            {["None", "Light breeze", "Moderate", "Strong", "Gale", "Severe"].map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Rain">
          <select className={inputClass} value={data.rain} onChange={(e) => set("rain")(e.target.value)} data-testid="sd-rain">
            <option value="">—</option>
            {["None", "Light", "Heavy", "Snow", "Hail", "Fog"].map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Temperature AM"><input className={inputClass} value={data.tempAM} onChange={(e) => set("tempAM")(e.target.value)} placeholder="e.g. 5°C" data-testid="sd-tempAM" /></Field>
        <Field label="Temperature PM"><input className={inputClass} value={data.tempPM} onChange={(e) => set("tempPM")(e.target.value)} placeholder="e.g. 12°C" data-testid="sd-tempPM" /></Field>
      </div>
      <Field label="Impact of weather on works" hint="Used as evidence for weather-related delay claims."><textarea className={`${inputClass} min-h-[64px]`} value={data.weatherImpact} onChange={(e) => set("weatherImpact")(e.target.value)} placeholder="e.g. Wet weather stopped concreting for 2 hours in the afternoon." data-testid="sd-weatherImpact" /></Field>
    </div>
  );
}

function StepCrew({ data, setData, autoTotal }) {
  const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));
  const crew = data.crew || [];
  const subs = data.subcontractorsOnSite || [];
  const addCrew = () => setData(d => ({ ...d, crew: [...(d.crew || []), { id: crypto.randomUUID(), name: "", company: "", trade: "", hours: "8", notes: "" }] }));
  const updCrew = (id, patch) => setData(d => ({ ...d, crew: d.crew.map(x => x.id === id ? { ...x, ...patch } : x) }));
  const delCrew = (id) => setData(d => ({ ...d, crew: d.crew.filter(x => x.id !== id) }));
  const addSub = () => setData(d => ({ ...d, subcontractorsOnSite: [...(d.subcontractorsOnSite || []), { id: crypto.randomUUID(), company: "", trade: "", operatives: "", notes: "" }] }));
  const updSub = (id, patch) => setData(d => ({ ...d, subcontractorsOnSite: d.subcontractorsOnSite.map(x => x.id === id ? { ...x, ...patch } : x) }));
  const delSub = (id) => setData(d => ({ ...d, subcontractorsOnSite: d.subcontractorsOnSite.filter(x => x.id !== id) }));
  return (
    <div className="space-y-5" data-testid="sd-step-3-crew">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Site supervisor on the day"><input className={inputClass} value={data.supervisor} onChange={(e) => set("supervisor")(e.target.value)} data-testid="sd-supervisor" /></Field>
        <Field label="Total operatives on site" hint="Auto-computed from your crew and subbies."><input className={inputClass} type="number" value={data.totalOperatives || autoTotal} readOnly data-testid="sd-totalOps" /></Field>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Your crew</div>
          <button onClick={addCrew} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#E8A020] text-black text-xs font-medium" data-testid="sd-add-crew"><Plus size={12} /> Add crew member</button>
        </div>
        {crew.length === 0 && <div className="card-dark p-4 text-center text-xs text-[#A19D94]">No crew logged.</div>}
        {crew.map((c, i) => (
          <div key={c.id} className="card-dark p-3 mb-2" data-testid={`sd-crew-${i + 1}`}>
            <div className="flex items-center justify-between mb-2"><span className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Operative {i + 1}</span><button onClick={() => delCrew(c.id)} className="text-[#A19D94] hover:text-[#F27C7C]"><Trash2 size={14} /></button></div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              <Field label="Name"><input className={inputClass} value={c.name} onChange={(e) => updCrew(c.id, { name: e.target.value })} data-testid={`sd-crew-name-${i + 1}`} /></Field>
              <Field label="Company"><input className={inputClass} value={c.company} onChange={(e) => updCrew(c.id, { company: e.target.value })} /></Field>
              <Field label="Trade"><input className={inputClass} value={c.trade} onChange={(e) => updCrew(c.id, { trade: e.target.value })} /></Field>
              <Field label="Hours"><input className={inputClass} value={c.hours} onChange={(e) => updCrew(c.id, { hours: e.target.value })} /></Field>
              <Field label="Notes"><input className={inputClass} value={c.notes} onChange={(e) => updCrew(c.id, { notes: e.target.value })} /></Field>
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Subcontractors on site</div>
          <button onClick={addSub} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#E8A020] text-black text-xs font-medium" data-testid="sd-add-sub"><Plus size={12} /> Add subcontractor</button>
        </div>
        {subs.length === 0 && <div className="card-dark p-4 text-center text-xs text-[#A19D94]">No subcontractors logged.</div>}
        {subs.map((s, i) => (
          <div key={s.id} className="card-dark p-3 mb-2" data-testid={`sd-sub-${i + 1}`}>
            <div className="flex items-center justify-between mb-2"><span className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Subbie {i + 1}</span><button onClick={() => delSub(s.id)} className="text-[#A19D94] hover:text-[#F27C7C]"><Trash2 size={14} /></button></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <Field label="Company"><input className={inputClass} value={s.company} onChange={(e) => updSub(s.id, { company: e.target.value })} data-testid={`sd-sub-company-${i + 1}`} /></Field>
              <Field label="Trade"><input className={inputClass} value={s.trade} onChange={(e) => updSub(s.id, { trade: e.target.value })} /></Field>
              <Field label="Operatives"><input type="number" className={inputClass} value={s.operatives} onChange={(e) => updSub(s.id, { operatives: e.target.value })} /></Field>
              <Field label="Notes"><input className={inputClass} value={s.notes} onChange={(e) => updSub(s.id, { notes: e.target.value })} /></Field>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepWorks({ data, setData, set }) {
  const works = data.worksCompleted || [];
  const add = () => setData(d => ({ ...d, worksCompleted: [...(d.worksCompleted || []), { id: crypto.randomUUID(), location: "", activity: "", progress: "" }] }));
  const upd = (id, patch) => setData(d => ({ ...d, worksCompleted: d.worksCompleted.map(x => x.id === id ? { ...x, ...patch } : x) }));
  const del = (id) => setData(d => ({ ...d, worksCompleted: d.worksCompleted.filter(x => x.id !== id) }));
  return (
    <div className="space-y-4" data-testid="sd-step-4-works">
      <div className="flex items-center justify-between">
        <div className="text-xs text-[#A19D94]">{works.length} activit{works.length === 1 ? "y" : "ies"} logged</div>
        <button onClick={add} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#E8A020] text-black text-xs font-medium" data-testid="sd-add-works"><Plus size={12} /> Add activity</button>
      </div>
      {works.length === 0 && <div className="card-dark p-4 text-center text-xs text-[#A19D94]">No works logged.</div>}
      {works.map((w, i) => (
        <div key={w.id} className="card-dark p-3" data-testid={`sd-work-${i + 1}`}>
          <div className="flex items-center justify-between mb-2"><span className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Activity {i + 1}</span><button onClick={() => del(w.id)} className="text-[#A19D94] hover:text-[#F27C7C]"><Trash2 size={14} /></button></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Field label="Area / Location"><input className={inputClass} value={w.location} onChange={(e) => upd(w.id, { location: e.target.value })} placeholder="e.g. Level 2 north" data-testid={`sd-work-location-${i + 1}`} /></Field>
            <Field label="Activity"><input className={inputClass} value={w.activity} onChange={(e) => upd(w.id, { activity: e.target.value })} placeholder="e.g. First-fix electrics" data-testid={`sd-work-activity-${i + 1}`} /></Field>
            <Field label="Progress today"><input className={inputClass} value={w.progress} onChange={(e) => upd(w.id, { progress: e.target.value })} placeholder="e.g. 60% complete" /></Field>
          </div>
        </div>
      ))}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        <Field label="Overall project progress (%)"><input className={inputClass} value={data.progressPercent} onChange={(e) => set("progressPercent")(e.target.value)} placeholder="e.g. 45" data-testid="sd-progress" /></Field>
        <Field label="Planned for tomorrow"><textarea className={`${inputClass} min-h-[52px]`} value={data.worksTomorrow} onChange={(e) => set("worksTomorrow")(e.target.value)} data-testid="sd-worksTomorrow" /></Field>
      </div>
    </div>
  );
}

function RowEditor({ testId, title, list, columns, add, upd, del }) {
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
          <div className={`grid grid-cols-1 md:grid-cols-${Math.min(columns.length, 4)} gap-2`}>
            {columns.map(col => (
              <Field key={col.k} label={col.label}>
                {col.type === "select" ? (
                  <select className={inputClass} value={row[col.k] || ""} onChange={(e) => upd(row.id, { [col.k]: e.target.value })} data-testid={`${testId}-${col.k}-${i + 1}`}>
                    <option value="">—</option>
                    {(col.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : col.type === "time" ? (
                  <input type="time" className={inputClass} value={row[col.k] || ""} onChange={(e) => upd(row.id, { [col.k]: e.target.value })} data-testid={`${testId}-${col.k}-${i + 1}`} />
                ) : col.textarea ? (
                  <textarea className={`${inputClass} min-h-[52px]`} value={row[col.k] || ""} onChange={(e) => upd(row.id, { [col.k]: e.target.value })} placeholder={col.placeholder} data-testid={`${testId}-${col.k}-${i + 1}`} />
                ) : (
                  <input className={inputClass} value={row[col.k] || ""} onChange={(e) => upd(row.id, { [col.k]: e.target.value })} placeholder={col.placeholder} data-testid={`${testId}-${col.k}-${i + 1}`} />
                )}
              </Field>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StepDeliveries({ data, setData }) {
  const list = data.deliveries || [];
  return <div data-testid="sd-step-5-deliveries">
    <RowEditor testId="sd-delivery" title="Deliveries received today" list={list}
      columns={[
        { k: "time", label: "Time", type: "time" },
        { k: "supplier", label: "Supplier", placeholder: "e.g. Selco" },
        { k: "item", label: "Item", placeholder: "e.g. C24 4x2 timber" },
        { k: "quantity", label: "Quantity", placeholder: "e.g. 50 lengths" },
        { k: "notes", label: "Notes / Condition", placeholder: "e.g. 5 lengths damaged" },
      ]}
      add={() => setData(d => ({ ...d, deliveries: [...(d.deliveries || []), { id: crypto.randomUUID(), time: "", supplier: "", item: "", quantity: "", notes: "" }] }))}
      upd={(id, p) => setData(d => ({ ...d, deliveries: d.deliveries.map(x => x.id === id ? { ...x, ...p } : x) }))}
      del={(id) => setData(d => ({ ...d, deliveries: d.deliveries.filter(x => x.id !== id) }))}
    />
  </div>;
}

function StepPlant({ data, setData }) {
  const list = data.plant || [];
  return <div data-testid="sd-step-6-plant">
    <RowEditor testId="sd-plant" title="Plant & equipment on site" list={list}
      columns={[
        { k: "item", label: "Item", placeholder: "e.g. Cherry picker 12m" },
        { k: "owner", label: "Owner / Hired from", placeholder: "e.g. HSS Hire" },
        { k: "hours", label: "Hours used", placeholder: "e.g. 6" },
        { k: "condition", label: "Condition", type: "select", options: ["Good", "Fair", "Damaged", "Off hire"] },
        { k: "notes", label: "Notes" },
      ]}
      add={() => setData(d => ({ ...d, plant: [...(d.plant || []), { id: crypto.randomUUID(), item: "", owner: "", hours: "", condition: "Good", notes: "" }] }))}
      upd={(id, p) => setData(d => ({ ...d, plant: d.plant.map(x => x.id === id ? { ...x, ...p } : x) }))}
      del={(id) => setData(d => ({ ...d, plant: d.plant.filter(x => x.id !== id) }))}
    />
  </div>;
}

function StepDelays({ data, setData }) {
  const DELAY_CATS = ["Weather", "Design Change", "Late Delivery", "Client Instruction", "Access Restriction", "Labour Shortage", "Plant Breakdown", "Utility Strike", "Other"];
  return <div className="space-y-6" data-testid="sd-step-7-delays">
    <RowEditor testId="sd-delay" title="Delays experienced" list={data.delays || []}
      columns={[
        { k: "category", label: "Category", type: "select", options: DELAY_CATS },
        { k: "description", label: "Description", textarea: true, placeholder: "What happened, when, and for how long" },
        { k: "hours", label: "Duration (hrs)" },
        { k: "impact", label: "Impact on programme", textarea: true },
      ]}
      add={() => setData(d => ({ ...d, delays: [...(d.delays || []), { id: crypto.randomUUID(), category: "", description: "", hours: "", impact: "" }] }))}
      upd={(id, p) => setData(d => ({ ...d, delays: d.delays.map(x => x.id === id ? { ...x, ...p } : x) }))}
      del={(id) => setData(d => ({ ...d, delays: d.delays.filter(x => x.id !== id) }))}
    />
    <RowEditor testId="sd-issue" title="Issues encountered" list={data.issues || []}
      columns={[
        { k: "time", label: "Time", type: "time" },
        { k: "description", label: "Description", textarea: true },
        { k: "actionedBy", label: "Actioned by" },
      ]}
      add={() => setData(d => ({ ...d, issues: [...(d.issues || []), { id: crypto.randomUUID(), time: "", description: "", actionedBy: "" }] }))}
      upd={(id, p) => setData(d => ({ ...d, issues: d.issues.map(x => x.id === id ? { ...x, ...p } : x) }))}
      del={(id) => setData(d => ({ ...d, issues: d.issues.filter(x => x.id !== id) }))}
    />
    <RowEditor testId="sd-instruction" title="Site instructions received" list={data.instructions || []}
      columns={[
        { k: "from", label: "From", placeholder: "e.g. J Smith (PM)" },
        { k: "instruction", label: "Instruction", textarea: true, placeholder: "What was instructed" },
        { k: "method", label: "Method", type: "select", options: ["Verbal", "Email", "SI", "RFI", "Meeting"] },
        { k: "ref", label: "Reference" },
      ]}
      add={() => setData(d => ({ ...d, instructions: [...(d.instructions || []), { id: crypto.randomUUID(), from: "", instruction: "", method: "Verbal", ref: "" }] }))}
      upd={(id, p) => setData(d => ({ ...d, instructions: d.instructions.map(x => x.id === id ? { ...x, ...p } : x) }))}
      del={(id) => setData(d => ({ ...d, instructions: d.instructions.filter(x => x.id !== id) }))}
    />
    <RowEditor testId="sd-hs" title="Health & Safety observations" list={data.hsObservations || []}
      columns={[
        { k: "type", label: "Type", type: "select", options: ["Near miss", "Unsafe act", "Unsafe condition", "First aid", "Incident", "Positive observation"] },
        { k: "description", label: "Description", textarea: true },
        { k: "action", label: "Action taken" },
        { k: "reportedTo", label: "Reported to" },
      ]}
      add={() => setData(d => ({ ...d, hsObservations: [...(d.hsObservations || []), { id: crypto.randomUUID(), type: "", description: "", action: "", reportedTo: "" }] }))}
      upd={(id, p) => setData(d => ({ ...d, hsObservations: d.hsObservations.map(x => x.id === id ? { ...x, ...p } : x) }))}
      del={(id) => setData(d => ({ ...d, hsObservations: d.hsObservations.filter(x => x.id !== id) }))}
    />
    <RowEditor testId="sd-visitor" title="Visitors to site" list={data.visitors || []}
      columns={[
        { k: "name", label: "Name" },
        { k: "company", label: "Company" },
        { k: "purpose", label: "Purpose" },
        { k: "timeIn", label: "Time in", type: "time" },
        { k: "timeOut", label: "Time out", type: "time" },
      ]}
      add={() => setData(d => ({ ...d, visitors: [...(d.visitors || []), { id: crypto.randomUUID(), name: "", company: "", purpose: "", timeIn: "", timeOut: "" }] }))}
      upd={(id, p) => setData(d => ({ ...d, visitors: d.visitors.map(x => x.id === id ? { ...x, ...p } : x) }))}
      del={(id) => setData(d => ({ ...d, visitors: d.visitors.filter(x => x.id !== id) }))}
    />
  </div>;
}

function StepVariations({ data, setData }) {
  return <div data-testid="sd-step-8-variations">
    <RowEditor testId="sd-variation" title="Variations & verbal instructions" list={data.variations || []}
      columns={[
        { k: "ref", label: "Ref", placeholder: "VO-001" },
        { k: "from", label: "From (client, PM)" },
        { k: "description", label: "Description", textarea: true },
        { k: "value", label: "Estimated value (£)" },
        { k: "followUp", label: "Follow-up (email / SI / VO submitted)" },
      ]}
      add={() => setData(d => ({ ...d, variations: [...(d.variations || []), { id: crypto.randomUUID(), ref: "", from: "", description: "", value: "", followUp: "" }] }))}
      upd={(id, p) => setData(d => ({ ...d, variations: d.variations.map(x => x.id === id ? { ...x, ...p } : x) }))}
      del={(id) => setData(d => ({ ...d, variations: d.variations.filter(x => x.id !== id) }))}
    />
    <div className="mt-4 card-dark p-3 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">
      <strong className="text-[#E8A020]">Tip:</strong> Every verbal instruction must be followed up in writing (email or Site Instruction). Log it here today, then use <Link to="/app/verbal-to-variation" className="text-[#E8A020] underline">Verbal to Variation</Link> to convert it into a formal VO.
    </div>
  </div>;
}

function StepLinked({ data, setData, docs }) {
  const KINDS = [
    { key: "rams", label: "RAMS", tools: ["rams"] },
    { key: "methodStatement", label: "Method Statement", tools: ["method-statement"] },
    { key: "coshh", label: "COSHH", tools: ["coshh"] },
    { key: "toolboxTalk", label: "Toolbox Talks", tools: ["toolbox-talk"] },
    { key: "riskRegister", label: "Risk Assessments", tools: ["risk-register"] },
  ];
  const linked = data.linkedDocuments || {};
  const toggle = (kind, doc) => {
    const list = linked[kind] || [];
    const on = list.some(d => d.id === doc.id);
    const next = on ? list.filter(d => d.id !== doc.id) : [...list, { id: doc.id, title: doc.title, refNumber: doc.refNumber, toolId: doc.toolId }];
    setData(d => ({ ...d, linkedDocuments: { ...linked, [kind]: next } }));
  };
  return (
    <div className="space-y-4" data-testid="sd-step-10-linked">
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
                    <button key={d.id} onClick={() => toggle(k.key, d)} type="button" className={`card-dark p-3 text-left ${on ? "border-[#E8A020]/60 bg-[#E8A020]/5" : "hover:border-[#E8A020]/40"}`} data-testid={`sd-link-${d.id}`}>
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

function StepReview({ data, user, previewUrl, onPreview, onSave, saving, onOpenSign, set }) {
  const opCount = data.totalOperatives || (data.crew || []).length || 0;
  return (
    <div className="space-y-4" data-testid="sd-step-11-review">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="card-dark p-3"><Label>Crew</Label><div className="text-2xl text-[#F0EDE8] mt-1">{opCount}</div></div>
        <div className="card-dark p-3"><Label>Deliveries</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.deliveries || []).length}</div></div>
        <div className="card-dark p-3"><Label>Plant</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.plant || []).length}</div></div>
        <div className="card-dark p-3"><Label>Delays</Label><div className="text-2xl text-[#E8A020] mt-1">{(data.delays || []).length}</div></div>
        <div className="card-dark p-3"><Label>Variations</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.variations || []).length}</div></div>
        <div className="card-dark p-3"><Label>Photos</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.photos || []).length}</div></div>
      </div>

      <Field label="Additional notes" hint="Anything else worth recording — off-site issues, upcoming client visits, RFI raised."><textarea className={`${inputClass} min-h-[64px]`} value={data.notes} onChange={(e) => set("notes")(e.target.value)} data-testid="sd-notes" /></Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Prepared by"><input className={inputClass} value={data.preparedBy || user?.fullName || ""} onChange={(e) => set("preparedBy")(e.target.value)} data-testid="sd-preparedBy" /></Field>
        <div>
          <Label>Signature</Label>
          <div className="mt-1 flex items-center gap-3">
            {data.signature ? (
              <img alt="Signature" src={data.signature} className="h-12 w-40 rounded-md border border-[#2a2620] bg-white" />
            ) : (
              <div className="h-12 w-40 rounded-md border border-dashed border-[#2a2620] flex items-center justify-center text-[10px] text-[#706D66]">Not signed</div>
            )}
            <button onClick={onOpenSign} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="sd-sign-open"><PenTool size={12} /> {data.signature ? "Re-sign" : "Sign"}</button>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={onPreview} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#F0EDE8] hover:border-[#E8A020]" data-testid="sd-preview-btn"><RefreshCw size={14} /> {previewUrl ? "Refresh" : "Generate"} preview</button>
        <button onClick={onSave} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-60" data-testid="sd-save-btn">
          <Download size={16} /> {saving ? "Saving..." : "Save & Generate PDF"}
        </button>
      </div>

      {previewUrl && <iframe title="Site Diary Preview" src={previewUrl} className="w-full h-[500px] rounded-md border border-[#2a2620] bg-white" data-testid="sd-preview-iframe" />}

      <div className="card-dark p-4 text-xs text-[#706D66] space-y-1">
        <div>Save creates the diary record, downloads the PDF, adds it to your Document Library and emits a Site Diary Created event on the linked project timeline.</div>
        <div>Diary entries are the foundation of every delay, variation and payment claim. Keep them up to date daily.</div>
      </div>
    </div>
  );
}

function buildSummary(d) {
  const opCount = d.totalOperatives || (d.crew || []).length || 0;
  return `SITE DIARY — ${d.projectName || "Project"} — ${d.date || ""}\nSupervisor: ${d.supervisor || "—"} · Operatives: ${opCount}\nConditions: ${d.conditions || "—"}\nDelays: ${(d.delays || []).length}  ·  Variations: ${(d.variations || []).length}  ·  Photos: ${(d.photos || []).length}`;
}
