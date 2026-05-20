import { useEffect, useRef, useState } from "react";

/**
 * Cinematic intro — full-screen black overlay sitting on top of the landing page.
 * Total timeline:
 *   0.0s  : black screen visible
 *   0.2s  : small "MORRIS CONSTRUCTION TECH" subhead fades up
 *   0.5s  : main slogan fades up (dim #3A2800)
 *   1.0s  : gold sweep beam crosses the slogan over 2s
 *   2.8s  : thin gold rule expands from centre (0 → 200px over 0.8s)
 *   3.2s  : "MORRIS" footer mark fades in
 *   4.5s  : intro begins fading out over 1.5s + landing fades in over the same 1.5s
 *   6.0s  : intro removed from DOM, scroll unlocked
 */
export default function CinematicIntro({ onDone }) {
  const [fadingOut, setFadingOut] = useState(false);
  const [removed, setRemoved] = useState(false);
  const onDoneRef = useRef(onDone);
  // keep latest onDone in ref without retriggering the timeline effect
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    // lock scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const t1 = setTimeout(() => setFadingOut(true), 4500);
    const t2 = setTimeout(() => {
      document.body.style.overflow = prevOverflow || "";
      setRemoved(true);
      if (onDoneRef.current) onDoneRef.current();
    }, 6000);

    return () => {
      clearTimeout(t1); clearTimeout(t2);
      document.body.style.overflow = prevOverflow || "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (removed) return null;

  return (
    <div
      data-testid="cinematic-intro"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999,
        background: "#000000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: fadingOut ? 0 : 1,
        transition: "opacity 1.5s ease",
        pointerEvents: fadingOut ? "none" : "auto",
        padding: "16px",
      }}
    >
      <style>{`
        @keyframes morris-fade-up {
          0%   { opacity: 0; transform: translateY(8px); }
          100% { opacity: var(--target-opacity, 1); transform: translateY(0); }
        }
        @keyframes morris-rule-grow {
          0%   { width: 0; opacity: 0; }
          100% { width: 200px; opacity: 1; }
        }
        @keyframes morris-sweep {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        .morris-intro-subhead {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 10px;
          letter-spacing: 5px;
          color: #E8A020;
          opacity: 0;
          animation: morris-fade-up 0.8s ease-out 0.2s forwards;
          --target-opacity: 0.25;
        }
        .morris-intro-slogan-wrap {
          position: relative;
          margin-top: 18px;
          opacity: 0;
          animation: morris-fade-up 0.8s ease-out 0.5s forwards;
          --target-opacity: 1;
          line-height: 1.05;
        }
        .morris-intro-slogan-base {
          font-family: 'Bebas Neue', sans-serif;
          font-weight: 700;
          font-size: clamp(32px, 7vw, 88px);
          letter-spacing: 6px;
          color: #3A2800;
          white-space: nowrap;
          display: inline-block;
        }
        .morris-intro-slogan-sweep {
          position: absolute; inset: 0;
          font-family: 'Bebas Neue', sans-serif;
          font-weight: 700;
          font-size: clamp(32px, 7vw, 88px);
          letter-spacing: 6px;
          white-space: nowrap;
          color: transparent;
          background-image: linear-gradient(90deg,
            transparent 0%,
            rgba(244,200,80,0.0) 30%,
            #F4C850 45%,
            #FFD700 50%,
            #E8A020 55%,
            rgba(244,200,80,0.0) 70%,
            transparent 100%);
          background-size: 200% 100%;
          background-position: -200% 0;
          background-repeat: no-repeat;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: morris-sweep 2s cubic-bezier(0.65, 0, 0.35, 1) 1s forwards;
          pointer-events: none;
        }
        .morris-intro-slogan-glow {
          position: absolute; inset: 0;
          font-family: 'Bebas Neue', sans-serif;
          font-weight: 700;
          font-size: clamp(32px, 7vw, 88px);
          letter-spacing: 6px;
          white-space: nowrap;
          color: transparent;
          background-image: linear-gradient(90deg,
            transparent 0%,
            rgba(244,200,80,0.0) 30%,
            #F4C850 45%,
            #FFD700 50%,
            #E8A020 55%,
            rgba(244,200,80,0.0) 70%,
            transparent 100%);
          background-size: 200% 100%;
          background-position: -200% 0;
          background-repeat: no-repeat;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: blur(8px);
          animation: morris-sweep 2s cubic-bezier(0.65, 0, 0.35, 1) 1s forwards;
          pointer-events: none;
        }
        .morris-intro-rule {
          margin-top: 28px;
          height: 1px;
          width: 0;
          background: #E8A020;
          box-shadow: 0 0 14px rgba(232,160,32,0.7), 0 0 28px rgba(232,160,32,0.35);
          animation: morris-rule-grow 0.8s ease-out 2.8s forwards;
        }
        .morris-intro-mark {
          margin-top: 16px;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 11px;
          letter-spacing: 6px;
          color: #E8A020;
          opacity: 0;
          animation: morris-fade-up 0.8s ease-out 3.2s forwards;
          --target-opacity: 0.30;
        }
      `}</style>

      <div className="morris-intro-subhead">MORRIS CONSTRUCTION TECH</div>

      <div className="morris-intro-slogan-wrap">
        <span className="morris-intro-slogan-glow" aria-hidden="true">BUILT BY A TRADESMAN. FOR TRADESMEN.</span>
        <span className="morris-intro-slogan-base">BUILT BY A TRADESMAN. FOR TRADESMEN.</span>
        <span className="morris-intro-slogan-sweep" aria-hidden="true">BUILT BY A TRADESMAN. FOR TRADESMEN.</span>
      </div>

      <div className="morris-intro-rule" />
      <div className="morris-intro-mark">MORRIS</div>
    </div>
  );
}
