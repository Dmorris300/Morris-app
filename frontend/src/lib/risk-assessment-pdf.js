// Morris — Risk Assessment V2 PDF renderer.
// Cover + summary + hazard table (initial/residual ratings colour-coded) +
// persons at risk + evidence photos + linked docs + triple sign-off.

import { jsPDF } from "jspdf";
import { drawHeader, addFooter, finalizeFooters } from "./pdf";

const GOLD = [232, 160, 32], INK = [20, 20, 20], MUTED = [110, 110, 110], BORDER = [180, 180, 180], ZEBRA = [248, 246, 242];
const RATING = {
  Low:     [104, 211, 145],
  Medium:  [232, 200, 72],
  High:    [232, 130, 60],
  Extreme: [220, 64, 64],
};
const MARGIN = 48;

export function generateRiskAssessmentPdf({ data, user, today }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const userName = user?.fullName || user?.username || "";
  const company = user?.companyName || userName;
  const todayStr = today || new Date().toLocaleDateString("en-GB");
  const ref = data.documentRef || `RA-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-001`;

  drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight });
  doc.addPage();
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawHeader(doc, pageWidth, MARGIN, user, company, todayStr, "Risk Assessment");
  const state = { y: 150, doc, pageWidth, pageHeight, user, company, todayStr, ref, userName, sectionNum: 0 };

  banner(state, "CENTRAL HEALTH & SAFETY RECORD — REVIEW ANNUALLY OR ON CHANGE OF CIRCUMSTANCE.");

  // 1. Project
  section(state, "Project Details");
  kvTable(state, [
    ["Project", data.projectName || "—"],
    ["Client", data.clientName || "—"],
    ["Site", data.siteAddress || "—"],
    ["Principal Contractor", data.principalContractor || "—"],
    ["Assessment Reference", ref],
  ]);

  // 2. Activity summary
  section(state, "Activity Being Assessed");
  kvTable(state, [
    ["Activity", data.activity || "—"],
    ["Description", data.activityDescription || "—"],
    ["Assessment Date", data.assessmentDate || todayStr],
    ["Next Review", data.reviewDate || "Set on save"],
    ["Assessor", data.assessor || user?.fullName || "—"],
    ["Status", data.status || "Active"],
  ]);

  // 3. Persons at risk (assessment-level)
  const pAll = data.personsAtRisk || [];
  if (pAll.length > 0) {
    section(state, "Persons at Risk");
    para(state, pAll.join(" · "));
  }

  // 4. Hazard register
  const hazards = data.hazards || [];
  if (hazards.length > 0) {
    section(state, "Hazard Register");
    hazards.forEach((h, i) => {
      subSection(state, `Hazard ${i + 1}: ${h.hazard || "Hazard"}`);
      if (h.description) para(state, h.description);
      const rows = [
        ["Persons at risk", (h.personsAtRisk || pAll).join(", ") || "—"],
        ["Existing controls", h.existingControls || "—"],
        ["Initial risk (L × S)", `${h.initialLikelihood || "—"} × ${h.initialSeverity || "—"} = ${h.initialScore || "—"}`],
        ["Additional controls", h.additionalControls || "—"],
        ["Residual risk (L × S)", `${h.residualLikelihood || "—"} × ${h.residualSeverity || "—"} = ${h.residualScore || "—"}`],
        ["Action owner", h.actionOwner || "—"],
        ["Due date", h.dueDate || "—"],
      ];
      kvTable(state, rows);
      // Rating badges
      ensureRoom(state, 28);
      const initY = state.y;
      badge(state, MARGIN, initY, "INITIAL", h.initialRating);
      badge(state, MARGIN + 130, initY, "RESIDUAL", h.residualRating);
      state.y = initY + 28;
    });
  }

  // 5. Evidence photos
  const photos = (data.photos || []).filter(p => p?.url);
  if (photos.length > 0) {
    section(state, "Evidence Photos");
    photoGrid(state, photos);
  }

  // 6. Linked documents
  const linked = data.linkedDocuments || {};
  const linkedRows = [];
  ["rams", "methodStatement", "coshh", "toolboxTalk", "siteDiary", "incidentReport"].forEach(k => {
    const label = { rams: "RAMS", methodStatement: "Method Statement", coshh: "COSHH", toolboxTalk: "Toolbox Talk", siteDiary: "Site Diary", incidentReport: "Incident Report" }[k];
    for (const d of linked[k] || []) linkedRows.push([label, d.title || "—", d.refNumber || "—"]);
  });
  if (linkedRows.length > 0) {
    section(state, "Linked Documents");
    table(state, ["Type", "Document", "Reference"], linkedRows);
  }

  if (data.notes) {
    section(state, "Additional Notes");
    para(state, data.notes);
  }

  // 7. Sign-off
  section(state, "Sign-off");
  drawTripleSignoff(state, data, user, todayStr);

  addFooter(doc, pageWidth, pageHeight, user, ref, todayStr, userName);
  finalizeFooters(doc, { user, ref, today: todayStr, userName, pageWidth, pageHeight, skipPages: [1] });
  return doc;
}

export function downloadRiskAssessmentPdf(args) {
  const d = generateRiskAssessmentPdf(args);
  const project = (args?.data?.projectName || "risk-assessment").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const date = args?.data?.assessmentDate || new Date().toISOString().slice(0, 10);
  d.save(`risk-assessment-${project}-${date}.pdf`);
}

export function riskAssessmentPdfBlobUrl(args) {
  return generateRiskAssessmentPdf(args).output("bloburl");
}

// ---------- helpers ----------
function drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight }) {
  doc.setFillColor(20, 18, 16); doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setDrawColor(...GOLD); doc.setLineWidth(1.5);
  doc.line(MARGIN, 90, pageWidth - MARGIN, 90);
  doc.line(MARGIN, pageHeight - 90, pageWidth - MARGIN, pageHeight - 90);
  if (user?.companyLogo) { try { doc.addImage(user.companyLogo, "PNG", MARGIN, 30, 120, 44, undefined, "FAST"); } catch { /* ignore */ } }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...GOLD);
  doc.text("RISK ASSESSMENT", MARGIN, 140);
  doc.setFontSize(30); doc.setTextColor(240, 237, 232);
  const wrapped = doc.splitTextToSize(data.activity || "Activity", pageWidth - MARGIN * 2);
  let y = 175; wrapped.forEach(l => { doc.text(l, MARGIN, y); y += 34; });
  y += 20;
  const rows = [
    ["Project", data.projectName || "—"],
    ["Assessment Date", data.assessmentDate || todayStr],
    ["Next Review", data.reviewDate || "Set on save"],
    ["Assessor", data.assessor || user?.fullName || "—"],
    ["Hazards", String((data.hazards || []).length)],
    ["Status", data.status || "Active"],
    ["Reference", ref],
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

function ensureRoom(s, n = 20) { if (s.y + n > s.pageHeight - 70) newPage(s); }
function newPage(s) {
  addFooter(s.doc, s.pageWidth, s.pageHeight, s.user, s.ref, s.todayStr, s.userName);
  s.doc.addPage();
  s.doc.setFillColor(255, 255, 255); s.doc.rect(0, 0, s.pageWidth, s.pageHeight, "F");
  drawHeader(s.doc, s.pageWidth, MARGIN, s.user, s.company, s.todayStr, null);
  s.y = 110;
}

function banner(s, text) {
  ensureRoom(s, 40);
  s.doc.setFillColor(20, 18, 16);
  s.doc.rect(MARGIN, s.y, s.pageWidth - MARGIN * 2, 34, "F");
  s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(9.5); s.doc.setTextColor(...GOLD);
  const lines = s.doc.splitTextToSize(text, s.pageWidth - MARGIN * 2 - 20);
  lines.forEach((l, i) => s.doc.text(l, MARGIN + 10, s.y + 15 + i * 12));
  s.y += 34 + 10;
}

function badge(s, x, y, label, rating) {
  const colour = RATING[rating] || MUTED;
  s.doc.setFillColor(...colour);
  const text = `${label}: ${rating || "—"}`;
  const w = Math.max(120, s.doc.getTextWidth(text) + 16);
  s.doc.roundedRect(x, y, w, 20, 4, 4, "F");
  s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(9.5); s.doc.setTextColor(20, 18, 16);
  s.doc.text(text, x + 8, y + 14);
}

function section(s, title) {
  s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(13); s.doc.setTextColor(...INK);
  const usable = s.pageWidth - MARGIN * 2;
  const lineH = 16;
  s.sectionNum = (s.sectionNum || 0) + 1;
  const lines = s.doc.splitTextToSize(`${s.sectionNum}. ${title}`, usable);
  ensureRoom(s, lines.length * lineH + 80); // P3: keep heading with first body row
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

function kvTable(s, rows) {
  const usable = s.pageWidth - MARGIN * 2;
  table(s, null, rows, { colWidths: [usable * 0.32, usable * 0.68], header: false, zebra: true });
}

function table(s, header, rows, opts = {}) {
  const usable = s.pageWidth - MARGIN * 2;
  const colWidths = opts.colWidths || (header ? Array(header.length).fill(usable / header.length) : [usable]);
  const padX = 6, padY = 4;
  if (header && opts.header !== false) {
    // P3 — keep table header with its first data row.
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

function photoGrid(s, photos) {
  const usable = s.pageWidth - MARGIN * 2;
  const gap = 10; const cellW = (usable - gap) / 2; const cellH = 150;
  for (let i = 0; i < photos.length; i += 2) {
    ensureRoom(s, cellH + 22);
    for (let j = 0; j < 2 && i + j < photos.length; j++) {
      const p = photos[i + j]; const x = MARGIN + j * (cellW + gap); const y = s.y;
      s.doc.setDrawColor(...BORDER); s.doc.setLineWidth(0.4); s.doc.rect(x, y, cellW, cellH);
      try { s.doc.addImage(p.url, guessFmt(p.url), x + 1, y + 1, cellW - 2, cellH - 2, undefined, "FAST"); } catch { /* ignore */ }
      const cap = (p.caption || p.description || p.category || "").trim();
      if (cap) { s.doc.setFont("helvetica", "normal"); s.doc.setFontSize(8); s.doc.setTextColor(...MUTED); const w = s.doc.splitTextToSize(cap, cellW); w.slice(0, 2).forEach((l, k) => s.doc.text(l, x, y + cellH + 12 + k * 10)); }
    }
    s.y += cellH + 26;
  }
}

function drawTripleSignoff(s, data, user, todayStr) {
  const usable = s.pageWidth - MARGIN * 2;
  const gap = 10; const cellW = (usable - gap * 2) / 3; const cellH = 130;
  ensureRoom(s, cellH + 10);
  const boxTop = s.y;
  const cells = [
    { title: "PREPARED BY", name: data.preparedBy || user?.fullName || "—", sig: data.preparedSignature || user?.signature },
    { title: "REVIEWED BY", name: data.reviewedBy || "—", sig: data.reviewedSignature },
    { title: "APPROVED BY", name: data.approvedBy || "—", sig: data.approvedSignature },
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
    s.doc.text(data.assessmentDate || todayStr, x + 8, boxTop + 90);
    if (cell.sig) { try { s.doc.addImage(cell.sig, "PNG", x + 8, boxTop + 94, cellW - 16, 32, undefined, "FAST"); } catch { /* ignore */ } }
  });
  s.y = boxTop + cellH + 8;
}

function guessFmt(url) { const u = String(url || "").toLowerCase(); if (u.endsWith(".png")) return "PNG"; if (u.endsWith(".webp")) return "WEBP"; return "JPEG"; }
