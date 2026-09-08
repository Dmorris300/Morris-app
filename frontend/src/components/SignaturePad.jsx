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
  const start = (e) => { e.preventDefault(); drawingRef.current = true; lastRef.current = pointerPos(e); };
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
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange?.("");
  };

  const applySaved = (sig) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const w = canvas.clientWidth;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const img = new Image();
    img.onload = async () => {
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
