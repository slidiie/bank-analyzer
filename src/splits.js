// Разделение одной операции на несколько категорий (чек на 100 BYN: 70 продукты, 30 хозтовары).
// Чистые функции. Хранится: { id операции: [ { a: сумма части, c: категория }, ... ] }; остаток (сумма операции минус части) остаётся в исходной операции.
// expand() превращает такую операцию в «части» (обычные операции с меньшей суммой), поэтому итоги, списки и план считают их без отдельных правок.
// Части: sid = id#номер, part = true, splitCat = выбранная категория. Остаток: sid = id исходной операции (его выбор категории и заметка сохраняются).
// collapse() склеивает всё обратно (для файла разбора и для добавления новых выписок).
(function (root) {
  "use strict";
  const MAX_PARTS = 8, MAX_ENTRIES = 500;
  const cents = v => Math.round(v * 100);
  const toNum = v => { const n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(/[\s ]/g, "").replace(",", ".")); return isFinite(n) ? n : NaN; };

  function cleanParts(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (const p of list) {
      if (!p || typeof p !== "object") continue;
      const a = toNum(p.a), c = typeof p.c === "string" ? p.c.trim().slice(0, 40) : "";
      if (!(a >= 0.01) || !c || a > 1e9) continue;
      out.push({ a: cents(a) / 100, c });
      if (out.length >= MAX_PARTS) break;
    }
    return out;
  }
  function cleanMap(m) {
    const out = {};
    if (!m || typeof m !== "object" || Array.isArray(m)) return out;
    let n = 0;
    for (const k of Object.keys(m)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype" || k.length > 80) continue;
      const parts = cleanParts(m[k]);
      if (!parts.length) continue;
      out[k] = parts;
      if (++n >= MAX_ENTRIES) break;
    }
    return out;
  }
  // Можно ли делить: только расход, не «пара» (перевод между своими)
  const canSplit = tx => !!tx && tx.amount < 0 && !tx.pair && !tx.part && !tx.splitOf;
  // Остаток в копейках после частей; отрицательный = части больше суммы
  function remainder(tx, parts) {
    return cents(-tx.amount) - parts.reduce((s, p) => s + cents(p.a), 0);
  }
  function valid(tx, parts) {
    return canSplit(tx) && parts && parts.length > 0 && parts.length <= MAX_PARTS && remainder(tx, parts) >= 0;
  }
  const FEE_CAT = "Комиссии банка";
  // Комиссия: у пары между своими её находит merge.js (pfee), у обычной операции её пишет сам банк (fee, Белинвестбанк)
  const feeOf = tx => (tx.pair ? tx.pfee : tx.fee);
  const feeCents = tx => { const f = feeOf(tx); return tx.amount < 0 && typeof f === "number" && f >= 0.01 && cents(f) < cents(-tx.amount) ? cents(f) : 0; };
  function expand(txs, splits, idFn) {
    splits = splits || {};
    const out = [];
    for (const tx of txs) {
      const id = idFn(tx);
      // Перевод между своими с комиссией (merge.js): между своими идёт пришедшая сумма, комиссия отдельной частью в «Комиссии банка»
      const fee = feeCents(tx);
      if (fee) {
        out.push(Object.assign({}, tx, { amount: (cents(tx.amount) + fee) / 100, sid: id, splitOf: id, _o: tx }));
        out.push(Object.assign({}, tx, { amount: -fee / 100, sid: id + "#fee", part: true, feePart: true, splitOf: id, splitCat: FEE_CAT, pair: 0, _o: tx }));
        continue;
      }
      const parts = Object.prototype.hasOwnProperty.call(splits, id) ? splits[id] : null;
      if (!parts || !valid(tx, parts)) { out.push(tx); continue; }
      const rest = remainder(tx, parts);
      if (rest > 0) out.push(Object.assign({}, tx, { amount: -rest / 100, sid: id, splitOf: id, _o: tx }));
      parts.forEach((p, i) => out.push(Object.assign({}, tx, { amount: -cents(p.a) / 100, sid: id + "#" + (i + 1), part: true, splitOf: id, splitIdx: i, splitCat: p.c, _o: tx })));
    }
    return out;
  }
  function collapse(txs) {
    const out = [], seen = new Set();
    for (const tx of txs) {
      if (!tx._o) { out.push(tx); continue; }
      if (seen.has(tx._o)) continue;
      seen.add(tx._o); out.push(tx._o);
    }
    return out;
  }
  const api = { cleanParts, cleanMap, canSplit, valid, remainder, expand, collapse, MAX_PARTS };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Splits = api;
})(typeof window !== "undefined" ? window : globalThis);
