import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { PoundSterling, TrendingUp, FileText, Wallet, PiggyBank, AlertCircle, BarChart3 } from "lucide-react";

// 2025/26 UK tax bands (simplified for self-employed sole traders / CIS subbies)
const PERSONAL_ALLOWANCE = 12570;
const BASIC_RATE = 0.20;
const HIGHER_BAND_START = 50270;
const HIGHER_RATE = 0.40;
const ADDITIONAL_BAND_START = 125140;
const ADDITIONAL_RATE = 0.45;
// Class 4 NI (self-employed) 2025/26
const NI_LOWER = 12570;
const NI_UPPER = 50270;
const NI_BASIC = 0.06;
const NI_HIGHER = 0.02;
// Tax pot recommended set-aside (Prompt 7)
const TAX_POT_RATE = 0.23;

function calcIncomeTax(taxableProfit) {
  if (taxableProfit <= 0) return 0;
  const overPA = Math.max(0, taxableProfit - PERSONAL_ALLOWANCE);
  if (overPA === 0) return 0;
  const basicPortion = Math.min(overPA, HIGHER_BAND_START - PERSONAL_ALLOWANCE) * BASIC_RATE;
  const higherPortion = Math.max(0, Math.min(overPA, ADDITIONAL_BAND_START - PERSONAL_ALLOWANCE) - (HIGHER_BAND_START - PERSONAL_ALLOWANCE)) * HIGHER_RATE;
  const additionalPortion = Math.max(0, overPA - (ADDITIONAL_BAND_START - PERSONAL_ALLOWANCE)) * ADDITIONAL_RATE;
  return basicPortion + higherPortion + additionalPortion;
}

function calcNI(profit) {
  if (profit <= NI_LOWER) return 0;
  const basicPortion = Math.min(profit, NI_UPPER) - NI_LOWER;
  const higherPortion = Math.max(0, profit - NI_UPPER);
  return basicPortion * NI_BASIC + higherPortion * NI_HIGHER;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function Earnings() {
  const [cis, setCis] = useState([]);
  const [expenses, setExpenses] = useState(() => {
    try { return JSON.parse(localStorage.getItem("morris_expenses") || "0"); } catch { return 0; }
  });

  useEffect(() => {
    api.get("/cis/payments").then(r => setCis(r.data)).catch(() => {});
  }, []);

  const gross = cis.reduce((a, x) => a + (x.gross || 0), 0);
  const deduction = cis.reduce((a, x) => a + (x.deduction || 0), 0);
  const net = cis.reduce((a, x) => a + (x.net || 0), 0);
  const taxableProfit = Math.max(0, gross - (Number(expenses) || 0));
  const incomeTax = calcIncomeTax(taxableProfit);
  const ni = calcNI(taxableProfit);
  const totalTaxOwed = incomeTax + ni;
  const cisRefund = Math.max(0, deduction - totalTaxOwed);
  const balanceOwed = Math.max(0, totalTaxOwed - deduction);
  const taxPot = net * TAX_POT_RATE;
  const trueTakeHome = gross - (Number(expenses) || 0) - totalTaxOwed + (cisRefund > 0 ? cisRefund : 0);

  // Monthly breakdown
  const monthlyGross = useMemo(() => {
    const buckets = Array(12).fill(0);
    const bucketsDeduction = Array(12).fill(0);
    for (const p of cis) {
      if (!p.date) continue;
      const m = new Date(p.date).getMonth();
      if (m >= 0 && m <= 11) {
        buckets[m] += (p.gross || 0);
        bucketsDeduction[m] += (p.deduction || 0);
      }
    }
    return { gross: buckets, deduction: bucketsDeduction };
  }, [cis]);
  const maxMonth = Math.max(...monthlyGross.gross, 1);

  const saveExpenses = (v) => {
    setExpenses(v);
    localStorage.setItem("morris_expenses", JSON.stringify(v));
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid="page-earnings">
      <div className="mb-8">
        <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Finance</div>
        <h1 className="font-display text-4xl md:text-5xl">Earnings Dashboard</h1>
        <p className="text-[#A19D94] mt-2">Year-to-date summary based on your logged CIS payments. Set your allowable expenses for a realistic tax estimate.</p>
      </div>

      {/* Top stats */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card label="Gross income" value={`£${gross.toFixed(2)}`} icon={<PoundSterling size={18}/>} testId="earn-gross" />
        <Card label="CIS deducted" value={`£${deduction.toFixed(2)}`} icon={<TrendingUp size={18}/>} accent testId="earn-deduction" />
        <Card label="Net received" value={`£${net.toFixed(2)}`} icon={<Wallet size={18}/>} testId="earn-net" />
        <Card label="Tax pot to set aside" value={`£${taxPot.toFixed(2)}`} icon={<PiggyBank size={18}/>} sub="23% of net" testId="earn-taxpot" />
      </div>

      {/* Expenses input */}
      <div className="card-dark p-6 mb-6">
        <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Allowable expenses YTD</div>
        <p className="text-xs text-[#706D66] mb-3 max-w-2xl">
          Tools, fuel, mileage (use the Mileage Tracker), PPE, training, insurance, accountant fees, phone, marketing, materials not recharged. Your taxable profit drops by this amount.
        </p>
        <input
          type="number"
          className="input-base"
          value={expenses}
          onChange={(e) => saveExpenses(parseFloat(e.target.value || 0))}
          placeholder="£0"
          data-testid="earn-expenses-input"
        />
      </div>

      {/* Tax estimate breakdown */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card label="Taxable profit" value={`£${taxableProfit.toFixed(2)}`} icon={<FileText size={18}/>} testId="earn-taxable" />
        <Card label="Income tax due" value={`£${incomeTax.toFixed(2)}`} icon={<AlertCircle size={18}/>} testId="earn-income-tax" />
        <Card label="Class 4 NI due" value={`£${ni.toFixed(2)}`} icon={<AlertCircle size={18}/>} testId="earn-ni" />
        <Card
          label={cisRefund > 0 ? "Likely CIS refund" : "Likely balance owed"}
          value={`£${(cisRefund > 0 ? cisRefund : balanceOwed).toFixed(2)}`}
          icon={<TrendingUp size={18}/>}
          accent={cisRefund > 0}
          warn={balanceOwed > 0}
          testId={cisRefund > 0 ? "earn-refund" : "earn-owed"}
        />
      </div>

      {/* Monthly breakdown chart */}
      <div className="card-dark p-6 mb-6" data-testid="earn-monthly-chart">
        <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4 flex items-center gap-2">
          <BarChart3 size={14}/> Monthly breakdown (current year)
        </div>
        {gross === 0 ? (
          <div className="text-sm text-[#706D66] italic">No CIS payments logged yet. Add them in the CIS Refund Predictor.</div>
        ) : (
          <div className="grid grid-cols-12 gap-2 items-end h-40">
            {MONTHS.map((m, i) => {
              const v = monthlyGross.gross[i];
              const h = Math.round((v / maxMonth) * 100);
              return (
                <div key={m} className="flex flex-col items-center justify-end gap-1" data-testid={`earn-month-${m.toLowerCase()}`}>
                  <div className="text-[10px] text-[#706D66] tabular-nums" title={`£${v.toFixed(2)}`}>{v > 0 ? `£${Math.round(v)}` : ""}</div>
                  <div className="w-full bg-[#E8A020]/15 rounded-t" style={{ height: `${h}%`, minHeight: v > 0 ? "4px" : "0" }} />
                  <div className="text-[10px] text-[#A19D94] mt-1">{m}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="mt-2 text-xs text-[#706D66] max-w-3xl">
        Estimate uses 2025/26 UK tax bands: Personal Allowance £12,570, 20% basic, 40% higher (over £50,270), 45% additional (over £125,140), plus Class 4 NI at 6% (£12,570–£50,270) and 2% above. This is for guidance only and is not tax advice. Always confirm with a qualified accountant before filing.
      </p>
    </div>
  );
}

function Card({ label, value, icon, accent, warn, sub, testId }) {
  const colour = warn ? "#E5635A" : (accent ? "#E8A020" : "#F0EDE8");
  return (
    <div className="card-dark p-6" data-testid={testId}>
      <div className={`text-xs uppercase tracking-widest mb-2 flex items-center gap-2 ${accent ? "text-[#E8A020]" : warn ? "text-[#E5635A]" : "text-[#A19D94]"}`}>{icon}{label}</div>
      <div className="font-display text-3xl md:text-4xl" style={{ color: colour }}>{value}</div>
      {sub && <div className="text-[10px] text-[#706D66] mt-1">{sub}</div>}
    </div>
  );
}
