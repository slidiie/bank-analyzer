// Тест разбора выписки Белинвестбанка («Список платежей») на ВЫДУМАННЫХ данных (имена, номера и суммы тестовые).
// Запуск из папки проекта:  node tests/test_belinvest.js

const BI = require("../belinvest.js");
const Banks = require("../banks.js");
const Cat = require("../categories.js");

let failed = 0;
const check = (name, ok) => { if (!ok) failed++; console.log((ok ? "OK    " : "FAIL  ") + name); };

const it = (vx, vy, text) => ({ vx, vy, text });
const L = 14.17;
const HEAD = [
  it(252, 37, "Список платежей"),
  it(159, 58, "Операции по карточке 4000 00** **** 0000 за период с 01.03.2026 по 31.03.2026"),
  it(263, 70, "Тестов Тест"),
  it(31, 125, "Доступная сумма: 200.00"), it(136, 125, "Заблокировано: 0.00"), it(229, 125, "Кредитный лимит: 0"),
  it(31, 134, "Неснижаемый остаток: 0,00"), it(31, 151, "Валюта счета: BYN"),
  it(31, 170, "Дата"), it(71, 170, "Дата"), it(111, 170, "№ Карточки"), it(153, 170, "Код"), it(201, 170, "Тип операции"),
  it(263, 170, "MCC"), it(286, 170, "Место"), it(343, 170, "Сумма в"), it(386, 170, "Сумма и"), it(449, 170, "Остаток"),
  it(494, 170, "Статус"), it(536, 170, "Номер"), it(529, 184, "операции в"), it(538, 198, "ЕРИП"),
];

// Операция: первая строка (даты, суммы, статус), ниже время и продолжение типа и места
function op(y, o) {
  const cur = o.cur || "BYN";
  const items = [
    it(31, y, o.date), it(71, y, o.reg || o.date), it(115, y, "**** 0000"), it(153, y, o.auth || "123456"),
    it(201, y, o.type[0]), it(263, y, o.mcc),
    it(354 - (o.op.length - 4) * 3, y, o.op + " " + cur), it(397 - (o.acc.length - 9) * 3, y, o.acc + " BYN"),
    it(452, y, o.bal + " BYN"), it(487, y, o.status || "ПРОВЕДЕНО"),
    it(31, y + L, o.time),
  ];
  o.type.slice(1).forEach((t, i) => items.push(it(201, y + L * (i + 1), t)));
  o.place.forEach((t, i) => items.push(it(286, y + L * i, t)));
  if (o.erip) items.push(it(530, y, o.erip));
  return items;
}

// Свежие сверху, как в настоящей выписке
const ops1 = [
  { date: "2026-03-20", time: "18:00:01", mcc: "5411", type: ["Покупка"], place: ["SHOP TEST", "MINSK"], op: "-12.30", acc: "-12.30/0.00", bal: "200.00" },
  { date: "2026-03-18", time: "09:10:00", mcc: "6012", type: ["Перевод средств", "Credit"], place: ["PERSON TO", "PERSON MINSK"], op: "100.00", acc: "100.00/0.00", bal: "212.30" },
  { date: "2026-03-15", time: "12:00:00", mcc: "5735", type: ["Покупка"], place: ["MUSIC SERVICE"], op: "-4.99", cur: "USD", acc: "-15.10/0.00", bal: "112.30" },
  { date: "2026-03-10", time: "08:45:07", mcc: "4111", type: ["Покупка"], place: ["TRANSPORT", "PAYBYCARD.BY g", "MINSK"], op: "-1.15", acc: "-1.15/0.00", bal: "127.40" },
];
const ops2 = [
  { date: "2026-03-05", time: "15:30:00", mcc: "4900", type: ["Оплата услуг"], place: ["ERIP TEST"], op: "-20.00", acc: "-20.00/0.50", bal: "128.55", erip: "999000111" },
  { date: "2026-03-02", time: "10:00:00", mcc: "5814", type: ["Покупка"], place: ["CAFE TEST", "MINSK"], op: "-1 001.45", acc: "-1 001.45/0.00", bal: "149.05" },
];
const inc = 100, exp = 12.30 + 15.10 + 1.15 + 20.50 + 1001.45;
const page1 = [...HEAD, ...ops1.flatMap((o, k) => op(241 + k * 42.5, o)), it(545, 815, "Стр. 1")];
const page2 = [...ops2.flatMap((o, k) => op(37 + k * 42.5, o)),
  it(31, 440, "Приход: 100.00 BYN"), it(493, 442, "ОАО \"Белинвестбанк\""), it(31, 448, "Расход: 1 050.50 BYN"), it(31, 457, "Доля безналичного оборота: 100%"),
  it(507, 456, "31.03.2026"), it(545, 815, "Стр. 2")];
const pages = [page1, page2];

check("банк определяется", BI.detect(pages) && Banks.detect(pages) && Banks.detect(pages).id === "belinvest");
const res = Banks.parse(pages);
const h = res.header, txs = res.txs;
check("найдено 6 операций, битых нет", txs.length === 6 && h.broken === 0);
check("период из шапки", h.from === "2026-03-01" && h.to === "2026-03-31" && !h.periodGuessed);
check("валюта счёта", h.currency === "BYN");
check("итоги из-под таблицы", h.income === 100 && h.expense === 1050.5);
const v = BI.validate(txs, h);
check("сверка прихода и расхода до копейки", v.ok && Math.round(v.income * 100) === Math.round(inc * 100) && Math.round(v.expense * 100) === Math.round(exp * 100));
check("остатки на начало и конец", h.closing === 200 && h.opening === 1150.5);
const t0 = txs[0];
check("первая операция: дата, время, MCC, место", t0.date === "2026-03-20" && t0.time === "18:00" && t0.mcc === "5411" && t0.place === "SHOP TEST MINSK" && t0.amount === -12.3);
check("перевод: тип из двух строк, знак плюс", txs[1].type === "Перевод средств Credit" && txs[1].amount === 100);
check("валютная операция: сумма в валюте счёта и исходная", txs[2].amount === -15.1 && txs[2].origAmount === -4.99 && txs[2].origCurrency === "USD" && /USD/.test(txs[2].details));
check("место из трёх строк", txs[3].place === "TRANSPORT PAYBYCARD.BY g MINSK");
check("комиссия добавляется к расходу", txs[4].amount === -20.5 && txs[4].fee === 0.5 && txs[4].erip === "999000111");
check("сумма с пробелом в тысячах", txs[5].amount === -1001.45);
check("итоги и номер страницы не попали в операции", !txs.some(t => /Приход|Расход|Стр\./.test(t.details)));
check("ФИО и номер карточки из шапки не читаются", !JSON.stringify(h).includes("Тестов") && !txs.some(t => /Тестов/.test(t.details)));
check("категории по MCC", Cat.categorize(t0) === "Продукты" && Cat.categorize(txs[3]) === "Транспорт");

// Статус не «проведено» помечается, период без шапки берётся по датам
const p3 = JSON.parse(JSON.stringify(pages));
p3[0] = p3[0].filter(i => !/за период/.test(i.text)).map(i => i.text === "ПРОВЕДЕНО" && i.vy === 241 ? { ...i, text: "В ОБРАБОТКЕ" } : i);
const r3 = Banks.parse(p3);
check("без периода в шапке: период по датам операций", r3.header.from === "2026-03-02" && r3.header.to === "2026-03-20" && r3.header.periodGuessed);
check("статус «в обработке» помечен", r3.txs[0].pending === true && r3.txs[0].status === "В ОБРАБОТКЕ");

// Чужие выписки не перехватываются: без «Список платежей» и «Доступная сумма» банк не определяется
check("без признаков не определяется", !BI.detect([[it(31, 125, "Доступная сумма: 1.00")]]) && !BI.detect([]));

console.log(failed ? `\nОШИБКА: не прошло проверок: ${failed}` : "\nВсе проверки пройдены.");
process.exit(failed ? 1 : 0);
