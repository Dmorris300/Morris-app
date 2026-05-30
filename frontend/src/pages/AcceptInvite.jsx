import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { MorrisLogo, MorrisWordmark } from "../components/MorrisLogo";
import { Loader2, UserPlus, AlertCircle } from "lucide-react";

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { refresh } = useAuth();
  const token = params.get("token");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#060606] text-[#F0EDE8] p-6">
        <div className="max-w-md text-center" data-testid="accept-invite-missing">
          <AlertCircle size={32} className="text-[#E5635A] mx-auto mb-3" />
          <h1 className="font-display text-3xl mb-2">Invite link is missing</h1>
          <p className="text-sm text-[#A19D94]">Ask your team owner to resend the invite from their Team Management page.</p>
        </div>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setBusy(true);
    try {
      const r = await api.post("/team/accept-invite", { token, username, password, fullName, phone });
      localStorage.setItem("morris_token", r.data.token);
      await refresh();
      toast.success("Welcome to the team. Set up your trade in the next step.");
      nav(r.data.user?.trade ? "/app" : "/select-trade", { replace: true });
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not accept invite");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-[#060606] text-[#F0EDE8] font-body flex items-center justify-center p-6">
      <div className="w-full max-w-md" data-testid="accept-invite-form">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <MorrisLogo size={36} />
          <MorrisWordmark size="text-2xl" />
        </div>
        <div className="card-dark p-6 md:p-8">
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2 flex items-center gap-2"><UserPlus size={12}/> Team invite</div>
          <h1 className="font-display text-3xl md:text-4xl mb-2">Join your team on Morris.</h1>
          <p className="text-sm text-[#A19D94] mb-6">Pick a username and a password. The rest you can sort once you're in.</p>
          <form onSubmit={submit} className="space-y-3">
            <Field label="Username">
              <input className="input-base" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} data-testid="accept-username" />
            </Field>
            <Field label="Full name">
              <input className="input-base" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="As it should appear on your documents" data-testid="accept-fullname" />
            </Field>
            <Field label="Phone (optional)">
              <input className="input-base" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07700 900001" data-testid="accept-phone" />
            </Field>
            <Field label="Password">
              <input type="password" className="input-base" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} data-testid="accept-password" />
            </Field>
            <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2" disabled={busy} data-testid="accept-submit">
              {busy ? <Loader2 size={14} className="animate-spin"/> : <UserPlus size={14}/>}
              Join the team
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      {children}
    </label>
  );
}
