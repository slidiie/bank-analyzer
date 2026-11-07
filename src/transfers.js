// transfers.js: поиск «пришло и сразу ушло».
// Если на счёт пришла сумма, а в течение нескольких дней ровно такая же сумма ушла дальше
// (перевод на свой другой счёт, платёж через ЕРИП и т. п.), это пара. Обе операции получают
// одинаковый номер в поле pair. Такие пары не считаются ни доходом, ни расходом, но в списке остаются.
// Работает и в браузере (глобальный объект Transfers), и в Node (для тестов).

(function (root) {
  "use strict";

  const DAY = 24 * 3600 * 1000;
  const cents = n => Math.round(n * 100);
  const stamp = t => t.date + " " + (t.time || "00:00:00");
  const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

  // isOut(tx) решает, может ли списание быть «пересылкой» (для каждого банка своё правило).
  // Каждое списание входит максимум в одну пару. Возвращает число найденных пар.
  function mark(txs, isOut, maxDays = 10) {
    txs.forEach(t => { delete t.pair; });
    const order = txs.map((t, i) => i).sort((a, b) => (stamp(txs[a]) < stamp(txs[b]) ? -1 : stamp(txs[a]) > stamp(txs[b]) ? 1 : a - b));
    const used = new Set();
    let n = 0;
    for (const i of order) {
      const cr = txs[i];
      if (!(cr.amount > 0) || /возврат/i.test(cr.details || "")) continue;
      const j = order.find(k => !used.has(k) && k !== i && isOut(txs[k]) &&
        cents(-txs[k].amount) === cents(cr.amount) && stamp(txs[k]) >= stamp(cr) &&
        dayDiff(cr.date, txs[k].date) <= maxDays);
      if (j === undefined) continue;
      used.add(j);
      n++;
      cr.pair = txs[j].pair = n;
    }
    return n;
  }

  const api = { mark };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Transfers = api;
})(typeof self !== "undefined" ? self : this);
