import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// Plain password input with a show/hide eye toggle on the right.
// Matches `input-base` styling but adds right padding so the icon doesn't
// overlap the text. Subtle grey icon, turns gold on hover and when active.
export default function PasswordInput({
  value,
  onChange,
  placeholder = "",
  testId,
  required = false,
  minLength,
  autoComplete = "current-password",
  className = "",
}) {
  const [shown, setShown] = useState(false);
  const Icon = shown ? EyeOff : Eye;

  return (
    <div className="relative">
      <input
        type={shown ? "text" : "password"}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className={`input-base pr-11 ${className}`}
        data-testid={testId}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? "Hide password" : "Show password"}
        title={shown ? "Hide password" : "Show password"}
        className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${
          shown ? "text-[#E8A020]" : "text-[#A19D94] hover:text-[#E8A020]"
        }`}
        data-testid={testId ? `${testId}-toggle` : undefined}
      >
        <Icon size={16} strokeWidth={1.75} />
      </button>
    </div>
  );
}
