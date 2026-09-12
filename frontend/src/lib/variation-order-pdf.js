// Morris — Variation Orders V2 PDF renderer.
// Professional Variation Order: cover + project + instruction + description
// + cost breakdown + programme impact + evidence + terms + dual sign-off.

import { jsPDF } from "jspdf";
import { drawHeader, addFooter, finalizeFooters } from "./pdf";
import { formatUKDate } from "./uk-format";

const GOLD = [232, 160, 32], INK = [20, 20, 20], MUTED = [110, 110, 110], BORDER = [180, 180, 180], ZEBRA = [248, 246, 242];
const MARGIN = 48;

const fGBP = (n) => `£${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
// Format any stored date (ISO or already-DD/MM/YYYY) for display. Callers
// used to render raw ISO strings on customer PDFs — now everything routes
// through here so a UK user sees DD/MM/YYYY consistently.
const fDate = (v) => formatUKDate(v) || "—";
const STATUS_COLOUR = {
  "Draft": [140, 140, 140],
  "Submitted": [232, 160, 32],
  "Approved": [104, 211, 145],
  "Rejected": [242, 124, 124],
  "In Progress": [180, 180, 180],
};

export function generateVariationPdf({ data, user, today }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const userName = user?.fullName || user?.username || "";
  const company = user?.companyName || userName;
  const todayStr = today || new Date().toLocaleDateString("en-GB");
  const ref = data.variationRef || "VO-DRAFT";
  const totals = data.totals || {};
  const status = data.status || "Draft";

  drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight, totals, status });
  doc.addPage();
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawHeader(doc, pageWidth, MARGIN, user, company, todayStr, "Variation Order");
  const state = { y: 150, doc, pageWidth, pageHeight, user, company, todayStr, ref, userName, sectionNum: 0 };

  // 1. Project details
  section(state, "Project Details");
  kvTable(state, [
    ["Project", data.projectName || "—"],
    ["Site address", data.projectAddress || "—"],
    ["Client", data.clientName || "—"],
    ["Client company", data.clientCompany || "—"],
    ["Client email", data.clientEmail || "—"],
    ["Client phone", data.clientPhone || "—"],
    ["Original contract ref", data.originalContractRef || "—"],
    ["Original contract date", fDate(data.originalContractDate)],
    ["Linked quote", data.originalQuoteRef || "—"],
  ]);

  // 2. Variation summary
  section(state, "Variation Summary");
  kvTable(state, [
    ["Variation reference", ref],
    ["Date raised", fDate(data.variationDate) || todayStr],
    ["Status", status],
    ["Reason", data.reason || "—"],
    ["Instruction method", data.instructionMethod || "—"],
    ["Instructor name", data.instructorName || "—"],
    ["Instructor role", data.instructorRole || "—"],
    ["Instruction date", fDate(data.instructionDate)],
    ["Location on site", data.instructionLocation || "—"],
  ]);

  // 3. Original scope + description of change
  if (data.scopeSummary) {
    section(state, "Original Scope");
    para(state, data.scopeSummary);
  }
  section(state, "Description of Change");
  para(state, data.descriptionOfChange || "—");
  if (data.reasonNarrative) {
    subSection(state, "Reason narrative");
    para(state, data.reasonNarrative);
  }
  if (data.referenceDocs) {
    subSection(state, "Reference documents");
    para(state, data.referenceDocs);
  }

  // 4. Cost breakdown
  const items = data.lineItems || [];
  if (items.length > 0) {
    // VO-PDF-01 (Sep 2026) — pre-compute the height of the cost table's
    // header + first data row so section() reserves enough room for BOTH
    // the section heading and the table's first meaningful block. Without
    // this, the section heading fits on the current page but table() then
    // inserts a page break before drawing the header row, orphaning the
    // heading on the previous page.
    const costColWidths = computeColumnWidths(state, [0.16, 0.36, 0.08, 0.10, 0.14, 0.16]);
    const firstItem = items[0];
    const firstRowCells = [
      firstItem.category || "—",
      firstItem.description || "—",
      String(firstItem.qty || ""),
      firstItem.unit || "",
      fGBP(firstItem.unitPrice),
      fGBP((Number(firstItem.qty) || 0) * (Number(firstItem.unitPrice) || 0)),
    ];
    // padX=8 assumed by the table() helper; splitTextToSize replicates its wrap.
    const firstRowLineCounts = firstRowCells.map((c, i) =>
      state.doc.splitTextToSize(String(c ?? ""), Math.max(0, costColWidths[i] - 16)).length
    );
    const firstRowLines = Math.max(...firstRowLineCounts, 1);
    const firstRowH = firstRowLines * 12 + 12; // ~12pt line + padY
    const costMinBody = 22 /* table header */ + firstRowH + 8 /* margin below rule */;
    section(state, "Cost Breakdown", { minBodyHeight: costMinBody });
    table(state, ["Category", "Description", "Qty", "Unit", "Unit price", "Line total"],
      items.map(it => [it.category || "—", it.description || "—", it.qty || "", it.unit || "", fGBP(it.unitPrice), fGBP((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))]),
      { colWidths: costColWidths });

    const byCat = totals.byCategory || {};
    if (Object.keys(byCat).length > 1) {
      subSection(state, "Subtotal by category");
      const rows = Object.entries(byCat).map(([k, v]) => [k, fGBP(v)]);
      table(state, null, rows, { colWidths: [state.pageWidth - MARGIN * 2 - 120, 120], header: false, zebra: true });
    }

    subSection(state, "Total");
    const totalRows = [["Subtotal", fGBP(totals.subtotal || 0)]];
    if (data.addVat) {
      totalRows.push([`VAT @ ${totals.vatRate ?? data.vatRate ?? 20}%`, fGBP(totals.vatAmount || 0)]);
      totalRows.push(["TOTAL VARIATION COST (inc VAT)", fGBP(totals.total || 0)]);
    } else {
      totalRows.push(["TOTAL VARIATION COST", fGBP(totals.total || 0)]);
    }
    table(state, null, totalRows, { colWidths: [state.pageWidth - MARGIN * 2 - 160, 160], header: false, zebra: true });
  } else {
    section(state, "Cost Breakdown");
    para(state, "No cost items have been recorded on this variation.");
  }

  // 5. Programme impact
  // VO-PDF-01 (Sep 2026) — pre-compute the exact body height so the
  // heading is never rendered without at least the impact-type row + any
  // additional-days rows fitting underneath it on the SAME page. Zebra
  // table rows are ~20pt tall (single-line values); a wrapped notes row
  // can be taller so we allow for the worst case at reservation time.
  const impact = data.programmeImpact || {};
  const impactKind = impact.kind || "No impact";
  const impactRows = [["Impact type", impactKind]];
  if (impactKind === "Additional days" || impactKind === "Reduction in days") {
    const days = Number(impact.days) || 0;
    const sign = impactKind === "Reduction in days" ? "-" : "";
    impactRows.push(["Days", `${sign}${Math.round(days)} working day${Math.round(days) === 1 ? "" : "s"}`]);
    if (impact.newPCDate) impactRows.push(["New Practical Completion date", fDate(impact.newPCDate)]);
  }
  if (impact.notes) impactRows.push(["Notes", impact.notes]);
  const impactColWidths = [state.pageWidth - MARGIN * 2 - 260, 260];
  // Estimate row height per row: default 22pt; add 12pt per extra wrapped
  // line for the second column (usually the notes / impact-type value).
  const impactRowHeights = impactRows.map(([, val]) => {
    const lines = state.doc.splitTextToSize(String(val ?? ""), impactColWidths[1] - 16); // padX = 8 on each side approx
    return Math.max(22, lines.length * 12 + 10);
  });
  const impactTableHeight = impactRowHeights.reduce((a, b) => a + b, 0) + 8; // + spacing after
  section(state, "Programme / Time Impact", { minBodyHeight: impactTableHeight });
  table(state, null, impactRows, { colWidths: impactColWidths, header: false, zebra: true });

  // 6. Evidence
  const docsAttached = data.supportingDocs || [];
  const photoIds = data.photoIds || [];
  if (docsAttached.length > 0 || photoIds.length > 0) {
    section(state, "Supporting Evidence");
    if (docsAttached.length > 0) {
      subSection(state, "Documents attached");
      const rows = docsAttached.map((d, i) => [String(i + 1), d.name || d.id || "Document"]);
      table(state, null, rows, { colWidths: [40, state.pageWidth - MARGIN * 2 - 40], header: false, zebra: true });
    }
    if (photoIds.length > 0) {
      subSection(state, "Photos linked from Photo Vault");
      para(state, `${photoIds.length} photo${photoIds.length === 1 ? "" : "s"} attached from the Photo Vault. Reference IDs: ${photoIds.slice(0, 12).join(", ")}${photoIds.length > 12 ? "…" : ""}`);
    }
  }

  // 7. Terms
  section(state, "Terms");
  para(state, data.paymentTerms || "Payment for this variation will be included in the next Application for Payment.");
  para(state, "Any variation to the scope of works above will only be valid once agreed in writing. This variation forms an addendum to the original contract.");
  if (data.notes) { subSection(state, "Additional notes"); para(state, data.notes); }

  // 8. Sign-off (dual: contractor + client approval)
  section(state, "Approval");
  if (status === "Rejected" && data.rejectionReason) {
    subSection(state, "Rejection reason");
    para(state, data.rejectionReason);
  }
  drawDualSignoff(state, data, user, todayStr);

  addFooter(doc, pageWidth, pageHeight, user, ref, todayStr, userName);
  finalizeFooters(doc, { user, ref, today: todayStr, userName, pageWidth, pageHeight, skipPages: [1] });
  return doc;
}

export function downloadVariationPdf(args) {
  const d = generateVariationPdf(args);
  const project = (args?.data?.projectName || args?.data?.clientName || "variation").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  d.save(`variation-order-${args?.data?.variationRef || "draft"}-${project}.pdf`);
}
export function variationPdfBlobUrl(args) { return generateVariationPdf(args).output("bloburl"); }

// ---------- helpers ----------
function drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight, totals, status }) {
  doc.setFillColor(20, 18, 16); doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setDrawColor(...GOLD); doc.setLineWidth(1.5);
  doc.line(MARGIN, 90, pageWidth - MARGIN, 90);
  doc.line(MARGIN, pageHeight - 90, pageWidth - MARGIN, pageHeight - 90);
  if (user?.companyLogo) { try { doc.addImage(user.companyLogo, "PNG", MARGIN, 30, 120, 44, undefined, "FAST"); } catch { /* ignore */ } }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...GOLD);
  doc.text("VARIATION ORDER", MARGIN, 140);
  doc.setFontSize(30); doc.setTextColor(240, 237, 232);
  const wrapped = doc.splitTextToSize(data.projectName || data.clientCompany || "Project", pageWidth - MARGIN * 2);
  let y = 175; wrapped.forEach(l => { doc.text(l, MARGIN, y); y += 34; });
  y += 12;

  // Status pill
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
    ["Date raised", fDate(data.variationDate) || todayStr],
    ["Reason", data.reason || "—"],
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
function section(s, title, opts = {}) {
  s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(13); s.doc.setTextColor(...INK);
  const usable = s.pageWidth - MARGIN * 2;
  const lineH = 16;
  s.sectionNum = (s.sectionNum || 0) + 1;
  const lines = s.doc.splitTextToSize(`${s.sectionNum}. ${title}`, usable);
  // P3 (Sep 2026) — reserve room for the heading AND a minimum first
  // body block so a section heading never orphans at the page bottom.
  // Callers can override the body reservation via `opts.minBodyHeight`
  // when the exact first block is known (e.g. the Programme / Time
  // Impact KV table — VO-PDF-01, 12 Sep 2026). Default 80pt covers
  // heading + a 22pt table header + a ~30pt first data row + margin.
  const minBody = typeof opts.minBodyHeight === "number" ? opts.minBodyHeight : 80;
  ensureRoom(s, lines.length * lineH + minBody);
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
    // P3 — reserve room for the header row AND the first body row so a
    // table header never gets orphaned at the bottom of a page.
    const firstRowH = rows && rows.length > 0
      ? Math.max(...rows[0].map((c, i) => s.doc.splitTextToSize(String(c ?? ""), colWidths[i] - padX * 2).length)) * 12 + padY * 2
      : 22;
    ensureRoom(s, 22 + firstRowH);
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
    { title: "PREPARED BY (CONTRACTOR)", name: data.preparedBy || user?.fullName || "—", sig: data.preparedSignature, date: fDate(data.variationDate) || todayStr },
    { title: "APPROVED BY (CLIENT)", name: data.clientApproverName || "—", sig: data.clientApproverSignature, date: fDate(data.approvedDate) },
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
    s.doc.text("Date:", x + 8, boxTop + 80);
    s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(10); s.doc.setTextColor(...INK);
    s.doc.text(cell.date, x + 8, boxTop + 94);
    if (cell.sig) {
      try { s.doc.addImage(cell.sig, "PNG", x + 8, boxTop + 100, cellW - 16, 34, undefined, "FAST"); } catch { /* ignore */ }
    } else {
      // P3 (Sep 2026) — no persisted signature → say so explicitly.
      s.doc.setFont("helvetica", "italic"); s.doc.setFontSize(9); s.doc.setTextColor(...MUTED);
      s.doc.text("Signature to follow", x + 8, boxTop + 120);
    }
  });
  s.y = boxTop + cellH + 8;
}
