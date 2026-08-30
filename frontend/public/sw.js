// Edgechat Service Worker —— 负责 Web Push 通知展示与点击跳转
const CACHE_NAME = "edgechat-static-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: String(event.data || "") };
  }
  const title = data.title || "Edgechat";
  const options = {
    body: data.body || "",
    tag: data.tag || "edgechat",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    renotify: true,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin);
  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windowClients) {
        if (new URL(client.url).origin === url.origin) {
          await client.navigate(url.pathname + url.search);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});