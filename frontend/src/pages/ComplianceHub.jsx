// Morris — Compliance Hub V2
// Central place for insurance, personnel certs, project compliance and vehicles.
// Any item within 30 days of expiry surfaces here AND on the Command Centre.

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ShieldCheck, IdCard, Truck, HardHat, AlertTriangle, Plus, Trash2,
  Edit2, X, ArrowRight, RefreshCw, CheckCircle2, Calendar,
} from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";

const TABS = [
  { id: "company", label: "Company", category: "insurance", icon: ShieldCheck, hint: "Public Liability, Employers Liability, Professional Indemnity" },
  { id: "personnel", label: "Personnel", category: "personnel", icon: IdCard, hint: "CSCS cards, First Aid, DBS, training certs" },
  { id: "project", label: "Project", category: null, icon: HardHat, hint: "RAMS reviews, COSHH, Toolbox Talks, Site Diary status" },
  { id: "vehicles", label: "Vehicles", category: "vehicle", icon: Truck, hint: "MOT, insurance, tax, service dates" },
];

const ukDate = (iso) => {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

function statusFromDays(days) {
  if (days == null) return { label: "No expiry", tone: "muted" };
  if (days < 0) return { label: `Expired ${-days} day${days === -1 ? "" : "s"} ago`, tone: "red" };
  if (days <= 14) return { label: `${days} day${days === 1 ? "" : "s"} left`, tone: "red" };
  if (days <= 30) return { label: `${days} days left`, tone: "amber" };
  if (days <= 90) return { label: `${days} days left`, tone: "gold" };
  return { label: `${days} days left`, tone: "green" };
}

const toneClass = (tone) => ({
  red: "text-[#F27C7C] border-[#F27C7C]/30 bg-[#F27C7C]/5",
  amber: "text-[#E8A020] border-[#E8A020]/30 bg-[#E8A020]/5",
  gold: "text-[#E8A020] border-[#E8A020]/20 bg-transparent",
  green: "text-[#68D391] border-[#68D391]/20 bg-transparent",
  muted: "text-[#A19D94] border-[#2a2620] bg-transparent",
}[tone] || "text-[#A19D94] border-[#2a2620]");

// ---------------- Item row ----------------

function ItemRow({ item, onEdit, onDelete }) {
  const st = statusFromDays(item.daysUntilExpiry);
  return (
    <div className={`card-dark p-4 flex items-start gap-3 border ${toneClass(st.tone)}`} data-testid={`compliance-item-${item.id}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-base text-[#F0EDE8] font-medium truncate">{item.type}: {item.name}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${toneClass(st.tone)}`}>{st.label}</span>
        </div>
        <div className="text-xs text-[#A19D94] mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {item.issuer && <span>Issuer: {item.issuer}</span>}
          {item.refNumber && <span>Ref: {item.refNumber}</span>}
          <span>Issued: {ukDate(item.issueDate)}</span>
          <span>Expires: {ukDate(item.expiryDate)}</span>
        </div>
        {item.notes && <div className="text-xs text-[#706D66] mt-1 line-clamp-2">{item.notes}</div>}
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={() => onEdit(item)} className="p-2 text-[#A19D94] hover:text-[#E8A020] transition" data-testid={`edit-item-${item.id}`} aria-label="Edit"><Edit2 size={14} /></button>
        <button onClick={() => onDelete(item)} className="p-2 text-[#A19D94] hover:text-[#F27C7C] transition" data-testid={`delete-item-${item.id}`} aria-label="Delete"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

// ---------------- Add/Edit modal ----------------

function ItemModal({ open, onClose, onSave, initial, category, typeSuggestions }) {
  const [form, setForm] = useState({
    type: "", name: "", issuer: "", refNumber: "", issueDate: "", expiryDate: "", notes: "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        type: initial?.type || "",
        name: initial?.name || "",
        issuer: initial?.issuer || "",
        refNumber: initial?.refNumber || "",
        issueDate: initial?.issueDate || "",
        expiryDate: initial?.expiryDate || "",
        notes: initial?.notes || "",
      });
    }
  }, [open, initial]);

  if (!open) return null;

  const handleSave = () => {
    if (!form.type.trim()) return toast.error("Type is required");
    if (!form.name.trim()) return toast.error("Name is required");
    onSave({ ...form, category });
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" data-testid="compliance-modal">
      <div className="card-dark p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <h3 className="font-display text-2xl text-[#F0EDE8]">{initial?.id ? "Edit" : "Add"} {category === "insurance" ? "insurance policy" : category === "personnel" ? "credential" : "vehicle record"}</h3>
          <button onClick={onClose} className="text-[#A19D94] hover:text-[#F0EDE8]" data-testid="modal-close"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">Type</label>
            <input
              list="type-suggestions"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full mt-1 bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none"
              placeholder={typeSuggestions[0] || "e.g. Public Liability"}
              data-testid="modal-type"
            />
            <datalist id="type-suggestions">
              {typeSuggestions.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">Name / subject</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full mt-1 bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none"
              placeholder={category === "personnel" ? "Person's name" : category === "vehicle" ? "Reg number (e.g. AB12 CDE)" : "Policy holder / limited co."}
              data-testid="modal-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">Issuer</label>
              <input value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })}
                className="w-full mt-1 bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none" data-testid="modal-issuer" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">Reference / cert no.</label>
              <input value={form.refNumber} onChange={(e) => setForm({ ...form, refNumber: e.target.value })}
                className="w-full mt-1 bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none" data-testid="modal-ref" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">Issue date</label>
              <input type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
                className="w-full mt-1 bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none" data-testid="modal-issue-date" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">Expiry date</label>
              <input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                className="w-full mt-1 bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none" data-testid="modal-expiry-date" />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full mt-1 bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none min-h-[64px]"
              data-testid="modal-notes" />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-md border border-[#2a2620] text-sm text-[#A19D94] hover:text-[#F0EDE8]" data-testid="modal-cancel">Cancel</button>
          <button onClick={handleSave} className="flex-1 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040]" data-testid="modal-save">{initial?.id ? "Save changes" : "Add"}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Project compliance tab (derived) ----------------

function ProjectComplianceTab() {
  const [state, setState] = useState({ loading: true, docs: [] });
  useEffect(() => {
    api.get("/documents").then((r) => setState({ loading: false, docs: Array.isArray(r.data) ? r.data : [] }))
      .catch(() => setState({ loading: false, docs: [] }));
  }, []);

  // Derive counts from documents + tool storage
  const now = new Date();
  const items = useMemo(() => {
    const byTool = {};
    for (const d of state.docs) {
      const t = d.toolId || "";
      if (!byTool[t]) byTool[t] = [];
      byTool[t].push(d);
    }
    const kinds = [
      { key: "rams", tool: "rams", label: "RAMS documents", route: "/app/rams", info: "RAMS have a 12-month statutory review cycle. Documents older than 12 months should be re-reviewed." },
      { key: "coshh", tool: "coshh", label: "COSHH assessments", route: "/app/tool/coshh", info: "COSHH assessments should be reviewed annually or when a substance changes." },
      { key: "tbt", tool: "toolbox-talk", label: "Toolbox Talks", route: "/app/tool/toolbox-talk", info: "One per week per crew is the industry benchmark. Missing weeks appear as gaps in the audit trail." },
      { key: "diary", tool: "multiuser-site-diary", label: "Site diaries", route: "/app/site-diary", info: "Should be logged every active site day. Missed days are a common HSE audit finding." },
    ];
    return kinds.map((k) => {
      const arr = byTool[k.tool] || [];
      // Age of most recent
      let latest = null;
      for (const d of arr) {
        const dt = d.createdAt || d.updatedAt || "";
        if (dt && (!latest || dt > latest)) latest = dt;
      }
      let sinceDays = null;
      if (latest) {
        try { sinceDays = Math.floor((now - new Date(latest)) / 86400000); }
        catch { sinceDays = null; }
      }
      let tone = "muted";
      let statusLabel = arr.length === 0 ? "Never used" : `${arr.length} on file`;
      if (k.key === "rams" && sinceDays != null) {
        if (sinceDays > 365) { tone = "red"; statusLabel = `Latest ${sinceDays} days old — review due`; }
        else if (sinceDays > 300) { tone = "amber"; statusLabel = `Latest ${sinceDays} days old`; }
        else { tone = "green"; statusLabel = `Latest ${sinceDays} days old`; }
      } else if (k.key === "coshh" && sinceDays != null) {
        if (sinceDays > 365) { tone = "red"; statusLabel = `Latest ${sinceDays} days old — review due`; }
        else { tone = sinceDays > 300 ? "amber" : "green"; statusLabel = `Latest ${sinceDays} days old`; }
      } else if (k.key === "tbt" && sinceDays != null) {
        if (sinceDays > 14) { tone = "amber"; statusLabel = `Last talk ${sinceDays} days ago`; }
        else { tone = "green"; statusLabel = `Last talk ${sinceDays} days ago`; }
      } else if (k.key === "diary" && sinceDays != null) {
        if (sinceDays > 3) { tone = "amber"; statusLabel = `Last entry ${sinceDays} days ago`; }
        else { tone = "green"; statusLabel = `Last entry ${sinceDays} days ago`; }
      }
      return { ...k, count: arr.length, sinceDays, tone, statusLabel };
    });
  }, [state.docs]);

  if (state.loading) return <div className="card-dark p-6 text-sm text-[#A19D94]">Loading...</div>;

  return (
    <div className="space-y-3" data-testid="compliance-project-tab">
      {items.map((k) => (
        <Link key={k.key} to={k.route} data-testid={`project-tile-${k.key}`}
          className={`card-dark p-5 block hover:border-[#E8A020]/40 transition border ${toneClass(k.tone)}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-base text-[#F0EDE8] font-medium">{k.label}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${toneClass(k.tone)}`}>{k.statusLabel}</span>
              </div>
              <div className="text-xs text-[#A19D94] mt-1">{k.info}</div>
            </div>
            <ArrowRight size={14} className="text-[#706D66] mt-1" />
          </div>
        </Link>
      ))}
    </div>
  );
}

// ---------------- Category tab (CRUD) ----------------

function CategoryTab({ category, typeSuggestions, refreshKey, onChange, autoOpenId, onAutoOpenConsumed }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/compliance/items?category=${category}`);
      setItems(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      toast.error("Failed to load compliance items");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [category, refreshKey]);

  // P2 (Sep 2026) — /app/compliance?open=<id> auto-opens the specific
  // credential for edit. The parent picks the correct tab first, then
  // passes autoOpenId here; we consume once and clear via callback.
  useEffect(() => {
    if (!autoOpenId || items.length === 0 || modalOpen) return;
    const target = items.find((x) => x.id === autoOpenId);
    if (target) {
      setEditing(target);
      setModalOpen(true);
      onAutoOpenConsumed && onAutoOpenConsumed();
    }
  }, [autoOpenId, items]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async (payload) => {
    try {
      if (editing?.id) {
        await api.patch(`/compliance/items/${editing.id}`, payload);
        toast.success("Updated");
      } else {
        await api.post("/compliance/items", payload);
        toast.success("Added");
      }
      setModalOpen(false);
      setEditing(null);
      await load();
      onChange && onChange();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Remove ${item.type}: ${item.name}?`)) return;
    try {
      await api.delete(`/compliance/items/${item.id}`);
      toast.success("Removed");
      await load();
      onChange && onChange();
    } catch (e) {
      toast.error("Delete failed");
    }
  };

  const expiringCount = items.filter((it) => it.daysUntilExpiry != null && it.daysUntilExpiry <= 30).length;

  return (
    <div data-testid={`compliance-${category}-tab`}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-[#A19D94]">
          {items.length} record{items.length === 1 ? "" : "s"}{expiringCount > 0 && <span className="text-[#E8A020]"> · {expiringCount} expiring within 30 days</span>}
        </div>
        <button onClick={() => { setEditing(null); setModalOpen(true); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040]" data-testid={`add-${category}-btn`}>
          <Plus size={14} /> Add {category === "insurance" ? "policy" : category === "personnel" ? "credential" : "record"}
        </button>
      </div>

      {loading && <div className="card-dark p-6 text-sm text-[#A19D94]">Loading...</div>}

      {!loading && items.length === 0 && (
        <div className="card-dark p-8 text-center" data-testid={`empty-${category}`}>
          <div className="mx-auto w-10 h-10 rounded-md bg-[#1e1a12] text-[#E8A020] flex items-center justify-center mb-3"><Plus size={16} /></div>
          <div className="text-base text-[#F0EDE8]">No {category === "insurance" ? "policies" : category === "personnel" ? "credentials" : "vehicle records"} yet</div>
          <div className="text-xs text-[#A19D94] mt-1 max-w-sm mx-auto">
            {category === "insurance" && "Add your Public Liability, Employers Liability and Professional Indemnity policies here — expiries will flag on the Command Centre."}
            {category === "personnel" && "Log every CSCS card, First Aid ticket, DBS and training cert. Morris will warn you before anything expires."}
            {category === "vehicle" && "Track MOT, insurance, tax and service dates for every vehicle in your fleet."}
          </div>
          <button onClick={() => { setEditing(null); setModalOpen(true); }} className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium">
            <Plus size={14} /> Add your first
          </button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-2">
          {items.map((it) => <ItemRow key={it.id} item={it} onEdit={(x) => { setEditing(x); setModalOpen(true); }} onDelete={handleDelete} />)}
        </div>
      )}

      <ItemModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        initial={editing}
        category={category}
        typeSuggestions={typeSuggestions}
      />
    </div>
  );
}

// ---------------- Page shell ----------------

export default function ComplianceHubV2() {
  const [tab, setTab] = useState("company");
  const [summary, setSummary] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [types, setTypes] = useState({});
  const [searchParams] = useSearchParams();
  const openParamId = searchParams.get("open") || "";
  const [autoOpenId, setAutoOpenId] = useState("");

  const loadSummary = async () => {
    try {
      const [sRes, tRes] = await Promise.allSettled([api.get("/compliance/summary"), api.get("/compliance/types")]);
      if (sRes.status === "fulfilled") setSummary(sRes.value.data);
      if (tRes.status === "fulfilled") setTypes(tRes.value.data || {});
    } catch { /* ignore */ }
  };
  useEffect(() => { loadSummary(); }, [refreshKey]);

  // P2 (Sep 2026) — Command Centre emits /app/compliance?open=<id> when a
  // credential is expiring. Fetch the record once, switch to the right tab
  // and pass the id down so CategoryTab opens the edit modal automatically.
  useEffect(() => {
    if (!openParamId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get("/compliance/items");
        if (cancelled) return;
        const target = (r.data || []).find((x) => x.id === openParamId);
        if (!target) return;
        const cat = target.category || "";
        const tabForCat = TABS.find((t) => t.category === cat)?.id || "company";
        setTab(tabForCat);
        setAutoOpenId(openParamId);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [openParamId]);

  const bump = () => setRefreshKey((n) => n + 1);
  const active = TABS.find((t) => t.id === tab);

  const totalExpiring = summary ? Object.values(summary.buckets || {}).reduce((s, b) => s + (b.expiring30 || 0) + (b.expired || 0), 0) : 0;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="hub-compliance">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Hub</div>
            <h1 className="font-display text-4xl sm:text-5xl text-[#F0EDE8]">Compliance</h1>
            <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">Every credential, insurance policy and safety record in one place. Anything within 30 days of expiry appears here and on the Command Centre.</p>
          </div>
          <button onClick={bump} className="text-xs text-[#A19D94] hover:text-[#E8A020] transition flex items-center gap-1" data-testid="compliance-refresh">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </header>

      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {TABS.map((t) => {
          const b = summary?.buckets?.[t.category] || { total: 0, expiring30: 0, expired: 0 };
          const showCount = t.category ? b.total : null;
          const showExpiring = t.category ? (b.expiring30 + b.expired) : null;
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} data-testid={`compliance-summary-${t.id}`}
              className={`card-dark p-4 text-left transition ${tab === t.id ? "border-[#E8A020]/60" : "hover:border-[#E8A020]/30"}`}>
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">{t.label}</div>
                <Icon size={14} className="text-[#706D66]" />
              </div>
              <div className="mt-2 font-display text-2xl text-[#F0EDE8]">
                {showCount == null ? "—" : showCount}
              </div>
              {showExpiring != null && showExpiring > 0 && (
                <div className="text-xs text-[#F27C7C] mt-1 flex items-center gap-1"><AlertTriangle size={11} /> {showExpiring} needs attention</div>
              )}
              {showExpiring === 0 && showCount > 0 && (
                <div className="text-xs text-[#68D391] mt-1 flex items-center gap-1"><CheckCircle2 size={11} /> All in date</div>
              )}
              {t.category == null && (
                <div className="text-xs text-[#A19D94] mt-1">Reviews & talks</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-[#2a2620] overflow-x-auto" data-testid="compliance-tabs">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} data-testid={`compliance-tab-${t.id}`}
            className={`px-4 py-2 text-sm transition whitespace-nowrap ${tab === t.id ? "text-[#E8A020] border-b-2 border-[#E8A020] -mb-px" : "text-[#A19D94] hover:text-[#F0EDE8]"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {active && (
        <div className="text-xs text-[#706D66] mb-4 flex items-center gap-2"><Calendar size={12} /> {active.hint}</div>
      )}

      {tab === "project" && <ProjectComplianceTab />}
      {tab !== "project" && active && (
        <CategoryTab
          category={active.category}
          typeSuggestions={types[active.category] || []}
          refreshKey={refreshKey}
          onChange={bump}
          autoOpenId={autoOpenId}
          onAutoOpenConsumed={() => setAutoOpenId("")}
        />
      )}

      {/* Global expiring-soon panel */}
      {summary?.expiringSoon && summary.expiringSoon.length > 0 && (
        <div className="mt-10 card-dark p-5" data-testid="compliance-expiring-panel">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-3">Needs attention · everything expiring within 30 days</div>
          <div className="space-y-2">
            {summary.expiringSoon.slice(0, 8).map((it) => {
              const st = statusFromDays(it.daysUntilExpiry);
              return (
                <div key={it.id} className={`flex items-center justify-between p-3 rounded-md border ${toneClass(st.tone)}`}>
                  <div className="min-w-0">
                    <div className="text-sm text-[#F0EDE8] truncate">{it.type}: {it.name}</div>
                    <div className="text-xs text-[#A19D94]">{it.category?.[0].toUpperCase() + it.category?.slice(1)} · Expires {ukDate(it.expiryDate)}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${toneClass(st.tone)}`}>{st.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
