"use client";

import { useEffect } from "react";

import { syncTimezone } from "@/actions/timezone";

const SYNCED_KEY = "sortie:synced-timezone";
const RETRY_AFTER_KEY = "sortie:timezone-retry-after";
const RETRY_DELAY_MS = 60 * 60 * 1000;

// Tells the server which timezone this browser is in, so daily AI limits reset
// at the user's midnight rather than UTC's. Renders nothing.
//
// Mounted by the Navbar for signed-in pages only, so an anonymous visitor never
// fires a server action. Once a zone is accepted it is remembered and every
// later page load short-circuits here; a different zone (travel, a new device)
// syncs again.
export function TimezoneSync() {
  useEffect(() => {
    let timezone: string;
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!timezone) return;

    try {
      if (localStorage.getItem(SYNCED_KEY) === timezone) return;
      if (Number(localStorage.getItem(RETRY_AFTER_KEY) ?? 0) > Date.now()) return;
    } catch {
      // Storage blocked (private mode, thumbnails): sync anyway, just unremembered.
    }

    syncTimezone(timezone)
      .then((result) => {
        try {
          if (result.timezone === timezone) {
            localStorage.setItem(SYNCED_KEY, timezone);
            localStorage.removeItem(RETRY_AFTER_KEY);
          } else {
            // Not applied — the once-a-day change limit, or a lapsed session.
            // Back off rather than posting on every navigation.
            localStorage.setItem(RETRY_AFTER_KEY, String(Date.now() + RETRY_DELAY_MS));
          }
        } catch {
          // Nothing to remember it in.
        }
      })
      .catch(() => {});
  }, []);

  return null;
}
