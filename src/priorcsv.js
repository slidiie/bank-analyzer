// priorcsv.js: разбор CSV-выписки «Приорбанк» (файл из интернет-банка, кодировка windows-1251, разделитель «;»).
// Принимает ТЕКСТ файла (см. decode), возвращает ту же форму, что и prior.js: { header, txs }.
// Работает и в браузере (глобальный объект PriorCsvParser), и в Node (для тестов).
//
// Отличия от PDF-выписки:
//  - числа с десятичной запятой и пробелом в тысячах («10 227,78»);
//  - есть колонка «Категория операции» от банка: кладём в tx.bankCat, а categories.js использует её как подсказку
//    после правил по названию (банк иногда ошибается: «MOBILE BANK» у него «Денежные переводы»);
//  - операции остальные те же, поэтому идентификатор (дата, время, сумма) совпадает с PDF, и повторы при загрузке
//    PDF и CSV за один период отсеиваются.
// В шапке ФИО, адрес, номера карты и контракта: их не читаем. IBAN и номер контракта в тексте операций вырезаем.

(function (root) {
  "use strict";

  const need = (name, file) => root[name] || (typeof require !== "undefined" ? require(file) : null);
  const PR = need("PriorParser", "./prior.js");

  const DT_RE = /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/;
  const DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/;
  const CUR_RE = /^[A-Z]{3}$/;
  const toIso = d => { const [dd, mm, yyyy] = d.split("."); return `${yyyy}-${mm}-${dd}`; };
  // «10 227,78» → 10227.78; всё остальное → NaN
  const num = s => {
    const t = String(s == null ? "" : s).replace(/[\s  ]/g, "").replace(",", ".");
    return /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN;
  };

  // Байты файла → текст. Сначала строгий UTF-8 (на случай, если банк сменит кодировку), иначе windows-1251.
  function decode(bytes) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, ""); }
    catch (e) { return new TextDecoder("windows-1251").decode(bytes); }
  }

  // Строка CSV → поля (кавычки "..." и "" внутри поля поддерживаются)
  function splitRow(line) {
    const out = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"' && cur === "") q = true;     // кавычки открывают поле только в его начале, иначе это часть названия
      else if (c === ";") { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim());
  }

  const lines = text => String(text).replace(/^﻿/, "").split(/\r?\n/);

  function detect(text) {
    if (typeof text !== "string") return false;
    const head = text.slice(0, 20000);
    return /^﻿?\s*Выписка по контракту/i.test(head) && /Период выписки/i.test(head) &&
      /Дата транзакции;Операция;Сумма;Валюта/i.test(head);
  }

  function parseHeader(text) {
    const h = { bank: "prior" };
    const ls = lines(text);
    let m;
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      if ((m = l.match(/^Период выписки:?;?\s*(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/))) { h.from = toIso(m[1]); h.to = toIso(m[2]); }
      else if ((m = l.match(/^Валюта счета:?\s*;?\s*([A-Z]{3})/))) h.currency = m[1];
      else if ((m = l.match(/^Начальный баланс:?\s*;?\s*(-?[\d\s ]+,\d{2})/))) h.opening = num(m[1]);
      else if (/^Всего в данной валюте/.test(l)) {
        // следующая строка: ;зачислено;списано;комиссия/Money-back;конечный баланс;
        const f = splitRow(ls[i + 1] || "").slice(1).map(num);
        if (f.length >= 4 && f.slice(0, 4).every(Number.isFinite)) { h.income = f[0]; h.gross = f[1]; h.moneyBack = f[2]; h.closing = f[3]; }
      }
    }
    if (h.gross != null && h.moneyBack != null) h.expense = Math.round((h.gross - h.moneyBack) * 100) / 100;
    return h;
  }

  function parse(text) {
    const header = parseHeader(text);
    const txs = [];
    let broken = 0;
    const unread = [];
    for (const line of lines(text)) {
      if (/^Заблокированные суммы/.test(line)) break;                 // ещё не списанные суммы, в итоги не входят
      if (!/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2};/.test(line)) continue;
      const f = splitRow(line);
      const [dt, op, amtS, cur, post, , turnS, , cat] = f;
      const turn = num(turnS);
      if (!DT_RE.test(dt) || !CUR_RE.test(cur || "") || !Number.isFinite(turn)) {
        broken++;
        if (unread.length < 30) unread.push({ date: null, rawDate: (dt || "").slice(0, 10) || null, amount: Number.isFinite(turn) ? turn : null, details: String(op || "").replace(/\s+/g, " ").trim().slice(0, 70) });
        continue;
      }
      if (turn === 0) continue;
      const [datePart, time] = dt.split(" ");
      let details = PR.stripSecrets(op || "");
      if (/^ATM\b/.test(details)) details = "Выдача наличных · " + details;
      const tx = {
        date: toIso(datePart),
        regDate: DATE_RE.test(post || "") ? toIso(post) : null,
        time,
        type: null,
        amount: turn,
        currency: header.currency || cur,
        mcc: null,
        card: null,
        purpose: "",
        place: details,
        details,
        balance: null,
      };
      if (cat) tx.bankCat = cat.replace(/\s+/g, " ").slice(0, 80);
      const amt = num(amtS);
      if (header.currency && cur !== header.currency && Number.isFinite(amt)) {
        tx.origAmount = Math.abs(amt);
        tx.details += ` (${Math.abs(amt).toFixed(2)} ${cur})`;
      }
      txs.push(tx);
    }
    header.broken = broken;
    if (unread.length) header.unread = unread;
    return { header, txs };
  }

  const api = { decode, detect, parse, parseHeader, splitRow, validate: PR.validate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PriorCsvParser = api;
})(typeof self !== "undefined" ? self : this);
