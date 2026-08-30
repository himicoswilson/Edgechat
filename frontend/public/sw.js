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

// 推送服务轮换订阅时 SW 拿不到鉴权令牌,把新订阅发给页面代为保存到服务器
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const subscription = await self.registration.pushManager.getSubscription();
      if (!subscription) {
        return;
      }
      const message = { type: "push-subscription-changed", subscription };
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        client.postMessage(message);
      }
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