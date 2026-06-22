import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Trash2, Search, FilterX, RotateCw, Inbox } from "lucide-react";
import { toast } from "sonner";
import { listDrafts, deleteDraft } from "../lib/drafts";
import { getToolById } from "../lib/tools-config";

const fmtWhen = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (sameDay) return `Today · ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  if (d.toDateString() === yest.toDateString()) return `Yesterday · ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export default function Drafts() {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState(null);   // null = loading
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try { setDrafts(await listDrafts()); }
    catch { toast.error("Could not load drafts"); setDrafts([]); }
  };
  useEffect(() => { load(); }, []);

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const toolOptions = useMemo(() => {
    if (!drafts) return [];
    const m = new Map();
    drafts.forEach((d) => { if (!m.has(d.toolId)) m.set(d.toolId, d.toolName); });
    return Array.from(m, ([id, name]) => ({ id, name }));
  }, [drafts]);

  const filtered = useMemo(() => {
    if (!drafts) return [];
    const q = query.trim().toLowerCase();
    return drafts.filter((d) => {
      if (filter !== "all" && d.toolId !== filter) return false;
      if (q) {
        const hay = `${d.title || ""} ${d.toolName || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [drafts, filter, query]);

  const onResume = (d) => {
    const tool = getToolById(d.toolId);
    const route = tool?.route ? `${tool.route}?draft=${d.id}` : `/app/tool/${d.toolId}?draft=${d.id}`;
    navigate(route);
  };

  const onDelete = async (d) => {
    if (!window.confirm(`Delete the draft "${d.title}"? This cannot be undone.`)) return;
    try {
      await deleteDraft(d.id);
      setDrafts((arr) => (arr || []).filter((x) => x.id !== d.id));
      toast.success("Draft deleted");
    } catch { toast.error("Could not delete"); }
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid="page-drafts">
      <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Documents</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight flex items-center gap-3">
            <FileText size={32} className="text-[#E8A020]" />
            <span>Drafts</span>
          </h1>
          <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">
            Any tool you started but didn&apos;t finish. Drafts never expire. Tap Resume to pick up exactly where you left off — every field, row and toggle is restored.
          </p>
        </div>
        <button onClick={refresh} disabled={refreshing} className="btn-secondary flex items-center gap-2" data-testid="drafts-refresh">
          <RotateCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Filter bar */}
      <div className="card-dark p-4 my-5" data-testid="drafts-filters">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
            <input
              className="input-base !pl-9"
              placeholder="Search by title or tool name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="drafts-search"
            />
          </div>
          <select
            className="input-base !w-auto"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            data-testid="drafts-tool-filter"
          >
            <option value="all">All tools</option>
            {toolOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          {(filter !== "all" || query) && (
            <button onClick={() => { setFilter("all"); setQuery(""); }} className="text-xs text-[#A19D94] hover:text-[#E8A020] flex items-center gap-1" data-testid="drafts-filter-clear">
              <FilterX size={12} /> Clear
            </button>
          )}
          <div className="text-[11px] text-[#706D66] ml-auto" data-testid="drafts-count">
            {filtered.length} of {drafts?.length || 0} draft{(drafts?.length || 0) === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* Empty / loading states */}
      {drafts === null && (
        <div className="card-dark p-12 text-center text-[#A19D94] text-sm" data-testid="drafts-loading">Loading drafts…</div>
      )}
      {drafts !== null && drafts.length === 0 && (
        <div className="card-dark p-12 text-center" data-testid="drafts-empty">
          <Inbox size={42} className="mx-auto text-[#3d3d3d] mb-4" />
          <div className="text-[#F0EDE8] font-semibold mb-1">No drafts yet</div>
          <div className="text-sm text-[#A19D94] max-w-md mx-auto">
            Start any tool, fill in what you have so far, then tap the <span className="text-[#E8A020]">Save Draft</span> button at the top of the page. It&apos;ll show up here ready to resume.
          </div>
        </div>
      )}
      {drafts !== null && drafts.length > 0 && filtered.length === 0 && (
        <div className="card-dark p-12 text-center" data-testid="drafts-no-matches">
          <div className="text-[#F0EDE8] font-semibold mb-1">No drafts match your filters</div>
          <div className="text-sm text-[#A19D94]">Try a different search term or tool.</div>
        </div>
      )}

      {/* Draft cards */}
      {filtered.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="drafts-grid">
          {filtered.map((d, idx) => (
            <div key={d.id} className="card-dark p-4 flex flex-col gap-2" data-testid={`draft-card-${idx}`}>
              <div className="text-[10px] uppercase tracking-widest text-[#E8A020] truncate" data-testid={`draft-card-${idx}-tool`}>
                {d.toolName}
              </div>
              <div className="text-[#F0EDE8] text-sm font-semibold leading-snug line-clamp-2" data-testid={`draft-card-${idx}-title`}>
                {d.title || `${d.toolName} draft`}
              </div>
              <div className="text-[11px] text-[#706D66] mt-auto">Last saved {fmtWhen(d.updatedAt || d.createdAt)}</div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => onResume(d)}
                  className="btn-primary !py-1.5 !text-xs flex-1"
                  data-testid={`draft-card-${idx}-resume`}
                >Resume</button>
                <button
                  onClick={() => onDelete(d)}
                  className="btn-secondary !py-1.5 !text-xs text-[#E5635A] hover:text-[#E5635A]"
                  title="Delete draft"
                  data-testid={`draft-card-${idx}-delete`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
