import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Star, ArrowRight } from "lucide-react";
import { TOOLS, WOW_TOOLS, ACCOUNT_TOOLS, emojiFor } from "../lib/tools-config";

// Cmd/Ctrl + K opens a global tool palette. Type to filter, ↑↓ to navigate, Enter to open.
export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const nav = useNavigate();

  useEffect(() => {
    const onKey = (e) => {
      const isK = e.key === "k" || e.key === "K";
      if (isK && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ(""); setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const all = useMemo(() => [...TOOLS, ...WOW_TOOLS, ...ACCOUNT_TOOLS, ...EXTRA_ROUTES], []);
  const filtered = useMemo(() => {
    if (!q.trim()) return all.slice(0, 24);
    const t = q.toLowerCase();
    return all.filter(x => x.name.toLowerCase().includes(t) || (x.section || "").toLowerCase().includes(t)).slice(0, 24);
  }, [q, all]);

  const go = (item) => {
    setOpen(false);
    nav(item.route || `/app/tool/${item.id}`);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-20 px-4" data-testid="cmdk-palette">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-2xl rounded-xl border border-[#E8A020]/30 bg-[#0a0a0a] shadow-2xl overflow-hidden" style={{ boxShadow: "0 25px 70px rgba(232,160,32,0.18)" }}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E8A020]/15">
          <Search size={16} className="text-[#E8A020]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(filtered.length - 1, a + 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              if (e.key === "Enter") { const it = filtered[active]; if (it) go(it); }
            }}
            placeholder="Search Morris. type a tool, section or page…"
            className="flex-1 bg-transparent text-[#F0EDE8] outline-none text-sm placeholder:text-[#706D66]"
            data-testid="cmdk-input"
          />
          <button onClick={() => setOpen(false)} className="text-[#706D66] hover:text-[#F0EDE8]" data-testid="cmdk-close"><X size={14}/></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-sm text-[#706D66] text-center">No matches. Try a different word.</div>
          ) : filtered.map((item, i) => (
            <button
              key={(item.id || "") + i}
              onClick={() => go(item)}
              onMouseEnter={() => setActive(i)}
              className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition ${i === active ? "bg-[#E8A020]/10" : "hover:bg-[#101010]"}`}
              data-testid={`cmdk-item-${item.id || i}`}
            >
              <div className="flex items-center gap-3 truncate">
                <span className="text-lg">{emojiFor(item.id) || "🔧"}</span>
                <div className="truncate">
                  <div className={`truncate ${i === active ? "text-[#E8A020]" : "text-[#F0EDE8]"}`}>{item.name}</div>
                  <div className="text-[10px] uppercase tracking-widest text-[#706D66]">{item.section || "navigation"}</div>
                </div>
              </div>
              <ArrowRight size={12} className={i === active ? "text-[#E8A020]" : "text-[#3d3d3d]"} />
            </button>
          ))}
        </div>
        <div className="border-t border-[#1a1a1a] px-4 py-2.5 text-[10px] text-[#706D66] flex items-center justify-between">
          <span>↑↓ navigate · enter open · esc close</span>
          <span className="font-semibold tracking-wider">⌘K / Ctrl K</span>
        </div>
      </div>
    </div>
  );
}

// Non-tool routes that should show up in the global palette
const EXTRA_ROUTES = [
  { id: "command-centre", name: "Command Centre", section: "navigation", route: "/app" },
  { id: "jobs", name: "Job Tracker", section: "navigation", route: "/app/jobs" },
  { id: "history", name: "Document Vault", section: "navigation", route: "/app/history" },
  { id: "favourites", name: "Favourites", section: "navigation", route: "/app/favourites" },
  { id: "profile", name: "My Profile", section: "navigation", route: "/app/profile" },
  { id: "billing", name: "Plan & Billing", section: "navigation", route: "/app/billing" },
  { id: "earnings", name: "Earnings Dashboard", section: "navigation", route: "/app/earnings" },
  { id: "mileage", name: "Mileage Tracker", section: "navigation", route: "/app/mileage" },
  { id: "vat", name: "VAT Threshold Advisor", section: "navigation", route: "/app/vat" },
  { id: "cis-predictor", name: "CIS Refund Predictor", section: "navigation", route: "/app/cis-predictor" },
];
