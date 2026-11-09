// Тест разбора выписки Приорбанка на ВЫДУМАННЫХ данных (имена, IBAN и суммы тестовые).
// Запуск из папки проекта:  node tests/test_prior.js

const PR = require("../prior.js");
const Banks = require("../banks.js");
const Cat = require("../categories.js");

let failed = 0;
const check = (name, ok) => { if (!ok) failed++; console.log((ok ? "OK    " : "FAIL  ") + name); };
const it = (vx, vy, text) => ({ vx, vy, text });

// Строка операции: дата и время одним фрагментом или двумя, колонки как в настоящей выписке
function row(y, o) {
  const items = [];
  if (o.split) { items.push(it(56.6, y, o.dt.split(" ")[0]), it(104.3, y, o.dt.split(" ")[1])); } else items.push(it(56.6, y, o.dt));
  (o.op || []).forEach((t, i) => items.push(it(154.2, y + i * 11.5, t)));
  items.push(it(452, y, o.amt), it(515.7, y, o.cur || "BYN"), it(572.5, y, o.post), it(636.3, y, o.comm || "0.00"), it(700.1, y, o.turn));
  return items;
}
const HEAD = [it(284, 237, "Транзакции"), it(615, 237, "Операции по счету"), it(64, 249, "Дата транзакции"), it(276, 249, "Операция"), it(464, 249, "Сумма")];
const FOOT = y => [it(56.6, y, "https://www.prior.by/web/Cabinet/BankCards/"), it(716.5, y, "07.11.2026 15:08:23")];

// Всего: приход 1000.50 + 5.00 + (20.00 USD → 62.00 BYN не приход), расход: 40.00-0.80(MB) + 62.00 + 15.00 + 8.50
const p1 = [
  it(56.6, 85, "Выписка по контракту"), it(163.9, 85, "Период выписки"), it(245, 85, "01.10.2026 - 31.10.2026"),
  it(56.6, 120, "ФИО"), it(91.8, 120, "Тестов Тест"), it(56.6, 131, "Адрес"), it(93, 131, "Тестовый адрес 1"),
  it(56.6, 166, "Валюта"), it(91.5, 166, "счета"), it(114, 166, ":"), it(119.5, 166, "BYN"),
  it(273.3, 166, "Начальный"), it(323.8, 166, "баланс"), it(352.5, 166, ":"), it(357.8, 166, "100.00"),
  it(56.6, 226, "Операции по"), it(118, 226, "........0001"), ...HEAD,
  ...row(273.3, { dt: "20.10.2026 10:00:00", op: ["Зачисление денежных средств", "Онлайн пополнение счета IBAN:", "BY00TEST00000000000000000000"].slice(0, 1), amt: "5.00", post: "20.10.2026", turn: "5.00" }),
];
// продолжение названия (IBAN) на второй строке
p1.push(it(291.3, 273.3, "Онлайн пополнение счета IBAN:"), it(154.2, 284.8, "BY00TEST00000000000000000000"));
p1.push(...row(308, { dt: "21.10.2026 00:00:00", op: ["Поступление на контракт клиента 123456-12345-123456"], amt: "1 000.50", post: "21.10.2026", turn: "1 000.50" }));
p1.push(...row(331, { dt: "22.10.2026 12:00:00", op: ["Retail BLR MINSK SHOP", '"EVROOPT"'], amt: "-40.00", post: "23.10.2026", comm: "0.80", turn: "-39.20" }));
p1.push(...FOOT(546));
const p2 = [
  ...row(74.4, { dt: "23.10.2026 18:36:09", split: true, op: ["Retail HKG Hong Kong OTO*Telegram"], amt: "-20.00", cur: "USD", post: "26.10.2026", turn: "-62.00" }),
  ...row(97.9, { dt: "24.10.2026 09:00:00", op: ["ATM BLR MINSK VBBY"], amt: "-15.00", post: "24.10.2026", turn: "-15.00" }),
  ...row(109.4, { dt: "25.10.2026 09:00:00", op: ["Retail BLR MINSK PT KOFEJNYA N 4B"], amt: "-8.50", post: "26.10.2026", turn: "-8.50" }),
  ...row(120.9, { dt: "26.10.2026 00:00:00", op: ["Retail BLR MINSK Nulevaya"], amt: "0.00", post: "26.10.2026", turn: "0.00" }),
  ...FOOT(546),
  // дальше таблица заблокированных сумм: в итоги не входит
  it(56.6, 200, "Заблокированные суммы по"), it(160, 200, "........0001"),
  ...row(230, { dt: "27.10.2026 10:00:00", op: ["Retail BLR MINSK HOLD"], amt: "99.00", post: "", turn: "99.00" }),
];
// «Всего» вставляем на вторую страницу, до заблокированных сумм
p2.push(it(56.6, 160, "Всего в данной валюте"), it(250, 160, "Зачислено"), it(350, 160, "Списано"), it(450, 160, "Комиссия/Money-back"), it(600, 160, "Конечный баланс"),
  it(250, 172, "1 005.50"), it(350, 172, "125.50"), it(450, 172, "0.80"), it(600, 172, "980.80"));
const pages = [p1, p2];

check("банк определяется", PR.detect(pages) && Banks.detect(pages) && Banks.detect(pages).id === "prior");
check("чужие выписки не определяются как Приорбанк", !PR.detect([[it(10, 10, "Транзакции по счету Период выписки")]]) && !PR.detect([]));
const res = Banks.parse(pages);
const t = res.txs;
check("шапка: период, валюта, остаток, итоги", res.header.from === "2026-10-01" && res.header.to === "2026-10-31" && res.header.currency === "BYN" && res.header.opening === 100 && res.header.income === 1005.5 && res.header.closing === 980.8);
check("расход в итогах считается за вычетом Money-back: 125.50 − 0.80 = 124.70", res.header.expense === 124.7);
check("ФИО, адрес, IBAN и номер контракта нигде не сохранены", !JSON.stringify(res).match(/Тестов|Тестовый адрес|BY00TEST|123456-12345/));
check("операций 6: нулевая пропущена, заблокированные суммы не читаются", t.length === 6 && !t.some(x => /HOLD/.test(x.details)));
check("сумма берётся из «Обороты по счету» (за вычетом Money-back)", t[2].amount === -39.2);
check("числа с пробелом тысяч", t[1].amount === 1000.5);
check("валютная операция: сумма в BYN, исходная в описании", t[3].amount === -62 && t[3].origAmount === 20 && /20\.00 USD/.test(t[3].details));
check("дата и время двумя фрагментами читаются", t[3].date === "2026-10-23" && t[3].time === "18:36:09");
check("колонтитул страницы не попадает в названия", !t.some(x => /prior\.by/.test(x.details)));
check("снятие наличных получает метку «Выдача наличных»", /^Выдача наличных/.test(t[4].details) && Cat.categorize(t[4]) === "Наличные");
const v = PR.validate(t, res.header);
check("сверка итогов с шапкой сходится", v.ok === true);
check("при потере операции сверка не сходится", PR.validate(t.slice(1), res.header).ok === false);
check("баланс сходится: 100 + операции = конечный", Math.round((100 + t.reduce((a, x) => a + x.amount, 0)) * 100) / 100 === 980.8);
check("кофейня без MCC определяется по названию", Cat.categorize(t[5]) === "Кафе и рестораны");
check("«Mobile bank» и P2P без получателя попадают в корзины («интернет-банк» и «Переводы на карты и счета»), а не в «Не разобрано»",
  Cat.bucket({ amount: -20, details: "Retail BLR MINSK MOBILE BANK" }) === "Платежи через интернет-банк" && Cat.bucket({ amount: -5, details: "CH Debit BLR MINSK P2P_SDBO" }) === "Переводы на карты и счета");

console.log(failed ? `\nПровалено проверок: ${failed}` : "\nВсе проверки пройдены.");
process.exit(failed ? 1 : 0);
