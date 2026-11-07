const P = require("../planner.js");
let failed = 0;
const check = (n, ok) => { console.log((ok ? "OK    " : "ОШИБКА ") + n); if (!ok) failed++; };
const t = (date, amount, cat, name) => ({ date, amount, cat: cat || "Прочее", name: name || "X" });

check("addMonths: через год и назад", P.addMonths("2026-11", 1) === "2026-12" && P.addMonths("2026-12", 1) === "2027-01" && P.addMonths("2026-01", -1) === "2025-12");

const months = ["2026-08", "2026-09", "2026-10"];
const items = [
  t("2026-08-07", -1760, "Аренда и жильё", "АРЕНДА"), t("2026-09-07", -1760, "Аренда и жильё", "АРЕНДА"), t("2026-10-08", -1760, "Аренда и жильё", "АРЕНДА"),
  t("2026-09-15", -25, "Связь и подписки", "A1"), t("2026-10-15", -25, "Связь и подписки", "A1"),
  t("2026-08-02", -50, "Продукты"),                                   // только один месяц
  t("2026-08-03", -30, "Продукты"), t("2026-08-04", -30, "Продукты"), t("2026-08-05", -30, "Продукты"), t("2026-09-03", -30, "Продукты"), t("2026-10-03", -30, "Продукты"), // слишком часто
  t("2026-08-10", -5, "Прочее"), t("2026-09-10", -5, "Прочее"), t("2026-10-10", -5, "Прочее"),  // мелочь
  t("2026-08-11", -100, "Наличные"), t("2026-09-11", -100, "Наличные"), t("2026-10-11", -100, "Наличные"),
];
const reg = P.findRegular(items, months, ["Наличные"]);
check("находит аренду и связь", reg.length === 2 && reg[0].amount === 1760 && reg[0].day === 7 && reg[1].amount === 25);
check("аренда: 3 месяца, в месяц 1760", reg[0].months === 3 && Math.abs(reg[0].perMonth - 1760) < 1e-9);
check("связь: 2 месяца из 3 хватает (порог 60%)", reg[1].months === 2);
check("мелочь, наличные, разовые и слишком частые не считаются регулярными", !reg.some(r => r.amount === 5 || r.amount === 100 || r.amount === 50 || r.amount === 30));
check("один месяц данных: ничего не утверждаем", P.findRegular(items, ["2026-08"], []).length === 0);

const f = P.forecast([1000, 1200, 1100], reg);
check("прогноз: среднее, разброс", Math.abs(f.avg - 1100) < 1e-9 && f.min === 1000 && f.max === 1200 && f.n === 3);
check("регулярные не превышают среднее", f.regularSum <= f.avg && f.rest >= 0);
check("меньше двух месяцев: прогноза нет", P.forecast([1000], []) === null);

check("бюджет: 50% ок, 80% предупреждение, 101% превышен, без лимита null",
  P.budgetStatus(50, 100).level === "ok" && P.budgetStatus(80, 100).level === "warn" && P.budgetStatus(101, 100).level === "over" && P.budgetStatus(10, 0) === null);

const l = P.leftover({ income: 2000, obligations: 900, other: 600, rentNow: 800, rentNew: 600 });
check("остаётся: базовый и сценарий с дешёвой арендой", l.base === 500 && l.scenario === 700 && l.delta === 200);
check("без сценария аренды delta = null", P.leftover({ income: 1, obligations: 0, other: 0 }).delta === null);

const sp = P.savingsPlan({ income: 2000, mode: "pct", value: 10 });
check("накопления в процентах: 10% от 2000 = 200", sp.amount === 200 && sp.pct === 10);
const sb = P.savingsPlan({ income: 2000, mode: "byn", value: 300 });
check("накопления суммой: 300 из 2000 = 15%", sb.amount === 300 && sb.pct === 15);
check("накопления: пусто, дохода нет, отрицательное", P.savingsPlan({ income: 2000, mode: "pct", value: 0 }).amount === 0 && P.savingsPlan({ income: 0, mode: "pct", value: 10 }).amount === 0 && P.savingsPlan({ income: 0, mode: "byn", value: 50 }).pct === null && P.savingsPlan({ income: 100, mode: "byn", value: -5 }).amount === 0);
check("проверка: без накоплений замечаний нет", P.savingsCheck({ income: 100, savings: 0, obligations: 500 }).length === 0);
check("проверка: накопления больше дохода", P.savingsCheck({ income: 1000, savings: 1200, obligations: 0 })[0] === "over-income");
check("проверка: накопления + обязательные больше дохода", P.savingsCheck({ income: 1000, savings: 400, obligations: 700 })[0] === "no-room");
check("проверка: дохода нет", P.savingsCheck({ income: 0, savings: 100, obligations: 0 })[0] === "no-income");
check("проверка: всё сходится", P.savingsCheck({ income: 1000, savings: 100, obligations: 300 }).length === 0);
const l2 = P.leftover({ income: 2000, savings: 200, obligations: 900, other: 600, rentNow: 800, rentNew: 600 });
check("остаётся с накоплениями: 2000 − 200 − 900 − 600 = 300, с дешёвой арендой 500", l2.base === 300 && l2.scenario === 500);
console.log(failed ? `\nПровалено проверок: ${failed}` : "\nВсе проверки пройдены.");
process.exit(failed ? 1 : 0);
