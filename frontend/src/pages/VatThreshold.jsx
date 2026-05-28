import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";

const THRESHOLD = 90000;
const DEREG_THRESHOLD = 88000;

// Rolling 12-month tracker: store monthly turnover values by YYYY-MM key in localStorage
function loadMonthly() {
  try {
    const raw = localStorage.getItem("morris_vat_monthly_v2");
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveMonthly(data) {
  localStorage.setItem("morris_vat_monthly_v2", JSON.stringify(data));
}

function last12Months() {
  const out = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
    out.push({ key, label });
  }
  return out;
}

export default function VatThreshold() {
  const [monthly, setMonthly] = useState(loadMonthly);
  const months = useMemo(() => last12Months(), []);

  const rolling = months.reduce((sum, m) => sum + (Number(monthly[m.key]) || 0), 0);
  const pct = Math.min(100, (rolling / THRESHOLD) * 100);
  const remaining = Math.max(0, THRESHOLD - rolling);
  const peakMonth = Math.max(...months.map(m => Number(monthly[m.key]) || 0), 1);

  // Status
  let status, statusLabel, statusIcon;
  if (rolling >= THRESHOLD) {
    status = "over"; statusLabel = "Must register for VAT"; statusIcon = <AlertCircle size={16}/>;
  } else if (rolling >= 0.85 * THRESHOLD) {
    status = "warn"; statusLabel = "Within 15% of threshold"; statusIcon = <AlertTriangle size={16}/>;
  } else {
    status = "ok"; statusLabel = "Comfortably below threshold"; statusIcon = <CheckCircle2 size={16}/>;
  }

  // Project months remaining at current run rate
  const past3 = months.slice(-3).reduce((s, m) => s + (Number(monthly[m.key]) || 0), 0);
  const avgRunRate = past3 / 3;
  const monthsToBreach = avgRunRate > 0 ? Math.ceil(remaining / avgRunRate) : null;

  const setMonth = (key, value) => {
    const next = { ...monthly, [key]: parseFloat(value || 0) };
    setMonthly(next);
    saveMonthly(next);
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto" data-testid="page-vat">
      <div className="mb-8">
        <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Finance</div>
        <h1 className="font-display text-4xl md:text-5xl">VAT Threshold Advisor</h1>
        <p className="text-[#A19D94] mt-2">UK VAT registration threshold is <strong>£90,000</strong> rolling 12-month turnover. Log each month below and Morris keeps a live running total.</p>
      </div>

      {/* Top summary */}
      <div className="card-dark p-6 md:p-8 mb-6">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-[#A19D94]">Rolling 12-month turnover</div>
            <div className="font-display text-5xl md:text-6xl text-[#F0EDE8]" data-testid="vat-rolling">£{rolling.toLocaleString("en-GB", { maximumFractionDigits: 0 })}</div>
          </div>
          <StatusPill status={status} label={statusLabel} icon={statusIcon} />
        </div>

        <div className="w-full h-3 bg-[#1A1A1A] rounded-full overflow-hidden">
          <div
            className="h-full transition-all"
            style={{
              width: `${pct}%`,
              background: status === "over" ? "#E5635A" : status === "warn" ? "#E8A020" : "linear-gradient(90deg, #5BC97A, #E8A020)",
            }}
            data-testid="vat-progress-bar"
          />
        </div>
        <div className="flex justify-between text-[10px] text-[#706D66] mt-1.5">
          <span>£0</span>
          <span>£{THRESHOLD.toLocaleString("en-GB")}</span>
        </div>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-4">
          <Mini label="Remaining headroom" value={`£${remaining.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`} />
          <Mini label="3-month run rate" value={`£${Math.round(avgRunRate).toLocaleString("en-GB")}/mo`} />
          <Mini
            label="Projected months to breach"
            value={status === "over" ? "Breached" : (monthsToBreach && monthsToBreach > 0 ? `${monthsToBreach} mo` : "—")}
          />
        </div>
      </div>

      {/* Monthly entry grid */}
      <div className="card-dark p-6 mb-6">
        <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Enter your monthly taxable turnover (last 12 months)</div>
        <p className="text-xs text-[#706D66] mb-4">Include all standard-rated, reduced-rated and zero-rated sales. Exclude exempt sales and sales outside the scope.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3" data-testid="vat-month-grid">
          {months.map((m) => {
            const v = monthly[m.key] || "";
            const fill = Math.min(100, ((Number(v) || 0) / peakMonth) * 100);
            return (
              <div key={m.key} className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-[#A19D94]">{m.label}</label>
                <input
                  type="number"
                  className="input-base"
                  placeholder="£0"
                  value={v}
                  onChange={(e) => setMonth(m.key, e.target.value)}
                  data-testid={`vat-month-${m.key}`}
                />
                <div className="h-1 bg-[#1A1A1A] rounded-full overflow-hidden">
                  <div className="h-full bg-[#E8A020]/40" style={{ width: `${fill}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card-dark p-6 text-xs text-[#A19D94] space-y-3" data-testid="vat-help">
        <div className="text-[#E8A020] uppercase tracking-widest text-xs">What this means</div>
        <p>If your taxable turnover exceeds £90,000 in any rolling 12-month period, OR you expect to in the next 30 days, you MUST register for VAT with HMRC within 30 days.</p>
        <p>De-registration threshold: £{DEREG_THRESHOLD.toLocaleString("en-GB")}. If your rolling turnover falls below this and you expect it to stay there, you can apply to de-register.</p>
        <p>Voluntary registration is available below the threshold — useful if most of your customers are VAT-registered businesses and you have significant input VAT to reclaim.</p>
        <p>Domestic Reverse Charge: if you're VAT-registered and your customer is a CIS-registered contractor, the customer accounts for the VAT. Check your CIS invoices reflect this.</p>
      </div>
    </div>
  );
}

function StatusPill({ status, label, icon }) {
  const map = {
    over:  { fg: "#E5635A", border: "rgba(229,99,90,0.4)",  bg: "rgba(229,99,90,0.08)" },
    warn:  { fg: "#E8A020", border: "rgba(232,160,32,0.4)", bg: "rgba(232,160,32,0.08)" },
    ok:    { fg: "#5BC97A", border: "rgba(91,201,122,0.35)", bg: "rgba(91,201,122,0.07)" },
  };
  const s = map[status] || map.ok;
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
      style={{ color: s.fg, border: `1px solid ${s.border}`, background: s.bg }}
      data-testid="vat-status-pill"
    >
      {icon}
      {label}
    </div>
  );
}

function Mini({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-[#706D66] mb-1">{label}</div>
      <div className="font-display text-2xl text-[#F0EDE8]">{value}</div>
    </div>
  );
}
