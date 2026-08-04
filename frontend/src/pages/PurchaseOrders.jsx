// Morris — Purchase Orders V2 (flagship procurement management system)
// Dashboard-first: KPI cards by status + suppliers + filters. 9-step wizard:
// Project → Supplier → Order Items → Delivery → Review & Approve → Issue PO
// → Goods Received → Match Supplier Invoice → Close.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus, Search, RefreshCw, Trash2, Edit2, X, ChevronLeft, ChevronRight,
  Truck, Package, PoundSterling, Copy, Star, Save, CheckCircle2,
  AlertTriangle, FileSignature, Send, Download, PenTool, Building2,
  ClipboardCheck, Receipt, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import SignaturePad from "../components/SignaturePad";
import { downloadPurchaseOrderPdf, purchaseOrderPdfBlobUrl } from "../lib/purchase-order-pdf";

const TOOL_ID = "purchase-orders";
const DRAFT_KEY = "morris.tool_draft.purchase-orders";

const WIZARD_STEPS = [
  { id: 1, key: "project",   label: "Project" },
  { id: 2, key: "supplier",  label: "Supplier" },
  { id: 3, key: "items",     label: "Order Items" },
  { id: 4, key: "delivery",  label: "Delivery" },
  { id: 5, key: "review",    label: "Review & Approve" },
  { id: 6, key: "issue",     label: "Issue PO" },
  { id: 7, key: "receive",   label: "Goods Received" },
  { id: 8, key: "invoice",   label: "Match Invoice" },
  { id: 9, key: "generate",  label: "Preview & PDF" },
];

const CATEGORIES = ["Materials", "Plant / Equipment Hire", "Consumables", "Services", "Subcontract Labour", "Delivery / Haulage", "Other"];
const UNITS = ["each", "item", "box", "bag", "pallet", "hour", "day", "week", "m", "m²", "m³", "tonne", "kg", "L", "roll", "set", "load"];
const STATUSES = ["Draft", "Sent", "Approved", "Ordered", "Part Delivered", "Delivered", "Awaiting Invoice", "Paid", "Cancelled"];
const VAT_TREATMENTS = ["Standard 20%", "Reduced 5%", "Zero-rated", "Reverse charge (0%)", "Exempt"];
const PAYMENT_TERMS = [
  "Payment on delivery", "7 days from invoice date", "14 days from invoice date",
  "30 days from invoice date", "45 days from invoice date", "60 days from invoice date",
  "End of month following invoice",
];

const inputClass = "w-full bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none";
const Label = ({ children }) => <label className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">{children}</label>;
const Field = ({ label, children, hint }) => (
  <div><Label>{label}</Label><div className="mt-1">{children}</div>{hint && <div className="text-[11px] text-[#706D66] mt-1">{hint}</div>}</div>
);
const fGBP = (n) => `£${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

const emptyLine = () => ({ id: crypto.randomUUID(), category: "Materials", description: "", productCode: "", qty: 1, unit: "each", unitPrice: 0, notes: "" });
const emptyPO = () => ({
  projectId: "", projectName: "", projectAddress: "",
  supplierId: "", supplierName: "", supplierCompany: "", supplierContact: "", supplierEmail: "", supplierPhone: "", supplierAddress: "", supplierVatNumber: "", supplierAccountNumber: "",
  poRef: "", poDate: new Date().toISOString().slice(0, 10), requiredDate: "", reference: "",
  status: "Draft",
  deliveryAddress: "", deliveryContact: "", deliveryPhone: "", deliveryInstructions: "", deliveryDate: "",
  deliveryCharge: 0,
  lineItems: [emptyLine()],
  discount: 0, vatTreatment: "Standard 20%",
  paymentTerms: "30 days from invoice date",
  terms: "Goods must be delivered in accordance with this Purchase Order. Any variation must be agreed in writing before delivery.",
  notes: "",
  preparedBy: "", preparedSignature: "",
  approvedBy: "", approvedDate: "",
  goodsReceived: [], matchedInvoiceIds: [], matchedInvoices: [],
  photoIds: [], supportingDocs: [],
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
  const discount = Number(data.discount) || 0;
  const subtotalAfter = subtotal - discount;
  const delivery = Number(data.deliveryCharge) || 0;
  const vatMap = { "Standard 20%": 20, "Reduced 5%": 5, "Zero-rated": 0, "Reverse charge (0%)": 0, "Exempt": 0 };
  const vatRate = vatMap[data.vatTreatment ?? "Standard 20%"] ?? 0;
  const vatBase = Math.max(0, subtotalAfter + delivery);
  const vatAmount = vatBase * vatRate / 100;
  return { subtotal, byCategory: byCat, discount, subtotalAfterDiscount: subtotalAfter, deliveryCharge: delivery, vatTreatment: data.vatTreatment, vatRate, vatAmount, total: vatBase + vatAmount };
}

const STATUS_BADGE = {
  Draft: "border-[#2a2620] text-[#A19D94]",
  Sent: "border-[#E8A020]/40 text-[#E8A020]",
  Approved: "border-[#68D391]/40 text-[#68D391]",
  Ordered: "border-[#A0A0F0]/40 text-[#A0A0F0]",
  "Part Delivered": "border-[#c8b464]/40 text-[#c8b464]",
  Delivered: "border-[#68D391]/40 text-[#68D391]",
  "Awaiting Invoice": "border-[#E8A020]/40 text-[#E8A020]",
  Paid: "border-[#68D391]/40 text-[#68D391]",
  Cancelled: "border-[#F27C7C]/40 text-[#F27C7C]",
};
const MATCH_BADGE = {
  "Unmatched": "border-[#2a2620] text-[#A19D94]",
  "Partially Matched": "border-[#c8b464]/40 text-[#c8b464]",
  "Fully Matched": "border-[#68D391]/40 text-[#68D391]",
};

export default function PurchaseOrders() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const openParamId = params.get("open") || "";
  const projectFilter = params.get("projectId") || "";
  const [pos, setPos] = useState([]);
  const [stats, setStats] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterProject, setFilterProject] = useState(projectFilter);
  const [filterSupplier, setFilterSupplier] = useState("");
  const [editing, setEditing] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [supplierPanelOpen, setSupplierPanelOpen] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [pRes, sRes, tRes, jRes, supRes] = await Promise.allSettled([
        api.get("/purchase-orders/purchase-orders"),
        api.get("/purchase-orders/stats"),
        api.get("/purchase-orders/templates"),
        api.get("/jobs"),
        api.get("/purchase-orders/suppliers"),
      ]);
      if (pRes.status === "fulfilled") setPos(pRes.value.data);
      if (sRes.status === "fulfilled") setStats(sRes.value.data);
      if (tRes.status === "fulfilled") setTemplates(tRes.value.data);
      if (jRes.status === "fulfilled") setJobs(jRes.value.data);
      if (supRes.status === "fulfilled") setSuppliers(supRes.value.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (openParamId && pos.length > 0 && !wizardOpen) {
      const p = pos.find(x => x.id === openParamId);
      if (p) openEdit(p);
    }
  }, [openParamId, pos]);

  const openNew = (fromTemplate = null) => {
    let base = emptyPO();
    if (fromTemplate) base = { ...base, ...(fromTemplate.payload || {}), id: undefined, status: "Draft", poRef: "", poDate: base.poDate, lineItems: (fromTemplate.payload?.lineItems || []).map(l => ({ ...l, id: crypto.randomUUID() })) };
    else { const d = loadDraft(); if (d && !d.id) base = { ...base, ...d, id: undefined }; }
    if (filterProject && !base.projectId) {
      const j = jobs.find(x => x.id === filterProject);
      if (j) {
        base.projectId = j.id;
        base.projectName = j.projectName || j.clientName || "";
        base.projectAddress = j.address || "";
        base.deliveryAddress = j.address || "";
      }
    }
    if (filterSupplier && !base.supplierId) {
      const sup = suppliers.find(x => x.id === filterSupplier);
      if (sup) pickSupplier(sup, base);
    }
    setEditing(base); setWizardOpen(true);
  };
  const openEdit = async (p) => {
    try {
      const r = await api.get(`/purchase-orders/purchase-orders/${p.id}`);
      setEditing({ ...emptyPO(), ...r.data });
    } catch { setEditing({ ...emptyPO(), ...p }); }
    setWizardOpen(true);
  };
  const duplicate = (p) => {
    const copy = { ...p }; delete copy.id; delete copy.createdAt; delete copy.updatedAt; delete copy._id;
    copy.status = "Draft"; copy.poDate = new Date().toISOString().slice(0, 10); copy.poRef = "";
    copy.lineItems = (copy.lineItems || []).map(l => ({ ...l, id: crypto.randomUUID() }));
    copy.goodsReceived = []; copy.matchedInvoiceIds = []; copy.matchedInvoices = [];
    copy.preparedSignature = ""; copy.approvedBy = ""; copy.approvedDate = "";
    setEditing({ ...emptyPO(), ...copy }); setWizardOpen(true);
  };
  const deletePO = async (p) => {
    if (!window.confirm(`Delete Purchase Order ${p.poRef || ""}?`)) return;
    try { await api.delete(`/purchase-orders/purchase-orders/${p.id}`); toast.success("Deleted"); await loadAll(); }
    catch { toast.error("Delete failed"); }
  };
  const toggleFav = async (p) => { try { await api.patch(`/purchase-orders/purchase-orders/${p.id}`, { isFavourite: !p.isFavourite }); await loadAll(); } catch { toast.error("Failed"); } };
  const markStatus = async (p, status) => {
    try {
      await api.post(`/purchase-orders/purchase-orders/${p.id}/status`, { status });
      toast.success(`Marked as ${status}`);
      await loadAll();
    } catch { toast.error("Failed"); }
  };

  const pickSupplier = (sup, base) => {
    base.supplierId = sup.id;
    base.supplierName = sup.name || "";
    base.supplierCompany = sup.company || "";
    base.supplierContact = sup.contact || "";
    base.supplierEmail = sup.email || "";
    base.supplierPhone = sup.phone || "";
    base.supplierAddress = sup.address || "";
    base.supplierVatNumber = sup.vatNumber || "";
    base.supplierAccountNumber = sup.accountNumber || "";
  };

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    return pos.filter(p => {
      if (s) {
        const hay = `${p.supplierName || ""} ${p.supplierCompany || ""} ${p.projectName || ""} ${p.poRef || ""} ${p.reference || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (filterStatus && (p.status || "Draft") !== filterStatus) return false;
      if (filterProject && p.projectId !== filterProject) return false;
      if (filterSupplier && p.supplierId !== filterSupplier) return false;
      return true;
    });
  }, [pos, query, filterStatus, filterProject, filterSupplier]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="purchase-orders-page">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Procurement</div>
          <h1 className="font-display text-3xl sm:text-4xl text-[#F0EDE8]">Purchase Orders</h1>
          <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">Manage the full purchasing lifecycle in one place — from raising an order to matching the supplier invoice and closing it out. Every step is logged for a complete audit trail.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={loadAll} className="text-xs text-[#A19D94] hover:text-[#E8A020] flex items-center gap-1" data-testid="po-refresh"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh</button>
          <button onClick={() => setSupplierPanelOpen(true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[#2a2620] text-sm text-[#F0EDE8] hover:border-[#E8A020]" data-testid="po-suppliers-btn"><Building2 size={14} /> Suppliers</button>
          <button onClick={() => openNew()} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040]" data-testid="po-new-btn"><Plus size={14} /> New Purchase Order</button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        <StatCard label="Draft" value={stats?.draft ?? 0} testId="po-stat-draft" />
        <StatCard label="Sent" value={stats?.sent ?? 0} tone="gold" testId="po-stat-sent" />
        <StatCard label="Approved" value={stats?.approved ?? 0} tone="green" testId="po-stat-approved" />
        <StatCard label="Ordered" value={stats?.ordered ?? 0} tone="info" testId="po-stat-ordered" />
        <StatCard label="Part Delivered" value={stats?.partDelivered ?? 0} tone="amber" testId="po-stat-part" />
        <StatCard label="Delivered" value={stats?.delivered ?? 0} tone="green" testId="po-stat-delivered" />
        <StatCard label="Awaiting Invoice" value={stats?.awaitingInvoice ?? 0} tone="gold" testId="po-stat-await" />
        <StatCard label="Paid" value={stats?.paid ?? 0} tone="green" testId="po-stat-paid" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <ValueCard label="Committed value" value={fGBP(stats?.committedValue || 0)} sub="Live POs excluding drafts & cancelled" tone="gold" testId="po-val-committed" />
        <ValueCard label="Awaiting supplier invoice" value={fGBP(stats?.awaitingInvoiceValue || 0)} sub="Goods delivered, invoice pending" testId="po-val-await" />
        <ValueCard label="Paid to suppliers" value={fGBP(stats?.paidValue || 0)} sub="Fully matched and settled" tone="green" testId="po-val-paid" />
      </div>

      {templates.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Templates</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {templates.map(t => (
              <div key={t.id} className="card-dark p-3 flex items-start justify-between gap-2" data-testid={`po-template-${t.id}`}>
                <button onClick={() => openNew(t)} className="text-left flex-1 min-w-0">
                  <div className="text-sm text-[#F0EDE8] truncate">{t.name}</div>
                  <div className="text-[11px] text-[#A19D94] truncate">Purchase order template</div>
                </button>
                <button onClick={async () => { if (!window.confirm("Delete template?")) return; try { await api.delete(`/purchase-orders/templates/${t.id}`); setTemplates(templates.filter(x => x.id !== t.id)); } catch { toast.error("Failed"); } }} className="text-[#706D66] hover:text-[#F27C7C] p-1"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-dark p-4 mb-4" data-testid="po-filters">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="relative md:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search PO ref, supplier, project…" className={`${inputClass} pl-9`} data-testid="po-search" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={inputClass} data-testid="po-filter-status">
            <option value="">All status</option>
            {STATUSES.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className={inputClass} data-testid="po-filter-project">
            <option value="">All projects</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.projectName || j.clientName}</option>)}
          </select>
          <select value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)} className={inputClass} data-testid="po-filter-supplier">
            <option value="">All suppliers</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name || s.company}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card-dark p-8 text-center text-sm text-[#A19D94]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card-dark p-10 text-center" data-testid="po-empty">
          <FileSignature size={28} className="mx-auto text-[#E8A020] mb-3" />
          <div className="text-base text-[#F0EDE8]">{pos.length === 0 ? "No purchase orders yet" : "No purchase orders match your filters"}</div>
          <p className="text-xs text-[#A19D94] mt-2 max-w-md mx-auto">Raise a PO before you order anything. It locks down price, quantity and delivery — protecting you against short deliveries and disputed invoices.</p>
          <button onClick={() => openNew()} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="po-empty-new"><Plus size={14} /> Raise your first Purchase Order</button>
        </div>
      ) : (
        <div className="space-y-2">{filtered.map(p => <PORow key={p.id} p={p} onEdit={() => openEdit(p)} onDelete={() => deletePO(p)} onDuplicate={() => duplicate(p)} onFav={() => toggleFav(p)} onMark={(s) => markStatus(p, s)} />)}</div>
      )}

      {wizardOpen && editing && (
        <POWizard initial={editing} user={user} jobs={jobs} suppliers={suppliers}
          onClose={() => { setWizardOpen(false); setEditing(null); }}
          onSaved={async () => { await loadAll(); setWizardOpen(false); setEditing(null); }}
          onTemplatesChanged={setTemplates}
          onSuppliersChanged={setSuppliers}
          pickSupplier={pickSupplier}
        />
      )}

      {supplierPanelOpen && (
        <SupplierPanel suppliers={suppliers} onClose={() => setSupplierPanelOpen(false)} onChanged={async () => {
          try { const r = await api.get("/purchase-orders/suppliers"); setSuppliers(r.data); } catch { /* ignore */ }
        }} />
      )}
    </div>
  );
}

function StatCard({ label, value, tone, testId }) {
  const t = tone === "red" ? "text-[#F27C7C]" : tone === "green" ? "text-[#68D391]" : tone === "gold" ? "text-[#E8A020]" : tone === "info" ? "text-[#A0A0F0]" : tone === "amber" ? "text-[#c8b464]" : "text-[#F0EDE8]";
  return (<div className="card-dark p-3" data-testid={testId}><Label>{label}</Label><div className={`mt-1 font-display text-2xl ${t}`}>{value}</div></div>);
}
function ValueCard({ label, value, sub, tone, testId }) {
  const t = tone === "green" ? "text-[#68D391]" : tone === "gold" ? "text-[#E8A020]" : "text-[#F0EDE8]";
  return (<div className="card-dark p-4" data-testid={testId}><Label>{label}</Label><div className={`mt-2 font-display text-2xl ${t}`}>{value}</div><div className="text-[11px] text-[#A19D94] mt-1">{sub}</div></div>);
}

function PORow({ p, onEdit, onDelete, onDuplicate, onFav, onMark }) {
  const status = p.status || "Draft";
  const statusCls = STATUS_BADGE[status] || STATUS_BADGE.Draft;
  const match = p.matchStatus || "Unmatched";
  const matchCls = MATCH_BADGE[match] || MATCH_BADGE.Unmatched;
  return (
    <div className="card-dark p-4 flex items-start gap-3" data-testid={`po-row-${p.id}`}>
      <button onClick={onFav} className={`p-1 mt-1 ${p.isFavourite ? "text-[#E8A020]" : "text-[#706D66] hover:text-[#E8A020]"}`} aria-label="Favourite"><Star size={14} fill={p.isFavourite ? "#E8A020" : "none"} /></button>
      <button onClick={onEdit} className="text-left flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base text-[#F0EDE8] font-medium truncate">{p.supplierName || p.supplierCompany || "Supplier"}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusCls}`}>{status}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#2a2620] text-[#A19D94]">{p.poRef || "no ref"}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#E8A020]/40 text-[#E8A020]">{fGBP((p.totals || {}).total || 0)}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${matchCls}`}>{match}</span>
        </div>
        <div className="text-xs text-[#A19D94] mt-1 truncate">{p.projectName || "—"} · Raised {p.poDate || "—"}{p.requiredDate ? ` · Required ${p.requiredDate}` : ""}</div>
      </button>
      <div className="flex gap-1 shrink-0">
        {status === "Draft" && <button onClick={() => onMark("Sent")} className="p-2 text-[#A19D94] hover:text-[#E8A020]" title="Mark as Sent" data-testid={`po-row-send-${p.id}`}><Send size={14} /></button>}
        {status === "Sent" && <button onClick={() => onMark("Approved")} className="p-2 text-[#A19D94] hover:text-[#68D391]" title="Mark as Approved" data-testid={`po-row-approve-${p.id}`}><CheckCircle2 size={14} /></button>}
        <button onClick={onEdit} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`po-row-edit-${p.id}`}><Edit2 size={14} /></button>
        <button onClick={onDuplicate} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`po-row-dup-${p.id}`}><Copy size={14} /></button>
        <button onClick={onDelete} className="p-2 text-[#A19D94] hover:text-[#F27C7C]" data-testid={`po-row-delete-${p.id}`}><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

// ================================================================
// SUPPLIERS PANEL
// ================================================================
function SupplierPanel({ suppliers, onClose, onChanged }) {
  const [editing, setEditing] = useState(null);
  const save = async () => {
    if (!editing) return;
    try {
      await api.post("/purchase-orders/suppliers", editing);
      toast.success(editing.id ? "Supplier updated" : "Supplier added");
      setEditing(null);
      await onChanged();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const del = async (s) => {
    if (!s.isSaved) return toast.info("Auto-tracked from PO — no saved record to remove");
    if (!window.confirm(`Delete supplier ${s.name || s.company}?`)) return;
    try { await api.delete(`/purchase-orders/suppliers/${s.id}`); await onChanged(); toast.success("Deleted"); }
    catch { toast.error("Delete failed"); }
  };
  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-y-auto" data-testid="po-supplier-panel">
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-4xl mx-auto card-dark p-5 md:p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-1">Procurement</div>
              <h2 className="font-display text-2xl text-[#F0EDE8]">Supplier register</h2>
              <p className="text-xs text-[#A19D94] mt-1">Every supplier you raise a Purchase Order for is auto-tracked here with total spend and delivery history.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setEditing({ name: "", company: "", contact: "", email: "", phone: "", address: "", vatNumber: "", accountNumber: "", paymentTerms: "", notes: "" })} className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="po-sup-add"><Plus size={14} /> Add supplier</button>
              <button onClick={onClose} className="text-[#A19D94] hover:text-[#F0EDE8]" data-testid="po-sup-close"><X size={20} /></button>
            </div>
          </div>

          {editing ? (
            <div className="card-dark p-4 mb-4" data-testid="po-sup-editor">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Supplier name"><input className={inputClass} value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="po-sup-name" /></Field>
                <Field label="Company"><input className={inputClass} value={editing.company || ""} onChange={(e) => setEditing({ ...editing, company: e.target.value })} data-testid="po-sup-company" /></Field>
                <Field label="Contact person"><input className={inputClass} value={editing.contact || ""} onChange={(e) => setEditing({ ...editing, contact: e.target.value })} /></Field>
                <Field label="Email"><input className={inputClass} type="email" value={editing.email || ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
                <Field label="Phone"><input className={inputClass} value={editing.phone || ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
                <Field label="Account number"><input className={inputClass} value={editing.accountNumber || ""} onChange={(e) => setEditing({ ...editing, accountNumber: e.target.value })} /></Field>
                <Field label="VAT number"><input className={inputClass} value={editing.vatNumber || ""} onChange={(e) => setEditing({ ...editing, vatNumber: e.target.value })} /></Field>
                <Field label="Payment terms"><input className={inputClass} value={editing.paymentTerms || ""} onChange={(e) => setEditing({ ...editing, paymentTerms: e.target.value })} placeholder="e.g. 30 days from invoice date" /></Field>
                <div className="md:col-span-2"><Field label="Address"><textarea className={`${inputClass} min-h-[60px]`} value={editing.address || ""} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></Field></div>
                <div className="md:col-span-2"><Field label="Notes"><textarea className={`${inputClass} min-h-[60px]`} value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field></div>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setEditing(null)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button>
                <button onClick={save} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="po-sup-save">Save supplier</button>
              </div>
            </div>
          ) : null}

          {suppliers.length === 0 ? (
            <div className="text-center py-8 text-sm text-[#A19D94]">No suppliers yet. They appear here automatically as you raise POs, or add them manually above.</div>
          ) : (
            <div className="space-y-2">
              {suppliers.map(s => (
                <div key={s.id} className="card-dark p-3 flex items-start gap-3" data-testid={`po-sup-row-${s.id}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-[#F0EDE8] font-medium truncate">{s.name || s.company || "—"}</span>
                      {s.company && s.name ? <span className="text-[11px] text-[#A19D94]">· {s.company}</span> : null}
                      {!s.isSaved && <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#2a2620] text-[#706D66]">Auto-tracked</span>}
                    </div>
                    <div className="text-[11px] text-[#A19D94] mt-1 truncate">{[s.email, s.phone].filter(Boolean).join(" · ") || "No contact details"}</div>
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                      <div><Label>POs raised</Label><div className="text-[#F0EDE8]">{s.poCount || 0}</div></div>
                      <div><Label>Total spend</Label><div className="text-[#E8A020]">{fGBP(s.totalSpend || 0)}</div></div>
                      <div><Label>Outstanding POs</Label><div className="text-[#c8b464]">{s.outstandingPOs || 0} · {fGBP(s.outstandingValue || 0)}</div></div>
                      <div><Label>Last PO</Label><div className="text-[#A19D94] truncate">{s.lastPORef || "—"}</div></div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setEditing({ id: s.isSaved ? s.id : undefined, name: s.name || "", company: s.company || "", contact: s.contact || "", email: s.email || "", phone: s.phone || "", address: s.address || "", vatNumber: s.vatNumber || "", accountNumber: s.accountNumber || "", paymentTerms: s.paymentTerms || "", notes: s.notes || "" })} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`po-sup-edit-${s.id}`}><Edit2 size={14} /></button>
                    <button onClick={() => del(s)} className="p-2 text-[#A19D94] hover:text-[#F27C7C]" data-testid={`po-sup-del-${s.id}`}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ================================================================
// WIZARD
// ================================================================
function POWizard({ initial, user, jobs, suppliers, onClose, onSaved, onTemplatesChanged, onSuppliersChanged, pickSupplier }) {
  const [data, setData] = useState(initial);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [signingOpen, setSigningOpen] = useState(false);
  const [receiptDraft, setReceiptDraft] = useState(null);
  const [invoiceDraft, setInvoiceDraft] = useState(null);

  useEffect(() => { if (user?.fullName && !data.preparedBy) setData(d => ({ ...d, preparedBy: user.fullName })); }, [user?.fullName]);   
  useEffect(() => { if (!data.id) { const t = setTimeout(() => saveDraft(data), 500); return () => clearTimeout(t); } }, [data]);

  const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));
  const totals = useMemo(() => computeTotals(data), [data]);

  const pickProject = (id) => {
    const j = jobs.find(x => x.id === id); if (!j) return;
    setData(d => ({
      ...d, projectId: j.id,
      projectName: j.projectName || j.clientName || d.projectName,
      projectAddress: j.address || d.projectAddress,
      deliveryAddress: d.deliveryAddress || j.address || "",
    }));
  };
  const chooseSupplier = (id) => {
    const sup = suppliers.find(x => x.id === id); if (!sup) return;
    const base = { ...data };
    pickSupplier(sup, base);
    setData(base);
  };

  // Line items
  const addLine = () => setData(d => ({ ...d, lineItems: [...(d.lineItems || []), emptyLine()] }));
  const updLine = (id, patch) => setData(d => ({ ...d, lineItems: d.lineItems.map(x => x.id === id ? { ...x, ...patch } : x) }));
  const delLine = (id) => setData(d => ({ ...d, lineItems: d.lineItems.filter(x => x.id !== id) }));
  const dupLine = (id) => setData(d => { const l = d.lineItems.find(x => x.id === id); if (!l) return d; return { ...d, lineItems: [...d.lineItems, { ...l, id: crypto.randomUUID() }] }; });

  const generatePreview = () => {
    try { setPreviewUrl(purchaseOrderPdfBlobUrl({ data: { ...data, totals }, user, today: new Date().toLocaleDateString("en-GB") })); }
    catch { toast.error("Preview failed"); }
  };

  const saveEntry = async () => {
    if (!data.projectName && !data.projectId) { toast.error("Project is required"); setStep(1); return; }
    if (!data.supplierName && !data.supplierCompany) { toast.error("Supplier is required"); setStep(2); return; }
    setSaving(true);
    try {
      let saved;
      const payload = { ...data };
      // strip fields that only exist client-side / are computed
      delete payload.matchedInvoices;
      delete payload.delivery;
      delete payload.history;
      if (data.id) { const r = await api.patch(`/purchase-orders/purchase-orders/${data.id}`, payload); saved = r.data; }
      else { const r = await api.post("/purchase-orders/purchase-orders", payload); saved = r.data; }
      // Save summary to Document Library
      try {
        await api.post("/documents/save", {
          title: `Purchase Order — ${data.supplierName || data.supplierCompany || "Supplier"}`,
          toolId: TOOL_ID, refNumber: saved.poRef, jobId: data.projectId || null,
          content: `PURCHASE ORDER ${saved.poRef}\n${data.projectName || ""}\nSupplier: ${data.supplierName || data.supplierCompany || "—"}\nStatus: ${saved.status}\nTotal: ${fGBP((saved.totals || {}).total || 0)}\n\nItems: ${(data.lineItems || []).length}`,
          metadata: { ...saved },
        });
      } catch { /* soft-fail */ }
      downloadPurchaseOrderPdf({ data: saved, user, today: new Date().toLocaleDateString("en-GB") });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      toast.success("Purchase Order saved");
      // Refresh suppliers list
      try { const r = await api.get("/purchase-orders/suppliers"); onSuppliersChanged(r.data); } catch { /* ignore */ }
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  const saveAsTemplate = async () => {
    if (!tplName.trim()) return toast.error("Template name required");
    try {
      const payload = { ...data, id: undefined, poRef: undefined, poDate: undefined, status: "Draft", preparedSignature: "", approvedBy: "", approvedDate: "", photoIds: [], goodsReceived: [], matchedInvoiceIds: [] };
      delete payload.matchedInvoices;
      await api.post("/purchase-orders/templates", { name: tplName.trim(), payload });
      toast.success("Template saved");
      setTplModalOpen(false); setTplName("");
      const lst = await api.get("/purchase-orders/templates"); onTemplatesChanged(lst.data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  // Goods receipt
  const openReceipt = () => {
    if (!data.id) return toast.error("Save the PO first");
    setReceiptDraft({
      date: new Date().toISOString().slice(0, 10),
      receivedBy: user?.fullName || "",
      deliveryNoteRef: "",
      notes: "",
      lines: (data.lineItems || []).map(l => ({ lineItemId: l.id, description: l.description, qtyOrdered: l.qty, qty: 0, unit: l.unit })),
    });
  };
  const submitReceipt = async () => {
    if (!receiptDraft) return;
    const validLines = (receiptDraft.lines || []).filter(l => Number(l.qty) > 0).map(l => ({ lineItemId: l.lineItemId, description: l.description, qty: Number(l.qty) }));
    if (!validLines.length) return toast.error("Enter received quantities for at least one line");
    try {
      const r = await api.post(`/purchase-orders/purchase-orders/${data.id}/goods-received`, {
        date: receiptDraft.date, receivedBy: receiptDraft.receivedBy,
        deliveryNoteRef: receiptDraft.deliveryNoteRef, notes: receiptDraft.notes, lines: validLines,
      });
      toast.success("Goods received recorded");
      setData(d => ({ ...d, ...r.data }));
      setReceiptDraft(null);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  // Invoice match
  const openInvoice = () => {
    if (!data.id) return toast.error("Save the PO first");
    setInvoiceDraft({
      invoiceNumber: "", invoiceDate: new Date().toISOString().slice(0, 10),
      dueDate: "", amount: (totals.total || 0), fileUrl: "", fileName: "", notes: "",
    });
  };
  const submitInvoice = async () => {
    if (!invoiceDraft) return;
    if (!invoiceDraft.invoiceNumber.trim()) return toast.error("Invoice number required");
    if (!(Number(invoiceDraft.amount) > 0)) return toast.error("Amount must be greater than zero");
    try {
      const r = await api.post(`/purchase-orders/purchase-orders/${data.id}/match-invoice`, {
        invoiceNumber: invoiceDraft.invoiceNumber, invoiceDate: invoiceDraft.invoiceDate,
        dueDate: invoiceDraft.dueDate, amount: Number(invoiceDraft.amount),
        fileUrl: invoiceDraft.fileUrl, fileName: invoiceDraft.fileName, notes: invoiceDraft.notes,
      });
      toast.success("Supplier invoice drafted — review to approve");
      setData(d => ({ ...d, ...r.data }));
      setInvoiceDraft(null);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const approveInvoice = async (sid) => {
    try {
      await api.post(`/purchase-orders/matched-invoices/${sid}/approve`);
      toast.success("Supplier invoice approved");
      const r = await api.get(`/purchase-orders/purchase-orders/${data.id}`);
      setData(d => ({ ...d, ...r.data }));
    } catch { toast.error("Failed"); }
  };
  const payInvoice = async (sid) => {
    try {
      await api.post(`/purchase-orders/matched-invoices/${sid}/pay`);
      toast.success("Supplier invoice marked paid");
      const r = await api.get(`/purchase-orders/purchase-orders/${data.id}`);
      setData(d => ({ ...d, ...r.data }));
    } catch { toast.error("Failed"); }
  };
  const unlinkInvoice = async (sid) => {
    if (!window.confirm("Remove this matched invoice?")) return;
    try {
      const r = await api.delete(`/purchase-orders/purchase-orders/${data.id}/matched-invoice/${sid}`);
      setData(d => ({ ...d, ...r.data }));
      toast.success("Invoice unlinked");
    } catch { toast.error("Failed"); }
  };

  const delivery = data.delivery || { qtyOrdered: 0, qtyReceived: 0, percent: 0 };
  const totalOrderedQty = (data.lineItems || []).reduce((a, l) => a + (Number(l.qty) || 0), 0);
  const totalReceivedQty = (data.goodsReceived || []).reduce((a, r) => a + (r.lines || []).reduce((b, l) => b + (Number(l.qty) || 0), 0), 0);
  const percentReceived = totalOrderedQty > 0 ? Math.min(100, (totalReceivedQty / totalOrderedQty * 100)) : delivery.percent;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-y-auto" data-testid="po-wizard">
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-5xl mx-auto card-dark p-5 md:p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-1">{data.id ? "Edit" : "New"} Purchase Order</div>
              <h2 className="font-display text-2xl text-[#F0EDE8]">{data.supplierName || data.supplierCompany || "Untitled"} <span className="text-sm text-[#A19D94]">· {fGBP(totals.total)}</span></h2>
            </div>
            <button onClick={onClose} className="text-[#A19D94] hover:text-[#F0EDE8]" data-testid="po-wizard-close"><X size={20} /></button>
          </div>

          <div className="flex justify-end mb-3">
            <button onClick={() => setTplModalOpen(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="po-save-template-btn"><Save size={12} /> Save as template</button>
          </div>

          <div className="overflow-x-auto mb-5" data-testid="po-stepper">
            <div className="flex gap-1 min-w-max">
              {WIZARD_STEPS.map(s => (
                <button key={s.id} onClick={() => setStep(s.id)} data-testid={`po-step-${s.id}`}
                  className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${step === s.id ? "bg-[#E8A020] text-black" : step > s.id ? "bg-[#1e1a12] text-[#68D391] border border-[#68D391]/30" : "bg-[#0f0d09] text-[#A19D94] border border-[#2a2620]"}`}>
                  {s.id}. {s.label}
                </button>
              ))}
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-4" data-testid="po-step-1-project">
              {jobs.length > 0 && (
                <Field label="Link to project (required)">
                  <select value={data.projectId} onChange={(e) => pickProject(e.target.value)} className={inputClass} data-testid="po-link-project">
                    <option value="">Select a project</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.projectName || j.clientName}</option>)}
                  </select>
                </Field>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Project name"><input className={inputClass} value={data.projectName} onChange={(e) => set("projectName")(e.target.value)} data-testid="po-projectName" /></Field>
                <Field label="Site address"><textarea className={`${inputClass} min-h-[52px]`} value={data.projectAddress} onChange={(e) => set("projectAddress")(e.target.value)} data-testid="po-projectAddress" /></Field>
                <Field label="Internal reference (optional)" hint="e.g. cost code, job code, or your own PO tracking reference"><input className={inputClass} value={data.reference} onChange={(e) => set("reference")(e.target.value)} data-testid="po-reference" /></Field>
                <Field label="Required by date"><input type="date" className={inputClass} value={data.requiredDate} onChange={(e) => set("requiredDate")(e.target.value)} data-testid="po-requiredDate" /></Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4" data-testid="po-step-2-supplier">
              {suppliers.length > 0 && (
                <Field label="Choose from supplier register" hint="Or fill in the details below to add a new supplier.">
                  <select value={data.supplierId} onChange={(e) => chooseSupplier(e.target.value)} className={inputClass} data-testid="po-link-supplier">
                    <option value="">-- new supplier --</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name || s.company} {s.company && s.name ? `(${s.company})` : ""}</option>)}
                  </select>
                </Field>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Supplier name"><input className={inputClass} value={data.supplierName} onChange={(e) => set("supplierName")(e.target.value)} data-testid="po-supplierName" /></Field>
                <Field label="Supplier company"><input className={inputClass} value={data.supplierCompany} onChange={(e) => set("supplierCompany")(e.target.value)} data-testid="po-supplierCompany" /></Field>
                <Field label="Contact person"><input className={inputClass} value={data.supplierContact} onChange={(e) => set("supplierContact")(e.target.value)} /></Field>
                <Field label="Email"><input type="email" className={inputClass} value={data.supplierEmail} onChange={(e) => set("supplierEmail")(e.target.value)} data-testid="po-supplierEmail" /></Field>
                <Field label="Phone"><input className={inputClass} value={data.supplierPhone} onChange={(e) => set("supplierPhone")(e.target.value)} /></Field>
                <Field label="Account number"><input className={inputClass} value={data.supplierAccountNumber} onChange={(e) => set("supplierAccountNumber")(e.target.value)} /></Field>
                <Field label="VAT number"><input className={inputClass} value={data.supplierVatNumber} onChange={(e) => set("supplierVatNumber")(e.target.value)} /></Field>
                <Field label="Payment terms">
                  <select className={inputClass} value={data.paymentTerms} onChange={(e) => set("paymentTerms")(e.target.value)}>
                    {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <div className="md:col-span-2"><Field label="Supplier address"><textarea className={`${inputClass} min-h-[60px]`} value={data.supplierAddress} onChange={(e) => set("supplierAddress")(e.target.value)} /></Field></div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3" data-testid="po-step-3-items">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Order items · {(data.lineItems || []).length}</div>
                <button onClick={addLine} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#E8A020] text-black text-xs font-medium" data-testid="po-add-line"><Plus size={12} /> Add line</button>
              </div>
              {(data.lineItems || []).map((it, i) => (
                <div key={it.id} className="card-dark p-3" data-testid={`po-line-${i + 1}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Line {i + 1} · <span className="text-[#F0EDE8]">{fGBP((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}</span></span>
                    <div className="flex gap-2"><button onClick={() => dupLine(it.id)} className="text-[#A19D94] hover:text-[#E8A020]"><Copy size={12} /></button><button onClick={() => delLine(it.id)} className="text-[#A19D94] hover:text-[#F27C7C]"><Trash2 size={12} /></button></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                    <Field label="Category">
                      <select className={inputClass} value={it.category} onChange={(e) => updLine(it.id, { category: e.target.value })} data-testid={`po-line-cat-${i + 1}`}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </Field>
                    <div className="md:col-span-2"><Field label="Description"><input className={inputClass} value={it.description} onChange={(e) => updLine(it.id, { description: e.target.value })} data-testid={`po-line-desc-${i + 1}`} /></Field></div>
                    <Field label="Product code (optional)"><input className={inputClass} value={it.productCode || ""} onChange={(e) => updLine(it.id, { productCode: e.target.value })} /></Field>
                    <Field label="Qty"><input type="number" step="0.01" className={inputClass} value={it.qty} onChange={(e) => updLine(it.id, { qty: e.target.value })} data-testid={`po-line-qty-${i + 1}`} /></Field>
                    <Field label="Unit">
                      <select className={inputClass} value={it.unit} onChange={(e) => updLine(it.id, { unit: e.target.value })}>
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </Field>
                    <div className="md:col-span-5"><Field label="Unit price (£)"><input type="number" step="0.01" className={inputClass} value={it.unitPrice} onChange={(e) => updLine(it.id, { unitPrice: e.target.value })} data-testid={`po-line-price-${i + 1}`} /></Field></div>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Discount (£)"><input type="number" step="0.01" className={inputClass} value={data.discount} onChange={(e) => set("discount")(Number(e.target.value))} /></Field>
                <Field label="Delivery charge (£)"><input type="number" step="0.01" className={inputClass} value={data.deliveryCharge} onChange={(e) => set("deliveryCharge")(Number(e.target.value))} /></Field>
                <Field label="VAT treatment">
                  <select className={inputClass} value={data.vatTreatment} onChange={(e) => set("vatTreatment")(e.target.value)} data-testid="po-vatTreatment">
                    {VAT_TREATMENTS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </Field>
              </div>
              <div className="card-dark p-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                  <div><Label>Subtotal</Label><div className="text-[#F0EDE8] mt-1">{fGBP(totals.subtotal)}</div></div>
                  <div><Label>Discount</Label><div className="text-[#F0EDE8] mt-1">- {fGBP(totals.discount)}</div></div>
                  <div><Label>Delivery</Label><div className="text-[#F0EDE8] mt-1">{fGBP(totals.deliveryCharge)}</div></div>
                  <div><Label>VAT {totals.vatRate ? `(${totals.vatRate}%)` : ""}</Label><div className="text-[#F0EDE8] mt-1">{fGBP(totals.vatAmount)}</div></div>
                  <div><Label>Total</Label><div className="text-[#E8A020] mt-1 text-lg font-medium">{fGBP(totals.total)}</div></div>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4" data-testid="po-step-4-delivery">
              <Field label="Delivery address" hint="Where the supplier should deliver to. Defaults to the site address."><textarea className={`${inputClass} min-h-[60px]`} value={data.deliveryAddress} onChange={(e) => set("deliveryAddress")(e.target.value)} data-testid="po-deliveryAddress" /></Field>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Site contact"><input className={inputClass} value={data.deliveryContact} onChange={(e) => set("deliveryContact")(e.target.value)} /></Field>
                <Field label="Site phone"><input className={inputClass} value={data.deliveryPhone} onChange={(e) => set("deliveryPhone")(e.target.value)} /></Field>
                <Field label="Requested delivery date"><input type="date" className={inputClass} value={data.deliveryDate} onChange={(e) => set("deliveryDate")(e.target.value)} data-testid="po-deliveryDate" /></Field>
              </div>
              <Field label="Delivery instructions (access, times, forklift on site, etc.)"><textarea className={`${inputClass} min-h-[80px]`} value={data.deliveryInstructions} onChange={(e) => set("deliveryInstructions")(e.target.value)} /></Field>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4" data-testid="po-step-5-review">
              <div className="card-dark p-4 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">Review everything before you approve. Once approved, the PO is locked and ready to send to the supplier.</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="card-dark p-4"><Label>Supplier</Label><div className="mt-1 text-sm text-[#F0EDE8]">{data.supplierName || data.supplierCompany || "—"}</div><div className="text-[11px] text-[#A19D94]">{data.supplierEmail || data.supplierPhone || ""}</div></div>
                <div className="card-dark p-4"><Label>Project</Label><div className="mt-1 text-sm text-[#F0EDE8]">{data.projectName || "—"}</div><div className="text-[11px] text-[#A19D94]">{data.projectAddress || ""}</div></div>
                <div className="card-dark p-4"><Label>Order value</Label><div className="mt-1 text-lg text-[#E8A020]">{fGBP(totals.total)}</div><div className="text-[11px] text-[#A19D94]">{(data.lineItems || []).length} lines · VAT {data.vatTreatment}</div></div>
                <div className="card-dark p-4"><Label>Delivery</Label><div className="mt-1 text-sm text-[#F0EDE8]">{data.deliveryDate || data.requiredDate || "Not set"}</div><div className="text-[11px] text-[#A19D94]">{data.deliveryAddress || "Site address"}</div></div>
              </div>
              <div className="card-dark p-4">
                <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-3">Approval</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Prepared by"><input className={inputClass} value={data.preparedBy || user?.fullName || ""} onChange={(e) => set("preparedBy")(e.target.value)} data-testid="po-preparedBy" /></Field>
                  <div>
                    <Label>Contractor signature</Label>
                    <div className="mt-1 flex items-center gap-3">
                      {data.preparedSignature ? <img alt="Signature" src={data.preparedSignature} className="h-12 w-40 rounded-md border border-[#2a2620] bg-white" /> : <div className="h-12 w-40 rounded-md border border-dashed border-[#2a2620] flex items-center justify-center text-[10px] text-[#706D66]">Not signed</div>}
                      <button onClick={() => setSigningOpen(true)} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="po-sign-prepared"><PenTool size={12} /> {data.preparedSignature ? "Re-sign" : "Sign"}</button>
                    </div>
                  </div>
                  <Field label="Approved by"><input className={inputClass} value={data.approvedBy} onChange={(e) => set("approvedBy")(e.target.value)} placeholder="Name of approver" data-testid="po-approvedBy" /></Field>
                  <Field label="Approved date"><input type="date" className={inputClass} value={data.approvedDate} onChange={(e) => set("approvedDate")(e.target.value)} /></Field>
                </div>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4" data-testid="po-step-6-issue">
              <Field label="Status">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {["Draft", "Sent", "Approved", "Ordered", "Cancelled"].map(s => (
                    <button key={s} onClick={() => set("status")(s)} className={`px-3 py-2 rounded-md text-xs border ${data.status === s ? "bg-[#E8A020] text-black border-[#E8A020]" : "border-[#2a2620] text-[#F0EDE8] hover:border-[#E8A020]"}`} data-testid={`po-status-${s}`}>{s}</button>
                  ))}
                </div>
              </Field>
              <Field label="Terms & conditions"><textarea className={`${inputClass} min-h-[100px]`} value={data.terms} onChange={(e) => set("terms")(e.target.value)} /></Field>
              <Field label="Additional notes (internal or for the supplier)"><textarea className={`${inputClass} min-h-[60px]`} value={data.notes} onChange={(e) => set("notes")(e.target.value)} /></Field>
              <div className="card-dark p-3 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">Send the PDF to the supplier once you set the status to Sent. The full audit trail (status changes, deliveries, invoice matches) is recorded automatically from here on.</div>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-4" data-testid="po-step-7-receive">
              <div className="card-dark p-4">
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Ordered</Label><div className="text-2xl text-[#F0EDE8] mt-1">{Number(totalOrderedQty || 0).toFixed(2).replace(/\.00$/, "")}</div></div>
                  <div><Label>Received</Label><div className="text-2xl text-[#68D391] mt-1">{Number(totalReceivedQty || 0).toFixed(2).replace(/\.00$/, "")}</div></div>
                  <div><Label>Progress</Label><div className="text-2xl text-[#E8A020] mt-1">{Math.round(percentReceived)}%</div></div>
                </div>
              </div>

              {(data.goodsReceived || []).length > 0 ? (
                <div className="space-y-2">
                  {(data.goodsReceived || []).map(r => (
                    <div key={r.id} className="card-dark p-3">
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <div className="text-sm text-[#F0EDE8]">Delivery {r.date}{r.deliveryNoteRef ? ` · Note ${r.deliveryNoteRef}` : ""}</div>
                          <div className="text-[11px] text-[#A19D94]">Received by {r.receivedBy || "—"} · {(r.lines || []).length} lines</div>
                        </div>
                      </div>
                      {r.notes && <div className="text-[11px] text-[#A19D94] mt-2">{r.notes}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="card-dark p-4 text-center text-sm text-[#A19D94]">No deliveries recorded yet.</div>
              )}

              <button onClick={openReceipt} disabled={!data.id} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-40" data-testid="po-open-receipt"><Truck size={14} /> Record goods received</button>
              {!data.id && <div className="text-[11px] text-[#706D66]">Save the PO first, then record deliveries.</div>}
            </div>
          )}

          {step === 8 && (
            <div className="space-y-4" data-testid="po-step-8-invoice">
              <div className="card-dark p-4 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">When a supplier invoice arrives, match it here. Morris will auto-create a draft supplier invoice — you review and approve it before it becomes live and flows into Commercial Reports.</div>

              <div className="card-dark p-4">
                <Label>Match status</Label>
                <div className={`mt-1 inline-block text-xs px-3 py-1 rounded-full border ${MATCH_BADGE[data.matchStatus || "Unmatched"]}`}>{data.matchStatus || "Unmatched"}</div>
              </div>

              {(data.matchedInvoices || []).length > 0 ? (
                <div className="space-y-2">
                  {(data.matchedInvoices || []).map(inv => (
                    <div key={inv.id} className="card-dark p-3" data-testid={`po-inv-${inv.id}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-[#F0EDE8]">Invoice {inv.invoiceNumber}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${inv.status === "Paid" ? "border-[#68D391]/40 text-[#68D391]" : inv.status === "Approved" ? "border-[#E8A020]/40 text-[#E8A020]" : "border-[#2a2620] text-[#A19D94]"}`}>{inv.status}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#E8A020]/40 text-[#E8A020]">{fGBP(inv.amount)}</span>
                          </div>
                          <div className="text-[11px] text-[#A19D94] mt-1">{inv.invoiceDate || "—"}{inv.dueDate ? ` · due ${inv.dueDate}` : ""}{inv.fileName ? ` · ${inv.fileName}` : ""}</div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {inv.status === "Draft" && <button onClick={() => approveInvoice(inv.id)} className="p-2 text-[#A19D94] hover:text-[#68D391]" title="Approve" data-testid={`po-inv-approve-${inv.id}`}><CheckCircle2 size={14} /></button>}
                          {inv.status === "Approved" && <button onClick={() => payInvoice(inv.id)} className="p-2 text-[#A19D94] hover:text-[#68D391]" title="Mark paid" data-testid={`po-inv-pay-${inv.id}`}><PoundSterling size={14} /></button>}
                          <button onClick={() => unlinkInvoice(inv.id)} className="p-2 text-[#A19D94] hover:text-[#F27C7C]" title="Unlink" data-testid={`po-inv-unlink-${inv.id}`}><Trash2 size={14} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="card-dark p-4 text-center text-sm text-[#A19D94]">No supplier invoices matched to this PO yet.</div>
              )}

              <button onClick={openInvoice} disabled={!data.id} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-40" data-testid="po-open-invoice"><Receipt size={14} /> Match supplier invoice</button>
              {!data.id && <div className="text-[11px] text-[#706D66]">Save the PO first, then match invoices.</div>}
            </div>
          )}

          {step === 9 && (
            <div className="space-y-4" data-testid="po-step-9-generate">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="card-dark p-3"><Label>Line items</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.lineItems || []).length}</div></div>
                <div className="card-dark p-3"><Label>Deliveries</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.goodsReceived || []).length}</div></div>
                <div className="card-dark p-3"><Label>Matched invoices</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.matchedInvoices || []).length}</div></div>
                <div className="card-dark p-3"><Label>Total (inc VAT)</Label><div className="text-2xl text-[#E8A020] mt-1">{fGBP(totals.total)}</div></div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={generatePreview} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#F0EDE8] hover:border-[#E8A020]" data-testid="po-preview-btn"><RefreshCw size={14} /> {previewUrl ? "Refresh" : "Generate"} preview</button>
                <button onClick={saveEntry} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-60" data-testid="po-save-btn"><Download size={16} /> {saving ? "Saving..." : "Save & Generate PDF"}</button>
              </div>
              {previewUrl && <iframe title="PO Preview" src={previewUrl} className="w-full h-[500px] rounded-md border border-[#2a2620] bg-white" data-testid="po-preview-iframe" />}
            </div>
          )}

          <div className="flex items-center justify-between mt-6">
            <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94] disabled:opacity-40" data-testid="po-btn-prev"><ChevronLeft size={14} /> Back</button>
            <span className="text-xs text-[#706D66]">Step {step} of {WIZARD_STEPS.length}</span>
            <button onClick={() => setStep(Math.min(WIZARD_STEPS.length, step + 1))} disabled={step === WIZARD_STEPS.length} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-40" data-testid="po-btn-next">Next <ChevronRight size={14} /></button>
          </div>
        </div>

        {tplModalOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="po-template-modal">
            <div className="card-dark p-6 max-w-md w-full">
              <div className="flex items-start justify-between mb-3"><h3 className="font-display text-2xl text-[#F0EDE8]">Save as template</h3><button onClick={() => setTplModalOpen(false)} className="text-[#A19D94]"><X size={18} /></button></div>
              <Field label="Template name"><input className={inputClass} value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Standard timber PO" data-testid="po-template-name" /></Field>
              <div className="flex gap-2 mt-4"><button onClick={() => setTplModalOpen(false)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button><button onClick={saveAsTemplate} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="po-template-save">Save</button></div>
            </div>
          </div>
        )}

        {signingOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="po-sign-modal">
            <div className="card-dark p-5 max-w-lg w-full">
              <div className="flex items-start justify-between mb-3"><h3 className="font-display text-xl text-[#F0EDE8]">Contractor signature</h3><button onClick={() => setSigningOpen(false)} className="text-[#A19D94]"><X size={18} /></button></div>
              <SignaturePad value={data.preparedSignature || ""} onChange={(v) => set("preparedSignature")(v)} />
              <div className="flex gap-2 mt-3"><button onClick={() => setSigningOpen(false)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button><button onClick={() => setSigningOpen(false)} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="po-sign-done">Done</button></div>
            </div>
          </div>
        )}

        {receiptDraft && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="po-receipt-modal">
            <div className="card-dark p-5 max-w-3xl w-full max-h-[85vh] overflow-y-auto">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-display text-xl text-[#F0EDE8]">Record goods received</h3>
                <button onClick={() => setReceiptDraft(null)} className="text-[#A19D94]"><X size={18} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <Field label="Date"><input type="date" className={inputClass} value={receiptDraft.date} onChange={(e) => setReceiptDraft({ ...receiptDraft, date: e.target.value })} data-testid="po-receipt-date" /></Field>
                <Field label="Received by"><input className={inputClass} value={receiptDraft.receivedBy} onChange={(e) => setReceiptDraft({ ...receiptDraft, receivedBy: e.target.value })} /></Field>
                <Field label="Delivery note ref"><input className={inputClass} value={receiptDraft.deliveryNoteRef} onChange={(e) => setReceiptDraft({ ...receiptDraft, deliveryNoteRef: e.target.value })} data-testid="po-receipt-note" /></Field>
              </div>
              <div className="space-y-2">
                {receiptDraft.lines.map((l, i) => (
                  <div key={l.lineItemId || i} className="card-dark p-3 grid grid-cols-1 md:grid-cols-4 gap-2 items-end" data-testid={`po-receipt-line-${i}`}>
                    <div className="md:col-span-2"><Label>Item</Label><div className="text-sm text-[#F0EDE8] mt-1">{l.description || "—"}</div></div>
                    <div><Label>Ordered</Label><div className="text-sm text-[#A19D94] mt-1">{l.qtyOrdered} {l.unit}</div></div>
                    <Field label="Received now"><input type="number" step="0.01" className={inputClass} value={l.qty} onChange={(e) => setReceiptDraft({ ...receiptDraft, lines: receiptDraft.lines.map((x, j) => j === i ? { ...x, qty: e.target.value } : x) })} data-testid={`po-receipt-qty-${i}`} /></Field>
                  </div>
                ))}
              </div>
              <Field label="Notes"><textarea className={`${inputClass} min-h-[60px] mt-3`} value={receiptDraft.notes} onChange={(e) => setReceiptDraft({ ...receiptDraft, notes: e.target.value })} /></Field>
              <div className="flex gap-2 mt-4"><button onClick={() => setReceiptDraft(null)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button><button onClick={submitReceipt} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="po-receipt-save">Save receipt</button></div>
            </div>
          </div>
        )}

        {invoiceDraft && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="po-invoice-modal">
            <div className="card-dark p-5 max-w-2xl w-full">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-display text-xl text-[#F0EDE8]">Match supplier invoice</h3>
                <button onClick={() => setInvoiceDraft(null)} className="text-[#A19D94]"><X size={18} /></button>
              </div>
              <div className="text-[11px] text-[#A19D94] mb-3">Morris will create a draft supplier invoice — the PO stays permanently linked and the match status updates automatically.</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Invoice number"><input className={inputClass} value={invoiceDraft.invoiceNumber} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, invoiceNumber: e.target.value })} data-testid="po-inv-number" /></Field>
                <Field label="Invoice date"><input type="date" className={inputClass} value={invoiceDraft.invoiceDate} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, invoiceDate: e.target.value })} data-testid="po-inv-date" /></Field>
                <Field label="Due date"><input type="date" className={inputClass} value={invoiceDraft.dueDate} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, dueDate: e.target.value })} /></Field>
                <Field label="Amount (£, inc VAT)"><input type="number" step="0.01" className={inputClass} value={invoiceDraft.amount} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, amount: e.target.value })} data-testid="po-inv-amount" /></Field>
                <Field label="File name (optional)"><input className={inputClass} value={invoiceDraft.fileName} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, fileName: e.target.value })} placeholder="e.g. jewson-INV-4501.pdf" /></Field>
                <Field label="File URL (optional)"><input className={inputClass} value={invoiceDraft.fileUrl} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, fileUrl: e.target.value })} /></Field>
                <div className="md:col-span-2"><Field label="Notes"><textarea className={`${inputClass} min-h-[50px]`} value={invoiceDraft.notes} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, notes: e.target.value })} /></Field></div>
              </div>
              <div className="flex gap-2 mt-4"><button onClick={() => setInvoiceDraft(null)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button><button onClick={submitInvoice} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="po-inv-save">Create draft</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
