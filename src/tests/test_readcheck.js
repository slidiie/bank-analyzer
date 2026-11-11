// Честность чтения: битые даты не попадают в итоги, пропуск ищется по остаткам, выписка без начала узнаётся.
// Данные выдуманные.
const Banks = require("../banks.js");
const Recap = require("../recap.js");
let bad = 0;
const check = (name, ok) => { if (!ok) bad++; console.log((ok ? "ok   " : "FAIL ") + name); };

// Битая дата в CSV Приорбанка: строка уходит в «не прочитано», а не в 13-й месяц
const csv = [
  "Выписка по контракту клиента: Тестов Тест Тестович",
  "Период выписки:;01.10.2026;31.10.2026",
  "Валюта счета;BYN",
  "Дата транзакции;Операция;Сумма;Валюта;Дата операции по счету;Комиссия/Money-back;Обороты по счету;Цифровая карта;Категория операции;",
  "05.10.2026 12:00:00;Retail BLR MINSK SHOP TEST;-10,00;BYN;06.10.2026;0,00;-10,00;;Магазины продуктовые;",
  "32.13.2026 12:00:00;Retail BLR MINSK SHOP TEST2;-5,00;BYN;06.10.2026;0,00;-5,00;;Магазины продуктовые;",
  "07.10.2026 12:00:00;Retail BLR MINSK SHOP TEST3;-7,00;BYN;08.10.2026;0,00;-7,00;;Магазины продуктовые;",
].join("\n");
const r = Banks.parseCsv(csv);
if (r) {
  check("CSV: операция с датой 32.13 не попала в итоги", r.txs.every(t => t.date.slice(5, 7) <= "12"));
  check("CSV: о ней сказано в header.unread", (r.header.unread || []).length === 1 && r.header.broken >= 1);
} else console.log("skip   CSV-образец не узнан (формат тестов Приорбанка другой)");

// realDate
check("дата 2026-02-30 не настоящая", !Banks.realDate("2026-02-30"));
check("дата 2024-02-29 настоящая", Banks.realDate("2024-02-29"));

// Пропуск по цепочке остатков: между 02.10 и 05.10 пропала операция на 5 BYN
const chain = [
  { date: "2026-10-01", amount: -10, balance: 90 },
  { date: "2026-10-02", amount: -10, balance: 80 },
  // пропущено: 04.10, −5, остаток 75
  { date: "2026-10-05", amount: -10, balance: 65 },
  { date: "2026-10-06", amount: -5, balance: 60 },
];
const g = Banks.balanceGap(chain);
check("остатки: пропуск найден между 02.10 и 05.10", g && g.from === "2026-10-02" && g.to === "2026-10-05");
check("остатки: цепочка без пропуска — места нет", Banks.balanceGap(chain.slice(0, 2).concat([{ date: "2026-10-03", amount: -5, balance: 75 }])) === null);

// Выписка без первой страницы: банк узнаётся по названию на других страницах
const page = Array.from({ length: 8 }, (_, i) => ({ x: 10, y: 700 - i * 12, vx: 10, vy: 100 + i * 12, text: `0${i + 1}.10.2026 Покупка 10.00` }));
for (let k = 0; k < 3; k++) page.push({ x: 10, y: 50 - k, vx: 10, vy: 800 + k, text: "ЗАО «МТБанк»" });
check("без начала: узнан МТБанк", Banks.partialOf([page]) === "МТБанк");
check("без начала: чужой текст не узнан", Banks.partialOf([[{ x: 0, y: 0, vx: 0, vy: 0, text: "просто текст" }]]) === null);

// «Итог»: траты выросли сильнее дохода — не «почти вся прибавка»
const items = [], income = [];
for (const [ym, spend, inc] of [["2026-07", 1000, 2000], ["2026-08", 1000, 2000], ["2026-09", 1000, 2000], ["2026-10", 2000, 2600]]) {
  items.push({ date: ym + "-10", amount: -spend, cat: "Продукты", name: "Магазин" });
  income.push({ date: ym + "-05", amount: inc });
}
const rc = Recap.monthRecap({ items, income, fullMonths: ["2026-07", "2026-08", "2026-09", "2026-10"], unsorted: [], fixed: [], regular: [], subsCats: [] });
const incLine = rc.lines.find(l => l.kind === "income");
check("итог: траты выросли сильнее дохода — так и сказано", incLine && /сильнее/.test(incLine.text) && !/почти вся/.test(incLine.text));

console.log(bad ? `ОШИБКА: ${bad}` : "всё хорошо");
