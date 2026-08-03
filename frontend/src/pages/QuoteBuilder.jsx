// Morris — Quote Builder V2 (Flagship estimating & quotation system)
// Dashboard-first: stat cards by status + client library + templates + filters.
// 9-step wizard: Client → Project → Scope → Line Items → Optional Sections
// → Stage Payments → Terms & Validity → Review & Client Acceptance → Preview & PDF.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus, Search, RefreshCw, Trash2, Edit2, X, ChevronLeft, ChevronRight,
  Users, ClipboardList, FileText, ListChecks, PoundSterling, Calendar,
  ScrollText, Send, Download, PenTool, Copy, Star, Save, CheckCircle2, User,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import SignaturePad from "../components/SignaturePad";
import { downloadQuotePdf, quotePdfBlobUrl } from "../lib/quote-builder-pdf";

const TOOL_ID = "quote-builder";
const DRAFT_KEY = "morris.tool_draft.quote-builder";

const WIZARD_STEPS = [
  { id: 1, key: "client",   label: "Client",              icon: User },
  { id: 2, key: "project",  label: "Project",             icon: ClipboardList },
  { id: 3, key: "scope",    label: "Scope",               icon: FileText },
  { id: 4, key: "items",    label: "Line Items",          icon: ListChecks },
  { id: 5, key: "optional", label: "Optional Sections",   icon: ScrollText },
  { id: 6, key: "stage",    label: "Stage Payments",      icon: Calendar },
  { id: 7, key: "terms",    label: "Terms & Validity",    icon: PoundSterling },
  { id: 8, key: "review",   label: "Review & Acceptance", icon: CheckCircle2 },
  { id: 9, key: "generate", label: "Preview & Generate",  icon: Download },
];

const CATEGORIES = ["Labour", "Materials", "Plant & Equipment", "Subcontractor", "Other"];
const UNITS = ["item", "hour", "day", "week", "m", "m²", "m³", "tonne", "kg", "each", "set", "load"];
const STATUSES = ["Draft", "Sent", "Accepted", "Rejected", "Expired"];

const inputClass = "w-full bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none";
const Label = ({ children }) => <label className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">{children}</label>;
const Field = ({ label, children, hint }) => (
  <div><Label>{label}</Label><div className="mt-1">{children}</div>{hint && <div className="text-[11px] text-[#706D66] mt-1">{hint}</div>}</div>
);
const fGBP = (n) => `£${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

const emptyLine = () => ({ id: crypto.randomUUID(), category: "Labour", description: "", qty: 1, unit: "day", unitPrice: 0, notes: "" });
const emptyQuote = () => {
  const in30 = new Date(); in30.setDate(in30.getDate() + 30);
  return {
    clientId: "", clientName: "", clientCompany: "", clientEmail: "", clientPhone: "", clientAddress: "",
    projectId: "", projectName: "", projectAddress: "", projectDescription: "", projectDuration: "", startDate: "",
    quoteRef: "", quoteDate: new Date().toISOString().slice(0, 10), validUntil: in30.toISOString().slice(0, 10),
    status: "Draft",
    scopeOfWorks: "",
    lineItems: [emptyLine()],
    exclusions: "Materials price fluctuations more than 10% between quote date and start on site.\nWorks outside the scope described above.\nOut-of-hours work unless expressly agreed.",
    assumptions: "Safe and unimpeded access to the works.\nWelfare, power and water available on site at no cost.\nWorking hours 08:00 – 17:00 Monday to Friday.",
    provisionalSums: [],
    stagePayments: [],
    discount: { type: "percent", value: 0 },
    vatRate: 20,
    paymentTerms: "Payment due 14 days from the date of each invoice. Interest may be charged under the Late Payment of Commercial Debts (Interest) Act 1998 at 8% + Bank of England base rate on any late payments.",
    notes: "",
    preparedBy: "", preparedSignature: "",
    clientAcceptanceName: "", clientAcceptanceSignature: "", acceptedDate: "",
    isFavourite: false,
  };
};

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
  const provTotal = (data.provisionalSums || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const disc = data.discount || {};
  const discountAmount = disc.type === "fixed" ? Number(disc.value || 0) : subtotal * (Number(disc.value || 0) / 100);
  const net = Math.max(0, subtotal - discountAmount + provTotal);
  const vatAmount = net * (Number(data.vatRate ?? 20) / 100);
  return { subtotal, byCategory: byCat, provisionalSumTotal: provTotal, discountAmount, net, vatAmount, total: net + vatAmount };
}

export default function QuoteBuilderV2() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const openParamId = params.get("open") || "";
  const [quotes, setQuotes] = useState([]);
  const [stats, setStats] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [clients, setClients] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [editing, setEditing] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [qRes, sRes, tRes, cRes, jRes] = await Promise.allSettled([
        api.get("/quote-builder/quotes"),
        api.get("/quote-builder/stats"),
        api.get("/quote-builder/templates"),
        api.get("/quote-builder/clients"),
        api.get("/jobs"),
      ]);
      if (qRes.status === "fulfilled") setQuotes(qRes.value.data);
      if (sRes.status === "fulfilled") setStats(sRes.value.data);
      if (tRes.status === "fulfilled") setTemplates(tRes.value.data);
      if (cRes.status === "fulfilled") setClients(cRes.value.data);
      if (jRes.status === "fulfilled") setJobs(jRes.value.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (openParamId && quotes.length > 0 && !wizardOpen) {
      const q = quotes.find(x => x.id === openParamId);
      if (q) openEdit(q);
    }
  }, [openParamId, quotes]);   

  const openNew = (fromTemplate = null) => {
    let base = emptyQuote();
    if (fromTemplate) base = { ...base, ...(fromTemplate.payload || {}), id: undefined, quoteDate: base.quoteDate, validUntil: base.validUntil, status: "Draft", lineItems: (fromTemplate.payload?.lineItems || []).map(l => ({ ...l, id: crypto.randomUUID() })) };
    else { const d = loadDraft(); if (d && !d.id) base = { ...base, ...d, id: undefined }; }
    setEditing(base); setWizardOpen(true);
  };
  const openEdit = (q) => { setEditing({ ...emptyQuote(), ...q }); setWizardOpen(true); };
  const duplicate = (q) => {
    const copy = { ...q }; delete copy.id; delete copy.createdAt; delete copy.updatedAt; delete copy._id;
    copy.status = "Draft"; copy.quoteDate = new Date().toISOString().slice(0, 10); copy.quoteRef = "";
    copy.lineItems = (copy.lineItems || []).map(l => ({ ...l, id: crypto.randomUUID() }));
    copy.preparedSignature = ""; copy.clientAcceptanceSignature = "";
    setEditing({ ...emptyQuote(), ...copy }); setWizardOpen(true);
  };
  const deleteQuote = async (q) => {
    if (!window.confirm(`Delete quote ${q.quoteRef || ""}?`)) return;
    try { await api.delete(`/quote-builder/quotes/${q.id}`); toast.success("Deleted"); await loadAll(); }
    catch { toast.error("Delete failed"); }
  };
  const toggleFav = async (q) => { try { await api.patch(`/quote-builder/quotes/${q.id}`, { isFavourite: !q.isFavourite }); await loadAll(); } catch { toast.error("Failed"); } };
  const markStatus = async (q, status) => { try { await api.patch(`/quote-builder/quotes/${q.id}`, { status }); toast.success(`Marked as ${status}`); await loadAll(); } catch { toast.error("Failed"); } };

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    return quotes.filter(q => {
      if (s) {
        const hay = `${q.clientName || ""} ${q.clientCompany || ""} ${q.projectName || ""} ${q.quoteRef || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (filterStatus && (q.status || "Draft") !== filterStatus) return false;
      return true;
    });
  }, [quotes, query, filterStatus]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" data-testid="quote-builder-page">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Commercial</div>
          <h1 className="font-display text-3xl sm:text-4xl text-[#F0EDE8]">Quote Builder</h1>
          <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">Professional quotations you can prepare in minutes and submit to residential, commercial and main contractor clients. Track from Draft to Accepted.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadAll} className="text-xs text-[#A19D94] hover:text-[#E8A020] flex items-center gap-1" data-testid="qb-refresh"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh</button>
          <button onClick={() => openNew()} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040]" data-testid="qb-new-btn"><Plus size={14} /> New Quote</button>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <StatCard label="Draft" value={stats?.draft ?? 0} testId="qb-stat-draft" />
        <StatCard label="Sent" value={stats?.sent ?? 0} tone="gold" testId="qb-stat-sent" />
        <StatCard label="Accepted" value={stats?.accepted ?? 0} tone="green" testId="qb-stat-accepted" />
        <StatCard label="Expired" value={stats?.expired ?? 0} tone="red" testId="qb-stat-expired" />
        <StatCard label="Rejected" value={stats?.rejected ?? 0} tone="red" testId="qb-stat-rejected" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <ValueCard label="Pipeline value" value={fGBP(stats?.pipelineValue || 0)} sub="Draft + Sent" testId="qb-val-pipeline" />
        <ValueCard label="Accepted value" value={fGBP(stats?.acceptedValue || 0)} sub="Signed & confirmed" tone="green" testId="qb-val-accepted" />
        <ValueCard label="Expiring within 7 days" value={stats?.expiringSoon ?? 0} sub="Send a chase" tone="gold" testId="qb-val-expiring" />
      </div>

      {templates.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Templates</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {templates.map(t => (
              <div key={t.id} className="card-dark p-3 flex items-start justify-between gap-2" data-testid={`qb-template-${t.id}`}>
                <button onClick={() => openNew(t)} className="text-left flex-1 min-w-0">
                  <div className="text-sm text-[#F0EDE8] truncate">{t.name}</div>
                  <div className="text-[11px] text-[#A19D94] truncate">Quote template</div>
                </button>
                <button onClick={async () => { if (!window.confirm("Delete template?")) return; try { await api.delete(`/quote-builder/templates/${t.id}`); setTemplates(templates.filter(x => x.id !== t.id)); } catch { toast.error("Failed"); } }} className="text-[#706D66] hover:text-[#F27C7C] p-1"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-dark p-4 mb-4" data-testid="qb-filters">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative md:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search client, project, reference..." className={`${inputClass} pl-9`} data-testid="qb-search" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={inputClass} data-testid="qb-filter-status">
            <option value="">All status</option>
            {STATUSES.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card-dark p-8 text-center text-sm text-[#A19D94]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card-dark p-10 text-center" data-testid="qb-empty">
          <FileText size={28} className="mx-auto text-[#E8A020] mb-3" />
          <div className="text-base text-[#F0EDE8]">{quotes.length === 0 ? "No quotes yet" : "No quotes match your filters"}</div>
          <button onClick={() => openNew()} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium"><Plus size={14} /> Create your first quote</button>
        </div>
      ) : (
        <div className="space-y-2">{filtered.map(q => <QuoteRow key={q.id} q={q} onEdit={() => openEdit(q)} onDelete={() => deleteQuote(q)} onDuplicate={() => duplicate(q)} onFav={() => toggleFav(q)} onMark={(s) => markStatus(q, s)} />)}</div>
      )}

      {wizardOpen && editing && (
        <QuoteWizard initial={editing} user={user} clients={clients} jobs={jobs}
          onClose={() => { setWizardOpen(false); setEditing(null); }}
          onSaved={async () => { await loadAll(); setWizardOpen(false); setEditing(null); }}
          onClientsChanged={setClients}
          onTemplatesChanged={setTemplates}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, tone, testId }) {
  const t = tone === "red" ? "text-[#F27C7C]" : tone === "green" ? "text-[#68D391]" : tone === "gold" ? "text-[#E8A020]" : "text-[#F0EDE8]";
  return (<div className="card-dark p-4" data-testid={testId}><Label>{label}</Label><div className={`mt-2 font-display text-3xl ${t}`}>{value}</div></div>);
}
function ValueCard({ label, value, sub, tone, testId }) {
  const t = tone === "green" ? "text-[#68D391]" : tone === "gold" ? "text-[#E8A020]" : "text-[#F0EDE8]";
  return (<div className="card-dark p-4" data-testid={testId}><Label>{label}</Label><div className={`mt-2 font-display text-2xl ${t}`}>{value}</div><div className="text-[11px] text-[#A19D94] mt-1">{sub}</div></div>);
}

function QuoteRow({ q, onEdit, onDelete, onDuplicate, onFav, onMark }) {
  const status = q.status || "Draft";
  const statusCls = status === "Accepted" ? "border-[#68D391]/40 text-[#68D391]" : status === "Expired" || status === "Rejected" ? "border-[#F27C7C]/40 text-[#F27C7C]" : status === "Sent" ? "border-[#E8A020]/40 text-[#E8A020]" : "border-[#2a2620] text-[#A19D94]";
  return (
    <div className="card-dark p-4 flex items-start gap-3" data-testid={`qb-row-${q.id}`}>
      <button onClick={onFav} className={`p-1 mt-1 ${q.isFavourite ? "text-[#E8A020]" : "text-[#706D66] hover:text-[#E8A020]"}`} aria-label="Favourite"><Star size={14} fill={q.isFavourite ? "#E8A020" : "none"} /></button>
      <button onClick={onEdit} className="text-left flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base text-[#F0EDE8] font-medium truncate">{q.projectName || q.clientCompany || q.clientName || "Untitled"}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusCls}`}>{status}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#2a2620] text-[#A19D94]">{q.quoteRef || "no ref"}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#E8A020]/40 text-[#E8A020]">{fGBP((q.totals || {}).total || 0)}</span>
        </div>
        <div className="text-xs text-[#A19D94] mt-1 truncate">{q.clientName || q.clientCompany || "—"} · Valid to {q.validUntil || "—"}</div>
      </button>
      <div className="flex gap-1 shrink-0">
        {status === "Draft" && <button onClick={() => onMark("Sent")} className="p-2 text-[#A19D94] hover:text-[#E8A020]" title="Mark as Sent" data-testid={`qb-row-send-${q.id}`}><Send size={14} /></button>}
        {status === "Sent" && <button onClick={() => onMark("Accepted")} className="p-2 text-[#A19D94] hover:text-[#68D391]" title="Mark as Accepted" data-testid={`qb-row-accept-${q.id}`}><CheckCircle2 size={14} /></button>}
        <button onClick={onEdit} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`qb-row-edit-${q.id}`}><Edit2 size={14} /></button>
        <button onClick={onDuplicate} className="p-2 text-[#A19D94] hover:text-[#E8A020]" data-testid={`qb-row-dup-${q.id}`}><Copy size={14} /></button>
        <button onClick={onDelete} className="p-2 text-[#A19D94] hover:text-[#F27C7C]" data-testid={`qb-row-delete-${q.id}`}><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

// ================================================================
// WIZARD
// ================================================================
function QuoteWizard({ initial, user, clients, jobs, onClose, onSaved, onClientsChanged, onTemplatesChanged }) {
  const [data, setData] = useState(initial);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [tplModalOpen, setTplModalOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [signingOpen, setSigningOpen] = useState(null); // "prepared" | "client"
  const [saveClientOpen, setSaveClientOpen] = useState(false);

  useEffect(() => { if (user?.fullName && !data.preparedBy) setData(d => ({ ...d, preparedBy: user.fullName })); }, [user?.fullName]);   
  useEffect(() => { if (!data.id) { const t = setTimeout(() => saveDraft(data), 500); return () => clearTimeout(t); } }, [data]);

  const set = (k) => (v) => setData(d => ({ ...d, [k]: v }));
  const totals = useMemo(() => computeTotals(data), [data]);

  const pickClient = (id) => {
    const c = clients.find(x => x.id === id); if (!c) return;
    setData(d => ({ ...d, clientId: c.id, clientName: c.name, clientCompany: c.company || d.clientCompany, clientEmail: c.email || d.clientEmail, clientPhone: c.phone || d.clientPhone, clientAddress: c.address || d.clientAddress }));
  };
  const pickProject = (id) => {
    const j = jobs.find(x => x.id === id); if (!j) return;
    setData(d => ({ ...d, projectId: j.id, projectName: j.projectName || j.clientName || d.projectName, projectAddress: j.address || d.projectAddress }));
  };

  // Line items
  const addLine = () => setData(d => ({ ...d, lineItems: [...(d.lineItems || []), emptyLine()] }));
  const updLine = (id, patch) => setData(d => ({ ...d, lineItems: d.lineItems.map(x => x.id === id ? { ...x, ...patch } : x) }));
  const delLine = (id) => setData(d => ({ ...d, lineItems: d.lineItems.filter(x => x.id !== id) }));
  const dupLine = (id) => setData(d => { const l = d.lineItems.find(x => x.id === id); if (!l) return d; return { ...d, lineItems: [...d.lineItems, { ...l, id: crypto.randomUUID() }] }; });

  // Provisional sums
  const addProv = () => setData(d => ({ ...d, provisionalSums: [...(d.provisionalSums || []), { id: crypto.randomUUID(), description: "", amount: 0 }] }));
  const updProv = (id, patch) => setData(d => ({ ...d, provisionalSums: d.provisionalSums.map(x => x.id === id ? { ...x, ...patch } : x) }));
  const delProv = (id) => setData(d => ({ ...d, provisionalSums: d.provisionalSums.filter(x => x.id !== id) }));

  // Stage payments
  const addStage = () => setData(d => ({ ...d, stagePayments: [...(d.stagePayments || []), { id: crypto.randomUUID(), milestone: "", dueOn: "", percentage: 0, amount: 0 }] }));
  const updStage = (id, patch) => setData(d => {
    const list = d.stagePayments.map(x => {
      if (x.id !== id) return x;
      const next = { ...x, ...patch };
      if ("percentage" in patch) next.amount = Math.round((Number(patch.percentage) || 0) * totals.total / 100 * 100) / 100;
      return next;
    });
    return { ...d, stagePayments: list };
  });
  const delStage = (id) => setData(d => ({ ...d, stagePayments: d.stagePayments.filter(x => x.id !== id) }));

  const generatePreview = () => {
    try { setPreviewUrl(quotePdfBlobUrl({ data: { ...data, totals }, user, today: new Date().toLocaleDateString("en-GB") })); }
    catch { toast.error("Preview failed"); }
  };

  const saveEntry = async () => {
    if (!data.clientName && !data.clientCompany) { toast.error("Client name or company is required"); setStep(1); return; }
    setSaving(true);
    try {
      let saved;
      const payload = { ...data };
      if (data.id) { const r = await api.patch(`/quote-builder/quotes/${data.id}`, payload); saved = r.data; }
      else { const r = await api.post("/quote-builder/quotes", payload); saved = r.data; }
      try {
        await api.post("/documents/save", {
          title: `Quotation — ${data.projectName || data.clientCompany || data.clientName || "Client"}`,
          toolId: TOOL_ID, refNumber: saved.quoteRef, jobId: data.projectId || null,
          content: `QUOTATION ${saved.quoteRef}\n${data.clientName || ""} · ${data.projectName || ""}\nTotal (inc VAT): ${fGBP((saved.totals || {}).total || 0)}`,
          metadata: { ...saved },
        });
      } catch { /* soft-fail */ }
      downloadQuotePdf({ data: saved, user, today: new Date().toLocaleDateString("en-GB") });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      toast.success("Quote saved");
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  const saveClient = async () => {
    if (!data.clientName.trim()) return toast.error("Client name required");
    try {
      const r = await api.post("/quote-builder/clients", {
        name: data.clientName, company: data.clientCompany, email: data.clientEmail,
        phone: data.clientPhone, address: data.clientAddress,
      });
      toast.success("Client saved to library");
      setSaveClientOpen(false);
      setData(d => ({ ...d, clientId: r.data.id }));
      const lst = await api.get("/quote-builder/clients");
      onClientsChanged(lst.data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const saveAsTemplate = async () => {
    if (!tplName.trim()) return toast.error("Template name required");
    try {
      const payload = { ...data, id: undefined, quoteRef: undefined, quoteDate: undefined, validUntil: undefined, status: "Draft", preparedSignature: "", clientAcceptanceSignature: "", clientAcceptanceName: "", acceptedDate: "" };
      await api.post("/quote-builder/templates", { name: tplName.trim(), payload });
      toast.success("Template saved");
      setTplModalOpen(false); setTplName("");
      const lst = await api.get("/quote-builder/templates"); onTemplatesChanged(lst.data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 overflow-y-auto" data-testid="qb-wizard">
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-5xl mx-auto card-dark p-5 md:p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-1">{data.id ? "Edit" : "New"} Quote</div>
              <h2 className="font-display text-2xl text-[#F0EDE8]">{data.projectName || data.clientCompany || "Untitled"} <span className="text-sm text-[#A19D94]">· {fGBP(totals.total)}</span></h2>
            </div>
            <button onClick={onClose} className="text-[#A19D94] hover:text-[#F0EDE8]" data-testid="qb-wizard-close"><X size={20} /></button>
          </div>

          <div className="flex justify-end mb-3">
            <button onClick={() => setTplModalOpen(true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="qb-save-template-btn"><Save size={12} /> Save as template</button>
          </div>

          <div className="overflow-x-auto mb-5" data-testid="qb-stepper">
            <div className="flex gap-1 min-w-max">
              {WIZARD_STEPS.map(s => (
                <button key={s.id} onClick={() => setStep(s.id)} data-testid={`qb-step-${s.id}`}
                  className={`px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${step === s.id ? "bg-[#E8A020] text-black" : step > s.id ? "bg-[#1e1a12] text-[#68D391] border border-[#68D391]/30" : "bg-[#0f0d09] text-[#A19D94] border border-[#2a2620]"}`}>
                  {s.id}. {s.label}
                </button>
              ))}
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-4" data-testid="qb-step-1-client">
              {clients.length > 0 && (
                <Field label="Pick from client library">
                  <select value={data.clientId} onChange={(e) => pickClient(e.target.value)} className={inputClass} data-testid="qb-pick-client">
                    <option value="">— Select existing client —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.company ? `${c.company} · ${c.name}` : c.name}</option>)}
                  </select>
                </Field>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Contact name"><input className={inputClass} value={data.clientName} onChange={(e) => set("clientName")(e.target.value)} data-testid="qb-clientName" /></Field>
                <Field label="Company"><input className={inputClass} value={data.clientCompany} onChange={(e) => set("clientCompany")(e.target.value)} data-testid="qb-clientCompany" /></Field>
                <Field label="Email"><input className={inputClass} type="email" value={data.clientEmail} onChange={(e) => set("clientEmail")(e.target.value)} data-testid="qb-clientEmail" /></Field>
                <Field label="Phone"><input className={inputClass} value={data.clientPhone} onChange={(e) => set("clientPhone")(e.target.value)} /></Field>
              </div>
              <Field label="Address"><textarea className={`${inputClass} min-h-[52px]`} value={data.clientAddress} onChange={(e) => set("clientAddress")(e.target.value)} data-testid="qb-clientAddress" /></Field>
              {data.clientName && !data.clientId && (
                <button onClick={saveClient} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-[#E8A020] text-xs text-[#E8A020]" data-testid="qb-save-client"><Users size={12} /> Save to client library</button>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4" data-testid="qb-step-2-project">
              {jobs.length > 0 && (
                <Field label="Link to project (optional)">
                  <select value={data.projectId} onChange={(e) => pickProject(e.target.value)} className={inputClass} data-testid="qb-link-project">
                    <option value="">Not linked</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.projectName || j.clientName}</option>)}
                  </select>
                </Field>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Project name"><input className={inputClass} value={data.projectName} onChange={(e) => set("projectName")(e.target.value)} data-testid="qb-projectName" /></Field>
                <Field label="Site address"><textarea className={`${inputClass} min-h-[52px]`} value={data.projectAddress} onChange={(e) => set("projectAddress")(e.target.value)} /></Field>
                <Field label="Duration"><input className={inputClass} value={data.projectDuration} onChange={(e) => set("projectDuration")(e.target.value)} placeholder="e.g. 4 weeks" data-testid="qb-duration" /></Field>
                <Field label="Proposed start date"><input type="date" className={inputClass} value={data.startDate} onChange={(e) => set("startDate")(e.target.value)} /></Field>
              </div>
              <Field label="Project description"><textarea className={`${inputClass} min-h-[80px]`} value={data.projectDescription} onChange={(e) => set("projectDescription")(e.target.value)} data-testid="qb-projectDescription" /></Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4" data-testid="qb-step-3-scope">
              <Field label="Scope of works" hint="Describe exactly what is included. Detail is your friend — it defines the boundaries of the quote.">
                <textarea className={`${inputClass} min-h-[240px]`} value={data.scopeOfWorks} onChange={(e) => set("scopeOfWorks")(e.target.value)} placeholder={"e.g.\n• Supply and install ductwork to Level 2 as per drawings AR-201.\n• Testing and commissioning of new AHU units.\n• Handover documentation including O&M manuals."} data-testid="qb-scopeOfWorks" />
              </Field>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3" data-testid="qb-step-4-items">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Line items · {(data.lineItems || []).length}</div>
                <button onClick={addLine} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#E8A020] text-black text-xs font-medium" data-testid="qb-add-line"><Plus size={12} /> Add line</button>
              </div>
              {(data.lineItems || []).map((it, i) => (
                <div key={it.id} className="card-dark p-3" data-testid={`qb-line-${i + 1}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Line {i + 1} · <span className="text-[#F0EDE8]">{fGBP((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}</span></span>
                    <div className="flex gap-2"><button onClick={() => dupLine(it.id)} className="text-[#A19D94] hover:text-[#E8A020]"><Copy size={12} /></button><button onClick={() => delLine(it.id)} className="text-[#A19D94] hover:text-[#F27C7C]"><Trash2 size={12} /></button></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                    <Field label="Category">
                      <select className={inputClass} value={it.category} onChange={(e) => updLine(it.id, { category: e.target.value })} data-testid={`qb-line-cat-${i + 1}`}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </Field>
                    <div className="md:col-span-2"><Field label="Description"><input className={inputClass} value={it.description} onChange={(e) => updLine(it.id, { description: e.target.value })} data-testid={`qb-line-desc-${i + 1}`} /></Field></div>
                    <Field label="Qty"><input type="number" step="0.01" className={inputClass} value={it.qty} onChange={(e) => updLine(it.id, { qty: e.target.value })} data-testid={`qb-line-qty-${i + 1}`} /></Field>
                    <Field label="Unit">
                      <select className={inputClass} value={it.unit} onChange={(e) => updLine(it.id, { unit: e.target.value })}>
                        {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </Field>
                    <Field label="Unit price (£)"><input type="number" step="0.01" className={inputClass} value={it.unitPrice} onChange={(e) => updLine(it.id, { unitPrice: e.target.value })} data-testid={`qb-line-price-${i + 1}`} /></Field>
                  </div>
                </div>
              ))}
              <div className="card-dark p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <div><Label>Subtotal</Label><div className="text-[#F0EDE8] mt-1">{fGBP(totals.subtotal)}</div></div>
                  <div><Label>Discount</Label><div className="text-[#F0EDE8] mt-1">-{fGBP(totals.discountAmount)}</div></div>
                  <div><Label>Provisional sums</Label><div className="text-[#F0EDE8] mt-1">{fGBP(totals.provisionalSumTotal)}</div></div>
                  <div><Label>Net</Label><div className="text-[#E8A020] mt-1 text-base font-medium">{fGBP(totals.net)}</div></div>
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-5" data-testid="qb-step-5-optional">
              <Field label="Exclusions" hint="What's NOT included."><textarea className={`${inputClass} min-h-[120px]`} value={data.exclusions} onChange={(e) => set("exclusions")(e.target.value)} data-testid="qb-exclusions" /></Field>
              <Field label="Assumptions" hint="What you have assumed to be true when pricing."><textarea className={`${inputClass} min-h-[120px]`} value={data.assumptions} onChange={(e) => set("assumptions")(e.target.value)} data-testid="qb-assumptions" /></Field>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Provisional sums</div>
                  <button onClick={addProv} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#E8A020] text-black text-xs font-medium" data-testid="qb-add-prov"><Plus size={12} /> Add</button>
                </div>
                {(data.provisionalSums || []).map((p, i) => (
                  <div key={p.id} className="card-dark p-3 mb-2" data-testid={`qb-prov-${i + 1}`}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                      <div className="md:col-span-2"><Field label="Description"><input className={inputClass} value={p.description} onChange={(e) => updProv(p.id, { description: e.target.value })} data-testid={`qb-prov-desc-${i + 1}`} /></Field></div>
                      <div className="flex gap-2 items-end"><Field label="Amount (£)"><input type="number" step="0.01" className={inputClass} value={p.amount} onChange={(e) => updProv(p.id, { amount: e.target.value })} data-testid={`qb-prov-amt-${i + 1}`} /></Field><button onClick={() => delProv(p.id)} className="pb-2 text-[#F27C7C]"><Trash2 size={14} /></button></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-3" data-testid="qb-step-6-stage">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020]">Stage payment schedule</div>
                <button onClick={addStage} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#E8A020] text-black text-xs font-medium" data-testid="qb-add-stage"><Plus size={12} /> Add stage</button>
              </div>
              {(data.stagePayments || []).length === 0 && <div className="card-dark p-4 text-center text-xs text-[#A19D94]">Optional. Break large jobs into stages to improve cashflow (e.g. 30% deposit, 40% first-fix, 30% completion).</div>}
              {(data.stagePayments || []).map((s, i) => (
                <div key={s.id} className="card-dark p-3" data-testid={`qb-stage-${i + 1}`}>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                    <div className="md:col-span-2"><Field label="Milestone / trigger"><input className={inputClass} value={s.milestone} onChange={(e) => updStage(s.id, { milestone: e.target.value })} placeholder="e.g. On acceptance of quote" data-testid={`qb-stage-milestone-${i + 1}`} /></Field></div>
                    <Field label="Due on"><input className={inputClass} value={s.dueOn} onChange={(e) => updStage(s.id, { dueOn: e.target.value })} placeholder="e.g. Week 1" /></Field>
                    <Field label="%"><input type="number" className={inputClass} value={s.percentage} onChange={(e) => updStage(s.id, { percentage: e.target.value })} data-testid={`qb-stage-pct-${i + 1}`} /></Field>
                    <div className="flex gap-2 items-end"><Field label="Amount (£)"><input className={inputClass} value={s.amount} readOnly /></Field><button onClick={() => delStage(s.id)} className="pb-2 text-[#F27C7C]"><Trash2 size={14} /></button></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 7 && (
            <div className="space-y-4" data-testid="qb-step-7-terms">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Quote date"><input type="date" className={inputClass} value={data.quoteDate} onChange={(e) => set("quoteDate")(e.target.value)} data-testid="qb-quoteDate" /></Field>
                <Field label="Valid until"><input type="date" className={inputClass} value={data.validUntil} onChange={(e) => set("validUntil")(e.target.value)} data-testid="qb-validUntil" /></Field>
                <Field label="VAT rate (%)"><input type="number" step="0.01" className={inputClass} value={data.vatRate} onChange={(e) => set("vatRate")(Number(e.target.value))} data-testid="qb-vatRate" /></Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Field label="Discount type">
                  <select className={inputClass} value={data.discount?.type || "percent"} onChange={(e) => set("discount")({ ...(data.discount || {}), type: e.target.value })} data-testid="qb-disc-type">
                    <option value="percent">Percentage</option><option value="fixed">Fixed £</option>
                  </select>
                </Field>
                <Field label="Discount value"><input type="number" step="0.01" className={inputClass} value={data.discount?.value || 0} onChange={(e) => set("discount")({ ...(data.discount || {}), value: Number(e.target.value) })} data-testid="qb-disc-value" /></Field>
                <div />
              </div>
              <Field label="Payment terms"><textarea className={`${inputClass} min-h-[80px]`} value={data.paymentTerms} onChange={(e) => set("paymentTerms")(e.target.value)} data-testid="qb-paymentTerms" /></Field>
              <div className="card-dark p-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                  <div><Label>Subtotal</Label><div className="text-[#F0EDE8] mt-1">{fGBP(totals.subtotal)}</div></div>
                  <div><Label>Discount</Label><div className="text-[#F0EDE8] mt-1">-{fGBP(totals.discountAmount)}</div></div>
                  <div><Label>Prov. sums</Label><div className="text-[#F0EDE8] mt-1">{fGBP(totals.provisionalSumTotal)}</div></div>
                  <div><Label>VAT ({data.vatRate}%)</Label><div className="text-[#F0EDE8] mt-1">{fGBP(totals.vatAmount)}</div></div>
                  <div><Label>Total</Label><div className="text-[#E8A020] mt-1 text-lg font-medium">{fGBP(totals.total)}</div></div>
                </div>
              </div>
            </div>
          )}

          {step === 8 && (
            <div className="space-y-4" data-testid="qb-step-8-review">
              <div className="card-dark p-3 border-l-2 border-[#E8A020] text-xs text-[#A19D94]">Sign here as the contractor, then request the client&apos;s acceptance signature when they sign off.</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="card-dark p-4">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-3">Prepared by (contractor)</div>
                  <Field label="Name"><input className={inputClass} value={data.preparedBy || user?.fullName || ""} onChange={(e) => set("preparedBy")(e.target.value)} data-testid="qb-preparedBy" /></Field>
                  <div className="mt-3"><Label>Signature</Label>
                    <div className="mt-1 flex items-center gap-3">
                      {data.preparedSignature ? <img alt="Signature" src={data.preparedSignature} className="h-12 w-40 rounded-md border border-[#2a2620] bg-white" /> : <div className="h-12 w-40 rounded-md border border-dashed border-[#2a2620] flex items-center justify-center text-[10px] text-[#706D66]">Not signed</div>}
                      <button onClick={() => setSigningOpen("prepared")} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="qb-sign-prepared"><PenTool size={12} /> {data.preparedSignature ? "Re-sign" : "Sign"}</button>
                    </div>
                  </div>
                </div>
                <div className="card-dark p-4">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-3">Accepted by (client)</div>
                  <Field label="Client name"><input className={inputClass} value={data.clientAcceptanceName} onChange={(e) => set("clientAcceptanceName")(e.target.value)} data-testid="qb-clientAcceptanceName" /></Field>
                  <div className="grid grid-cols-2 gap-2 mt-2"><Field label="Accepted date"><input type="date" className={inputClass} value={data.acceptedDate} onChange={(e) => set("acceptedDate")(e.target.value)} /></Field><div /></div>
                  <div className="mt-3"><Label>Client signature</Label>
                    <div className="mt-1 flex items-center gap-3">
                      {data.clientAcceptanceSignature ? <img alt="Signature" src={data.clientAcceptanceSignature} className="h-12 w-40 rounded-md border border-[#2a2620] bg-white" /> : <div className="h-12 w-40 rounded-md border border-dashed border-[#2a2620] flex items-center justify-center text-[10px] text-[#706D66]">Not signed</div>}
                      <button onClick={() => setSigningOpen("client")} className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="qb-sign-client"><PenTool size={12} /> Sign</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 9 && (
            <div className="space-y-4" data-testid="qb-step-9-generate">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="card-dark p-3"><Label>Line items</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.lineItems || []).length}</div></div>
                <div className="card-dark p-3"><Label>Provisional sums</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.provisionalSums || []).length}</div></div>
                <div className="card-dark p-3"><Label>Stage payments</Label><div className="text-2xl text-[#F0EDE8] mt-1">{(data.stagePayments || []).length}</div></div>
                <div className="card-dark p-3"><Label>Total (inc VAT)</Label><div className="text-2xl text-[#E8A020] mt-1">{fGBP(totals.total)}</div></div>
              </div>
              <Field label="Additional notes"><textarea className={`${inputClass} min-h-[52px]`} value={data.notes} onChange={(e) => set("notes")(e.target.value)} /></Field>
              <div className="flex gap-2 flex-wrap">
                <button onClick={generatePreview} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#F0EDE8] hover:border-[#E8A020]" data-testid="qb-preview-btn"><RefreshCw size={14} /> {previewUrl ? "Refresh" : "Generate"} preview</button>
                <button onClick={saveEntry} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-60" data-testid="qb-save-btn"><Download size={16} /> {saving ? "Saving..." : "Save & Generate PDF"}</button>
              </div>
              {previewUrl && <iframe title="Quote Preview" src={previewUrl} className="w-full h-[500px] rounded-md border border-[#2a2620] bg-white" data-testid="qb-preview-iframe" />}
            </div>
          )}

          <div className="flex items-center justify-between mt-6">
            <button onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94] disabled:opacity-40" data-testid="qb-btn-prev"><ChevronLeft size={14} /> Back</button>
            <span className="text-xs text-[#706D66]">Step {step} of {WIZARD_STEPS.length}</span>
            <button onClick={() => setStep(Math.min(WIZARD_STEPS.length, step + 1))} disabled={step === WIZARD_STEPS.length} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium disabled:opacity-40" data-testid="qb-btn-next">Next <ChevronRight size={14} /></button>
          </div>
        </div>

        {tplModalOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="qb-template-modal">
            <div className="card-dark p-6 max-w-md w-full">
              <div className="flex items-start justify-between mb-3"><h3 className="font-display text-2xl text-[#F0EDE8]">Save as template</h3><button onClick={() => setTplModalOpen(false)} className="text-[#A19D94]"><X size={18} /></button></div>
              <Field label="Template name"><input className={inputClass} value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Standard bathroom quote" data-testid="qb-template-name" /></Field>
              <div className="flex gap-2 mt-4"><button onClick={() => setTplModalOpen(false)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button><button onClick={saveAsTemplate} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="qb-template-save">Save</button></div>
            </div>
          </div>
        )}

        {signingOpen && (
          <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" data-testid="qb-sign-modal">
            <div className="card-dark p-5 max-w-lg w-full">
              <div className="flex items-start justify-between mb-3"><h3 className="font-display text-xl text-[#F0EDE8]">{signingOpen === "client" ? "Client acceptance signature" : "Contractor signature"}</h3><button onClick={() => setSigningOpen(null)} className="text-[#A19D94]"><X size={18} /></button></div>
              <SignaturePad value={signingOpen === "client" ? (data.clientAcceptanceSignature || "") : (data.preparedSignature || "")} onChange={(v) => set(signingOpen === "client" ? "clientAcceptanceSignature" : "preparedSignature")(v)} />
              <div className="flex gap-2 mt-3"><button onClick={() => setSigningOpen(null)} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94]">Cancel</button><button onClick={() => setSigningOpen(null)} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium" data-testid="qb-sign-done">Done</button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
