// Morris — Settings V2
// 8-tab settings experience: Profile / Company / Branding / Notifications /
// Security / Subscription / Backup & Export.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  User, Building2, Palette, Bell, Shield, CreditCard, Download,
  Save, LogOut, KeyRound, AlertTriangle, ArrowRight, Check, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { TRADES } from "../lib/tools-config";

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "company", label: "Company", icon: Building2 },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: Shield },
  { id: "subscription", label: "Subscription", icon: CreditCard },
  { id: "backup", label: "Backup & Export", icon: Download },
];

const Label = ({ children }) => (
  <label className="text-[10px] uppercase tracking-[0.2em] text-[#A19D94]">{children}</label>
);

const Field = ({ label, children, hint }) => (
  <div>
    <Label>{label}</Label>
    <div className="mt-1">{children}</div>
    {hint && <div className="text-[11px] text-[#706D66] mt-1">{hint}</div>}
  </div>
);

const inputClass = "w-full bg-[#0f0d09] border border-[#2a2620] rounded-md px-3 py-2 text-sm text-[#F0EDE8] focus:border-[#E8A020] focus:outline-none";

// ---------------- Profile tab ----------------

function ProfileTab({ user, refresh }) {
  const [f, setF] = useState({
    fullName: user?.fullName || "",
    email: user?.email || "",
    contactNumber: user?.contactNumber || user?.phone || "",
    trade: user?.trade || "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/profile/update", f);
      await refresh();
      toast.success("Profile saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5 max-w-2xl" data-testid="settings-profile-tab">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Full name">
          <input className={inputClass} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} data-testid="settings-fullName" />
        </Field>
        <Field label="Email">
          <input type="email" className={inputClass} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="settings-email" />
        </Field>
        <Field label="Contact number">
          <input className={inputClass} value={f.contactNumber} onChange={(e) => setF({ ...f, contactNumber: e.target.value })} data-testid="settings-phone" />
        </Field>
        <Field label="Trade">
          <select className={inputClass} value={f.trade} onChange={(e) => setF({ ...f, trade: e.target.value })} data-testid="settings-trade">
            <option value="">Select a trade</option>
            {TRADES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040] disabled:opacity-60" data-testid="save-profile">
          <Save size={14} /> {saving ? "Saving..." : "Save changes"}
        </button>
        <Link to="/app/profile" className="text-xs text-[#A19D94] hover:text-[#E8A020]">Open full profile editor →</Link>
      </div>
    </div>
  );
}

// ---------------- Company tab ----------------

function CompanyTab({ user, refresh }) {
  const [f, setF] = useState({
    companyName: user?.companyName || "",
    address: user?.address || "",
    utr: user?.utr || "",
    nationalInsuranceNumber: user?.nationalInsuranceNumber || "",
    companyRegNumber: user?.companyRegNumber || "",
    vatNumber: user?.vatNumber || "",
    vatRegistered: user?.vatRegistered ?? false,
    cisStatus: user?.cisStatus || "Net 20%",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/profile/update", f);
      await refresh();
      toast.success("Company details saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5 max-w-2xl" data-testid="settings-company-tab">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Company name">
          <input className={inputClass} value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} data-testid="settings-company-name" />
        </Field>
        <Field label="Companies House reg no.">
          <input className={inputClass} value={f.companyRegNumber} onChange={(e) => setF({ ...f, companyRegNumber: e.target.value })} data-testid="settings-company-reg" />
        </Field>
      </div>
      <Field label="Registered address">
        <textarea className={`${inputClass} min-h-[70px]`} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} data-testid="settings-company-address" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="UTR (10 digits)">
          <input className={inputClass} value={f.utr} onChange={(e) => setF({ ...f, utr: e.target.value })} data-testid="settings-utr" />
        </Field>
        <Field label="National Insurance number">
          <input className={inputClass} value={f.nationalInsuranceNumber} onChange={(e) => setF({ ...f, nationalInsuranceNumber: e.target.value })} data-testid="settings-ni" />
        </Field>
        <Field label="VAT registered?">
          <select className={inputClass} value={f.vatRegistered ? "yes" : "no"} onChange={(e) => setF({ ...f, vatRegistered: e.target.value === "yes" })} data-testid="settings-vat-flag">
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
        <Field label="VAT number">
          <input className={inputClass} value={f.vatNumber} onChange={(e) => setF({ ...f, vatNumber: e.target.value })} disabled={!f.vatRegistered} data-testid="settings-vat-number" />
        </Field>
        <Field label="CIS status" hint="Your subcontractor CIS deduction rate.">
          <select className={inputClass} value={f.cisStatus} onChange={(e) => setF({ ...f, cisStatus: e.target.value })} data-testid="settings-cis-status">
            <option>Gross</option>
            <option>Net 20%</option>
            <option>Net 30%</option>
          </select>
        </Field>
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040] disabled:opacity-60" data-testid="save-company">
          <Save size={14} /> {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// ---------------- Branding tab ----------------

function BrandingTab({ user, refresh }) {
  const [logo, setLogo] = useState(user?.companyLogo || "");
  const [signature, setSignature] = useState(user?.signature || "");
  const [signatureRole, setSignatureRole] = useState(user?.signatureRole || "");
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState(null);
  const logoRef = useRef(null);

  useEffect(() => { api.get("/billing/status").then((r) => setPlan(r.data.plan)).catch(() => {}); }, []);

  const canWhiteLabel = plan === "enterprise" || plan === "unlimited" || user?.isUnlimited;

  const uploadLogo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Logo must be an image");
    if (file.size > 2_000_000) return toast.error("Logo must be under 2 MB");
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result);
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/profile/update", { companyLogo: logo, signature, signatureRole });
      await refresh();
      toast.success("Branding saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5 max-w-2xl" data-testid="settings-branding-tab">
      <div className="card-dark p-5">
        <Label>Company logo (PDF branding)</Label>
        <div className="mt-3 flex items-center gap-4">
          <div className="w-24 h-24 rounded-md bg-[#0f0d09] border border-[#2a2620] flex items-center justify-center overflow-hidden">
            {logo ? <img src={logo} alt="Logo" className="max-w-full max-h-full object-contain" /> : <span className="text-[10px] text-[#706D66]">No logo</span>}
          </div>
          <div className="flex-1">
            <div className="text-xs text-[#A19D94] mb-2">Shown on the top-right of every Morris PDF. PNG or JPG under 2 MB.</div>
            <div className="flex gap-2">
              <button onClick={() => logoRef.current?.click()} disabled={!canWhiteLabel} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020] disabled:opacity-50" data-testid="upload-logo-btn">
                <Upload size={12} /> Upload
              </button>
              {logo && (
                <button onClick={() => setLogo("")} className="px-3 py-2 rounded-md border border-[#2a2620] text-xs text-[#F27C7C] hover:border-[#F27C7C]/40" data-testid="remove-logo-btn">Remove</button>
              )}
              <input ref={logoRef} type="file" accept="image/*" onChange={uploadLogo} className="hidden" />
            </div>
            {!canWhiteLabel && <div className="text-[11px] text-[#E8A020] mt-2">Company logo is available on the Enterprise plan and above.</div>}
          </div>
        </div>
      </div>

      <div className="card-dark p-5">
        <Label>Brand colours</Label>
        <div className="mt-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-md" style={{ backgroundColor: "#141210" }} />
          <div>
            <div className="text-sm text-[#F0EDE8]">Charcoal + Gold</div>
            <div className="text-[11px] text-[#706D66]">The Morris identity is currently fixed. Custom palettes coming soon.</div>
          </div>
          <div className="ml-auto w-10 h-10 rounded-md" style={{ backgroundColor: "#E8A020" }} />
        </div>
      </div>

      <div className="card-dark p-5">
        <Label>Email signature / role</Label>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Role shown on documents">
            <input className={inputClass} placeholder="e.g. Director" value={signatureRole} onChange={(e) => setSignatureRole(e.target.value)} data-testid="settings-sig-role" />
          </Field>
        </div>
        <div className="text-[11px] text-[#706D66] mt-2">Live-signature capture is available inside every tool that includes a sign-off block.</div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040] disabled:opacity-60" data-testid="save-branding">
          <Save size={14} /> {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>
  );
}

// ---------------- Notifications tab ----------------

const DEFAULT_PREFS = {
  pushEnabled: true,
  emailEnabled: true,
  emailDigestFrequency: "daily",
  expiryAlertLeadDays: 30,
  reminderDefaultDays: 7,
  chaseReminders: true,
  complianceReminders: true,
  documentReminders: true,
};

function NotifToggle({ k, label, hint, prefs, setPrefs }) {
  return (
    <label className="flex items-start justify-between gap-4 p-3 rounded-md hover:bg-[#0f0d09] cursor-pointer">
      <div className="min-w-0">
        <div className="text-sm text-[#F0EDE8]">{label}</div>
        {hint && <div className="text-[11px] text-[#706D66] mt-1">{hint}</div>}
      </div>
      <button
        onClick={() => setPrefs({ ...prefs, [k]: !prefs[k] })}
        className={`w-10 h-6 rounded-full transition relative shrink-0 ${prefs[k] ? "bg-[#E8A020]" : "bg-[#2a2620]"}`}
        data-testid={`notif-toggle-${k}`}
        type="button"
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-black transition ${prefs[k] ? "translate-x-4" : ""}`} />
      </button>
    </label>
  );
}

function NotificationsTab({ user, refresh }) {
  const initial = useMemo(() => ({ ...DEFAULT_PREFS, ...(user?.notificationPrefs || {}) }), [user?.notificationPrefs]);
  const [prefs, setPrefs] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setPrefs(initial); }, [initial]);

  const save = async () => {
    setSaving(true);
    try {
      await api.post("/profile/update", { notificationPrefs: prefs });
      await refresh();
      toast.success("Notification preferences saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5 max-w-2xl" data-testid="settings-notifications-tab">
      <div className="card-dark p-3">
        <NotifToggle k="pushEnabled" label="Push notifications" hint="In-app notification bell (top-right)." prefs={prefs} setPrefs={setPrefs} />
        <NotifToggle k="emailEnabled" label="Email notifications" hint="Sent via Resend to your account email." prefs={prefs} setPrefs={setPrefs} />
        <NotifToggle k="chaseReminders" label="Payment chase reminders" hint="Nudge you to send follow-up chase letters when invoices go overdue." prefs={prefs} setPrefs={setPrefs} />
        <NotifToggle k="complianceReminders" label="Compliance expiry reminders" hint="Insurance, CSCS and cert expiries appear on the Command Centre." prefs={prefs} setPrefs={setPrefs} />
        <NotifToggle k="documentReminders" label="Document review reminders" hint="RAMS, COSHH and other documents approaching their review dates." prefs={prefs} setPrefs={setPrefs} />
      </div>

      <div className="card-dark p-5">
        <Label>Email digest frequency</Label>
        <select
          value={prefs.emailDigestFrequency}
          onChange={(e) => setPrefs({ ...prefs, emailDigestFrequency: e.target.value })}
          className={`${inputClass} mt-2 max-w-xs`}
          data-testid="notif-frequency"
        >
          <option value="off">Off</option>
          <option value="daily">Daily (08:00)</option>
          <option value="weekly">Weekly (Monday 08:00)</option>
        </select>
      </div>

      <div className="card-dark p-5">
        <Label>Expiry alerts — lead time</Label>
        <div className="text-[11px] text-[#706D66] mt-1 mb-2">How many days before an expiry Morris starts flagging it on the Command Centre.</div>
        <div className="flex items-center gap-3">
          <input type="range" min="7" max="90" step="1" value={prefs.expiryAlertLeadDays}
            onChange={(e) => setPrefs({ ...prefs, expiryAlertLeadDays: Number(e.target.value) })}
            className="flex-1 accent-[#E8A020]" data-testid="notif-expiry-lead" />
          <span className="text-sm text-[#E8A020] w-16 text-right">{prefs.expiryAlertLeadDays} days</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040] disabled:opacity-60" data-testid="save-notifications">
          <Save size={14} /> {saving ? "Saving..." : "Save preferences"}
        </button>
      </div>
    </div>
  );
}

// ---------------- Security tab ----------------

function SecurityTab({ user }) {
  const nav = useNavigate();
  return (
    <div className="space-y-4 max-w-2xl" data-testid="settings-security-tab">
      <div className="card-dark p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Label>Password</Label>
            <div className="text-sm text-[#F0EDE8] mt-1">Change your account password.</div>
            <div className="text-[11px] text-[#706D66] mt-1">Morris will email you a reset link — the flow used at login.</div>
          </div>
          <button onClick={() => nav("/forgot-password")} className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]" data-testid="change-password-btn">
            <KeyRound size={12} /> Change password
          </button>
        </div>
      </div>

      <div className="card-dark p-5">
        <Label>Two-factor authentication</Label>
        <div className="text-sm text-[#F0EDE8] mt-1">SMS-based 2FA</div>
        <div className="text-[11px] text-[#706D66] mt-1">Every sign-in already requires an OTP sent to your registered mobile. Full app-based 2FA (Google Authenticator / 1Password) will land in a future release.</div>
        <div className="text-xs text-[#68D391] mt-3 flex items-center gap-1"><Check size={12} /> Active on this account (phone: {user?.contactNumber || user?.phone || "not set"})</div>
      </div>

      <div className="card-dark p-5">
        <Label>Active devices / sessions</Label>
        <div className="text-sm text-[#F0EDE8] mt-1">One active session per device</div>
        <div className="text-[11px] text-[#706D66] mt-1">Session tokens are stored in browser storage and rotated on each login. A full session-management panel is on the roadmap.</div>
        <div className="mt-3 p-3 rounded-md border border-[#2a2620] flex items-center justify-between">
          <div>
            <div className="text-sm text-[#F0EDE8]">This browser</div>
            <div className="text-[11px] text-[#706D66]">Signed in as {user?.username}</div>
          </div>
          <span className="text-[10px] text-[#68D391] px-2 py-1 rounded-full border border-[#68D391]/30">Current</span>
        </div>
      </div>

      <div className="card-dark p-5 border border-[#F27C7C]/30">
        <Label>Danger zone</Label>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-[#F27C7C]">Delete account</div>
            <div className="text-[11px] text-[#706D66]">Permanently remove your Morris account and all data.</div>
          </div>
          <Link to="/app/profile?section=danger" className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[#F27C7C]/40 text-xs text-[#F27C7C] hover:bg-[#F27C7C]/5" data-testid="delete-account-link">
            <AlertTriangle size={12} /> Delete account
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------------- Subscription tab ----------------

function SubscriptionTab() {
  const [status, setStatus] = useState(null);
  useEffect(() => { api.get("/billing/status").then((r) => setStatus(r.data)).catch(() => {}); }, []);

  return (
    <div className="space-y-4 max-w-2xl" data-testid="settings-subscription-tab">
      <div className="card-dark p-5">
        <Label>Current plan</Label>
        {status ? (
          <>
            <div className="mt-2 flex items-center gap-3">
              <div className="font-display text-2xl text-[#E8A020] capitalize">{status.plan || "Free"}</div>
              {status.status && <span className="text-[10px] uppercase tracking-[0.2em] text-[#68D391] px-2 py-1 rounded-full border border-[#68D391]/30">{status.status}</span>}
            </div>
            {status.expiresAt && <div className="text-[11px] text-[#706D66] mt-1">Renews {status.expiresAt.slice(0, 10)}</div>}
          </>
        ) : (
          <div className="text-sm text-[#A19D94] mt-2">Loading plan...</div>
        )}
      </div>

      <div className="card-dark p-5 flex items-center justify-between gap-3">
        <div>
          <Label>Billing & payment method</Label>
          <div className="text-sm text-[#F0EDE8] mt-1">Manage card, invoices and receipts via Stripe.</div>
        </div>
        <Link to="/app/billing" className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[#E8A020] text-black text-xs font-medium hover:bg-[#f0b040]" data-testid="open-billing-btn">
          Open Billing <ArrowRight size={12} />
        </Link>
      </div>

      <div className="card-dark p-5 flex items-center justify-between gap-3">
        <div>
          <Label>Invoices & receipts</Label>
          <div className="text-sm text-[#F0EDE8] mt-1">Download previous Morris subscription invoices from the Stripe customer portal.</div>
        </div>
        <Link to="/app/billing" className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[#2a2620] text-xs text-[#F0EDE8] hover:border-[#E8A020]">
          View invoices <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}

// ---------------- Backup & Export tab ----------------

function BackupTab() {
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(null);

  const exportEverything = async () => {
    setBusy(true); setOk(null);
    try {
      const [docs, jobs, expenses, cis, compliance] = await Promise.allSettled([
        api.get("/documents"), api.get("/jobs"), api.get("/expenses"), api.get("/cis/payments"), api.get("/compliance/items"),
      ]);
      const pick = (r) => r.status === "fulfilled" ? r.value.data : [];
      const bundle = {
        exportedAt: new Date().toISOString(),
        counts: {
          documents: pick(docs).length,
          jobs: pick(jobs).length,
          expenses: pick(expenses).length,
          cisPayments: pick(cis).length,
          complianceItems: pick(compliance).length,
        },
        documents: pick(docs),
        jobs: pick(jobs),
        expenses: pick(expenses),
        cisPayments: pick(cis),
        complianceItems: pick(compliance),
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `morris-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setOk(bundle.counts);
      toast.success("Backup downloaded");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Export failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 max-w-2xl" data-testid="settings-backup-tab">
      <div className="card-dark p-5">
        <Label>Export your data</Label>
        <div className="text-sm text-[#F0EDE8] mt-2">Download a single JSON bundle containing every document, job, expense, CIS payment and compliance record on your Morris account.</div>
        <div className="text-[11px] text-[#706D66] mt-1">This is your personal backup. Keep it safe. Morris also retains a copy in your account.</div>
        <button onClick={exportEverything} disabled={busy} className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-md bg-[#E8A020] text-black text-sm font-medium hover:bg-[#f0b040] disabled:opacity-60" data-testid="export-json-btn">
          <Download size={14} /> {busy ? "Building bundle..." : "Download JSON backup"}
        </button>
        {ok && (
          <div className="text-[11px] text-[#68D391] mt-3">
            Exported: {ok.documents} documents · {ok.jobs} jobs · {ok.expenses} expenses · {ok.cisPayments} CIS payments · {ok.complianceItems} compliance items
          </div>
        )}
      </div>

      <div className="card-dark p-5">
        <Label>Automatic backups</Label>
        <div className="text-sm text-[#F0EDE8] mt-2">All Morris data is backed up nightly in the platform database. If you ever need to restore from a specific date, contact support and quote your username.</div>
      </div>

      <div className="card-dark p-5">
        <Label>Restore from backup</Label>
        <div className="text-sm text-[#F0EDE8] mt-2">JSON-restore is coming soon. In the meantime, contact support for a manual restore.</div>
      </div>
    </div>
  );
}

// ---------------- Shell ----------------

export default function SettingsV2() {
  const { user, refresh, logout } = useAuth();
  const [tab, setTab] = useState("profile");

  if (!user) {
    return <div className="p-10 text-sm text-[#A19D94]">Loading...</div>;
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="hub-settings">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-[#E8A020] mb-2">Settings</div>
            <h1 className="font-display text-4xl sm:text-5xl text-[#F0EDE8]">Your Account</h1>
            <p className="text-sm text-[#A19D94] mt-2 max-w-2xl">Profile, company details, branding, notifications and subscription — everything in one organised place.</p>
          </div>
          <button onClick={() => { logout(); }} className="text-xs text-[#A19D94] hover:text-[#F27C7C] transition flex items-center gap-1" data-testid="settings-logout">
            <LogOut size={12} /> Log out
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        <nav className="space-y-1" data-testid="settings-tab-nav">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} data-testid={`settings-tab-${t.id}`}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition text-left ${active ? "bg-[#1e1a12] text-[#E8A020] border border-[#E8A020]/30" : "text-[#A19D94] hover:text-[#F0EDE8] hover:bg-[#0f0d09] border border-transparent"}`}>
                <Icon size={14} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
          {tab === "profile" && <ProfileTab user={user} refresh={refresh} />}
          {tab === "company" && <CompanyTab user={user} refresh={refresh} />}
          {tab === "branding" && <BrandingTab user={user} refresh={refresh} />}
          {tab === "notifications" && <NotificationsTab user={user} refresh={refresh} />}
          {tab === "security" && <SecurityTab user={user} />}
          {tab === "subscription" && <SubscriptionTab />}
          {tab === "backup" && <BackupTab />}
        </div>
      </div>
    </div>
  );
}
