// Morris — Applications for Payment V2 PDF renderer.
// Professional payment application: cover + project + contract details +
// valuation table + previous applications history + certification summary
// (retention, CIS, VAT, adjustments) + supporting evidence + dual sign-off.

import { jsPDF } from "jspdf";
import { drawHeader, addFooter } from "./pdf";

const GOLD = [232, 160, 32], INK = [20, 20, 20], MUTED = [110, 110, 110], BORDER = [180, 180, 180], ZEBRA = [248, 246, 242];
const MARGIN = 48;

const fGBP = (n) => `£${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
const STATUS_COLOUR = {
  Draft: [140, 140, 140],
  Submitted: [232, 160, 32],
  Certified: [104, 211, 145],
  Paid: [104, 180, 240],
  Rejected: [242, 124, 124],
};

export function generateAfpPdf({ data, user, today }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const userName = user?.fullName || user?.username || "";
  const company = user?.companyName || userName;
  const todayStr = today || new Date().toLocaleDateString("en-GB");
  const ref = data.applicationRef || "AFP-DRAFT";
  const totals = data.totals || {};
  const status = data.status || "Draft";

  drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight, totals, status });
  doc.addPage();
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawHeader(doc, pageWidth, MARGIN, user, company, todayStr, "Application for Payment");
  const state = { y: 150, doc, pageWidth, pageHeight, user, company, todayStr, ref, userName, sectionNum: 0 };

  // 1. Application details
  section(state, "Application Details");
  kvTable(state, [
    ["Application reference", ref],
    ["Application number", `#${data.applicationNumber || 1}`],
    ["Application date", data.applicationDate || todayStr],
    ["Period from", data.periodFrom || "—"],
    ["Period to", data.periodTo || "—"],
    ["Payment due date", data.dueDate || "—"],
    ["Status", status],
  ]);

  // 2. Project & contract
  section(state, "Project & Contract");
  kvTable(state, [
    ["Project", data.projectName || "—"],
    ["Site address", data.projectAddress || "—"],
    ["Client", data.clientName || "—"],
    ["Client company", data.clientCompany || "—"],
    ["Contract reference", data.contractRef || "—"],
    ["Contract date", data.contractDate || "—"],
    ["Original contract sum", fGBP(data.contractSum || 0)],
    ["Approved variations to date", fGBP(totals.approvedVariationsValue || 0)],
    ["Revised contract sum", fGBP((Number(data.contractSum) || 0) + (totals.approvedVariationsValue || 0))],
  ]);

  // 3. Current valuation breakdown
  const items = data.lineItems || [];
  section(state, "Current Valuation");
  if (items.length > 0) {
    table(state, ["Category", "Description", "Value to date"],
      items.map(it => [it.category || "—", it.description || "—", fGBP(it.valueToDate)]),
      { colWidths: computeColumnWidths(state, [0.24, 0.54, 0.22]) });
    const byCat = totals.byCategory || {};
    if (Object.keys(byCat).length > 1) {
      subSection(state, "Subtotal by category");
      table(state, null, Object.entries(byCat).map(([k, v]) => [k, fGBP(v)]),
        { colWidths: [state.pageWidth - MARGIN * 2 - 140, 140], header: false, zebra: true });
    }
  } else {
    para(state, "No line items on this valuation.");
  }

  // 4. Previous applications (if any provided as `previousApplications` on the payload)
  // P0.2 (Sep 2026) — split Application Value from Certified. A Submitted or
  // Rejected row must NEVER show a Certified amount derived from gross
  // valuation; the PDF must remain commercially accurate.
  const prev = data.previousApplications || [];
  if (prev.length > 0) {
    section(state, "Previous Applications for this Project");
    table(state, ["#", "Ref", "Date", "Status", "Application Value", "Certified"],
      prev.map(p => {
        const isCert = p.status === "Certified" || p.status === "Paid";
        const certified = isCert ? (Number(p.certifiedAmount) || 0) : 0;
        return [
          String(p.applicationNumber || ""),
          p.applicationRef || "—",
          p.applicationDate || "—",
          p.status || "—",
          fGBP(p.grossIncludingVariations || 0),
          fGBP(certified),
        ];
      }),
      { colWidths: computeColumnWidths(state, [0.06, 0.20, 0.16, 0.16, 0.20, 0.22]) });
  }

  // 5. Certification summary
  section(state, "Certification Summary");
  const rows = [
    ["Gross valuation this valuation", fGBP(totals.grossValuation || 0)],
    ["Add: Approved variations", fGBP(totals.approvedVariationsValue || 0)],
    ["Gross valuation inc variations", fGBP(totals.grossIncludingVariations || 0)],
    ["Less: Previously certified", `(${fGBP(totals.previouslyCertified || 0)})`],
    ["Value of work in this period", fGBP(totals.thisPeriod || 0)],
    [`Less: Retention (${totals.retentionRate || 0}% of gross)`, `(${fGBP(totals.retentionThisPeriod || 0)})`],
  ];
  if ((totals.adjustments || 0) !== 0) {
    rows.push([data.adjustmentNote ? `Adjustment: ${data.adjustmentNote}` : "Adjustment", `${(totals.adjustments || 0) < 0 ? "(" : ""}${fGBP(Math.abs(totals.adjustments || 0))}${(totals.adjustments || 0) < 0 ? ")" : ""}`]);
  }
  rows.push(["Subtotal (net of retention)", fGBP(totals.subtotalNet || 0)]);
  if ((totals.cisRate || 0) > 0) {
    rows.push([`Less: CIS deduction (${totals.cisRate}% of labour portion)`, `(${fGBP(totals.cisDeduction || 0)})`]);
  }
  if ((totals.vatAmount || 0) > 0) {
    rows.push([`Add: VAT (${totals.vatTreatment})`, fGBP(totals.vatAmount || 0)]);
  } else if ((totals.vatTreatment || "").startsWith("Reverse charge")) {
    rows.push(["VAT — Reverse charge", "Customer to account for VAT to HMRC"]);
  } else if ((totals.vatTreatment || "") === "Exempt") {
    rows.push(["VAT — Exempt", "No VAT chargeable"]);
  }
  rows.push(["TOTAL DUE THIS APPLICATION", fGBP(totals.totalDue || 0)]);
  table(state, null, rows, { colWidths: [state.pageWidth - MARGIN * 2 - 180, 180], header: false, zebra: true });

  // Retention running balance
  subSection(state, "Retention running balance");
  table(state, null, [
    ["Retention previously held", fGBP(totals.previousRetentionHeld || 0)],
    ["Retention this valuation", fGBP(totals.retentionThisPeriod || 0)],
    ["Total retention held to date", fGBP(totals.totalRetention || 0)],
  ], { colWidths: [state.pageWidth - MARGIN * 2 - 180, 180], header: false, zebra: true });

  // 6. Supporting evidence
  const docsAttached = data.supportingDocs || [];
  const photoIds = data.photoIds || [];
  if (docsAttached.length > 0 || photoIds.length > 0) {
    section(state, "Supporting Evidence");
    if (docsAttached.length > 0) {
      subSection(state, "Documents attached");
      table(state, null, docsAttached.map((d, i) => [String(i + 1), d.name || d.id || "Document"]),
        { colWidths: [40, state.pageWidth - MARGIN * 2 - 40], header: false, zebra: true });
    }
    if (photoIds.length > 0) {
      subSection(state, "Photos linked from Photo Vault");
      para(state, `${photoIds.length} photo${photoIds.length === 1 ? "" : "s"} attached from the Photo Vault.`);
    }
  }

  // 7. Terms & notes
  section(state, "Terms");
  para(state, data.paymentTerms || "Payment due within 30 days of certification. Interest may be charged under the Late Payment of Commercial Debts (Interest) Act 1998.");
  if (data.notes) { subSection(state, "Additional notes"); para(state, data.notes); }
  if (status === "Rejected" && data.rejectionReason) { subSection(state, "Rejection reason"); para(state, data.rejectionReason); }

  // 8. Sign-off
  section(state, "Certification");
  drawDualSignoff(state, data, user, todayStr);

  addFooter(doc, pageWidth, pageHeight, user, ref, todayStr, userName);
  return doc;
}

export function downloadAfpPdf(args) {
  const d = generateAfpPdf(args);
  const project = (args?.data?.projectName || args?.data?.clientName || "afp").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  d.save(`application-for-payment-${args?.data?.applicationRef || "draft"}-${project}.pdf`);
}
export function afpPdfBlobUrl(args) { return generateAfpPdf(args).output("bloburl"); }

// ---------- helpers (kept local for tree-shaking) ----------
function drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight, totals, status }) {
  doc.setFillColor(20, 18, 16); doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setDrawColor(...GOLD); doc.setLineWidth(1.5);
  doc.line(MARGIN, 90, pageWidth - MARGIN, 90);
  doc.line(MARGIN, pageHeight - 90, pageWidth - MARGIN, pageHeight - 90);
  if (user?.companyLogo) { try { doc.addImage(user.companyLogo, "PNG", MARGIN, 30, 120, 44, undefined, "FAST"); } catch { /* ignore */ } }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...GOLD);
  doc.text(`APPLICATION FOR PAYMENT #${data.applicationNumber || 1}`, MARGIN, 140);
  doc.setFontSize(30); doc.setTextColor(240, 237, 232);
  const wrapped = doc.splitTextToSize(data.projectName || data.clientCompany || "Project", pageWidth - MARGIN * 2);
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
    ["Prepared for", data.clientName || data.clientCompany || "—"],
    ["Site", data.projectAddress || "—"],
    ["Reference", ref],
    ["Application date", data.applicationDate || todayStr],
    ["Period", `${data.periodFrom || "—"} — ${data.periodTo || "—"}`],
    ["Payment due", data.dueDate || "—"],
    ["Total due this application", fGBP(totals?.totalDue || 0)],
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
function kvTable(s, rows) { const usable = s.pageWidth - MARGIN * 2; table(s, null, rows, { colWidths: [usable * 0.34, usable * 0.66], header: false, zebra: true }); }
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
  const gap = 20; const cellW = (usable - gap) / 2; const cellH = 140;
  ensureRoom(s, cellH + 10);
  const boxTop = s.y;
  const cells = [
    { title: "PREPARED BY (CONTRACTOR)", name: data.preparedBy || user?.fullName || "—", sig: data.preparedSignature || user?.signature, date: data.applicationDate || todayStr },
    { title: "CERTIFIED BY (CLIENT / QS)", name: data.certifierName || "—", sig: data.certifierSignature, date: data.certifiedDate || "—", extra: data.certifierRole ? `Role: ${data.certifierRole}` : "" },
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
    if (cell.extra) {
      s.doc.setFont("helvetica", "normal"); s.doc.setFontSize(9); s.doc.setTextColor(...MUTED);
      s.doc.text(cell.extra, x + 8, boxTop + 72);
    }
    s.doc.setFont("helvetica", "normal"); s.doc.setFontSize(9); s.doc.setTextColor(...MUTED);
    s.doc.text("Date:", x + 8, boxTop + 82);
    s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(10); s.doc.setTextColor(...INK);
    s.doc.text(cell.date, x + 8, boxTop + 96);
    if (cell.sig) { try { s.doc.addImage(cell.sig, "PNG", x + 8, boxTop + 100, cellW - 16, 34, undefined, "FAST"); } catch { /* ignore */ } }
  });
  s.y = boxTop + cellH + 8;
}
