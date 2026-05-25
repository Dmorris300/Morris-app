import { useState, useMemo } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { MorrisLogo, MorrisWordmark } from "./MorrisLogo";
import { TOOLS, WOW_TOOLS, SECTIONS, getToolsBySection, emojiFor } from "../lib/tools-config";
import { useAuth } from "../lib/auth";
import { Search, ChevronDown, ChevronRight, Star, Clock, LogOut, Menu, X, User, FileText, History as HistoryIcon, Settings as SettingsIcon, HardHat, Briefcase } from "lucide-react";
import { TradeSwitcher } from "./TradeSwitcher";
import AppFooter from "./AppFooter";
import SessionTimeout from "./SessionTimeout";

export default function AppShell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tradeSwitchOpen, setTradeSwitchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [openSections, setOpenSections] = useState({ documents: true, finance: true, site: false, pricework: false, soletrader: false, contractors: false, account: false });

  const recentlyUsed = (user?.recentlyUsed || []).slice(0, 5);

  const allTools = useMemo(() => [...TOOLS, ...WOW_TOOLS], []);
  const filtered = query.trim() ? allTools.filter(t => t.name.toLowerCase().includes(query.toLowerCase())) : null;

  const toggleSection = (id) => setOpenSections((s) => ({ ...s, [id]: !s[id] }));

  const onLogout = () => { logout(); nav("/"); };

  const sidebarContent = (
    <div className="h-full flex flex-col bg-[#060606] border-r border-[#F0EDE8]/5">
      <div className="p-4 flex items-center justify-between gap-3 border-b border-[#F0EDE8]/5">
        <Link to="/app" className="flex items-center gap-2" data-testid="sidebar-home">
          <MorrisLogo size={32} />
          {!collapsed && <MorrisWordmark size="text-xl" />}
        </Link>
        <button className="md:hidden text-[#A19D94]" onClick={() => setMobileOpen(false)} data-testid="sidebar-close-mobile"><X size={20} /></button>
      </div>

      <div className="p-3 border-b border-[#F0EDE8]/5">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
          <input
            className="w-full bg-[#121212] border border-[#F0EDE8]/10 text-sm rounded-md py-2 pl-8 pr-3 text-[#F0EDE8] focus:outline-none focus:border-[#E8A020]/50"
            placeholder="Search tools…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="sidebar-search"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {filtered ? (
          <div className="px-2 space-y-0.5" data-testid="sidebar-search-results">
            {filtered.length === 0 && <div className="px-3 py-4 text-sm text-[#706D66]">No tools match.</div>}
            {filtered.map(t => <ToolLink key={t.id} tool={t} />)}
          </div>
        ) : (
          <>
            <div className="px-2 mb-2" data-testid="sidebar-jobs-pinned">
              <Link
                to="/app/jobs"
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition ${loc.pathname.startsWith("/app/jobs") ? "bg-[#121212] text-[#E8A020]" : "text-[#A19D94] hover:bg-[#0e0e0e] hover:text-[#F0EDE8]"}`}
                onClick={() => setMobileOpen(false)}
                data-testid="sidebar-jobs"
              >
                <Briefcase size={14} className="text-[#E8A020]" />
                <span className="font-semibold tracking-wide">Job Tracker</span>
              </Link>
            </div>
            {recentlyUsed.length > 0 && (
              <SidebarGroup label="Recently Used" icon={<Clock size={14} />} open={true} onToggle={() => {}}>
                {recentlyUsed.map((id) => {
                  const t = allTools.find(x => x.id === id);
                  if (!t) return null;
                  return <ToolLink key={"recent-" + id} tool={t} />;
                })}
              </SidebarGroup>
            )}
            {SECTIONS.map((s) => {
              const tools = getToolsBySection(s.id);
              return (
                <SidebarGroup key={s.id} label={s.label} open={!!openSections[s.id]} onToggle={() => toggleSection(s.id)} testId={`section-${s.id}`}>
                  {tools.map(t => <ToolLink key={t.id} tool={t} />)}
                </SidebarGroup>
              );
            })}
          </>
        )}
      </div>

      <div className="border-t border-[#F0EDE8]/5 p-3 text-xs text-[#706D66]">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 truncate">
            <User size={14} className="text-[#E8A020]" />
            <span className="truncate text-[#A19D94]">{user?.username}</span>
          </div>
          <button onClick={onLogout} className="hover:text-[#E8A020]" title="Log out" data-testid="sidebar-logout"><LogOut size={14} /></button>
        </div>
        <button
          onClick={() => setTradeSwitchOpen(true)}
          className="w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-[#121212] transition-colors group"
          data-testid="sidebar-trade-switch"
        >
          <span className="flex items-center gap-2 truncate">
            <HardHat size={12} className="text-[#E8A020]" />
            <span className="truncate text-[#A19D94] group-hover:text-[#F0EDE8]">{user?.trade || "No trade set"}</span>
          </span>
          <span className="text-[10px] uppercase tracking-widest text-[#706D66] group-hover:text-[#E8A020]">Switch</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#060606] text-[#F0EDE8] font-body flex">
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-[#060606] border-b border-[#F0EDE8]/5 px-4 py-3 flex items-center justify-between">
        <button onClick={() => setMobileOpen(true)} className="text-[#F0EDE8]" data-testid="mobile-menu-open"><Menu size={22} /></button>
        <div className="flex items-center gap-2"><MorrisLogo size={28} /><MorrisWordmark size="text-xl" /></div>
        <div className="w-6" />
      </div>

      {/* Sidebar. desktop */}
      <aside className="hidden md:flex flex-col w-72 fixed inset-y-0 left-0 z-20" data-testid="sidebar-desktop">
        {sidebarContent}
      </aside>

      {/* Sidebar. mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-80 max-w-[85%]" data-testid="sidebar-mobile">{sidebarContent}</aside>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 md:ml-72 pt-14 md:pt-0 min-h-screen flex flex-col">
        <div className="flex-1"><Outlet /></div>
        <AppFooter />
      </main>

      <TradeSwitcher open={tradeSwitchOpen} onClose={() => setTradeSwitchOpen(false)} />
      <SessionTimeout />
    </div>
  );
}

function SidebarGroup({ label, open, onToggle, children, icon, testId }) {
  return (
    <div className="px-2">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-xs uppercase tracking-widest text-[#A19D94] hover:text-[#F0EDE8] transition-colors"
        data-testid={testId}
      >
        <span className="flex items-center gap-2">{icon}{label}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && <div className="space-y-0.5 mb-2">{children}</div>}
    </div>
  );
}

function ToolLink({ tool }) {
  const location = useLocation();
  const route = tool.route || `/app/tool/${tool.id}`;
  const active = location.pathname === route;
  return (
    <Link
      to={route}
      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm truncate ${active ? "bg-[#E8A020]/10 text-[#E8A020] border-l-2 border-[#E8A020]" : "text-[#A19D94] hover:bg-[#121212] hover:text-[#F0EDE8] border-l-2 border-transparent"}`}
      data-testid={`tool-link-${tool.id}`}
    >
      <span className="text-base leading-none flex-shrink-0">{emojiFor(tool.id)}</span>
      <span className="truncate">{tool.name}</span>
    </Link>
  );
}
