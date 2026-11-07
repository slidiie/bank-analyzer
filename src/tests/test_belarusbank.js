// Тест разбора выписки Беларусбанка на ВЫДУМАННЫХ данных (имена, номера и суммы тестовые).
// Запуск из папки проекта:  node tests/test_belarusbank.js

const BB = require("../belarusbank.js");
const Banks = require("../banks.js");
const Cat = require("../categories.js");

let failed = 0;
const check = (name, ok) => { if (!ok) failed++; console.log((ok ? "OK    " : "FAIL  ") + name); };

const it = (vx, vy, text) => ({ vx, vy, text });
const HEAD = (y) => [it(149, y, "Дата"), it(144, y + 8, "и время"), it(319, y + 8, "Место"), it(366, y + 8, "Валюта"), it(399, y + 12, "Приход/"), it(23, y + 16, "Номер карты"), it(192, y + 16, "Наименование операции"), it(565, y + 16, "МСС")];

// Операция: опорная строка (валюта) на высоте y; строки названия и места стоят выше и ниже, как в настоящем файле
function op(y, o) {
  const items = [
    it(90, y - 4, o.date), it(100, y + 4, o.time), it(138, y - 4, o.reg), it(148, y + 4, o.regTime || "17:00"),
    it(372, y, o.opCur || "BYN"), it(400, y, o.dir),
    it(o.opAmt.length > 6 ? 436 : 444, y, o.opAmt), it(o.acc.length > 6 ? 478 : 487, y, o.acc), it(o.bal.length > 6 ? 522 : 531, y, o.bal),
  ];
  if (o.mcc) items.push(it(565, y, o.mcc));
  if (o.card !== false) items.push(it(12, y, "4000 00** **** 0000"));
  (o.name || []).forEach((t, i) => items.push(it(181, y - 4 + i * 8, t)));
  (o.place || []).forEach((t, i) => items.push(it(305, y - 4 - 4 * (o.place.length - 2) + i * 8, t)));
  return items;
}

const ops1 = [
  { date: "01.03.2026", time: "10:00", reg: "02.03.2026", dir: "Приход", opAmt: "1500.00", acc: "1500.00", bal: "1500.00", mcc: "6011", name: ["Пополнение наличными (cash", "in)"], place: ["INFOKIOSK", "CASH IN/", "BLR MINSK"] },
  { date: "02.03.2026", time: "11:15", reg: "03.03.2026", dir: "Расход", opAmt: "40.50", acc: "40.50", bal: "1459.50", mcc: "5411", name: ["Оплата товаров и услуг"], place: ['SHOP "EVROOPT"/', "BLR MINSK"] },
  { date: "03.03.2026", time: "09:00", reg: "04.03.2026", opCur: "USD", dir: "Расход", opAmt: "1.99", acc: "6.77", bal: "1452.73", mcc: "7372", name: ["Оплата товаров и услуг"], place: ["GOOGLE", "*Google One/ US"] },
  { date: "04.03.2026", time: "12:00", reg: "05.03.2026", dir: "Расход", opAmt: "45.00", acc: "0.68", bal: "1452.05", mcc: "6012", name: ["Плата за перевод средств с", "КС на КС"], place: ["PEREVOD/ BLR", "MINSK"] },
  { date: "05.03.2026", time: "13:00", reg: "06.03.2026", dir: "Расход", opAmt: "1234.56", acc: "1234.56", bal: "217.49", mcc: "5999", name: ["Оплата товаров и услуг"], place: ["SHOP", '"TEST"/ BLR', "MINSK", "CENTER"] },
];
const ops2 = [
  { date: "06.03.2026", time: "08:00", reg: "06.03.2026", dir: "Приход", opAmt: "0.00", acc: "0.53", bal: "218.02", card: false, mcc: "", name: ["Начисление Cash-back", '(Программа "Бонус")'], place: [] },
  { date: "06.03.2026", time: "09:00", reg: "06.03.2026", dir: "Приход", opAmt: "0.00", acc: "0.00", bal: "218.02", card: false, mcc: "", name: ["Капитализация (%%"], place: [] },
  { date: "07.03.2026", time: "10:00", reg: "08.03.2026", dir: "Расход", opAmt: "18.02", acc: "18.02", bal: "200.00", mcc: "5812", name: ["Оплата товаров и услуг"], place: ["BUFET", "N 34/ BLR"] },
];
const inc = 1500 + 0.53, exp = 40.5 + 6.77 + 0.68 + 1234.56 + 18.02;

function build() {
  const p1 = [
    it(12, 20, "Выписка по счету"), it(12, 34, "за период 01.03.2026 - 31.03.2026"),
    it(12, 80, "Регистрационный номер приложения:"), it(242, 80, "0000000"),
    it(12, 150, "ФИО владельца счета:"), it(242, 150, "Тестов Тест Тестович"),
    it(12, 164, "IBAN:"), it(242, 164, "BY00TEST00000000000000000000"),
    it(12, 178, "Валюта счета:"), it(242, 178, "BYN"),
    it(12, 192, "Лимит овердрафта:"), it(242, 192, "0.00"),
    it(12, 280, "Остаток на начало периода:"), it(242, 280, "0.00"),
    it(12, 294, "Остаток на конец периода:"), it(242, 294, "200.00"),
    it(12, 308, "Зачислено за период:"), it(242, 308, inc.toFixed(2)),
    it(12, 322, "Сумма расходных операций за период:"), it(242, 322, exp.toFixed(2)),
    ...HEAD(380),
  ];
  let y = 431;
  for (const o of ops1) { p1.push(...op(y, o)); y += 31; }
  const p2 = [...HEAD(40)];
  y = 91;
  for (const o of ops2) { p2.push(...op(y, o)); y += 31; }
  return [p1, p2];
}

const pages = build();
check("банк определяется", BB.detect(pages) && Banks.detect(pages) && Banks.detect(pages).id === "belarusbank");
check("чужие выписки не определяются как Беларусбанк", !BB.detect([[it(10, 10, "Транзакции по счету")]]) && !BB.detect([]));

const res = Banks.parse(pages);
const t = res.txs;
check("шапка: период, валюта, итоги", res.header.from === "2026-03-01" && res.header.to === "2026-03-31" && res.header.currency === "BYN" && res.header.income === +inc.toFixed(2) && res.header.expense === +exp.toFixed(2));
check("ФИО, IBAN и телефон нигде не сохранены", !JSON.stringify(res).match(/Тестов|BY00TEST|0000000/));
check("операций 7 (капитализация с нулевой суммой пропущена)", t.length === 7 && res.header.zeroSkipped === 1);
check("знак по «Приход/Расход»", t[0].amount === 1500 && t[1].amount === -40.5);
check("валютная операция: сумма в валюте счёта 6.77, исходная 1.99 USD в описании", t[2].amount === -6.77 && /1\.99 USD/.test(t[2].details) && t[2].origAmount === 1.99);
check("плата за перевод: берётся сумма в валюте счёта 0.68, а не 45.00", t[3].amount === -0.68);
check("широкие числа (1234.56) попадают в свои колонки", t[4].amount === -1234.56 && t[4].balance === 217.49);
check("многострочное название и место склеены в порядке строк", t[1].purpose === "Оплата товаров и услуг" && /EVROOPT/.test(t[1].place) && /MINSK/.test(t[1].place) && t[4].place === 'SHOP "TEST"/ BLR MINSK CENTER');
check("MCC и даты", t[1].mcc === "5411" && t[1].date === "2026-03-02" && t[1].regDate === "2026-03-03" && t[1].time === "11:15");
check("операция без карты и MCC (кэшбэк) разобрана", t[5].amount === 0.53 && t[5].mcc === null && t[5].card === null);
check("вторая страница разобрана, шапка таблицы на ней не мешает", t[6].amount === -18.02 && t[6].mcc === "5812");
const v = BB.validate(t, res.header);
check("сверка итогов с шапкой сходится", v.ok === true && v.incomeOk && v.expenseOk);
const broken = BB.validate(t.slice(1), res.header);
check("при потере операции сверка не сходится", broken.ok === false);

// Категории
check("«Плата за перевод» это комиссия банка", Cat.categorize(t[3]) === Cat.FEES);
check("Google One по названию это подписка", Cat.categorize(t[2]) === "Связь и подписки");
check("ЕРИП с MCC 4900 не считается «коммунальными» сам по себе",
  Cat.categorize({ details: "Оплата товаров и услуг · ERIP/ BLR MINSK", mcc: "4900", amount: -10 }) === null &&
  Cat.categorize({ details: "Оплата электроэнергии", mcc: "4900", amount: -10 }) === "Аренда и жильё");

console.log(failed ? `\nПровалено проверок: ${failed}` : "\nВсе проверки пройдены.");
process.exit(failed ? 1 : 0);
