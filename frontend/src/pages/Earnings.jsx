import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { PoundSterling, TrendingUp, FileText, Wallet, PiggyBank, AlertCircle, BarChart3, Plus, Trash2, Receipt, Car } from "lucide-react";
import { toast } from "sonner";
import {
  thisTaxYear, aggregateCis, refundCalc, taxPotFor, fGBP, currentTaxYearLabel,
  EXPENSE_CATEGORIES, taxYearStartIso,
} from "../lib/finance";

const isoToday = () => new Date().toISOString().slice(0, 10);

export default function Earnings() {
  const [cis, setCis] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [mileageItems, setMileageItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem("morris_mileage") || "[]"); } catch { return []; }
  });
  const [expForm, setExpForm] = useState({ date: isoToday(), category: "tools", description: "", amount: "" });
  const [busy, setBusy] = useState(false);

  const loadCis = () => api.get("/cis/payments").then(r => setCis(r.data)).catch(() => {});
  const loadExp = () => api.get("/expenses").then(r => setExpenses(r.data)).catch(() => {});

  useEffect(() => {
    loadCis();
    loadExp();
    // Re-read mileage in case the Mileage Tracker added something while we were elsewhere
    try { setMileageItems(JSON.parse(localStorage.getItem("morris_mileage") || "[]")); } catch { /* ignore */ }
  }, []);

  // Tax-year filter everything
  const ytdCis = useMemo(() => thisTaxYear(cis), [cis]);
  const ytdExp = useMemo(() => thisTaxYear(expenses), [expenses]);
  const ytdMileage = useMemo(() => {
    const startIso = taxYearStartIso();
    return (mileageItems || []).filter(m => (m.date || "") >= startIso);
  }, [mileageItems]);

  const totals = aggregateCis(ytdCis);

  // Mileage auto-feeds expenses (claim total of all journeys this tax year)
  const mileageClaimTotal = ytdMileage.reduce((a, j) => a + (Number(j.claim) || 0), 0);

  const manualExpenseTotal = ytdExp.reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const totalExpensesYtd = manualExpenseTotal + mileageClaimTotal;

  // 6-step refund calc per spec (uses Materials YTD from CIS, NOT manual expenses)
  const calc = refundCalc({
    grossLabourYtd: totals.grossLabour,
    materialsYtd: totals.materials,
    cisDeductedYtd: totals.deduction,
  });

  const taxPot = taxPotFor(totals.net);

  // Monthly chart: gross labour by month
  const monthlyGross = useMemo(() => {
    const buckets = Array(12).fill(0);
    for (const p of ytdCis) {
      if (!p.date) continue;
      const d = new Date(p.date);
      const m = d.getMonth();
      if (m >= 0 && m <= 11) buckets[m] += Number(p.grossLabour ?? p.gross ?? 0);
    }
    return buckets;
  }, [ytdCis]);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const maxMonth = Math.max(...monthlyGross, 1);

  const addExpense = async (e) => {
    e.preventDefault();
    const amt = parseFloat(expForm.amount || 0) || 0;
    if (amt <= 0) { toast.error("Enter an amount above zero"); return; }
    setBusy(true);
    try {
      await api.post("/expenses", { ...expForm, amount: amt });
      setExpForm({ date: isoToday(), category: "tools", description: "", amount: "" });
      loadExp();
      toast.success("Expense logged");
    } catch {
      toast.error("Could not save expense");
    } finally { setBusy(false); }
  };

  const removeExpense = async (id) => {
    try { await api.delete(`/expenses/${id}`); loadExp(); }
    catch (e) { if (process.env.NODE_ENV !== "production") console.error("Expense delete failed", e); }
  };

  // Category breakdown for display
  const byCategory = useMemo(() => {
    const out = {};
    for (const e of ytdExp) {
      out[e.category] = (out[e.category] || 0) + Number(e.amount || 0);
    }
    if (mileageClaimTotal > 0) out.mileage = (out.mileage || 0) + mileageClaimTotal;
    return out;
  }, [ytdExp, mileageClaimTotal]);

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid="page-earnings">
      <div className="mb-8">
        <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Finance · Tax year {currentTaxYearLabel()}</div>
        <h1 className="font-display text-4xl md:text-5xl">Earnings Dashboard</h1>
        <p className="text-[#A19D94] mt-2">Running totals from 6 April. Resets on its own every year.</p>
      </div>

      {/* TOP STATS — Gross Labour YTD + Materials YTD separately */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card label="Gross labour YTD" value={fGBP(totals.grossLabour)} icon={<PoundSterling size={16}/>} testId="earn-gross-labour" />
        <Card label="Materials YTD" value={fGBP(totals.materials)} icon={<Receipt size={16}/>} testId="earn-materials" />
        <Card label="CIS deducted YTD" value={fGBP(totals.deduction)} icon={<TrendingUp size={16}/>} accent testId="earn-deduction" />
        <Card label="Net cash received" value={fGBP(totals.net)} icon={<Wallet size={16}/>} testId="earn-net" />
      </div>

      {/* TAX POT — 8% of net cash */}
      <div className="card-dark p-6 mb-6" data-testid="earn-tax-pot-card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#E8A020] mb-2 flex items-center gap-2"><PiggyBank size={14}/> Tax pot to set aside</div>
            <div className="font-display text-5xl text-[#E8A020]" data-testid="earn-tax-pot-value">{fGBP(taxPot)}</div>
          </div>
        </div>
        <p className="text-xs text-[#A19D94] mt-3 max-w-2xl leading-relaxed">
          We recommend putting 8% of your take-home cash into a separate pot. This covers your end-of-year National Insurance without leaving you short during the week.
        </p>
      </div>

      {/* 6-STEP CALC BREAKDOWN */}
      <div className="card-dark p-6 mb-6">
        <div className="text-[10px] uppercase tracking-widest text-[#E8A020] mb-4">Refund calc — live</div>
        <div className="grid md:grid-cols-3 gap-4 mb-4">
          <CalcStep n={1} label="Taxable profit" sub="Gross labour minus materials" value={fGBP(calc.taxableProfit)} />
          <CalcStep n={2} label="Taxable income" sub="Profit minus £12,570 personal allowance" value={fGBP(calc.taxableIncome)} />
          <CalcStep n={3} label="Income tax (20%)" value={fGBP(calc.incomeTax)} />
          <CalcStep n={4} label="Class 4 NI (6%)" sub="On profit above £12,570" value={fGBP(calc.class4Ni)} />
          <CalcStep n={5} label="Total liability" sub="Income tax + NI" value={fGBP(calc.totalLiability)} />
          <CalcStep n={6} label={calc.delta >= 0 ? "Estimated refund" : "Estimated tax owed"} sub="CIS deducted minus total liability" value={fGBP(Math.abs(calc.delta))} accent={calc.delta >= 0} warn={calc.delta < 0} />
        </div>
        {calc.delta < 0 && (
          <div className="p-3 rounded text-sm flex items-start gap-2" style={{ background: "rgba(232,160,32,0.08)", border: "1px solid rgba(232,160,32,0.35)", color: "#E8A020" }} data-testid="earn-tax-owed-warning">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>Based on your earnings so far you may owe {fGBP(Math.abs(calc.delta))} on 31 January. Set this aside now.</span>
          </div>
        )}
      </div>

      {/* ALLOWABLE EXPENSES */}
      <div className="card-dark p-6 mb-6" data-testid="earn-expenses-section">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#E8A020] mb-2">Allowable expenses YTD</div>
            <div className="font-display text-4xl">{fGBP(totalExpensesYtd)}</div>
          </div>
          <div className="text-xs text-[#A19D94] text-right">
            Manual: {fGBP(manualExpenseTotal)}<br/>
            Mileage (auto): {fGBP(mileageClaimTotal)}
          </div>
        </div>

        <p className="text-xs text-[#706D66] mb-4">Mileage feeds in automatically from the Mileage Tracker.</p>

        {/* Quick log a new expense */}
        <form onSubmit={addExpense} className="grid grid-cols-1 md:grid-cols-[120px_140px_1fr_120px_auto] gap-2 mb-4">
          <input type="date" className="input-base" value={expForm.date} onChange={(e) => setExpForm({ ...expForm, date: e.target.value })} data-testid="exp-date" />
          <select className="input-base" value={expForm.category} onChange={(e) => setExpForm({ ...expForm, category: e.target.value })} data-testid="exp-category">
            {EXPENSE_CATEGORIES.filter(c => c.id !== "mileage").map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <input className="input-base" placeholder="Description (optional)" value={expForm.description} onChange={(e) => setExpForm({ ...expForm, description: e.target.value })} data-testid="exp-description" />
          <input type="number" step="0.01" className="input-base" placeholder="£" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} data-testid="exp-amount" />
          <button disabled={busy} className="btn-primary flex items-center justify-center gap-2" data-testid="exp-add"><Plus size={14}/> Add</button>
        </form>

        {/* Category breakdown */}
        {Object.keys(byCategory).length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-4" data-testid="exp-category-breakdown">
            {EXPENSE_CATEGORIES.map(c => {
              const v = byCategory[c.id] || 0;
              if (v <= 0) return null;
              return (
                <div key={c.id} className="p-3 rounded" style={{ background: "rgba(232,160,32,0.04)", border: "1px solid rgba(160,157,148,0.15)" }}>
                  <div className="text-[10px] uppercase tracking-widest text-[#A19D94] flex items-center gap-1">
                    {c.id === "mileage" ? <Car size={11} className="text-[#E8A020]" /> : null} {c.label}
                  </div>
                  <div className="font-display text-lg text-[#F0EDE8] mt-1">{fGBP(v)}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Itemised list */}
        <div className="border-t border-[#1a1a1a] pt-4" data-testid="exp-list">
          {ytdExp.length === 0 ? (
            <div className="text-sm text-[#706D66] italic">No expenses logged this tax year.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[#706D66] text-xs uppercase tracking-widest">
                  <tr><th className="text-left py-1">Date</th><th className="text-left">Category</th><th className="text-left">Description</th><th className="text-right">Amount</th><th></th></tr>
                </thead>
                <tbody>
                  {ytdExp.map(e => (
                    <tr key={e.id} className="border-t border-[#F0EDE8]/5">
                      <td className="py-2">{e.date}</td>
                      <td className="capitalize">{e.category}</td>
                      <td className="text-[#A19D94]">{e.description || "—"}</td>
                      <td className="text-right">{fGBP(e.amount)}</td>
                      <td><button onClick={() => removeExpense(e.id)} className="text-[#706D66] hover:text-red-400" data-testid={`exp-delete-${e.id}`}><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* MONTHLY CHART */}
      <div className="card-dark p-6 mb-6" data-testid="earn-monthly-chart">
        <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4 flex items-center gap-2"><BarChart3 size={14}/> Gross labour by month — this tax year</div>
        {totals.grossLabour === 0 ? (
          <div className="text-sm text-[#706D66] italic">No payments yet. Log one in the CIS Refund Predictor.</div>
        ) : (
          <div className="grid grid-cols-12 gap-2 items-end h-40">
            {MONTHS.map((m, i) => {
              const v = monthlyGross[i];
              const h = Math.round((v / maxMonth) * 100);
              return (
                <div key={m} className="flex flex-col items-center justify-end gap-1">
                  <div className="text-[10px] text-[#706D66] tabular-nums">{v > 0 ? `£${Math.round(v)}` : ""}</div>
                  <div className="w-full bg-[#E8A020]/15 rounded-t" style={{ height: `${h}%`, minHeight: v > 0 ? "4px" : "0" }} />
                  <div className="text-[10px] text-[#A19D94] mt-1">{m}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-[#706D66] max-w-3xl">
        This is a guide only. Based on your logged payments, personal allowance of £12,570, 20% income tax and 6% Class 4 NI. Not a tax return. Speak to an accountant for your final figures.
      </p>
    </div>
  );
}

function Card({ label, value, icon, accent, warn, testId }) {
  const colour = warn ? "#E5635A" : (accent ? "#E8A020" : "#F0EDE8");
  return (
    <div className="card-dark p-5" data-testid={testId}>
      <div className={`text-[10px] uppercase tracking-widest mb-2 flex items-center gap-2 ${accent ? "text-[#E8A020]" : warn ? "text-[#E5635A]" : "text-[#A19D94]"}`}>{icon}{label}</div>
      <div className="font-display text-3xl" style={{ color: colour }}>{value}</div>
    </div>
  );
}

function CalcStep({ n, label, sub, value, accent, warn }) {
  return (
    <div className="p-4 rounded" style={{ background: "rgba(232,160,32,0.04)", border: "1px solid rgba(160,157,148,0.18)" }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded text-[#0A0A0A] bg-[#E8A020] font-bold">{n}</span>
        <span className="text-[10px] uppercase tracking-widest text-[#A19D94]">{label}</span>
      </div>
      <div className="font-display text-2xl" style={{ color: warn ? "#E5635A" : accent ? "#E8A020" : "#F0EDE8" }}>{value}</div>
      {sub && <div className="text-[10px] text-[#706D66] mt-1">{sub}</div>}
    </div>
  );
}
