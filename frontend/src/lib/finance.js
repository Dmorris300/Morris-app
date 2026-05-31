// Centralised finance maths and tax-year helpers for Morris.
// All figures track the UK tax year (6 April → 5 April).
// Numbers reflect the spec in the user's master finance brief.

export const PERSONAL_ALLOWANCE = 12570;
export const INCOME_TAX_RATE = 0.20;       // Step 3
export const CLASS4_NI_RATE = 0.06;        // Step 4 (simplified single band, per spec)
export const CLASS4_NI_THRESHOLD = 12570;  // Step 4 — excess over £12,570 of Taxable Profit
export const TAX_POT_RATE = 0.08;          // 8% of net cash received

// Returns the ISO date (YYYY-MM-DD) of the most recent 6 April.
export function taxYearStartIso(now = new Date()) {
  const y = now.getFullYear();
  const startThisYear = new Date(y, 3, 6); // 6 April this year
  return now >= startThisYear
    ? new Date(y, 3, 6).toISOString().slice(0, 10)
    : new Date(y - 1, 3, 6).toISOString().slice(0, 10);
}

// "2025/26" style label for the current tax year.
export function currentTaxYearLabel(now = new Date()) {
  const startIso = taxYearStartIso(now);
  const sy = Number(startIso.slice(0, 4));
  return `${sy}/${String((sy + 1) % 100).padStart(2, "0")}`;
}

// Filter a list of items to only those in the current tax year (items must have a .date ISO field).
export function thisTaxYear(items) {
  const start = taxYearStartIso();
  return (items || []).filter(it => (it.date || "") >= start);
}

// CIS payment aggregation. Returns totals for the supplied (already-filtered) list.
export function aggregateCis(payments) {
  let grossLabour = 0, materials = 0, deduction = 0, net = 0;
  for (const p of (payments || [])) {
    grossLabour += Number(p.grossLabour ?? p.gross ?? 0) || 0;
    materials += Number(p.materials ?? 0) || 0;
    deduction += Number(p.deduction ?? 0) || 0;
    net += Number(p.net ?? 0) || 0;
  }
  return {
    grossLabour: round(grossLabour),
    materials: round(materials),
    deduction: round(deduction),
    net: round(net),
  };
}

// Six-step refund calculation per the spec. All values in £.
// Returns the full breakdown so dashboards can show every step.
export function refundCalc({ grossLabourYtd, materialsYtd, cisDeductedYtd }) {
  // Step 1
  const taxableProfit = Math.max(0, (grossLabourYtd || 0) - (materialsYtd || 0));
  // Step 2
  const taxableIncome = Math.max(0, taxableProfit - PERSONAL_ALLOWANCE);
  // Step 3
  const incomeTax = round(taxableIncome * INCOME_TAX_RATE);
  // Step 4
  const niBase = Math.max(0, taxableProfit - CLASS4_NI_THRESHOLD);
  const class4Ni = round(niBase * CLASS4_NI_RATE);
  // Step 5
  const totalLiability = round(incomeTax + class4Ni);
  // Step 6
  const delta = round((cisDeductedYtd || 0) - totalLiability);

  return {
    taxableProfit: round(taxableProfit),
    taxableIncome: round(taxableIncome),
    incomeTax,
    class4Ni,
    totalLiability,
    delta,                                 // positive = refund, negative = owed
    refund: delta >= 0 ? delta : 0,
    owed: delta < 0 ? Math.abs(delta) : 0,
  };
}

// 8% of net cash received → Tax Pot recommendation.
export function taxPotFor(netCashReceived) {
  return round(Math.max(0, (netCashReceived || 0) * TAX_POT_RATE));
}

// Round to 2dp, returns Number.
function round(v) { return Math.round((Number(v) || 0) * 100) / 100; }

export const EXPENSE_CATEGORIES = [
  { id: "tools",       label: "Tools" },
  { id: "fuel",        label: "Fuel" },
  { id: "ppe",         label: "PPE" },
  { id: "training",    label: "Training" },
  { id: "insurance",   label: "Insurance" },
  { id: "accountant",  label: "Accountant fees" },
  { id: "phone",       label: "Phone" },
  { id: "marketing",   label: "Marketing" },
  { id: "materials",   label: "Materials (not recharged)" },
  { id: "mileage",     label: "Mileage" },
  { id: "other",       label: "Other" },
];

// Format a number as £X,XXX.XX
export const fGBP = (n) => `£${(Number(n) || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fGBPnoDp = (n) => `£${(Number(n) || 0).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
