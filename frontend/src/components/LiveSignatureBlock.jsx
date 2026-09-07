import { useState, useEffect } from "react";
import { CheckCircle2, RefreshCw, PenTool } from "lucide-react";
import { toast } from "sonner";
import SignaturePad from "./SignaturePad";

// A single live signature pad used on every tool form. Accepts an optional
// `savedSignature` so the user can populate the pad with the signature they
// drew once on their profile.
//
// Props:
//   label           — heading above the pad (e.g. "Your Signature")
//   subtitle        — explanatory copy under the heading (optional)
//   value           — current data URL or ""
//   onChange        — receives the new data URL
//   savedSignature  — base64 data URL of the user's profile signature (optional)
//   allowBlank      — when true, no inline warning if left empty (for the client pad)
//   testIdPrefix    — base for data-testids (default "live-sig")
export default function LiveSignatureBlock({
  label = "Your Signature",
  subtitle,
  value,
  onChange,
  savedSignature,
  allowBlank = false,
  testIdPrefix = "live-sig",
}) {
  const [resetKey, setResetKey] = useState(0);
  const [hasInk, setHasInk] = useState(!!value);

  useEffect(() => { setHasInk(!!value); }, [value]);

  const useSaved = () => {
    if (!savedSignature) {
      toast.message("No saved signature yet. Add one in Profile → Sign-off settings.");
      return;
    }
    onChange?.(savedSignature);
    setResetKey((k) => k + 1);
    setHasInk(true);
    toast.success("Saved signature applied. You can draw over it or keep it as-is.");
  };

  const clear = () => {
    onChange?.("");
    setResetKey((k) => k + 1);
    setHasInk(false);
  };

  return (
    <div className="card-dark p-4 md:p-5" data-testid={`${testIdPrefix}-block`}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#E8A020] flex items-center gap-2">
            <PenTool size={11} /> {label}
            {hasInk && <CheckCircle2 size={11} className="text-[#5BC97A]" data-testid={`${testIdPrefix}-ink-ok`} />}
          </div>
          {subtitle && <div className="text-[11px] text-[#706D66] mt-1">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-2">
          {savedSignature && !allowBlank && (
            <button
              type="button"
              onClick={useSaved}
              className="btn-secondary text-[11px] uppercase tracking-widest px-3 py-1.5 flex items-center gap-1.5"
              data-testid={`${testIdPrefix}-use-saved`}
              title="Apply the signature saved on your profile"
            >
              <RefreshCw size={11} /> Use Saved Signature
            </button>
          )}
        </div>
      </div>
      <SignaturePad key={resetKey} value={value || ""} onChange={(v) => { onChange?.(v); setHasInk(!!v); }} height={140} />
      {!hasInk && !allowBlank && (
        <div className="mt-2 text-[10px] text-[#706D66] italic">
          Sign with your finger or stylus. You can also tap "Use Saved Signature" to apply the one on your profile.
        </div>
      )}
      {!hasInk && allowBlank && (
        <div className="mt-2 text-[10px] text-[#706D66] italic">
          Leave blank to let the client / recipient sign physically once the PDF is printed.
        </div>
      )}
    </div>
  );
}
