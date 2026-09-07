import { useEffect, useRef, useState } from "react";
import { Eraser, PenTool, ChevronDown, Save as SaveIcon, Trash2, Check } from "lucide-react";
import api from "../lib/api";

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
    ctx.strokeStyle = "#000000"; // Pure black ink — plus we hard-threshold the alpha channel at capture time so every rendered pixel is solid dark on PDF (item: no faded/washed-out signatures)
    ctx.clearRect(0, 0, w, height);
    if (value) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, w, height); setHasInk(true); };
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
  // Threshold the canvas so every visible pixel becomes solid black. This
  // eliminates the "faded/washed-out signature" issue: browsers draw with
  // sub-pixel antialiasing that leaves feathered edges with alpha < 1.0,
  // which then print faint on the A4 PDF. We keep the outline shape by
  // treating any pixel with alpha > 50 as solid #000, alpha 255.
  const hardenInk = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const img = ctx.getImageData(0, 0, w, h);
    const px = img.data;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] > 50) { px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 255; }
      else { px[i + 3] = 0; }
    }
    ctx.putImageData(img, 0, 0);
  };
  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    hardenInk();
    const dataUrl = canvasRef.current.toDataURL("image/png");
    onChange?.(dataUrl);
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.clientWidth, height);
      hardenInk();
      setHasInk(true);
      onChange?.(canvasRef.current.toDataURL("image/png"));
    };
    img.src = sig.dataUrl;
    setShowVault(false);
  };
  const saveCurrent = async () => {
    if (!hasInk) return;
    setSaving(true);
    try {
      hardenInk();
      const dataUrl = canvasRef.current.toDataURL("image/png");
      const r = await api.post("/signatures/vault", { label: saveLabel.trim() || "My signature", dataUrl });
      setVault([r.data, ...vault]);
      setSaveLabel("");
      onChange?.(dataUrl);
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
