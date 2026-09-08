// Shared signature normaliser used across every tool that draws or reuses
// a signature. It fixes two long-standing PDF-fidelity bugs:
//
//   1. Faded / grey signatures on printed PDFs. Browsers draw signatures
//      with sub-pixel antialiasing — every stroke has feathered edges with
//      alpha < 1.0. When the signature is drawn with a slightly-off-black
//      RGB (or gets blended against a light background) it prints faint
//      grey on paper. We darken every non-transparent pixel to RGB #000000
//      and mildly boost mid-range alpha values via a gamma curve so the
//      ink prints dark WITHOUT collapsing antialiased edges into a hard
//      binary mask (which would thicken strokes and lose their natural
//      geometry).
//
//   2. Signatures that float above the sign-off line. Saved/vault signature
//      data URLs are full-canvas snapshots that include a large transparent
//      margin around the actual ink. When embedded in a fixed-size PDF band,
//      the visible ink appears detached from the baseline. We trim the image
//      to the tight bounding box of the ink strokes so the signature sits
//      naturally above the line.
//
// Design goals (from Sep 2026 regression report):
//   • preserve original aspect ratio and stroke thickness — no upscaling,
//     no binary alpha threshold that fattens strokes,
//   • darken enough that ink prints solid on white PDF paper.
//
// The function is idempotent — normalising an already-normalised signature
// is safe and produces the same output. Returns "" if the input is falsy
// or contains no ink.

// Alpha boost curve: newAlpha = 255 * (alpha/255) ^ ALPHA_GAMMA. A value
// below 1 lifts mid-range alphas toward opaque while keeping fully
// transparent as 0. 0.35 pushes a 50%-opaque pixel to ~78%, a 20%-opaque
// pixel to ~54% — visible edges without hard-thresholding them to solid.
const ALPHA_GAMMA = 0.35;
// Bbox is computed from pixels whose alpha exceeds this threshold. Kept
// low (10) so faint edges still contribute to the extent, meaning the
// visible signature isn't clipped. This has no effect on stroke geometry
// — every visible pixel is kept, only the crop rectangle uses this cutoff.
const BBOX_ALPHA_THRESHOLD = 10;
const TRIM_PADDING_PX = 6;

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

        // Pass 1 — darken RGB to true black and gamma-boost alpha. Stroke
        // geometry (including antialiased edges) is preserved because we
        // don't drop or promote any pixel; we only recolour them.
        let minX = w, minY = h, maxX = -1, maxY = -1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const a = px[i + 3];
            if (a > 0) {
              px[i]     = 0;
              px[i + 1] = 0;
              px[i + 2] = 0;
              // Gamma-boost alpha so mid values darken but the curve stays smooth.
              const na = Math.round(255 * Math.pow(a / 255, ALPHA_GAMMA));
              px[i + 3] = na > 255 ? 255 : na;
              if (a > BBOX_ALPHA_THRESHOLD) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            }
          }
        }

        if (maxX < 0 || maxY < 0) { resolve(""); return; } // no ink

        sctx.putImageData(imgData, 0, 0);

        // Pass 2 — trim to the ink bounding box with a small padding so PDF
        // renderers can place the image tightly above the sign-off line.
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
