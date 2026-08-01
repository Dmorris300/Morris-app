// Overflow page for Attention Required — shown when the Command Centre has
// more than 8 attention items to display. Same data source, no truncation.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import api from "../lib/api";

const SEVERITY_STYLES = {
  urgent:  { fg: "#E5635A", border: "rgba(229,99,90,0.4)",  bg: "rgba(229,99,90,0.05)",  dot: "#E5635A" },
  warning: { fg: "#E8A020", border: "rgba(232,160,32,0.4)", bg: "rgba(232,160,32,0.05)", dot: "#E8A020" },
  info:    { fg: "#A19D94", border: "rgba(240,237,232,0.12)", bg: "rgba(240,237,232,0.02)", dot: "#706D66" },
};

export default function AttentionPage() {
  const [items, setItems] = useState(null);
  const navigate = useNavigate();
  useEffect(() => {
    api.get("/attention").then((r) => setItems(r.data.items || [])).catch(() => setItems([]));
  }, []);

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto" data-testid="attention-page">
      <Link to="/app" className="inline-flex items-center gap-2 text-xs text-[#A19D94] hover:text-[#E8A020] mb-4">
        <ArrowLeft size={12} /> Back to Command Centre
      </Link>
      <h1 className="font-display text-4xl sm:text-5xl text-[#F0EDE8] mb-1">Attention Required</h1>
      <p className="text-sm text-[#A19D94] mb-8">Everything that needs a decision from you right now, sorted by urgency.</p>

      {items === null ? (
        <div className="py-8 text-[#706D66] text-sm inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
      ) : items.length === 0 ? (
        <div className="card-dark p-6 flex items-start gap-3" data-testid="attention-empty">
          <CheckCircle2 size={22} className="text-[#5BC97A] shrink-0 mt-0.5" />
          <div>
            <div className="text-[#F0EDE8] text-base">Everything looks good today.</div>
            <div className="text-[#A19D94] text-sm mt-1">You have no outstanding items. Enjoy the peace.</div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const s = SEVERITY_STYLES[it.severity] || SEVERITY_STYLES.info;
            return (
              <div key={it.id} className="flex items-start gap-3 p-3 rounded-md border" style={{ borderColor: s.border, background: s.bg }} data-testid={`attention-row-${it.kind}`}>
                <span className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ background: s.dot }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[#F0EDE8]">{it.title}</div>
                  {it.subtitle && <div className="text-xs text-[#A19D94] mt-0.5">{it.subtitle}</div>}
                </div>
                <button onClick={() => navigate(it.actionRoute)} className="text-xs px-3 py-1.5 rounded border hover:bg-[#141414] shrink-0" style={{ color: s.fg, borderColor: s.border }}>
                  {it.actionLabel}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
