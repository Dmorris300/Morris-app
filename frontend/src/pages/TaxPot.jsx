import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { PiggyBank, Plus, Trash2, AlertCircle, Calendar } from "lucide-react";
import { toast } from "sonner";
import { thisTaxYear, aggregateCis, taxPotFor, fGBP, currentTaxYearLabel } from "../lib/finance";

const SA_DEADLINE_MONTH = 0; // January
const SA_DEADLINE_DAY = 31;

function loadDeposits() {
  try { return JSON.parse(localStorage.getItem("morris_taxpot_deposits") || "[]"); } catch { return []; }
}
function saveDeposits(arr) {
  localStorage.setItem("morris_taxpot_deposits", JSON.stringify(arr));
}

function nextSADeadline() {
  const now = new Date();
  const thisYear = new Date(now.getFullYear(), SA_DEADLINE_MONTH, SA_DEADLINE_DAY);
  return now > thisYear ? new Date(now.getFullYear() + 1, SA_DEADLINE_MONTH, SA_DEADLINE_DAY) : thisYear;
}

export default function TaxPot() {
  const [cis, setCis] = useState([]);
  const [deposits, setDeposits] = useState(loadDeposits);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    api.get("/cis/payments").then(r => setCis(r.data)).catch(() => {});
  }, []);

  const ytdCis = thisTaxYear(cis);
  const totals = aggregateCis(ytdCis);
  const recommendedTaxPot = taxPotFor(totals.net);
  const totalDeposited = deposits.reduce((a, d) => a + (Number(d.amount) || 0), 0);
  const shortfall = Math.max(0, recommendedTaxPot - totalDeposited);
  const surplus = Math.max(0, totalDeposited - recommendedTaxPot);

  const deadline = useMemo(nextSADeadline, []);
  const daysToDeadline = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const requiredPerWeek = daysToDeadline > 0 ? shortfall / (daysToDeadline / 7) : 0;

  const addDeposit = () => {
    const v = parseFloat(amount);
    if (!v || v <= 0) { toast.error("Enter an amount above zero"); return; }
    const next = [...deposits, { id: Date.now(), amount: v, note, date: new Date().toISOString() }];
    setDeposits(next); saveDeposits(next); setAmount(""); setNote("");
    toast.success(`£${v.toFixed(2)} added to your tax pot`);
  };
  const removeDeposit = (id) => {
    const next = deposits.filter(d => d.id !== id);
    setDeposits(next); saveDeposits(next);
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto" data-testid="page-taxpot">
      <div className="mb-8">
        <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Finance · Tax year {currentTaxYearLabel()}</div>
        <h1 className="font-display text-4xl md:text-5xl flex items-center gap-3">
          <PiggyBank size={36} className="text-[#E8A020]" />
          Tax Pot
        </h1>
        <p className="text-[#A19D94] mt-2 max-w-2xl">
          We recommend putting 8% of your take-home cash into a separate pot. This covers your end-of-year National Insurance without leaving you short during the week.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <BigStat label="Recommended pot" value={fGBP(recommendedTaxPot)} sub="8% of net cash received YTD" accent testId="taxpot-recommended" />
        <BigStat label="Deposited so far" value={fGBP(totalDeposited)} sub={`${deposits.length} deposit${deposits.length === 1 ? "" : "s"}`} testId="taxpot-deposited" />
        <BigStat
          label={shortfall > 0 ? "Shortfall to cover" : "Surplus"}
          value={fGBP(shortfall > 0 ? shortfall : surplus)}
          sub={shortfall > 0 ? `${fGBP(requiredPerWeek)} per week to catch up` : "You're on track"}
          warn={shortfall > 0}
          ok={shortfall === 0}
          testId={shortfall > 0 ? "taxpot-shortfall" : "taxpot-surplus"}
        />
      </div>

      <div className="card-dark p-4 mb-6 flex items-center gap-3" style={{ borderColor: daysToDeadline < 60 ? "rgba(229,99,90,0.4)" : "rgba(232,160,32,0.25)" }} data-testid="taxpot-deadline-banner">
        <Calendar size={18} className="text-[#E8A020]" />
        <div className="text-sm">
          <div className="text-[#F0EDE8] font-semibold">Self Assessment deadline: {deadline.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</div>
          <div className="text-xs text-[#A19D94]">{daysToDeadline} day{daysToDeadline === 1 ? "" : "s"} from today. £100 fine kicks in the day after.</div>
        </div>
      </div>

      <div className="card-dark p-6 mb-6">
        <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Log a deposit to your tax pot</div>
        <p className="text-xs text-[#706D66] mb-4">Move money to a separate account every time you get paid. Log it here so Morris keeps your running total.</p>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-3">
          <input type="number" className="input-base" placeholder="Amount (£)" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="taxpot-amount-input" />
          <input className="input-base" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} data-testid="taxpot-note-input" />
          <button onClick={addDeposit} className="btn-primary flex items-center gap-2" data-testid="taxpot-add-btn"><Plus size={14} /> Add deposit</button>
        </div>
      </div>

      {recommendedTaxPot > 0 && (
        <div className="card-dark p-4 mb-6 text-xs text-[#A19D94] flex items-start gap-3" data-testid="taxpot-tip">
          <AlertCircle size={14} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
          <div>
            <span className="text-[#F0EDE8] font-semibold">Tip: </span>
            Set up a separate bank account. Every time you get paid, move 8% of the net over by standing order. By 31 January you'll have the bill covered.
          </div>
        </div>
      )}

      <div className="card-dark divide-y divide-[#1a1a1a]" data-testid="taxpot-log">
        {deposits.length === 0 ? (
          <div className="p-6 text-sm text-[#706D66] italic">No deposits yet. Add your first one above.</div>
        ) : deposits.slice().reverse().map(d => (
          <div key={d.id} className="p-4 flex items-center justify-between gap-3" data-testid={`taxpot-deposit-${d.id}`}>
            <div>
              <div className="font-display text-2xl text-[#F0EDE8]">{fGBP(d.amount)}</div>
              <div className="text-xs text-[#706D66] mt-1">{new Date(d.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}{d.note ? ` · ${d.note}` : ""}</div>
            </div>
            <button onClick={() => removeDeposit(d.id)} className="text-[#706D66] hover:text-[#E5635A] p-2" data-testid={`taxpot-remove-${d.id}`}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-[#706D66] max-w-3xl">
        This is a guide only. Based on your logged payments. Speak to an accountant for your final figures.
      </p>
    </div>
  );
}

function BigStat({ label, value, sub, accent, warn, ok, testId }) {
  const colour = warn ? "#E5635A" : ok ? "#5BC97A" : accent ? "#E8A020" : "#F0EDE8";
  return (
    <div className="card-dark p-6" data-testid={testId}>
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">{label}</div>
      <div className="font-display text-4xl" style={{ color: colour }}>{value}</div>
      <div className="text-[10px] text-[#706D66] mt-1">{sub}</div>
    </div>
  );
}
