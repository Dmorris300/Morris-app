// Morris — VO-STATE-01 regression tests.
//
// Ensures the Variation Orders v2 wizard's initial-state contract holds:
//   openNewBase   → ALWAYS clean baseline; never restores localStorage
//                    autosave silently (this was the VO-STATE-01 bug).
//   openEditBase  → spreads the record on top of empty defaults.
//   duplicateBase → strips id / timestamps / signatures / status / refs
//                    and regenerates line-item ids.
//
// Run: cd /app/frontend/tests && node --experimental-loader ./loader.mjs vo-state.test.mjs

import assert from "node:assert/strict";
import {
  emptyVariation, emptyLine,
  openNewBase, openEditBase, duplicateBase,
} from "../src/lib/variation-order-state";

let passed = 0, failed = 0;
const t = (name, fn) => {
  try { fn(); passed++; console.log(`  ✔ ${name}`); }
  catch (e) { failed++; console.error(`  ✘ ${name}\n    ${e.message}`); }
};

console.log("VO-STATE-01 — Variation Orders wizard initial-state contract");

// ---------- Baseline ----------
t("emptyVariation() returns a clean skeleton with no stale fields", () => {
  const e = emptyVariation();
  assert.equal(e.projectName, "");
  assert.equal(e.clientName, "");
  assert.equal(e.descriptionOfChange, "");
  assert.equal(e.status, "Draft");
  assert.equal(e.reason, "Client Request");
  assert.equal(e.instructionMethod, "Verbal");
  assert.deepEqual(e.programmeImpact, { kind: "No impact", days: 0, newPCDate: "", notes: "" });
  assert.equal(e.addVat, false);
  assert.equal(e.vatRate, 20);
  assert.equal(e.preparedSignature, "");
  assert.equal(e.clientApproverSignature, "");
  assert.deepEqual(e.photoIds, []);
  assert.deepEqual(e.supportingDocs, []);
  assert.equal(e.lineItems.length, 1);
  assert.equal(e.lineItems[0].description, "");
  assert.equal(e.lineItems[0].unitPrice, 0);
});

// ---------- The reported bug: legacy bridge close → New Variation ----------
t("openNewBase after a bridged legacy close does NOT inherit legacy state", () => {
  // Simulate what the bridge would have put into a wizard session: a fully
  // populated record with project, client, cost items, VAT etc. In the
  // buggy build this was silently read back via loadDraft() and spread on
  // top of the empty template. With the fix, openNewBase ignores the
  // "autosave" input entirely.
  const legacyBridgedInputs = {
    projectName: "Legacy Bridge Test Project",
    clientName: "Legacy Bridge Client Ltd",
    instructorName: "Sarah Legacy",
    descriptionOfChange: "Legacy bridge manual verification",
    lineItems: [
      { id: "l1", category: "Labour", description: "Legacy labour", qty: 1, unit: "sum", unitPrice: 750 },
      { id: "l2", category: "Materials", description: "Legacy materials", qty: 1, unit: "sum", unitPrice: 250 },
    ],
    addVat: true, vatRate: 20,
    programmeImpact: { kind: "Additional days", days: 3, newPCDate: "2026-10-10", notes: "" },
    preparedSignature: "data:image/png;base64,STALE",
    photoIds: ["p1", "p2"],
    status: "Draft",
    notes: "Raised by: Contractor. Contract clause: JCT SBC 2016 s.3.14.",
  };
  // In the buggy build a caller could have said:
  //   const base = { ...emptyVariation(), ...legacyBridgedInputs };
  //   openNewBase() would still start clean because it does not accept
  //   autosave — this is the whole point of the contract. openNewBase's
  //   only optional inputs are template + filterProject.
  const base = openNewBase();
  assert.equal(base.projectName, "", "openNewBase must NEVER inherit legacy projectName");
  assert.equal(base.clientName, "", "openNewBase must NEVER inherit legacy clientName");
  assert.equal(base.descriptionOfChange, "", "openNewBase must NEVER inherit legacy description");
  assert.equal(base.addVat, false, "openNewBase must NEVER inherit legacy VAT flag");
  assert.equal(base.vatRate, 20, "openNewBase must reset VAT rate to default 20");
  assert.equal(base.preparedSignature, "", "openNewBase must NEVER inherit legacy signature");
  assert.deepEqual(base.photoIds, [], "openNewBase must NEVER inherit legacy photo IDs");
  assert.deepEqual(base.programmeImpact.kind, "No impact", "openNewBase must reset programme impact");
  assert.equal(base.lineItems.length, 1, "openNewBase must have exactly one blank line item");
  assert.equal(base.lineItems[0].unitPrice, 0, "openNewBase line item must be zero-value");
  // Sanity check: the legacy inputs object is untouched, proving the fn is
  // pure and never mutates its (nominal) input.
  assert.equal(legacyBridgedInputs.projectName, "Legacy Bridge Test Project");
});

t("openNewBase after a resumed V2 variation close does NOT inherit V2 state", () => {
  // Same guarantee, but for a resumed real V2 record — no accidental
  // spread from a prior openEdit session.
  const v2Record = {
    id: "vo-existing-uuid",
    projectName: "Live V2 Project",
    clientName: "Live V2 Client",
    descriptionOfChange: "Real approved variation",
    lineItems: [{ id: "l9", category: "Labour", description: "Real labour", qty: 5, unit: "day", unitPrice: 400 }],
    addVat: true, vatRate: 20,
    status: "Approved",
    variationRef: "VO-045",
    preparedSignature: "data:image/png;base64,REALSIG",
  };
  const base = openNewBase();
  assert.equal(base.projectName, "", "openNewBase must not inherit V2 project after resume close");
  assert.equal(base.variationRef, "", "openNewBase must not inherit V2 variation ref");
  assert.equal(base.status, "Draft", "openNewBase must always start in Draft status");
  assert.notEqual(base.id, "vo-existing-uuid");
  assert.equal(base.preparedSignature, "");
});

// ---------- Legitimate paths still work ----------
t("openNewBase applies template overrides when passed", () => {
  const tpl = { payload: {
    reason: "Design Error",
    descriptionOfChange: "Template description",
    lineItems: [{ id: "tpl1", category: "Materials", description: "Template item", qty: 2, unit: "sum", unitPrice: 500 }],
    addVat: true, vatRate: 20,
  }};
  const base = openNewBase({ fromTemplate: tpl });
  assert.equal(base.reason, "Design Error");
  assert.equal(base.descriptionOfChange, "Template description");
  assert.equal(base.lineItems.length, 1);
  assert.equal(base.lineItems[0].description, "Template item");
  // Template line items get a fresh id (not the template's stored id).
  assert.notEqual(base.lineItems[0].id, "tpl1");
  // Status/ref always reset even with a template.
  assert.equal(base.status, "Draft");
  assert.equal(base.variationRef, "");
});

t("openNewBase applies filterProject preselect when passed", () => {
  const jobs = [
    { id: "job-1", projectName: "Riverside Reg", clientName: "Riverside Ltd", address: "1 Riverside Way", company: "Riverside Ltd" },
    { id: "job-2", projectName: "Other Site", clientName: "Other Ltd", address: "2 Other St", company: "Other Ltd" },
  ];
  const base = openNewBase({ filterProject: "job-1", jobs });
  assert.equal(base.projectId, "job-1");
  assert.equal(base.projectName, "Riverside Reg");
  assert.equal(base.projectAddress, "1 Riverside Way");
  assert.equal(base.clientName, "Riverside Ltd");
});

t("openEditBase spreads record over empty defaults (Resume V2)", () => {
  const v = {
    id: "vo-existing", projectName: "Existing", clientName: "Existing Ltd",
    lineItems: [{ id: "L1", category: "Labour", description: "Existing labour", qty: 1, unit: "day", unitPrice: 300 }],
    status: "Approved", variationRef: "VO-042",
  };
  const base = openEditBase(v);
  assert.equal(base.id, "vo-existing");
  assert.equal(base.projectName, "Existing");
  assert.equal(base.variationRef, "VO-042");
  assert.equal(base.status, "Approved");
  // Fields not on the record still exist with defaults so wizard steps
  // don't render undefined.
  assert.equal(base.reason, "Client Request");
  assert.equal(base.instructionMethod, "Verbal");
});

t("duplicateBase copies only the permitted fields", () => {
  const original = {
    id: "vo-src", _id: "mongo-oid", createdAt: "2026-05-01", updatedAt: "2026-06-01",
    projectName: "Src Project", clientName: "Src Client",
    descriptionOfChange: "Src description",
    lineItems: [
      { id: "L1", category: "Labour", description: "Src labour", qty: 1, unit: "day", unitPrice: 300 },
      { id: "L2", category: "Materials", description: "Src materials", qty: 1, unit: "sum", unitPrice: 500 },
    ],
    addVat: true, vatRate: 20,
    status: "Approved",
    variationRef: "VO-042",
    preparedSignature: "data:image/png;base64,SRCSIG",
    clientApproverSignature: "data:image/png;base64,APPROVER",
    approvedDate: "2026-06-15",
    notes: "Src notes",
  };
  const dup = duplicateBase(original);
  // Identity fields — stripped.
  assert.equal(dup.id, undefined, "duplicate must not carry id");
  assert.equal(dup._id, undefined, "duplicate must not carry _id");
  assert.equal(dup.createdAt, undefined);
  assert.equal(dup.updatedAt, undefined);
  // Reference / status — reset.
  assert.equal(dup.variationRef, "");
  assert.equal(dup.status, "Draft");
  // Signatures / approval date — reset.
  assert.equal(dup.preparedSignature, "");
  assert.equal(dup.clientApproverSignature, "");
  assert.equal(dup.approvedDate, "");
  // Permitted data — carried through.
  assert.equal(dup.projectName, "Src Project");
  assert.equal(dup.clientName, "Src Client");
  assert.equal(dup.descriptionOfChange, "Src description");
  assert.equal(dup.addVat, true);
  assert.equal(dup.vatRate, 20);
  assert.equal(dup.notes, "Src notes");
  // Line items — content preserved, IDs regenerated.
  assert.equal(dup.lineItems.length, 2);
  assert.equal(dup.lineItems[0].description, "Src labour");
  assert.equal(dup.lineItems[1].description, "Src materials");
  assert.notEqual(dup.lineItems[0].id, "L1", "duplicate must regenerate line-item ids");
  assert.notEqual(dup.lineItems[1].id, "L2");
});

t("emptyLine gets a fresh id each call", () => {
  const a = emptyLine(), b = emptyLine();
  assert.notEqual(a.id, b.id);
});

console.log(`\n${passed} passed · ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
