// Анонимайзер: готовит «образец выписки» без личных данных. Всё считается в браузере, наружу ничего не уходит.
// Образец = только текстовые фрагменты и их позиции; исходный файл в него не попадает, поэтому «скрытого под плашкой» не бывает.
// Автоматика ловит узнаваемое (IBAN, карты, телефоны, почту, длинные номера, ФИО с отчеством, адреса, значения после «Владелец:» и т.п.);
// остальное пользователь проверяет и закрывает сам. Модель: pages[] -> rows[] -> items[{ text, x, y, vx, vy, parts, manual }].
(function (root) {
  "use strict";
  const BLOCK = "▮";   // ▮
  const PATTERNS = [
    /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{4}[A-Z0-9]{16}\b/g,                          // IBAN Беларуси (28 знаков)
    /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){4,7}\b/g,                                // IBAN с пробелами, другие страны
    /(^|[^\d.,])((?:\d[ -]?){13,19})(?![\d.,])/g,                                    // номер карты / счёта
    /\b\d{4,6}[*•xX]{2,}\d{0,4}\b/g,                                              // маска карты с началом номера
    /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,                                              // почта
    /(?:\+\s?)?375[\s(-]*\d{2}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g,               // телефон BY
    /\b8[\s-]?0\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g,                        // телефон 8 0xx …
    /(^|[^\d.,])(\d{9,})(?![\d.,])/g,                                                // длинные номера: УНП, договоры, счета
    /[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:ович|евич|ич|овна|евна|ична|инична|оглы|кызы)(?![а-яё])/g,   // ФИО с отчеством
    /(?:ул\.|улица|пр-т|проспект|пер\.|переулок|бул\.|бульвар)\s*[^,;]{1,40}(?:,\s*(?:д\.|дом)\s*\S+)?(?:,\s*(?:кв\.|квартира|корп\.|к\.)\s*\S+)*/gi,   // адрес
    /(?:\bд\.|\bдом)\s?\d+[а-яА-Я]?(?:[,\s]+(?:кв\.|квартира)\s?\d+)?/gi
  ];
  // Подписи, после которых идёт значение, относящееся к человеку
  const LABEL = /(?:владелец|клиент|держатель|получатель|плательщик|отправитель|фио|ф\.и\.о|фамилия|имя|адрес|телефон|паспорт|email|e-mail|почта)[^:\n]{0,40}:\s*$/i;
  const LABEL_INLINE = /((?:владелец|клиент|держатель|получатель|плательщик|отправитель|фио|ф\.и\.о|фамилия|имя|адрес|телефон|паспорт|email|e-mail|почта)[^:\n]{0,40}:\s*)(\S.*)$/i;

  // Разбивает текст на части { t, m } (m = true: скрыть)
  function maskParts(text) {
    const mark = new Array(text.length).fill(false);
    const li = LABEL_INLINE.exec(text);
    if (li) for (let i = li[1].length; i < text.length; i++) mark[i] = true;
    for (const rx of PATTERNS) {
      rx.lastIndex = 0;
      let m;
      while ((m = rx.exec(text))) {
        if (!m[0]) { rx.lastIndex++; continue; }
        const off = rx.source.startsWith("(^|") ? m[1].length : 0;   // без «lookbehind»: он не работает в старых Safari
        for (let i = m.index + off; i < m.index + m[0].length; i++) mark[i] = true;
        if (off) rx.lastIndex = m.index + m[0].length;
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
      out.csv = [].concat(...model.map(pg => pg.map(row => row.map(effective).join(";"))));
    } else {
      out.pages = model.map(pg => [].concat(...pg.map(row => row.map(it => ({ x: it.x, y: it.y, vx: it.vx, vy: it.vy, text: effective(it) })))));
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
