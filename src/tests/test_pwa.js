const fs = require("fs"), path = require("path"), vm = require("vm");
const P = require("../pwa.js");
const src = (...p) => path.join(__dirname, "..", ...p);
let failed = 0;
const check = (n, ok) => { console.log((ok ? "OK    " : "ОШИБКА ") + n); if (!ok) failed++; };
const nav = { serviceWorker: { register: () => Promise.resolve({}) } };
const L = (protocol, hostname) => ({ protocol, hostname });

check("https: включено", P.supported(L("https:", "slidiie.github.io"), nav, true));
check("localhost по http: включено", P.supported(L("http:", "localhost"), nav, true) && P.supported(L("http:", "127.0.0.1"), nav, true));
check("file://: выключено", !P.supported(L("file:", ""), nav, true));
check("чужой http: выключено", !P.supported(L("http:", "example.com"), nav, true));
check("без манифеста (src/analyzer.html): выключено", !P.supported(L("https:", "x.io"), nav, false));
check("браузер без service worker: выключено", !P.supported(L("https:", "x.io"), {}, true) && !P.supported(L("https:", "x.io"), null, true));

(async () => {
  let args = null;
  const n2 = { serviceWorker: { register: (...a) => { args = a; return Promise.resolve({}); } } };
  check("register: sw.js с областью ./", (await P.register(n2, L("https:", "x.io"), true)) === true && args[0] === "sw.js" && args[1].scope === "./");
  check("register отклонён: false, без исключения", (await P.register({ serviceWorker: { register: () => Promise.reject(new Error("x")) } }, L("https:", "x.io"), true)) === false);
  check("register синхронно бросил: false", (await P.register({ serviceWorker: { register: () => { throw new Error("x"); } } }, L("https:", "x.io"), true)) === false);
  { const lst = {}; let shown = 0;
    const n3 = { serviceWorker: { controller: {}, register: () => Promise.resolve({}), addEventListener: (t, f) => { lst[t] = f; } } };
    await P.register(n3, L("https:", "x.io"), true, () => shown++);
    lst.controllerchange && lst.controllerchange(); lst.controllerchange && lst.controllerchange();
    check("controllerchange: плашка один раз, без перезагрузки", shown === 1);
    const lst2 = {}; let shown2 = 0;
    const n4 = { serviceWorker: { controller: null, register: () => Promise.resolve({}), addEventListener: (t, f) => { lst2[t] = f; } } };
    await P.register(n4, L("https:", "x.io"), true, () => shown2++);
    lst2.controllerchange && lst2.controllerchange();
    check("первая установка (контроллера не было): плашки нет", shown2 === 0);
  }
  args = null;
  check("register на file://: false, вызова нет", (await P.register(n2, L("file:", ""), true)) === false && args === null);

  // sw.js выполняем с заглушками: установка, очистка старых кэшей, ответы
  const listeners = {}, stores = { "bank-analyzer-old": {}, "other-app": {} };
  const cur = "bank-analyzer-T1";
  const caches = {
    open: async name => ({ addAll: async files => { stores[name] = Object.fromEntries(files.map(f => [f.url, f.cache])); } }),
    keys: async () => Object.keys(stores),
    delete: async k => { delete stores[k]; },
    match: async (req, o) => (o && o.ignoreSearch && req.url.startsWith("https://x.io/app/") ? "CACHED" : undefined),
  };
  let claimed = false, skipped = false;
  const sandbox = {
    self: { location: { origin: "https://x.io" }, addEventListener: (t, f) => { listeners[t] = f; }, skipWaiting: () => { skipped = true; return Promise.resolve(); }, clients: { claim: () => { claimed = true; return Promise.resolve(); } } },
    caches, URL, Request: function (u, o) { this.url = u; this.cache = o && o.cache; }, fetch: async () => "NET", Promise, Object,
  };
  vm.runInNewContext(fs.readFileSync(src("sw.js"), "utf8").replace("__VERSION__", "T1"), sandbox);
  const run = async (t, ev) => { let p; ev.waitUntil = x => { p = x; }; ev.respondWith = x => { p = x; }; listeners[t](ev); return p === undefined ? undefined : await p; };
  await run("install", {});
  check("install: файлы мимо HTTP-кэша (cache: reload)", stores[cur] && Object.values(stores[cur]).every(c => c === "reload"));
  check("install: файлы приложения в кэше, skipWaiting", skipped && stores[cur] && stores[cur]["index.html"] && stores[cur]["manifest.webmanifest"] && stores[cur]["./"]);
  await run("activate", {});
  check("activate: старый кэш удалён, чужой не тронут, claim", !stores["bank-analyzer-old"] && !!stores["other-app"] && !!stores[cur] && claimed);
  check("fetch: из кэша", (await run("fetch", { request: { method: "GET", url: "https://x.io/app/?a=1" } })) === "CACHED");
  check("fetch: нет в кэше, берём из сети", (await run("fetch", { request: { method: "GET", url: "https://x.io/other" } })) === "NET");
  check("fetch: чужой адрес не перехватываем", (await run("fetch", { request: { method: "GET", url: "https://evil.example/app/" } })) === undefined);
  check("fetch: POST не перехватываем", (await run("fetch", { request: { method: "POST", url: "https://x.io/app/" } })) === undefined);

  const m = JSON.parse(fs.readFileSync(src("pwa", "manifest.webmanifest"), "utf8"));
  check("манифест: standalone, относительные start_url и scope", m.display === "standalone" && m.start_url === "./" && m.scope === "./");
  check("манифест: иконки есть на диске, есть 512 и maskable", m.icons.every(i => fs.existsSync(src("pwa", i.src))) && m.icons.some(i => i.sizes === "512x512") && m.icons.some(i => i.purpose === "maskable"));
  const files = JSON.parse(fs.readFileSync(src("sw.js"), "utf8").match(/const FILES = (\[.*\]);/)[1]);
  check("sw: все кэшируемые файлы существуют (кроме страницы)", files.filter(f => f !== "./" && f !== "index.html").every(f => fs.existsSync(src("pwa", f))));
  process.exit(failed ? 1 : 0);
})();
