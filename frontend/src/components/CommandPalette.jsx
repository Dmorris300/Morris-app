import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, X, ArrowRight, Clock, Briefcase, Users, FileText, Camera,
  PoundSterling, Receipt, ClipboardList, AlertTriangle, ShieldAlert, Wrench,
  Layers, FileSignature, FileCheck2, StickyNote,
} from "lucide-react";
import { TOOLS, WOW_TOOLS, ACCOUNT_TOOLS, emojiFor } from "../lib/tools-config";
import api from "../lib/api";

// Cmd/Ctrl + K opens the Global Search. Type to search across every Morris
// record. ↑↓ navigate, Enter opens, Esc closes.
const RECENT_KEY = "morris.global-search.recent";

const SCOPES = [
  { id: "all",          label: "All" },
  { id: "projects",     label: "Projects" },
  { id: "clients",      label: "Clients" },
  { id: "documents",    label: "Documents" },
  { id: "photos",       label: "Photos" },
  { id: "quotes",       label: "Quotes" },
  { id: "variations",   label: "Variations" },
  { id: "applications", label: "Applications" },
  { id: "invoices",     label: "Invoices" },
  { id: "site-diary",   label: "Site Diaries" },
  { id: "incidents",    label: "Incidents" },
  { id: "risks",        label: "Risks" },
  { id: "tasks",        label: "Tasks" },
  { id: "tools",        label: "Tools" },
];

const KIND_META = {
  project:      { label: "Project",     icon: Briefcase,      cls: "text-[#68B4F0]" },
  client:       { label: "Client",      icon: Users,          cls: "text-[#A0A0F0]" },
  document:     { label: "Document",    icon: FileText,       cls: "text-[#F0EDE8]" },
  draft:        { label: "Draft",       icon: StickyNote,     cls: "text-[#A19D94]" },
  photo:        { label: "Photo",       icon: Camera,         cls: "text-[#F0EDE8]" },
  quote:        { label: "Quote",       icon: FileCheck2,     cls: "text-[#68D391]" },
  variation:    { label: "Variation",   icon: FileSignature,  cls: "text-[#E8A020]" },
  application:  { label: "Application", icon: PoundSterling,  cls: "text-[#E8A020]" },
  invoice:      { label: "Invoice",     icon: Receipt,        cls: "text-[#E8A020]" },
  "site-diary": { label: "Site Diary",  icon: ClipboardList,  cls: "text-[#68B4F0]" },
  incident:     { label: "Incident",    icon: AlertTriangle,  cls: "text-[#F27C7C]" },
  risk:         { label: "Risk",        icon: ShieldAlert,    cls: "text-[#F27C7C]" },
  task:         { label: "Task",        icon: Layers,         cls: "text-[#A19D94]" },
  tool:         { label: "Tool",        icon: Wrench,         cls: "text-[#A19D94]" },
};

function loadRecent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; } }
function pushRecent(item) {
  try {
    const existing = loadRecent().filter(x => !(x.route === item.route && x.title === item.title));
    const next = [{ title: item.title, subtitle: item.subtitle, route: item.route, kind: item.kind }, ...existing].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("all");
  const [active, setActive] = useState(0);
  const [serverResults, setServerResults] = useState([]);
  const [serverLoading, setServerLoading] = useState(false);
  const [recent, setRecent] = useState([]);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const nav = useNavigate();

  useEffect(() => {
    const onKey = (e) => {
      const isK = e.key === "k" || e.key === "K";
      if (isK && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ(""); setActive(0); setServerResults([]); setScope("all");
      setRecent(loadRecent());
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Client-side tool matches (fast, no network)
  const allTools = useMemo(() => [...TOOLS, ...WOW_TOOLS, ...ACCOUNT_TOOLS], []);
  const toolMatches = useMemo(() => {
    if (!q.trim()) return [];
    const t = q.toLowerCase();
    return allTools
      .filter(x => x.name.toLowerCase().includes(t) || (x.section || "").toLowerCase().includes(t))
      .slice(0, 6)
      .map(x => ({
        kind: "tool",
        id: x.id,
        title: x.name,
        subtitle: x.section || "tool",
        route: x.route || `/app/tool/${x.id}`,
        badge: "tool",
      }));
  }, [q, allTools]);

  // Debounced server search
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (!term && scope === "all") { setServerResults([]); return; }
    setServerLoading(true);
    const handle = setTimeout(async () => {
      try {
        const r = await api.get("/search", { params: { q: term, scope, limit: scope === "all" ? 40 : 25 } });
        setServerResults(r.data.results || []);
      } catch { setServerResults([]); }
      finally { setServerLoading(false); }
    }, 220);
    return () => clearTimeout(handle);
  }, [q, scope, open]);

  // De-duplicate tool section between client hits and server tools
  const combined = useMemo(() => {
    const server = serverResults.filter(r => !(r.kind === "tool" && toolMatches.some(t => t.route === r.route)));
    return [...toolMatches, ...server];
  }, [serverResults, toolMatches]);

  useEffect(() => { setActive(0); }, [combined.length]);

  const go = useCallback((item) => {
    if (!item) return;
    pushRecent(item);
    setOpen(false);
    nav(item.route || "/app");
  }, [nav]);

  // Group by kind for display when scope=all
  const grouped = useMemo(() => {
    const buckets = new Map();
    combined.forEach(r => {
      const k = r.kind || "other";
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(r);
    });
    // Preferred display order
    const order = ["tool", "project", "client", "quote", "variation", "application", "invoice", "site-diary", "incident", "risk", "document", "draft", "photo", "task", "other"];
    return order.filter(k => buckets.has(k)).map(k => [k, buckets.get(k)]);
  }, [combined]);

  const flatIndex = useMemo(() => combined, [combined]);

  const onKeyInInput = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(flatIndex.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); go(flatIndex[active]); }
    else if (e.key === "Tab") {
      e.preventDefault();
      const idx = SCOPES.findIndex(s => s.id === scope);
      const next = SCOPES[(idx + (e.shiftKey ? SCOPES.length - 1 : 1)) % SCOPES.length];
      setScope(next.id);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-16 md:pt-20 px-4" data-testid="cmdk-palette">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-2xl rounded-xl border border-[#E8A020]/30 bg-[#0a0a0a] shadow-2xl overflow-hidden" style={{ boxShadow: "0 25px 70px rgba(232,160,32,0.18)" }}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E8A020]/15">
          <Search size={16} className="text-[#E8A020]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyInInput}
            placeholder="Search projects, clients, invoices, variations, photos, documents…"
            className="flex-1 bg-transparent text-[#F0EDE8] outline-none text-sm placeholder:text-[#706D66]"
            data-testid="cmdk-input"
          />
          {serverLoading && <span className="text-[10px] text-[#706D66]">Searching…</span>}
          <button onClick={() => setOpen(false)} className="text-[#706D66] hover:text-[#F0EDE8]" data-testid="cmdk-close"><X size={14}/></button>
        </div>

        {/* Scope chips */}
        <div className="flex gap-1 overflow-x-auto px-3 py-2 border-b border-[#1a1a1a] scrollbar-none" data-testid="cmdk-scopes">
          {SCOPES.map(s => (
            <button key={s.id} onClick={() => setScope(s.id)}
              className={`text-[11px] px-2.5 py-1 rounded-full whitespace-nowrap ${scope === s.id ? "bg-[#E8A020] text-black" : "text-[#A19D94] hover:text-[#F0EDE8] border border-[#1a1a1a]"}`}
              data-testid={`cmdk-scope-${s.id}`}
            >{s.label}</button>
          ))}
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-2">
          {q.trim() === "" && scope === "all" && recent.length > 0 && (
            <div className="pb-2" data-testid="cmdk-recent">
              <div className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-[#706D66] flex items-center gap-1"><Clock size={10} /> Recent</div>
              {recent.map((r, i) => <ResultRow key={i} item={r} active={false} onEnter={go} />)}
            </div>
          )}
          {q.trim() === "" && scope === "all" && recent.length === 0 && (
            <div className="px-4 py-8 text-sm text-[#706D66] text-center">Start typing to search across every Morris record. <br /><span className="text-[10px]">Tip — press <kbd className="border border-[#2a2620] rounded px-1">Tab</kbd> to switch scope.</span></div>
          )}
          {q.trim() !== "" && flatIndex.length === 0 && !serverLoading && (
            <div className="px-4 py-8 text-sm text-[#706D66] text-center">No matches for &quot;{q}&quot; in {SCOPES.find(s => s.id === scope)?.label}.</div>
          )}
          {flatIndex.length > 0 && grouped.map(([kind, items]) => (
            <div key={kind} className="pb-1">
              <div className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-[#706D66]">{KIND_META[kind]?.label || kind} · {items.length}</div>
              {items.map(item => {
                const idx = flatIndex.indexOf(item);
                return <ResultRow key={item.id + item.route} item={item} active={idx === active} onEnter={go} onHover={() => setActive(idx)} testId={`cmdk-item-${item.kind}-${item.id}`} />;
              })}
            </div>
          ))}
        </div>

        <div className="border-t border-[#1a1a1a] px-4 py-2.5 text-[10px] text-[#706D66] flex items-center justify-between">
          <span>↑↓ navigate · ⏎ open · Tab switch scope · esc close</span>
          <span className="font-semibold tracking-wider">⌘K / Ctrl K</span>
        </div>
      </div>
    </div>
  );
}

function ResultRow({ item, active, onEnter, onHover, testId }) {
  const meta = KIND_META[item.kind] || KIND_META.tool;
  const Icon = meta.icon;
  const emoji = item.kind === "tool" ? emojiFor(item.id) : null;
  return (
    <button
      onClick={() => onEnter(item)}
      onMouseEnter={onHover}
      className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition ${active ? "bg-[#E8A020]/10" : "hover:bg-[#101010]"}`}
      data-testid={testId}
    >
      <div className="flex items-center gap-3 truncate min-w-0">
        <span className="w-6 h-6 rounded-md bg-[#111] border border-[#1e1e1e] flex items-center justify-center text-xs shrink-0">
          {emoji ? <span>{emoji}</span> : <Icon size={13} className={meta.cls} />}
        </span>
        <div className="truncate min-w-0">
          <div className={`truncate ${active ? "text-[#E8A020]" : "text-[#F0EDE8]"}`}>{item.title}</div>
          <div className="text-[10px] uppercase tracking-widest text-[#706D66] truncate">
            <span className={meta.cls}>{meta.label}</span>{item.subtitle ? ` · ${item.subtitle}` : ""}
            {item.badge && item.badge !== item.kind ? ` · ${item.badge}` : ""}
          </div>
        </div>
      </div>
      <ArrowRight size={12} className={active ? "text-[#E8A020]" : "text-[#3d3d3d] shrink-0"} />
    </button>
  );
}
