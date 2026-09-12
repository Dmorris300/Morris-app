// Morris — Invoice Builder V2 (flagship invoicing system)
// Dashboard-first: 6 status stat cards + 3 KPI cards + templates + filters.
// 8-step wizard: Project & Client → Link AFP/Variation → Items → CIS/VAT
//   → Terms & Due Date → Review & Bank → Status & Payments → Preview & PDF

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus, Search, RefreshCw, Trash2, Edit2, X, ChevronLeft, ChevronRight,
  Download, PenTool, Copy, Star, Save, CheckCircle2, AlertTriangle,
  Receipt, Send, Link as LinkIcon, PoundSterling, Bell,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import SignaturePad from "../components/SignaturePad";
import { downloadInvoicePdf, invoicePdfBlobUrl } from "../lib/invoice-pdf";

const TOOL_ID = "invoice-builder";
const DRAFT_KEY = "morris.tool_draft.invoice-builder";

const WIZARD_STEPS = [
  { id: 1, key: "client",   label: "Project & Client" },
  { id: 2, key: "link",     label: "Link Source" },
  { id: 3, key: "items",    label: "Line Items" },
  { id: 4, key: "money",    label: "CIS & VAT" },
  { id: 5, key: "terms",    label: "Terms & Due Date" },
  { id: 6, key: "review",   label: "Review & Bank" },
  { id: 7, key: "status",   label: "Status & Payments" },
  { id: 8, key: "generate", label: "Preview & PDF" },
];

const CATEGORIES = ["Labour", "Materials", "Plant & Equipment", "Preliminaries", "Subcontractor", "Variations", "Application for Payment", "Other"];
const UNITS = ["item", "hour", "day", "week", "m", "m²", "m³", "tonne", "kg", "each", "set", "load"];
const VAT_TREATMENTS = ["Standard 20%", "Reduced 5%", "Zero-rated", "Reverse charge (0%)", "Exempt"];
const CIS_STATUSES = ["Not applicable", "Gross (0%)", "Standard (20%)", "Higher (30%)"];
const STATUSES = ["Draft", "Sent", "Part Paid", "Paid", "Overdue", "Cancelled"];
const PAYMENT_TERMS = ["Net 7", "Net 14", "Net 30", "Net 45", "Net 60", "Due on receipt", "Custom"];

const inputClass = "w-full bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none";
const Label = ({ children }) => <label className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">{children}</label>;
const Field = ({ label, children, hint }) => (
  <div><Label>{label}</Label><div className="mt-1">{children}</div>{hint && <div className="text-[11px] text-[#706D66] mt-1">{hint}</div>}</div>
);
const fGBP = (n) => `£${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

const emptyLine = () => ({ id: crypto.randomUUID(), category: "Labour", description: "", qty: 1, unit: "item", unitPrice: 0 });
const emptyInvoice = () => ({
  projectId: "", projectName: "", projectAddress: "",
  clientName: "", clientCompany: "", clientEmail: "", clientPhone: "", clientAddress: "",
  clientVatNumber: "", clientUtr: "",
  linkedApplicationId: "", linkedApplicationRef: "",
  linkedVariationId: "", linkedVariationRef: "",
  linkedQuoteId: "", linkedQuoteRef: "",
  invoiceRef: "",
  invoiceDate: new Date().toISOString().slice(0, 10),
  dueDate: "", paymentTerms: "Net 30",
  paymentTermsNote: "Payment due within 30 days of invoice date. Interest may be charged under the Late Payment of Commercial Debts (Interest) Act 1998.",
  poNumber: "", status: "Draft",
  lineItems: [emptyLine()],
  discount: 0,
  cisStatus: "Not applicable",
  vatTreatment: "Standard 20%",
  bankName: "", bankAccountName: "", bankAccountNumber: "", bankSortCode: "", bankIban: "", bankReference: "",
  notes: "",
  payments: [],
  supportingDocs: [], photoIds: [],
  preparedBy: "", preparedSignature: "",
  isFavourite: false,
});

function saveDraft(d) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ } }
function loadDraft() { try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }

function computeTotals(data) {
  const items = data.lineItems || [];
  let subtotal = 0; let labour = 0; const byCat = {};
  const labourCats = new Set(["Labour", "Subcontractor"]);
  items.forEach(it => {
    const line = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
    byCat[it.category] = (byCat[it.category] || 0) + line;
    subtotal += line;
    if (labourCats.has(it.category)) labour += line;
  });
  const discount = Number(data.discount) || 0;
  const subAfter = subtotal - discount;
  const cisMap = { "Not applicable": 0, "Gross (0%)": 0, "Standard (20%)": 20, "Higher (30%)": 30 };
  const cisRate = cisMap[data.cisStatus] || 0;
  const labourRatio = subtotal > 0 ? labour / subtotal : 0;
  const cisApplicable = data.cisStatus !== "Not applicable" ? Math.max(0, subAfter) * labourRatio : 0;
  const cisDeduction = cisApplicable * cisRate / 100;
  const vatMap = { "Standard 20%": 20, "Reduced 5%": 5, "Zero-rated": 0, "Reverse charge (0%)": 0, "Exempt": 0 };
  const vatRate = vatMap[data.vatTreatment] || 0;
  const vatAmount = Math.max(0, subAfter - cisDeduction) * vatRate / 100;
  const totalDue = subAfter - cisDeduction + vatAmount;
  return {
    subtotal, byCategory: byCat, discount, subtotalAfterDiscount: subAfter,
    labourValuation: labour, labourRatio,
    cisStatus: data.cisStatus, cisRate, cisApplicable, cisDeduction,
    vatTreatment: data.vatTreatment, vatRate, vatAmount, totalDue,
  };
}

const STATUS_BADGE = {
  Draft: "border-[#2a2620] text-[#A19D94]",
  Sent: "border-[#E8A020]/40 text-[#E8A020]",
  "Part Paid": "border-[#A0A0F0]/40 text-[#A0A0F0]",
  Paid: "border-[#68D391]/40 text-[#68D391]",
  Overdue: "border-[#F27C7C]/40 text-[#F27C7C]",
  Cancelled: "border-[#706D66]/40 text-[#706D66]",
};

export default function InvoiceBuilder() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const openParamId = params.get("open") || "";
  const projectFilterInit = params.get("projectId") || "";
  const fromApp = params.get("fromApplication") || "";
  const fromVar = params.get("fromVariation") || "";
  const [invoices, setInvoices] = useState([]);
  const [stats, setStats] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [variations, setVariations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterProject, setFilterProject] = useState(projectFilterInit);
  const [editing, setEditing] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [iRes, sRes, tRes, jRes, aRes, vRes] = await Promise.allSettled([
        api.get("/invoice-builder/invoices"),
        api.get("/invoice-builder/stats"),
        api.get("/invoice-builder/templates"),
        api.get("/jobs"),
        api.get("/applications-for-payment/applications"),
        api.get("/variation-orders/variation-orders"),
      ]);
      if (iRes.status === "fulfilled") setInvoices(iRes.value.data);
      if (sRes.status === "fulfilled") setStats(sRes.value.data);
      if (tRes.status === "fulfilled") setTemplates(tRes.value.data);
      if (jRes.status === "fulfilled") setJobs(jRes.value.data);
      if (aRes.status === "fulfilled") setApplications(aRes.value.data);
      if (vRes.status === "fulfilled") setVariations(vRes.value.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (openParamId && invoices.length > 0 && !wizardOpen) {
      const inv = invoices.find(x => x.id === openParamId); if (inv) openEdit(inv);
    }
  }, [openParamId, invoices]);   
  useEffect(() => {
    // Deep-link "Create invoice from AFP/Variation"
    if (fromApp && !wizardOpen) {
      (async () => {
        try { const r = await api.get(`/invoice-builder/from-application/${fromApp}`); openNewFrom(r.data); }
        catch { toast.error("Could not load application"); }
      })();
    } else if (fromVar && !wizardOpen) {
      (async () => {
        try { const r = await api.get(`/invoice-builder/from-variation/${fromVar}`); openNewFrom(r.data); }
        catch { toast.error("Could not load variation"); }
      })();
    }
  }, [fromApp, fromVar]);   

  const openNewFrom = (partial) => {
    const base = { ...emptyInvoice(), ...partial };
    if (partial.lineItems) base.lineItems = partial.lineItems.map(l => ({ ...l, id: l.id || crypto.randomUUID() }));
    setEditing(base); setWizardOpen(true);
  };
  const openNew = (fromTemplate = null) => {
    let base = emptyInvoice();
    if (fromTemplate) {
      base = { ...base, ...(fromTemplate.payload || {}), id: undefined, status: "Draft",
        invoiceRef: "", invoiceDate: base.invoiceDate, dueDate: "",
        lineItems: (fromTemplate.payload?.lineItems || []).map(l => ({ ...l, id: crypto.randomUUID() })) };
    } else {
      const d = loadDraft(); if (d && !d.id) base = { ...base, ...d, id: undefined };
    }
    if (filterProject && !base.projectId) {
      const j = jobs.find(x => x.id === filterProject);
      if (j) { base.projectId = j.id; base.projectName = j.projectName || j.clientName || ""; base.projectAddress = j.address || ""; base.clientName = j.clientName || ""; base.clientCompany = j.company || ""; }
    }
    // Pre-fill bank from user profile
    if (user) {
      base.bankName ||= user.bankName || "";
      base.bankAccountName ||= user.bankAccountName || user.companyName || user.fullName || "";
      base.bankAccountNumber ||= user.bankAccountNumber || "";
      base.bankSortCode ||= user.bankSortCode || "";
      base.bankIban ||= user.bankIban || "";
    }
    setEditing(base); setWizardOpen(true);
  };
  const openEdit = (a) => { setEditing({ ...emptyInvoice(), ...a }); setWizardOpen(true); };
  const duplicate = (a) => {
    const c = { ...a }; delete c.id; delete c.createdAt; delete c.updatedAt; delete c._id;
    c.status = "Draft"; c.invoiceRef = ""; c.invoiceDate = new Date().toISOString().slice(0, 10); c.dueDate = ""; c.payments = [];
    c.lineItems = (c.lineItems || []).map(l => ({ ...l, id: crypto.randomUUID() }));
    setEditing({ ...emptyInvoice(), ...c }); setWizardOpen(true);
  };
  const deleteInvoice = async (a) => {
    if (!window.confirm(`Delete invoice ${a.invoiceRef || ""}?`)) return;
    try { await api.delete(`/invoice-builder/invoices/${a.id}`); toast.success("Deleted"); await loadAll(); }
    catch { toast.error("Delete failed"); }
  };
  const toggleFav = async (a) => { try { await api.patch(`/invoice-builder/invoices/${a.id}`, { isFavourite: !a.isFavourite }); await loadAll(); } catch { toast.error("Failed"); } };
  const markStatus = async (a, status) => {
    try { await api.post(`/invoice-builder/invoices/${a.id}/status`, { status }); toast.success(`Marked as ${status}`); await loadAll(); }
    catch { toast.error("Failed"); }
  };
  const remind = async (a) => {
    try { await api.post(`/invoice-builder/invoices/${a.id}/remind`); toast.success("Reminder logged"); await loadAll(); }
    catch { toast.error("Failed"); }
  };

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    return invoices.filter(a => {
      if (s) {
        const hay = `${a.invoiceRef || ""} ${a.projectName || ""} ${a.clientName || ""} ${a.clientCompany || ""} ${a.poNumber || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (filterStatus && (a.status || "Draft") !== filterStatus) return false;
      if (filterProject && a.projectId !== filterProject) return false;
      return true;
    });
  }, [invoices, query, filterStatus, filterProject]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="invoice-page">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Commercial</div>
          <h1 className="font-display text-3xl sm:text-4xl text-[#F0EDE8]">Invoice Builder</h1>
          <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">Professional invoicing from draft through to paid — full audit trail with CIS + VAT, part payments, and one-click chase for overdue invoices.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll} className="text-xs text-[#A19D94] hover:text-[#E8A020] flex items-center gap-1" data-testid="inv-refresh"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh</button>
          <button onClick={() => openNew()} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040]" data-testid="inv-new-btn"><Plus size={14} /> New Invoice</button>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <StatCard label="Draft" value={stats?.draft ?? 0} testId="inv-stat-draft" />
        <StatCard label="Sent" value={stats?.sent ?? 0} tone="gold" testId="inv-stat-sent" />
        <StatCard label="Part Paid" value={stats?.partPaid ?? 0} tone="info" testId="inv-stat-part" />
        <StatCard label="Paid" value={stats?.paid ?? 0} tone="green" testId="inv-stat-paid" />
        <StatCard label="Overdue" value={stats?.overdue ?? 0} tone="red" testId="inv-stat-overdue" />
        <StatCard label="Cancelled" value={stats?.cancelled ?? 0} testId="inv-stat-cancelled" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <ValueCard label="Outstanding" value={fGBP(stats?.outstandingValue || 0)} sub="Sent + part paid + overdue" tone="gold" testId="inv-val-outstanding" />
        <ValueCard label="Overdue" value={fGBP(stats?.overdueValue || 0)} sub="Past due, chase clients" tone="red" testId="inv-val-overdue" />
        <ValueCard label="Paid year-to-date" value={fGBP(stats?.paidValue || 0)} sub="Total invoice payments received" tone="green" testId="inv-val-paid" />
      </div>

      {(applications.filter(a => a.status === "Certified").length > 0 || variations.filter(v => v.status === "Approved").length > 0) && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Ready to invoice</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {applications.filter(a => a.status === "Certified").slice(0, 3).map(a => (
              <button key={a.id} onClick={async () => {
                try { const r = await api.get(`/invoice-builder/from-application/${a.id}`); openNewFrom(r.data); }
                catch { toast.error("Failed"); }
              }} className="card-dark p-3 text-left hover:border-[#E8A020] border border-transparent" data-testid={`inv-ready-afp-${a.id}`}>
                <div className="flex items-center gap-2 text-[10px] text-[#E8A020]"><LinkIcon size={11} /> Certified AFP</div>
                <div className="text-sm text-[#F0EDE8] mt-1 truncate">{a.applicationRef} · {fGBP(Number(a.certifiedAmount) || 0)}</div>
                <div className="text-[11px] text-[#A19D94] truncate">{a.projectName || a.clientCompany}</div>
              </button>
            ))}
            {variations.filter(v => v.status === "Approved").slice(0, 3).map(v => (
              <button key={v.id} onClick={async () => {
                try { const r = await api.get(`/invoice-builder/from-variation/${v.id}`); openNewFrom(r.data); }
                catch { toast.error("Failed"); }
              }} className="card-dark p-3 text-left hover:border-[#E8A020] border border-transparent" data-testid={`inv-ready-vo-${v.id}`}>
                <div className="flex items-center gap-2 text-[10px] text-[#E8A020]"><LinkIcon size={11} /> Approved variation</div>
                <div className="text-sm text-[#F0EDE8] mt-1 truncate">{v.variationRef} · {fGBP((v.totals || {}).total || 0)}</div>
                <div className="text-[11px] text-[#A19D94] truncate">{v.projectName || v.clientCompany}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {templates.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Templates</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {templates.map(t => (
              <div key={t.id} className="card-dark p-3 flex items-start justify-between gap-2" data-testid={`inv-template-${t.id}`}>
                <button onClick={() => openNew(t)} className="text-left flex-1 min-w-0">
                  <div className="text-sm text-[#F0EDE8] truncate">{t.name}</div>
                  <div className="text-[11px] text-[#A19D94] truncate">Invoice template</div>
                </button>
                <button onClick={async () => { if (!window.confirm("Delete template?")) return; try { await api.delete(`/invoice-builder/templates/${t.id}`); setTemplates(templates.filter(x => x.id !== t.id)); } catch { toast.error("Failed"); } }} className="text-[#706D66] hover:text-[#F27C7C] p-1"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-dark p-4 mb-4" data-testid="inv-filters">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search reference, project, client, PO…" className={`${inputClass} pl-9`} data-testid="inv-search" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={inputClass} data-testid="inv-filter-status">
            <option value="">All status</option>
            {STATUSES.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className={inputClass} data-testid="inv-filter-project">
            <option value="">All projects</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.projectName || j.clientName}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card-dark p-8 text-center text-sm text-[#A19D94]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card-dark p-10 text-center" data-testid="inv-empty">
          <Receipt size={28} className="mx-auto text-[#E8A020] mb-3" />
          <div className="text-base text-[#F0EDE8]">{invoices.length === 0 ? "No invoices yet" : "No invoices match your filters"}</div>
          <p className="text-xs text-[#A19D94] mt-2 max-w-md mx-auto">Raise professional CIS + VAT compliant invoices in minutes. Convert a Certified Application or Approved Variation with one click.</p>
          <button onClick={() => openNew()} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="inv-empty-new"><Plus size={14} /> Raise your first invoice</button>
        </div>
      ) : (
        <div className="space-y-2">{filtered.map(a => <InvoiceRow key={a.id} a={a} onEdit={() => openEdit(a)} onDelete={() => deleteInvoice(a)} onDuplicate={() => duplicate(a)} onFav={() => toggleFav(a)} onMark={(s) => markStatus(a, s)} onRemind={() => remind(a)} />)}</div>
      )}

      {wizardOpen && editing && (
        <InvoiceWizard initial={editing} user={user} jobs={jobs} applications={applications} variations={variations}
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
  const t = tone === "red" ? "text-[#F27C7C]" : tone === "green" ? "text-[#68D391]" : tone === "gold" ? "text-[#E8A020]" : "text-[#F0EDE8]";
  return (<div className="card-dark p-4" data-testid={testId}><Label>{label}</Label><div className={`mt-2 font-display text-2xl ${t}`}>{value}</div><div className="text-[11px] text-[#A19D94] mt-1">{sub}</div></div>);
}

function InvoiceRow({ a, onEdit, onDelete, onDuplicate, onFav, onMark, onRemind }) {
  const status = a.status || "Draft";
  const statusCls = STATUS_BADGE[status] || STATUS_BADGE.Draft;
  const total = (a.totals || {}).totalDue || 0;
  const paid = a.paidTotal || 0;
  const bal = a.balance ?? Math.max(0, total - paid);
  return (
    <div className={`card-dark p-4 flex items-start gap-3 ${status === "Overdue" ? "border-l-2 border-[#F27C7C]" : ""}`} data-testid={`inv-row-${a.id}`}>
      <button onClick={onFav} className={`p-1 mt-1 ${a.isFavourite ? "text-[#E8A020]" : "text-[#706D66] hover:text-[#E8A020]"}`}><Star size={14} fill={a.isFavourite ? "#E8A020" : "none"} /></button>
      <button onClick={onEdit} className="text-left flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base text-[#F0EDE8] font-medium truncate">{a.invoiceRef || "INV-DRAFT"}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusCls}`}>{status}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#E8A020]/40 text-[#E8A020]">{fGBP(total)}</span>
          {paid > 0 && paid < total && <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#A0A0F0]/40 text-[#A0A0F0]">Balance {fGBP(bal)}</span>}
          {a.linkedApplicationRef && <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#2a2620] text-[#A19D94]">← {a.linkedApplicationRef}</span>}
          {a.linkedVariationRef && <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#2a2620] text-[#A19D94]">← {a.linkedVariationRef}</span>}
        </div>
        <div className="text-xs text-[#A19D94] mt-1 truncate">{a.projectName || a.clientCompany || a.clientName || "—"} · {a.invoiceDate || "—"} {a.dueDate ? `· due ${a.dueDate}` : ""}</div>
      </button>
      <div className="flex gap-1 shrink-0">
        {status === "Draft" && <button onClick={() => onMark("Sent")} className="p-2 text-[#A19D94] hover:text-[#E8A020]" title="Mark as Sent" data-testid={`inv-row-send-${a.id}`}><Send size={14} /></button>}
        {(status === "Sent" || status === "Part Paid" || status === "Overdue") && <button onClick={() => onMark("Paid")} className="p-2 text-[#A19D94] hover:text-[#68D391]" title="Mark as Paid" data-testid={`inv-row-paid-${a.id}`}><CheckCircle2 size={14} /></button>}
        {status === "Overdue" && <button onClick={onRemind} className="p-2 text-[#A19D94] hover:text-[#F27C7C]" title="Log a chase" data-testid={`inv-row-remind-${a.id}`}><Bell size={14} /></button>}
        {(status === "Draft" || status === "Sent") && <button onClick={() => onMark("Cancelled")} className="p-2 text-[#A19D94] hover:text-[#F27C7C]" title="Cancel invoice" data-testid={`inv-row-cancel-${a.id}`}><AlertTriangle size={14} /></button>}
        <button onClick={onEdit} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`inv-row-edit-${a.id}`}><Edit2 size={14} /></button>
        <button onClick={onDuplicate} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`inv-row-dup-${a.id}`}><Copy size={14} /></button>
        <button onClick={onDelete} className="p-2 text-[#A19D94] hover:text-[#F27C7C]" data-testid={`inv-row-delete-${a.id}`}><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

// ================================================================
// WIZARD
// ================================================================
function InvoiceWizard({ initial, user, jobs, applications, variations, onClose, onSaved, onTemplatesChanged }) {
  const [data, setData] = useState(initial);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [signingOpen, setSigningOpen] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payForm, setPayForm] = useState({ amount: 0, date: new Date().toISOString().slice(0, 10), method: "", reference: "", note: "" });

  useEffect(() => { if (user?.fullName && !data.preparedBy) setData(d => ({ ...d, preparedBy: user.fullName })); }, [user?.fullName]);   
  useEffect(() => { if (!data.id) { const t = setTimeout(() => saveDraft(data), 500); return () => clearTimeout(t); } }, [data]);

  // Auto-compute due date from payment terms + invoice date if the field is empty
  useEffect(() => {
    if (data.dueDate) return;
    const days = { "Net 7": 7, "Net 14": 14, "Net 30": 30, "Net 45": 45, "Net 60": 60, "Due on receipt": 0 }[data.paymentTerms];
    if (days == null || !data.invoiceDate) return;
    const base = new Date(data.invoiceDate);
    base.setDate(base.getDate() + days);
    setData(d => ({ ...d, dueDate: base.toISOString().slice(0, 10) }));
  }, [data.paymentTerms, data.invoiceDate, data.dueDate]);

  const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));
  const totals = useMemo(() => computeTotals(data), [data]);

  const pickProject = (id) => {
    const j = jobs.find(x => x.id === id); if (!j) return;
    setData(d => ({
      ...d, projectId: j.id,
      projectName: j.projectName || j.clientName || d.projectName,
      projectAddress: j.address || d.projectAddress,
      clientName: j.clientName || d.clientName,
      clientCompany: j.company || d.clientCompany,
      clientEmail: j.clientContact || d.clientEmail,
      clientAddress: j.clientAddress || d.clientAddress,
    }));
  };
  const linkApplication = async (id) => {
    if (!id) { setData(d => ({ ...d, linkedApplicationId: "", linkedApplicationRef: "" })); return; }
    try {
      const r = await api.get(`/invoice-builder/from-application/${id}`);
      setData(d => ({ ...d, ...r.data, id: d.id, lineItems: r.data.lineItems.map(l => ({ ...l, id: l.id || crypto.randomUUID() })) }));
      toast.success(`Linked to ${r.data.linkedApplicationRef}`);
    } catch { toast.error("Failed to link"); }
  };
  const linkVariation = async (id) => {
    if (!id) { setData(d => ({ ...d, linkedVariationId: "", linkedVariationRef: "" })); return; }
    try {
      const r = await api.get(`/invoice-builder/from-variation/${id}`);
      setData(d => ({ ...d, ...r.data, id: d.id, lineItems: r.data.lineItems.map(l => ({ ...l, id: l.id || crypto.randomUUID() })) }));
      toast.success(`Linked to ${r.data.linkedVariationRef}`);
    } catch { toast.error("Failed to link"); }
  };

  const addLine = () => setData(d => ({ ...d, lineItems: [...(d.lineItems || []), emptyLine()] }));
  const updLine = (id, patch) => setData(d => ({ ...d, lineItems: d.lineItems.map(x => x.id === id ? { ...x, ...patch } : x) }));
  const delLine = (id) => setData(d => ({ ...d, lineItems: d.lineItems.filter(x => x.id !== id) }));
  const dupLine = (id) => setData(d => { const l = d.lineItems.find(x => x.id === id); if (!l) return d; return { ...d, lineItems: [...d.lineItems, { ...l, id: crypto.randomUUID() }] }; });

  const applyPaymentTerms = (terms) => {
    setData(d => {
      const days = { "Net 7": 7, "Net 14": 14, "Net 30": 30, "Net 45": 45, "Net 60": 60, "Due on receipt": 0 }[terms];
      if (days == null) return { ...d, paymentTerms: terms };
      const base = new Date(d.invoiceDate || new Date().toISOString().slice(0, 10));
      base.setDate(base.getDate() + days);
      return { ...d, paymentTerms: terms, dueDate: base.toISOString().slice(0, 10) };
    });
  };

  const generatePreview = () => {
    try { setPreviewUrl(invoicePdfBlobUrl({ data: { ...data, totals }, user, today: new Date().toLocaleDateString("en-GB") })); }
    catch { toast.error("Preview failed"); }
  };

  const saveEntry = async () => {
    if (!data.projectName && !data.projectId && !data.clientCompany && !data.clientName) {
      toast.error("Client or project is required"); setStep(1); return;
    }
    setSaving(true);
    try {
      let saved;
      if (data.id) { const r = await api.patch(`/invoice-builder/invoices/${data.id}`, data); saved = r.data; }
      else { const r = await api.post("/invoice-builder/invoices", data); saved = r.data; }
      try {
        await api.post("/documents/save", {
          title: `Invoice — ${data.clientCompany || data.clientName || data.projectName || "Client"}`,
          toolId: TOOL_ID, refNumber: saved.invoiceRef, jobId: data.projectId || null,
          content: `INVOICE ${saved.invoiceRef}\n${data.clientCompany || data.clientName || ""}\nTotal: ${fGBP((saved.totals || {}).totalDue || 0)}`,
          metadata: { ...saved },
        });
      } catch { /* soft-fail */ }
      downloadInvoicePdf({ data: saved, user, today: new Date().toLocaleDateString("en-GB") });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      toast.success("Invoice saved");
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  const saveAsTemplate = async () => {
    if (!tplName.trim()) return toast.error("Template name required");
    try {
      const payload = { ...data, id: undefined, invoiceRef: undefined, invoiceDate: undefined, dueDate: undefined,
        status: "Draft", payments: [], preparedSignature: "", photoIds: [] };
      await api.post("/invoice-builder/templates", { name: tplName.trim(), payload });
      toast.success("Template saved");
      setTplModalOpen(false); setTplName("");
      const lst = await api.get("/invoice-builder/templates"); onTemplatesChanged(lst.data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const recordPayment = async () => {
    if (!data.id) { toast.error("Save the invoice first before recording payments"); return; }
    if (!Number(payForm.amount) || Number(payForm.amount) <= 0) { toast.error("Amount required"); return; }
    try {
      const r = await api.post(`/invoice-builder/invoices/${data.id}/payment`, payForm);
      setData(d => ({ ...d, payments: r.data.payments, status: r.data.status }));
      toast.success("Payment recorded");
      setPayModalOpen(false);
      setPayForm({ amount: 0, date: new Date().toISOString().slice(0, 10), method: "", reference: "", note: "" });
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const paidTotal = (data.payments || []).reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const balance = Math.max(0, totals.totalDue - paidTotal);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-y-auto" data-testid="inv-wizard">
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-5xl mx-auto card-dark p-5 md:p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-1">{data.id ? "Edit" : "New"} Invoice</div>
              <h2 className="font-display text-2xl text-[#F0EDE8]">{data.clientCompany || data.clientName || data.projectName || "Untitled"} <span className="text-sm text-[#A19D94]">· {fGBP(totals.totalDue)} due</span></h2>
            </div>
            <button onClick={onClose} className="text-[#A19D94] hover:text-[#F0EDE8]" data-testid="inv-wizard-close"><X size={20} /></button>
          </div>

          <div className="flex justify-end mb-3">
            <button onClick={() => setTplModalOpen(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="inv-save-template-btn"><Save size={12} /> Save as template</button>
          </div>

          <div className="overflow-x-auto mb-5" data-testid="inv-stepper">
            <div className="flex gap-1 min-w-max">
              {WIZARD_STEPS.map(s => (
                <button key={s.id} onClick={() => setStep(s.id)} data-testid={`inv-step-${s.id}`}
                  className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${step === s.id ? "bg-[#E8A020] text-black" : step > s.id ? "bg-[#1e1a12] text-[#68D391] border border-[#68D391]/30" : "bg-[#0f0d09] text-[#A19D94] border border-[#2a2620]"}`}>
                  {s.id}. {s.label}
                </button>
              ))}
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-4" data-testid="inv-step-1-client">
              {jobs.length > 0 && (
                <Field label="Link to project (optional)">
                  <select value={data.projectId} onChange={(e) => pickProject(e.target.value)} className={inputClass} data-testid="inv-link-project">
                    <option value="">Not linked</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.projectName || j.clientName}</option>)}
                  </select>
                </Field>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Project name"><input className={inputClass} value={data.projectName} onChange={(e) => set("projectName")(e.target.value)} data-testid="inv-projectName" /></Field>
                <Field label="Site address"><textarea className={`${inputClass} min-h-[52px]`} value={data.projectAddress} onChange={(e) => set("projectAddress")(e.target.value)} /></Field>
                <Field label="Client contact"><input className={inputClass} value={data.clientName} onChange={(e) => set("clientName")(e.target.value)} data-testid="inv-clientName" /></Field>
                <Field label="Client company"><input className={inputClass} value={data.clientCompany} onChange={(e) => set("clientCompany")(e.target.value)} data-testid="inv-clientCompany" /></Field>
                <Field label="Client email"><input type="email" className={inputClass} value={data.clientEmail} onChange={(e) => set("clientEmail")(e.target.value)} /></Field>
                <Field label="Client phone"><input className={inputClass} value={data.clientPhone} onChange={(e) => set("clientPhone")(e.target.value)} /></Field>
                <Field label="Billing address"><textarea className={`${inputClass} min-h-[52px]`} value={data.clientAddress} onChange={(e) => set("clientAddress")(e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Client VAT no."><input className={inputClass} value={data.clientVatNumber} onChange={(e) => set("clientVatNumber")(e.target.value)} /></Field>
                  <Field label="Client UTR"><input className={inputClass} value={data.clientUtr} onChange={(e) => set("clientUtr")(e.target.value)} /></Field>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4" data-testid="inv-step-2-link">
              <div className="card-dark p-3 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">Link this invoice to a Certified Application for Payment or an Approved Variation Order to pre-fill the line items automatically. Skip to enter items manually.</div>
              <Field label="Application for Payment (certified only)">
                <select value={data.linkedApplicationId} onChange={(e) => linkApplication(e.target.value)} className={inputClass} data-testid="inv-link-afp">
                  <option value="">Not linked</option>
                  {applications.filter(a => ["Certified", "Paid"].includes(a.status)).map(a => (
                    <option key={a.id} value={a.id}>{a.applicationRef} · {a.projectName || a.clientCompany} · {fGBP(Number(a.certifiedAmount) || 0)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Variation Order (approved only)">
                <select value={data.linkedVariationId} onChange={(e) => linkVariation(e.target.value)} className={inputClass} data-testid="inv-link-vo">
                  <option value="">Not linked</option>
                  {variations.filter(v => v.status === "Approved").map(v => (
                    <option key={v.id} value={v.id}>{v.variationRef} · {v.projectName || v.clientCompany} · {fGBP((v.totals || {}).total || 0)}</option>
                  ))}
                </select>
              </Field>
              <Field label="PO number (optional)"><input className={inputClass} value={data.poNumber} onChange={(e) => set("poNumber")(e.target.value)} data-testid="inv-po" /></Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3" data-testid="inv-step-3-items">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Line items · {(data.lineItems || []).length}</div>
                <button onClick={addLine} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#E8A020] text-black text-xs font-medium" data-testid="inv-add-line"><Plus size={12} /> Add line</button>
              </div>
              {(data.lineItems || []).map((it, i) => (
                <div key={it.id} className="card-dark p-3" data-testid={`inv-line-${i + 1}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Line {i + 1} · <span className="text-[#F0EDE8]">{fGBP((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}</span></span>
                    <div className="flex gap-2"><button onClick={() => dupLine(it.id)} className="text-[#A19D94] hover:text-[#E8A020]"><Copy size={12} /></button><button onClick={() => delLine(it.id)} className="text-[#A19D94] hover:text-[#F27C7C]"><Trash2 size={12} /></button></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                    <Field label="Category"><select className={inputClass} value={it.category} onChange={(e) => updLine(it.id, { category: e.target.value })} data-testid={`inv-line-cat-${i + 1}`}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></Field>
                    <div className="md:col-span-2"><Field label="Description"><input className={inputClass} value={it.description} onChange={(e) => updLine(it.id, { description: e.target.value })} data-testid={`inv-line-desc-${i + 1}`} /></Field></div>
                    <Field label="Qty"><input type="number" step="0.01" className={inputClass} value={it.qty} onChange={(e) => updLine(it.id, { qty: e.target.value })} data-testid={`inv-line-qty-${i + 1}`} /></Field>
                    <Field label="Unit"><select className={inputClass} value={it.unit} onChange={(e) => updLine(it.id, { unit: e.target.value })}>{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></Field>
                    <Field label="Unit price (£)"><input type="number" step="0.01" className={inputClass} value={it.unitPrice} onChange={(e) => updLine(it.id, { unitPrice: e.target.value })} data-testid={`inv-line-price-${i + 1}`} /></Field>
                  </div>
                </div>
              ))}
              <div className="card-dark p-4"><div className="flex items-center justify-between"><Label>Subtotal</Label><span className="text-[#F0EDE8] text-lg">{fGBP(totals.subtotal)}</span></div></div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4" data-testid="inv-step-4-money">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Discount (£)"><input type="number" step="0.01" className={inputClass} value={data.discount} onChange={(e) => set("discount")(Number(e.target.value))} data-testid="inv-discount" /></Field>
                <Field label="CIS status">
                  <select className={inputClass} value={data.cisStatus} onChange={(e) => set("cisStatus")(e.target.value)} data-testid="inv-cisStatus">{CIS_STATUSES.map(c => <option key={c} value={c}>{c}</option>)}</select>
                </Field>
                <Field label="VAT treatment">
                  <select className={inputClass} value={data.vatTreatment} onChange={(e) => set("vatTreatment")(e.target.value)} data-testid="inv-vatTreatment">{VAT_TREATMENTS.map(v => <option key={v} value={v}>{v}</option>)}</select>
                </Field>
              </div>
              <div className="card-dark p-4">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020] mb-3">Summary</div>
                <div className="space-y-2 text-sm">
                  <SummaryRow label="Subtotal" value={fGBP(totals.subtotal)} />
                  {totals.discount > 0 && <SummaryRow label="Less: Discount" value={`(${fGBP(totals.discount)})`} muted />}
                  <SummaryRow label="Subtotal after discount" value={fGBP(totals.subtotalAfterDiscount)} bold />
                  {totals.cisRate > 0 && <SummaryRow label={`Less: CIS (${totals.cisRate}% of labour ratio ${Math.round(totals.labourRatio * 100)}%)`} value={`(${fGBP(totals.cisDeduction)})`} muted />}
                  {totals.vatAmount > 0 && <SummaryRow label={`Add: VAT (${totals.vatTreatment})`} value={fGBP(totals.vatAmount)} muted />}
                  {(data.vatTreatment === "Reverse charge (0%)") && <div className="text-[11px] text-[#A19D94] pl-2">↳ Reverse charge — customer accounts for VAT to HMRC. This must appear on the invoice.</div>}
                  <div className="border-t border-[#2a2620] pt-2 mt-2"></div>
                  <div className="flex items-center justify-between"><span className="text-[#E8A020] text-sm">TOTAL DUE</span><span className="text-[#E8A020] text-xl font-medium">{fGBP(totals.totalDue)}</span></div>
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4" data-testid="inv-step-5-terms">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Invoice date"><input type="date" className={inputClass} value={data.invoiceDate} onChange={(e) => set("invoiceDate")(e.target.value)} /></Field>
                <Field label="Payment terms">
                  <select className={inputClass} value={data.paymentTerms} onChange={(e) => applyPaymentTerms(e.target.value)} data-testid="inv-paymentTerms">{PAYMENT_TERMS.map(p => <option key={p} value={p}>{p}</option>)}</select>
                </Field>
                <Field label="Due date"><input type="date" className={inputClass} value={data.dueDate} onChange={(e) => set("dueDate")(e.target.value)} data-testid="inv-dueDate" /></Field>
              </div>
              <Field label="Payment terms note (appears on PDF)"><textarea className={`${inputClass} min-h-[100px]`} value={data.paymentTermsNote} onChange={(e) => set("paymentTermsNote")(e.target.value)} /></Field>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4" data-testid="inv-step-6-review">
              <div className="card-dark p-3 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">Bank details print on the invoice as remittance instructions. Update once, and they stick per invoice.</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Bank name"><input className={inputClass} value={data.bankName} onChange={(e) => set("bankName")(e.target.value)} data-testid="inv-bankName" /></Field>
                <Field label="Account name"><input className={inputClass} value={data.bankAccountName} onChange={(e) => set("bankAccountName")(e.target.value)} /></Field>
                <Field label="Sort code"><input className={inputClass} value={data.bankSortCode} onChange={(e) => set("bankSortCode")(e.target.value)} placeholder="00-00-00" /></Field>
                <Field label="Account number"><input className={inputClass} value={data.bankAccountNumber} onChange={(e) => set("bankAccountNumber")(e.target.value)} data-testid="inv-bankAccountNumber" /></Field>
                <Field label="IBAN (optional)"><input className={inputClass} value={data.bankIban} onChange={(e) => set("bankIban")(e.target.value)} /></Field>
                <Field label="Payment reference (optional)"><input className={inputClass} value={data.bankReference} onChange={(e) => set("bankReference")(e.target.value)} placeholder="Defaults to invoice reference" /></Field>
              </div>
              <div className="card-dark p-4">
                <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-3">Prepared by</div>
                <Field label="Name"><input className={inputClass} value={data.preparedBy || user?.fullName || ""} onChange={(e) => set("preparedBy")(e.target.value)} /></Field>
                <div className="mt-3"><Label>Signature (optional)</Label>
                  <div className="mt-1 flex items-center gap-3">
                    {data.preparedSignature ? <img alt="Signature" src={data.preparedSignature} className="h-12 w-40 rounded-md border border-[#2a2620] bg-white" /> : <div className="h-12 w-40 rounded-md border border-dashed border-[#2a2620] flex items-center justify-center text-[10px] text-[#706D66]">Not signed</div>}
                    <button onClick={() => setSigningOpen(true)} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="inv-sign"><PenTool size={12} /> {data.preparedSignature ? "Re-sign" : "Sign"}</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-4" data-testid="inv-step-7-status">
              <Field label="Status">
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                  {STATUSES.map(s => (
                    <button key={s} onClick={() => set("status")(s)} className={`px-3 py-2 rounded-md text-xs border ${data.status === s ? "bg-[#E8A020] text-black border-[#E8A020]" : "border-[#2a2620] text-[#F0EDE8] hover:border-[#E8A020]"}`} data-testid={`inv-status-${s}`}>{s}</button>
                  ))}
                </div>
              </Field>
              <div className="card-dark p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020]">Payments received</div>
                    <div className="text-2xl text-[#F0EDE8] mt-1">{fGBP(paidTotal)} <span className="text-sm text-[#A19D94]">of {fGBP(totals.totalDue)}</span></div>
                    <div className="text-[11px] text-[#A19D94] mt-1">Balance {fGBP(balance)}</div>
                  </div>
                  <button onClick={() => setPayModalOpen(true)} disabled={!data.id} className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-[#E8A020] text-black text-xs font-medium disabled:opacity-40" data-testid="inv-add-payment"><Plus size={12} /> Record payment</button>
                </div>
                {(data.payments || []).length === 0 ? (
                  <div className="text-xs text-[#A19D94]">{data.id ? "No payments recorded yet." : "Save the invoice to start recording payments."}</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="text-[#A19D94]"><tr><th className="text-left py-2">Date</th><th className="text-right">Amount</th><th className="text-left">Method</th><th className="text-left">Reference</th></tr></thead>
                    <tbody className="text-[#F0EDE8]">
                      {data.payments.map(p => (
                        <tr key={p.id} className="border-t border-[#2a2620]"><td className="py-2">{p.date}</td><td className="text-right">{fGBP(p.amount)}</td><td>{p.method || "—"}</td><td>{p.reference || "—"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="card-dark p-3 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">Recording a payment automatically adds it to the linked project&apos;s payment tracker.</div>
            </div>
          )}

          {step === 8 && (
            <div className="space-y-4" data-testid="inv-step-8-generate">
              <Field label="Notes on invoice (optional)"><textarea className={`${inputClass} min-h-[52px]`} value={data.notes} onChange={(e) => set("notes")(e.target.value)} /></Field>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard label="Line items" value={(data.lineItems || []).length} />
                <MetricCard label="Subtotal" value={fGBP(totals.subtotal)} />
                <MetricCard label="Total due" value={fGBP(totals.totalDue)} tone="gold" />
                <MetricCard label="Balance" value={fGBP(balance)} tone={balance <= 0 ? "green" : "gold"} />
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={generatePreview} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#F0EDE8] hover:border-[#E8A020]" data-testid="inv-preview-btn"><RefreshCw size={14} /> {previewUrl ? "Refresh" : "Generate"} preview</button>
                <button onClick={saveEntry} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-60" data-testid="inv-save-btn"><Download size={16} /> {saving ? "Saving..." : "Save & Generate PDF"}</button>
              </div>
              {previewUrl && <iframe title="Invoice Preview" src={previewUrl} className="w-full h-[500px] rounded-md border border-[#2a2620] bg-white" data-testid="inv-preview-iframe" />}
            </div>
          )}

          <div className="flex items-center justify-between mt-6">
            <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94] disabled:opacity-40" data-testid="inv-btn-prev"><ChevronLeft size={14} /> Back</button>
            <span className="text-xs text-[#706D66]">Step {step} of {WIZARD_STEPS.length}</span>
            <button onClick={() => setStep(Math.min(WIZARD_STEPS.length, step + 1))} disabled={step === WIZARD_STEPS.length} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-40" data-testid="inv-btn-next">Next <ChevronRight size={14} /></button>
          </div>
        </div>

        {tplModalOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="inv-template-modal">
            <div className="card-dark p-6 max-w-md w-full">
              <div className="flex items-start justify-between mb-3"><h3 className="font-display text-2xl text-[#F0EDE8]">Save as template</h3><button onClick={() => setTplModalOpen(false)} className="text-[#A19D94]"><X size={18} /></button></div>
              <Field label="Template name"><input className={inputClass} value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Standard CIS invoice" data-testid="inv-template-name" /></Field>
              <div className="flex gap-2 mt-4"><button onClick={() => setTplModalOpen(false)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button><button onClick={saveAsTemplate} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="inv-template-save">Save</button></div>
            </div>
          </div>
        )}

        {signingOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="inv-sign-modal">
            <div className="card-dark p-5 max-w-lg w-full">
              <div className="flex items-start justify-between mb-3"><h3 className="font-display text-xl text-[#F0EDE8]">Contractor signature</h3><button onClick={() => setSigningOpen(false)} className="text-[#A19D94]"><X size={18} /></button></div>
              <SignaturePad value={data.preparedSignature || ""} onChange={(v) => set("preparedSignature")(v)} />
              <div className="flex gap-2 mt-3"><button onClick={() => setSigningOpen(false)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button><button onClick={() => setSigningOpen(false)} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="inv-sign-done">Done</button></div>
            </div>
          </div>
        )}

        {payModalOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="inv-payment-modal">
            <div className="card-dark p-5 max-w-md w-full">
              <div className="flex items-start justify-between mb-3"><h3 className="font-display text-xl text-[#F0EDE8]">Record payment</h3><button onClick={() => setPayModalOpen(false)} className="text-[#A19D94]"><X size={18} /></button></div>
              <div className="space-y-3">
                <Field label="Amount (£)"><input type="number" step="0.01" className={inputClass} value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })} data-testid="inv-payment-amount" /></Field>
                <Field label="Date"><input type="date" className={inputClass} value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Method"><input className={inputClass} value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })} placeholder="Bank transfer" /></Field>
                  <Field label="Reference"><input className={inputClass} value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} /></Field>
                </div>
                <Field label="Note"><input className={inputClass} value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} /></Field>
              </div>
              <div className="flex gap-2 mt-4"><button onClick={() => setPayModalOpen(false)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button><button onClick={recordPayment} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="inv-payment-save">Record</button></div>
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
  return (<div className={`flex items-center justify-between ${muted ? "text-[#A19D94]" : "text-[#F0EDE8]"}`}><span className="text-xs">{label}</span><span className={`text-sm ${bold ? "font-medium" : ""}`}>{value}</span></div>);
}
