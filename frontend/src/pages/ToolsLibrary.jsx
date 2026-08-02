// Morris — Tools Library V2
// The permanent home for every tool. Categorised, searchable, with favourites,
// recently used and recently created documents.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Search, Star, Clock, FileText, ShieldCheck, Wallet, HardHat,
  Users, Wrench, ArrowRight, X, RefreshCw,
} from "lucide-react";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { TOOLS, WOW_TOOLS, ACCOUNT_TOOLS, emojiFor } from "../lib/tools-config";

// Category definition — order shown in the UI
const CATEGORIES = [
  {
    id: "health-safety",
    label: "Health & Safety",
    icon: ShieldCheck,
    ids: [
      "rams", "risk-register", "coshh", "toolbox-talk", "noise-assessment",
      "manual-handling", "working-at-height-rescue", "asbestos-record",
      "rams-library", "hs-policy", "incident-report", "incident-log",
      "site-access-permit", "tool-register",
    ],
  },
  {
    id: "commercial",
    label: "Commercial",
    icon: Wallet,
    ids: [
      "quote-builder", "cis-invoice", "variation-letter", "application-for-payment",
      "payment-chaser", "payment-tracker", "retention-chaser", "bad-debt-letter",
      "eot-claim", "contract-review", "contract-mgmt", "tender-letter",
      "rate-increase-letter", "price-work-quote", "variation-instruction-log",
      "hmrc-correspondence", "complaint-letter", "contra-charge-dispute",
      "novation-letter", "subcontract-letter", "dispute-timeline", "lds-dispute",
      "final-account", "commercial-report", "delay-notice", "reference-letter",
      "verbal-to-variation", "verbal-instruction-recorder", "variation-tracker",
      "pricework-variation-tracker", "pricework-profit", "standing-time-calculator",
    ],
  },
  {
    id: "site",
    label: "Site Management",
    icon: HardHat,
    ids: [
      "site-diary", "multiuser-site-diary", "snagging-list", "delivery-record",
      "meeting-notes", "weather-log", "purchase-order", "procurement-schedule",
      "prestart-meeting", "measurement-record", "photo-to-document",
      "photo-evidence-log", "defects-tracker", "handover-certificate",
      "progress-report", "scope-of-works",
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: Wallet,
    ids: [
      "cis-calculator", "cis-refund-predictor", "tax-pot", "earnings-dashboard",
      "mileage-tracker", "vat-threshold", "self-assessment-prep", "timesheet",
      "daywork-sheet", "subbie-payment-cert",
    ],
  },
  {
    id: "hr",
    label: "HR & Subbies",
    icon: Users,
    ids: [
      "apprentice-manager", "labour-allocation", "new-starter-pack",
      "subbie-mgmt", "subbie-compliance", "company-checker", "hire-agreement",
    ],
  },
  {
    id: "utilities",
    label: "Utilities",
    icon: Wrench,
    ids: ["drafts", "reminders"],
  },
];

const ALL_TOOLS = [...TOOLS, ...WOW_TOOLS];
const TOOL_BY_ID = ALL_TOOLS.reduce((acc, t) => { acc[t.id] = t; return acc; }, {});
// Any tool not mapped to a category goes into Utilities.
const KNOWN_IDS = new Set(CATEGORIES.flatMap((c) => c.ids));
const UNCATEGORISED = ALL_TOOLS.filter((t) => !KNOWN_IDS.has(t.id)).map((t) => t.id);
if (UNCATEGORISED.length) {
  CATEGORIES.find((c) => c.id === "utilities").ids.push(...UNCATEGORISED);
}

function toolNameMatches(tool, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  return (tool.name || "").toLowerCase().includes(s) || (tool.info || "").toLowerCase().includes(s) || (tool.id || "").toLowerCase().includes(s);
}

function ToolCard({ tool, favourite, onToggleFav, testIdPrefix }) {
  if (!tool) return null;
  return (
    <div className="card-dark p-3 hover:border-[#E8A020]/40 transition relative group" data-testid={`${testIdPrefix}-${tool.id}`}>
      <Link to={tool.route} className="block">
        <div className="flex items-start gap-2">
          <div className="text-xl leading-none shrink-0">{emojiFor(tool.id)}</div>
          <div className="min-w-0 flex-1 pr-6">
            <div className="text-sm text-[#F0EDE8] font-medium truncate">{tool.name}</div>
            {tool.info && <div className="text-[11px] text-[#A19D94] mt-1 line-clamp-2">{tool.info}</div>}
          </div>
        </div>
      </Link>
      {onToggleFav && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFav(tool.id); }}
          className={`absolute top-2 right-2 p-1 transition ${favourite ? "text-[#E8A020]" : "text-[#706D66] opacity-0 group-hover:opacity-100 hover:text-[#E8A020]"}`}
          aria-label={favourite ? "Unfavourite" : "Favourite"}
          data-testid={`${testIdPrefix}-fav-${tool.id}`}
        >
          <Star size={14} fill={favourite ? "#E8A020" : "none"} />
        </button>
      )}
    </div>
  );
}

function CategorySection({ category, tools, favourites, onToggleFav, query }) {
  const Icon = category.icon;
  const filtered = tools.filter((t) => toolNameMatches(t, query));
  if (filtered.length === 0 && query) return null;
  return (
    <section className="mb-8" data-testid={`library-section-${category.id}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#1e1a12] text-[#E8A020] flex items-center justify-center"><Icon size={14} /></div>
          <h2 className="font-display text-lg text-[#F0EDE8]">{category.label}</h2>
        </div>
        <span className="text-[10px] uppercase tracking-[0.2em] text-[#706D66]">{filtered.length} tool{filtered.length === 1 ? "" : "s"}</span>
      </div>
      {filtered.length === 0 ? (
        <div className="card-dark p-4 text-xs text-[#706D66]">Nothing in this category yet.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {filtered.map((t) => (
            <ToolCard key={t.id} tool={t} favourite={favourites.includes(t.id)} onToggleFav={onToggleFav} testIdPrefix={`tool-${category.id}`} />
          ))}
        </div>
      )}
    </section>
  );
}

function ChipStrip({ label, icon: Icon, tools, favourites, onToggleFav, empty, testIdPrefix }) {
  if (!tools || tools.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          {Icon && <Icon size={12} className="text-[#E8A020]" />}
          <span className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020]">{label}</span>
        </div>
        <div className="card-dark p-3 text-xs text-[#706D66]">{empty}</div>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon size={12} className="text-[#E8A020]" />}
        <span className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020]">{label}</span>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {tools.map((t) => (
          <ToolCard key={t.id} tool={t} favourite={favourites.includes(t.id)} onToggleFav={onToggleFav} testIdPrefix={testIdPrefix} />
        ))}
      </div>
    </div>
  );
}

// Recently-created documents (from /api/documents)
function RecentDocsList({ docs }) {
  if (!docs || docs.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <FileText size={12} className="text-[#E8A020]" />
          <span className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020]">Recently created</span>
        </div>
        <div className="card-dark p-3 text-xs text-[#706D66]">No documents yet.</div>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <FileText size={12} className="text-[#E8A020]" />
        <span className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020]">Recently created documents</span>
      </div>
      <div className="grid grid-cols-1 gap-2" data-testid="library-recent-docs">
        {docs.slice(0, 5).map((d) => {
          const tool = TOOL_BY_ID[d.toolId];
          const created = (d.createdAt || d.updatedAt || "").slice(0, 10);
          return (
            <Link key={d.id} to="/app/history" className="card-dark p-3 hover:border-[#E8A020]/40 transition block" data-testid={`recent-doc-${d.id}`}>
              <div className="flex items-start gap-2">
                <div className="text-lg leading-none">{emojiFor(d.toolId || "")}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-[#F0EDE8] truncate">{d.title || tool?.name || "Document"}</div>
                  <div className="text-[11px] text-[#A19D94]">{tool?.name || d.toolId} · {created}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function ToolsLibraryV2() {
  const { user, refresh } = useAuth();
  const [query, setQuery] = useState("");
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  const favourites = useMemo(() => Array.isArray(user?.favourites) ? user.favourites : [], [user?.favourites]);
  const recentIds = useMemo(() => Array.isArray(user?.recentlyUsed) ? user.recentlyUsed : [], [user?.recentlyUsed]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/documents");
      setDocs(Array.isArray(r.data) ? r.data : []);
    } catch {
      setDocs([]);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const toggleFav = async (id) => {
    const next = favourites.includes(id) ? favourites.filter((x) => x !== id) : [...favourites, id];
    try {
      await api.post("/profile/update", { favourites: next });
      await refresh();
    } catch { /* ignore */ }
  };

  const favTools = favourites.map((id) => TOOL_BY_ID[id]).filter(Boolean);
  const recentTools = recentIds.map((id) => TOOL_BY_ID[id]).filter(Boolean).slice(0, 5);
  const recentDocs = [...docs].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 5);

  const totalToolCount = ALL_TOOLS.length;
  const filteredCount = query ? ALL_TOOLS.filter((t) => toolNameMatches(t, query)).length : totalToolCount;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="hub-tools-library">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Hub</div>
            <h1 className="font-display text-4xl sm:text-5xl text-[#F0EDE8]">Tools Library</h1>
            <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">Every Morris tool in one place — {totalToolCount} in total. Search, favourite, or jump into any category.</p>
          </div>
          <button onClick={() => { load(); refresh?.(); }} className="text-xs text-[#A19D94] hover:text-[#E8A020] transition flex items-center gap-1" data-testid="library-refresh">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </header>

      {/* Search */}
      <div className="mb-6" data-testid="library-search-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search across every Morris tool..."
            className="w-full bg-[#0f0d09] border border-[#2a2620] rounded-md pl-9 pr-9 py-3 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none"
            data-testid="library-search"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#706D66] hover:text-[#F0EDE8]" data-testid="library-search-clear">
              <X size={14} />
            </button>
          )}
        </div>
        {query && (
          <div className="text-xs text-[#A19D94] mt-2">
            {filteredCount} tool{filteredCount === 1 ? "" : "s"} match &ldquo;{query}&rdquo;
          </div>
        )}
      </div>

      {/* Sidebar strip: favourites / recent tools / recent docs */}
      {!query && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          <ChipStrip label="Favourites" icon={Star} tools={favTools.slice(0, 5)} favourites={favourites} onToggleFav={toggleFav} empty="Star a tool to see it here." testIdPrefix="library-fav" />
          <ChipStrip label="Recently used" icon={Clock} tools={recentTools} favourites={favourites} onToggleFav={toggleFav} empty="No recent tools yet." testIdPrefix="library-recent-tool" />
          <RecentDocsList docs={recentDocs} />
        </div>
      )}

      {/* Categorised sections */}
      {CATEGORIES.map((cat) => {
        const tools = cat.ids.map((id) => TOOL_BY_ID[id]).filter(Boolean);
        return <CategorySection key={cat.id} category={cat} tools={tools} favourites={favourites} onToggleFav={toggleFav} query={query} />;
      })}

      {/* Account tools footer */}
      {!query && ACCOUNT_TOOLS && ACCOUNT_TOOLS.length > 0 && (
        <section className="mt-10 pt-6 border-t border-[#2a2620]" data-testid="library-account-section">
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#706D66] mb-3">Account</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {ACCOUNT_TOOLS.map((t) => (
              <Link key={t.id} to={t.route} className="card-dark p-3 hover:border-[#E8A020]/40 transition text-sm text-[#F0EDE8] flex items-center gap-2" data-testid={`library-account-${t.id}`}>
                <span className="text-base leading-none">{emojiFor(t.id)}</span>
                <span className="truncate">{t.name}</span>
                <ArrowRight size={12} className="ml-auto text-[#706D66]" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
