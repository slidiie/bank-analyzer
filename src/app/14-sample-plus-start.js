    // ---------- Анонимайзер: мастер «безопасный образец выписки» (4 шага в шторке, страница не прокручивается) ----------
    let anon = null;   // { model, kind, page, seen }
    let anonStep = 1;
    let anonMade = null;   // как подготовлен образец: "copy" | "file" (null: ещё ничего не нажато)
    const ANON_MAIL = "bankanalyzer.help@gmail.com";
    const ANON_CONSENT = "Я сам просмотрел все страницы образца, личные данные скрыты, меня всё устраивает; образец используется только для создания чтения моего банка, не публикуется и удаляется.";
    const ANON_TITLES = ["Ваши данные остаются у вас", "Выберите выписку", "Проверьте, что скрыто", "Отправьте образец"];
    function anonNextState() {
      const left = anon ? anon.model.length - anon.seen.size : 0;
      const need = anonStep === 2 && !anon ? "Выберите файл, чтобы продолжить."
        : anonStep === 3 && left > 0 ? `Просмотрите все страницы, чтобы продолжить (осталось: ${left}).`
        : "";
      $("anonNeed").textContent = need;
      $("anonNext").disabled = !!need;
    }
    function anonRenderStep() {
      for (let i = 1; i <= 4; i++) $("anonStep" + i).hidden = i !== anonStep;
      $("anonStepNo").textContent = `Шаг ${anonStep} из 4`;
      $("anonStepTitle").textContent = ANON_TITLES[anonStep - 1];
      $("anonProg").style.width = anonStep * 25 + "%";
      $("anonBack").hidden = anonStep === 1;
      $("anonNext").textContent = anonStep === 4 ? "Закрыть окно" : "Далее";
      $("anonNext").classList.toggle("primary", anonStep !== 4);
      if (anonStep === 4) anonPrepareMail();
      anonNextState();
      try { $("anonBody").scrollTop = 0; } catch (e) { /* без прокрутки */ }
    }
    const anonGo = n => { anonStep = Math.max(1, Math.min(4, n)); anonRenderStep(); };
    function anonRenderPage() {
      const pg = anon.model[anon.page];
      anon.seen.add(anon.page);
      const frag = document.createDocumentFragment();
      pg.forEach((row, ri) => {
        const r = h("div", { class: "arow" });
        row.forEach((it, ci) => r.append(h("span", { class: "achip" + (Anon.isHidden(it) ? " hid" : ""), "data-r": ri, "data-c": ci }, Anon.effective(it))));
        frag.append(r);
      });
      $("anonPage").replaceChildren(frag);
      $("anonPage").scrollTop = 0;
      anonRefresh();
    }
    function anonRefresh() {
      const st = Anon.stats(anon.model);
      $("anonStats").textContent = `Закрыто фрагментов: ${st.hidden} из ${st.total}.`;
      const n = anon.model.length, left = n - anon.seen.size;
      // кнопки листания создаются один раз: пересоздание на каждом нажатии теряло быстрые тапы
      const pg = $("anonPager");
      if (!pg.firstChild) {
        const go = d => { if (!anon) return; const t = anon.page + d; if (t < 0 || t >= anon.model.length) return; anon.page = t; anonRenderPage(); };
        pg.append(h("button", { type: "button", class: "pgprev", "aria-label": "Предыдущая страница", onclick: () => go(-1) }, "←"),
          h("span", { class: "pgno" }), h("button", { type: "button", class: "pgnext", "aria-label": "Следующая страница", onclick: () => go(1) }, "→"));
      }
      pg.querySelector(".pgprev").disabled = anon.page <= 0;
      pg.querySelector(".pgnext").disabled = anon.page >= n - 1;
      pg.querySelector(".pgno").textContent = ` Страница ${anon.page + 1} из ${n} `;
      const ok = $("anonOk");
      ok.disabled = left > 0;
      if (left > 0) ok.checked = false;
      $("anonHint").textContent = "";
      anonUpdateButtons();
    }
    function anonUpdateButtons() {
      const on = $("anonOk").checked && !$("anonOk").disabled;
      $("anonSend").disabled = !on; $("anonDownload").disabled = !on;
      $("anonOther").hidden = !on;
      if (!on) { anonMade = null; $("anonMadeMsg").textContent = ""; $("anonAfter").hidden = true; }
      anonNextState();
    }
    // Листание свайпом на телефоне: вбок заметно больше, чем вверх-вниз (прокрутка страницы не считается)
    { let sx = 0, sy = 0, st = 0;
      const pg = $("anonPage");
      pg.addEventListener("touchstart", e => { const t = e.touches && e.touches[0]; if (t) { sx = t.clientX; sy = t.clientY; st = Date.now(); } }, { passive: true });
      pg.addEventListener("touchend", e => {
        const t = e.changedTouches && e.changedTouches[0];
        if (!t || !anon || Date.now() - st > 700) return;
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (Math.abs(dx) < 70 || Math.abs(dx) < 2.5 * Math.abs(dy)) return;
        const btn = document.querySelector(dx < 0 ? "#anonPager .pgnext" : "#anonPager .pgprev");
        if (btn && !btn.disabled) btn.click();
      }, { passive: true }); }
    $("anonOk").addEventListener("change", anonUpdateButtons);
    $("anonPage").addEventListener("click", e => {
      const c = e.target.closest ? e.target.closest(".achip") : null;
      if (!c || !anon) return;
      const it = anon.model[anon.page][+c.dataset.r][+c.dataset.c];
      if (Anon.isAutoHidden(it)) { $("anonHint").textContent = "Это сайт закрыл сам (ФИО, счёт, карта, телефон, адрес и т.п.): такие данные в образце скрываются всегда. Можно только закрыть ещё что-то."; return; }
      it.manual = !Anon.isHidden(it);
      $("anonOk").checked = false;
      c.className = "achip" + (Anon.isHidden(it) ? " hid" : "");
      c.textContent = Anon.effective(it);
      anonRefresh();
    });
    const r2 = v => Math.round(v * 100) / 100;
    function anonPickName(f) { $("anonFileName").textContent = f ? f.name : "PDF или CSV, можно перетащить сюда. Файл никуда не отправляется."; if ($("anonPick").classList) $("anonPick").classList.toggle("has", !!f); $("anonPickBtn").textContent = f ? "Выбрать другой файл" : "Выбрать файл выписки"; }
    $("anonFile").addEventListener("change", () => { const f = $("anonFile").files[0]; anonPickName(f); anonLoad(f); });
    ["dragenter", "dragover"].forEach(t => $("anonPick").addEventListener(t, e => { e.preventDefault(); $("anonPick").classList.add("over"); }));
    ["dragleave", "drop"].forEach(t => $("anonPick").addEventListener(t, () => $("anonPick").classList.remove("over")));
    $("anonPick").addEventListener("drop", e => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) { anonPickName(f); anonLoad(f); } });
    // Открыть мастер: новый заход начинается с первого шага, незавершённый продолжается
    function showAnon(lead) {
      $("anonLead").hidden = !lead;
      if (!anon) anonStep = 1;
      anonRenderStep();
      openSheet("anonSheet", $("wantedOpen"));
    }
    $("anonOpenMore").addEventListener("click", () => showAnon(false));
    // ---------- Блок «Каких банков не хватает»: список нужных банков, ссылка-просьба #sample ----------
    const WANTED_BANKS = [
      { name: "Белагропромбанк" }, { name: "Белгазпромбанк" }, { name: "БНБ-Банк" }, { name: "БелВЭБ Банк" },
      { name: "Паритетбанк" }, { name: "Технобанк" }, { name: "Банк Дабрабыт" }, { name: "Банк «Решение»" },
      { name: "Банк Москва-Минск" }, { name: "Идея Банк" }, { name: "Другой банк" }];
    // Ссылка на просьбу (#wanted) сразу раскрывает список банков
    const openWanted = () => { if (typeof location !== "undefined" && location.hash === "#wanted") $("wantedMore").open = true; };
    openWanted(); if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("hashchange", openWanted);
    // Ссылка «Вашего банка нет?» всегда раскрывает блок и показывает его (повторное нажатие его не закрывает)
    $("wantedLink").addEventListener("click", e => {
      e.preventDefault();
      $("wantedMore").open = true;
      const w = $("wanted"); if (w && w.scrollIntoView) w.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("wantedList").replaceChildren(...WANTED_BANKS.map(b => h("li", {}, b.name)));
    $("wantedOpen").addEventListener("click", () => showAnon(false));
    $("wantedCopy").addEventListener("click", async () => {
      const url = location.origin + location.pathname.replace(/[^/]*$/, "") + "#sample";
      $("wantedMsg").textContent = (await copyText(url)) ? "Ссылка скопирована." : "Не удалось скопировать: " + url;
    });
    // Ссылка «…/#sample» сразу открывает мастер образца (для знакомых, которым владелец прислал просьбу)
    // Ссылка «…/#demo» (со страниц банков для поиска) сразу открывает пример
    if (typeof location !== "undefined" && location.hash === "#demo") setTimeout(() => { const d = $("demoBtn"); if (d) d.click(); }, 0);
    if (typeof location !== "undefined" && location.hash === "#sample") { const w = $("wanted"); if (w && w.scrollIntoView) w.scrollIntoView(); setTimeout(() => showAnon(false), 300); }
    // ---------- Расширенная версия (монетизация) ----------
    // Пока автор не выбрал способ оплаты, enabled = false и карточку видят только те, у кого уже есть код.
    // Включить: enabled: true, price (текст цены), payUrl (страница оплаты: Boosty, бот в Telegram и т. п.), how (как придёт код).
    // Функции из Pro.FEATURES с ready: false показываются с пометкой «скоро»; закрывать бесплатное нельзя (правило проекта).
    const MONEY = { enabled: false, price: "", payUrl: "", how: "После оплаты код придёт в ответном сообщении. Введите его ниже.", ready: [] };
    let proLic = null;   // действующий код: { id, f, exp }
    const proHas = feature => typeof Pro !== "undefined" && Pro.has(proLic, feature);
    function renderPro(msg) {
      const box = $("proBox");
      if (!box || typeof Pro === "undefined") return;
      box.hidden = !(MONEY.enabled || proLic);
      $("proFeatures").replaceChildren(...Pro.FEATURES.map(f => h("li", {}, h("b", {}, f.title), ": " + f.text,
        MONEY.ready.includes(f.id) ? "" : h("span", { class: "soon" }, " (скоро)"))));
      const buy = MONEY.enabled && MONEY.payUrl && !proLic;
      $("proBuyRow").hidden = !buy;
      if (buy) { $("proBuy").href = MONEY.payUrl; $("proPrice").textContent = MONEY.price; }
      $("proHow").hidden = !buy || !MONEY.how; $("proHow").textContent = MONEY.how;
      $("proCodeBox").hidden = !!proLic;
      $("proMsg").replaceChildren(...(proLic
        ? [h("b", {}, "Расширенная версия включена"), proLic.exp ? ` до ${proLic.exp.split("-").reverse().join(".")}. ` : ". ", "Спасибо, что поддерживаете проект! ",
           h("button", { type: "button", class: "linklike", onclick: () => { try { localStorage.removeItem(Pro.KEY); } catch (e) { /* без хранилища */ } proLic = null; renderPro("Код убран с этого устройства."); } }, "Убрать код с этого устройства")]
        : msg ? [msg] : []));
    }
    $("proCheck").addEventListener("click", async () => {
      const r = await Pro.verify($("proCode").value);
      if (!r.ok) { renderPro(r.reason); return; }
      proLic = r.lic;
      try { localStorage.setItem(Pro.KEY, r.code); } catch (e) { /* без хранилища код действует до закрытия страницы */ }
      $("proCode").value = "";
      renderPro();
    });
    (async () => {
      let saved = null;
      try { saved = localStorage.getItem(Pro.KEY); } catch (e) { /* без хранилища */ }
      if (saved) { const r = await Pro.verify(saved); if (r.ok) proLic = r.lic; }
      renderPro(saved && !proLic ? "Срок сохранённого кода закончился или код не подходит. Введите новый код." : "");
    })();
    // Банк не поддерживается: сразу читаем этот же файл для образца, без повторного выбора
    function offerSample(file) {
      anonStep = 1;
      showAnon(true);
      anonPickName(file);
      anonLoad(file);
    }
    function anonReset() {
      anon = null; anonMade = null; anonStep = 1;
      $("anonFile").value = ""; $("anonBank").value = ""; $("anonOk").checked = false; anonPickName(null);
      $("anonStatus").textContent = ""; $("anonMadeMsg").textContent = ""; $("anonLead").hidden = true;
      $("anonPage").replaceChildren();
    }
    async function anonLoad(f) {
      anon = null; anonMade = null;
      $("anonOk").checked = false;
      anonNextState();
      if (!f) return;
      $("anonStatus").textContent = "Читаю файл…";
      try {
        const isCsv = /\.csv$/i.test(f.name) || f.type === "text/csv";
        const isPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
        if (!isCsv && !isPdf) throw new Error("нужен PDF или CSV");
        if (f.size > 20 * 1024 * 1024) throw new Error("файл слишком большой");
        let model;
        if (isCsv) {
          model = Anon.fromCsvText(PriorCsvParser.decode(new Uint8Array(await f.arrayBuffer())));
        } else {
          const pdf = await notForever(openPdf(new Uint8Array(await f.arrayBuffer())));
          if (pdf.numPages > PDF_MAX_PAGES) throw new Error("в файле слишком много страниц для выписки");
          const pages = [];
          for (let p = 1; p <= pdf.numPages; p++) {
            const page = await notForever(pdf.getPage(p));
            const t = page.getViewport({ scale: 1 }).transform;
            const content = await notForever(page.getTextContent());
            pages.push(content.items.map(i => {
              const x = i.transform[4], y = i.transform[5];
              return { x: r2(x), y: r2(y), vx: r2(t[0] * x + t[2] * y + t[4]), vy: r2(t[1] * x + t[3] * y + t[5]), text: i.str };
            }));
          }
          if (!pages.some(pg => pg.some(i => i.text.trim()))) throw new Error("в PDF нет текста (скан или фото)");
          model = Anon.fromPdfPages(pages);
        }
        if (!model.length) throw new Error("файл пустой");
        anon = { model, kind: isCsv ? "csv" : "pdf", page: 0, seen: new Set() };
        $("anonStatus").textContent = "Готово: файл прочитан, он никуда не отправлялся. Нажмите «Далее».";
        anonRenderPage();
        anonNextState();
      } catch (err) {
        $("anonStatus").textContent = "Не получилось: " + (err && err.message ? err.message : err);
      }
    }
    function anonSampleJson() { return JSON.stringify(Anon.toSample(anon.model, anon.kind, { app: "v4.88", consent: ANON_CONSENT })); }
    // Копирование в буфер: современный способ, при отказе запасной
    async function copyText(text) {
      try { await Promise.race([navigator.clipboard.writeText(text), new Promise((_, no) => setTimeout(no, 1500))]); return true; } catch (e) { /* пробуем запасной путь */ }
      const ta = h("textarea", { style: "position:fixed;opacity:0" }); ta.value = text; document.body.append(ta); ta.select();
      let done = false;
      try { done = document.execCommand("copy"); } catch (e) { /* копирование недоступно */ }
      ta.remove();
      return done;
    }
    const anonMade_ = (how, msg) => { anonMade = how; $("anonMadeMsg").textContent = msg; anonPrepareMail(); anonNextState(); };
    $("anonDownload").addEventListener("click", () => {
      if (!anon || !$("anonOk").checked) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([anonSampleJson()], { type: "text/plain;charset=utf-8" }));
      a.download = "образец-выписки.txt";
      a.click();
      $("anonAfter").hidden = true;
      anonMade_("file", "Файл «образец-выписки.txt» скачан (папка «Загрузки», на iPhone: «Файлы»). Откройте письмо кнопками выше и приложите файл скрепкой.");
    });
    $("anonPeek").addEventListener("toggle", () => {
      if (!$("anonPeek").open || !anon) return;
      const t = Anon.toPlainText(anon.model);   // человеку читаемый текст, в письмо уходит полный образец с координатами
      $("anonPeekText").textContent = t.length > 4000 ? t.slice(0, 4000) + "\n… (дальше то же самое для остальных страниц)" : t;
    });
    // Письмо: тема, текст и ссылки на почтовые приложения. Текст зависит от способа: вставка (по умолчанию) или вложенный файл
    function anonPrepareMail() {
      const bank = $("anonBank").value.trim();
      const todo = anonMade === "file" ? "Приложите файл «образец-выписки.txt» (он скачался в папку загрузок)."
        : "Вставьте сюда скопированный образец: нажмите на это место и удерживайте, затем «Вставить».";
      const subj = "Образец выписки для нового банка" + (bank ? ": " + bank : ""), body = "Название банка: " + bank + "\n\n" + todo + "\n\n" + ANON_CONSENT;
      const q = (to, a, b, c) => `${a}=${encodeURIComponent(to)}&${b}=${encodeURIComponent(subj)}&${c}=${encodeURIComponent(body)}`;
      const ios = typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
      anonMailHref = "mailto:" + ANON_MAIL + "?subject=" + encodeURIComponent(subj) + "&body=" + encodeURIComponent(body);
      $("anonMail").href = anonMailHref;
      $("anonGmail").href = ios ? "googlegmail:///co?" + q(ANON_MAIL, "to", "subject", "body") : "https://mail.google.com/mail/?view=cm&fs=1&" + q(ANON_MAIL, "to", "su", "body");
      $("anonOutlook").href = ios ? "ms-outlook://compose?" + q(ANON_MAIL, "to", "subject", "body") : "https://outlook.live.com/mail/0/deeplink/compose?" + q(ANON_MAIL, "to", "subject", "body");
    }
    let anonMailHref = "";
    // Главная кнопка: копирует образец и открывает письмо; ниже появляется инструкция из трёх шагов
    $("anonSend").addEventListener("click", async () => {
      if (!anon || !$("anonOk").checked) return;
      anonMade = "copy"; anonPrepareMail();
      $("anonAfter").hidden = false; $("anonMadeMsg").textContent = "";
      const ok = await copyText(anonSampleJson());
      if (!ok) { $("anonAfter").hidden = true; $("anonMadeMsg").textContent = "Не удалось скопировать образец. Откройте «Если письмо не открылось», скачайте файл и приложите его к письму."; $("anonOther").open = true; }
      if (ok) window.location.href = anonMailHref;
    });
    // Кнопки почтовых приложений тоже копируют образец (если не выбран файл), чтобы его можно было вставить
    ["anonMail", "anonGmail", "anonOutlook"].forEach(id => $(id).addEventListener("click", () => {
      if (anonMade !== "file" && anon) { copyText(anonSampleJson()); anonMade = "copy"; $("anonAfter").hidden = false; }
    }));
    $("anonCopyMail").addEventListener("click", async () => { $("anonMailMsg").textContent = (await copyText(ANON_MAIL)) ? "Адрес скопирован." : "Не удалось скопировать: выделите адрес и скопируйте вручную."; });
    $("anonBack").addEventListener("click", () => anonGo(anonStep - 1));
    $("anonNext").addEventListener("click", () => { if (anonStep === 4) { anonReset(); closeSheets(); } else anonGo(anonStep + 1); });
    $("anonClose").addEventListener("click", closeSheets);

    // Разделы-экраны: один показан, остальные скрыты CSS по body[data-view]; «Настройки» объединяет данные, правила и выгрузку
    const TAB_ICONS = {
      overview: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
      review: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>',
      insights: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
      subs: '<path d="M20 11a8 8 0 0 0-14.3-4.6L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 13a8 8 0 0 0 14.3 4.6L20 15.5"/><path d="M20 20v-4.5h-4.5"/>',
      plan: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
      more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'
    };
    // «Назад» в браузере и на телефоне возвращает на прошлую вкладку, а не уводит с сайта
    function showSection(id, fromPop) {
      if (!fromPop && id !== curSection) { try { history.pushState({ fwSec: id }, ""); } catch (e) { /* без истории */ } }
      curSection = id;
      document.body.setAttribute("data-view", id);
      renderTabbar();
      try { window.scrollTo({ top: 0 }); } catch (e) { /* без прокрутки */ }
    }
    if (typeof window !== "undefined") window.addEventListener("popstate", e => {
      const v = document.body.getAttribute("data-view");
      if (!v || v === "none") return;   // отчёт не открыт: нечего переключать
      showSection(e.state && e.state.fwSec ? e.state.fwSec : "overview", true);
    });
    function renderTabbar() {
      const bar = $("tabbar");
      const todo = reviewOps + reviewOther;   // одно число везде: сколько операций можно уточнить (все месяцы)
      const btn = (id, label, short) => {
        const ico = h("span", { class: "tabico" });
        ico.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + TAB_ICONS[id] + "</svg>";
        const kids = [ico, short ? [h("span", { class: "l-f" }, label), h("span", { class: "l-s" }, short)] : h("span", {}, label)];
        if (id === "review" && todo) kids.push(h("span", { class: "tabbadge", "aria-label": `${todo} можно уточнить` }, todo > 99 ? "99+" : String(todo)));
        const attrs = { type: "button", class: id === curSection ? "active" : "", onclick: () => showSection(id) };
        if (id === curSection) attrs["aria-current"] = "page";
        return h("button", attrs, ...kids);
      };
      bar.replaceChildren(btn("overview", "Обзор"), btn("review", "Уточнить"), btn("subs", "Регулярные"), btn("plan", "Бюджет"), btn("more", "Настройки"));
    }
    $("insPeriod").addEventListener("click", () => showSection("overview"));
    $("dlBtn").addEventListener("click", () => $("expOps").click());
    $("planPeriod").addEventListener("click", () => showSection("overview"));
    $("subsPeriod").addEventListener("click", () => showSection("overview"));
    renderRules();
    renderMergeNote();
    // Пример отчёта на стартовом экране: те же кольцо и таблица, что в настоящем отчёте (на выдуманных числах).
    // Вид меняется только по нажатию: автосмена выглядела как самопроизвольный клик (убрана 9.11.2026).
    try {
      const mini = document.querySelector(".mini"), oldChart = mini && mini.querySelector(".minislot");
      if (mini && oldChart) {
        const rows = LANDING_SAMPLE;
        const st = { rows, total: Math.round(rows.reduce((a, r) => a + r[1], 0) * 100) / 100, own: 0, loan: 0, saved: 0 };
        const slot = h("div", { class: "minibody" });
        let cur = "recap";
        const views = {};
        const build = () => {
          views.recap = h("div", { class: "miniview" }, h("div", { class: "recap minirecap" },
            h("h3", {}, "Итог октября"), h("div", { class: "muted" }, "Сравнение со средним за 2 прошлых месяца"),
            h("div", { class: "rsave" }, LANDING_RECAP.save, h("small", {}, "можно было бы сохранить, если бы выросшие траты были на обычном уровне")),
            h("ul", {}, LANDING_RECAP.lines.map(([k, t]) => h("li", { class: "k-" + k }, t))),
            (() => {
              // Полоса «куда ушли деньги»: 4 крупнейшие категории и «остальное»
              const top = rows.slice(0, 4), rest = rows.slice(4).reduce((a, r) => a + r[1], 0);
              const parts = top.map(r => [r[0], r[1], catColor(r[0])]).concat(rest > 0 ? [["Остальное", rest, "var(--cat-other)"]] : []);
              return h("div", { class: "minibar" },
                h("div", { class: "muted" }, `Куда ушли ${Recap.money(st.total)} ${CUR}`),
                h("div", { class: "mbar", role: "img", "aria-label": parts.map(p => `${p[0]} ${Math.round(p[1] / st.total * 100)}%`).join(", ") },
                  ...parts.map(p => h("i", { style: `flex:${p[1]};background:${p[2]}` }))),
                h("ul", { class: "mlegend" }, parts.map(p => h("li", {}, h("i", { style: `background:${p[2]}` }), `${p[0]} ${Math.round(p[1] / st.total * 100)}%`))));
            })()));
          views.pie = h("div", { class: "miniview" }, pieChart(st, { pull: "Кафе и рестораны", pick: "Кафе и рестораны" }));
          views.table = h("div", { class: "miniview" }, catTable(st));
          slot.replaceChildren(views.recap, views.pie, views.table);
          show(cur);
        };
        const btns = {};
        const show = v => {
          cur = v;
          Object.keys(views).forEach(k => { views[k].classList.toggle("on", k === v); views[k].inert = k !== v; });
          Object.keys(btns).forEach(k => { btns[k].classList.toggle("active", k === v); btns[k].setAttribute("aria-pressed", k === v ? "true" : "false"); });
        };
        const mk = (id, label) => { const b = h("button", { type: "button", "aria-pressed": "false" }, label); b.addEventListener("click", () => show(id)); btns[id] = b; return b; };
        const sw = h("div", { class: "viewswitch" }, mk("recap", "Итог"), mk("pie", "Диаграмма"), mk("table", "Таблица"));
        oldChart.before(sw, slot);
        oldChart.remove();   // заглушка больше не нужна: иначе она оставляет пустое место под примером
        build();
        try { mini.classList.add("ready"); } catch (e) { /* без класса */ }
        // Смена темы: цвета подписей на кольце считаются при построении, поэтому пересобираем
        new MutationObserver(() => build()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
      }
    } catch (e) { try { console.warn("Пример на главной не построился"); const m = document.querySelector(".mini"); if (m) { m.hidden = true; m.classList.add("ready"); } } catch (e2) { /* без примера */ } }
