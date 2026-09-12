import { jsPDF } from "jspdf";
import { MORRIS_LOGO_PDF_DATA_URL } from "./morris-logo-pdf";

// ----- Morris brand mark — the new official Morris logo (black/gold hard hat
// + M + wrench), embedded as a base64 PNG. Used as the default header logo on
// every generated PDF unless the user has uploaded their own company logo.
function drawMorrisMark(doc, x, y, size = 28) {
  try {
    doc.addImage(MORRIS_LOGO_PDF_DATA_URL, "PNG", x, y, size, size, undefined, "FAST");
  } catch (e) {
    // Defensive fallback: if jsPDF fails to embed the data URL for any reason,
    // fall back to the previous gold-square M so the header is never empty.
    doc.setFillColor(232, 160, 32);
    doc.roundedRect(x, y, size, size, 4, 4, "F");
    doc.setTextColor(10, 10, 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size * 0.7);
    doc.text("M", x + size / 2, y + size * 0.74, { align: "center" });
    if (process.env.NODE_ENV !== "production") console.error("Morris logo embed failed", e);
  }
}

function extractRef(content) {
  // Pull the DOCUMENT REFERENCE: line out of the body if it exists.
  if (!content) return null;
  const m = content.match(/DOCUMENT REFERENCE:\s*([A-Z0-9\-]+)/i);
  return m ? m[1].trim() : null;
}

// Strip LLM debug/placeholder leaks from generated content before it reaches
// a customer-facing PDF. We do this at render time (not prompt time) so a
// misbehaving model can never leak these into the document.
//   • "(role not set in profile)" and variants
//   • "[SIGNATORY ROLE]", "[Role]", "[insert role]" square-bracket placeholders
//   • A "Role:" line that ends up empty after the scrub — drop the whole line
//   • Long-form dates like "07 September 2026" → "07/09/2026" (defensive; the
//     LLM is separately told to use DD/MM/YYYY, but this catches leaks)
const _MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const _MONTH_IDX = _MONTHS.reduce((a, m, i) => (a[m] = i + 1, a), {});
export function scrubContent(content) {
  if (!content) return "";
  const placeholderInParens = /\s*\((?:role not set in profile|role not set|insert role|role missing)\)\s*/gi;
  const bracketPlaceholder = /\s*\[(?:signatory role|role|insert role|role missing|role not set)\]\s*/gi;
  // Matches "07 September 2026" or "7 Sep 2026" (case-insensitive). Captures
  // day, month, year separately so we can re-emit as DD/MM/YYYY.
  const longDate = /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{4})\b/gi;
  const normaliseDate = (_, d, mon, y) => {
    const key = mon.toLowerCase().replace(/\./g, "").replace(/^sept$/, "sep");
    // full-month lookup; short form falls through the same key via prefix
    const full = _MONTHS.find((m) => m.startsWith(key.slice(0, 3)));
    const mm = full ? String(_MONTH_IDX[full]).padStart(2, "0") : "01";
    return `${String(d).padStart(2, "0")}/${mm}/${y}`;
  };
  return content
    .split("\n")
    .map((raw) => {
      let line = raw.replace(placeholderInParens, " ").replace(bracketPlaceholder, " ");
      line = line.replace(longDate, normaliseDate);
      if (/^\s*Role\s*:\s*$/i.test(line)) return null;
      return line.replace(/[ \t]{2,}/g, " ").replace(/\s+$/g, "");
    })
    .filter((l) => l !== null)
    .join("\n");
}

// Append the "Photographic Evidence" section to the PDF. Each photo gets its
// own block on a fresh page (or stacked 2-per-page when the page has room).
// `photos` is an array of: { dataUrl, note, ukDate, time, location }.
export function appendPhotographicEvidence(doc, pageWidth, pageHeight, margin, photos, user, company, today, ref, userName) {
  const usable = pageWidth - margin * 2;

  // Always start the section on a fresh page so it reads as a distinct annex.
  addFooter(doc, pageWidth, pageHeight, user, ref, today, userName);
  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawHeader(doc, pageWidth, margin, user, company, today, "Photographic Evidence");

  let y = 150;
  const bottom = pageHeight - 70;

  // Intro line under the title.
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9.5);
  doc.setTextColor(110, 110, 110);
  const intro = `${photos.length} photo${photos.length === 1 ? "" : "s"} attached. Each image was stamped on capture with date, time and location where available.`;
  doc.splitTextToSize(intro, usable).forEach((l) => { doc.text(l, margin, y); y += 12; });
  y += 8;

  // Each photo block: caption line + image + note. Tight, readable layout.
  const imgWidth = usable;
  // Constrain image height so 2 fit per page comfortably with captions.
  const maxImgHeight = 280;

  photos.forEach((p, idx) => {
    // Caption header (Photo N of M — date · time · location)
    const headerH = 16;
    const captionH = 14; // single caption line
    const noteText = (p.note || "").trim();
    let noteLines = [];
    if (noteText) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      noteLines = doc.splitTextToSize(`Note: ${noteText}`, usable);
    }
    const noteH = noteLines.length * 12;

    // Image height: pick smaller of maxImgHeight or aspect-ratio fallback.
    const imgH = maxImgHeight;
    const blockH = headerH + captionH + 6 + imgH + (noteH > 0 ? noteH + 8 : 0) + 18;

    if (y + blockH > bottom) {
      addFooter(doc, pageWidth, pageHeight, user, ref, today, userName);
      doc.addPage();
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, "F");
      drawHeader(doc, pageWidth, margin, user, company, today, "Photographic Evidence (continued)");
      y = 150;
    }

    // Photo header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 15, 15);
    doc.text(`Photo ${idx + 1} of ${photos.length}`, margin, y);
    y += headerH;

    // Caption (date / time / location)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(95, 95, 95);
    const stamp = [p.ukDate, p.time, p.location || "Location not available"].filter(Boolean).join("  ·  ");
    doc.text(stamp, margin, y);
    y += captionH;

    // Image
    try {
      const format = (p.dataUrl && p.dataUrl.startsWith("data:image/png")) ? "PNG" : "JPEG";
      doc.addImage(p.dataUrl, format, margin, y, imgWidth, imgH, undefined, "FAST");
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.4);
      doc.rect(margin, y, imgWidth, imgH);
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.error("PDF evidence photo embed failed", e);
      doc.setDrawColor(200, 200, 200);
      doc.rect(margin, y, imgWidth, imgH);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(140, 140, 140);
      doc.text("Image could not be embedded", margin + imgWidth / 2, y + imgH / 2, { align: "center" });
    }
    y += imgH + 6;

    // Note (if any)
    if (noteLines.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      noteLines.forEach((l) => { doc.text(l, margin, y); y += 12; });
    }
    y += 18; // gap between blocks
  });
}

export function generatePdf({ title, content, user, photo, photoCaption, photos, clientSignature, refNumber }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const usable = pageWidth - margin * 2;

  // --- White background. No watermarks. No grain. Clean. ---
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  const today = new Date().toLocaleDateString("en-GB");
  const ref = refNumber || extractRef(content) || "";
  const userName = user?.fullName || user?.username || "";
  const company = user?.companyName || userName;

  // --- Header on first page ---
  drawHeader(doc, pageWidth, margin, user, company, today, title);

  // --- Body ---
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(20, 20, 20);

  // Scrub debug/placeholder leaks from LLM output before rendering. The
  // model sometimes emits "(role not set in profile)", "[SIGNATORY ROLE]"
  // or leaves an empty "Role:" line when the profile has no signatory
  // role — none of that should ever reach a customer-facing PDF.
  const cleanedContent = scrubContent(content || "");
  const lines = doc.splitTextToSize(cleanedContent, usable);
  let y = 150;
  const bottom = pageHeight - 70;
  const lineHeight = 14;

  const sigLineMatcher = /^Signature:\s*/i;
  const clientSigMarker = /\[SIGN HERE\]/i;
  let sigStampedY = null;

  lines.forEach((line) => {
    if (y > bottom) {
      addFooter(doc, pageWidth, pageHeight, user, ref, today, userName);
      doc.addPage();
      // White background on every new page
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, "F");
      drawHeader(doc, pageWidth, margin, user, company, today, null);
      y = 110;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(20, 20, 20);
    }

    if (sigLineMatcher.test(line) && clientSigMarker.test(line)) {
      doc.text("Signature:", margin, y);
      const boxW = 240;
      const boxH = 70;
      if (y + boxH + 30 > bottom) {
        addFooter(doc, pageWidth, pageHeight, user, ref, today, userName);
        doc.addPage();
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageWidth, pageHeight, "F");
        drawHeader(doc, pageWidth, margin, user, company, today, null);
        y = 110;
        doc.text("Signature:", margin, y);
      }
      doc.setDrawColor(150, 150, 150);
      doc.setLineWidth(0.6);
      doc.rect(margin + 70, y - 12, boxW, boxH);
      if (clientSignature) {
        try {
          doc.addImage(clientSignature, "PNG", margin + 70 + 4, y - 12 + 4, boxW - 8, boxH - 8, undefined, "FAST");
        } catch (e) {
          if (process.env.NODE_ENV !== "production") console.error("PDF client sig embed failed", e);
        }
      } else {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(170, 170, 170);
        doc.text("Sign inside this box", margin + 70 + boxW / 2, y - 12 + boxH / 2 + 3, { align: "center" });
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(20, 20, 20);
      y += lineHeight + boxH;
      return;
    }

    // Saved-signature line: LLMs emit "Signature: ..." (often followed by the
    // signer's name or placeholder underscores). Strip that trailing prose,
    // then render either the user's saved signature image above a signature
    // line, or just the signature line if none is held.
    if (sigStampedY === null && sigLineMatcher.test(line)) {
      const labelW = 70;
      const sigX = margin + labelW;
      const sigMaxW = 220;
      const sigMaxH = 44;
      // Natural signature height in PDF points. A hand-drawn signature on
      // print is typically ~9–10 mm tall; 26 pt ≈ 9.2 mm. We render the
      // signature at this target height and never upscale beyond it, so a
      // trimmed tight-bbox signature stays at its natural size instead of
      // being blown up to the full sigMaxW × sigMaxH band.
      const sigTargetH = 26;
      const blockH = sigMaxH + 18; // image band + line + spacing

      if (y + blockH > bottom) {
        addFooter(doc, pageWidth, pageHeight, user, ref, today, userName);
        doc.addPage();
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageWidth, pageHeight, "F");
        drawHeader(doc, pageWidth, margin, user, company, today, null);
        y = 110;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10.5);
        doc.setTextColor(20, 20, 20);
      }

      // Label only — the trailing "..." prose from the LLM is discarded.
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(20, 20, 20);
      doc.text("Signature:", margin, y + sigMaxH - 4);

      const lineY = y + sigMaxH;
      if (user?.signature) {
        try {
          // Preserve aspect ratio at the natural target height. Only scale
          // DOWN if the derived width would exceed the max band or the
          // target height exceeds the band — never scale UP.
          const props = doc.getImageProperties(user.signature);
          const ar = props.width / props.height;
          let sh = sigTargetH;
          let sw = sh * ar;
          if (sw > sigMaxW) { sw = sigMaxW; sh = sw / ar; }
          if (sh > sigMaxH) { sh = sigMaxH; sw = sh * ar; }
          // Draw crisply, aligned to sit just above the signature line.
          doc.addImage(user.signature, props.fileType || "PNG", sigX, lineY - sh - 2, sw, sh, undefined, "FAST");
          sigStampedY = y;
        } catch (e) {
          if (process.env.NODE_ENV !== "production") console.error("PDF signature embed failed", e);
        }
      }

      // Signature baseline — always drawn (whether image was embedded or not).
      doc.setDrawColor(60, 60, 60);
      doc.setLineWidth(0.6);
      doc.line(sigX, lineY, sigX + sigMaxW, lineY);

      y += blockH;
      return;
    }

    doc.text(line, margin, y);
    y += lineHeight;
  });

  // --- Photographic Evidence annex (multi-photo) ---
  const photoList = Array.isArray(photos) && photos.length > 0
    ? photos
    : (photo ? [{ dataUrl: photo, note: photoCaption || "", ukDate: "", time: "", location: "" }] : []);

  if (photoList.length > 0) {
    appendPhotographicEvidence(doc, pageWidth, pageHeight, margin, photoList, user, company, today, ref, userName);
  }

  addFooter(doc, pageWidth, pageHeight, user, ref, today, userName);
  // P3 — stamp Page X of Y on every content page. The generic tool page
  // fallback has no cover, so skipPages is empty.
  const userName2 = user?.fullName || user?.username || "";
  finalizeFooters(doc, { user, ref, today, userName: userName2, pageWidth, pageHeight });
  return doc;
}

export function drawHeader(doc, pageWidth, margin, user, company, today, title) {
  // White header. Logo top-left. Company / date top-right. Single thin gold rule under.
  const logoSize = 40;
  const logoY = 30;
  if (user?.companyLogo) {
    try {
      doc.addImage(user.companyLogo, "PNG", margin, logoY, 100, logoSize, undefined, "FAST");
    } catch (e) {
      drawMorrisMark(doc, margin, logoY, logoSize);
    }
  } else {
    drawMorrisMark(doc, margin, logoY, logoSize);
  }

  // Right side: company name + date (small, neutral, no shouting)
  doc.setTextColor(60, 60, 60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  if (company) doc.text(company.toUpperCase(), pageWidth - margin, logoY + 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(today, pageWidth - margin, logoY + 30, { align: "right" });

  // Gold accent rule
  doc.setDrawColor(232, 160, 32);
  doc.setLineWidth(0.8);
  doc.line(margin, logoY + logoSize + 16, pageWidth - margin, logoY + logoSize + 16);

  // Title (only on the first page)
  if (title) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(15, 15, 15);
    doc.text(title, margin, logoY + logoSize + 40);
  }
}

export function addFooter(doc, pageWidth, pageHeight, user, ref, today, userName) {
  // Thin grey rule
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.4);
  doc.line(48, pageHeight - 56, pageWidth - 48, pageHeight - 56);

  // Footer top line: ref | date | user name
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  const refStr = ref ? `Ref: ${ref}` : "";
  const parts = [refStr, today, userName].filter(Boolean).join("   ·   ");
  doc.text(parts, 48, pageHeight - 40);

  // Footer attribution line — contractor identity only (Morris operates invisibly).
  doc.setTextColor(140, 140, 140);
  const contractorLine = [user?.companyName || userName, user?.email, user?.phone].filter(Boolean).join("  ·  ");
  if (contractorLine) doc.text(contractorLine, 48, pageHeight - 26);
}

// P3 (Sep 2026) — Stamp "Page N of M" on every page, and also guarantee
// every page has a footer (some V2 generators only draw the footer on
// page-break, leaving the final page footerless if the caller forgets).
// Idempotent-ish: skips pages whose cover flag is set via
// `doc.setPage(n); doc.__morrisSkipFooter = true;` in the caller. Always
// call this ONCE at the end of a generator, immediately before `return doc`.
//
// `opts.skipPages` is an array of 1-indexed page numbers to skip (e.g. the
// dark cover page). Everything else gets a normal footer + page indicator.
export function finalizeFooters(doc, { user, ref, today, userName, pageWidth, pageHeight, skipPages = [] } = {}) {
  const total = doc.getNumberOfPages();
  const skip = new Set(skipPages);
  for (let p = 1; p <= total; p++) {
    if (skip.has(p)) continue;
    doc.setPage(p);
    // Only draw the standard footer if the page doesn't already look
    // footered. We detect a footer by checking whether the reserved
    // bottom strip has any text — a cheap heuristic is to always redraw
    // the footer (idempotent visual — the same content overwrites cleanly
    // with identical positioning), then stamp the page indicator on top.
    if (pageWidth && pageHeight) {
      addFooter(doc, pageWidth, pageHeight, user, ref, today, userName);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`Page ${p} of ${total}`, (pageWidth || 595) - 48, (pageHeight || 842) - 26, { align: "right" });
  }
}

// P3 — DD/MM/YYYY UK date formatter. Accepts ISO ("2026-07-20" or
// "2026-07-20T15:04"), already-UK ("20/07/2026"), Date objects. Returns
// empty string for null / invalid / falsy inputs — callers decide their
// own placeholder (e.g. "—").
export function ukDateFmt(v) {
  if (!v) return "";
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return "";
    return `${String(v.getDate()).padStart(2, "0")}/${String(v.getMonth() + 1).padStart(2, "0")}/${v.getFullYear()}`;
  }
  const s = String(v).trim();
  if (!s) return "";
  // Already DD/MM/YYYY? passthrough (validate loosely).
  const uk = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (uk) return `${uk[1]}/${uk[2]}/${uk[3]}`;
  // ISO YYYY-MM-DD (optionally with time)?
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  return s;
}

// P3 — Reserve space for a block that must NOT split across pages
// (signature block, table header + first row, section heading + first
// paragraph). If the block won't fit, adds a new page (via caller-provided
// `redrawHeader` so brand/margins stay consistent) and returns the new y.
// Returns the y-position the caller should render the block at.
export function keepTogether(doc, y, blockHeight, { pageHeight, headerHeight = 110, footerReserve = 70, redrawHeader }) {
  const bottom = (pageHeight || doc.internal.pageSize.getHeight()) - footerReserve;
  if (y + blockHeight <= bottom) return y;
  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight(), "F");
  if (typeof redrawHeader === "function") redrawHeader(doc);
  return headerHeight;
}

// P3 — 2×2 photo grid annex (configurable via `cols`/`rows`). Never splits
// a photo, always renders a header on every annex page, always draws a
// caption strip under each thumbnail. Replaces the older 1-per-page annex
// for callers that opt in. Existing `appendPhotographicEvidence` remains
// for backwards compatibility (deprecated internally — see below).
export function drawPhotoGrid(doc, photos, {
  pageWidth, pageHeight, margin = 48, cols = 2, rows = 2,
  user, company, today, ref, userName, title = "Photographic Evidence",
} = {}) {
  if (!Array.isArray(photos) || photos.length === 0) return;
  const usable = pageWidth - margin * 2;
  const gapX = 12, gapY = 18;
  const cellW = (usable - gapX * (cols - 1)) / cols;
  const captionH = 32;   // 2 short lines of text under the thumbnail
  const noteMaxLines = 2;
  const noteH = noteMaxLines * 11 + 4;
  const imgH = cellW * 0.66;   // 3:2 aspect ratio — clean and consistent
  const cellH = imgH + captionH + noteH;
  const perPage = cols * rows;

  const newAnnexPage = (label) => {
    doc.addPage();
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, "F");
    drawHeader(doc, pageWidth, margin, user, company, today, label);
  };

  newAnnexPage(title);
  let y = 150;
  let placed = 0;

  photos.forEach((p, idx) => {
    // New page when the current grid page is full.
    if (placed > 0 && placed % perPage === 0) {
      newAnnexPage(`${title} (continued)`);
      y = 150;
    }
    const posInPage = placed % perPage;
    const col = posInPage % cols;
    const row = Math.floor(posInPage / cols);
    const x = margin + col * (cellW + gapX);
    const yy = y + row * (cellH + gapY);

    // Thumbnail
    try {
      const format = (p.dataUrl && p.dataUrl.startsWith("data:image/png")) ? "PNG" : "JPEG";
      doc.addImage(p.dataUrl, format, x, yy, cellW, imgH, undefined, "FAST");
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.error("drawPhotoGrid: image failed", e);
    }
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.4);
    doc.rect(x, yy, cellW, imgH);

    // Caption header
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(15, 15, 15);
    doc.text(`Photo ${idx + 1} of ${photos.length}`, x, yy + imgH + 12);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(110, 110, 110);
    const stamp = [p.ukDate, p.time, p.location || "Location not available"].filter(Boolean).join("  ·  ");
    const stampLines = doc.splitTextToSize(stamp, cellW);
    stampLines.slice(0, 2).forEach((l, k) => doc.text(l, x, yy + imgH + 24 + k * 10));

    // Note (2-line clamp)
    if ((p.note || "").trim()) {
      doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(70, 70, 70);
      const noteLines = doc.splitTextToSize(String(p.note).trim(), cellW).slice(0, noteMaxLines);
      noteLines.forEach((l, k) => doc.text(l, x, yy + imgH + captionH + 4 + k * 11));
    }

    placed += 1;
  });

  // Footer on annex pages will be added by `finalizeFooters` when the
  // caller finalises the document.
}


export function downloadPdf({ title, content, user, photo, photoCaption, photos, clientSignature, refNumber }) {
  const d = generatePdf({ title, content, user, photo, photoCaption, photos, clientSignature, refNumber });
  const safe = (title || "morris-document").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  d.save(`${safe}.pdf`);
}

export function pdfBlobUrl({ title, content, user, photo, photoCaption, photos, clientSignature, refNumber }) {
  const d = generatePdf({ title, content, user, photo, photoCaption, photos, clientSignature, refNumber });
  return d.output("bloburl");
}
