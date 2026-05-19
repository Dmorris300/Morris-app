import { useEffect, useState } from "react";

const KEY = "morris_cookie_consent";

export default function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem(KEY)) setShow(true);
  }, []);

  const choose = (v) => {
    localStorage.setItem(KEY, v);
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-50"
      style={{
        background: "#0D0D0D",
        borderTop: "1px solid rgba(232,160,32,0.4)",
        boxShadow: "0 -8px 24px rgba(0,0,0,0.5)",
      }}
      data-testid="cookie-banner"
    >
      <div className="max-w-7xl mx-auto px-5 py-4 flex flex-col md:flex-row items-start md:items-center gap-3">
        <p className="text-sm text-[#F0EDE8] flex-1 leading-relaxed">
          Morris uses essential cookies to keep you logged in and remember your preferences. By continuing to use Morris you accept our use of cookies.
        </p>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => choose("declined")} className="btn-secondary text-xs" data-testid="cookie-decline">Decline</button>
          <button onClick={() => choose("accepted")} className="btn-primary text-xs" data-testid="cookie-accept">Accept</button>
        </div>
      </div>
    </div>
  );
}
