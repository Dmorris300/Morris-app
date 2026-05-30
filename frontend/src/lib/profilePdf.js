import { jsPDF } from "jspdf";

// Renders a one-stop "Trade Profile" PDF the user can send to a main contractor.
// Includes all profile fields + CSCS card front/back + saved signature + a footer.
export function generateProfilePdf(user) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const usable = pageWidth - margin * 2;
  let y = 0;

  // ----- Header bar -----
  doc.setFillColor(6, 6, 6);
  doc.rect(0, 0, pageWidth, 70, "F");
  doc.setFillColor(232, 160, 32);
  doc.rect(0, 70, pageWidth, 3, "F");
  doc.setTextColor(232, 160, 32);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("MORRIS", margin, 42);
  doc.setTextColor(240, 237, 232);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("TRADE PROFILE", pageWidth - margin, 30, { align: "right" });
  doc.text(new Date().toLocaleDateString("en-GB"), pageWidth - margin, 44, { align: "right" });

  // ----- Title -----
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  y = 110;
  doc.text(user?.fullName || user?.username || "Trade Profile", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(110, 110, 110);
  y += 18;
  doc.text(`${user?.trade || "Trade not set"}${user?.companyName ? "  ·  " + user.companyName : ""}`, margin, y);

  y += 22;

  // ----- Section: Contact & Company -----
  y = section(doc, "CONTACT & COMPANY", margin, y);
  y = row(doc, "Full name", user?.fullName, margin, y, usable);
  y = row(doc, "Company name", user?.companyName, margin, y, usable);
  y = row(doc, "Trade", user?.trade, margin, y, usable);
  y = row(doc, "Role", user?.signatureRole, margin, y, usable);
  y = row(doc, "Contact number", user?.contactNumber || user?.phone, margin, y, usable);
  y = row(doc, "Email", user?.email, margin, y, usable);
  y = row(doc, "Address", user?.address, margin, y, usable);
  if (user?.vehicleReg) y = row(doc, "Vehicle reg", user.vehicleReg, margin, y, usable);

  y += 10;

  // ----- Section: CIS & Tax -----
  y = section(doc, "CIS & TAX", margin, y);
  y = row(doc, "UTR", user?.utr, margin, y, usable);
  y = row(doc, "CIS status", user?.cisStatus, margin, y, usable);
  y = row(doc, "VAT registered", user?.vatRegistered === true ? "Yes" : (user?.vatRegistered === false ? "No" : ""), margin, y, usable);
  if (user?.vatRegistered && user?.vatNumber) y = row(doc, "VAT number", user.vatNumber, margin, y, usable);

  y += 10;

  // ----- Section: Insurance & Compliance -----
  y = section(doc, "INSURANCE & COMPLIANCE", margin, y);
  y = row(doc, "Public liability expiry", user?.insuranceExpiry ? fmtDate(user.insuranceExpiry) : null, margin, y, usable);
  y = row(doc, "CSCS card expiry", user?.cscsExpiry ? fmtDate(user.cscsExpiry) : null, margin, y, usable);

  // ----- CSCS card photos -----
  if (user?.cscsCardFront || user?.cscsCardBack) {
    y += 16;
    y = section(doc, "CSCS CARD PHOTOS", margin, y);

    const cardW = (usable - 16) / 2;
    const cardH = cardW * 0.62; // CSCS aspect ≈ 86mm × 54mm

    if (y + cardH + 50 > pageHeight - 60) {
      addFooter(doc, pageWidth, pageHeight);
      doc.addPage();
      y = 70;
      y = section(doc, "CSCS CARD PHOTOS (CONTINUED)", margin, y);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.text("FRONT", margin, y);
    doc.text("BACK", margin + cardW + 16, y);
    y += 6;

    if (user?.cscsCardFront) {
      try { doc.addImage(user.cscsCardFront, "PNG", margin, y, cardW, cardH, undefined, "FAST"); }
      catch (e) { /* ignore */ }
      doc.setDrawColor(232, 160, 32);
      doc.setLineWidth(0.5);
      doc.rect(margin, y, cardW, cardH);
    } else {
      placeholder(doc, "Front photo not uploaded", margin, y, cardW, cardH);
    }
    if (user?.cscsCardBack) {
      try { doc.addImage(user.cscsCardBack, "PNG", margin + cardW + 16, y, cardW, cardH, undefined, "FAST"); }
      catch (e) { /* ignore */ }
      doc.setDrawColor(232, 160, 32);
      doc.setLineWidth(0.5);
      doc.rect(margin + cardW + 16, y, cardW, cardH);
    } else {
      placeholder(doc, "Back photo not uploaded", margin + cardW + 16, y, cardW, cardH);
    }
    y += cardH + 18;
  } else {
    y += 8;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(150, 100, 32);
    doc.text("Add your CSCS card photos in profile settings to include them in your shared profile.", margin, y);
    y += 18;
  }

  // ----- Signature -----
  y += 8;
  y = section(doc, "SIGNATURE", margin, y);
  if (user?.signature) {
    try {
      doc.addImage(user.signature, "PNG", margin, y, 180, 60, undefined, "FAST");
    } catch (e) { /* ignore */ }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.text(user?.fullName || "", margin + 200, y + 30);
    if (user?.signatureRole) doc.text(user.signatureRole, margin + 200, y + 44);
    y += 70;
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(150, 100, 32);
    doc.text("Add your signature in profile settings to include it on this shared profile.", margin, y);
    y += 18;
  }

  // ----- Footer message -----
  if (y > pageHeight - 130) {
    addFooter(doc, pageWidth, pageHeight);
    doc.addPage();
    y = 70;
  }
  y += 12;
  doc.setDrawColor(232, 160, 32);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  const lines = doc.splitTextToSize(
    "Send this to the main contractor before you step on site. Your credentials, insurance, and CIS status, all in one document.",
    usable
  );
  lines.forEach((l) => { doc.text(l, margin, y); y += 14; });

  addFooter(doc, pageWidth, pageHeight);
  return doc;
}

function section(doc, title, x, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(232, 160, 32);
  doc.text(title, x, y);
  doc.setDrawColor(232, 160, 32);
  doc.setLineWidth(0.5);
  doc.line(x, y + 4, x + 100, y + 4);
  return y + 18;
}

function row(doc, label, value, x, y, usable) {
  if (!value) return y;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  const wrap = doc.splitTextToSize(String(value), usable - 130);
  wrap.forEach((line, i) => doc.text(line, x + 130, y + (i * 12)));
  return y + Math.max(16, wrap.length * 12 + 4);
}

function placeholder(doc, label, x, y, w, h) {
  doc.setDrawColor(180, 180, 180);
  doc.setLineDashPattern([3, 3], 0);
  doc.rect(x, y, w, h);
  doc.setLineDashPattern([], 0);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(140, 140, 140);
  doc.text(label, x + 10, y + h / 2);
}

function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

function addFooter(doc, pageWidth, pageHeight) {
  doc.setDrawColor(232, 160, 32);
  doc.setLineWidth(0.5);
  doc.line(48, pageHeight - 46, pageWidth - 48, pageHeight - 46);
  doc.setTextColor(110, 110, 110);
  doc.setFontSize(8);
  doc.text("Trade profile shared via Morris  •  morrisapp.co.uk  •  Built by a tradesman. For tradesmen.", 48, pageHeight - 28);
  doc.text("Morris Construction Tech Ltd  •  ICO C1923529", pageWidth - 48, pageHeight - 28, { align: "right" });
}

export function downloadProfilePdf(user) {
  const doc = generateProfilePdf(user);
  const safe = (user?.fullName || user?.username || "trade-profile").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  doc.save(`${safe}-trade-profile.pdf`);
}
