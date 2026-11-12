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
// Прошедший по календарю месяц: выписка оборвалась на 8-м числе, но месяц закрыт (closed)
const pc = G.pace({ limit: 100, spent: 150, day: 8, dim: 28, closed: true });
check("прошедший месяц: закончен, без «осталось дней» и прогноза", pc.finished === true && pc.daysLeft === 0 && pc.projected === null && pc.perDay === null && pc.level === "over");
const po = G.pace({ limit: 100, spent: 150, day: 8, dim: 28 });
check("идущий месяц: не закончен", po.finished === false && po.daysLeft === 20);
check("прошедший месяц в рамках лимита остаётся ok", G.pace({ limit: 100, spent: 50, day: 8, dim: 28, closed: true }).level === "ok");
const rc = G.rows({ budgets: { "Кафе": 50, "Такси": 100 }, spentBy: { "Кафе": 80, "Такси": 10 }, day: 8, dim: 28, closed: true });
check("сводка: превышено 1 из 2", JSON.stringify(G.summary(rc, true)) === JSON.stringify({ level: "over", over: 1, near: 0, n: 2 }));
check("сводка: всё в норме", G.summary(G.rows({ budgets: { "Кафе": 50 }, spentBy: { "Кафе": 10 }, day: 8, dim: 28, closed: true }), true).level === "ok");
check("сводка: близко к лимиту в идущем месяце", G.summary(G.rows({ budgets: { "Кафе": 50 }, spentBy: { "Кафе": 45 }, day: 20, dim: 30 }), false).level === "warn");
// Аудит цифр 12.11: «обычно за месяц» по категории, которая бывает не каждый месяц (до исправления: 400 по двум месяцам из шести)
{
  const st = {}; const dIn = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
  ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"].forEach((ym, i) => { st[ym] = { first: 1, last: dIn(ym), total: 1000, cats: Object.assign({ "Продукты": 500 + i * 10 }, i === 0 ? { "Одежда": 300 } : i === 4 ? { "Одежда": 500 } : {}) }; });
  check("обычно: категория в 2 месяцах из 6 не получает «обычно 400»", typeof G.usual === "function" && G.usual(st, "Одежда", "2026-10", dIn) === null);
  check("обычно: категория каждый месяц: середина, до 10", typeof G.usual === "function" && G.usual(st, "Продукты", "2026-10", dIn) === 530);
  st["2026-09"].cats["Одежда"] = 200; st["2026-07"].cats["Одежда"] = 100; st["2026-06"].cats["Одежда"] = 100;
  check("обычно: категория в 5 месяцах из 6: середина с учётом пустого месяца (0,100,100,200,300,500 → 150)", typeof G.usual === "function" && G.usual(st, "Одежда", "2026-10", dIn) === 150);
}
process.exit(failed ? 1 : 0);
