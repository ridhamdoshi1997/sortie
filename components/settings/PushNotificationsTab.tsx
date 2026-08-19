"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff } from "lucide-react";

import { subscribeToPush, unsubscribeFromPush } from "@/actions/push";

type Status = "checking" | "unsupported" | "subscribed" | "unsubscribed" | "denied";

// Push notifications (admin console expansion item 6) — genuinely usable
// today, no external account needed (unlike email). Registers public/sw.js,
// requests browser permission, subscribes via the Push API using the
// public VAPID key, and stores the subscription server-side.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function PushNotificationsTab() {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    async function check(): Promise<void> {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        setStatus(subscription ? "subscribed" : "unsubscribed");
      } catch {
        setStatus("unsubscribed");
      }
    }
    check();
  }, []);

  function handleEnable(): void {
    setError(null);
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setStatus("denied");
          return;
        }

        const registration = await navigator.serviceWorker.register("/sw.js");
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) {
          setError("Push isn't configured on this deployment yet.");
          return;
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        });

        const json = subscription.toJSON();
        const result = await subscribeToPush(json.endpoint!, json.keys!.p256dh, json.keys!.auth);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setStatus("subscribed");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to enable push notifications.");
      }
    });
  }

  function handleDisable(): void {
    setError(null);
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await unsubscribeFromPush(subscription.endpoint);
          await subscription.unsubscribe();
        }
        setStatus("unsubscribed");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to disable push notifications.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-1 flex items-center gap-2">
        {status === "subscribed" ? <Bell className="h-4 w-4 text-text-secondary" /> : <BellOff className="h-4 w-4 text-text-secondary" />}
        <h2 className="text-sm font-semibold text-text-primary">Push notifications</h2>
      </div>
      <p className="text-sm text-text-secondary">Get browser notifications for important updates, sent directly to this device.</p>

      {error && <p className="text-xs text-error">{error}</p>}

      {status === "unsupported" && <p className="text-sm text-text-muted">Your browser doesn&apos;t support push notifications.</p>}
      {status === "denied" && <p className="text-sm text-text-muted">Notifications are blocked for this site — enable them in your browser settings to turn this on.</p>}
      {status === "checking" && <p className="text-sm text-text-muted">Checking…</p>}
      {status === "unsubscribed" && (
        <button
          type="button"
          onClick={handleEnable}
          disabled={isPending}
          className="inline-flex h-9 w-fit items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Bell className="h-4 w-4" />
          Enable push notifications
        </button>
      )}
      {status === "subscribed" && (
        <button
          type="button"
          onClick={handleDisable}
          disabled={isPending}
          className="inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
        >
          <BellOff className="h-4 w-4" />
          Disable push notifications
        </button>
      )}
    </div>
  );
}
