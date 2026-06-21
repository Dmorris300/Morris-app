// Morris — RAMS PDF renderer.
// Uses jspdf to draw real tables (not styled text blocks) and reuses the
// existing Morris drawHeader/addFooter for branding so the orange "M" logo,
// gold rule, header bar and footer line stay identical to every other Morris doc.

import { jsPDF } from "jspdf";
import { drawHeader, addFooter } from "./pdf";

// ===== Branding =====
const GOLD = [232, 160, 32];
const INK  = [20, 20, 20];
const MUTED = [110, 110, 110];
const BORDER = [180, 180, 180];
const ZEBRA  = [248, 246, 242];
const GREEN  = [200, 230, 201];
const AMBER  = [255, 224, 178];
const RED    = [255, 205, 210];

const MARGIN = 48;
const PAGE_W = 595.28; // A4 pt
const PAGE_H = 841.89;
const USABLE = PAGE_W - MARGIN * 2;

// ===== Risk rating helpers =====
export function ratingFromScore(score) {
  if (score <= 6) return "Low";
  if (score <= 14) return "Medium";
  return "High";
}
function ratingColor(rating) {
  if (rating === "Low") return GREEN;
  if (rating === "Medium") return AMBER;
  return RED;
}

// ===== Public API =====
export function generateRamsPdf({ data, user, today }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const userName = user?.fullName || user?.username || "";
  const company  = user?.companyName || userName;
  const todayStr = today || new Date().toLocaleDateString("en-GB");
  const ref = data.documentRef || data.docRef || "";

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawHeader(doc, pageWidth, MARGIN, user, company, todayStr,
    `RAMS — ${data.task || "Task"}`);

  const state = { y: 150, doc, pageWidth, pageHeight, user, company, todayStr, ref, userName };

  // ===== 1. Document Control =====
  section(state, "1. Document Control");
  kvTable(state, [
    ["Document Reference",       ref || "—"],
    ["Revision",                 currentRevision(data)],
    ["Issue Date",               todayStr],
    ["Review Date",              addYearsToToday(1)],
    ["Prepared by",              user?.fullName || "—"],
    ["Supervisor / Competent Person", data.supervisorName || "—"],
    ["Client",                   data.clientName || "—"],
    ["Principal Contractor",     data.principalContractor || "—"],
    ["Site Address",             data.siteAddress || "—"],
  ]);

  // ===== 2. Revision History =====
  section(state, "2. Revision History");
  table(state, ["Rev", "Date", "Description", "Author"], (data.revisionHistory || []).map((r) => [
    r.rev || "",
    r.date || "",
    r.description || "",
    r.author || "",
  ]));

  // ===== 3. Scope of Works =====
  section(state, "3. Scope of Works");
  kvTable(state, [
    ["Task",                  data.task || "—"],
    ["Estimated Duration",    data.estimatedDuration || "—"],
    ["Number of Operatives",  String(data.operativesCount || "—")],
    ["Work at Height",        data.workAtHeight ? "Yes" : "No"],
    ["Overall Risk Rating",   data.overallRiskRating || "—"],
  ]);

  // ===== 4. Legislation =====
  section(state, "4. Legislation");
  bullets(state, [
    "Management of Health and Safety at Work Regulations 1999",
    "Manual Handling Operations Regulations 1992",
    "COSHH Regulations 2002",
    "PUWER 1998",
    "Personal Protective Equipment at Work Regulations 1992",
    "Work at Height Regulations 2005",
    "Control of Noise at Work Regulations 2005",
    "CDM 2015",
  ]);

  // ===== 5. Persons at Risk =====
  section(state, "5. Persons at Risk");
  bullets(state, data.personsAtRisk?.length ? data.personsAtRisk : ["Site operatives"]);

  // ===== 6. Training and Competence =====
  section(state, "6. Training and Competence");
  bullets(state, data.training?.length ? data.training : ["No specific training selected"]);

  // ===== 7. Risk Matrix Key =====
  section(state, "7. Risk Matrix Key");
  para(state, "Use the same scoring on every RAMS. Likelihood × Severity = Risk Score.");
  table(state, ["Likelihood", "Meaning"], [
    ["1", "Very unlikely to happen"],
    ["2", "Unlikely to happen"],
    ["3", "Could happen"],
    ["4", "Likely to happen"],
    ["5", "Almost certain to happen"],
  ]);
  spacer(state, 6);
  table(state, ["Severity", "Meaning"], [
    ["1", "Slight — minor cut or bruise, no first aid"],
    ["2", "Minor — first aid only"],
    ["3", "Moderate — over 7 days off work"],
    ["4", "Major — specified injury or long-term harm"],
    ["5", "Fatal or life-changing"],
  ]);
  spacer(state, 6);
  table(state, ["Score", "Rating", "Action Required"], [
    ["1–6",   "Low",    "Acceptable. Carry on with standard controls."],
    ["7–14",  "Medium", "Tighten controls. Supervisor must sign off before starting."],
    ["15–25", "High",   "Stop work. Add controls until the score drops. Do not proceed without written sign-off."],
  ], { colored: [null, ratingPaletteFor] });

  // ===== 8. Risk Register Summary =====
  section(state, "8. Risk Register Summary");
  const summaryRows = (data.hazards || []).map((h) => {
    const init  = (Number(h.likelihoodBefore) || 0) * (Number(h.severityBefore) || 0);
    const sevAfter = Number(h.severityAfter ?? h.severityBefore) || 0;
    const resid = (Number(h.likelihoodAfter) || 0) * sevAfter;
    return [
      composeHazardLine(h),
      `${init} ${init ? ratingFromScore(init) : ""}`.trim(),
      `${resid} ${resid ? ratingFromScore(resid) : ""}`.trim(),
    ];
  });
  table(state, ["Hazard", "Initial", "Residual"], summaryRows, {
    colored: [
      null,
      (cell) => ratingPaletteFor(extractRating(cell)),
      (cell) => ratingPaletteFor(extractRating(cell)),
    ],
    colWidths: [USABLE - 200, 100, 100],
  });

  // ===== 9. Hazard Detail and Control Measures =====
  section(state, "9. Hazard Detail and Control Measures");
  (data.hazards || []).forEach((h, i) => {
    subheading(state, `Hazard ${i + 1}. ${composeHazardLine(h)}`);
    const sevAfter = h.severityAfter ?? h.severityBefore;
    const init     = (Number(h.likelihoodBefore) || 0) * (Number(h.severityBefore) || 0);
    const resid    = (Number(h.likelihoodAfter)  || 0) * (Number(sevAfter) || 0);
    kvTable(state, [
      ["Exposure route",            h.exposureRoute || "—"],
      ["Hazard or substance",        h.hazard || "—"],
      ["Activity that causes exposure", h.activity || "—"],
      ["Persons affected",           (h.personsAffected || []).join(", ") || "—"],
      ["Likelihood before controls", String(h.likelihoodBefore || "—")],
      ["Severity before controls",   String(h.severityBefore || "—")],
      ["Risk score / rating before", init ? `${init} — ${ratingFromScore(init)}` : "—"],
      ["Likelihood after controls",  String(h.likelihoodAfter || "—")],
      ["Severity after controls",    String(sevAfter || "—")],
      ["Risk score / rating after",  resid ? `${resid} — ${ratingFromScore(resid)}` : "—"],
    ]);
    spacer(state, 4);
    para(state, "Control measures:");
    bullets(state, (h.controls || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
    spacer(state, 8);
  });

  // ===== 10. Control Measures and PPE =====
  section(state, "10. Control Measures and PPE");
  bullets(state, (data.ppe || []).length ? data.ppe : ["No PPE listed"]);
  if (data.ppeOverrideNote) {
    para(state, `Override note: ${data.ppeOverrideNote}`);
  }

  // ===== 11. Plant and Equipment =====
  section(state, "11. Plant and Equipment");
  bullets(state, (data.equipment || []).length ? data.equipment : ["No plant or equipment listed"]);
  para(state, "All plant and equipment listed above has been checked and is in date.");

  // ===== 12. COSHH =====
  const coshhStd = (data.coshh || []).filter((c) => !c.licensedSeparate);
  const coshhLic = (data.coshh || []).filter((c) =>  c.licensedSeparate);

  section(state, "12. COSHH");
  if (coshhStd.length === 0) {
    para(state, "No hazardous substances in standard use on this task.");
  } else {
    table(state, ["Substance", "Exposure", "Activity", "Controls"],
      coshhStd.map((c) => [c.substance || "", c.exposureRoute || "", c.activity || "", c.controls || ""])
    );
  }

  if (coshhLic.length > 0) {
    section(state, "12a. Substances Requiring a Separate Licensed Assessment");
    para(state, "STOP — the following substances need a separate licensed assessment before work starts. Do not proceed until that assessment is in place.");
    coshhLic.forEach((c) => {
      subheading(state, c.substance || "Substance");
      para(state, composeCoshhLine(c));
      para(state, "Work involving this substance must stop until the licensed assessment is completed and signed off in writing.");
    });
  }

  // ===== 13. Permits and Authorisations =====
  section(state, "13. Permits and Authorisations");
  if (data.notCovered) {
    para(state, `This RAMS does not cover: ${data.notCovered}.`);
  } else {
    para(state, "This RAMS does not cover any of the activities listed below.");
  }
  para(state, "If the work changes and any of these activities are needed, stop work, review this RAMS and put a separate permit or assessment in place before starting again. Hot works, confined space, live electrical work, asbestos work and any other licensed activity must always have their own permit.");

  // ===== 14. Sequence of Operations =====
  section(state, "14. Sequence of Operations");
  const steps = (data.sequence || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (steps.length === 0) {
    para(state, "To be completed by supervisor before works start.");
  } else {
    numbered(state, steps);
  }

  // ===== 15. Work at Height =====
  section(state, "15. Work at Height");
  if (data.workAtHeight) {
    para(state, "Working at height applies on this task. A separate Working at Height Rescue Plan must be in place before any work above 1.8 metres starts. All harnesses must be in date and inspected on the day. Stop work if any equipment fails inspection.");
  } else {
    para(state, "No work at height on this task.");
  }

  // ===== 16. Welfare Arrangements =====
  section(state, "16. Welfare Arrangements");
  kvTable(state, [
    ["Toilets",          data.welfareToilets || "—"],
    ["Washing",          data.welfareWashing || "—"],
    ["Rest area",        data.welfareRest || "—"],
    ["Drinking water",   data.welfareWater || "—"],
  ]);

  // ===== 17. Environmental Considerations =====
  section(state, "17. Environmental Considerations");
  kvTable(state, [
    ["Waste disposal",     data.envWaste || "—"],
    ["Dust and noise",     data.envDustNoise || "—"],
    ["Working hours",      data.envHours || "—"],
    ["Spill management",   data.envSpills || "—"],
  ]);

  // ===== 18. Emergency Procedures =====
  section(state, "18. Emergency Procedures");
  kvTable(state, [
    ["First Aider on site", data.firstAiderName || "—"],
    ["Assembly point",      data.assemblyPoint || "—"],
    ["Emergency number",    "999"],
  ]);
  const contacts = (data.emergencyContacts || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (contacts.length > 0) {
    spacer(state, 6);
    table(state, ["Role", "Number"], contacts.map((c) => {
      const m = c.match(/^([^,:-]+)[,:\s-]+(.+)$/);
      return m ? [m[1].trim(), m[2].trim()] : [c, ""];
    }));
  }

  // ===== 19. Briefing and Sign-Off =====
  section(state, "19. Briefing and Sign-Off");
  para(state, "Everyone listed below has been briefed on this RAMS. They confirm they understand the hazards, controls and method of work.");
  // Empty rows for operatives to sign in person
  const briefRows = Array.from({ length: Math.max(6, (data.operativesCount || 0)) }, () => ["", "", ""]);
  table(state, ["Print Name", "Signature", "Date"], briefRows, { rowHeight: 28 });

  // ===== Prepared by (signature stamp, NO placeholder text) =====
  spacer(state, 14);
  subheading(state, "Prepared by");
  kvTable(state, [
    ["Name",      user?.fullName || ""],
    ["Role",      user?.signatureRole || "Director"],
    ["Company",   user?.companyName || ""],
    ["Date",      todayStr],
  ]);
  // Stamp the signature image (no placeholder if missing — guarded upstream)
  if (user?.signature) {
    if (state.y + 60 > pageHeight - 70) { newPage(state); }
    try {
      doc.addImage(user.signature, "PNG", MARGIN, state.y, 150, 56, undefined, "FAST");
      state.y += 64;
    } catch { /* fall through */ }
  }

  addFooter(doc, pageWidth, pageHeight, user, ref, todayStr, userName);
  return doc;
}

// ===== Helpers =====
function currentRevision(data) {
  const list = data.revisionHistory || [];
  if (list.length === 0) return data.documentRevision || "Rev 1";
  return list[list.length - 1].rev || data.documentRevision || `Rev ${list.length}`;
}
function addYearsToToday(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toLocaleDateString("en-GB");
}
function ratingPaletteFor(rating) {
  if (rating === "Low") return GREEN;
  if (rating === "Medium") return AMBER;
  if (rating === "High") return RED;
  return null;
}
function extractRating(cell) {
  if (!cell) return null;
  const m = String(cell).match(/(Low|Medium|High)/);
  return m ? m[1] : null;
}

// ===== Compose plain-language lines =====
const ROUTE_VERBS = {
  "Inhalation":   "Breathing in",
  "Skin Contact": "Skin contact with",
  "Eye Contact":  "Getting",
  "Ingestion":    "Swallowing",
  "Impact/Strike":"Being struck by",
  "Fall":         "Falling from",
  "Manual Strain":"Strain from handling",
  "Noise":        "Loud noise from",
  "Other":        "Exposure to",
};

export function composeHazardLine(h) {
  if (!h) return "";
  const route = h.exposureRoute || "Other";
  const hazard = (h.hazard || "").trim();
  const activity = (h.activity || "").trim();
  const verb = ROUTE_VERBS[route] || ROUTE_VERBS.Other;
  if (route === "Eye Contact") {
    return [
      `${hazard || "Substance"} getting in eyes`,
      activity ? `while ${activity.toLowerCase()}` : "",
    ].filter(Boolean).join(" ") + ".";
  }
  if (route === "Fall") {
    return [
      `Falling from ${hazard || "height"}`,
      activity ? `while ${activity.toLowerCase()}` : "",
    ].filter(Boolean).join(" ") + ".";
  }
  return [
    `${verb} ${hazard || "the hazard"}`.trim(),
    activity ? `while ${activity.toLowerCase()}` : "",
  ].filter(Boolean).join(" ") + ".";
}

export function composeCoshhLine(c) {
  if (!c) return "";
  return composeHazardLine({
    exposureRoute: c.exposureRoute,
    hazard: c.substance,
    activity: c.activity,
  });
}

// ===== Drawing primitives =====
function ensureRoom(state, needed) {
  const bottom = state.pageHeight - 70;
  if (state.y + needed > bottom) newPage(state);
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
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text(title, MARGIN, state.y);
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
  const lines = doc.splitTextToSize(text, USABLE);
  lines.forEach((ln) => {
    ensureRoom(state, 14);
    doc.text(ln, MARGIN, state.y);
    state.y += 13;
  });
  state.y += 4;
}
function spacer(state, h = 6) { state.y += h; }
function bullets(state, items) {
  const { doc } = state;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  items.forEach((it) => {
    const lines = doc.splitTextToSize(`•  ${it}`, USABLE - 12);
    lines.forEach((ln, idx) => {
      ensureRoom(state, 14);
      doc.text(ln, MARGIN + (idx === 0 ? 0 : 12), state.y);
      state.y += 13;
    });
  });
  state.y += 4;
}
function numbered(state, items) {
  const { doc } = state;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  items.forEach((it, i) => {
    const prefix = `${i + 1}. `;
    const lines = doc.splitTextToSize(prefix + it, USABLE - 12);
    lines.forEach((ln, idx) => {
      ensureRoom(state, 14);
      doc.text(ln, MARGIN + (idx === 0 ? 0 : 12), state.y);
      state.y += 13;
    });
  });
  state.y += 4;
}

function kvTable(state, rows) {
  const colWidths = [USABLE * 0.34, USABLE * 0.66];
  table(state, null, rows, { colWidths, header: false, zebra: true });
}

function table(state, header, rows, opts = {}) {
  const { doc } = state;
  const colWidths = opts.colWidths || computeColWidths(header || rows[0] || [], rows);
  const rowHeight = opts.rowHeight || 0; // 0 = auto
  const padX = 6, padY = 4;
  const showHeader = header && opts.header !== false;

  // Draw header
  if (showHeader) {
    ensureRoom(state, 24);
    const x = MARGIN;
    doc.setFillColor(245, 240, 225);
    const headerHeight = 22;
    doc.rect(x, state.y, colWidths.reduce((a, b) => a + b, 0), headerHeight, "F");
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.4);
    doc.rect(x, state.y, colWidths.reduce((a, b) => a + b, 0), headerHeight);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    let cx = x;
    header.forEach((h, i) => {
      doc.text(String(h), cx + padX, state.y + 14);
      // vertical separator
      if (i > 0) doc.line(cx, state.y, cx, state.y + headerHeight);
      cx += colWidths[i];
    });
    state.y += headerHeight;
  }

  // Rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  (rows || []).forEach((row, rIdx) => {
    // Wrap each cell
    const wrapped = row.map((cell, i) => doc.splitTextToSize(String(cell ?? ""), colWidths[i] - padX * 2));
    const lineCounts = wrapped.map((w) => Math.max(1, w.length));
    const h = rowHeight || (Math.max(...lineCounts) * 12 + padY * 2);
    ensureRoom(state, h);

    // Per-cell fill colour
    const colored = opts.colored || [];
    let cx = MARGIN;
    row.forEach((cell, i) => {
      const fillFn = colored[i];
      let fill = null;
      if (typeof fillFn === "function") fill = fillFn(cell);
      if (!fill && opts.zebra && rIdx % 2 === 1) fill = ZEBRA;
      if (fill) {
        doc.setFillColor(...fill);
        doc.rect(cx, state.y, colWidths[i], h, "F");
      }
      cx += colWidths[i];
    });

    // Borders
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.4);
    doc.rect(MARGIN, state.y, colWidths.reduce((a, b) => a + b, 0), h);
    let vx = MARGIN;
    for (let i = 0; i < colWidths.length - 1; i++) {
      vx += colWidths[i];
      doc.line(vx, state.y, vx, state.y + h);
    }

    // Text
    cx = MARGIN;
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

function computeColWidths(header, rows) {
  const cols = header.length || (rows[0]?.length || 1);
  // First column for kv-style → narrower label column
  if (cols === 2) return [USABLE * 0.34, USABLE * 0.66];
  return Array(cols).fill(USABLE / cols);
}

// ===== Top-level download =====
export function downloadRamsPdf({ data, user, today }) {
  const doc = generateRamsPdf({ data, user, today });
  const safe = `rams-${(data.task || "task").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)}`;
  doc.save(`${safe}.pdf`);
}
