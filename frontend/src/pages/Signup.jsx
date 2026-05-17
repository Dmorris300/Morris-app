import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import api from "../lib/api";
import { AuthShell, Field } from "./Login";
import { toast } from "sonner";

export default function Signup() {
  const nav = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", password: "", phone: "" });
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setLoading(true);
    try {
      const r = await api.post("/auth/signup", form);
      // Demo mode: show OTP up front so user can verify
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
      <h2 className="font-display text-4xl mb-2">Get on the tools.</h2>
      <p className="text-sm text-[#A19D94] mb-8">Four fields and you're in. We'll send an OTP to your phone.</p>
      <form onSubmit={onSubmit} className="space-y-4" data-testid="signup-form">
        <Field label="Username" value={form.username} onChange={(v) => setForm({ ...form, username: v })} testId="signup-username" />
        <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="you@email.com" testId="signup-email" />
        <Field label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} testId="signup-password" />
        <Field label="Phone number" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="07…" testId="signup-phone" />
        <button type="submit" className="btn-primary w-full" disabled={loading} data-testid="signup-submit">
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="text-sm text-[#A19D94] mt-6">
        Already on Morris? <Link to="/login" className="text-[#E8A020] hover:underline" data-testid="link-login">Log in</Link>
      </p>
    </AuthShell>
  );
}
