// Morris — Contract Management V2 PDF renderer.
// Professional Contract Summary: cover + parties + key dates + financials +
// scope + special conditions + milestones + notices + linked commercial items
// + insurance + terms + audit trail + sign-off.

import { jsPDF } from "jspdf";
import { drawHeader, addFooter } from "./pdf";

const GOLD = [232, 160, 32], INK = [20, 20, 20], MUTED = [110, 110, 110], BORDER = [180, 180, 180], ZEBRA = [248, 246, 242];
const MARGIN = 48;

const fGBP = (n) => `£${(Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
const STATUS_COLOUR = {
  Draft: [140, 140, 140],
  "Under Review": [200, 180, 100],
  Active: [104, 211, 145],
  "Expiring Soon": [232, 160, 32],
  Completed: [104, 211, 145],
  Terminated: [242, 124, 124],
  "On Hold": [180, 180, 180],
};

export function generateContractPdf({ data, user, today }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const userName = user?.fullName || user?.username || "";
  const company = user?.companyName || userName;
  const todayStr = today || new Date().toLocaleDateString("en-GB");
  const ref = data.contractRef || "CON-DRAFT";
  const status = data.liveStatus || data.status || "Draft";

  drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight, status });
  doc.addPage();
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawHeader(doc, pageWidth, MARGIN, user, company, todayStr, "Contract Summary");
  const state = { y: 150, doc, pageWidth, pageHeight, user, company, todayStr, ref, userName, sectionNum: 0 };

  // 1. Parties
  section(state, "Parties to the Contract");
  const twoCol = [
    [
      ["EMPLOYER / CLIENT"],
      [data.employerCompany || "—"],
      [data.employerName || "—"],
      [data.employerAddress || "—"],
      [data.employerEmail || ""],
      [data.employerPhone || ""],
    ],
    [
      ["CONTRACTOR"],
      [data.contractorCompany || company || "—"],
      [data.contractorName || userName || "—"],
      [data.contractorAddress || user?.companyAddress || "—"],
      [user?.email || ""],
      [user?.phone || ""],
    ],
  ];
  twoColBlock(state, twoCol);

  // 2. Contract identity
  section(state, "Contract Details");
  kvTable(state, [
    ["Contract reference", ref],
    ["Contract title", data.title || "—"],
    ["Contract type", data.contractType || "—"],
    ["Client's contract no.", data.contractNumber || "—"],
    ["Project", data.projectName || "—"],
    ["Site address", data.projectAddress || "—"],
    ["Current status", status],
  ]);

  // 3. Key Dates
  section(state, "Key Dates");
  kvTable(state, [
    ["Date of contract", data.dateOfContract || "—"],
    ["Start on site", data.startDate || "—"],
    ["Contract completion", data.completionDate || "—"],
    ["Practical completion", data.practicalCompletionDate || "—"],
    ["End of defects liability", data.defectsLiabilityEndDate || "—"],
    ["Final certificate", data.finalCertificateDate || "—"],
  ]);

  // 4. Financials
  section(state, "Contract Value & Retention");
  kvTable(state, [
    ["Contract value", fGBP(data.contractValue || 0)],
    ["Retention", data.retentionPercent ? `${data.retentionPercent}% of each valuation` : "None"],
    ["Half retention release", data.retentionReleaseHalfDate || "—"],
    ["Full retention release", data.retentionReleaseFullDate || "—"],
    ["Liquidated damages", data.liquidatedDamagesPerWeek ? `${fGBP(data.liquidatedDamagesPerWeek)} per week` : "Not applied"],
    ["LD cap", data.liquidatedDamagesCap ? fGBP(data.liquidatedDamagesCap) : "—"],
  ]);

  // 5. Payment & terms
  section(state, "Payment & Contract Terms");
  kvTable(state, [
    ["Payment structure", data.paymentTerms || "—"],
    ["Net payment days", `${data.paymentDaysNet ?? 30} days`],
    ["Interest on late payment", `${data.interestOnLatePaymentPct ?? 8}% p.a. above base rate`],
    ["Variations procedure", data.variationsProcedure || "—"],
    ["Dispute resolution", data.disputeResolution || "—"],
    ["Governing law", data.governingLaw || "—"],
  ]);

  // 6. Insurance
  section(state, "Insurance Requirements");
  kvTable(state, [
    ["Public liability", data.publicLiabilityInsurance ? fGBP(data.publicLiabilityInsurance) : "—"],
    ["Employer's liability", data.employersLiabilityInsurance ? fGBP(data.employersLiabilityInsurance) : "—"],
    ["Contract works", data.contractWorksInsurance ? fGBP(data.contractWorksInsurance) : "—"],
    ["Professional indemnity", data.professionalIndemnityInsurance ? fGBP(data.professionalIndemnityInsurance) : "—"],
  ]);

  // 7. Scope + conditions
  if (data.scopeSummary || data.specialConditions || data.exclusions) {
    section(state, "Scope & Conditions");
    if (data.scopeSummary) { subSection(state, "Scope of works"); para(state, data.scopeSummary); }
    if (data.specialConditions) { subSection(state, "Special conditions"); para(state, data.specialConditions); }
    if (data.exclusions) { subSection(state, "Exclusions"); para(state, data.exclusions); }
  }

  // 8. Milestones
  const milestones = data.milestones || [];
  if (milestones.length > 0) {
    section(state, "Milestones");
    table(state,
      ["Name", "Planned", "Actual", "Status", "Value"],
      milestones.map(m => [
        m.name || "—",
        m.plannedDate || "—",
        m.actualDate || "—",
        m.status || "—",
        m.value ? fGBP(m.value) : "—",
      ]),
      { colWidths: computeColumnWidths(state, [0.36, 0.16, 0.16, 0.16, 0.16]) }
    );
  }

  // 9. Notices
  const notices = data.notices || [];
  if (notices.length > 0) {
    section(state, "Notices & Actions");
    table(state,
      ["Type", "Reference", "Issued", "Response due", "Status"],
      notices.map(n => [
        n.type || "—",
        n.reference || "—",
        n.issuedDate || "—",
        n.responseDueDate || "—",
        n.status || "—",
      ]),
      { colWidths: computeColumnWidths(state, [0.32, 0.16, 0.14, 0.18, 0.20]) }
    );
  }

  // 10. Linked commercial items (variations, applications, invoices)
  const linked = data.linked || {};
  const vars_ = linked.variations || [];
  const apps_ = linked.applications || [];
  const invs_ = linked.invoices || [];
  if (vars_.length + apps_.length + invs_.length > 0) {
    section(state, "Linked Commercial Documents");
    if (vars_.length > 0) {
      subSection(state, `Variations (${vars_.length})`);
      table(state, ["Ref", "Title", "Status", "Value"],
        vars_.map(v => [v.varRef || "—", v.title || "—", v.status || "—", fGBP(v.approvedValue || (v.totals || {}).total || 0)]),
        { colWidths: computeColumnWidths(state, [0.20, 0.44, 0.18, 0.18]) });
    }
    if (apps_.length > 0) {
      subSection(state, `Applications for Payment (${apps_.length})`);
      table(state, ["Ref", "Period", "Status", "Net"],
        apps_.map(a => [a.appRef || "—", a.period || "—", a.status || "—", fGBP((a.totals || {}).netPayment || 0)]),
        { colWidths: computeColumnWidths(state, [0.22, 0.30, 0.20, 0.28]) });
    }
    if (invs_.length > 0) {
      subSection(state, `Invoices (${invs_.length})`);
      table(state, ["Ref", "Client", "Status", "Total"],
        invs_.map(i => [i.invoiceRef || "—", i.clientName || i.clientCompany || "—", i.status || "—", fGBP((i.totals || {}).total || 0)]),
        { colWidths: computeColumnWidths(state, [0.22, 0.36, 0.18, 0.24]) });
    }
  }

  // 11. Audit trail
  const history = data.history || [];
  if (history.length > 0) {
    section(state, "Audit Trail");
    table(state, ["Date", "User", "Event", "Note"],
      history.slice(-15).map(h => [
        (h.at || "").slice(0, 10),
        h.by || "—",
        (h.kind || "").replace(/_/g, " "),
        h.note || "",
      ]),
      { colWidths: computeColumnWidths(state, [0.14, 0.18, 0.20, 0.48]) }
    );
  }

  // 12. Sign-off
  section(state, "Signatures");
  drawSignatures(state, data, user, todayStr);

  addFooter(doc, pageWidth, pageHeight, user, ref, todayStr, userName);
  return doc;
}

export function downloadContractPdf(args) {
  const d = generateContractPdf(args);
  const slug = (args?.data?.title || args?.data?.projectName || "contract").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  d.save(`contract-${args?.data?.contractRef || "draft"}-${slug}.pdf`);
}
export function contractPdfBlobUrl(args) { return generateContractPdf(args).output("bloburl"); }

// ---------- helpers ----------
function drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight, status }) {
  doc.setFillColor(20, 18, 16); doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setDrawColor(...GOLD); doc.setLineWidth(1.5);
  doc.line(MARGIN, 90, pageWidth - MARGIN, 90);
  doc.line(MARGIN, pageHeight - 90, pageWidth - MARGIN, pageHeight - 90);
  if (user?.companyLogo) { try { doc.addImage(user.companyLogo, "PNG", MARGIN, 30, 120, 44, undefined, "FAST"); } catch { /* ignore */ } }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...GOLD);
  doc.text("CONTRACT SUMMARY", MARGIN, 140);
  doc.setFontSize(30); doc.setTextColor(240, 237, 232);
  const title = data.title || data.projectName || "Untitled Contract";
  const wrapped = doc.splitTextToSize(title, pageWidth - MARGIN * 2);
  let y = 175; wrapped.forEach(l => { doc.text(l, MARGIN, y); y += 34; });
  y += 12;

  const statusColour = STATUS_COLOUR[status] || [180, 180, 180];
  doc.setFillColor(...statusColour);
  const label = (status || "Draft").toUpperCase();
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  const pillW = doc.getTextWidth(label) + 18;
  doc.roundedRect(MARGIN, y, pillW, 20, 10, 10, "F");
  doc.setTextColor(20, 18, 16); doc.text(label, MARGIN + 9, y + 14);
  y += 32;

  const rows = [
    ["Contract type", data.contractType || "—"],
    ["Contract reference", ref],
    ["Client's contract no.", data.contractNumber || "—"],
    ["Project", data.projectName || "—"],
    ["Employer", data.employerCompany || data.employerName || "—"],
    ["Contract value", fGBP(data.contractValue || 0)],
    ["Start / Completion", `${data.startDate || "—"}  →  ${data.completionDate || "—"}`],
  ];
  rows.forEach(([k, v]) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(160, 155, 145);
    doc.text(k.toUpperCase(), MARGIN, y);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(240, 237, 232);
    const vLines = doc.splitTextToSize(String(v), pageWidth - MARGIN * 2);
    vLines.forEach((l, i) => doc.text(l, MARGIN, y + 14 + i * 14));
    y += 14 + vLines.length * 14 + 4;
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
function twoColBlock(s, columns) {
  const usable = s.pageWidth - MARGIN * 2;
  const gap = 16; const w = (usable - gap) / 2;
  const cellPad = 10;
  // Measure column heights
  const linesPerCol = columns.map(col => {
    let count = 0;
    col.forEach(([txt]) => { count += Math.max(1, s.doc.splitTextToSize(String(txt || ""), w - cellPad * 2).length); });
    return count;
  });
  const rowsMax = Math.max(...linesPerCol);
  const boxH = rowsMax * 12 + cellPad * 2 + 16;
  ensureRoom(s, boxH);
  columns.forEach((col, i) => {
    const x = MARGIN + i * (w + gap);
    s.doc.setDrawColor(...BORDER); s.doc.setLineWidth(0.4);
    s.doc.rect(x, s.y, w, boxH);
    let cy = s.y + cellPad;
    col.forEach(([txt], idx) => {
      if (idx === 0) {
        s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(9); s.doc.setTextColor(...GOLD);
      } else if (idx === 1) {
        s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(11); s.doc.setTextColor(...INK);
      } else {
        s.doc.setFont("helvetica", "normal"); s.doc.setFontSize(9.5); s.doc.setTextColor(...INK);
      }
      const lines = s.doc.splitTextToSize(String(txt || ""), w - cellPad * 2);
      lines.forEach((l, k) => s.doc.text(l, x + cellPad, cy + 10 + k * 12));
      cy += Math.max(1, lines.length) * 12 + (idx === 0 ? 4 : 0);
    });
  });
  s.y += boxH + 8;
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
function drawSignatures(s, data, user, todayStr) {
  const usable = s.pageWidth - MARGIN * 2;
  const gap = 20; const cellW = (usable - gap) / 2; const cellH = 140;
  ensureRoom(s, cellH + 10);
  const boxTop = s.y;
  const cells = [
    { title: "SIGNED FOR EMPLOYER", name: data.signedByEmployer || data.employerName || "—", date: data.signedByEmployerDate || "—", sig: null },
    { title: "SIGNED FOR CONTRACTOR", name: data.signedByContractor || user?.fullName || "—", date: data.signedByContractorDate || todayStr, sig: data.contractorSignature || user?.signature },
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
    s.doc.text("Date:", x + 8, boxTop + 82);
    s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(10); s.doc.setTextColor(...INK);
    s.doc.text(cell.date, x + 8, boxTop + 96);
    if (cell.sig) { try { s.doc.addImage(cell.sig, "PNG", x + 8, boxTop + 100, cellW - 16, 32, undefined, "FAST"); } catch { /* ignore */ } }
  });
  s.y = boxTop + cellH + 8;
}
