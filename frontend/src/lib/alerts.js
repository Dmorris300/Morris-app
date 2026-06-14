// Morris — Phase 3 proactive alert engine.
//
// Runs every app load (via AppShell mount). Each check inspects a known data
// source and fires bell notifications for any item that crosses a threshold.
// Every alert has a deterministic ID and is recorded in a dedup registry so
// the same alert never fires twice for the same item.

import { addNotification } from "./notifications";
import { getToolData } from "./tool-persistence";

const FIRED_KEY = "morris.alerts.fired.v1";
const MAX_FIRED_IDS = 2000; // safety cap

function readFired() {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}
function writeFired(map) {
  try {
    const keys = Object.keys(map);
    if (keys.length > MAX_FIRED_IDS) {
      // keep newest by timestamp
      const sorted = keys
        .map((k) => ({ k, t: map[k] || 0 }))
        .sort((a, b) => b.t - a.t)
        .slice(0, MAX_FIRED_IDS);
      const trimmed = {};
      sorted.forEach(({ k, t }) => { trimmed[k] = t; });
      map = trimmed;
    }
    localStorage.setItem(FIRED_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

function alreadyFired(id, fired) { return Object.prototype.hasOwnProperty.call(fired, id); }
function markFired(id, fired) { fired[id] = Date.now(); }

// ---------- helpers ----------
const isoToday = () => new Date().toISOString().slice(0, 10);
function ukDate(iso) {
  if (!iso || typeof iso !== "string") return iso || "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function ukDateTime(iso) {
  if (!iso || typeof iso !== "string") return iso || "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return ukDate(iso);
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
}
function daysBetween(a, b) {
  if (!a || !b) return 0;
  const da = new Date(a + "T00:00:00Z");
  const db = new Date(b + "T00:00:00Z");
  return Math.round((da - db) / 86_400_000);
}
function money(n) {
  return `£${(Number(n) || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function asArray(v) { return Array.isArray(v) ? v : []; }
function todayHour() { return new Date().getHours(); }
function isSameDay(isoTs, isoDate) {
  if (!isoTs || !isoDate) return false;
  return isoTs.slice(0, 10) === isoDate;
}

// ---------- data accessors ----------
const ds = {
  mileage: () => {
    try { return JSON.parse(localStorage.getItem("morris_mileage") || "[]"); }
    catch { return []; }
  },
  vatMonths: () => {
    try { return JSON.parse(localStorage.getItem("morris_vat_monthly_v2") || "[]"); }
    catch { return []; }
  },
  toolData: (toolId) => getToolData(toolId, null),
  notifications: () => {
    try { return JSON.parse(localStorage.getItem("morris.notifications.v1") || "[]"); }
    catch { return []; }
  },
};

// ---------- individual checks ----------
function checkMileageThreshold(fired) {
  const items = ds.mileage();
  if (items.length === 0) return;
  // Total miles travelled (treat null/empty as 0)
  const total = items.reduce((s, x) => s + (Number(x.miles) || 0), 0);
  if (total >= 9000 && total < 10000) {
    const id = "mileage-near-10k";
    if (!alreadyFired(id, fired)) {
      addNotification({
        category: "finance",
        message: `You have logged ${Math.round(total)} miles — your HMRC mileage rate drops after 10,000 miles`,
      });
      markFired(id, fired);
    }
  }
}

function checkVatThreshold(fired) {
  const months = ds.vatMonths();
  if (months.length === 0) return;
  // Sum the most recent 12 entries (rolling year). Each entry shape is { amount, ... }
  const last12 = months.slice(-12);
  const total = last12.reduce((s, m) => s + (Number(m.amount) || 0), 0);
  // 2026 VAT threshold £90,000 — alert when within ~10% (£81,000)
  if (total >= 81_000 && total < 90_000) {
    const id = "vat-near-threshold";
    if (!alreadyFired(id, fired)) {
      addNotification({
        category: "finance",
        message: "Your earnings are approaching the VAT registration threshold — review now",
      });
      markFired(id, fired);
    }
  }
}

function checkSelfAssessment(fired) {
  const now = new Date();
  // Fires once each tax year on or after 1 March.
  if (now.getMonth() < 2) return; // Jan/Feb = no alert
  // Determine tax year label e.g. "2025/26" for tax year ending 5 April 2026.
  const yearEnding = now.getMonth() >= 3 || (now.getMonth() === 3 && now.getDate() > 5)
    ? now.getFullYear() + 1
    : now.getFullYear();
  const yearLabel = `${yearEnding - 1}/${String(yearEnding).slice(-2)}`;
  const id = `self-assessment-${yearLabel}`;
  if (alreadyFired(id, fired)) return;
  addNotification({
    category: "finance",
    message: `The ${yearLabel} tax year ends 5 April — have you prepared your Self Assessment?`,
  });
  markFired(id, fired);
}

function checkPaymentTracker(fired) {
  const rows = asArray(ds.toolData("payment-tracker"));
  rows.forEach((r) => {
    const due = r.dueDate || r.invoiceDueDate;
    const paid = r.paid || r.status === "Paid";
    if (paid || !due) return;
    const overdueDays = daysBetween(isoToday(), due);
    if (overdueDays <= 0) return;
    const id = `invoice-overdue-${r.id || r.reference || r.invoiceNumber || due}-${overdueDays}`;
    if (alreadyFired(id, fired)) return;
    const ref = r.reference || r.invoiceNumber || "(no ref)";
    const counterparty = r.counterparty || r.client || r.contractor || "client";
    const amount = money(r.outstanding || r.amount || 0);
    addNotification({
      category: "finance",
      message: `Invoice ${ref} — ${counterparty} — ${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue — ${amount} outstanding`,
    });
    markFired(id, fired);
  });
}

function checkQuoteExpiry(fired) {
  const rows = asArray(ds.toolData("price-work-quote"));
  rows.forEach((r) => {
    if (!r.validUntil) return;
    const daysLeft = daysBetween(r.validUntil, isoToday());
    if (daysLeft !== 3) return; // exact 3 days
    const id = `quote-expiry-3-${r.quoteRef || r.validUntil}`;
    if (alreadyFired(id, fired)) return;
    addNotification({
      category: "finance",
      message: `Quote ${r.quoteRef || "—"} expires in 3 days — follow up with client`,
    });
    markFired(id, fired);
  });
}

function checkTenderExpiry(fired) {
  const rows = asArray(ds.toolData("tender-letter"));
  rows.forEach((r) => {
    if (!r.validUntil) return;
    const daysLeft = daysBetween(r.validUntil, isoToday());
    if (daysLeft !== 3) return;
    const id = `tender-expiry-3-${r.tenderRef || r.ref || r.validUntil}`;
    if (alreadyFired(id, fired)) return;
    addNotification({
      category: "commercial",
      message: `Tender ${r.tenderRef || r.ref || "—"} expires in 3 days — follow up with client`,
    });
    markFired(id, fired);
  });
}

function checkRetentionRelease(fired) {
  const rows = asArray(ds.toolData("contract-mgmt"));
  rows.forEach((r) => {
    const release = r.retentionReleaseDate || r.dlpEndDate;
    if (!release || !(r.retentionHeld || r.retentionAmount)) return;
    const daysLeft = daysBetween(release, isoToday());
    if (daysLeft < 0 || daysLeft > 14) return;
    const id = `retention-release-${r.project || r.id}-${release}`;
    if (alreadyFired(id, fired)) return;
    addNotification({
      category: "finance",
      message: `Retention on ${r.project || "project"} is due for release on ${ukDate(release)} — raise a chaser if not received`,
    });
    markFired(id, fired);
  });
}

function checkPatTest(fired) {
  const rows = asArray(ds.toolData("tool-register"));
  rows.forEach((r) => {
    if (!r.patExpiry && !r.patTestExpiry) return;
    const expiry = r.patExpiry || r.patTestExpiry;
    const daysLeft = daysBetween(expiry, isoToday());
    if (daysLeft < 0) {
      const id = `pat-expired-${r.id || r.itemName}-${expiry}`;
      if (alreadyFired(id, fired)) return;
      addNotification({
        category: "safety",
        message: `${r.itemName || r.item || "Item"} PAT test has expired — do not use until re-tested`,
      });
      markFired(id, fired);
    } else if (daysLeft <= 14) {
      const id = `pat-due-14-${r.id || r.itemName}-${expiry}`;
      if (alreadyFired(id, fired)) return;
      addNotification({
        category: "safety",
        message: `${r.itemName || r.item || "Item"} PAT test expires in 14 days — arrange re-testing`,
      });
      markFired(id, fired);
    }
  });
}

function checkRamsLibrary(fired) {
  const rows = asArray(ds.toolData("rams-library"));
  rows.forEach((r) => {
    if (!r.reviewDueDate || r.status === "Archived — no longer in use" || r.status === "Superseded — replaced by newer version") return;
    const daysLeft = daysBetween(r.reviewDueDate, isoToday());
    if (daysLeft < 0) {
      const id = `rams-overdue-${r.id || r.title}-${r.reviewDueDate}`;
      if (alreadyFired(id, fired)) return;
      addNotification({
        category: "safety",
        message: `${r.title || "RAMS"} is overdue for review — update before next use`,
      });
      markFired(id, fired);
    } else if (daysLeft <= 30) {
      const id = `rams-due-30-${r.id || r.title}-${r.reviewDueDate}`;
      if (alreadyFired(id, fired)) return;
      addNotification({
        category: "safety",
        message: `${r.title || "RAMS"} review is due in 30 days`,
      });
      markFired(id, fired);
    }
  });
}

function checkSafetyReviewDue30(toolId, label) {
  return (fired) => {
    const rows = asArray(ds.toolData(toolId));
    rows.forEach((r) => {
      if (!r.reviewDueDate) return;
      const daysLeft = daysBetween(r.reviewDueDate, isoToday());
      if (daysLeft < 0 || daysLeft > 30) return;
      const id = `${toolId}-review-30-${r.id || r.title || r.reviewDueDate}`;
      if (alreadyFired(id, fired)) return;
      addNotification({
        category: "safety",
        message: `${label} review due in 30 days`,
      });
      markFired(id, fired);
    });
  };
}

function checkHireAgreement(fired) {
  const rows = asArray(ds.toolData("hire-agreement"));
  rows.forEach((r) => {
    if (!r.endDate) return;
    const daysLeft = daysBetween(r.endDate, isoToday());
    if (daysLeft !== 7) return;
    const id = `hire-ends-7-${r.id || r.itemName}-${r.endDate}`;
    if (alreadyFired(id, fired)) return;
    addNotification({
      category: "commercial",
      message: `Hired item ${r.itemName || "—"} — hire period ends in 7 days — return or extend`,
    });
    markFired(id, fired);
  });
}

function checkDlpEnding(fired) {
  const rows = asArray(ds.toolData("contract-mgmt"));
  rows.forEach((r) => {
    if (!r.dlpEndDate) return;
    const daysLeft = daysBetween(r.dlpEndDate, isoToday());
    if (daysLeft !== 14) return;
    const id = `dlp-ends-14-${r.project || r.id}-${r.dlpEndDate}`;
    if (alreadyFired(id, fired)) return;
    addNotification({
      category: "compliance",
      message: `DLP on ${r.project || "project"} ends in 14 days — raise any outstanding defects now`,
    });
    markFired(id, fired);
  });
}

function checkPermitExpiryToday(fired) {
  const rows = asArray(ds.toolData("site-access-permit"));
  const today = isoToday();
  rows.forEach((r) => {
    if (!r.validTo) return;
    const datePart = r.validTo.slice(0, 10);
    if (datePart !== today) return;
    const timePart = (r.validTo.match(/T(\d{2}:\d{2})/) || ["", "—"])[1];
    const id = `permit-today-${r.permitRef || r.id}-${r.validTo}`;
    if (alreadyFired(id, fired)) return;
    addNotification({
      category: "safety",
      message: `Permit ${r.permitRef || "—"} expires today at ${timePart} — close or extend`,
    });
    markFired(id, fired);
  });
}

function checkSubcontractors(fired) {
  const rows = asArray(ds.toolData("subbie-mgmt"));
  const today = isoToday();
  rows.forEach((r) => {
    const name = r.name || r.subcontractor || "Subcontractor";
    if (r.cisVerified === false || r.cisStatus === "Unverified" || r.cisStatus === "To be verified") {
      const id = `subbie-cis-${r.id || name}`;
      if (!alreadyFired(id, fired)) {
        addNotification({
          category: "compliance",
          message: `CIS verification outstanding for ${name} — verify before making payment`,
        });
        markFired(id, fired);
      }
    }
    if (r.insuranceExpiry) {
      const daysLeft = daysBetween(r.insuranceExpiry, today);
      if (daysLeft < 0) {
        const id = `subbie-ins-expired-${r.id || name}-${r.insuranceExpiry}`;
        if (!alreadyFired(id, fired)) {
          addNotification({
            category: "compliance",
            message: `${name} insurance has expired — do not deploy on site`,
          });
          markFired(id, fired);
        }
      } else if (daysLeft <= 14) {
        const id = `subbie-ins-14-${r.id || name}-${r.insuranceExpiry}`;
        if (!alreadyFired(id, fired)) {
          addNotification({
            category: "compliance",
            message: `${name} insurance expires in 14 days — request renewal`,
          });
          markFired(id, fired);
        }
      }
    }
    if (r.ramsReceived === false || r.ramsStatus === "Not received") {
      const id = `subbie-rams-${r.id || name}`;
      if (!alreadyFired(id, fired)) {
        addNotification({
          category: "safety",
          message: `RAMS not received from ${name} — do not allow on site`,
        });
        markFired(id, fired);
      }
    }
  });
}

function checkVariations(fired) {
  const rows = asArray(ds.toolData("variation-instruction-log"));
  rows.forEach((r) => {
    if (r.submitted || r.status === "Submitted") return;
    const raised = r.dateRaised || r.raisedAt;
    if (!raised) return;
    const days = daysBetween(isoToday(), raised);
    if (days < 14) return;
    const id = `variation-not-submitted-${r.id || r.reference}-${raised}`;
    if (alreadyFired(id, fired)) return;
    addNotification({
      category: "commercial",
      message: `Variation ${r.reference || "—"} was raised ${days} days ago and has not been submitted — raise a Variation Order now`,
    });
    markFired(id, fired);
  });
}

function checkCommercialReportLoss(fired) {
  const rows = asArray(ds.toolData("commercial-report"));
  rows.forEach((r) => {
    if (typeof r.forecastProfitLoss !== "number" || r.forecastProfitLoss >= 0) return;
    const id = `commercial-loss-${r.project || r.id}-${isoToday()}`;
    if (alreadyFired(id, fired)) return;
    addNotification({
      category: "commercial",
      message: `Current forecast on ${r.project || "project"} shows a loss — review costs and outstanding variations`,
    });
    markFired(id, fired);
  });
}

function checkProcurement(fired) {
  const rows = asArray(ds.toolData("procurement-schedule"));
  const today = isoToday();
  rows.forEach((r) => {
    if (r.orderByDate && r.orderByDate === today && !r.ordered) {
      const id = `procurement-order-today-${r.id || r.item}-${today}`;
      if (!alreadyFired(id, fired)) {
        addNotification({
          category: "commercial",
          message: `${r.item || "Item"} must be ordered today to meet required delivery date`,
        });
        markFired(id, fired);
      }
    }
    if (r.expectedDeliveryDate && daysBetween(today, r.expectedDeliveryDate) > 0 && !r.delivered) {
      const id = `procurement-overdue-${r.id || r.item}-${r.expectedDeliveryDate}`;
      if (!alreadyFired(id, fired)) {
        addNotification({
          category: "commercial",
          message: `${r.item || "Item"} expected delivery date has passed — chase supplier`,
        });
        markFired(id, fired);
      }
    }
  });
}

function checkApprentices(fired) {
  const rows = asArray(ds.toolData("apprentice-manager"));
  const today = isoToday();
  rows.forEach((r) => {
    if (typeof r.offTheJobPercent === "number" && r.offTheJobPercent < 20) {
      const id = `apprentice-otj-${r.id || r.name}-${Math.floor(r.offTheJobPercent)}`;
      if (!alreadyFired(id, fired)) {
        addNotification({
          category: "compliance",
          message: `Apprentice ${r.name || "—"} off the job training is at ${r.offTheJobPercent}% — below the legal minimum of 20%`,
        });
        markFired(id, fired);
      }
    }
    if (r.nextReviewDate && daysBetween(today, r.nextReviewDate) > 0) {
      const id = `apprentice-review-${r.id || r.name}-${r.nextReviewDate}`;
      if (!alreadyFired(id, fired)) {
        addNotification({
          category: "compliance",
          message: `Apprentice ${r.name || "—"} progress review is overdue — schedule a review`,
        });
        markFired(id, fired);
      }
    }
  });
}

function checkIncidents(fired) {
  const reports = asArray(ds.toolData("incident-report"));
  reports.forEach((r) => {
    if (r.riddorReported && r.riddorReported !== "Not confirmed") return;
    if (r.riddorOutcome && r.riddorOutcome !== "unknown") return;
    const id = `incident-no-riddor-${r.id || r.reference}`;
    if (alreadyFired(id, fired)) return;
    addNotification({
      category: "safety",
      message: `Incident ${r.reference || "—"} — RIDDOR reportability not confirmed — review and update`,
    });
    markFired(id, fired);
  });
  const log = asArray(ds.toolData("incident-log"));
  log.forEach((r) => {
    if (r.reportRaised || r.status === "Closed — resolved") return;
    const id = `incident-log-no-report-${r.id || r.ref}`;
    if (alreadyFired(id, fired)) return;
    addNotification({
      category: "safety",
      message: `Incident ${r.ref || "—"} has no formal Incident Report — raise one now`,
    });
    markFired(id, fired);
  });
}

function checkDailyDiary(fired) {
  // Fires after 16:00 if no diary saved notification today.
  if (todayHour() < 16) return;
  const id = `daily-diary-${isoToday()}`;
  if (alreadyFired(id, fired)) return;
  const notes = ds.notifications();
  const today = isoToday();
  const hasDiary = notes.some((n) =>
    isSameDay(n.timestamp, today) &&
    (n.message.startsWith("Site Diary entry saved") || n.message.startsWith("Multi-user Site Diary saved"))
  );
  if (hasDiary) return;
  addNotification({
    category: "reminder",
    message: "Daily site diary not yet completed — complete before end of day",
  });
  markFired(id, fired);
}

function checkDailyLabourAllocation(fired) {
  // Fires after 07:00 if no labour allocation notification today.
  if (todayHour() < 7) return;
  const id = `daily-labour-${isoToday()}`;
  if (alreadyFired(id, fired)) return;
  const notes = ds.notifications();
  const today = isoToday();
  const hasLA = notes.some((n) =>
    isSameDay(n.timestamp, today) && n.message.startsWith("Labour Allocation generated")
  );
  if (hasLA) return;
  addNotification({
    category: "reminder",
    message: "Labour allocation not yet completed for today",
  });
  markFired(id, fired);
}

// ---------- runner ----------
let HAS_RUN = false;
export function runAlertChecks({ force = false } = {}) {
  if (HAS_RUN && !force) return; // guard against StrictMode double-mount
  HAS_RUN = true;
  const fired = readFired();
  try {
    checkMileageThreshold(fired);
    checkVatThreshold(fired);
    checkSelfAssessment(fired);

    checkPaymentTracker(fired);
    checkQuoteExpiry(fired);
    checkTenderExpiry(fired);
    checkRetentionRelease(fired);

    checkPatTest(fired);
    checkRamsLibrary(fired);
    checkSafetyReviewDue30("coshh", "COSHH Assessment")(fired);
    checkSafetyReviewDue30("noise-assessment", "Noise Assessment")(fired);
    checkSafetyReviewDue30("manual-handling", "Manual Handling Assessment")(fired);
    checkSafetyReviewDue30("hs-policy", "H&S Policy")(fired);
    checkHireAgreement(fired);
    checkDlpEnding(fired);
    checkPermitExpiryToday(fired);

    checkSubcontractors(fired);
    checkVariations(fired);
    checkCommercialReportLoss(fired);
    checkProcurement(fired);
    checkApprentices(fired);
    checkIncidents(fired);

    checkDailyDiary(fired);
    checkDailyLabourAllocation(fired);
  } finally {
    writeFired(fired);
  }
}

export function resetAlertFiredRegistry() {
  HAS_RUN = false;
  try { localStorage.removeItem(FIRED_KEY); } catch { /* ignore */ }
}

// Expose a tiny dev helper so the seed script can re-trigger the engine on demand.
if (typeof window !== "undefined") {
  window.__morrisRunAlerts = (opts) => runAlertChecks({ force: true, ...(opts || {}) });
  window.__morrisResetAlerts = resetAlertFiredRegistry;
}
