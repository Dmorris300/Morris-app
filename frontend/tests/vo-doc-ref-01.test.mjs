// VO-DOC-REF-01 — supporting document reference "MEP-L2-REV03" is
// missing from the generated Variation Order PDF when the reference
// lives ONLY in `supportingDocs[].name` (i.e. the user attaches it as a
// supporting doc but does not also type it into the reference-docs text
// field).
//
// Run: cd /app/frontend && node --experimental-loader ./tests/loader.mjs tests/vo-doc-ref-01.test.mjs

import assert from "node:assert/strict";
import { generateVariationPdf } from "../src/lib/variation-order-pdf";

const USER = { fullName: "Preview QA", username: "previewqa", companyName: "Preview QA Ltd" };

const BASE = {
  projectName: "Doc-ref repro", clientName: "Repro Client", variationRef: "VO-901",
  variationDate: "2026-09-13", instructionDate: "2026-09-13",
  status: "Submitted", reason: "Client Request", instructionMethod: "Written",
  lineItems: [{ id: "l1", category: "Labour", description: "L1", qty: 1, unit: "day", unitPrice: 100 }],
  addVat: false, vatRate: 20,
  programmeImpact: { kind: "No impact", days: 0, newPCDate: "", notes: "" },
  photoIds: [], preparedBy: "Preview QA",
};

let passed = 0, failed = 0;
const t = (n, fn) => { try { fn(); passed++; console.log(`  ✔ ${n}`); } catch (e) { failed++; console.error(`  ✘ ${n}\n    ${e.stack || e.message}`); } };

console.log("VO-DOC-REF-01 — supporting doc reference visibility in PDF");

t("reference-only in referenceDocs text field → visible", () => {
  const data = { ...BASE, referenceDocs: "MEP-L2-REV03", supportingDocs: [] };
  const raw = generateVariationPdf({ data, user: USER, today: "13/09/2026" }).output();
  assert.ok(raw.includes("MEP-L2-REV03"), "referenceDocs text should render on PDF");
});

t("reference-only in supportingDocs[].name → MUST be visible on PDF (bug repro)", () => {
  const data = { ...BASE, referenceDocs: "", supportingDocs: [{ id: "d1", name: "MEP-L2-REV03 drawing package.pdf", url: "" }] };
  const raw = generateVariationPdf({ data, user: USER, today: "13/09/2026" }).output();
  assert.ok(raw.includes("MEP-L2-REV03"), "supportingDocs.name should render on PDF but doesn't");
});

t("supportingDocs with URL — both name and URL render (or filename fallback)", () => {
  const data = { ...BASE, supportingDocs: [{ id: "d1", name: "Client Instruction MEP-L2-REV03.pdf", url: "https://example.com/mep-l2-rev03.pdf" }] };
  const raw = generateVariationPdf({ data, user: USER, today: "13/09/2026" }).output();
  assert.ok(raw.includes("MEP-L2-REV03"), "MEP-L2-REV03 should render (from name)");
});

t("mixed: 3 supporting docs with the reference in doc 2 → all rendered", () => {
  const data = {
    ...BASE,
    supportingDocs: [
      { id: "d1", name: "Client Email.pdf", url: "" },
      { id: "d2", name: "MEP-L2-REV03 drawing package.pdf", url: "" },
      { id: "d3", name: "Site Photo.jpg", url: "" },
    ],
  };
  const raw = generateVariationPdf({ data, user: USER, today: "13/09/2026" }).output();
  assert.ok(raw.includes("Client Email.pdf"), "doc 1 name missing");
  assert.ok(raw.includes("MEP-L2-REV03"), "doc 2 MEP-L2-REV03 reference missing");
  assert.ok(raw.includes("Site Photo.jpg"), "doc 3 name missing");
});

// Real user scenario: reference number typed into the URL/reference field
// instead of the name field, or the doc has a bare reference number as
// its name with no filename or extension.
t("supportingDoc where the URL/reference field carries MEP-L2-REV03 — MUST render", () => {
  const data = {
    ...BASE,
    supportingDocs: [{ id: "d1", name: "", url: "MEP-L2-REV03" }],
  };
  const raw = generateVariationPdf({ data, user: USER, today: "13/09/2026" }).output();
  assert.ok(raw.includes("MEP-L2-REV03"), "MEP-L2-REV03 dropped when only URL/reference is filled");
});

t("supportingDoc with only the raw reference (no filename) → renders as-is", () => {
  const data = {
    ...BASE,
    supportingDocs: [{ id: "d1", name: "MEP-L2-REV03", url: "" }],
  };
  const raw = generateVariationPdf({ data, user: USER, today: "13/09/2026" }).output();
  assert.ok(raw.includes("MEP-L2-REV03"), "bare reference dropped");
});

t("supportingDoc with both name AND URL populated → both surface on PDF", () => {
  const data = {
    ...BASE,
    supportingDocs: [{ id: "d1", name: "Drawing package", url: "https://drawings.example.com/MEP-L2-REV03" }],
  };
  const raw = generateVariationPdf({ data, user: USER, today: "13/09/2026" }).output();
  assert.ok(raw.includes("Drawing package"), "doc name missing");
  assert.ok(raw.includes("MEP-L2-REV03"), "URL/reference value MEP-L2-REV03 missing from PDF");
});

console.log(`\n${passed} passed · ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
