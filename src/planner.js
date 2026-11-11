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
    // Серия платежей: нужные месяцы, не чаще 1,5 раза в месяц. Возвращает запись или null
    const series = (k, list) => {
      const months = new Set(list.map(t => t.date.slice(0, 7)));
      if (months.size < need || list.length > months.size * 1.5) return null;
      const days = list.map(t => parseInt(t.date.slice(8, 10), 10)).sort((a, b) => a - b);
      // По одному платежу в месяц и числа расходятся больше чем на неделю (с учётом перехода через конец месяца):
      // это совпадение сумм у обычных покупок (кафе, магазин), а не подписка или аренда
      if (list.length <= months.size) {
        let gap = days[0] + 30 - days[days.length - 1];
        for (let i = 1; i < days.length; i++) gap = Math.max(gap, days[i] - days[i - 1]);
        if (30 - gap > 7) return null;
      }
      return {
        amount: Number(k), count: list.length, months: months.size,
        day: days[Math.floor(days.length / 2)],
        dates: [...new Set(list.map(t => t.date))].sort(),
        perMonth: Number(k) * list.length / months.size,
        name: top(list.map(t => t.name || "")), cat: top(list.map(t => t.cat)),
      };
    };
    for (const [k, list] of groups) {
      // Одна сумма у разных мест (кофейня и подписка по 11,71): серию ищем отдельно по каждому названию,
      // иначе чужая покупка попадает в подписку и «в месяц» не сходится с ценой
      const byName = new Map();
      for (const t of list) { const n = (t.name || "").trim().toLowerCase(); if (!byName.has(n)) byName.set(n, []); byName.get(n).push(t); }
      const named = [...byName.entries()].filter(([n]) => n);
      const used = new Set();
      if (named.length > 1) for (const [, part] of named) { const s = series(k, part); if (s) { out.push(s); part.forEach(t => used.add(t)); } }
      if (used.size) {
        const rest = list.filter(t => !used.has(t));
        const s = rest.length ? series(k, rest) : null;
        if (s) out.push(s);
      } else { const s = series(k, list); if (s) out.push(s); }
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
    // Ровный шаг в днях: только недельный/двухнедельный ритм (до 16 дн.) и не меньше 75% промежутков в пределах ±20%.
    // Покупка на одну сумму «каждые 17–35 дней» — привычка, а не расписание: «Раз в месяц» её не ловит, значит, это «без ровного срока»
    const even = step >= 1 && step <= 16 && gaps.filter(g => g >= step * 0.8 && g <= step * 1.2).length >= gaps.length * 0.75;
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

  // Сравнение двух месяцев: rows = [[категория, сумма], ...] (расходы). Возвращает разницу итога и самые заметные изменения по категориям.
  function compareMonths(cur, prev, skip) {
    const sk = new Set(skip || []);
    const m = new Map();
    for (const [c, v] of prev) if (!sk.has(c)) m.set(c, { c, a: v, b: 0 });
    for (const [c, v] of cur) if (!sk.has(c)) { if (!m.has(c)) m.set(c, { c, a: 0, b: 0 }); m.get(c).b = v; }
    const rows = [...m.values()].map(x => ({ cat: x.c, prev: x.a, cur: x.b, diff: x.b - x.a }));
    const prevTotal = rows.reduce((a, x) => a + x.prev, 0), curTotal = rows.reduce((a, x) => a + x.cur, 0);
    rows.sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
    return { prevTotal, curTotal, diff: curTotal - prevTotal, pct: prevTotal > 0 ? (curTotal - prevTotal) / prevTotal * 100 : null, top: rows.filter(x => Math.abs(x.diff) >= 20).slice(0, 3) };
  }

  // Аномалии в расходах: items = [{date, amount, cat, name}]. Только подозрения, не утверждения.
  //  double: два и более списания с тем же названием и суммой (от 10) в один день;
  //  big: расход от 100, не меньше чем в 4 раза больше обычного (медианы) в своей категории, если в ней есть минимум 5 расходов.
  function findAnomalies(items, skipCats) {
    const sk = new Set(skipCats || []);
    const exp = items.filter(t => t.date && t.amount < 0 && !sk.has(t.cat));
    const groups = new Map();
    for (const t of exp) {
      if (-t.amount < 10) continue;
      const k = t.date + "|" + t.name + "|" + t.amount.toFixed(2);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    }
    const double = [...groups.values()].filter(g => g.length >= 2).map(g => ({ date: g[0].date, name: g[0].name, cat: g[0].cat, amount: -g[0].amount, count: g.length }))
      .sort((a, b) => b.amount * (b.count - 1) - a.amount * (a.count - 1));
    const byCat = new Map();
    for (const t of exp) { if (!byCat.has(t.cat)) byCat.set(t.cat, []); byCat.get(t.cat).push(-t.amount); }
    const big = [];
    // Трата, которая повторяется в другом месяце с похожей суммой (аренда, кредит), не «необычная»
    const repeats = t => exp.some(u => u !== t && u.name === t.name && u.date.slice(0, 7) !== t.date.slice(0, 7) && Math.abs(u.amount - t.amount) <= 0.15 * -t.amount);
    for (const t of exp) {
      const a = byCat.get(t.cat);
      if (-t.amount < 100 || a.length < 5) continue;
      if (repeats(t)) continue;
      const med = median(a);
      if (med > 0 && -t.amount >= 4 * med) big.push({ date: t.date, name: t.name, cat: t.cat, amount: -t.amount, usual: med });
    }
    big.sort((a, b) => b.amount - a.amount);
    return { double, big };
  }

  const api = { compareMonths, findAnomalies, addMonths, findRegular, schedule, daysBetween, forecast, budgetStatus, savingsPlan, savingsCheck, leftover };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Planner = api;
})(typeof self !== "undefined" ? self : this);
