import { Link } from "react-router-dom";
import { useState } from "react";
import api from "../lib/api";
import { AuthShell, Field } from "./Login";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLink, setDemoLink] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setDemoLink("");
    try {
      const r = await api.post("/auth/forgot-password", { email });
      toast.success("If that email is registered, a reset link has been sent.");
      if (r.data.demoResetLink) setDemoLink(r.data.demoResetLink);
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not send reset link");
    } finally { setLoading(false); }
  };

  return (
    <AuthShell>
      <h2 className="font-display text-4xl mb-2">Forgot password?</h2>
      <p className="text-sm text-[#A19D94] mb-8">Enter the email on your Morris account — we'll send you a reset link.</p>
      <form onSubmit={onSubmit} className="space-y-4" data-testid="forgot-form">
        <Field label="Email" type="email" value={email} onChange={setEmail} testId="forgot-email" placeholder="you@email.com" />
        <button type="submit" className="btn-primary w-full" disabled={loading} data-testid="forgot-submit">
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>

      {demoLink && (
        <div className="mt-6 border border-[#E8A020]/30 rounded p-4 text-xs" data-testid="demo-reset-link">
          <div className="text-[#E8A020] uppercase tracking-widest font-bold mb-2">Demo mode</div>
          <p className="text-[#A19D94] mb-2">In production this link would be emailed. For now, click it:</p>
          <Link to={demoLink} className="text-[#E8A020] underline break-all" data-testid="demo-reset-link-anchor">{demoLink}</Link>
        </div>
      )}

      <p className="text-sm text-[#A19D94] mt-6">
        Remembered it? <Link to="/login" className="text-[#E8A020] hover:underline" data-testid="link-back-login">Back to log in</Link>
      </p>
    </AuthShell>
  );
}
