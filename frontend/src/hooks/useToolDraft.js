import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { draftIdFromQuery, clearDraftQueryParam, fetchDraft } from "../lib/drafts";

// Boilerplate-killer for dedicated tool pages. Reads ?draft=<id> off the URL
// once on mount, fetches the draft, hands `data` to the page's bespoke
// `restoreFromData` callback, and clears the query param so refreshes don't
// re-hydrate. Pairs with the shared <DraftSaveButton /> which does the saving.
//
// Usage:
//   useToolDraft(TOOL_ID, (data) => {
//     // your tool-specific setters here
//     if (data.foo !== undefined) setFoo(data.foo);
//     ...
//   });
export default function useToolDraft(toolId, restoreFromData) {
  const restoredFor = useRef(null);
  useEffect(() => {
    const id = draftIdFromQuery();
    if (!id || restoredFor.current === id) return;
    restoredFor.current = id;
    (async () => {
      try {
        const d = await fetchDraft(id);
        if (!d || d.toolId !== toolId) return;
        restoreFromData(d.data || {});
        toast.success("Draft restored");
      } catch (e) {
        if (process.env.NODE_ENV !== "production") console.error("Draft restore failed", e);
      } finally {
        clearDraftQueryParam();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
