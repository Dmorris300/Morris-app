import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { downloadPdf } from "../lib/pdf";
import { Plus, Trash2, Download, Info, AlertCircle } from "lucide-react";
import { toast } from "sonner";

// HMRC mileage rates for business journeys (cars and vans)
const RATE_FIRST = 0.45;    // First 10,000 miles in the tax year
const RATE_ABOVE = 0.25;    // 10,001 miles and above
const THRESHOLD = 10000;

const isoToday = () => new Date().toISOString().slice(0, 10);

// UK tax year runs 6 April → 5 April. Returns "2025/26" for today.
function currentTaxYear() {
  const now = new Date();
  const y = now.getFullYear();
  const startThisYear = new Date(y, 3, 6); // 6 April this year
  const inNew = now >= startThisYear;
  const startY = inNew ? y : y - 1;
  return `${startY}/${String((startY + 1) % 100).padStart(2, "0")}`;
}

function taxYearStartIso() {
  const now = new Date();
  const y = now.getFullYear();
  const startThisYear = new Date(y, 3, 6);
  return now >= startThisYear
    ? new Date(y, 3, 6).toISOString().slice(0, 10)
    : new Date(y - 1, 3, 6).toISOString().slice(0, 10);
}

// Given the running total *before* this journey, calculate this journey's claim.
function calcJourneyClaim(milesThisJourney, milesBefore) {
  const totalAfter = milesBefore + milesThisJourney;
  if (totalAfter <= THRESHOLD) return milesThisJourney * RATE_FIRST;
  if (milesBefore >= THRESHOLD) return milesThisJourney * RATE_ABOVE;
  // straddles the threshold
  const atFirstRate = THRESHOLD - milesBefore;
  const atAboveRate = milesThisJourney - atFirstRate;
  return atFirstRate * RATE_FIRST + atAboveRate * RATE_ABOVE;
}

export default function MileageTracker() {
  const { user } = useAuth();
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem("morris_mileage") || "[]"); } catch { return []; }
  });
  const [form, setForm] = useState({
    date: isoToday(),
    purpose: "",
    fromAddress: "",
    toAddress: "",
    miles: "",
    roundTrip: false,
    vehicleReg: user?.vehicleReg || "",
  });
  const [missing, setMissing] = useState([]);

  // Persist to localStorage
  const persist = (list) => { localStorage.setItem("morris_mileage", JSON.stringify(list)); setItems(list); };

  // Journeys in the current tax year only (mileage thresholds reset per tax year)
  const tyStart = taxYearStartIso();
  const ytdItems = useMemo(() => items.filter(i => i.date >= tyStart), [items, tyStart]);

  // Running totals for the current tax year, with mid-threshold split rates.
  const totals = useMemo(() => {
    const sorted = [...ytdItems].sort((a, b) => a.date.localeCompare(b.date));
    let miles = 0;
    let claim = 0;
    for (const j of sorted) {
      const m = j.effectiveMiles || j.miles || 0;
      claim += calcJourneyClaim(m, miles);
      miles += m;
    }
    return { miles, claim };
  }, [ytdItems]);

  const milesNumber = parseFloat(form.miles) || 0;
  const effectiveMiles = form.roundTrip ? milesNumber * 2 : milesNumber;
  const currentRate = totals.miles + effectiveMiles <= THRESHOLD ? RATE_FIRST : RATE_ABOVE;
  const journeyClaim = calcJourneyClaim(effectiveMiles, totals.miles);

  const generic = ["site", "work", "job", ""];
  const purposeLooksGeneric = generic.includes(form.purpose.trim().toLowerCase()) || form.purpose.trim().length < 8;

  const required = ["purpose", "fromAddress", "toAddress", "miles"];
  const missingNow = () => required.filter(k => !String(form[k] || "").trim());

  const add = (e) => {
    e.preventDefault();
    const m = missingNow();
    if (m.length > 0) { setMissing(m); toast.error(`Please complete: ${m.join(", ")}`); return; }
    if (purposeLooksGeneric) {
      toast.error("Journey purpose must be specific (e.g. 'Site visit to Farringdon job', not 'site' or 'work').");
      setMissing(["purpose"]);
      return;
    }
    setMissing([]);
    persist([
      {
        id: crypto.randomUUID(),
        date: form.date,
        purpose: form.purpose,
        fromAddress: form.fromAddress,
        toAddress: form.toAddress,
        miles: milesNumber,
        roundTrip: form.roundTrip,
        effectiveMiles,
        vehicleReg: form.vehicleReg,
        claim: journeyClaim,
      },
      ...items,
    ]);
    setForm({ ...form, purpose: "", fromAddress: "", toAddress: "", miles: "", roundTrip: false });
    toast.success(`Logged. £${journeyClaim.toFixed(2)} added to your claim.`);
  };

  const del = (id) => persist(items.filter(x => x.id !== id));

  const downloadAnnualReport = () => {
    const sorted = [...ytdItems].sort((a, b) => a.date.localeCompare(b.date));
    const monthly = {};
    let runningMiles = 0;
    sorted.forEach(j => {
      const key = new Date(j.date).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      monthly[key] = (monthly[key] || 0) + (j.effectiveMiles || j.miles || 0);
      runningMiles += j.effectiveMiles || j.miles || 0;
    });

    let content = "";
    content += `OPERATIVE: ${user?.fullName || user?.username || ""}\n`;
    content += `COMPANY: ${user?.companyName || ""}\n`;
    content += `VEHICLE REGISTRATION: ${user?.vehicleReg || form.vehicleReg || ""}\n`;
    content += `TAX YEAR: ${currentTaxYear()}\n\n`;
    content += `SUMMARY\n`;
    content += `Total miles for the tax year: ${totals.miles.toFixed(0)}\n`;
    content += `Total claim value: £${totals.claim.toFixed(2)}\n\n`;
    content += `BREAKDOWN BY MONTH\n`;
    Object.entries(monthly).forEach(([m, miles]) => {
      content += `${m}: ${miles.toFixed(0)} miles\n`;
    });
    content += `\nINDIVIDUAL JOURNEYS\n`;
    sorted.forEach(j => {
      const m = j.effectiveMiles || j.miles || 0;
      content += `${j.date}  ${m} miles  ${j.fromAddress} to ${j.toAddress}  (${j.purpose})\n`;
    });
    content += `\nNOTE: Mileage rates applied are HMRC's approved rates for cars and vans: 45p per mile for the first 10,000 miles in the tax year, 25p per mile thereafter.\n`;
    downloadPdf({ title: `Mileage report ${currentTaxYear()}`, content, user });
    toast.success("Annual mileage report downloaded");
  };

  const fieldErr = (k) => missing.includes(k);

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid="page-mileage">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Finance</div>
          <h1 className="font-display text-4xl md:text-5xl">Mileage Tracker</h1>
          <p className="text-[#A19D94] mt-2 text-sm">Tax year {currentTaxYear()} · HMRC rate {currentRate === RATE_FIRST ? "45p" : "25p"} per mile</p>
        </div>
        <button onClick={downloadAnnualReport} className="btn-secondary flex items-center gap-2 text-sm" data-testid="mileage-annual-report">
          <Download size={14} /> Annual report (PDF)
        </button>
      </div>

      <div
        className="mb-6 p-4 rounded flex items-start gap-3"
        style={{ border: "1px solid rgba(232,160,32,0.25)", background: "rgba(232,160,32,0.05)" }}
        data-testid="mileage-hmrc-note"
      >
        <Info size={16} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
        <p className="text-xs text-[#A19D94] leading-relaxed">
          HMRC requires mileage records to be kept contemporaneously. Log every journey on the day it happens. A journey purpose of 'site' or 'work' is not sufficient — always record the specific site name or client name for each journey.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <StatCard label="Miles this tax year" value={totals.miles.toFixed(0)} subtitle={totals.miles >= THRESHOLD ? "At 25p rate now" : `${(THRESHOLD - totals.miles).toFixed(0)} until 25p rate`} testId="mileage-total-miles" />
        <StatCard label="Claim value YTD" value={`£${totals.claim.toFixed(2)}`} subtitle="HMRC approved" testId="mileage-claim" />
        <StatCard label="At current rate" value={`£${(milesNumber * currentRate * (form.roundTrip ? 2 : 1)).toFixed(2)}`} subtitle="This journey" testId="mileage-this-journey" />
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <form onSubmit={add} className="card-dark p-6" data-testid="mileage-form">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4">Log a journey</div>
          <div className="space-y-3">
            <Field label="Date of journey" required value={form.date} onChange={(v) => setForm({ ...form, date: v })} type="date" testId="mileage-date" />
            <Field label="Journey purpose" required value={form.purpose} onChange={(v) => setForm({ ...form, purpose: v })} placeholder="e.g. Site visit to Farringdon job" error={fieldErr("purpose")} testId="mileage-purpose" />
            <Field label="Start location" required value={form.fromAddress} onChange={(v) => setForm({ ...form, fromAddress: v })} placeholder="Full address" error={fieldErr("fromAddress")} testId="mileage-from" />
            <Field label="End location" required value={form.toAddress} onChange={(v) => setForm({ ...form, toAddress: v })} placeholder="Full address" error={fieldErr("toAddress")} testId="mileage-to" />
            <Field label="Total miles" required value={form.miles} onChange={(v) => setForm({ ...form, miles: v })} type="number" error={fieldErr("miles")} testId="mileage-miles" />
            <label className="flex items-center gap-2 text-sm text-[#A19D94] cursor-pointer">
              <input type="checkbox" checked={form.roundTrip} onChange={(e) => setForm({ ...form, roundTrip: e.target.checked })} data-testid="mileage-roundtrip" />
              Round trip (doubles mileage)
            </label>
            <Field label="Vehicle registration" value={form.vehicleReg} onChange={(v) => setForm({ ...form, vehicleReg: v })} placeholder="e.g. AB12 CDE" testId="mileage-vehicle" />
            <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2" data-testid="mileage-add">
              <Plus size={14} /> Add journey
            </button>
            {purposeLooksGeneric && form.purpose && (
              <div className="text-xs flex items-start gap-2 text-[#E8A020]">
                <AlertCircle size={12} className="mt-0.5" />
                <span>HMRC won't accept generic purposes. Be specific.</span>
              </div>
            )}
          </div>
        </form>

        <div className="card-dark p-6 md:col-span-2">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4">Journeys ({items.length})</div>
          <table className="w-full text-sm" data-testid="mileage-journeys-table">
            <thead className="text-[#706D66] text-xs uppercase tracking-widest">
              <tr>
                <th className="text-left py-2">Date</th>
                <th className="text-left">Purpose</th>
                <th className="text-left">Route</th>
                <th className="text-right">Miles</th>
                <th className="text-right">£</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-[#706D66] italic">No journeys logged.</td></tr>
              )}
              {items.map(j => {
                const m = j.effectiveMiles || j.miles || 0;
                const c = typeof j.claim === "number" ? j.claim : m * RATE_FIRST;
                return (
                  <tr key={j.id} className="border-t border-[#F0EDE8]/5">
                    <td className="py-2 text-[#A19D94]">{j.date}</td>
                    <td className="text-[#F0EDE8]">{j.purpose || "—"}</td>
                    <td className="text-[#A19D94] text-xs">{j.fromAddress} → {j.toAddress}{j.roundTrip && " (RT)"}</td>
                    <td className="text-right">{m.toFixed(0)}</td>
                    <td className="text-right text-[#E8A020]">£{c.toFixed(2)}</td>
                    <td><button onClick={() => del(j.id)} data-testid={`mileage-del-${j.id}`}><Trash2 size={14} className="text-[#706D66] hover:text-red-400" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, subtitle, testId }) {
  return (
    <div className="card-dark p-4" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#706D66] mb-2">{label}</div>
      <div className="font-display text-3xl text-[#F0EDE8]">{value}</div>
      <div className="text-[10px] text-[#706D66] mt-1">{subtitle}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", testId, required, placeholder, error }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1 flex items-center gap-1">
        <span>{label}</span>
        {required && <span className="text-[#E8A020]">*</span>}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`input-base ${error ? "border-red-500" : ""}`}
        data-testid={testId}
      />
    </label>
  );
}
