// Morris — COSHH PDF renderer.
import { jsPDF } from "jspdf";
import { drawHeader, addFooter } from "./pdf";

const GOLD = [232, 160, 32], INK = [20, 20, 20], MUTED = [110, 110, 110], BORDER = [180, 180, 180], ZEBRA = [248, 246, 242];
const MARGIN = 48;

export function generateCoshhPdf({ data, user, today, hazards }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const userName = user?.fullName || user?.username || "";
  const company = user?.companyName || userName;
  const todayStr = today || new Date().toLocaleDateString("en-GB");
  const ref = data.documentRef || `COSHH-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-001`;

  drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight });
  doc.addPage();
  doc.setFillColor(255, 255, 255); doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawHeader(doc, pageWidth, MARGIN, user, company, todayStr, "COSHH Assessment");
  const state = { y: 150, doc, pageWidth, pageHeight, user, company, todayStr, ref, userName, sectionNum: 0 };

  section(state, "Substance Information");
  kvTable(state, [
    ["Product name", data.productName || "—"],
    ["Manufacturer", data.manufacturer || "—"],
    ["Supplier", data.supplier || "—"],
    ["Product code / batch", data.productCode || "—"],
    ["Quantity used", data.quantityUsed || "—"],
    ["Hazard level", data.hazardLevel || "—"],
    ["Description", data.description || "—"],
    ["SDS", data.sdsUrl || "—"],
  ]);

  section(state, "Hazard Classification");
  para(state, `Signal word: ${data.signalWord || "—"} · Classification: ${data.hazardClassification || "—"}`);
  const picto = (hazards?.pictograms || []).filter(p => (data.pictograms || []).includes(p.id));
  if (picto.length > 0) pictogramGrid(state, picto);
  bulletSection(state, "H-statements", data.hStatements);
  bulletSection(state, "P-statements", data.pStatements);

  section(state, "Exposure Assessment");
  const ex = data.exposure || {};
  kvTable(state, [
    ["How used", ex.howUsed || "—"],
    ["Frequency", ex.frequency || "—"],
    ["Duration", ex.duration || "—"],
    ["Who is exposed", ex.whoExposed || "—"],
    ["Areas affected", ex.areasAffected || "—"],
  ]);

  section(state, "Control Measures");
  const cm = data.controlMeasures || {};
  kvTable(state, [
    ["Ventilation", cm.ventilation || "—"],
    ["Dust suppression", cm.dustSuppression || "—"],
    ["Containment", cm.containment || "—"],
    ["Safe handling", cm.safeHandling || "—"],
    ["Storage requirements", cm.storageRequirements || "—"],
    ["Spill procedures", cm.spillProcedures || "—"],
  ]);

  section(state, "Personal Protective Equipment (PPE)");
  const ppe = data.ppe || {};
  const items = ["gloves","goggles","respirator","faceShield","coveralls","boots","hearing"].filter(k => ppe[k]);
  if (items.length === 0) para(state, "Task-specific PPE per RAMS.");
  else para(state, items.map(k => k.charAt(0).toUpperCase() + k.slice(1)).join(" · "));
  if (ppe.otherText) para(state, `Other: ${ppe.otherText}`);

  section(state, "First Aid");
  const fa = data.firstAid || {};
  kvTable(state, [
    ["Eye contact", fa.eye || "—"],
    ["Skin contact", fa.skin || "—"],
    ["Inhalation", fa.inhalation || "—"],
    ["Ingestion", fa.ingestion || "—"],
  ]);

  section(state, "Fire & Spill Response");
  const fs = data.fireSpill || {};
  kvTable(state, [
    ["Suitable media", fs.suitable || "—"],
    ["Unsuitable media", fs.unsuitable || "—"],
    ["Spill containment", fs.spillContainment || "—"],
    ["Environmental precautions", fs.environmental || "—"],
    ["Waste disposal", fs.wasteDisposal || "—"],
  ]);

  const linked = data.linkedDocuments || {};
  const linkedRows = [];
  ["rams","methodStatement","toolboxTalk","riskRegister"].forEach(k => {
    const label = { rams: "RAMS", methodStatement: "Method Statement", toolboxTalk: "Toolbox Talk", riskRegister: "Risk Assessment" }[k];
    for (const d of linked[k] || []) linkedRows.push([label, d.title || "—", d.refNumber || "—"]);
  });
  if (linkedRows.length) { section(state, "Linked Documents"); table(state, ["Type", "Document", "Reference"], linkedRows); }

  const photos = (data.photos || []).filter(p => p?.url);
  if (photos.length) { section(state, "Site Photos"); photoGrid(state, photos); }

  section(state, "Sign-off");
  kvTable(state, [
    ["Prepared by", data.assessor || user?.fullName || "—"],
    ["Checked by", data.checkedBy || "—"],
    ["Approved by", data.approvedBy || "—"],
    ["Assessment date", data.assessmentDate || todayStr],
    ["Review date", data.reviewDate || "—"],
  ]);
  if (user?.signature) { if (state.y + 64 > pageHeight - 70) newPage(state); try { doc.addImage(user.signature, "PNG", MARGIN, state.y, 150, 56, undefined, "FAST"); state.y += 64; } catch { /* ignore */ } }

  addFooter(doc, pageWidth, pageHeight, user, ref, todayStr, userName);
  return doc;
}
export function downloadCoshhPdf({ data, user, today, hazards }) {
  const d = generateCoshhPdf({ data, user, today, hazards });
  const slug = (data.productName || "coshh").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
  d.save(`coshh-${slug}.pdf`);
}
export function coshhPdfBlobUrl({ data, user, today, hazards }) {
  return generateCoshhPdf({ data, user, today, hazards }).output("bloburl");
}

// helpers
function drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight }) {
  doc.setFillColor(20, 18, 16); doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setDrawColor(...GOLD); doc.setLineWidth(1.5);
  doc.line(MARGIN, 90, pageWidth - MARGIN, 90);
  doc.line(MARGIN, pageHeight - 90, pageWidth - MARGIN, pageHeight - 90);
  if (user?.companyLogo) { try { doc.addImage(user.companyLogo, "PNG", MARGIN, 30, 120, 44, undefined, "FAST"); } catch { /* ignore */ } }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...GOLD);
  doc.text("COSHH ASSESSMENT", MARGIN, 140);
  doc.setFontSize(30); doc.setTextColor(240, 237, 232);
  const wrapped = doc.splitTextToSize(data.productName || "Substance", pageWidth - MARGIN * 2);
  let y = 175; wrapped.forEach(l => { doc.text(l, MARGIN, y); y += 34; });
  y += 20;
  const rows = [
    ["Project", data.projectName || "—"],
    ["Client", data.clientName || "—"],
    ["Site", data.siteAddress || "—"],
    ["Assessor", data.assessor || user?.fullName || "—"],
    ["Assessment date", data.assessmentDate || todayStr],
    ["Review date", data.reviewDate || "—"],
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
function section(s, title) {
  ensureRoom(s, 34);
  s.sectionNum = (s.sectionNum || 0) + 1;
  s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(13); s.doc.setTextColor(...INK);
  s.doc.text(`${s.sectionNum}. ${title}`, MARGIN, s.y);
  s.doc.setDrawColor(...GOLD); s.doc.setLineWidth(0.6);
  s.doc.line(MARGIN, s.y + 4, s.pageWidth - MARGIN, s.y + 4);
  s.y += 20;
}
function para(s, text) {
  s.doc.setFont("helvetica", "normal"); s.doc.setFontSize(11); s.doc.setTextColor(...INK);
  const lines = s.doc.splitTextToSize(String(text || ""), s.pageWidth - MARGIN * 2);
  lines.forEach(l => { ensureRoom(s, 15); s.doc.text(l, MARGIN, s.y); s.y += 14; });
  s.y += 6;
}
function bulletSection(s, title, items) {
  const list = (items || []).filter(Boolean); if (list.length === 0) return;
  section(s, title);
  s.doc.setFont("helvetica", "normal"); s.doc.setFontSize(11); s.doc.setTextColor(...INK);
  list.forEach(item => {
    const lines = s.doc.splitTextToSize(String(item), s.pageWidth - MARGIN * 2 - 16);
    ensureRoom(s, lines.length * 14 + 6);
    s.doc.setFillColor(...GOLD); s.doc.circle(MARGIN + 3, s.y - 3, 2.2, "F");
    lines.forEach((l, i) => s.doc.text(l, MARGIN + 14, s.y + i * 14));
    s.y += lines.length * 14 + 4;
  });
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
function pictogramGrid(s, picto) {
  const usable = s.pageWidth - MARGIN * 2;
  const perRow = 5, cellW = usable / perRow, cellH = 70;
  for (let i = 0; i < picto.length; i += perRow) {
    ensureRoom(s, cellH + 4);
    for (let j = 0; j < perRow && i + j < picto.length; j++) {
      const p = picto[i + j]; const x = MARGIN + j * cellW; const y = s.y;
      const cx = x + cellW / 2, cy = y + 22;
      const [r, g, b] = hexToRgb(p.colour || "#E8A020");
      s.doc.setFillColor(r, g, b);
      // diamond shape
      s.doc.triangle(cx, cy - 18, cx + 18, cy, cx, cy + 18, "F");
      s.doc.triangle(cx, cy - 18, cx - 18, cy, cx, cy + 18, "F");
      s.doc.setFont("helvetica", "bold"); s.doc.setFontSize(7); s.doc.setTextColor(20, 20, 20);
      s.doc.text(p.id, cx - 7, cy + 2);
      s.doc.setFont("helvetica", "normal"); s.doc.setFontSize(8); s.doc.setTextColor(...MUTED);
      const labelLines = s.doc.splitTextToSize(p.label, cellW - 4);
      labelLines.slice(0, 2).forEach((l, k) => s.doc.text(l, x + 2, y + 50 + k * 10));
    }
    s.y += cellH;
  }
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
function hexToRgb(hex) {
  const h = (hex || "").replace("#", "");
  const b = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  return [(b >> 16) & 255, (b >> 8) & 255, b & 255];
}
function guessFmt(url) { const u = String(url || "").toLowerCase(); if (u.endsWith(".png")) return "PNG"; if (u.endsWith(".webp")) return "WEBP"; return "JPEG"; }
