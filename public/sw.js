// Push notification service worker — the minimum needed to receive a Web
// Push message and show it, plus focus/open the app on click. No offline
// caching, no asset precaching (this app doesn't need a full PWA yet,
// just the push-subscription + notification-display capability).
self.addEventListener("push", (event) => {
  let data = { title: "Sortie", body: "" };
  try {
    if (event.data) data = event.data.json();
  } catch {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Sortie", {
      body: data.body || "",
      icon: "/favicon.ico",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
