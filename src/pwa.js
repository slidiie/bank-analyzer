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
  // onUpdate: вызывается один раз, когда новая версия взяла страницу под контроль (controllerchange).
  // При самой первой установке контроллера не было, тогда это не обновление и плашку не показываем.
  function register(nav, loc, hasManifest, onUpdate) {
    if (!supported(loc, nav, hasManifest)) return Promise.resolve(false);
    if (onUpdate && nav.serviceWorker.addEventListener) {
      const hadController = !!nav.serviceWorker.controller;
      let done = false;
      try { nav.serviceWorker.addEventListener("controllerchange", () => { if (!hadController || done) return; done = true; onUpdate(); }); } catch (e) { /* без плашки */ }
    }
    return Promise.resolve().then(() => nav.serviceWorker.register("sw.js", { scope: "./" })).then(() => true, () => false);
  }

  // Плашка «Сайт обновился · Перезагрузить»: сама страницу не перезагружает (вдруг человек что-то вводит).
  function showUpdateBar(doc, loc) {
    if (!doc || !doc.body || doc.getElementById("swUpdate")) return;
    const bar = doc.createElement("div");
    bar.id = "swUpdate"; bar.className = "sw-update"; bar.setAttribute("role", "status");
    const t = doc.createElement("span"); t.textContent = "Сайт обновился";
    const b = doc.createElement("button"); b.type = "button"; b.textContent = "Перезагрузить";
    b.addEventListener("click", () => loc.reload());
    const x = doc.createElement("button"); x.type = "button"; x.className = "sw-x"; x.setAttribute("aria-label", "Закрыть"); x.textContent = "×";
    x.addEventListener("click", () => bar.remove());
    bar.append(t, b, x);
    doc.body.appendChild(bar);
  }

  const api = { supported, register, showUpdateBar };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else {
    root.Pwa = api;
    if (root.document && root.addEventListener) {
      root.addEventListener("load", () => register(root.navigator, root.location, !!root.document.querySelector('link[rel="manifest"]'), () => showUpdateBar(root.document, root.location)));
    }
  }
})(typeof self !== "undefined" ? self : this);
