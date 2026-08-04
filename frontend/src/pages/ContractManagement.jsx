// Morris — Contract Management V2 (flagship contract administration hub)
// Dashboard-first: KPI cards + filters + audit trail. 9-step wizard:
// Project → Contract Info → Details → Key Dates & Milestones → Terms →
// Link Variations & Documents → Documents → Notices & Actions → Review.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus, Search, RefreshCw, Trash2, Edit2, X, ChevronLeft, ChevronRight,
  Copy, Star, Save, FileText, AlertTriangle, Bell, Calendar as CalIcon,
  Download, PenTool, ClipboardCheck, TrendingUp, ShieldCheck, CheckCircle2, Link as LinkIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import SignaturePad from "../components/SignaturePad";
import { downloadContractPdf, contractPdfBlobUrl } from "../lib/contract-pdf";

const TOOL_ID = "contract-mgmt";
const DRAFT_KEY = "morris.tool_draft.contract-mgmt";

const WIZARD_STEPS = [
  { id: 1, key: "project",    label: "Project" },
  { id: 2, key: "identity",   label: "Contract Info" },
  { id: 3, key: "parties",    label: "Parties" },
  { id: 4, key: "dates",      label: "Dates & Milestones" },
  { id: 5, key: "terms",      label: "Terms & Financials" },
  { id: 6, key: "linked",     label: "Linked Documents" },
  { id: 7, key: "docs",       label: "Supporting Docs" },
  { id: 8, key: "notices",    label: "Notices & Actions" },
  { id: 9, key: "review",     label: "Review & PDF" },
];

const inputClass = "w-full bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none";
const Label = ({ children }) => <label className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">{children}</label>;
const Field = ({ label, children, hint }) => (
  <div><Label>{label}</Label><div className="mt-1">{children}</div>{hint && <div className="text-[11px] text-[#706D66] mt-1">{hint}</div>}</div>
);
const fGBP = (n) => `£${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

const emptyMilestone = () => ({ id: crypto.randomUUID(), name: "", description: "", plannedDate: "", actualDate: "", status: "Not Started", value: 0, notes: "" });
const emptyNotice = () => ({ id: crypto.randomUUID(), type: "General Notice", reference: "", issuedDate: new Date().toISOString().slice(0, 10), responseDueDate: "", description: "", status: "Issued", responseNote: "" });
const emptyContract = () => ({
  projectId: "", projectName: "", projectAddress: "",
  contractRef: "", title: "", contractType: "JCT Minor Works", contractNumber: "",
  employerName: "", employerCompany: "", employerAddress: "", employerContact: "", employerEmail: "", employerPhone: "",
  contractorName: "", contractorCompany: "", contractorAddress: "",
  dateOfContract: new Date().toISOString().slice(0, 10),
  startDate: "", completionDate: "", practicalCompletionDate: "", defectsLiabilityEndDate: "", finalCertificateDate: "",
  contractValue: 0, retentionPercent: 5, retentionReleaseHalfDate: "", retentionReleaseFullDate: "",
  liquidatedDamagesPerWeek: 0, liquidatedDamagesCap: 0,
  paymentTerms: "Interim monthly (valuation)", paymentDaysNet: 30, interestOnLatePaymentPct: 8,
  variationsProcedure: "All variations to be instructed in writing before work commences.",
  disputeResolution: "Adjudication under the Housing Grants, Construction & Regeneration Act 1996 (as amended).",
  governingLaw: "Laws of England & Wales",
  publicLiabilityInsurance: 2000000, employersLiabilityInsurance: 10000000, contractWorksInsurance: 0, professionalIndemnityInsurance: 0,
  scopeSummary: "", specialConditions: "", exclusions: "",
  milestones: [], notices: [],
  linkedVariationIds: [], linkedApplicationIds: [], linkedInvoiceIds: [],
  supportingDocs: [], photoIds: [],
  signedByEmployer: "", signedByEmployerDate: "", signedByContractor: "", signedByContractorDate: "", contractorSignature: "",
  status: "Draft", isFavourite: false,
});

function saveDraft(d) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ } }
function loadDraft() { try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }

const STATUS_BADGE = {
  Draft: "border-[#2a2620] text-[#A19D94]",
  "Under Review": "border-[#c8b464]/40 text-[#c8b464]",
  Active: "border-[#68D391]/40 text-[#68D391]",
  "Expiring Soon": "border-[#E8A020]/40 text-[#E8A020]",
  Completed: "border-[#68D391]/40 text-[#68D391]",
  Terminated: "border-[#F27C7C]/40 text-[#F27C7C]",
  "On Hold": "border-[#2a2620] text-[#A19D94]",
};

export default function ContractManagement() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const openParamId = params.get("open") || "";
  const projectFilter = params.get("projectId") || "";
  const [contracts, setContracts] = useState([]);
  const [stats, setStats] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [reference, setReference] = useState({ types: [], statuses: [], noticeTypes: [], milestoneStatuses: [], noticeStatuses: [], paymentTerms: [] });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterProject, setFilterProject] = useState(projectFilter);
  const [editing, setEditing] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [cRes, sRes, tRes, jRes, rRes] = await Promise.allSettled([
        api.get("/contracts/contracts"),
        api.get("/contracts/stats"),
        api.get("/contracts/templates"),
        api.get("/jobs"),
        api.get("/contracts/reference"),
      ]);
      if (cRes.status === "fulfilled") setContracts(cRes.value.data);
      if (sRes.status === "fulfilled") setStats(sRes.value.data);
      if (tRes.status === "fulfilled") setTemplates(tRes.value.data);
      if (jRes.status === "fulfilled") setJobs(jRes.value.data);
      if (rRes.status === "fulfilled") setReference(rRes.value.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (openParamId && contracts.length > 0 && !wizardOpen) {
      const c = contracts.find(x => x.id === openParamId);
      if (c) openEdit(c);
    }
  }, [openParamId, contracts]);

  const openNew = (fromTemplate = null) => {
    let base = emptyContract();
    if (fromTemplate) base = { ...base, ...(fromTemplate.payload || {}), id: undefined, status: "Draft", contractRef: "", dateOfContract: base.dateOfContract, milestones: (fromTemplate.payload?.milestones || []).map(m => ({ ...m, id: crypto.randomUUID() })), notices: [] };
    else { const d = loadDraft(); if (d && !d.id) base = { ...base, ...d, id: undefined }; }
    if (filterProject && !base.projectId) {
      const j = jobs.find(x => x.id === filterProject);
      if (j) {
        base.projectId = j.id;
        base.projectName = j.projectName || j.clientName || "";
        base.projectAddress = j.address || "";
        base.employerName = j.clientName || "";
        base.employerEmail = j.clientEmail || "";
        base.employerPhone = j.clientPhone || "";
      }
    }
    if (user?.fullName && !base.contractorName) base.contractorName = user.fullName;
    if (user?.companyName && !base.contractorCompany) base.contractorCompany = user.companyName;
    setEditing(base); setWizardOpen(true);
  };
  const openEdit = async (c) => {
    try {
      const r = await api.get(`/contracts/contracts/${c.id}`);
      setEditing({ ...emptyContract(), ...r.data });
    } catch { setEditing({ ...emptyContract(), ...c }); }
    setWizardOpen(true);
  };
  const duplicate = (c) => {
    const copy = { ...c }; delete copy.id; delete copy.createdAt; delete copy.updatedAt; delete copy._id;
    copy.status = "Draft"; copy.dateOfContract = new Date().toISOString().slice(0, 10); copy.contractRef = "";
    copy.milestones = (copy.milestones || []).map(m => ({ ...m, id: crypto.randomUUID() }));
    copy.notices = []; copy.history = []; copy.contractorSignature = "";
    copy.signedByEmployer = ""; copy.signedByEmployerDate = "";
    setEditing({ ...emptyContract(), ...copy }); setWizardOpen(true);
  };
  const deleteContract = async (c) => {
    if (!window.confirm(`Delete contract ${c.contractRef || c.title || ""}?`)) return;
    try { await api.delete(`/contracts/contracts/${c.id}`); toast.success("Deleted"); await loadAll(); }
    catch { toast.error("Delete failed"); }
  };
  const markStatus = async (c, status) => {
    try { await api.post(`/contracts/contracts/${c.id}/status`, { status }); toast.success(`Marked as ${status}`); await loadAll(); }
    catch { toast.error("Failed"); }
  };
  const toggleFav = async (c) => { try { await api.patch(`/contracts/contracts/${c.id}`, { isFavourite: !c.isFavourite }); await loadAll(); } catch { toast.error("Failed"); } };

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    return contracts.filter(c => {
      if (s) {
        const hay = `${c.title || ""} ${c.contractRef || ""} ${c.projectName || ""} ${c.employerName || ""} ${c.employerCompany || ""} ${c.contractNumber || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (filterStatus && (c.liveStatus || c.status || "Draft") !== filterStatus) return false;
      if (filterType && c.contractType !== filterType) return false;
      if (filterProject && c.projectId !== filterProject) return false;
      return true;
    });
  }, [contracts, query, filterStatus, filterType, filterProject]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="contract-management-page">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Contract Administration</div>
          <h1 className="font-display text-3xl sm:text-4xl text-[#F0EDE8]">Contract Management</h1>
          <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">The master register of every contract you&apos;re working under. Track key dates, obligations, milestones, notices and variations — all with a complete audit trail.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={loadAll} className="text-xs text-[#A19D94] hover:text-[#E8A020] flex items-center gap-1" data-testid="contract-refresh"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh</button>
          <button onClick={() => openNew()} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040]" data-testid="contract-new-btn"><Plus size={14} /> New Contract</button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Active" value={stats?.active ?? 0} tone="green" icon={CheckCircle2} testId="contract-stat-active" />
        <StatCard label="Expiring Soon" value={stats?.expiringSoon ?? 0} tone="gold" icon={AlertTriangle} testId="contract-stat-expiring" />
        <StatCard label="Under Review" value={stats?.underReview ?? 0} tone="amber" icon={ClipboardCheck} testId="contract-stat-review" />
        <StatCard label="Notices Due" value={stats?.noticesDue ?? 0} tone="red" icon={Bell} testId="contract-stat-notices" />
        <StatCard label="Milestones Overdue" value={stats?.milestonesOverdue ?? 0} tone="red" icon={CalIcon} testId="contract-stat-milestones" />
        <StatCard label="Outstanding Actions" value={stats?.outstandingActions ?? 0} tone="gold" icon={TrendingUp} testId="contract-stat-actions" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <ValueCard label="Total contracts" value={stats?.total ?? 0} sub="All statuses" testId="contract-val-total" />
        <ValueCard label="Total contract value" value={fGBP(stats?.totalContractValue || 0)} sub="Every contract on file" tone="gold" testId="contract-val-total-value" />
        <ValueCard label="Active contract value" value={fGBP(stats?.activeContractValue || 0)} sub="Active + expiring soon" tone="green" testId="contract-val-active-value" />
      </div>

      {templates.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Templates</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {templates.map(t => (
              <div key={t.id} className="card-dark p-3 flex items-start justify-between gap-2" data-testid={`contract-template-${t.id}`}>
                <button onClick={() => openNew(t)} className="text-left flex-1 min-w-0">
                  <div className="text-sm text-[#F0EDE8] truncate">{t.name}</div>
                  <div className="text-[11px] text-[#A19D94] truncate">Contract template</div>
                </button>
                <button onClick={async () => { if (!window.confirm("Delete template?")) return; try { await api.delete(`/contracts/templates/${t.id}`); setTemplates(templates.filter(x => x.id !== t.id)); } catch { toast.error("Failed"); } }} className="text-[#706D66] hover:text-[#F27C7C] p-1"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-dark p-4 mb-4" data-testid="contract-filters">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="relative md:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search contract ref, title, employer, project…" className={`${inputClass} pl-9`} data-testid="contract-search" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={inputClass} data-testid="contract-filter-status">
            <option value="">All status</option>
            {(reference.statuses || []).map(x => <option key={x} value={x}>{x}</option>)}
            <option value="Expiring Soon">Expiring Soon</option>
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={inputClass} data-testid="contract-filter-type">
            <option value="">All types</option>
            {(reference.types || []).map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className={inputClass} data-testid="contract-filter-project">
            <option value="">All projects</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.projectName || j.clientName}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card-dark p-8 text-center text-sm text-[#A19D94]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card-dark p-10 text-center" data-testid="contract-empty">
          <FileText size={28} className="mx-auto text-[#E8A020] mb-3" />
          <div className="text-base text-[#F0EDE8]">{contracts.length === 0 ? "No contracts on file yet" : "No contracts match your filters"}</div>
          <p className="text-xs text-[#A19D94] mt-2 max-w-md mx-auto">Log every contract you sign in Morris. Everything else — variations, applications, invoices, EOT claims — hangs off the contract, giving you one place to see what&apos;s owed and what&apos;s due.</p>
          <button onClick={() => openNew()} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="contract-empty-new"><Plus size={14} /> Log your first contract</button>
        </div>
      ) : (
        <div className="space-y-2">{filtered.map(c => <ContractRow key={c.id} c={c} onEdit={() => openEdit(c)} onDelete={() => deleteContract(c)} onDuplicate={() => duplicate(c)} onFav={() => toggleFav(c)} onMark={(s) => markStatus(c, s)} />)}</div>
      )}

      {wizardOpen && editing && (
        <ContractWizard initial={editing} user={user} jobs={jobs} reference={reference}
          onClose={() => { setWizardOpen(false); setEditing(null); }}
          onSaved={async () => { await loadAll(); setWizardOpen(false); setEditing(null); }}
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
      <div className="flex items-center justify-between mb-1">
        <Label>{label}</Label>
        {Icon ? <Icon size={12} className="text-[#706D66]" /> : null}
      </div>
      <div className={`mt-1 font-display text-2xl ${t}`}>{value}</div>
    </div>
  );
}
function ValueCard({ label, value, sub, tone, testId }) {
  const t = tone === "green" ? "text-[#68D391]" : tone === "gold" ? "text-[#E8A020]" : "text-[#F0EDE8]";
  return (<div className="card-dark p-4" data-testid={testId}><Label>{label}</Label><div className={`mt-2 font-display text-2xl ${t}`}>{value}</div><div className="text-[11px] text-[#A19D94] mt-1">{sub}</div></div>);
}

function ContractRow({ c, onEdit, onDelete, onDuplicate, onFav, onMark }) {
  const status = c.liveStatus || c.status || "Draft";
  const statusCls = STATUS_BADGE[status] || STATUS_BADGE.Draft;
  return (
    <div className="card-dark p-4 flex items-start gap-3" data-testid={`contract-row-${c.id}`}>
      <button onClick={onFav} className={`p-1 mt-1 ${c.isFavourite ? "text-[#E8A020]" : "text-[#706D66] hover:text-[#E8A020]"}`} aria-label="Favourite"><Star size={14} fill={c.isFavourite ? "#E8A020" : "none"} /></button>
      <button onClick={onEdit} className="text-left flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base text-[#F0EDE8] font-medium truncate">{c.title || c.projectName || "Untitled Contract"}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusCls}`}>{status}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#2a2620] text-[#A19D94]">{c.contractRef || "no ref"}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#E8A020]/40 text-[#E8A020]">{fGBP(c.contractValue || 0)}</span>
          {c.noticesDue > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#F27C7C]/40 text-[#F27C7C]">{c.noticesDue} notice{c.noticesDue > 1 ? "s" : ""} due</span>}
          {c.milestoneOverdue > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#F27C7C]/40 text-[#F27C7C]">{c.milestoneOverdue} milestone{c.milestoneOverdue > 1 ? "s" : ""} overdue</span>}
        </div>
        <div className="text-xs text-[#A19D94] mt-1 truncate">{c.employerName || c.employerCompany || "—"} · {c.contractType || "—"} · {c.projectName || "—"}{c.completionDate ? ` · Completes ${c.completionDate}` : ""}</div>
      </button>
      <div className="flex gap-1 shrink-0">
        {(status === "Draft" || status === "Under Review") && <button onClick={() => onMark("Active")} className="p-2 text-[#A19D94] hover:text-[#68D391]" title="Activate" data-testid={`contract-row-activate-${c.id}`}><CheckCircle2 size={14} /></button>}
        <button onClick={onEdit} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`contract-row-edit-${c.id}`}><Edit2 size={14} /></button>
        <button onClick={onDuplicate} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`contract-row-dup-${c.id}`}><Copy size={14} /></button>
        <button onClick={onDelete} className="p-2 text-[#A19D94] hover:text-[#F27C7C]" data-testid={`contract-row-delete-${c.id}`}><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

// ================================================================
// WIZARD
// ================================================================
function ContractWizard({ initial, user, jobs, reference, onClose, onSaved, onTemplatesChanged }) {
  const [data, setData] = useState(initial);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [signingOpen, setSigningOpen] = useState(false);
  const [milestoneDraft, setMilestoneDraft] = useState(null);
  const [noticeDraft, setNoticeDraft] = useState(null);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [availableVars, setAvailableVars] = useState([]);
  const [availableApps, setAvailableApps] = useState([]);
  const [availableInvs, setAvailableInvs] = useState([]);

  useEffect(() => { if (!data.id) { const t = setTimeout(() => saveDraft(data), 500); return () => clearTimeout(t); } }, [data]);

  const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));

  const pickProject = (id) => {
    const j = jobs.find(x => x.id === id); if (!j) return;
    setData(d => ({
      ...d, projectId: j.id,
      projectName: j.projectName || j.clientName || d.projectName,
      projectAddress: j.address || d.projectAddress,
      employerName: d.employerName || j.clientName || "",
      employerEmail: d.employerEmail || j.clientEmail || "",
      employerPhone: d.employerPhone || j.clientPhone || "",
    }));
  };

  const openLinkPicker = async () => {
    if (!data.projectId) return toast.error("Link a project first");
    try {
      const [vRes, aRes, iRes] = await Promise.allSettled([
        api.get(`/variation-orders/variation-orders?projectId=${data.projectId}`),
        api.get(`/applications-for-payment/applications?projectId=${data.projectId}`),
        api.get(`/invoice-builder/invoices?projectId=${data.projectId}`),
      ]);
      setAvailableVars(vRes.status === "fulfilled" ? vRes.value.data : []);
      setAvailableApps(aRes.status === "fulfilled" ? aRes.value.data : []);
      setAvailableInvs(iRes.status === "fulfilled" ? iRes.value.data : []);
      setLinkPickerOpen(true);
    } catch { toast.error("Could not load linked documents"); }
  };

  // Milestones
  const openMilestone = (m = null) => setMilestoneDraft(m ? { ...m } : emptyMilestone());
  const saveMilestoneDraft = async () => {
    if (!milestoneDraft) return;
    if (!milestoneDraft.name.trim()) return toast.error("Milestone name required");
    if (data.id) {
      // server side
      try {
        const isNew = !((data.milestones || []).find(m => m.id === milestoneDraft.id));
        const r = isNew
          ? await api.post(`/contracts/contracts/${data.id}/milestones`, milestoneDraft)
          : await api.patch(`/contracts/contracts/${data.id}/milestones/${milestoneDraft.id}`, milestoneDraft);
        setData(d => ({ ...d, ...r.data }));
        toast.success(isNew ? "Milestone added" : "Milestone updated");
      } catch { toast.error("Failed"); }
    } else {
      // client side (unsaved contract)
      setData(d => {
        const exists = (d.milestones || []).find(m => m.id === milestoneDraft.id);
        const milestones = exists
          ? (d.milestones || []).map(m => m.id === milestoneDraft.id ? milestoneDraft : m)
          : [...(d.milestones || []), milestoneDraft];
        return { ...d, milestones };
      });
    }
    setMilestoneDraft(null);
  };
  const deleteMilestone = async (mid) => {
    if (!window.confirm("Delete this milestone?")) return;
    if (data.id) {
      try { const r = await api.delete(`/contracts/contracts/${data.id}/milestones/${mid}`); setData(d => ({ ...d, ...r.data })); }
      catch { toast.error("Failed"); }
    } else {
      setData(d => ({ ...d, milestones: (d.milestones || []).filter(m => m.id !== mid) }));
    }
  };

  // Notices
  const openNotice = (n = null) => setNoticeDraft(n ? { ...n } : emptyNotice());
  const saveNoticeDraft = async () => {
    if (!noticeDraft) return;
    if (!noticeDraft.type) return toast.error("Notice type required");
    if (data.id) {
      try {
        const isNew = !((data.notices || []).find(n => n.id === noticeDraft.id));
        const r = isNew
          ? await api.post(`/contracts/contracts/${data.id}/notices`, noticeDraft)
          : await api.patch(`/contracts/contracts/${data.id}/notices/${noticeDraft.id}`, noticeDraft);
        setData(d => ({ ...d, ...r.data }));
        toast.success(isNew ? "Notice added" : "Notice updated");
      } catch { toast.error("Failed"); }
    } else {
      setData(d => {
        const exists = (d.notices || []).find(n => n.id === noticeDraft.id);
        const notices = exists
          ? (d.notices || []).map(n => n.id === noticeDraft.id ? noticeDraft : n)
          : [...(d.notices || []), noticeDraft];
        return { ...d, notices };
      });
    }
    setNoticeDraft(null);
  };
  const deleteNotice = async (nid) => {
    if (!window.confirm("Delete this notice?")) return;
    if (data.id) {
      try { const r = await api.delete(`/contracts/contracts/${data.id}/notices/${nid}`); setData(d => ({ ...d, ...r.data })); }
      catch { toast.error("Failed"); }
    } else {
      setData(d => ({ ...d, notices: (d.notices || []).filter(n => n.id !== nid) }));
    }
  };

  const generatePreview = () => {
    try { setPreviewUrl(contractPdfBlobUrl({ data, user, today: new Date().toLocaleDateString("en-GB") })); }
    catch { toast.error("Preview failed"); }
  };

  const saveEntry = async () => {
    if (!data.projectName && !data.projectId) { toast.error("Project is required"); setStep(1); return; }
    if (!(data.title || data.employerName || data.employerCompany)) { toast.error("Contract title or employer is required"); setStep(2); return; }
    setSaving(true);
    try {
      let saved;
      const payload = { ...data };
      delete payload.linked;
      delete payload.projectRollup;
      delete payload.liveStatus;
      delete payload.milestoneCount;
      delete payload.milestoneOverdue;
      delete payload.noticeCount;
      delete payload.noticesDue;
      delete payload.history;
      if (data.id) { const r = await api.patch(`/contracts/contracts/${data.id}`, payload); saved = r.data; }
      else { const r = await api.post("/contracts/contracts", payload); saved = r.data; }
      try {
        await api.post("/documents/save", {
          title: `Contract — ${data.title || data.projectName || data.employerName || "Untitled"}`,
          toolId: TOOL_ID, refNumber: saved.contractRef, jobId: data.projectId || null,
          content: `CONTRACT ${saved.contractRef}\n${saved.title || ""}\n${saved.projectName || ""}\nEmployer: ${saved.employerName || saved.employerCompany || "—"}\nType: ${saved.contractType}\nValue: ${fGBP(saved.contractValue || 0)}\nStatus: ${saved.status}`,
          metadata: { ...saved },
        });
      } catch { /* soft-fail */ }
      downloadContractPdf({ data: saved, user, today: new Date().toLocaleDateString("en-GB") });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      toast.success("Contract saved");
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  const saveAsTemplate = async () => {
    if (!tplName.trim()) return toast.error("Template name required");
    try {
      const payload = { ...data, id: undefined, contractRef: undefined, dateOfContract: undefined, status: "Draft", milestones: (data.milestones || []).map(m => ({ ...m, actualDate: "", status: "Not Started" })), notices: [], contractorSignature: "", signedByEmployer: "", signedByEmployerDate: "", history: undefined };
      delete payload.linked; delete payload.projectRollup; delete payload.liveStatus;
      await api.post("/contracts/templates", { name: tplName.trim(), payload });
      toast.success("Template saved");
      setTplModalOpen(false); setTplName("");
      const lst = await api.get("/contracts/templates"); onTemplatesChanged(lst.data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const toggleLink = (kind, id) => {
    const key = { variation: "linkedVariationIds", application: "linkedApplicationIds", invoice: "linkedInvoiceIds" }[kind];
    setData(d => {
      const list = new Set(d[key] || []);
      if (list.has(id)) list.delete(id); else list.add(id);
      return { ...d, [key]: Array.from(list) };
    });
  };

  const totals = useMemo(() => {
    const retention = ((Number(data.contractValue) || 0) * (Number(data.retentionPercent) || 0)) / 100;
    return { retentionValue: retention };
  }, [data.contractValue, data.retentionPercent]);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-y-auto" data-testid="contract-wizard">
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-5xl mx-auto card-dark p-5 md:p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-1">{data.id ? "Edit" : "New"} Contract</div>
              <h2 className="font-display text-2xl text-[#F0EDE8]">{data.title || data.projectName || "Untitled"} <span className="text-sm text-[#A19D94]">· {fGBP(data.contractValue || 0)}</span></h2>
            </div>
            <button onClick={onClose} className="text-[#A19D94] hover:text-[#F0EDE8]" data-testid="contract-wizard-close"><X size={20} /></button>
          </div>

          <div className="flex justify-end mb-3">
            <button onClick={() => setTplModalOpen(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="contract-save-template-btn"><Save size={12} /> Save as template</button>
          </div>

          <div className="overflow-x-auto mb-5" data-testid="contract-stepper">
            <div className="flex gap-1 min-w-max">
              {WIZARD_STEPS.map(s => (
                <button key={s.id} onClick={() => setStep(s.id)} data-testid={`contract-step-${s.id}`}
                  className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${step === s.id ? "bg-[#E8A020] text-black" : step > s.id ? "bg-[#1e1a12] text-[#68D391] border border-[#68D391]/30" : "bg-[#0f0d09] text-[#A19D94] border border-[#2a2620]"}`}>
                  {s.id}. {s.label}
                </button>
              ))}
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-4" data-testid="contract-step-1-project">
              {jobs.length > 0 && (
                <Field label="Link to project (required)">
                  <select value={data.projectId} onChange={(e) => pickProject(e.target.value)} className={inputClass} data-testid="contract-link-project">
                    <option value="">Select a project</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.projectName || j.clientName}</option>)}
                  </select>
                </Field>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Project name"><input className={inputClass} value={data.projectName} onChange={(e) => set("projectName")(e.target.value)} data-testid="contract-projectName" /></Field>
                <Field label="Site address"><textarea className={`${inputClass} min-h-[52px]`} value={data.projectAddress} onChange={(e) => set("projectAddress")(e.target.value)} data-testid="contract-projectAddress" /></Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4" data-testid="contract-step-2-identity">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Contract title"><input className={inputClass} value={data.title} onChange={(e) => set("title")(e.target.value)} placeholder="e.g. Kitchen extension, 12 Elm Grove" data-testid="contract-title" /></Field>
                <Field label="Client&apos;s contract number (optional)"><input className={inputClass} value={data.contractNumber} onChange={(e) => set("contractNumber")(e.target.value)} /></Field>
                <Field label="Contract type">
                  <select className={inputClass} value={data.contractType} onChange={(e) => set("contractType")(e.target.value)} data-testid="contract-type">
                    {(reference.types || []).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select className={inputClass} value={data.status} onChange={(e) => set("status")(e.target.value)} data-testid="contract-status">
                    {(reference.statuses || []).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Date of contract"><input type="date" className={inputClass} value={data.dateOfContract} onChange={(e) => set("dateOfContract")(e.target.value)} data-testid="contract-date" /></Field>
                <Field label="Scope of works"><textarea className={`${inputClass} min-h-[60px]`} value={data.scopeSummary} onChange={(e) => set("scopeSummary")(e.target.value)} placeholder="Summarise what's included in the works…" /></Field>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4" data-testid="contract-step-3-parties">
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-1">Employer / Client</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Company / organisation"><input className={inputClass} value={data.employerCompany} onChange={(e) => set("employerCompany")(e.target.value)} data-testid="contract-employerCompany" /></Field>
                <Field label="Individual name"><input className={inputClass} value={data.employerName} onChange={(e) => set("employerName")(e.target.value)} data-testid="contract-employerName" /></Field>
                <Field label="Contact person"><input className={inputClass} value={data.employerContact} onChange={(e) => set("employerContact")(e.target.value)} /></Field>
                <Field label="Email"><input type="email" className={inputClass} value={data.employerEmail} onChange={(e) => set("employerEmail")(e.target.value)} /></Field>
                <Field label="Phone"><input className={inputClass} value={data.employerPhone} onChange={(e) => set("employerPhone")(e.target.value)} /></Field>
                <div className="md:col-span-2"><Field label="Address"><textarea className={`${inputClass} min-h-[60px]`} value={data.employerAddress} onChange={(e) => set("employerAddress")(e.target.value)} /></Field></div>
              </div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-1 mt-4">Contractor (you)</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Company"><input className={inputClass} value={data.contractorCompany} onChange={(e) => set("contractorCompany")(e.target.value)} /></Field>
                <Field label="Signatory"><input className={inputClass} value={data.contractorName} onChange={(e) => set("contractorName")(e.target.value)} /></Field>
                <div className="md:col-span-2"><Field label="Address"><textarea className={`${inputClass} min-h-[60px]`} value={data.contractorAddress} onChange={(e) => set("contractorAddress")(e.target.value)} /></Field></div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4" data-testid="contract-step-4-dates">
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020]">Key dates</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Start on site"><input type="date" className={inputClass} value={data.startDate} onChange={(e) => set("startDate")(e.target.value)} data-testid="contract-startDate" /></Field>
                <Field label="Contract completion"><input type="date" className={inputClass} value={data.completionDate} onChange={(e) => set("completionDate")(e.target.value)} data-testid="contract-completionDate" /></Field>
                <Field label="Practical completion"><input type="date" className={inputClass} value={data.practicalCompletionDate} onChange={(e) => set("practicalCompletionDate")(e.target.value)} /></Field>
                <Field label="Defects liability ends"><input type="date" className={inputClass} value={data.defectsLiabilityEndDate} onChange={(e) => set("defectsLiabilityEndDate")(e.target.value)} /></Field>
                <Field label="Final certificate"><input type="date" className={inputClass} value={data.finalCertificateDate} onChange={(e) => set("finalCertificateDate")(e.target.value)} /></Field>
              </div>

              <div className="flex items-center justify-between mt-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Milestones · {(data.milestones || []).length}</div>
                <button onClick={() => openMilestone()} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#E8A020] text-black text-xs font-medium" data-testid="contract-add-milestone"><Plus size={12} /> Add milestone</button>
              </div>
              {(data.milestones || []).length === 0 ? (
                <div className="card-dark p-4 text-center text-sm text-[#A19D94]">No milestones yet.</div>
              ) : (
                <div className="space-y-2">
                  {(data.milestones || []).map(m => (
                    <div key={m.id} className="card-dark p-3 flex items-start gap-3" data-testid={`contract-milestone-row-${m.id}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-[#F0EDE8] font-medium truncate">{m.name || "Milestone"}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#2a2620] text-[#A19D94]">{m.status || "Not Started"}</span>
                          {Number(m.value) > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#E8A020]/40 text-[#E8A020]">{fGBP(m.value)}</span>}
                        </div>
                        <div className="text-[11px] text-[#A19D94] mt-1 truncate">Planned {m.plannedDate || "—"}{m.actualDate ? ` · Actual ${m.actualDate}` : ""}{m.description ? ` · ${m.description}` : ""}</div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => openMilestone(m)} className="p-2 text-[#A19D94] hover:text-[#E8A020]"><Edit2 size={14} /></button>
                        <button onClick={() => deleteMilestone(m.id)} className="p-2 text-[#A19D94] hover:text-[#F27C7C]"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4" data-testid="contract-step-5-terms">
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020]">Financials</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Contract value (£)"><input type="number" step="0.01" className={inputClass} value={data.contractValue} onChange={(e) => set("contractValue")(Number(e.target.value))} data-testid="contract-value" /></Field>
                <Field label="Retention %"><input type="number" step="0.5" className={inputClass} value={data.retentionPercent} onChange={(e) => set("retentionPercent")(Number(e.target.value))} data-testid="contract-retention" /></Field>
                <div><Label>Retention held (£)</Label><div className="text-lg text-[#E8A020] mt-1">{fGBP(totals.retentionValue)}</div></div>
                <Field label="Half retention release date"><input type="date" className={inputClass} value={data.retentionReleaseHalfDate} onChange={(e) => set("retentionReleaseHalfDate")(e.target.value)} /></Field>
                <Field label="Full retention release date"><input type="date" className={inputClass} value={data.retentionReleaseFullDate} onChange={(e) => set("retentionReleaseFullDate")(e.target.value)} /></Field>
                <Field label="LDs per week (£)"><input type="number" step="0.01" className={inputClass} value={data.liquidatedDamagesPerWeek} onChange={(e) => set("liquidatedDamagesPerWeek")(Number(e.target.value))} /></Field>
                <Field label="LD cap (£)"><input type="number" step="0.01" className={inputClass} value={data.liquidatedDamagesCap} onChange={(e) => set("liquidatedDamagesCap")(Number(e.target.value))} /></Field>
              </div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mt-4">Payment & terms</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Payment structure">
                  <select className={inputClass} value={data.paymentTerms} onChange={(e) => set("paymentTerms")(e.target.value)} data-testid="contract-paymentTerms">
                    {(reference.paymentTerms || []).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Net days"><input type="number" className={inputClass} value={data.paymentDaysNet} onChange={(e) => set("paymentDaysNet")(Number(e.target.value))} /></Field>
                <Field label="Late payment interest % p.a."><input type="number" step="0.1" className={inputClass} value={data.interestOnLatePaymentPct} onChange={(e) => set("interestOnLatePaymentPct")(Number(e.target.value))} /></Field>
                <div className="md:col-span-3"><Field label="Variations procedure"><textarea className={`${inputClass} min-h-[60px]`} value={data.variationsProcedure} onChange={(e) => set("variationsProcedure")(e.target.value)} /></Field></div>
                <div className="md:col-span-2"><Field label="Dispute resolution"><textarea className={`${inputClass} min-h-[60px]`} value={data.disputeResolution} onChange={(e) => set("disputeResolution")(e.target.value)} /></Field></div>
                <Field label="Governing law"><input className={inputClass} value={data.governingLaw} onChange={(e) => set("governingLaw")(e.target.value)} /></Field>
              </div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mt-4">Insurance</div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Field label="Public liability (£)"><input type="number" className={inputClass} value={data.publicLiabilityInsurance} onChange={(e) => set("publicLiabilityInsurance")(Number(e.target.value))} /></Field>
                <Field label="Employer&apos;s liability (£)"><input type="number" className={inputClass} value={data.employersLiabilityInsurance} onChange={(e) => set("employersLiabilityInsurance")(Number(e.target.value))} /></Field>
                <Field label="Contract works (£)"><input type="number" className={inputClass} value={data.contractWorksInsurance} onChange={(e) => set("contractWorksInsurance")(Number(e.target.value))} /></Field>
                <Field label="Professional indemnity (£)"><input type="number" className={inputClass} value={data.professionalIndemnityInsurance} onChange={(e) => set("professionalIndemnityInsurance")(Number(e.target.value))} /></Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                <Field label="Special conditions"><textarea className={`${inputClass} min-h-[60px]`} value={data.specialConditions} onChange={(e) => set("specialConditions")(e.target.value)} /></Field>
                <Field label="Exclusions"><textarea className={`${inputClass} min-h-[60px]`} value={data.exclusions} onChange={(e) => set("exclusions")(e.target.value)} /></Field>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4" data-testid="contract-step-6-linked">
              <div className="card-dark p-4 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">Link approved Variations, Applications for Payment and Invoices from this project so they flow into the Contract Summary PDF and Commercial Reports.</div>
              <button onClick={openLinkPicker} disabled={!data.projectId} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-40" data-testid="contract-open-link-picker"><LinkIcon size={14} /> Link project documents</button>
              {!data.projectId && <div className="text-[11px] text-[#706D66]">Link a project on step 1 first.</div>}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                <div className="card-dark p-3"><Label>Variations linked</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.linkedVariationIds || []).length}</div></div>
                <div className="card-dark p-3"><Label>Applications linked</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.linkedApplicationIds || []).length}</div></div>
                <div className="card-dark p-3"><Label>Invoices linked</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.linkedInvoiceIds || []).length}</div></div>
              </div>
              {(data.linked?.variations || []).length + (data.linked?.applications || []).length + (data.linked?.invoices || []).length > 0 && (
                <div className="mt-3 space-y-2 text-xs text-[#A19D94]">
                  {(data.linked?.variations || []).map(v => <div key={v.id}>VO {v.varRef} — {v.title} · {v.status}</div>)}
                  {(data.linked?.applications || []).map(a => <div key={a.id}>AFP {a.appRef} — {a.period} · {a.status}</div>)}
                  {(data.linked?.invoices || []).map(i => <div key={i.id}>INV {i.invoiceRef} — {fGBP((i.totals || {}).total || 0)} · {i.status}</div>)}
                </div>
              )}
            </div>
          )}

          {step === 7 && (
            <div className="space-y-4" data-testid="contract-step-7-docs">
              <div className="card-dark p-4 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">Add supporting documents by name and URL. Upload the actual contract PDF, drawings, schedules of work etc. to the Document Library and link them here.</div>
              <SupportingDocsEditor value={data.supportingDocs || []} onChange={(v) => set("supportingDocs")(v)} />
            </div>
          )}

          {step === 8 && (
            <div className="space-y-4" data-testid="contract-step-8-notices">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Notices & actions · {(data.notices || []).length}</div>
                <button onClick={() => openNotice()} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#E8A020] text-black text-xs font-medium" data-testid="contract-add-notice"><Plus size={12} /> Log notice</button>
              </div>
              {(data.notices || []).length === 0 ? (
                <div className="card-dark p-4 text-center text-sm text-[#A19D94]">No notices logged.</div>
              ) : (
                <div className="space-y-2">
                  {(data.notices || []).map(n => (
                    <div key={n.id} className="card-dark p-3 flex items-start gap-3" data-testid={`contract-notice-row-${n.id}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-[#F0EDE8] font-medium truncate">{n.type}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#2a2620] text-[#A19D94]">{n.status || "Issued"}</span>
                          {n.reference && <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#2a2620] text-[#A19D94]">Ref {n.reference}</span>}
                        </div>
                        <div className="text-[11px] text-[#A19D94] mt-1 truncate">Issued {n.issuedDate || "—"}{n.responseDueDate ? ` · Due ${n.responseDueDate}` : ""}{n.description ? ` · ${n.description}` : ""}</div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => openNotice(n)} className="p-2 text-[#A19D94] hover:text-[#E8A020]"><Edit2 size={14} /></button>
                        <button onClick={() => deleteNotice(n.id)} className="p-2 text-[#A19D94] hover:text-[#F27C7C]"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 9 && (
            <div className="space-y-4" data-testid="contract-step-9-review">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="card-dark p-3"><Label>Milestones</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.milestones || []).length}</div></div>
                <div className="card-dark p-3"><Label>Notices</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.notices || []).length}</div></div>
                <div className="card-dark p-3"><Label>Linked variations</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.linkedVariationIds || []).length}</div></div>
                <div className="card-dark p-3"><Label>Contract value</Label><div className="text-2xl text-[#E8A020] mt-1">{fGBP(data.contractValue || 0)}</div></div>
              </div>
              <div className="card-dark p-4">
                <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-3">Signatures</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Signed for Employer"><input className={inputClass} value={data.signedByEmployer} onChange={(e) => set("signedByEmployer")(e.target.value)} data-testid="contract-signedEmployer" /></Field>
                  <Field label="Employer signed date"><input type="date" className={inputClass} value={data.signedByEmployerDate} onChange={(e) => set("signedByEmployerDate")(e.target.value)} /></Field>
                  <Field label="Signed for Contractor"><input className={inputClass} value={data.signedByContractor || user?.fullName || ""} onChange={(e) => set("signedByContractor")(e.target.value)} data-testid="contract-signedContractor" /></Field>
                  <Field label="Contractor signed date"><input type="date" className={inputClass} value={data.signedByContractorDate} onChange={(e) => set("signedByContractorDate")(e.target.value)} /></Field>
                  <div className="md:col-span-2">
                    <Label>Contractor signature</Label>
                    <div className="mt-1 flex items-center gap-3">
                      {data.contractorSignature ? <img alt="Signature" src={data.contractorSignature} className="h-12 w-40 rounded-md border border-[#2a2620] bg-white" /> : <div className="h-12 w-40 rounded-md border border-dashed border-[#2a2620] flex items-center justify-center text-[10px] text-[#706D66]">Not signed</div>}
                      <button onClick={() => setSigningOpen(true)} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="contract-sign"><PenTool size={12} /> {data.contractorSignature ? "Re-sign" : "Sign"}</button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={generatePreview} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#F0EDE8] hover:border-[#E8A020]" data-testid="contract-preview-btn"><RefreshCw size={14} /> {previewUrl ? "Refresh" : "Generate"} preview</button>
                <button onClick={saveEntry} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-60" data-testid="contract-save-btn"><Download size={16} /> {saving ? "Saving..." : "Save & Generate PDF"}</button>
              </div>
              {previewUrl && <iframe title="Contract Preview" src={previewUrl} className="w-full h-[500px] rounded-md border border-[#2a2620] bg-white" data-testid="contract-preview-iframe" />}
            </div>
          )}

          <div className="flex items-center justify-between mt-6">
            <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94] disabled:opacity-40" data-testid="contract-btn-prev"><ChevronLeft size={14} /> Back</button>
            <span className="text-xs text-[#706D66]">Step {step} of {WIZARD_STEPS.length}</span>
            <button onClick={() => setStep(Math.min(WIZARD_STEPS.length, step + 1))} disabled={step === WIZARD_STEPS.length} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-40" data-testid="contract-btn-next">Next <ChevronRight size={14} /></button>
          </div>
        </div>

        {tplModalOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="contract-template-modal">
            <div className="card-dark p-6 max-w-md w-full">
              <div className="flex items-start justify-between mb-3"><h3 className="font-display text-2xl text-[#F0EDE8]">Save as template</h3><button onClick={() => setTplModalOpen(false)} className="text-[#A19D94]"><X size={18} /></button></div>
              <Field label="Template name"><input className={inputClass} value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Standard JCT Minor Works" data-testid="contract-template-name" /></Field>
              <div className="flex gap-2 mt-4"><button onClick={() => setTplModalOpen(false)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button><button onClick={saveAsTemplate} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="contract-template-save">Save</button></div>
            </div>
          </div>
        )}

        {signingOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="contract-sign-modal">
            <div className="card-dark p-5 max-w-lg w-full">
              <div className="flex items-start justify-between mb-3"><h3 className="font-display text-xl text-[#F0EDE8]">Contractor signature</h3><button onClick={() => setSigningOpen(false)} className="text-[#A19D94]"><X size={18} /></button></div>
              <SignaturePad value={data.contractorSignature || ""} onChange={(v) => set("contractorSignature")(v)} />
              <div className="flex gap-2 mt-3"><button onClick={() => setSigningOpen(false)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button><button onClick={() => setSigningOpen(false)} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="contract-sign-done">Done</button></div>
            </div>
          </div>
        )}

        {milestoneDraft && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="contract-milestone-modal">
            <div className="card-dark p-5 max-w-xl w-full">
              <div className="flex items-start justify-between mb-3"><h3 className="font-display text-xl text-[#F0EDE8]">{milestoneDraft?.createdAt ? "Edit" : "Add"} milestone</h3><button onClick={() => setMilestoneDraft(null)} className="text-[#A19D94]"><X size={18} /></button></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2"><Field label="Name"><input className={inputClass} value={milestoneDraft.name} onChange={(e) => setMilestoneDraft({ ...milestoneDraft, name: e.target.value })} data-testid="contract-milestone-name" /></Field></div>
                <Field label="Planned date"><input type="date" className={inputClass} value={milestoneDraft.plannedDate} onChange={(e) => setMilestoneDraft({ ...milestoneDraft, plannedDate: e.target.value })} data-testid="contract-milestone-planned" /></Field>
                <Field label="Actual date"><input type="date" className={inputClass} value={milestoneDraft.actualDate} onChange={(e) => setMilestoneDraft({ ...milestoneDraft, actualDate: e.target.value })} /></Field>
                <Field label="Status">
                  <select className={inputClass} value={milestoneDraft.status} onChange={(e) => setMilestoneDraft({ ...milestoneDraft, status: e.target.value })} data-testid="contract-milestone-status">
                    {(reference.milestoneStatuses || []).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Value (£)"><input type="number" step="0.01" className={inputClass} value={milestoneDraft.value} onChange={(e) => setMilestoneDraft({ ...milestoneDraft, value: Number(e.target.value) })} /></Field>
                <div className="md:col-span-2"><Field label="Description"><textarea className={`${inputClass} min-h-[60px]`} value={milestoneDraft.description} onChange={(e) => setMilestoneDraft({ ...milestoneDraft, description: e.target.value })} /></Field></div>
              </div>
              <div className="flex gap-2 mt-3"><button onClick={() => setMilestoneDraft(null)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button><button onClick={saveMilestoneDraft} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="contract-milestone-save">Save milestone</button></div>
            </div>
          </div>
        )}

        {noticeDraft && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="contract-notice-modal">
            <div className="card-dark p-5 max-w-xl w-full">
              <div className="flex items-start justify-between mb-3"><h3 className="font-display text-xl text-[#F0EDE8]">{noticeDraft?.createdAt ? "Edit" : "Log"} notice</h3><button onClick={() => setNoticeDraft(null)} className="text-[#A19D94]"><X size={18} /></button></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Type">
                  <select className={inputClass} value={noticeDraft.type} onChange={(e) => setNoticeDraft({ ...noticeDraft, type: e.target.value })} data-testid="contract-notice-type">
                    {(reference.noticeTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Reference (optional)"><input className={inputClass} value={noticeDraft.reference} onChange={(e) => setNoticeDraft({ ...noticeDraft, reference: e.target.value })} /></Field>
                <Field label="Issued date"><input type="date" className={inputClass} value={noticeDraft.issuedDate} onChange={(e) => setNoticeDraft({ ...noticeDraft, issuedDate: e.target.value })} data-testid="contract-notice-issued" /></Field>
                <Field label="Response due"><input type="date" className={inputClass} value={noticeDraft.responseDueDate} onChange={(e) => setNoticeDraft({ ...noticeDraft, responseDueDate: e.target.value })} data-testid="contract-notice-due" /></Field>
                <Field label="Status">
                  <select className={inputClass} value={noticeDraft.status} onChange={(e) => setNoticeDraft({ ...noticeDraft, status: e.target.value })}>
                    {(reference.noticeStatuses || []).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <div className="md:col-span-2"><Field label="Description"><textarea className={`${inputClass} min-h-[80px]`} value={noticeDraft.description} onChange={(e) => setNoticeDraft({ ...noticeDraft, description: e.target.value })} /></Field></div>
                <div className="md:col-span-2"><Field label="Response note (once actioned)"><textarea className={`${inputClass} min-h-[60px]`} value={noticeDraft.responseNote} onChange={(e) => setNoticeDraft({ ...noticeDraft, responseNote: e.target.value })} /></Field></div>
              </div>
              <div className="flex gap-2 mt-3"><button onClick={() => setNoticeDraft(null)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button><button onClick={saveNoticeDraft} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="contract-notice-save">Save notice</button></div>
            </div>
          </div>
        )}

        {linkPickerOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="contract-link-modal">
            <div className="card-dark p-5 max-w-3xl w-full max-h-[85vh] overflow-y-auto">
              <div className="flex items-start justify-between mb-3"><h3 className="font-display text-xl text-[#F0EDE8]">Link project documents</h3><button onClick={() => setLinkPickerOpen(false)} className="text-[#A19D94]"><X size={18} /></button></div>
              <LinkList title="Variations" items={availableVars} selected={data.linkedVariationIds || []} onToggle={(id) => toggleLink("variation", id)} render={(v) => `${v.varRef || ""} — ${v.title || "—"} · ${v.status || ""}`} />
              <LinkList title="Applications for Payment" items={availableApps} selected={data.linkedApplicationIds || []} onToggle={(id) => toggleLink("application", id)} render={(a) => `${a.appRef || ""} — ${a.period || ""} · ${a.status || ""}`} />
              <LinkList title="Invoices" items={availableInvs} selected={data.linkedInvoiceIds || []} onToggle={(id) => toggleLink("invoice", id)} render={(i) => `${i.invoiceRef || ""} — ${fGBP((i.totals || {}).total || 0)} · ${i.status || ""}`} />
              <div className="flex gap-2 mt-4"><button onClick={() => setLinkPickerOpen(false)} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="contract-link-done">Done</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LinkList({ title, items, selected, onToggle, render }) {
  const s = new Set(selected);
  return (
    <div className="mb-4">
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020] mb-2">{title} · {items.length}</div>
      {items.length === 0 ? <div className="text-xs text-[#706D66]">None found on this project.</div> : (
        <div className="space-y-1">
          {items.map(it => (
            <label key={it.id} className="card-dark p-2 flex items-center gap-2 text-xs text-[#F0EDE8] cursor-pointer">
              <input type="checkbox" checked={s.has(it.id)} onChange={() => onToggle(it.id)} className="accent-[#E8A020]" />
              <span className="truncate">{render(it)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function SupportingDocsEditor({ value, onChange }) {
  const list = value || [];
  const add = () => onChange([...list, { id: crypto.randomUUID(), name: "", url: "", kind: "" }]);
  const upd = (id, patch) => onChange(list.map(x => x.id === id ? { ...x, ...patch } : x));
  const del = (id) => onChange(list.filter(x => x.id !== id));
  return (
    <div className="space-y-2">
      {list.length === 0 && <div className="card-dark p-4 text-center text-sm text-[#A19D94]">No documents linked.</div>}
      {list.map(d => (
        <div key={d.id} className="card-dark p-3 grid grid-cols-1 md:grid-cols-4 gap-2 items-end" data-testid={`contract-doc-row-${d.id}`}>
          <Field label="Name"><input className={inputClass} value={d.name} onChange={(e) => upd(d.id, { name: e.target.value })} /></Field>
          <Field label="Kind (e.g. Drawing, Schedule)"><input className={inputClass} value={d.kind} onChange={(e) => upd(d.id, { kind: e.target.value })} /></Field>
          <div className="md:col-span-2"><Field label="URL"><input className={inputClass} value={d.url} onChange={(e) => upd(d.id, { url: e.target.value })} /></Field></div>
          <button onClick={() => del(d.id)} className="col-span-full md:col-auto justify-self-end text-[#A19D94] hover:text-[#F27C7C] text-xs inline-flex items-center gap-1"><Trash2 size={12} /> Remove</button>
        </div>
      ))}
      <button onClick={add} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="contract-doc-add"><Plus size={12} /> Add document</button>
    </div>
  );
}
