// Тест разбора выписки ВТБ на выдуманных данных (настоящих выписок в проекте нет).
// Страница собирается так же, как в реальном PDF: колонки по тем же координатам, строки вплотную,
// дата и время по обе стороны от строки с суммами, текст назначения и места в несколько строк.
// Запуск из папки проекта:  node tests/test_vtb.js

const V = require("../vtb.js");
const T = require("../transfers.js");
const B = require("../banks.js");
const Cat = require("../categories.js");

let failed = 0;
const check = (name, ok) => { if (!ok) failed++; console.log((ok ? "OK    " : "FAIL  ") + name); };
const money = n => n.toFixed(2).replace(".", ",");

const X = { reg: 43, post: 118, card: 193, purpose: 268, place: 393, cur: 493, op: 553, acc: 613, eq: 714, bal: 733 };
const it = (vx, vy, text) => ({ x: vy, y: vx, vx, vy, text });   // «сырые» x/y для ВТБ не нужны

// op: {reg:[дата,время], post:[дата,время], card:[..], purpose:[строки], place:[строки], cur, op, acc, bal}
function opItems(op, cy) {
  const n = Math.max(op.purpose.length, op.place.length, 3);
  const top = cy - ((n - 1) / 2) * 5.2;
  const out = [];
  out.push(it(X.reg, cy - 5.2, op.reg[0]), it(X.reg, cy + 5.2, op.reg[1]));
  out.push(it(X.post, cy - 5.2, op.post[0]), it(X.post, cy + 5.2, op.post[1]));
  (op.card || []).forEach((c, i) => out.push(it(X.card, cy - 5.2 + i * 10.4, c)));
  op.purpose.forEach((t, i) => out.push(it(X.purpose, top + i * 5.2 + (n - op.purpose.length) * 2.6, t)));
  op.place.forEach((t, i) => out.push(it(X.place, top + i * 5.2 + (n - op.place.length) * 2.6, t)));
  out.push(it(X.cur, cy, op.cur), it(X.op, cy, money(op.op)), it(X.acc, cy, money(op.acc)), it(X.eq, cy, "-"), it(X.bal, cy, money(op.bal)));
  return { items: out, height: n * 5.2 };
}

const TABLE_HEAD = [it(43, 259, "Дата"), it(118, 259, "Дата"), it(553, 259, "Сумма в"), it(733, 259, "Остаток на"), it(684, 284, "нт BYN)")];

function page(ops, first, last) {
  let items = [];
  if (first) {
    items.push(
      it(347, 46, "ЗАО Банк ВТБ (Беларусь)"),
      it(43, 72, "ВЫПИСКА ПО СЧЕТАМ КЛИЕНТА"),
      it(43, 87, "BY00TEST00000000000000000000"),
      it(43, 103, "Тестов Тест Тестович"),
      it(43, 118, "Паспорт XX0000000 01.01.2020 тестовое рувд"),
      it(43, 149, "За период с: 01.03.2026 по: 31.03.2026"),
      it(393, 211, "Входящий остаток с учетом лимита овердрафта, в валюте счета:"), it(779, 211, "100,00"),
      it(43, 223, "Валюта счета: BYN Белорусский рубль"));
  }
  items.push(...TABLE_HEAD);
  let cy = 305;
  for (const op of ops) {
    const r = opItems(op, cy);
    items.push(...r.items);
    cy += r.height + 20;
  }
  if (last) {
    items.push(it(393, cy, "Исходящий остаток с учетом лимита овердрафта, в валюте счета:"), it(779, cy, "0,00"),
      it(400, cy + 40, "BYN"), it(590, cy + 40, "(+) поступило"), it(760, cy + 40, "1500,00"),
      it(590, cy + 50, "(-) списано"), it(760, cy + 50, "1600,00"),
      it(400, cy + 70, "Эквивалент BYN"), it(590, cy + 70, "(+) поступило"), it(760, cy + 70, "-"));
  }
  return items;
}

const D = (d, t) => [d, t];
// Операции в файле идут «вперемешку» внутри одной секунды (комиссия раньше своей покупки)
const ops = [
  { reg: D("02.03.2026", "10:00:00"), post: D("02.03.2026", "10:00:00"), purpose: ["Зачисление зарплаты", "организаций"], place: [], cur: "BYN", op: 0, acc: 1000, bal: 1100 },
  { reg: D("03.03.2026", "06:05:25"), post: D("02.03.2026", "15:43:52"), card: ["400001******1", "111"],
    purpose: ["Списание по операции", 'ПЦ "Покупка товара"', "в ТСС"], place: ['SHOP "EVROOPT"', "MINSK,BY"], cur: "BYN", op: 40.5, acc: 40.5, bal: 1059.5 },
  { reg: D("03.03.2026", "06:05:25"), post: D("02.03.2026", "15:50:00"), card: ["400001******1", "111"],
    purpose: ["Эквайринговая комиссия", "по картам банка"], place: [], cur: "BYN", op: 0, acc: 0.5, bal: 1059.0 },
  { reg: D("04.03.2026", "09:00:00"), post: D("04.03.2026", "09:00:00"), purpose: ["Капитализация (%% тек.периода ко вкладу)"], place: [], cur: "BYN", op: 0, acc: 0, bal: 1059.0 },
  { reg: D("05.03.2026", "06:05:29"), post: D("04.03.2026", "15:48:02"), card: ["400001******1", "111"],
    purpose: ["Списание по операции", 'ПЦ "Выдача наличных', 'денег" в АТМ'], place: ["VBBY,GIKALO.3,MINSK,BY"], cur: "USD", op: 100, acc: 300, bal: 759.0 },
  // пара «пришло и сразу ушло»: 459 пришло и ровно 459 ушло по ЕРИП в тот же день
  { reg: D("06.03.2026", "12:00:00"), post: D("06.03.2026", "12:00:00"), purpose: ["Зачисление по операции пополнения"], place: ["popolnenie kartochki,BY"], cur: "BYN", op: 0, acc: 459, bal: 1218.0 },
  { reg: D("07.03.2026", "06:20:00"), post: D("06.03.2026", "13:00:00"), card: ["400002******2", "222"],
    purpose: ["Оплата коммунальных,", "почтовых или банковских", "услуг"], place: ["04900006,Oplata", "uslugi ERIP,BY"], cur: "BYN", op: 459, acc: 459, bal: 759.0 },
  // уход в минус: остаток отрицательный
  { reg: D("10.03.2026", "07:00:00"), post: D("09.03.2026", "20:00:00"), card: ["400001******1", "111"],
    purpose: ["Списание по операции", 'ПЦ "Покупка товара"', "в ТСС"], place: ['RBO "BURGER KING"', "MINSK,BY"], cur: "BYN", op: 800, acc: 800, bal: -41.0 },
  { reg: D("11.03.2026", "08:00:00"), post: D("11.03.2026", "08:00:00"), purpose: ["Зачисление по операции пополнения"], place: ["popolnenie kartochki,BY"], cur: "BYN", op: 0, acc: 141, bal: 100.0 },
];
const pages = [page(ops.slice(0, 5), true, false), page(ops.slice(5), false, true)];
// последняя страница: итоги считаем под наши данные
const expectedIncome = 1000 + 459 + 141, expectedExpense = 40.5 + 0.5 + 300 + 459 + 800;
pages[1].forEach(i => { if (i.text === "1500,00") i.text = money(expectedIncome); if (i.text === "1600,00") i.text = money(expectedExpense); });
const closing = pages[1].find(i => i.text === "0,00" && i.vx === 779);
if (closing) closing.text = money(100);

check("банк ВТБ определяется", V.detect(pages) === true);
check("общий реестр выбирает ВТБ", B.detect(pages) && B.detect(pages).id === "vtb");

const res = B.parse(pages);
const txs = res.txs;
check("шапка: период", res.header.from === "2026-03-01" && res.header.to === "2026-03-31");
check("шапка: итоги и остатки", res.header.opening === 100 && res.header.closing === 100 &&
  res.header.income === expectedIncome && res.header.expense === expectedExpense);
check("нулевые строки (капитализация) пропущены", txs.length === ops.length - 1 && res.header.zeroSkipped === 1);
check("цепочка остатков не прерывалась", res.header.broken === 0);
check("итоги сходятся с шапкой", res.bank.validate(txs, res.header).ok === true);

check("зарплата: приход", txs[0].amount === 1000 && txs[0].date === "2026-03-02" && txs[0].time === "10:00:00");
check("покупка: расход, дата и время совершения", txs[1].amount === -40.5 && txs[1].date === "2026-03-02" && txs[1].time === "15:43:52");
check("многострочный текст склеен", /Покупка товара/.test(txs[1].details) && /EVROOPT/.test(txs[1].details));
check("маска карты склеена", txs[1].card === "400001******1111");
check("валютная операция берёт сумму в валюте счёта", txs[3].amount === -300 && txs[3].origAmount === 100 && /100,\d* USD|100 USD/.test(txs[3].details));
check("отрицательный остаток читается", txs.some(t => t.balance === -41 && t.amount === -800));

// пары
const pairs = txs.filter(t => t.pair);
check("найдена одна пара «пришло и сразу ушло»", pairs.length === 2 && pairs[0].pair === pairs[1].pair && res.header.pairs === 1);
check("пара: приход 459 и расход 459 по ЕРИП", pairs.some(t => t.amount === 459) && pairs.some(t => t.amount === -459));
check("покупки и обычное пополнение в пару не попали", !txs[0].pair && !txs[1].pair && !txs[txs.length - 1].pair);
check("пара получает категорию «Переводы между своими»", pairs.every(t => Cat.categorize(t) === Cat.OWN));

// категории без MCC
check("магазин «Евроопт» это продукты", Cat.categorize(txs[1]) === "Продукты");
check("Burger King это кафе", Cat.categorize(txs.find(t => /BURGER KING/.test(t.details))) === "Кафе и рестораны");
check("снятие наличных", Cat.categorize(txs[3]) === "Наличные");
check("эквайринговая комиссия", Cat.categorize(txs[2]) === Cat.FEES);
check("зарплата это пополнение", Cat.categorize(txs[0]) === Cat.INCOME);
check("ЕРИП вне пары остаётся неразобранным", Cat.categorize({ details: "Оплата коммунальных, почтовых или банковских услуг · 04900006,Oplata uslugi ERIP,BY", amount: -20 }) === null);

// приватность: в результат не попадают ФИО, паспорт и номер счёта
const dump = JSON.stringify(res);
check("ФИО, паспорт и счёт из шапки не попадают в результат", !/Тестов|XX0000000|BY00TEST/.test(dump));

// В реальной выписке комиссия может стоять в файле раньше своей покупки: знак всё равно определяется верно
const swapped = ops.slice(); [swapped[1], swapped[2]] = [swapped[2], swapped[1]];
const swPages = [page(swapped.slice(0, 5), true, false), page(swapped.slice(5), false, true)];
swPages[1].forEach(i => { if (i.text === "1500,00") i.text = money(expectedIncome); if (i.text === "1600,00") i.text = money(expectedExpense); });
const swRes = B.parse(swPages);
check("операции вперемешку: знаки и итоги верны", swRes.header.broken === 0 && swRes.bank.validate(swRes.txs, swRes.header).ok &&
  swRes.txs[1].amount === -0.5 && swRes.txs[2].amount === -40.5);

// отдельная проверка разбора пар
const small = [
  { date: "2026-01-01", time: "10:00:00", amount: 50, details: "Зачисление" },
  { date: "2026-01-01", time: "11:00:00", amount: -50, details: "ERIP" },
  { date: "2026-01-02", time: "11:00:00", amount: -50, details: "ERIP" },
  { date: "2026-02-20", time: "11:00:00", amount: 70, details: "Зачисление" },
  { date: "2026-03-20", time: "11:00:00", amount: -70, details: "ERIP" },
];
const n = T.mark(small, t => t.amount < 0 && /ERIP/.test(t.details));
check("пара берётся один к одному и только с ближайшим расходом", n === 1 && small[1].pair === 1 && !small[2].pair);
check("расход через месяц в пару не входит", !small[3].pair && !small[4].pair);

// МТБ по-прежнему определяется отдельно
const mtbPages = [[{ x: 10, y: 800, vx: 10, vy: 40, text: "Транзакции по счету с 01.09.2026г. по 02.11.2026г." }]];
check("выписка МТБ не принимается за ВТБ", B.detect(mtbPages) && B.detect(mtbPages).id === "mtb");
check("неизвестный документ не определяется", B.detect([[{ x: 1, y: 1, vx: 1, vy: 1, text: "Что-то другое" }]]) === null);

console.log(failed ? `\nПровалено проверок: ${failed}` : "\nВсе проверки пройдены.");
process.exit(failed ? 1 : 0);
