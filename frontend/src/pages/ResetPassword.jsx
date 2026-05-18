import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import api from "../lib/api";
import { AuthShell, Field } from "./Login";
import { toast } from "sonner";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const initialToken = params.get("token") || "";
  const initialPhone = params.get("phone") || "";
  const initialCode = params.get("code") || "";

  const usingPhone = !!initialPhone;
  const [token, setToken] = useState(initialToken);
  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState(initialCode);
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (newPassword !== confirm) { toast.error("Passwords don't match"); return; }
    setLoading(true);
    try {
      const body = usingPhone ? { phone, code, newPassword } : { token, newPassword };
      await api.post("/auth/reset-password", body);
      toast.success("Password updated. Please log in.");
      nav("/login");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Reset failed");
    } finally { setLoading(false); }
  };

  return (
    <AuthShell>
      <h2 className="font-display text-4xl mb-2">Set a new password.</h2>
      <p className="text-sm text-[#A19D94] mb-8">Reset codes/links are valid for 30 minutes and can only be used once.</p>
      <form onSubmit={onSubmit} className="space-y-4" data-testid="reset-form">
        {usingPhone ? (
          <>
            <Field label="Phone number" value={phone} onChange={setPhone} testId="reset-phone" />
            <Field label="6-digit code" value={code} onChange={setCode} testId="reset-code" />
          </>
        ) : !initialToken ? (
          <Field label="Reset token" value={token} onChange={setToken} testId="reset-token" placeholder="Paste the token from your email" />
        ) : null}
        <Field label="New password" type="password" value={newPassword} onChange={setNewPassword} testId="reset-new-password" />
        <Field label="Confirm new password" type="password" value={confirm} onChange={setConfirm} testId="reset-confirm-password" />
        <button type="submit" className="btn-primary w-full" disabled={loading || (!token && !(phone && code))} data-testid="reset-submit">
          {loading ? "Updating." : "Update password"}
        </button>
      </form>
      <p className="text-sm text-[#A19D94] mt-6">
        <Link to="/login" className="text-[#E8A020] hover:underline" data-testid="link-back-login">Back to log in</Link>
      </p>
    </AuthShell>
  );
}
