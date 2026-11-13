    // ---------- Демо-режим: выдуманные данные, ничего не сохраняется и настоящий разбор не трогается ----------
    let demoMode = false;
    let stash = null;                                // настоящие данные, пока открыто демо

    // ---------- Сохранённые пользователем категории (только в браузере) ----------
    // Значение другого вида, чем ожидалось (например, {} вместо списка), считаем повреждённым и берём запасное
    const sameKind = (v, fb) => fb === null || (Array.isArray(fb) ? Array.isArray(v) :
      typeof fb === "object" ? v !== null && typeof v === "object" && !Array.isArray(v) : typeof v === typeof fb);
    function loadJSON(key, fallback) {
      try { const v = JSON.parse(localStorage.getItem(key)); return v != null && sameKind(v, fallback) ? v : fallback; } catch (e) { return fallback; }
    }
    function saveJSON(key, value) {
      if (demoMode && !/theme|view/.test(key)) return;   // в демо сохраняем только тему и вид диаграммы
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* хранилище недоступно: работаем без него */ }
    }
    let userRules = loadJSON("ba_rules_v1", {});   // ключ магазина -> категория
    let customCats = loadJSON("ba_cats_v1", []).filter(c => typeof c === "string" && c);   // добавленные пользователем категории
    let txNotes = loadJSON("ba_notes_v1", {});     // заметки к операциям: id операции -> текст до 200 знаков, «#тег» внутри работает как метка
    const noteOf = tx => txNotes[txId(tx)] || "";
    let splits = Splits.cleanMap(loadJSON("ba_splits_v1", {}));   // разделение операции: id -> части {a: сумма, c: категория}, остаток остаётся в исходной категории
    let condRules = CondRules.cleanList(loadJSON("ba_condrules_v1", []));   // правила с условиями: текст + сумма -> категория
    let txRules = loadJSON("ba_txrules_v1", {});   // выбор для одной конкретной операции
    let customIcons = loadJSON("ba_icons_v1", {}); // значки своих категорий
    let customColors = loadJSON("ba_catcolors_v1", {}); // цвета своих категорий (ключ из CUSTOM_KEYS)
    let acctNames = loadJSON("ba_acctnames_v1", {}); // подписи счетов получателей: «последние 4 цифры-хэш» -> название (только в браузере)
    const tailUndo = [];                             // группы, отправленные «хвостом» в «Прочее»: можно отменить
    const ownUndo = [];                              // недавно отмеченные «Это мой счёт»: их можно отменить, пока страница открыта
    let rates = Rates.clean(loadJSON("ba_rates_v1", {}));   // ручной курс: { USD: BYN за 1 USD }
    let budgets = loadJSON("ba_budget_v1", {});    // лимиты на месяц по категориям
    let calc = loadJSON("ba_calc_v1", {});         // значения, которые пользователь ввёл в «Сколько остаётся»
    const openKeys = new Set();                    // группы, где пользователь раскрыл «Операции по отдельности» (по умолчанию свёрнуты, чтобы список был короче)
    let recurring = new Map();                     // повторяющиеся суммы (см. findRecurring)
    let bottomOpen = true;                         // список в разделе «Разобрать» всегда развёрнут (раздел и есть экран)
    let curSection = "overview";                   // открытый раздел: overview | review | insights | subs | plan | more
    let bottomTab = null;                          // нижняя вкладка: "review" или "all" (null: выбрать при первой отрисовке)
    let reviewOther = 0;                           // сколько неразобранных операций в других месяцах
    let incomeGroups = 0;                            // сколько групп неопознанных поступлений ждут отметки
    let reviewSum = 0, periodSpend = 0, periodUnclear = 0, reviewTrSum = 0;   // reviewTrSum: из неразобранного переводы на карты и счета             // сумма неразобранных трат и всех трат за выбранный период
    let reviewOps = 0, reviewGroups = 0;                             // сколько операций ещё нужно разобрать
    let activeTab = "all";                         // выбранная вкладка трат: "all" или месяц вида "2026-09"
    let summaryView = loadJSON("ba_view_v1", "pie"); // «table» или «pie»
    let allCat = "all";                            // категория, поднятая наверх списка ("all": ничего не поднято)
    const PAGE_ROWS = 200, PAGE_GROUPS = 20, REVIEW_GROUPS = 10;       // сколько строк и групп показываем сразу (остальное по кнопке): так страница не тормозит на больших выписках
    let allLimit = PAGE_ROWS, allLimitKey = "";
    let reviewLimit = REVIEW_GROUPS, reviewLimitKey = null, tailShown = false;
    let incomeLimit = PAGE_GROUPS, incomeLimitKey = null;
    let allFilt = Filters.empty();                 // поиск и фильтры списка (текст, расходы/поступления, сумма); только в сессии
    let allSort = "date-desc";                     // порядок строк там же

    // Убранные категории: стираем старые выборы с ними, эти операции вернутся на разбор
    const RETIRED = ["Дом", "Вернули долг"];   // («Накопления» теперь стандартная категория, ниже она сливается со своей)
    for (const store of [userRules, txRules]) {
      for (const k of Object.keys(store)) if (RETIRED.includes(store[k])) delete store[k];
    }
    customCats = customCats.filter(c => !RETIRED.includes(c));
    // Свои категории-двойники стандартных (например «Подарки») сливаем со стандартными.
    // Что именно слито, запоминаем: пользователь видит уведомление и может вернуть как было.
    let keepCats = loadJSON("ba_keepcats_v1", []).filter(c => typeof c === "string");        // имена, которые пользователь велел не сливать
    let mergeNote = loadJSON("ba_mergenote_v1", []);      // [{from, to, entries:[{s, k}]}]
    function mergeDuplicateCats() {
      const target = c => keepCats.includes(c) ? c : Cat.canonical(c);
      const found = new Map();                            // "from→to" -> запись уведомления
      const note = (from, to) => { const id = from + "\u0000" + to; if (!found.has(id)) found.set(id, { from, to, entries: [] }); return found.get(id); };
      for (const [tag, store] of [["u", userRules], ["t", txRules]]) {
        for (const k of Object.keys(store)) {
          const to = target(store[k]);
          if (to !== store[k]) { note(store[k], to).entries.push({ s: tag, k }); store[k] = to; }
        }
      }
      customCats.forEach(c => { const to = target(c); if (to !== c) note(c, to); });
      customCats = [...new Set(customCats.map(target))].filter(c => keepCats.includes(c) || !Cat.DEFAULT_CATEGORIES.includes(c));
      for (const f of found.values()) {
        const prev = mergeNote.find(n => n.from === f.from && n.to === f.to);
        if (prev) prev.entries.push(...f.entries); else mergeNote.push(f);
      }
      if (found.size) saveJSON("ba_mergenote_v1", mergeNote);
    }
    function undoMerge() {
      for (const n of mergeNote) {
        for (const e of n.entries) { const store = e.s === "u" ? userRules : txRules; if (store[e.k] === n.to) store[e.k] = n.from; }
        if (!keepCats.includes(n.from)) keepCats.push(n.from);
        if (!customCats.includes(n.from)) customCats.push(n.from);
      }
      mergeNote = [];
      saveJSON("ba_keepcats_v1", keepCats); saveJSON("ba_mergenote_v1", mergeNote);
      saveJSON("ba_rules_v1", userRules); saveJSON("ba_txrules_v1", txRules); saveJSON("ba_cats_v1", customCats);
      renderMergeNote();
      if (txs.length) render();
    }
    function renderMergeNote() {
      const box = $("mergeNote");
      if (!box) return;
      box.replaceChildren();
      if (!mergeNote.length) { box.hidden = true; return; }
      box.hidden = false;
      box.append(h("b", {}, "Ваши категории объединены со стандартными, чтобы не было двойников."),
        h("ul", {}, ...mergeNote.map(n => h("li", {}, `«${n.from}» → «${n.to}»` + (n.entries.length ? ` (операций и правил: ${n.entries.length})` : "")))),
        h("button", { type: "button", onclick: () => { mergeNote = []; saveJSON("ba_mergenote_v1", mergeNote); renderMergeNote(); } }, "Понятно"), " ",
        h("button", { type: "button", onclick: undoMerge }, "Вернуть как было"));
    }
    mergeDuplicateCats();
    saveJSON("ba_rules_v1", userRules); saveJSON("ba_txrules_v1", txRules); saveJSON("ba_cats_v1", customCats);

    let txs = [];
    // Единица показа сумм. Обычно BYN. Счёт в валюте без курса: валюта счёта (цифры точные, курс для этого не нужен).
    // Смесь валют без курса: складывать их нельзя, поэтому в txs остаётся одна выбранная валюта, а операции в остальных ждут в parked.
    let CUR = "BYN", curUnits = ["BYN"], curPick = null, parked = [];
    const unitOf = t => (t && typeof t.cur === "string" && !t.rate ? t.cur : "BYN");
    function unpark() { if (parked.length) { txs = txs.concat(parked); parked = []; } }
    function splitByCurrency() {
      unpark();
      const n = new Map();
      txs.forEach(t => n.set(unitOf(t), (n.get(unitOf(t)) || 0) + 1));
      curUnits = [...n.keys()].sort((a, b) => (a === "BYN" ? -1 : b === "BYN" ? 1 : a < b ? -1 : 1));
      if (curUnits.length <= 1) { CUR = curUnits[0] || "BYN"; curPick = null; return; }
      if (!curUnits.includes(curPick)) curPick = curUnits.slice().sort((a, b) => n.get(b) - n.get(a))[0];   // сначала та валюта, где больше операций
      CUR = curPick;
      parked = txs.filter(t => unitOf(t) !== CUR); txs = txs.filter(t => unitOf(t) === CUR);
    }
    let tabYear = null;                            // год, чьи месяцы показаны во вкладках
    let header = {};
    let statements = [];                           // загруженные выписки: банк, период, число операций, сверка итогов

    const $ = id => document.getElementById(id);
    // Один порядок с вкладками «где взять выписку»: по популярности, Беларусбанк первым
    const BANK_ORDER = ["belarusbank", "mtbank", "mtb", "vtb", "prior", "sber", "alfa", "belinvest"];
    const bankRank = b => { const i = BANK_ORDER.indexOf(b.id); return i < 0 ? BANK_ORDER.length : i; };
    const bankNames = Banks.BANKS.slice().sort((a, b) => bankRank(a) - bankRank(b)).map(b => b.name).join(", ");
    $("faqBanks").textContent = "Точно читаются: " + bankNames + ". Вашего банка нет в списке? Всё равно загрузите выписку (PDF, CSV или Excel): сайт сам найдёт колонки, покажет первые операции и проверит, сошлись ли суммы с итогами выписки. Если не получится, он скажет об этом, а не покажет неверные цифры.";

    // Пример на главной = последний месяц постоянного демо (Demo.make без зерна). test_render.js сверяет эти числа с демо.
    const LANDING_SAMPLE = [["Аренда и жильё", 700], ["Продукты", 367.17], ["Кафе и рестораны", 285.64], ["Наличные", 100], ["Не разобрано", 81.3], ["Транспорт", 55.65], ["Связь и подписки", 36.59], ["Развлечения", 18], ["Комиссии банка", 3]];
    // «Итог месяца» в примере на главной: те же выводы, что в демо за этот месяц (сверяет test_render.js)
    const LANDING_RECAP = { save: "+207 BYN", lines: [["total", "Всего потрачено 1 647 BYN: на 11% больше обычного"], ["grew", "Кафе и рестораны: 286 BYN, в 3,6 раза больше обычного"], ["subs", "Связь и подписки: 36,59 BYN в месяц, это 439 BYN в год (2 платежа)"], ["small", "Мелкие покупки до 10 BYN: 23 штуки на 141 BYN"]] };
    // Счётчик посещений (GoatCounter): только «страницу открыли» и 3 события без данных выписки.
    // Работает лишь на настоящем сайте, без cookies; уважает «Не отслеживать». Сумм, имён, файлов здесь нет и быть не может.
    const STATS_URL = "https://bankanalyzer.goatcounter.com/count";
    function statsPing(name) {
      try {
        if (typeof location === "undefined" || location.hostname !== "fernwood.by") return;
        if (typeof navigator !== "undefined" && (navigator.doNotTrack === "1" || navigator.webdriver)) return;
        const once = "ba-stat-" + (name || "visit");
        try { if (sessionStorage.getItem(once)) return; sessionStorage.setItem(once, "1"); } catch (e) { /* без памяти вкладки: считаем как есть */ }
        const q = name
          ? "p=" + encodeURIComponent(name) + "&e=true"
          : "p=" + encodeURIComponent(location.pathname) + "&r=" + encodeURIComponent((document.referrer || "").replace(/^(https?:\/\/[^/]+).*$/, "$1")) + "&s=" + (screen.width | 0);
        new Image().src = STATS_URL + "?" + q + "&rnd=" + Math.random().toString(36).slice(2, 8);
      } catch (e) { /* счётчик никогда не мешает сайту */ }
    }
    if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("load", () => statsPing(""));
    function enterDemo(lastMonth) {
      const wasDemo = demoMode;
      if (!demoMode) unpark();
      if (!demoMode) stash = { splits, condRules, txNotes, userRules, txRules, customCats, customIcons, customColors, acctNames, budgets, calc, txs, header, statements, allCat, allFilt, allSort, activeTab, bottomTab };
      demoMode = true;
      document.body.classList.add("demo");
      try { document.querySelectorAll("#app > .morecard").forEach(c => { c.inert = true; c.setAttribute("aria-disabled", "true"); }); } catch (e) { /* без inert */ }   // в демо карточки «Настройки» видны, но неактивны
      userRules = {}; txRules = {}; splits = {}; condRules = []; txNotes = {}; customCats = []; customIcons = {}; customColors = {}; acctNames = {}; budgets = {}; calc = {};
      ownUndo.length = 0;
      const d = Demo.make(undefined, new Date());
      txs = d.txs; header = d.header;
      // В демо перевод на накопительный счёт отмечен как «Накопления», а план накоплений выставлен в 10% (чтобы блок был наполнен)
      d.txs.forEach(t => { if (/накопительн/i.test(t.details || "")) userRules[Cat.merchantKey(t)] = Cat.SAVINGS; });
      calc = { saveVal: 10 };
      statements = [{ bank: "demo", bankName: "Демо", from: d.header.from, to: d.header.to, count: d.txs.length, added: d.txs.length, skipped: 0, check: null }];
      allCat = "all"; allFilt = Filters.empty(); allSort = "date-desc"; bottomTab = null;
      if (!wasDemo) { activeTab = "all"; curSection = "overview"; }
      if (lastMonth) { activeTab = d.header.to.slice(0, 7); curSection = "overview"; }   // «Посмотреть такой отчёт»: открыть тот же месяц, что в примере   // при повторном нажатии выбранный месяц остаётся (если такого месяца нет, render сам вернёт «весь период»)
      openKeys.clear();
      render();
    }
    // Выход из демо: возвращаем то, что было открыто до него (или начальный экран)
    function leaveDemo() {
      if (!demoMode) return;
      demoMode = false;
      document.body.classList.remove("demo"); $("demoBtn").textContent = "Посмотреть на примере";
      try { document.querySelectorAll("#app > .morecard").forEach(c => { c.inert = false; c.removeAttribute("aria-disabled"); }); } catch (e) { /* без inert */ }
      ({ splits, condRules, txNotes, userRules, txRules, customCats, customIcons, customColors, acctNames, budgets, calc, txs, header, statements, allCat, allFilt, allSort, activeTab, bottomTab } = stash);
      stash = null;
      ownUndo.length = 0;
      openKeys.clear();
      if (txs.length) render();
      else { hideReport(); $("demoBar").hidden = true; $("dataRules").hidden = false; $("clearBtn").hidden = true; }
    }
    function hideReport() { $("report").hidden = true; $("exportBox").hidden = true; $("setDl").hidden = true; document.body.setAttribute("data-view", "none"); curSection = "overview"; }
    const scrollTo = id => { try { $(id).scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { /* без прокрутки */ } };
    // Демо: сразу показываем результат (плашка демо, вкладки, таблица трат), а не начало страницы анализа
    $("miniDemoBtn").addEventListener("click", () => { enterDemo(true); try { window.scrollTo({ top: 0 }); } catch (e) { /* без прокрутки */ } });
    $("demoBtn").addEventListener("click", () => { statsPing("открыл-пример"); enterDemo(); try { window.scrollTo({ top: 0 }); } catch (e) { /* без прокрутки */ } });
    $("startBtn").addEventListener("click", () => { $("file").click(); });
    $("demoOwn").addEventListener("click", () => { $("file").click(); });   // из демо сразу к своей выписке (демо закроется, когда файл выбран)
    // Перетаскивание файла на карточку загрузки (ПК); на телефоне работает кнопка «Выбрать файл»
    const dz = $("dropzone");
    dz.addEventListener("dragover", e => { e.preventDefault(); dz.className = "upcard drag"; });
    dz.addEventListener("dragleave", () => { dz.className = "upcard"; });
    dz.addEventListener("drop", e => {
      e.preventDefault(); dz.className = "upcard";
      try { const fl = e.dataTransfer && e.dataTransfer.files; if (fl && fl.length) { $("file").files = fl; $("file").dispatchEvent(new Event("change")); } } catch (err) { /* старый браузер: используйте кнопку */ }
    });
    // Шторки «Приватность» и «Как получить выписку»: Esc, клик по фону и кнопка «Понятно» закрывают, фокус возвращается на кнопку
    const SHEETS = ["privSheet", "howSheet", "anonSheet", "fbSheet", "faqSheet", "shareSheet", "catSheet", "newCatSheet"];
    let sheetOpener = null;
    function setStatus(t) { $("status").textContent = t; $("landStatus").textContent = t; }
    function openSheet(id, opener) { sheetOpener = opener; $(id).hidden = false; try { $(id).querySelector(".modalcard").focus(); } catch (e) { /* без фокуса */ } }
    function closeSheets() { SHEETS.forEach(id => { $(id).hidden = true; }); try { if (sheetOpener) sheetOpener.focus(); } catch (e) { /* без фокуса */ } sheetOpener = null; }
    $("importLand").addEventListener("click", () => $("importBtn").click());
    [["privRow", "privSheet"], ["howRow", "howSheet"]].forEach(([b, sh]) => $(b).addEventListener("click", () => openSheet(sh, $(b))));
    ["privClose", "howClose"].forEach(b => $(b).addEventListener("click", closeSheets));
    $("howRow").addEventListener("click", () => showHowList());
    $("privFaq").addEventListener("click", () => { SHEETS.forEach(id => { $(id).hidden = true; }); sheetOpener = null; });
    SHEETS.forEach(id => $(id).addEventListener("click", e => { if (e.target === $(id)) closeSheets(); }));
    // Вопросы лежат на стартовом экране, а после загрузки выписки он скрыт: тогда ссылка «Приватность и частые вопросы» открывает их в окне (копия блока)
    $("faqClose").addEventListener("click", closeSheets);
    [...(document.querySelectorAll ? document.querySelectorAll('a[href="#faq"]') : [])].forEach(a => a.addEventListener("click", e => {
      if ($("faq").getBoundingClientRect().height > 0) return;     // экран виден: обычный переход к вопросам
      e.preventDefault();
      const nodes = [];
      for (let n = $("faq"); n; n = n.nextElementSibling) { const c = n.cloneNode(true); c.removeAttribute("id"); nodes.push(c); }
      $("faqBody").replaceChildren(...nodes);
      SHEETS.forEach(id => { $(id).hidden = true; });
      openSheet("faqSheet", a.id === "privFaq" ? $("privRow") : a);
    }));
    // «Что не так?»: письмо без данных выписки (версия, банки, число операций, размер экрана) и текст самого человека
    const FB_VERSION = "v4.88";
    { const vs = document.getElementById("verStamp"); if (vs) vs.textContent = FB_VERSION; }
    // В письмо идут только названия банков из нашего списка; у банка не из списка лишь слово с «банк» (рядом в шапке бывает фамилия)
    const FB_KNOWN_BANKS = Banks.BANKS.map(b => b.name).concat([Banks.OTHER.name, "Выписка"]);
    function fbInfo() {
      return { version: FB_VERSION, banks: demoMode ? [] : [...new Set(statements.map(st => Feedback.bankLabel(st.bankName, FB_KNOWN_BANKS)).filter(Boolean))], count: demoMode ? 0 : txs.length,
        unread: demoMode ? 0 : statements.reduce((a, st) => a + (st.unread ? st.unread.length : 0), 0), mismatch: !demoMode && statements.some(st => st.check && st.check.headerIncome != null && !st.check.ok),
        section: document.body.getAttribute("data-view") || "none", width: window.innerWidth, height: window.innerHeight,
        theme: document.documentElement.getAttribute("data-theme") === "dark" || (document.documentElement.getAttribute("data-theme") !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light" };
    }
    function fbRefresh() {
      const m = Feedback.buildMail($("fbTopic").value, $("fbText").value, fbInfo());
      $("fbMail").href = m.href;
      $("fbPreview").textContent = m.body.slice(m.body.indexOf("— Техническая"));
    }
    $("fbTopic").replaceChildren(...Feedback.TOPICS.map(t => h("option", { value: t.id }, t.label)));
    ["fbOpen", "fbOpen2", "fbOpen4"].forEach(b => $(b).addEventListener("click", () => { $("fbMsg").textContent = ""; fbRefresh(); openSheet("fbSheet", $(b)); }));
    $("fbClose").addEventListener("click", closeSheets);
    $("fbTopic").addEventListener("change", fbRefresh);
    $("fbText").addEventListener("input", fbRefresh);
    $("fbCopy").addEventListener("click", async () => { $("fbMsg").textContent = (await copyText(Feedback.MAIL)) ? "Адрес скопирован: " + Feedback.MAIL : "Не удалось скопировать. Адрес: " + Feedback.MAIL; });

    if (document.addEventListener) document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheets(); });
    // Tab и Shift+Tab не выходят из открытого окна: с последнего элемента фокус переходит на первый и обратно.
    // Возвращает, куда перевести фокус, или null (внутри списка браузер переводит фокус сам).
    function nextFocus(list, current, back) {
      if (!list.length) return null;
      const i = list.indexOf(current);
      if (i === -1) {   // фокус на самом окне или на прокручиваемой области (Chrome даёт ей фокус): ближайший элемент дальше / раньше по документу
        const pos = el => current && current.compareDocumentPosition ? current.compareDocumentPosition(el) : 0;
        const to = back ? list.filter(el => pos(el) & 2).pop() : list.find(el => pos(el) & 4);
        return to || (back ? list[list.length - 1] : list[0]);
      }
      if (back && i === 0) return list[list.length - 1];
      if (!back && i === list.length - 1) return list[0];
      return null;
    }
    const FOCUSABLE = 'summary, a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const openModal = () => ["uniSheet", ...SHEETS, "resetBox"].map(id => $(id)).find(el => el && !el.hidden) || null;
    if (document.addEventListener) document.addEventListener("keydown", e => {
      if (e.key !== "Tab") return;
      const m = openModal();
      if (!m) return;
      const list = [...m.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length && !el.closest("[hidden]"));
      const to = nextFocus(list, document.activeElement, e.shiftKey);
      if (to) { e.preventDefault(); to.focus(); }
    });
    // Печать: перед печатью раскрываем свёрнутые блоки открытого раздела, после возвращаем как было
    let printOpened = [];
    // Выпадающие списки при печати скрыты: рядом ставим выбранное значение текстом (Н5, иначе в колонке «Категория» пусто)
    function printPrepare() {
      printOpened = [...document.querySelectorAll("#report details:not([open])")]; printOpened.forEach(d => d.setAttribute("open", ""));
      document.querySelectorAll("#report td select").forEach(sel => { const o = sel.options[sel.selectedIndex]; if (o && o.value) sel.after(h("span", { class: "printval" }, o.textContent)); });
    }
    function printRestore() { printOpened.forEach(d => d.removeAttribute("open")); printOpened = []; document.querySelectorAll(".printval").forEach(e => e.remove()); }
    if (typeof window !== "undefined" && window.addEventListener) { window.addEventListener("beforeprint", printPrepare); window.addEventListener("afterprint", printRestore); }
    $("printBtn").addEventListener("click", () => { try { window.print(); } catch (e) { alert("Не удалось открыть печать. Нажмите Ctrl+P (на телефоне: меню браузера → «Печать»)."); } });
    $("clearBtn").addEventListener("click", () => {
      txs = []; parked = []; curPick = null; header = {}; statements = [];
      bottomTab = null; allCat = "all"; allFilt = Filters.empty(); activeTab = "all";
      hideReport(); $("clearBtn").hidden = true;
      forgetDeviceCopy();
      setStatus("Выписки убраны" + (keepOnDevice ? ", копия на этом устройстве стёрта" : "") + ". Ваш выбор категорий сохранён.");
      $("backupMsg").textContent = backupSummary();
    });
    $("demoExit").addEventListener("click", () => { leaveDemo(); try { window.scrollTo({ top: 0 }); } catch (e) { /* без прокрутки */ } });

