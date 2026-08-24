"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";

type CredentialResponse = { credential: string };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: CredentialResponse) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: () => void;
        };
      };
    };
  }
}

// Inline account-chooser popup, not a redirect round-trip — build-plan.md
// §H's "Google One Tap." Renders nothing itself (Google's own script draws
// the popup in a floating iframe); only mounted on the logged-out login
// page, same scope as the existing OAuth buttons.
export function GoogleOneTap() {
  const router = useRouter();
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_ONE_TAP_CLIENT_ID;

  useEffect(() => {
    if (!clientId || !window.google) return;
    initializeOneTap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function initializeOneTap(): void {
    if (!clientId || !window.google) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: async (response: CredentialResponse) => {
        try {
          const res = await fetch("/api/auth/google-one-tap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: response.credential }),
          });
          const json = (await res.json()) as { success: boolean; redirectPath?: string };
          if (json.success && json.redirectPath) {
            router.push(json.redirectPath);
            router.refresh();
          }
        } catch (error) {
          console.error("[GoogleOneTap]", error);
        }
      },
    });
    window.google.accounts.id.prompt();
  }

  if (!clientId) return null;

  return <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={initializeOneTap} />;
}
