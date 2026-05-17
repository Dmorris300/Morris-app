export function MorrisLogo({ size = 56 }) {
  return (
    <div
      data-testid="morris-logo"
      className="relative inline-flex items-center justify-center font-display"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg,#F3C465 0%,#E8A020 100%)",
        color: "#060606",
        borderRadius: size * 0.18,
        boxShadow: "0 6px 24px rgba(232,160,32,0.25)",
      }}
    >
      <span style={{ fontSize: size * 0.62, lineHeight: 1, marginTop: size * 0.05 }}>M</span>
    </div>
  );
}

export function MorrisWordmark({ size = "text-4xl" }) {
  return (
    <span className={`font-display ${size} tracking-wide`} style={{ color: "#F0EDE8" }}>
      MORRIS
    </span>
  );
}
