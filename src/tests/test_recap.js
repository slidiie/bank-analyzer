// Тест «Итога месяца» на выдуманных данных.
// Запуск из папки проекта:  node tests/test_recap.js

const R = require("../recap.js");
let failed = 0;
const check = (n, ok) => { console.log((ok ? "OK    " : "FAIL  ") + n); if (!ok) failed++; };

const t = (date, amount, cat, name) => ({ date, amount, cat, name: name || cat });
// Обычный месяц: продукты 400, кафе 100, транспорт 50
function usualMonth(ym) {
  const out = [];
  for (let i = 1; i <= 10; i++) out.push(t(`${ym}-${String(i * 2).padStart(2, "0")}`, -40, "Продукты", "МАГАЗИН"));
  out.push(t(`${ym}-05`, -50, "Кафе и рестораны", "КАФЕ"), t(`${ym}-15`, -50, "Кафе и рестораны", "КАФЕ"));
  out.push(t(`${ym}-10`, -50, "Транспорт", "ТАКСИ"));
  out.push(t(`${ym}-07`, -700, "Аренда и жильё", "АРЕНДА"));
  return out;
}
const base = { unsorted: ["Не разобрано", "Платежи ЕРИП"], fixed: ["Аренда и жильё", "Здоровье"], subsCats: ["Связь и подписки"] };

// 1. Три полных месяца, в октябре кафе выросло в 3 раза, аренда тоже выросла (её не предлагаем «вернуть»)
{
  const items = [...usualMonth("2026-08"), ...usualMonth("2026-09"), ...usualMonth("2026-10").filter(x => x.cat !== "Кафе и рестораны" && x.cat !== "Аренда и жильё"),
    t("2026-10-03", -150, "Кафе и рестораны", "КАФЕ"), t("2026-10-20", -150, "Кафе и рестораны", "КАФЕ"), t("2026-10-07", -1000, "Аренда и жильё", "АРЕНДА")];
  const r = R.monthRecap(Object.assign({ items, fullMonths: ["2026-08", "2026-09", "2026-10"] }, base));
  const kinds = r.lines.map(l => l.kind);
  check("итог за последний полный месяц", r.month === "2026-10" && r.title === "Итог октября");
  check("первая строка: всего и к обычному", kinds[0] === "total" && /больше обычного/.test(r.lines[0].text));
  const cafe = r.lines.find(l => l.kind === "grew" && l.cat === "Кафе и рестораны");
  check("кафе: в 3 раза больше обычного", cafe && /в 3 раза больше обычного/.test(cafe.text) && /300 BYN/.test(cafe.text));
  check("выросшая аренда тоже названа", r.lines.some(l => l.kind === "grew" && l.cat === "Аренда и жильё"));
  const save = r.lines.find(l => l.kind === "save");
  check("«можно сохранить» только по гибким тратам (кафе +200, без аренды)", save && r.save === 200 && /«Кафе и рестораны»/.test(save.text) && !/Аренда/.test(save.text));
  check("всё разобрано: оговорки нет", r.note === "");
  check("от 3 до 5 строк", r.lines.length >= 3 && r.lines.length <= 5);
}

// 2. Неполный последний месяц не подводится: берём последний полный
{
  const items = [...usualMonth("2026-08"), ...usualMonth("2026-09"), t("2026-10-02", -500, "Кафе и рестораны")];
  const r = R.monthRecap(Object.assign({ items, fullMonths: ["2026-08", "2026-09"] }, base));
  check("неполный октябрь пропущен: итог сентября", r.month === "2026-09" && r.title === "Итог сентября");
  check("сравнение с одним месяцем: «чем в августе»", /почти как обычно|чем в августе/.test(r.lines[0].text));
  check("октябрьские 500 в кафе не попали в итог", !r.lines.some(l => /500/.test(l.text)));
}

// 3. Полных месяцев нет (выписка с 10 по 9 число): итог за дни без сравнений
{
  const items = [];
  for (let d = 10; d <= 31; d++) items.push(t(`2026-10-${d}`, -20, "Продукты", "МАГАЗИН"));
  for (let d = 1; d <= 9; d++) items.push(t(`2026-11-0${d}`, -20, "Продукты", "МАГАЗИН"));
  const r = R.monthRecap(Object.assign({ items, fullMonths: [], period: { from: "2026-10-10", to: "2026-11-09" } }, base));
  check("без полного месяца: итог за 31 день", r && r.month === null && r.days === 31 && r.title === "Итог за 31 день");
  check("без полного месяца нет «больше обычного»", !r.lines.some(l => /обычного|чем в/.test(l.text)) && !r.lines.some(l => l.kind === "save"));
  check("запасные выводы: главная категория и частое место", r.lines.some(l => l.kind === "top") && r.lines.some(l => l.kind === "often" && /31 раз/.test(l.text)));
}

// 4. Часть трат не разобрана: честная оговорка, неразобранное не попадает в «выросло»
{
  const items = [...usualMonth("2026-09"), ...usualMonth("2026-10"), t("2026-10-11", -600, "Платежи ЕРИП", "ЕРИП"), t("2026-10-12", -400, "Не разобрано", "?")];
  const r = R.monthRecap(Object.assign({ items, fullMonths: ["2026-09", "2026-10"] }, base));
  check("оговорка «по разобранным N %»", /по разобранным 5[56]%/.test(r.note));
  check("неразобранное не называется выросшей категорией", !r.lines.some(l => l.kind === "grew" && /ЕРИП|Не разобрано/.test(l.cat)));
}

// 5. Мелкие покупки и подписки
{
  const items = [...usualMonth("2026-09"), ...usualMonth("2026-10")];
  for (let i = 0; i < 30; i++) items.push(t(`2026-10-${String(1 + (i % 28)).padStart(2, "0")}`, -4.5, "Кафе и рестораны", "КОФЕ"));
  for (let i = 0; i < 30; i++) items.push(t(`2026-09-${String(1 + (i % 28)).padStart(2, "0")}`, -4.5, "Кафе и рестораны", "КОФЕ"));
  const regular = [{ name: "VIDEO", cat: "Связь и подписки", perMonth: 15 }, { name: "A1", cat: "Связь и подписки", perMonth: 30 }, { name: "АРЕНДА", cat: "Аренда и жильё", perMonth: 700 }];
  const r = R.monthRecap(Object.assign({ items, fullMonths: ["2026-09", "2026-10"], regular }, base));
  const small = r.lines.find(l => l.kind === "small"), subs = r.lines.find(l => l.kind === "subs");
  check("мелкие покупки: 30 штук на 135 BYN", small && /30 штук на 135 BYN/.test(small.text));
  check("подписки: 45 в месяц, 540 в год, аренда не подписка", subs && /45 BYN в месяц, это 540 BYN в год \(2 платежа\)/.test(subs.text));
}

// 6. Возврат уменьшает трату своей категории; пустые данные не падают
{
  const items = [...usualMonth("2026-09"), ...usualMonth("2026-10"), t("2026-10-20", -300, "Одежда и покупки", "SHOP"), t("2026-10-25", 300, "Одежда и покупки", "SHOP")];
  const r = R.monthRecap(Object.assign({ items, fullMonths: ["2026-09", "2026-10"] }, base));
  check("покупка с возвратом не считается новой тратой", !r.lines.some(l => /Одежда/.test(l.text)));
  check("пустой вход: null", R.monthRecap({}) === null && R.monthRecap({ items: [] }) === null && R.monthRecap(null) === null);
  check("только поступления: null", R.monthRecap({ items: [t("2026-10-01", 100, "Продукты")], fullMonths: ["2026-10"] }) === null);
}

// 6б. Уменьшившаяся категория и запасной вывод без жилья
{
  const items = [...usualMonth("2026-09"), ...usualMonth("2026-10").filter(x => x.cat !== "Кафе и рестораны"), t("2026-10-05", -20, "Кафе и рестораны", "КАФЕ")];
  const r = R.monthRecap(Object.assign({ items, fullMonths: ["2026-09", "2026-10"] }, base));
  const fell = r.lines.find(l => l.kind === "fell");
  check("кафе 20 вместо 100: «на 80% меньше, чем в сентябре»", fell && fell.cat === "Кафе и рестораны" && /на 80% меньше, чем в сентябре/.test(fell.text));
  const top = r.lines.find(l => l.kind === "top");
  check("главная категория — не аренда, а продукты", !top || top.cat === "Продукты");
}

// 6в. Категория пропала совсем (0 BYN): не называем, это скорее другая карта, чем перемена привычек
{
  const items = [...usualMonth("2026-09"), ...usualMonth("2026-10").filter(x => x.cat !== "Кафе и рестораны")];
  const r = R.monthRecap(Object.assign({ items, fullMonths: ["2026-09", "2026-10"] }, base));
  check("нулевая категория не попадает в «меньше»", !r.lines.some(l => l.kind === "fell"));
}
// 6г. Больше двух выросших категорий: «X, Y и ещё N категории»
{
  const items = [...usualMonth("2026-09"), ...usualMonth("2026-10"), t("2026-10-03", -200, "Продукты"), t("2026-10-04", -100, "Кафе и рестораны"), t("2026-10-05", -60, "Транспорт"),
    t("2026-09-06", -40, "Развлечения"), t("2026-10-06", -100, "Развлечения")];
  const r = R.monthRecap(Object.assign({ items, fullMonths: ["2026-09", "2026-10"] }, base));
  const save = r.lines.find(l => l.kind === "save");
  check("«и ещё 2 категории»", save && /«Продукты», «Кафе и рестораны» и ещё 2 категории/.test(save.text));
}
// 6б. Доход вырос: уходит ли прибавка в траты
{
  const inc = (ym, a) => ({ date: `${ym}-01`, amount: a });
  const run = (extra, octIncome, incomeAug) => {
    const items = [...usualMonth("2026-08"), ...usualMonth("2026-09"), ...usualMonth("2026-10"), ...(extra ? [t("2026-10-12", -extra, "Одежда", "МАГАЗИН")] : [])];
    return R.monthRecap(Object.assign({ items, income: [inc("2026-08", incomeAug || 2000), inc("2026-09", incomeAug || 2000), inc("2026-10", octIncome)], fullMonths: ["2026-08", "2026-09", "2026-10"] }, base));
  };
  let l = run(500, 2600).lines.find(x => x.kind === "income");
  check("доход +30 %, траты +500 из 600: «на расходы ушло 83% прибавки»", l && /Доход вырос на 30% \(\+600 BYN\)/.test(l.text) && /траты выросли на 40% \(\+500 BYN\)/.test(l.text) && /ушло 83% прибавки/.test(l.text));
  l = run(580, 2600).lines.find(x => x.kind === "income");
  check("почти вся прибавка ушла в расходы", l && /почти вся прибавка ушла в расходы/.test(l.text));
  l = run(0, 2600).lines.find(x => x.kind === "income");
  check("траты те же: вся прибавка осталась", l && /траты почти не изменились: вся прибавка осталась/.test(l.text));
  check("доход не изменился: вывода нет", !run(500, 2000).lines.some(x => x.kind === "income"));
  check("доход вырос меньше чем на 10 %: вывода нет", !run(500, 2100).lines.some(x => x.kind === "income"));
  check("обычный доход меньше 100 BYN: вывода нет", !run(500, 400, 50).lines.some(x => x.kind === "income"));
  check("после «Всего» идёт доля дохода, потом вывод про прибавку", (() => { const k = run(500, 2600).lines.map(q => q.kind); return k[1] === "rate" && k[2] === "income"; })());
  // доля не потрачено: доход 2600, траты 1250+500=1750, осталось 850 = 33 %; обычно (2000-1250)/2000 = 38 %
  l = run(500, 2600).lines.find(q => q.kind === "rate");
  check("не потрачено 33% дохода (850 BYN), обычно 38%", l && /Не потрачено 33% дохода \(850 BYN\); обычно 38%/.test(l.text));
  l = run(1800, 2000).lines.find(q => q.kind === "rate");
  check("траты больше дохода: «на N% больше, чем пришло»", l && /Потрачено на 53% больше, чем пришло: 1\s050 BYN сверх дохода/.test(l.text));
  check("без дохода строки доли нет", !R.monthRecap(Object.assign({ items: [...usualMonth("2026-09"), ...usualMonth("2026-10")], fullMonths: ["2026-09", "2026-10"] }, base)).lines.some(q => q.kind === "rate"));
  check("без списка доходов вывода нет", !R.monthRecap(Object.assign({ items: [...usualMonth("2026-09"), ...usualMonth("2026-10")], fullMonths: ["2026-09", "2026-10"] }, base)).lines.some(x => x.kind === "income"));
}
// 6б. Короткий текст для картинки «Поделиться»: без сумм в BYN (кроме порога «до 10 BYN»), у каждой строки с цифрами есть short
{
  const oct = usualMonth("2026-10").concat([t("2026-10-20", -250, "Кафе и рестораны", "КАФЕ")]);
  const r = R.monthRecap(Object.assign({ items: [...usualMonth("2026-07"), ...usualMonth("2026-08"), ...usualMonth("2026-09"), ...oct], fullMonths: ["2026-07", "2026-08", "2026-09", "2026-10"] }, base));
  const withShort = r.lines.filter(l => l.short);
  check("у строк итога есть короткий текст", withShort.length >= 2);
  check("короткий текст без сумм в BYN", withShort.every(l => !/\d[\d\s,]*\s*BYN/.test(l.short.replace(/до \d+ BYN/g, ""))));
}
// 7. Форматирование
check("числа: тысячи через пробел, без копеек от 100", R.money(1234.56) === "1 235" && R.money(45) === "45" && R.money(9.5) === "9,50");
check("«в N раз»", R.times(2) === "в 2 раза" && R.times(2.4) === "в 2,4 раза" && R.times(3.64) === "в 3,6 раза" && R.times(5.04) === "в 5 раз" && R.times(5.1) === "в 5,1 раза");

// 9. Молчаливые ошибки: месяц почти без трат не должен давать «траты упали на 97%»
{
  const items = [...usualMonth("2026-08"), ...usualMonth("2026-09"), t("2026-10-05", -40, "Продукты", "МАГАЗИН")];
  const r = R.monthRecap(Object.assign({ items, fullMonths: ["2026-08", "2026-09", "2026-10"] }, base));
  check("пустой месяц: нет «меньше обычного»", r && !r.lines.some(l => /меньше/.test(l.text)));
  check("пустой месяц: честная оговорка про почти пустой месяц", r.thin === true && /не сравниваем/.test(r.note));
}
// 10. Зарплата сдвинулась на соседний месяц: «доход вырос» не пишем
{
  const inc = (d, a) => ({ date: d, amount: a });
  const items = [...usualMonth("2026-07"), ...usualMonth("2026-08"), ...usualMonth("2026-09"), ...usualMonth("2026-10")];
  const income = [inc("2026-07-10", 2000), inc("2026-08-10", 2000), inc("2026-10-01", 2000), inc("2026-10-28", 2000)];
  const r = R.monthRecap(Object.assign({ items, income, fullMonths: ["2026-07", "2026-08", "2026-09", "2026-10"] }, base));
  check("сдвиг зарплаты: строки «Доход вырос» нет", r && !r.lines.some(l => l.kind === "income"));
}

// ---- Аудит цифр 12.11 (АУДИТ-цифры.md): каждая проверка падала до исправления ----
// А1. Перерасход: «обычно 15%» после «потрачено на 20% больше» читалось как «обычно на 15% больше»
{
  const items = [], income = [];
  for (const ym of ["2026-08", "2026-09"]) { items.push(t(ym + "-05", -1700, "Продукты")); income.push({ date: ym + "-10", amount: 2000 }); }
  items.push(t("2026-10-05", -2400, "Продукты")); income.push({ date: "2026-10-10", amount: 2000 });
  const r = R.monthRecap(Object.assign({ items, income, fullMonths: ["2026-08", "2026-09", "2026-10"] }, base));
  const rate = r.lines.find(l => l.kind === "rate");
  check("А1 перерасход: обычный уровень назван словами «обычно остаётся 15% дохода»", rate && /на 20% больше, чем пришло/.test(rate.text) && /обычно остаётся 15% дохода/.test(rate.text));
}
// А2. Прошлый месяц почти без трат (отпуск, карта лежала) не должен занижать «обычно»
{
  const items = [t("2026-08-05", -1500, "Продукты"), t("2026-10-05", -1500, "Продукты")];
  const r = R.monthRecap(Object.assign({ items, fullMonths: ["2026-08", "2026-09", "2026-10"] }, base));
  check("А2 пустой сентябрь: октябрь не «на 100% больше обычного»", !r.lines.some(l => /на 100% больше|в 2 раза больше/.test(l.text)) && r.save === 0);
  check("А2 сравнение с единственным нормальным месяцем названо честно", /почти как обычно|чем в августе/.test(r.lines[0].text) && r.compared === 1);
  const items2 = [t("2026-07-05", -1500, "Продукты"), t("2026-08-05", -1500, "Продукты"), t("2026-09-05", -90, "Продукты"), t("2026-10-05", -1500, "Продукты")];
  const r2 = R.monthRecap(Object.assign({ items: items2, fullMonths: ["2026-07", "2026-08", "2026-09", "2026-10"] }, base));
  check("А2 сентябрь с 90 BYN трат в «обычно» не входит: октябрь почти как обычно", /почти как обычно/.test(r2.lines[0].text) && r2.compared === 2);
}
// А3. Две зарплаты в одном месяце (1-го и 31-го): это сдвиг выплаты, а не «доход вырос на 100%»
{
  const items = [], income = [];
  for (const ym of ["2026-07", "2026-08", "2026-09", "2026-10"]) items.push(t(ym + "-05", -1500, "Продукты"));
  for (const ym of ["2026-07", "2026-08", "2026-09"]) income.push({ date: ym + "-01", amount: 2000 });
  income.push({ date: "2026-10-01", amount: 2000 }, { date: "2026-10-31", amount: 2000 });
  const r = R.monthRecap(Object.assign({ items, income, fullMonths: ["2026-07", "2026-08", "2026-09", "2026-10"] }, base));
  check("А3 лишняя выплата в месяце: строки «Доход вырос» нет", !r.lines.some(l => l.kind === "income"));
  const inc2 = [{ date: "2026-09-10", amount: 1000 }, { date: "2026-10-01", amount: 1000 }, { date: "2026-10-10", amount: 1000 }];
  const r2 = R.monthRecap(Object.assign({ items: [t("2026-09-05", -1500, "Продукты"), t("2026-10-05", -1500, "Продукты")], income: inc2, fullMonths: ["2026-09", "2026-10"] }, base));
  check("А3 аванс сентября пришёл 1 октября (два месяца в выписке): строки «Доход вырос» нет", !r2.lines.some(l => l.kind === "income"));
  const inc3 = [{ date: "2026-08-10", amount: 2000 }, { date: "2026-09-10", amount: 2000 }, { date: "2026-10-10", amount: 2600 }];
  const r3 = R.monthRecap(Object.assign({ items: [t("2026-08-05", -1500, "Продукты"), t("2026-09-05", -1500, "Продукты"), t("2026-10-05", -1500, "Продукты")], income: inc3, fullMonths: ["2026-08", "2026-09", "2026-10"] }, base));
  check("А3 настоящая прибавка (та же одна выплата, но больше) названа", r3.lines.some(l => l.kind === "income" && /на 30%/.test(l.text)));
}
// А4. Подписка, отменённая два месяца назад, не входит в «в месяц» и «в год»
{
  const months = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
  const items = []; months.forEach(m => items.push(t(m + "-05", -800, "Продукты")));
  ["2026-06", "2026-07", "2026-08"].forEach(m => items.push(t(m + "-03", -30, "Связь и подписки", "KINO")));
  months.forEach(m => items.push(t(m + "-09", -20, "Связь и подписки", "MOBILE")));
  const regular = require("../planner.js").findRegular(items, months, []);
  const r = R.monthRecap(Object.assign({ items, fullMonths: months, regular }, base));
  const subs = r.lines.find(l => l.kind === "subs");
  check("А4 отменённая подписка (последний платёж в августе) не считается в итоге октября: 20 в месяц, 240 в год", subs && /: 20 BYN в месяц, это 240 BYN в год \(1 платёж\)/.test(subs.text));
}
// А5. «На 100% меньше» при ненулевых тратах: 99,6% не округляем до 100
{
  const items = [t("2026-09-05", -1000, "Продукты"), t("2026-09-06", -1000, "Кафе"), t("2026-10-05", -1000, "Продукты"), t("2026-10-06", -4, "Кафе"), t("2026-10-07", -800, "Одежда")];
  const r = R.monthRecap(Object.assign({ items, fullMonths: ["2026-09", "2026-10"] }, base));
  const fell = r.lines.find(l => l.kind === "fell");
  check("А5 кафе 4 BYN вместо 1000: «на 99% меньше», а не «на 100%»", fell && /4 BYN, на 99% меньше/.test(fell.text));
}

console.log(failed ? `\nОШИБКА: не прошло ${failed}` : "\nВсе проверки прошли");
process.exit(failed ? 1 : 0);
