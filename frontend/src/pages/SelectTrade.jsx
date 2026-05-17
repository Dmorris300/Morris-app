import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { TRADES } from "../lib/tools-config";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { MorrisLogo, MorrisWordmark } from "../components/MorrisLogo";
import { toast } from "sonner";
import { ArrowRight, Check } from "lucide-react";

export default function SelectTrade() {
  const nav = useNavigate();
  const { user, refresh } = useAuth();
  const [trade, setTrade] = useState(user?.trade || "");
  const [companyName, setCompanyName] = useState(user?.companyName || "");
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!trade) { toast.error("Pick your trade"); return; }
    setLoading(true);
    try {
      await api.post("/profile/update", { trade, companyName, fullName });
      await refresh();
      toast.success("All set");
      nav("/app");
    } catch (err) {
      toast.error("Could not save");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#060606] text-[#F0EDE8] font-body flex items-center justify-center p-6 morris-grain">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-3 justify-center mb-10">
          <MorrisLogo size={48} />
          <MorrisWordmark size="text-4xl" />
        </div>
        <div className="card-dark p-8 md:p-12">
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-3">Step 1 of 1</div>
          <h2 className="font-display text-4xl md:text-5xl mb-3">Pick your trade.</h2>
          <p className="text-[#A19D94] mb-8">Every document Morris generates is personalised to your trade. You can change this anytime in Profile.</p>
          <form onSubmit={onSubmit} className="space-y-5" data-testid="select-trade-form">
            <div>
              <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">Trade</div>
              <select value={trade} onChange={(e) => setTrade(e.target.value)} className="input-base" data-testid="trade-select">
                <option value="">— Choose your trade —</option>
                {TRADES.map(tr => <option key={tr} value={tr}>{tr}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">Your name (appears on documents)</div>
              <input className="input-base" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Smith" data-testid="trade-fullname" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">Company name (optional)</div>
              <input className="input-base" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Smith Plumbing Ltd" data-testid="trade-company" />
            </div>
            <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2" disabled={loading} data-testid="trade-submit">
              {loading ? "Saving…" : <>Open my toolbox <ArrowRight size={16} /></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
