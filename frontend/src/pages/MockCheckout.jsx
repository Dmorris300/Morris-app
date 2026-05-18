import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { Lock, Loader2 } from "lucide-react";
import { MorrisLogo, MorrisWordmark } from "../components/MorrisLogo";

const PLAN_LABELS = { solo: "Solo £12.99/month", pro: "Pro £24.99/month", business: "Business £59.99/month" };

export default function MockCheckout() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { refresh } = useAuth();
  const sessionId = params.get("session_id");
  const planId = params.get("plan") || "solo";
  const [paying, setPaying] = useState(false);

  useEffect(() => { if (!sessionId) nav("/app/billing", { replace: true }); }, [sessionId]);

  const pay = async () => {
    setPaying(true);
    try {
      await api.post(`/billing/mock-complete?session_id=${encodeURIComponent(sessionId)}`);
      toast.success("Payment received. (Demo mode.)");
      await refresh();
      nav(`/app/billing?session_id=${encodeURIComponent(sessionId)}`, { replace: true });
    } catch (err) {
      toast.error("Mock payment failed");
      setPaying(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#060606] text-[#F0EDE8] font-body flex items-center justify-center p-6" data-testid="mock-checkout">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 justify-center mb-8">
          <MorrisLogo size={42} />
          <MorrisWordmark size="text-3xl" />
        </div>
        <div className="card-dark p-6 md:p-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] uppercase tracking-widest text-[#E8A020] border border-[#E8A020]/40 px-2 py-1 rounded">Demo Stripe</span>
          </div>
          <h2 className="font-display text-3xl mb-3">Confirm your subscription</h2>
          <p className="text-sm text-[#A19D94] mb-6">This is a simulated Stripe checkout because no real Stripe key is configured yet. When the founder pastes a real Stripe key, this is replaced with the real Stripe Checkout page.</p>

          <div className="border border-[#F0EDE8]/10 rounded-md p-4 mb-6 bg-[#0c0c0c]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-widest text-[#A19D94]">Plan</span>
              <span className="font-display text-lg">{PLAN_LABELS[planId] || planId}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-[#706D66]">
              <span>Card</span>
              <span className="font-mono">**** 4242 (test)</span>
            </div>
          </div>

          <button onClick={pay} className="btn-primary w-full flex items-center justify-center gap-2" disabled={paying} data-testid="mock-pay-btn">
            {paying ? <><Loader2 size={16} className="animate-spin" /> Processing.</> : <><Lock size={14} /> Pay now</>}
          </button>
          <button onClick={() => nav("/app/billing?cancelled=1", { replace: true })} className="w-full text-xs text-[#706D66] hover:text-[#F0EDE8] mt-3" data-testid="mock-cancel-btn">
            Cancel
          </button>
        </div>
        <p className="text-xs text-[#706D66] text-center mt-6">Powered by Stripe. Your card is not charged in demo mode.</p>
      </div>
    </div>
  );
}
