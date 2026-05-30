import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Sparkles, Zap, Crown, Building2, Mail, ArrowRight } from "lucide-react";

const PLAN_META = {
  solo: {
    name: "Solo", price: "£29.99", period: "per month",
    desc: "Single user. Full access to every tool.",
    icon: Zap,
    features: [
      "Single user only",
      "Full access to all document generation tools",
      "Full access to all finance tools",
      "Full access to all site tools",
    ],
  },
  business: {
    name: "Business", price: "£59.99", period: "per month",
    desc: "Bring up to 4 mates. 5 users in total.",
    icon: Crown,
    features: [
      "Up to 4 team invites (5 users total)",
      "Each invited user gets their own login",
      "Account owner can remove team members",
      "Team management dashboard with last-active",
      "All Solo features included",
    ],
  },
  pro: {
    name: "Pro", price: "£99.99", period: "per month",
    desc: "Scaling crews. Roles. 10 users.",
    icon: Sparkles,
    highlight: true,
    features: [
      "Up to 9 team invites (10 users total)",
      "Assign Admin or Member roles",
      "Admins can invite and remove members",
      "Team dashboard with roles + last-active",
      "All Business features included",
    ],
  },
  enterprise: {
    name: "Enterprise", price: "£249.99", period: "per month",
    desc: "Unlimited seats. White-label. Concierge onboarding.",
    icon: Building2,
    contact: true,
    features: [
      "Unlimited team member invites",
      "Owner / Admin / Manager / Member roles",
      "Managers can view + edit team documents",
      "Members can create + download docs only",
      "White-label: your logo + company name on every PDF",
      "Priority support + concierge onboarding",
    ],
  },
};

export default function Billing() {
  const { user, refresh } = useAuth();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);
  const nav = useNavigate();
  const [params] = useSearchParams();

  const sessionId = params.get("session_id");
  const cancelled = params.get("cancelled");

  const load = async () => {
    try { const r = await api.get("/billing/status"); setStatus(r.data); } catch (e) { if (process.env.NODE_ENV !== "production") console.error("Billing status load failed", e); }
  };

  useEffect(() => { load(); }, []);

  // Returning from Stripe — poll status
  useEffect(() => {
    if (!sessionId) return;
    let cancel = false;
    let attempts = 0;
    const poll = async () => {
      while (!cancel && attempts < 8) {
        attempts++;
        try {
          const r = await api.get(`/billing/status/${sessionId}`);
          if (r.data.paymentStatus === "paid") {
            toast.success("Payment received. You're on the paid plan.");
            await refresh(); await load();
            nav("/app/billing", { replace: true });
            return;
          }
        } catch (e) { if (process.env.NODE_ENV !== "production") console.warn("Billing poll attempt failed", e); }
        await new Promise(r => setTimeout(r, 2000));
      }
    };
    poll();
    return () => { cancel = true; };
  }, [sessionId]);

  useEffect(() => { if (cancelled) toast.message("Checkout cancelled"); }, [cancelled]);

  const startTrial = async () => {
    setBusy("trial");
    try {
      await api.post("/billing/start-trial", { planId: "solo" });
      toast.success("3-day free trial started. Enjoy all tools.");
      await refresh(); await load();
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not start trial");
    } finally { setBusy(null); }
  };

  const upgrade = async (planId) => {
    setBusy(planId);
    try {
      const r = await api.post("/billing/checkout", { planId, originUrl: window.location.origin });
      window.location.href = r.data.url;
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not start checkout");
      setBusy(null);
    }
  };

  if (!status) return <div className="p-10 text-[#A19D94]">Loading.</div>;

  // Compute a friendly label for the current plan tier
  let planLabel;
  if (status.plan === "free") {
    planLabel = "Free";
  } else if (status.plan === "trial") {
    const targetName = PLAN_META[status.trialPlanTarget || "solo"]?.name || "Solo";
    planLabel = `Free trial (${targetName})`;
  } else {
    planLabel = PLAN_META[status.plan]?.name || status.plan;
  }
  const onPaid = status.plan !== "free" && status.plan !== "trial";
  const expiresAt = status.planExpiresAt ? new Date(status.planExpiresAt) : null;
  const daysLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24))) : null;

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid="page-billing">
      <div className="mb-8">
        <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Account</div>
        <h1 className="font-display text-4xl md:text-5xl">Billing</h1>
        <p className="text-[#A19D94] mt-2">Your plan, your usage, your upgrades.</p>
      </div>

      {/* Current plan card */}
      <div className="card-dark p-6 md:p-8 mb-8" data-testid="current-plan-card">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-2">Current plan</div>
            <div className="font-display text-4xl">{planLabel}</div>
            {expiresAt && (
              <div className="text-sm text-[#A19D94] mt-1">
                {status.plan === "trial" ? `Trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}` : `Renews in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
              </div>
            )}
          </div>
          {status.plan === "free" && (
            <div className="text-right">
              <div className="text-xs uppercase tracking-widest text-[#A19D94]">This month so far</div>
              <div className="font-display text-2xl">{status.usageTools.length}/{status.freeToolLimit} tools  &nbsp;&nbsp; {status.usageDocs}/{status.freeDocLimit} docs</div>
            </div>
          )}
        </div>
      </div>

      {/* Trial CTA */}
      {status.plan === "free" && !status.trialUsed && (
        <div className="card-dark p-6 md:p-8 mb-8 border-[#E8A020]/40" data-testid="trial-cta">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-2">3-day free trial</div>
              <div className="font-display text-3xl mb-2">Try every tool. No card needed.</div>
              <p className="text-[#A19D94] text-sm">Unlocks all 88+ tools and unlimited documents for 3 days. After that, pick a plan or drop back to Free.</p>
            </div>
            <button onClick={startTrial} className="btn-primary flex items-center gap-2" disabled={busy === "trial"} data-testid="start-trial-btn">
              {busy === "trial" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Start 3-day trial
            </button>
          </div>
        </div>
      )}

      {/* Plans grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(PLAN_META).map(([id, p]) => {
          const Icon = p.icon;
          const isCurrent = status.plan === id;
          return (
            <div key={id} className={`card-dark p-6 flex flex-col ${p.highlight ? "border-[#E8A020]/60" : ""}`} data-testid={`plan-${id}`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon size={18} className="text-[#E8A020]" />
                <div className="text-xs uppercase tracking-widest text-[#E8A020]">{p.name}</div>
              </div>
              <div className="font-display text-4xl">{p.price}</div>
              <div className="text-sm text-[#706D66] mb-3">{p.period}</div>
              <p className="text-sm text-[#A19D94] mb-4">{p.desc}</p>
              <ul className="space-y-1.5 text-xs text-[#A19D94] mb-5 flex-1">
                {p.features.map(f => <li key={f} className="flex items-start gap-2"><CheckCircle2 size={12} className="text-[#E8A020] mt-0.5 flex-shrink-0" /> {f}</li>)}
              </ul>
              {p.contact ? (
                <a
                  href="mailto:contact@morrisapp.co.uk?subject=Morris%20Enterprise%20onboarding&body=Hi%20Morris%20team%2C%0A%0AI%27d%20like%20to%20set%20up%20a%20Morris%20Enterprise%20account.%0A%0AThanks."
                  className="btn-primary text-center flex items-center justify-center gap-2"
                  data-testid={`contact-${id}`}
                  title="To set up your Enterprise account contact us at contact@morrisapp.co.uk — we will onboard you within 24 hours."
                  onClick={(e) => { toast.message("To set up your Enterprise account contact us at contact@morrisapp.co.uk — we will onboard you within 24 hours.", { duration: 8000 }); }}
                >
                  <Mail size={14} /> Contact us to set up
                </a>
              ) : isCurrent ? (
                <div className="btn-secondary text-center text-xs opacity-70 cursor-default">Current plan</div>
              ) : (
                <button onClick={() => upgrade(id)} className="btn-primary text-center flex items-center justify-center gap-2" disabled={busy === id} data-testid={`upgrade-${id}`}>
                  {busy === id ? <Loader2 size={14} className="animate-spin" /> : <>Choose {p.name} <ArrowRight size={14} /></>}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-10">
        <h2 className="font-display text-2xl mb-3">Free plan</h2>
        <p className="text-sm text-[#A19D94] max-w-2xl">
          You can use up to <strong className="text-[#F0EDE8]">{status.freeToolLimit} different tools</strong> and create up to <strong className="text-[#F0EDE8]">{status.freeDocLimit} documents per month</strong> on the Free plan. Upgrade anytime for unlimited everything.
        </p>
      </div>
    </div>
  );
}
