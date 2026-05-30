import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { TRADES } from "../lib/tools-config";
import { toast } from "sonner";
import { AlertTriangle, Trash2, Info, PenTool, Upload, IdCard, Share2, Download, Mail, MessageCircle, MessageSquare, Building2 } from "lucide-react";
import SignaturePad from "../components/SignaturePad";
import { downloadProfilePdf } from "../lib/profilePdf";

export default function Profile() {
  const { user, refresh, logout } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  // Profile completion is no longer mandatory — `mustComplete` removed.
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
    vehicleReg: user?.vehicleReg || "",
    // Legacy free-text field — kept so existing profiles still surface
    // bank details on invoices until the user re-enters them as structured fields.
    bankDetails: user?.bankDetails || "",
    signature: user?.signature || "",
    signatureRole: user?.signatureRole || "",
    cscsCardFront: user?.cscsCardFront || "",
    cscsCardBack: user?.cscsCardBack || "",
    companyLogo: user?.companyLogo || "",
    sortCode: user?.sortCode || "",
    accountNumber: user?.accountNumber || "",
    bankName: user?.bankName || "",
    // Default ON for new users: they can switch off via the toggle below.
    shareBankDetails: user?.shareBankDetails ?? true,
    trade: user?.trade || "",
  });
  const [saving, setSaving] = useState(false);
  const cscsFrontRef = useRef(null);
  const cscsBackRef = useRef(null);
  const logoRef = useRef(null);
  const [plan, setPlan] = useState(null);

  // Load billing plan to gate the white-label logo upload
  useEffect(() => {
    api.get("/billing/status").then((r) => setPlan(r.data.plan)).catch(() => {});
  }, []);
  const canWhiteLabel = plan === "enterprise" || plan === "unlimited" || user?.isUnlimited;

  // Resize + compress an uploaded image to keep the user's profile payload sane
  // (a raw phone photo would otherwise be 2-5MB which is too big to stash on the profile).
  const fileToCompressedDataUrl = (file, maxW = 1100, quality = 0.82) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const scale = Math.min(1, maxW / img.width);
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const c = document.createElement("canvas");
          c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL("image/jpeg", quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });

  const onCscsUpload = (side) => async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please upload an image file"); return; }
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      setF((prev) => ({ ...prev, [side === "front" ? "cscsCardFront" : "cscsCardBack"]: dataUrl }));
      toast.success(`CSCS ${side} uploaded. Remember to save the profile.`);
    } catch {
      toast.error("Could not read the image");
    }
  };

  const onLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please upload an image file"); return; }
    try {
      // Compress to a tight 600px-wide PNG so it stays crisp on PDF headers without bloating the profile
      const dataUrl = await fileToCompressedDataUrl(file, 600, 0.92);
      setF((prev) => ({ ...prev, companyLogo: dataUrl }));
      toast.success("Logo uploaded. Save the profile to apply it to your documents.");
    } catch {
      toast.error("Could not read the image");
    }
  };

  // ----- Share my profile -----
  const [sharing, setSharing] = useState(false);
  const buildShareCopy = () => {
    const includeBank = user?.shareBankDetails !== false && (user?.bankName || user?.sortCode || user?.accountNumber);
    const parts = [
      `MORRIS TRADE PROFILE`,
      ``,
      `Name: ${user?.fullName || ""}`,
      `Trade: ${user?.trade || ""}`,
      user?.companyName ? `Company: ${user.companyName}` : null,
      user?.contactNumber || user?.phone ? `Phone: ${user.contactNumber || user.phone}` : null,
      user?.email ? `Email: ${user.email}` : null,
      user?.utr ? `UTR: ${user.utr}` : null,
      user?.cisStatus ? `CIS status: ${user.cisStatus}` : null,
      user?.insuranceExpiry ? `Public liability expiry: ${user.insuranceExpiry}` : null,
      user?.cscsExpiry ? `CSCS card expiry: ${user.cscsExpiry}` : null,
      ``,
      includeBank ? `PAYMENT DETAILS` : null,
      includeBank && user?.bankName ? `Bank: ${user.bankName}` : null,
      includeBank && (user?.companyName || user?.fullName) ? `Account name: ${user.companyName || user.fullName}` : null,
      includeBank && user?.sortCode ? `Sort code: ${user.sortCode}` : null,
      includeBank && user?.accountNumber ? `Account number: ${user.accountNumber}` : null,
      includeBank ? `` : null,
      (user?.cscsCardFront && user?.cscsCardBack)
        ? `(CSCS card photos attached in the PDF.)`
        : `Add your CSCS card photos in profile settings to include them in your shared profile.`,
      ``,
      `Send this to the main contractor before you step on site. Your credentials, insurance, and CIS status, all in one document.`,
      `Generated by Morris (morrisapp.co.uk)`,
    ];
    return parts.filter(Boolean).join("\n");
  };

  const onShareDownload = () => downloadProfilePdf(user);
  const onShareEmail = () => {
    setSharing(true);
    downloadProfilePdf(user);
    const subject = encodeURIComponent(`My trade profile — ${user?.fullName || user?.username || "Morris"}`);
    const body = encodeURIComponent(buildShareCopy() + "\n\n(PDF with CSCS card photos and signature attached separately. Please attach the PDF that just downloaded.)");
    setTimeout(() => { window.location.href = `mailto:?subject=${subject}&body=${body}`; setSharing(false); }, 350);
  };
  const onShareWhatsApp = () => {
    setSharing(true);
    downloadProfilePdf(user);
    const text = encodeURIComponent(buildShareCopy() + "\n\n(PDF with CSCS card photos and signature attached, please attach the file that just downloaded.)");
    setTimeout(() => { window.open(`https://wa.me/?text=${text}`, "_blank"); setSharing(false); }, 350);
  };
  const onShareSms = () => {
    setSharing(true);
    downloadProfilePdf(user);
    const body = encodeURIComponent(buildShareCopy() + "\n\n(PDF with CSCS card photos attached.)");
    setTimeout(() => { window.location.href = `sms:?body=${body}`; setSharing(false); }, 350);
  };

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

      {/* Profile-complete banner removed — every field is optional. Save whenever you're ready. */}

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
        <Row label="Contact number"><input className="input-base" value={f.contactNumber} onChange={(e) => setF({ ...f, contactNumber: e.target.value })} placeholder="07700 900001" data-testid="profile-contact" /></Row>
        <Row label="UTR"><input className="input-base" value={f.utr} onChange={(e) => setF({ ...f, utr: e.target.value })} placeholder="10-digit Unique Taxpayer Reference" data-testid="profile-utr" /></Row>
        <Row label="VAT registered">
          <label className="flex items-center gap-3 text-sm text-[#A19D94]">
            <input type="checkbox" checked={!!f.vatRegistered} onChange={(e) => setF({ ...f, vatRegistered: e.target.checked })} data-testid="profile-vat-registered" />
            <span>I am VAT registered</span>
          </label>
        </Row>
        {f.vatRegistered && (
          <Row label="VAT number"><input className="input-base" value={f.vatNumber} onChange={(e) => setF({ ...f, vatNumber: e.target.value })} data-testid="profile-vat" /></Row>
        )}
        <Row label="CIS status">
          <select className="input-base" value={f.cisStatus} onChange={(e) => setF({ ...f, cisStatus: e.target.value })} data-testid="profile-cis">
            <option>Gross 0%</option><option>Net 20%</option><option>Higher 30%</option>
          </select>
        </Row>
        <Row label="Public liability insurance expiry"><input type="date" className="input-base" value={f.insuranceExpiry} onChange={(e) => setF({ ...f, insuranceExpiry: e.target.value })} data-testid="profile-insurance-expiry" /></Row>
        <Row label="CSCS card expiry"><input type="date" className="input-base" value={f.cscsExpiry} onChange={(e) => setF({ ...f, cscsExpiry: e.target.value })} data-testid="profile-cscs-expiry" /></Row>

        {/* CSCS card photo uploads */}
        <div className="pt-2 border-t border-[#1a1a1a]">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020] flex items-center gap-2 mb-3">
            <IdCard size={12}/> CSCS card photos
          </div>
          <p className="text-[11px] text-[#706D66] mb-3">Upload both sides of your CSCS card. They appear in your shared trade profile PDF — main contractors love this on day one.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="cscs-upload-grid">
            <CscsTile
              label="CSCS card — front"
              value={f.cscsCardFront}
              inputRef={cscsFrontRef}
              onPick={() => cscsFrontRef.current?.click()}
              onClear={() => setF({ ...f, cscsCardFront: "" })}
              onChange={onCscsUpload("front")}
              testIdPrefix="cscs-front"
            />
            <CscsTile
              label="CSCS card — back"
              value={f.cscsCardBack}
              inputRef={cscsBackRef}
              onPick={() => cscsBackRef.current?.click()}
              onClear={() => setF({ ...f, cscsCardBack: "" })}
              onChange={onCscsUpload("back")}
              testIdPrefix="cscs-back"
            />
          </div>
          {(!f.cscsCardFront || !f.cscsCardBack) && (
            <div className="mt-3 text-[11px] text-[#A19D94] flex items-start gap-2" data-testid="cscs-missing-hint">
              <Info size={12} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
              Add your CSCS card photos in profile settings to include them in your shared profile.
            </div>
          )}
        </div>

        <Row label="Vehicle registration"><input className="input-base" value={f.vehicleReg} onChange={(e) => setF({ ...f, vehicleReg: e.target.value })} placeholder="e.g. AB12 CDE" data-testid="profile-vehicle" /></Row>
        {/* Bank / Payment details — auto-populated on CIS Invoice, Application for Payment, Daywork Sheet, Retention Chaser, Subbi Payment Certificate, Final Account Statement, Bad Debt Letter, Payment Chaser, Quote Builder and Price Work Quote ONLY. */}
        <div className="pt-2 border-t border-[#1a1a1a]" data-testid="bank-details-section">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020] mb-3">Payment details</div>
          <p className="text-[11px] text-[#706D66] mb-3">
            Auto-populated on invoices, quotes, payment chasers and similar documents only. Never shown on RAMS, COSHH, site diaries or any other non-payment paperwork.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Row label="Bank name"><input className="input-base" value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} placeholder="e.g. Lloyds Bank" data-testid="profile-bank-name" /></Row>
            <Row label="Sort code"><input className="input-base" value={f.sortCode} onChange={(e) => setF({ ...f, sortCode: e.target.value })} placeholder="00-00-00" data-testid="profile-bank-sortcode" /></Row>
            <Row label="Account number"><input className="input-base" value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value })} placeholder="00000000" data-testid="profile-bank-account" /></Row>
          </div>
          <label className="mt-3 flex items-start gap-3 text-sm text-[#A19D94] cursor-pointer" data-testid="profile-share-bank-toggle-row">
            <input
              type="checkbox"
              className="mt-1"
              checked={!!f.shareBankDetails}
              onChange={(e) => setF({ ...f, shareBankDetails: e.target.checked })}
              data-testid="profile-share-bank-toggle"
            />
            <span>
              <span className="text-[#F0EDE8] font-semibold">Include bank details when sharing my profile</span>
              <span className="block text-[11px] text-[#706D66] mt-0.5">When OFF, your bank details are kept private on the shared profile PDF. They still appear on the invoices and quotes you generate inside Morris.</span>
            </span>
          </label>
        </div>

        {/* White-label company logo (Enterprise only) */}
        <div className="pt-2 border-t border-[#1a1a1a]">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020] flex items-center gap-2 mb-3">
            <Building2 size={12}/> White-label branding
            {!canWhiteLabel && <span className="text-[#706D66] normal-case tracking-normal text-[11px]">(Enterprise plan)</span>}
          </div>
          {canWhiteLabel ? (
            <div data-testid="whitelabel-uploader">
              <p className="text-[11px] text-[#706D66] mb-3">Upload your company logo. It replaces the Morris wordmark on the header of every PDF you generate, and your company name appears in the corner instead of Morris.</p>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="w-40 h-24 rounded border bg-[#0a0a0a] flex items-center justify-center overflow-hidden" style={{ borderColor: "rgba(232,160,32,0.3)" }}>
                  {f.companyLogo ? (
                    <img src={f.companyLogo} alt="Logo preview" className="max-w-full max-h-full object-contain" data-testid="whitelabel-preview" />
                  ) : (
                    <Building2 size={28} className="text-[#3d3d3d]" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <button type="button" onClick={() => logoRef.current?.click()} className="btn-secondary text-xs flex items-center gap-2" data-testid="whitelabel-upload-btn">
                    <Upload size={12}/> {f.companyLogo ? "Replace logo" : "Upload logo"}
                  </button>
                  {f.companyLogo && (
                    <button type="button" onClick={() => setF({ ...f, companyLogo: "" })} className="text-[10px] text-[#706D66] hover:text-[#E5635A] uppercase tracking-widest" data-testid="whitelabel-clear">Clear</button>
                  )}
                  <input ref={logoRef} type="file" accept="image/*" onChange={onLogoUpload} className="hidden" data-testid="whitelabel-input" />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-[#706D66]" data-testid="whitelabel-locked">
              White-label branding (your logo and company name on every PDF in place of Morris) is exclusive to Enterprise.
              <a href="/app/billing" className="text-[#E8A020] hover:underline ml-1">See Enterprise plan →</a>
            </p>
          )}
        </div>

        {/* Signature — appears on every generated document sign-off block */}
        <div className="pt-2 border-t border-[#1a1a1a]">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020] flex items-center gap-2 mb-3">
            <PenTool size={12}/> Sign-off settings
          </div>
          <Row label="Your role (appears in sign-off block)">
            <input
              className="input-base"
              value={f.signatureRole}
              onChange={(e) => setF({ ...f, signatureRole: e.target.value })}
              placeholder="e.g. Director, Site Manager, Owner, Operative"
              data-testid="profile-signature-role"
            />
          </Row>
          <div className="block">
            <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">Saved signature</div>
            <p className="text-[11px] text-[#706D66] mb-2">Drawn once here. Auto-applied to every document Morris generates. Sign with your finger on a phone or stylus.</p>
            <SignaturePad value={f.signature} onChange={(s) => setF({ ...f, signature: s })} />
          </div>
        </div>
        <button className="btn-primary" disabled={saving} data-testid="profile-save">{saving ? "Saving…" : "Save profile"}</button>
      </form>

      {/* ---------- Share my profile ---------- */}
      <div className="card-dark p-6 mt-8" data-testid="share-profile-card">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020] flex items-center gap-2 mb-1">
              <Share2 size={12}/> Share my profile
            </div>
            <h2 className="font-display text-2xl text-[#F0EDE8]">Send your credentials in one tap</h2>
            <p className="text-xs text-[#706D66] mt-1 max-w-xl">
              Generate a one-page PDF with your full profile — trade, company, contact, CIS status, insurance + CSCS expiries, both sides of your CSCS card and your signature. Send it before you step on site.
            </p>
          </div>
        </div>
        {(!user?.cscsCardFront || !user?.cscsCardBack) && (
          <div
            className="mb-4 p-3 rounded flex items-start gap-2 text-xs text-[#A19D94]"
            style={{ border: "1px solid rgba(232,160,32,0.3)", background: "rgba(232,160,32,0.05)" }}
            data-testid="share-cscs-warning"
          >
            <Info size={14} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
            <span><span className="text-[#F0EDE8] font-semibold">Heads up: </span> Add your CSCS card photos in profile settings to include them in your shared profile.</span>
          </div>
        )}
        <div className="flex flex-wrap gap-2" data-testid="share-profile-actions">
          <button onClick={onShareDownload} className="btn-secondary text-xs flex items-center gap-2" disabled={sharing} data-testid="share-download"><Download size={14}/> Download PDF</button>
          <button onClick={onShareEmail} className="btn-secondary text-xs flex items-center gap-2" disabled={sharing} data-testid="share-email"><Mail size={14}/> Email</button>
          <button onClick={onShareWhatsApp} className="btn-secondary text-xs flex items-center gap-2" disabled={sharing} data-testid="share-whatsapp"><MessageCircle size={14}/> WhatsApp</button>
          <button onClick={onShareSms} className="btn-secondary text-xs flex items-center gap-2" disabled={sharing} data-testid="share-sms"><MessageSquare size={14}/> SMS</button>
        </div>
      </div>

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

function CscsTile({ label, value, inputRef, onPick, onClear, onChange, testIdPrefix }) {
  return (
    <div className="rounded border bg-[#0a0a0a] overflow-hidden" style={{ borderColor: "rgba(232,160,32,0.25)" }} data-testid={`${testIdPrefix}-tile`}>
      <div className="aspect-[1.6/1] bg-[#060606] flex items-center justify-center relative">
        {value ? (
          <img src={value} alt={label} className="w-full h-full object-cover" data-testid={`${testIdPrefix}-preview`} />
        ) : (
          <div className="flex flex-col items-center gap-2 text-[#706D66] text-xs">
            <IdCard size={28} className="text-[#3d3d3d]" />
            <span>No image yet</span>
          </div>
        )}
      </div>
      <div className="p-3 flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-widest text-[#A19D94] truncate">{label}</div>
        <div className="flex gap-1.5">
          {value && (
            <button type="button" onClick={onClear} className="text-[10px] text-[#706D66] hover:text-[#E5635A] uppercase tracking-widest" data-testid={`${testIdPrefix}-clear`}>Clear</button>
          )}
          <button
            type="button"
            onClick={onPick}
            className="btn-secondary text-[10px] uppercase tracking-widest flex items-center gap-1.5 px-3 py-1.5"
            data-testid={`${testIdPrefix}-upload-btn`}
          >
            <Upload size={11} /> {value ? "Replace" : "Upload " + (testIdPrefix.includes("front") ? "front" : "back")}
          </button>
          <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onChange} className="hidden" data-testid={`${testIdPrefix}-input`} />
        </div>
      </div>
    </div>
  );
}
