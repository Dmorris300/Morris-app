// Morris — Incident Report V2 PDF renderer.
// Regulator-ready incident report: cover + summary + project + timeline + people
// + evidence + investigation (Five Whys) + CAPA + linked docs + triple sign-off.

import { jsPDF } from "jspdf";
import { drawHeader, addFooter } from "./pdf";

const GOLD = [232, 160, 32], INK = [20, 20, 20], MUTED = [110, 110, 110], BORDER = [180, 180, 180], ZEBRA = [248, 246, 242];
const DANGER = [242, 124, 124];
const MARGIN = 48;

export function generateIncidentReportPdf({ data, user, today }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const userName = user?.fullName || user?.username || "";
  const company = user?.companyName || userName;
  const todayStr = today || new Date().toLocaleDateString("en-GB");
  const ref = data.documentRef || `IR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-001`;

  drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight });
  doc.addPage();
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawHeader(doc, pageWidth, MARGIN, user, company, todayStr, "Incident Report");
  const state = { y: 150, doc, pageWidth, pageHeight, user, company, todayStr, ref, userName, sectionNum: 0 };

  banner(state, "OFFICIAL INCIDENT INVESTIGATION RECORD — TREAT AS CONFIDENTIAL. MAY BE SHARED WITH CLIENTS, PRINCIPAL CONTRACTORS AND REGULATORS.");

  // 1. Summary
  section(state, "Incident Summary");
  const sevColour = (data.severity === "Critical" || data.severity === "High") ? DANGER : GOLD;
  const badgeText = `${data.severity || "—"}  ·  ${data.status || "Open"}`;
  drawBadge(state, badgeText, sevColour);
  kvTable(state, [
    ["Incident type", data.incidentType || "—"],
    ["Severity", data.severity || "—"],
    ["Status", data.status || "Open"],
    ["Date & time", `${data.date || todayStr} ${data.time || ""}`.trim()],
    ["Location", data.location || "—"],
    ["Reported by", data.reportedBy || user?.fullName || "—"],
    ["RIDDOR reportable", data.riddorReportable ? `Yes — ${data.riddorCategory || "Category not set"}${data.riddorReference ? " · " + data.riddorReference : ""}` : "No"],
  ]);

  // 2. Project
  section(state, "Project Information");
  kvTable(state, [
    ["Project", data.projectName || "—"],
    ["Client", data.clientName || "—"],
    ["Site", data.siteAddress || "—"],
    ["Principal Contractor", data.principalContractor || "—"],
    ["Report Reference", ref],
  ]);

  // 3. Description + immediate actions (timeline of events)
  section(state, "Timeline of Events");
  subSection(state, "What happened");
  para(state, data.description || "—");
  subSection(state, "Immediate actions taken on site");
  para(state, data.immediateActions || "—");

  // 4. People
  section(state, "People Involved");
  kvTable(state, [
    ["Supervisor", data.supervisor || "—"],
    ["First Aider", data.firstAider || "—"],
  ]);
  const inj = data.injuredPersons || [];
  if (inj.length > 0) {
    subSection(state, "Injured / affected persons");
    table(state, ["Name", "Company", "Role", "Injury / effect", "First-aid / treatment"],
      inj.map(p => [p.name || "—", p.company || "—", p.role || "—", p.injury || "—", p.treatment || ""]));
  }
  const wit = data.witnesses || [];
  if (wit.length > 0) {
    subSection(state, "Witnesses");
    table(state, ["Name", "Company", "Role", "Statement summary"],
      wit.map(w => [w.name || "—", w.company || "—", w.role || "—", w.statement || ""]));
  }

  // 5. Evidence
  const photos = (data.photos || []).filter(p => p?.url);
  if (photos.length > 0) {
    section(state, "Evidence — Site Photos");
    photoGrid(state, photos);
  }
  const drawings = (data.drawings || []).filter(p => p?.url);
  if (drawings.length > 0) {
    section(state, "Evidence — Drawings & Diagrams");
    photoGrid(state, drawings);
  }

  // 6. Investigation
  section(state, "Investigation Findings");
  kvTable(state, [
    ["Immediate cause", data.immediateCause || "—"],
    ["Underlying cause", data.underlyingCause || "—"],
    ["Root cause", data.rootCause || "—"],
  ]);
  const whys = (data.fiveWhys || []).filter(w => (w?.q || w?.a));
  if (whys.length > 0) {
    subSection(state, "Five Whys analysis");
    table(state, ["#", "Question", "Answer"],
      whys.map((w, i) => [String(i + 1), w.q || "—", w.a || "—"]),
      { colWidths: [30, 200, (state.pageWidth - MARGIN * 2) - 230] });
  }

  // 7. Risk review
  const rr = data.riskReview || {};
  const rrLabels = {
    ramsUpdate: "Does the RAMS require updating?",
    methodStatementUpdate: "Does the Method Statement require updating?",
    coshhUpdate: "Is a COSHH Assessment affected?",
    toolboxTalkRequired: "Is a Toolbox Talk required?",
    riskAssessmentReview: "Does the Risk Assessment need reviewing?",
  };
  const rrRows = Object.entries(rrLabels).map(([k, v]) => [v, rr[k] ? "Yes — action required" : "No", (rr.notes && rr.notes[k]) || ""]);
  section(state, "Risk Review — Actions to consider");
  table(state, ["Question", "Answer", "Notes"], rrRows);

  // 8. CAPA
  const capa = data.capa || [];
  if (capa.length > 0) {
    section(state, "Corrective & Preventive Actions (CAPA)");
    table(state, ["Action", "Responsible", "Due", "Priority", "Status"],
      capa.map(a => [a.description || "—", a.responsible || "—", a.dueDate || "—", a.priority || "—", a.status || "Open"]));
  }

  // 9. Linked documents
  const linked = data.linkedDocuments || {};
  const linkedRows = [];
  ["rams", "methodStatement", "coshh", "toolboxTalk", "riskRegister", "siteDiary"].forEach(k => {
    const label = { rams: "RAMS", methodStatement: "Method Statement", coshh: "COSHH", toolboxTalk: "Toolbox Talk", riskRegister: "Risk Assessment", siteDiary: "Site Diary" }[k];
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

  // 10. Sign-off — triple
  section(state, "Sign-off");
  drawTripleSignoff(state, data, user, todayStr);

  addFooter(doc, pageWidth, pageHeight, user, ref, todayStr, userName);
  return doc;
}

export function downloadIncidentReportPdf(args) {
  const d = generateIncidentReportPdf(args);
  const project = (args?.data?.projectName || "incident-report").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const date = args?.data?.date || new Date().toISOString().slice(0, 10);
  d.save(`incident-report-${project}-${date}.pdf`);
}

export function incidentReportPdfBlobUrl(args) {
  return generateIncidentReportPdf(args).output("bloburl");
}

// ---------- helpers ----------
function drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight }) {
  doc.setFillColor(20, 18, 16); doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setDrawColor(...GOLD); doc.setLineWidth(1.5);
  doc.line(MARGIN, 90, pageWidth - MARGIN, 90);
  doc.line(MARGIN, pageHeight - 90, pageWidth - MARGIN, pageHeight - 90);
  if (user?.companyLogo) { try { doc.addImage(user.companyLogo, "PNG", MARGIN, 30, 120, 44, undefined, "FAST"); } catch { /* ignore */ } }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...GOLD);
  doc.text("INCIDENT REPORT", MARGIN, 140);
  doc.setFontSize(30); doc.setTextColor(240, 237, 232);
  const wrapped = doc.splitTextToSize(data.incidentType || "Incident", pageWidth - MARGIN * 2);
  let y = 175; wrapped.forEach(l => { doc.text(l, MARGIN, y); y += 34; });
  y += 20;
  const rows = [
    ["Project", data.projectName || "—"],
    ["Date & Time", `${data.date || todayStr}  ${data.time || ""}`.trim()],
    ["Location", data.location || "—"],
    ["Severity", (data.severity || "—")],
    ["Status", (data.status || "Open")],
    ["Reported By", data.reportedBy || user?.fullName || "—"],
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

function drawBadge(s, text, colour) {
  ensureRoom(s, 26);
  s.doc.setFillColor(...colour);
  const w = s.doc.getTextWidth(text) + 20;
  s.doc.roundedRect(MARGIN, s.y, w, 20, 4, 4, "F");
  s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(9.5); s.doc.setTextColor(20, 18, 16);
  s.doc.text(text, MARGIN + 10, s.y + 14);
  s.y += 26;
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

function kvTable(s, rows) {
  const usable = s.pageWidth - MARGIN * 2;
  table(s, null, rows, { colWidths: [usable * 0.32, usable * 0.68], header: false, zebra: true });
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
    { title: "PREPARED BY", name: data.preparedBy || user?.fullName || "—", sig: data.preparedSignature || data.signature || user?.signature },
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
    s.doc.text(data.date || todayStr, x + 8, boxTop + 90);
    if (cell.sig) { try { s.doc.addImage(cell.sig, "PNG", x + 8, boxTop + 94, cellW - 16, 32, undefined, "FAST"); } catch { /* ignore */ } }
  });
  s.y = boxTop + cellH + 8;
}

function guessFmt(url) { const u = String(url || "").toLowerCase(); if (u.endsWith(".png")) return "PNG"; if (u.endsWith(".webp")) return "WEBP"; return "JPEG"; }
