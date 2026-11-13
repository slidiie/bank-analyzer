// Анонимайзер: готовит «образец выписки» без личных данных. Всё считается в браузере, наружу ничего не уходит.
// Образец = только текстовые фрагменты и их позиции; исходный файл в него не попадает, поэтому «скрытого под плашкой» не бывает.
// Автоматика ловит узнаваемое (IBAN, карты, телефоны, почту, длинные номера, ФИО с отчеством, адреса, значения после «Владелец:» и т.п.);
// остальное пользователь проверяет и закрывает сам. Модель: pages[] -> rows[] -> items[{ text, x, y, vx, vy, parts, manual }].
(function (root) {
  "use strict";
  const BLOCK = "▮";   // ▮
  // Кусок длиннее этого в выписке не бывает: скрываем целиком и шаблонами не проверяем (иначе вкладка зависала на минуту)
  const MAX_TEXT = 2000;
  const NAME = "[А-ЯЁІЎ][а-яёіў'’]+", NAMEUP = "[А-ЯЁІЎ]{2,40}";
  const PATRON = "(?:ович|евич|ич|овна|евна|ична|инична|оглы|кызы|авіч|евіч|ыч|іч|аўна|еўна|ічна)";
  const NOTLETTER = "(^|[^А-Яа-яЁёІіЎўA-Za-z])";
  // Слово с заглавной (кириллица или латиница) либо инициал: «Иванов», «IVANOU», «И.»
  const CAPWORD = "(?:[А-ЯЁІЎA-Z][А-Яа-яЁёІіЎўA-Za-z'’-]{1,40}|[А-ЯЁІЎA-Z]\\.)";
  const WHO = "(?:владел\\S{0,6}|клиент\\S{0,3}|держател\\S{0,3}|получател\\S{0,3}|плательщик\\S{0,3}|отправител\\S{0,3}|уладальнік\\S{0,3}|кліент\\S{0,3}|атрымальнік\\S{0,3}|плацельшчык\\S{0,3}|cardholder|card holder|account holder|customer|client)";
  // Шаблон в массиве [rx]: первая группа это то, что стоит перед секретом и остаётся видимым; без массива скрывается всё найденное
  const PATTERNS = [
    /\b[A-Za-z]{2}\d{2}[A-Za-z0-9]{4}\d{4}[A-Za-z0-9]{16}\b/g,                    // IBAN Беларуси (28 знаков), в том числе строчными
    /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){4,7}\b/g,                                // IBAN с пробелами, другие страны
    [/(^|[^\d.,])((?:\d[ -]?){13,19})(?![\d.,])/g],                                  // номер карты / счёта
    /\b\d{4,6}[*•xX]{2,}\d{0,4}\b/g,                                              // маска карты с началом номера
    /\d{0,6}[*•]+\s?\d{4}(?!\d|[.,]\d)/g,                                            // хвост карты: *1234, 4***********1234
    /[\wА-Яа-яЁёІіЎў.+-]{1,64}@[\wА-Яа-яЁёІіЎў-]{1,63}(?:\.[\wА-Яа-яЁёІіЎў-]{1,63})+/g,   // почта (и кириллицей)
    /(?:\+\s?)?375[\s(-]*\d{2}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g,               // телефон BY
    /\b8[\s-]?\(?0\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g,                  // телефон 8 0xx …, 8 (0xx) …
    /\(0?\d{2}\)\s?\d{3}[\s-]?\d{2}[\s-]?\d{2}(?!\d)/g,                           // телефон (29) 123-45-67
    [/(^|[^\d.,])(\d{9,})(?![\d.,])/g],                                              // длинные номера: УНП, договоры, счета
    /\b\d{7}[A-ZА-Я]\d{3}[A-ZА-Я]{2}\d\b/g,                                       // личный (идентификационный) номер
    [/(^|[^A-Za-zА-Яа-яЁё0-9])([A-ZА-Я]{2}\s?\d{7})(?!\d)/g],                     // номер паспорта: две буквы и семь цифр
    [/((?:№|\bN\s|номер\S{0,4}|договор\S{0,4}|сч[её]т\S{0,4}|л\/с|лицев\S{0,6})\s{0,3}:?\s{0,3})(\d{5,8})(?!\d|[.,]\d)/gi],   // короткий номер после «№», «договор», «счёт»
    [/(рожд\S{0,6}\s{0,3}:?\s{0,3})(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/gi],         // дата рождения
    new RegExp(NAME + "(?:-" + NAME + ")?\\s+" + NAME + "\\s+[А-ЯЁІЎ][а-яёіў]+" + PATRON + "(?![а-яёіў])", "g"),                     // ФИО с отчеством (и по-белорусски)
    new RegExp(NAMEUP + "(?:-" + NAMEUP + ")?\\s+" + NAMEUP + "\\s+[А-ЯЁІЎ]{1,40}" + PATRON.toUpperCase() + "(?![А-ЯЁа-яёІЎіў])", "g"),   // ФИО заглавными
    /[А-ЯЁ](?:[а-яё]{1,40}|[А-ЯЁ]{1,40})(?:-[А-ЯЁ](?:[а-яё]{1,40}|[А-ЯЁ]{1,40}))?\s+[А-ЯЁ]\.\s?[А-ЯЁ]\.?(?![А-ЯЁа-яё])/g,          // фамилия с инициалами: Иванов И.И.
    [/(^|[^А-ЯЁа-яё.])([А-ЯЁ]\.\s?[А-ЯЁ]\.\s?[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?)/g],                                               // инициалы перед фамилией: И.И. Иванов
    // Имя без отчества узнаётся только по слову перед ним: «от Иванов Иван», «для ИВАНОВ ИВАН», «на имя Иван И.», «Клиент IVAN IVANOU»
    [new RegExp("((?:^|[^А-Яа-яЁёІіЎўA-Za-z])(?:от|для|на имя|в пользу|" + WHO + "(?:\\s+(?:сч[её]та|карты|карточки|договора|рахунку|карткі))?)\\s{1,3})(" + CAPWORD + "(?:\\s{1,3}" + CAPWORD + "){1,2})", "gi"), "caps"],
    /\b\d{4}[ -]?\d{0,4}[*•xX]{2,}(?:[ -]?[*•xX\d]{4}){1,3}\b/g,                                                                 // маска карты с пробелами: 4000 00** **** 0000
    [/(^|[^А-Яа-яЁёІіЎў])((?:ул\.|улица|пр-т|пр\.|просп\.|проспект|пер\.|переулок|бул\.|бульв\.|бульвар|мкр\.?|микрорайон|наб\.|набережная|проезд|тракт|шоссе|вул\.|вуліца|прасп\.|праспект|зав\.|завулак)\s*[^,;]{1,40}(?:,\s*(?:д\.|дом)?\s*[\dА-Яа-я/-]{1,8})?(?:,\s*(?:кв\.|квартира|корп\.|к\.)\s*\S{1,8})*)/gi, 'addr'],   // адрес
    /(?:\bд\.|\bдом)\s?\d+[а-яА-Я]?(?:[,\s]+(?:кв\.|квартира)\s?\d+)?/gi
  ];
  // Подписи, после которых идёт значение, относящееся к человеку
  const LABEL_WORDS = "(?:владелец|клиент|держатель|получатель|плательщик|отправитель|фио|ф\\.и\\.о|фамилия|имя|отчество|адрес|прописк|регистрац|место жительства|телефон|паспорт|документ|идентификационный|личный номер|дата рождения|год рождения|кодовое слово|логин|email|e-mail|почта|уладальнік|кліент|атрымальнік|плацельшчык|прозвішча|імя|адрас|тэлефон|пашпарт|cardholder|card holder|account holder|customer|client|owner|full name|address|phone|passport|date of birth)";
  const LABEL = new RegExp(LABEL_WORDS + "[^:\\n]{0,40}:\\s{0,10}$", "i");
  const LABEL_INLINE = new RegExp("(" + LABEL_WORDS + "[^:\\n]{0,40}:\\s{0,10})(\\S.*)$", "i");

  // Разбивает текст на части { t, m } (m = true: скрыть)
  function maskParts(text) {
    if (text.length > MAX_TEXT) return [{ t: text, m: true }];
    const mark = new Array(text.length).fill(false);
    const li = LABEL_INLINE.exec(text);
    if (li) for (let i = li.index + li[1].length; i < text.length; i++) mark[i] = true;
    for (const p of PATTERNS) {
      const rx = Array.isArray(p) ? p[0] : p, pre = Array.isArray(p), caps = pre && p[1] === "caps";
      rx.lastIndex = 0;
      let m;
      while ((m = rx.exec(text))) {
        if (!m[0]) { rx.lastIndex++; continue; }
        const off = pre ? m[1].length : 0;   // без «lookbehind»: он не работает в старых Safari
        // Шаблон без учёта регистра: имя считается именем, только если каждое слово с заглавной буквы
        // У адреса после коротких «пр.», «пер.», «наб.» должно идти название с заглавной буквы или номер («пр. платежи» это не адрес)
        const skip = (caps && !m[2].split(/\s+/).every(w => /^[А-ЯЁІЎA-Z]/.test(w))) || (p[1] === "addr" && /^(?:пр|пер|наб|зав|бул|бульв|просп|прасп|мкр)\.?\s/i.test(m[2]) && !/^\S+\s*[А-ЯЁІЎA-Z0-9]/.test(m[2]));
        if (!skip) for (let i = m.index + off; i < m.index + m[0].length; i++) mark[i] = true;
        if (pre) rx.lastIndex = skip ? m.index + Math.max(1, off) : m.index + m[0].length;
      }
    }
    const parts = [];
    for (let i = 0; i < text.length; i++) {
      const last = parts[parts.length - 1];
      if (last && last.m === mark[i]) last.t += text[i]; else parts.push({ t: text[i], m: mark[i] });
    }
    return parts;
  }
  const hide = s => s.replace(/\S/g, BLOCK);

  // Текст элемента в образце. Найденное автоматикой скрывается ВСЕГДА (отменить нельзя); вручную можно только добавить скрытие.
  function effective(it) {
    if (it.manual === true) return hide(it.text);
    return it.parts.map(p => (p.m ? hide(p.t) : p.t)).join("");
  }
  const isAutoHidden = it => it.parts.some(p => p.m);
  const isHidden = it => it.manual === true || isAutoHidden(it);

  function makeItem(text, extra) {
    return Object.assign({ text, parts: maskParts(text), manual: null }, extra);
  }
  // Строки страницы: элементы с близкой высотой; подпись «Владелец:» закрывает следующий элемент в строке
  function groupRows(pageItems) {
    const items = pageItems.filter(i => i.text && i.text.trim()).map(i => makeItem(i.text, { x: i.x, y: i.y, vx: i.vx, vy: i.vy }));
    items.sort((a, b) => a.vy - b.vy || a.vx - b.vx);
    const rows = [];
    for (const it of items) {
      const row = rows[rows.length - 1];
      if (row && Math.abs(row[0].vy - it.vy) <= 2.5) row.push(it); else rows.push([it]);
    }
    for (const row of rows) {
      row.sort((a, b) => a.vx - b.vx);
      for (let k = 1; k < row.length; k++) if (LABEL.test(row[k - 1].text) && !isAutoHidden(row[k])) row[k].parts = [{ t: row[k].text, m: true }];
    }
    // Подпись в конце строки («Владелец счёта:»), а значение напечатано строкой ниже: закрываем ближайший по горизонтали кусок следующей строки
    for (let r = 0; r + 1 < rows.length; r++) {
      const lab = rows[r][rows[r].length - 1];
      if (!LABEL.test(lab.text) || rows[r + 1][0].vy - lab.vy > 40) continue;
      const below = rows[r + 1].reduce((a, b) => (Math.abs(b.vx - lab.vx) < Math.abs(a.vx - lab.vx) ? b : a));
      if (!isAutoHidden(below)) below.parts = [{ t: below.text, m: true }];
    }
    return rows;
  }
  function fromPdfPages(pages) {
    return pages.map(groupRows);
  }
  // CSV: строки по 50 штук на «страницу», ячейки по «;»
  function fromCsvText(text, perPage) {
    const lines = text.replace(/\r/g, "").split("\n").filter(l => l.length);
    const rows = lines.map((line, r) => {
      const row = line.split(";").map((cell, c) => makeItem(cell, { vx: c, vy: r }));
      for (let k = 1; k < row.length; k++) if (LABEL.test(row[k - 1].text) && !isAutoHidden(row[k])) row[k].parts = [{ t: row[k].text, m: true }];
      return row;
    });
    const n = perPage || 50, pages = [];
    for (let i = 0; i < rows.length; i += n) pages.push(rows.slice(i, i + n));
    return pages;
  }
  function stats(model) {
    let total = 0, hidden = 0;
    for (const pg of model) for (const row of pg) for (const it of row) { total++; if (isHidden(it)) hidden++; }
    return { total, hidden };
  }
  // Образец для отправки: PDF -> { pages: [[{x,y,vx,vy,text}]] }; CSV -> { csv: [строки] }
  function toSample(model, kind, meta) {
    const out = { format: "bank-analyzer-sample", version: 1, kind, app: (meta && meta.app) || "", consent: (meta && meta.consent) || "" };
    if (kind === "csv") {
      out.csv = model.flatMap(pg => pg.map(row => row.map(effective).join(";")));
    } else {
      out.pages = model.map(pg => pg.flatMap(row => row.map(it => ({ x: it.x, y: it.y, vx: it.vx, vy: it.vy, text: effective(it) }))));
    }
    return out;
  }
  // Полный текст образца для просмотра перед отправкой
  function toPlainText(model) {
    return model.map((pg, i) => `--- страница ${i + 1} ---\n` + pg.map(row => row.map(effective).join("  ")).join("\n")).join("\n");
  }
  const api = { maskParts, effective, isHidden, isAutoHidden, groupRows, fromPdfPages, fromCsvText, stats, toSample, toPlainText, BLOCK };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Anon = api;
})(typeof self !== "undefined" ? self : this);
