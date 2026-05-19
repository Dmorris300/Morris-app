export function MorrisLogo({ size = 56 }) {
  return (
    <img
      data-testid="morris-logo"
      src="/morris-logo.png"
      alt="Morris"
      style={{
        width: size,
        height: size,
        display: "inline-block",
        objectFit: "contain",
        borderRadius: size * 0.18,
      }}
    />
  );
}

export function MorrisWordmark({ size = "text-4xl" }) {
  return (
    <span className={`font-display ${size} tracking-wide`} style={{ color: "#F0EDE8" }}>
      MORRIS
    </span>
  );
}
