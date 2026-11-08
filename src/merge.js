// merge.js: несколько выписок в одном разборе.
// Добавляет новую выписку к уже загруженным без дублей (если периоды пересекаются, повторы пропускаются),
// держит список загруженных выписок и находит переводы между разными выписками (пришло в одном банке,
// ушло из другого). Работает и в браузере (глобальный объект Merge), и в Node (для тестов).

(function (root) {
  "use strict";

  const cents = n => Math.round(n * 100);
  const DAY = 24 * 3600 * 1000;
  const stamp = t => (t.date || "") + " " + (t.time || "00:00:00");
  // Тот же идентификатор операции, что и в analyzer.html (дата, время, сумма, остаток)
  const txId = tx => [tx.date, tx.time || "", tx.amount, tx.balance].join("|");

  // Слова, по которым операция похожа на перевод между счетами. Покупки и наличные сюда не входят.
  const TRANSFERISH = /перевод|p2p|пополнен|интернет-банк|internetbank|ерип|erip|между своими|своего счёта|своего счета/i;
  const NOT_TRANSFER = /покупка товара|выдача наличных|снятие наличных/i;

  const newState = () => ({ txs: [], statements: [] });

  // Сколько раз каждая операция уже есть в разборе: ключ «банк|идентификатор».
  // Повтором считается только операция того же банка, и столько раз, сколько она уже встречалась:
  // две одинаковые покупки в одной выписке (без времени и остатка) обе остаются.
  // У операций из старых файлов разбора банка нет: они сравниваются с любым банком.
  function counter(txs) {
    const cnt = new Map();
    for (const t of txs) { const k = (t.bank || "?") + "|" + txId(t); cnt.set(k, (cnt.get(k) || 0) + 1); }
    return cnt;
  }
  function takeDup(cnt, bank, id) {
    for (const k of [bank + "|" + id, "?|" + id]) {
      const n = cnt.get(k) || 0;
      if (n > 0) { cnt.set(k, n - 1); return true; }
    }
    return false;
  }

  // Добавить операции в разбор без повторов. Номера пар и выписок сдвигаются, чтобы не совпасть с уже загруженными.
  function addTxs(state, list, bankOf, srcOf) {
    const cnt = counter(state.txs);
    const offset = state.txs.reduce((m, t) => Math.max(m, t.pair || 0), 0);
    let added = 0, skipped = 0;
    for (const t of list) {
      const bank = bankOf(t);
      if (takeDup(cnt, bank, txId(t))) { skipped++; continue; }
      const copy = Object.assign({}, t, { bank, src: srcOf(t) });
      if (copy.pair) copy.pair += offset;       // номера пар из разных выписок не должны совпасть
      state.txs.push(copy);
      added++;
    }
    return { added, skipped };
  }

  // Добавить выписку. res = { bank: {id, name}, header, txs, check }.
  // Возвращает { added, skipped, index }.
  function addStatement(state, res) {
    const index = state.statements.length;
    const { added, skipped } = addTxs(state, res.txs, () => res.bank.id, () => index);
    state.statements.push({
      bank: res.bank.id, bankName: res.bank.name,
      from: res.header.from || null, to: res.header.to || null,
      count: res.txs.length, added, skipped,
      check: res.check || null,
    });
    dropOrphanPairs(state.txs);
    return { added, skipped, index };
  }

  // Добавить операции из файла разбора к уже загруженным. statements: выписки из файла
  // (номер выписки src у операций указывает на них). Возвращает { added, skipped }.
  function addSaved(state, txs, statements, defaultBank) {
    const base = state.statements.length;
    const sts = statements || [];
    const bankOf = t => t.bank || (sts[t.src] && sts[t.src].bank) || defaultBank || "?";
    const r = addTxs(state, txs, bankOf, t => (Number.isInteger(t.src) && t.src >= 0 && t.src < sts.length ? t.src : 0) + base);
    state.statements.push(...sts);
    dropOrphanPairs(state.txs);
    return r;
  }

  // Пара, у которой не нашлась вторая половина (её пропустили как повтор), больше не пара
  function dropOrphanPairs(txs) {
    const cnt = new Map();
    txs.forEach(t => { if (t.pair) cnt.set(t.pair, (cnt.get(t.pair) || 0) + 1); });
    txs.forEach(t => { if (t.pair && cnt.get(t.pair) < 2) delete t.pair; });
  }

  // Общий период и банк для шапки: если банков несколько, bank = "multi"
  function mergedHeader(statements) {
    const froms = statements.map(s => s.from).filter(Boolean).sort();
    const tos = statements.map(s => s.to).filter(Boolean).sort();
    const banks = [...new Set(statements.map(s => s.bank))];
    const h = {};
    if (froms.length) h.from = froms[0];
    if (tos.length) h.to = tos[tos.length - 1];
    if (banks.length) h.bank = banks.length === 1 ? banks[0] : "multi";
    return h;
  }

  // Переводы между разными выписками: равные суммы с противоположными знаками, в пределах суток,
  // из разных выписок, хотя бы одна сторона похожа на перевод. isRetail(tx) отсекает покупки по MCC.
  // Возвращает число найденных пар.
  const forDate = t => {
    const m = /за (\d\d)\.(\d\d)\.(\d{4})/.exec(t.details || "");
    return m ? m[3] + "-" + m[2] + "-" + m[1] : t.date;
  };

  function markCrossPairs(txs, isRetail) {
    let next = txs.reduce((m, t) => Math.max(m, t.pair || 0), 0) + 1;
    const eligible = t => !t.pair && !NOT_TRANSFER.test(t.details || "") && !(isRetail && isRetail(t));
    const free = txs.filter(eligible);
    const credits = free.filter(t => t.amount > 0).sort((a, b) => (stamp(a) < stamp(b) ? -1 : 1));
    let n = 0;
    for (const c of credits) {
      if (c.pair) continue;
      let best = null, bestGap = Infinity;
      for (const d of free) {
        if (d.pair || d.amount >= 0 || d.src === c.src || cents(-d.amount) !== cents(c.amount)) continue;
        if (!TRANSFERISH.test(c.details || "") && !TRANSFERISH.test(d.details || "")) continue;
        // МТБ пишет в пополнении «за ДД.ММ.ГГГГ»: настоящая дата перевода (зачисление бывает позже, например через выходные)
        const gap = Math.min(
          Math.abs(Date.parse(c.date) - Date.parse(d.date)),
          Math.abs(Date.parse(forDate(c)) - Date.parse(d.date)),
          Math.abs(Date.parse(c.date) - Date.parse(forDate(d))),
          Math.abs(Date.parse(forDate(c)) - Date.parse(forDate(d))));
        if (gap > DAY) continue;
        const fine = Math.abs(Date.parse(stamp(c).replace(" ", "T")) - Date.parse(stamp(d).replace(" ", "T")));
        if (fine < bestGap) { best = d; bestGap = fine; }
      }
      if (best) { c.pair = best.pair = next++; n++; }
    }
    return n;
  }

  // Счёт не в белорусских рублях: суммы показываются как есть, без пересчёта по курсу. Возвращает текст предупреждения или null.
  function currencyNote(header) {
    const c = header && typeof header.currency === "string" ? header.currency.toUpperCase() : "";
    if (!/^[A-Z]{3}$/.test(c) || c === "BYN" || c === "BYR") return null;
    return `Счёт в валюте ${c}: суммы показаны в ${c} без пересчёта по курсу, а подписаны как BYN. Если вместе загружены выписки в рублях, общие итоги будут неточными.`;
  }

  const pairCount = txs => new Set(txs.filter(t => t.pair).map(t => t.pair)).size;

  const api = { newState, addStatement, addSaved, mergedHeader, currencyNote, markCrossPairs, pairCount, txId, TRANSFERISH };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Merge = api;
})(typeof self !== "undefined" ? self : this);
