import { jsPDF } from "jspdf";
import { aggregateCis, refundCalc, currentTaxYearLabel, fGBP, thisTaxYear } from "./finance";
import { MORRIS_LOGO_PDF_DATA_URL } from "./morris-logo-pdf";

// Build a clean, one-page A4 CIS Refund Summary for the accountant.
// Returns the jsPDF instance so the caller can .save() or pull a blob/base64.
export function buildRefundSummaryPdf({ user, cisPayments }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;

  // White background
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  const taxYear = currentTaxYearLabel();
  const today = new Date().toLocaleDateString("en-GB");
  const userName = user?.fullName || user?.username || "";
  const company = user?.companyName || userName;

  // ---------- Header ----------
  // Logo block
  if (user?.companyLogo) {
    try {
      doc.addImage(user.companyLogo, "PNG", margin, 30, 100, 40, undefined, "FAST");
    } catch (e) {
      drawMorrisMark(doc, margin, 30, 40);
    }
  } else {
    drawMorrisMark(doc, margin, 30, 40);
  }

  doc.setTextColor(60, 60, 60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  if (company) doc.text(company.toUpperCase(), pageWidth - margin, 44, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(today, pageWidth - margin, 60, { align: "right" });

  doc.setDrawColor(232, 160, 32);
  doc.setLineWidth(0.8);
  doc.line(margin, 86, pageWidth - margin, 86);

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 15, 15);
  doc.text("CIS Refund Summary", margin, 116);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(90, 90, 90);
  doc.text(`Tax year ${taxYear}`, margin, 134);

  // ---------- Totals ----------
  const ytd = thisTaxYear(cisPayments || []);
  const totals = aggregateCis(ytd);
  const calc = refundCalc({
    grossLabourYtd: totals.grossLabour,
    materialsYtd: totals.materials,
    cisDeductedYtd: totals.deduction,
  });

  let y = 168;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text("YEAR-TO-DATE TOTALS", margin, y);
  y += 16;

  const kv = [
    ["Gross labour YTD", fGBP(totals.grossLabour)],
    ["Materials YTD", fGBP(totals.materials)],
    ["Total CIS deducted YTD", fGBP(totals.deduction)],
    ["Net cash received", fGBP(totals.net)],
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  kv.forEach(([k, v]) => {
    doc.setTextColor(90, 90, 90);
    doc.text(k, margin, y);
    doc.setTextColor(15, 15, 15);
    doc.text(v, pageWidth - margin, y, { align: "right" });
    y += 16;
  });

  // ---------- 6-step calc ----------
  y += 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text("REFUND CALCULATION (6 STEPS)", margin, y);
  y += 16;

  const steps = [
    ["1. Taxable profit", "Gross labour − materials", fGBP(calc.taxableProfit)],
    ["2. Taxable income", "Profit − £12,570 personal allowance", fGBP(calc.taxableIncome)],
    ["3. Income tax (20%)", "Taxable income × 0.20", fGBP(calc.incomeTax)],
    ["4. Class 4 NI (6%)", "Profit above £12,570 × 0.06", fGBP(calc.class4Ni)],
    ["5. Total liability", "Income tax + NI", fGBP(calc.totalLiability)],
    [
      calc.delta >= 0 ? "6. Estimated refund" : "6. Estimated tax owed",
      "CIS deducted − total liability",
      fGBP(Math.abs(calc.delta)),
    ],
  ];

  doc.setFontSize(10);
  steps.forEach(([k, sub, v], idx) => {
    const isLast = idx === steps.length - 1;
    if (isLast) {
      doc.setFillColor(232, 160, 32);
      doc.rect(margin - 6, y - 12, pageWidth - margin * 2 + 12, 26, "F");
      doc.setTextColor(10, 10, 10);
      doc.setFont("helvetica", "bold");
    } else {
      doc.setTextColor(40, 40, 40);
      doc.setFont("helvetica", "normal");
    }
    doc.text(k, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(isLast ? 40 : 130, isLast ? 40 : 130, isLast ? 40 : 130);
    doc.text(sub, margin + 130, y);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(isLast ? 10 : 15, isLast ? 10 : 15, isLast ? 10 : 15);
    doc.text(v, pageWidth - margin, y, { align: "right" });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    y += isLast ? 24 : 18;
  });

  // ---------- Payment log ----------
  y += 12;
  if (y > pageHeight - 180) {
    // unlikely on one page but safe
    doc.addPage();
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
    y = 60;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text(`LOGGED PAYMENTS (${ytd.length})`, margin, y);
  y += 14;

  // Table header
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.setFont("helvetica", "bold");
  const cols = [
    { label: "DATE", x: margin, align: "left" },
    { label: "CONTRACTOR", x: margin + 70, align: "left" },
    { label: "LABOUR", x: margin + 240, align: "right" },
    { label: "MATERIALS", x: margin + 310, align: "right" },
    { label: "RATE", x: margin + 365, align: "right" },
    { label: "DEDUCTED", x: margin + 425, align: "right" },
    { label: "NET", x: pageWidth - margin, align: "right" },
  ];
  cols.forEach(c => doc.text(c.label, c.x, y, { align: c.align }));
  y += 4;
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, pageWidth - margin, y);
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  const maxRowsOnPage = 22;
  let drawn = 0;
  for (const p of ytd) {
    if (drawn >= maxRowsOnPage) {
      // overflow page
      addAttribution(doc, pageWidth, pageHeight, userName, today);
      doc.addPage();
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, "F");
      y = 60;
      drawn = 0;
    }
    const dateStr = p.date || "";
    const contractor = (p.contractor || "").slice(0, 30);
    const labour = fGBP(p.grossLabour ?? p.gross);
    const mats = fGBP(p.materials || 0);
    const rate = `${Math.round((p.cisRate || 0) * 100)}%`;
    const ded = fGBP(p.deduction || 0);
    const net = fGBP(p.net || 0);
    doc.text(dateStr, margin, y);
    doc.text(contractor, margin + 70, y);
    doc.text(labour, margin + 240, y, { align: "right" });
    doc.text(mats, margin + 310, y, { align: "right" });
    doc.text(rate, margin + 365, y, { align: "right" });
    doc.text(ded, margin + 425, y, { align: "right" });
    doc.text(net, pageWidth - margin, y, { align: "right" });
    y += 14;
    drawn++;
  }

  if (ytd.length === 0) {
    doc.setTextColor(140, 140, 140);
    doc.setFont("helvetica", "italic");
    doc.text("No payments logged this tax year.", margin, y);
    y += 16;
  }

  addAttribution(doc, pageWidth, pageHeight, userName, today);
  return doc;
}

function drawMorrisMark(doc, x, y, size = 28) {
  try {
    doc.addImage(MORRIS_LOGO_PDF_DATA_URL, "PNG", x, y, size, size, undefined, "FAST");
  } catch (e) {
    // Defensive fallback to the previous gold-square M.
    doc.setFillColor(232, 160, 32);
    doc.roundedRect(x, y, size, size, 4, 4, "F");
    doc.setTextColor(10, 10, 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size * 0.7);
    doc.text("M", x + size / 2, y + size * 0.74, { align: "center" });
    if (process.env.NODE_ENV !== "production") console.error("Morris logo embed failed", e);
  }
}

function addAttribution(doc, pageWidth, pageHeight, userName, today) {
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.4);
  doc.line(48, pageHeight - 56, pageWidth - 48, pageHeight - 56);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  const top = [today, userName].filter(Boolean).join("   ·   ");
  doc.text(top, 48, pageHeight - 40);
  doc.setTextColor(140, 140, 140);
  doc.text(
    "Generated by Morris  ·  morrisapp.co.uk  ·  Morris Construction Tech Ltd  ·  ICO C1923529",
    48,
    pageHeight - 26
  );
}

// Returns base64-encoded PDF data URL ready to upload to the backend.
export function refundSummaryPdfBase64({ user, cisPayments }) {
  const doc = buildRefundSummaryPdf({ user, cisPayments });
  return doc.output("datauristring");
}

// Saves directly to the browser.
export function downloadRefundSummary({ user, cisPayments }) {
  const doc = buildRefundSummaryPdf({ user, cisPayments });
  doc.save(`morris-refund-summary-${currentTaxYearLabel().replace("/", "-")}.pdf`);
}
