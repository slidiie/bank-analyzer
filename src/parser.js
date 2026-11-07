// parser.js: разбор PDF-выписки МТБанка.
// Принимает фрагменты текста с координатами (как их отдаёт pdf.js) и собирает из них операции.
// Работает и в браузере (глобальный объект StatementParser), и в Node (для тестов).

(function (root) {
  "use strict";

  // Горизонтальные границы колонок таблицы (координата x левого края текста).
  // Подобраны по реальной выписке МТБ; если банк изменит вёрстку, править нужно здесь.
  const COL = {
    type:    [0, 40],      // Тип операции ("T")
    reg:     [40, 70],     // Дата и время регистрации
    post:    [95, 135],    // Дата проведения
    mcc:     [160, 195],   // MCC-код
    detail:  [200, 340],   // Место операции и описание
    card:    [280, 310],   // Маскированный номер карты
    cur:     [375, 410],   // Валюта
    amount:  [410, 450],   // Сумма
    sign:    [485, 510],   // Знак (+ / -)
    balance: [515, 580],   // Остаток на счёте
  };

  const AMOUNT_RE = /^\d+\.\d{2}$/;
  const BALANCE_RE = /^-?\d+\.\d{2}$/;
  const DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/;
  const TIME_RE = /^\d{2}:\d{2}:\d{2}$/;
  const MASKED_CARD_RE = /\*{3,}/;

  const inCol = (x, col) => x >= col[0] && x < col[1];
  const toIso = d => { const [dd, mm, yyyy] = d.split("."); return `${yyyy}-${mm}-${dd}`; };

  // Собираем фрагменты текста в строки по вертикальной координате (сверху вниз),
  // внутри строки сортируем слева направо.
  function groupLines(items) {
    const rows = new Map();
    for (const it of items) {
      const text = (it.text || "").trim();
      if (!text) continue;
      const y = Math.round(it.y);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: it.x, text });
    }
    return [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) => parts.sort((a, b) => a.x - b.x));
  }

  const hasCard = line => line.some(it => inCol(it.x, COL.card) && MASKED_CARD_RE.test(it.text));

  // Итоги из шапки выписки (первая страница)
  function parseHeader(lines) {
    const h = {};
    for (const line of lines) {
      const text = line.map(i => i.text).join(" ");
      let m;
      if ((m = text.match(/Входящий остаток:?\s*(-?\d+\.\d{2})/))) h.opening = parseFloat(m[1]);
      if ((m = text.match(/Исходящий остаток:?\s*(-?\d+\.\d{2})/))) h.closing = parseFloat(m[1]);
      if ((m = text.match(/Поступило:?\s*(\d+\.\d{2})/))) h.income = parseFloat(m[1]);
      if ((m = text.match(/Списано:?\s*(\d+\.\d{2})/))) h.expense = parseFloat(m[1]);
      if ((m = text.match(/Период выписки:?\s*с\s*(\d{2}\.\d{2}\.\d{4}).*?по\s*(\d{2}\.\d{2}\.\d{4})/))) {
        h.from = toIso(m[1]);
        h.to = toIso(m[2]);
      }
    }
    return h;
  }

  // Каждая операция начинается со строки, где в колонке суммы стоит число,
  // а в колонке знака + или -. Строка с картой над ней относится к той же операции.
  function parseTransactions(lines) {
    const marks = [];
    lines.forEach((line, i) => {
      const hasAmt = line.some(it => inCol(it.x, COL.amount) && AMOUNT_RE.test(it.text));
      const hasSign = line.some(it => inCol(it.x, COL.sign) && /^[+-]$/.test(it.text));
      if (!hasAmt || !hasSign) return;
      let start = i;
      if (!hasCard(line) && i > 0 && hasCard(lines[i - 1])) start = i - 1;
      marks.push({ anchor: i, start });
    });

    const txs = [];
    marks.forEach((m, k) => {
      const end = k + 1 < marks.length ? marks[k + 1].start : lines.length;
      const tx = parseBlock(lines.slice(m.start, end));
      // Тип "E": отклонённая операция (деньги не списаны, баланса нет): пропускаем.
      if (tx && tx.type !== "E") txs.push(tx);
    });
    return txs;
  }

  function parseBlock(block) {
    const items = block.flat();
    const find = (col, re) => items.find(it => inCol(it.x, col) && re.test(it.text));

    const signItem = find(COL.sign, /^[+-]$/);
    const amounts = items.filter(it => inCol(it.x, COL.amount) && AMOUNT_RE.test(it.text));
    if (!signItem || amounts.length === 0) return null;

    // Первая сумма: в валюте операции, вторая (если есть): в валюте счёта.
    // Для операций в BYN они совпадают. Для валютных операций берём вторую.
    const accountAmount = parseFloat((amounts[1] || amounts[0]).text);
    const amount = signItem.text === "-" ? -accountAmount : accountAmount;

    const regDate = find(COL.reg, DATE_RE);
    const regTime = find(COL.reg, TIME_RE);
    const postDate = find(COL.post, DATE_RE);
    const mcc = find(COL.mcc, /^\d{4}$/);
    const cur = find(COL.cur, /^[A-Z]{3}$/);
    const bal = find(COL.balance, BALANCE_RE);
    const type = items.find(it => inCol(it.x, COL.type));
    const card = items.find(it => inCol(it.x, COL.card) && MASKED_CARD_RE.test(it.text));

    const details = items
      .filter(it => inCol(it.x, COL.detail) && !MASKED_CARD_RE.test(it.text))
      .map(it => it.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    const main = postDate || regDate;
    return {
      date: main ? toIso(main.text) : null,
      regDate: regDate ? toIso(regDate.text) : null,
      time: regTime ? regTime.text : null,
      type: type ? type.text : null,
      amount,
      currency: cur ? cur.text : null,
      mcc: mcc ? mcc.text : null,
      card: card ? card.text : null,
      details,
      balance: bal ? parseFloat(bal.text) : null,
    };
  }

  // Сверка: суммы разобранных операций должны совпасть с итогами в шапке выписки.
  function validate(txs, header) {
    const cents = n => Math.round(n * 100);
    let inc = 0, exp = 0;
    for (const t of txs) {
      if (t.amount > 0) inc += cents(t.amount); else exp += cents(-t.amount);
    }
    const res = { count: txs.length, income: inc / 100, expense: exp / 100 };
    res.incomeOk = header.income == null ? null : cents(header.income) === inc;
    res.expenseOk = header.expense == null ? null : cents(header.expense) === exp;
    res.ok = res.incomeOk === true && res.expenseOk === true;
    return res;
  }

  const api = { COL, groupLines, parseHeader, parseTransactions, validate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.StatementParser = api;
})(typeof self !== "undefined" ? self : this);
