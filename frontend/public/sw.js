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
      // 激活标记:证明新版 SW 已在这台设备接管,区分"SW 没跑"与"跑了但没收推送"
      recordPushDiag("sw", { ts: Date.now(), sw: "activated" });
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

// 推送到达记录器:应用关闭时收到的推送写进 IndexedDB,下次打开用一条 console 命令读取,
// 不依赖 Web Inspector 是否挂在 SW 目标上(关闭的应用检查器挂不上)。
const PUSH_DIAG_DB = "edgechat-push-diag";
const PUSH_DIAG_VERSION = 2;
const PUSH_DIAG_STORE = "state";

function recordPushDiag(key, entry) {
  try {
    const openRequest = indexedDB.open(PUSH_DIAG_DB, PUSH_DIAG_VERSION);
    openRequest.onupgradeneeded = () => {
      openRequest.result.createObjectStore(PUSH_DIAG_STORE);
    };
    openRequest.onsuccess = () => {
      const db = openRequest.result;
      const tx = db.transaction(PUSH_DIAG_STORE, "readwrite");
      tx.objectStore(PUSH_DIAG_STORE).put(entry, key);
    };
  } catch {
    // 诊断记录失败不影响推送展示
  }
}

self.addEventListener("push", (event) => {
  const payloadText = event.data ? event.data.text() : "";
  console.log("[edgechat] push received:", payloadText.slice(0, 200));
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: payloadText };
  }
  // 兼容 Declarative Web Push 信封(title/options/default_action_url)与旧式信封(title/body/tag/url)
  const options = data.options || {};
  const title = data.title || "Edgechat";
  const body = options.body || data.body || "";
  const tag = options.tag || data.tag || "edgechat";
  const url = data.default_action_url || data.url || "/";
  const renotify = options.renotify !== undefined ? options.renotify : true;
  const notificationOptions = {
    body,
    tag,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    renotify,
    data: { url },
  };
  event.waitUntil(
    self.registration
      .showNotification(title, notificationOptions)
      .then(() => {
        console.log("[edgechat] notification shown");
        recordPushDiag("last", { ts: Date.now(), shown: true, payload: payloadText.slice(0, 120) });
      })
      .catch((error) => {
        console.error("[edgechat] showNotification failed:", error);
        recordPushDiag("last", { ts: Date.now(), shown: false, payload: payloadText.slice(0, 120), error: String(error) });
      }),
  );
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