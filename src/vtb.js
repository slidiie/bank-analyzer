// vtb.js: разбор PDF-выписки «Банк ВТБ (Беларусь)».
// Принимает страницы: каждая страница это список фрагментов {vx, vy, text}, где vx/vy координаты
// на странице после её поворота (vy растёт вниз). Выписка ВТБ альбомная, поэтому сырые координаты
// pdf.js здесь не годятся, нужны координаты окна просмотра (их считает загрузчик в analyzer.html).
// Работает и в браузере (глобальный объект VtbParser), и в Node (для тестов).
//
// Особенности выписки ВТБ:
//  - у сумм нет знака: приход это или расход, определяем по изменению остатка;
//  - внутри одной секунды операции идут не в порядке остатков, поэтому остатки сшиваем в цепочку;
//  - MCC-кодов нет: категорию определяем по «Назначению платежа» и месту операции;
//  - в шапке паспортные данные и номер счёта: парсер их не читает и не возвращает.

(function (root) {
  "use strict";

  // Левые края колонок (координата vx) по реальной выписке; границы с запасом
  const COL = {
    reg:     [30, 110],    // дата и время отражения операции
    post:    [110, 185],   // дата и время совершения операции
    card:    [185, 262],   // маска карты
    purpose: [262, 388],   // назначение платежа
    place:   [388, 488],   // место проведения операции
    cur:     [488, 548],   // валюта операции
    amtOp:   [548, 608],   // сумма в валюте операции
    amtAcc:  [608, 683],   // сумма в валюте счёта
    equiv:   [683, 728],   // эквивалент в BYN (для счетов не в BYN)
    balance: [728, 900],   // остаток на счёте
  };
  const LINE_GAP = 7.5;    // строки внутри одной операции стоят вплотную, между операциями зазор больше
  const DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/;
  const TIME_RE = /^\d{2}:\d{2}:\d{2}$/;
  const CUR_RE = /^[A-Z]{3}$/;
  const NUM_RE = /^-?\d[\d\s ]*,\d{2}$/;

  const inCol = (x, c) => x >= c[0] && x < c[1];
  const toIso = d => { const [dd, mm, yyyy] = d.split("."); return `${yyyy}-${mm}-${dd}`; };
  const num = s => parseFloat(String(s).replace(/[\s ]/g, "").replace(",", "."));
  const cents = n => Math.round(n * 100);

  const clean = pages => pages.map(items => items
    .map(i => ({ x: i.vx, y: i.vy, text: (i.text || "").trim() }))
    .filter(i => i.text));

  // Строки страницы целиком: нужны для шапки и для определения банка
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
    return /Банк ВТБ/i.test(text) && /ВЫПИСКА ПО СЧЕТАМ КЛИЕНТА/i.test(text);
  }

  // Итоги из шапки. Имя, паспорт и номер счёта нарочно не читаем и не сохраняем.
  function parseHeader(pages) {
    const h = { bank: "vtb" };
    const all = clean(pages).map(pageLines);
    const first = all[0] || [];
    const body = all.flat();
    let m;
    for (const line of first) {
      if ((m = line.match(/За период с:?\s*(\d{2}\.\d{2}\.\d{4})\s*по:?\s*(\d{2}\.\d{2}\.\d{4})/))) { h.from = toIso(m[1]); h.to = toIso(m[2]); }
      if ((m = line.match(/Валюта счета:?\s*([A-Z]{3})/))) h.currency = m[1];
      if ((m = line.match(/Входящий остаток с учетом лимита овердрафта, в валюте счета:?\s*(-?[\d\s ]+,\d{2})/))) h.opening = num(m[1]);
    }
    for (const line of body) {
      if ((m = line.match(/Исходящий остаток с учетом лимита овердрафта, в валюте счета:?\s*(-?[\d\s ]+,\d{2})/))) h.closing = num(m[1]);
      if (h.income == null && (m = line.match(/\(\+\)\s*поступило\s+(\d[\d\s ]*,\d{2})/))) h.income = num(m[1]);
      if (h.expense == null && (m = line.match(/\(-\)\s*списано\s+(\d[\d\s ]*,\d{2})/))) h.expense = num(m[1]);
    }
    h.accounts = body.filter(l => /Валюта счета:/.test(l)).length;
    return h;
  }

  // Операция = группа вплотную стоящих строк, в которой есть строка с валютой в колонке «Валюта».
  // Шапки таблиц на страницах и итоги в конце группы без такой строки, их пропускаем.
  function groupOps(items) {
    const ys = [...new Set(items.map(i => Math.round(i.y * 10) / 10))].sort((a, b) => a - b);
    const groups = [];
    let cur = null;
    for (const y of ys) {
      if (cur && y - cur.hi > LINE_GAP) cur = null;
      if (!cur) { cur = { lo: y, hi: y }; groups.push(cur); }
      cur.hi = y;
    }
    return groups
      .map(g => items.filter(i => i.y >= g.lo - 0.1 && i.y <= g.hi + 0.1))
      .filter(g => g.some(i => inCol(i.x, COL.cur) && CUR_RE.test(i.text)));
  }

  const joinCol = (items, col) => items
    .filter(i => inCol(i.x, col))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map(i => i.text).join(" ").replace(/\s+/g, " ").trim();

  function parseOp(items) {
    const get = (col, re) => items.find(i => inCol(i.x, col) && re.test(i.text));
    const accItem = get(COL.amtAcc, NUM_RE);
    const balItem = get(COL.balance, NUM_RE);
    const cur = get(COL.cur, CUR_RE);
    if (!accItem || !balItem || !cur) return null;
    const regDate = get(COL.reg, DATE_RE), postDate = get(COL.post, DATE_RE);
    const regTime = get(COL.reg, TIME_RE), postTime = get(COL.post, TIME_RE);
    const opItem = get(COL.amtOp, NUM_RE);
    const purpose = joinCol(items, COL.purpose);
    const place = joinCol(items, COL.place);
    const card = items.filter(i => inCol(i.x, COL.card)).sort((a, b) => a.y - b.y).map(i => i.text).join("");
    const date = postDate || regDate;
    return {
      date: date ? toIso(date.text) : null,
      regDate: regDate ? toIso(regDate.text) : null,
      time: (postTime || regTime) ? (postTime || regTime).text : null,
      type: null,
      absAmount: num(accItem.text),
      origAmount: opItem ? num(opItem.text) : null,
      currency: cur.text,
      mcc: null,
      card: card || null,
      purpose,
      place,
      details: [purpose, place].filter(Boolean).join(" · "),
      balance: num(balItem.text),
    };
  }

  // Знак суммы. У ВТБ он не указан, но остаток после операции = предыдущий остаток ± сумма.
  // Операции внутри одной секунды в файле идут вперемешку, поэтому на каждом шаге берём первую
  // из оставшихся операций, которая «ложится» на текущий остаток (разница равна её сумме).
  function applySigns(ops, opening) {
    const left = ops.map((o, i) => ({ o, i }));
    const out = [];
    let prev = opening == null ? 0 : opening;
    let broken = 0;
    while (left.length) {
      let k = left.findIndex(({ o }) => cents(Math.abs(o.balance - prev)) === cents(o.absAmount));
      let sign;
      if (k >= 0) {
        const d = cents(left[k].o.balance - prev);
        sign = d < 0 ? -1 : 1;
      } else {
        // цепочка прервалась (нестандартная операция): берём следующую по порядку, знак по остатку
        k = 0; broken++;
        sign = left[0].o.balance < prev ? -1 : 1;
      }
      const { o } = left.splice(k, 1)[0];
      out.push({ o, sign });
      prev = o.balance;
    }
    // возвращаем в порядке файла, но уже со знаком
    const order = new Map(out.map((r, n) => [r.o, r.sign]));
    return { txs: ops.map(o => finalize(o, order.get(o))), broken };
  }

  function finalize(o, sign) {
    const tx = {
      date: o.date, regDate: o.regDate, time: o.time, type: o.type,
      amount: sign * o.absAmount,
      currency: o.currency, mcc: null, card: o.card,
      purpose: o.purpose, place: o.place, details: o.details,
      balance: o.balance,
    };
    // Валютная операция: показываем и исходную сумму
    if (o.currency !== "BYN" && o.origAmount != null && o.origAmount !== o.absAmount) {
      tx.origAmount = o.origAmount;
      tx.details += ` (${String(o.origAmount).replace(".", ",")} ${o.currency})`;
    }
    return tx;
  }

  function parse(pages) {
    const header = parseHeader(pages);
    const raw = [];
    clean(pages).forEach(items => groupOps(items).forEach(g => { const op = parseOp(g); if (op) raw.push(op); }));
    const signed = applySigns(raw, header.opening);
    header.broken = signed.broken;
    // Служебные строки с нулевой суммой (капитализация процентов, открытие договора) расходом и доходом не являются
    const txs = signed.txs.filter(t => t.amount !== 0);
    header.zeroSkipped = signed.txs.length - txs.length;
    return { header, txs };
  }

  // Какие списания могут быть «пересылкой» только что пришедших денег на свой же счёт:
  // платежи через ЕРИП, P2P-переводы и пополнение вклада. Покупки и снятие наличных сюда не входят.
  const isPassThroughOut = tx => tx.amount < 0 && /коммунальных, почтовых|ERIP|P2P|On-line пополнение/i.test(tx.details || "");

  // Сверка с итогами в шапке
  function validate(txs, header) {
    let inc = 0, exp = 0;
    for (const t of txs) { if (t.amount > 0) inc += cents(t.amount); else exp += cents(-t.amount); }
    const res = { count: txs.length, income: inc / 100, expense: exp / 100 };
    res.incomeOk = header.income == null ? null : cents(header.income) === inc;
    res.expenseOk = header.expense == null ? null : cents(header.expense) === exp;
    res.ok = res.incomeOk === true && res.expenseOk === true;
    return res;
  }

  const api = { COL, detect, parse, parseHeader, validate, isPassThroughOut };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.VtbParser = api;
})(typeof self !== "undefined" ? self : this);
