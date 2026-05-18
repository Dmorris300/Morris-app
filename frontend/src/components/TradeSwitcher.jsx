import { useState } from "react";
import { TRADES } from "../lib/tools-config";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { toast } from "sonner";
import { X, Check, HardHat } from "lucide-react";

export function TradeSwitcher({ open, onClose }) {
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(null);

  if (!open) return null;

  const pick = async (t) => {
    if (t === user?.trade) { onClose(); return; }
    setBusy(t);
    try {
      await api.post("/profile/update", { trade: t });
      await refresh();
      toast.success(`Trade switched to ${t}`);
      onClose();
    } catch { toast.error("Could not switch trade"); }
    finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-50" data-testid="trade-switcher">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center">
        <div className="relative card-dark mx-auto max-w-lg w-full max-h-[80vh] flex flex-col rounded-t-xl md:rounded-xl">
          <div className="p-5 border-b border-[#F0EDE8]/10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <HardHat size={20} className="text-[#E8A020]" />
              <div>
                <div className="text-xs uppercase tracking-widest text-[#A19D94]">Switch trade</div>
                <div className="font-display text-xl tracking-wide">Pick your trade</div>
              </div>
            </div>
            <button onClick={onClose} className="text-[#A19D94] hover:text-[#F0EDE8]" data-testid="trade-switcher-close"><X size={18} /></button>
          </div>
          <div className="overflow-y-auto p-2 flex-1">
            {TRADES.map((t) => {
              const active = t === user?.trade;
              return (
                <button
                  key={t}
                  onClick={() => pick(t)}
                  disabled={busy !== null}
                  className={`w-full text-left px-4 py-3 rounded-md flex items-center justify-between transition-colors ${active ? "bg-[#E8A020]/10 text-[#E8A020]" : "text-[#F0EDE8] hover:bg-[#121212]"}`}
                  data-testid={`trade-option-${t.replace(/[^a-zA-Z]/g, "-").toLowerCase()}`}
                >
                  <span className="text-sm">{t}</span>
                  {busy === t ? <div className="w-4 h-4 border-2 border-[#E8A020]/30 border-t-[#E8A020] rounded-full animate-spin" /> : active ? <Check size={16} className="text-[#E8A020]" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
