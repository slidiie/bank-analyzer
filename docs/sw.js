// Service worker: страница и её файлы кладутся в кэш при установке, дальше работают без сети.
// Данные пользователя сюда не попадают: кэшируются только файлы самого приложения с того же адреса.
// При установке файлы берутся мимо HTTP-кэша браузера (cache: "reload"), иначе в новый кэш мог лечь старый index.html.
// Версию (метку в имени кэша) подставляет build.py (хэш готовой страницы): новая сборка = новый кэш, старый удаляется.
"use strict";
const CACHE = "bank-analyzer-d23650c56997";
const FILES = ["./", "index.html", "manifest.webmanifest", "pdfjs/lib.js", "pdfjs/worker.js", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("bank-analyzer-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;   // чужое и не-GET: как есть
  const fromCache = () => caches.match(req, { ignoreSearch: true });   // «?что-то» в адресе: та же страница
  if (req.mode === "navigate") {
    // Саму страницу сначала берём из сети: иначе после обновления сайта человек один раз видит старую версию.
    // Нет сети или она дольше 3 секунд: отдаём сохранённую копию, сайт работает и офлайн.
    const net = fetch(req, { cache: "no-cache" });
    const slow = new Promise(r => setTimeout(r, 3000)).then(fromCache);
    e.respondWith(Promise.race([net.catch(() => fromCache()), slow.then(hit => hit || net)])
      .then(res => res || net).catch(() => fromCache()));
    return;
  }
  e.respondWith(fromCache().then(hit => hit || fetch(req)));
});
