// belarusbank.js: разбор PDF-выписки по счёту «Беларусбанк» (выписка из мобильного приложения).
// Принимает страницы: каждая страница это список фрагментов {vx, vy, text} (координаты окна просмотра, vy растёт вниз).
// Работает и в браузере (глобальный объект BelarusbankParser), и в Node (для тестов).
//
// Особенности выписки:
//  - направление операции указано словами «Приход» / «Расход», знак определять по остатку не нужно;
//  - сумма в валюте счёта отдельной колонкой (для валютной покупки она не равна сумме в валюте операции);
//  - есть код MCC;
//  - одна операция занимает несколько строк, строки соседних операций чередуются по высоте, поэтому
//    опорой служит строка с валютой операции, а остальные фрагменты привязываются к ближайшей по высоте опоре;
//  - в шапке ФИО, телефон и IBAN: парсер их не читает и не возвращает.

(function (root) {
  "use strict";

  // Левые края колонок (координата vx) по реальной выписке; границы с запасом на длинные числа
  const COL = {
    post:    [84, 134],    // дата и время совершения операции
    reg:     [134, 176],   // дата и время отражения по счёту
    name:    [176, 297],   // наименование операции
    place:   [297, 366],   // место совершения операции
    cur:     [366, 396],   // валюта операции
    dir:     [396, 424],   // Приход / Расход
    amtOp:   [424, 466],   // сумма в валюте операции
    amtAcc:  [466, 508],   // сумма в валюте счёта
    balance: [508, 558],   // остаток после операции
    mcc:     [558, 600],   // MCC
    card:    [0, 84],      // маска карты
  };
  const MAX_DY = 18;       // насколько выше или ниже опорной строки может стоять фрагмент той же операции
  const DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/;
  const TIME_RE = /^\d{2}:\d{2}$/;
  const CUR_RE = /^[A-Z]{3}$/;
  const NUM_RE = /^-?\d+\.\d{2}$/;

  const inCol = (x, c) => x >= c[0] && x < c[1];
  const toIso = d => { const [dd, mm, yyyy] = d.split("."); return `${yyyy}-${mm}-${dd}`; };
  const cents = n => Math.round(n * 100);

  const clean = pages => pages.map(items => items
    .map(i => ({ x: i.vx, y: i.vy, text: (i.text || "").trim() }))
    .filter(i => i.text));

  function pageLines(items) {
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    for (const it of sorted) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - it.y) <= 2) last.items.push(it);
      else lines.push({ y: it.y, items: [it] });
    }
    return lines.map(l => l.items.sort((a, b) => a.x - b.x).map(i => i.text).join(" "));
  }

  function detect(pages) {
    if (!pages.length) return false;
    const text = pageLines(clean(pages.slice(0, 1))[0]).join("\n");
    return /Выписка по счету/i.test(text) && /Регистрационный номер приложения/i.test(text) && /Лимит овердрафта/i.test(text);
  }

  // Итоги из шапки. ФИО, телефон и IBAN нарочно не читаем.
  function parseHeader(pages) {
    const h = { bank: "belarusbank" };
    const first = pageLines(clean(pages)[0] || []);
    let m;
    for (const line of first) {
      if ((m = line.match(/за период\s+(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/i))) { h.from = toIso(m[1]); h.to = toIso(m[2]); }
      if ((m = line.match(/Валюта счета:?\s*([A-Z]{3})/))) h.currency = m[1];
      if ((m = line.match(/Остаток на начало периода:?\s*(-?\d+\.\d{2})/))) h.opening = parseFloat(m[1]);
      if ((m = line.match(/Остаток на конец периода:?\s*(-?\d+\.\d{2})/))) h.closing = parseFloat(m[1]);
      if ((m = line.match(/Зачислено за период:?\s*(\d+\.\d{2})/))) h.income = parseFloat(m[1]);
      if ((m = line.match(/Сумма расходных операций за период:?\s*(\d+\.\d{2})/))) h.expense = parseFloat(m[1]);
    }
    return h;
  }

  const joinCol = (items, col) => items
    .filter(i => inCol(i.x, col))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map(i => i.text).join(" ").replace(/\s+/g, " ").trim();

  // Операции одной страницы: опорные строки (валюта в колонке «Валюта») и фрагменты вокруг них
  function pageOps(items, currency) {
    const anchors = items.filter(i => inCol(i.x, COL.cur) && CUR_RE.test(i.text)).sort((a, b) => a.y - b.y);
    if (!anchors.length) return [];
    const groups = anchors.map(a => ({ a, items: [] }));
    for (const it of items) {
      let best = null, bd = Infinity;
      for (const g of groups) { const d = Math.abs(it.y - g.a.y); if (d < bd) { bd = d; best = g; } }
      if (best && bd <= MAX_DY) best.items.push(it);
    }
    return groups.map(g => parseOp(g, currency)).filter(Boolean);
  }

  function parseOp(g, currency) {
    const it = g.items;
    const get = (col, re) => it.filter(i => inCol(i.x, col) && re.test(i.text)).sort((a, b) => a.y - b.y)[0];
    const dirItem = get(COL.dir, /^(Приход|Расход)$/);
    const accItem = get(COL.amtAcc, NUM_RE);
    const balItem = get(COL.balance, NUM_RE);
    const post = get(COL.post, DATE_RE), reg = get(COL.reg, DATE_RE);
    if (!dirItem || !accItem || !post) return null;
    const postTime = get(COL.post, TIME_RE);
    const opItem = get(COL.amtOp, NUM_RE);
    const mccItem = get(COL.mcc, /^\d{4}$/);
    const purpose = joinCol(it, COL.name);
    const place = joinCol(it, COL.place);
    const card = joinCol(it, COL.card);
    const abs = parseFloat(accItem.text);
    const sign = dirItem.text === "Приход" ? 1 : -1;
    const opCur = g.a.text;
    const tx = {
      date: toIso(post.text),
      regDate: reg ? toIso(reg.text) : null,
      time: postTime ? postTime.text : null,
      type: null,
      amount: sign * abs,
      currency: currency || opCur,
      mcc: mccItem ? mccItem.text : null,
      card: card || null,
      purpose, place,
      details: [purpose, place].filter(Boolean).join(" · "),
      balance: balItem ? parseFloat(balItem.text) : null,
    };
    // Валютная операция: показываем и исходную сумму
    if (opItem && opCur !== (currency || opCur)) {
      tx.origAmount = parseFloat(opItem.text);
      tx.details += ` (${opItem.text} ${opCur})`;
    }
    return tx;
  }

  function parse(pages) {
    const header = parseHeader(pages);
    const all = [];
    clean(pages).forEach(items => all.push(...pageOps(items, header.currency)));
    // Служебные строки с нулевой суммой (капитализация процентов) расходом и доходом не являются
    const txs = all.filter(t => t.amount !== 0);
    header.zeroSkipped = all.length - txs.length;
    header.broken = 0;
    return { header, txs };
  }

  // Сверка с итогами в шапке: приход, расход и остаток (начало + приход − расход = конец)
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
  else root.BelarusbankParser = api;
})(typeof self !== "undefined" ? self : this);
