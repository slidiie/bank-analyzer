    // Защита от встраивания во фрейм на чужом сайте (GitHub Pages не даёт заголовок frame-ancestors):
    // внутри чужой страницы приложение не показываем, только ссылку «открыть сайт отдельно».
    try {
      if (window.top !== window.self) {
        document.documentElement.innerHTML = "";
        const a = document.createElement("a");
        a.href = "https://fernwood.by/"; a.target = "_blank"; a.rel = "noopener";
        a.textContent = "Открыть Fernwood в отдельном окне";
        a.style.cssText = "display:block;margin:2rem;font:1.1rem sans-serif";
        document.body.append(a);
        throw new Error("embedded");
      }
    } catch (e) { if (e.message === "embedded") throw e; }
    // Чтение PDF: библиотека pdf.js лежит рядом со страницей (pdfjs/lib.js и pdfjs/worker.js, кладёт build.py),
    // грузится только когда нужна (страница открывается быстрее), с того же сайта; после первого визита её держит sw.js.
    // Читаем в отдельном потоке (Worker); если браузер или «песочница» его не даёт, читаем в основном потоке.
    // Дополнения для Safari/iOS: pdf.js перебирает потоки через `for await`, а в Safari у ReadableStream этого нет
    // («undefined is not a function (near '...of e...')»). Тот же код подкладываем и в Worker.
    function installPolyfills() {
      if (typeof ReadableStream !== "undefined" && !ReadableStream.prototype[Symbol.asyncIterator]) {
        ReadableStream.prototype[Symbol.asyncIterator] = function () {
          const reader = this.getReader();
          return {
            next() { return reader.read(); },
            return() { try { reader.releaseLock(); } catch (e) { /* уже освобождён */ } return Promise.resolve({ done: true, value: undefined }); },
            [Symbol.asyncIterator]() { return this; }
          };
        };
      }
      if (!Promise.withResolvers) {
        Promise.withResolvers = function () {
          let resolve, reject;
          const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
          return { promise, resolve, reject };
        };
      }
    }
    installPolyfills();

    const PDFJS_V = "__PDFV__";   // метка версии файлов pdf.js (подставляет build.py)
    const loadedModules = {};
    function loadModule(path) {
      return loadedModules[path] || (loadedModules[path] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.type = "module"; s.src = path + "?v=" + PDFJS_V;
        s.onload = resolve;
        s.onerror = () => { delete loadedModules[path]; s.remove(); reject(new Error("не удалось загрузить чтение PDF: проверьте интернет и попробуйте ещё раз")); };
        document.head.appendChild(s);
      }));
    }
    // Начать загрузку заранее (когда человек открывает выбор файла), чтобы к выбору выписки всё уже было готово
    function preloadPdfjs() { if (!window.pdfjsLib && location.protocol !== "file:") loadModule("pdfjs/lib.js").catch(() => { /* повторим при чтении */ }); }
    ["pointerdown", "keydown", "dragenter"].forEach(t => document.addEventListener(t, e => {
      const el = e.target && e.target.closest ? e.target.closest('#startBtn, label[for="file"], label[for="anonFile"], #file, #anonFile, #upcard, .upcard') : null;
      if (el || t === "dragenter") preloadPdfjs();
    }, { passive: true, capture: true }));
    async function openPdf(bytes, password) {
      if (!window.pdfjsLib) await loadModule("pdfjs/lib.js");
      const lib = window.pdfjsLib;
      if (!lib) throw new Error("не удалось запустить чтение PDF: обновите браузер");
      const opts = { isEvalSupported: false };
      if (password) opts.password = password;
      let port = null, task = null, timer = null;
      try {
        port = new Worker("pdfjs/worker.js?v=" + PDFJS_V, { type: "module" });
        const dead = new Promise((_, reject) => port.addEventListener("error", () => reject({ workerFailed: true }), { once: true }));
        // На iPhone и в «песочницах» Worker иногда не запускается молча, без ошибки: через 6 с переходим на чтение в основном потоке.
        const slow = new Promise((_, reject) => { timer = setTimeout(() => reject({ workerFailed: true }), 6000); });
        task = lib.getDocument({ ...opts, data: bytes.slice(), worker: new lib.PDFWorker({ port }) });
        return await Promise.race([task.promise, dead, slow]);
      } catch (err) {
        if (!(err && err.workerFailed) && !(err instanceof DOMException)) throw err;   // настоящая ошибка PDF (пароль, повреждён)
        try { if (task) task.destroy(); } catch (e) { /* уже закрыто */ }
        try { if (port) port.terminate(); } catch (e) { /* уже закрыт */ }
      } finally { clearTimeout(timer); }
      await loadModule("pdfjs/worker.js");   // чтение без отдельного потока: pdf.js берёт globalThis.pdfjsWorker
      return lib.getDocument({ ...opts, data: bytes }).promise;
    }

    // Если соседние файлы не загрузились (страница открыта не из папки проекта или в «песочнице»),
    // показываем понятное сообщение с адресом страницы, а не молчим.
    if (typeof StatementParser === "undefined" || typeof Categories === "undefined" || typeof Banks === "undefined" || typeof Merge === "undefined" || typeof Exporter === "undefined" || typeof Demo === "undefined") {
      const box = document.createElement("p");
      box.className = "warn";
      box.textContent = "Не загрузились файлы разбора выписок (parser.js, categories.js, banks.js). Адрес этой страницы: " + location.href +
        ". Откройте собранный файл bank-analyzer.html двойным кликом: в нём всё собрано в одном файле.";
      document.body.prepend(box);
      throw new Error("файлы разбора не загружены");
    }
    const SP = StatementParser;
    const Cat = Categories;
    const bankOf = hdr => Banks.byId(hdr && hdr.bank) || Banks.BANKS[Banks.BANKS.length - 1];

