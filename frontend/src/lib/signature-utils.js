// Shared signature normaliser used across every tool that draws or reuses
// a signature. It fixes two long-standing PDF-fidelity bugs:
//
//   1. Faded / grey signatures on printed PDFs. Browsers draw signatures
//      with sub-pixel antialiasing — every stroke has feathered edges with
//      alpha < 1.0. jsPDF's addImage embeds those alpha values verbatim, so
//      on paper the ink looks light grey. We hard-threshold every non-empty
//      pixel to solid #000000, alpha 255, preserving only the outline shape.
//
//   2. Signatures that float above the sign-off line. Saved/vault signature
//      data URLs are full-canvas snapshots that include a large transparent
//      margin around the actual ink. When embedded in a fixed-size PDF band,
//      the visible ink appears detached from the baseline. We trim the image
//      to the tight bounding box of the ink strokes so the signature sits
//      naturally above the line.
//
// The function is idempotent — normalising an already-normalised signature
// is safe and produces the same output.
//
// Returns "" if the input is falsy or contains no ink.

const HARDEN_ALPHA_THRESHOLD = 40;
const TRIM_PADDING_PX = 6; // small breathing room around the ink bbox

export function normalizeSignature(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl || typeof dataUrl !== "string") { resolve(""); return; }

    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) { resolve(""); return; }

        const src = document.createElement("canvas");
        src.width = w;
        src.height = h;
        const sctx = src.getContext("2d");
        sctx.drawImage(img, 0, 0);
        const imgData = sctx.getImageData(0, 0, w, h);
        const px = imgData.data;

        // Pass 1 — harden ink. Alpha-threshold each pixel: keep the shape,
        // paint it solid black. This eliminates the "faded on paper" issue.
        let minX = w, minY = h, maxX = -1, maxY = -1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            if (px[i + 3] > HARDEN_ALPHA_THRESHOLD) {
              px[i]     = 0;
              px[i + 1] = 0;
              px[i + 2] = 0;
              px[i + 3] = 255;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            } else {
              // Force fully-transparent so PNG stays crisp on any background.
              px[i + 3] = 0;
            }
          }
        }

        if (maxX < 0 || maxY < 0) { resolve(""); return; } // no ink

        sctx.putImageData(imgData, 0, 0);

        // Pass 2 — trim to the ink bounding box with a small padding.
        const pad = TRIM_PADDING_PX;
        const bx = Math.max(0, minX - pad);
        const by = Math.max(0, minY - pad);
        const bw = Math.min(w, maxX + pad + 1) - bx;
        const bh = Math.min(h, maxY + pad + 1) - by;

        const out = document.createElement("canvas");
        out.width = bw;
        out.height = bh;
        const octx = out.getContext("2d");
        octx.drawImage(src, bx, by, bw, bh, 0, 0, bw, bh);

        resolve(out.toDataURL("image/png"));
      } catch (e) {
        // If anything blows up, don't corrupt the original — return it as-is.
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
