import { jsPDF } from "jspdf";

export function generatePdf({ title, content, user, photo, photoCaption, clientSignature }) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  const usable = pageWidth - margin * 2;

  // Branded header bar
  doc.setFillColor(6, 6, 6);
  doc.rect(0, 0, pageWidth, 70, "F");
  // Gold accent strip
  doc.setFillColor(232, 160, 32);
  doc.rect(0, 70, pageWidth, 3, "F");

  // White-label: if the user has uploaded a company logo, stamp it in the
  // header (left side) in place of the MORRIS wordmark. Falls back to MORRIS
  // when no logo is on file (i.e. non-Enterprise tiers).
  if (user?.companyLogo) {
    try {
      doc.addImage(user.companyLogo, "PNG", margin, 12, 110, 46, undefined, "FAST");
    } catch (e) {
      // Fall back to the wordmark if the data URL is unusable
      doc.setTextColor(232, 160, 32);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text("MORRIS", margin, 42);
    }
  } else {
    // Brand mark "MORRIS"
    doc.setTextColor(232, 160, 32);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("MORRIS", margin, 42);
  }

  // Company / user line — when white-labelled, this is the user's company.
  // Otherwise it's still the user's company alongside the Morris wordmark.
  doc.setTextColor(240, 237, 232);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const company = user?.companyName || user?.fullName || user?.username || "";
  doc.text(company.toUpperCase(), pageWidth - margin, 30, { align: "right" });
  doc.text(`${new Date().toLocaleDateString("en-GB")}`, pageWidth - margin, 44, { align: "right" });

  // Title
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title || "Document", margin, 110);

  // Body
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(20, 20, 20);

  const lines = doc.splitTextToSize(content || "", usable);
  let y = 135;
  const pageHeight = doc.internal.pageSize.getHeight();
  const bottom = pageHeight - 60;
  const lineHeight = 14;

  // Detect the line that contains the contractor Signature field so we can
  // stamp the user's saved signature image directly below it.
  const sigLineMatcher = /^Signature:\s/i;
  // Detect the dual-signoff client signature placeholder produced by the
  // backend `_signoff_instructions` helper. The marker is rendered as an
  // actual sign-here box on the PDF.
  const clientSigMarker = /\[SIGN HERE\]/i;
  let sigStampedY = null;
  // Track if we need extra vertical space after this iteration (e.g. for the
  // client signature box we draw in place of the marker).
  let extraSkipAfter = 0;

  lines.forEach((line) => {
    if (y > bottom) {
      addFooter(doc, pageWidth, pageHeight, user);
      doc.addPage();
      y = 60;
    }

    // ----- Client signature placeholder: draw a labelled signature box -----
    if (sigLineMatcher.test(line) && clientSigMarker.test(line)) {
      // Print only the "Signature:" label — drop the placeholder text.
      doc.text("Signature:", margin, y);
      // Make sure the box fits on the page; push to a new page if not.
      const boxW = 240;
      const boxH = 70;
      if (y + boxH + 30 > bottom) {
        addFooter(doc, pageWidth, pageHeight, user);
        doc.addPage();
        y = 60;
        doc.text("Signature:", margin, y);
      }
      doc.setDrawColor(150, 150, 150);
      doc.setLineWidth(0.6);
      doc.rect(margin + 70, y - 12, boxW, boxH);
      // If the user drew a client signature on the tool form, stamp it inside the box.
      // Otherwise show the subtle "Sign inside this box" hint for the recipient.
      if (clientSignature) {
        try {
          doc.addImage(clientSignature, "PNG", margin + 70 + 4, y - 12 + 4, boxW - 8, boxH - 8, undefined, "FAST");
        } catch (e) {
          if (process.env.NODE_ENV !== "production") console.error("PDF client signature embed failed", e);
        }
      } else {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(170, 170, 170);
        doc.text("Sign inside this box", margin + 70 + boxW / 2, y - 12 + boxH / 2 + 3, { align: "center" });
      }
      // Restore the body font/colour for the rest of the document
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(20, 20, 20);
      // Skip ahead so the next line (the caption) is rendered below the box
      extraSkipAfter = boxH;
      y += lineHeight + extraSkipAfter;
      extraSkipAfter = 0;
      return;
    }

    doc.text(line, margin, y);

    // If this is the contractor "Signature:" line AND a signature image is on file,
    // stamp the signature 4pt below the text on the same row.
    if (sigStampedY === null && user?.signature && sigLineMatcher.test(line)) {
      try {
        const sigW = 130;
        const sigH = 46;
        // Place image slightly to the right of "Signature:" label
        doc.addImage(user.signature, "PNG", margin + 60, y - 32, sigW, sigH, undefined, "FAST");
        sigStampedY = y;
      } catch (e) {
        if (process.env.NODE_ENV !== "production") console.error("PDF signature embed failed", e);
      }
    }

    y += lineHeight;
  });

  // Embed the photo at the end of the body so it appears WITH the document.
  // Stays on the current page if there is room, otherwise pushes to a new page.
  if (photo) {
    const imgWidth = usable * 0.7;
    const imgHeight = imgWidth * 0.75; // approximate aspect; jsPDF will respect the data URL's aspect after add
    if (y + imgHeight + 40 > bottom) {
      addFooter(doc, pageWidth, pageHeight, user);
      doc.addPage();
      y = 80;
    } else {
      y += 20;
    }
    // Photo caption (date / time / description) — single styled line above the image
    if (photoCaption) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(110, 110, 110);
      const captionLines = doc.splitTextToSize(photoCaption, usable);
      captionLines.forEach((cl) => { doc.text(cl, margin, y); y += 11; });
      y += 6;
    }
    try {
      // jsPDF accepts data URLs directly. Inferring type from prefix.
      const format = (photo.startsWith("data:image/png") ? "PNG" : "JPEG");
      doc.addImage(photo, format, margin, y, imgWidth, imgHeight, undefined, "FAST");
      // Gold border around photo
      doc.setDrawColor(232, 160, 32);
      doc.setLineWidth(0.5);
      doc.rect(margin, y, imgWidth, imgHeight);
      y += imgHeight + 10;
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.error("PDF photo embed failed", e);
    }
  }

  addFooter(doc, pageWidth, pageHeight, user);

  return doc;
}

function addFooter(doc, pageWidth, pageHeight, user) {
  doc.setDrawColor(232, 160, 32);
  doc.setLineWidth(0.5);
  doc.line(48, pageHeight - 46, pageWidth - 48, pageHeight - 46);
  doc.setTextColor(110, 110, 110);
  doc.setFontSize(8);
  if (user?.companyLogo && user?.companyName) {
    // White-label footer — drop the Morris branding line entirely.
    doc.text(`${user.companyName}  •  Document prepared by ${user.fullName || user.username || ""}`, 48, pageHeight - 28);
  } else {
    doc.text("Generated by Morris  •  morrisapp.co.uk  •  Built by a tradesman. For tradesmen.", 48, pageHeight - 28);
    doc.text("Morris Construction Tech Ltd  •  ICO C1923529", pageWidth - 48, pageHeight - 28, { align: "right" });
  }
}

export function downloadPdf({ title, content, user, photo, photoCaption, clientSignature }) {
  const doc = generatePdf({ title, content, user, photo, photoCaption, clientSignature });
  const safe = (title || "morris-document").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  doc.save(`${safe}.pdf`);
}

export function pdfBlobUrl({ title, content, user, photo, photoCaption, clientSignature }) {
  const doc = generatePdf({ title, content, user, photo, photoCaption, clientSignature });
  return doc.output("bloburl");
}
