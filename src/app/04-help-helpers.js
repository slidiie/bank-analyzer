    // ---------- «Как получить выписку»: список банков Беларуси, у каждого шаги, срок и ссылка на страницу самого банка ----------
    // Сведения из открытых материалов банков (ноябрь 2026); reads: сайт умеет читать выписки этого банка. link: страница банка, откуда взяты шаги.
    const BANK_HELP = [
      { id: "belarusbank", name: "Беларусбанк", reads: true,
        app: ["Приложение M-Belarusbank: раздел «Финансы» («Мои финансы»), нажмите на счёт, вкладка «Сервисы», «Выписка по счету». Можно заказать за период или за месяц."], appSure: true,
        how: ["Интернет-банкинг: в списке счетов выберите счёт и нажмите значок «Получить отчёт об операциях по счёту», задайте период (не больше 90 календарных дней), отчёт можно сохранить в PDF.", "Мини-выписка по карточке: 10 операций за 7 дней (для нашего сайта мало, нужен отчёт за период).", "Ежемесячную выписку на e-mail можно подключить в интернет-банкинге (услуга «Выписка по счету»). Мобильное приложение называется M-Belarusbank."],
        wait: "В интернет-банкинге сразу. Период в отчёте не больше 90 дней: для длинной истории возьмите несколько выписок подряд.",
        link: ["https://belarusbank.by/fizicheskim_licam/cards/informatsiya_ob_ostatke_i_dvizhenii_denezhnykh_sredstv_po_schetu/", "Беларусбанк: информация об остатке и движении средств по счёту"] },
      { id: "mtbank", name: "МТБанк", reads: true,
        app: ["Приложение Moby: вкладка «Операции» показывает все поступления и списания по счёту.", "Выписку за любой период в PDF ищите в карточке счёта в Moby, пункт «Выписка». Название пункта зависит от версии приложения."], appSure: true,
        how: ["В приложении Moby вкладка «Операции» показывает все поступления и списания по счёту (транзакционная выписка).", "Для ряда карт («Куфар», «Кактус», «Шоппер») есть «Выписка по карте на e-mail»: приходит в начале месяца, если почта указана в Moby.", "Выписку за любой период в PDF ищите в карточке счёта в Moby или в интернет-банке «Мой банк», пункт «Выписка». Название пункта зависит от версии приложения."],
        web: ["Интернет-банк «Мой банк» на сайте банка (в браузере компьютера или телефона): выписка за нужный период, по опыту пользователей, делается сразу. Ищите пункт «Выписка» в карточке счёта; название зависит от версии."],
        appSlow: "В приложении выписка за период может готовиться заметно дольше, чем на сайте. Не ждите: возьмите её на сайте банка.",
        wait: "На сайте банка сразу. Выписка на e-mail приходит раз в месяц, в начале следующего.",
        link: ["https://www.mtbank.by/upload/docs/mybank/mob_bank_instruction.pdf", "МТБанк: инструкция по мобильному банку «Мой банк»"] },
      { id: "vtb", name: "ВТБ (Беларусь)", reads: true,
        app: ["Мобильное приложение (М-банкинг): раздел «Выписка» по карточке или счёту. Там видны и операции, ещё не отражённые по счёту, за последние 30 календарных дней."], appSure: true,
        how: ["Интернет-банк и М-банкинг: раздел «Выписка» по карточке или счёту. Там видны и операции, ещё не отражённые по счёту (например, заблокированные суммы), за последние 30 календарных дней.", "Банкомат: мини-выписка на чеке (10 последних операций).", "Отделение при личном обращении; ежемесячная выписка по счёту может приходить на e-mail, если это указано в заявлении. Через интернет-банк можно заказать и банковские справки."],
        wait: "В интернет-банке и приложении сразу.",
        link: ["https://www.vtb.by/chastnym-licam/internet-bank/internet-bank-new_0", "ВТБ (Беларусь): интернет-банк"] },
      { id: "prior", name: "Приорбанк", reads: true,
        app: ["Приложение Prior Online, раздел «История»: значок фильтра справа вверху (продукт, тип операции, период) показывает операции.", "Официальная выписка: «Еще» → «Заявки на продукты» → «Заказ документов» → «Заказ справок и выписок», тип «Выписка по счету»."], appSure: true,
        how: ["Бесплатно ли: по данным банка, выписка по счёту бесплатна."],
        web: ["Интернет-банк Prior Online на сайте банка (prior.by), в браузере компьютера или телефона, не в приложении: нажмите на нужную карту, раздел «Выписка» → «Выписка по счету», задайте период. Выписка формируется сразу, ждать не нужно."],
        appSlow: "Выписка, заказанная в приложении («Еще» → «Заявки на продукты» → «Заказ документов» → «Заказ справок и выписок»), по данным банка готовится до 2 рабочих дней. Пока ждёте, не забудьте про сайт: там она готова сразу.",
        wait: "На сайте банка сразу. По заявке в приложении ждать придётся (может быть до двух дней). Если банк предлагает выписку и в CSV, берите CSV: в нём есть код магазина, и категории определяются точнее, чем по PDF.",
        link: ["https://www.priorbank.by/offers/services/mobile-applications/zakaz-documentov", "Приорбанк: заказ справок и выписок в Prior Online"] },
      { id: "bps", name: "Сбер Банк", reads: true,
        app: ["Приложение СберБанк Онлайн: выписки за прошлые периоды доступны не везде. Если нужного пункта нет, откройте веб-версию СберБанк Онлайн в браузере телефона."], appSure: false,
        how: ["Веб-версия СберБанк Онлайн: откройте карту, выберите «Банковская выписка» и задайте период в календаре. По данным банка, выписка бесплатна.", "Ежемесячная выписка на e-mail бесплатна."],
        wait: "В веб-версии сразу.",
        link: ["https://www.sber-bank.by/page/online-bank-whatKnow", "Сбер Банк: полезная информация о СберБанк Онлайн"] },
      { id: "belapb", name: "Белагропромбанк", reads: false,
        app: ["В мобильном приложении выписку за период мы найти не смогли: банк описывает её только для интернет-банкинга. Откройте интернет-банкинг в браузере телефона."], appSure: false,
        how: ["Интернет-банкинг: раздел «Карточки» → «Получить выписку по карточкам», период не больше 3 месяцев. Сохранить можно в Word или Excel, PDF бывает не всегда.", "Быстро: двойной клик по карточке в виджете «Карточки» даёт выписку за последнюю календарную неделю. Мини-выписка платная.", "Ежемесячную выписку на e-mail подключают в «Карточки» → «Управление услугами»."],
        wait: "В интернет-банкинге сразу. Операции отражаются по счёту с задержкой до нескольких дней.",
        link: ["https://www.belapb.by/upload/sprint.editor/995/4iqmvuqqpa62pa62rdaq4pc636v9db4t/IB.PDF.pdf", "Белагропромбанк: инструкция по системе «Интернет-банкинг»"] },
      { id: "alfa", name: "Альфа-Банк", reads: true, fresh: true,
        app: ["Мобильное приложение: откройте счёт, пункт выписки, период. Выписку можно скачать, отправить на e-mail или поделиться (для карты шаги могут немного отличаться)."], appSure: true,
        how: ["Интернет-банк «Альфа-Клик»: слева выберите счёт, затем карту в блоке «Все карты к счёту», в «Действиях с картой» нажмите «Выписка», задайте период и «Применить», затем «Скачать PDF».", "Мобильное приложение: откройте счёт, пункт выписки, период; выписку можно скачать, отправить на e-mail или поделиться (для карты шаги могут немного отличаться)."],
        wait: "Сразу, в интернет-банке и приложении.",
        link: ["https://help.alfabank.by/hc/ru/articles/360000303298-%D0%9A%D0%B0%D0%BA-%D0%BF%D0%BE%D0%BB%D1%83%D1%87%D0%B8%D1%82%D1%8C-%D0%B2%D1%8B%D0%BF%D0%B8%D1%81%D0%BA%D1%83-%D0%BF%D0%BE-%D0%BA%D0%B0%D1%80%D1%82%D0%B5-%D0%B2-%D0%90%D0%BB%D1%8C%D1%84%D0%B0-%D0%9A%D0%BB%D0%B8%D0%BA-", "Альфа-Банк: как получить выписку по карте в «Альфа-Клик»"] },
      { id: "bnb", name: "БНБ-Банк", reads: false,
        app: ["Приложение «Искра»: «Продукты» → карта → «Выписка по карте», период и тип операций (все, доходы, расходы), затем «Сформировать».", "Выписку можно посмотреть или отправить на e-mail."], appSure: true,
        how: ["Приложение «Искра»: «Продукты» → карта → «Выписка по карте», задайте период и тип операций (все, доходы, расходы), нажмите «Сформировать».", "Выписку можно посмотреть или отправить на e-mail. По словам банка, она получает печать и статус официального документа.", "Раздел «История»: операции по всем продуктам с фильтрами по периоду, сумме, валюте."],
        wait: "Сразу, в приложении.",
        link: ["https://bnb.by/o-lichnom/faq/nastrojki-i-vozmozhnosti-karty-1-2-3/", "БНБ-Банк: настройки и возможности карты 1-2-3"] },
      { id: "reshenie", name: "Банк «Решение»", reads: false,
        app: ["Мобильное приложение: «Карточки» → «Выписка», задайте период. Мини-выписка охватывает не больше 7 календарных дней."], appSure: true,
        how: ["Мобильное приложение: «Карточки» → «Выписка», задайте период. Мини-выписка охватывает не больше 7 календарных дней.", "Выписки по зарплатным карточкам иногда приходят на e-mail бесплатно, но банк предупреждал, что рассылка за отдельные месяцы могла не работать: тогда возьмите выписку в приложении."],
        wait: "В приложении сразу.",
        link: ["https://rbank.by/news/vnimaniyu_klientov_derzhateley_bankovskikh_kartochek_vypiska/", "Банк «Решение»: о выписках по банковским карточкам"] },
      { id: "paritet", name: "Паритетбанк", reads: false,
        app: ["Мобильный банк: «Главная» → выберите счёт → значок «i» → «Выписка». Также можно открыть раздел «История» или выбрать карточку и нажать «Выписку»."], appSure: true,
        how: ["Интернет-банкинг: раздел «История» либо выберите карточку и нажмите «Выписка».", "Ежемесячный отчёт по счёту тоже называется выпиской."],
        wait: "В интернет-банкинге сразу.",
        link: ["https://www.paritetbank.by/faq/", "Паритетбанк: вопросы и ответы"] },
      { id: "belveb", name: "Банк БелВЭБ", reads: false,
        app: ["Приложение UP Online (для карт, выпущенных в Беларуси, также приложение UP): выписку по карте можно получить там."], appSure: true,
        how: ["Выписку по карте можно получить в приложении UP Online (для карт, выпущенных в Беларуси, также в приложении UP).", "Через банкомат: услуга платная."],
        wait: "В приложении сразу.",
        link: ["https://www.belveb.by/questions/", "Банк БелВЭБ: вопросы и ответы"] },
      { id: "bsb", name: "БСБ Банк", reads: false,
        app: ["Мобильный банк: раздел «Выписка» показывает только последние 10 операций по карточке, для разбора этого мало. Полную выписку за период берите в интернет-банке в браузере."], appSure: false,
        how: ["Интернет-банк или мобильный банк: самостоятельно. В мобильном банке раздел «Выписка» показывает последние 10 операций по карточке.", "Ежемесячная выписка может приходить на почту, указанную в заявлении (по одному из договоров не позднее 5-го рабочего дня после месяца)."],
        wait: "В приложении сразу.",
        link: ["https://www.bsb.by/files/ruleuse.pdf", "БСБ Банк: правила услуги «Мобильный банк»"] },
      { id: "tb", name: "Технобанк", reads: false,
        app: ["Приложение MyTechno: выберите карточку или счёт и запросите выписку за нужный период. Выписку по карточкам, счетам и вкладам можно смотреть и в интернет-банке (раздел «Состояние счета»)."], appSure: true,
        how: ["Выписку по карточкам, счетам и вкладам можно смотреть в интернет-банке и мобильном приложении.", "Ежемесячная выписка на e-mail (зависит от карты)."],
        wait: "В интернет-банке и приложении сразу.",
        link: ["https://wap.tb.by/upload/downloads/terms-of-service-new.pdf", "Технобанк: общие условия обслуживания физических лиц"] },
      { id: "belinvest", name: "Белинвестбанк", reads: true,
        app: ["На iPhone прежнее приложение банка больше не поддерживается: банк советует веб-приложение PWA Belinvest. Где именно в нём выписка, мы не подтвердили: ищите «Выписка» в карточке карты. Надёжнее взять выписку в интернет-банкинге в браузере."], appSure: false,
        how: ["Интернет-банкинг: выписка по операциям по картам, можно подключить выписку на e-mail. В мобильном банкинге регистрация идёт через интернет-банкинг.", "SMS-банкинг: мини-выписка по карточке (до 14 операций).", "Названия пунктов зависят от версии приложения: ищите «Выписка» в карточке карты."],
        wait: "В интернет-банкинге сразу.",
        link: ["https://www.belinvestbank.by/be/individual/page/internet-banking", "Белинвестбанк: интернет-банкинг"] },
      { id: "bgpb", name: "Белгазпромбанк", reads: false,
        app: ["Приложение DailyFin (есть и веб-версия WEB DailyFin): по данным банка, выписку по счёту можно сформировать бесплатно дистанционно. Ищите пункт «Выписка» в карточке или счёте: название зависит от версии."], appSure: false,
        how: ["Откройте приложение или интернет-банк и ищите в разделах «Карты» и «Счета» пункт «Выписка» или «История операций». Точный путь зависит от версии приложения."],
        wait: "Уточните в приложении или в банке.",
        link: ["https://pfm.bgpb.by/", "Белгазпромбанк: интернет-банк (вход)"] },
      { id: "dabrabyt", name: "Банк Дабрабыт", reads: false,
        app: ["Дабрабыт-онлайн (интернет-банк и мобильный банк): выписку по счёту можно получить бесплатно, в том числе скачать в PDF."], appSure: true,
        how: ["Откройте приложение или интернет-банк и ищите «Выписку» или «Историю операций» по карте или счёту."],
        wait: "Уточните в приложении или в банке.",
        link: ["https://bankdabrabyt.by/about/faq/online", "Банк Дабрабыт: Дабрабыт-онлайн"] }
    ];
    // Порядок блоков: обычно приложение первым; если приложение готовит выписку долго (appSlow), наверх идёт сайт банка, приложение ниже с пометкой
    function howBlocks(b, head) {
      const webB = b.web && b.web.length ? [head("На сайте банка (быстрее)"), h("ul", {}, b.web.map(t => h("li", {}, t)))] : [];
      const appB = [head("В мобильном приложении"),
        ...(b.appSlow ? [h("p", { class: "warn" }, b.appSlow)] : []),
        h("ul", {}, b.app.map(t => h("li", {}, t))),
        ...(b.appSure ? [] : [h("p", { class: "muted" }, "Мы не смогли проверить это на актуальной версии приложения: названия пунктов зависят от версии.")])];
      return b.appSlow ? [...webB, ...appB] : [...appB, ...webB];
    }
    function showHowList() {
      $("howList").hidden = false; $("howDetail").hidden = true;
      $("howBanks").replaceChildren(...BANK_HELP.map(b => h("button", { type: "button", class: "rowcard", onclick: () => showHowBank(b.id) },
        h("span", {}, b.name), h("span", { class: "howtag" + (b.reads ? " ok" : "") }, b.reads ? (b.fresh ? "читается, но не полностью" : "читается сайтом") : "пока нет"), chevSvg())));
      try { $("howSheet").querySelector(".modalcard").scrollTop = 0; } catch (e) { /* без прокрутки */ }
    }
    function chevSvg() {
      const sp = document.createElement("span");
      sp.className = "chevw";
      sp.innerHTML = '<svg class="gi chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
      return sp;
    }
    function showHowBank(id) {
      const b = BANK_HELP.find(x => x.id === id);
      if (!b) return;
      $("howList").hidden = true; $("howDetail").hidden = false;
      const kids = [
        h("button", { type: "button", class: "howback", onclick: () => showHowList() }, "← Все банки"),
        h("h3", {}, b.name),
        h("p", {}, h("span", { class: "howtag" + (b.reads ? " ok" : "") }, b.reads ? "Сайт читает выписки этого банка" : "Сайт пока не читает выписки этого банка")),
        ...(b.fresh ? [h("p", { class: "warn" }, "Сайт подключил этот банк недавно, образцов выписок пока мало (проверены кредитная карта и карта с несколькими операциями). Чтение может быть неточным: сверяйте суммы и операции с выпиской.")] : []),
        ...howBlocks(b, t => h("h3", {}, t)),
        h("h3", {}, "Другие способы"),
        h("ul", {}, b.how.map(t => h("li", {}, t))),
        h("h3", {}, "Нужно ли ждать"),
        h("p", {}, b.wait)
      ];
      if (b.link) kids.push(h("p", {}, h("a", { class: "btnlink alt", href: b.link[0], target: "_blank", rel: "noopener noreferrer" }, "Страница банка: " + b.link[1] + " ↗")),
        h("p", { class: "muted" }, "Ссылка откроет сайт банка в новой вкладке. Пункты меню в приложении могут называться иначе."));
      if (!b.reads) kids.push(h("p", { class: "muted" }, "Выписку этого банка сайт пока не умеет разбирать. Если хотите помочь добавить банк, подготовьте безопасный образец:"),
        h("button", { type: "button", onclick: () => { closeSheets(); showAnon(false); } }, "Помочь добавить банк"));
      $("howDetail").replaceChildren(...kids);
      try { $("howSheet").querySelector(".modalcard").scrollTop = 0; } catch (e) { /* без прокрутки */ }
    }
    showHowList();
    // Банк заранее не выбран: человек выбирает свой, выбор запоминается в этом браузере (ba_bank_v1)
    function showHowInline(id, remember) {
      const list = [...BANK_HELP.filter(x => x.reads), ...BANK_HELP.filter(x => !x.reads)]; // сначала банки, которые сайт читает, потом остальные
      const b = list.find(x => x.id === id) || null;
      if (b && remember) { try { localStorage.setItem("ba_bank_v1", b.id); } catch (e) { /* без запоминания */ } }
      $("howTabs").replaceChildren(...list.map(x => h("button", { type: "button", role: "tab", "aria-selected": b && x.id === b.id ? "true" : "false", onclick: () => showHowInline(x.id, true) }, x.name)));
      if (!b) { $("howPane").replaceChildren(h("p", { class: "muted" }, "Нажмите на свой банк выше: покажем, где в приложении найти выписку и нужно ли её ждать.")); return; }
      const kids = [...howBlocks(b, t => h("p", {}, h("b", {}, t))),
        h("p", {}, h("b", {}, "Другие способы")), h("ul", {}, b.how.map(t => h("li", {}, t))), h("p", { class: "muted" }, b.wait)];
      if (b.link) kids.push(h("p", {}, h("a", { href: b.link[0], target: "_blank", rel: "noopener noreferrer" }, "Инструкция на сайте банка ↗")));
      if (!b.reads) kids.push(h("p", { class: "muted" }, "Выписки этого банка сайт отдельно пока не разбирает, но пробует прочитать файл сам и показывает, как понял колонки."));
      $("howPane").replaceChildren(...kids);
    }
    try { if (/Instagram|FBAN|FBAV|FB_IAB|Telegram|VKClient|\bLine\/|; wv\)/i.test(navigator.userAgent || "")) $("inAppNote").hidden = false; } catch (e) { /* без подсказки */ }
    let savedBank = null;
    try { savedBank = localStorage.getItem("ba_bank_v1"); } catch (e) { /* без запоминания */ }
    showHowInline(savedBank);
    const openHowInline = () => { if (typeof location !== "undefined" && location.hash === "#howInline") $("howInline").open = true; };
    openHowInline(); if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("hashchange", openHowInline);

    // Значки: простые линии одного цвета (берут цвет текста). Для стандартных категорий свои, для своих выбирает пользователь
    const ICON_SVG = {
      "cart": '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 7H6"/>',
      "utensils": '<path d="M6 3v6a2 2 0 0 0 4 0V3M8 11v10M17 21V3c-2 1-3.5 4-3.5 8H17"/>',
      "home": '<path d="M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6"/>',
      "sofa": '<path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3zM6 18v2M18 18v2"/>',
      "bus": '<rect x="4" y="3" width="16" height="14" rx="2"/><path d="M4 11h16M8 21v-4M16 21v-4"/>',
      "phone": '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
      "cross": '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
      "bag": '<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
      "film": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
      "cash": '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
      "box": '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>',
      "arrow-out": '<path d="M7 17L17 7M8 7h9v9"/>',
      "arrow-in": '<path d="M12 4v14M6 12l6 6 6-6"/>',
      "coins": '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
      "bank": '<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/>',
      "swap": '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
      "question": '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>',
      "tag": '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1"/>',
      "gift": '<rect x="3" y="8" width="18" height="4"/><path d="M5 12v9h14v-9M12 8v13M12 8c-2 0-4-1-4-3s3-2 4 3c1-5 4-5 4-3s-2 3-4 3"/>',
      "paw": '<circle cx="6" cy="10" r="1.6"/><circle cx="10" cy="6" r="1.6"/><circle cx="14" cy="6" r="1.6"/><circle cx="18" cy="10" r="1.6"/><path d="M12 12c-3 0-5 3-5 5.5 0 1.5 1.5 2 3 1.5 1.3-.5 2.7-.5 4 0 1.5.5 3 0 3-1.5C17 15 15 12 12 12z"/>',
      "gamepad": '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 10v5M4.5 12.5h5M15.5 11.5h.01M18 14h.01"/>',
      "book": '<path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"/>',
      "plane": '<path d="M10.5 13.5L3 11l1-2 8.5 1L18 5a1.8 1.8 0 0 1 2.5 2.5L15 13l1 8.5-2 1-2.5-7.5L8 18l-.5-3z"/>',
      "car": '<path d="M5 16V11l2-5h10l2 5v5zM3 16h18v3H3zM7 13h.01M17 13h.01"/>',
      "briefcase": '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>',
      "cap": '<path d="M2 9l10-5 10 5-10 5zM6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5"/>',
      "receipt": '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"/>',
      "wrench": '<path d="M14 6a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3z"/>',
      "coffee": '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h2a2 2 0 0 1 0 4h-2M7 3v2M11 3v2M15 3v2"/>',
      "dumbbell": '<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
      "music": '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
      "heart": '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
      "bulb": '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
    };
    // Значки, из которых пользователь выбирает для своей категории
    const ICON_NAMES = { tag: "Ценник", gift: "Подарки", paw: "Питомцы", gamepad: "Игры", book: "Книги", plane: "Путешествия", car: "Машина", briefcase: "Работа", cap: "Учёба", receipt: "Счета", wrench: "Ремонт", coffee: "Кофе", dumbbell: "Спорт", music: "Музыка", heart: "Здоровье", bulb: "Идеи" };
    const PICK_ICONS = ["tag", "gift", "paw", "gamepad", "book", "plane", "car", "briefcase", "cap", "receipt", "wrench", "coffee", "dumbbell", "music", "heart", "bulb"];
    // Только собственные значки: имя вроде «constructor» из файла разбора не должно найти служебное свойство объекта
    const hasIcon = k => typeof k === "string" && Object.prototype.hasOwnProperty.call(ICON_SVG, k);
    const iconKey = cat => (cat === "Не разобрано" ? "question" : (Object.prototype.hasOwnProperty.call(Cat.ICONS, cat) && Cat.ICONS[cat]) || (hasIcon(customIcons[cat]) ? customIcons[cat] : "tag"));
    function iconEl(key) {
      const s = document.createElement("span");
      s.className = "ico";
      s.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (hasIcon(key) ? ICON_SVG[key] : ICON_SVG.tag) + "</svg>";
      return s;
    }
    // Суммы: пробел между тысячами (неразрывный), единый минус «−»
    const fmt = n => {
      const [i, f] = Math.abs(n).toFixed(2).split(".");
      const neg = n < 0 && Number(i + "." + f) !== 0;
      return (neg ? "\u2212" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0") + "," + f;
    };
    const allCategories = () => [...Cat.DEFAULT_CATEGORIES, ...customCats.filter(c => !Cat.DEFAULT_CATEGORIES.includes(c))];
    // Идентификатор конкретной операции (дата, время, сумма, остаток)
    const txId = tx => tx.sid || [tx.date, tx.time || "", Rates.baseAmount(tx), tx.balance].join("|");
    // Приоритет: выбор для этой операции, потом выбор для группы похожих, потом автоматика
    // Пара «пришло и сразу ушло» сильнее общих правил, но слабее выбора пользователя для конкретной операции
    // Для показа: если категории нет, но видно способ оплаты (ЕРИП, интернет-банк), берём «корзину»
    const displayCat = tx => categoryOf(tx) || Cat.bucket(tx) || null;
    const isUnclear = c => !c || c === "Не разобрано" || Cat.BUCKETS.includes(c);
    // Возврат денег за покупку: поступление с категорией трат (по коду MCC или выбранной человеком). Уменьшает траты этой категории, доходом не считается
    const NOT_SPEND = [Cat.INCOME, Cat.OWN, Cat.LOAN, Cat.SAVINGS, Cat.GAMBLING];
    const isRefund = tx => { if (!(tx.amount > 0)) return false; const c = displayCat(tx); return !isUnclear(c) && !NOT_SPEND.includes(c); };
    // Доход («Пришло»): поступления без переводов между своими, без возвратов за покупки, без снятия с накоплений и без возвращённого долга
    // (отложенное и данное в долг не считались тратой, значит, их возвращение не доход)
    const isIncome = tx => tx.amount > 0 && ![Cat.OWN, Cat.SAVINGS, Cat.LOAN].includes(displayCat(tx)) && !isRefund(tx);
    // Откуда взялась категория: подпись «почему здесь» под выбором категории
    function whyCat(tx) {
      if (tx.feePart) return txRules[txId(tx)] || txRules[tx.splitOf] ? "выбрано вами" : tx._o && tx._o.pair ? "комиссия за перевод между своими счетами" : "комиссия банка по этой операции";
      if (tx.part) return "часть разделённой операции";
      if (txRules[txId(tx)]) return "выбрано вами";
      if (tx.pair) return "пришло и сразу ушло";
      if (userRules[Cat.merchantKey(tx)]) return "ваше правило";
      if (CondRules.firstMatch(condRules, tx)) return "ваше правило с условием";
      const r = Cat.resolve(tx);
      if (r[0]) return r[1];
      return Cat.bucket(tx) ? "не определено" : "";
    }
    // Комиссия перевода между своими (feePart): идёт за выбором человека для самой комиссии или для всего перевода, иначе «Комиссии банка»
    const categoryOf = tx => (tx.feePart && (txRules[txId(tx)] || txRules[tx.splitOf])) || tx.splitCat || txRules[txId(tx)] || (tx.pair ? Cat.OWN : null) || userRules[Cat.merchantKey(tx)] || ((CondRules.firstMatch(condRules, tx) || {}).c) || Cat.categorize(tx);

    // Регулярные платежи: одна и та же сумма в разные месяцы (аренда, связь, подписки, коммуналка).
    // Суммы меньше 10 BYN не учитываем: мелкие одинаковые суммы встречаются слишком часто.
    function findRecurring() {
      const byAmount = new Map();
      for (const tx of txs) {
        if (!tx.date || tx.part || Math.abs(tx.amount) < 10) continue;
        const k = tx.amount.toFixed(2);
        if (!byAmount.has(k)) byAmount.set(k, []);
        byAmount.get(k).push(tx);
      }
      const rec = new Map();
      for (const [k, list] of byAmount) {
        const months = new Set(list.map(t => t.date.slice(0, 7)));
        if (months.size < 2) continue;
        const days = list.map(t => parseInt(t.date.slice(8, 10), 10)).sort((a, b) => a - b);
        rec.set(k, { count: list.length, months: months.size, day: days[Math.floor(days.length / 2)] });
      }
      return rec;
    }
    // Пометка для операции, если её сумма повторяется
    function recurLabel(tx) {
      const r = recurring.get(tx.amount.toFixed(2));
      return r ? `↻ такая сумма за всю выписку: ${r.count} ${plur(r.count, "раз", "раза", "раз")} за ${r.months} мес., обычно около ${r.day}-го числа` : "";
    }

    // Простая функция создания элементов (текст вставляем безопасно, без innerHTML)
    function h(tag, attrs, ...kids) {
      const e = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs || {})) {
        if (k === "class") e.className = v;
        else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v);
      }
      for (const kid of kids.flat()) e.append(kid instanceof Node ? kid : String(kid));
      return e;
    }

    // Добавляет свою категорию (и её значок, если указан). У стандартных категорий значок менять нельзя.
    function ensureCategory(category, icon) {
      category = Cat.canonical(category);
      if (!allCategories().includes(category)) { customCats.push(category); saveJSON("ba_cats_v1", customCats); }
      if (icon && !Cat.ICONS[category]) { customIcons[category] = icon; saveJSON("ba_icons_v1", customIcons); }
    }
    // Сколько операций затронет выбор для всей группы (во всех месяцах; операции с выбором «по одной» не считаем)
    const ruleScope = tx => { const k = Cat.merchantKey(tx); return txs.filter(t => Cat.merchantKey(t) === k && !txRules[txId(t)] && !t.pair).length; };
    const scopeText = n => (n > 1 ? `Применить ко всем ${n} операциям` : "Применить");
    // Для всей группы похожих операций
    function setRule(tx, category, icon) {
      category = Cat.canonical(category);
      ensureCategory(category, icon);
      // Объединённая группа (ЕРИП в один и тот же день месяца) несёт ключи всех своих операций
      const keys = tx.__keys || [Cat.merchantKey(tx)];
      appliedWithUndo(softCase(friendlyTitle(tx)), category, keys, [], () => { keys.forEach(k => { userRules[k] = category; }); saveJSON("ba_rules_v1", userRules); });
    }
    // Главная строка «Итога» как текст: по ней видно, что выбор категории сдвинул итог
    const recapTotalText = () => { try { const li = document.querySelector("#report .recap:not(.minirecap) li.k-total"); const t = li ? li.textContent : ""; const i = t.indexOf(` ${CUR}: `); return i > 0 ? t.slice(i + 6) : t; } catch (e) { return ""; } };
    // Выбор категории: сразу «Готово · Отменить», и если итог месяца из-за этого поменялся, говорим об этом
    function appliedWithUndo(name, category, ruleKeys, txKeys, change) {
      const prev = ruleKeys.map(k => [k, userRules[k]]), prevTx = txKeys.map(k => [k, txRules[k]]);
      const before = recapTotalText();
      change();
      const entry = { prev, prevTx, label: `Готово: «${name}» → «${category}».` };
      tailUndo.push(entry); if (tailUndo.length > 5) tailUndo.shift();
      render();
      const after = recapTotalText();
      if (before && after && before !== after) { entry.label += ` Итог месяца изменился: было «${before}», стало «${after}».`; renderUndo(); }
    }
    // Разделение операций: в txs лежат «части» (см. splits.js), в файл и при добавлении выписок операции склеиваются обратно
    function saveSplits() { if (!demoMode) saveJSON("ba_splits_v1", splits); }
    function applySplits() { txs = Splits.expand(Splits.collapse(txs), splits, txId); }
    function setSplit(id, parts) { if (parts && parts.length) splits[id] = parts; else delete splits[id]; saveSplits(); applySplits(); render(); }
    function setPartCat(tx, category) {
      category = Cat.canonical(category); ensureCategory(category);
      const p = splits[tx.splitOf]; if (!p || !p[tx.splitIdx]) return;
      p[tx.splitIdx].c = category; saveSplits(); applySplits(); render();
    }
    // Только для одной операции
    function setTxRule(tx, category, icon) {
      category = Cat.canonical(category);
      ensureCategory(category, icon);
      appliedWithUndo(softCase(friendlyTitle(tx)), category, [], [txId(tx)], () => { txRules[txId(tx)] = category; saveJSON("ba_txrules_v1", txRules); });
    }

