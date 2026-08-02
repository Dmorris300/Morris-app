// Morris — Toolbox Talks V2
// 8-step wizard with topic library, per-attendee signature capture, drafts,
// custom templates, and Photo Vault attach.

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ChevronLeft, ChevronRight, Search, Plus, Trash2, Save, Download,
  ClipboardList, BookOpen, FileText, Users, Camera, Link2, User,
  CheckCircle2, X, RefreshCw, PenTool, HardHat, Shield, Flame,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import AttachMedia from "../components/AttachMedia";
import SignaturePad from "../components/SignaturePad";
import { downloadToolboxTalkPdf, toolboxTalkPdfBlobUrl } from "../lib/toolbox-talk-pdf";
import { saveToolData } from "../lib/tool-persistence";

const TOOL_ID = "toolbox-talk";
const DRAFT_KEY = "morris.tool_draft.toolbox-talk";

const STEPS = [
  { id: 1, key: "project",     label: "Project",           icon: ClipboardList },
  { id: 2, key: "topic",       label: "Topic",             icon: BookOpen },
  { id: 3, key: "content",     label: "Talk Content",      icon: FileText },
  { id: 4, key: "attendees",   label: "Attendees",         icon: Users },
  { id: 5, key: "photos",      label: "Site Photos",       icon: Camera },
  { id: 6, key: "linked",      label: "Linked Documents",  icon: Link2 },
  { id: 7, key: "review",      label: "Review",            icon: User },
  { id: 8, key: "generate",    label: "Generate PDF",      icon: Download },
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

const defaultData = () => ({
  // Step 1
  projectName: "", clientName: "", siteAddress: "", principalContractor: "",
  date: new Date().toISOString().slice(0, 10), time: "", presenter: "", supervisor: "",
  duration: "10 min", documentRef: "", projectId: "",
  // Step 2 - topic
  topicId: "", topicTitle: "",
  // Step 3 - content
  sections: {
    introduction: "", hazards: [], controlMeasures: [], bestPractice: [],
    emergencyProcedures: [], keyMessages: [], questions: [],
  },
  // Step 4 - attendees
  attendees: [],
  // Step 5
  photos: [],
  // Step 6
  linkedDocuments: { rams: [], methodStatement: [], coshh: [], riskRegister: [], siteDiary: [] },
});

function saveDraft(d) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ } }
function loadDraft() { try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }

export default function ToolboxTalkV2() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const initialProjectId = params.get("projectId") || "";
  const [data, setData] = useState(() => {
    const saved = loadDraft();
    const d = saved ? { ...defaultData(), ...saved } : defaultData();
    if (initialProjectId) d.projectId = initialProjectId;
    return d;
  });
  const [stepId, setStepId] = useState(1);
  const [topics, setTopics] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [docs, setDocs] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  useEffect(() => {
    api.get("/toolbox-talks/topics").then((r) => setTopics(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    api.get("/toolbox-talks/templates").then((r) => setTemplates(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    api.get("/jobs").then((r) => setJobs(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    api.get("/documents").then((r) => setDocs(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);
  useEffect(() => { if (user?.fullName && !data.presenter) setData((d) => ({ ...d, presenter: user.fullName })); }, [user?.fullName]);
  useEffect(() => { const t = setTimeout(() => saveDraft(data), 500); return () => clearTimeout(t); }, [data]);

  const currentStep = STEPS.find((s) => s.id === stepId);
  const goto = (id) => setStepId(id);
  const next = () => stepId < STEPS.length && setStepId(stepId + 1);
  const prev = () => stepId > 1 && setStepId(stepId - 1);

  const pickProject = (id) => {
    const j = jobs.find((x) => x.id === id);
    if (!j) return;
    setData((d) => ({
      ...d, projectId: j.id,
      projectName: j.projectName || j.clientName || d.projectName,
      clientName: j.clientName || d.clientName,
      siteAddress: j.address || d.siteAddress,
      principalContractor: j.principalContractor || d.principalContractor,
    }));
  };

  const pickTopic = (topic) => {
    setData((d) => ({
      ...d,
      topicId: topic.id, topicTitle: topic.title,
      duration: topic.duration || d.duration,
      sections: {
        introduction: topic.sections.introduction || "",
        hazards: [...(topic.sections.hazards || [])],
        controlMeasures: [...(topic.sections.controlMeasures || [])],
        bestPractice: [...(topic.sections.bestPractice || [])],
        emergencyProcedures: [...(topic.sections.emergencyProcedures || [])],
        keyMessages: [...(topic.sections.keyMessages || [])],
        questions: [...(topic.sections.questions || [])],
      },
    }));
    setStepId(3);
  };

  const startCustom = () => {
    setData((d) => ({
      ...d,
      topicId: "custom", topicTitle: "",
      sections: { introduction: "", hazards: [], controlMeasures: [], bestPractice: [], emergencyProcedures: [], keyMessages: [], questions: [] },
    }));
    setStepId(3);
  };

  const applyTemplate = (tpl) => {
    setData((d) => ({ ...d, topicId: "custom", topicTitle: tpl.topicTitle, sections: tpl.sections }));
    setStepId(3);
    toast.success(`Loaded template "${tpl.name}"`);
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) return toast.error("Template name required");
    if (!data.topicTitle.trim()) return toast.error("Topic title required");
    try {
      const r = await api.post("/toolbox-talks/templates", { name: templateName.trim(), topicTitle: data.topicTitle, sections: data.sections });
      setTemplates((t) => [r.data, ...t]);
      setTemplateModalOpen(false); setTemplateName("");
      toast.success("Template saved");
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
  };

  const generatePreview = () => { try { setPreviewUrl(toolboxTalkPdfBlobUrl({ data, user, today: new Date().toLocaleDateString("en-GB") })); } catch (e) { toast.error("Preview failed"); } };

  const generateAndSave = async () => {
    setGenerating(true);
    try {
      const title = `Toolbox Talk — ${data.topicTitle || "Site Talk"}`;
      const ref = data.documentRef || defaultRefLocal();
      const payload = {
        title, toolId: TOOL_ID, refNumber: ref,
        jobId: data.projectId || null,
        content: buildSummary(data),
        metadata: { ...data, photos: (data.photos || []).map((p) => ({ id: p.id, url: p.url, caption: p.description || p.caption })) },
      };
      await api.post("/documents/save", payload).catch((e) => console.warn("save failed", e));
      downloadToolboxTalkPdf({ data, user, today: new Date().toLocaleDateString("en-GB") });
      try { saveToolData(TOOL_ID, { generatedAt: new Date().toISOString(), title, ref, projectId: data.projectId || null }); } catch { /* ignore */ }
      toast.success("Toolbox Talk generated");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Generate failed");
    } finally { setGenerating(false); }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto" data-testid="toolbox-talk-page">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Health & Safety</div>
          <h1 className="font-display text-3xl sm:text-4xl text-[#F0EDE8]">Toolbox Talk</h1>
          <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">Deliver a professional 10-minute safety brief. Pick from the topic library or write your own — attendees sign on the phone, PDF lands in your Document Library.</p>
        </div>
        <Link to="/app/tools-library" className="text-xs text-[#A19D94] hover:text-[#E8A020] flex items-center gap-1"><ChevronLeft size={14} /> Tools Library</Link>
      </header>

      <div className="mb-6 overflow-x-auto" data-testid="tbt-stepper">
        <div className="flex gap-2 min-w-max">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const active = s.id === stepId;
            const done = s.id < stepId;
            return (
              <button key={s.id} onClick={() => goto(s.id)} data-testid={`tbt-stepper-${s.id}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs transition ${active ? "bg-[#E8A020] text-black" : done ? "bg-[#1e1a12] text-[#68D391] border border-[#68D391]/30" : "bg-[#0f0d09] text-[#A19D94] border border-[#2a2620] hover:border-[#E8A020]/40"}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${active ? "bg-black/20" : done ? "bg-[#68D391]/20" : "bg-[#2a2620]"}`}>{done ? "✓" : s.id}</span>
                <span className="whitespace-nowrap hidden sm:inline">{s.label}</span>
                <Icon size={11} className="opacity-60" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="card-dark p-5 md:p-6">
        <div className="flex items-center gap-2 mb-5">
          <currentStep.icon size={16} className="text-[#E8A020]" />
          <h2 className="font-display text-xl text-[#F0EDE8]">Step {currentStep.id} — {currentStep.label}</h2>
        </div>

        {currentStep.key === "project" && <StepProject data={data} setData={setData} jobs={jobs} pickProject={pickProject} />}
        {currentStep.key === "topic" && <StepTopic topics={topics} templates={templates} onPick={pickTopic} onCustom={startCustom} onApplyTemplate={applyTemplate} onDeleteTemplate={async (id) => { if(!window.confirm("Delete template?")) return; await api.delete(`/toolbox-talks/templates/${id}`); setTemplates((t)=>t.filter(x=>x.id!==id)); toast.success("Deleted"); }} />}
        {currentStep.key === "content" && <StepContent data={data} setData={setData} onSaveTemplateClick={() => setTemplateModalOpen(true)} />}
        {currentStep.key === "attendees" && <StepAttendees data={data} setData={setData} />}
        {currentStep.key === "photos" && (
          <div className="space-y-3">
            <p className="text-xs text-[#A19D94]">Attach photos of the site conditions, unsafe area, correct setup or PPE examples.</p>
            <AttachMedia toolId={TOOL_ID} toolLabel="Toolbox Talk" jobId={data.projectId || null} category="toolbox-talk"
              value={data.photos || []} onChange={(list) => setData((d) => ({ ...d, photos: list }))} testIdPrefix="tbt-attach" />
          </div>
        )}
        {currentStep.key === "linked" && <StepLinked data={data} setData={setData} docs={docs} />}
        {currentStep.key === "review" && <StepReview data={data} previewUrl={previewUrl} onPreview={generatePreview} />}
        {currentStep.key === "generate" && <StepGenerate data={data} onGenerate={generateAndSave} generating={generating} />}
      </div>

      <div className="flex items-center justify-between mt-6 gap-3">
        <button onClick={prev} disabled={stepId === 1} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94] disabled:opacity-40" data-testid="tbt-btn-prev"><ChevronLeft size={14} /> Back</button>
        <div className="text-xs text-[#706D66]">Draft autosaves as you type</div>
        <button onClick={next} disabled={stepId === STEPS.length} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-40" data-testid="tbt-btn-next">Next <ChevronRight size={14} /></button>
      </div>

      {templateModalOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" data-testid="tbt-template-modal">
          <div className="card-dark p-6 max-w-md w-full">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-display text-2xl text-[#F0EDE8]">Save as template</h3>
              <button onClick={() => setTemplateModalOpen(false)} className="text-[#A19D94]"><X size={18} /></button>
            </div>
            <Field label="Template name"><input className={inputClass} value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. Weekly Site Induction" data-testid="tbt-template-name" /></Field>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setTemplateModalOpen(false)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button>
              <button onClick={saveTemplate} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="tbt-template-save">Save template</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function defaultRefLocal() {
  const d = new Date();
  return `TBT-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-001`;
}
function buildSummary(d) {
  return `TOOLBOX TALK — ${d.topicTitle || "Site talk"}\nProject: ${d.projectName || "—"}\nDate: ${d.date || "—"} · Presenter: ${d.presenter || "—"}\nAttendees: ${(d.attendees||[]).length}`;
}

// ---- Step components ----

function StepProject({ data, setData, jobs, pickProject }) {
  const set = (k) => (v) => setData((d) => ({ ...d, [k]: v }));
  return (
    <div className="space-y-4" data-testid="tbt-step-1-project">
      {jobs.length > 0 && (
        <Field label="Link to project (optional)" hint="Auto-fills client, site and principal contractor.">
          <select value={data.projectId} onChange={(e) => pickProject(e.target.value)} className={inputClass} data-testid="tbt-link-project">
            <option value="">Not linked</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.projectName || j.clientName} — {j.address || "no address"}</option>)}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Project"><input className={inputClass} value={data.projectName} onChange={(e) => set("projectName")(e.target.value)} data-testid="tbt-projectName" /></Field>
        <Field label="Client"><input className={inputClass} value={data.clientName} onChange={(e) => set("clientName")(e.target.value)} data-testid="tbt-clientName" /></Field>
        <Field label="Principal Contractor"><input className={inputClass} value={data.principalContractor} onChange={(e) => set("principalContractor")(e.target.value)} data-testid="tbt-pc" /></Field>
        <Field label="Site"><textarea className={`${inputClass} min-h-[52px]`} value={data.siteAddress} onChange={(e) => set("siteAddress")(e.target.value)} data-testid="tbt-site" /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Date"><input type="date" className={inputClass} value={data.date} onChange={(e) => set("date")(e.target.value)} data-testid="tbt-date" /></Field>
        <Field label="Time"><input type="time" className={inputClass} value={data.time} onChange={(e) => set("time")(e.target.value)} data-testid="tbt-time" /></Field>
        <Field label="Delivered by"><input className={inputClass} value={data.presenter} onChange={(e) => set("presenter")(e.target.value)} data-testid="tbt-presenter" /></Field>
      </div>
    </div>
  );
}

function StepTopic({ topics, templates, onPick, onCustom, onApplyTemplate, onDeleteTemplate }) {
  const [q, setQ] = useState("");
  const filtered = q ? topics.filter((t) => (t.title + " " + t.category).toLowerCase().includes(q.toLowerCase())) : topics;
  return (
    <div className="space-y-4" data-testid="tbt-step-2-topic">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search topics..." className={`${inputClass} pl-9`} data-testid="tbt-topic-search" />
      </div>

      {templates.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Your custom templates</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {templates.map((t) => (
              <div key={t.id} className="card-dark p-3 flex items-start justify-between gap-2" data-testid={`tbt-template-${t.id}`}>
                <button onClick={() => onApplyTemplate(t)} className="text-left flex-1 min-w-0">
                  <div className="text-sm text-[#F0EDE8] truncate">{t.name}</div>
                  <div className="text-[11px] text-[#A19D94]">{t.topicTitle}</div>
                </button>
                <button onClick={() => onDeleteTemplate(t.id)} className="text-[#706D66] hover:text-[#F27C7C] p-1"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Topic library</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {filtered.map((topic) => (
          <button key={topic.id} onClick={() => onPick(topic)} className="card-dark p-4 text-left hover:border-[#E8A020]/40 transition" data-testid={`tbt-topic-${topic.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm text-[#F0EDE8] font-medium">{topic.title}</div>
                <div className="text-[11px] text-[#A19D94] mt-1">{topic.category} · {topic.duration}</div>
              </div>
              <ChevronRight size={14} className="text-[#706D66] mt-1" />
            </div>
          </button>
        ))}
      </div>

      <button onClick={onCustom} className="w-full mt-4 py-3 rounded-md border border-dashed border-[#E8A020]/40 text-sm text-[#E8A020] hover:bg-[#E8A020]/5 flex items-center justify-center gap-2" data-testid="tbt-custom-btn">
        <Plus size={14} /> Create custom Toolbox Talk
      </button>
    </div>
  );
}

function BulletEditor({ label, items, onChange, testId, placeholder }) {
  const list = Array.isArray(items) ? items : [];
  const update = (i, v) => onChange(list.map((x, j) => j === i ? v : x));
  const add = () => onChange([...list, ""]);
  const del = (i) => onChange(list.filter((_, j) => j !== i));
  return (
    <Field label={label}>
      <div className="space-y-2">
        {list.map((val, i) => (
          <div key={i} className="flex gap-2">
            <div className="w-2 h-2 rounded-full bg-[#E8A020] mt-3 shrink-0"></div>
            <input value={val} onChange={(e) => update(i, e.target.value)} className={inputClass} placeholder={placeholder} data-testid={`${testId}-${i}`} />
            <button onClick={() => del(i)} className="text-[#A19D94] hover:text-[#F27C7C] p-1 shrink-0"><Trash2 size={14} /></button>
          </div>
        ))}
        <button onClick={add} className="text-xs text-[#E8A020] hover:underline flex items-center gap-1" data-testid={`${testId}-add`}><Plus size={12} /> Add point</button>
      </div>
    </Field>
  );
}

function StepContent({ data, setData, onSaveTemplateClick }) {
  const setSection = (k) => (v) => setData((d) => ({ ...d, sections: { ...d.sections, [k]: v } }));
  const s = data.sections || {};
  return (
    <div className="space-y-5" data-testid="tbt-step-3-content">
      <div className="flex items-end justify-between gap-3">
        <div className="flex-1">
          <Field label="Topic title" hint="Shown large on the cover.">
            <input className={inputClass} value={data.topicTitle} onChange={(e) => setData((d) => ({ ...d, topicTitle: e.target.value }))} data-testid="tbt-topic-title" />
          </Field>
        </div>
        <button onClick={onSaveTemplateClick} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="tbt-save-template-btn">
          <Save size={12} /> Save as template
        </button>
      </div>
      <Field label="Introduction" hint="Short opening — what this talk is about."><textarea className={`${inputClass} min-h-[72px]`} value={s.introduction || ""} onChange={(e) => setSection("introduction")(e.target.value)} data-testid="tbt-introduction" /></Field>
      <BulletEditor label="Hazards" items={s.hazards} onChange={setSection("hazards")} testId="tbt-hazards" placeholder="e.g. Fall from height" />
      <BulletEditor label="Control Measures" items={s.controlMeasures} onChange={setSection("controlMeasures")} testId="tbt-controls" placeholder="e.g. Use podium tower before ladders" />
      <BulletEditor label="Best Practice" items={s.bestPractice} onChange={setSection("bestPractice")} testId="tbt-best" placeholder="e.g. Three points of contact on ladders" />
      <BulletEditor label="Emergency Procedures" items={s.emergencyProcedures} onChange={setSection("emergency")} testId="tbt-emergency" placeholder="e.g. Suspended casualty — cut down within 15 minutes" />
      <BulletEditor label="Key Messages" items={s.keyMessages} onChange={setSection("keyMessages")} testId="tbt-key" placeholder="e.g. If in doubt, stop and ask" />
      <BulletEditor label="Questions for Workforce" items={s.questions} onChange={setSection("questions")} testId="tbt-questions" placeholder="e.g. What is the rescue plan on this site?" />
    </div>
  );
}

function StepAttendees({ data, setData }) {
  const list = data.attendees || [];
  const add = () => setData((d) => ({ ...d, attendees: [...(d.attendees || []), { id: crypto.randomUUID(), name: "", company: "", trade: "", signature: "", time: new Date().toTimeString().slice(0, 5) }] }));
  const update = (id, patch) => setData((d) => ({ ...d, attendees: d.attendees.map((a) => a.id === id ? { ...a, ...patch } : a) }));
  const del = (id) => setData((d) => ({ ...d, attendees: d.attendees.filter((a) => a.id !== id) }));
  const [signingId, setSigningId] = useState(null);
  return (
    <div className="space-y-3" data-testid="tbt-step-4-attendees">
      <div className="flex items-center justify-between">
        <div className="text-xs text-[#A19D94]">{list.length} attendee{list.length === 1 ? "" : "s"}</div>
        <button onClick={add} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="tbt-add-attendee"><Plus size={14} /> Add attendee</button>
      </div>
      {list.length === 0 && <div className="card-dark p-6 text-center text-sm text-[#A19D94]">No attendees yet. Tap Add attendee.</div>}
      {list.map((a, idx) => (
        <div key={a.id} className="card-dark p-4" data-testid={`tbt-attendee-row-${idx + 1}`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Attendee {idx + 1}</span>
            <button onClick={() => del(a.id)} className="text-[#A19D94] hover:text-[#F27C7C]" data-testid={`tbt-attendee-remove-${idx + 1}`}><Trash2 size={14} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <Field label="Name"><input className={inputClass} value={a.name} onChange={(e) => update(a.id, { name: e.target.value })} data-testid={`tbt-attendee-name-${idx + 1}`} /></Field>
            <Field label="Company"><input className={inputClass} value={a.company} onChange={(e) => update(a.id, { company: e.target.value })} data-testid={`tbt-attendee-company-${idx + 1}`} /></Field>
            <Field label="Trade"><input className={inputClass} value={a.trade} onChange={(e) => update(a.id, { trade: e.target.value })} data-testid={`tbt-attendee-trade-${idx + 1}`} /></Field>
            <Field label="Time"><input type="time" className={inputClass} value={a.time} onChange={(e) => update(a.id, { time: e.target.value })} data-testid={`tbt-attendee-time-${idx + 1}`} /></Field>
          </div>
          <div className="mt-3">
            <Label>Signature</Label>
            <div className="mt-1 flex items-center gap-3">
              {a.signature ? (
                <img alt="Signature" src={a.signature} className="h-12 w-40 rounded-md border border-[#2a2620] bg-white" />
              ) : (
                <div className="h-12 w-40 rounded-md border border-dashed border-[#2a2620] flex items-center justify-center text-[10px] text-[#706D66]">Not signed</div>
              )}
              <button onClick={() => setSigningId(a.id)} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid={`tbt-attendee-sign-${idx + 1}`}>
                <PenTool size={12} /> {a.signature ? "Re-sign" : "Sign"}
              </button>
              {a.signature && <button onClick={() => update(a.id, { signature: "" })} className="text-[11px] text-[#F27C7C] hover:underline">Clear</button>}
            </div>
          </div>
        </div>
      ))}

      {signingId && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" data-testid="tbt-sign-modal">
          <div className="card-dark p-5 max-w-lg w-full">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-display text-xl text-[#F0EDE8]">Sign here</h3>
              <button onClick={() => setSigningId(null)} className="text-[#A19D94]"><X size={18} /></button>
            </div>
            <SignaturePad value={list.find((x) => x.id === signingId)?.signature || ""} onChange={(v) => update(signingId, { signature: v })} />
            <div className="flex gap-2 mt-3">
              <button onClick={() => setSigningId(null)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button>
              <button onClick={() => setSigningId(null)} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="tbt-sign-done">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepLinked({ data, setData, docs }) {
  const KINDS = [
    { key: "rams", label: "RAMS", tools: ["rams"] },
    { key: "methodStatement", label: "Method Statement", tools: ["method-statement"] },
    { key: "coshh", label: "COSHH", tools: ["coshh"] },
    { key: "riskRegister", label: "Risk Assessments", tools: ["risk-register"] },
    { key: "siteDiary", label: "Site Diary", tools: ["site-diary", "multiuser-site-diary"] },
  ];
  const linked = data.linkedDocuments || {};
  const toggle = (kind, doc) => {
    const list = linked[kind] || [];
    const on = list.some((d) => d.id === doc.id);
    const next = on ? list.filter((d) => d.id !== doc.id) : [...list, { id: doc.id, title: doc.title, refNumber: doc.refNumber, toolId: doc.toolId }];
    setData((d) => ({ ...d, linkedDocuments: { ...linked, [kind]: next } }));
  };
  return (
    <div className="space-y-6" data-testid="tbt-step-6-linked">
      {KINDS.map((k) => {
        const avail = docs.filter((d) => k.tools.includes(d.toolId));
        const selected = linked[k.key] || [];
        return (
          <div key={k.key} data-testid={`tbt-linked-${k.key}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">{k.label}</div>
              <div className="text-xs text-[#706D66]">{selected.length} linked · {avail.length} available</div>
            </div>
            {avail.length === 0 ? (
              <div className="card-dark p-3 text-xs text-[#706D66]">No {k.label} documents yet.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {avail.slice(0, 8).map((d) => {
                  const on = selected.some((x) => x.id === d.id);
                  return (
                    <button key={d.id} onClick={() => toggle(k.key, d)} type="button" data-testid={`tbt-link-doc-${d.id}`}
                      className={`card-dark p-3 text-left ${on ? "border-[#E8A020]/60 bg-[#E8A020]/5" : "hover:border-[#E8A020]/40"}`}>
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

function StepReview({ data, previewUrl, onPreview }) {
  const s = data.sections || {};
  const count = (arr) => (Array.isArray(arr) ? arr.filter(Boolean).length : 0);
  return (
    <div className="space-y-4" data-testid="tbt-step-7-review">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-dark p-3"><Label>Hazards</Label><div className="text-2xl text-[#F0EDE8] mt-1">{count(s.hazards)}</div></div>
        <div className="card-dark p-3"><Label>Controls</Label><div className="text-2xl text-[#F0EDE8] mt-1">{count(s.controlMeasures)}</div></div>
        <div className="card-dark p-3"><Label>Attendees</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.attendees || []).length}</div></div>
        <div className="card-dark p-3"><Label>Photos</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.photos || []).length}</div></div>
      </div>
      <div className="card-dark p-4">
        <Label>Talk</Label>
        <div className="text-lg text-[#F0EDE8] mt-1">{data.topicTitle || "—"}</div>
        <div className="text-xs text-[#A19D94] mt-1">Project: {data.projectName || "—"} · Presenter: {data.presenter || "—"} · Date: {data.date || "—"} {data.time && `· ${data.time}`}</div>
      </div>
      <button onClick={onPreview} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#F0EDE8] hover:border-[#E8A020]" data-testid="tbt-btn-preview">
        <RefreshCw size={14} /> {previewUrl ? "Refresh preview" : "Generate preview"}
      </button>
      {previewUrl && <iframe title="Toolbox Talk Preview" src={previewUrl} className="w-full h-[500px] rounded-md border border-[#2a2620] bg-white" data-testid="tbt-preview-iframe" />}
    </div>
  );
}

function StepGenerate({ data, onGenerate, generating }) {
  return (
    <div className="space-y-4" data-testid="tbt-step-8-generate">
      <p className="text-sm text-[#A19D94]">Generate the Toolbox Talk PDF. It will save to your Document Library and add a Toolbox Talk Delivered event to the linked project timeline.</p>
      <div className="card-dark p-4 text-xs text-[#706D66] space-y-1">
        <div>📄 <span className="text-[#F0EDE8]">toolbox-talk-{(data.topicTitle || "site-talk").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.pdf</span></div>
        <div>🗂 Appears in Document Library and Recent Documents</div>
        {data.projectId && <div>🗓 Timeline event added to the linked project</div>}
        <div>👥 {(data.attendees || []).length} attendees signed</div>
      </div>
      <button onClick={onGenerate} disabled={generating} className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-60" data-testid="tbt-btn-generate">
        <Download size={16} /> {generating ? "Generating..." : "Generate Toolbox Talk PDF"}
      </button>
    </div>
  );
}
