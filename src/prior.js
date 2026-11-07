// prior.js: разбор PDF-выписки «Приорбанк» (выписка по контракту из интернет-банка, формат PDF).
// Принимает страницы: каждая страница это список фрагментов {vx, vy, text} (координаты окна просмотра, vy растёт вниз).
// Работает и в браузере (глобальный объект PriorParser), и в Node (для тестов).
//
// Особенности выписки:
//  - сумма в колонке «Обороты по счету» уже в валюте счёта и уже за вычетом Money-back (возврата с покупки);
//    именно её берём как сумму операции; знак у неё есть;
//  - операции идут двумя частями: поступления на контракт и операции по карте; обе читаем;
//  - в конце есть таблица «Заблокированные суммы»: это ещё не списанные операции, в итоги они не входят, пропускаем;
//  - MCC-кодов нет: категорию определяем по названию места;
//  - в шапке ФИО и адрес, в тексте операций IBAN и номер контракта: ФИО и адрес не читаем, IBAN и номер контракта вырезаем.

(function (root) {
  "use strict";

  // Левые края колонок (координата vx) по реальной выписке
  const COL = {
    dt:   [50, 150],     // дата и время транзакции
    op:   [150, 445],    // операция
    amt:  [445, 512],    // сумма в валюте операции
    cur:  [512, 566],    // валюта операции
    post: [566, 632],    // дата операции по счёту
    comm: [632, 696],    // комиссия / Money-back
    turn: [696, 745],    // обороты по счёту (в валюте счёта)
  };
  const DT_RE = /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2}$/;
  const DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/;
  const CUR_RE = /^[A-Z]{3}$/;
  const NUM_RE = /^-?\d+\.\d{2}$/;
  const NUMS_IN_LINE = /-?\d{1,3}(?:[  ]\d{3})*\.\d{2}|-?\d+\.\d{2}/g;

  const inCol = (x, c) => x >= c[0] && x < c[1];
  const toIso = d => { const [dd, mm, yyyy] = d.split("."); return `${yyyy}-${mm}-${dd}`; };
  const cents = n => Math.round(n * 100);
  const money = s => parseFloat(String(s).replace(/[\s ]/g, ""));

  const clean = pages => pages.map(items => items
    .map(i => ({ x: i.vx, y: i.vy, text: (i.text || "").trim() }))
    .filter(i => i.text));

  // Строки страницы: фрагменты с близкой высотой, слева направо
  function pageLines(items) {
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    for (const it of sorted) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - it.y) <= 1.5) last.items.push(it);
      else lines.push({ y: it.y, items: [it] });
    }
    lines.forEach(l => l.items.sort((a, b) => a.x - b.x));
    return lines;
  }
  const lineText = l => l.items.map(i => i.text).join(" ");

  function detect(pages) {
    if (!pages.length) return false;
    const text = pageLines(clean(pages.slice(0, 1))[0]).map(lineText).join("\n");
    return /Выписка по контракту/i.test(text) && /Период выписки/i.test(text) && /Начальный баланс/i.test(text);
  }

  // Итоги из шапки и из строк «Всего…». ФИО, адрес и номера нарочно не читаем.
  function parseHeader(pages) {
    const h = { bank: "prior" };
    const pl = clean(pages).map(pageLines);
    const all = pl.flat();
    let m;
    for (const l of (pl[0] || [])) {
      const t = lineText(l);
      if ((m = t.match(/Период выписки\s*(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/))) { h.from = toIso(m[1]); h.to = toIso(m[2]); }
      if ((m = t.match(/Валюта счета\s*:?\s*([A-Z]{3})/))) h.currency = m[1];
      if ((m = t.match(/Начальный баланс\s*:?\s*(-?[\d\s ]+\.\d{2})/))) h.opening = money(m[1]);
    }
    // Строка «Всего в данной валюте» и под ней четыре числа: зачислено, списано, комиссия/Money-back, конечный баланс
    const k = all.findIndex(l => /Всего в данной валюте/.test(lineText(l)));
    if (k >= 0) {
      for (let j = k + 1; j < Math.min(all.length, k + 4); j++) {
        const nums = (lineText(all[j]).match(NUMS_IN_LINE) || []).map(money);
        if (nums.length >= 4) { h.income = nums[0]; h.gross = nums[1]; h.moneyBack = nums[2]; h.closing = nums[3]; break; }
      }
    }
    // Списано в итогах считается до возврата Money-back, а в операциях сумма уже за его вычетом
    if (h.gross != null && h.moneyBack != null) h.expense = Math.round((h.gross - h.moneyBack) * 100) / 100;
    return h;
  }

  const stripSecrets = s => s
    .replace(/\bBY\d{2}[A-Z0-9]{4}\d{4}[A-Z0-9]{16}\b/g, "")      // IBAN
    .replace(/\b\d{6}-\d{5}-\d{6}\b/g, "")                        // номер контракта
    .replace(/IBAN:?/g, "")
    .replace(/\s+/g, " ").trim();

  const colText = (items, col) => items.filter(i => inCol(i.x, col)).map(i => i.text).join(" ").replace(/\s+/g, " ").trim();

  function parse(pages) {
    const header = parseHeader(pages);
    const raw = [];
    let stop = false;
    for (const items of clean(pages)) {
      if (stop) break;
      let cur = null;
      for (const line of pageLines(items)) {
        const t = lineText(line);
        if (/Заблокированные суммы/.test(t)) { stop = true; break; }      // дальше идут ещё не списанные суммы
        if (/^https?:\/\//.test(line.items[0].text) && !line.items.some(i => inCol(i.x, COL.op))) continue;   // колонтитул страницы
        // дата и время иногда приходят одним фрагментом, иногда двумя
        const dtText = colText(line.items, COL.dt);
        const dt = DT_RE.test(dtText) ? { text: dtText } : null;
        if (dt) {
          const turnText = colText(line.items, COL.turn).replace(/[\s ]/g, "");
          cur = {
            dt: dt.text,
            parts: [colText(line.items, COL.op)],
            amt: colText(line.items, COL.amt).replace(/[\s ]/g, ""),
            cur: colText(line.items, COL.cur),
            post: colText(line.items, COL.post),
            comm: colText(line.items, COL.comm).replace(/[\s ]/g, ""),
            turn: turnText,
          };
          raw.push(cur);
        } else if (cur) {
          // продолжение названия операции на следующей строке
          const more = colText(line.items, COL.op);
          if (more && !/^(Всего|Операции по|Транзакции|Дата|Операция)/.test(t)) cur.parts.push(more);
        }
      }
    }
    const txs = [];
    let broken = 0;
    for (const r of raw) {
      if (!NUM_RE.test(r.turn) || !CUR_RE.test(r.cur)) { broken++; continue; }
      const amount = parseFloat(r.turn);
      if (amount === 0) continue;
      const [datePart, time] = r.dt.split(" ");
      let text = stripSecrets(r.parts.join(" "));
      if (/^ATM\b/.test(text)) text = "Выдача наличных · " + text;
      const tx = {
        date: toIso(datePart),
        regDate: DATE_RE.test(r.post) ? toIso(r.post) : null,
        time,
        type: null,
        amount,
        currency: header.currency || r.cur,
        mcc: null,
        card: null,
        purpose: "",
        place: text,
        details: text,
        balance: null,
      };
      // Валютная операция: показываем и исходную сумму
      if (header.currency && r.cur !== header.currency && NUM_RE.test(r.amt)) {
        tx.origAmount = Math.abs(parseFloat(r.amt));
        tx.details += ` (${Math.abs(parseFloat(r.amt)).toFixed(2)} ${r.cur})`;
      }
      txs.push(tx);
    }
    header.broken = broken;
    return { header, txs };
  }

  // Сверка с итогами: поступления, списания (за вычетом Money-back) и конечный баланс
  function validate(txs, header) {
    let inc = 0, exp = 0;
    for (const t of txs) { if (t.amount > 0) inc += cents(t.amount); else exp += cents(-t.amount); }
    const res = { count: txs.length, income: inc / 100, expense: exp / 100 };
    res.headerIncome = header.income; res.headerExpense = header.expense;
    res.incomeOk = header.income == null ? null : cents(header.income) === inc;
    res.expenseOk = header.expense == null ? null : cents(header.expense) === exp;
    res.ok = res.incomeOk === true && res.expenseOk === true;
    return res;
  }

  const api = { COL, detect, parse, parseHeader, validate, stripSecrets };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PriorParser = api;
})(typeof self !== "undefined" ? self : this);
