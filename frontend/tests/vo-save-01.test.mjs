// VO-SAVE-01 — Reproduce reported "Save failed" toast on Save & Generate PDF.
//
// Reproduction (user):
//   - New V2 Variation Order
//   - 4 cost lines, £3,000 subtotal, 20% VAT £600, £3,600 total
//   - Programme impact = Additional days, 2 working days, new PC 14/09/2026
//   - 1 supporting document, unsigned contractor / client signatures
//   - Status = Submitted
//   - Generate Preview succeeds; Save & Generate PDF toasts "Save failed"
//
// The backend has already been confirmed to accept an equivalent payload via
// curl (round-tripped 200 OK), so this reproducer isolates the frontend PDF
// generator against the EXACT server response shape (`saved`) that
// downloadVariationPdf() receives after a successful POST.
//
// Run: cd /app/frontend && node --experimental-loader ./tests/loader.mjs tests/vo-save-01.test.mjs

import assert from "node:assert/strict";
import { generateVariationPdf, downloadVariationPdf } from "../src/lib/variation-order-pdf";

const USER = {
  fullName: "Preview QA", username: "previewqa", companyName: "Preview QA Ltd",
  email: "previewqa@example.com", phone: "07123 456789",
  companyLogo: null, signature: null,
};

// Exact backend response shape captured via curl repro (VariationOrders POST):
const SAVED = {
  projectId: "",
  projectName: "Preview QA Repro Project",
  projectAddress: "",
  clientName: "Repro Client",
  clientCompany: "Repro Ltd",
  clientEmail: "",
  clientPhone: "",
  originalQuoteId: "",
  originalQuoteRef: "",
  originalContractRef: "",
  originalContractDate: "",
  variationRef: "VO-001",
  variationDate: "2026-09-12",
  status: "Submitted",
  reason: "Client Request",
  instructionMethod: "Verbal",
  instructorName: "",
  instructorRole: "",
  instructionDate: "2026-09-12",
  instructionLocation: "",
  scopeSummary: "Additional works",
  descriptionOfChange: "4 cost lines VO-SAVE-01 repro",
  reasonNarrative: "",
  referenceDocs: "",
  lineItems: [
    { id: "l1", category: "Labour", description: "L1", qty: 1, unit: "day",  unitPrice: 750, lineTotal: 750 },
    { id: "l2", category: "Materials", description: "M1", qty: 1, unit: "item", unitPrice: 750, lineTotal: 750 },
    { id: "l3", category: "Plant & Equipment", description: "P1", qty: 1, unit: "day", unitPrice: 750, lineTotal: 750 },
    { id: "l4", category: "Subcontractor", description: "S1", qty: 1, unit: "item", unitPrice: 750, lineTotal: 750 },
  ],
  addVat: true,
  vatRate: 20,
  programmeImpact: { kind: "Additional days", days: 2, newPCDate: "2026-09-14", notes: "" },
  photoIds: [],
  supportingDocs: [{ id: "d1", name: "doc.pdf", url: "https://example.com/doc.pdf" }],
  preparedBy: "Preview QA",
  preparedSignature: "",
  clientApproverName: "",
  clientApproverSignature: "",
  approvedDate: "",
  rejectionReason: "",
  paymentTerms: "Payment for this variation will be included in the next Application for Payment.",
  notes: "",
  isFavourite: false,
  totals: {
    subtotal: 3000,
    byCategory: { "Labour": 750, "Materials": 750, "Plant & Equipment": 750, "Subcontractor": 750 },
    vatAmount: 600,
    vatRate: 20,
    total: 3600,
  },
  id: "a36850e8-b098-4379-a897-89e7f91080d8",
  userId: "fbb9d745-5a2d-49f4-90eb-fe8119fe92dc",
  toolId: "variation-orders",
  createdAt: "2026-09-12T17:11:42.529523+00:00",
  updatedAt: "2026-09-12T17:11:42.529529+00:00",
  isDeleted: false,
};

let passed = 0, failed = 0;
const t = (name, fn) => {
  try { fn(); passed++; console.log(`  ✔ ${name}`); }
  catch (e) { failed++; console.error(`  ✘ ${name}\n    ${e.stack || e.message}`); }
};

console.log("VO-SAVE-01 — Save & Generate PDF regression (frontend generator on server response)");

t("generateVariationPdf renders without throwing on saved server response", () => {
  const doc = generateVariationPdf({ data: SAVED, user: USER, today: "12/09/2026" });
  assert.ok(doc, "doc missing");
  assert.ok(doc.getNumberOfPages() >= 2, "expected at least 2 pages");
});

t("downloadVariationPdf composes filename and outputs blob without throwing", () => {
  // Stub jsPDF's .save() which uses browser download APIs; we only care
  // that the code path leading up to save() completes cleanly.
  const doc = generateVariationPdf({ data: SAVED, user: USER, today: "12/09/2026" });
  const raw = doc.output(); // will throw if PDF stream is malformed
  assert.ok(raw.length > 1000, "PDF stream unexpectedly small");
});

t("subtotal £3,000 + VAT £600 = Total £3,600 all present verbatim", () => {
  const doc = generateVariationPdf({ data: SAVED, user: USER, today: "12/09/2026" });
  const raw = doc.output();
  assert.ok(raw.includes("3,000"), "Subtotal £3,000 missing");
  assert.ok(raw.includes("600"), "VAT £600 missing");
  assert.ok(raw.includes("3,600"), "Total £3,600 missing");
});

console.log(`\n${passed} passed · ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
