import { useEffect, useRef, useState } from "react";

/**
 * Rolls a number from its previous value to the next one — the casino counter on the pot.
 * Works in USDC base units (bigint) and returns a bigint, so the caller keeps formatting
 * money exactly as it already does; nothing goes through float.
 *
 * ponytail: rAF + ease-out, no animation library. Honors prefers-reduced-motion by
 * snapping, which is the whole accessibility requirement here.
 */
export function useCountUp(target: bigint, ms = 900): bigint {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const raf = useRef(0);

  useEffect(() => {
    const start = from.current;
    if (start === target) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      from.current = target;
      setShown(target);
      return;
    }

    const t0 = performance.now();
    const delta = target - start;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic — fast, then settles
      // Scale by 1e6 so the eased fraction survives integer maths on the bigint delta.
      const next = start + (delta * BigInt(Math.round(eased * 1_000_000))) / 1_000_000n;
      setShown(p === 1 ? target : next);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);

  return shown;
}
