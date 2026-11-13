// sber.js: разбор PDF-выписки «Сбер Банк» (Беларусь) «Выписка по счету за период …».
// Принимает страницы: каждая страница это список фрагментов {vx, vy, text} (координаты окна просмотра, vy растёт вниз).
// Работает и в браузере (глобальный объект SberParser), и в Node (для тестов).
//
// Особенности выписки:
//  - сумма уже со знаком, в валюте операции и в валюте счёта отдельными колонками;
//  - первая строка операции содержит дату отражения по счёту, дату и сумму, остальные строки (время, описание, страна и город,
//    торговая точка) стоят НИЖЕ неё: строка относится к ближайшей сверху строке с датой;
//  - в шапке есть входящий и исходящий остаток и обороты (поступило, списано), поэтому сверка идёт до копейки;
//  - даты: «дата отражения» (колонка 1) и «дата и время транзакции» (колонка 2): считаем по дате транзакции, как в других банках;
//  - номер договора, счёт, номер карты и ФИО парсер не читает и не возвращает.

(function (root) {
  "use strict";

  const COL = { post: [0, 70], date: [70, 135], desc: [260, 540], cur: [540, 600], amtOp: [600, 700], amtAcc: [700, 820] };
  const MAX_DY = 70;      // насколько ниже строки с датой может стоять строка её описания
  const DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/;
  const TIME_RE = /^\d{2}:\d{2}:\d{2}$/;
  const NUM_RE = /^-?\d+\.\d{2}$/;
  const FOOT_RE = /остаток|обороты|поступило|списано|ответственный/i;

  const inCol = (x, c) => x >= c[0] && x < c[1];
  const toIso = d => { const [dd, mm, yyyy] = d.split("."); return `${yyyy}-${mm}-${dd}`; };
  const cents = n => Math.round(n * 100);
  const num = s => parseFloat(String(s).replace(/[\s ]/g, ""));
  const squash = s => s.replace(/\s+/g, "").toLowerCase();

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
    const t = squash(pageLines(clean(pages.slice(0, 1))[0]).join(" "));
    return t.includes("сбербанк") && t.includes("выпискапосчетузапериод");
  }

  // Итоги из шапки и подвала. Номер договора, счёт и ФИО нарочно не читаем.
  function parseHeader(pages) {
    const h = { bank: "sber" };
    const all = clean(pages).flatMap(pageLines);
    let m;
    for (const line of all) {
      if ((m = line.match(/Выписка по счету за период\s+(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/i))) { h.from = toIso(m[1]); h.to = toIso(m[2]); }
      if ((m = line.match(/Валюта счета\s+([A-Z]{3})/))) h.currency = m[1];
      if ((m = line.match(/Входящий остаток в валюте счета\s+(-?[\d\s ]+\.\d{2})/i))) h.opening = num(m[1]);
      if ((m = line.match(/Исходящий остаток в валюте счета\s+(-?[\d\s ]+\.\d{2})/i))) h.closing = num(m[1]);
      if ((m = line.match(/\(\+\)\s*поступило\s+(-?[\d\s ]+\.\d{2})/i))) h.income = num(m[1]);
      if ((m = line.match(/\(-\)\s*списано\s+(-?[\d\s ]+\.\d{2})/i))) h.expense = Math.abs(num(m[1]));
    }
    return h;
  }

  function pageOps(items, currency) {
    const body = items.filter(i => !FOOT_RE.test(i.text));
    const anchors = body.filter(i => inCol(i.x, COL.post) && DATE_RE.test(i.text))
      .filter(a => body.some(b => inCol(b.x, COL.amtAcc) && NUM_RE.test(b.text) && Math.abs(b.y - a.y) <= 2))
      .sort((a, b) => a.y - b.y);
    const groups = anchors.map(a => ({ a, items: [] }));
    for (const it of body) {
      if (it.y < anchors[0]?.y - 2 || !groups.length) continue;
      let g = null;
      for (const x of groups) if (x.a.y - 2 <= it.y) g = x;       // ближайшая сверху строка с датой
      if (g && it.y - g.a.y <= MAX_DY) g.items.push(it);
    }
    return groups.map(g => parseOp(g, currency)).filter(Boolean);
  }

  function parseOp(g, currency) {
    const it = g.items;
    const sameRow = (col, re) => it.filter(i => inCol(i.x, col) && re.test(i.text) && Math.abs(i.y - g.a.y) <= 2)[0];
    const acc = sameRow(COL.amtAcc, NUM_RE);
    const opAmt = sameRow(COL.amtOp, NUM_RE);
    const cur = sameRow(COL.cur, /^[A-Z]{3}$/);
    const txDate = sameRow(COL.date, DATE_RE);
    const time = it.filter(i => inCol(i.x, COL.date) && TIME_RE.test(i.text)).sort((a, b) => a.y - b.y)[0];
    if (!acc) return null;
    const desc = it.filter(i => inCol(i.x, COL.desc)).sort((a, b) => a.y - b.y || a.x - b.x)
      .map(i => i.text).filter(t => !/^\((дебетовая|кредитовая)\)$/i.test(t)).join(" ").replace(/\s+/g, " ").trim();
    const tx = {
      date: toIso((txDate || g.a).text),
      regDate: toIso(g.a.text),
      time: time && time.text !== "00:00:00" ? time.text : null,
      type: null,
      amount: parseFloat(acc.text),
      currency: currency || (cur && cur.text) || "BYN",
      mcc: null,
      details: desc,
    };
    if (opAmt && cur && cur.text !== tx.currency) { tx.origAmount = parseFloat(opAmt.text); tx.details += ` (${opAmt.text} ${cur.text})`; }
    return tx;
  }

  function parse(pages) {
    const header = parseHeader(pages);
    const all = [];
    clean(pages).forEach(items => { for (const o of pageOps(items, header.currency)) all.push(o); });
    // Служебные строки с нулевой суммой (капитализация процентов) расходом и доходом не являются
    const txs = all.filter(t => t.amount !== 0);
    header.zeroSkipped = all.length - txs.length;
    header.broken = 0;
    return { header, txs };
  }

  // Сверка с шапкой: поступило, списано и остаток (входящий + поступило − списано = исходящий)
  function validate(txs, header) {
    let inc = 0, exp = 0;
    for (const t of txs) { if (t.amount > 0) inc += cents(t.amount); else exp += cents(-t.amount); }
    const res = { count: txs.length, income: inc / 100, expense: exp / 100 };
    res.incomeOk = header.income == null ? null : cents(header.income) === inc;
    res.expenseOk = header.expense == null ? null : cents(header.expense) === exp;
    res.balanceOk = header.opening == null || header.closing == null ? null :
      cents(header.opening) + inc - exp === cents(header.closing);
    res.ok = res.incomeOk === true && res.expenseOk === true && res.balanceOk !== false;
    return res;
  }

  const api = { COL, detect, parse, parseHeader, validate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SberParser = api;
})(typeof self !== "undefined" ? self : this);
