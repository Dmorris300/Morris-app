// AFP-NEW-STATE-LEAK-01 — brand-new AFP must open blank, no state leak.
//
// User report (Sep 2026): after linking Riverside on a previous AFP, the
// AFP list was filtered by that project. Clicking "+ New Application"
// then opened a supposedly-new AFP already populated as:
//   Linked Project = Riverside Apartments External Works
//   Project Name   = Riverside Apartments External Works
//   Site Address   = 18 Riverside Way, Manchester, M3 4FP
//   Header        = £65,020.00 due
// A brand-new AFP must instead open completely blank.
//
// Root cause: `openNew` copied the list-view `filterProject` state onto
// the fresh `emptyAfp()` payload. The wizard's `data.projectId` change
// then fired the project-summary useEffect, hydrating previouslyCertified
// and other totals — hence the £65,020 header on a "new" AFP.
//
// Fix: strip the filterProject-based pre-fill from `openNew`. The list
// filter is a VIEW concern only. Templates and openEdit continue to work.
//
// This suite locks the fix at source level (the .mjs loader cannot mount
// React) and asserts every previously-reported leak-prone field defaults
// to a fresh empty value.
//
// Run:
//   cd /app/frontend && \
//   node --experimental-loader ./tests/loader.mjs tests/afp-new-state-leak-01.test.mjs

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

console.log("AFP-NEW-STATE-LEAK-01 — brand-new AFP must open blank");

// ---- Locate openNew ----------------------------------------------------
const openNewIdx = src.indexOf("const openNew = ");
assert.ok(openNewIdx > -1, "openNew declaration not found");
// The next `const ` at column 2 (or `};`) ends the function.
const openNewEndMarker = src.indexOf("const openEdit", openNewIdx);
assert.ok(openNewEndMarker > openNewIdx, "openEdit anchor not found after openNew");
const openNewBlock = src.slice(openNewIdx, openNewEndMarker);

// ---- Core invariant: no filterProject leak -----------------------------
t("openNew does NOT read `filterProject` — the list filter must never leak into a new AFP", () => {
  assert.equal(
    /filterProject/.test(openNewBlock),
    false,
    "openNew still references filterProject — brand-new AFP will silently inherit the list filter",
  );
});

t("openNew does NOT call `jobs.find(...)` — pre-filling from a linked project is a pickProject/openEdit concern only", () => {
  assert.equal(
    /jobs\.find\s*\(/.test(openNewBlock),
    false,
    "openNew still calls jobs.find — brand-new AFP is pulling job data on mount",
  );
});

t("openNew does NOT call `buildAfpClientFromJob(...)` — client mapping only runs when the user picks a project", () => {
  assert.equal(
    /buildAfpClientFromJob/.test(openNewBlock),
    false,
    "openNew still calls buildAfpClientFromJob — a new AFP is being auto-hydrated with a Job's client fields",
  );
});

t("openNew still starts from `emptyAfp()` (blank slate)", () => {
  assert.match(openNewBlock, /let base = emptyAfp\(\);/, "openNew must reset base with emptyAfp()");
});

t("openNew still wipes the legacy DRAFT_KEY localStorage cache", () => {
  assert.match(
    openNewBlock,
    /localStorage\.removeItem\(DRAFT_KEY\)/,
    "openNew must always remove DRAFT_KEY so a stale local draft does not re-hydrate",
  );
});

t("openNew still ends by mounting the wizard with the fresh base", () => {
  assert.match(
    openNewBlock,
    /setEditing\(base\);\s*setWizardOpen\(true\);/,
    "openNew must setEditing(base) + setWizardOpen(true) at the end",
  );
});

// ---- emptyAfp() blanket-blank guarantees --------------------------------
// The user explicitly called out these previously-leak-prone fields:
//   Photo Vault selections, signatures, certifier details, status,
//   amount paid, paid date. Lock their empty-defaults so a future
//   regression here cannot re-introduce the leak.
const emptyIdx = src.indexOf("const emptyAfp = () => (");
assert.ok(emptyIdx > -1, "emptyAfp declaration not found");
const emptyEnd = src.indexOf("});", emptyIdx) + 3;
const emptyBlock = src.slice(emptyIdx, emptyEnd);

t("emptyAfp — projectId / projectName / projectAddress default blank", () => {
  assert.match(emptyBlock, /projectId:\s*""/,      "projectId must default to ''");
  assert.match(emptyBlock, /projectName:\s*""/,    "projectName must default to ''");
  assert.match(emptyBlock, /projectAddress:\s*""/, "projectAddress must default to ''");
});

t("emptyAfp — client contact block defaults blank (no cross-AFP leak)", () => {
  assert.match(emptyBlock, /clientName:\s*""/,    "clientName must default to ''");
  assert.match(emptyBlock, /clientCompany:\s*""/, "clientCompany must default to ''");
  assert.match(emptyBlock, /clientEmail:\s*""/,   "clientEmail must default to ''");
  assert.match(emptyBlock, /clientPhone:\s*""/,   "clientPhone must default to ''");
});

t("emptyAfp — Photo Vault selections default to []", () => {
  assert.match(emptyBlock, /photoIds:\s*\[\]/, "photoIds must default to []");
});

t("emptyAfp — supporting docs default to []", () => {
  assert.match(emptyBlock, /supportingDocs:\s*\[\]/, "supportingDocs must default to []");
});

t("emptyAfp — signatures default to '' (no leaked signature carry-over)", () => {
  assert.match(emptyBlock, /preparedSignature:\s*""/,  "preparedSignature must default to ''");
  assert.match(emptyBlock, /certifierSignature:\s*""/, "certifierSignature must default to ''");
});

t("emptyAfp — certifier name / role / signed date default blank", () => {
  assert.match(emptyBlock, /certifierName:\s*""/,  "certifierName must default to ''");
  assert.match(emptyBlock, /certifierRole:\s*""/,  "certifierRole must default to ''");
  assert.match(emptyBlock, /certifiedDate:\s*""/,  "certifiedDate must default to ''");
  assert.match(emptyBlock, /certifiedAmount:\s*0/, "certifiedAmount must default to 0");
});

t("emptyAfp — amount paid / paid date default to 0 / '' (no financial leak)", () => {
  assert.match(emptyBlock, /paidAmount:\s*0/, "paidAmount must default to 0");
  assert.match(emptyBlock, /paidDate:\s*""/,  "paidDate must default to ''");
});

t("emptyAfp — status defaults to 'Draft'", () => {
  assert.match(emptyBlock, /status:\s*"Draft"/, "status must default to 'Draft'");
});

t("emptyAfp — running-total inputs default to 0 (no £65,020 leak)", () => {
  assert.match(emptyBlock, /approvedVariationsValue:\s*0/, "approvedVariationsValue must default to 0");
  assert.match(emptyBlock, /previouslyCertified:\s*0/,     "previouslyCertified must default to 0");
  assert.match(emptyBlock, /previousRetentionHeld:\s*0/,   "previousRetentionHeld must default to 0");
  assert.match(emptyBlock, /contractSum:\s*0/,             "contractSum must default to 0");
  assert.match(emptyBlock, /applicationNumber:\s*0/,       "applicationNumber must default to 0");
});

// ---- openEdit + duplicate remain intact --------------------------------
// These are the legitimate paths that DO copy data from an existing AFP.
// Regression-guards against someone "helpfully" merging openNew logic here.
t("openEdit still spreads the existing record over emptyAfp defaults (Resume V2)", () => {
  assert.match(
    src,
    /const openEdit = \(a\) => \{ setEditing\(\{ \.\.\.emptyAfp\(\), \.\.\.a \}\); setWizardOpen\(true\); \};/,
    "openEdit signature changed — Resume flow may be broken",
  );
});

t("duplicate still wipes signatures + photos + paid amounts (per P1.2)", () => {
  const dupIdx = src.indexOf("const duplicate = (a) => {");
  assert.ok(dupIdx > -1, "duplicate declaration not found");
  const dupEndMarker = src.indexOf("const deleteApp", dupIdx);
  assert.ok(dupEndMarker > dupIdx, "deleteApp anchor not found after duplicate");
  const dupBlock = src.slice(dupIdx, dupEndMarker);
  assert.match(dupBlock, /c\.photoIds = \[\]/,          "duplicate must wipe photoIds");
  assert.match(dupBlock, /c\.supportingDocs = \[\]/,    "duplicate must wipe supportingDocs");
  assert.match(dupBlock, /c\.preparedSignature = ""/,   "duplicate must wipe preparedSignature");
  assert.match(dupBlock, /c\.certifierSignature = ""/,  "duplicate must wipe certifierSignature");
  assert.match(dupBlock, /c\.paidAmount = 0/,           "duplicate must wipe paidAmount");
  assert.match(dupBlock, /c\.paidDate = ""/,            "duplicate must wipe paidDate");
  assert.match(dupBlock, /c\.certifiedAmount = 0/,      "duplicate must wipe certifiedAmount");
  assert.match(dupBlock, /c\.certifiedDate = ""/,       "duplicate must wipe certifiedDate");
  assert.match(dupBlock, /c\.status = "Draft"/,         "duplicate must reset status to Draft");
});

console.log(`\n${passed} passed · ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
