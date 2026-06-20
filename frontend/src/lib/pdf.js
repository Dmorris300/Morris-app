import { jsPDF } from "jspdf";

// ----- Morris brand mark (gold-on-black M) — drawn vectorially as a fallback
// when the user has not uploaded a company logo. Keeps the PDF clean and self
// contained (no external image fetches).
function drawMorrisMark(doc, x, y, size = 28) {
  // Rounded gold square
  doc.setFillColor(232, 160, 32);
  doc.roundedRect(x, y, size, size, 4, 4, "F");
  // Bold black M
  doc.setTextColor(10, 10, 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size * 0.7);
  doc.text("M", x + size / 2, y + size * 0.74, { align: "center" });
}

function extractRef(content) {
  // Pull the DOCUMENT REFERENCE: line out of the body if it exists.
  if (!content) return null;
  const m = content.match(/DOCUMENT REFERENCE:\s*([A-Z0-9\-]+)/i);
  return m ? m[1].trim() : null;
}

// Append the "Photographic Evidence" section to the PDF. Each photo gets its
// own block on a fresh page (or stacked 2-per-page when the page has room).
// `photos` is an array of: { dataUrl, note, ukDate, time, location }.
function appendPhotographicEvidence(doc, pageWidth, pageHeight, margin, photos, user, company, today, ref, userName) {
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

  const lines = doc.splitTextToSize(content || "", usable);
  let y = 150;
  const bottom = pageHeight - 70;
  const lineHeight = 14;

  const sigLineMatcher = /^Signature:\s/i;
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

    doc.text(line, margin, y);

    if (sigStampedY === null && user?.signature && sigLineMatcher.test(line)) {
      try {
        const sigW = 130;
        const sigH = 46;
        doc.addImage(user.signature, "PNG", margin + 60, y - 32, sigW, sigH, undefined, "FAST");
        sigStampedY = y;
      } catch (e) {
        if (process.env.NODE_ENV !== "production") console.error("PDF signature embed failed", e);
      }
    }

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

  // Footer attribution line (always — required by the global spec)
  doc.setTextColor(140, 140, 140);
  doc.text("Generated by Morris  ·  morrisapp.co.uk  ·  Morris Construction Tech Ltd  ·  ICO C1923529", 48, pageHeight - 26);
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
