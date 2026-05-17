import { useEffect, useState } from "react";
import api from "../lib/api";
import { PoundSterling, TrendingUp, FileText, Wallet } from "lucide-react";

export default function Earnings() {
  const [cis, setCis] = useState([]);
  const [docs, setDocs] = useState([]);
  useEffect(() => {
    api.get("/cis/payments").then(r => setCis(r.data)).catch(() => {});
    api.get("/documents").then(r => setDocs(r.data)).catch(() => {});
  }, []);
  const gross = cis.reduce((a, x) => a + (x.gross || 0), 0);
  const deduction = cis.reduce((a, x) => a + (x.deduction || 0), 0);
  const net = cis.reduce((a, x) => a + (x.net || 0), 0);
  const allowance = 12570;
  const estimatedTax = Math.max(0, (gross - allowance) * 0.20);
  const takeHome = gross - estimatedTax;

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid="page-earnings">
      <div className="mb-8">
        <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Finance</div>
        <h1 className="font-display text-4xl md:text-5xl">Earnings Dashboard</h1>
        <p className="text-[#A19D94] mt-2">Year-to-date summary based on your logged CIS payments.</p>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="Gross income" value={`£${gross.toFixed(2)}`} icon={<PoundSterling size={18}/>} />
        <Card label="CIS deducted" value={`£${deduction.toFixed(2)}`} icon={<TrendingUp size={18}/>} accent />
        <Card label="Net received" value={`£${net.toFixed(2)}`} icon={<Wallet size={18}/>} />
        <Card label="Est. take-home" value={`£${takeHome.toFixed(2)}`} icon={<FileText size={18}/>} />
      </div>
      <p className="mt-6 text-xs text-[#706D66] max-w-2xl">
        Simplified estimate using £12,570 Personal Allowance and 20% basic rate only. Doesn't include NI, expenses, or higher-rate bands. For your real position, use Self Assessment Prep with your accountant.
      </p>
    </div>
  );
}

function Card({ label, value, icon, accent }) {
  return (
    <div className="card-dark p-6">
      <div className={`text-xs uppercase tracking-widest mb-2 flex items-center gap-2 ${accent ? "text-[#E8A020]" : "text-[#A19D94]"}`}>{icon}{label}</div>
      <div className={`font-display text-4xl ${accent ? "text-[#E8A020]" : "text-[#F0EDE8]"}`}>{value}</div>
    </div>
  );
}
