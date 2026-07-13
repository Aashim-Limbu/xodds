/* The angular xOdds "x" logo mark — one chunky die-cut X, matching the Stitch landing.
 * (Decorative landing stickers are real crops from the design, in public/stickers/.) */

const INK = "#1f1b10";

export function XMark({ size = 60 }: { size?: number }) {
  const x = "M4 4 L26 4 L34 19 L42 4 L64 4 L45 30 L64 56 L42 56 L34 41 L26 56 L4 56 L23 30 Z";
  return (
    <svg width={size * (68 / 60)} height={size} viewBox="0 0 68 60" aria-hidden="true">
      <path d={x} fill={INK} stroke="#fff" strokeWidth="10" strokeLinejoin="round" paintOrder="stroke" />
      <path d={x} fill={INK} />
    </svg>
  );
}
