// Morris — Site Diary V2 PDF renderer.
// Premium daily site management PDF: cover page + weather panel + labour + works
// + deliveries + plant + delays/issues/instructions + photos + linked docs + sign-off.

import { jsPDF } from "jspdf";
import { drawHeader, addFooter, finalizeFooters } from "./pdf";

const GOLD = [232, 160, 32], INK = [20, 20, 20], MUTED = [110, 110, 110], BORDER = [180, 180, 180], ZEBRA = [248, 246, 242];
const OK = [104, 211, 145], WARN = [232, 160, 32], DANGER = [242, 124, 124];
const MARGIN = 48;

export function generateSiteDiaryPdf({ data, user, today }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const userName = user?.fullName || user?.username || "";
  const company = user?.companyName || userName;
  const todayStr = today || new Date().toLocaleDateString("en-GB");
  const ref = data.documentRef || `SD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-001`;

  drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight });
  doc.addPage();
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawHeader(doc, pageWidth, MARGIN, user, company, todayStr, "Site Diary");
  const state = { y: 150, doc, pageWidth, pageHeight, user, company, todayStr, ref, userName, sectionNum: 0 };

  // Statement of Record banner
  banner(state, "THIS IS AN OFFICIAL SITE RECORD AND MAY BE USED IN THE EVENT OF A CONTRACTUAL DISPUTE.");

  // 1. Project Details
  section(state, "Project Details");
  kvTable(state, [
    ["Project", data.projectName || "—"],
    ["Client", data.clientName || "—"],
    ["Site", data.siteAddress || "—"],
    ["Principal Contractor", data.principalContractor || "—"],
    ["Diary Reference", ref],
  ]);

  // 2. Date & Weather
  section(state, "Date & Weather");
  kvTable(state, [
    ["Diary date", data.date || todayStr],
    ["Hours on site", `${data.startTime || "—"} to ${data.endTime || "—"}`],
    ["Conditions", data.conditions || "—"],
    ["Temperature", `AM ${data.tempAM || "—"} · PM ${data.tempPM || "—"}`],
    ["Wind", data.wind || "—"],
    ["Rain", data.rain || "—"],
    ["Impact on works", data.weatherImpact || "None recorded"],
  ]);

  // 3. Labour / Crew
  section(state, "Labour on Site");
  para(state, `Supervisor: ${data.supervisor || "—"}   ·   Total operatives: ${data.totalOperatives || (data.crew || []).length || 0}`);
  const crew = data.crew || [];
  if (crew.length > 0) {
    table(state, ["Name", "Company", "Trade", "Hours", "Notes"],
      crew.map(c => [c.name || "—", c.company || "—", c.trade || "—", c.hours || "—", c.notes || ""]));
  } else {
    para(state, "No crew logged.");
  }
  const subs = data.subcontractorsOnSite || [];
  if (subs.length > 0) {
    subSection(state, "Subcontractors on site");
    table(state, ["Company", "Trade", "Operatives", "Notes"],
      subs.map(s => [s.company || "—", s.trade || "—", s.operatives || "—", s.notes || ""]));
  }

  // 4. Works Completed
  section(state, "Works Completed Today");
  const works = data.worksCompleted || [];
  if (works.length > 0) {
    works.forEach((w, i) => {
      subSection(state, `Activity ${i + 1}: ${w.activity || "Activity"}${w.location ? " — " + w.location : ""}${w.progress ? " (" + w.progress + ")" : ""}`);
      if (w.details) para(state, w.details);
    });
  } else {
    para(state, "No works logged.");
  }
  if (data.progressPercent) para(state, `Overall project progress: ${data.progressPercent}%`);
  if (data.worksTomorrow) {
    subSection(state, "Planned for tomorrow");
    para(state, data.worksTomorrow);
  }

  // 5. Deliveries
  const deliveries = data.deliveries || [];
  if (deliveries.length > 0) {
    section(state, "Deliveries");
    table(state, ["Time", "Supplier", "Item", "Quantity", "Notes"],
      deliveries.map(d => [d.time || "—", d.supplier || "—", d.item || "—", d.quantity || "—", d.notes || ""]));
  }

  // 6. Plant & Equipment
  const plant = data.plant || [];
  if (plant.length > 0) {
    section(state, "Plant & Equipment on Site");
    table(state, ["Item", "Owner / Hired From", "Hours Used", "Condition", "Breakdown / Maintenance", "Notes"],
      plant.map(p => [p.item || "—", p.owner || "—", p.hours || "—", p.condition || "—", p.breakdown || "None", p.notes || ""]));
  }

  // 7. Delays, Issues & Instructions
  const delays = data.delays || [];
  const issues = data.issues || [];
  const instructions = data.instructions || [];
  const hsObs = data.hsObservations || [];
  const visitors = data.visitors || [];
  if (delays.length || issues.length || instructions.length || hsObs.length || visitors.length) {
    section(state, "Delays, Issues, Instructions & Observations");
  }
  if (delays.length) {
    subSection(state, "Delays");
    table(state, ["Category", "Priority", "Description", "Duration (hrs)", "Impact"],
      delays.map(d => [d.category || "—", d.priority || "—", d.description || "—", d.hours || "—", d.impact || ""]));
  }
  if (issues.length) {
    subSection(state, "Issues encountered");
    table(state, ["Time", "Description", "Actioned by"],
      issues.map(i => [i.time || "—", i.description || "—", i.actionedBy || "—"]));
  }
  if (instructions.length) {
    subSection(state, "Site instructions received");
    table(state, ["From", "Instruction", "Method", "Ref"],
      instructions.map(i => [i.from || "—", i.instruction || "—", i.method || "—", i.ref || "—"]));
  }
  if (hsObs.length) {
    subSection(state, "Health & Safety observations");
    table(state, ["Type", "Description", "Action Taken", "Reported to"],
      hsObs.map(h => [h.type || "—", h.description || "—", h.action || "—", h.reportedTo || "—"]));
  }
  if (visitors.length) {
    subSection(state, "Visitors to site");
    table(state, ["Name", "Company", "Purpose", "In", "Out"],
      visitors.map(v => [v.name || "—", v.company || "—", v.purpose || "—", v.timeIn || "—", v.timeOut || "—"]));
  }

  // 8. Variations & Verbal Instructions
  const variations = data.variations || [];
  if (variations.length > 0) {
    section(state, "Variations & Verbal Instructions");
    table(state, ["Ref", "From", "Description", "Estimated Value", "Follow-up"],
      variations.map(v => [v.ref || "—", v.from || "—", v.description || "—", v.value || "—", v.followUp || ""]));
    para(state, "Retain any written follow-up (email / VO / Site Instruction) with this diary.");
  }

  // 9. Site Photos
  const photos = (data.photos || []).filter(p => p?.url);
  if (photos.length > 0) {
    section(state, "Site Photos");
    photoGrid(state, photos);
  }

  // 10. Actions
  const actions = data.actions || [];
  if (actions.length > 0) {
    section(state, "Outstanding Actions");
    table(state, ["Action", "Responsible", "Due Date", "Priority", "Status"],
      actions.map(a => [a.description || "—", a.responsible || "—", a.dueDate || "—", a.priority || "—", a.status || "Open"]));
  }

  // Linked documents (optional supporting list)
  const linked = data.linkedDocuments || {};
  const linkedRows = [];
  ["rams", "methodStatement", "coshh", "toolboxTalk", "riskRegister"].forEach(k => {
    const label = { rams: "RAMS", methodStatement: "Method Statement", coshh: "COSHH", toolboxTalk: "Toolbox Talk", riskRegister: "Risk Assessment" }[k];
    for (const d of linked[k] || []) linkedRows.push([label, d.title || "—", d.refNumber || "—"]);
  });
  if (linkedRows.length > 0) {
    section(state, "Linked Documents");
    table(state, ["Type", "Document", "Reference"], linkedRows);
  }

  // 11. Notes & Sign-off (dual)
  if (data.notes) {
    section(state, "Additional Notes");
    para(state, data.notes);
  }

  section(state, "Sign-off");
  const compSig = data.completedSignature || data.signature || user?.signature;
  const supSig = data.supervisorSignature;
  const compName = data.completedBy || data.preparedBy || user?.fullName || "—";
  const supName = data.supervisorName || data.supervisor || "—";
  const dateStr = `${data.date || todayStr}  ${data.endTime || ""}`.trim();
  // Two-column layout
  const usable = state.pageWidth - MARGIN * 2;
  const halfW = (usable - 20) / 2;
  ensureRoom(state, 150);
  const boxTop = state.y;
  // Left box: Completed by
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.4);
  doc.rect(MARGIN, boxTop, halfW, 140);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...GOLD);
  doc.text("COMPLETED BY", MARGIN + 8, boxTop + 16);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...MUTED);
  doc.text("Name:", MARGIN + 8, boxTop + 34);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...INK);
  doc.text(compName, MARGIN + 8, boxTop + 48);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...MUTED);
  doc.text("Date:", MARGIN + 8, boxTop + 68);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK);
  doc.text(dateStr, MARGIN + 8, boxTop + 82);
  if (compSig) {
    try { doc.addImage(compSig, "PNG", MARGIN + 8, boxTop + 90, halfW - 16, 42, undefined, "FAST"); } catch { /* ignore */ }
  }
  // Right box: Supervisor
  const rightX = MARGIN + halfW + 20;
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.4);
  doc.rect(rightX, boxTop, halfW, 140);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...GOLD);
  doc.text("SUPERVISOR", rightX + 8, boxTop + 16);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...MUTED);
  doc.text("Name:", rightX + 8, boxTop + 34);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...INK);
  doc.text(supName, rightX + 8, boxTop + 48);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...MUTED);
  doc.text("Date:", rightX + 8, boxTop + 68);
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK);
  doc.text(dateStr, rightX + 8, boxTop + 82);
  if (supSig) {
    try { doc.addImage(supSig, "PNG", rightX + 8, boxTop + 90, halfW - 16, 42, undefined, "FAST"); } catch { /* ignore */ }
  }
  state.y = boxTop + 150;

  addFooter(doc, pageWidth, pageHeight, user, ref, todayStr, userName);
  finalizeFooters(doc, { user, ref, today: todayStr, userName, pageWidth, pageHeight, skipPages: [1] });
  return doc;
}

export function downloadSiteDiaryPdf(args) {
  const d = generateSiteDiaryPdf(args);
  const project = (args?.data?.projectName || "site-diary").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const date = args?.data?.date || new Date().toISOString().slice(0, 10);
  d.save(`site-diary-${project}-${date}.pdf`);
}

export function siteDiaryPdfBlobUrl(args) {
  return generateSiteDiaryPdf(args).output("bloburl");
}

// ---------- helpers ----------
function drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight }) {
  doc.setFillColor(20, 18, 16); doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setDrawColor(...GOLD); doc.setLineWidth(1.5);
  doc.line(MARGIN, 90, pageWidth - MARGIN, 90);
  doc.line(MARGIN, pageHeight - 90, pageWidth - MARGIN, pageHeight - 90);
  if (user?.companyLogo) { try { doc.addImage(user.companyLogo, "PNG", MARGIN, 30, 120, 44, undefined, "FAST"); } catch { /* ignore */ } }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...GOLD);
  doc.text("SITE DIARY", MARGIN, 140);
  doc.setFontSize(30); doc.setTextColor(240, 237, 232);
  const wrapped = doc.splitTextToSize(data.projectName || "Project", pageWidth - MARGIN * 2);
  let y = 175; wrapped.forEach(l => { doc.text(l, MARGIN, y); y += 34; });
  y += 20;
  const rows = [
    ["Date", data.date || todayStr],
    ["Client", data.clientName || "—"],
    ["Site", data.siteAddress || "—"],
    ["Supervisor", data.supervisor || user?.fullName || "—"],
    ["Weather", `${data.conditions || "—"} · Temp ${data.tempAM || "—"}/${data.tempPM || "—"}`],
    ["Operatives", String(data.totalOperatives || (data.crew || []).length || 0)],
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

function guessFmt(url) { const u = String(url || "").toLowerCase(); if (u.endsWith(".png")) return "PNG"; if (u.endsWith(".webp")) return "WEBP"; return "JPEG"; }
