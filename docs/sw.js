// Service worker: страница и её файлы кладутся в кэш при установке, дальше работают без сети.
// Данные пользователя сюда не попадают: кэшируются только файлы самого приложения с того же адреса.
// Версию (метку в имени кэша) подставляет build.py (хэш готовой страницы): новая сборка = новый кэш, старый удаляется.
"use strict";
const CACHE = "bank-analyzer-c54be594dfc7";
const FILES = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("bank-analyzer-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;   // чужое и не-GET: как есть
  // Страница открыта с «?что-то»: отдаём ту же страницу из кэша
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req)));
});
