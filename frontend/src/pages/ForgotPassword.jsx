import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import api from "../lib/api";
import { AuthShell, Field } from "./Login";
import { toast } from "sonner";
import { Mail, Phone } from "lucide-react";

export default function ForgotPassword() {
  const nav = useNavigate();
  const [method, setMethod] = useState("email"); // 'email' | 'phone'
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLink, setDemoLink] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [phoneUsed, setPhoneUsed] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setDemoLink(""); setDemoCode("");
    try {
      const payload = method === "email" ? { email } : { phone };
      const r = await api.post("/auth/forgot-password", payload);
      if (method === "email") {
        toast.success("If that email is registered, a reset link has been sent.");
        if (r.data.demoResetLink) setDemoLink(r.data.demoResetLink);
      } else {
        toast.success("If that phone number is registered, a reset code has been sent.");
        if (r.data.demoResetCode) { setDemoCode(r.data.demoResetCode); setPhoneUsed(phone); }
      }
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not send reset");
    } finally { setLoading(false); }
  };

  const goToPhoneReset = () => {
    nav(`/reset-password?phone=${encodeURIComponent(phoneUsed)}&code=${encodeURIComponent(demoCode)}`);
  };

  return (
    <AuthShell>
      <h2 className="font-display text-4xl mb-2">Forgot password?</h2>
      <p className="text-sm text-[#A19D94] mb-6">Reset via email or phone. We'll send a link or a 6-digit code.</p>

      <div className="flex gap-2 mb-6" data-testid="reset-method-tabs">
        <button
          type="button"
          onClick={() => { setMethod("email"); setDemoLink(""); setDemoCode(""); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm transition-colors ${method === "email" ? "bg-[#E8A020] text-[#060606] font-semibold" : "bg-[#121212] text-[#A19D94] border border-[#F0EDE8]/15 hover:text-[#F0EDE8]"}`}
          data-testid="reset-method-email"
        >
          <Mail size={14} /> Email
        </button>
        <button
          type="button"
          onClick={() => { setMethod("phone"); setDemoLink(""); setDemoCode(""); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm transition-colors ${method === "phone" ? "bg-[#E8A020] text-[#060606] font-semibold" : "bg-[#121212] text-[#A19D94] border border-[#F0EDE8]/15 hover:text-[#F0EDE8]"}`}
          data-testid="reset-method-phone"
        >
          <Phone size={14} /> Phone
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" data-testid="forgot-form">
        {method === "email" ? (
          <Field label="Email" type="email" value={email} onChange={setEmail} testId="forgot-email" placeholder="you@email.com" />
        ) : (
          <Field label="Phone number" value={phone} onChange={setPhone} testId="forgot-phone" placeholder="07700900..." />
        )}
        <button type="submit" className="btn-primary w-full" disabled={loading} data-testid="forgot-submit">
          {loading ? "Sending." : method === "email" ? "Send reset link" : "Send reset code"}
        </button>
      </form>

      {demoLink && (
        <div className="mt-6 border border-[#E8A020]/30 rounded p-4 text-xs" data-testid="demo-reset-link">
          <div className="text-[#E8A020] uppercase tracking-widest font-bold mb-2">Demo mode</div>
          <p className="text-[#A19D94] mb-2">In production this link would be emailed. For now, click it:</p>
          <Link to={demoLink} className="text-[#E8A020] underline break-all" data-testid="demo-reset-link-anchor">{demoLink}</Link>
        </div>
      )}

      {demoCode && (
        <div className="mt-6 border border-[#E8A020]/30 rounded p-4 text-xs" data-testid="demo-reset-code">
          <div className="text-[#E8A020] uppercase tracking-widest font-bold mb-2">Demo mode</div>
          <p className="text-[#A19D94] mb-2">In production this code would be sent by SMS. Your code is:</p>
          <div className="font-mono text-xl text-[#F0EDE8] tracking-widest mb-3" data-testid="demo-reset-code-value">{demoCode}</div>
          <button onClick={goToPhoneReset} className="btn-primary text-xs" data-testid="demo-reset-code-continue">Continue to reset</button>
        </div>
      )}

      <p className="text-sm text-[#A19D94] mt-6">
        Remembered it? <Link to="/login" className="text-[#E8A020] hover:underline" data-testid="link-back-login">Back to log in</Link>
      </p>
    </AuthShell>
  );
}
