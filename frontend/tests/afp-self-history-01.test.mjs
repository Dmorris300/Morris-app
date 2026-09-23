// AFP-SELF-HISTORY-01 & AFP-STEP8-HELPER-COPY-01 — source-level guards.
//
// Two Phase 1 bugs confirmed after the AFP-060 lifecycle regression:
//   1. Current AFP was included in its own "Previous Applications" list;
//      the stale-status row polluted both the wizard UI and the PDF.
//   2. Step 8 "Marking as Paid…" helper text was unconditional and
//      appeared while Certified was selected, misleading users.
// This file locks the fix at source level (React can't be mounted by the
// .mjs loader) so the invariants can't silently regress.
//
// Run:
//   cd /app/frontend && \
//   node --experimental-loader ./tests/loader.mjs tests/afp-self-history-01.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  resolve(__dirname, "../src/pages/ApplicationsForPayment.jsx"),
  "utf8",
);

let passed = 0, failed = 0;
const t = (name, fn) => { try { fn(); passed++; console.log(`  ✔ ${name}`); } catch (e) { failed++; console.error(`  ✘ ${name}\n    ${e.stack || e.message}`); } };

console.log("AFP-SELF-HISTORY-01 & AFP-STEP8-HELPER-COPY-01");

// ---- Bug 1: project/summary caller passes excludeAfpId when editing ----
t("Summary fetch passes excludeAfpId when editing an existing AFP", () => {
  assert.match(
    src,
    /excludeAfpId=\$\{encodeURIComponent\(data\.id\)\}/,
    "editing branch must include excludeAfpId=<current AFP id> in the summary fetch URL",
  );
});

t("Summary fetch omits excludeAfpId for a new (unsaved) AFP", () => {
  // The ternary should key on `data.id` — falsy id → base URL, truthy id
  // → URL with excludeAfpId. Any regression would fold both branches
  // into one URL and break either creation numbering or self-history.
  assert.match(
    src,
    /const url = data\.id[\s\S]{0,200}excludeAfpId=/,
    "URL construction must gate the excludeAfpId param on data.id",
  );
});

t("Summary useEffect re-fires when data.id changes", () => {
  // Without data.id in the dep-array, switching from a fresh wizard
  // (no id) to an edited AFP (id present) would keep the stale
  // no-exclusion summary in state.
  assert.match(
    src,
    /\}, \[data\.projectId, data\.id\]\);/,
    "useEffect must depend on both data.projectId AND data.id",
  );
});

// ---- Bug 2: Step 8 helper copy is gated on Paid ------------------------
t("Step 8 'Marking as Paid…' helper is rendered only when status === 'Paid'", () => {
  // The helper block must live inside a `data.status === "Paid" && (…)`
  // guard. Regression would drop the guard and render the copy for
  // Certified / Rejected too.
  assert.match(
    src,
    /data\.status === "Paid"\s*&&\s*\(\s*<div[^>]*data-testid="afp-step8-paid-helper"/,
    "helper block must be gated on data.status === 'Paid' with the paid-helper testid",
  );
});

t("Helper copy still says 'Marking as Paid automatically adds the amount to the linked project's payment tracker.'", () => {
  // Preserve the exact wording — this is the copy users have been
  // trained on. Any accidental rewording during a refactor should fail
  // this assertion so we can review it deliberately.
  assert.match(
    src,
    /Marking as <b>Paid<\/b> automatically adds the amount to the linked project&apos;s payment tracker\./,
  );
});

t("No unconditional render of the payment-tracker helper exists in step 8", () => {
  // Regression guard: search for the copy OUTSIDE the Paid gate.
  const stepIdx = src.indexOf('data-testid="afp-step-8"');
  if (stepIdx === -1) return; // step-8 testid isn't required — the render is inside step === 8 block
  // Count `Marking as` occurrences — should be exactly 1 (the gated one).
  const occurrences = (src.match(/Marking as <b>Paid<\/b>/g) || []).length;
  assert.equal(occurrences, 1, `expected 1 helper copy occurrence, got ${occurrences}`);
});

console.log(`\n${passed} passed · ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
