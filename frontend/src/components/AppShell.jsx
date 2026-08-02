import { useState, useMemo, useEffect } from "react";
import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { MorrisLogo, MorrisWordmark } from "./MorrisLogo";
import { TOOLS, WOW_TOOLS, ACCOUNT_TOOLS, emojiFor } from "../lib/tools-config";
import { useAuth } from "../lib/auth";
import {
  Search, Clock, LogOut, Menu, X, User, HardHat,
  Home, Briefcase, TrendingUp, Wallet, ShieldCheck, Wrench, ImageIcon, Settings as SettingsIcon,
} from "lucide-react";
import { TradeSwitcher } from "./TradeSwitcher";
import AppFooter from "./AppFooter";
import SessionTimeout from "./SessionTimeout";
import Breadcrumbs from "./Breadcrumbs";
import CommandPalette from "./CommandPalette";
import OnboardingTour from "./OnboardingTour";
import NotificationBell from "./NotificationBell";
import { runAlertChecks } from "../lib/alerts";
import "../lib/alerts-seed";

// The 8 top-level navigation items per Platform Hubs V2 spec.
const NAV = [
  { to: "/app", label: "Command Centre", icon: Home, match: (p) => p === "/app" || p === "/app/", testId: "nav-command" },
  { to: "/app/jobs", label: "Projects", icon: Briefcase, match: (p) => p.startsWith("/app/jobs"), testId: "nav-projects" },
  { to: "/app/business", label: "Business Hub", icon: TrendingUp, match: (p) => p.startsWith("/app/business"), testId: "nav-business" },
  { to: "/app/finance", label: "Finance Hub", icon: Wallet, match: (p) => p.startsWith("/app/finance"), testId: "nav-finance" },
  { to: "/app/compliance", label: "Compliance Hub", icon: ShieldCheck, match: (p) => p.startsWith("/app/compliance"), testId: "nav-compliance" },
  { to: "/app/tools-library", label: "Tools Library", icon: Wrench, match: (p) => p.startsWith("/app/tools-library") || p.startsWith("/app/tool/") || p.startsWith("/app/wow/"), testId: "nav-tools" },
  { to: "/app/photo-vault", label: "Photo Vault", icon: ImageIcon, match: (p) => p.startsWith("/app/photo-vault"), testId: "nav-photo-vault" },
  { to: "/app/settings", label: "Settings", icon: SettingsIcon, match: (p) => p.startsWith("/app/settings"), testId: "nav-settings" },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tradeSwitchOpen, setTradeSwitchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const recentlyUsed = (user?.recentlyUsed || []).slice(0, 5);

  useEffect(() => { runAlertChecks(); }, []);

  const allTools = useMemo(() => [...TOOLS, ...WOW_TOOLS, ...ACCOUNT_TOOLS], []);
  const filtered = query.trim()
    ? allTools.filter(t => (t.name || "").toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : null;

  const onLogout = () => { logout(); nav("/"); };

  const closeMobile = () => setMobileOpen(false);

  const sidebarContent = (
    <div className="h-full flex flex-col bg-[#060606] border-r border-[#F0EDE8]/5">
      <div className="p-4 flex items-center justify-between gap-3 border-b border-[#F0EDE8]/5">
        <Link to="/app" className="flex items-center gap-2" data-testid="sidebar-home" onClick={closeMobile}>
          <MorrisLogo size={32} />
          <MorrisWordmark size="text-xl" />
        </Link>
        <div className="flex items-center gap-1">
          <NotificationBell testIdPrefix="notifications-desktop" />
          <button className="md:hidden text-[#A19D94]" onClick={closeMobile} data-testid="sidebar-close-mobile"><X size={20} /></button>
        </div>
      </div>

      <div className="p-3 border-b border-[#F0EDE8]/5">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#706D66]" />
          <input
            className="w-full bg-[#121212] border border-[#F0EDE8]/10 text-sm rounded-md py-2 pl-8 pr-14 text-[#F0EDE8] focus:outline-none focus:border-[#E8A020]/50"
            placeholder="Search tools…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="sidebar-search"
          />
          <span
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] tracking-widest text-[#706D66] border border-[#F0EDE8]/10 rounded px-1.5 py-0.5 select-none"
            title="Cmd+K / Ctrl+K opens global search"
          >⌘K</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        {filtered ? (
          <div className="px-2 space-y-0.5" data-testid="sidebar-search-results">
            {filtered.length === 0 && <div className="px-3 py-4 text-sm text-[#706D66]">No tools match.</div>}
            {filtered.map(t => <ToolLink key={t.id} tool={t} onClick={closeMobile} />)}
            {filtered.length > 0 && (
              <Link
                to="/app/tools-library"
                onClick={closeMobile}
                className="block mt-2 px-3 py-2 text-xs text-[#E8A020] hover:underline"
                data-testid="sidebar-search-open-library"
              >
                See all in Tools Library →
              </Link>
            )}
          </div>
        ) : (
          <>
            <nav className="px-2 space-y-0.5" data-testid="sidebar-nav">
              {NAV.map((item) => {
                const Icon = item.icon;
                const active = item.match(loc.pathname);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={closeMobile}
                    data-testid={item.testId}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition ${active
                      ? "bg-[#E8A020]/10 text-[#E8A020] border-l-2 border-[#E8A020]"
                      : "text-[#A19D94] hover:bg-[#0e0e0e] hover:text-[#F0EDE8] border-l-2 border-transparent"}`}
                  >
                    <Icon size={14} className={active ? "text-[#E8A020]" : "text-[#706D66]"} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {recentlyUsed.length > 0 && (
              <div className="px-2 mt-5" data-testid="sidebar-recently-used">
                <div className="flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[#706D66]">
                  <Clock size={11} /> Recently used
                </div>
                <div className="space-y-0.5">
                  {recentlyUsed.map((id) => {
                    const t = allTools.find(x => x.id === id);
                    if (!t) return null;
                    return <ToolLink key={"recent-" + id} tool={t} onClick={closeMobile} />;
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="border-t border-[#F0EDE8]/5 p-3 text-xs text-[#706D66]">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 truncate">
            <User size={14} className="text-[#E8A020]" />
            <span className="truncate text-[#A19D94]" data-testid="sidebar-username">{user?.username}</span>
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
        <NotificationBell testIdPrefix="notifications-mobile" />
      </div>

      {/* Sidebar desktop */}
      <aside className="hidden md:flex flex-col w-72 fixed inset-y-0 left-0 z-20" data-testid="sidebar-desktop">
        {sidebarContent}
      </aside>

      {/* Sidebar mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={closeMobile} />
          <aside className="absolute inset-y-0 left-0 w-80 max-w-[85%]" data-testid="sidebar-mobile">{sidebarContent}</aside>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 md:ml-72 pt-14 md:pt-0 min-h-screen flex flex-col">
        <Breadcrumbs />
        <div className="flex-1"><Outlet /></div>
        <AppFooter />
      </main>

      <TradeSwitcher open={tradeSwitchOpen} onClose={() => setTradeSwitchOpen(false)} />
      <SessionTimeout />
      <CommandPalette />
      <OnboardingTour />
    </div>
  );
}

function ToolLink({ tool, onClick }) {
  const location = useLocation();
  const route = tool.route || `/app/tool/${tool.id}`;
  const active = location.pathname === route;
  return (
    <Link
      to={route}
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm truncate ${active ? "bg-[#E8A020]/10 text-[#E8A020] border-l-2 border-[#E8A020]" : "text-[#A19D94] hover:bg-[#121212] hover:text-[#F0EDE8] border-l-2 border-transparent"}`}
      data-testid={`tool-link-${tool.id}`}
    >
      <span className="text-base leading-none flex-shrink-0">{emojiFor(tool.id)}</span>
      <span className="truncate">{tool.name}</span>
    </Link>
  );
}
