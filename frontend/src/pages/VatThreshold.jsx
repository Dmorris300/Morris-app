import { useState } from "react";

export default function VatThreshold() {
  const [turnover, setTurnover] = useState(() => {
    try { return parseFloat(localStorage.getItem("morris_vat_turnover") || "0"); } catch { return 0; }
  });
  const threshold = 90000;
  const pct = Math.min(100, (turnover / threshold) * 100);
  const remaining = Math.max(0, threshold - turnover);

  const onChange = (v) => {
    setTurnover(v);
    localStorage.setItem("morris_vat_turnover", String(v));
  };

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto" data-testid="page-vat">
      <div className="mb-8">
        <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Finance</div>
        <h1 className="font-display text-4xl md:text-5xl">VAT Threshold Advisor</h1>
        <p className="text-[#A19D94] mt-2">UK VAT registration threshold is <strong>£90,000</strong> rolling 12-month turnover.</p>
      </div>

      <div className="card-dark p-8">
        <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">Your rolling 12-month turnover (£)</div>
        <input type="number" className="input-base mb-6" value={turnover} onChange={(e) => onChange(parseFloat(e.target.value || 0))} data-testid="vat-turnover" />

        <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-2">Progress to threshold</div>
        <div className="w-full h-4 bg-[#1A1A1A] rounded-full overflow-hidden">
          <div className="h-full gold-gradient transition-all" style={{ width: `${pct}%` }} data-testid="vat-progress-bar" />
        </div>
        <div className="flex justify-between text-xs text-[#A19D94] mt-2">
          <span>£{turnover.toLocaleString("en-GB")}</span>
          <span>£{threshold.toLocaleString("en-GB")}</span>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-6">
          <div>
            <div className="text-xs uppercase tracking-widest text-[#706D66]">Remaining headroom</div>
            <div className="font-display text-4xl">£{remaining.toLocaleString("en-GB")}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-[#706D66]">Status</div>
            <div className="font-display text-2xl">{turnover >= threshold ? <span className="text-red-400">Register for VAT</span> : pct > 80 ? <span className="text-[#E8A020]">Approaching</span> : <span className="text-green-500">Below threshold</span>}</div>
          </div>
        </div>

        <p className="mt-6 text-xs text-[#706D66]">Note: if your taxable turnover exceeds £90,000 in any rolling 12-month period — or you expect to in the next 30 days — you must register for VAT. Voluntary registration available below the threshold.</p>
      </div>
    </div>
  );
}
