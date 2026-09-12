// Morris — Applications for Payment V2 (flagship payment application system)
// Dashboard-first: stat cards by status + templates + filters + KPIs.
// 9-step wizard: Project → Contract & Client → Previous Applications & Valuations
//   → Current Valuation → Retention/VAT/Adjustments → Supporting Documents
//   → Review & Approval → Status Tracking → Preview & PDF

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus, Search, RefreshCw, Trash2, Edit2, X, ChevronLeft, ChevronRight,
  Download, PenTool, Copy, Star, Save, CheckCircle2, AlertTriangle,
  FileSignature, Send, PoundSterling, Camera,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import SignaturePad from "../components/SignaturePad";
import { downloadAfpPdf, afpPdfBlobUrl } from "../lib/application-for-payment-pdf";
import { listMedia, thumbSrc } from "../lib/media";

const TOOL_ID = "applications-for-payment";
const DRAFT_KEY = "morris.tool_draft.applications-for-payment";

const WIZARD_STEPS = [
  { id: 1, key: "project",   label: "Project" },
  { id: 2, key: "contract",  label: "Contract & Client" },
  { id: 3, key: "history",   label: "Previous Applications" },
  { id: 4, key: "valuation", label: "Current Valuation" },
  { id: 5, key: "money",     label: "Retention & VAT" },
  { id: 6, key: "evidence",  label: "Photos & Docs" },
  { id: 7, key: "approval",  label: "Review & Approval" },
  { id: 8, key: "status",    label: "Status" },
  { id: 9, key: "generate",  label: "Preview & PDF" },
];

const CATEGORIES = ["Labour", "Materials", "Plant & Equipment", "Preliminaries", "Subcontractor", "Variations", "Other"];
const VAT_TREATMENTS = ["Standard 20%", "Reduced 5%", "Zero-rated", "Reverse charge (0%)", "Exempt"];
const CIS_STATUSES = ["Not applicable", "Gross (0%)", "Standard (20%)", "Higher (30%)"];
const STATUSES = ["Draft", "Submitted", "Certified", "Paid", "Rejected"];

const inputClass = "w-full bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none";
const Label = ({ children }) => <label className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">{children}</label>;
const Field = ({ label, children, hint }) => (
  <div><Label>{label}</Label><div className="mt-1">{children}</div>{hint && <div className="text-[11px] text-[#706D66] mt-1">{hint}</div>}</div>
);
const fGBP = (n) => `£${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

const emptyLine = () => ({ id: crypto.randomUUID(), category: "Labour", description: "", valueToDate: 0 });

// P1.1 addendum (Sep 2026) — some legacy Job records store the client
// contact as a combined "Name — Phone" or "Name - Phone" string (e.g.
// "Sarah Mitchell — 07700 912846"). We must NOT paste that whole string
// wholesale into AFP.clientName, and we must NOT heuristically split it
// (the surname or company suffix could carry digits or dashes). Instead
// we detect the pattern and leave the AFP contact-name blank so the user
// enters the real contact person by hand. `isLegacyCombinedContact` is
// intentionally strict: only strings that clearly encode a separator +
// a UK-phone-shaped digit block trigger the guard.
function isLegacyCombinedContact(s) {
  if (typeof s !== "string") return false;
  const trimmed = s.trim();
  if (!trimmed) return false;
  // Require a separator so we don't blank a normal name like "Jean-Luc Picard".
  const hasSeparator = /[—–]|(\s-\s)|(\s\|\s)|(\s·\s)/.test(trimmed);
  if (!hasSeparator) return false;
  // Require a phone-shaped block of 6+ consecutive digits (with optional
  // spaces / dashes inside) on either side of the separator.
  const phoneLike = /(?:\+?\d[\d\s\-]{5,})/;
  return phoneLike.test(trimmed);
}
// Returns the AFP client-name we should pre-fill from a Job's clientContact.
// Blanks out combined legacy strings so the user isn't left with a wrong
// merged value. Non-combined strings pass through untouched.
function safeAfpClientNameFromJob(clientContact) {
  return isLegacyCombinedContact(clientContact) ? "" : (clientContact || "");
}

const emptyAfp = () => ({
  projectId: "", projectName: "", projectAddress: "",
  clientName: "", clientCompany: "", clientEmail: "", clientPhone: "",
  contractRef: "", contractDate: "", contractSum: 0,
  applicationRef: "", applicationNumber: 0,
  applicationDate: new Date().toISOString().slice(0, 10),
  periodFrom: "", periodTo: "",
  dueDate: "", status: "Draft",
  lineItems: [emptyLine()],
  approvedVariationsValue: 0,
  previouslyCertified: 0,
  retentionRate: 5, previousRetentionHeld: 0,
  adjustments: 0, adjustmentNote: "",
  cisStatus: "Not applicable",
  vatTreatment: "Standard 20%",
  supportingDocs: [], photoIds: [],
  preparedBy: "", preparedSignature: "",
  certifierName: "", certifierRole: "", certifierSignature: "", certifiedDate: "",
  certifiedAmount: 0,
  paidDate: "", paidAmount: 0,
  rejectionReason: "",
  notes: "",
  paymentTerms: "Payment due within 30 days of certification. Interest may be charged under the Late Payment of Commercial Debts (Interest) Act 1998.",
  isFavourite: false,
  previousApplications: [],
});

function saveDraft(d) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ } }
function loadDraft() { try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }

function computeTotals(data) {
  const items = data.lineItems || [];
  let gross = 0; let labour = 0; const byCat = {};
  const labourCats = new Set(["Labour", "Subcontractor"]);
  items.forEach(it => {
    const v = Number(it.valueToDate) || 0;
    byCat[it.category] = (byCat[it.category] || 0) + v;
    gross += v;
    if (labourCats.has(it.category)) labour += v;
  });
  const approvedVar = Number(data.approvedVariationsValue) || 0;
  const grossInc = gross + approvedVar;
  const prevCert = Number(data.previouslyCertified) || 0;
  const thisPeriod = grossInc - prevCert;
  const retentionRate = Number(data.retentionRate) || 0;
  const totalRetention = grossInc * retentionRate / 100;
  const prevRet = Number(data.previousRetentionHeld) || 0;
  const retentionThis = totalRetention - prevRet;
  const adjustments = Number(data.adjustments) || 0;
  const subtotalNet = thisPeriod - retentionThis + adjustments;
  const cisMap = { "Not applicable": 0, "Gross (0%)": 0, "Standard (20%)": 20, "Higher (30%)": 30 };
  const cisRate = cisMap[data.cisStatus] || 0;
  const labourRatio = gross > 0 ? labour / gross : 0;
  const cisApplicable = data.cisStatus !== "Not applicable" ? Math.max(0, subtotalNet) * labourRatio : 0;
  const cisDeduction = cisApplicable * cisRate / 100;
  const vatMap = { "Standard 20%": 20, "Reduced 5%": 5, "Zero-rated": 0, "Reverse charge (0%)": 0, "Exempt": 0 };
  const vatRate = vatMap[data.vatTreatment] || 0;
  const vatAmount = Math.max(0, subtotalNet - cisDeduction) * vatRate / 100;
  const totalDue = subtotalNet - cisDeduction + vatAmount;
  return {
    grossValuation: gross, approvedVariationsValue: approvedVar, grossIncludingVariations: grossInc,
    byCategory: byCat, previouslyCertified: prevCert, thisPeriod, retentionRate,
    totalRetention, previousRetentionHeld: prevRet, retentionThisPeriod: retentionThis,
    adjustments, subtotalNet, labourValuation: labour, labourRatio,
    cisStatus: data.cisStatus, cisRate, cisApplicable, cisDeduction,
    vatTreatment: data.vatTreatment, vatRate, vatAmount, totalDue,
  };
}

const STATUS_BADGE = {
  Draft: "border-[#2a2620] text-[#A19D94]",
  Submitted: "border-[#E8A020]/40 text-[#E8A020]",
  Certified: "border-[#68D391]/40 text-[#68D391]",
  Paid: "border-[#68B4F0]/40 text-[#68B4F0]",
  Rejected: "border-[#F27C7C]/40 text-[#F27C7C]",
};

export default function ApplicationsForPayment() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const openParamId = params.get("open") || "";
  const projectFilterInit = params.get("projectId") || "";
  const [apps, setApps] = useState([]);
  const [stats, setStats] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterProject, setFilterProject] = useState(projectFilterInit);
  const [editing, setEditing] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [aRes, sRes, tRes, jRes] = await Promise.allSettled([
        api.get("/applications-for-payment/applications"),
        api.get("/applications-for-payment/stats"),
        api.get("/applications-for-payment/templates"),
        api.get("/jobs"),
      ]);
      if (aRes.status === "fulfilled") setApps(aRes.value.data);
      if (sRes.status === "fulfilled") setStats(sRes.value.data);
      if (tRes.status === "fulfilled") setTemplates(tRes.value.data);
      if (jRes.status === "fulfilled") setJobs(jRes.value.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (openParamId && apps.length > 0 && !wizardOpen) {
      const a = apps.find(x => x.id === openParamId); if (a) openEdit(a);
    }
  }, [openParamId, apps]);   

  const openNew = (fromTemplate = null) => {
    let base = emptyAfp();
    if (fromTemplate) {
      base = { ...base, ...(fromTemplate.payload || {}), id: undefined, status: "Draft",
        applicationRef: "", applicationNumber: 0, applicationDate: base.applicationDate,
        lineItems: (fromTemplate.payload?.lineItems || []).map(l => ({ ...l, id: crypto.randomUUID() })) };
      // P1.2 (Sep 2026) — a template intentionally carries scope, so it may
      // reuse client details and line items, but MUST NOT carry the previous
      // AFP's photo evidence or signatures over.
      base.photoIds = []; base.supportingDocs = [];
      base.preparedSignature = ""; base.certifierSignature = "";
    }
    // P1.2 — starting a genuinely new AFP must always begin from a clean
    // slate. The old `loadDraft()` merge here shared a single localStorage
    // slot across every AFP, so it silently re-populated photoIds /
    // supportingDocs / signatures from whichever AFP the user last touched.
    // The authoritative draft store is `db.drafts` and per-AFP records —
    // this local cache is retired.
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    if (filterProject && !base.projectId) {
      const j = jobs.find(x => x.id === filterProject);
      if (j) {
        base.projectId = j.id;
        base.projectName = j.projectName || j.clientName || "";
        base.projectAddress = j.address || "";
        // P1.1 (Sep 2026) — semantic mapping from Job schema:
        //   Job.clientContact  → AFP.clientName    (the human contact)
        //   Job.clientName     → AFP.clientCompany (the client organisation)
        //   Job.poNumber       → AFP.contractRef   (the commercial reference)
        // Email / phone / contractDate are NOT stored on Job; they stay blank
        // so the user can fill them in without a wrong auto-guess overwrite.
        base.clientName = safeAfpClientNameFromJob(j.clientContact);
        base.clientCompany = j.clientName || j.company || "";
        base.contractRef = j.poNumber || "";
      }
    }
    setEditing(base); setWizardOpen(true);
  };
  const openEdit = (a) => { setEditing({ ...emptyAfp(), ...a }); setWizardOpen(true); };
  const duplicate = (a) => {
    const c = { ...a }; delete c.id; delete c.createdAt; delete c.updatedAt; delete c._id;
    c.status = "Draft"; c.applicationRef = ""; c.applicationNumber = 0;
    c.applicationDate = new Date().toISOString().slice(0, 10);
    c.certifiedAmount = 0; c.certifiedDate = ""; c.paidAmount = 0; c.paidDate = "";
    c.certifierSignature = ""; c.preparedSignature = "";
    // P1.2 (Sep 2026) — duplicate copies scope + client, but MUST NOT carry
    // the source AFP's photo evidence over. Duplicating is a "same client,
    // next period" convenience — the evidence for that new period must be
    // captured fresh.
    c.photoIds = []; c.supportingDocs = [];
    c.lineItems = (c.lineItems || []).map(l => ({ ...l, id: crypto.randomUUID() }));
    setEditing({ ...emptyAfp(), ...c }); setWizardOpen(true);
  };
  const deleteApp = async (a) => {
    if (!window.confirm(`Delete application ${a.applicationRef || ""}?`)) return;
    try { await api.delete(`/applications-for-payment/applications/${a.id}`); toast.success("Deleted"); await loadAll(); }
    catch { toast.error("Delete failed"); }
  };
  const toggleFav = async (a) => { try { await api.patch(`/applications-for-payment/applications/${a.id}`, { isFavourite: !a.isFavourite }); await loadAll(); } catch { toast.error("Failed"); } };
  const markStatus = async (a, status) => {
    try { await api.post(`/applications-for-payment/applications/${a.id}/status`, { status }); toast.success(`Marked as ${status}`); await loadAll(); }
    catch { toast.error("Failed"); }
  };

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    return apps.filter(a => {
      if (s) {
        const hay = `${a.applicationRef || ""} ${a.projectName || ""} ${a.clientName || ""} ${a.clientCompany || ""} ${a.contractRef || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (filterStatus === "Overdue") { if (!a.isOverdue) return false; }
      else if (filterStatus && (a.status || "Draft") !== filterStatus) return false;
      if (filterProject && a.projectId !== filterProject) return false;
      return true;
    });
  }, [apps, query, filterStatus, filterProject]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="afp-page">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Commercial</div>
          <h1 className="font-display text-3xl sm:text-4xl text-[#F0EDE8]">Applications for Payment</h1>
          <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">Prepare, submit and track payment applications from valuation through certification to payment. Full audit trail — every application, every retention movement, every certification.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={loadAll} className="text-xs text-[#A19D94] hover:text-[#E8A020] flex items-center gap-1" data-testid="afp-refresh"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh</button>
          <button onClick={() => openNew()} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040]" data-testid="afp-new-btn"><Plus size={14} /> New Application</button>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Draft" value={stats?.draft ?? 0} testId="afp-stat-draft" />
        <StatCard label="Submitted" value={stats?.submitted ?? 0} tone="gold" testId="afp-stat-submitted" />
        <StatCard label="Certified" value={stats?.certified ?? 0} tone="green" testId="afp-stat-certified" />
        <StatCard label="Paid" value={stats?.paid ?? 0} tone="blue" testId="afp-stat-paid" />
        <StatCard label="Overdue" value={stats?.overdue ?? 0} tone="red" testId="afp-stat-overdue" />
        <StatCard label="Rejected" value={stats?.rejected ?? 0} tone="red" testId="afp-stat-rejected" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <ValueCard label="Outstanding" value={fGBP(stats?.outstandingValue || 0)} sub="Submitted + certified − paid" tone="gold" testId="afp-val-outstanding" />
        <ValueCard label="Overdue" value={fGBP(stats?.overdueValue || 0)} sub="Past due date, chase clients" tone="red" testId="afp-val-overdue" />
        <ValueCard label="Paid year-to-date" value={fGBP(stats?.paidValue || 0)} sub="Total certified payments received" tone="green" testId="afp-val-paid" />
      </div>

      {templates.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Templates</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {templates.map(t => (
              <div key={t.id} className="card-dark p-3 flex items-start justify-between gap-2" data-testid={`afp-template-${t.id}`}>
                <button onClick={() => openNew(t)} className="text-left flex-1 min-w-0">
                  <div className="text-sm text-[#F0EDE8] truncate">{t.name}</div>
                  <div className="text-[11px] text-[#A19D94] truncate">Application template</div>
                </button>
                <button onClick={async () => { if (!window.confirm("Delete template?")) return; try { await api.delete(`/applications-for-payment/templates/${t.id}`); setTemplates(templates.filter(x => x.id !== t.id)); } catch { toast.error("Failed"); } }} className="text-[#706D66] hover:text-[#F27C7C] p-1"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-dark p-4 mb-4" data-testid="afp-filters">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search reference, project, client, contract…" className={`${inputClass} pl-9`} data-testid="afp-search" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={inputClass} data-testid="afp-filter-status">
            <option value="">All status</option>
            {[...STATUSES, "Overdue"].map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className={inputClass} data-testid="afp-filter-project">
            <option value="">All projects</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.projectName || j.clientName}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card-dark p-8 text-center text-sm text-[#A19D94]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card-dark p-10 text-center" data-testid="afp-empty">
          <PoundSterling size={28} className="mx-auto text-[#E8A020] mb-3" />
          <div className="text-base text-[#F0EDE8]">{apps.length === 0 ? "No applications yet" : "No applications match your filters"}</div>
          <p className="text-xs text-[#A19D94] mt-2 max-w-md mx-auto">Raise your first application for payment to start tracking valuations, retentions and certifications for this project.</p>
          <button onClick={() => openNew()} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="afp-empty-new"><Plus size={14} /> Raise your first application</button>
        </div>
      ) : (
        <div className="space-y-2">{filtered.map(a => <AfpRow key={a.id} a={a} onEdit={() => openEdit(a)} onDelete={() => deleteApp(a)} onDuplicate={() => duplicate(a)} onFav={() => toggleFav(a)} onMark={(s) => markStatus(a, s)} />)}</div>
      )}

      {wizardOpen && editing && (
        <AfpWizard initial={editing} user={user} jobs={jobs}
          onClose={() => { setWizardOpen(false); setEditing(null); }}
          onSaved={async () => { await loadAll(); setWizardOpen(false); setEditing(null); }}
          onTemplatesChanged={setTemplates}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, tone, testId }) {
  const t = tone === "red" ? "text-[#F27C7C]" : tone === "green" ? "text-[#68D391]" : tone === "gold" ? "text-[#E8A020]" : tone === "blue" ? "text-[#68B4F0]" : "text-[#F0EDE8]";
  return (<div className="card-dark p-4" data-testid={testId}><Label>{label}</Label><div className={`mt-2 font-display text-3xl ${t}`}>{value}</div></div>);
}
function ValueCard({ label, value, sub, tone, testId }) {
  const t = tone === "red" ? "text-[#F27C7C]" : tone === "green" ? "text-[#68D391]" : tone === "gold" ? "text-[#E8A020]" : "text-[#F0EDE8]";
  return (<div className="card-dark p-4" data-testid={testId}><Label>{label}</Label><div className={`mt-2 font-display text-2xl ${t}`}>{value}</div><div className="text-[11px] text-[#A19D94] mt-1">{sub}</div></div>);
}

function AfpRow({ a, onEdit, onDelete, onDuplicate, onFav, onMark }) {
  const status = a.status || "Draft";
  const statusCls = STATUS_BADGE[status] || STATUS_BADGE.Draft;
  const totalDue = (a.totals || {}).totalDue || 0;
  const cert = a.certifiedAmount || 0;
  return (
    <div className={`card-dark p-4 flex items-start gap-3 ${a.isOverdue ? "border-l-2 border-[#F27C7C]" : ""}`} data-testid={`afp-row-${a.id}`}>
      <button onClick={onFav} className={`p-1 mt-1 ${a.isFavourite ? "text-[#E8A020]" : "text-[#706D66] hover:text-[#E8A020]"}`}><Star size={14} fill={a.isFavourite ? "#E8A020" : "none"} /></button>
      <button onClick={onEdit} className="text-left flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base text-[#F0EDE8] font-medium truncate">{a.applicationRef || "AFP-DRAFT"} · #{a.applicationNumber || 1}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusCls}`}>{status}</span>
          {a.isOverdue && <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#F27C7C]/40 text-[#F27C7C]">Overdue</span>}
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#E8A020]/40 text-[#E8A020]">{fGBP(status === "Certified" || status === "Paid" ? cert : totalDue)}</span>
        </div>
        <div className="text-xs text-[#A19D94] mt-1 truncate">{a.projectName || a.clientCompany || a.clientName || "—"} · {a.applicationDate || "—"} {a.dueDate ? `· due ${a.dueDate}` : ""}</div>
      </button>
      <div className="flex gap-1 shrink-0">
        {status === "Draft" && <button onClick={() => onMark("Submitted")} className="p-2 text-[#A19D94] hover:text-[#E8A020]" title="Mark as Submitted" data-testid={`afp-row-submit-${a.id}`}><Send size={14} /></button>}
        {status === "Submitted" && <button onClick={() => onMark("Certified")} className="p-2 text-[#A19D94] hover:text-[#68D391]" title="Mark as Certified" data-testid={`afp-row-certify-${a.id}`}><CheckCircle2 size={14} /></button>}
        {status === "Certified" && <button onClick={() => onMark("Paid")} className="p-2 text-[#A19D94] hover:text-[#68B4F0]" title="Mark as Paid" data-testid={`afp-row-paid-${a.id}`}><CheckCircle2 size={14} /></button>}
        {(status === "Submitted" || status === "Draft") && <button onClick={() => onMark("Rejected")} className="p-2 text-[#A19D94] hover:text-[#F27C7C]" title="Mark as Rejected" data-testid={`afp-row-reject-${a.id}`}><AlertTriangle size={14} /></button>}
        <button onClick={onEdit} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`afp-row-edit-${a.id}`}><Edit2 size={14} /></button>
        <button onClick={onDuplicate} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`afp-row-dup-${a.id}`}><Copy size={14} /></button>
        <button onClick={onDelete} className="p-2 text-[#A19D94] hover:text-[#F27C7C]" data-testid={`afp-row-delete-${a.id}`}><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

// ================================================================
// WIZARD
// ================================================================
function AfpWizard({ initial, user, jobs, onClose, onSaved, onTemplatesChanged }) {
  const [data, setData] = useState(initial);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [signingOpen, setSigningOpen] = useState(null); // "prepared" | "certifier"
  const [photoVaultItems, setPhotoVaultItems] = useState([]);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [projectSummary, setProjectSummary] = useState(null);

  useEffect(() => { if (user?.fullName && !data.preparedBy) setData(d => ({ ...d, preparedBy: user.fullName })); }, [user?.fullName]);   
  useEffect(() => { if (!data.id) { const t = setTimeout(() => saveDraft(data), 500); return () => clearTimeout(t); } }, [data]);

  useEffect(() => {
    (async () => {
      try {
        const params = { limit: 200 }; if (data.projectId) params.jobId = data.projectId;
        const items = await listMedia(params);
        setPhotoVaultItems(Array.isArray(items) ? items : (items?.items || []));
      } catch { /* ignore */ }
    })();
  }, [data.projectId]);

  // Load previous applications summary whenever the project changes
  useEffect(() => {
    if (!data.projectId) { setProjectSummary(null); return; }
    (async () => {
      try {
        const r = await api.get(`/applications-for-payment/project/${data.projectId}/summary`);
        setProjectSummary(r.data);
        // Auto-fill values that are still at their defaults so the QS doesn't double-key
        setData(prev => {
          const p = { ...prev };
          // Approved variations (only auto-fill for a NEW application)
          if (!p.id && (p.approvedVariationsValue == null || Number(p.approvedVariationsValue) === 0)) p.approvedVariationsValue = r.data.approvedVariationsValue || 0;
          if (!p.id && (p.previouslyCertified == null || Number(p.previouslyCertified) === 0)) p.previouslyCertified = r.data.previouslyCertifiedTotal || 0;
          if (!p.id && (p.previousRetentionHeld == null || Number(p.previousRetentionHeld) === 0)) p.previousRetentionHeld = r.data.previousRetentionHeld || 0;
          if (!p.id && (!p.applicationNumber || p.applicationNumber === 0)) p.applicationNumber = r.data.nextApplicationNumber || 1;
          return p;
        });
      } catch { /* ignore */ }
    })();
  }, [data.projectId]);   

  const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));
  const totals = useMemo(() => computeTotals(data), [data]);

  const pickProject = (id) => {
    const j = jobs.find(x => x.id === id); if (!j) return;
    // P1.1 (Sep 2026) — same semantic mapping as the create path. Preserve
    // whatever the user already typed if the job doesn't carry that field.
    setData(d => ({
      ...d,
      projectId: j.id,
      projectName: j.projectName || j.clientName || d.projectName,
      projectAddress: j.address || d.projectAddress,
      clientName: safeAfpClientNameFromJob(j.clientContact) || d.clientName,  // contact person
      clientCompany: j.clientName || j.company || d.clientCompany, // organisation
      contractRef: j.poNumber || d.contractRef,
      contractSum: j.contractValue || d.contractSum,
    }));
  };

  // Line items
  const addLine = () => setData(d => ({ ...d, lineItems: [...(d.lineItems || []), emptyLine()] }));
  const updLine = (id, patch) => setData(d => ({ ...d, lineItems: d.lineItems.map(x => x.id === id ? { ...x, ...patch } : x) }));
  const delLine = (id) => setData(d => ({ ...d, lineItems: d.lineItems.filter(x => x.id !== id) }));
  const dupLine = (id) => setData(d => { const l = d.lineItems.find(x => x.id === id); if (!l) return d; return { ...d, lineItems: [...d.lineItems, { ...l, id: crypto.randomUUID() }] }; });

  const togglePhoto = (mediaId) => {
    setData(d => {
      const cur = new Set(d.photoIds || []);
      if (cur.has(mediaId)) cur.delete(mediaId); else cur.add(mediaId);
      return { ...d, photoIds: Array.from(cur) };
    });
  };
  const addSupportingDoc = () => setData(d => ({ ...d, supportingDocs: [...(d.supportingDocs || []), { id: crypto.randomUUID(), name: "", url: "" }] }));
  const updSupportingDoc = (id, patch) => setData(d => ({ ...d, supportingDocs: d.supportingDocs.map(x => x.id === id ? { ...x, ...patch } : x) }));
  const delSupportingDoc = (id) => setData(d => ({ ...d, supportingDocs: (d.supportingDocs || []).filter(x => x.id !== id) }));

  const generatePreview = () => {
    try {
      setPreviewUrl(afpPdfBlobUrl({
        data: { ...data, totals, previousApplications: projectSummary?.previousApplications || [] },
        user, today: new Date().toLocaleDateString("en-GB"),
      }));
    } catch { toast.error("Preview failed"); }
  };

  const saveEntry = async () => {
    if (!data.projectName && !data.projectId) { toast.error("Project is required"); setStep(1); return; }
    setSaving(true);
    try {
      let saved;
      const payload = { ...data };
      if (data.id) { const r = await api.patch(`/applications-for-payment/applications/${data.id}`, payload); saved = r.data; }
      else { const r = await api.post("/applications-for-payment/applications", payload); saved = r.data; }
      try {
        await api.post("/documents/save", {
          title: `Application for Payment — ${data.projectName || data.clientCompany || data.clientName || "Client"}`,
          toolId: TOOL_ID, refNumber: saved.applicationRef, jobId: data.projectId || null,
          content: `APPLICATION FOR PAYMENT ${saved.applicationRef}\n${data.projectName || ""} · ${data.clientName || data.clientCompany || ""}\nStatus: ${saved.status}\nTotal due: ${fGBP((saved.totals || {}).totalDue || 0)}`,
          metadata: { ...saved },
        });
      } catch { /* soft-fail */ }
      downloadAfpPdf({
        data: { ...saved, previousApplications: projectSummary?.previousApplications || [] },
        user, today: new Date().toLocaleDateString("en-GB"),
      });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      toast.success("Application saved");
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  const saveAsTemplate = async () => {
    if (!tplName.trim()) return toast.error("Template name required");
    try {
      const payload = { ...data, id: undefined, applicationRef: undefined, applicationNumber: undefined,
        status: "Draft", certifiedAmount: 0, certifiedDate: "", paidAmount: 0, paidDate: "",
        preparedSignature: "", certifierSignature: "", photoIds: [] };
      await api.post("/applications-for-payment/templates", { name: tplName.trim(), payload });
      toast.success("Template saved");
      setTplModalOpen(false); setTplName("");
      const lst = await api.get("/applications-for-payment/templates"); onTemplatesChanged(lst.data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-y-auto" data-testid="afp-wizard">
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-5xl mx-auto card-dark p-5 md:p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-1">{data.id ? "Edit" : "New"} Application for Payment</div>
              <h2 className="font-display text-2xl text-[#F0EDE8]">{data.projectName || "Untitled"} <span className="text-sm text-[#A19D94]">· {fGBP(totals.totalDue)} due</span></h2>
            </div>
            <button onClick={onClose} className="text-[#A19D94] hover:text-[#F0EDE8]" data-testid="afp-wizard-close"><X size={20} /></button>
          </div>

          <div className="flex justify-end mb-3">
            <button onClick={() => setTplModalOpen(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="afp-save-template-btn"><Save size={12} /> Save as template</button>
          </div>

          <div className="overflow-x-auto mb-5" data-testid="afp-stepper">
            <div className="flex gap-1 min-w-max">
              {WIZARD_STEPS.map(s => (
                <button key={s.id} onClick={() => setStep(s.id)} data-testid={`afp-step-${s.id}`}
                  className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${step === s.id ? "bg-[#E8A020] text-black" : step > s.id ? "bg-[#1e1a12] text-[#68D391] border border-[#68D391]/30" : "bg-[#0f0d09] text-[#A19D94] border border-[#2a2620]"}`}>
                  {s.id}. {s.label}
                </button>
              ))}
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-4" data-testid="afp-step-1-project">
              {jobs.length > 0 && (
                <Field label="Link to project (recommended)">
                  <select value={data.projectId} onChange={(e) => pickProject(e.target.value)} className={inputClass} data-testid="afp-link-project">
                    <option value="">Not linked</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.projectName || j.clientName}</option>)}
                  </select>
                </Field>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Project name"><input className={inputClass} value={data.projectName} onChange={(e) => set("projectName")(e.target.value)} data-testid="afp-projectName" /></Field>
                <Field label="Site address"><textarea className={`${inputClass} min-h-[52px]`} value={data.projectAddress} onChange={(e) => set("projectAddress")(e.target.value)} data-testid="afp-projectAddress" /></Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4" data-testid="afp-step-2-contract">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Client contact name"><input className={inputClass} value={data.clientName} onChange={(e) => set("clientName")(e.target.value)} data-testid="afp-clientName" /></Field>
                <Field label="Client company"><input className={inputClass} value={data.clientCompany} onChange={(e) => set("clientCompany")(e.target.value)} /></Field>
                <Field label="Client email"><input type="email" className={inputClass} value={data.clientEmail} onChange={(e) => set("clientEmail")(e.target.value)} /></Field>
                <Field label="Client phone"><input className={inputClass} value={data.clientPhone} onChange={(e) => set("clientPhone")(e.target.value)} /></Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Contract reference"><input className={inputClass} value={data.contractRef} onChange={(e) => set("contractRef")(e.target.value)} data-testid="afp-contractRef" /></Field>
                <Field label="Contract date"><input type="date" className={inputClass} value={data.contractDate} onChange={(e) => set("contractDate")(e.target.value)} /></Field>
                <Field label="Original contract sum (£)"><input type="number" step="0.01" className={inputClass} value={data.contractSum} onChange={(e) => set("contractSum")(Number(e.target.value))} data-testid="afp-contractSum" /></Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Application date"><input type="date" className={inputClass} value={data.applicationDate} onChange={(e) => set("applicationDate")(e.target.value)} /></Field>
                <Field label="Period from"><input type="date" className={inputClass} value={data.periodFrom} onChange={(e) => set("periodFrom")(e.target.value)} /></Field>
                <Field label="Period to"><input type="date" className={inputClass} value={data.periodTo} onChange={(e) => set("periodTo")(e.target.value)} /></Field>
              </div>
              <Field label="Payment due date" hint="Under standard construction contracts the payment period is 30 days from the application date.">
                <input type="date" className={inputClass} value={data.dueDate} onChange={(e) => set("dueDate")(e.target.value)} data-testid="afp-dueDate" />
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4" data-testid="afp-step-3-history">
              {!data.projectId ? (
                <div className="card-dark p-4 text-sm text-[#A19D94]">Link this application to a project (step 1) to see previous applications and running totals here.</div>
              ) : projectSummary ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <MetricCard label="Application #" value={`#${projectSummary.nextApplicationNumber}`} />
                    <MetricCard label="Previously certified" value={fGBP(projectSummary.previouslyCertifiedTotal || 0)} tone="green" />
                    <MetricCard label="Retention held to date" value={fGBP(projectSummary.previousRetentionHeld || 0)} tone="gold" />
                    <MetricCard label="Approved variations" value={fGBP(projectSummary.approvedVariationsValue || 0)} tone="gold" />
                  </div>
                  <div className="card-dark p-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020] mb-3">Previous applications on this project</div>
                    {(projectSummary.previousApplications || []).length === 0 ? (
                      <div className="text-xs text-[#A19D94]">No previous applications for this project. This will be application #1.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-[#A19D94]"><tr><th className="text-left py-2">#</th><th className="text-left">Reference</th><th className="text-left">Date</th><th className="text-left">Status</th><th className="text-right">Application Value</th><th className="text-right">Certified</th></tr></thead>
                          <tbody className="text-[#F0EDE8]">
                            {projectSummary.previousApplications.map(p => {
                              // P0.2 (Sep 2026) — split Application Value from
                              // Certified. Only Certified/Paid rows show a
                              // Certified amount; everything else shows £0
                              // (no fallback to gross valuation).
                              const isCert = p.status === "Certified" || p.status === "Paid";
                              const certified = isCert ? (Number(p.certifiedAmount) || 0) : 0;
                              return (
                                <tr key={p.id} className="border-t border-[#2a2620]"><td className="py-2">{p.applicationNumber}</td><td>{p.applicationRef}</td><td>{p.applicationDate}</td><td>{p.status}</td><td className="text-right">{fGBP(p.grossIncludingVariations || 0)}</td><td className="text-right">{fGBP(certified)}</td></tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="Previously certified (£)" hint="Auto-filled — override only if the client's records differ."><input type="number" step="0.01" className={inputClass} value={data.previouslyCertified} onChange={(e) => set("previouslyCertified")(Number(e.target.value))} data-testid="afp-previouslyCertified" /></Field>
                    <Field label="Retention previously held (£)"><input type="number" step="0.01" className={inputClass} value={data.previousRetentionHeld} onChange={(e) => set("previousRetentionHeld")(Number(e.target.value))} data-testid="afp-previousRetentionHeld" /></Field>
                    <Field label="Application number"><input type="number" className={inputClass} value={data.applicationNumber} onChange={(e) => set("applicationNumber")(Number(e.target.value))} /></Field>
                  </div>
                </>
              ) : (
                <div className="card-dark p-4 text-sm text-[#A19D94]">Loading previous applications…</div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3" data-testid="afp-step-4-valuation">
              <div className="card-dark p-3 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">
                Enter the total <b>Value to Date</b> for each category (not just the amount for this period). The system will deduct the previously certified total automatically.
              </div>
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Valuation lines · {(data.lineItems || []).length}</div>
                <button onClick={addLine} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#E8A020] text-black text-xs font-medium" data-testid="afp-add-line"><Plus size={12} /> Add line</button>
              </div>
              {(data.lineItems || []).map((it, i) => (
                <div key={it.id} className="card-dark p-3" data-testid={`afp-line-${i + 1}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Line {i + 1} · <span className="text-[#F0EDE8]">{fGBP(it.valueToDate)}</span></span>
                    <div className="flex gap-2"><button onClick={() => dupLine(it.id)} className="text-[#A19D94] hover:text-[#E8A020]"><Copy size={12} /></button><button onClick={() => delLine(it.id)} className="text-[#A19D94] hover:text-[#F27C7C]"><Trash2 size={12} /></button></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <Field label="Category">
                      <select className={inputClass} value={it.category} onChange={(e) => updLine(it.id, { category: e.target.value })} data-testid={`afp-line-cat-${i + 1}`}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </Field>
                    <div className="md:col-span-2"><Field label="Description"><input className={inputClass} value={it.description} onChange={(e) => updLine(it.id, { description: e.target.value })} data-testid={`afp-line-desc-${i + 1}`} /></Field></div>
                    <Field label="Value to date (£)"><input type="number" step="0.01" className={inputClass} value={it.valueToDate} onChange={(e) => updLine(it.id, { valueToDate: Number(e.target.value) })} data-testid={`afp-line-value-${i + 1}`} /></Field>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Approved variations to date (£)" hint="Auto-populated from Variation Orders V2 when a project is linked. Editable."><input type="number" step="0.01" className={inputClass} value={data.approvedVariationsValue} onChange={(e) => set("approvedVariationsValue")(Number(e.target.value))} data-testid="afp-approvedVariations" /></Field>
                <div className="card-dark p-3">
                  <Label>Gross valuation this period</Label>
                  <div className="text-2xl text-[#F0EDE8] mt-1">{fGBP(totals.grossIncludingVariations)}</div>
                  <div className="text-[11px] text-[#A19D94] mt-1">= Category subtotals + approved variations</div>
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4" data-testid="afp-step-5-money">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Retention rate (%)"><input type="number" step="0.01" className={inputClass} value={data.retentionRate} onChange={(e) => set("retentionRate")(Number(e.target.value))} data-testid="afp-retentionRate" /></Field>
                <Field label="VAT treatment">
                  <select className={inputClass} value={data.vatTreatment} onChange={(e) => set("vatTreatment")(e.target.value)} data-testid="afp-vatTreatment">
                    {VAT_TREATMENTS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="CIS status">
                  <select className={inputClass} value={data.cisStatus} onChange={(e) => set("cisStatus")(e.target.value)} data-testid="afp-cisStatus">
                    {CIS_STATUSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Adjustments (£)" hint="Positive for extras, negative for contra-charges / liquidated damages."><input type="number" step="0.01" className={inputClass} value={data.adjustments} onChange={(e) => set("adjustments")(Number(e.target.value))} data-testid="afp-adjustments" /></Field>
                <Field label="Adjustment note (optional)"><input className={inputClass} value={data.adjustmentNote} onChange={(e) => set("adjustmentNote")(e.target.value)} placeholder="e.g. Contra: back-charge for damaged tile" /></Field>
              </div>
              <div className="card-dark p-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020] mb-3">Certification summary</div>
                <div className="space-y-2 text-sm">
                  <SummaryRow label="Gross valuation" value={fGBP(totals.grossValuation)} />
                  <SummaryRow label="Add: Approved variations" value={fGBP(totals.approvedVariationsValue)} />
                  <SummaryRow label="Gross inc variations" value={fGBP(totals.grossIncludingVariations)} bold />
                  <SummaryRow label="Less: Previously certified" value={`(${fGBP(totals.previouslyCertified)})`} muted />
                  <SummaryRow label="Value this period" value={fGBP(totals.thisPeriod)} bold />
                  <SummaryRow label={`Less: Retention (${totals.retentionRate}% total, this app)`} value={`(${fGBP(totals.retentionThisPeriod)})`} muted />
                  {totals.adjustments !== 0 && <SummaryRow label={data.adjustmentNote ? `Adjustment (${data.adjustmentNote})` : "Adjustment"} value={fGBP(totals.adjustments)} muted />}
                  <SummaryRow label="Subtotal net" value={fGBP(totals.subtotalNet)} bold />
                  {totals.cisRate > 0 && <SummaryRow label={`Less: CIS deduction (${totals.cisRate}% on labour)`} value={`(${fGBP(totals.cisDeduction)})`} muted />}
                  {totals.vatAmount > 0 && <SummaryRow label={`Add: VAT (${totals.vatTreatment})`} value={fGBP(totals.vatAmount)} muted />}
                  {(data.vatTreatment === "Reverse charge (0%)") && <div className="text-[11px] text-[#A19D94] pl-2">↳ Reverse charge — customer accounts for VAT to HMRC.</div>}
                  <div className="border-t border-[#2a2620] pt-2 mt-2"></div>
                  <div className="flex items-center justify-between"><span className="text-[#E8A020] text-sm">TOTAL DUE THIS APPLICATION</span><span className="text-[#E8A020] text-xl font-medium">{fGBP(totals.totalDue)}</span></div>
                </div>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4" data-testid="afp-step-6-evidence">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Photos from Photo Vault · {(data.photoIds || []).length} selected</div>
                <button onClick={() => setPhotoPickerOpen(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#E8A020] text-black text-xs font-medium" data-testid="afp-pick-photos"><Camera size={12} /> Pick photos</button>
              </div>
              {(data.photoIds || []).length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {(data.photoIds || []).map(pid => {
                    const item = photoVaultItems.find(x => x.id === pid);
                    return (
                      <div key={pid} className="relative aspect-square rounded-md overflow-hidden border border-[#2a2620]">
                        {item ? <img alt="" src={thumbSrc(item)} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-[#1a1610] flex items-center justify-center text-[10px] text-[#706D66]">{pid.slice(0, 6)}</div>}
                        <button onClick={() => togglePhoto(pid)} className="absolute top-1 right-1 bg-black/70 rounded-full p-1 text-[#F27C7C]"><X size={12} /></button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Supporting documents · {(data.supportingDocs || []).length}</div>
                  <button onClick={addSupportingDoc} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#E8A020] text-xs text-[#E8A020]"><Plus size={12} /> Add reference</button>
                </div>
                {(data.supportingDocs || []).map((d, i) => (
                  <div key={d.id} className="card-dark p-3 mb-2" data-testid={`afp-doc-${i + 1}`}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                      <Field label="Document name"><input className={inputClass} value={d.name} onChange={(e) => updSupportingDoc(d.id, { name: e.target.value })} placeholder="e.g. Timesheet April w/e 12" /></Field>
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
            <div className="space-y-4" data-testid="afp-step-7-approval">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="card-dark p-4">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-3">Prepared by (contractor)</div>
                  <Field label="Name"><input className={inputClass} value={data.preparedBy || user?.fullName || ""} onChange={(e) => set("preparedBy")(e.target.value)} data-testid="afp-preparedBy" /></Field>
                  <div className="mt-3"><Label>Signature</Label>
                    <div className="mt-1 flex items-center gap-3">
                      {data.preparedSignature ? <img alt="Signature" src={data.preparedSignature} className="h-12 w-40 rounded-md border border-[#2a2620] bg-white" /> : <div className="h-12 w-40 rounded-md border border-dashed border-[#2a2620] flex items-center justify-center text-[10px] text-[#706D66]">Not signed</div>}
                      <button onClick={() => setSigningOpen("prepared")} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="afp-sign-prepared"><PenTool size={12} /> {data.preparedSignature ? "Re-sign" : "Sign"}</button>
                    </div>
                  </div>
                </div>
                <div className="card-dark p-4">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-3">Certified by (client / QS)</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Certifier name"><input className={inputClass} value={data.certifierName} onChange={(e) => set("certifierName")(e.target.value)} data-testid="afp-certifierName" /></Field>
                    <Field label="Certifier role"><input className={inputClass} value={data.certifierRole} onChange={(e) => set("certifierRole")(e.target.value)} placeholder="e.g. Quantity Surveyor" /></Field>
                  </div>
                  <Field label="Certified date"><input type="date" className={inputClass} value={data.certifiedDate} onChange={(e) => set("certifiedDate")(e.target.value)} /></Field>
                  <div className="mt-3"><Label>Certifier signature</Label>
                    <div className="mt-1 flex items-center gap-3">
                      {data.certifierSignature ? <img alt="Signature" src={data.certifierSignature} className="h-12 w-40 rounded-md border border-[#2a2620] bg-white" /> : <div className="h-12 w-40 rounded-md border border-dashed border-[#2a2620] flex items-center justify-center text-[10px] text-[#706D66]">Not signed</div>}
                      <button onClick={() => setSigningOpen("certifier")} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="afp-sign-certifier"><PenTool size={12} /> Sign</button>
                    </div>
                  </div>
                </div>
              </div>
              <Field label="Payment terms"><textarea className={`${inputClass} min-h-[80px]`} value={data.paymentTerms} onChange={(e) => set("paymentTerms")(e.target.value)} /></Field>
            </div>
          )}

          {step === 8 && (
            <div className="space-y-4" data-testid="afp-step-8-status">
              <Field label="Status">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {STATUSES.map(s => (
                    <button key={s} onClick={() => set("status")(s)} className={`px-3 py-2 rounded-md text-xs border ${data.status === s ? "bg-[#E8A020] text-black border-[#E8A020]" : "border-[#2a2620] text-[#F0EDE8] hover:border-[#E8A020]"}`} data-testid={`afp-status-${s}`}>{s}</button>
                  ))}
                </div>
              </Field>
              {data.status === "Certified" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Certified amount (£)"><input type="number" step="0.01" className={inputClass} value={data.certifiedAmount} onChange={(e) => set("certifiedAmount")(Number(e.target.value))} data-testid="afp-certifiedAmount" /></Field>
                  <Field label="Certified date"><input type="date" className={inputClass} value={data.certifiedDate} onChange={(e) => set("certifiedDate")(e.target.value)} /></Field>
                </div>
              )}
              {data.status === "Paid" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Amount paid (£)"><input type="number" step="0.01" className={inputClass} value={data.paidAmount} onChange={(e) => set("paidAmount")(Number(e.target.value))} data-testid="afp-paidAmount" /></Field>
                  <Field label="Paid date"><input type="date" className={inputClass} value={data.paidDate} onChange={(e) => set("paidDate")(e.target.value)} /></Field>
                </div>
              )}
              {data.status === "Rejected" && (
                <Field label="Rejection reason"><textarea className={`${inputClass} min-h-[80px]`} value={data.rejectionReason} onChange={(e) => set("rejectionReason")(e.target.value)} data-testid="afp-rejectionReason" /></Field>
              )}
              <div className="card-dark p-3 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">
                Marking as <b>Paid</b> automatically adds the amount to the linked project&apos;s payment tracker.
              </div>
            </div>
          )}

          {step === 9 && (
            <div className="space-y-4" data-testid="afp-step-9-generate">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard label="Valuation lines" value={(data.lineItems || []).length} />
                <MetricCard label="Photos" value={(data.photoIds || []).length} />
                <MetricCard label="Documents" value={(data.supportingDocs || []).length} />
                <MetricCard label="Total due" value={fGBP(totals.totalDue)} tone="gold" />
              </div>
              <Field label="Additional notes"><textarea className={`${inputClass} min-h-[52px]`} value={data.notes} onChange={(e) => set("notes")(e.target.value)} /></Field>
              <div className="flex gap-2 flex-wrap">
                <button onClick={generatePreview} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#F0EDE8] hover:border-[#E8A020]" data-testid="afp-preview-btn"><RefreshCw size={14} /> {previewUrl ? "Refresh" : "Generate"} preview</button>
                <button onClick={saveEntry} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-60" data-testid="afp-save-btn"><Download size={16} /> {saving ? "Saving..." : "Save & Generate PDF"}</button>
              </div>
              {previewUrl && <iframe title="AFP Preview" src={previewUrl} className="w-full h-[500px] rounded-md border border-[#2a2620] bg-white" data-testid="afp-preview-iframe" />}
            </div>
          )}

          <div className="flex items-center justify-between mt-6">
            <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94] disabled:opacity-40" data-testid="afp-btn-prev"><ChevronLeft size={14} /> Back</button>
            <span className="text-xs text-[#706D66]">Step {step} of {WIZARD_STEPS.length}</span>
            <button onClick={() => setStep(Math.min(WIZARD_STEPS.length, step + 1))} disabled={step === WIZARD_STEPS.length} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-40" data-testid="afp-btn-next">Next <ChevronRight size={14} /></button>
          </div>
        </div>

        {tplModalOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="afp-template-modal">
            <div className="card-dark p-6 max-w-md w-full">
              <div className="flex items-start justify-between mb-3"><h3 className="font-display text-2xl text-[#F0EDE8]">Save as template</h3><button onClick={() => setTplModalOpen(false)} className="text-[#A19D94]"><X size={18} /></button></div>
              <Field label="Template name"><input className={inputClass} value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Standard AFP fit-out" data-testid="afp-template-name" /></Field>
              <div className="flex gap-2 mt-4"><button onClick={() => setTplModalOpen(false)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button><button onClick={saveAsTemplate} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="afp-template-save">Save</button></div>
            </div>
          </div>
        )}

        {signingOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="afp-sign-modal">
            <div className="card-dark p-5 max-w-lg w-full">
              <div className="flex items-start justify-between mb-3"><h3 className="font-display text-xl text-[#F0EDE8]">{signingOpen === "certifier" ? "Certifier signature" : "Contractor signature"}</h3><button onClick={() => setSigningOpen(null)} className="text-[#A19D94]"><X size={18} /></button></div>
              <SignaturePad value={signingOpen === "certifier" ? (data.certifierSignature || "") : (data.preparedSignature || "")} onChange={(v) => set(signingOpen === "certifier" ? "certifierSignature" : "preparedSignature")(v)} />
              <div className="flex gap-2 mt-3"><button onClick={() => setSigningOpen(null)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button><button onClick={() => setSigningOpen(null)} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="afp-sign-done">Done</button></div>
            </div>
          </div>
        )}

        {photoPickerOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="afp-photo-picker">
            <div className="card-dark p-5 max-w-3xl w-full max-h-[80vh] overflow-y-auto">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-display text-xl text-[#F0EDE8]">Attach photos from Photo Vault</h3>
                <button onClick={() => setPhotoPickerOpen(false)} className="text-[#A19D94]"><X size={18} /></button>
              </div>
              {photoVaultItems.length === 0 ? (
                <div className="text-center py-8 text-sm text-[#A19D94]">No photos in the Photo Vault{data.projectId ? " for this project" : ""} yet.</div>
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
                <button onClick={() => setPhotoPickerOpen(false)} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="afp-photo-done">Done ({(data.photoIds || []).length} selected)</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone }) {
  const t = tone === "gold" ? "text-[#E8A020]" : tone === "green" ? "text-[#68D391]" : "text-[#F0EDE8]";
  return (<div className="card-dark p-3"><Label>{label}</Label><div className={`mt-1 font-display text-2xl ${t}`}>{value}</div></div>);
}
function SummaryRow({ label, value, bold, muted }) {
  return (<div className={`flex items-center justify-between ${bold ? "text-[#F0EDE8]" : muted ? "text-[#A19D94]" : "text-[#F0EDE8]"}`}><span className="text-xs">{label}</span><span className={`text-sm ${bold ? "font-medium" : ""}`}>{value}</span></div>);
}
