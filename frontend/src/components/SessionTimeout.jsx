import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { Clock } from "lucide-react";

const TIMEOUT_MS = 60 * 60 * 1000; // 60 min
const WARNING_MS = 5 * 60 * 1000;  // warn at 55 min

export default function SessionTimeout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [warning, setWarning] = useState(false);
  const warnRef = useRef(null);
  const logoutRef = useRef(null);
  const lastActivityRef = useRef(Date.now());

  const reset = useCallback(() => {
    lastActivityRef.current = Date.now();
    setWarning(false);
    if (warnRef.current) clearTimeout(warnRef.current);
    if (logoutRef.current) clearTimeout(logoutRef.current);
    warnRef.current = setTimeout(() => setWarning(true), TIMEOUT_MS - WARNING_MS);
    logoutRef.current = setTimeout(() => {
      toast.message("You've been logged out due to inactivity.");
      logout();
      nav("/login", { replace: true });
    }, TIMEOUT_MS);
  }, [logout, nav]);

  useEffect(() => {
    if (!user) return;
    reset();
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    const handler = () => reset();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (warnRef.current) clearTimeout(warnRef.current);
      if (logoutRef.current) clearTimeout(logoutRef.current);
    };
  }, [user, reset]);

  if (!user || !warning) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" data-testid="session-warning-modal">
      <div className="absolute inset-0 bg-black/70" onClick={reset} />
      <div className="relative card-dark p-6 md:p-8 max-w-md w-full" style={{ borderColor: "rgba(232,160,32,0.35)" }}>
        <div className="flex items-center gap-3 mb-3 text-[#E8A020]">
          <Clock size={20} />
          <div className="font-display text-xl tracking-wide">Session timeout</div>
        </div>
        <p className="text-[#F0EDE8] mb-2">Your session will expire in 5 minutes due to inactivity.</p>
        <p className="text-sm text-[#A19D94] mb-5">Click anywhere to stay logged in.</p>
        <button onClick={reset} className="btn-primary w-full" data-testid="session-stay-btn">Stay logged in</button>
      </div>
    </div>
  );
}
