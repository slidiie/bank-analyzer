// Установка на телефон и работа без сети: регистрация service worker (sw.js).
// Включается только в готовой сборке (в ней есть <link rel="manifest">) и только по https или с localhost:
// с file:// service worker недоступен, там страница работает как раньше.
(function (root) {
  "use strict";
  const LOCAL = ["localhost", "127.0.0.1", "[::1]"];

  function supported(loc, nav, hasManifest) {
    if (!hasManifest || !nav || !nav.serviceWorker || !loc) return false;
    return loc.protocol === "https:" || (loc.protocol === "http:" && LOCAL.indexOf(loc.hostname) >= 0);
  }

  // Возвращает промис; любая ошибка гасится: без офлайна страница остаётся рабочей.
  function register(nav, loc, hasManifest) {
    if (!supported(loc, nav, hasManifest)) return Promise.resolve(false);
    return Promise.resolve().then(() => nav.serviceWorker.register("sw.js", { scope: "./" })).then(() => true, () => false);
  }

  const api = { supported, register };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else {
    root.Pwa = api;
    if (root.document && root.addEventListener) {
      root.addEventListener("load", () => register(root.navigator, root.location, !!root.document.querySelector('link[rel="manifest"]')));
    }
  }
})(typeof self !== "undefined" ? self : this);
