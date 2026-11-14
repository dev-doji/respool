// Honeycomb art. Deterministic from `seed`, so server and client render the same markup.
export function Comb({ seed, className }: { seed: number; className?: string }) {
  const r = 17, w = Math.sqrt(3) * r;
  const cells: { pts: string; on: boolean; delay: number }[] = [];
  let k = 0;
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      const cx = col * w + (row % 2 ? w / 2 : 0) + 12, cy = row * r * 1.5 + 18;
      const pts = [0, 1, 2, 3, 4, 5].map((i) => {
        const a = (Math.PI / 180) * (60 * i - 30);
        return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
      }).join(" ");
      cells.push({ pts, on: (k++ * 7 + seed) % 11 === 0, delay: (k % 5) * 0.5 });
    }
  }
  return (
    <svg className={className} viewBox="0 0 220 250" aria-hidden="true">
      <g className="comb">
        {cells.map((c, i) => (
          <polygon key={i} className={`hx${c.on ? " on" : ""}`} points={c.pts} style={c.on ? { animationDelay: `${c.delay}s` } : undefined} />
        ))}
      </g>
    </svg>
  );
}
