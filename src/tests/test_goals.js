const G = require("../goals.js");
let failed = 0;
const check = (n, ok) => { console.log((ok ? "OK    " : "ОШИБКА ") + n); if (!ok) failed++; };
const daysIn = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();

// 10 дней из 30, потрачено 100 из 300: осталось 200 на 20 дней = 10 в день, прогноз 300 (впритык)
let p = G.pace({ limit: 300, spent: 100, day: 10, dim: 30 });
check("осталось, дней, в день", p.left === 200 && p.daysLeft === 20 && p.perDay === 10);
check("прогноз при том же темпе", p.projected === 300 && p.level === "ok");
p = G.pace({ limit: 300, spent: 150, day: 10, dim: 30 });
check("риск: пока в рамках, но темп выведет за лимит", p.level === "risk" && p.projected === 450 && p.left === 150);
p = G.pace({ limit: 100, spent: 85, day: 28, dim: 30 });
check("от 80% предупреждение", p.level === "warn" || p.level === "risk");
p = G.pace({ limit: 100, spent: 130, day: 12, dim: 30 });
check("превышено: осталось меньше нуля, в день нет", p.level === "over" && p.left === -30 && p.perDay === null);
p = G.pace({ limit: 100, spent: 10, day: 3, dim: 30 });
check("мало дней данных: прогноза нет", p.projected === null && p.level === "ok");
p = G.pace({ limit: 100, spent: 70, day: 30, dim: 30 });
check("месяц закончился: итог без «в день»", p.finished && p.perDay === null && p.projected === null && p.left === 30);
check("нет лимита: null", G.pace({ limit: 0, spent: 5, day: 5, dim: 30 }) === null && G.pace({ limit: undefined, spent: 5, day: 5, dim: 30 }) === null);
check("без трат", G.pace({ limit: 100, spent: 0, day: 10, dim: 30 }).projected === null);

check("подсказка лимита: медиана округляется до 10", G.suggestLimit([100, 140, 123]) === 120 && G.suggestLimit([100, 140]) === 120);
check("подсказка: меньше двух месяцев не даём", G.suggestLimit([100]) === null && G.suggestLimit([]) === null && G.suggestLimit([0, 0]) === null);

const store = {
  "2026-07": { first: 1, last: 31, cats: { "Продукты": 200 } },
  "2026-08": { first: 1, last: 31, cats: { "Продукты": 260 } },
  "2026-09": { first: 10, last: 30, cats: { "Продукты": 999 } },       // неполный
  "2026-10": { first: 1, last: 31, cats: { "Продукты": 50, "Кафе": 30 } },
};
check("значения истории: только полные месяцы, без текущего", JSON.stringify(G.historyValues(store, "Продукты", "2026-10", daysIn)) === "[200,260]");
check("нет категории в истории: пусто", G.historyValues(store, "Спорт", "2026-10", daysIn).length === 0 && G.historyValues(null, "x", "2026-10", daysIn).length === 0);

const rs = G.rows({ budgets: { "Продукты": 300, "Кафе": 50, "Такси": 100 }, spentBy: { "Продукты": 100, "Кафе": 80, "Такси": 95 }, day: 10, dim: 30 });
check("строки: сначала превышено, потом по доле", rs[0].cat === "Кафе" && rs[0].level === "over" && rs[1].cat === "Такси");
const tt = G.totals(rs);
check("итоги по лимитам", tt.limit === 450 && tt.spent === 275 && tt.left === 175);
check("пустые лимиты: пусто", G.rows({ budgets: {}, spentBy: {}, day: 5, dim: 30 }).length === 0);
process.exit(failed ? 1 : 0);
