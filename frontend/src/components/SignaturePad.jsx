import { useEffect, useRef, useState } from "react";
import { Eraser, PenTool, ChevronDown, Save as SaveIcon, Trash2, Check } from "lucide-react";
import api from "../lib/api";
import { normalizeSignature } from "../lib/signature-utils";

// Signature pad with vault (save + reuse) and PDF-fidelity dark ink.
// Renders the signature the same dark colour on-screen as it will appear on
// the printed A4 PDF — no more "invisible on paper" surprise.
export default function SignaturePad({ value, onChange, height = 180, allowVault = true }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });
  // PWQ-SIGNATURE-01 (Sep 2026) — cancel-token for async image loaders.
  // The mount effect and applySaved both attach `img.onload` handlers
  // that draw the value onto the canvas asynchronously. If the user
  // clicks Clear before those handlers resolve (or after them, when
  // React batches value=""), the image would repaint onto the canvas
  // *after* clear() ran, leaving visible strokes even though state was
  // cleared. This ref is flipped to true on clear() and checked inside
  // every img.onload — any stale handler bails silently.
  const clearedRef = useRef(false);
  const [hasInk, setHasInk] = useState(!!value);
  const [vault, setVault] = useState([]);
  const [showVault, setShowVault] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [saving, setSaving] = useState(false);

  // Load canvas + optional pre-existing signature
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    canvas.width = w * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#000000"; // Pure black ink. normalizeSignature() darkens RGB to #000 and gamma-boosts alpha on export, so antialiased edges are preserved AND print solid.
    ctx.clearRect(0, 0, w, height);
    if (value) {
      const img = new Image();
      img.onload = () => {
        // PWQ-SIGNATURE-01 — bail if the user clicked Clear while this
        // async load was in-flight, otherwise we would repaint the
        // signature onto a canvas the user has already visually wiped.
        if (clearedRef.current) return;
        // Contain-fit: preserve the signature's original aspect ratio and
        // never upscale it. This stops trimmed tight-bbox signatures from
        // being stretched across the whole pad.
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        const scale = Math.min(w / iw, height / ih, 1);
        const rw = iw * scale;
        const rh = ih * scale;
        const dx = (w - rw) / 2;
        const dy = (height - rh) / 2;
        ctx.drawImage(img, dx, dy, rw, rh);
        setHasInk(true);
      };
      img.src = value;
    }
  }, []);

  // Load vault
  useEffect(() => {
    if (!allowVault) return;
    (async () => {
      try { const r = await api.get("/signatures/vault"); setVault(r.data || []); } catch { /* silent */ }
    })();
  }, [allowVault]);

  const pointerPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const t = e.touches?.[0] || e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };
  const start = (e) => {
    e.preventDefault();
    // PWQ-SIGNATURE-01 — a fresh stroke means the user is drawing again,
    // so re-arm any async image loaders (Use Saved / value-restore) that
    // may fire after this.
    clearedRef.current = false;
    drawingRef.current = true;
    lastRef.current = pointerPos(e);
  };
  const move = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = pointerPos(e);
    ctx.beginPath(); ctx.moveTo(lastRef.current.x, lastRef.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    lastRef.current = p;
    setHasInk(true);
  };
  const end = async () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const rawUrl = canvasRef.current.toDataURL("image/png");
    // normalizeSignature darkens RGB to #000000 and gamma-boosts alpha
    // (preserving antialiased edges — no binary threshold, no stroke
    // thickening) and trims to the ink bounding box.
    const normalized = await normalizeSignature(rawUrl);
    onChange?.(normalized || rawUrl);
  };
  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    // PWQ-SIGNATURE-01 (Sep 2026, hardened after partial-clear regression):
    //
    // Root cause of the residual-ink bug on Preview:
    // A plain `ctx.clearRect(0, 0, canvas.width, canvas.height)` (even with
    // `setTransform(1,0,0,1,0,0)` first) only zeros the current pixel data
    // in the 2D canvas backing store. It leaves the canvas element, the
    // GPU composited layer, the current context transform stack, and any
    // in-flight async image loader all untouched. On some browsers /
    // devices (Chromium's WebKit accelerated compositor in particular,
    // when the canvas is inside a scrolling flex container), the
    // compositor can hold a stale texture of the pre-clear frame for a
    // paint tick, or a still-decoding `<img>` (from applySaved / the
    // mount effect) can drawImage back onto the canvas after clearRect
    // ran, or a lingering ctx.scale from StrictMode's double-invoke
    // leaves the clearRect covering only 1/dpr² of the physical buffer.
    // Any of these results in the reported "some strokes remain visible"
    // behaviour after a single Clear click.
    //
    // The only genuinely atomic canvas clear is to reassign
    // `canvas.width` (or `canvas.height`). Per the HTML spec, setting
    // canvas.width / .height DEALLOCATES the underlying pixel buffer and
    // allocates a fresh one, zero-initialised, AND resets EVERY 2D
    // context state (transform, strokeStyle, lineWidth, lineCap,
    // lineJoin, fillStyle, filter, clip region, etc.). It also
    // invalidates any compositor texture bound to that canvas element,
    // forcing the browser to re-paint from the fresh (blank) buffer.
    //
    // We then re-apply the same DPR + stroke setup as the mount effect
    // so the next stroke lands at the correct coordinate with the
    // correct thickness and colour.
    clearedRef.current = true;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    // Nuclear clear — reassigning triggers full pixel buffer reallocation.
    // (Setting to the same value is NOT a no-op: the spec mandates a
    // buffer reset regardless.)
    canvas.width = cssW * dpr;
    canvas.height = height * dpr;
    // Re-apply mount-effect setup so subsequent strokes render correctly.
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#000000";
    setHasInk(false);
    onChange?.("");
  };

  const applySaved = (sig) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const w = canvas.clientWidth;
    // PWQ-SIGNATURE-01 — applying a saved signature is an explicit user
    // action that should re-arm the pad, so any pending clear bails.
    clearedRef.current = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const img = new Image();
    img.onload = async () => {
      // Bail if the user clicked Clear while this async load was pending.
      if (clearedRef.current) return;
      // Contain-fit: preserve the saved signature's aspect ratio and never
      // upscale beyond its natural size. Prevents visible stretching in the
      // pad when the saved image is a trimmed tight-bbox PNG.
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      const scale = Math.min(w / iw, height / ih, 1);
      const rw = iw * scale;
      const rh = ih * scale;
      const dx = (w - rw) / 2;
      const dy = (height - rh) / 2;
      ctx.drawImage(img, dx, dy, rw, rh);
      setHasInk(true);
      const rawUrl = canvasRef.current.toDataURL("image/png");
      const normalized = await normalizeSignature(rawUrl);
      onChange?.(normalized || rawUrl);
    };
    img.src = sig.dataUrl;
    setShowVault(false);
  };
  const saveCurrent = async () => {
    if (!hasInk) return;
    setSaving(true);
    try {
      const rawUrl = canvasRef.current.toDataURL("image/png");
      // Store the normalized (darkened + gamma-boosted + trimmed) version
      // so every future re-use of the vault entry prints solid black,
      // keeps its natural stroke thickness, and sits on the baseline.
      const normalized = (await normalizeSignature(rawUrl)) || rawUrl;
      const r = await api.post("/signatures/vault", { label: saveLabel.trim() || "My signature", dataUrl: normalized });
      setVault([r.data, ...vault]);
      setSaveLabel("");
      onChange?.(normalized);
    } catch { /* silent */ } finally { setSaving(false); }
  };
  const deleteSaved = async (id) => {
    if (!window.confirm("Delete this saved signature?")) return;
    try { await api.delete(`/signatures/vault/${id}`); setVault(vault.filter(v => v.id !== id)); } catch { /* silent */ }
  };

  return (
    <div data-testid="signature-pad">
      {allowVault && vault.length > 0 && (
        <div className="mb-2">
          <button type="button" onClick={() => setShowVault(v => !v)} className="text-xs inline-flex items-center gap-1 text-[#E8A020] hover:text-[#f0b040]" data-testid="signature-vault-toggle">
            Use saved signature ({vault.length}) <ChevronDown size={12} />
          </button>
          {showVault && (
            <div className="mt-2 space-y-1" data-testid="signature-vault-list">
              {vault.map(s => (
                <div key={s.id} className="card-dark p-2 flex items-center gap-2" data-testid={`signature-vault-row-${s.id}`}>
                  <img src={s.dataUrl} alt={s.label} className="h-10 w-24 object-contain rounded bg-white" />
                  <span className="text-xs text-[#F0EDE8] flex-1 truncate">{s.label}</span>
                  <button type="button" onClick={() => applySaved(s)} className="text-xs px-2 py-1 rounded bg-[#E8A020] text-black inline-flex items-center gap-1" data-testid={`signature-vault-apply-${s.id}`}><Check size={10} /> Use</button>
                  <button type="button" onClick={() => deleteSaved(s.id)} className="text-xs text-[#A19D94] hover:text-[#F27C7C]" data-testid={`signature-vault-del-${s.id}`}><Trash2 size={10} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="rounded border bg-white" style={{ borderColor: "rgba(232,160,32,0.3)" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height, touchAction: "none", cursor: "crosshair", background: "white" }}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
          data-testid="signature-canvas"
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-[#706D66] flex items-center gap-2">
          <PenTool size={12} className="text-[#E8A020]" />
          {hasInk ? "Signature drawn — will print exactly as shown" : "Draw with finger, stylus or mouse"}
        </div>
        <button type="button" onClick={clear} className="text-xs flex items-center gap-1 text-[#706D66] hover:text-[#E5635A]" data-testid="signature-clear"><Eraser size={12} /> Clear</button>
      </div>
      {allowVault && hasInk && (
        <div className="mt-2 flex items-center gap-2" data-testid="signature-save-row">
          <input value={saveLabel} onChange={(e) => setSaveLabel(e.target.value)} placeholder="Label (e.g. Site Manager)" className="flex-1 bg-[#0f0d09] border border-[#2a2620] rounded px-2 py-1 text-xs text-[#F0EDE8]" data-testid="signature-save-label" />
          <button type="button" onClick={saveCurrent} disabled={saving} className="text-xs px-3 py-1.5 rounded border border-[#2a2620] text-[#F0EDE8] hover:border-[#E8A020] inline-flex items-center gap-1 disabled:opacity-40" data-testid="signature-save-btn"><SaveIcon size={12} /> {saving ? "Saving…" : "Save to vault"}</button>
        </div>
      )}
    </div>
  );
}
