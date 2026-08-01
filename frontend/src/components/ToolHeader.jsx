import { useState } from "react";
import { Info, Star, Save, Copy, Download, Mail, MessageCircle, MessageSquare, Loader2, HardHat, AlertTriangle } from "lucide-react";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { toast } from "sonner";
import { downloadPdf } from "../lib/pdf";
import { emojiFor, disclaimerFor, requiresReview } from "../lib/tools-config";
import { TradeSwitcher } from "./TradeSwitcher";

export default function ToolHeader({ tool, infoOpen, setInfoOpen, extraActions }) {
  const { user, refresh } = useAuth();
  const [tradeSwitchOpen, setTradeSwitchOpen] = useState(false);
  const isFav = (user?.favourites || []).includes(tool.id);

  const toggleFav = async () => {
    const current = user?.favourites || [];
    const next = isFav ? current.filter(x => x !== tool.id) : [...current, tool.id];
    try {
      await api.post("/profile/update", { favourites: next });
      await refresh();
      toast.success(isFav ? "Removed from favourites" : "Added to favourites");
    } catch { toast.error("Could not update favourites"); }
  };

  return (
    <div className="mb-6">
      <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
        <div>
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">{tool.section}</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight flex items-center gap-3">
            <span className="text-3xl md:text-4xl">{emojiFor(tool.id)}</span>
            <span>{tool.name}</span>
          </h1>
          <button
            onClick={() => setTradeSwitchOpen(true)}
            className="mt-3 inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border border-[#E8A020]/30 hover:border-[#E8A020]/60 hover:bg-[#E8A020]/5 transition-colors"
            data-testid="tool-trade-switch"
          >
            <HardHat size={12} className="text-[#E8A020]" />
            <span className="text-[#A19D94]">Personalised for</span>
            <span className="text-[#F0EDE8] font-semibold">{user?.trade || "Choose trade"}</span>
            <span className="text-[#E8A020] uppercase tracking-widest text-[10px]">Switch</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInfoOpen(!infoOpen)} className="btn-secondary flex items-center gap-2" data-testid="tool-info-btn">
            <Info size={16} /> Info
          </button>
          <button onClick={toggleFav} className={`btn-secondary flex items-center gap-2 ${isFav ? "text-[#E8A020] border-[#E8A020]/40" : ""}`} data-testid="tool-fav-btn">
            <Star size={16} fill={isFav ? "#E8A020" : "none"} /> Favourite
          </button>
          {extraActions}
        </div>
      </div>
      {infoOpen && (() => {
        const d = disclaimerFor(tool.id);
        const isRed = d.category === "hs";
        const isBlue = d.category === "tax";
        const borderColor = isRed ? "#E05050" : isBlue ? "#3B82F6" : "#E8A020";
        const labelColor = isRed ? "#E05050" : isBlue ? "#5B9BFF" : "#E8A020";
        const bg = isRed ? "rgba(224,80,80,0.08)" : "rgba(232,160,32,0.06)";
        return (
          <div className="card-dark p-4 text-sm text-[#A19D94] mb-4" data-testid="tool-info-panel">
            <div>{tool.info}</div>
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 6,
                border: `1px solid ${borderColor}`,
                background: bg,
              }}
              data-testid={`tool-disclaimer-${d.category}`}
            >
              <div style={{ fontSize: 10, letterSpacing: "0.18em", color: labelColor, fontWeight: 700, marginBottom: 6 }}>
                {d.icon} {d.label.toUpperCase()}
              </div>
              <div style={{ fontSize: 10, color: "#888888", lineHeight: 1.6 }}>{d.body}</div>
            </div>
          </div>
        );
      })()}
      <TradeSwitcher open={tradeSwitchOpen} onClose={() => setTradeSwitchOpen(false)} />
    </div>
  );
}

export function ResultActions({ title, content, toolId, photo, photoCaption, photos, photosLoader, liveSignature, clientSignature }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(null);
  // Prefer the live signature drawn on the tool form. Fallback to the user's
  // saved profile signature so downloads still work if the live pad is empty.
  const effectiveUser = { ...(user || {}), signature: liveSignature || user?.signature };
  // Review notice is shown as advisory only — it never blocks the user from
  // saving, copying, downloading or sending a generated document.
  const reviewMandatory = requiresReview(toolId);

  // Merge Photo-to-Document photos (already dataURLs) with lazy-loaded Vault
  // photos when the user hits Download. photosLoader is optional; when set,
  // its resolved array is appended to `photos` before jsPDF renders.
  const resolvePhotos = async () => {
    let list = photos ? [...photos] : [];
    if (typeof photosLoader === "function") {
      try {
        const extra = await photosLoader();
        if (Array.isArray(extra) && extra.length > 0) list = [...list, ...extra];
      } catch { /* fail-open — PDF still renders without evidence */ }
    }
    return list;
  };

  const onSave = async () => {
    setBusy("save");
    try {
      await api.post("/documents/save", { title, toolId, content });
      toast.success("Saved to your history");
    } catch { toast.error("Save failed"); } finally { setBusy(null); }
  };
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(content); toast.success("Copied"); } catch { toast.error("Copy failed"); }
  };
  const onPdf = async () => {
    setBusy("pdf");
    try {
      const resolved = await resolvePhotos();
      downloadPdf({ title, content, user: effectiveUser, photo, photoCaption, photos: resolved, clientSignature });
    } finally { setBusy(null); }
  };
  const onEmail = () => {
    const subject = encodeURIComponent(title || "Document from Morris");
    const body = encodeURIComponent(content);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };
  const onWhatsAppText = () => {
    const text = encodeURIComponent(`${title}\n\n${content}\n\n— Generated by Morris (morrisapp.co.uk)`);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };
  const onWhatsAppPdf = async () => {
    setBusy("pdf");
    try {
      const resolved = await resolvePhotos();
      downloadPdf({ title, content, user: effectiveUser, photo, photoCaption, photos: resolved, clientSignature });
      setTimeout(() => {
        const text = encodeURIComponent(`${title}. please find the PDF attached. (Generated by Morris)`);
        window.open(`https://wa.me/?text=${text}`, "_blank");
      }, 400);
    } finally { setBusy(null); }
  };
  const onSms = () => {
    const body = encodeURIComponent(`${title}\n\n${content}\n\nGenerated by Morris (morrisapp.co.uk)`);
    window.location.href = `sms:?body=${body}`;
  };

  return (
    <>
      {reviewMandatory && (
        <div
          className="mt-5 p-4 rounded flex items-start gap-3"
          style={{ border: "1px solid rgba(232,160,32,0.35)", background: "rgba(232,160,32,0.05)" }}
          data-testid="review-advisory-box"
        >
          <AlertTriangle size={16} className="text-[#E8A020] mt-0.5 flex-shrink-0" />
          <div className="text-xs text-[#A19D94]">
            <span className="text-[#F0EDE8] font-semibold">Quick review reminder.</span>{" "}
            This is a high-risk document. Give it a final read for accuracy before you send it.
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2 mt-5" data-testid="result-actions">
        <ActionBtn onClick={onSave} icon={<Save size={14} />} label="Save" busy={busy === "save"} testId="action-save" />
        <ActionBtn onClick={onCopy} icon={<Copy size={14} />} label="Copy" testId="action-copy" />
        <ActionBtn onClick={onPdf} icon={<Download size={14} />} label="Download PDF" testId="action-pdf" />
        <ActionBtn onClick={onEmail} icon={<Mail size={14} />} label="Email" testId="action-email" />
        <ActionBtn onClick={onWhatsAppText} icon={<MessageCircle size={14} />} label="WhatsApp text" testId="action-wa-text" />
        <ActionBtn onClick={onWhatsAppPdf} icon={<MessageCircle size={14} />} label="WhatsApp PDF" testId="action-wa-pdf" />
        <ActionBtn onClick={onSms} icon={<MessageSquare size={14} />} label="SMS" testId="action-sms" />
      </div>
      <div
        className="mt-4 p-3 rounded"
        style={{ border: "1px solid rgba(232,160,32,0.1)", background: "rgba(232,160,32,0.025)" }}
        data-testid="no-liability-footer"
      >
        <p style={{ fontSize: 10, color: "#666666", lineHeight: 1.5, margin: 0 }}>
          {!reviewMandatory && "Please review this document before sending to ensure all details are accurate and specific to your project. "}
          This tool is for guidance and estimation purposes only. It does not constitute legal, tax or financial advice. Always consult a qualified professional for advice specific to your circumstances. Morris Construction Tech Ltd accepts no liability for decisions made based on the outputs of this tool.
        </p>
      </div>
    </>
  );
}

function ActionBtn({ onClick, icon, label, busy, testId, disabled }) {
  return (
    <button onClick={onClick} className="btn-secondary text-xs flex items-center gap-2" disabled={busy || disabled} data-testid={testId}>
      {busy ? <Loader2 size={14} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}
