import { useEffect, useRef, useState } from "react";
import { Eraser, Save as SaveIcon, PenTool } from "lucide-react";

// Lightweight signature pad — draws to a canvas, exports a PNG data URL.
// Designed to feel like signing on the phone with a finger or stylus.
export default function SignaturePad({ value, onChange, height = 180 }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });
  const [hasInk, setHasInk] = useState(!!value);

  // Load existing signature image into the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    // Resize for device pixel ratio
    const w = canvas.clientWidth;
    canvas.width = w * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#F0EDE8";
    // Transparent background
    ctx.clearRect(0, 0, w, height);
    if (value) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, w, height); setHasInk(true); };
      img.src = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pointerPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const t = e.touches?.[0] || e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    lastRef.current = pointerPos(e);
  };
  const move = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
    setHasInk(true);
  };
  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
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

  return (
    <div data-testid="signature-pad">
      <div
        className="rounded border bg-[#0a0a0a]"
        style={{ borderColor: "rgba(232,160,32,0.3)" }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height, touchAction: "none", cursor: "crosshair" }}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
          data-testid="signature-canvas"
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="text-xs text-[#706D66] flex items-center gap-2">
          <PenTool size={12} className="text-[#E8A020]" />
          {hasInk ? "Signature saved with your profile" : "Sign with your finger / stylus / mouse"}
        </div>
        <button
          type="button"
          onClick={clear}
          className="text-xs flex items-center gap-1 text-[#706D66] hover:text-[#E5635A] transition"
          data-testid="signature-clear"
        >
          <Eraser size={12} /> Clear
        </button>
      </div>
    </div>
  );
}
