import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import api from "../lib/api";
import { AuthShell, Field } from "./Login";
import { toast } from "sonner";

export default function Signup() {
  const nav = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", password: "", phone: "" });
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [confirmAge, setConfirmAge] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmit = agreeTerms && confirmAge && form.username && form.email && form.password && form.phone;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (form.password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setLoading(true);
    try {
      const r = await api.post("/auth/signup", form);
      toast.success(`OTP sent. Demo code: ${r.data.otp}`);
      sessionStorage.setItem("morris_signup_username", form.username.toLowerCase());
      sessionStorage.setItem("morris_signup_otp_demo", r.data.otp);
      nav("/verify-otp");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : Array.isArray(d) ? d.map(x => x.msg || "").join(" ") : "Signup failed");
    } finally { setLoading(false); }
  };

  return (
    <AuthShell>
      <style>{`
        @keyframes morris-btn-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(232,160,32,0); }
          50%      { box-shadow: 0 0 0 4px rgba(232,160,32,0.18); }
        }
        .morris-disabled-pulse { animation: morris-btn-pulse 1.8s ease-in-out infinite; }
      `}</style>
      <h2 className="font-display text-4xl mb-2">Get on the tools.</h2>
      <p className="text-sm text-[#A19D94] mb-8">Four fields and you're in. We'll send an OTP to your phone.</p>
      <form onSubmit={onSubmit} className="space-y-4" data-testid="signup-form">
        <Field label="Username" value={form.username} onChange={(v) => setForm({ ...form, username: v })} testId="signup-username" />
        <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="you@email.com" testId="signup-email" />
        <Field label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} testId="signup-password" />
        <Field label="Phone number" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="07…" testId="signup-phone" />

        <CheckboxRow
          checked={agreeTerms}
          onChange={setAgreeTerms}
          testId="signup-terms-checkbox"
          label={<>I have read and agree to the <Link to="/terms" className="text-[#E8A020] hover:underline">Terms and Conditions</Link> and <Link to="/privacy" className="text-[#E8A020] hover:underline">Privacy Policy</Link>.</>}
        />
        <CheckboxRow
          checked={confirmAge}
          onChange={setConfirmAge}
          testId="signup-age-checkbox"
          label="I confirm I am 18 years of age or older."
        />

        <button
          type="submit"
          className={`btn-primary w-full ${!canSubmit ? "morris-disabled-pulse" : ""}`}
          disabled={!canSubmit || loading}
          data-testid="signup-submit"
        >
          {loading ? "Creating account." : "Create account"}
        </button>
      </form>
      <p className="text-sm text-[#A19D94] mt-6">
        Already on Morris? <Link to="/login" className="text-[#E8A020] hover:underline" data-testid="link-login">Log in</Link>
      </p>
    </AuthShell>
  );
}

function CheckboxRow({ checked, onChange, label, testId }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none" data-testid={testId}>
      <span
        onClick={() => onChange(!checked)}
        className="flex-shrink-0 mt-0.5 flex items-center justify-center"
        style={{
          width: 20, height: 20, borderRadius: 4,
          background: checked ? "#E8A020" : "#0d0d0d",
          border: checked ? "1px solid #E8A020" : "1px solid rgba(232,160,32,0.4)",
          transition: "all 0.15s",
        }}
      >
        {checked && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6.5L4.8 9L10 3" stroke="#060606" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="text-xs text-[#A19D94] leading-snug">{label}</span>
    </label>
  );
}
