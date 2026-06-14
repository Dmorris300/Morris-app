// Morris — Phase 3 alert verification seed.
// Dev only. Plants realistic data in every tool data source so that the
// alert engine has exactly one thing to fire for each alert type.
//
// Use from the browser console:
//   window.__morrisSeedAlerts()    // plant data
//   window.__morrisRunAlerts()     // run the engine
//   window.__morrisResetAlerts()   // wipe dedup registry to re-test

import { saveToolData } from "./tool-persistence";

function isoToday() { return new Date().toISOString().slice(0, 10); }
function isoPlusDays(days) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function isoTodayHHMM(h, m) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function seedAlerts() {
  // Mileage — push total to 9,500 (between 9,000 and 10,000) to trip near-10k
  localStorage.setItem("morris_mileage", JSON.stringify([
    { id: "m1", miles: 9500, claim: 9500 * 0.45, date: isoToday() },
  ]));

  // VAT months — last 12 months totalling ~£85,000 to trip the near-threshold alert
  const vatMonths = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, year: 2026, amount: 7083,
  }));
  localStorage.setItem("morris_vat_monthly_v2", JSON.stringify(vatMonths));

  saveToolData("payment-tracker", [
    {
      id: "pt1",
      reference: "INV-2042",
      counterparty: "Acme Build Ltd",
      dueDate: isoPlusDays(-21),
      outstanding: 4250,
      paid: false,
    },
  ]);

  saveToolData("price-work-quote", [
    { id: "q1", quoteRef: "PW-014", validUntil: isoPlusDays(3) },
  ]);
  saveToolData("tender-letter", [
    { id: "t1", tenderRef: "TND-2026-03", validUntil: isoPlusDays(3) },
  ]);

  saveToolData("contract-mgmt", [
    {
      id: "c1",
      project: "Riverside Quarter",
      retentionHeld: true,
      retentionAmount: 2500,
      retentionReleaseDate: isoPlusDays(7),
      dlpEndDate: isoPlusDays(14),
    },
  ]);

  saveToolData("tool-register", [
    { id: "tr1", itemName: "Makita SDS Drill", patExpiry: isoPlusDays(-7) },
    { id: "tr2", itemName: "Festool Vacuum",   patExpiry: isoPlusDays(10) },
  ]);

  saveToolData("rams-library", [
    { id: "r1", title: "First Fix Ductwork",     reviewDueDate: isoPlusDays(-30), status: "Current — in use" },
    { id: "r2", title: "Working at Height Tower", reviewDueDate: isoPlusDays(20),  status: "Current — in use" },
  ]);

  saveToolData("coshh",              [{ id: "x1", reviewDueDate: isoPlusDays(20) }]);
  saveToolData("noise-assessment",   [{ id: "x2", reviewDueDate: isoPlusDays(15) }]);
  saveToolData("manual-handling",    [{ id: "x3", reviewDueDate: isoPlusDays(28) }]);
  saveToolData("hs-policy",          [{ id: "x4", reviewDueDate: isoPlusDays(25) }]);

  saveToolData("hire-agreement", [
    { id: "h1", itemName: "12m scissor lift", endDate: isoPlusDays(7) },
  ]);

  saveToolData("site-access-permit", [
    { id: "p1", permitRef: "SAP-007", validTo: isoTodayHHMM(17, 0) },
  ]);

  saveToolData("subbie-mgmt", [
    { id: "s1", name: "PJK Electrical", cisStatus: "To be verified", insuranceExpiry: isoPlusDays(10),  ramsReceived: false },
    { id: "s2", name: "AAA Plastering",  cisStatus: "Verified",        insuranceExpiry: isoPlusDays(-2), ramsReceived: true },
  ]);

  saveToolData("variation-instruction-log", [
    { id: "v1", reference: "VI-014", dateRaised: isoPlusDays(-15), submitted: false },
  ]);

  saveToolData("commercial-report", [
    { id: "cr1", project: "Bayside Tower", forecastProfitLoss: -8500 },
  ]);

  saveToolData("procurement-schedule", [
    { id: "ps1", item: "MVHR unit",         orderByDate: isoToday(),       ordered: false },
    { id: "ps2", item: "Fire-rated ductwork", expectedDeliveryDate: isoPlusDays(-3), delivered: false },
  ]);

  saveToolData("apprentice-manager", [
    { id: "a1", name: "Joe Murphy", offTheJobPercent: 17, nextReviewDate: isoPlusDays(-5) },
  ]);

  saveToolData("incident-report", [
    { id: "ir1", reference: "IR-003", riddorReported: "Not confirmed" },
  ]);
  saveToolData("incident-log", [
    { id: "il1", ref: "IL-006", reportRaised: false, status: "Open — under investigation" },
  ]);
}

if (typeof window !== "undefined") {
  window.__morrisSeedAlerts = seedAlerts;
}

export { seedAlerts };
