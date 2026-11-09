// belinvest.js: разбор PDF-выписки «Список платежей» по карточке Белинвестбанка (интернет-банкинг).
// Принимает страницы: каждая страница это список фрагментов {vx, vy, text} (координаты окна просмотра, vy растёт вниз).
// Работает и в браузере (глобальный объект BelinvestParser), и в Node (для тестов).
//
// Особенности выписки:
//  - таблица: дата операции (под ней время), дата обработки, маска карточки, код авторизации, тип операции,
//    MCC, место проведения (несколько строк), сумма в валюте транзакции, «сумма/комиссия» в валюте счёта,
//    остаток после операции, статус, номер операции в ЕРИП;
//  - суммы со знаком: расход с минусом, приход без знака; валюта стоит рядом с числом («-1.15 BYN»);
//  - одна операция занимает несколько строк: первая строка с датами и суммами, ниже время, продолжение типа и места;
//  - итоги «Приход: …» и «Расход: …» стоят под таблицей на последней странице, название банка там же;
//  - в шапке ФИО, номер карточки и счёт: парсер их не читает и не возвращает.

(function (root) {
  "use strict";

  // Левые края колонок (координата vx) по реальной выписке; числа выровнены вправо, поэтому границы с запасом
  const COL = {
    date:    [0, 66],      // дата операции, под ней время
    reg:     [66, 105],    // дата обработки
    card:    [105, 150],   // маска карточки
    auth:    [150, 198],   // код авторизации
    type:    [198, 258],   // тип операции (Покупка, Перевод средств …)
    mcc:     [258, 284],   // MCC
    place:   [284, 336],   // место проведения
    amtOp:   [336, 380],   // сумма в валюте транзакции
    amtAcc:  [380, 440],   // сумма/комиссия в валюте счёта на дату обработки
    balance: [440, 484],   // остаток после операции
    status:  [484, 526],   // статус
    erip:    [526, 600],   // номер операции в ЕРИП
  };
  const LINE = 14.2;       // шаг строк таблицы
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
  const NUM = "-?\\d[\\d\\s]*(?:[.,]\\d+)?";
  const AMT_RE = new RegExp(`^(${NUM})\\s*([A-Z]{3})$`);
  const ACC_RE = new RegExp(`^(${NUM})\\s*\\/\\s*(${NUM})\\s*([A-Z]{3})$`);
  const FOOT_RE = /^(Приход|Расход):|^Доля безналичного|Белинвестбанк|^Стр\.\s*\d/;

  const inCol = (x, c) => x >= c[0] && x < c[1];
  const num = s => parseFloat(String(s).replace(/\s/g, "").replace(",", "."));
  const cents = n => Math.round(n * 100);
  const toIso = d => { const [dd, mm, yyyy] = d.split("."); return `${yyyy}-${mm}-${dd}`; };

  const clean = pages => pages.map(items => items
    .map(i => ({ x: i.vx, y: i.vy, text: (i.text || "").trim() }))
    .filter(i => i.text));
  const allText = pages => clean(pages).map(p => p.map(i => i.text).join(" ")).join(" ");

  // Признаки: заголовок «Список платежей», строка «Доступная сумма:» и колонка «Номер операции в ЕРИП» на первой странице.
  // Название банка стоит только в конце выписки, поэтому как признак не обязательно.
  function detect(pages) {
    if (!pages.length) return false;
    const first = allText(pages.slice(0, 1));
    return /Список платежей/.test(first) && /Доступная сумма:/.test(first) && /Неснижаемый остаток:/.test(first) && /ЕРИП/.test(first);
  }

  // Шапка и итоги. ФИО, карточку и счёт нарочно не читаем.
  function parseHeader(pages) {
    const h = { bank: "belinvest" };
    const text = allText(pages);
    let m;
    if ((m = text.match(/за период\s+с\s+(\d{2}\.\d{2}\.\d{4})\s+по\s+(\d{2}\.\d{2}\.\d{4})/i))) { h.from = toIso(m[1]); h.to = toIso(m[2]); }
    if ((m = text.match(/Валюта сч[её]та:?\s*([A-Z]{3})/))) h.currency = m[1];
    if ((m = text.match(new RegExp(`Приход:\\s*(${NUM})`)))) h.income = num(m[1]);
    if ((m = text.match(new RegExp(`Расход:\\s*(${NUM})`)))) h.expense = Math.abs(num(m[1]));
    return h;
  }

  const joinCol = (items, col) => items
    .filter(i => inCol(i.x, col))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map(i => i.text).join(" ").replace(/\s+/g, " ").trim();

  // Операции одной страницы: опорная строка (дата операции и сумма в валюте счёта на одной высоте),
  // к ней относятся фрагменты ниже до следующей опоры, но не дальше трёх строк и не итоги под таблицей
  function pageGroups(items) {
    const body = items.filter(i => !FOOT_RE.test(i.text));
    const anchors = body.filter(i => inCol(i.x, COL.date) && DATE_RE.test(i.text)
      && body.some(j => inCol(j.x, COL.amtAcc) && ACC_RE.test(j.text) && Math.abs(j.y - i.y) <= 2))
      .sort((a, b) => a.y - b.y);
    const groups = anchors.map((a, k) => {
      const next = anchors[k + 1] ? anchors[k + 1].y - 2 : a.y + LINE * 3.5;
      const stop = Math.min(next, a.y + LINE * 3.5);
      return { a, items: body.filter(i => i.y >= a.y - 2 && i.y < stop) };
    });
    // Хвост операции с прошлой страницы (строки места или типа выше первой опоры)
    const firstY = anchors.length ? anchors[0].y - 2 : Infinity;
    const carry = body.filter(i => i.y < firstY && (inCol(i.x, COL.place) || inCol(i.x, COL.type) || (inCol(i.x, COL.date) && TIME_RE.test(i.text))));
    return { groups, carry };
  }

  function parseOp(g, currency) {
    const it = g.items, y0 = g.a.y;
    const at = (col, re) => it.filter(i => inCol(i.x, col) && re.test(i.text) && Math.abs(i.y - y0) <= 2)[0];
    const acc = at(COL.amtAcc, ACC_RE);
    if (!acc) return null;
    const [, sum, fee, accCur] = acc.text.match(ACC_RE);
    const op = at(COL.amtOp, AMT_RE), bal = at(COL.balance, AMT_RE);
    const reg = at(COL.reg, DATE_RE), mcc = at(COL.mcc, /^\d{4}$/), card = at(COL.card, /\d{4}/);
    const time = it.filter(i => inCol(i.x, COL.date) && TIME_RE.test(i.text)).sort((a, b) => a.y - b.y)[0];
    const status = joinCol(it, COL.status);
    const type = joinCol(it, COL.type);
    const place = joinCol(it, COL.place);
    const erip = joinCol(it, COL.erip);
    // Комиссия в выписке без знака: если она есть, это дополнительное списание по той же операции
    const feeAbs = Math.abs(num(fee));
    const amount = (cents(num(sum)) - cents(feeAbs)) / 100;
    const tx = {
      date: g.a.text,
      regDate: reg ? reg.text : null,
      time: time ? time.text.slice(0, 5) : null,
      type: type || null,
      amount,
      currency: currency || accCur,
      mcc: mcc ? mcc.text : null,
      card: card ? card.text : null,
      purpose: type, place,
      details: [type, place].filter(Boolean).join(" · "),
      balance: bal ? num(bal.text.match(AMT_RE)[1]) : null,
    };
    if (feeAbs) { tx.fee = feeAbs; tx.details += ` (комиссия ${feeAbs.toFixed(2)})`; }
    if (erip) tx.erip = erip;
    if (status && !/^ПРОВЕДЕН/i.test(status)) { tx.status = status; tx.pending = true; }
    // Операция в другой валюте: показываем и исходную сумму
    if (op) {
      const [, opSum, opCur] = op.text.match(AMT_RE);
      if (opCur !== tx.currency) { tx.origAmount = num(opSum); tx.origCurrency = opCur; tx.details += ` (${opSum} ${opCur})`; }
    }
    return tx;
  }

  function parse(pages) {
    const header = parseHeader(pages);
    const txs = [];
    let broken = 0, last = null;
    for (const items of clean(pages)) {
      const { groups, carry } = pageGroups(items);
      if (last && carry.length) {
        const more = (col) => carry.filter(i => inCol(i.x, col)).sort((a, b) => a.y - b.y).map(i => i.text).join(" ");
        const t = more(COL.type), p = more(COL.place);
        if (t) last.type = last.purpose = [last.type, t].filter(Boolean).join(" ");
        if (p) last.place = [last.place, p].filter(Boolean).join(" ");
        if (!last.time) { const tm = carry.find(i => inCol(i.x, COL.date) && TIME_RE.test(i.text)); if (tm) last.time = tm.text.slice(0, 5); }
        last.details = [last.purpose, last.place].filter(Boolean).join(" · ");
      }
      for (const g of groups) {
        const tx = parseOp(g, header.currency);
        if (tx) { txs.push(tx); last = tx; } else broken++;
      }
    }
    // Остатки: самая свежая операция стоит первой. Начальный остаток = остаток после самой ранней операции минус её сумма.
    const withBal = txs.filter(t => t.balance != null);
    if (withBal.length) {
      header.closing = withBal[0].balance;
      const first = withBal[withBal.length - 1];
      header.opening = (cents(first.balance) - cents(first.amount)) / 100;
    }
    // Период закрыт или не найден: берём по датам операций
    if (!header.from && txs.length) { const d = txs.map(t => t.date).sort(); header.from = d[0]; header.to = d[d.length - 1]; header.periodGuessed = true; }
    header.broken = broken;
    return { header, txs };
  }

  // Сверка с итогами под таблицей: приход и расход до копейки
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

  const api = { COL, detect, parse, parseHeader, validate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BelinvestParser = api;
})(typeof self !== "undefined" ? self : this);
