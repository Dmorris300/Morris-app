// VO-PDF-01 — Programme / Time Impact heading must not orphan.
//
// Reproduces the reported layout boundary:
//   4 cost items · VAT · long variation description · programme impact
//   = Additional days · 1 supporting document.
// Confirms:
//   - Programme / Time Impact heading appears on the SAME page as at least
//     the "Impact type" row of its KV table.
//   - Cost table stays together across the page break.
//   - Subtotal £3,000 + VAT £600 = Total £3,600 appears verbatim in output.
//   - Contractor / client sign-off blocks with no persisted signature
//     render the "Signature to follow" placeholder.
//   - Supporting reference MEP-L2-REV03 remains visible.
//
// Run: cd /app/frontend/tests && node --experimental-loader ./loader.mjs vo-pdf-01.test.mjs

import assert from "node:assert/strict";
import { generateVariationPdf } from "../src/lib/variation-order-pdf";

const USER = {
  fullName: "Preview QA", username: "previewqa", companyName: "Preview QA Ltd",
  email: "previewqa@example.com", phone: "07123 456789",
  companyLogo: null, signature: null,
};

// Fixture matching the user's manual repro exactly: 4 cost items, VAT,
// long variation description, programme impact Additional days, 1 supporting doc.
const FIXTURE = {
  data: {
    variationRef: "VO-PDF-01", variationDate: "12/09/2026",
    projectName: "P3 Verify Project — VO-PDF-01",
    projectAddress: "1 Test Way, London EC1A 1AA",
    clientName: "P3 QA Client", clientCompany: "P3 QA Client Ltd",
    originalContractRef: "CTR-01", originalContractDate: "01/06/2026",
    instructorName: "Sarah Legacy", instructorRole: "Project Manager",
    instructionDate: "20/07/2026", instructionMethod: "Email",
    instructionLocation: "Site Cabin",
    reason: "Client Request",
    scopeSummary: "Original scope narrative for verification.",
    descriptionOfChange: (
      "This is a long variation description that intentionally spans many "
      + "lines to push the Cost Breakdown table and Programme / Time Impact "
      + "heading toward the page boundary. "
    ).repeat(6),
    referenceDocs: "RFI-014\nDrg A-102 Rev C\nMEP-L2-REV03",  // <- key ref
    lineItems: [
      { id: "L1", category: "Labour", description: "Electrical labour — first fix additions", qty: 1, unit: "sum", unitPrice: 1200 },
      { id: "L2", category: "Materials", description: "Fire dampers grid B7 — MEP-L2-REV03 reference", qty: 1, unit: "sum", unitPrice: 950 },
      { id: "L3", category: "Plant & Equipment", description: "Access equipment hire", qty: 1, unit: "sum", unitPrice: 350 },
      { id: "L4", category: "Preliminaries", description: "Site management + supervision overhead", qty: 1, unit: "sum", unitPrice: 500 },
    ],
    addVat: true, vatRate: 20,
    programmeImpact: { kind: "Additional days", days: 3, newPCDate: "2026-10-10", notes: "Weather-related delays" },
    supportingDocs: [{ name: "MEP-L2-REV03 drawing package.pdf" }],
    photoIds: [],
    paymentTerms: "Payment for this variation will be included in the next AFP.",
    notes: "",
    status: "Draft",
    preparedBy: "Preview QA", preparedSignature: null,
    clientApproverName: "", clientApproverSignature: null,
    totals: { subtotal: 3000, vatAmount: 600, total: 3600, byCategory: { Labour: 1200, Materials: 950, "Plant & Equipment": 350, Preliminaries: 500 } },
  },
  user: USER, today: "12/09/2026",
};

let passed = 0, failed = 0;
const t = (name, fn) => {
  try { fn(); passed++; console.log(`  ✔ ${name}`); }
  catch (e) { failed++; console.error(`  ✘ ${name}\n    ${e.message}`); }
};

console.log("VO-PDF-01 — Programme / Time Impact orphan-heading regression");

const doc = generateVariationPdf(FIXTURE);
const raw = doc.output();
const totalPages = doc.getNumberOfPages();

// Reliable per-page text lookup via jsPDF's `internal.pages` operator lists.
// jsPDF emits text as `(literal) Tj` operators inside a `BT ... ET` block.
// We match the operator FORM to avoid false positives on body-copy that
// happens to contain the heading substring (the P3 fixture's descriptions
// literally include the phrase "Cost Breakdown" to force pagination).
function pageContainingTj(_doc, tjLiteral) {
  const pages = _doc.internal && _doc.internal.pages ? _doc.internal.pages : [];
  const needle = `(${tjLiteral}) Tj`;
  for (let i = 1; i < pages.length; i++) {
    const arr = Array.isArray(pages[i]) ? pages[i] : [String(pages[i] || "")];
    for (const op of arr) {
      if (typeof op === "string" && op.includes(needle)) return i;
    }
  }
  return -1;
}
// Convenience for substring-inside-Tj (still bounded to the Tj operator
// but tolerant of prefix numbering like "N. Cost Breakdown").
function pageContainingTjRegex(_doc, regex) {
  const pages = _doc.internal && _doc.internal.pages ? _doc.internal.pages : [];
  for (let i = 1; i < pages.length; i++) {
    const arr = Array.isArray(pages[i]) ? pages[i] : [String(pages[i] || "")];
    for (const op of arr) {
      if (typeof op === "string" && / Tj\n?/.test(op) && regex.test(op)) return i;
    }
  }
  return -1;
}


t("Programme / Time Impact heading and its 'Impact type' row are on the SAME page", () => {
  // In the buggy build the heading landed one page before the row.
  const headingPage = pageContainingTjRegex(doc, /\(\d+\. Programme \/ Time Impact\) Tj/);
  const rowPage = pageContainingTj(doc, "Impact type");
  assert.ok(headingPage > 0, `Programme heading '(N. Programme / Time Impact) Tj' not found in doc.text operators`);
  assert.ok(rowPage > 0, `"Impact type" row not found`);
  assert.equal(headingPage, rowPage, `VO-PDF-01 REGRESSION: heading on page ${headingPage} but first row on page ${rowPage}`);
});

t("Programme / Time Impact 'Days' row is on the same page as the heading", () => {
  const headingPage = pageContainingTjRegex(doc, /\(\d+\. Programme \/ Time Impact\) Tj/);
  const daysPage = pageContainingTj(doc, "3 working days");
  assert.equal(headingPage, daysPage, `"Days" row split from Programme heading: heading page ${headingPage}, days page ${daysPage}`);
});

t("Cost Breakdown table header stays with at least one data row", () => {
  const headingPage = pageContainingTjRegex(doc, /\(\d+\. Cost Breakdown\) Tj/);
  // jsPDF may split the long description into wrapped Tj chunks — match
  // on the stable prefix "Electrical labour" (present in the first row).
  const firstLinePage = pageContainingTjRegex(doc, /\(Electrical labour/);
  assert.equal(headingPage, firstLinePage, `Cost Breakdown header on page ${headingPage} but first data row on page ${firstLinePage}`);
});

t("Subtotal £3,000, VAT £600, Total £3,600 all present in output", () => {
  assert.ok(raw.includes("3,000") || raw.includes("3000.00"), "Subtotal £3,000 missing from PDF");
  assert.ok(raw.includes("600.00") || raw.includes("600"), "VAT £600 missing from PDF");
  assert.ok(raw.includes("3,600") || raw.includes("3600.00"), "Total £3,600 missing from PDF");
});

t("Signature-to-follow placeholder rendered for both signature blocks (no phantom sig)", () => {
  const idx1 = raw.indexOf("Signature to follow");
  const idx2 = raw.indexOf("Signature to follow", idx1 + 1);
  assert.ok(idx1 > 0, "First 'Signature to follow' placeholder missing");
  assert.ok(idx2 > idx1, "Second 'Signature to follow' placeholder missing — dual sign-off broken");
});

t("Supporting reference MEP-L2-REV03 remains visible in the PDF output", () => {
  assert.ok(raw.includes("MEP-L2-REV03"), "MEP-L2-REV03 supporting reference lost from PDF output");
});

t("Every content page has a 'Page X of Y' indicator", () => {
  // Cover is page 1; pages 2..N must all have "Page N of totalPages".
  for (let p = 2; p <= totalPages; p++) {
    const marker = `Page ${p} of ${totalPages}`;
    assert.ok(raw.includes(marker), `Missing "${marker}" — finalizeFooters didn't stamp page ${p}`);
  }
});

console.log(`\n${passed} passed · ${failed} failed  (rendered ${totalPages} pages)`);
process.exit(failed === 0 ? 0 : 1);
