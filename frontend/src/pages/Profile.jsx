import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { TRADES } from "../lib/tools-config";
import { toast } from "sonner";
import { AlertTriangle, Trash2, Info } from "lucide-react";
import { isProfileComplete } from "../App";

export default function Profile() {
  const { user, refresh, logout } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const mustComplete = params.get("complete") === "1" && !isProfileComplete(user);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteWord, setDeleteWord] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [f, setF] = useState({
    fullName: user?.fullName || "",
    companyName: user?.companyName || "",
    email: user?.email || "",
    address: user?.address || "",
    contactNumber: user?.contactNumber || user?.phone || "",
    utr: user?.utr || "",
    vatRegistered: user?.vatRegistered ?? false,
    vatNumber: user?.vatNumber || "",
    cisStatus: user?.cisStatus || "Net 20%",
    insuranceExpiry: user?.insuranceExpiry || "",
    cscsExpiry: user?.cscsExpiry || "",
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

      {mustComplete && (
        <div
          className="mb-6 p-4 rounded flex items-start gap-3"
          style={{ border: "1px solid #E8A020", background: "rgba(232,160,32,0.07)" }}
          data-testid="profile-complete-banner"
        >
          <Info size={18} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-sm font-semibold text-[#F0EDE8] mb-1">Complete your profile to unlock the tools</div>
            <p className="text-xs text-[#A19D94] leading-relaxed">
              Morris auto-fills your name, company, UTR, CIS status and insurance details on every document it generates. Fill the fields marked with a gold asterisk to unlock all 88+ tools.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={save} className="card-dark p-6 space-y-4">
        <Row label="Trade *">
          <select value={f.trade} onChange={(e) => setF({ ...f, trade: e.target.value })} className="input-base" data-testid="profile-trade">
            <option value="">— Choose —</option>
            {TRADES.map(t => <option key={t}>{t}</option>)}
          </select>
        </Row>
        <Row label="Full name *"><input className="input-base" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} data-testid="profile-name" /></Row>
        <Row label="Email *"><input type="email" className="input-base" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="you@email.com" data-testid="profile-email" /></Row>
        <Row label="Company name *"><input className="input-base" value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} data-testid="profile-company" /></Row>
        <Row label="Address *"><textarea rows={3} className="input-base" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} data-testid="profile-address" /></Row>
        <Row label="Contact number *"><input className="input-base" value={f.contactNumber} onChange={(e) => setF({ ...f, contactNumber: e.target.value })} placeholder="07700 900001" data-testid="profile-contact" /></Row>
        <Row label="UTR *"><input className="input-base" value={f.utr} onChange={(e) => setF({ ...f, utr: e.target.value })} placeholder="10-digit Unique Taxpayer Reference" data-testid="profile-utr" /></Row>
        <Row label="VAT registered">
          <label className="flex items-center gap-3 text-sm text-[#A19D94]">
            <input type="checkbox" checked={!!f.vatRegistered} onChange={(e) => setF({ ...f, vatRegistered: e.target.checked })} data-testid="profile-vat-registered" />
            <span>I am VAT registered</span>
          </label>
        </Row>
        {f.vatRegistered && (
          <Row label="VAT number"><input className="input-base" value={f.vatNumber} onChange={(e) => setF({ ...f, vatNumber: e.target.value })} data-testid="profile-vat" /></Row>
        )}
        <Row label="CIS status *">
          <select className="input-base" value={f.cisStatus} onChange={(e) => setF({ ...f, cisStatus: e.target.value })} data-testid="profile-cis">
            <option>Gross 0%</option><option>Net 20%</option><option>Higher 30%</option>
          </select>
        </Row>
        <Row label="Public liability insurance expiry *"><input type="date" className="input-base" value={f.insuranceExpiry} onChange={(e) => setF({ ...f, insuranceExpiry: e.target.value })} data-testid="profile-insurance-expiry" /></Row>
        <Row label="CSCS card expiry *"><input type="date" className="input-base" value={f.cscsExpiry} onChange={(e) => setF({ ...f, cscsExpiry: e.target.value })} data-testid="profile-cscs-expiry" /></Row>
        <button className="btn-primary" disabled={saving} data-testid="profile-save">{saving ? "Saving…" : "Save profile"}</button>
      </form>

      {/* DANGER ZONE */}
      <div
        className="mt-10 p-6 rounded"
        style={{ border: "1px solid rgba(224,80,80,0.25)", background: "rgba(224,80,80,0.04)" }}
        data-testid="danger-zone"
      >
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={16} style={{ color: "#E05050" }} />
          <h2 className="font-display text-2xl" style={{ color: "#E05050" }}>Danger zone</h2>
        </div>
        <p className="text-sm text-[#A19D94] mb-4">
          Permanently delete your account, your documents, your CIS payment log and all data Morris holds about you. This cannot be undone.
        </p>
        <button
          onClick={() => setConfirmDelete(true)}
          className="text-sm font-semibold px-4 py-2 rounded transition-colors"
          style={{ background: "#0d0d0d", color: "#E05050", border: "1px solid rgba(224,80,80,0.4)" }}
          data-testid="delete-account-btn"
        >
          <Trash2 size={14} className="inline mr-2 -mt-0.5" /> Delete My Account and All Data
        </button>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="delete-modal">
          <div className="absolute inset-0 bg-black/70" onClick={() => !deleting && setConfirmDelete(false)} />
          <div className="relative card-dark p-6 md:p-7 max-w-md w-full" style={{ borderColor: "rgba(224,80,80,0.4)" }}>
            <h3 className="font-display text-2xl mb-2" style={{ color: "#E05050" }}>Delete account?</h3>
            <p className="text-sm text-[#F0EDE8] mb-4">This will permanently remove your account, profile, documents, CIS payments and reset tokens. There is no recovery.</p>
            <p className="text-sm text-[#A19D94] mb-2">Type <strong className="text-[#E05050] font-mono">DELETE</strong> to confirm:</p>
            <input
              value={deleteWord}
              onChange={(e) => setDeleteWord(e.target.value)}
              className="input-base mb-4"
              placeholder="DELETE"
              data-testid="delete-confirm-input"
              disabled={deleting}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(false)} className="btn-secondary text-sm" disabled={deleting}>Cancel</button>
              <button
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await api.delete("/account/delete");
                    Object.keys(localStorage).filter(k => k.startsWith("morris_")).forEach(k => localStorage.removeItem(k));
                    logout();
                    toast.success("Your account and all data has been deleted.");
                    nav("/login", { replace: true });
                  } catch {
                    toast.error("Could not delete account");
                    setDeleting(false);
                  }
                }}
                disabled={deleteWord !== "DELETE" || deleting}
                className="text-sm font-semibold px-4 py-2 rounded"
                style={{
                  background: deleteWord === "DELETE" && !deleting ? "#E05050" : "#1A0606",
                  color: deleteWord === "DELETE" && !deleting ? "#0d0d0d" : "#E05050",
                  opacity: deleteWord === "DELETE" && !deleting ? 1 : 0.55,
                  border: "1px solid rgba(224,80,80,0.5)",
                }}
                data-testid="delete-confirm-btn"
              >
                {deleting ? "Deleting." : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
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
