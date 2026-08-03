import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { X, ArrowRight, ChevronRight, Briefcase, Receipt, Mic, Camera, PiggyBank } from "lucide-react";

const STORAGE_KEY = "morris_onboarding_done_v1";

const STEPS = [
  {
    title: "Welcome to Morris.",
    body: "Built by a UK duct fitter who got tired of paperwork stealing his evenings. 80+ tools, professional document templates, all the chase letters you'll ever need.",
    cta: "Show me around",
    icon: null,
  },
  {
    title: "Start from the Command Centre.",
    body: "Your tax pot, CIS refund estimate, outstanding invoices, expiry alerts and recent docs in one place. Tap any card to drill in.",
    cta: "Next",
    icon: <Briefcase size={20} />,
  },
  {
    title: "Three wow features.",
    body: "Verbal to Variation: speak it, send it. Photo to Document: snap a scribble, get a doc. CIS Refund Predictor: see what HMRC owes you, live.",
    cta: "Next",
    icon: <Mic size={20} />,
  },
  {
    title: "Every doc auto-saves.",
    body: "Generated documents land in your Vault with a unique reference number. Find them under Document Vault any time, on any device.",
    cta: "Next",
    icon: <Receipt size={20} />,
  },
  {
    title: "Stay on top of the tax pot.",
    body: "Tap Tax Pot in Finance to log what you've set aside each week. Morris counts down to your 31 January deadline so you're never caught short.",
    cta: "Next",
    icon: <PiggyBank size={20} />,
  },
  {
    title: "Press ⌘K (Ctrl+K) anywhere.",
    body: "Open the search palette to jump straight to any tool. Faster than the sidebar once you know your way around.",
    cta: "Got it. Let's go.",
    icon: <Camera size={20} />,
    final: true,
  },
];

export default function OnboardingTour() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const nav = useNavigate();

  useEffect(() => {
    if (!user) return;
    let done = "";
    try { done = localStorage.getItem(STORAGE_KEY) || ""; } catch { /* ignore */ }
    // Show on the first login after sign up. Also skip if user has already generated docs (returning user pre-onboarding).
    if (!done) setOpen(true);
  }, [user]);

  const close = () => {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
  };

  if (!open) return null;
  const s = STEPS[step] || STEPS[0];

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center px-4" data-testid="onboarding-tour">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-lg rounded-xl border border-[#E8A020]/30 bg-[#0a0a0a] overflow-hidden" style={{ boxShadow: "0 25px 70px rgba(232,160,32,0.18)" }}>
        <button onClick={close} className="absolute top-3 right-3 text-[#706D66] hover:text-[#F0EDE8]" data-testid="onboarding-close"><X size={16}/></button>

        {/* Progress bar */}
        <div className="h-1 bg-[#1a1a1a]">
          <div className="h-full transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%`, background: "linear-gradient(90deg, #E8A020, #f5c061)" }} />
        </div>

        <div className="p-7 md:p-9">
          {s.icon && (
            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4 text-[#E8A020]" style={{ background: "rgba(232,160,32,0.07)", border: "1px solid rgba(232,160,32,0.3)" }}>
              {s.icon}
            </div>
          )}
          <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Step {step + 1} of {STEPS.length}</div>
          <h2 className="font-display text-3xl md:text-4xl text-[#F0EDE8] mb-3" data-testid="onboarding-title">{s.title}</h2>
          <p className="text-sm text-[#A19D94] mb-6" data-testid="onboarding-body">{s.body}</p>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <button onClick={close} className="text-xs text-[#706D66] hover:text-[#F0EDE8] transition" data-testid="onboarding-skip">Skip tour</button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button onClick={() => setStep(s => Math.max(0, s - 1))} className="btn-secondary text-xs" data-testid="onboarding-back">Back</button>
              )}
              {s.final ? (
                <button onClick={() => { close(); nav("/app/profile?complete=1"); }} className="btn-primary text-xs flex items-center gap-2" data-testid="onboarding-finish">
                  Complete profile <ArrowRight size={12}/>
                </button>
              ) : (
                <button onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))} className="btn-primary text-xs flex items-center gap-2" data-testid="onboarding-next">
                  {s.cta} <ChevronRight size={12}/>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
