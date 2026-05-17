import { useState } from "react";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { TRADES } from "../lib/tools-config";
import { toast } from "sonner";

export default function Profile() {
  const { user, refresh } = useAuth();
  const [f, setF] = useState({
    fullName: user?.fullName || "",
    companyName: user?.companyName || "",
    email: user?.email || "",
    address: user?.address || "",
    utr: user?.utr || "",
    vatNumber: user?.vatNumber || "",
    cisStatus: user?.cisStatus || "Net 20%",
    trade: user?.trade || "",
  });
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await api.post("/profile/update", f); await refresh(); toast.success("Profile saved"); }
    catch { toast.error("Save failed"); } finally { setSaving(false); }
  };

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto" data-testid="page-profile">
      <div className="mb-8">
        <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Account</div>
        <h1 className="font-display text-4xl md:text-5xl">My Profile</h1>
        <p className="text-[#A19D94] mt-2">These details appear on every document Morris generates.</p>
      </div>
      <form onSubmit={save} className="card-dark p-6 space-y-4">
        <Row label="Trade">
          <select value={f.trade} onChange={(e) => setF({ ...f, trade: e.target.value })} className="input-base" data-testid="profile-trade">
            <option value="">— Choose —</option>
            {TRADES.map(t => <option key={t}>{t}</option>)}
          </select>
        </Row>
        <Row label="Full name"><input className="input-base" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} data-testid="profile-name" /></Row>
        <Row label="Email"><input type="email" className="input-base" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="you@email.com" data-testid="profile-email" /></Row>
        <Row label="Company name"><input className="input-base" value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} data-testid="profile-company" /></Row>
        <Row label="Address"><textarea rows={3} className="input-base" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} data-testid="profile-address" /></Row>
        <Row label="UTR"><input className="input-base" value={f.utr} onChange={(e) => setF({ ...f, utr: e.target.value })} data-testid="profile-utr" /></Row>
        <Row label="VAT number"><input className="input-base" value={f.vatNumber} onChange={(e) => setF({ ...f, vatNumber: e.target.value })} data-testid="profile-vat" /></Row>
        <Row label="CIS status">
          <select className="input-base" value={f.cisStatus} onChange={(e) => setF({ ...f, cisStatus: e.target.value })} data-testid="profile-cis">
            <option>Gross 0%</option><option>Net 20%</option><option>Higher 30%</option>
          </select>
        </Row>
        <button className="btn-primary" disabled={saving} data-testid="profile-save">{saving ? "Saving…" : "Save profile"}</button>
      </form>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      {children}
    </label>
  );
}
