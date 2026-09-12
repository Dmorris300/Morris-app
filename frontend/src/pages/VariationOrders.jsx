// Morris — Variation Orders V2 (Flagship variation management system)
// Dashboard-first: stat cards by status + templates + filters + KPIs.
// 9-step wizard: Project → Original Quote/Contract → Variation Details & Reason
// → Cost Breakdown → Time / Programme Impact → Supporting Photos & Documents
// → Client Review & Approval → Status Tracking → Preview & PDF.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus, Search, RefreshCw, Trash2, Edit2, X, ChevronLeft, ChevronRight,
  ClipboardList, FileText, ListChecks, PoundSterling, Calendar, Camera,
  ScrollText, Send, Download, PenTool, Copy, Star, Save, CheckCircle2,
  AlertTriangle, FileSignature,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import SignaturePad from "../components/SignaturePad";
import { downloadVariationPdf, variationPdfBlobUrl } from "../lib/variation-order-pdf";
import { formatUKDate } from "../lib/uk-format";
import { listMedia, thumbSrc } from "../lib/media";
import { fetchDraft, clearDraftQueryParam } from "../lib/drafts";
import { mapLegacyVariationLetterDraft } from "../lib/legacy-variation-letter-bridge";

const TOOL_ID = "variation-orders";
const DRAFT_KEY = "morris.tool_draft.variation-orders";

const WIZARD_STEPS = [
  { id: 1, key: "project",    label: "Project" },
  { id: 2, key: "original",   label: "Original Contract" },
  { id: 3, key: "details",    label: "Variation Details" },
  { id: 4, key: "cost",       label: "Cost Breakdown" },
  { id: 5, key: "programme",  label: "Programme Impact" },
  { id: 6, key: "evidence",   label: "Photos & Docs" },
  { id: 7, key: "approval",   label: "Client Approval" },
  { id: 8, key: "status",     label: "Status" },
  { id: 9, key: "generate",   label: "Preview & PDF" },
];

const CATEGORIES = ["Labour", "Materials", "Plant & Equipment", "Subcontractor", "Preliminaries", "Other"];
const UNITS = ["item", "hour", "day", "week", "m", "m²", "m³", "tonne", "kg", "each", "set", "load"];
const STATUSES = ["Draft", "Submitted", "Approved", "Rejected", "In Progress"];
const REASONS = [
  "Client Request", "Unforeseen Site Condition", "Design Error", "Scope Change",
  "Material Substitution", "Instruction on Site", "Access / Sequence Change", "Other",
];
const INSTRUCTION_METHODS = ["Verbal", "Written", "Email", "Site Instruction", "WhatsApp", "Text message", "Drawing revision", "Other"];
const IMPACT_KINDS = ["No impact", "Additional days", "Reduction in days", "Sequence only"];

const inputClass = "w-full bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none";
const Label = ({ children }) => <label className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">{children}</label>;
const Field = ({ label, children, hint }) => (
  <div><Label>{label}</Label><div className="mt-1">{children}</div>{hint && <div className="text-[11px] text-[#706D66] mt-1">{hint}</div>}</div>
);
const fGBP = (n) => `£${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

const emptyLine = () => ({ id: crypto.randomUUID(), category: "Labour", description: "", qty: 1, unit: "day", unitPrice: 0 });
const emptyVariation = () => ({
  projectId: "", projectName: "", projectAddress: "",
  clientName: "", clientCompany: "", clientEmail: "", clientPhone: "",
  originalQuoteId: "", originalQuoteRef: "", originalContractRef: "", originalContractDate: "",
  variationRef: "", variationDate: new Date().toISOString().slice(0, 10),
  status: "Draft", reason: "Client Request",
  instructionMethod: "Verbal", instructorName: "", instructorRole: "",
  instructionDate: new Date().toISOString().slice(0, 10), instructionLocation: "",
  scopeSummary: "",
  descriptionOfChange: "",
  reasonNarrative: "",
  referenceDocs: "",
  lineItems: [emptyLine()],
  addVat: false, vatRate: 20,
  programmeImpact: { kind: "No impact", days: 0, newPCDate: "", notes: "" },
  photoIds: [], supportingDocs: [],
  preparedBy: "", preparedSignature: "",
  clientApproverName: "", clientApproverSignature: "", approvedDate: "",
  rejectionReason: "",
  paymentTerms: "Payment for this variation will be included in the next Application for Payment.",
  notes: "",
  isFavourite: false,
});

function saveDraft(d) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ } }
function loadDraft() { try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }

function computeTotals(data) {
  const items = data.lineItems || [];
  let subtotal = 0; const byCat = {};
  items.forEach(it => {
    const line = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
    byCat[it.category] = (byCat[it.category] || 0) + line;
    subtotal += line;
  });
  const vatAmount = data.addVat ? subtotal * (Number(data.vatRate ?? 20) / 100) : 0;
  return { subtotal, byCategory: byCat, vatAmount, vatRate: data.addVat ? (data.vatRate ?? 20) : 0, total: subtotal + vatAmount };
}

const STATUS_BADGE = {
  Draft: "border-[#2a2620] text-[#A19D94]",
  Submitted: "border-[#E8A020]/40 text-[#E8A020]",
  Approved: "border-[#68D391]/40 text-[#68D391]",
  Rejected: "border-[#F27C7C]/40 text-[#F27C7C]",
  "In Progress": "border-[#A0A0F0]/40 text-[#A0A0F0]",
};

export default function VariationOrders() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const openParamId = params.get("open") || "";
  const draftParamId = params.get("draft") || "";
  const projectFilter = params.get("projectId") || "";
  const [variations, setVariations] = useState([]);
  const [stats, setStats] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterProject, setFilterProject] = useState(projectFilter);
  const [editing, setEditing] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [vRes, sRes, tRes, jRes, qRes] = await Promise.allSettled([
        api.get("/variation-orders/variation-orders"),
        api.get("/variation-orders/stats"),
        api.get("/variation-orders/templates"),
        api.get("/jobs"),
        api.get("/quote-builder/quotes"),
      ]);
      if (vRes.status === "fulfilled") setVariations(vRes.value.data);
      if (sRes.status === "fulfilled") setStats(sRes.value.data);
      if (tRes.status === "fulfilled") setTemplates(tRes.value.data);
      if (jRes.status === "fulfilled") setJobs(jRes.value.data);
      if (qRes.status === "fulfilled") setQuotes(qRes.value.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (openParamId && variations.length > 0 && !wizardOpen) {
      const v = variations.find(x => x.id === openParamId);
      if (v) openEdit(v);
    }
  }, [openParamId, variations]);   

  // Bridge: `/app/variation-orders?draft=<legacyId>` fetches a legacy
  // variation-letter draft, maps its flat `values` payload into the V2
  // shape and opens the wizard populated with the user's original entries.
  // The legacy draft record is NOT rewritten — saving from the wizard
  // creates a fresh V2 record and leaves the legacy row intact for audit.
  useEffect(() => {
    if (!draftParamId || wizardOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await fetchDraft(draftParamId);
        if (cancelled || !d) return;
        if (d.toolId !== "variation-letter" && d.toolId !== "variation-orders") return;
        const payload = d.data || {};
        // V2-native drafts (already the correct shape) can be opened directly.
        if (d.toolId === "variation-orders") {
          setEditing({ ...emptyVariation(), ...payload });
          setWizardOpen(true);
          toast.success("Draft restored");
          return;
        }
        // Legacy variation-letter drafts store the user inputs under `values`.
        const legacyValues = payload.values || payload;
        const mapped = mapLegacyVariationLetterDraft(legacyValues);
        setEditing({ ...emptyVariation(), ...mapped });
        setWizardOpen(true);
        toast.success("Legacy Variation restored — review and save as a Variation Order");
      } catch (e) {
        if (process.env.NODE_ENV !== "production") console.error("Legacy variation-letter bridge failed", e);
      } finally {
        clearDraftQueryParam();
      }
    })();
    return () => { cancelled = true; };
  }, [draftParamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = (fromTemplate = null) => {
    let base = emptyVariation();
    if (fromTemplate) base = { ...base, ...(fromTemplate.payload || {}), id: undefined, status: "Draft", variationRef: "", variationDate: base.variationDate, lineItems: (fromTemplate.payload?.lineItems || []).map(l => ({ ...l, id: crypto.randomUUID() })) };
    else { const d = loadDraft(); if (d && !d.id) base = { ...base, ...d, id: undefined }; }
    // Preselect project when filter is on
    if (filterProject && !base.projectId) {
      const j = jobs.find(x => x.id === filterProject);
      if (j) {
        base.projectId = j.id;
        base.projectName = j.projectName || j.clientName || "";
        base.projectAddress = j.address || "";
        base.clientName = j.clientName || "";
        base.clientCompany = j.company || "";
      }
    }
    setEditing(base); setWizardOpen(true);
  };
  const openEdit = (v) => { setEditing({ ...emptyVariation(), ...v }); setWizardOpen(true); };
  const duplicate = (v) => {
    const copy = { ...v }; delete copy.id; delete copy.createdAt; delete copy.updatedAt; delete copy._id;
    copy.status = "Draft"; copy.variationDate = new Date().toISOString().slice(0, 10); copy.variationRef = "";
    copy.lineItems = (copy.lineItems || []).map(l => ({ ...l, id: crypto.randomUUID() }));
    copy.preparedSignature = ""; copy.clientApproverSignature = ""; copy.approvedDate = "";
    setEditing({ ...emptyVariation(), ...copy }); setWizardOpen(true);
  };
  const deleteVariation = async (v) => {
    if (!window.confirm(`Delete variation ${v.variationRef || ""}?`)) return;
    try { await api.delete(`/variation-orders/variation-orders/${v.id}`); toast.success("Deleted"); await loadAll(); }
    catch { toast.error("Delete failed"); }
  };
  const toggleFav = async (v) => { try { await api.patch(`/variation-orders/variation-orders/${v.id}`, { isFavourite: !v.isFavourite }); await loadAll(); } catch { toast.error("Failed"); } };
  const markStatus = async (v, status) => {
    try {
      await api.patch(`/variation-orders/variation-orders/${v.id}`, { status });
      toast.success(`Marked as ${status}`);
      await loadAll();
    } catch { toast.error("Failed"); }
  };

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    return variations.filter(v => {
      if (s) {
        const hay = `${v.clientName || ""} ${v.clientCompany || ""} ${v.projectName || ""} ${v.variationRef || ""} ${v.descriptionOfChange || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (filterStatus && (v.status || "Draft") !== filterStatus) return false;
      if (filterProject && v.projectId !== filterProject) return false;
      return true;
    });
  }, [variations, query, filterStatus, filterProject]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="variation-orders-page">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Commercial</div>
          <h1 className="font-display text-3xl sm:text-4xl text-[#F0EDE8]">Variation Orders</h1>
          <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">Protect yourself from carrying out extra work without proper approval, valuation and record. Every variation from instruction through approval to payment — in one place.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={loadAll} className="text-xs text-[#A19D94] hover:text-[#E8A020] flex items-center gap-1" data-testid="vo-refresh"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh</button>
          <button onClick={() => openNew()} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040]" data-testid="vo-new-btn"><Plus size={14} /> New Variation</button>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatCard label="Draft" value={stats?.draft ?? 0} testId="vo-stat-draft" />
        <StatCard label="Submitted" value={stats?.submitted ?? 0} tone="gold" testId="vo-stat-submitted" />
        <StatCard label="In Progress" value={stats?.inProgress ?? 0} tone="info" testId="vo-stat-inprogress" />
        <StatCard label="Approved" value={stats?.approved ?? 0} tone="green" testId="vo-stat-approved" />
        <StatCard label="Rejected" value={stats?.rejected ?? 0} tone="red" testId="vo-stat-rejected" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <ValueCard label="Approved value" value={fGBP(stats?.approvedValue || 0)} sub="Adds to project commercial value" tone="green" testId="vo-val-approved" />
        <ValueCard label="Submitted awaiting approval" value={fGBP(stats?.submittedValue || 0)} sub="Draft + Submitted + In Progress" tone="gold" testId="vo-val-submitted" />
        <ValueCard label="Approved additional days" value={`${stats?.approvedDays ?? 0}`} sub="Working days added to programmes" testId="vo-val-days" />
      </div>

      {templates.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Templates</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {templates.map(t => (
              <div key={t.id} className="card-dark p-3 flex items-start justify-between gap-2" data-testid={`vo-template-${t.id}`}>
                <button onClick={() => openNew(t)} className="text-left flex-1 min-w-0">
                  <div className="text-sm text-[#F0EDE8] truncate">{t.name}</div>
                  <div className="text-[11px] text-[#A19D94] truncate">Variation template</div>
                </button>
                <button onClick={async () => { if (!window.confirm("Delete template?")) return; try { await api.delete(`/variation-orders/templates/${t.id}`); setTemplates(templates.filter(x => x.id !== t.id)); } catch { toast.error("Failed"); } }} className="text-[#706D66] hover:text-[#F27C7C] p-1"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-dark p-4 mb-4" data-testid="vo-filters">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search project, client, reference, description…" className={`${inputClass} pl-9`} data-testid="vo-search" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={inputClass} data-testid="vo-filter-status">
            <option value="">All status</option>
            {STATUSES.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className={inputClass} data-testid="vo-filter-project">
            <option value="">All projects</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.projectName || j.clientName}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card-dark p-8 text-center text-sm text-[#A19D94]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card-dark p-10 text-center" data-testid="vo-empty">
          <FileSignature size={28} className="mx-auto text-[#E8A020] mb-3" />
          <div className="text-base text-[#F0EDE8]">{variations.length === 0 ? "No variations yet" : "No variations match your filters"}</div>
          <p className="text-xs text-[#A19D94] mt-2 max-w-md mx-auto">Raise a variation whenever you are asked to do work outside the original scope. Get it approved in writing before you start.</p>
          <button onClick={() => openNew()} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="vo-empty-new"><Plus size={14} /> Raise your first variation</button>
        </div>
      ) : (
        <div className="space-y-2">{filtered.map(v => <VariationRow key={v.id} v={v} onEdit={() => openEdit(v)} onDelete={() => deleteVariation(v)} onDuplicate={() => duplicate(v)} onFav={() => toggleFav(v)} onMark={(s) => markStatus(v, s)} />)}</div>
      )}

      {wizardOpen && editing && (
        <VariationWizard initial={editing} user={user} jobs={jobs} quotes={quotes}
          onClose={() => { setWizardOpen(false); setEditing(null); }}
          onSaved={async () => { await loadAll(); setWizardOpen(false); setEditing(null); }}
          onTemplatesChanged={setTemplates}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, tone, testId }) {
  const t = tone === "red" ? "text-[#F27C7C]" : tone === "green" ? "text-[#68D391]" : tone === "gold" ? "text-[#E8A020]" : tone === "info" ? "text-[#A0A0F0]" : "text-[#F0EDE8]";
  return (<div className="card-dark p-4" data-testid={testId}><Label>{label}</Label><div className={`mt-2 font-display text-3xl ${t}`}>{value}</div></div>);
}
function ValueCard({ label, value, sub, tone, testId }) {
  const t = tone === "green" ? "text-[#68D391]" : tone === "gold" ? "text-[#E8A020]" : "text-[#F0EDE8]";
  return (<div className="card-dark p-4" data-testid={testId}><Label>{label}</Label><div className={`mt-2 font-display text-2xl ${t}`}>{value}</div><div className="text-[11px] text-[#A19D94] mt-1">{sub}</div></div>);
}

function VariationRow({ v, onEdit, onDelete, onDuplicate, onFav, onMark }) {
  const status = v.status || "Draft";
  const statusCls = STATUS_BADGE[status] || STATUS_BADGE.Draft;
  const days = ((v.programmeImpact || {}).kind === "Additional days") ? Number((v.programmeImpact || {}).days) || 0 : 0;
  // Belt-and-braces: format the "Raised" date via the shared helper, and if
  // anything still looks like a raw ISO (unexpected data shape from legacy
  // records), inline-convert it here so a customer never sees YYYY-MM-DD.
  const raisedText = (() => {
    const formatted = formatUKDate(v.variationDate);
    if (formatted && /^\d{2}\/\d{2}\/\d{4}$/.test(formatted)) return formatted;
    const raw = String(v.variationDate || "").trim();
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return formatted || "—";
  })();
  return (
    <div className="card-dark p-4 flex items-start gap-3" data-testid={`vo-row-${v.id}`}>
      <button onClick={onFav} className={`p-1 mt-1 ${v.isFavourite ? "text-[#E8A020]" : "text-[#706D66] hover:text-[#E8A020]"}`} aria-label="Favourite"><Star size={14} fill={v.isFavourite ? "#E8A020" : "none"} /></button>
      <button onClick={onEdit} className="text-left flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base text-[#F0EDE8] font-medium truncate">{v.descriptionOfChange || v.projectName || "Untitled variation"}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusCls}`}>{status}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#2a2620] text-[#A19D94]">{v.variationRef || "no ref"}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#E8A020]/40 text-[#E8A020]">{fGBP((v.totals || {}).total || 0)}</span>
          {days > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#A0A0F0]/40 text-[#A0A0F0]">+{days} day{days === 1 ? "" : "s"}</span>}
        </div>
        <div className="text-xs text-[#A19D94] mt-1 truncate" data-testid={`vo-row-raised-${v.id}`}>{v.projectName || v.clientCompany || v.clientName || "—"} · {v.reason || "—"} · Raised {raisedText}</div>
      </button>
      <div className="flex gap-1 shrink-0">
        {status === "Draft" && <button onClick={() => onMark("Submitted")} className="p-2 text-[#A19D94] hover:text-[#E8A020]" title="Mark as Submitted" data-testid={`vo-row-submit-${v.id}`}><Send size={14} /></button>}
        {(status === "Submitted" || status === "In Progress") && <button onClick={() => onMark("Approved")} className="p-2 text-[#A19D94] hover:text-[#68D391]" title="Mark as Approved" data-testid={`vo-row-approve-${v.id}`}><CheckCircle2 size={14} /></button>}
        {(status === "Submitted" || status === "In Progress") && <button onClick={() => onMark("Rejected")} className="p-2 text-[#A19D94] hover:text-[#F27C7C]" title="Mark as Rejected" data-testid={`vo-row-reject-${v.id}`}><AlertTriangle size={14} /></button>}
        <button onClick={onEdit} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`vo-row-edit-${v.id}`}><Edit2 size={14} /></button>
        <button onClick={onDuplicate} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`vo-row-dup-${v.id}`}><Copy size={14} /></button>
        <button onClick={onDelete} className="p-2 text-[#A19D94] hover:text-[#F27C7C]" data-testid={`vo-row-delete-${v.id}`}><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

// ================================================================
// WIZARD
// ================================================================
function VariationWizard({ initial, user, jobs, quotes, onClose, onSaved, onTemplatesChanged }) {
  const [data, setData] = useState(initial);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [signingOpen, setSigningOpen] = useState(null); // "prepared" | "client"
  const [photoVaultItems, setPhotoVaultItems] = useState([]);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);

  useEffect(() => { if (user?.fullName && !data.preparedBy) setData(d => ({ ...d, preparedBy: user.fullName })); }, [user?.fullName]);   
  useEffect(() => { if (!data.id) { const t = setTimeout(() => saveDraft(data), 500); return () => clearTimeout(t); } }, [data]);
  useEffect(() => {
    // Preload photo vault items when the wizard opens so the picker is instant
    (async () => {
      try {
        const params = { limit: 200 };
        if (data.projectId) params.jobId = data.projectId;
        const items = await listMedia(params);
        setPhotoVaultItems(Array.isArray(items) ? items : (items?.items || []));
      } catch { /* ignore */ }
    })();
  }, [data.projectId]);

  const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));
  const totals = useMemo(() => computeTotals(data), [data]);

  const pickProject = (id) => {
    const j = jobs.find(x => x.id === id); if (!j) return;
    setData(d => ({
      ...d,
      projectId: j.id,
      projectName: j.projectName || j.clientName || d.projectName,
      projectAddress: j.address || d.projectAddress,
      clientName: j.clientName || d.clientName,
      clientCompany: j.company || d.clientCompany,
      clientEmail: j.clientContact || d.clientEmail,
    }));
  };
  const pickQuote = (id) => {
    const q = quotes.find(x => x.id === id); if (!q) return;
    setData(d => ({
      ...d,
      originalQuoteId: q.id,
      originalQuoteRef: q.quoteRef,
      originalContractRef: q.quoteRef,
      originalContractDate: q.quoteDate || d.originalContractDate,
      scopeSummary: q.scopeOfWorks || d.scopeSummary,
      // Client backfill if empty
      clientName: d.clientName || q.clientName,
      clientCompany: d.clientCompany || q.clientCompany,
      clientEmail: d.clientEmail || q.clientEmail,
      clientPhone: d.clientPhone || q.clientPhone,
    }));
  };

  // Line items
  const addLine = () => setData(d => ({ ...d, lineItems: [...(d.lineItems || []), emptyLine()] }));
  const updLine = (id, patch) => setData(d => ({ ...d, lineItems: d.lineItems.map(x => x.id === id ? { ...x, ...patch } : x) }));
  const delLine = (id) => setData(d => ({ ...d, lineItems: d.lineItems.filter(x => x.id !== id) }));
  const dupLine = (id) => setData(d => { const l = d.lineItems.find(x => x.id === id); if (!l) return d; return { ...d, lineItems: [...d.lineItems, { ...l, id: crypto.randomUUID() }] }; });

  // Photos
  const togglePhoto = (mediaId) => {
    setData(d => {
      const cur = new Set(d.photoIds || []);
      if (cur.has(mediaId)) cur.delete(mediaId); else cur.add(mediaId);
      return { ...d, photoIds: Array.from(cur) };
    });
  };
  // Supporting docs
  const addSupportingDoc = () => setData(d => ({ ...d, supportingDocs: [...(d.supportingDocs || []), { id: crypto.randomUUID(), name: "", url: "" }] }));
  const updSupportingDoc = (id, patch) => setData(d => ({ ...d, supportingDocs: d.supportingDocs.map(x => x.id === id ? { ...x, ...patch } : x) }));
  const delSupportingDoc = (id) => setData(d => ({ ...d, supportingDocs: (d.supportingDocs || []).filter(x => x.id !== id) }));

  const generatePreview = () => {
    try { setPreviewUrl(variationPdfBlobUrl({ data: { ...data, totals }, user, today: new Date().toLocaleDateString("en-GB") })); }
    catch { toast.error("Preview failed"); }
  };

  const saveEntry = async () => {
    if (!data.projectName && !data.projectId) { toast.error("Project is required"); setStep(1); return; }
    setSaving(true);
    try {
      let saved;
      const payload = { ...data };
      if (data.id) { const r = await api.patch(`/variation-orders/variation-orders/${data.id}`, payload); saved = r.data; }
      else { const r = await api.post("/variation-orders/variation-orders", payload); saved = r.data; }
      // Save summary to Document Library
      try {
        await api.post("/documents/save", {
          title: `Variation Order — ${data.projectName || data.clientCompany || data.clientName || "Client"}`,
          toolId: TOOL_ID, refNumber: saved.variationRef, jobId: data.projectId || null,
          content: `VARIATION ORDER ${saved.variationRef}\n${data.projectName || ""} · ${data.clientName || data.clientCompany || ""}\nReason: ${data.reason || "—"}\nStatus: ${saved.status}\nTotal: ${fGBP((saved.totals || {}).total || 0)}\n\n${data.descriptionOfChange || ""}`,
          metadata: { ...saved },
        });
      } catch { /* soft-fail */ }
      downloadVariationPdf({ data: saved, user, today: new Date().toLocaleDateString("en-GB") });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      toast.success("Variation saved");
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  const saveAsTemplate = async () => {
    if (!tplName.trim()) return toast.error("Template name required");
    try {
      const payload = { ...data, id: undefined, variationRef: undefined, variationDate: undefined, status: "Draft", preparedSignature: "", clientApproverSignature: "", clientApproverName: "", approvedDate: "", photoIds: [] };
      await api.post("/variation-orders/templates", { name: tplName.trim(), payload });
      toast.success("Template saved");
      setTplModalOpen(false); setTplName("");
      const lst = await api.get("/variation-orders/templates"); onTemplatesChanged(lst.data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const progrKind = (data.programmeImpact || {}).kind || "No impact";

  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-y-auto" data-testid="vo-wizard">
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-5xl mx-auto card-dark p-5 md:p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-1">{data.id ? "Edit" : "New"} Variation</div>
              <h2 className="font-display text-2xl text-[#F0EDE8]">{data.descriptionOfChange || data.projectName || "Untitled"} <span className="text-sm text-[#A19D94]">· {fGBP(totals.total)}</span></h2>
            </div>
            <button onClick={onClose} className="text-[#A19D94] hover:text-[#F0EDE8]" data-testid="vo-wizard-close"><X size={20} /></button>
          </div>

          <div className="flex justify-end mb-3">
            <button onClick={() => setTplModalOpen(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="vo-save-template-btn"><Save size={12} /> Save as template</button>
          </div>

          <div className="overflow-x-auto mb-5" data-testid="vo-stepper">
            <div className="flex gap-1 min-w-max">
              {WIZARD_STEPS.map(s => (
                <button key={s.id} onClick={() => setStep(s.id)} data-testid={`vo-step-${s.id}`}
                  className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${step === s.id ? "bg-[#E8A020] text-black" : step > s.id ? "bg-[#1e1a12] text-[#68D391] border border-[#68D391]/30" : "bg-[#0f0d09] text-[#A19D94] border border-[#2a2620]"}`}>
                  {s.id}. {s.label}
                </button>
              ))}
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-4" data-testid="vo-step-1-project">
              {jobs.length > 0 && (
                <Field label="Link to project (recommended)">
                  <select value={data.projectId} onChange={(e) => pickProject(e.target.value)} className={inputClass} data-testid="vo-link-project">
                    <option value="">Not linked</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.projectName || j.clientName}</option>)}
                  </select>
                </Field>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Project name"><input className={inputClass} value={data.projectName} onChange={(e) => set("projectName")(e.target.value)} data-testid="vo-projectName" /></Field>
                <Field label="Site address"><textarea className={`${inputClass} min-h-[52px]`} value={data.projectAddress} onChange={(e) => set("projectAddress")(e.target.value)} data-testid="vo-projectAddress" /></Field>
                <Field label="Client contact name"><input className={inputClass} value={data.clientName} onChange={(e) => set("clientName")(e.target.value)} data-testid="vo-clientName" /></Field>
                <Field label="Client company"><input className={inputClass} value={data.clientCompany} onChange={(e) => set("clientCompany")(e.target.value)} data-testid="vo-clientCompany" /></Field>
                <Field label="Client email"><input type="email" className={inputClass} value={data.clientEmail} onChange={(e) => set("clientEmail")(e.target.value)} data-testid="vo-clientEmail" /></Field>
                <Field label="Client phone"><input className={inputClass} value={data.clientPhone} onChange={(e) => set("clientPhone")(e.target.value)} /></Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4" data-testid="vo-step-2-original">
              {quotes.length > 0 && (
                <Field label="Link to original quote (optional)" hint="Auto-fills the contract reference and original scope from Quote Builder.">
                  <select value={data.originalQuoteId} onChange={(e) => pickQuote(e.target.value)} className={inputClass} data-testid="vo-link-quote">
                    <option value="">Not linked</option>
                    {quotes.map(q => <option key={q.id} value={q.id}>{q.quoteRef} · {q.projectName || q.clientCompany || q.clientName}</option>)}
                  </select>
                </Field>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Original contract reference"><input className={inputClass} value={data.originalContractRef} onChange={(e) => set("originalContractRef")(e.target.value)} placeholder="e.g. Q-20250115-0012" data-testid="vo-contractRef" /></Field>
                <Field label="Original contract date"><input type="date" className={inputClass} value={data.originalContractDate} onChange={(e) => set("originalContractDate")(e.target.value)} data-testid="vo-contractDate" /></Field>
              </div>
              <Field label="Original scope summary" hint="Optional. What was originally agreed. Copied automatically when a quote is linked."><textarea className={`${inputClass} min-h-[120px]`} value={data.scopeSummary} onChange={(e) => set("scopeSummary")(e.target.value)} data-testid="vo-scopeSummary" /></Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4" data-testid="vo-step-3-details">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Variation date"><input type="date" className={inputClass} value={data.variationDate} onChange={(e) => set("variationDate")(e.target.value)} data-testid="vo-variationDate" /></Field>
                <Field label="Reason for variation">
                  <select className={inputClass} value={data.reason} onChange={(e) => set("reason")(e.target.value)} data-testid="vo-reason">
                    {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
                <Field label="Instruction method">
                  <select className={inputClass} value={data.instructionMethod} onChange={(e) => set("instructionMethod")(e.target.value)} data-testid="vo-method">
                    {INSTRUCTION_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Instructor name"><input className={inputClass} value={data.instructorName} onChange={(e) => set("instructorName")(e.target.value)} placeholder="Who gave the instruction" data-testid="vo-instructorName" /></Field>
                <Field label="Instructor role"><input className={inputClass} value={data.instructorRole} onChange={(e) => set("instructorRole")(e.target.value)} placeholder="e.g. Site Manager" /></Field>
                <Field label="Instruction date"><input type="date" className={inputClass} value={data.instructionDate} onChange={(e) => set("instructionDate")(e.target.value)} /></Field>
              </div>
              <Field label="Location on site where instruction was given"><input className={inputClass} value={data.instructionLocation} onChange={(e) => set("instructionLocation")(e.target.value)} placeholder="e.g. Ground floor plant room" /></Field>
              <Field label="Description of change" hint="What is being added, removed or changed. Be specific."><textarea className={`${inputClass} min-h-[160px]`} value={data.descriptionOfChange} onChange={(e) => set("descriptionOfChange")(e.target.value)} data-testid="vo-descriptionOfChange" /></Field>
              <Field label="Reason narrative (optional)" hint="Any supporting explanation of why this variation was needed."><textarea className={`${inputClass} min-h-[80px]`} value={data.reasonNarrative} onChange={(e) => set("reasonNarrative")(e.target.value)} /></Field>
              <Field label="Reference documents (optional)" hint="Drawing numbers, RFIs, email confirmations — one per line."><textarea className={`${inputClass} min-h-[80px]`} value={data.referenceDocs} onChange={(e) => set("referenceDocs")(e.target.value)} data-testid="vo-referenceDocs" /></Field>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3" data-testid="vo-step-4-cost">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Cost items · {(data.lineItems || []).length}</div>
                <button onClick={addLine} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#E8A020] text-black text-xs font-medium" data-testid="vo-add-line"><Plus size={12} /> Add line</button>
              </div>
              {(data.lineItems || []).map((it, i) => (
                <div key={it.id} className="card-dark p-3" data-testid={`vo-line-${i + 1}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Line {i + 1} · <span className="text-[#F0EDE8]">{fGBP((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}</span></span>
                    <div className="flex gap-2"><button onClick={() => dupLine(it.id)} className="text-[#A19D94] hover:text-[#E8A020]"><Copy size={12} /></button><button onClick={() => delLine(it.id)} className="text-[#A19D94] hover:text-[#F27C7C]"><Trash2 size={12} /></button></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                    <Field label="Category">
                      <select className={inputClass} value={it.category} onChange={(e) => updLine(it.id, { category: e.target.value })} data-testid={`vo-line-cat-${i + 1}`}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </Field>
                    <div className="md:col-span-2"><Field label="Description"><input className={inputClass} value={it.description} onChange={(e) => updLine(it.id, { description: e.target.value })} data-testid={`vo-line-desc-${i + 1}`} /></Field></div>
                    <Field label="Qty"><input type="number" step="0.01" className={inputClass} value={it.qty} onChange={(e) => updLine(it.id, { qty: e.target.value })} data-testid={`vo-line-qty-${i + 1}`} /></Field>
                    <Field label="Unit">
                      <select className={inputClass} value={it.unit} onChange={(e) => updLine(it.id, { unit: e.target.value })}>
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </Field>
                    <Field label="Unit price (£)"><input type="number" step="0.01" className={inputClass} value={it.unitPrice} onChange={(e) => updLine(it.id, { unitPrice: e.target.value })} data-testid={`vo-line-price-${i + 1}`} /></Field>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="card-dark p-3 flex items-center gap-3 cursor-pointer" data-testid="vo-addVat-wrap">
                  <input type="checkbox" checked={!!data.addVat} onChange={(e) => set("addVat")(e.target.checked)} data-testid="vo-addVat" />
                  <div>
                    <div className="text-sm text-[#F0EDE8]">Add VAT to this variation</div>
                    <div className="text-[11px] text-[#A19D94]">Tick if VAT is charged separately (leave un-ticked for reverse charge / non-VAT jobs).</div>
                  </div>
                </label>
                <Field label="VAT rate (%)"><input type="number" step="0.01" className={inputClass} value={data.vatRate ?? 20} onChange={(e) => set("vatRate")(Number(e.target.value))} disabled={!data.addVat} data-testid="vo-vatRate" /></Field>
              </div>
              <div className="card-dark p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <div><Label>Subtotal</Label><div className="text-[#F0EDE8] mt-1">{fGBP(totals.subtotal)}</div></div>
                  <div><Label>VAT</Label><div className="text-[#F0EDE8] mt-1">{fGBP(totals.vatAmount)}</div></div>
                  <div className="md:col-span-2"><Label>Total variation cost</Label><div className="text-[#E8A020] mt-1 text-lg font-medium">{fGBP(totals.total)}</div></div>
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4" data-testid="vo-step-5-programme">
              <Field label="Programme impact">
                <select className={inputClass} value={progrKind} onChange={(e) => set("programmeImpact")({ ...(data.programmeImpact || {}), kind: e.target.value })} data-testid="vo-impact-kind">
                  {IMPACT_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </Field>
              {(progrKind === "Additional days" || progrKind === "Reduction in days") && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label={`${progrKind === "Reduction in days" ? "Days saved" : "Additional working days"}`}>
                    <input type="number" className={inputClass} value={(data.programmeImpact || {}).days || 0} onChange={(e) => set("programmeImpact")({ ...(data.programmeImpact || {}), days: Number(e.target.value) })} data-testid="vo-impact-days" />
                  </Field>
                  <Field label="New Practical Completion date (optional)"><input type="date" className={inputClass} value={(data.programmeImpact || {}).newPCDate || ""} onChange={(e) => set("programmeImpact")({ ...(data.programmeImpact || {}), newPCDate: e.target.value })} /></Field>
                </div>
              )}
              <Field label="Programme notes (optional)"><textarea className={`${inputClass} min-h-[80px]`} value={(data.programmeImpact || {}).notes || ""} onChange={(e) => set("programmeImpact")({ ...(data.programmeImpact || {}), notes: e.target.value })} data-testid="vo-impact-notes" /></Field>
              <div className="card-dark p-3 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">If this variation extends the programme, get the extension of time agreed in writing before you start. An award of extra time is separate from an award of extra cost.</div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4" data-testid="vo-step-6-evidence">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Photos from Photo Vault · {(data.photoIds || []).length} selected</div>
                <button onClick={() => setPhotoPickerOpen(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#E8A020] text-black text-xs font-medium" data-testid="vo-pick-photos"><Camera size={12} /> Pick photos</button>
              </div>
              {(data.photoIds || []).length === 0 && (
                <div className="card-dark p-4 text-center text-xs text-[#A19D94]">Attach site photos of the change from your Photo Vault. Evidence protects your claim.</div>
              )}
              {(data.photoIds || []).length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {(data.photoIds || []).map(pid => {
                    const item = photoVaultItems.find(x => x.id === pid);
                    return (
                      <div key={pid} className="relative aspect-square rounded-md overflow-hidden border border-[#2a2620]">
                        {item ? (
                          <img alt="" src={thumbSrc(item)} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-[#1a1610] flex items-center justify-center text-[10px] text-[#706D66]">{pid.slice(0, 6)}</div>
                        )}
                        <button onClick={() => togglePhoto(pid)} className="absolute top-1 right-1 bg-black/70 rounded-full p-1 text-[#F27C7C]"><X size={12} /></button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Supporting documents · {(data.supportingDocs || []).length}</div>
                  <button onClick={addSupportingDoc} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#E8A020] text-xs text-[#E8A020]" data-testid="vo-add-doc"><Plus size={12} /> Add reference</button>
                </div>
                {(data.supportingDocs || []).map((d, i) => (
                  <div key={d.id} className="card-dark p-3 mb-2" data-testid={`vo-doc-${i + 1}`}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                      <Field label="Document name"><input className={inputClass} value={d.name} onChange={(e) => updSupportingDoc(d.id, { name: e.target.value })} placeholder="e.g. Client email 12 May" /></Field>
                      <div className="md:col-span-2 flex gap-2 items-end">
                        <div className="flex-1"><Field label="Reference / link (optional)"><input className={inputClass} value={d.url} onChange={(e) => updSupportingDoc(d.id, { url: e.target.value })} /></Field></div>
                        <button onClick={() => delSupportingDoc(d.id)} className="pb-2 text-[#F27C7C]"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-4" data-testid="vo-step-7-approval">
              <div className="card-dark p-3 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">Sign here as the contractor. The client signs to approve — that&apos;s when the variation becomes an instructed change.</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="card-dark p-4">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-3">Prepared by (contractor)</div>
                  <Field label="Name"><input className={inputClass} value={data.preparedBy || user?.fullName || ""} onChange={(e) => set("preparedBy")(e.target.value)} data-testid="vo-preparedBy" /></Field>
                  <div className="mt-3"><Label>Signature</Label>
                    <div className="mt-1 flex items-center gap-3">
                      {data.preparedSignature ? <img alt="Signature" src={data.preparedSignature} className="h-12 w-40 rounded-md border border-[#2a2620] bg-white" /> : <div className="h-12 w-40 rounded-md border border-dashed border-[#2a2620] flex items-center justify-center text-[10px] text-[#706D66]">Not signed</div>}
                      <button onClick={() => setSigningOpen("prepared")} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="vo-sign-prepared"><PenTool size={12} /> {data.preparedSignature ? "Re-sign" : "Sign"}</button>
                    </div>
                  </div>
                </div>
                <div className="card-dark p-4">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-3">Approved by (client)</div>
                  <Field label="Client approver name"><input className={inputClass} value={data.clientApproverName} onChange={(e) => set("clientApproverName")(e.target.value)} data-testid="vo-clientApproverName" /></Field>
                  <div className="grid grid-cols-2 gap-2 mt-2"><Field label="Approved date"><input type="date" className={inputClass} value={data.approvedDate} onChange={(e) => set("approvedDate")(e.target.value)} /></Field><div /></div>
                  <div className="mt-3"><Label>Client signature</Label>
                    <div className="mt-1 flex items-center gap-3">
                      {data.clientApproverSignature ? <img alt="Signature" src={data.clientApproverSignature} className="h-12 w-40 rounded-md border border-[#2a2620] bg-white" /> : <div className="h-12 w-40 rounded-md border border-dashed border-[#2a2620] flex items-center justify-center text-[10px] text-[#706D66]">Not signed</div>}
                      <button onClick={() => setSigningOpen("client")} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="vo-sign-client"><PenTool size={12} /> Sign</button>
                    </div>
                  </div>
                </div>
              </div>
              <Field label="Terms"><textarea className={`${inputClass} min-h-[80px]`} value={data.paymentTerms} onChange={(e) => set("paymentTerms")(e.target.value)} data-testid="vo-paymentTerms" /></Field>
            </div>
          )}

          {step === 8 && (
            <div className="space-y-4" data-testid="vo-step-8-status">
              <Field label="Status">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {STATUSES.map(s => (
                    <button key={s} onClick={() => set("status")(s)} className={`px-3 py-2 rounded-md text-xs border ${data.status === s ? "bg-[#E8A020] text-black border-[#E8A020]" : "border-[#2a2620] text-[#F0EDE8] hover:border-[#E8A020]"}`} data-testid={`vo-status-${s}`}>{s}</button>
                  ))}
                </div>
              </Field>
              {data.status === "Rejected" && (
                <Field label="Rejection reason"><textarea className={`${inputClass} min-h-[80px]`} value={data.rejectionReason} onChange={(e) => set("rejectionReason")(e.target.value)} data-testid="vo-rejectionReason" /></Field>
              )}
              <div className="card-dark p-3 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">
                Approved variations automatically add their value to the linked project&apos;s commercial total. Rejected variations stay on file for the audit trail.
              </div>
            </div>
          )}

          {step === 9 && (
            <div className="space-y-4" data-testid="vo-step-9-generate">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="card-dark p-3"><Label>Cost items</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.lineItems || []).length}</div></div>
                <div className="card-dark p-3"><Label>Photos</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.photoIds || []).length}</div></div>
                <div className="card-dark p-3"><Label>Documents</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.supportingDocs || []).length}</div></div>
                <div className="card-dark p-3"><Label>Total (inc VAT)</Label><div className="text-2xl text-[#E8A020] mt-1">{fGBP(totals.total)}</div></div>
              </div>
              <Field label="Additional notes"><textarea className={`${inputClass} min-h-[52px]`} value={data.notes} onChange={(e) => set("notes")(e.target.value)} /></Field>
              <div className="flex gap-2 flex-wrap">
                <button onClick={generatePreview} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#F0EDE8] hover:border-[#E8A020]" data-testid="vo-preview-btn"><RefreshCw size={14} /> {previewUrl ? "Refresh" : "Generate"} preview</button>
                <button onClick={saveEntry} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-60" data-testid="vo-save-btn"><Download size={16} /> {saving ? "Saving..." : "Save & Generate PDF"}</button>
              </div>
              {previewUrl && <iframe title="Variation Preview" src={previewUrl} className="w-full h-[500px] rounded-md border border-[#2a2620] bg-white" data-testid="vo-preview-iframe" />}
            </div>
          )}

          <div className="flex items-center justify-between mt-6">
            <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94] disabled:opacity-40" data-testid="vo-btn-prev"><ChevronLeft size={14} /> Back</button>
            <span className="text-xs text-[#706D66]">Step {step} of {WIZARD_STEPS.length}</span>
            <button onClick={() => setStep(Math.min(WIZARD_STEPS.length, step + 1))} disabled={step === WIZARD_STEPS.length} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-40" data-testid="vo-btn-next">Next <ChevronRight size={14} /></button>
          </div>
        </div>

        {tplModalOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="vo-template-modal">
            <div className="card-dark p-6 max-w-md w-full">
              <div className="flex items-start justify-between mb-3"><h3 className="font-display text-2xl text-[#F0EDE8]">Save as template</h3><button onClick={() => setTplModalOpen(false)} className="text-[#A19D94]"><X size={18} /></button></div>
              <Field label="Template name"><input className={inputClass} value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Standard scope change VO" data-testid="vo-template-name" /></Field>
              <div className="flex gap-2 mt-4"><button onClick={() => setTplModalOpen(false)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button><button onClick={saveAsTemplate} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="vo-template-save">Save</button></div>
            </div>
          </div>
        )}

        {signingOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="vo-sign-modal">
            <div className="card-dark p-5 max-w-lg w-full">
              <div className="flex items-start justify-between mb-3"><h3 className="font-display text-xl text-[#F0EDE8]">{signingOpen === "client" ? "Client approval signature" : "Contractor signature"}</h3><button onClick={() => setSigningOpen(null)} className="text-[#A19D94]"><X size={18} /></button></div>
              <SignaturePad value={signingOpen === "client" ? (data.clientApproverSignature || "") : (data.preparedSignature || "")} onChange={(v) => set(signingOpen === "client" ? "clientApproverSignature" : "preparedSignature")(v)} />
              <div className="flex gap-2 mt-3"><button onClick={() => setSigningOpen(null)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button><button onClick={() => setSigningOpen(null)} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="vo-sign-done">Done</button></div>
            </div>
          </div>
        )}

        {photoPickerOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="vo-photo-picker">
            <div className="card-dark p-5 max-w-3xl w-full max-h-[80vh] overflow-y-auto">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-display text-xl text-[#F0EDE8]">Attach photos from Photo Vault</h3>
                <button onClick={() => setPhotoPickerOpen(false)} className="text-[#A19D94]"><X size={18} /></button>
              </div>
              {photoVaultItems.length === 0 ? (
                <div className="text-center py-8 text-sm text-[#A19D94]">No photos in the Photo Vault{data.projectId ? " for this project" : ""} yet. Upload some in the Photo Vault first.</div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {photoVaultItems.filter(p => p.kind === "image" || !p.kind).map(p => {
                    const selected = (data.photoIds || []).includes(p.id);
                    return (
                      <button key={p.id} onClick={() => togglePhoto(p.id)} className={`relative aspect-square rounded-md overflow-hidden border ${selected ? "border-[#E8A020]" : "border-[#2a2620]"}`}>
                        <img alt="" src={thumbSrc(p)} className="w-full h-full object-cover" />
                        {selected && <div className="absolute inset-0 bg-[#E8A020]/30 flex items-center justify-center"><CheckCircle2 size={20} className="text-white" /></div>}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2 mt-4">
                <button onClick={() => setPhotoPickerOpen(false)} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="vo-photo-done">Done ({(data.photoIds || []).length} selected)</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
