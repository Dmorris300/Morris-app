#!/usr/bin/env node
// Morris — Legacy variation-letter → V2 bridge unit test.
// Standalone Node script (no test runner needed). Exercises the pure
// mapper contract so a regression in the field mapping is caught.
//
// Run: node /app/frontend/tests/legacy-variation-letter-bridge.test.mjs
// Exit code 0 = all pass, non-zero = failure with details on stderr.

import assert from "node:assert/strict";
import {
  mapLegacyVariationLetterDraft,
  __test,
} from "../src/lib/legacy-variation-letter-bridge.js";

let passed = 0, failed = 0;
const t = (name, fn) => {
  try { fn(); passed++; console.log(`  ✔ ${name}`); }
  catch (e) { failed++; console.error(`  ✘ ${name}\n    ${e.message}`); }
};

console.log("legacy-variation-letter-bridge mapper");

// --- Whole-payload happy path ---
t("full legacy payload maps every core field into V2 shape", () => {
  const values = {
    project: "Riverside Regeneration",
    client: "Riverside Regeneration Ltd",
    contractRef: "RVR-2026-01",
    contractDate: "2026-01-15",
    raisedBy: "Contractor",
    instructorName: "Michael Turner",
    instructorRole: "Project Manager",
    instructionDate: "2026-07-20T15:04",  // datetime-local shape
    instructionLocation: "Site Cabin",
    reasonForVariation: "Unforeseen Site Condition",
    instructionMethod: "Email",
    referenceDocuments: "RFI-014\nDrg A-102 Rev C",
    originalScope: "First fix mech to L3",
    variation: "Add fire dampers to grid B7 following M&E clash",
    labourCost: "2500",
    materialsCost: 1240.5,
    plantEquipmentCost: "",
    prelimsOverheads: 300,
    addVat: true,
    vatRate: 20,
    timeImpact: "3",
    newPCDate: "2026-09-10",
    clauseRef: "JCT SBC 2016 s.3.14",
  };
  const m = mapLegacyVariationLetterDraft(values);
  assert.equal(m.projectName, "Riverside Regeneration");
  assert.equal(m.clientName, "Riverside Regeneration Ltd");
  assert.equal(m.originalContractRef, "RVR-2026-01");
  assert.equal(m.originalContractDate, "2026-01-15");
  assert.equal(m.instructorName, "Michael Turner");
  assert.equal(m.instructorRole, "Project Manager");
  assert.equal(m.instructionDate, "2026-07-20", "instructionDate must be stripped to date-only for V2");
  assert.equal(m.instructionLocation, "Site Cabin");
  assert.equal(m.reason, "Unforeseen Site Condition");
  assert.equal(m.instructionMethod, "Email");
  assert.equal(m.referenceDocs, "RFI-014\nDrg A-102 Rev C");
  assert.equal(m.scopeSummary, "First fix mech to L3");
  assert.equal(m.descriptionOfChange, "Add fire dampers to grid B7 following M&E clash");
  assert.equal(m.addVat, true);
  assert.equal(m.vatRate, 20);
  // Line items — one per non-zero cost row.
  assert.equal(m.lineItems.length, 3, "expected 3 line items (labour, materials, prelims)");
  const cats = m.lineItems.map(l => l.category).sort();
  assert.deepEqual(cats, ["Labour", "Materials", "Preliminaries"]);
  const labour = m.lineItems.find(l => l.category === "Labour");
  assert.equal(labour.unitPrice, 2500);
  assert.equal(labour.qty, 1);
  // Programme impact
  assert.deepEqual(m.programmeImpact, { kind: "Additional days", days: 3, newPCDate: "2026-09-10", notes: "" });
  // Notes captures the two fields V2 has no home for.
  assert.equal(m.notes, "Raised by: Contractor. Contract clause: JCT SBC 2016 s.3.14.");
});

// --- Empty / null resilience ---
t("empty payload produces an empty mapping (no throws)", () => {
  const m = mapLegacyVariationLetterDraft({});
  assert.equal(m.projectName, "");
  assert.equal(m.clientName, "");
  assert.equal(m.reason, "Client Request", "default reason when input missing");
  assert.equal(m.instructionMethod, "Verbal", "default method when input missing");
  assert.equal(m.addVat, false);
  assert.equal(m.vatRate, 20);
  assert.deepEqual(m.programmeImpact, { kind: "No impact", days: 0, newPCDate: "", notes: "" });
  assert.ok(!m.lineItems || m.lineItems.length === 0, "no line items when all costs are blank");
  assert.ok(!m.notes, "no notes when raisedBy/clauseRef are blank");
});
t("null / non-object input yields empty object (no throws)", () => {
  assert.deepEqual(mapLegacyVariationLetterDraft(null), {});
  assert.deepEqual(mapLegacyVariationLetterDraft(undefined), {});
  assert.deepEqual(mapLegacyVariationLetterDraft("not an object"), {});
});

// --- Reason / method / role coercion ---
t("unknown reason coerces to 'Client Request'", () => {
  assert.equal(mapLegacyVariationLetterDraft({ reasonForVariation: "Not a real reason" }).reason, "Client Request");
});
t("unknown instruction method coerces to 'Verbal'", () => {
  assert.equal(mapLegacyVariationLetterDraft({ instructionMethod: "Carrier pigeon" }).instructionMethod, "Verbal");
});
t("unknown instructor role coerces to blank so wizard prompts user", () => {
  assert.equal(mapLegacyVariationLetterDraft({ instructorRole: "Contracts Manager" }).instructorRole, "");
});

// --- Programme impact edge cases ---
t("timeImpact = 0 with no newPCDate → No impact", () => {
  const m = mapLegacyVariationLetterDraft({ timeImpact: 0 });
  assert.equal(m.programmeImpact.kind, "No impact");
});
t("timeImpact = 0 with newPCDate → Additional days, 0 days, date preserved", () => {
  const m = mapLegacyVariationLetterDraft({ timeImpact: 0, newPCDate: "2026-12-31" });
  assert.equal(m.programmeImpact.kind, "Additional days");
  assert.equal(m.programmeImpact.days, 0);
  assert.equal(m.programmeImpact.newPCDate, "2026-12-31");
});

// --- Cost extraction ---
t("only supplied cost rows become line items (zero / blank rows omitted)", () => {
  const m = mapLegacyVariationLetterDraft({ labourCost: 100, materialsCost: 0, plantEquipmentCost: "", prelimsOverheads: 50 });
  const cats = m.lineItems.map(l => l.category).sort();
  assert.deepEqual(cats, ["Labour", "Preliminaries"]);
});
t("negative or malformed cost values coerce to 0 and are dropped", () => {
  const m = mapLegacyVariationLetterDraft({ labourCost: "abc", materialsCost: -5 });
  // -5 is a finite number so _num returns -5 → NOT > 0 → dropped
  assert.ok(!m.lineItems || m.lineItems.length === 0);
});

// --- VAT ---
t("addVat=true with blank vatRate defaults to 20", () => {
  const m = mapLegacyVariationLetterDraft({ addVat: true, vatRate: "" });
  assert.equal(m.addVat, true);
  assert.equal(m.vatRate, 20);
});
t("vatRate carries a numeric override through", () => {
  const m = mapLegacyVariationLetterDraft({ addVat: true, vatRate: "5" });
  assert.equal(m.vatRate, 5);
});

// --- Internals sanity ---
t("_dateOnly strips T-suffix", () => {
  assert.equal(__test._dateOnly("2026-07-20T15:04"), "2026-07-20");
  assert.equal(__test._dateOnly("2026-07-20"), "2026-07-20");
  assert.equal(__test._dateOnly(""), "");
});

console.log(`\n${passed} passed · ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
