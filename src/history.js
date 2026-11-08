// История трат между выписками: хранится только в браузере, без описаний операций и без номеров.
// По каждому календарному месяцу: покрытие (с какого по какое число есть данные), итог, суммы по дням и по категориям.
// Чистые функции без доступа к странице: их можно проверять тестами.
// Трата здесь: { date: "2026-10-07", amount: -12.5, cat: "Продукты" } (только расходы, без своих переводов)
(function (root) {
  "use strict";
  const KEEP_MONTHS = 24;
  const r2 = x => Math.round(x * 100) / 100;
  const daysIn = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
  const addMonths = (ym, n) => { const t = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + n; return Math.floor(t / 12) + "-" + String(t % 12 + 1).padStart(2, "0"); };

  // Сводка по месяцам из трат. cover: { from, to } даты выписки (если пусто, берутся из самих трат).
  function summarize(spend, cover) {
    // Возврат (refund: true, сумма больше нуля) уменьшает траты месяца и своей категории
    const dated = spend.filter(t => t.date && (t.amount < 0 || (t.refund === true && t.amount > 0)));
    const out = {};
    const dates = (cover && cover.dates) || dated.map(t => t.date);
    if (!dates.length) return out;
    const sorted = dates.slice().sort();
    const from = (cover && cover.from) || sorted[0], to = (cover && cover.to) || sorted[sorted.length - 1];
    const months = new Set(dated.map(t => t.date.slice(0, 7)));
    months.forEach(ym => {
      const a = from > ym + "-01" ? from : ym + "-01";
      const lastDay = ym + "-" + String(daysIn(ym)).padStart(2, "0");
      const b = to < lastDay ? to : lastDay;
      out[ym] = { first: +a.slice(8), last: +b.slice(8), total: 0, days: {}, cats: {} };
    });
    dated.forEach(t => {
      const m = out[t.date.slice(0, 7)], d = +t.date.slice(8), v = -t.amount;
      m.total += v; m.days[d] = (m.days[d] || 0) + v; m.cats[t.cat || "Прочее"] = (m.cats[t.cat || "Прочее"] || 0) + v;
    });
    Object.values(out).forEach(m => {
      m.total = Math.max(0, r2(m.total));                       // возвратов больше, чем трат: месяц без трат, не в минус
      Object.keys(m.days).forEach(k => { m.days[k] = Math.max(0, r2(m.days[k])); });
      Object.keys(m.cats).forEach(k => { const v = r2(m.cats[k]); if (v > 0) m.cats[k] = v; else delete m.cats[k]; });
    });
    return out;
  }

  const width = m => m.last - m.first + 1;
  // Кладёт сводки в хранилище. Если месяц уже есть, остаётся тот, где данных за больше дней (при равенстве побеждает новый).
  function merge(store, fresh) {
    const res = Object.assign({}, store || {});
    Object.keys(fresh || {}).forEach(ym => {
      if (!/^\d{4}-\d{2}$/.test(ym)) return;
      if (!res[ym] || width(fresh[ym]) >= width(res[ym])) res[ym] = fresh[ym];
    });
    Object.keys(res).sort().slice(0, -KEEP_MONTHS).forEach(k => delete res[k]);
    return res;
  }

  const sumDays = (m, a, b) => { let s = 0; for (let d = a; d <= b; d++) s += m.days[d] || 0; return s; };
  const isFull = (m, ym) => m.first === 1 && m.last === daysIn(ym);

  // Сравнение месяца ym (cur) с предыдущим из истории (prev).
  // Полный месяц сравниваем с полным, неполный: за те же числа. Если данных не хватает, возвращает null.
  function compare(ym, cur, prev) {
    if (!cur || !prev || !(cur.total > 0)) return null;
    const prevYm = addMonths(ym, -1);
    let a, b, cv, pv;
    if (isFull(cur, ym)) {
      if (!isFull(prev, prevYm)) return null;
      a = 1; b = daysIn(ym); cv = cur.total; pv = prev.total;
    } else {
      a = cur.first; b = cur.last;
      if (b - a + 1 < 5 || prev.first > a || prev.last < b) return null;
      cv = sumDays(cur, a, b); pv = sumDays(prev, a, b);
    }
    if (!(pv > 0)) return null;
    return { pct: Math.round((cv - pv) / pv * 100), a, b, full: isFull(cur, ym), prevYm };
  }

  const api = { summarize, merge, compare, addMonths, KEEP_MONTHS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.History = api;
})(typeof self !== "undefined" ? self : this);
