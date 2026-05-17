import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { MorrisLogo, MorrisWordmark } from "../components/MorrisLogo";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";

export default function Login() {
  const nav = useNavigate();
  const { persist } = useAuth();
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.post("/auth/login", form);
      persist(r.data.user, r.data.token);
      toast.success("Welcome back");
      if (!r.data.user.trade) nav("/select-trade"); else nav("/app");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <AuthShell>
      <h2 className="font-display text-4xl mb-2">Welcome back.</h2>
      <p className="text-sm text-[#A19D94] mb-8">Log in to your Morris toolbox.</p>
      <form onSubmit={onSubmit} className="space-y-4" data-testid="login-form">
        <Field label="Username" value={form.username} onChange={(v) => setForm({ ...form, username: v })} testId="login-username" />
        <Field label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} testId="login-password" />
        <button type="submit" className="btn-primary w-full" disabled={loading} data-testid="login-submit">
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="text-sm text-[#A19D94] mt-6">
        New to Morris? <Link to="/signup" className="text-[#E8A020] hover:underline" data-testid="link-signup">Get started</Link>
      </p>
    </AuthShell>
  );
}

export function AuthShell({ children }) {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#060606] text-[#F0EDE8] font-body">
      <div className="md:w-1/2 p-8 md:p-16 flex flex-col">
        <Link to="/" className="flex items-center gap-3 mb-12" data-testid="auth-home-link">
          <MorrisLogo size={44} />
          <MorrisWordmark size="text-3xl" />
        </Link>
        <div className="flex-1 flex items-center">
          <div className="w-full max-w-md">{children}</div>
        </div>
        <div className="text-xs text-[#706D66] mt-8">Built by a tradesman. For tradesmen.</div>
      </div>
      <div className="hidden md:block md:w-1/2 relative morris-grain border-l border-[#F0EDE8]/5">
        <div className="absolute inset-0" style={{
          backgroundImage: "url(https://static.prod-images.emergentagent.com/jobs/64edf71d-3747-4105-a860-131b2bbabbfc/images/6520f329423ee4325e55202f82398164ec577f7cf4314c84a9b8b8e449e90525.png)",
          backgroundSize: "cover", backgroundPosition: "center", opacity: 0.6
        }} />
        <div className="absolute inset-0 bg-gradient-to-br from-[#060606]/30 to-[#060606]/80" />
        <div className="absolute bottom-12 left-12 right-12">
          <div className="font-display text-5xl text-[#E8A020] leading-none">Built on<br/>the Tools.</div>
          <p className="text-[#A19D94] mt-4 max-w-md">Morris is the construction admin app made for tradesmen and sole traders. No fluff. No corporate jargon. Just paperwork that pays.</p>
        </div>
      </div>
    </div>
  );
}

export function Field({ label, value, onChange, type = "text", placeholder = "", testId }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-base"
        data-testid={testId}
      />
    </label>
  );
}
