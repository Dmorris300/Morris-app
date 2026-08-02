// Morris — Finance Hub V2 aggregator.
// Reads live data from Payment Tracker (localStorage), CIS payments (API),
// Expenses (API), Mileage (localStorage), Tax Pot (localStorage) and derives
// every KPI shown on the Finance Hub dashboard.

import api from "./api";
import { getToolData } from "./tool-persistence";
import {
  aggregateCis, mileageClaimYtd, refundCalc, taxPotFor,
  currentTaxYearLabel, taxYearStartIso, fGBP,
} from "./finance";

const N = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const isoToday = () => new Date().toISOString().slice(0, 10);

// Return YYYY-MM key for a date string (falls back to empty if no date).
function ymKey(iso) {
  if (!iso || typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : "";
}

// Return YYYY-MM-DD for N months ago (start of month).
function monthKeyOffset(offset) {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - offset);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Load Payment Tracker rows saved by the tool.
export function loadInvoiceRows() {
  const rows = getToolData("payment-tracker", []);
  return Array.isArray(rows) ? rows : [];
}

// Load Retention Chaser data if the tool has been used.
export function loadRetentionRows() {
  const rows = getToolData("retention-chaser", []);
  return Array.isArray(rows) ? rows : [];
}

// Load Payment Chaser rows.
export function loadChaserRows() {
  const rows = getToolData("payment-chaser", []);
  return Array.isArray(rows) ? rows : [];
}

// Load Tax Pot deposits.
export function loadTaxPotDeposits() {
  try {
    const raw = localStorage.getItem("morris_taxpot_deposits");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

// ----- KPI aggregators -----

function invoiceStatus(row) {
  const status = String(row.status || "").toLowerCase();
  const invoice = N(row.invoiceAmount);
  const received = N(row.amountReceived);
  if (status.startsWith("paid")) return "paid";
  if (status.startsWith("written")) return "written-off";
  if (status.startsWith("disputed")) return "disputed";
  if (received > 0 && received < invoice) return "partial";
  const dueIso = row.paymentDueDate || "";
  if (dueIso && dueIso < isoToday()) return "overdue";
  return "outstanding";
}

// Days between today and an ISO date (positive = future).
function daysUntil(iso) {
  if (!iso || typeof iso !== "string") return null;
  const d = new Date(`${iso}T00:00:00Z`);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

// Dashboard KPIs derived from invoice rows.
export function computeDashboardKpis(rows) {
  const today = isoToday();
  const monthPrefix = today.slice(0, 7);
  let outstandingCount = 0, outstandingValue = 0;
  let paidCount = 0, paidValue = 0;
  let overdueCount = 0, overdueValue = 0;
  let dueThisMonthCount = 0, dueThisMonthValue = 0;
  let totalInvoiced = 0, totalReceived = 0;

  const invoicesByMonth = {};       // ym → invoiced total
  const receiptsByMonth = {};       // ym → received total

  for (const r of rows || []) {
    const inv = N(r.invoiceAmount);
    const rec = N(r.amountReceived);
    const remaining = Math.max(0, inv - rec);
    totalInvoiced += inv;
    totalReceived += rec;

    const invYm = ymKey(r.invoiceDate);
    if (invYm) invoicesByMonth[invYm] = (invoicesByMonth[invYm] || 0) + inv;
    const recYm = ymKey(r.dateReceived);
    if (recYm) receiptsByMonth[recYm] = (receiptsByMonth[recYm] || 0) + rec;

    const s = invoiceStatus(r);
    if (s === "paid") { paidCount++; paidValue += inv; continue; }
    if (s === "written-off") continue;
    if (s === "overdue" || s === "outstanding" || s === "partial" || s === "disputed") {
      outstandingCount++;
      outstandingValue += remaining;
      if (s === "overdue") { overdueCount++; overdueValue += remaining; }
      const dueYm = ymKey(r.paymentDueDate);
      if (dueYm === monthPrefix) { dueThisMonthCount++; dueThisMonthValue += remaining; }
    }
  }

  // Cash-flow: money-in over the last 6 months.
  const cashFlow = [];
  for (let i = 5; i >= 0; i--) {
    const ym = monthKeyOffset(i);
    cashFlow.push({ ym, invoiced: invoicesByMonth[ym] || 0, received: receiptsByMonth[ym] || 0 });
  }

  return {
    outstanding: { count: outstandingCount, value: outstandingValue },
    paid: { count: paidCount, value: paidValue },
    overdue: { count: overdueCount, value: overdueValue },
    dueThisMonth: { count: dueThisMonthCount, value: dueThisMonthValue },
    totalInvoiced,
    totalReceived,
    cashFlow,
    invoicesByMonth,
    receiptsByMonth,
  };
}

// Load everything the Finance Hub needs. Handles API failures gracefully.
export async function loadFinanceHubData() {
  const invoiceRows = loadInvoiceRows();
  const retentionRows = loadRetentionRows();
  const chaserRows = loadChaserRows();
  const taxPotDeposits = loadTaxPotDeposits();
  const dashboardKpis = computeDashboardKpis(invoiceRows);

  const [cisRes, expRes, jobsRes, docsRes] = await Promise.allSettled([
    api.get("/cis/payments"),
    api.get("/expenses"),
    api.get("/jobs"),
    api.get("/documents"),
  ]);

  const cisPayments = cisRes.status === "fulfilled" && Array.isArray(cisRes.value.data) ? cisRes.value.data : [];
  const expenses = expRes.status === "fulfilled" && Array.isArray(expRes.value.data) ? expRes.value.data : [];
  const jobs = jobsRes.status === "fulfilled" && Array.isArray(jobsRes.value.data) ? jobsRes.value.data : [];
  const docs = docsRes.status === "fulfilled" && Array.isArray(docsRes.value.data) ? docsRes.value.data : [];

  // Current tax-year filter (6 April → 5 April)
  const startIso = taxYearStartIso();
  const cisThisTaxYear = cisPayments.filter((p) => (p.date || "") >= startIso);
  const expensesThisTaxYear = expenses.filter((e) => (e.date || "") >= startIso);
  const cis = aggregateCis(cisThisTaxYear);
  const mileageYtd = mileageClaimYtd();
  const expensesTotal = expensesThisTaxYear.reduce((s, e) => s + (Number(e.amount) || 0), 0) + mileageYtd;

  // Tax pot balance (deposits sum).
  const taxPotBalance = taxPotDeposits.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const recommendedTaxPot = taxPotFor(cis.net);

  // Refund preview (extended calc — includes expenses & mileage).
  const refund = refundCalc({
    grossLabourYtd: cis.grossLabour,
    materialsYtd: cis.materials,
    cisDeductedYtd: cis.deduction,
    expensesTotal,
    extended: true,
  });

  // VAT rolling 12-month estimate — use invoiced-net over the last 12 months.
  const twelveAgo = (() => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - 12);
    return d.toISOString().slice(0, 10);
  })();
  const vatRollingRevenue = invoiceRows.reduce((sum, r) => {
    if ((r.invoiceDate || "") >= twelveAgo) return sum + N(r.invoiceAmount);
    return sum;
  }, 0);
  const vatThreshold = 90000;
  const vatUsedPct = Math.min(100, Math.round((vatRollingRevenue / vatThreshold) * 100));

  // Retention held total from tracker rows.
  const retentionHeld = invoiceRows.reduce((sum, r) => sum + N(r.retentionHeld), 0);

  // Document counts by type (for Commercial tab).
  const docCounts = {};
  for (const d of docs) {
    const t = d.toolId || d.type || "other";
    docCounts[t] = (docCounts[t] || 0) + 1;
  }

  // Project profitability (rough: paid − CIS deduction share) — placeholder.
  const projects = jobs.map((j) => {
    const jobInvoices = invoiceRows.filter((r) =>
      (r.project || "").toLowerCase() === (j.clientName || "").toLowerCase() ||
      (r.project || "").toLowerCase() === (j.address || "").toLowerCase()
    );
    const invoiced = jobInvoices.reduce((s, r) => s + N(r.invoiceAmount), 0);
    const received = jobInvoices.reduce((s, r) => s + N(r.amountReceived), 0);
    return { id: j.id, name: j.clientName || j.address || "Unnamed project", status: j.status, invoiced, received };
  }).sort((a, b) => b.invoiced - a.invoiced);

  return {
    invoiceRows,
    retentionRows,
    chaserRows,
    taxPotDeposits,
    dashboardKpis,
    cis,
    cisPayments,
    expenses,
    expensesTotal,
    mileageYtd,
    taxPotBalance,
    recommendedTaxPot,
    refund,
    vatRollingRevenue,
    vatThreshold,
    vatUsedPct,
    retentionHeld,
    docs,
    docCounts,
    jobs,
    projects,
    taxYearLabel: currentTaxYearLabel(),
  };
}

export { fGBP };
