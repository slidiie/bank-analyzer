const F = require("../filters.js");
let failed = 0;
const check = (n, ok) => { console.log((ok ? "OK    " : "ОШИБКА ") + n); if (!ok) failed++; };

const txs = [
  { date: "2026-10-05", amount: -123.45, details: "Оплата ЕВРООПТ Минск" },
  { date: "2026-10-06", amount: -20, details: "Кафе «Ёлки»" },
  { date: "2026-10-07", amount: 1500, details: "Зарплата октябрь" },
  { date: "2026-10-08", amount: -1500.5, details: "Перевод Иван" },
];
const cats = ["Продукты", "Кафе", "Доход", "Переводы"];
const catOf = t => cats[txs.indexOf(t)];
const ids = f => F.apply(txs, { ...F.empty(), ...f }, catOf).map(t => txs.indexOf(t)).join(",");

check("пустой фильтр: всё на месте", ids({}) === "0,1,2,3" && !F.isActive(F.empty()));
check("apply возвращает копию", F.apply(txs, F.empty(), catOf) !== txs);
check("поиск по описанию без учёта регистра", ids({ query: "евроопт" }) === "0" && ids({ query: "ЗАРПЛАТА" }) === "2");
check("«ё» и «е» равны", ids({ query: "елки" }) === "1" && ids({ query: "ёлки" }) === "1");
check("поиск по категории", ids({ query: "продукты" }) === "0");
check("несколько слов: все должны найтись", ids({ query: "перевод иван" }) === "3" && ids({ query: "перевод евроопт" }) === "");
check("слова в любом порядке", ids({ query: "иван перевод" }) === "3");
check("поиск по сумме с точкой и запятой", ids({ query: "123.45" }) === "0" && ids({ query: "123,45" }) === "0");
check("поиск по целой сумме", ids({ query: "1500" }) === "2,3");
check("поиск по дате: ISO и привычный вид", ids({ query: "2026-10-06" }) === "1" && ids({ query: "07.10.2026" }) === "2");
check("только расходы / только поступления", ids({ kind: "expense" }) === "0,1,3" && ids({ kind: "income" }) === "2");
check("сумма от", ids({ min: "100" }) === "0,2,3");
check("сумма до", ids({ max: "100" }) === "1");
check("сумма от и до, границы включены", ids({ min: "20", max: "123,45" }) === "0,1");
check("сумма берётся по модулю: расход -1500.5 попадает в «от 1500»", ids({ min: "1500" }) === "2,3");
check("мусор в границе игнорируется", ids({ min: "abc" }) === "0,1,2,3" && !F.isActive({ ...F.empty(), min: "abc" }));
check("фильтр по категории", ids({ cat: "Кафе" }) === "1" && ids({ cat: "Нет такой" }) === "");
check("всё вместе", ids({ query: "перевод", kind: "expense", min: "1000", cat: "Переводы" }) === "3");
check("нет совпадений: пусто", ids({ query: "несуществующее" }) === "");
check("parseAmount: пробелы, запятая, знак", F.parseAmount("1 234,5") === 1234.5 && F.parseAmount("-12") === 12 && F.parseAmount("") === null && F.parseAmount("1,2,3") === null && F.parseAmount(null) === null);
check("пробелы в запросе не мешают", ids({ query: "   евроопт   " }) === "0");
check("операция без описания и даты не ломает поиск", F.apply([{ amount: -5 }], { ...F.empty(), query: "5" }, null).length === 1);
process.exit(failed ? 1 : 0);
