// Планирование: регулярные платежи, прогноз, бюджеты, «сколько остаётся».
// Чистые функции без доступа к странице: их можно проверять тестами.
// Операция здесь: { date: "2026-09-07", amount: -12.5, cat: "Продукты", name: "ЕВРООПТ" }
(function (root) {
  "use strict";

  // Сдвиг месяца вида "2026-09" на n месяцев
  function addMonths(ym, n) {
    const [y, m] = ym.split("-").map(Number);
    const t = y * 12 + (m - 1) + n;
    return Math.floor(t / 12) + "-" + String(t % 12 + 1).padStart(2, "0");
  }

  const top = arr => {
    const c = new Map();
    arr.forEach(x => c.set(x, (c.get(x) || 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  // Регулярные платежи: одна и та же сумма (от 10 BYN) почти в каждом месяце, в среднем не чаще полутора раз в месяц.
  // allMonths: все месяцы выписки. Меньше двух месяцев: данных мало, ничего не утверждаем.
  function findRegular(items, allMonths, skipCats) {
    if (allMonths.length < 2) return [];
    const skip = skipCats || [];
    const groups = new Map();
    for (const t of items) {
      if (!(t.amount < 0) || !t.date || -t.amount < 10 || skip.includes(t.cat)) continue;
      const k = (-t.amount).toFixed(2);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    }
    const need = Math.max(2, Math.ceil(allMonths.length * 0.6));
    const out = [];
    for (const [k, list] of groups) {
      const months = new Set(list.map(t => t.date.slice(0, 7)));
      if (months.size < need || list.length > months.size * 1.5) continue;
      const days = list.map(t => parseInt(t.date.slice(8, 10), 10)).sort((a, b) => a - b);
      out.push({
        amount: Number(k), count: list.length, months: months.size,
        day: days[Math.floor(days.length / 2)],
        perMonth: Number(k) * list.length / months.size,
        name: top(list.map(t => t.name || "")), cat: top(list.map(t => t.cat)),
      });
    }
    return out.sort((a, b) => b.perMonth - a.perMonth);
  }

  // Прогноз на основе полных месяцев: средние траты и разброс. Меньше двух полных месяцев: null.
  function forecast(totals, regular) {
    if (totals.length < 2) return null;
    const avg = totals.reduce((a, x) => a + x, 0) / totals.length;
    const regularSum = (regular || []).reduce((a, r) => a + r.perMonth, 0);
    return { avg, min: Math.min(...totals), max: Math.max(...totals), regularSum: Math.min(regularSum, avg), rest: Math.max(0, avg - regularSum), n: totals.length };
  }

  // Бюджет: сколько потрачено от лимита. level: ok / warn (от 80%) / over (выше 100%). Нет лимита: null.
  function budgetStatus(spent, limit) {
    if (!(limit > 0)) return null;
    const pct = spent / limit * 100;
    return { pct, level: pct > 100 ? "over" : pct >= 80 ? "warn" : "ok", left: limit - spent };
  }

  // План накоплений. mode: "pct" (процент от дохода) или "byn" (сумма в месяц). Возвращает сумму и процент от дохода (null, если дохода нет).
  function savingsPlan({ income, mode, value }) {
    const v = Number(value) > 0 ? Number(value) : 0;
    if (mode === "byn") return { amount: v, pct: income > 0 ? v / income * 100 : null };
    return { amount: Math.max(0, income) * v / 100, pct: v };
  }

  // Проверки плана: что не сходится. Коды: no-income, over-income, no-room.
  function savingsCheck({ income, savings, obligations }) {
    const out = [];
    if (!(savings > 0)) return out;
    if (!(income > 0)) { out.push("no-income"); return out; }
    if (savings > income) out.push("over-income");
    else if (savings + (obligations || 0) > income) out.push("no-room");
    return out;
  }

  // Сколько остаётся: доход минус накопления, обязательные и остальные траты. Сценарий с другой арендой (rentNew) меняет обязательные.
  function leftover({ income, savings, obligations, other, rentNow, rentNew }) {
    const base = income - (savings || 0) - obligations - other;
    const hasScenario = Number.isFinite(rentNew) && Number.isFinite(rentNow);
    const scenario = hasScenario ? base - (rentNew - rentNow) : null;
    return { base, scenario, delta: hasScenario ? scenario - base : null };
  }

  const api = { addMonths, findRegular, forecast, budgetStatus, savingsPlan, savingsCheck, leftover };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Planner = api;
})(typeof self !== "undefined" ? self : this);
