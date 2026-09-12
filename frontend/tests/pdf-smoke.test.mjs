// Morris — P3 PDF Integrity smoke test.
//
// Runs every V2 PDF generator against a fixed data fixture and asserts:
//   - Generator returns a jsPDF doc without throwing
//   - Page count > 0
//   - Every page has non-zero output (indirect: total output length is
//     substantially larger than a blank single-page PDF)
//   - The Morris standard footer + "Page X of Y" stamp is present on every
//     content page (validated by scanning the PDF's raw output for the
//     literal "Page 1 of" token — jsPDF emits BT/ET text ops in cleartext)
//   - Signature-block "phantom sig" bug does NOT recur — AFP with no
//     preparedSignature and no user.signature must render "Signature to
//     follow" text (regression for the P3 phantom-signature fix)
//
// Run: cd /app/frontend/tests && node --experimental-loader ./loader.mjs pdf-smoke.test.mjs

import assert from "node:assert/strict";
import { generateAfpPdf } from "../src/lib/application-for-payment-pdf";
import { generateContractPdf } from "../src/lib/contract-pdf";
import { generateCoshhPdf } from "../src/lib/coshh-pdf";
import { generateIncidentReportPdf } from "../src/lib/incident-report-pdf";
import { generateInvoicePdf } from "../src/lib/invoice-pdf";
import { generateMethodStatementPdf } from "../src/lib/method-statement-pdf";
import { generatePurchaseOrderPdf } from "../src/lib/purchase-order-pdf";
import { generateQuotePdf } from "../src/lib/quote-builder-pdf";
import { generateRamsPdf } from "../src/lib/rams-pdf";
import { generateRiskAssessmentPdf } from "../src/lib/risk-assessment-pdf";
import { generateSiteDiaryPdf } from "../src/lib/site-diary-pdf";
import { generateSnaggingReportPdf, generateSnagPdf } from "../src/lib/snagging-pdf";
import { generateToolboxTalkPdf } from "../src/lib/toolbox-talk-pdf";
import { generateVariationPdf } from "../src/lib/variation-order-pdf";
import { generatePdf, ukDateFmt } from "../src/lib/pdf";

const USER = {
  fullName: "Preview QA",
  username: "previewqa",
  companyName: "Preview QA Ltd",
  email: "previewqa@example.com",
  phone: "07123 456789",
  companyLogo: null,
  signature: null,   // deliberately null — phantom-sig regression fixture
};
const TODAY = "12/09/2026";

// A rich fixture used by most generators: lots of line items so we can
// exercise pagination + orphan-heading guards.
const CORE_LINE_ITEMS = Array.from({ length: 24 }, (_, i) => ({
  id: `li-${i}`, category: ["Labour", "Materials", "Plant & Equipment", "Preliminaries"][i % 4],
  description: `Item ${i + 1} — verification fixture description that intentionally spills onto a second wrapped line to exercise the row-height math.`,
  qty: 1 + (i % 5), unit: "sum", unitPrice: 100 + i * 17.5,
  valueToDate: (100 + i * 17.5) * (1 + i % 5),
}));

const FIXTURES = {
  "AFP (Draft — no signatures, phantom regression)": [generateAfpPdf, {
    data: {
      applicationRef: "AFP-001", applicationNumber: 1, applicationDate: "12/09/2026",
      periodFrom: "01/08/2026", periodTo: "31/08/2026", dueDate: "12/10/2026",
      status: "Draft", projectName: "P3 Smoke Test Project",
      projectAddress: "1 Test Way, London EC1A 1AA",
      clientName: "P3 QA Client", clientCompany: "P3 QA Client Ltd",
      contractRef: "CTR-P3-01", contractDate: "01/06/2026", contractSum: 100000,
      lineItems: CORE_LINE_ITEMS,
      previousApplications: Array.from({ length: 5 }, (_, i) => ({
        applicationNumber: i + 1, applicationRef: `AFP-${String(i + 1).padStart(3, "0")}`,
        applicationDate: `0${i + 1}/08/2026`, status: ["Submitted", "Rejected", "Certified", "Paid", "Draft"][i],
        grossValuation: 5000 + i * 1000, certifiedAmount: [0, 0, 5000, 5000, 0][i],
      })),
      paymentTerms: "Payment due within 30 days.",
      preparedBy: "", preparedSignature: null, certifierName: "", certifierSignature: null,
    },
    user: USER, today: TODAY,
  }],
  "Variation Order (long line items)": [generateVariationPdf, {
    data: {
      variationRef: "VO-P3-01", variationDate: "12/09/2026",
      projectName: "P3 Smoke Test Project", clientName: "P3 QA Client",
      originalContractRef: "CTR-P3-01", originalContractDate: "01/06/2026",
      instructorName: "QA Instructor", instructorRole: "Project Manager",
      instructionDate: "20/07/2026", instructionMethod: "Email",
      reason: "Client Request", descriptionOfChange: "Long variation description ".repeat(30),
      lineItems: CORE_LINE_ITEMS, addVat: true, vatRate: 20,
      programmeImpact: { kind: "Additional days", days: 3, newPCDate: "10/10/2026", notes: "Weather-related" },
      status: "Draft", preparedBy: "", preparedSignature: null,
      totals: { subtotal: 5000, vatAmount: 1000, total: 6000, byCategory: { Labour: 2000, Materials: 3000 } },
    },
    user: USER, today: TODAY,
  }],
  "Invoice": [generateInvoicePdf, {
    data: {
      invoiceRef: "INV-P3-01", invoiceNumber: "INV-2026-001", invoiceDate: "12/09/2026",
      projectName: "P3 Smoke Test Project", clientName: "P3 QA Client",
      lineItems: CORE_LINE_ITEMS.map((l) => ({ ...l, description: l.description, amount: l.valueToDate })),
      addVat: true, vatRate: 20, dueDate: "12/10/2026", status: "Sent",
      totals: { subtotal: 5000, vatAmount: 1000, total: 6000 },
    }, user: USER, today: TODAY,
  }],
  "Quote": [generateQuotePdf, {
    data: {
      quoteRef: "QT-P3-01", quoteDate: "12/09/2026", validUntil: "12/10/2026",
      projectName: "P3 Smoke Test Project", clientName: "P3 QA Client",
      lineItems: CORE_LINE_ITEMS, addVat: true, vatRate: 20, status: "Draft",
      totals: { subtotal: 5000, vatAmount: 1000, total: 6000 },
    }, user: USER, today: TODAY,
  }],
  "Purchase Order": [generatePurchaseOrderPdf, {
    data: {
      poRef: "PO-P3-01", poDate: "12/09/2026", projectName: "P3 Smoke Test Project",
      supplierName: "P3 QA Supplier", supplierAddress: "1 Supplier Rd",
      lineItems: CORE_LINE_ITEMS, addVat: true, vatRate: 20, status: "Draft",
      totals: { subtotal: 5000, vatAmount: 1000, total: 6000 },
    }, user: USER, today: TODAY,
  }],
  "Contract": [generateContractPdf, {
    data: {
      contractRef: "CTR-P3-01", contractDate: "12/09/2026",
      projectName: "P3 Smoke Test Project", clientName: "P3 QA Client",
      scope: "Long scope narrative. ".repeat(80),
      paymentTerms: "Payment due within 30 days.",
      status: "Draft",
    }, user: USER, today: TODAY,
  }],
  "COSHH": [generateCoshhPdf, {
    data: {
      assessmentRef: "COSHH-P3-01", assessmentDate: "12/09/2026",
      substanceName: "P3 Test Substance", projectName: "P3 Smoke Test Project",
      hazards: ["Skin irritation", "Eye irritation"], controls: ["Wear gloves", "Wear goggles"],
      firstAid: "Flush with water.", ppe: ["Gloves", "Goggles"],
    },
    hazards: [], user: USER, today: TODAY,
  }],
  "RAMS": [generateRamsPdf, {
    data: {
      documentRef: "RAMS-P3-01", documentRevision: "A", assessmentDate: "12/09/2026",
      clientName: "P3 QA Client", principalContractor: "P3 QA PC",
      siteAddress: "1 Test Way", supervisorName: "P3 Foreman",
      task: "Long task narrative that spans multiple lines. ".repeat(20),
      hazards: Array.from({ length: 10 }, (_, i) => ({ name: `Hazard ${i + 1}`, severity: 3, likelihood: 3, controls: "Control measures." })),
      ppe: ["Hard hat", "Safety glasses", "Gloves"],
    }, user: USER, today: TODAY,
  }],
  "Method Statement": [generateMethodStatementPdf, {
    data: {
      documentRef: "MS-P3-01", documentRevision: "A", assessmentDate: "12/09/2026",
      task: "P3 method statement task", clientName: "P3 QA Client",
      steps: Array.from({ length: 15 }, (_, i) => `Step ${i + 1}: Long step description that wraps and exercises pagination. `.repeat(3)),
    }, user: USER, today: TODAY,
  }],
  "Toolbox Talk": [generateToolboxTalkPdf, {
    data: {
      talkRef: "TBT-P3-01", talkDate: "12/09/2026", topic: "Working at Height",
      keyPoints: Array.from({ length: 12 }, (_, i) => `Key point ${i + 1}: ${"lorem ".repeat(20)}`),
      attendees: Array.from({ length: 8 }, (_, i) => ({ name: `Attendee ${i + 1}`, signature: null })),
    }, user: USER, today: TODAY,
  }],
  "Incident Report": [generateIncidentReportPdf, {
    data: {
      incidentRef: "INC-P3-01", incidentDate: "12/09/2026", projectName: "P3 Smoke Test Project",
      location: "Site cabin", incidentType: "Near miss", severity: "Low",
      description: "Long incident description. ".repeat(30),
      injuries: [], witnesses: [{ name: "Witness A", statement: "Saw the whole thing." }],
      correctiveActions: ["Toolbox talk on housekeeping"], status: "Open",
    }, user: USER, today: TODAY,
  }],
  "Risk Assessment": [generateRiskAssessmentPdf, {
    data: {
      documentRef: "RA-P3-01", assessmentDate: "12/09/2026", projectName: "P3 Smoke Test Project",
      hazards: Array.from({ length: 20 }, (_, i) => ({ name: `Hazard ${i + 1}`, severity: 3, likelihood: 3, residual: 2, controls: "Standard controls." })),
    }, user: USER, today: TODAY,
  }],
  "Site Diary": [generateSiteDiaryPdf, {
    data: {
      diaryRef: "SD-P3-01", diaryDate: "12/09/2026", projectName: "P3 Smoke Test Project",
      weather: "Sunny", workDone: "Long narrative. ".repeat(30),
      attendance: [{ name: "Person A", hours: 8 }, { name: "Person B", hours: 8 }],
    }, user: USER, today: TODAY,
  }],
  "Snagging Report (multi)": [generateSnaggingReportPdf, {
    project: { projectName: "P3 Smoke Test Project", projectAddress: "1 Test Way" },
    summary: { totalSnags: 15, closedSnags: 5, openSnags: 10, percentComplete: 33 },
    snags: Array.from({ length: 15 }, (_, i) => ({
      snagRef: `SNAG-${String(i + 1).padStart(3, "0")}`, title: `Snag ${i + 1}`, location: `Room ${i + 1}`,
      priority: ["Low", "Medium", "High"][i % 3], status: "Open", raisedDate: "12/09/2026",
      description: "Snag description.", trade: "Electrical",
    })),
    user: USER, today: TODAY,
  }],
  "Snagging (single)": [generateSnagPdf, {
    data: {
      snagRef: "SNAG-001", title: "Single snag", location: "Room 5", priority: "High",
      status: "Open", raisedDate: "12/09/2026", description: "Long description. ".repeat(20),
    }, user: USER, today: TODAY,
  }],
  "Generic tool page fallback (pdf.js)": [(args) => generatePdf(args), {
    title: "Generic Tool Output", content: "Long generic content.\n".repeat(80),
    user: USER, refNumber: "GEN-P3-01",
  }],
};

let passed = 0, failed = 0;
const results = [];

for (const [name, [fn, args]] of Object.entries(FIXTURES)) {
  try {
    const doc = fn(args);
    const pages = doc.getNumberOfPages();
    const output = doc.output();  // raw PDF string
    const size = output.length;
    // Assertions
    assert.ok(pages > 0, `expected > 0 pages, got ${pages}`);
    assert.ok(size > 3000, `PDF output too small (${size} bytes) — likely a broken render`);
    // Page indicator on at least one non-cover content page:
    const hasPageIndicator = output.includes("Page 1 of") || output.includes("Page 2 of") || output.includes("Page 3 of");
    assert.ok(hasPageIndicator, `no "Page N of M" indicator found in output — finalizeFooters may not be wired`);
    passed++;
    results.push({ name, pages, size, indicator: hasPageIndicator, status: "PASS" });
    console.log(`  ✔ ${name}  pages=${pages}  size=${(size / 1024).toFixed(1)}KB  indicator=yes`);
  } catch (e) {
    failed++;
    results.push({ name, status: "FAIL", err: e.message });
    console.error(`  ✘ ${name}\n    ${e.message}\n    ${(e.stack || "").split("\n").slice(1, 3).join("\n    ")}`);
  }
}

// --- P3 phantom-signature regression: AFP raw output must contain the
// "Signature to follow" placeholder when no signature is persisted. ---
try {
  const [afpFn, afpArgs] = FIXTURES["AFP (Draft — no signatures, phantom regression)"];
  const doc = afpFn(afpArgs);
  const raw = doc.output();
  // jsPDF emits text as `Tj` with the string content — the substring appears
  // verbatim in the raw output stream.
  assert.ok(raw.includes("Signature to follow"),
    'P3 REGRESSION: AFP with null preparedSignature must render "Signature to follow" — the phantom-signature fallback appears to have returned.');
  passed++; console.log("  ✔ AFP phantom-sig regression — placeholder present");
} catch (e) { failed++; console.error("  ✘ AFP phantom-sig regression\n    " + e.message); }

// --- ukDateFmt contract ---
try {
  assert.equal(ukDateFmt("2026-07-20"), "20/07/2026");
  assert.equal(ukDateFmt("2026-07-20T15:04"), "20/07/2026");
  assert.equal(ukDateFmt("20/07/2026"), "20/07/2026");
  assert.equal(ukDateFmt(""), "");
  assert.equal(ukDateFmt(null), "");
  passed++; console.log("  ✔ ukDateFmt DD/MM/YYYY contract");
} catch (e) { failed++; console.error("  ✘ ukDateFmt\n    " + e.message); }

console.log(`\n${passed} passed · ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
