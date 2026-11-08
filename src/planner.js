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
        dates: [...new Set(list.map(t => t.date))].sort(),
        perMonth: Number(k) * list.length / months.size,
        name: top(list.map(t => t.name || "")), cat: top(list.map(t => t.cat)),
      });
    }
    return out.sort((a, b) => b.perMonth - a.perMonth);
  }

  // ---------- Расписание списаний: шаг между прошлыми платежами и дата следующего ----------
  const DAY_MS = 86400000;
  const ms = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  const iso = t => new Date(t).toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / DAY_MS);
  const addDays = (d, n) => iso(ms(d) + n * DAY_MS);
  const daysInMonth = ym => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
  const median = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

  // Платёж r из findRegular: даты берём у всех операций той же суммы (items), в том числе в неполных месяцах вне окна.
  // «Раз в месяц»: медиана промежутков 20–40 дней и не меньше 60% промежутков от 15 до 46 дней (число «плавает» из-за выходных, лишнее списание не мешает).
  //   Следующая дата: число последних платежей (медиана трёх последних) в следующем месяце, а в коротком месяце последний день.
  // «Каждые N дней»: шаг (медиана промежутков) меньше 36 дней, не меньше 60% промежутков в пределах ±25% от него.
  // Иначе kind = "irregular": это частая покупка на одну сумму, а не расписание, даты next нет.
  // dataEnd: последняя дата в выписке. Если ожидаемая дата уже прошла внутри выписки (с запасом 3 дня), а платежа не было, skipped = true.
  // Меньше двух дат: null.
  function schedule(r, items, dataEnd, skipCats) {
    const skip = skipCats || [];
    const key = r.amount.toFixed(2);
    const set = new Set(r.dates || []);
    for (const t of items || []) {
      if (t.amount < 0 && t.date && (-t.amount).toFixed(2) === key && !skip.includes(t.cat)) set.add(t.date);
    }
    const dates = [...set].sort();
    if (dates.length < 2) return null;
    const gaps = [];
    for (let i = 1; i < dates.length; i++) gaps.push(daysBetween(dates[i - 1], dates[i]));
    const step = median(gaps);
    const last = dates[dates.length - 1];
    const monthly = step >= 20 && step <= 40 && gaps.filter(g => g >= 15 && g <= 46).length >= gaps.length * 0.6;
    const even = step >= 1 && step < 36 && gaps.filter(g => g >= step * 0.75 && g <= step * 1.25).length >= gaps.length * 0.6;
    let next, kind;
    if (monthly) {
      kind = "month";
      const ym = addMonths(last.slice(0, 7), 1);
      const days = dates.slice(-3).map(d => +d.slice(8));
      const day = Math.min(days.length < 3 ? days[days.length - 1] : median(days), daysInMonth(ym));
      next = ym + "-" + String(day).padStart(2, "0");
    } else if (even) {
      kind = "days";
      next = addDays(last, step);
    } else return { kind: "irregular", step, last, next: null, dates, skipped: false };
    return { kind, step, last, next, dates, skipped: !!dataEnd && daysBetween(next, dataEnd) > 3 };
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

  const api = { addMonths, findRegular, schedule, daysBetween, forecast, budgetStatus, savingsPlan, savingsCheck, leftover };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Planner = api;
})(typeof self !== "undefined" ? self : this);
