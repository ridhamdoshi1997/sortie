"use client";

import { useEffect } from "react";

// Installable PWA (build-plan.md §H). public/sw.js previously only ever
// registered when a user opened Settings -> Push and clicked to enable
// notifications (PushNotificationsTab.tsx) — real installability needs the
// service worker registered on every page load, regardless of whether the
// user ever enables push. Registering twice (here, then again if the user
// later opts into push) is safe and cheap — the browser reuses the same
// registration by scope, it doesn't create a duplicate.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("[ServiceWorkerRegister]", error);
    });
  }, []);

  return null;
}
