"use client";

import { useEffect } from "react";

// The one genuinely "alive" touch in the Liquid Glass system — a glow that
// follows the cursor on any .glass-panel-interactive element (see the CSS
// class's own comment in globals.css). Everything else in that system is a
// static gradient; without this, the whole thing reads as "glass-styled"
// rather than glass, no matter how good the static values are.
//
// Single delegated listener on the document (not one per card) so this
// scales to however many glass cards are on a page without extra listeners.
// rAF-throttled since pointermove can fire far faster than the display
// can usefully repaint a CSS custom property update.
export function GlassCursorGlow() {
  useEffect(() => {
    let frame: number | null = null;
    let lastEvent: PointerEvent | null = null;

    function applyGlow() {
      frame = null;
      const event = lastEvent;
      if (!event) return;

      const target = (event.target as Element | null)?.closest<HTMLElement>(
        ".glass-panel-interactive",
      );
      if (!target) return;

      const rect = target.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      target.style.setProperty("--mouse-x", `${x}%`);
      target.style.setProperty("--mouse-y", `${y}%`);
    }

    function handlePointerMove(event: PointerEvent) {
      lastEvent = event;
      if (frame === null) {
        frame = requestAnimationFrame(applyGlow);
      }
    }

    document.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
