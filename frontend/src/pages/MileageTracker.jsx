import { useEffect, useState } from "react";
import api from "../lib/api";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

// Local-only mileage tracker (stored in localStorage) — uses HMRC's 45p/mile rate
const RATE_FIRST = 0.45;
const RATE_ABOVE = 0.25;

export default function MileageTracker() {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem("morris_mileage") || "[]"); } catch { return []; }
  });
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), from: "", to: "", miles: "" });

  const save = (list) => { localStorage.setItem("morris_mileage", JSON.stringify(list)); setItems(list); };
  const add = (e) => {
    e.preventDefault();
    if (!form.miles) return;
    save([{ id: crypto.randomUUID(), ...form, miles: parseFloat(form.miles) }, ...items]);
    setForm({ date: new Date().toISOString().slice(0, 10), from: "", to: "", miles: "" });
    toast.success("Logged");
  };
  const del = (id) => save(items.filter(x => x.id !== id));

  const total = items.reduce((a, x) => a + (x.miles || 0), 0);
  const claimable = total <= 10000 ? total * RATE_FIRST : 10000 * RATE_FIRST + (total - 10000) * RATE_ABOVE;

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid="page-mileage">
      <div className="mb-8">
        <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Finance</div>
        <h1 className="font-display text-4xl md:text-5xl">Mileage Tracker</h1>
        <p className="text-[#A19D94] mt-2">HMRC rate: 45p/mile for the first 10,000 miles, 25p/mile after. Stored locally on this device.</p>
      </div>

      <div className="card-dark p-8 mb-6">
        <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-2">Claimable expense</div>
        <div className="font-display text-6xl text-[#E8A020]">£{claimable.toFixed(2)}</div>
        <div className="text-sm text-[#A19D94] mt-2">{total.toFixed(0)} miles logged</div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <form onSubmit={add} className="card-dark p-6">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4">Log a journey</div>
          <div className="space-y-3">
            <Field label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} testId="mileage-date" />
            <Field label="From" value={form.from} onChange={(v) => setForm({ ...form, from: v })} testId="mileage-from" />
            <Field label="To" value={form.to} onChange={(v) => setForm({ ...form, to: v })} testId="mileage-to" />
            <Field label="Miles" type="number" value={form.miles} onChange={(v) => setForm({ ...form, miles: v })} testId="mileage-miles" />
            <button className="btn-primary w-full flex items-center justify-center gap-2" data-testid="mileage-add"><Plus size={14}/> Add</button>
          </div>
        </form>
        <div className="card-dark p-6 md:col-span-2">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4">Journeys ({items.length})</div>
          <table className="w-full text-sm">
            <thead className="text-[#706D66] text-xs uppercase tracking-widest">
              <tr><th className="text-left py-2">Date</th><th className="text-left">From → To</th><th className="text-right">Miles</th><th className="text-right">£</th><th></th></tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-[#706D66] italic">No journeys logged.</td></tr>}
              {items.map(j => (
                <tr key={j.id} className="border-t border-[#F0EDE8]/5">
                  <td className="py-2">{j.date}</td><td>{j.from} → {j.to}</td><td className="text-right">{j.miles}</td><td className="text-right text-[#E8A020]">£{(j.miles * RATE_FIRST).toFixed(2)}</td>
                  <td><button onClick={() => del(j.id)}><Trash2 size={14} className="text-[#706D66] hover:text-red-400"/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", testId }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1">{label}</div>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="input-base" data-testid={testId} />
    </label>
  );
}
