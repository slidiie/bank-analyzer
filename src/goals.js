// Цели и бюджеты с темпом: «осталось X на категорию до конца месяца».
// Чистые функции, без доступа к странице. Только суммы и категории, без текста операций.
(function (root) {
  "use strict";
  const r2 = x => Math.round(x * 100) / 100;
  const MIN_DAYS = 5;   // меньше стольких дней данных в месяце прогноз темпа не строим

  // Темп одного лимита. day: сколько дней месяца уже в выписке (последний день данных), dim: дней в месяце.
  // Результат: left (осталось, может быть < 0), daysLeft, perDay (сколько можно тратить в день, null если лимит уже выбран или месяц кончился),
  // projected (прогноз на конец месяца при том же темпе, null если данных мало или месяц закончился), level: ok / warn / over / risk.
  // risk: пока в рамках лимита, но при том же темпе выйдем за него.
  function pace({ limit, spent, day, dim }) {
    if (!(limit > 0)) return null;
    const s = Math.max(0, spent || 0), daysLeft = Math.max(0, dim - day), left = limit - s;
    const pct = s / limit * 100;
    const finished = daysLeft === 0;
    const projected = !finished && day >= MIN_DAYS && s > 0 ? r2(s / day * dim) : null;
    let level = pct > 100 ? "over" : pct >= 80 ? "warn" : "ok";
    if (level !== "over" && projected !== null && projected > limit) level = "risk";
    return {
      limit, spent: r2(s), left: r2(left), pct, daysLeft, finished, level,
      perDay: !finished && left > 0 ? r2(left / daysLeft) : null,
      projected,
    };
  }

  // Подсказка лимита по истории: медиана трат за полные месяцы, округлённая до 10. Нужно минимум 2 месяца.
  function suggestLimit(values) {
    const v = (values || []).filter(x => x > 0).sort((a, b) => a - b);
    if (v.length < 2) return null;
    const m = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
    const rounded = Math.round(m / 10) * 10;
    return rounded > 0 ? rounded : null;
  }

  // Траты по категории за полные месяцы из истории (store: { "2026-09": { first, last, cats: {...} } }) без текущего месяца.
  function historyValues(store, cat, exceptYm, daysIn) {
    const out = [];
    Object.keys(store || {}).sort().forEach(ym => {
      const m = store[ym];
      if (ym === exceptYm || !m || m.first !== 1 || m.last !== daysIn(ym)) return;
      if (m.cats && m.cats[cat] > 0) out.push(m.cats[cat]);
    });
    return out.slice(-6);
  }

  const ORDER = { over: 0, risk: 1, warn: 2, ok: 3 };
  // Строки для блока: по каждому лимиту темп, самые тревожные сверху.
  // spentBy: { категория: сумма за месяц }, budgets: { категория: лимит }.
  function rows({ budgets, spentBy, day, dim }) {
    return Object.keys(budgets || {}).map(cat => {
      const p = pace({ limit: budgets[cat], spent: (spentBy || {})[cat] || 0, day, dim });
      return p ? Object.assign({ cat }, p) : null;
    }).filter(Boolean).sort((a, b) => ORDER[a.level] - ORDER[b.level] || b.pct - a.pct);
  }

  // Общая сумма лимитов и трат по ним, чтобы показать «вложились в общий бюджет или нет»
  function totals(list) {
    const limit = list.reduce((a, r) => a + r.limit, 0), spent = list.reduce((a, r) => a + r.spent, 0);
    return { limit: r2(limit), spent: r2(spent), left: r2(limit - spent) };
  }

  const api = { pace, suggestLimit, historyValues, rows, totals, MIN_DAYS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Goals = api;
})(typeof self !== "undefined" ? self : this);
