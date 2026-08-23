// Morris — Toolbox Talk PDF renderer.
// Premium document matching RAMS/Method Statement grammar.

import { jsPDF } from "jspdf";
import { drawHeader, addFooter } from "./pdf";

const GOLD   = [232, 160, 32];
const INK    = [20, 20, 20];
const MUTED  = [110, 110, 110];
const BORDER = [180, 180, 180];
const ZEBRA  = [248, 246, 242];

const MARGIN = 48;

export function generateToolboxTalkPdf({ data, user, today }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const userName = user?.fullName || user?.username || "";
  const company  = user?.companyName || userName;
  const todayStr = today || new Date().toLocaleDateString("en-GB");
  const ref = data.documentRef || defaultRef();

  drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight });

  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawHeader(doc, pageWidth, MARGIN, user, company, todayStr, "Toolbox Talk");

  const state = { y: 150, doc, pageWidth, pageHeight, user, company, todayStr, ref, userName, sectionNum: 0 };

  section(state, "Talk Details");
  kvTable(state, [
    ["Topic",     data.topicTitle || "—"],
    ["Reference", ref],
    ["Project",   data.projectName || "—"],
    ["Client",    data.clientName || "—"],
    ["Site",      data.siteAddress || "—"],
    ["Delivered by", data.presenter || user?.fullName || "—"],
    ["Date",      data.date || todayStr],
    ["Time",      data.time || "—"],
    ["Duration",  data.duration || "—"],
  ]);

  const s = data.sections || {};

  if ((s.introduction || "").trim()) {
    section(state, "Introduction");
    para(state, s.introduction.trim());
  }

  bulletSection(state, "Hazards", s.hazards);
  bulletSection(state, "Control Measures", s.controlMeasures);
  bulletSection(state, "Best Practice", s.bestPractice);
  bulletSection(state, "Emergency Procedures", s.emergencyProcedures);
  bulletSection(state, "Key Messages", s.keyMessages, true);
  bulletSection(state, "Questions Asked", s.questions);

  // Photos
  const photos = Array.isArray(data.photos) ? data.photos.filter((p) => p && p.url) : [];
  if (photos.length > 0) {
    section(state, "Site Photos");
    photoGrid(state, photos);
  }

  // Attendance
  section(state, "Attendance Register");
  const attendees = (data.attendees || []).filter((a) => a && (a.name || a.company));
  if (attendees.length === 0) {
    para(state, "No attendees recorded on this talk.");
  } else {
    attendeeTable(state, attendees);
  }

  // Linked docs
  const linked = data.linkedDocuments || {};
  const linkedRows = [];
  const kinds = [
    { k: "rams", label: "RAMS" },
    { k: "methodStatement", label: "Method Statement" },
    { k: "coshh", label: "COSHH" },
    { k: "riskRegister", label: "Risk Assessment" },
    { k: "siteDiary", label: "Site Diary" },
  ];
  for (const { k, label } of kinds) {
    for (const d of linked[k] || []) linkedRows.push([label, d.title || "—", d.refNumber || "—"]);
  }
  if (linkedRows.length > 0) {
    section(state, "Linked Documents");
    table(state, ["Type", "Document", "Reference"], linkedRows);
  }

  // Sign-off
  section(state, "Sign-off");
  kvTable(state, [
    ["Delivered By", data.presenter || user?.fullName || "—"],
    ["Supervisor",   data.supervisor || "—"],
    ["Date",         data.date || todayStr],
  ]);
  if (user?.signature) {
    if (state.y + 64 > pageHeight - 70) newPage(state);
    try {
      doc.addImage(user.signature, "PNG", MARGIN, state.y, 150, 56, undefined, "FAST");
      state.y += 64;
    } catch { /* ignore */ }
  }

  addFooter(doc, pageWidth, pageHeight, user, ref, todayStr, userName);
  return doc;
}

export function downloadToolboxTalkPdf({ data, user, today }) {
  const doc = generateToolboxTalkPdf({ data, user, today });
  const slug = ((data.topicTitle || "toolbox-talk") + "-" + (data.projectName || "project"))
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  doc.save(`toolbox-talk-${slug}.pdf`);
}

export function toolboxTalkPdfBlobUrl({ data, user, today }) {
  const doc = generateToolboxTalkPdf({ data, user, today });
  return doc.output("bloburl");
}

// ---------------- helpers ----------------
function defaultRef() {
  const d = new Date();
  return `TBT-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-001`;
}

function drawCover(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight }) {
  doc.setFillColor(20, 18, 16);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.5);
  doc.line(MARGIN, 90, pageWidth - MARGIN, 90);
  doc.line(MARGIN, pageHeight - 90, pageWidth - MARGIN, pageHeight - 90);
  if (user?.companyLogo) {
    try { doc.addImage(user.companyLogo, "PNG", MARGIN, 30, 120, 44, undefined, "FAST"); } catch { /* ignore */ }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...GOLD);
  doc.text("TOOLBOX TALK", MARGIN, 140);

  doc.setFontSize(30);
  doc.setTextColor(240, 237, 232);
  const title = data.topicTitle || "Site Safety Talk";
  const wrapped = doc.splitTextToSize(title, pageWidth - MARGIN * 2);
  let y = 175;
  wrapped.forEach((ln) => { doc.text(ln, MARGIN, y); y += 34; });

  y += 20;
  const rows = [
    ["Project", data.projectName || "—"],
    ["Client", data.clientName || "—"],
    ["Site", data.siteAddress || "—"],
    ["Presenter", data.presenter || user?.fullName || "—"],
    ["Date", data.date || todayStr],
    ["Time", data.time || "—"],
    ["Reference", ref],
  ];
  rows.forEach(([k, v]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(160, 155, 145);
    doc.text(k.toUpperCase(), MARGIN, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(240, 237, 232);
    const vLines = doc.splitTextToSize(String(v), pageWidth - MARGIN * 2);
    vLines.forEach((ln, i) => doc.text(ln, MARGIN, y + 14 + i * 14));
    y += 14 + vLines.length * 14 + 8;
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(160, 155, 145);
  doc.text((company || "").toUpperCase(), MARGIN, pageHeight - 60);
}

function ensureRoom(state, needed = 20) { if (state.y + needed > state.pageHeight - 70) newPage(state); }
function newPage(state) {
  addFooter(state.doc, state.pageWidth, state.pageHeight, state.user, state.ref, state.todayStr, state.userName);
  state.doc.addPage();
  state.doc.setFillColor(255, 255, 255);
  state.doc.rect(0, 0, state.pageWidth, state.pageHeight, "F");
  drawHeader(state.doc, state.pageWidth, MARGIN, state.user, state.company, state.todayStr, null);
  state.y = 110;
}
function section(state, title) {
  const { doc } = state;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  const usable = state.pageWidth - MARGIN * 2;
  const lineH = 16;
  state.sectionNum = (state.sectionNum || 0) + 1;
  const lines = doc.splitTextToSize(`${state.sectionNum}. ${title}`, usable);
  ensureRoom(state, lines.length * lineH + 30);
  lines.forEach((l, i) => doc.text(l, MARGIN, state.y + i * lineH));
  const lastY = state.y + (lines.length - 1) * lineH;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, lastY + 4, state.pageWidth - MARGIN, lastY + 4);
  state.y = lastY + 14;
}
function para(state, text) {
  const { doc } = state;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  const lines = doc.splitTextToSize(String(text || ""), state.pageWidth - MARGIN * 2);
  lines.forEach((ln) => {
    ensureRoom(state, 15);
    doc.text(ln, MARGIN, state.y);
    state.y += 14;
  });
  state.y += 6;
}
function bulletSection(state, title, items, emphasise = false) {
  const list = (items || []).map((x) => String(x || "").trim()).filter(Boolean);
  if (list.length === 0) return;
  section(state, title);
  const { doc } = state;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  list.forEach((item) => {
    const lines = doc.splitTextToSize(item, state.pageWidth - MARGIN * 2 - 16);
    ensureRoom(state, lines.length * 14 + 6);
    // gold bullet dot
    doc.setFillColor(...GOLD);
    doc.circle(MARGIN + 3, state.y - 3, 2.2, "F");
    if (emphasise) {
      doc.setFont("helvetica", "bold");
    } else {
      doc.setFont("helvetica", "normal");
    }
    lines.forEach((ln, i) => {
      doc.text(ln, MARGIN + 14, state.y + i * 14);
    });
    state.y += lines.length * 14 + 4;
  });
  state.y += 6;
}
function kvTable(state, rows) {
  const usable = state.pageWidth - MARGIN * 2;
  const colWidths = [usable * 0.32, usable * 0.68];
  table(state, null, rows, { colWidths, header: false, zebra: true });
}
function table(state, header, rows, opts = {}) {
  const { doc } = state;
  const usable = state.pageWidth - MARGIN * 2;
  const colWidths = opts.colWidths || (header ? Array(header.length).fill(usable / header.length) : [usable]);
  const padX = 6, padY = 4;
  const showHeader = header && opts.header !== false;
  if (showHeader) {
    ensureRoom(state, 24);
    doc.setFillColor(245, 240, 225);
    const hHeight = 22;
    doc.rect(MARGIN, state.y, colWidths.reduce((a, b) => a + b, 0), hHeight, "F");
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.4);
    doc.rect(MARGIN, state.y, colWidths.reduce((a, b) => a + b, 0), hHeight);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    let cx = MARGIN;
    header.forEach((h, i) => {
      doc.text(String(h), cx + padX, state.y + 14);
      if (i > 0) doc.line(cx, state.y, cx, state.y + hHeight);
      cx += colWidths[i];
    });
    state.y += hHeight;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  (rows || []).forEach((row, rIdx) => {
    const wrapped = row.map((cell, i) => doc.splitTextToSize(String(cell ?? ""), colWidths[i] - padX * 2));
    const h = Math.max(...wrapped.map((w) => w.length)) * 12 + padY * 2;
    ensureRoom(state, h);
    if (opts.zebra && rIdx % 2 === 1) {
      doc.setFillColor(...ZEBRA);
      doc.rect(MARGIN, state.y, colWidths.reduce((a, b) => a + b, 0), h, "F");
    }
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.4);
    doc.rect(MARGIN, state.y, colWidths.reduce((a, b) => a + b, 0), h);
    let vx = MARGIN;
    for (let i = 0; i < colWidths.length - 1; i++) { vx += colWidths[i]; doc.line(vx, state.y, vx, state.y + h); }
    let cx = MARGIN;
    wrapped.forEach((ws, i) => {
      ws.forEach((ln, j) => doc.text(ln, cx + padX, state.y + padY + 9 + j * 12));
      cx += colWidths[i];
    });
    state.y += h;
  });
  state.y += 6;
}
function attendeeTable(state, attendees) {
  const { doc } = state;
  const usable = state.pageWidth - MARGIN * 2;
  const colWidths = [usable * 0.30, usable * 0.25, usable * 0.20, usable * 0.15, usable * 0.10];
  const header = ["Name", "Company", "Trade", "Signature", "Time"];
  ensureRoom(state, 24);
  doc.setFillColor(245, 240, 225);
  const hHeight = 22;
  doc.rect(MARGIN, state.y, usable, hHeight, "F");
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.4);
  doc.rect(MARGIN, state.y, usable, hHeight);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  let cx = MARGIN;
  header.forEach((h, i) => {
    doc.text(String(h), cx + 6, state.y + 14);
    if (i > 0) doc.line(cx, state.y, cx, state.y + hHeight);
    cx += colWidths[i];
  });
  state.y += hHeight;

  attendees.forEach((a, rIdx) => {
    const rowH = 30;
    ensureRoom(state, rowH);
    if (rIdx % 2 === 1) {
      doc.setFillColor(...ZEBRA);
      doc.rect(MARGIN, state.y, usable, rowH, "F");
    }
    doc.setDrawColor(...BORDER);
    doc.rect(MARGIN, state.y, usable, rowH);
    let vx = MARGIN;
    for (let i = 0; i < colWidths.length - 1; i++) { vx += colWidths[i]; doc.line(vx, state.y, vx, state.y + rowH); }
    // Text cells
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    const cells = [a.name || "", a.company || "", a.trade || "", "", a.time || ""];
    let ccx = MARGIN;
    cells.forEach((c, i) => {
      const wrapped = doc.splitTextToSize(String(c), colWidths[i] - 8);
      wrapped.slice(0, 2).forEach((ln, j) => doc.text(ln, ccx + 6, state.y + 14 + j * 11));
      ccx += colWidths[i];
    });
    // Signature image in the signature column
    if (a.signature) {
      const sigX = MARGIN + colWidths[0] + colWidths[1] + colWidths[2] + 2;
      try {
        doc.addImage(a.signature, "PNG", sigX, state.y + 4, colWidths[3] - 4, rowH - 8, undefined, "FAST");
      } catch { /* ignore */ }
    }
    state.y += rowH;
  });
  state.y += 6;
}
function photoGrid(state, photos) {
  const { doc } = state;
  const usable = state.pageWidth - MARGIN * 2;
  const gap = 10;
  const cellW = (usable - gap) / 2;
  const cellH = 150;
  for (let i = 0; i < photos.length; i += 2) {
    ensureRoom(state, cellH + 22);
    for (let j = 0; j < 2 && i + j < photos.length; j++) {
      const p = photos[i + j];
      const x = MARGIN + j * (cellW + gap);
      const y = state.y;
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.4);
      doc.rect(x, y, cellW, cellH);
      try {
        doc.addImage(p.url, guessFmt(p.url), x + 1, y + 1, cellW - 2, cellH - 2, undefined, "FAST");
      } catch { /* ignore */ }
      const caption = (p.caption || p.description || p.category || "").trim();
      if (caption) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        const wrap = doc.splitTextToSize(caption, cellW);
        wrap.slice(0, 2).forEach((ln, k) => doc.text(ln, x, y + cellH + 12 + k * 10));
      }
    }
    state.y += cellH + 26;
  }
}
function guessFmt(url) {
  const u = String(url || "").toLowerCase();
  if (u.endsWith(".png")) return "PNG";
  if (u.endsWith(".webp")) return "WEBP";
  return "JPEG";
}
