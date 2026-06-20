import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { toast } from "sonner";
import {
  Plus, Trash2, TrendingUp, Info, Star, X, AlertCircle, Download, Mail, Send,
  Loader2, Pencil, ChevronDown, ChevronUp, Check,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import {
  thisTaxYear, aggregateCis, refundCalc, fGBP, currentTaxYearLabel, mileageClaimYtd,
} from "../lib/finance";
import { downloadRefundSummary, refundSummaryPdfBase64 } from "../lib/refundSummaryPdf";

const TOOL = {
  id: "cis-refund-predictor",
  name: "CIS Refund Predictor",
  section: "finance",
  info: "Log every CIS payment a contractor pays you. Morris splits labour from materials, applies your allowable expenses, and tells you exactly what HMRC owes you back at year end.",
};

const isoToday = () => new Date().toISOString().slice(0, 10);

// LocalStorage key for the user's "other income" + "expenses" + VAT inputs.
// These are personal-allowance / profit adjustments — not transactional data —
// so they live in localStorage and stay scoped to the current tax year via the
// key suffix. Persisting means the figures don't reset on refresh.
const SETTINGS_KEY = () => `morris_cis_settings_${currentTaxYearLabel().replace("/", "-")}`;

const DEFAULT_SETTINGS = {
  otherIncomeYes: false,
  otherIncomeType: "PAYE employment",
  otherIncomeAmount: "",
  vatRegistered: false,
  expensesOpen: true,
  expenses: {
    tools: "",
    fuel: "",
    ppe: "",
    insurance: "",
    accountancy: "",
    phone: "",
    training: "",
    otherAmount: "",
    otherDescription: "",
  },
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY());
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      expenses: { ...DEFAULT_SETTINGS.expenses, ...(parsed.expenses || {}) },
    };
  } catch { return DEFAULT_SETTINGS; }
}

export default function CISRefundPredictor() {
  const { user, refresh } = useAuth();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({
    date: isoToday(),
    contractor: "",
    grossLabour: "",
    materials: "",
    cisRate: 0.20,
  });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accountantOpen, setAccountantOpen] = useState(false);
  const [accountantEmail, setAccountantEmail] = useState(() => {
    try { return localStorage.getItem("morris_accountant_email") || ""; } catch { return ""; }
  });
  const [sending, setSending] = useState(false);

  // Personal allowance + VAT + expense settings (persisted to localStorage)
  const [settings, setSettings] = useState(loadSettings);

  // Persist on every change
  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY(), JSON.stringify(settings)); } catch { /* quota */ }
  }, [settings]);

  // Auto-pull mileage claim from Mileage Tracker on mount (and after Edit/Add).
  // The user can still override manually after — we only set if their current
  // fuel field is empty (so we don't trample manual edits).
  useEffect(() => {
    const claim = mileageClaimYtd();
    if (claim > 0 && !settings.expenses.fuel) {
      setSettings((s) => ({ ...s, expenses: { ...s.expenses, fuel: String(claim) } }));
    }
  }, []); // run once on mount

  const isFav = (user?.favourites || []).includes(TOOL.id);
  const toggleFav = async () => {
    const current = user?.favourites || [];
    const next = isFav ? current.filter(x => x !== TOOL.id) : [...current, TOOL.id];
    try {
      await api.post("/profile/update", { favourites: next });
      await refresh();
      toast.success(isFav ? "Removed from favourites" : "Added to favourites");
    } catch { toast.error("Could not update favourites"); }
  };

  const load = async () => {
    try { const r = await api.get("/cis/payments"); setItems(r.data); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Live preview of calculated values from the form
  const labourNum = parseFloat(form.grossLabour || 0) || 0;
  const matsNum = parseFloat(form.materials || 0) || 0;
  const rate = Number(form.cisRate);
  const previewDeduction = +(labourNum * rate).toFixed(2);
  const previewTotalGross = +(labourNum + matsNum).toFixed(2);
  const previewNet = +(previewTotalGross - previewDeduction).toFixed(2);

  const onAdd = async (e) => {
    e.preventDefault();
    if (!labourNum && !matsNum) {
      toast.error("Enter at least a Gross Labour or Materials value");
      return;
    }
    setBusy(true);
    try {
      await api.post("/cis/payments", {
        date: form.date,
        contractor: form.contractor || "",
        grossLabour: labourNum,
        materials: matsNum,
        cisRate: rate,
      });
      setForm({ date: isoToday(), contractor: "", grossLabour: "", materials: "", cisRate: 0.20 });
      load();
      toast.success("Payment logged");
    } catch (err) {
      toast.error("Could not save");
    } finally {
      setBusy(false);
    }
  };
  const onDelete = async (id) => {
    try { await api.delete(`/cis/payments/${id}`); load(); }
    catch (e) { if (process.env.NODE_ENV !== "production") console.error("CIS delete failed", e); }
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditForm({
      date: p.date,
      contractor: p.contractor || "",
      grossLabour: String(p.grossLabour ?? p.gross ?? ""),
      materials: String(p.materials ?? ""),
      cisRate: Number(p.cisRate || 0.20),
    });
  };
  const cancelEdit = () => { setEditingId(null); setEditForm(null); };
  const saveEdit = async () => {
    if (!editingId || !editForm) return;
    const labour = parseFloat(editForm.grossLabour || 0) || 0;
    const mats = parseFloat(editForm.materials || 0) || 0;
    if (!labour && !mats) { toast.error("Enter at least a Gross Labour or Materials value"); return; }
    try {
      await api.put(`/cis/payments/${editingId}`, {
        date: editForm.date,
        contractor: editForm.contractor || "",
        grossLabour: labour,
        materials: mats,
        cisRate: Number(editForm.cisRate),
      });
      cancelEdit();
      load();
      toast.success("Payment updated");
    } catch (err) {
      toast.error("Could not update");
    }
  };

  const sendToAccountant = async () => {
    const e = (accountantEmail || "").trim();
    if (!e || !/.+@.+\..+/.test(e)) { toast.error("Enter a valid email"); return; }
    setSending(true);
    try {
      const pdfBase64 = refundSummaryPdfBase64({ user, cisPayments: items });
      await api.post("/cis/refund-summary/email", {
        accountantEmail: e,
        taxYear: currentTaxYearLabel(),
        pdfBase64,
      });
      try { localStorage.setItem("morris_accountant_email", e); } catch { /* ignore */ }
      toast.success(`Summary sent to ${e}`);
      setAccountantOpen(false);
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Could not send. Try downloading instead.");
    } finally { setSending(false); }
  };

  // ---------------- TOTALS ----------------
  const ytdItems = thisTaxYear(items);
  const totals = aggregateCis(ytdItems);

  // Other income (Section 1)
  const otherIncome = settings.otherIncomeYes ? (parseFloat(settings.otherIncomeAmount) || 0) : 0;

  // Expenses (Section 3) — sum of all the expense fields
  const expensesTotal = useMemo(() => {
    const e = settings.expenses;
    return ["tools","fuel","ppe","insurance","accountancy","phone","training","otherAmount"]
      .reduce((sum, k) => sum + (parseFloat(e[k]) || 0), 0);
  }, [settings.expenses]);

  const calc = refundCalc({
    grossLabourYtd: totals.grossLabour,
    materialsYtd: totals.materials,
    cisDeductedYtd: totals.deduction,
    otherIncome,
    expensesTotal,
    extended: true,
  });

  const paUsedByOtherIncome = otherIncome > 0 && otherIncome >= 12570;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-cis-refund-predictor">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Finance · Tax year {currentTaxYearLabel()}</div>
          <h1 className="font-display text-4xl md:text-5xl">CIS Refund Predictor</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(true)} className="btn-secondary flex items-center gap-2" data-testid="cis-info-btn"><Info size={16} /> Info</button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="cis-fav-btn"><Star size={16} fill={isFav ? "#E8A020" : "none"} /> Favourite</button>
          <button
            onClick={() => downloadRefundSummary({ user, cisPayments: items })}
            disabled={items.length === 0}
            title={items.length === 0 ? "Log a payment first" : "Download a one-page summary PDF"}
            className="btn-secondary flex items-center gap-2 disabled:opacity-50"
            data-testid="cis-download-summary"
          >
            <Download size={16} /> Download summary
          </button>
          <button
            onClick={() => setAccountantOpen(true)}
            disabled={items.length === 0}
            title={items.length === 0 ? "Log a payment first" : "Email a one-page summary to your accountant"}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
            data-testid="cis-email-accountant"
          >
            <Mail size={16} /> Send to accountant
          </button>
        </div>
      </div>

      {infoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={() => setInfoOpen(false)} data-testid="cis-info-overlay">
          <div onClick={(e) => e.stopPropagation()} className="max-w-2xl w-full" style={{ background: "#0D0D0D", border: "1px solid #E8A020", borderRadius: 8, padding: 24 }} data-testid="cis-info-popup">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h2 className="font-display text-3xl text-[#F0EDE8]">What this tool does</h2>
              <button onClick={() => setInfoOpen(false)} className="text-[#A19D94] hover:text-[#F0EDE8]"><X size={20} /></button>
            </div>
            <p className="text-sm text-[#A19D94] leading-relaxed mb-5">{TOOL.info}</p>
            <div style={{ padding: "14px 16px", borderRadius: 6, border: "1px solid #3B82F6", background: "rgba(59,130,246,0.08)" }}>
              <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "#5B9BFF", fontWeight: 700, marginBottom: 8 }}>TAX NOTICE</div>
              <div style={{ fontSize: 12, color: "#A19D94", lineHeight: 1.6 }}>
                This is a guide only. Based on your logged payments and expenses, your personal allowance, and the figures entered above. Not a tax return. Speak to an accountant for your final figures.
              </div>
            </div>
          </div>
        </div>
      )}

      {accountantOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={() => !sending && setAccountantOpen(false)} data-testid="cis-accountant-overlay">
          <div onClick={(e) => e.stopPropagation()} className="card-dark max-w-md w-full p-6" style={{ borderColor: "#E8A020" }} data-testid="cis-accountant-popup">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020] mb-1">Send to accountant</div>
                <h3 className="font-display text-2xl text-[#F0EDE8]">Email refund summary</h3>
              </div>
              <button onClick={() => !sending && setAccountantOpen(false)} className="text-[#A19D94] hover:text-[#F0EDE8]" data-testid="cis-accountant-close"><X size={18} /></button>
            </div>
            <p className="text-sm text-[#A19D94] mb-4">
              We&apos;ll attach a one-page PDF: every CIS payment this tax year, gross labour and materials split, total deducted, and the six-step refund calc. Your name and email go in the reply-to.
            </p>
            <label className="block mb-4">
              <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">Accountant email</div>
              <input
                type="email"
                className="input-base"
                value={accountantEmail}
                onChange={(e) => setAccountantEmail(e.target.value)}
                placeholder="hello@youraccountant.co.uk"
                autoFocus
                data-testid="cis-accountant-email-input"
              />
            </label>
            <div className="flex gap-2">
              <button onClick={() => setAccountantOpen(false)} disabled={sending} className="btn-secondary flex-1" data-testid="cis-accountant-cancel">Cancel</button>
              <button onClick={sendToAccountant} disabled={sending} className="btn-primary flex-1 flex items-center justify-center gap-2" data-testid="cis-accountant-send">
                {sending ? <><Loader2 size={14} className="animate-spin"/> Sending</> : <><Send size={14}/> Send</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 1 — PERSONAL ALLOWANCE CHECK */}
      <div className="card-dark p-6 mb-6" data-testid="cis-personal-allowance-check">
        <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Personal Allowance Check</div>
        <p className="text-sm text-[#A19D94] mb-4">
          Other income (PAYE, pension, side trade) uses up part of your £12,570 personal allowance first.
          Tell Morris and we&apos;ll factor it into your refund estimate.
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">Do you have any other income this tax year?</div>
            <div className="grid grid-cols-2 gap-2" data-testid="cis-otherincome-toggle">
              <ToggleBtn active={settings.otherIncomeYes} onClick={() => setSettings((s) => ({ ...s, otherIncomeYes: true }))} label="Yes" testId="cis-otherincome-yes" />
              <ToggleBtn active={!settings.otherIncomeYes} onClick={() => setSettings((s) => ({ ...s, otherIncomeYes: false }))} label="No" testId="cis-otherincome-no" />
            </div>
          </div>
          {settings.otherIncomeYes && (
            <>
              <div>
                <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">Other income type</div>
                <select
                  className="input-base"
                  value={settings.otherIncomeType}
                  onChange={(e) => setSettings((s) => ({ ...s, otherIncomeType: e.target.value }))}
                  data-testid="cis-otherincome-type"
                >
                  <option>PAYE employment</option>
                  <option>Pension</option>
                  <option>Self-employment outside CIS</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">Estimated other income (£)</div>
                <input
                  type="number"
                  className="input-base"
                  value={settings.otherIncomeAmount}
                  onChange={(e) => setSettings((s) => ({ ...s, otherIncomeAmount: e.target.value }))}
                  placeholder="e.g. 8000"
                  data-testid="cis-otherincome-amount"
                />
                <div className="text-[10px] text-[#706D66] mt-1 leading-relaxed">
                  This affects how much of your personal allowance is still available for your CIS income.
                </div>
              </div>
            </>
          )}
        </div>
        {settings.otherIncomeYes && otherIncome > 0 && (
          <div
            className="mt-4 p-3 rounded text-xs flex items-start gap-2"
            style={{ background: "rgba(232,160,32,0.08)", border: "1px solid rgba(232,160,32,0.35)", color: "#E8A020" }}
            data-testid="cis-pa-note"
          >
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span>
              {paUsedByOtherIncome
                ? "Your personal allowance is fully used by other income — no allowance remains for your CIS income."
                : `Your personal allowance may already be used against other income — this affects your estimated refund. £${calc.availablePA.toLocaleString("en-GB")} of allowance remains for CIS income.`}
            </span>
          </div>
        )}
      </div>

      {/* HEADLINE — refund or tax owed */}
      <div className="card-dark p-8 mb-6" data-testid="refund-summary">
        <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-2 flex items-center gap-2">
          <TrendingUp size={14} /> {calc.delta >= 0 ? "Estimated refund at year end" : "Estimated tax owed at year end"}
        </div>
        <div className="font-display text-6xl md:text-7xl" style={{ color: calc.delta >= 0 ? "#E8A020" : "#E5635A" }} data-testid="cis-headline-amount">
          {fGBP(Math.abs(calc.delta))}
        </div>
        {calc.delta < 0 && (
          <div className="mt-4 p-3 rounded text-sm flex items-start gap-2" style={{ background: "rgba(232,160,32,0.08)", border: "1px solid rgba(232,160,32,0.35)", color: "#E8A020" }} data-testid="cis-tax-owed-warning">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>Based on your earnings so far you may owe {fGBP(Math.abs(calc.delta))} on 31 January. Set this aside now.</span>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6 text-sm">
          <Stat label="Gross labour YTD" value={fGBP(totals.grossLabour)} />
          <Stat label="Materials YTD" value={fGBP(totals.materials)} />
          <Stat label="CIS deducted YTD" value={fGBP(totals.deduction)} accent />
          <Stat label="Net cash received" value={fGBP(totals.net)} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-4 text-xs text-[#706D66]">
          <Stat small label="Taxable profit" value={fGBP(calc.taxableProfit)} testId="cis-stat-taxable-profit" />
          <Stat small label="Income tax (20%)" value={fGBP(calc.incomeTax)} testId="cis-stat-income-tax" />
          <Stat small label="Class 4 NI (6%)" value={fGBP(calc.class4Ni)} testId="cis-stat-class4-ni" />
          <Stat small label="Total liability" value={fGBP(calc.totalLiability)} testId="cis-stat-total-liability" />
        </div>
        <div className="text-xs text-[#706D66] mt-5 leading-relaxed" data-testid="cis-disclaimer">
          This is a guide only. Based on your logged payments and expenses, your personal allowance, and the figures entered above. Not a tax return. Speak to an accountant for your final figures.
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-6">
        {/* LOG A CIS PAYMENT */}
        <form onSubmit={onAdd} className="card-dark p-6 md:col-span-1" data-testid="cis-form">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4">Log a CIS payment</div>
          <div className="space-y-3">
            <Input label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} testId="cis-date" />
            <Input label="Contractor" value={form.contractor} onChange={(v) => setForm({ ...form, contractor: v })} placeholder="Who paid you" testId="cis-contractor" />
            <Input label="Gross labour (£)" type="number" value={form.grossLabour} onChange={(v) => setForm({ ...form, grossLabour: v })} testId="cis-grosslabour" />
            <Input label="Materials (£)" type="number" value={form.materials} onChange={(v) => setForm({ ...form, materials: v })} testId="cis-materials" />

            {/* SECTION 2 — VAT STATUS */}
            <div>
              <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">Are you VAT registered?</div>
              <div className="grid grid-cols-2 gap-2" data-testid="cis-vat-toggle">
                <ToggleBtn active={settings.vatRegistered} onClick={() => setSettings((s) => ({ ...s, vatRegistered: true }))} label="Yes" testId="cis-vat-yes" />
                <ToggleBtn active={!settings.vatRegistered} onClick={() => setSettings((s) => ({ ...s, vatRegistered: false }))} label="No" testId="cis-vat-no" />
              </div>
              {settings.vatRegistered && (
                <div className="text-[10px] text-[#706D66] mt-2 leading-relaxed" data-testid="cis-vat-note">
                  Enter the Gross Labour and Materials figures above <span className="text-[#E8A020]">excluding VAT</span> — VAT is not part of your taxable profit.
                </div>
              )}
            </div>

            <div>
              <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">CIS rate</div>
              <div className="grid grid-cols-2 gap-2" data-testid="cis-rate-toggle">
                <RateButton active={Number(form.cisRate) === 0.20} onClick={() => setForm({ ...form, cisRate: 0.20 })} label="20% Registered" testId="cis-rate-20" />
                <RateButton active={Number(form.cisRate) === 0.30} onClick={() => setForm({ ...form, cisRate: 0.30 })} label="30% Unregistered" testId="cis-rate-30" />
              </div>
            </div>

            {/* Live calc preview */}
            <div className="mt-2 p-3 rounded text-xs space-y-1" style={{ background: "rgba(232,160,32,0.06)", border: "1px solid rgba(232,160,32,0.25)" }} data-testid="cis-form-preview">
              <CalcRow label="CIS tax deducted" value={fGBP(previewDeduction)} accent />
              <CalcRow label="Total gross invoice value" value={fGBP(previewTotalGross)} />
              <CalcRow label="Net cash received" value={fGBP(previewNet)} strong />
            </div>

            <button disabled={busy} className="btn-primary w-full flex items-center justify-center gap-2" data-testid="cis-add">
              <Plus size={16} /> {busy ? "Saving…" : "Add payment"}
            </button>
          </div>
        </form>

        {/* SECTION 3 — ALLOWABLE EXPENSES (collapsible) */}
        <div className="card-dark p-6 md:col-span-2" data-testid="cis-expenses-section">
          <button
            onClick={() => setSettings((s) => ({ ...s, expensesOpen: !s.expensesOpen }))}
            className="w-full flex items-center justify-between gap-2 text-left"
            data-testid="cis-expenses-toggle"
          >
            <div>
              <div className="text-xs uppercase tracking-widest text-[#E8A020]">Add Your Expenses</div>
              <div className="text-sm text-[#A19D94] mt-1">
                These reduce your taxable profit and can significantly increase your estimated refund.
                Add what you can — you can always update this later.
              </div>
            </div>
            <div className="text-[#A19D94] flex items-center gap-3 flex-shrink-0">
              <span className="text-[10px] uppercase tracking-widest">Total {fGBP(expensesTotal)}</span>
              {settings.expensesOpen ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
            </div>
          </button>

          {settings.expensesOpen && (
            <div className="mt-4 grid sm:grid-cols-2 gap-3" data-testid="cis-expenses-grid">
              <ExpenseField
                label="Tools and Equipment (£)"
                testId="cis-expense-tools"
                value={settings.expenses.tools}
                onChange={(v) => setSettings((s) => ({ ...s, expenses: { ...s.expenses, tools: v } }))}
              />
              <ExpenseField
                label="Fuel and Mileage (£)"
                testId="cis-expense-fuel"
                helper="Pulled automatically from your Mileage Tracker if logged there, or enter manually."
                value={settings.expenses.fuel}
                onChange={(v) => setSettings((s) => ({ ...s, expenses: { ...s.expenses, fuel: v } }))}
              />
              <ExpenseField
                label="PPE and Workwear (£)"
                testId="cis-expense-ppe"
                value={settings.expenses.ppe}
                onChange={(v) => setSettings((s) => ({ ...s, expenses: { ...s.expenses, ppe: v } }))}
              />
              <ExpenseField
                label="Insurance (£)"
                testId="cis-expense-insurance"
                helper="e.g. public liability, tool insurance"
                value={settings.expenses.insurance}
                onChange={(v) => setSettings((s) => ({ ...s, expenses: { ...s.expenses, insurance: v } }))}
              />
              <ExpenseField
                label="Accountancy and Professional Fees (£)"
                testId="cis-expense-accountancy"
                value={settings.expenses.accountancy}
                onChange={(v) => setSettings((s) => ({ ...s, expenses: { ...s.expenses, accountancy: v } }))}
              />
              <ExpenseField
                label="Phone and Office Costs (£)"
                testId="cis-expense-phone"
                value={settings.expenses.phone}
                onChange={(v) => setSettings((s) => ({ ...s, expenses: { ...s.expenses, phone: v } }))}
              />
              <ExpenseField
                label="Training and CSCS Cards (£)"
                testId="cis-expense-training"
                value={settings.expenses.training}
                onChange={(v) => setSettings((s) => ({ ...s, expenses: { ...s.expenses, training: v } }))}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <ExpenseField
                  label="Other Allowable Expenses (£)"
                  testId="cis-expense-other-amount"
                  value={settings.expenses.otherAmount}
                  onChange={(v) => setSettings((s) => ({ ...s, expenses: { ...s.expenses, otherAmount: v } }))}
                />
                <label className="block">
                  <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">Description</div>
                  <input
                    type="text"
                    className="input-base"
                    placeholder="What is this expense?"
                    value={settings.expenses.otherDescription}
                    onChange={(e) => setSettings((s) => ({ ...s, expenses: { ...s.expenses, otherDescription: e.target.value } }))}
                    data-testid="cis-expense-other-description"
                  />
                </label>
              </div>
              <div
                className="sm:col-span-2 mt-1 p-3 rounded flex items-center justify-between"
                style={{ background: "rgba(232,160,32,0.06)", border: "1px solid rgba(232,160,32,0.25)" }}
                data-testid="cis-expenses-total"
              >
                <div className="text-xs uppercase tracking-widest text-[#A19D94]">Total expenses</div>
                <div className="font-display text-2xl text-[#E8A020]">{fGBP(expensesTotal)}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* TABLE */}
      <div className="card-dark p-6" data-testid="cis-payments-card">
        <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4">Logged payments — tax year {currentTaxYearLabel()} ({ytdItems.length})</div>
        {loading ? <div className="text-sm text-[#706D66]">Loading…</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="cis-table">
              <thead className="text-[#706D66] text-xs uppercase tracking-widest">
                <tr>
                  <th className="text-left py-2">Date</th>
                  <th className="text-left">Contractor</th>
                  <th className="text-right">Gross labour</th>
                  <th className="text-right">Materials</th>
                  <th className="text-right">CIS rate</th>
                  <th className="text-right">CIS deducted</th>
                  <th className="text-right">Net received</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ytdItems.length === 0 && (
                  <tr><td colSpan={8} className="py-6 text-center text-[#706D66] italic">No payments logged this tax year.</td></tr>
                )}
                {ytdItems.map(p => editingId === p.id ? (
                  <tr key={p.id} className="border-t border-[#F0EDE8]/5 bg-[#0a0a0a]" data-testid={`cis-row-${p.id}-edit`}>
                    <td className="py-2"><input type="date" className="input-base !py-1 !text-xs" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} data-testid={`cis-edit-date-${p.id}`} /></td>
                    <td><input type="text" className="input-base !py-1 !text-xs" value={editForm.contractor} onChange={(e) => setEditForm({ ...editForm, contractor: e.target.value })} data-testid={`cis-edit-contractor-${p.id}`} /></td>
                    <td><input type="number" className="input-base !py-1 !text-xs text-right" value={editForm.grossLabour} onChange={(e) => setEditForm({ ...editForm, grossLabour: e.target.value })} data-testid={`cis-edit-grosslabour-${p.id}`} /></td>
                    <td><input type="number" className="input-base !py-1 !text-xs text-right" value={editForm.materials} onChange={(e) => setEditForm({ ...editForm, materials: e.target.value })} data-testid={`cis-edit-materials-${p.id}`} /></td>
                    <td>
                      <select className="input-base !py-1 !text-xs" value={editForm.cisRate} onChange={(e) => setEditForm({ ...editForm, cisRate: parseFloat(e.target.value) })} data-testid={`cis-edit-rate-${p.id}`}>
                        <option value={0.20}>20%</option>
                        <option value={0.30}>30%</option>
                        <option value={0}>0%</option>
                      </select>
                    </td>
                    <td className="text-right text-[#A19D94] text-xs">auto</td>
                    <td className="text-right text-[#A19D94] text-xs">auto</td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={saveEdit} className="text-[#E8A020] hover:text-[#F0EDE8] p-1" title="Save" data-testid={`cis-edit-save-${p.id}`}><Check size={14}/></button>
                        <button onClick={cancelEdit} className="text-[#A19D94] hover:text-[#F0EDE8] p-1" title="Cancel" data-testid={`cis-edit-cancel-${p.id}`}><X size={14}/></button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id} className="border-t border-[#F0EDE8]/5" data-testid={`cis-row-${p.id}`}>
                    <td className="py-2">{p.date}</td>
                    <td>{p.contractor}</td>
                    <td className="text-right">{fGBP(p.grossLabour ?? p.gross)}</td>
                    <td className="text-right">{fGBP(p.materials)}</td>
                    <td className="text-right">{Math.round((p.cisRate || 0) * 100)}%</td>
                    <td className="text-right text-[#E8A020]">{fGBP(p.deduction)}</td>
                    <td className="text-right">{fGBP(p.net)}</td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => startEdit(p)} className="text-[#A19D94] hover:text-[#E8A020] p-1" title="Edit" data-testid={`cis-edit-${p.id}`}><Pencil size={14}/></button>
                        <button onClick={() => onDelete(p.id)} className="text-[#706D66] hover:text-red-400 p-1" title="Delete" data-testid={`cis-delete-${p.id}`}><Trash2 size={14}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent, small, testId }) {
  return (
    <div data-testid={testId}>
      <div className="text-[10px] uppercase tracking-widest text-[#706D66]">{label}</div>
      <div className={`font-display ${small ? "text-lg" : "text-2xl"} mt-1`} style={{ color: accent ? "#E8A020" : "#F0EDE8" }}>{value}</div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", testId, placeholder }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="input-base" data-testid={testId} />
    </label>
  );
}

function ExpenseField({ label, value, onChange, helper, testId }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <input
        type="number"
        className="input-base"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        data-testid={testId}
      />
      {helper && <div className="text-[10px] text-[#706D66] mt-1 leading-relaxed">{helper}</div>}
    </label>
  );
}

function RateButton({ active, onClick, label, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-2 rounded text-xs uppercase tracking-widest transition"
      style={{
        background: active ? "rgba(232,160,32,0.12)" : "transparent",
        border: `1px solid ${active ? "#E8A020" : "rgba(160,157,148,0.25)"}`,
        color: active ? "#E8A020" : "#A19D94",
      }}
      data-testid={testId}
    >{label}</button>
  );
}

function ToggleBtn({ active, onClick, label, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-2 rounded text-xs uppercase tracking-widest transition"
      style={{
        background: active ? "rgba(232,160,32,0.12)" : "transparent",
        border: `1px solid ${active ? "#E8A020" : "rgba(160,157,148,0.25)"}`,
        color: active ? "#E8A020" : "#A19D94",
      }}
      data-testid={testId}
    >{label}</button>
  );
}

function CalcRow({ label, value, accent, strong }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#A19D94]">{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : ""}`} style={{ color: accent ? "#E8A020" : "#F0EDE8" }}>{value}</span>
    </div>
  );
}
