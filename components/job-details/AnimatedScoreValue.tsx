"use client";

import { useEffect, useState } from "react";

// Small client island so JobIdentityRail.tsx (and anywhere else that wants
// this) can stay a server component apart from the one number that
// animates. Counts up from 0 to `value` once on mount — a real result just
// arrived (state indication, per the `animate` skill's purpose taxonomy),
// not a per-interaction effect, so this fires once and stays put.
// Respects prefers-reduced-motion by skipping straight to the final value.
export function AnimatedScoreValue({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Deferred via setTimeout(0) — same reason as every other mount-
      // effect setState in this project (e.g. JobActionBar.tsx's
      // foundAtLabel effect): react-hooks/set-state-in-effect flags a
      // direct synchronous call.
      const timer = setTimeout(() => setDisplay(value), 0);
      return () => clearTimeout(timer);
    }

    let raf = 0;
    const duration = 700;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(Math.round(eased * value));
      if (t < 1) raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={className}>{display}</span>;
}
