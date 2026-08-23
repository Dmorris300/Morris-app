// Morris — Purchase Orders V2 PDF renderer.
// Professional branded Purchase Order: cover + supplier + delivery + line
// items + totals + terms + authorisation.

import { jsPDF } from "jspdf";
import { drawHeader, addFooter } from "./pdf";

const GOLD = [232, 160, 32], INK = [20, 20, 20], MUTED = [110, 110, 110], BORDER = [180, 180, 180], ZEBRA = [248, 246, 242];
const MARGIN = 48;

const fGBP = (n) => `£${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
const STATUS_COLOUR = {
  "Draft": [140, 140, 140],
  "Sent": [232, 160, 32],
  "Approved": [104, 211, 145],
  "Ordered": [180, 180, 180],
  "Part Delivered": [200, 180, 100],
  "Delivered": [104, 211, 145],
  "Awaiting Invoice": [232, 160, 32],
  "Paid": [104, 211, 145],
  "Cancelled": [242, 124, 124],
};

export function generatePurchaseOrderPdf({ data, user, today }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const userName = user?.fullName || user?.username || "";
  const company = user?.companyName || userName;
  const todayStr = today || new Date().toLocaleDateString("en-GB");
  const ref = data.poRef || "PO-DRAFT";
  const totals = data.totals || {};
  const status = data.status || "Draft";

  drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight, totals, status });
  doc.addPage();
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawHeader(doc, pageWidth, MARGIN, user, company, todayStr, "Purchase Order");
  const state = { y: 150, doc, pageWidth, pageHeight, user, company, todayStr, ref, userName, sectionNum: 0 };

  // 1. Supplier
  section(state, "Supplier");
  kvTable(state, [
    ["Supplier", data.supplierName || "—"],
    ["Company", data.supplierCompany || "—"],
    ["Contact", data.supplierContact || "—"],
    ["Email", data.supplierEmail || "—"],
    ["Phone", data.supplierPhone || "—"],
    ["Address", data.supplierAddress || "—"],
    ["Supplier VAT no.", data.supplierVatNumber || "—"],
    ["Supplier account no.", data.supplierAccountNumber || "—"],
  ]);

  // 2. Order info
  section(state, "Purchase Order Details");
  kvTable(state, [
    ["PO reference", ref],
    ["PO date", data.poDate || todayStr],
    ["Status", status],
    ["Required by", data.requiredDate || "—"],
    ["Project", data.projectName || "—"],
    ["Site address", data.projectAddress || "—"],
    ["Internal reference", data.reference || "—"],
    ["Payment terms", data.paymentTerms || "—"],
  ]);

  // 3. Delivery
  section(state, "Delivery Instructions");
  kvTable(state, [
    ["Deliver to", data.deliveryAddress || data.projectAddress || "—"],
    ["Site contact", data.deliveryContact || "—"],
    ["Site phone", data.deliveryPhone || "—"],
    ["Requested delivery date", data.deliveryDate || data.requiredDate || "—"],
  ]);
  if (data.deliveryInstructions) {
    subSection(state, "Delivery notes");
    para(state, data.deliveryInstructions);
  }

  // 4. Line items
  const items = data.lineItems || [];
  section(state, "Ordered Items");
  if (items.length === 0) {
    para(state, "No items have been ordered on this Purchase Order.");
  } else {
    table(state,
      ["Category", "Description / Product code", "Qty", "Unit", "Unit price", "Line total"],
      items.map(it => [
        it.category || "—",
        [it.description || "—", it.productCode ? `Code: ${it.productCode}` : ""].filter(Boolean).join("\n"),
        it.qty || "",
        it.unit || "",
        fGBP(it.unitPrice),
        fGBP((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)),
      ]),
      { colWidths: computeColumnWidths(state, [0.14, 0.38, 0.08, 0.10, 0.14, 0.16]) }
    );

    // Category breakdown
    const byCat = totals.byCategory || {};
    if (Object.keys(byCat).length > 1) {
      subSection(state, "Subtotal by category");
      const rows = Object.entries(byCat).map(([k, v]) => [k, fGBP(v)]);
      table(state, null, rows, { colWidths: [state.pageWidth - MARGIN * 2 - 120, 120], header: false, zebra: true });
    }

    // Totals
    subSection(state, "Order totals");
    const totalRows = [
      ["Subtotal", fGBP(totals.subtotal || 0)],
    ];
    if (totals.discount && Number(totals.discount) > 0) {
      totalRows.push(["Discount", `- ${fGBP(totals.discount)}`]);
      totalRows.push(["Subtotal after discount", fGBP(totals.subtotalAfterDiscount || 0)]);
    }
    if (totals.deliveryCharge && Number(totals.deliveryCharge) > 0) {
      totalRows.push(["Delivery charge", fGBP(totals.deliveryCharge)]);
    }
    if ((totals.vatRate || 0) > 0) {
      totalRows.push([`VAT @ ${totals.vatRate}%`, fGBP(totals.vatAmount || 0)]);
    } else if (totals.vatTreatment === "Reverse charge (0%)") {
      totalRows.push(["VAT (reverse charge)", "Customer accounts for VAT under VAT Notice 735"]);
    } else if (totals.vatTreatment && totals.vatTreatment !== "Standard 20%") {
      totalRows.push([`VAT (${totals.vatTreatment})`, fGBP(totals.vatAmount || 0)]);
    }
    totalRows.push(["TOTAL PURCHASE ORDER VALUE", fGBP(totals.total || 0)]);
    table(state, null, totalRows, { colWidths: [state.pageWidth - MARGIN * 2 - 200, 200], header: false, zebra: true });
  }

  // 5. Goods received (if any)
  const receipts = data.goodsReceived || [];
  if (receipts.length > 0) {
    section(state, "Goods Received Log");
    const rows = receipts.map(r => {
      const totalQty = (r.lines || []).reduce((a, l) => a + (Number(l.qty) || 0), 0);
      return [
        r.date || "—",
        r.receivedBy || "—",
        r.deliveryNoteRef || "—",
        `${totalQty}`,
        r.notes || "",
      ];
    });
    table(state, ["Date", "Received by", "Delivery note", "Qty", "Notes"], rows, {
      colWidths: computeColumnWidths(state, [0.15, 0.20, 0.20, 0.10, 0.35]),
    });
  }

  // 6. Matched invoices (if any)
  const matched = data.matchedInvoices || [];
  if (matched.length > 0) {
    section(state, "Matched Supplier Invoices");
    const rows = matched.map(m => [
      m.invoiceNumber || "—",
      m.invoiceDate || "—",
      m.dueDate || "—",
      fGBP(m.amount || 0),
      m.status || "Draft",
    ]);
    table(state, ["Invoice no.", "Invoice date", "Due date", "Amount", "Status"], rows, {
      colWidths: computeColumnWidths(state, [0.24, 0.18, 0.18, 0.20, 0.20]),
    });
    subSection(state, "Match status");
    para(state, data.matchStatus || "Unmatched");
  }

  // 7. Terms
  section(state, "Terms & Conditions");
  para(state, data.terms || "Goods must be delivered in accordance with this Purchase Order. Any variation must be agreed in writing before delivery.");
  if (data.notes) {
    subSection(state, "Additional notes");
    para(state, data.notes);
  }

  // 8. Authorisation
  section(state, "Authorisation");
  drawAuthorisation(state, data, user, todayStr);

  addFooter(doc, pageWidth, pageHeight, user, ref, todayStr, userName);
  return doc;
}

export function downloadPurchaseOrderPdf(args) {
  const d = generatePurchaseOrderPdf(args);
  const supplier = (args?.data?.supplierName || args?.data?.supplierCompany || "supplier").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  d.save(`purchase-order-${args?.data?.poRef || "draft"}-${supplier}.pdf`);
}
export function purchaseOrderPdfBlobUrl(args) { return generatePurchaseOrderPdf(args).output("bloburl"); }

// ---------- helpers ----------
function drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight, totals, status }) {
  doc.setFillColor(20, 18, 16); doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setDrawColor(...GOLD); doc.setLineWidth(1.5);
  doc.line(MARGIN, 90, pageWidth - MARGIN, 90);
  doc.line(MARGIN, pageHeight - 90, pageWidth - MARGIN, pageHeight - 90);
  if (user?.companyLogo) { try { doc.addImage(user.companyLogo, "PNG", MARGIN, 30, 120, 44, undefined, "FAST"); } catch { /* ignore */ } }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...GOLD);
  doc.text("PURCHASE ORDER", MARGIN, 140);
  doc.setFontSize(30); doc.setTextColor(240, 237, 232);
  const title = data.supplierCompany || data.supplierName || "Supplier";
  const wrapped = doc.splitTextToSize(title, pageWidth - MARGIN * 2);
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
    ["Issued to", data.supplierName || data.supplierCompany || "—"],
    ["Project", data.projectName || "—"],
    ["Site", data.projectAddress || data.deliveryAddress || "—"],
    ["Reference", ref],
    ["Date raised", data.poDate || todayStr],
    ["Required by", data.requiredDate || "—"],
    ["Total (inc VAT)", fGBP(totals?.total || 0)],
  ];
  rows.forEach(([k, v]) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(160, 155, 145);
    doc.text(k.toUpperCase(), MARGIN, y);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(240, 237, 232);
    const vLines = doc.splitTextToSize(String(v), pageWidth - MARGIN * 2);
    vLines.forEach((l, i) => doc.text(l, MARGIN, y + 14 + i * 14));
    y += 14 + vLines.length * 14 + 6;
  });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(160, 155, 145);
  doc.text((company || "").toUpperCase(), MARGIN, pageHeight - 60);
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
  s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(13); s.doc.setTextColor(...INK);
  const usable = s.pageWidth - MARGIN * 2;
  const lineH = 16;
  s.sectionNum = (s.sectionNum || 0) + 1;
  const lines = s.doc.splitTextToSize(`${s.sectionNum}. ${title}`, usable);
  ensureRoom(s, lines.length * lineH + 30);
  lines.forEach((l, i) => s.doc.text(l, MARGIN, s.y + i * lineH));
  const lastY = s.y + (lines.length - 1) * lineH;
  s.doc.setDrawColor(...GOLD); s.doc.setLineWidth(0.6);
  s.doc.line(MARGIN, lastY + 4, s.pageWidth - MARGIN, lastY + 4);
  s.y = lastY + 14;
}
function subSection(s, title) {
  s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(10.5); s.doc.setTextColor(...MUTED);
  const usable = s.pageWidth - MARGIN * 2;
  const lineH = 12;
  const lines = s.doc.splitTextToSize(String(title || ""), usable);
  ensureRoom(s, lines.length * lineH + 18);
  lines.forEach((l, i) => s.doc.text(l, MARGIN, s.y + i * lineH));
  s.y += lines.length * lineH + 2;
}
function para(s, text) {
  s.doc.setFont("helvetica", "normal"); s.doc.setFontSize(11); s.doc.setTextColor(...INK);
  const lines = s.doc.splitTextToSize(String(text || ""), s.pageWidth - MARGIN * 2);
  lines.forEach(l => { ensureRoom(s, 15); s.doc.text(l, MARGIN, s.y); s.y += 14; });
  s.y += 6;
}
function kvTable(s, rows) { const usable = s.pageWidth - MARGIN * 2; table(s, null, rows, { colWidths: [usable * 0.32, usable * 0.68], header: false, zebra: true }); }
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
function drawAuthorisation(s, data, user, todayStr) {
  const usable = s.pageWidth - MARGIN * 2;
  const gap = 20; const cellW = (usable - gap) / 2; const cellH = 130;
  ensureRoom(s, cellH + 10);
  const boxTop = s.y;
  const cells = [
    { title: "PREPARED BY", name: data.preparedBy || user?.fullName || "—", sig: data.preparedSignature || user?.signature, date: data.poDate || todayStr },
    { title: "APPROVED BY", name: data.approvedBy || "—", sig: null, date: data.approvedDate || "—" },
  ];
  cells.forEach((cell, i) => {
    const x = MARGIN + i * (cellW + gap);
    s.doc.setDrawColor(...BORDER); s.doc.setLineWidth(0.4);
    s.doc.rect(x, boxTop, cellW, cellH);
    s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(9); s.doc.setTextColor(...GOLD);
    s.doc.text(cell.title, x + 8, boxTop + 16);
    s.doc.setFont("helvetica", "normal"); s.doc.setFontSize(9); s.doc.setTextColor(...MUTED);
    s.doc.text("Name:", x + 8, boxTop + 34);
    s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(10.5); s.doc.setTextColor(...INK);
    const nameW = s.doc.splitTextToSize(cell.name, cellW - 16);
    nameW.slice(0, 2).forEach((l, k) => s.doc.text(l, x + 8, boxTop + 48 + k * 12));
    s.doc.setFont("helvetica", "normal"); s.doc.setFontSize(9); s.doc.setTextColor(...MUTED);
    s.doc.text("Date:", x + 8, boxTop + 78);
    s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(10); s.doc.setTextColor(...INK);
    s.doc.text(cell.date, x + 8, boxTop + 92);
    if (cell.sig) { try { s.doc.addImage(cell.sig, "PNG", x + 8, boxTop + 96, cellW - 16, 28, undefined, "FAST"); } catch { /* ignore */ } }
  });
  s.y = boxTop + cellH + 8;
}
