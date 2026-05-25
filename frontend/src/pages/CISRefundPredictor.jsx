import { useEffect, useState } from "react";
import api from "../lib/api";
import { toast } from "sonner";
import { Plus, Trash2, TrendingUp, Info, Star, X } from "lucide-react";
import { useAuth } from "../lib/auth";

const TOOL = {
  id: "cis-refund-predictor",
  name: "CIS Refund Predictor",
  section: "finance",
  info: "Log every CIS payment a contractor pays you throughout the year. gross, deduction and net. Morris keeps a running total so you can see exactly how much HMRC owes you back at year end.",
};

export default function CISRefundPredictor() {
  const { user, refresh } = useAuth();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), contractor: "", gross: "", deduction: "", net: "", notes: "" });
  const [loading, setLoading] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);

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

  const onAdd = async (e) => {
    e.preventDefault();
    const gross = parseFloat(form.gross || 0);
    const deduction = parseFloat(form.deduction || 0);
    const net = parseFloat(form.net || (gross - deduction));
    try {
      await api.post("/cis/payments", { ...form, gross, deduction, net });
      setForm({ date: new Date().toISOString().slice(0, 10), contractor: "", gross: "", deduction: "", net: "", notes: "" });
      load(); toast.success("Logged");
    } catch { toast.error("Could not save"); }
  };
  const onDelete = async (id) => { try { await api.delete(`/cis/payments/${id}`); load(); } catch (e) { console.error("CIS payment delete failed", e); } };

  const totalGross = items.reduce((a, x) => a + (x.gross || 0), 0);
  const totalDeduction = items.reduce((a, x) => a + (x.deduction || 0), 0);
  const totalNet = items.reduce((a, x) => a + (x.net || 0), 0);
  const personalAllowance = 12570;
  const estimatedTax = Math.max(0, (totalGross - personalAllowance) * 0.20);
  const predictedRefund = Math.max(0, totalDeduction - estimatedTax);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="page-cis-refund-predictor">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">FINANCE</div>
          <h1 className="font-display text-4xl md:text-5xl">CIS Refund Predictor</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setInfoOpen(true)}
            className="btn-secondary flex items-center gap-2"
            data-testid="cis-info-btn"
            aria-label="About this tool"
          >
            <Info size={16} /> Info
          </button>
          <button
            onClick={toggleFav}
            className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`}
            data-testid="cis-fav-btn"
            aria-label="Favourite this tool"
          >
            <Star size={16} fill={isFav ? "#E8A020" : "none"} /> Favourite
          </button>
        </div>
      </div>

      {infoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
          onClick={() => setInfoOpen(false)}
          data-testid="cis-info-overlay"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-2xl w-full"
            style={{
              background: "#0D0D0D",
              border: "1px solid #E8A020",
              borderRadius: 8,
              padding: 24,
              boxShadow: "0 30px 80px rgba(0,0,0,0.7), 0 0 24px rgba(232,160,32,0.15)",
            }}
            data-testid="cis-info-popup"
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020] mb-1">About this tool</div>
                <h2 className="font-display text-3xl text-[#F0EDE8]">What this tool does</h2>
              </div>
              <button
                onClick={() => setInfoOpen(false)}
                className="text-[#A19D94] hover:text-[#F0EDE8]"
                data-testid="cis-info-close"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-[#A19D94] leading-relaxed mb-5">{TOOL.info}</p>

            <div
              style={{
                padding: "14px 16px",
                borderRadius: 6,
                border: "1px solid #3B82F6",
                background: "rgba(59,130,246,0.08)",
              }}
              data-testid="cis-tax-notice"
            >
              <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "#5B9BFF", fontWeight: 700, marginBottom: 8 }}>
                🧮 TAX NOTICE
              </div>
              <div style={{ fontSize: 12, color: "#A19D94", lineHeight: 1.6 }}>
                This tool gives an indicative estimate only. It assumes a Personal Allowance of £12,570 and basic-rate
                tax at 20%. It does not account for National Insurance, allowable expenses, higher-rate bands, or any
                other personal circumstances. Morris is not a tax adviser and the figures shown are not a substitute
                for filing a Self Assessment with HMRC. Always confirm with a qualified accountant before relying on
                any predicted refund amount.
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button onClick={() => setInfoOpen(false)} className="btn-secondary text-sm" data-testid="cis-info-dismiss">
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hero stat */}
      <div className="card-dark p-8 mb-6 morris-grain" data-testid="refund-summary">
        <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-2 flex items-center gap-2"><TrendingUp size={14} /> Predicted refund at year end</div>
        <div className="font-display text-6xl md:text-7xl text-[#E8A020]">£{predictedRefund.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div className="grid grid-cols-3 gap-6 mt-6 text-sm">
          <Stat label="Gross to date" value={`£${totalGross.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`} />
          <Stat label="CIS deducted" value={`£${totalDeduction.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`} />
          <Stat label="Net received" value={`£${totalNet.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`} />
        </div>
        <div className="text-xs text-[#706D66] mt-4">Estimate: assumes Personal Allowance £12,570 and 20% basic tax. Doesn't include NI, expenses or higher-rate bands. use as a guide, not a tax return.</div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <form onSubmit={onAdd} className="card-dark p-6 md:col-span-1" data-testid="cis-form">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4">Log a CIS payment</div>
          <div className="space-y-3">
            <Input label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} testId="cis-date" />
            <Input label="Contractor" value={form.contractor} onChange={(v) => setForm({ ...form, contractor: v })} testId="cis-contractor" />
            <Input label="Gross (£)" type="number" value={form.gross} onChange={(v) => setForm({ ...form, gross: v })} testId="cis-gross" />
            <Input label="Deduction (£)" type="number" value={form.deduction} onChange={(v) => setForm({ ...form, deduction: v })} testId="cis-deduction" />
            <Input label="Net (£)" type="number" value={form.net} onChange={(v) => setForm({ ...form, net: v })} testId="cis-net" />
            <button className="btn-primary w-full flex items-center justify-center gap-2" data-testid="cis-add"><Plus size={16} /> Add payment</button>
          </div>
        </form>
        <div className="card-dark p-6 md:col-span-2">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4">Logged payments ({items.length})</div>
          {loading ? <div className="text-sm text-[#706D66]">Loading…</div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[#706D66] text-xs uppercase tracking-widest">
                  <tr><th className="text-left py-2">Date</th><th className="text-left">Contractor</th><th className="text-right">Gross</th><th className="text-right">Deduction</th><th className="text-right">Net</th><th></th></tr>
                </thead>
                <tbody>
                  {items.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-[#706D66] italic">No payments logged yet.</td></tr>}
                  {items.map(p => (
                    <tr key={p.id} className="border-t border-[#F0EDE8]/5">
                      <td className="py-2">{p.date}</td>
                      <td>{p.contractor}</td>
                      <td className="text-right">£{(p.gross || 0).toFixed(2)}</td>
                      <td className="text-right text-[#E8A020]">£{(p.deduction || 0).toFixed(2)}</td>
                      <td className="text-right">£{(p.net || 0).toFixed(2)}</td>
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

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-[#706D66]">{label}</div>
      <div className="font-display text-2xl text-[#F0EDE8] mt-1">{value}</div>
    </div>
  );
}
function Input({ label, value, onChange, type = "text", testId }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="input-base" data-testid={testId} />
    </label>
  );
}
