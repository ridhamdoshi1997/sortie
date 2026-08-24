"use client";

import { useEffect } from "react";

// A subtle cursor-tracked highlight on any .card-interactive-glow element
// (see the CSS class's own comment in globals.css) — the app's one hover
// "alive" touch, kept from the original Liquid Glass system but toned down
// once ordinary cards stopped being glass.
//
// Single delegated listener on the document (not one per card) so this
// scales to however many interactive cards are on a page without extra
// listeners. rAF-throttled since pointermove can fire far faster than the
// display can usefully repaint a CSS custom property update.
export function GlassCursorGlow() {
  useEffect(() => {
    let frame: number | null = null;
    let lastEvent: PointerEvent | null = null;

    function applyGlow() {
      frame = null;
      const event = lastEvent;
      if (!event) return;

      const target = (event.target as Element | null)?.closest<HTMLElement>(
        ".card-interactive-glow",
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
