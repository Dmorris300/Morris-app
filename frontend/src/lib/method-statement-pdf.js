// Morris — Method Statement PDF renderer.
// Standalone premium PDF matching RAMS visual grammar (drawHeader/addFooter,
// gold rule, sectioned layout). Independent from rams-pdf.js so the two tools
// can evolve separately.

import { jsPDF } from "jspdf";
import { drawHeader, addFooter } from "./pdf";

const GOLD   = [232, 160, 32];
const INK    = [20, 20, 20];
const MUTED  = [110, 110, 110];
const BORDER = [180, 180, 180];
const ZEBRA  = [248, 246, 242];
const CREAM  = [245, 240, 225];

const MARGIN = 48;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const USABLE = PAGE_W - MARGIN * 2;

// PPE catalog — id → label + simple 1-glyph icon marker.
export const PPE_CATALOG = [
  { id: "hard-hat", label: "Hard Hat", mark: "H" },
  { id: "safety-boots", label: "Safety Boots", mark: "B" },
  { id: "hi-vis", label: "Hi-Vis", mark: "V" },
  { id: "gloves", label: "Gloves", mark: "G" },
  { id: "goggles", label: "Goggles / Eye Protection", mark: "E" },
  { id: "hearing", label: "Hearing Protection", mark: "H" },
  { id: "respiratory", label: "Respiratory Protection", mark: "R" },
  { id: "harness", label: "Harness / Fall Arrest", mark: "F" },
  { id: "other", label: "Other", mark: "?" },
];

// ---------- Public API ----------
export function generateMethodStatementPdf({ data, user, today }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const userName = user?.fullName || user?.username || "";
  const company  = user?.companyName || userName;
  const todayStr = today || new Date().toLocaleDateString("en-GB");
  const ref = data.documentRef || data.docRef || defaultRef();

  // Cover page — dedicated first page (no header banner on cover)
  drawCoverPage(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight });

  // From page 2 onwards: standard Morris header + footer per page.
  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawHeader(doc, pageWidth, MARGIN, user, company, todayStr, "Method Statement");

  const state = { y: 150, doc, pageWidth, pageHeight, user, company, todayStr, ref, userName, sectionNum: 0 };

  // 1. Document Information
  section(state, "Document Information");
  kvTable(state, [
    ["Document Reference",  ref],
    ["Revision",            data.revisionNumber || "Rev 1"],
    ["Issue Date",          todayStr],
    ["Prepared by",         data.preparedBy || user?.fullName || "—"],
    ["Project",             data.projectName || "—"],
    ["Client",              data.clientName || "—"],
    ["Site Address",        data.siteAddress || "—"],
    ["Principal Contractor", data.principalContractor || "—"],
    ["Main Contractor",     data.mainContractor || "—"],
    ["Working Hours",       data.workingHours || "—"],
    ["Number of Operatives", String(data.operativesCount || "—")],
  ]);

  // 2. Scope of Works
  section(state, "Scope of Works");
  const scope = (data.scopeOfWorks || "").trim();
  if (scope) para(state, scope);
  else para(state, "Scope of works to be confirmed by supervisor before works commence.");

  if ((data.objectives || "").trim()) {
    subheading(state, "Project Objectives");
    para(state, data.objectives.trim());
  }
  if ((data.workLocation || "").trim()) {
    subheading(state, "Work Location");
    para(state, data.workLocation.trim());
  }
  if ((data.areasAffected || "").trim()) {
    subheading(state, "Areas Affected");
    para(state, data.areasAffected.trim());
  }

  // 3. Work Sequence
  section(state, "Work Sequence");
  const steps = Array.isArray(data.workSequence) ? data.workSequence : [];
  if (steps.length === 0) {
    para(state, "Work sequence to be developed with supervisor and briefed to all operatives before starting work.");
  } else {
    steps.forEach((s, i) => {
      subheading(state, `Step ${i + 1}${s.title ? ` — ${s.title}` : ""}`);
      const desc = (s.description || "").trim();
      para(state, desc || "Detailed description to be added by supervisor before works commence.");
    });
  }

  // 4. Plant & Equipment
  section(state, "Plant & Equipment");
  const plant = (data.plantEquipment || []).filter((r) => r && (r.equipment || r.purpose || r.inspection));
  if (plant.length === 0) {
    para(state, "No plant or equipment listed on this method statement.");
  } else {
    table(state, ["Equipment", "Purpose", "Inspection Required"], plant.map((r) => [
      r.equipment || "", r.purpose || "", r.inspection || "",
    ]));
  }

  // 5. Materials
  section(state, "Materials");
  const materials = (data.materials || []).filter((r) => r && (r.material || r.purpose || r.storage));
  if (materials.length === 0) {
    para(state, "No specific materials listed on this method statement.");
  } else {
    table(state, ["Material", "Purpose", "Storage Requirements"], materials.map((r) => [
      r.material || "", r.purpose || "", r.storage || "",
    ]));
  }

  // 6. PPE
  section(state, "Personal Protective Equipment (PPE)");
  const selectedPpe = data.ppe || {};
  const activePpe = PPE_CATALOG.filter((p) => selectedPpe[p.id]);
  if (activePpe.length === 0) {
    para(state, "Standard site PPE required: hard hat, safety boots, hi-vis vest, gloves.");
  } else {
    ppeGrid(state, activePpe, selectedPpe);
  }
  if ((selectedPpe.otherText || "").trim()) {
    subheading(state, "Additional PPE requirements");
    para(state, selectedPpe.otherText.trim());
  }

  // 7. Environmental Controls
  section(state, "Environmental Controls");
  const env = data.environmental || {};
  const envRows = [
    ["Waste Management",         env.wasteManagement || "—"],
    ["Dust Control",             env.dustControl || "—"],
    ["Noise Control",            env.noiseControl || "—"],
    ["Spill Prevention",         env.spillPrevention || "—"],
    ["Protection of Existing Works", env.protectionExisting || "—"],
  ];
  kvTable(state, envRows);

  // 8. Emergency Procedures
  section(state, "Emergency Procedures");
  const em = data.emergency || {};
  kvTable(state, [
    ["First Aid Arrangements", em.firstAid || "—"],
    ["Fire Procedure",         em.firePlan || "—"],
    ["Emergency Contacts",     em.contacts || "—"],
    ["Assembly Point",         em.assemblyPoint || "—"],
    ["Nearest Hospital",       em.hospital || "—"],
    ["Emergency Access Route", em.accessRoute || "—"],
  ]);

  // 10. Linked Documents
  const linked = data.linkedDocuments || {};
  const hasLinked = Object.keys(linked).some((k) => Array.isArray(linked[k]) && linked[k].length > 0);
  if (hasLinked) {
    section(state, "Linked Documents");
    const kinds = [
      { k: "rams", label: "RAMS" },
      { k: "riskRegister", label: "Risk Assessments" },
      { k: "coshh", label: "COSHH Assessments" },
      { k: "toolboxTalk", label: "Toolbox Talks" },
    ];
    const rows = [];
    for (const { k, label } of kinds) {
      const list = linked[k] || [];
      for (const d of list) {
        rows.push([label, d.title || "—", d.refNumber || "—"]);
      }
    }
    if (rows.length) {
      table(state, ["Type", "Document", "Reference"], rows);
    }
  }

  // 9. Site Photos (last so photos don't split sections badly)
  const photos = Array.isArray(data.photos) ? data.photos.filter((p) => p && p.url) : [];
  if (photos.length > 0) {
    section(state, "Site Photos");
    photoGrid(state, photos);
  }

  // 11. Sign-off
  section(state, "Sign-off");
  kvTable(state, [
    ["Prepared By", data.preparedBy || user?.fullName || "—"],
    ["Checked By",  data.checkedBy || "—"],
    ["Approved By", data.approvedBy || "—"],
    ["Date",        todayStr],
  ]);
  if (user?.signature) {
    if (state.y + 60 > pageHeight - 70) { newPage(state); }
    try {
      doc.addImage(user.signature, "PNG", MARGIN, state.y, 150, 56, undefined, "FAST");
      state.y += 64;
    } catch { /* ignore */ }
  }

  addFooter(doc, pageWidth, pageHeight, user, ref, todayStr, userName);
  return doc;
}

export function downloadMethodStatementPdf({ data, user, today }) {
  const doc = generateMethodStatementPdf({ data, user, today });
  const safe = `method-statement-${(data.projectName || data.task || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)}`;
  doc.save(`${safe}.pdf`);
}

export function methodStatementPdfBlobUrl({ data, user, today }) {
  const doc = generateMethodStatementPdf({ data, user, today });
  return doc.output("bloburl");
}

// ---------- Helpers ----------
function defaultRef() {
  const d = new Date();
  return `MS-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-001`;
}

function drawCoverPage(doc, { data, user, company, todayStr, ref, pageWidth, pageHeight }) {
  doc.setFillColor(20, 18, 16);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  // Gold rule top and bottom
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(1.5);
  doc.line(MARGIN, 90, pageWidth - MARGIN, 90);
  doc.line(MARGIN, pageHeight - 90, pageWidth - MARGIN, pageHeight - 90);

  // Company logo (top)
  if (user?.companyLogo) {
    try {
      doc.addImage(user.companyLogo, "PNG", MARGIN, 30, 120, 44, undefined, "FAST");
    } catch { /* ignore */ }
  }

  // Eyebrow
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...GOLD);
  doc.text("METHOD STATEMENT", MARGIN, 140);

  // Big title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(32);
  doc.setTextColor(240, 237, 232);
  const title = data.projectName || data.task || "Project";
  const wrapped = doc.splitTextToSize(title, pageWidth - MARGIN * 2);
  let y = 175;
  wrapped.forEach((ln) => { doc.text(ln, MARGIN, y); y += 36; });

  // Client + address block
  y += 20;
  doc.setFontSize(12);
  doc.setTextColor(180, 175, 165);
  const fields = [
    ["Client", data.clientName || "—"],
    ["Site Address", data.siteAddress || "—"],
    ["Principal Contractor", data.principalContractor || "—"],
    ["Main Contractor", data.mainContractor || "—"],
    ["Revision", data.revisionNumber || "Rev 1"],
    ["Date", todayStr],
    ["Prepared By", data.preparedBy || user?.fullName || "—"],
    ["Reference", ref],
  ];
  fields.forEach(([k, v]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(160, 155, 145);
    doc.text(k.toUpperCase(), MARGIN, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(240, 237, 232);
    const vLines = doc.splitTextToSize(String(v), pageWidth - MARGIN * 2);
    vLines.forEach((ln, i) => { doc.text(ln, MARGIN, y + 14 + i * 14); });
    y += 14 + vLines.length * 14 + 8;
  });

  // Footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(160, 155, 145);
  doc.text((company || "").toUpperCase(), MARGIN, pageHeight - 60);
}

function ensureRoom(state, needed = 20) {
  if (state.y + needed > state.pageHeight - 70) newPage(state);
}
function newPage(state) {
  addFooter(state.doc, state.pageWidth, state.pageHeight, state.user, state.ref, state.todayStr, state.userName);
  state.doc.addPage();
  state.doc.setFillColor(255, 255, 255);
  state.doc.rect(0, 0, state.pageWidth, state.pageHeight, "F");
  drawHeader(state.doc, state.pageWidth, MARGIN, state.user, state.company, state.todayStr, null);
  state.y = 110;
}

function section(state, title) {
  ensureRoom(state, 34);
  const { doc } = state;
  state.sectionNum = (state.sectionNum || 0) + 1;
  const fullTitle = `${state.sectionNum}. ${title}`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text(fullTitle, MARGIN, state.y);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, state.y + 4, PAGE_W - MARGIN, state.y + 4);
  state.y += 18;
}
function subheading(state, t) {
  ensureRoom(state, 22);
  const { doc } = state;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...INK);
  doc.text(t, MARGIN, state.y);
  state.y += 14;
}
function para(state, text) {
  if (!text) return;
  const { doc } = state;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  const lines = doc.splitTextToSize(String(text), USABLE);
  lines.forEach((ln) => {
    ensureRoom(state, 14);
    doc.text(ln, MARGIN, state.y);
    state.y += 13;
  });
  state.y += 4;
}
function kvTable(state, rows) {
  const colWidths = [USABLE * 0.34, USABLE * 0.66];
  table(state, null, rows, { colWidths, header: false, zebra: true });
}
function table(state, header, rows, opts = {}) {
  const { doc } = state;
  const colWidths = opts.colWidths || (header ? Array(header.length).fill(USABLE / header.length) : [USABLE]);
  const rowHeight = opts.rowHeight || 0;
  const padX = 6, padY = 4;
  const showHeader = header && opts.header !== false;

  if (showHeader) {
    ensureRoom(state, 24);
    doc.setFillColor(...CREAM);
    const headerHeight = 22;
    doc.rect(MARGIN, state.y, colWidths.reduce((a, b) => a + b, 0), headerHeight, "F");
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.4);
    doc.rect(MARGIN, state.y, colWidths.reduce((a, b) => a + b, 0), headerHeight);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    let cx = MARGIN;
    header.forEach((h, i) => {
      doc.text(String(h), cx + padX, state.y + 14);
      if (i > 0) doc.line(cx, state.y, cx, state.y + headerHeight);
      cx += colWidths[i];
    });
    state.y += headerHeight;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  (rows || []).forEach((row, rIdx) => {
    const wrapped = row.map((cell, i) => doc.splitTextToSize(String(cell ?? ""), colWidths[i] - padX * 2));
    const lineCounts = wrapped.map((w) => Math.max(1, w.length));
    const h = rowHeight || (Math.max(...lineCounts) * 12 + padY * 2);
    ensureRoom(state, h);
    if (opts.zebra && rIdx % 2 === 1) {
      doc.setFillColor(...ZEBRA);
      doc.rect(MARGIN, state.y, colWidths.reduce((a, b) => a + b, 0), h, "F");
    }
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.4);
    doc.rect(MARGIN, state.y, colWidths.reduce((a, b) => a + b, 0), h);
    let vx = MARGIN;
    for (let i = 0; i < colWidths.length - 1; i++) {
      vx += colWidths[i];
      doc.line(vx, state.y, vx, state.y + h);
    }
    let cx = MARGIN;
    wrapped.forEach((ws, i) => {
      ws.forEach((ln, j) => {
        doc.text(ln, cx + padX, state.y + padY + 9 + j * 12);
      });
      cx += colWidths[i];
    });
    state.y += h;
  });
  state.y += 6;
}

function ppeGrid(state, ppe, selected) {
  const { doc } = state;
  const perRow = 4;
  const cellW = USABLE / perRow;
  const cellH = 56;
  for (let i = 0; i < ppe.length; i += perRow) {
    ensureRoom(state, cellH + 4);
    for (let j = 0; j < perRow && i + j < ppe.length; j++) {
      const p = ppe[i + j];
      const x = MARGIN + j * cellW;
      const y = state.y;
      // card
      doc.setFillColor(255, 250, 235);
      doc.rect(x + 4, y, cellW - 8, cellH, "F");
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.4);
      doc.rect(x + 4, y, cellW - 8, cellH);
      // circle badge with letter mark
      const cx = x + 4 + 22;
      const cy = y + cellH / 2;
      doc.setFillColor(...GOLD);
      doc.circle(cx, cy, 12, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(20, 20, 20);
      doc.text(p.mark, cx - 3, cy + 4);
      // label
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      const labelLines = doc.splitTextToSize(p.label, cellW - 60);
      labelLines.forEach((ln, k) => {
        doc.text(ln, x + 44, y + 18 + k * 12);
      });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text("Required", x + 44, y + cellH - 12);
    }
    state.y += cellH + 4;
  }
  state.y += 4;
}

function photoGrid(state, photos) {
  const { doc } = state;
  const perRow = 2;
  const gap = 10;
  const cellW = (USABLE - gap) / perRow;
  const cellH = 160;
  for (let i = 0; i < photos.length; i += perRow) {
    ensureRoom(state, cellH + 24);
    for (let j = 0; j < perRow && i + j < photos.length; j++) {
      const p = photos[i + j];
      const x = MARGIN + j * (cellW + gap);
      const y = state.y;
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.4);
      doc.rect(x, y, cellW, cellH);
      try {
        doc.addImage(p.url, guessFmt(p.url), x + 1, y + 1, cellW - 2, cellH - 2, undefined, "FAST");
      } catch { /* ignore broken images */ }
      const caption = (p.caption || p.category || "").trim();
      if (caption) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        const capLines = doc.splitTextToSize(caption, cellW);
        capLines.slice(0, 2).forEach((ln, k) => {
          doc.text(ln, x, y + cellH + 12 + k * 10);
        });
      }
    }
    state.y += cellH + 30;
  }
}

function guessFmt(url) {
  const u = String(url || "").toLowerCase();
  if (u.endsWith(".png")) return "PNG";
  if (u.endsWith(".webp")) return "WEBP";
  return "JPEG";
}
