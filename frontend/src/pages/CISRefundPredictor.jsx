import { useEffect, useState } from "react";
import api from "../lib/api";
import { toast } from "sonner";
import { Plus, Trash2, TrendingUp, Info, Star, X, AlertCircle } from "lucide-react";
import { useAuth } from "../lib/auth";
import {
  thisTaxYear, aggregateCis, refundCalc, fGBP, currentTaxYearLabel,
} from "../lib/finance";

const TOOL = {
  id: "cis-refund-predictor",
  name: "CIS Refund Predictor",
  section: "finance",
  info: "Log every CIS payment a contractor pays you. Morris splits labour from materials, calculates the deduction at the right rate, and tells you exactly what HMRC owes you back at year end.",
};

const isoToday = () => new Date().toISOString().slice(0, 10);

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
  const [loading, setLoading] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [busy, setBusy] = useState(false);

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

  // Tax-year filtered totals
  const ytdItems = thisTaxYear(items);
  const totals = aggregateCis(ytdItems);
  const calc = refundCalc({
    grossLabourYtd: totals.grossLabour,
    materialsYtd: totals.materials,
    cisDeductedYtd: totals.deduction,
  });

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
                This is a guide only. Based on your logged payments, personal allowance of £12,570, 20% income tax and 6% Class 4 NI. Not a tax return. Speak to an accountant for your final figures.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HEADLINE — refund or tax owed */}
      <div className="card-dark p-8 mb-6" data-testid="refund-summary">
        <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-2 flex items-center gap-2">
          <TrendingUp size={14} /> {calc.delta >= 0 ? "Estimated refund at year end" : "Estimated tax owed at year end"}
        </div>
        <div className="font-display text-6xl md:text-7xl" style={{ color: calc.delta >= 0 ? "#E8A020" : "#E5635A" }}>
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
          <Stat small label="Taxable profit" value={fGBP(calc.taxableProfit)} />
          <Stat small label="Income tax (20%)" value={fGBP(calc.incomeTax)} />
          <Stat small label="Class 4 NI (6%)" value={fGBP(calc.class4Ni)} />
          <Stat small label="Total liability" value={fGBP(calc.totalLiability)} />
        </div>
        <div className="text-xs text-[#706D66] mt-5 leading-relaxed">
          This is a guide only. Based on your logged payments, personal allowance of £12,570, 20% income tax and 6% Class 4 NI. Not a tax return. Speak to an accountant for your final figures.
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* LOG A CIS PAYMENT */}
        <form onSubmit={onAdd} className="card-dark p-6 md:col-span-1" data-testid="cis-form">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4">Log a CIS payment</div>
          <div className="space-y-3">
            <Input label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} testId="cis-date" />
            <Input label="Contractor" value={form.contractor} onChange={(v) => setForm({ ...form, contractor: v })} placeholder="Who paid you" testId="cis-contractor" />
            <Input label="Gross labour (£)" type="number" value={form.grossLabour} onChange={(v) => setForm({ ...form, grossLabour: v })} testId="cis-grosslabour" />
            <Input label="Materials (£)" type="number" value={form.materials} onChange={(v) => setForm({ ...form, materials: v })} testId="cis-materials" />

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

        {/* TABLE */}
        <div className="card-dark p-6 md:col-span-2">
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
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {ytdItems.length === 0 && (
                    <tr><td colSpan={8} className="py-6 text-center text-[#706D66] italic">No payments logged this tax year.</td></tr>
                  )}
                  {ytdItems.map(p => (
                    <tr key={p.id} className="border-t border-[#F0EDE8]/5">
                      <td className="py-2">{p.date}</td>
                      <td>{p.contractor}</td>
                      <td className="text-right">{fGBP(p.grossLabour ?? p.gross)}</td>
                      <td className="text-right">{fGBP(p.materials)}</td>
                      <td className="text-right">{Math.round((p.cisRate || 0) * 100)}%</td>
                      <td className="text-right text-[#E8A020]">{fGBP(p.deduction)}</td>
                      <td className="text-right">{fGBP(p.net)}</td>
                      <td><button onClick={() => onDelete(p.id)} className="text-[#706D66] hover:text-red-400" data-testid={`cis-delete-${p.id}`}><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent, small }) {
  return (
    <div>
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

function CalcRow({ label, value, accent, strong }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#A19D94]">{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : ""}`} style={{ color: accent ? "#E8A020" : "#F0EDE8" }}>{value}</span>
    </div>
  );
}
