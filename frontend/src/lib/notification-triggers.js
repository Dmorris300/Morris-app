// Morris notification triggers — Phase 2.
// Maps each tool's `/generate` POST into a bell notification with a
// category-aware, sometimes parametised, message.
//
// Wired up via the axios response interceptor in lib/api.js. Tools that
// don't hit /generate (e.g. Mileage Tracker local add) call
// `fireToolNotification` directly.

import { addNotification } from "./notifications";

// ---------- Categories ----------
//   document    — generic document generation
//   finance     — invoices, payment chasers, retention chasers, debt letters
//   safety      — health & safety records (RAMS, TBT, Permits, Rescue, Asbestos, COSHH, Noise, Manual Handling, Incident)
//   compliance  — regulatory letters (HMRC, contract review, dispute timeline, Self Assessment, CIS calc)
//   commercial  — variations, valuations, commercial reports, contract / variation registers
//   reminder    — date triggered (Phase 3 use mostly; safe default)

const C = {
  DOC:        "document",
  FIN:        "finance",
  SAFETY:     "safety",
  COMPLIANCE: "compliance",
  COMMERCIAL: "commercial",
  REMINDER:   "reminder",
};

// Small helpers for builders
const ord = (n) => `${n}`;
const safe = (v, fallback = "—") => {
  if (v === undefined || v === null) return fallback;
  const s = String(v).trim();
  return s.length === 0 ? fallback : s;
};
const def = (toolName) => `${toolName} generated`;

// ---------- Registry ----------
// Each entry: { category, build({ toolName, userInputs }) -> string }
const TRIGGER_REGISTRY = {
  // ============ DOCUMENT / GENERIC ============
  "variation-order":                  { category: C.COMMERCIAL, build: ({ toolName }) => def(toolName) },
  "rams":                             { category: C.SAFETY,     build: () => "RAMS generated — remember to communicate to all workers before works begin" },
  "site-diary":                       { category: C.DOC,        build: () => "Site Diary entry saved" },
  "multiuser-site-diary":             { category: C.DOC,        build: () => "Multi-user Site Diary saved" },
  "quote-builder":                    { category: C.FIN,        build: () => "Quote Builder — quote generated" },
  "cis-invoice":                      { category: C.FIN,        build: () => "CIS Invoice generated" },
  "delay-notice":                     { category: C.COMMERCIAL, build: () => "Delay Notice generated — request written acknowledgement from recipient" },
  "practical-completion":             { category: C.DOC,        build: () => "Practical Completion Certificate generated" },
  "subcontract-letter":               { category: C.DOC,        build: () => "Subcontract Letter generated" },
  "complaint-letter":                 { category: C.DOC,        build: () => "Complaint Letter generated" },
  "timesheet":                        { category: C.DOC,        build: () => "Timesheet generated" },
  "daywork-sheet":                    { category: C.DOC,        build: () => "Daywork Sheet generated" },
  "application-for-payment":          { category: C.FIN,        build: () => "Application for Payment submitted" },

  "retention-chaser":                 {
    category: C.FIN,
    build: ({ userInputs }) => `Retention Chaser Stage ${ord(safe(userInputs?.stage, "1"))} generated`,
  },

  "final-account":                    { category: C.FIN,        build: () => "Final Account Statement generated" },
  "contra-charge-dispute":            { category: C.COMMERCIAL, build: () => "Contra Charge Dispute letter generated" },
  "eot-claim":                        { category: C.COMMERCIAL, build: () => "Extension of Time Claim generated" },
  "lds-dispute":                      { category: C.COMMERCIAL, build: () => "LDs Dispute letter generated" },
  "progress-report":                  { category: C.DOC,        build: () => "Progress Report generated" },
  "novation-letter":                  { category: C.DOC,        build: () => "Novation Letter generated" },
  "bad-debt-letter":                  { category: C.FIN,        build: () => "Final demand issued — retain copy for your records" },
  "verbal-to-variation":              { category: C.COMMERCIAL, build: () => "Verbal instruction converted to Variation Order — submit promptly" },
  "photo-to-document":                { category: C.DOC,        build: () => "Photo to Document generated" },

  "payment-chaser":                   {
    category: C.FIN,
    build: ({ userInputs }) => {
      const stage = ord(safe(userInputs?.stage, "1"));
      const invoice = safe(userInputs?.invNo, "");
      const client = safe(userInputs?.clientName, "");
      const tail = [invoice, client].filter(Boolean).join(" — ");
      return `Payment Chaser Stage ${stage} sent${tail ? ` — ${tail}` : ""}`;
    },
  },

  "cis-calculator":                   { category: C.COMPLIANCE, build: () => "CIS Calculator — calculation saved" },
  "self-assessment-prep":             { category: C.COMPLIANCE, build: () => "Self Assessment Prep — document generated" },

  "price-work-quote":                 {
    category: C.FIN,
    build: ({ userInputs }) => {
      const ref = safe(userInputs?.quoteRef, "");
      const valid = safe(userInputs?.validUntil, "");
      const refPart = ref ? ` ${ref}` : "";
      const validPart = valid && valid !== "—" ? ` — valid until ${valid}` : "";
      return `Quote${refPart} generated${validPart}`;
    },
  },

  "scope-of-works":                   { category: C.DOC,        build: () => "Scope of Works generated" },
  "standing-time":                    { category: C.COMMERCIAL, build: () => "Standing Time Calculator — claim calculated" },
  "pricework-profit":                 { category: C.FIN,        build: () => "Price Work Profit Calculator — calculation saved" },
  "hmrc-correspondence":              { category: C.COMPLIANCE, build: () => "HMRC response letter generated — send before deadline" },
  "reference-letter":                 { category: C.DOC,        build: () => "Reference Letter generated" },

  "rate-increase-letter":             {
    category: C.FIN,
    build: ({ userInputs }) => {
      const effective = safe(userInputs?.effectiveFrom || userInputs?.effectiveDate || userInputs?.effectiveFromUk, "");
      return `Rate increase letter generated${effective && effective !== "—" ? ` — effective from ${effective}` : ""}`;
    },
  },

  "contract-review":                  { category: C.COMPLIANCE, build: () => "Contract Review completed" },
  "dispute-timeline":                 { category: C.COMPLIANCE, build: () => "Dispute Timeline updated" },
  "incident-report":                  { category: C.SAFETY,     build: () => "Incident Report generated" },
  "toolbox-talk":                     { category: C.SAFETY,     build: () => "Toolbox Talk record generated — ensure all workers sign before works begin" },
  "asbestos-record":                  { category: C.SAFETY,     build: () => "Asbestos record raised — works must remain stopped until material is assessed by a qualified surveyor" },
  "snagging-list":                    { category: C.DOC,        build: () => "Snagging List generated" },

  "site-access-permit":               {
    category: C.SAFETY,
    build: ({ userInputs }) => {
      const ref = safe(userInputs?.permitRef, "");
      const validTo = safe(userInputs?.validToUk, "");
      const refPart = ref ? ` ${ref}` : "";
      const validPart = validTo && validTo !== "—" ? ` — valid until ${validTo}` : "";
      return `Permit${refPart} issued${validPart}`;
    },
  },

  "measurement-record":               { category: C.DOC,        build: () => "Measurement Record saved" },
  "weather-log":                      { category: C.DOC,        build: () => "Weather Log entry saved" },
  "prestart-meeting":                 { category: C.SAFETY,     build: () => "Pre-start checklist generated — ensure all attendees sign before works begin" },
  "meeting-notes":                    { category: C.DOC,        build: () => "Meeting notes generated — circulate to all attendees within 24 hours" },
  "delivery-record":                  { category: C.DOC,        build: () => "Delivery Record saved" },
  "tool-register":                    { category: C.DOC,        build: () => "Tool and Equipment Register saved" },
  "procurement-schedule":             { category: C.DOC,        build: () => "Procurement Schedule updated" },
  "risk-register":                    { category: C.SAFETY,     build: () => "Risk Register generated" },

  "variation-instruction-log":        {
    category: C.COMMERCIAL,
    build: ({ userInputs }) => {
      const count = safe(userInputs?.outstandingCount || userInputs?.variationCount, "");
      const total = safe(userInputs?.outstandingTotal || userInputs?.totalOutstanding, "");
      const tail = (count || total) ? ` — ${safe(count, "0")} variations totalling £${safe(total, "0")} outstanding` : "";
      return `Variation log updated${tail}`;
    },
  },

  "coshh":                            { category: C.SAFETY,     build: () => "COSHH Assessment generated" },
  "noise-assessment":                 { category: C.SAFETY,     build: () => "Noise Assessment generated" },
  "manual-handling":                  { category: C.SAFETY,     build: () => "Manual Handling Assessment generated" },
  "working-at-height-rescue":         { category: C.SAFETY,     build: () => "Rescue plan generated — ensure all workers sign before works at height begin" },
  "subbie-mgmt":                      { category: C.COMMERCIAL, build: () => "Subcontractor Management register updated" },

  "variation-tracker":                {
    category: C.COMMERCIAL,
    build: ({ userInputs }) => {
      const total = safe(userInputs?.totalOutstanding || userInputs?.outstandingTotal, "");
      return `Variation tracker updated${total ? ` — total outstanding across all jobs: £${total}` : ""}`;
    },
  },

  "pricework-variation-tracker":      { category: C.COMMERCIAL, build: () => "Price Work Variation tracker updated" },

  "rams-library":                     { category: C.SAFETY,     build: () => "RAMS Library updated" },
  "contract-mgmt":                    { category: C.COMMERCIAL, build: () => "Contract Management register updated" },
  "payment-tracker":                  { category: C.FIN,        build: () => "Payment Tracker updated" },
  "incident-log":                     { category: C.SAFETY,     build: () => "Incident Log updated" },
  "labour-allocation":                { category: C.DOC,        build: () => "Labour Allocation generated" },
  "purchase-order":                   { category: C.FIN,        build: () => "Purchase Order generated" },
  "subbi-payment-certificate":        { category: C.FIN,        build: () => "Subbi Payment Certificate generated" },
  "commercial-report":                { category: C.COMMERCIAL, build: () => "Commercial Report generated" },
  "defects-tracker":                  { category: C.DOC,        build: () => "Defects Tracker updated" },
  "new-starter-pack":                 { category: C.DOC,        build: () => "New Starter Pack generated" },
  "hire-agreement":                   { category: C.DOC,        build: () => "Hire Agreement generated" },

  "tender-letter":                    {
    category: C.COMMERCIAL,
    build: ({ userInputs }) => {
      const ref = safe(userInputs?.tenderRef || userInputs?.ref, "");
      const valid = safe(userInputs?.validUntil || userInputs?.validUntilUk, "");
      const refPart = ref ? ` ${ref}` : "";
      const validPart = valid && valid !== "—" ? ` — valid until ${valid}` : "";
      return `Tender${refPart} submitted${validPart}`;
    },
  },

  // Mileage Tracker is wired directly via fireToolNotification in MileageTracker.jsx
  // (it does not call /generate). The registry entry is here so the message is consistent.
  "mileage":                          { category: C.DOC,        build: () => "Mileage Log entry added" },
};

/**
 * Look up category + message for a tool. Returns null for unknown tools (the
 * interceptor falls back to a generic "<toolName> generated" message).
 */
function lookup(toolId, payload) {
  const entry = TRIGGER_REGISTRY[toolId];
  if (!entry) return null;
  try {
    return { category: entry.category, message: entry.build(payload) };
  } catch {
    return { category: entry.category, message: def(payload.toolName || "Document") };
  }
}

/**
 * Fire a notification for a tool action. Called by the axios interceptor on
 * successful `/generate` responses, and by any tool whose action does not
 * pass through `/generate` (currently only Mileage Tracker).
 */
export function fireToolNotification({ toolId, toolName, userInputs }) {
  if (!toolId) return;
  const payload = { toolName: toolName || "", userInputs: userInputs || {} };
  const resolved = lookup(toolId, payload);
  const message = resolved ? resolved.message : def(payload.toolName || "Document");
  const category = resolved ? resolved.category : C.DOC;
  addNotification({ message, category });
}
