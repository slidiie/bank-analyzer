// universal.js: чтение выписки банка, которого нет в списке (PDF, CSV, Excel).
// Идея: любой файл сначала превращается в «сетку»: строки = операции, колонки = столбцы таблицы.
//   gridFromPages(pages): PDF (фрагменты текста с координатами, как в banks.js);
//   gridFromTable(rows):  CSV и Excel (обычная таблица строк и ячеек, см. sheets.js).
// Потом guess(grid) перебирает версии раскладки (какая колонка сумма, откуда знак) и проверяет каждую по самой выписке:
// цепочка остатков и итоги из шапки. Побеждает версия, которая сошлась; если сверить не с чем, результат помечается
// как «прочитано по догадке» (header.guess). Человек может поправить роли колонок: guess(grid, roles).
// Номера карт и счетов в описание не попадают. Работает и в браузере (Universal), и в Node (для тестов).

(function (root) {
  "use strict";

  const cents = n => Math.round(n * 100);
  const squash = s => String(s == null ? "" : s).replace(/[\s  ]+/g, " ").trim();

  // ---------- Даты и числа ----------
  // Понимаем: 05.03.2026, 05/03/26, 05-03-2026, 2026-03-05 и день с названием месяца («5 марта 2026», «12 янв. 26», «1 Sep»).
  // Если года в дате нет, dateOf возвращает «0000-мм-дд»: год подставляет guess() по периоду выписки (см. fixYear).
  const D1 = /(^|\D)(\d{2})[./](\d{2})[./](\d{4}|\d{2})(?!\d)/, D2 = /(^|\D)(\d{4})-(\d{2})-(\d{2})(?!\d)/, D4 = /(^|\D)(\d{2})-(\d{2})-(\d{4})(?!\d)/;
  const NUM_DATE = "\\d{2}[./]\\d{2}[./](?:\\d{4}|\\d{2})|\\d{4}-\\d{2}-\\d{2}|\\d{2}-\\d{2}-\\d{4}";
  const MONTHS = ["янв(?:ар[ья])?|студз(?:ен[ья])?|jan(?:uar[yi]?|vier)?|janv", "фев(?:р(?:ал[ья])?)?|лют(?:ы|ага)?|feb(?:ruar[yi]?)?|f[eé]v(?:r(?:ier)?)?",
    "мар(?:та?)?|сак(?:авіка?)?|mar(?:ch|s)?|mrt|maart|m[aä]rz", "апр(?:ел[ья])?|крас(?:авіка?)?|apr(?:il)?|avr(?:il)?", "ма[йя]|трав(?:ен[ья]|ня)?|may|mai|mei",
    "июн[ья]?|чэрв(?:ен[ья])?|jun[ei]?|juin", "июл[ья]?|ліп(?:ен[ья])?|jul[yi]?|juil(?:let)?", "авг(?:уста?)?|жні(?:вен[ья]|ўня)?|aug(?:ust(?:us)?)?|ao[uû]t",
    "сен(?:т(?:ябр[ья])?)?|вер(?:асен[ья]|асня)?|sep(?:t(?:emb(?:er|re))?)?", "окт(?:ябр[ья])?|кастр(?:ычніка?)?|o[ck]t(?:ob(?:er|re))?",
    "ноя(?:бр[ья])?|ліст(?:апада?)?|nov(?:emb(?:er|re))?", "дек(?:абр[ья])?|снеж(?:ан[ья]|ня)?|d[eé][cz](?:emb(?:er|re))?"];
  const MON_RE = MONTHS.map(m => new RegExp("^(?:" + m + ")$", "i"));
  const LET = "A-Za-zА-Яа-яЁёІіЎўÀ-ÿ";
  const NAME_DATE = "\\d{1,2}[ .]{0,2}(?:" + MONTHS.join("|") + ")\\.?(?:,?[ ]\\d{4}(?!\\d)|[ ]\\d{2}(?![\\d:.,]))?(?![" + LET + "])";
  const D3 = new RegExp("(^|[^\\d" + LET + "])(\\d{1,2})[ .]{0,2}(" + MONTHS.join("|") + ")\\.?(?:,?[ ](\\d{4})(?!\\d)|[ ](\\d{2})(?![\\d:.,]))?(?![" + LET + "])", "i");
  const TIME_TAIL = "(?:\\s*г\\.?)?(?:[ T]+\\d{1,2}:\\d{2}(?::\\d{2})?)?";
  const DATE_TOKEN = new RegExp("^(?:" + NUM_DATE + "|" + NAME_DATE + ")" + TIME_TAIL + "$", "i");
  const pad = n => String(n).padStart(2, "0");
  function dateOf(s) {
    s = String(s || "");
    let m = s.match(D1), y, mo, d;
    if (m) { d = +m[2]; mo = +m[3]; y = +m[4]; if (y < 100) y += 2000; }
    else if ((m = s.match(D2))) { y = +m[2]; mo = +m[3]; d = +m[4]; }
    else if ((m = s.match(D4))) { d = +m[2]; mo = +m[3]; y = +m[4]; }
    else if ((m = s.match(D3))) { d = +m[2]; mo = MON_RE.findIndex(r => r.test(m[3])) + 1; y = m[4] ? +m[4] : m[5] ? 2000 + +m[5] : 0; }
    else return null;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || (y !== 0 && (y < 1990 || y > 2100))) return null;
    return String(y).padStart(4, "0") + "-" + pad(mo) + "-" + pad(d);
  }
  // Год для даты без года: такой, чтобы дата была не позже опорной (конец периода или самая поздняя дата в шапке), с запасом в неделю
  function fixYear(iso, ref) {
    if (!iso || iso.slice(0, 4) !== "0000") return iso;
    if (!ref) return null;
    const lim = new Date(Date.parse(ref + "T00:00:00Z") + 7 * 864e5).toISOString().slice(0, 10);
    let y = +lim.slice(0, 4);
    if (y + iso.slice(4) > lim) y--;
    return y + iso.slice(4);
  }
  // Все полные даты (с годом) в строке
  const ANY_DATE = new RegExp(NUM_DATE + "|" + NAME_DATE, "gi");
  const datesIn = line => (String(line).match(ANY_DATE) || []).map(dateOf).filter(d => d && d.slice(0, 4) !== "0000");
  const timeOf = s => { const m = String(s || "").match(/(^|\D)(\d{1,2}):(\d{2})(?::(\d{2}))?(?!\d)/); return m ? m[2].padStart(2, "0") + ":" + m[3] + ":" + (m[4] || "00") : null; };

  const DATE_LEAD = new RegExp("^(?:" + NUM_DATE + "|" + NAME_DATE + ")" + TIME_TAIL + "\\s+(?=\\S)", "i");   // «05.03.2026 Магазин…»: дата и текст в одном фрагменте
  const CUR_TAIL = /(BYN|BYR|USD|EUR|RUB|RUR|[A-Z]{3}|руб\.?|р\.)$/, CUR_SYM = /[€$£₽]/g, SYM_CUR = { "€": "EUR", "$": "USD", "£": "GBP", "₽": "RUB" };
  // «1 300,50», «-230.38 BYN», «(5.00)», «5.00-» → число; иначе NaN
  function num(s) {
    let t = String(s == null ? "" : s).replace(/[\s  ]/g, "").replace(/[−–—]/g, "-").replace(CUR_SYM, "");
    if (!t) return NaN;
    t = t.replace(CUR_TAIL, "");
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1).replace(CUR_TAIL, ""); }
    if (/^\d.*[-+]$/.test(t)) { if (t.endsWith("-")) neg = true; t = t.slice(0, -1); }
    if (!/^[-+]?\d[\d.,]*$/.test(t)) return NaN;
    if (/[.,]\d*[.,]/.test(t) && !/^[-+]?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?$/.test(t)) return NaN;     // «01.02.2026» не число
    if (t[0] === "-") { neg = !neg; t = t.slice(1); } else if (t[0] === "+") t = t.slice(1);
    const ld = t.lastIndexOf("."), lc = t.lastIndexOf(",");
    let dec = -1;
    if (ld >= 0 && lc >= 0) dec = Math.max(ld, lc);
    else if (ld >= 0) dec = t.indexOf(".") === ld ? ld : -1;                       // несколько точек = разделители тысяч
    else if (lc >= 0) dec = t.indexOf(",") === lc && t.length - lc - 1 !== 3 ? lc : -1;   // «1,300» = тысяча триста
    const whole = (dec >= 0 ? t.slice(0, dec) : t).replace(/[.,]/g, ""), frac = dec >= 0 ? t.slice(dec + 1) : "";
    if (!/^\d+$/.test(whole) || (frac && !/^\d+$/.test(frac))) return NaN;
    const v = parseFloat(whole + (frac ? "." + frac : ""));
    return neg ? -v : v;
  }
  // Точно деньги: есть копейки или код валюты (целое «5411» деньгами не считается)
  const strictMoney = s => { const t = String(s || "").replace(/[\s  ]/g, ""); return Number.isFinite(num(t)) && (/[.,]\d{1,2}(\D{0,4})$/.test(t) || CUR_TAIL.test(t.replace(CUR_SYM, "")) || /[€$£₽]/.test(t)) && !DATE_TOKEN.test(squash(s)); };
  // Пометка «кредит/дебет» рядом с числом («1 204,50 CR»): CR плюс, DR минус
  const MARK = /^(cr|dr|кт|дт)\.?$/i, markSign = c => { const m = c.find(s => MARK.test(s)); return !m ? 0 : /^(cr|кт)/i.test(m) ? 1 : -1; };

  const CURS = /^(BYN|BYR|USD|EUR|RUB|RUR|PLN|GBP|CNY|KZT|UAH|TRY|CHF|CZK|SEK|NOK|DKK|JPY|GEL|AMD|AED|THB|HUF|BGN|RON|ILS|EGP|VND|INR|CAD|AUD|KGS|UZS|AZN|MDL|RSD|LKR|IDR|KRW|HKD|SGD)$/;
  const POS_W = /^(приход|зачислен\S*|поступлен\S*|пополнен\S*|кредит|credit|cr|\+)$/i, NEG_W = /^(расход|списан\S*|дебет|debit|dr|-|−|–)$/i;
  const INC_KW = /зачислен|пополнен|поступлен|возврат|приход|внесение|cash ?in|refund|\(кредитовая\)|зарплат|выплат|получен|капитализац|cash-?back|к[еэ]шб[еэ]к|money-?back|вознаграждение по|начислен\S* процент/i;
  const CARD = /\d{4}[\d\s]{0,6}\*[\d*\s.]*\d{0,4}|\*{2,}\s?\d{2,4}|\.{4,}\d{4}|\b[A-Z]{2}\d{2}[A-Z0-9]{4}[A-Z0-9]{8,}\b/g;

  // ---------- PDF → сетка ----------
  function linesOf(items, tol) {
    const sorted = items.slice().sort((a, b) => a.y - b.y || a.x - b.x), lines = [];
    for (const it of sorted) {
      const l = lines[lines.length - 1];
      if (l && Math.abs(l.y - it.y) <= tol) l.items.push(it); else lines.push({ y: it.y, items: [it] });
    }
    lines.forEach(l => l.items.sort((a, b) => a.x - b.x));
    return lines;
  }
  const lineText = l => l.items.map(i => i.text).join(" ");

  // Разрезать строки страницы (между первой и последней строкой с датой) на блоки по вертикальным просветам больше T
  function cut(lines, a0, a1, T) {
    const blocks = [];
    for (let i = a0; i <= a1; i++) {
      const b = blocks[blocks.length - 1];
      if (b && lines[i].y - lines[i - 1].y <= T) { b.to = i; b.anchors += lines[i].anchor ? 1 : 0; }
      else blocks.push({ from: i, to: i, anchors: lines[i].anchor ? 1 : 0 });
    }
    return blocks;
  }

  function gridFromPages(pages) {
    const P = pages.map(items => items.map(i => {
      let text = squash(i.text);
      if (/^(?:[A-Za-zА-Яа-яЁё]{1,3} ){3,}[A-Za-zА-Яа-яЁё]{1,3}$/.test(text) && text.replace(/ /g, "").length <= text.length * 0.62) text = text.replace(/ /g, "");
      return { x: i.vx != null ? i.vx : i.x, y: i.vy != null ? i.vy : -i.y, w: i.w > 0 ? i.w : text.length * 4.6, text };
    }).filter(i => i.text));
    // Колонка-якорь: где чаще всего стоит дата отдельным фрагментом (самая левая из частых)
    const dates = [];
    P.forEach((items, p) => items.forEach(i => { if (DATE_TOKEN.test(i.text) && dateOf(i.text)) dates.push({ p, i }); }));
    if (dates.length < 2) { dates.length = 0; P.forEach((items, p) => items.forEach(i => { if (DATE_LEAD.test(i.text) && dateOf(i.text)) dates.push({ p, i }); })); }
    if (dates.length < 2) return null;
    const cl = [];
    dates.slice().sort((a, b) => a.i.x - b.i.x).forEach(d => { const c = cl[cl.length - 1]; if (c && d.i.x - c.x <= 6) { c.n++; c.x = d.i.x; c.set.add(d.i); } else cl.push({ x: d.i.x, x0: d.i.x, n: 1, set: new Set([d.i]) }); });
    const maxN = Math.max(...cl.map(c => c.n));
    const anchorCol = cl.find(c => c.n >= 0.6 * maxN);
    const L = P.map(items => { const ls = linesOf(items, 2.5); ls.forEach(l => { l.anchor = l.items.some(i => anchorCol.set.has(i)); }); return ls; });
    // Колонтитулы и водяные знаки: длинная фраза без цифр на одном и том же месте на всех страницах, хотя бы на одной из них далеко от операций.
    // Иначе такая фраза прилипает к последней операции страницы и «склеивает» колонки.
    if (L.length >= 2) {
      const fk = i => i.text + "|" + Math.round(i.x) + "|" + Math.round(i.y), seen = new Map();
      L.forEach((ls, p) => ls.forEach(l => l.items.forEach(i => { if (i.text.length >= 20 && !/\d/.test(i.text)) { if (!seen.has(fk(i))) seen.set(fk(i), new Set()); seen.get(fk(i)).add(p); } })));
      const edge = L.map(ls => { const a = ls.filter(l => l.anchor); return a.length ? [a[0].y, a[a.length - 1].y] : null; });
      const furn = new Set();
      seen.forEach((ps, k) => { const y = +k.split("|").pop(); if (ps.size === L.length && edge.some(e => !e || y - e[1] > 40 || e[0] - y > 40)) furn.add(k); });
      if (furn.size) L.forEach((ls, p) => { ls.forEach(l => { l.items = l.items.filter(i => !furn.has(fk(i))); }); L[p] = ls.filter(l => l.items.length); });
    }
    const range = L.map(ls => { const a = ls.map((l, k) => l.anchor ? k : -1).filter(k => k >= 0); return a.length ? [a[0], a[a.length - 1]] : null; });
    // Порог просвета: при нём больше всего блоков ровно с одной датой и меньше всего «ничьих» блоков
    const gaps = new Set([0.5]);
    L.forEach((ls, p) => { if (range[p]) for (let i = range[p][0] + 1; i <= range[p][1]; i++) gaps.add(Math.round((ls[i].y - ls[i - 1].y) * 2) / 2 + 0.25); });
    let best = null;
    [...gaps].sort((a, b) => a - b).forEach(T => {
      let s = 0;
      L.forEach((ls, p) => { if (range[p]) cut(ls, range[p][0], range[p][1], T).forEach(b => { s += b.anchors === 1 ? 1 : b.anchors === 0 ? -1 : -2 * (b.anchors - 1); }); });
      if (!best || s > best.s) best = { s, T };   // из равных берём самый маленький порог: он чуть больше межстрочного шага
    });
    const T = best.T;
    // Операции: блок с датой; «ничей» блок относится к операции выше; блок с несколькими датами делится по ближайшей дате
    const ops = [];
    let ups = [], downs = [];
    L.forEach((ls, p) => {
      if (!range[p]) return;
      const pageOps = [];
      cut(ls, range[p][0], range[p][1], T).forEach(b => {
        const idx = []; for (let i = b.from; i <= b.to; i++) idx.push(i);
        const an = idx.filter(i => ls[i].anchor);
        // «Ничей» блок вплотную под операцией: её продолжение. Стоит отдельно (итоги раздела, подписи): в операции не идёт.
        if (!an.length) { const prev = pageOps[pageOps.length - 1]; if (prev && ls[b.from].y - ls[Math.max(...prev.idx)].y <= 1.5 * T + 1) prev.idx.push(...idx); return; }
        const made = an.map(a => ({ p, a, idx: [] }));
        idx.forEach(i => { let k = 0; made.forEach((m, j) => { if (Math.abs(ls[i].y - ls[m.a].y) < Math.abs(ls[i].y - ls[made[k].a].y)) k = j; }); made[k].idx.push(i); });
        pageOps.push(...made);
      });
      pageOps.forEach((o, k) => { if (k > 0 && k < pageOps.length - 1) { ups.push(ls[o.a].y - ls[Math.min(...o.idx)].y); downs.push(ls[Math.max(...o.idx)].y - ls[o.a].y); } });
      ops.push(...pageOps);
    });
    if (!ups.length) { ups = [0]; downs = [0]; }
    // Шапка таблицы: ближайшая над первой датой строка со словами «дата», «сумма», «описание»… и соседние строки вплотную к ней.
    // На следующих страницах шапка повторяется: в операции её строки не попадают.
    const f = ops[0], fl = L[f.p], head = [];
    const HEAD_KW = /дата|сумм|валют|описан|операци|остаток|назначен|примечан|м[cс]{2}|mcc|date|amount|descr|balance|detail|d[eé]bit|cr[eé]dit|deposit|withdraw|solde/i;
    const plain = l => !l.anchor && !l.items.some(i => /\d/.test(i.text));        // в заголовках колонок цифр не бывает
    let hk = -1;
    for (let i = f.a - 1; i >= 0 && fl[f.a].y - fl[i].y <= 220; i--) if (plain(fl[i]) && fl[i].items.length >= 3 && HEAD_KW.test(lineText(fl[i]))) { hk = i; break; }
    if (hk >= 0) {
      let lo = hk, hi = hk;
      while (lo > 0 && fl[lo].y - fl[lo - 1].y <= 13 && plain(fl[lo - 1])) lo--;
      while (hi + 1 < f.a && fl[hi + 1].y - fl[hi].y <= 13 && plain(fl[hi + 1])) hi++;
      for (let i = lo; i <= hi; i++) head.push(fl[i]);
    }
    const headSet = new Set(head.map(lineText)), isHead = (p, i) => (p === f.p && head.includes(L[p][i])) || headSet.has(lineText(L[p][i]));
    const upMax = Math.max(...ups) + 1, downMax = Math.max(...downs) + 1;
    // Первая и последняя операция страницы: добираем их строки над первой датой и под последней (в пределах обычного размаха)
    const byPage = new Map(); ops.forEach(o => { if (!byPage.has(o.p)) byPage.set(o.p, []); byPage.get(o.p).push(o); });
    byPage.forEach((list, p) => {
      const ls = L[p], first = list[0], last = list[list.length - 1];
      for (let i = range[p][0] - 1; i >= 0 && ls[i + 1].y - ls[i].y <= T && ls[first.a].y - ls[i].y <= upMax && !isHead(p, i); i--) first.idx.push(i);
      for (let i = range[p][1] + 1; i < ls.length && ls[i].y - ls[i - 1].y <= T && ls[i].y - ls[last.a].y <= downMax; i++) last.idx.push(i);
    });
    const used = L.map(() => new Set());
    ops.forEach(o => { o.idx = o.idx.filter(i => L[o.p][i].anchor || !isHead(o.p, i)); o.idx.forEach(i => used[o.p].add(i)); o.items = o.idx.flatMap(i => L[o.p][i].items); });
    // Колонки: вертикальные полосы, где текст операций есть, разделённые пустыми просветами
    const W = Math.ceil(Math.max(...ops.flatMap(o => o.items.map(i => i.x + i.w)))) + 2;
    const cov = new Int32Array(W), stamp = new Int32Array(W).fill(-1);
    ops.forEach((o, k) => o.items.forEach(i => { for (let x = Math.max(0, Math.floor(i.x)); x < Math.min(W, Math.ceil(i.x + i.w)); x++) if (stamp[x] !== k) { stamp[x] = k; cov[x]++; } }));
    const floor = Math.floor(ops.length * 0.015);   // редкий выступ длинного текста колонкой не считается
    const bands = [];
    for (let x = 0; x < W; x++) { if (cov[x] > floor) { const b = bands[bands.length - 1]; if (b && b.x1 === x - 1) b.x1 = x; else bands.push({ x0: x, x1: x }); } }
    const cols = bands.filter(b => b.x1 - b.x0 >= 2);
    // «1 200,45» тремя кусками: узкая колонка, где стоят только разряды тысяч, приклеивается к сумме справа от неё
    for (let j = cols.length - 2; j >= 0; j--) {
      const a = cols[j], b = cols[j + 1];
      if (b.x0 - a.x1 > 8) continue;
      const inA = ops.flatMap(o => o.items.filter(i => i.x >= a.x0 - 1 && i.x + i.w <= a.x1 + 1).map(i => ({ i, o })));
      if (inA.length && inA.every(({ i, o }) => /^\d{1,3}$/.test(i.text) && o.items.some(k => k !== i && Math.abs(k.y - i.y) <= 2.5 && k.x >= b.x0 - 1 && k.x - (i.x + i.w) <= 8 && /^\d{3}(?:[.,]\d{1,2})?(?!\d)/.test(k.text)))) { a.x1 = b.x1; cols.splice(j + 1, 1); }
    }
    if (cols.length < 2) return null;
    const colOf = i => { let k = -1, bo = 0, bd = Infinity; cols.forEach((c, j) => { const ov = Math.min(i.x + i.w, c.x1) - Math.max(i.x, c.x0); if (ov > bo) { bo = ov; k = j; } }); if (k >= 0) return k;
      cols.forEach((c, j) => { const d = i.x > c.x1 ? i.x - c.x1 : c.x0 > i.x + i.w ? c.x0 - (i.x + i.w) : 0; if (d < bd) { bd = d; k = j; } }); return k; };
    const cellsOf = items => { const by = cols.map(() => []); items.forEach(i => by[colOf(i)].push(i)); return by.map(list => linesOf(list, 2.5).map(lineText)); };
    const rows = ops.map(o => cellsOf(o.items));
    const fresh = ops.map((o, k) => { if (!k) return false; const q = ops[k - 1]; if (q.p !== o.p) return true; for (let i = Math.max(...q.idx) + 1; i < o.a; i++) if (isHead(o.p, i)) return true; return false; });
    const titles = cellsOf(head.flatMap(l => l.items)).map(c => squash(c.join(" ")));
    const meta = []; L.forEach((ls, p) => ls.forEach((l, i) => { if (!used[p].has(i)) meta.push(lineText(l)); }));
    return { source: "pdf", cols: cols.map((c, j) => ({ title: titles[j] || "" })), rows, meta, fresh };
  }

  // ---------- Таблица (CSV, Excel) → сетка ----------
  function gridFromTable(table) {
    const T = table.map(r => r.map(c => squash(c)));
    const isData = r => r.some(c => DATE_TOKEN.test(c) && dateOf(c)) && r.some(c => !dateOf(c) && Number.isFinite(num(c)));
    const first = T.findIndex(isData);
    if (first < 0) return null;
    const n = Math.max(...T.map(r => r.length));
    let head = null;
    for (let i = first - 1; i >= 0 && i >= first - 4; i--) if (T[i].filter(c => c && !dateOf(c) && !Number.isFinite(num(c))).length >= 2) { head = T[i]; break; }
    const rows = [], meta = [];
    T.forEach((r, i) => { if (isData(r)) rows.push(Array.from({ length: n }, (_, j) => r[j] ? [r[j]] : [])); else if (r !== head && r.some(c => c)) meta.push(r.filter(c => c).join(" ")); });
    // В таблице дата и время бывают разными колонками: это не мешает, время найдётся в соседней
    return { source: "table", cols: Array.from({ length: n }, (_, j) => ({ title: head && head[j] ? head[j] : "" })), rows, meta };
  }

  // ---------- Итоги и шапка из строк вне таблицы ----------
  const NUM = "(-?\\s?\\d{1,3}(?:[ \\u00a0]\\d{3})+(?:[.,]\\d{1,2})?|-?\\s?\\d{1,3}(?:[.,]\\d{3})+[.,]\\d{2}(?!\\d)|-?\\s?\\d+(?:[.,]\\d{1,2})?)";
  const after = kw => new RegExp("(?:" + kw + ")[^\\d\\-]{0,70}?" + NUM + "(?!\\s?[./]\\d)", "i");
  const TOTALS = {
    opening: after("входящий остаток|остаток на начало|начальный (?:баланс|остаток)|opening balance"),
    closing: after("исходящий остаток|остаток на конец|конечный (?:баланс|остаток)|closing balance"),
    income: after("поступило|сумма приходных[^\\d]*|итого поступлени[йя]|всего поступлени[йя]|итого зачислен[оия]|итого приход|обороты? по кредиту|total credits?|total incoming|total deposits?(?: amount)?"),
    expense: after("списано|сумма расходных[^\\d]*|итого списани[йя]|всего списани[йя]|итого расход|обороты? по дебету|total debits?|total outgoing|total withdrawals?(?: amount)?"),
  };
  function readMeta(meta) {
    const h = {};
    for (const line of meta) {
      for (const k in TOTALS) if (h[k] == null) { const m = line.match(TOTALS[k]); if (m) { const v = num(m[1]); if (Number.isFinite(v)) h[k] = k === "expense" ? Math.abs(v) : v; } }
      if (!h.from) {
        const m = line.match(/(?:период|выписк\S*|с:?)\D{0,40}?(\d{2}[./]\d{2}[./]\d{2,4})\D{1,15}?(\d{2}[./]\d{2}[./]\d{2,4})/i);
        if (m && dateOf(m[1]) && dateOf(m[2]) && dateOf(m[1]) <= dateOf(m[2])) { h.from = dateOf(m[1]); h.to = dateOf(m[2]); }
        else if (/период|выписк|period|statement|p[eé]riode/i.test(line)) { const d = datesIn(line); if (d.length === 2 && d[0] <= d[1]) { h.from = d[0]; h.to = d[1]; } }
      }
      if (!h.currency) { const m = line.match(/Валюта\s*(?:счета|счёта|карты|контракта|договора)?\s*:?\s*([A-Z]{3})\b/); if (m) h.currency = m[1]; }
    }
    // Опорная дата для дат без года: конец периода, иначе самая поздняя дата в шапке и подписях (не из будущего)
    const today = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    h.ref = h.to || meta.flatMap(datesIn).filter(d => d <= today).sort().pop() || null;
    // Валюта, если она не подписана словом «Валюта»: код, который в шапке встречается чаще других
    if (!h.currency) {
      const cnt = {}; meta.forEach(line => (line.match(/\b[A-Z]{3}\b/g) || []).forEach(w => { if (CURS.test(w)) cnt[w] = (cnt[w] || 0) + 1; }));
      const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]);
      if (top.length && (top.length === 1 || cnt[top[0]] > cnt[top[1]])) h.curGuess = top[0];
    }
    return h;
  }
  // Название банка из шапки: слово с «банк» и до двух слов с большой буквы рядом («Лесной банк», «Банк Лес (Беларусь)», «Lesbank»)
  function bankName(meta) {
    const bad = /интернет|мобильн|банк[аеуи]|банком|банков|www|http|@|\.by|\.com|выписк/i;
    const res = [/(?:[A-ZА-ЯЁ][A-Za-zА-Яа-яЁё-]*\s){0,2}[A-Za-zА-Яа-яЁё-]*[Бб]анк[A-Za-zА-Яа-яЁё-]*(?:\s[A-ZА-ЯЁ][A-Za-zА-Яа-яЁё-]*){0,2}(?:\s\([А-Яа-яЁё]+\))?/, /(?:[A-Z][A-Za-z-]*\s){0,2}(?:[A-Z][A-Za-z-]*[Bb]|B)ank(?![a-z])(?:\s[A-Z][A-Za-z]+)?/];
    for (const re of res) for (const line of meta.slice(0, 60)) {
      const m = line.replace(/["«»“”']/g, "").match(re);
      const name = m ? squash(m[0].replace(/^(ОАО|ЗАО|ООО|АО)\s+/, "")) : "";
      if (name.length > 5 && name.length <= 40 && !bad.test(name)) return name;
    }
    return null;
  }

  // ---------- Что лежит в колонках ----------
  const blank = c => !c.length || c.every(s => /^[-−–—]?$/.test(s));
  function profile(grid) {
    const n = grid.rows.length;
    return grid.cols.map((col, j) => {
      const cells = grid.rows.map(r => r[j] || []), ne = cells.filter(c => c.length);
      const share = fn => ne.length ? ne.filter(fn).length / ne.length : 0;
      const nb = cells.filter(c => !blank(c));
      const bare = c => { const v = c.filter(s => !MARK.test(s)); return v.length ? v : c; };
      const strict = nb.length ? nb.filter(c => bare(c).every(strictMoney)).length / nb.length : 0;
      const loose = nb.length ? nb.filter(c => bare(c).every(s => Number.isFinite(num(s)) && !dateOf(s))).length / nb.length : 0;
      const t = col.title || "";
      const moneyTitle = /сумм|amount|приход|расход|дебет|кредит|остаток|оборот|баланс|списан|зачислен|поступлен/i.test(t);
      const signVals = new Set(ne.filter(c => c.length === 1 && (POS_W.test(c[0]) || NEG_W.test(c[0]))).map(c => POS_W.test(c[0]) ? 1 : -1));
      const p = { j, title: t, fill: ne.length / n, moneyFill: nb.length / n,
        date: share(c => c.some(s => DATE_TOKEN.test(s) || (dateOf(s) && s.length <= 22) || DATE_LEAD.test(s))),
        money: loose >= 0.85 && (strict >= 0.5 || (moneyTitle && grid.source === "table")) && nb.length >= Math.max(1, n * 0.02),
        cur: share(c => c.length === 1 && CURS.test(c[0])),
        sign: share(c => c.length === 1 && (POS_W.test(c[0]) || NEG_W.test(c[0]))), signKinds: signVals.size,
        mcc: share(c => c.length === 1 && /^\d{4}$/.test(c[0])),
        tiny: share(c => c.join("").length <= 2) };
      let kind = "text";
      if (p.fill >= 0.5 && p.date >= 0.8) kind = "date";
      else if (p.money) kind = "money";
      else if (p.fill >= 0.5 && p.cur >= 0.8) kind = "cur";
      else if (p.fill >= 0.3 && p.sign >= 0.8) kind = "sign";
      else if (p.fill >= 0.3 && p.mcc >= 0.8 && (/m[cс]{2}|мсс/i.test(t) || p.mcc >= 0.95)) kind = "mcc";
      else if (p.fill > 0 && p.tiny >= 0.95) kind = "tiny";
      p.kind = kind;
      return p;
    });
  }
  // Число из ячейки: если в ячейке два числа (сумма в валюте операции и в валюте счёта), берём последнее
  const cellNum = c => { if (!c || blank(c)) return NaN; const v = c.map(num).filter(Number.isFinite); if (!v.length) return NaN; const x = v[v.length - 1], g = markSign(c); return g ? g * Math.abs(x) : x; };

  // Цепочка остатков: доля соседних строк, где остаток меняется ровно на сумму операции. dir = 1: старые сверху.
  function chain(amt, bal, signed) {
    let bestOut = { share: 0, dir: 1, signs: [], pairs: 0 };
    for (const dir of [1, -1]) {
      let ok = 0, pairs = 0, prev = -1; const signs = new Array(amt.length).fill(0);
      const order = amt.map((_, i) => i); if (dir < 0) order.reverse();
      for (const i of order) {
        if (!Number.isFinite(bal[i])) continue;
        if (prev >= 0 && Number.isFinite(amt[i])) {
          pairs++;
          const d = cents(bal[i]) - cents(bal[prev]), a = cents(amt[i]);
          if (signed ? d === a : Math.abs(d) === Math.abs(a)) { ok++; signs[i] = d > 0 ? 1 : d < 0 ? -1 : 0; }
        }
        prev = i;
      }
      const share = pairs ? ok / pairs : 0;
      if (share > bestOut.share) bestOut = { share, dir, signs, pairs };
    }
    return bestOut;
  }

  const DEBIT_T = /расход|списан|дебет|d[eé]bit|withdraw/i, CREDIT_T = /приход|зачисл|поступ|кредит|cr[eé]dit|deposit|d[eé]p[oô]t|пополн/i;

  // ---------- Версии раскладки и выбор лучшей ----------
  // fixed: роли колонок, выбранные человеком (массив той же длины, что и grid.cols), или null.
  function guess(grid, fixed) {
    const prof = profile(grid), n = grid.rows.length, meta = readMeta(grid.meta || []);
    const col = j => grid.rows.map(r => r[j] || []);
    const numsOf = j => col(j).map(cellNum);
    const roleCols = r => fixed ? fixed.map((x, j) => x === r ? j : -1).filter(j => j >= 0) : null;
    // Дата: человек выбрал, иначе колонка «совершения/транзакции», иначе самая левая
    const dateCols = fixed ? roleCols("date") : prof.filter(p => p.kind === "date").map(p => p.j);
    if (!dateCols.length) return null;
    const dateCol = fixed ? dateCols[0] : (dateCols.find(j => /соверш|транзакц/i.test(prof[j].title) && !/отраж|обработ/i.test(prof[j].title)) ?? dateCols[0]);
    const moneyCols = fixed ? [...roleCols("amount"), ...roleCols("income"), ...roleCols("expense"), ...roleCols("balance")] : prof.filter(p => p.kind === "money").map(p => p.j);
    const N = {}; moneyCols.forEach(j => { N[j] = numsOf(j); });
    const signCols = fixed ? roleCols("sign") : prof.filter(p => p.kind === "sign" && p.signKinds >= 2).map(p => p.j);
    const textCols = fixed ? roleCols("desc") : prof.filter(p => p.kind === "text").map(p => p.j);
    // Если в колонке даты рядом с датой стоит текст (узкая выписка: дата и описание в одной колонке, или «05.03.2026 Магазин…» одним куском),
    // этот текст тоже часть описания. Колонки с одними датами и короткими пометками («T», «A») описания не получают.
    const wordy = s => !DATE_TOKEN.test(s) && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(s) && /[A-Za-zА-Яа-яЁё]{3}/.test(s);
    const mixedCol = {}; dateCols.forEach(j => { const rows = grid.rows.filter(r => (r[j] || []).length); mixedCol[j] = rows.length && rows.filter(r => r[j].some(s => wordy(s) || DATE_LEAD.test(s))).length >= 0.3 * rows.length; });
    const leadText = r => dateCols.filter(j => mixedCol[j]).map(j => (r[j] || []).filter(wordy).map(s => { while (DATE_LEAD.test(s)) s = s.replace(DATE_LEAD, ""); return s; }).join(" ")).join(" ");
    const text = grid.rows.map(r => textCols.map(j => (r[j] || []).join(" ")).join(" ") + " " + leadText(r));
    // Остаток: колонка, которая от строки к строке меняется на сумму из другой колонки
    let balCol = -1;
    if (fixed) balCol = roleCols("balance")[0] ?? -1;
    else {
      let bs = 0.7;
      for (const b of moneyCols) for (const a of moneyCols) if (a !== b) { const c = chain(N[a], N[b], false); if (c.pairs >= 2 && c.share > bs) { bs = c.share; balCol = b; } }
      if (balCol < 0) { const t = moneyCols.filter(j => /остаток|баланс|balance/i.test(prof[j].title)); if (t.length === 1 && moneyCols.length > 1) balCol = t[0]; }
    }
    const bal = balCol >= 0 ? N[balCol] : null;
    const amtCols = fixed ? roleCols("amount") : moneyCols.filter(j => j !== balCol);
    // Пары «расход / приход» отдельными колонками
    const pairs = [];
    if (fixed) { const e = roleCols("expense"), i = roleCols("income"); if (e.length || i.length) pairs.push({ d: e[0] ?? -1, c: i[0] ?? -1, fixed: true }); }
    else for (const d of amtCols) for (const c of amtCols) if (d !== c) {
      let one = 0, any = 0, nd = 0, nc = 0;
      for (let i = 0; i < n; i++) { const x = N[d][i], y = N[c][i], hx = Number.isFinite(x) && x !== 0, hy = Number.isFinite(y) && y !== 0; if (hx || hy) any++; if (hx !== hy) one++; if (hx) nd++; if (hy) nc++; }
      if (any >= 3 && one / any >= 0.9 && nd >= any * 0.03 && nc >= any * 0.03 && (nd + nc) >= n * 0.6) pairs.push({ d, c });
    }
    const kwSign = i => INC_KW.test(text[i]) ? 1 : -1;
    const signFromCol = (j, i) => { const c = grid.rows[i][j] || []; return c.length && POS_W.test(c[0]) ? 1 : c.length && NEG_W.test(c[0]) ? -1 : 0; };

    const hyps = [];
    for (const a of amtCols) {
      const raw = N[a], hasNeg = raw.some(v => v < 0);
      if (hasNeg) hyps.push({ a, mode: "asis", amt: raw.slice() });
      for (const s of signCols) hyps.push({ a, mode: "col", s, amt: raw.map((v, i) => Number.isFinite(v) ? Math.abs(v) * (signFromCol(s, i) || kwSign(i)) : NaN) });
      if (bal) {
        const c = chain(raw.map(Math.abs), bal, false);
        // Строки, где цепочка рвётся: знак из колонки со словом «приход/расход», из минуса в числе или по словам описания
        const other = i => (signCols.length ? signFromCol(signCols[0], i) : 0) || (raw[i] < 0 ? -1 : 0);
        hyps.push({ a, mode: "bal", amt: raw.map((v, i) => Number.isFinite(v) ? Math.abs(v) * (c.signs[i] || other(i) || kwSign(i)) : NaN) });
        // Вторая версия: если первое слово описания почти всегда означает один знак («Списание…», «Зачисление…»),
        // верим ему больше, чем остатку (соседние операции с одинаковой суммой остаток путают). Какая версия верна, решит сверка.
        const stat = new Map(), w1 = i => (text[i].match(/[A-Za-zА-Яа-яЁё]{4,}/) || [""])[0].toLowerCase();
        c.signs.forEach((sg, i) => { if (!sg || !w1(i)) return; const e = stat.get(w1(i)) || [0, 0]; e[sg > 0 ? 0 : 1]++; stat.set(w1(i), e); });
        const strong = i => { const e = stat.get(w1(i)); if (!e || e[0] + e[1] < 8) return 0; return e[0] >= 0.97 * (e[0] + e[1]) ? 1 : e[1] >= 0.97 * (e[0] + e[1]) ? -1 : 0; };
        hyps.push({ a, mode: "bal", amt: raw.map((v, i) => Number.isFinite(v) ? Math.abs(v) * (other(i) || strong(i) || c.signs[i] || kwSign(i)) : NaN) });
      }
      if (!hasNeg) hyps.push({ a, mode: "kw", amt: raw.map((v, i) => Number.isFinite(v) ? Math.abs(v) * kwSign(i) : NaN) });
    }
    for (const p of pairs) {
      const D = p.d >= 0 ? N[p.d] : [], C = p.c >= 0 ? N[p.c] : [];
      hyps.push({ pair: p, mode: "pair", amt: grid.rows.map((_, i) => { const x = D[i], y = C[i]; return Number.isFinite(y) && y !== 0 ? Math.abs(y) : Number.isFinite(x) && x !== 0 ? -Math.abs(x) : (Number.isFinite(x) || Number.isFinite(y) ? 0 : NaN); }) });
    }
    if (!hyps.length) return null;

    const pendingRow = i => !!bal && prof[balCol].moneyFill >= 0.7 && !Number.isFinite(bal[i]);
    for (const h of hyps) {
      let inc = 0, exp = 0, cnt = 0;
      h.amt.forEach((v, i) => { if (!Number.isFinite(v) || pendingRow(i)) return; cnt++; if (v > 0) inc += cents(v); else exp += cents(-v); });
      h.count = cnt; h.inc = inc; h.exp = exp;
      h.incomeOk = meta.income == null ? null : cents(meta.income) === inc;
      h.expenseOk = meta.expense == null ? null : cents(meta.expense) === exp;
      h.balanceOk = meta.opening == null || meta.closing == null ? null : cents(meta.opening) + inc - exp === cents(meta.closing);
      h.chain = bal ? chain(h.amt, bal, true) : null;
      // Остатки по краям цепочки против шапки (если в шапке есть входящий и исходящий остаток)
      let s = 0;
      for (const k of ["incomeOk", "expenseOk"]) s += h[k] === true ? 40 : h[k] === false ? -15 : 0;
      s += h.balanceOk === true ? 50 : h.balanceOk === false ? -15 : 0;
      if (h.chain) s += 60 * h.chain.share;
      const titles = h.pair ? "" : prof[h.a] ? prof[h.a].title : "";
      if (/сч[её]т|account|оборот/i.test(titles)) s += 6; else if (/операц|транзакц|transaction/i.test(titles)) s -= 3;
      if (/комисс|fee|money-?back|бонус|эквивал|лимит/i.test(titles)) s -= 30;
      s += h.mode === "asis" || h.mode === "col" ? 4 : h.mode === "bal" ? 3 : h.mode === "pair" ? 5 : 0;
      if (h.pair && !h.pair.fixed) {
        const td = prof[h.pair.d].title, tc = prof[h.pair.c].title;
        s += (DEBIT_T.test(td) ? 5 : 0) + (CREDIT_T.test(tc) ? 5 : 0) - (CREDIT_T.test(td) && !DEBIT_T.test(td) ? 8 : 0) - (DEBIT_T.test(tc) && !CREDIT_T.test(tc) ? 8 : 0) + (h.pair.d < h.pair.c ? 1 : 0);
      }
      s += 10 * (cnt / n) + (h.pair ? 0 : h.a * 0.1);
      h.score = s;
    }
    hyps.sort((x, y) => y.score - x.score);
    const best = hyps[0];
    const totalsOk = (best.incomeOk === true && best.expenseOk === true) || best.balanceOk === true || (best.incomeOk === true && best.expenseOk == null) || (best.expenseOk === true && best.incomeOk == null);
    const totalsBad = best.incomeOk === false || best.expenseOk === false || best.balanceOk === false;
    const chainOk = !!best.chain && best.chain.pairs >= 2 && best.chain.share >= 0.98;
    // Несколько счетов в одном файле: остаток «начинается заново» ровно там, где начинается новая таблица
    let accounts = 1;
    if (bal && best.chain && grid.fresh && best.chain.pairs >= 4) {
      const idx = []; bal.forEach((v, i) => { if (Number.isFinite(v) && Number.isFinite(best.amt[i])) idx.push(i); });
      const br = []; for (let k = 1; k < idx.length; k++) { const a = idx[k - 1], b = idx[k]; const ok = best.chain.dir > 0 ? cents(bal[a]) + cents(best.amt[b]) === cents(bal[b]) : cents(bal[b]) + cents(best.amt[a]) === cents(bal[a]); if (!ok) br.push(b); }
      if (br.length >= 1 && br.length <= 4 && br.every(b => grid.fresh[b]) && idx.length - br.length >= 3 * br.length) accounts = br.length + 1;
    }
    // «Проверено» только если прочитана почти вся таблица: когда у многих строк суммы не нашлись, цепочка из двух-трёх строк ничего не доказывает
    const coverOk = best.count >= 0.85 * n;
    // Любое явное несовпадение с шапкой (даже одно из нескольких) отменяет «проверено»
    const proof = accounts > 1 ? "accounts" : totalsBad ? "mismatch" : !(totalsOk || chainOk) ? "none" : !coverOk ? "partial" : totalsOk ? "totals" : "balance";
    const verified = proof === "totals" || proof === "balance";

    // Роли колонок (для окна «Так читаем?»)
    const roles = fixed ? fixed.slice() : prof.map(p => p.kind === "text" ? "desc" : "skip");
    const curCols = fixed ? roleCols("currency") : prof.filter(p => p.kind === "cur").map(p => p.j);
    const mccCol = fixed ? -1 : (prof.find(p => p.kind === "mcc") || { j: -1 }).j;
    if (!fixed) {
      roles[dateCol] = "date";
      if (best.pair) { roles[best.pair.d] = "expense"; roles[best.pair.c] = "income"; } else roles[best.a] = "amount";
      if (balCol >= 0) roles[balCol] = "balance";
      if (best.mode === "col") roles[best.s] = "sign"; else if (best.mode === "bal" && signCols.length) roles[signCols[0]] = "sign";
      if (curCols.length) roles[curCols[0]] = "currency";
    }
    // Колонка суммы в валюте операции (для «(5.00 USD)» в описании): другая денежная колонка, не остаток и не выбранная
    const origCol = !fixed && !best.pair && curCols.length ? (moneyCols.find(j => j !== best.a && j !== balCol && /операц|транзакц/i.test(prof[j].title)) ?? -1) : -1;

    // Операции
    const curCount = {}; if (curCols.length) col(curCols[0]).forEach(c => { if (c.length) curCount[c[0]] = (curCount[c[0]] || 0) + 1; });
    const tailCur = {}; if (!best.pair) col(best.a).forEach(c => c.forEach(s => { const m = s.match(/\b([A-Z]{3})$/); if (m) tailCur[m[1]] = (tailCur[m[1]] || 0) + 1; }));
    const top = o => Object.keys(o).sort((x, y) => o[y] - o[x])[0];
    const symCur = {}; grid.rows.forEach(r => r.forEach(c => c.forEach(s => { const m = s.match(/[€$£₽]/); if (m) symCur[SYM_CUR[m[0]]] = (symCur[SYM_CUR[m[0]]] || 0) + 1; })));
    const currency = meta.currency || top(tailCur) || top(curCount) || meta.curGuess || top(symCur) || "BYN";
    const txs = []; let zero = 0;
    grid.rows.forEach((r, i) => {
      const dc = r[dateCol] || [], iso = fixYear(dateOf(dc.find(s => dateOf(s)) || ""), meta.ref);
      const amount = best.amt[i];
      if (amount === 0) { zero++; return; }
      if (!iso && !Number.isFinite(amount)) return;
      const details = squash(text[i].replace(CARD, " ").replace(/\d{12,}/g, " ")).slice(0, 300);
      const tx = { date: iso || (dc[0] || null), time: timeOf(dc.join(" ")) || null, type: null, amount, currency, mcc: mccCol >= 0 && r[mccCol] && /^\d{4}$/.test(r[mccCol][0] || "") ? r[mccCol][0] : null, details };
      if (tx.time === "00:00:00") tx.time = null;
      const cur = curCols.length && r[curCols[0]] && r[curCols[0]][0];
      if (cur && cur !== currency && origCol >= 0 && Number.isFinite(N[origCol][i])) { tx.origAmount = Math.abs(N[origCol][i]); tx.details = details + ` (${tx.origAmount.toFixed(2)} ${cur})`; }
      if (bal && Number.isFinite(bal[i])) tx.balance = bal[i];
      if (pendingRow(i)) tx.pending = true;
      txs.push(tx);
    });
    const ds = txs.map(t => t.date).filter(d => /^\d{4}-\d\d-\d\d$/.test(d)).sort();
    const header = Object.assign({ bank: "other", bankName: bankName(grid.meta || []) || null, universal: true, guess: !verified, zeroSkipped: zero, broken: 0 }, meta);
    delete header.ref; delete header.curGuess;
    if (accounts > 1) header.accounts = accounts;
    if (!header.from && ds.length) { header.from = ds[0]; header.to = ds[ds.length - 1]; header.periodGuessed = true; }
    header.currency = currency;
    const how = best.mode === "pair" ? "расход и приход стоят в разных колонках" : best.mode === "asis" ? "расход записан с минусом" : best.mode === "col" ? "приход или расход подписан словом или знаком" : best.mode === "bal" ? "приход или расход виден по остатку" : "приход или расход определён по словам в описании";
    return { roles, header, txs, verified, how,
      proof,
      check: { count: best.count, income: best.inc / 100, expense: best.exp / 100, incomeOk: best.incomeOk, expenseOk: best.expenseOk, balanceOk: best.balanceOk, chain: best.chain ? best.chain.share : null },
      titles: grid.cols.map(c => c.title), kinds: prof.map(p => p.kind) };
  }

  // Первые строки для окна «Так читаем?»: текст ячеек как в файле (номера карт и счетов скрыты)
  const preview = (grid, k) => grid.rows.slice(0, k || 5).map(r => grid.cols.map((_, j) => squash((r[j] || []).join(" ").replace(CARD, "…")).slice(0, 60)));

  // Сверка для сайта: та же форма, что у родных парсеров
  function validate(txs, header) {
    let inc = 0, exp = 0, pending = 0;
    for (const t of txs) { if (t.pending) { pending++; continue; } if (t.amount > 0) inc += cents(t.amount); else exp += cents(-t.amount); }
    const res = { count: txs.length, income: inc / 100, expense: exp / 100, pending };
    res.incomeOk = header.income == null ? null : cents(header.income) === inc;
    res.expenseOk = header.expense == null ? null : cents(header.expense) === exp;
    res.balanceOk = header.opening == null || header.closing == null ? null : cents(header.opening) + inc - exp === cents(header.closing);
    res.ok = res.incomeOk !== false && res.expenseOk !== false && res.balanceOk !== false && (res.incomeOk === true || res.expenseOk === true || res.balanceOk === true);
    return res;
  }

  const ROLES = [["date", "Дата"], ["amount", "Сумма"], ["expense", "Расход"], ["income", "Приход"], ["balance", "Остаток"], ["currency", "Валюта"], ["sign", "Приход или расход"], ["desc", "Описание"], ["skip", "Не нужна"]];

  const api = { num, dateOf, gridFromPages, gridFromTable, guess, preview, validate, readMeta, ROLES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Universal = api;
})(typeof self !== "undefined" ? self : this);
