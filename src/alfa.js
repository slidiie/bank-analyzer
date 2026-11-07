// alfa.js: разбор PDF-выписки «Альфа-Банк» (Беларусь) по КРЕДИТУ / кредитной карте («Выписка по кредиту за период …»).
// Принимает страницы: каждая страница это список фрагментов {vx, vy, text} (координаты окна просмотра, vy растёт вниз).
// Работает и в браузере (глобальный объект AlfaParser), и в Node (для тестов).
//
// Особенности выписки:
//  - колонки: Дата, Примечание, Сумма в валюте счёта, Сумма в валюте операции; знак стоит прямо в сумме;
//  - примечание занимает несколько строк, часть строк стоит ВЫШЕ строки с датой, часть НИЖЕ:
//    строки привязываются к ближайшей по высоте строке с датой;
//  - каждую покупку банк закрывает «Операцией предоставления транша» (внутренняя проводка, не доход);
//    «Погашение основного долга» и зачисление через ЕРИП тоже внутренние: категории отнесут их к «между своими»;
//  - «Погашение процентов» и «Вознаграждение за обслуживание» это плата банку;
//  - итогов за период в шапке нет, поэтому сверка идёт по составу строк (всё распознано, всё в периоде);
//  - слова в тексте PDF бывают разорваны («ЗАЧИ СЛЕНИЕ», «обс луживание»), поэтому смысл ищем без пробелов;
//  - номер договора, счёт и ФИО парсер не читает и не возвращает.

(function (root) {
  "use strict";

  const DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/;
  const AMT_RE = /^(-?\d+(?:\.\d+)?)\s*([A-Z]{3})$/;
  const COL = { date: [0, 100], note: [88, 440], acc: [440, 500], op: [500, 560] };
  const MAX_DY = 14;      // насколько выше или ниже строки с датой может стоять строка её примечания
  const HEAD_GAP = 12;    // сколько ниже слова «Примечание» заканчивается шапка таблицы

  const inCol = (x, c) => x >= c[0] && x < c[1];
  const toIso = d => { const [dd, mm, yyyy] = d.split("."); return `${yyyy}-${mm}-${dd}`; };
  const cents = n => Math.round(n * 100);
  const squash = s => s.replace(/\s+/g, "").toLowerCase();

  const clean = pages => pages.map(items => items
    .map(i => ({ x: i.vx, y: i.vy, text: (i.text || "").trim() }))
    .filter(i => i.text));

  const pageText = items => [...items].sort((a, b) => a.y - b.y || a.x - b.x).map(i => i.text).join(" ");

  function detect(pages) {
    if (!pages.length) return false;
    const t = squash(pageText(clean(pages.slice(0, 1))[0]));
    return t.includes("альфа-банк") && (t.includes("выпискапокредиту") || t.includes("выпискапокартеза"));
  }

  function parseHeader(pages) {
    const h = { bank: "alfa" };
    const first = clean(pages)[0] || [];
    const m = pageText(first).match(/Выписка по (?:кредиту|карте) за период\s+(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/i);
    if (m) { h.from = toIso(m[1]); h.to = toIso(m[2]); }
    return h;
  }

  // Что за операция по тексту примечания: [вид, описание]
  function classify(note) {
    const s = squash(note);
    if (s.includes("операцияпредоставлениятранша")) return ["tranche", "Операция предоставления транша по кредиту"];
    if (s.includes("погашениеосновногодолга")) return ["principal", "Погашение основного долга по кредиту"];
    if (s.includes("погашениепроцентов")) return ["interest", "Погашение процентов по кредиту"];
    if (s.includes("зачислениесредств")) return ["erip", "Зачисление на счёт кредита через ЕРИП (Приорбанк)"];
    if (s.includes("вознаграждениезаобс")) return ["fee", "Вознаграждение за обслуживание кредитной карты"];
    // Операция по карте: примечание начинается с даты покупки (8 цифр). Слова «Покупка товара / получение услуг» есть не всегда (оплата связи и т. п.)
    if (s.includes("покупкатовара") || /^\s*\d{8}\s/.test(note)) {
      const m = note.match(/^\s*(\d{8})?\s*(.*?)\s*Покупка\s+товара\s*\/\s*получение\s+услуг\s*(.*)$/i);
      const d8 = (note.match(/^\s*(\d{8})\s/) || [])[1] || null;
      const city = m ? m[2].trim() : "";
      const shop = m ? m[3].trim() : note.replace(/^\s*\d{8}\s*/, "").trim();
      return ["purchase", [shop, city].filter(Boolean).join(" · ") || "Покупка товара / получение услуг", d8];
    }
    return ["unknown", note.trim()];
  }

  function pageRows(items) {
    const head = items.find(i => /^Примечание$/i.test(i.text));
    const cut = head ? head.y + HEAD_GAP : -Infinity;
    const body = items.filter(i => i.y > cut);
    const rows = body.filter(i => inCol(i.x, COL.date) && DATE_RE.test(i.text))
      .sort((a, b) => a.y - b.y).map(d => ({ d, notes: [], acc: null, op: null }));
    for (const it of body) {
      if (inCol(it.x, COL.date) && DATE_RE.test(it.text)) continue;
      let best = null, bd = Infinity;
      for (const r of rows) { const dd = Math.abs(it.y - r.d.y); if (dd < bd) { bd = dd; best = r; } }
      if (!best || bd > MAX_DY) continue;
      if (AMT_RE.test(it.text) && inCol(it.x, COL.acc) && Math.abs(it.y - best.d.y) <= 2) best.acc = it;
      else if (AMT_RE.test(it.text) && inCol(it.x, COL.op) && Math.abs(it.y - best.d.y) <= 2) best.op = it;
      else if (inCol(it.x, COL.note)) best.notes.push(it);
    }
    return rows;
  }

  // ---------- Шаблон «Выписка по карте»: одна строка на операцию, направление словами, сумма без знака ----------
  const CARD = { type: [185, 260], status: [260, 330], amt: [330, 420], place: [420, 480], detail: [505, 700] };
  const NUM_RE = /^\d{12,}$/;
  const isCardTemplate = pages => /выпискапокартеза/.test(squash(pageText(clean(pages.slice(0, 1))[0] || [])));

  function cardOps(items) {
    const anchors = items.filter(i => i.x < 100 && NUM_RE.test(i.text)).sort((a, b) => a.y - b.y);
    const groups = anchors.map(a => ({ a, items: [] }));
    for (const it of items) {
      if (it === undefined || groups.some(g => g.a === it)) continue;
      let best = null, bd = Infinity;
      for (const g of groups) { const d = Math.abs(it.y - g.a.y); if (d < bd) { bd = d; best = g; } }
      if (best && bd <= 16) best.items.push(it);
    }
    return groups;
  }
  const colText = (items, c) => items.filter(i => inCol(i.x, c)).sort((a, b) => a.y - b.y || a.x - b.x).map(i => i.text).join(" ").replace(/\s+/g, " ").trim();

  function parseCard(pages, header) {
    const txs = [];
    let broken = 0, skipped = 0;
    clean(pages).forEach(items => cardOps(items).forEach(g => {
      const date = g.items.find(i => /^\d{4}-\d\d-\d\d$/.test(i.text));
      const time = g.items.find(i => /^\d\d:\d\d:\d\d$/.test(i.text));
      const amt = g.items.find(i => inCol(i.x, CARD.amt) && AMT_RE.test(i.text));
      const type = squash(colText(g.items, CARD.type));
      const status = squash(colText(g.items, CARD.status));
      if (!date || !amt) { broken++; return; }
      if (!status.includes("завершено")) { skipped++; return; }          // отклонённые и незавершённые не считаем
      const sign = type.includes("получениесредств") ? 1 : type.includes("отправлениесредств") ? -1 : 0;
      if (!sign) { broken++; return; }
      const a = amt.text.match(AMT_RE);
      const label = sign > 0 ? "Получение средств" : "Отправление средств";
      const details = [label, colText(g.items, CARD.place), colText(g.items, CARD.detail)].filter(Boolean).join(" · ");
      txs.push({ date: date.text, time: time ? time.text : null, type: null, amount: sign * parseFloat(a[1]), currency: a[2], mcc: null, details, kind: sign > 0 ? "card_in" : "card_out" });
    }));
    header.broken = broken;
    header.notCompleted = skipped;
    header.currency = txs.length ? txs[0].currency : null;
    return { header, txs };
  }

  function parse(pages) {
    const header = parseHeader(pages);
    if (isCardTemplate(pages)) return parseCard(pages, header);
    const txs = [];
    let broken = 0;
    clean(pages).forEach(items => pageRows(items).forEach(r => {
      if (!r.acc) { broken++; return; }
      const note = r.notes.sort((a, b) => a.y - b.y || a.x - b.x).map(i => i.text).join(" ").replace(/\s+/g, " ").trim();
      const [kind, details, opDate] = classify(note);
      if (kind === "unknown") broken++;
      const a = r.acc.text.match(AMT_RE);
      const tx = {
        date: toIso(r.d.text), time: null, type: null,
        amount: parseFloat(a[1]), currency: a[2], mcc: null,
        details, kind,
      };
      if (opDate) tx.opDate = `${opDate.slice(0, 4)}-${opDate.slice(4, 6)}-${opDate.slice(6, 8)}`;
      const o = r.op && r.op.text.match(AMT_RE);
      if (o && o[2] !== a[2]) { tx.origAmount = parseFloat(o[1]); tx.details += ` (${o[1]} ${o[2]})`; }
      if (kind !== "unknown") txs.push(tx);
    }));
    header.broken = broken;
    header.currency = txs.length ? txs[0].currency : null;
    return { header, txs };
  }

  // Итогов в шапке нет: проверяем, что все строки распознаны и даты не выходят за период выписки
  function validate(txs, header) {
    let inc = 0, exp = 0, outside = 0;
    for (const t of txs) {
      if (t.amount > 0) inc += cents(t.amount); else exp += cents(-t.amount);
      if (header.from && header.to && (t.date < header.from || t.date > header.to)) outside++;
    }
    const res = { count: txs.length, income: inc / 100, expense: exp / 100, incomeOk: null, expenseOk: null, outside };
    res.ok = txs.length > 0 && !header.broken && outside === 0;
    return res;
  }

  const api = { COL, detect, parse, parseHeader, classify, validate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AlfaParser = api;
})(typeof self !== "undefined" ? self : this);
