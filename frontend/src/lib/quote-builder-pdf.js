// Morris — Quote Builder V2 PDF renderer.
// Professional quotation: cover + client + scope + itemised pricing + exclusions
// + assumptions + provisional sums + stage payments + terms + sign-off.

import { jsPDF } from "jspdf";
import { drawHeader, addFooter } from "./pdf";

const GOLD = [232, 160, 32], INK = [20, 20, 20], MUTED = [110, 110, 110], BORDER = [180, 180, 180], ZEBRA = [248, 246, 242];
const MARGIN = 48;

const fGBP = (n) => `£${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

export function generateQuotePdf({ data, user, today }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const userName = user?.fullName || user?.username || "";
  const company = user?.companyName || userName;
  const todayStr = today || new Date().toLocaleDateString("en-GB");
  const ref = data.quoteRef || `Q-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-001`;
  const totals = data.totals || {};

  drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight, totals });
  doc.addPage();
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawHeader(doc, pageWidth, MARGIN, user, company, todayStr, "Quotation");
  const state = { y: 150, doc, pageWidth, pageHeight, user, company, todayStr, ref, userName, sectionNum: 0 };

  // 1. Client details
  section(state, "For the attention of");
  kvTable(state, [
    ["Client", data.clientName || "—"],
    ["Company", data.clientCompany || "—"],
    ["Email", data.clientEmail || "—"],
    ["Phone", data.clientPhone || "—"],
    ["Address", data.clientAddress || "—"],
  ]);

  // 2. Project summary
  section(state, "Project Summary");
  kvTable(state, [
    ["Project", data.projectName || "—"],
    ["Site address", data.projectAddress || "—"],
    ["Estimated duration", data.projectDuration || "—"],
    ["Proposed start", data.startDate || "—"],
    ["Quote reference", ref],
    ["Quote date", data.quoteDate || todayStr],
    ["Valid until", data.validUntil || "—"],
  ]);

  if (data.projectDescription) {
    subSection(state, "Project description");
    para(state, data.projectDescription);
  }

  // 3. Scope of works
  if (data.scopeOfWorks) {
    section(state, "Scope of Works");
    para(state, data.scopeOfWorks);
  }

  // 4. Itemised pricing
  const items = data.lineItems || [];
  if (items.length > 0) {
    section(state, "Itemised Pricing");
    table(state, ["Category", "Description", "Qty", "Unit", "Unit price", "Line total"],
      items.map(it => [it.category || "—", it.description || "—", it.qty || "", it.unit || "", fGBP(it.unitPrice), fGBP((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))]),
      { colWidths: computeColumnWidths(state, [0.14, 0.34, 0.08, 0.10, 0.14, 0.20]) });
    // Category subtotals
    const byCat = totals.byCategory || {};
    if (Object.keys(byCat).length > 1) {
      subSection(state, "Subtotal by category");
      const rows = Object.entries(byCat).map(([k, v]) => [k, fGBP(v)]);
      table(state, null, rows, { colWidths: [state.pageWidth - MARGIN * 2 - 120, 120], header: false, zebra: true });
    }
  }

  // 5. Provisional sums
  const prov = data.provisionalSums || [];
  if (prov.length > 0) {
    section(state, "Provisional Sums");
    table(state, ["Item", "Amount"],
      prov.map(p => [p.description || "—", fGBP(p.amount || 0)]),
      { colWidths: [state.pageWidth - MARGIN * 2 - 120, 120] });
    para(state, "Provisional sums are estimates carried as a contingency and adjusted against actual cost.");
  }

  // 6. Totals block
  section(state, "Summary");
  const totalRows = [
    ["Labour + Materials + Plant (Subtotal)", fGBP(totals.subtotal || 0)],
  ];
  if (totals.discountAmount) totalRows.push(["Discount", `-${fGBP(totals.discountAmount)}`]);
  if (totals.provisionalSumTotal) totalRows.push(["Provisional sums", fGBP(totals.provisionalSumTotal)]);
  totalRows.push(["Net", fGBP(totals.net || 0)]);
  totalRows.push([`VAT @ ${data.vatRate ?? 20}%`, fGBP(totals.vatAmount || 0)]);
  totalRows.push(["TOTAL (inc VAT)", fGBP(totals.total || 0)]);
  table(state, null, totalRows, { colWidths: [state.pageWidth - MARGIN * 2 - 140, 140], header: false, zebra: true });

  // 7. Exclusions & Assumptions
  if (data.exclusions) {
    section(state, "Exclusions");
    para(state, data.exclusions);
  }
  if (data.assumptions) {
    section(state, "Assumptions");
    para(state, data.assumptions);
  }

  // 8. Stage payments
  const stage = data.stagePayments || [];
  if (stage.length > 0) {
    section(state, "Stage Payment Schedule");
    table(state, ["Stage / milestone", "Due on / trigger", "%", "Amount"],
      stage.map(s => [s.milestone || "—", s.dueOn || "—", s.percentage ? `${s.percentage}%` : "—", fGBP(s.amount || 0)]),
      { colWidths: computeColumnWidths(state, [0.40, 0.28, 0.12, 0.20]) });
  }

  // 9. Terms
  section(state, "Terms & Conditions");
  para(state, data.paymentTerms || "Payment due 14 days from the date of each invoice.");
  para(state, `This quotation is valid until ${data.validUntil || "the date shown above"} and is subject to the exclusions and assumptions noted.`);
  if (data.notes) { subSection(state, "Additional notes"); para(state, data.notes); }

  // 10. Sign-off (dual: contractor + client acceptance)
  section(state, "Sign-off");
  drawDualSignoff(state, data, user, todayStr);

  addFooter(doc, pageWidth, pageHeight, user, ref, todayStr, userName);
  return doc;
}

export function downloadQuotePdf(args) {
  const d = generateQuotePdf(args);
  const project = (args?.data?.projectName || args?.data?.clientName || "quote").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  d.save(`quote-${project}-${args?.data?.quoteRef || "draft"}.pdf`);
}
export function quotePdfBlobUrl(args) { return generateQuotePdf(args).output("bloburl"); }

// ---------- helpers ----------
function drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight, totals }) {
  doc.setFillColor(20, 18, 16); doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setDrawColor(...GOLD); doc.setLineWidth(1.5);
  doc.line(MARGIN, 90, pageWidth - MARGIN, 90);
  doc.line(MARGIN, pageHeight - 90, pageWidth - MARGIN, pageHeight - 90);
  if (user?.companyLogo) { try { doc.addImage(user.companyLogo, "PNG", MARGIN, 30, 120, 44, undefined, "FAST"); } catch { /* ignore */ } }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...GOLD);
  doc.text("QUOTATION", MARGIN, 140);
  doc.setFontSize(30); doc.setTextColor(240, 237, 232);
  const wrapped = doc.splitTextToSize(data.projectName || "Project", pageWidth - MARGIN * 2);
  let y = 175; wrapped.forEach(l => { doc.text(l, MARGIN, y); y += 34; });
  y += 20;
  const rows = [
    ["Prepared for", data.clientName || data.clientCompany || "—"],
    ["Site", data.projectAddress || "—"],
    ["Reference", ref],
    ["Quote date", data.quoteDate || todayStr],
    ["Valid until", data.validUntil || "—"],
    ["Total (inc VAT)", fGBP(totals?.total || 0)],
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
function drawDualSignoff(s, data, user, todayStr) {
  const usable = s.pageWidth - MARGIN * 2;
  const gap = 20; const cellW = (usable - gap) / 2; const cellH = 130;
  ensureRoom(s, cellH + 10);
  const boxTop = s.y;
  const cells = [
    { title: "PREPARED BY (CONTRACTOR)", name: data.preparedBy || user?.fullName || "—", sig: data.preparedSignature || user?.signature, date: data.quoteDate || todayStr },
    { title: "ACCEPTED BY (CLIENT)", name: data.clientAcceptanceName || "—", sig: data.clientAcceptanceSignature, date: data.acceptedDate || "—" },
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
    s.doc.text("Date:", x + 8, boxTop + 76);
    s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(10); s.doc.setTextColor(...INK);
    s.doc.text(cell.date, x + 8, boxTop + 90);
    if (cell.sig) { try { s.doc.addImage(cell.sig, "PNG", x + 8, boxTop + 94, cellW - 16, 32, undefined, "FAST"); } catch { /* ignore */ } }
  });
  s.y = boxTop + cellH + 8;
}
