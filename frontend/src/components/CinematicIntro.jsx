import { useEffect, useRef, useState } from "react";

/**
 * Cinematic intro — full black screen, two lines of Bebas Neue gold text appear
 * left-to-right with a metallic gold shimmer sweep. Holds on screen, then calls onDone()
 * which removes it so the landing page underneath becomes visible.
 *
 * Total runtime: ~5.4 seconds (line 1 sweep 2s, 600ms gap, line 2 sweep 2s, 1.4s hold).
 */
export default function CinematicIntro({ onDone }) {
  const [stage, setStage] = useState(0);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const t1 = setTimeout(() => setStage(1), 80);      // start line 1 sweep
    const t2 = setTimeout(() => setStage(2), 2200);    // line 2 begins
    const t3 = setTimeout(() => {
      document.body.style.overflow = prevOverflow || "";
      if (onDoneRef.current) onDoneRef.current();
    }, 5400);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      document.body.style.overflow = prevOverflow || "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center"
      data-testid="cinematic-intro"
      style={{ background: "#000000" }}
    >
      <style>{`
        @keyframes morris-sweep-reveal {
          0%   { clip-path: inset(0 100% 0 0); }
          100% { clip-path: inset(0 0 0 0); }
        }
        @keyframes morris-beam {
          0%   { transform: translateX(-110%); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translateX(110%); opacity: 0; }
        }
        .morris-intro-line {
          font-family: 'Bebas Neue', sans-serif;
          background-image: linear-gradient(90deg,
            #8A6820 0%,
            #C9972B 20%,
            #F0C84A 40%,
            #FFF8DC 50%,
            #F0C84A 60%,
            #C9972B 80%,
            #8A6820 100%);
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
          background-size: 200% 100%;
          animation: morris-sweep-reveal 2s cubic-bezier(0.65, 0, 0.35, 1) forwards;
          position: relative;
          display: inline-block;
          line-height: 1.05;
        }
        .morris-intro-beam {
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          width: 60%;
          background: linear-gradient(90deg, transparent 0%, rgba(255,248,220,0.0) 30%, rgba(255,248,220,0.55) 50%, rgba(255,248,220,0.0) 70%, transparent 100%);
          mix-blend-mode: screen;
          animation: morris-beam 2s cubic-bezier(0.65, 0, 0.35, 1) forwards;
          pointer-events: none;
        }
      `}</style>

      <div className="w-full px-6 max-w-[90vw] text-center">
        {/* Line 1 — large */}
        <div className="relative inline-block">
          {stage >= 1 && (
            <>
              <span className="morris-intro-line block" style={{ fontSize: "clamp(36px, 6.5vw, 96px)", letterSpacing: "0.02em" }}>
                Built By A Tradesman, For Tradesmen
              </span>
              <span className="morris-intro-beam" />
            </>
          )}
        </div>

        {/* Line 2 — smaller, spaced */}
        <div className="relative inline-block mt-8 md:mt-10">
          {stage >= 2 && (
            <>
              <span className="morris-intro-line block" style={{ fontSize: "clamp(18px, 2.6vw, 36px)", letterSpacing: "0.34em" }}>
                The Paperwork Sorted. You Stay On The Tools.
              </span>
              <span className="morris-intro-beam" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
