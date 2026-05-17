import { useNavigate } from "react-router-dom";
import { useState } from "react";
import api from "../lib/api";
import { AuthShell, Field } from "./Login";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";

export default function VerifyOtp() {
  const nav = useNavigate();
  const { persist } = useAuth();
  const username = sessionStorage.getItem("morris_signup_username") || "";
  const demoOtp = sessionStorage.getItem("morris_signup_otp_demo") || "";
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await api.post("/auth/verify-otp", { username, otp });
      persist(r.data.user, r.data.token);
      sessionStorage.removeItem("morris_signup_username");
      sessionStorage.removeItem("morris_signup_otp_demo");
      toast.success("Verified — let's pick your trade");
      nav("/select-trade");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Verification failed");
    } finally { setLoading(false); }
  };

  return (
    <AuthShell>
      <h2 className="font-display text-4xl mb-2">Check your phone.</h2>
      <p className="text-sm text-[#A19D94] mb-2">We sent a 6-digit code to your number.</p>
      {demoOtp && (
        <p className="text-xs text-[#E8A020] mb-6 font-mono border border-[#E8A020]/30 rounded px-3 py-2 inline-block" data-testid="demo-otp-hint">
          DEMO MODE — your code is: <span className="font-bold">{demoOtp}</span>
        </p>
      )}
      <form onSubmit={onSubmit} className="space-y-4 mt-4" data-testid="otp-form">
        <Field label="6-digit code" value={otp} onChange={setOtp} testId="otp-input" placeholder="123456" />
        <button type="submit" className="btn-primary w-full" disabled={loading || otp.length !== 6} data-testid="otp-submit">
          {loading ? "Verifying…" : "Verify"}
        </button>
      </form>
    </AuthShell>
  );
}
