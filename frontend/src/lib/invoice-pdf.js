// Morris — Invoice Builder V2 PDF renderer.
// Professional invoice: cover + parties + itemised charges + CIS/VAT summary
// + payment terms + bank details + remittance slip.

import { jsPDF } from "jspdf";
import { drawHeader, addFooter } from "./pdf";

const GOLD = [232, 160, 32], INK = [20, 20, 20], MUTED = [110, 110, 110], BORDER = [180, 180, 180], ZEBRA = [248, 246, 242];
const MARGIN = 48;
const fGBP = (n) => `£${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
const STATUS_COLOUR = {
  Draft: [140, 140, 140], Sent: [232, 160, 32], "Part Paid": [180, 180, 180],
  Paid: [104, 211, 145], Overdue: [242, 124, 124], Cancelled: [90, 90, 90],
};

export function generateInvoicePdf({ data, user, today }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const userName = user?.fullName || user?.username || "";
  const company = user?.companyName || userName;
  const todayStr = today || new Date().toLocaleDateString("en-GB");
  const ref = data.invoiceRef || "INV-DRAFT";
  const totals = data.totals || {};
  const status = data.status || "Draft";

  drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight, totals, status });
  doc.addPage();
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawHeader(doc, pageWidth, MARGIN, user, company, todayStr, "Invoice");
  const state = { y: 150, doc, pageWidth, pageHeight, user, company, todayStr, ref, userName, sectionNum: 0 };

  // 1. Bill to / From
  section(state, "Bill To & From");
  const utr = user?.utr ? `UTR: ${user.utr}` : "";
  const vat = user?.vatNumber ? `VAT: ${user.vatNumber}` : "";
  const kvLeft = [
    ["FROM", company || "—"],
    ["Address", user?.companyAddress || user?.address || "—"],
    ["Contact", user?.phone || user?.email || "—"],
    ["Registration", [utr, vat].filter(Boolean).join("  ·  ") || "—"],
  ];
  const kvRight = [
    ["BILL TO", data.clientCompany || data.clientName || "—"],
    ["Address", data.clientAddress || data.projectAddress || "—"],
    ["Contact", data.clientEmail || data.clientPhone || "—"],
    ["VAT / UTR", [data.clientVatNumber && `VAT: ${data.clientVatNumber}`, data.clientUtr && `UTR: ${data.clientUtr}`].filter(Boolean).join("  ·  ") || "—"],
  ];
  twoColKv(state, kvLeft, kvRight);

  // 2. Invoice details
  section(state, "Invoice Details");
  const detailRows = [
    ["Invoice reference", ref],
    ["Invoice date", data.invoiceDate || todayStr],
    ["Due date", data.dueDate || "—"],
    ["Payment terms", data.paymentTerms || "—"],
    ["PO number", data.poNumber || "—"],
    ["Project", data.projectName || "—"],
    ["Site address", data.projectAddress || "—"],
    ["Status", status],
  ];
  if (data.linkedApplicationRef) detailRows.push(["Linked application", data.linkedApplicationRef]);
  if (data.linkedVariationRef) detailRows.push(["Linked variation", data.linkedVariationRef]);
  if (data.linkedQuoteRef) detailRows.push(["Linked quote", data.linkedQuoteRef]);
  kvTable(state, detailRows);

  // 3. Itemised charges
  const items = data.lineItems || [];
  section(state, "Itemised Charges");
  if (items.length > 0) {
    table(state, ["Category", "Description", "Qty", "Unit", "Unit price", "Line total"],
      items.map(it => [it.category || "—", it.description || "—", it.qty ?? "", it.unit || "", fGBP(it.unitPrice), fGBP((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))]),
      { colWidths: computeColumnWidths(state, [0.16, 0.36, 0.08, 0.10, 0.14, 0.16]) });
    const byCat = totals.byCategory || {};
    if (Object.keys(byCat).length > 1) {
      subSection(state, "Subtotal by category");
      table(state, null, Object.entries(byCat).map(([k, v]) => [k, fGBP(v)]),
        { colWidths: [state.pageWidth - MARGIN * 2 - 140, 140], header: false, zebra: true });
    }
  } else {
    para(state, "No items on this invoice.");
  }

  // 4. Summary
  section(state, "Summary");
  const rows = [["Subtotal", fGBP(totals.subtotal || 0)]];
  if ((totals.discount || 0) > 0) rows.push(["Less: Discount", `(${fGBP(totals.discount)})`]);
  rows.push(["Subtotal after discount", fGBP(totals.subtotalAfterDiscount || totals.subtotal || 0)]);
  if ((totals.cisRate || 0) > 0) rows.push([`Less: CIS deduction (${totals.cisRate}% of labour)`, `(${fGBP(totals.cisDeduction || 0)})`]);
  if ((totals.vatAmount || 0) > 0) {
    rows.push([`Add: VAT (${totals.vatTreatment})`, fGBP(totals.vatAmount)]);
  } else if ((totals.vatTreatment || "").startsWith("Reverse charge")) {
    rows.push(["VAT — Reverse charge", "Customer to account for VAT to HMRC"]);
  } else if ((totals.vatTreatment || "") === "Exempt") {
    rows.push(["VAT — Exempt", "No VAT chargeable"]);
  }
  rows.push(["TOTAL DUE", fGBP(totals.totalDue || 0)]);
  const paid = (data.payments || []).reduce((a, p) => a + (Number(p.amount) || 0), 0);
  if (paid > 0) {
    rows.push(["Amount paid to date", `(${fGBP(paid)})`]);
    rows.push(["BALANCE OUTSTANDING", fGBP((totals.totalDue || 0) - paid)]);
  }
  table(state, null, rows, { colWidths: [state.pageWidth - MARGIN * 2 - 200, 200], header: false, zebra: true });

  // 5. Payments history
  if ((data.payments || []).length > 0) {
    section(state, "Payments Received");
    table(state, ["Date", "Amount", "Method", "Reference", "Note"],
      data.payments.map(p => [p.date || "—", fGBP(p.amount), p.method || "—", p.reference || "—", p.note || ""]),
      { colWidths: computeColumnWidths(state, [0.16, 0.16, 0.16, 0.22, 0.30]) });
  }

  // 6. Payment terms
  section(state, "Payment Terms");
  para(state, data.paymentTermsNote || "Payment due within 30 days of invoice date. Interest may be charged under the Late Payment of Commercial Debts (Interest) Act 1998.");

  // 7. Bank details
  section(state, "Remittance Details");
  const bankRows = [
    ["Bank", data.bankName || user?.bankName || "—"],
    ["Account name", data.bankAccountName || user?.bankAccountName || company || "—"],
    ["Sort code", data.bankSortCode || user?.bankSortCode || "—"],
    ["Account number", data.bankAccountNumber || user?.bankAccountNumber || "—"],
  ];
  if (data.bankIban || user?.bankIban) bankRows.push(["IBAN", data.bankIban || user?.bankIban]);
  bankRows.push(["Payment reference", data.bankReference || ref]);
  kvTable(state, bankRows);

  if (data.notes) { section(state, "Notes"); para(state, data.notes); }

  addFooter(doc, pageWidth, pageHeight, user, ref, todayStr, userName);
  return doc;
}

export function downloadInvoicePdf(args) {
  const d = generateInvoicePdf(args);
  const client = (args?.data?.clientCompany || args?.data?.clientName || "invoice").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  d.save(`invoice-${args?.data?.invoiceRef || "draft"}-${client}.pdf`);
}
export function invoicePdfBlobUrl(args) { return generateInvoicePdf(args).output("bloburl"); }

// ---------- helpers ----------
function drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight, totals, status }) {
  doc.setFillColor(20, 18, 16); doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setDrawColor(...GOLD); doc.setLineWidth(1.5);
  doc.line(MARGIN, 90, pageWidth - MARGIN, 90);
  doc.line(MARGIN, pageHeight - 90, pageWidth - MARGIN, pageHeight - 90);
  if (user?.companyLogo) { try { doc.addImage(user.companyLogo, "PNG", MARGIN, 30, 120, 44, undefined, "FAST"); } catch { /* ignore */ } }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...GOLD);
  doc.text("INVOICE", MARGIN, 140);
  doc.setFontSize(30); doc.setTextColor(240, 237, 232);
  const wrapped = doc.splitTextToSize(data.clientCompany || data.clientName || "Client", pageWidth - MARGIN * 2);
  let y = 175; wrapped.forEach(l => { doc.text(l, MARGIN, y); y += 34; });
  y += 12;
  const statusColour = STATUS_COLOUR[status] || [180, 180, 180];
  doc.setFillColor(...statusColour); doc.setDrawColor(...statusColour);
  const label = (status || "Draft").toUpperCase();
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  const pillW = doc.getTextWidth(label) + 18;
  doc.roundedRect(MARGIN, y, pillW, 20, 10, 10, "F");
  doc.setTextColor(20, 18, 16); doc.text(label, MARGIN + 9, y + 14);
  y += 32;
  const rows = [
    ["Invoice reference", ref],
    ["Invoice date", data.invoiceDate || todayStr],
    ["Due date", data.dueDate || "—"],
    ["Project", data.projectName || "—"],
    ["Total due", fGBP(totals?.totalDue || 0)],
  ];
  rows.forEach(([k, v]) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(160, 155, 145);
    doc.text(k.toUpperCase(), MARGIN, y);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(240, 237, 232);
    const vLines = doc.splitTextToSize(String(v), pageWidth - MARGIN * 2);
    vLines.forEach((l, i) => doc.text(l, MARGIN, y + 14 + i * 14));
    y += 14 + vLines.length * 14 + 8;
  });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(160, 155, 145);
  doc.text((company || "").toUpperCase(), MARGIN, pageHeight - 60);
  doc.text("Generated by Morris  ·  morrisapp.co.uk", MARGIN, pageHeight - 46);
}
function computeColumnWidths(s, ratios) { const usable = s.pageWidth - MARGIN * 2; return ratios.map(r => usable * r); }
function ensureRoom(s, n = 20) { if (s.y + n > s.pageHeight - 70) newPage(s); }
function newPage(s) {
  addFooter(s.doc, s.pageWidth, s.pageHeight, s.user, s.ref, s.todayStr, s.userName);
  s.doc.addPage();
  s.doc.setFillColor(255, 255, 255); s.doc.rect(0, 0, s.pageWidth, s.pageHeight, "F");
  drawHeader(s.doc, s.pageWidth, MARGIN, s.user, s.company, s.todayStr, null);
  s.y = 110;
}
function section(s, title) {
  ensureRoom(s, 34);
  s.sectionNum = (s.sectionNum || 0) + 1;
  s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(13); s.doc.setTextColor(...INK);
  s.doc.text(`${s.sectionNum}. ${title}`, MARGIN, s.y);
  s.doc.setDrawColor(...GOLD); s.doc.setLineWidth(0.6);
  s.doc.line(MARGIN, s.y + 4, s.pageWidth - MARGIN, s.y + 4);
  s.y += 20;
}
function subSection(s, title) {
  ensureRoom(s, 22);
  s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(10.5); s.doc.setTextColor(...MUTED);
  s.doc.text(title, MARGIN, s.y); s.y += 14;
}
function para(s, text) {
  s.doc.setFont("helvetica", "normal"); s.doc.setFontSize(11); s.doc.setTextColor(...INK);
  const lines = s.doc.splitTextToSize(String(text || ""), s.pageWidth - MARGIN * 2);
  lines.forEach(l => { ensureRoom(s, 15); s.doc.text(l, MARGIN, s.y); s.y += 14; });
  s.y += 6;
}
function kvTable(s, rows) { const usable = s.pageWidth - MARGIN * 2; table(s, null, rows, { colWidths: [usable * 0.32, usable * 0.68], header: false, zebra: true }); }
function twoColKv(s, left, right) {
  const usable = s.pageWidth - MARGIN * 2;
  const half = (usable - 12) / 2;
  const startY = s.y;
  const drawSide = (rows, xOffset) => {
    let y = startY;
    rows.forEach(([k, v], i) => {
      const kW = 90, vW = half - kW;
      const wrapped = s.doc.splitTextToSize(String(v ?? ""), vW - 8);
      const h = Math.max(1, wrapped.length) * 12 + 6;
      if (i % 2 === 1) { s.doc.setFillColor(...ZEBRA); s.doc.rect(MARGIN + xOffset, y, half, h, "F"); }
      s.doc.setDrawColor(...BORDER); s.doc.setLineWidth(0.4);
      s.doc.rect(MARGIN + xOffset, y, half, h);
      s.doc.line(MARGIN + xOffset + kW, y, MARGIN + xOffset + kW, y + h);
      s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(9); s.doc.setTextColor(...GOLD);
      s.doc.text(String(k), MARGIN + xOffset + 6, y + 12);
      s.doc.setFont("helvetica", "normal"); s.doc.setFontSize(9.5); s.doc.setTextColor(...INK);
      wrapped.forEach((l, j) => s.doc.text(l, MARGIN + xOffset + kW + 6, y + 12 + j * 12));
      y += h;
    });
    return y;
  };
  const yL = drawSide(left, 0);
  const yR = drawSide(right, half + 12);
  s.y = Math.max(yL, yR) + 8;
}
function table(s, header, rows, opts = {}) {
  const usable = s.pageWidth - MARGIN * 2;
  const colWidths = opts.colWidths || (header ? Array(header.length).fill(usable / header.length) : [usable]);
  const padX = 6, padY = 4;
  if (header && opts.header !== false) {
    ensureRoom(s, 24);
    s.doc.setFillColor(245, 240, 225);
    s.doc.rect(MARGIN, s.y, colWidths.reduce((a, b) => a + b, 0), 22, "F");
    s.doc.setDrawColor(...BORDER); s.doc.setLineWidth(0.4);
    s.doc.rect(MARGIN, s.y, colWidths.reduce((a, b) => a + b, 0), 22);
    s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(9.5); s.doc.setTextColor(...INK);
    let cx = MARGIN;
    header.forEach((h, i) => { s.doc.text(String(h), cx + padX, s.y + 14); if (i > 0) s.doc.line(cx, s.y, cx, s.y + 22); cx += colWidths[i]; });
    s.y += 22;
  }
  s.doc.setFont("helvetica", "normal"); s.doc.setFontSize(9.5); s.doc.setTextColor(...INK);
  (rows || []).forEach((row, rIdx) => {
    const wrapped = row.map((c, i) => s.doc.splitTextToSize(String(c ?? ""), colWidths[i] - padX * 2));
    const h = Math.max(...wrapped.map(w => w.length)) * 12 + padY * 2;
    ensureRoom(s, h);
    if (opts.zebra && rIdx % 2 === 1) { s.doc.setFillColor(...ZEBRA); s.doc.rect(MARGIN, s.y, colWidths.reduce((a, b) => a + b, 0), h, "F"); }
    s.doc.setDrawColor(...BORDER); s.doc.setLineWidth(0.4);
    s.doc.rect(MARGIN, s.y, colWidths.reduce((a, b) => a + b, 0), h);
    let vx = MARGIN;
    for (let i = 0; i < colWidths.length - 1; i++) { vx += colWidths[i]; s.doc.line(vx, s.y, vx, s.y + h); }
    let cx = MARGIN;
    wrapped.forEach((ws, i) => { ws.forEach((l, j) => s.doc.text(l, cx + padX, s.y + padY + 9 + j * 12)); cx += colWidths[i]; });
    s.y += h;
  });
  s.y += 6;
}
