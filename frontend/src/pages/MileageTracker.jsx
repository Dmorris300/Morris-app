import { useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { downloadPdf } from "../lib/pdf";
import { Plus, Trash2, Download, Info, AlertCircle, Car } from "lucide-react";
import { toast } from "sonner";
import { fireToolNotification } from "../lib/notification-triggers";

// HMRC approved mileage rates (do NOT change — these are the legal rates for 2025/26).
const VEHICLE_TYPES = {
  carvan: {
    id: "carvan",
    label: "Car or Van",
    rateFirst: 0.45,
    rateAbove: 0.25,
    threshold: 10000,
    description: "45p per mile (first 10,000 miles), 25p per mile thereafter",
  },
  motorcycle: {
    id: "motorcycle",
    label: "Motorcycle",
    rateFirst: 0.24,
    rateAbove: 0.24,
    threshold: Infinity, // flat rate
    description: "24p per mile (no threshold)",
  },
  bicycle: {
    id: "bicycle",
    label: "Bicycle",
    rateFirst: 0.20,
    rateAbove: 0.20,
    threshold: Infinity,
    description: "20p per mile (no threshold)",
  },
};

const isoToday = () => new Date().toISOString().slice(0, 10);

function currentTaxYear() {
  const now = new Date();
  const y = now.getFullYear();
  const startThisYear = new Date(y, 3, 6);
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

// Given the running car/van miles BEFORE this journey, calculate this journey's claim.
// Handles split rate at the 10,000 mile threshold (cars/vans only — others are flat rate).
function calcJourneyClaim(milesThisJourney, milesBefore, vehicleType) {
  const v = VEHICLE_TYPES[vehicleType] || VEHICLE_TYPES.carvan;
  if (!isFinite(v.threshold)) {
    return milesThisJourney * v.rateFirst;
  }
  const totalAfter = milesBefore + milesThisJourney;
  if (totalAfter <= v.threshold) return milesThisJourney * v.rateFirst;
  if (milesBefore >= v.threshold) return milesThisJourney * v.rateAbove;
  const atFirst = v.threshold - milesBefore;
  const atAbove = milesThisJourney - atFirst;
  return atFirst * v.rateFirst + atAbove * v.rateAbove;
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
    vehicleType: "carvan",
    odoStart: "",
    odoEnd: "",
    miles: "",
    roundTrip: false,
    vehicleReg: user?.vehicleReg || "",
  });
  const [missing, setMissing] = useState([]);

  const persist = (list) => { localStorage.setItem("morris_mileage", JSON.stringify(list)); setItems(list); };

  const onOdoChange = (key, val) => {
    const next = { ...form, [key]: val };
    const s = parseFloat(next.odoStart);
    const e = parseFloat(next.odoEnd);
    if (!Number.isNaN(s) && !Number.isNaN(e) && e > s) {
      next.miles = String(Math.round((e - s) * 10) / 10);
    }
    setForm(next);
  };

  const tyStart = taxYearStartIso();
  const ytdItems = useMemo(() => items.filter(i => i.date >= tyStart), [items, tyStart]);

  // YTD totals — split by vehicle type so the threshold tracking is correct for cars/vans only
  const totals = useMemo(() => {
    const sorted = [...ytdItems].sort((a, b) => a.date.localeCompare(b.date));
    let carvanMiles = 0;
    let totalMiles = 0;
    let claim = 0;
    for (const j of sorted) {
      const m = j.effectiveMiles || j.miles || 0;
      const vt = j.vehicleType || "carvan";
      const milesBefore = vt === "carvan" ? carvanMiles : 0;
      claim += calcJourneyClaim(m, milesBefore, vt);
      totalMiles += m;
      if (vt === "carvan") carvanMiles += m;
    }
    return { totalMiles, carvanMiles, claim };
  }, [ytdItems]);

  const v = VEHICLE_TYPES[form.vehicleType] || VEHICLE_TYPES.carvan;

  const milesNumber = parseFloat(form.miles) || 0;
  const effectiveMiles = form.roundTrip ? milesNumber * 2 : milesNumber;

  // Live preview for the journey being entered
  const milesBeforeThis = form.vehicleType === "carvan" ? totals.carvanMiles : 0;
  const journeyClaim = calcJourneyClaim(effectiveMiles, milesBeforeThis, form.vehicleType);
  const currentRate =
    form.vehicleType === "carvan"
      ? (milesBeforeThis + effectiveMiles <= v.threshold ? v.rateFirst : v.rateAbove)
      : v.rateFirst;

  const milesRemainingToThreshold =
    form.vehicleType === "carvan" && isFinite(v.threshold)
      ? Math.max(0, v.threshold - totals.carvanMiles)
      : null;

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
        vehicleType: form.vehicleType,
        odoStart: form.odoStart ? parseFloat(form.odoStart) : null,
        odoEnd: form.odoEnd ? parseFloat(form.odoEnd) : null,
        miles: milesNumber,
        roundTrip: form.roundTrip,
        effectiveMiles,
        vehicleReg: form.vehicleReg,
        rate: currentRate,
        claim: journeyClaim,
      },
      ...items,
    ]);
    setForm({ ...form, purpose: "", fromAddress: "", toAddress: "", odoStart: "", odoEnd: "", miles: "", roundTrip: false });
    toast.success(`Logged. £${journeyClaim.toFixed(2)} added to your claim.`);
    fireToolNotification({ toolId: "mileage", toolName: "Mileage Log" });
  };

  const del = (id) => persist(items.filter(x => x.id !== id));

  const downloadAnnualReport = () => {
    const sorted = [...ytdItems].sort((a, b) => a.date.localeCompare(b.date));
    const monthly = {};
    sorted.forEach(j => {
      const key = new Date(j.date).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      monthly[key] = (monthly[key] || 0) + (j.effectiveMiles || j.miles || 0);
    });
    let content = "";
    content += `OPERATIVE: ${user?.fullName || user?.username || ""}\n`;
    content += `COMPANY: ${user?.companyName || ""}\n`;
    content += `VEHICLE REGISTRATION: ${user?.vehicleReg || form.vehicleReg || ""}\n`;
    content += `TAX YEAR: ${currentTaxYear()}\n\n`;
    content += `SUMMARY\n`;
    content += `Total miles for the tax year: ${totals.totalMiles.toFixed(0)}\n`;
    content += `Total claim value: £${totals.claim.toFixed(2)}\n\n`;
    content += `BREAKDOWN BY MONTH\n`;
    Object.entries(monthly).forEach(([m, miles]) => {
      content += `${m}: ${miles.toFixed(0)} miles\n`;
    });
    content += `\nINDIVIDUAL JOURNEYS\n`;
    sorted.forEach(j => {
      const m = j.effectiveMiles || j.miles || 0;
      const vt = VEHICLE_TYPES[j.vehicleType || "carvan"]?.label || "Car or Van";
      content += `${j.date}  ${m} miles  ${vt}  ${j.fromAddress} to ${j.toAddress}  (${j.purpose})\n`;
    });
    content += `\nNOTE: HMRC approved mileage rates applied — Car/Van 45p first 10,000 miles, 25p above; Motorcycle 24p; Bicycle 20p.\n`;
    downloadPdf({ title: `Mileage report ${currentTaxYear()}`, content, user });
    toast.success("Annual mileage report downloaded");
  };

  const fieldErr = (k) => missing.includes(k);

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid="page-mileage">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Finance · Tax year {currentTaxYear()}</div>
          <h1 className="font-display text-4xl md:text-5xl">Mileage Log</h1>
          <p className="text-[#A19D94] mt-2 text-sm">Current rate: <span className="text-[#F0EDE8]">{(currentRate * 100).toFixed(0)}p per mile</span> · {v.label}</p>
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
          HMRC requires mileage records to be kept for 5 years. Includes: date, full addresses with postcodes, business purpose, and miles travelled.
        </p>
      </div>

      {/* ---------- SUMMARY PANEL ---------- */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6" data-testid="mileage-summary-panel">
        <StatCard
          label="Total miles this tax year"
          value={totals.totalMiles.toFixed(0)}
          subtitle={`${ytdItems.length} journey${ytdItems.length === 1 ? "" : "s"}`}
          testId="mileage-total-miles"
        />
        <StatCard
          label="Total claimable amount"
          value={`£${totals.claim.toFixed(2)}`}
          subtitle="HMRC approved rate"
          accent
          testId="mileage-claim"
        />
        <StatCard
          label="Miles until lower rate"
          value={milesRemainingToThreshold !== null ? milesRemainingToThreshold.toFixed(0) : "n/a"}
          subtitle={
            form.vehicleType === "carvan"
              ? (totals.carvanMiles >= 10000 ? "At 25p rate now" : "Then 25p per mile (Car/Van only)")
              : `${v.label} is a flat rate`
          }
          testId="mileage-threshold"
        />
        <StatCard
          label="Current tax year"
          value={currentTaxYear()}
          subtitle="Resets 6 April"
          testId="mileage-tax-year"
        />
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <form onSubmit={add} className="card-dark p-6" data-testid="mileage-form">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4">Log a journey</div>
          <div className="space-y-3">
            <Field label="Date of journey" required value={form.date} onChange={(v) => setForm({ ...form, date: v })} type="date" testId="mileage-date" />
            <Field label="Journey purpose" required value={form.purpose} onChange={(v) => setForm({ ...form, purpose: v })} placeholder="e.g. Site visit to Farringdon job" error={fieldErr("purpose")} testId="mileage-purpose" />
            <Field label="Start location" required value={form.fromAddress} onChange={(v) => setForm({ ...form, fromAddress: v })} placeholder="Full address including postcode" error={fieldErr("fromAddress")} testId="mileage-from" />
            <Field label="End location" required value={form.toAddress} onChange={(v) => setForm({ ...form, toAddress: v })} placeholder="Full address including postcode" error={fieldErr("toAddress")} testId="mileage-to" />

            <div>
              <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-1 flex items-center gap-1">
                <Car size={11} className="text-[#E8A020]" /> Vehicle type <span className="text-[#E8A020]">*</span>
              </div>
              <select
                value={form.vehicleType}
                onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}
                className="input-base"
                data-testid="mileage-vehicle-type"
              >
                {Object.values(VEHICLE_TYPES).map((vt) => (
                  <option key={vt.id} value={vt.id}>{vt.label} — {vt.description}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Odometer start (optional)" value={form.odoStart} onChange={(v) => onOdoChange("odoStart", v)} type="number" placeholder="e.g. 45230" testId="mileage-odo-start" />
              <Field label="Odometer end (optional)" value={form.odoEnd} onChange={(v) => onOdoChange("odoEnd", v)} type="number" placeholder="e.g. 45282" testId="mileage-odo-end" />
            </div>

            <Field label="Total miles" required value={form.miles} onChange={(v) => setForm({ ...form, miles: v })} type="number" placeholder="Auto-fills from odometer" error={fieldErr("miles")} testId="mileage-miles" />

            <label className="flex items-center gap-2 text-sm text-[#A19D94] cursor-pointer">
              <input type="checkbox" checked={form.roundTrip} onChange={(e) => setForm({ ...form, roundTrip: e.target.checked })} data-testid="mileage-roundtrip" />
              Round trip (doubles mileage)
            </label>

            {/* Live claimable amount preview */}
            <div className="p-3 rounded text-sm" style={{ background: "rgba(232,160,32,0.06)", border: "1px solid rgba(232,160,32,0.25)" }} data-testid="mileage-claim-preview">
              <div className="text-[10px] uppercase tracking-widest text-[#A19D94] mb-1">Claimable amount (HMRC rate)</div>
              <div className="font-display text-2xl text-[#E8A020]">£{journeyClaim.toFixed(2)}</div>
              <div className="text-[10px] text-[#706D66] mt-1">{effectiveMiles.toFixed(1)} miles × {(currentRate * 100).toFixed(0)}p</div>
            </div>

            <Field label="Vehicle registration" value={form.vehicleReg} onChange={(v) => setForm({ ...form, vehicleReg: v })} placeholder="e.g. AB12 CDE" testId="mileage-vehicle" />

            <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2" data-testid="mileage-add">
              <Plus size={14} /> Add journey
            </button>

            {purposeLooksGeneric && form.purpose && (
              <div className="text-xs flex items-start gap-2 text-[#E8A020]">
                <AlertCircle size={12} className="mt-0.5" />
                <span>HMRC won&apos;t accept generic purposes. Be specific.</span>
              </div>
            )}
          </div>
        </form>

        <div className="card-dark p-6 md:col-span-2">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4">Journey log ({items.length})</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="mileage-journeys-table">
              <thead className="text-[#706D66] text-xs uppercase tracking-widest">
                <tr>
                  <th className="text-left py-2">Date</th>
                  <th className="text-left">Purpose</th>
                  <th className="text-left">Route</th>
                  <th className="text-right">Miles</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">£ Value</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr><td colSpan={7} className="py-6 text-center text-[#706D66] italic">No journeys logged.</td></tr>
                )}
                {items.map(j => {
                  const m = j.effectiveMiles || j.miles || 0;
                  const c = typeof j.claim === "number" ? j.claim : m * 0.45;
                  const rate = typeof j.rate === "number"
                    ? `${(j.rate * 100).toFixed(0)}p`
                    : `${((c / m) * 100 || 45).toFixed(0)}p`;
                  return (
                    <tr key={j.id} className="border-t border-[#F0EDE8]/5">
                      <td className="py-2 text-[#A19D94]">{j.date}</td>
                      <td className="text-[#F0EDE8]">{j.purpose || "—"}</td>
                      <td className="text-[#A19D94] text-xs">{j.fromAddress} → {j.toAddress}{j.roundTrip && " (RT)"}</td>
                      <td className="text-right">{m.toFixed(0)}</td>
                      <td className="text-right text-[#A19D94]">{rate}</td>
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
    </div>
  );
}

function StatCard({ label, value, subtitle, accent, testId }) {
  return (
    <div className="card-dark p-4" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#706D66] mb-2">{label}</div>
      <div className="font-display text-3xl" style={{ color: accent ? "#E8A020" : "#F0EDE8" }}>{value}</div>
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
