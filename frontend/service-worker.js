const CACHE_NAME = "pumpr-shell-v20260711-airi-senses";
const APP_SHELL = [
  "/",
  "/create",
  "/airi",
  "/airdrop",
  "/referrals",
  "/social",
  "/assets/site.css?v=20260711airisenses",
  "/js/airi-live.js?v=20260711airisenses",
  "/assets/assistant/rose-thumb.png",
  "/assets/pump-r-logo.png?v=20260609brand",
  "/assets/favicon.png?v=20260609brand",
  "/js/pwa.js?v=20260706android"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/uploads/") ||
    url.pathname.startsWith("/vendor/") ||
    url.pathname.startsWith("/downloads/")
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => undefined);
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
  );
});
