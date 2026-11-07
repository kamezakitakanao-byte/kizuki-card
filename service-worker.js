/* KIZUKI CARD service worker
   アプリ本体をキャッシュして、オフラインでも動くようにする。
   アプリを更新したら CACHE_VERSION の数字を上げてください。 */
const CACHE_VERSION = "v2";
const CACHE_NAME = "kizuki-card-" + CACHE_VERSION;
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./data.js",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("kizuki-card-") && k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// キャッシュを先に返し、裏で最新版を取得して次回に反映（stale-while-revalidate）
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(req, { ignoreSearch: true }).then(cached => {
        const network = fetch(req).then(res => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => cached || (req.mode === "navigate" ? cache.match("./index.html") : undefined));
        return cached || network;
      })
    )
  );
});
