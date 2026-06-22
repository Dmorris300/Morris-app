import { useEffect, useState } from "react";
import { Save, Check } from "lucide-react";
import { toast } from "sonner";
import { saveDraft, deriveDraftTitle, draftIdFromQuery, clearDraftQueryParam } from "../lib/drafts";

// Shared "Save Draft" button for every tool. Render next to the existing Info
// and Favourite buttons in the tool header. Validation is intentionally
// skipped — drafts may carry partial / blank data.
//
// Props:
//   tool             — { id, name } from tools-config
//   getDraftData     — () => object. Caller serialises whatever state shape
//                      its tool uses (values + result, formData, …).
//   onDraftSaved     — optional (savedDoc) => void after a successful save.
//
// The component remembers the most recent draftId so subsequent saves update
// the same draft rather than creating duplicates. The id is also seeded from
// the ?draft= query param so resuming a draft and saving again updates it.
export default function DraftSaveButton({ tool, getDraftData, onDraftSaved }) {
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [draftId, setDraftId] = useState(() => draftIdFromQuery());

  useEffect(() => {
    if (justSaved) {
      const t = setTimeout(() => setJustSaved(false), 1500);
      return () => clearTimeout(t);
    }
  }, [justSaved]);

  const onClick = async () => {
    setBusy(true);
    try {
      const data = (getDraftData && getDraftData()) || {};
      const title = deriveDraftTitle(tool.name, data);
      const saved = await saveDraft({
        toolId: tool.id,
        toolName: tool.name,
        title,
        data,
        draftId: draftId || undefined,
      });
      setDraftId(saved.id);
      clearDraftQueryParam();
      setJustSaved(true);
      toast.success("Draft saved");
      onDraftSaved?.(saved);
    } catch (err) {
      const detail = err?.response?.data?.detail || "Could not save draft";
      toast.error(typeof detail === "string" ? detail : "Could not save draft");
    } finally {
      setBusy(false);
    }
  };

  const Icon = justSaved ? Check : Save;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`btn-secondary flex items-center gap-2 ${justSaved ? "text-[#E8A020] border-[#E8A020]/40" : ""}`}
      title="Save your progress. Validation is skipped — pick this up later from the Drafts page."
      data-testid="tool-save-draft-btn"
    >
      <Icon size={16} />
      {busy ? "Saving…" : justSaved ? "Saved" : "Save Draft"}
    </button>
  );
}
