// Morris — Snagging List V2 PDF renderer.
// Two flavours: a single-snag detail sheet OR a per-project handover
// snagging report bundling every snag with before/after photos.

import { jsPDF } from "jspdf";
import { drawHeader, addFooter } from "./pdf";

const GOLD = [232, 160, 32], INK = [20, 20, 20], MUTED = [110, 110, 110], BORDER = [180, 180, 180], ZEBRA = [248, 246, 242];
const MARGIN = 48;

const PRIORITY_COLOUR = {
  Low: [104, 211, 145],
  Medium: [200, 180, 100],
  High: [232, 160, 32],
  Critical: [242, 124, 124],
};
const STATUS_COLOUR = {
  Open: [180, 180, 180],
  Assigned: [200, 180, 100],
  "In Progress": [232, 160, 32],
  "Awaiting Verification": [180, 200, 240],
  Closed: [104, 211, 145],
  Cancelled: [140, 140, 140],
};

export function generateSnaggingReportPdf({ project, snags, summary, user, today }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const userName = user?.fullName || user?.username || "";
  const company = user?.companyName || userName;
  const todayStr = today || new Date().toLocaleDateString("en-GB");
  const ref = `SNAG-REPORT-${(project?.projectName || "project").toUpperCase().slice(0, 20).replace(/[^A-Z0-9]+/g, "-")}`;

  drawReportCover(doc, { project, summary, snags, user, company, todayStr, pageWidth, pageHeight });

  // Summary page
  doc.addPage();
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawHeader(doc, pageWidth, MARGIN, user, company, todayStr, "Snagging Report");
  const state = { y: 150, doc, pageWidth, pageHeight, user, company, todayStr, ref, userName, sectionNum: 0 };

  section(state, "Project Summary");
  kvTable(state, [
    ["Project", project?.projectName || "—"],
    ["Site address", project?.projectAddress || "—"],
    ["Total snags", `${summary?.totalSnags ?? 0}`],
    ["Closed snags", `${summary?.closedSnags ?? 0}`],
    ["Open snags", `${summary?.openSnags ?? 0}`],
    ["Percent complete", `${summary?.percentComplete ?? 0}%`],
    ["Report date", todayStr],
    ["Prepared by", userName || "—"],
  ]);

  // Priority breakdown
  const byPri = summary?.byPriority || {};
  if (Object.keys(byPri).some(k => byPri[k] > 0)) {
    subSection(state, "By priority");
    table(state, ["Priority", "Count"],
      Object.entries(byPri).map(([k, v]) => [k, `${v}`]),
      { colWidths: computeColumnWidths(state, [0.5, 0.5]), zebra: true }
    );
  }
  const byArea = summary?.byArea || {};
  if (Object.keys(byArea).length > 0) {
    subSection(state, "By area / room");
    table(state, ["Area", "Snags"],
      Object.entries(byArea).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, `${v}`]),
      { colWidths: computeColumnWidths(state, [0.7, 0.3]), zebra: true }
    );
  }

  // Snag summary table
  section(state, "Snag Register");
  const rows = (snags || []).map(s => [
    s.snagRef || "—",
    s.area || "—",
    s.title || "—",
    s.priority || "—",
    s.assignedTo || "—",
    s.dueDate || "—",
    s.status || "—",
  ]);
  table(state, ["Ref", "Area", "Description", "Priority", "Assigned to", "Due", "Status"], rows, {
    colWidths: computeColumnWidths(state, [0.12, 0.14, 0.28, 0.10, 0.14, 0.10, 0.12]),
  });

  // Full detail pages
  (snags || []).forEach((s, idx) => {
    doc.addPage();
    doc.setFillColor(255, 255, 255); doc.rect(0, 0, pageWidth, pageHeight, "F");
    drawHeader(doc, pageWidth, MARGIN, user, company, todayStr, `Snag ${idx + 1} of ${snags.length}`);
    const st = { y: 130, doc, pageWidth, pageHeight, user, company, todayStr, ref, userName, sectionNum: 0 };
    renderSnagDetail(st, s);
  });

  addFooter(doc, pageWidth, pageHeight, user, ref, todayStr, userName);
  return doc;
}

export function downloadSnaggingReportPdf(args) {
  const d = generateSnaggingReportPdf(args);
  const slug = (args?.project?.projectName || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  d.save(`snagging-report-${slug}.pdf`);
}
export function snaggingReportBlobUrl(args) { return generateSnaggingReportPdf(args).output("bloburl"); }

// ---- single-snag PDF ----
export function generateSnagPdf({ data, user, today }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const userName = user?.fullName || user?.username || "";
  const company = user?.companyName || userName;
  const todayStr = today || new Date().toLocaleDateString("en-GB");
  const ref = data?.snagRef || "SNG-DRAFT";

  drawSnagCover(doc, { data, user, company, todayStr, pageWidth, pageHeight });

  doc.addPage();
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawHeader(doc, pageWidth, MARGIN, user, company, todayStr, "Snag Sheet");
  const state = { y: 130, doc, pageWidth, pageHeight, user, company, todayStr, ref, userName, sectionNum: 0 };
  renderSnagDetail(state, data);

  addFooter(doc, pageWidth, pageHeight, user, ref, todayStr, userName);
  return doc;
}
export function downloadSnagPdf(args) {
  const d = generateSnagPdf(args);
  const slug = (args?.data?.title || "snag").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  d.save(`snag-${args?.data?.snagRef || "draft"}-${slug}.pdf`);
}
export function snagPdfBlobUrl(args) { return generateSnagPdf(args).output("bloburl"); }

// ---------- helpers ----------
function renderSnagDetail(state, s) {
  section(state, s.title || "Snag");
  kvTable(state, [
    ["Reference", s.snagRef || "—"],
    ["Project", s.projectName || "—"],
    ["Area / room", s.area || "—"],
    ["Location detail", s.location || "—"],
    ["Trade", s.trade || "—"],
    ["Category", s.category || "—"],
    ["Priority", s.priority || "—"],
    ["Status", s.status || "—"],
    ["Assigned to", s.assignedTo ? `${s.assignedTo}${s.assignedCompany ? ` (${s.assignedCompany})` : ""}` : "—"],
    ["Due date", s.dueDate || "—"],
    ["Raised by", s.createdBy || "—"],
    ["Raised at", (s.createdAt || "").slice(0, 10)],
    ["Verified by", s.verifiedBy || "—"],
    ["Verified at", (s.verifiedAt || "").slice(0, 10) || "—"],
    ["Completion date", s.completionDate || "—"],
  ]);
  if (s.description) { subSection(state, "Description"); para(state, s.description); }

  const before = s.photosBefore || [];
  const after = s.photosAfter || [];
  if (before.length + after.length > 0) {
    subSection(state, "Photo evidence");
    photoGrid(state, before, "Before");
    photoGrid(state, after, "After");
  }

  const comments = s.comments || [];
  if (comments.length > 0) {
    subSection(state, `Comments (${comments.length})`);
    comments.forEach(c => {
      const line = `${(c.at || "").slice(0, 10)} · ${c.by || "—"}: ${c.text || ""}`;
      para(state, line);
    });
  }

  const history = s.history || [];
  if (history.length > 0) {
    subSection(state, "Audit trail");
    table(state, ["Date", "User", "Event", "Note"],
      history.slice(-20).map(h => [
        (h.at || "").slice(0, 10),
        h.by || "—",
        (h.kind || "").replace(/_/g, " "),
        h.note || "",
      ]),
      { colWidths: computeColumnWidths(state, [0.14, 0.20, 0.20, 0.46]) }
    );
  }

  if (s.signedOffBy || s.signedOffDate) {
    subSection(state, "Sign-off");
    kvTable(state, [
      ["Signed off by", s.signedOffBy || "—"],
      ["Signed off date", s.signedOffDate || "—"],
    ]);
  }
}

function photoGrid(state, photos, label) {
  if (!photos || photos.length === 0) return;
  const { doc, pageWidth } = state;
  const usable = pageWidth - MARGIN * 2;
  const cols = 2; const gap = 12; const w = (usable - gap) / cols; const h = 130;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...MUTED);
  ensureRoom(state, 20);
  doc.text(label.toUpperCase(), MARGIN, state.y); state.y += 10;
  let row = 0, col = 0;
  photos.forEach(p => {
    if (col === 0) { ensureRoom(state, h + 30); }
    const x = MARGIN + col * (w + gap);
    const y = state.y;
    doc.setDrawColor(...BORDER); doc.setLineWidth(0.4); doc.rect(x, y, w, h);
    try { doc.addImage(p.url, "PNG", x + 2, y + 2, w - 4, h - 22, undefined, "FAST"); }
    catch { /* skip broken images */ }
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
    const cap = p.caption || (p.uploadedAt || "").slice(0, 10);
    doc.text(String(cap).slice(0, 60), x + 4, y + h - 6);
    col += 1;
    if (col >= cols) { col = 0; row += 1; state.y += h + 8; }
  });
  if (col !== 0) { state.y += h + 8; }
}

function drawReportCover(doc, { project, summary, snags, user, company, todayStr, pageWidth, pageHeight }) {
  doc.setFillColor(20, 18, 16); doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setDrawColor(...GOLD); doc.setLineWidth(1.5);
  doc.line(MARGIN, 90, pageWidth - MARGIN, 90);
  doc.line(MARGIN, pageHeight - 90, pageWidth - MARGIN, pageHeight - 90);
  if (user?.companyLogo) { try { doc.addImage(user.companyLogo, "PNG", MARGIN, 30, 120, 44, undefined, "FAST"); } catch { /* ignore */ } }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...GOLD);
  doc.text("SNAGGING REPORT", MARGIN, 140);
  doc.setFontSize(30); doc.setTextColor(240, 237, 232);
  const wrapped = doc.splitTextToSize(project?.projectName || "Untitled Project", pageWidth - MARGIN * 2);
  let y = 175; wrapped.forEach(l => { doc.text(l, MARGIN, y); y += 34; });
  y += 12;
  const rows = [
    ["Site address", project?.projectAddress || "—"],
    ["Report date", todayStr],
    ["Snags total", `${(snags || []).length}`],
    ["Closed", `${summary?.closedSnags ?? 0}`],
    ["Open", `${summary?.openSnags ?? 0}`],
    ["Percent complete", `${summary?.percentComplete ?? 0}%`],
    ["Prepared by", user?.fullName || user?.username || "—"],
  ];
  rows.forEach(([k, v]) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(160, 155, 145);
    doc.text(k.toUpperCase(), MARGIN, y);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(240, 237, 232);
    const valLines = doc.splitTextToSize(String(v), pageWidth - MARGIN * 2);
    valLines.forEach((l, i) => doc.text(l, MARGIN, y + 14 + i * 13));
    y += 20 + Math.max(1, valLines.length) * 14;
  });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(160, 155, 145);
  doc.text((company || "").toUpperCase(), MARGIN, pageHeight - 60);
}
function drawSnagCover(doc, { data, user, company, todayStr, pageWidth, pageHeight }) {
  doc.setFillColor(20, 18, 16); doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setDrawColor(...GOLD); doc.setLineWidth(1.5);
  doc.line(MARGIN, 90, pageWidth - MARGIN, 90);
  doc.line(MARGIN, pageHeight - 90, pageWidth - MARGIN, pageHeight - 90);
  if (user?.companyLogo) { try { doc.addImage(user.companyLogo, "PNG", MARGIN, 30, 120, 44, undefined, "FAST"); } catch { /* ignore */ } }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...GOLD);
  doc.text("SNAG SHEET", MARGIN, 140);
  doc.setFontSize(28); doc.setTextColor(240, 237, 232);
  const wrapped = doc.splitTextToSize(data?.title || "Untitled Snag", pageWidth - MARGIN * 2);
  let y = 175; wrapped.forEach(l => { doc.text(l, MARGIN, y); y += 32; });
  y += 8;
  const pri = data?.priority || "Medium";
  const st = data?.status || "Open";
  drawPill(doc, MARGIN, y, pri, PRIORITY_COLOUR[pri] || [160, 160, 160]);
  drawPill(doc, MARGIN + 100, y, st, STATUS_COLOUR[st] || [160, 160, 160]);
  y += 30;

  const rows = [
    ["Reference", data?.snagRef || "—"],
    ["Project", data?.projectName || "—"],
    ["Area", data?.area || "—"],
    ["Assigned to", data?.assignedTo || "—"],
    ["Due date", data?.dueDate || "—"],
    ["Raised", (data?.createdAt || "").slice(0, 10) || todayStr],
  ];
  rows.forEach(([k, v]) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(160, 155, 145);
    doc.text(k.toUpperCase(), MARGIN, y);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(240, 237, 232);
    const valLines = doc.splitTextToSize(String(v), pageWidth - MARGIN * 2);
    valLines.forEach((l, i) => doc.text(l, MARGIN, y + 14 + i * 13));
    y += 20 + Math.max(1, valLines.length) * 14;
  });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(160, 155, 145);
  doc.text((company || "").toUpperCase(), MARGIN, pageHeight - 60);
}
function drawPill(doc, x, y, label, colour) {
  doc.setFillColor(...(colour || [160, 160, 160]));
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  const w = doc.getTextWidth(label.toUpperCase()) + 16;
  doc.roundedRect(x, y, w, 18, 9, 9, "F");
  doc.setTextColor(20, 18, 16);
  doc.text(label.toUpperCase(), x + 8, y + 12);
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
  const lines = s.doc.splitTextToSize(String(title || ""), usable);
  ensureRoom(s, lines.length * lineH + 30);
  s.sectionNum = (s.sectionNum || 0) + 1;
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
