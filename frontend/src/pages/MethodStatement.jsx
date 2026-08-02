// Morris — Method Statement V2
// Dedicated 12-step wizard producing a premium Method Statement PDF.
// Complements RAMS. Integrates with Project Workspace, Photo Vault, Document
// Library, Timeline and Command Centre.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronLeft, ChevronRight, GripVertical, Plus, Trash2, Copy, Save,
  Download, FileText, HardHat, ShieldCheck, ClipboardList, Cog,
  Package, User, AlertTriangle, Camera, Link2, CheckCircle2, X,
  BookMarked, ArrowRight, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import AttachMedia from "../components/AttachMedia";
import { downloadMethodStatementPdf, methodStatementPdfBlobUrl, PPE_CATALOG } from "../lib/method-statement-pdf";
import { saveToolData } from "../lib/tool-persistence";

const TOOL_ID = "method-statement";
const TOOL_LABEL = "Method Statement";
const DRAFT_KEY = "morris.tool_draft.method-statement";

const STEPS = [
  { id: 1,  key: "project",       label: "Project Details",       icon: ClipboardList },
  { id: 2,  key: "scope",         label: "Scope of Works",        icon: FileText },
  { id: 3,  key: "sequence",      label: "Work Sequence",         icon: HardHat },
  { id: 4,  key: "plant",         label: "Plant & Equipment",     icon: Cog },
  { id: 5,  key: "materials",     label: "Materials",             icon: Package },
  { id: 6,  key: "ppe",           label: "PPE",                   icon: ShieldCheck },
  { id: 7,  key: "environmental", label: "Environmental",         icon: BookMarked },
  { id: 8,  key: "emergency",     label: "Emergency Procedures",  icon: AlertTriangle },
  { id: 9,  key: "attachments",   label: "Attachments",           icon: Camera },
  { id: 10, key: "linked",        label: "Linked Documents",      icon: Link2 },
  { id: 11, key: "review",        label: "Review",                icon: User },
  { id: 12, key: "generate",      label: "Generate PDF",          icon: Download },
];

// ---------- Default state ----------
const emptyStep = () => ({ id: crypto.randomUUID(), title: "", description: "" });
const defaultData = () => ({
  // Step 1
  projectName: "", clientName: "", siteAddress: "", principalContractor: "",
  mainContractor: "", preparedBy: "", revisionNumber: "Rev 1",
  documentRef: "", workingHours: "", operativesCount: "",
  projectId: "",
  // Step 2
  scopeOfWorks: "", objectives: "", workLocation: "", areasAffected: "",
  // Step 3
  workSequence: [
    { id: crypto.randomUUID(), title: "Site induction", description: "All operatives to attend site induction before starting work." },
  ],
  // Step 4
  plantEquipment: [{ id: crypto.randomUUID(), equipment: "", purpose: "", inspection: "" }],
  // Step 5
  materials: [{ id: crypto.randomUUID(), material: "", purpose: "", storage: "" }],
  // Step 6
  ppe: { "hard-hat": true, "safety-boots": true, "hi-vis": true, "gloves": true, otherText: "" },
  // Step 7
  environmental: { wasteManagement: "", dustControl: "", noiseControl: "", spillPrevention: "", protectionExisting: "" },
  // Step 8
  emergency: { firstAid: "", firePlan: "", contacts: "", assemblyPoint: "", hospital: "", accessRoute: "" },
  // Step 9
  photos: [],
  // Step 10
  linkedDocuments: { rams: [], riskRegister: [], coshh: [], toolboxTalk: [] },
  // Step 11 sign-off
  checkedBy: "",
  approvedBy: "",
});

// ---------- Draft persistence ----------
function saveDraft(data) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}
function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ---------- Sortable step row ----------
function SortableStep({ step, index, onUpdate, onDelete, onDuplicate }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="card-dark p-4" data-testid={`step-row-${index + 1}`}>
      <div className="flex gap-3">
        <button
          {...attributes} {...listeners}
          className="touch-none text-[#706D66] hover:text-[#E8A020] cursor-grab active:cursor-grabbing p-1 self-start"
          aria-label={`Drag step ${index + 1}`}
          data-testid={`step-drag-${index + 1}`}
        >
          <GripVertical size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Step {index + 1}</span>
            <div className="flex ml-auto gap-1">
              <button onClick={() => onDuplicate(step.id)} className="p-1 text-[#A19D94] hover:text-[#E8A020]" aria-label="Duplicate" data-testid={`step-duplicate-${index + 1}`}><Copy size={14} /></button>
              <button onClick={() => onDelete(step.id)} className="p-1 text-[#A19D94] hover:text-[#F27C7C]" aria-label="Delete" data-testid={`step-delete-${index + 1}`}><Trash2 size={14} /></button>
            </div>
          </div>
          <input
            value={step.title}
            onChange={(e) => onUpdate(step.id, { title: e.target.value })}
            placeholder="Step title (e.g. Install barriers)"
            className="w-full bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none mb-2"
            data-testid={`step-title-${index + 1}`}
          />
          <textarea
            value={step.description}
            onChange={(e) => onUpdate(step.id, { description: e.target.value })}
            placeholder="What happens in this step, in plain construction English."
            className="w-full bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none min-h-[60px]"
            data-testid={`step-desc-${index + 1}`}
          />
        </div>
      </div>
    </div>
  );
}

// ---------- Small UI atoms ----------
const inputClass = "w-full bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none";
const Label = ({ children }) => <label className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">{children}</label>;
const Field = ({ label, children, hint }) => (
  <div>
    <Label>{label}</Label>
    <div className="mt-1">{children}</div>
    {hint && <div className="text-[11px] text-[#706D66] mt-1">{hint}</div>}
  </div>
);

// ================================================================
// MAIN PAGE
// ================================================================
export default function MethodStatementV2() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const initialProjectId = searchParams.get("projectId") || "";

  const [data, setData] = useState(() => {
    const saved = loadDraft();
    if (saved) return { ...defaultData(), ...saved };
    const d = defaultData();
    if (initialProjectId) d.projectId = initialProjectId;
    return d;
  });
  const [stepId, setStepId] = useState(1);
  const [jobs, setJobs] = useState([]);
  const [docs, setDocs] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);

  // Prefill preparedBy from user profile
  useEffect(() => {
    if (user?.fullName && !data.preparedBy) {
      setData((d) => ({ ...d, preparedBy: user.fullName }));
    }
  }, [user?.fullName]);

  // Load supporting data
  useEffect(() => {
    api.get("/jobs").then((r) => setJobs(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    api.get("/documents").then((r) => setDocs(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    api.get("/method-statement/templates").then((r) => setTemplates(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  // Autosave draft
  useEffect(() => {
    const t = setTimeout(() => saveDraft(data), 500);
    return () => clearTimeout(t);
  }, [data]);

  // When project is picked, prefill client/address/principal contractor
  const pickProject = (id) => {
    const j = jobs.find((x) => x.id === id);
    if (!j) return;
    setData((d) => ({
      ...d,
      projectId: j.id,
      projectName: j.projectName || j.clientName || d.projectName,
      clientName: j.clientName || d.clientName,
      siteAddress: j.address || d.siteAddress,
      principalContractor: j.principalContractor || d.principalContractor,
    }));
  };

  const totalSteps = STEPS.length;
  const currentIdx = STEPS.findIndex((s) => s.id === stepId);
  const currentStep = STEPS[currentIdx];
  const goto = (id) => setStepId(id);
  const next = () => stepId < totalSteps && setStepId(stepId + 1);
  const prev = () => stepId > 1 && setStepId(stepId - 1);

  // ---------- Save / generate ----------
  const generatePreview = () => {
    try {
      const url = methodStatementPdfBlobUrl({ data, user, today: new Date().toLocaleDateString("en-GB") });
      setPreviewUrl(url);
    } catch (e) {
      toast.error("Preview failed: " + e.message);
    }
  };

  const generateAndSave = async () => {
    setGenerating(true);
    try {
      // 1. Save document metadata to /api/documents/save
      const title = `Method Statement — ${data.projectName || data.clientName || "Project"}`;
      const ref = data.documentRef || defaultRefLocal();
      const payload = {
        title,
        toolId: TOOL_ID,
        refNumber: ref,
        jobId: data.projectId || null,
        content: buildContentSummary(data),
        metadata: {
          ...data,
          // Don't embed base64 photo urls inside the doc content
          photos: (data.photos || []).map((p) => ({ id: p.id, url: p.url, caption: p.description || p.caption })),
        },
      };
      await api.post("/documents/save", payload).catch((e) => {
        console.warn("documents/save failed", e);
      });
      // 2. Trigger PDF download
      downloadMethodStatementPdf({ data, user, today: new Date().toLocaleDateString("en-GB") });
      // 3. Notification / persistence hooks
      try { saveToolData(TOOL_ID, { generatedAt: new Date().toISOString(), title, ref }); } catch { /* ignore */ }
      toast.success("Method Statement generated");
    } catch (e) {
      toast.error("Generate failed: " + (e?.response?.data?.detail || e.message));
    } finally {
      setGenerating(false);
    }
  };

  // ---------- Template ops ----------
  const applyTemplate = (tpl) => {
    if (!tpl?.steps?.length) return;
    setData((d) => ({
      ...d,
      workSequence: tpl.steps.map((s) => ({ id: crypto.randomUUID(), title: s.title, description: s.description || "" })),
    }));
    toast.success(`Loaded template "${tpl.name}"`);
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) return toast.error("Template name required");
    if (!data.workSequence?.length) return toast.error("At least one step required");
    try {
      const r = await api.post("/method-statement/templates", {
        name: templateName.trim(),
        steps: data.workSequence.map((s) => ({ title: s.title || "", description: s.description || "" })),
      });
      setTemplates((t) => [r.data, ...t]);
      setTemplateModalOpen(false);
      setTemplateName("");
      toast.success("Template saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    }
  };

  const deleteTemplate = async (id) => {
    if (!window.confirm("Delete this template?")) return;
    try {
      await api.delete(`/method-statement/templates/${id}`);
      setTemplates((t) => t.filter((x) => x.id !== id));
      toast.success("Template deleted");
    } catch { toast.error("Delete failed"); }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto" data-testid="method-statement-page">
      {/* Header */}
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Health & Safety</div>
          <h1 className="font-display text-3xl sm:text-4xl text-[#F0EDE8]">Method Statement</h1>
          <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">Standalone Method Statement wizard. Complements RAMS with a dedicated step-by-step safe method of work.</p>
        </div>
        <Link to="/app/tools-library" className="text-xs text-[#A19D94] hover:text-[#E8A020] flex items-center gap-1">
          <ChevronLeft size={14} /> Tools Library
        </Link>
      </header>

      {/* Progress rail */}
      <div className="mb-6 overflow-x-auto" data-testid="method-statement-stepper">
        <div className="flex gap-2 min-w-max">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = s.id === stepId;
            const done = s.id < stepId;
            return (
              <button
                key={s.id}
                onClick={() => goto(s.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs transition ${active ? "bg-[#E8A020] text-black" : done ? "bg-[#1e1a12] text-[#68D391] border border-[#68D391]/30" : "bg-[#0f0d09] text-[#A19D94] border border-[#2a2620] hover:border-[#E8A020]/40"}`}
                data-testid={`stepper-${s.id}`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${active ? "bg-black/20" : done ? "bg-[#68D391]/20" : "bg-[#2a2620]"}`}>{done ? "✓" : s.id}</span>
                <span className="whitespace-nowrap hidden sm:inline">{s.label}</span>
                {i === STEPS.length - 1 ? null : <ChevronRight size={11} className="opacity-60" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Step body */}
      <div className="card-dark p-5 md:p-6">
        <div className="flex items-center gap-2 mb-5">
          {currentStep.icon && <currentStep.icon size={16} className="text-[#E8A020]" />}
          <h2 className="font-display text-xl text-[#F0EDE8]">Step {currentStep.id} — {currentStep.label}</h2>
        </div>

        {currentStep.key === "project" && (
          <Step1Project data={data} setData={setData} jobs={jobs} pickProject={pickProject} />
        )}
        {currentStep.key === "scope" && (
          <Step2Scope data={data} setData={setData} />
        )}
        {currentStep.key === "sequence" && (
          <Step3Sequence
            data={data}
            setData={setData}
            templates={templates}
            applyTemplate={applyTemplate}
            deleteTemplate={deleteTemplate}
            onSaveTemplateClick={() => setTemplateModalOpen(true)}
          />
        )}
        {currentStep.key === "plant" && (
          <Step4Plant data={data} setData={setData} />
        )}
        {currentStep.key === "materials" && (
          <Step5Materials data={data} setData={setData} />
        )}
        {currentStep.key === "ppe" && (
          <Step6Ppe data={data} setData={setData} />
        )}
        {currentStep.key === "environmental" && (
          <Step7Env data={data} setData={setData} />
        )}
        {currentStep.key === "emergency" && (
          <Step8Emergency data={data} setData={setData} />
        )}
        {currentStep.key === "attachments" && (
          <Step9Attachments data={data} setData={setData} />
        )}
        {currentStep.key === "linked" && (
          <Step10Linked data={data} setData={setData} docs={docs} />
        )}
        {currentStep.key === "review" && (
          <Step11Review data={data} previewUrl={previewUrl} onPreview={generatePreview} setData={setData} />
        )}
        {currentStep.key === "generate" && (
          <Step12Generate data={data} onGenerate={generateAndSave} generating={generating} />
        )}
      </div>

      {/* Nav footer */}
      <div className="flex items-center justify-between mt-6 gap-3">
        <button
          onClick={prev}
          disabled={stepId === 1}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94] hover:text-[#F0EDE8] disabled:opacity-40"
          data-testid="btn-prev"
        >
          <ChevronLeft size={14} /> Back
        </button>
        <div className="text-xs text-[#706D66]">
          Draft autosaves as you type
        </div>
        <button
          onClick={next}
          disabled={stepId === totalSteps}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040] disabled:opacity-40"
          data-testid="btn-next"
        >
          Next <ChevronRight size={14} />
        </button>
      </div>

      {/* Save Template modal */}
      {templateModalOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" data-testid="template-modal">
          <div className="card-dark p-6 max-w-md w-full">
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-display text-2xl text-[#F0EDE8]">Save work sequence template</h3>
              <button onClick={() => setTemplateModalOpen(false)} className="text-[#A19D94]"><X size={18} /></button>
            </div>
            <p className="text-xs text-[#A19D94] mb-3">Saves the {data.workSequence?.length || 0} step{data.workSequence?.length === 1 ? "" : "s"} in your current work sequence. Reuse it on any future Method Statement.</p>
            <Field label="Template name">
              <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} className={inputClass} placeholder="e.g. Standard install day" data-testid="template-name" />
            </Field>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setTemplateModalOpen(false)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]" data-testid="template-cancel">Cancel</button>
              <button onClick={saveTemplate} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="template-save">Save template</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function defaultRefLocal() {
  const d = new Date();
  return `MS-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-001`;
}

function buildContentSummary(d) {
  const lines = [];
  lines.push(`METHOD STATEMENT — ${d.projectName || "Project"}`);
  lines.push(`Client: ${d.clientName || "—"}`);
  lines.push(`Site: ${d.siteAddress || "—"}`);
  lines.push(`Principal Contractor: ${d.principalContractor || "—"}`);
  lines.push(`Revision: ${d.revisionNumber || "Rev 1"}`);
  lines.push("");
  lines.push("SCOPE OF WORKS");
  lines.push(d.scopeOfWorks || "—");
  lines.push("");
  lines.push("WORK SEQUENCE");
  (d.workSequence || []).forEach((s, i) => {
    lines.push(`${i + 1}. ${s.title || "Untitled step"}`);
    if (s.description) lines.push(`   ${s.description}`);
  });
  return lines.join("\n");
}

// ================================================================
// STEP COMPONENTS
// ================================================================

function Step1Project({ data, setData, jobs, pickProject }) {
  const set = (k) => (v) => setData((d) => ({ ...d, [k]: v }));
  return (
    <div className="space-y-4" data-testid="step-1-project">
      {jobs.length > 0 && (
        <Field label="Link to existing project (optional)" hint="Auto-fills the fields below.">
          <select value={data.projectId} onChange={(e) => pickProject(e.target.value)} className={inputClass} data-testid="link-project">
            <option value="">Not linked</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.projectName || j.clientName} — {j.address || "no address"}</option>
            ))}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Project name"><input className={inputClass} value={data.projectName} onChange={(e) => set("projectName")(e.target.value)} data-testid="field-projectName" /></Field>
        <Field label="Client"><input className={inputClass} value={data.clientName} onChange={(e) => set("clientName")(e.target.value)} data-testid="field-clientName" /></Field>
        <Field label="Principal Contractor"><input className={inputClass} value={data.principalContractor} onChange={(e) => set("principalContractor")(e.target.value)} data-testid="field-principalContractor" /></Field>
        <Field label="Main Contractor"><input className={inputClass} value={data.mainContractor} onChange={(e) => set("mainContractor")(e.target.value)} data-testid="field-mainContractor" /></Field>
      </div>
      <Field label="Site address">
        <textarea className={`${inputClass} min-h-[64px]`} value={data.siteAddress} onChange={(e) => set("siteAddress")(e.target.value)} data-testid="field-siteAddress" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Prepared By"><input className={inputClass} value={data.preparedBy} onChange={(e) => set("preparedBy")(e.target.value)} data-testid="field-preparedBy" /></Field>
        <Field label="Revision"><input className={inputClass} value={data.revisionNumber} onChange={(e) => set("revisionNumber")(e.target.value)} data-testid="field-revisionNumber" /></Field>
        <Field label="Document reference" hint="Optional. Auto-generated if left blank."><input className={inputClass} value={data.documentRef} onChange={(e) => set("documentRef")(e.target.value)} placeholder="MS-YYYYMMDD-001" data-testid="field-documentRef" /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Working hours"><input className={inputClass} placeholder="e.g. 08:00–17:00 Mon–Fri" value={data.workingHours} onChange={(e) => set("workingHours")(e.target.value)} data-testid="field-workingHours" /></Field>
        <Field label="Number of operatives"><input type="number" className={inputClass} value={data.operativesCount} onChange={(e) => set("operativesCount")(e.target.value)} data-testid="field-operativesCount" /></Field>
      </div>
    </div>
  );
}

function Step2Scope({ data, setData }) {
  const set = (k) => (v) => setData((d) => ({ ...d, [k]: v }));
  return (
    <div className="space-y-4" data-testid="step-2-scope">
      <Field label="What work is being undertaken" hint="Write in plain construction English — the client should understand it.">
        <textarea className={`${inputClass} min-h-[100px]`} value={data.scopeOfWorks} onChange={(e) => set("scopeOfWorks")(e.target.value)} data-testid="field-scopeOfWorks" />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Project objectives"><textarea className={`${inputClass} min-h-[80px]`} value={data.objectives} onChange={(e) => set("objectives")(e.target.value)} data-testid="field-objectives" /></Field>
        <Field label="Work location"><textarea className={`${inputClass} min-h-[80px]`} value={data.workLocation} onChange={(e) => set("workLocation")(e.target.value)} data-testid="field-workLocation" /></Field>
      </div>
      <Field label="Areas affected" hint="Rooms, floors, external spaces or existing services impacted."><textarea className={`${inputClass} min-h-[80px]`} value={data.areasAffected} onChange={(e) => set("areasAffected")(e.target.value)} data-testid="field-areasAffected" /></Field>
    </div>
  );
}

function Step3Sequence({ data, setData, templates, applyTemplate, deleteTemplate, onSaveTemplateClick }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const update = (id, patch) => setData((d) => ({ ...d, workSequence: d.workSequence.map((s) => s.id === id ? { ...s, ...patch } : s) }));
  const del = (id) => setData((d) => ({ ...d, workSequence: d.workSequence.filter((s) => s.id !== id) }));
  const dup = (id) => setData((d) => {
    const idx = d.workSequence.findIndex((s) => s.id === id);
    if (idx < 0) return d;
    const clone = { ...d.workSequence[idx], id: crypto.randomUUID() };
    const next = [...d.workSequence];
    next.splice(idx + 1, 0, clone);
    return { ...d, workSequence: next };
  });
  const add = () => setData((d) => ({ ...d, workSequence: [...(d.workSequence || []), emptyStep()] }));
  const onDragEnd = (e) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setData((d) => {
      const oldIdx = d.workSequence.findIndex((s) => s.id === active.id);
      const newIdx = d.workSequence.findIndex((s) => s.id === over.id);
      return { ...d, workSequence: arrayMove(d.workSequence, oldIdx, newIdx) };
    });
  };
  return (
    <div className="space-y-4" data-testid="step-3-sequence">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-[#A19D94]">{data.workSequence?.length || 0} step{data.workSequence?.length === 1 ? "" : "s"} · drag the grip to reorder</div>
        <div className="flex gap-2">
          {templates.length > 0 && (
            <select onChange={(e) => { const t = templates.find((x) => x.id === e.target.value); if (t) applyTemplate(t); e.target.value = ""; }} className={`${inputClass} text-xs w-auto`} data-testid="template-picker">
              <option value="">Load template...</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.steps?.length || 0} steps)</option>)}
            </select>
          )}
          <button onClick={onSaveTemplateClick} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="btn-save-template">
            <Save size={12} /> Save as template
          </button>
        </div>
      </div>

      {templates.length > 0 && (
        <div className="text-[11px] text-[#706D66] flex flex-wrap gap-2">
          Templates:
          {templates.slice(0, 6).map((t) => (
            <button key={t.id} onClick={() => deleteTemplate(t.id)} className="px-2 py-0.5 rounded-full border border-[#2a2620] text-[10px] text-[#A19D94] hover:text-[#F27C7C] hover:border-[#F27C7C]/40" title="Delete template">
              {t.name} ×
            </button>
          ))}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={(data.workSequence || []).map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {(data.workSequence || []).map((step, idx) => (
              <SortableStep key={step.id} step={step} index={idx} onUpdate={update} onDelete={del} onDuplicate={dup} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button onClick={add} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-dashed border-[#E8A020]/40 text-sm text-[#E8A020] hover:bg-[#E8A020]/5 w-full justify-center" data-testid="btn-add-step">
        <Plus size={14} /> Add step
      </button>
    </div>
  );
}

function RowTable({ rows, columns, onChange, testIdBase }) {
  const add = () => onChange([...(rows || []), Object.fromEntries([["id", crypto.randomUUID()], ...columns.map((c) => [c.key, ""])])]);
  const update = (id, patch) => onChange(rows.map((r) => r.id === id ? { ...r, ...patch } : r));
  const del = (id) => onChange(rows.filter((r) => r.id !== id));
  return (
    <div className="space-y-2" data-testid={testIdBase}>
      {rows.map((r, idx) => (
        <div key={r.id} className="card-dark p-3 grid grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))_auto] gap-2 items-start" data-testid={`${testIdBase}-row-${idx + 1}`}>
          {columns.map((c) => (
            <div key={c.key}>
              <label className="text-[10px] uppercase tracking-[0.2em] text-[#706D66]">{c.label}</label>
              <input value={r[c.key] || ""} onChange={(e) => update(r.id, { [c.key]: e.target.value })} className={`${inputClass} mt-1`} placeholder={c.placeholder} data-testid={`${testIdBase}-${c.key}-${idx + 1}`} />
            </div>
          ))}
          <button onClick={() => del(r.id)} className="mt-4 sm:mt-6 p-2 text-[#A19D94] hover:text-[#F27C7C] self-start" aria-label="Remove row" data-testid={`${testIdBase}-remove-${idx + 1}`}><Trash2 size={14} /></button>
        </div>
      ))}
      <button onClick={add} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-dashed border-[#E8A020]/40 text-sm text-[#E8A020] hover:bg-[#E8A020]/5 w-full justify-center" data-testid={`${testIdBase}-add`}>
        <Plus size={14} /> Add row
      </button>
    </div>
  );
}

function Step4Plant({ data, setData }) {
  return (
    <div data-testid="step-4-plant">
      <p className="text-xs text-[#A19D94] mb-3">Every piece of plant or equipment to be used on this method. Unlimited rows.</p>
      <RowTable
        rows={data.plantEquipment || []}
        onChange={(rows) => setData((d) => ({ ...d, plantEquipment: rows }))}
        columns={[
          { key: "equipment", label: "Equipment", placeholder: "e.g. Podium tower" },
          { key: "purpose", label: "Purpose", placeholder: "e.g. Access up to 2m" },
          { key: "inspection", label: "Inspection Required", placeholder: "e.g. Weekly PUWER inspection" },
        ]}
        testIdBase="plant-table"
      />
    </div>
  );
}

function Step5Materials({ data, setData }) {
  return (
    <div data-testid="step-5-materials">
      <p className="text-xs text-[#A19D94] mb-3">Materials required and how they will be stored on site.</p>
      <RowTable
        rows={data.materials || []}
        onChange={(rows) => setData((d) => ({ ...d, materials: rows }))}
        columns={[
          { key: "material", label: "Material", placeholder: "e.g. 25mm SWA cable" },
          { key: "purpose", label: "Purpose", placeholder: "e.g. Sub-main install" },
          { key: "storage", label: "Storage Requirements", placeholder: "e.g. Off-cut store, dry" },
        ]}
        testIdBase="materials-table"
      />
    </div>
  );
}

function Step6Ppe({ data, setData }) {
  const toggle = (id) => setData((d) => ({ ...d, ppe: { ...d.ppe, [id]: !d.ppe?.[id] } }));
  return (
    <div className="space-y-4" data-testid="step-6-ppe">
      <p className="text-xs text-[#A19D94]">Select every item of PPE required on this method.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {PPE_CATALOG.filter((p) => p.id !== "other").map((p) => {
          const on = !!data.ppe?.[p.id];
          return (
            <button key={p.id} onClick={() => toggle(p.id)} type="button" data-testid={`ppe-${p.id}`}
              className={`card-dark p-4 text-left transition ${on ? "border-[#E8A020]/60 bg-[#E8A020]/5" : "hover:border-[#E8A020]/30"}`}>
              <div className="flex items-center justify-between">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${on ? "bg-[#E8A020] text-black" : "bg-[#1e1a12] text-[#706D66]"}`}>{p.mark}</div>
                {on && <CheckCircle2 size={16} className="text-[#68D391]" />}
              </div>
              <div className={`text-sm mt-2 ${on ? "text-[#F0EDE8]" : "text-[#A19D94]"}`}>{p.label}</div>
            </button>
          );
        })}
      </div>
      <Field label="Other PPE — describe" hint="Anything not covered above (e.g. gauntlets, waders, arc-flash suit)."><textarea className={`${inputClass} min-h-[60px]`} value={data.ppe?.otherText || ""} onChange={(e) => setData((d) => ({ ...d, ppe: { ...d.ppe, other: !!e.target.value.trim(), otherText: e.target.value } }))} data-testid="ppe-other-text" /></Field>
    </div>
  );
}

function Step7Env({ data, setData }) {
  const set = (k) => (v) => setData((d) => ({ ...d, environmental: { ...d.environmental, [k]: v } }));
  const env = data.environmental || {};
  return (
    <div className="space-y-4" data-testid="step-7-env">
      <Field label="Waste management"><textarea className={`${inputClass} min-h-[60px]`} placeholder="Skip location, segregation rules, waste transfer notes." value={env.wasteManagement || ""} onChange={(e) => set("wasteManagement")(e.target.value)} data-testid="env-waste" /></Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Dust control"><textarea className={`${inputClass} min-h-[60px]`} placeholder="LEV, damping down, extraction on tools." value={env.dustControl || ""} onChange={(e) => set("dustControl")(e.target.value)} data-testid="env-dust" /></Field>
        <Field label="Noise control"><textarea className={`${inputClass} min-h-[60px]`} placeholder="Quiet-hours restrictions, hearing protection zones." value={env.noiseControl || ""} onChange={(e) => set("noiseControl")(e.target.value)} data-testid="env-noise" /></Field>
        <Field label="Spill prevention"><textarea className={`${inputClass} min-h-[60px]`} placeholder="Drip trays, spill kits, containment." value={env.spillPrevention || ""} onChange={(e) => set("spillPrevention")(e.target.value)} data-testid="env-spill" /></Field>
        <Field label="Protection of existing works"><textarea className={`${inputClass} min-h-[60px]`} placeholder="Floor protection, dust screens, edge protection." value={env.protectionExisting || ""} onChange={(e) => set("protectionExisting")(e.target.value)} data-testid="env-protection" /></Field>
      </div>
    </div>
  );
}

function Step8Emergency({ data, setData }) {
  const set = (k) => (v) => setData((d) => ({ ...d, emergency: { ...d.emergency, [k]: v } }));
  const em = data.emergency || {};
  return (
    <div className="space-y-4" data-testid="step-8-emergency">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="First aid arrangements"><textarea className={`${inputClass} min-h-[60px]`} value={em.firstAid || ""} onChange={(e) => set("firstAid")(e.target.value)} data-testid="em-firstaid" /></Field>
        <Field label="Fire procedure"><textarea className={`${inputClass} min-h-[60px]`} value={em.firePlan || ""} onChange={(e) => set("firePlan")(e.target.value)} data-testid="em-fire" /></Field>
      </div>
      <Field label="Emergency contacts" hint="Site manager, first aider, principal contractor's ops manager — name and number per line."><textarea className={`${inputClass} min-h-[80px]`} value={em.contacts || ""} onChange={(e) => set("contacts")(e.target.value)} data-testid="em-contacts" /></Field>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Assembly point"><input className={inputClass} value={em.assemblyPoint || ""} onChange={(e) => set("assemblyPoint")(e.target.value)} data-testid="em-assembly" /></Field>
        <Field label="Nearest hospital"><input className={inputClass} placeholder="e.g. Kings College Hospital, SE5 9RS" value={em.hospital || ""} onChange={(e) => set("hospital")(e.target.value)} data-testid="em-hospital" /></Field>
        <Field label="Emergency access route"><input className={inputClass} value={em.accessRoute || ""} onChange={(e) => set("accessRoute")(e.target.value)} data-testid="em-access" /></Field>
      </div>
    </div>
  );
}

function Step9Attachments({ data, setData }) {
  return (
    <div className="space-y-3" data-testid="step-9-attachments">
      <p className="text-xs text-[#A19D94]">Attach site photos, drawings or supporting documents from your Photo Vault. Images appear in the Method Statement PDF.</p>
      <AttachMedia
        toolId={TOOL_ID}
        toolLabel={TOOL_LABEL}
        jobId={data.projectId || null}
        category="method-statement"
        value={data.photos || []}
        onChange={(list) => setData((d) => ({ ...d, photos: list }))}
        testIdPrefix="ms-attach"
      />
    </div>
  );
}

function Step10Linked({ data, setData, docs }) {
  const KINDS = [
    { key: "rams", label: "RAMS", toolIds: ["rams"] },
    { key: "riskRegister", label: "Risk Assessments", toolIds: ["risk-register"] },
    { key: "coshh", label: "COSHH", toolIds: ["coshh"] },
    { key: "toolboxTalk", label: "Toolbox Talks", toolIds: ["toolbox-talk"] },
  ];
  const linked = data.linkedDocuments || {};
  const toggle = (kind, doc) => {
    const list = linked[kind] || [];
    const on = list.some((d) => d.id === doc.id);
    const next = on ? list.filter((d) => d.id !== doc.id) : [...list, { id: doc.id, title: doc.title, refNumber: doc.refNumber, toolId: doc.toolId }];
    setData((d) => ({ ...d, linkedDocuments: { ...linked, [kind]: next } }));
  };
  return (
    <div className="space-y-6" data-testid="step-10-linked">
      <p className="text-xs text-[#A19D94]">Link existing Morris documents. These are listed in the final Method Statement PDF and future architecture will allow bundling into a combined RAMS pack without re-typing.</p>
      {KINDS.map((k) => {
        const available = docs.filter((d) => k.toolIds.includes(d.toolId));
        const selected = linked[k.key] || [];
        return (
          <div key={k.key} data-testid={`linked-${k.key}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">{k.label}</div>
              <div className="text-xs text-[#706D66]">{selected.length} linked · {available.length} available</div>
            </div>
            {available.length === 0 ? (
              <div className="card-dark p-3 text-xs text-[#706D66]">No {k.label} documents on your account yet.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {available.slice(0, 10).map((d) => {
                  const on = selected.some((x) => x.id === d.id);
                  return (
                    <button key={d.id} onClick={() => toggle(k.key, d)} type="button" data-testid={`link-doc-${d.id}`}
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

function Step11Review({ data, previewUrl, onPreview }) {
  const stepCount = data.workSequence?.length || 0;
  const activePpe = PPE_CATALOG.filter((p) => data.ppe?.[p.id]);
  const linked = data.linkedDocuments || {};
  const linkedCount = Object.values(linked).reduce((s, arr) => s + (arr?.length || 0), 0);
  return (
    <div className="space-y-4" data-testid="step-11-review">
      <p className="text-xs text-[#A19D94]">Quick check before generation. Jump back to any step to edit.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-dark p-3"><Label>Steps</Label><div className="text-2xl text-[#F0EDE8] mt-1">{stepCount}</div></div>
        <div className="card-dark p-3"><Label>Plant & materials</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.plantEquipment || []).length + (data.materials || []).length}</div></div>
        <div className="card-dark p-3"><Label>PPE selected</Label><div className="text-2xl text-[#F0EDE8] mt-1">{activePpe.length}</div></div>
        <div className="card-dark p-3"><Label>Attachments</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.photos || []).length}</div></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="card-dark p-4">
          <Label>Project</Label>
          <div className="text-sm text-[#F0EDE8] mt-1">{data.projectName || "—"}</div>
          <div className="text-xs text-[#A19D94] mt-1">Client: {data.clientName || "—"} · Site: {data.siteAddress || "—"}</div>
          <div className="text-xs text-[#A19D94] mt-1">Principal contractor: {data.principalContractor || "—"}</div>
        </div>
        <div className="card-dark p-4">
          <Label>Sign-off</Label>
          <div className="text-sm text-[#F0EDE8] mt-1">Prepared by: {data.preparedBy || "—"}</div>
          <div className="text-xs text-[#A19D94] mt-1">Checked by: {data.checkedBy || "—"} · Approved by: {data.approvedBy || "—"}</div>
          <div className="text-xs text-[#A19D94] mt-1">Linked documents: {linkedCount}</div>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onPreview} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#F0EDE8] hover:border-[#E8A020]" data-testid="btn-preview">
          <RefreshCw size={14} /> {previewUrl ? "Refresh preview" : "Generate preview"}
        </button>
      </div>
      {previewUrl && (
        <iframe title="Method Statement Preview" src={previewUrl} className="w-full h-[500px] rounded-md border border-[#2a2620] bg-white" data-testid="preview-iframe" />
      )}
    </div>
  );
}

function Step12Generate({ data, onGenerate, generating }) {
  return (
    <div className="space-y-4" data-testid="step-12-generate">
      <p className="text-sm text-[#A19D94]">Ready to generate? Morris will produce the premium Method Statement PDF, save it to your Document Library and — if this Method Statement is linked to a project — add an event to the Project Timeline.</p>
      <div className="card-dark p-4 text-xs text-[#706D66] space-y-1">
        <div>📄 PDF will be saved as <span className="text-[#F0EDE8]">method-statement-{(data.projectName || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.pdf</span></div>
        <div>🗂 It will appear in Document Library and Recent Documents</div>
        {data.projectId && <div>🗓 Timeline event will be added to the linked project</div>}
      </div>
      <button onClick={onGenerate} disabled={generating} className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040] disabled:opacity-60" data-testid="btn-generate">
        <Download size={16} /> {generating ? "Generating..." : "Generate Method Statement PDF"}
      </button>
    </div>
  );
}
