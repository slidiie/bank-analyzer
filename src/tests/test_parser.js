// Тест парсера на реальном фрагменте страницы выписки (личные данные заменены).
// Запуск из папки проекта:  node tests/test_parser.js

const SP = require("../parser.js");
const Cat = require("../categories.js");

// Строки в формате «x:текст ¦ x:текст», как их показывает index.html с галочкой «координаты»
const PAGE3 = `
20:https://mybank.by/main_authorised?desc=BYXX-IBAN%7CPC
486:Страница 3 из 29
162:Транзакции по счету с 01.09.2026г. по 02.11.2026г.
425:2.99 ¦ 500:-
207:Погашение
425:2.99
207:начисленной
207:комиccии
47:30.10.2026
27:T ¦ 112:30.10.2026 ¦ 207:(Комиссия за ¦ 390:BYN ¦ 532:550.98
52:23:51:05
207:опцию "Умный
207:манибэк") по
207:карте Кактус
207:BYN за
207:30.10.2026
425:2.99 ¦ 500:-
207:Погашение
425:2.99
207:начисленной
207:комиccии
207:(Комиссия за
47:30.10.2026
27:T ¦ 112:30.10.2026 ¦ 390:BYN ¦ 532:547.99
52:23:51:05 ¦ 207:опцию
207:"Повышенный
207:процент") по
207:карте Кактус
207:BYN за
207:30.10.2026
215:MTB MOBILE ¦ 290:400003****XXXX
425:150.00 ¦ 500:+
207:BANK MINSK BY
425:150.00
207:Пополнение при
207:переводе в
44:30.10.2026
27:T ¦ 109:30.10.2026 ¦ 172:5399 ¦ 389:BYN ¦ 530:553.97
207:Интернет-банке
50:14:25:10
207:в рамках одного
207:клиента
207:CB100015,
207:30.10.2026
425:52.05 ¦ 500:+
207:MP2P 140103
425:52.05
207:Пополнение
44:30.10.2026
207:счета
27:T ¦ 109:30.10.2026 ¦ 389:BYN ¦ 530:403.97
50:14:04:47
207:BYXX-IBAN
207:XXXX
207:26 за 30.10.2026
425:100.00 ¦ 500:+
207:MP2P 140103
425:100.00
207:Пополнение
44:30.10.2026
207:счета
27:T ¦ 109:30.10.2026 ¦ 389:BYN ¦ 530:351.92
50:13:01:52
207:BYXX-IBAN
207:XXXX
207:26 за 30.10.2026
221:OBEKT . G. ¦ 290:400003****XXXX
425:1.00 ¦ 500:-
222:MINSK BY
47:28.10.2026
27:T ¦ 112:30.10.2026 ¦ 174:7299 ¦ 390:BYN ¦ 532:251.92
425:1.00
52:19:53:22
207:Оплата товаров
207:и услуг
233:SHOP ¦ 290:400003****XXXX
425:4.19 ¦ 500:-
216:KOPEECHKA
47:28.10.2026
425:4.19
222:MINSK BY
27:T ¦ 112:30.10.2026 ¦ 174:5411 ¦ 390:BYN ¦ 532:252.92
52:19:48:03
207:Оплата товаров
207:и услуг
`;

const HEADER = `
Период выписки: ¦ с 01.09.2026г. по 02.11.2026г.
Входящий остаток: ¦ 376.50 ¦ BYN
Поступило: ¦ 6519.37 ¦ BYN
Списано: ¦ 6540.36 ¦ BYN
Исходящий остаток: ¦ 355.51 ¦ BYN
`;

// Превращает текст вида «x:текст ¦ x:текст» обратно в строки с координатами
function toLines(text) {
  return text.trim().split("\n").map(line =>
    line.split(" ¦ ").map(part => {
      const m = part.match(/^(\d+):(.*)$/);
      return m ? { x: Number(m[1]), text: m[2] } : { x: 0, text: part };
    })
  );
}

let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log((ok ? "OK    " : "FAIL  ") + name + (ok ? "" : `\n      ожидали: ${JSON.stringify(expected)}\n      получили: ${JSON.stringify(actual)}`));
}

const txs = SP.parseTransactions(toLines(PAGE3));

check("найдено операций", txs.length, 7);
check("1: сумма и остаток", [txs[0].amount, txs[0].balance], [-2.99, 550.98]);
check("2: сумма и остаток", [txs[1].amount, txs[1].balance], [-2.99, 547.99]);
check("3: пополнение, MCC, дата", [txs[2].amount, txs[2].mcc, txs[2].date], [150, "5399", "2026-10-30"]);
check("3: карта подхвачена", txs[2].card, "400003****XXXX");
check("4: пополнение", [txs[3].amount, txs[3].balance, txs[3].mcc], [52.05, 403.97, null]);
check("5: пополнение", [txs[4].amount, txs[4].balance], [100, 351.92]);
check("6: покупка, MCC, дата регистрации", [txs[5].amount, txs[5].mcc, txs[5].regDate, txs[5].date], [-1, "7299", "2026-10-28", "2026-10-30"]);
check("7: покупка в магазине", [txs[6].amount, txs[6].mcc, txs[6].balance], [-4.19, "5411", 252.92]);
check("7: описание содержит магазин", /SHOP KOPEECHKA/.test(txs[6].details), true);
check("6: описание содержит место", /OBEKT/.test(txs[5].details), true);
check("1: время регистрации", txs[0].time, "23:51:05");

const header = SP.parseHeader(toLines(HEADER));
check("шапка: период", [header.from, header.to], ["2026-09-01", "2026-11-02"]);
check("шапка: итоги", [header.income, header.expense, header.opening, header.closing], [6519.37, 6540.36, 376.5, 355.51]);

check("категория 1 (комиссия)", Cat.categorize(txs[0]), "Комиссии банка");
check("категория 3 (между своими)", Cat.categorize(txs[2]), "Переводы между своими");
check("категория 4 (пополнение)", Cat.categorize(txs[3]), "Пополнения");
check("категория 6 (MCC 7299: неизвестно)", Cat.categorize(txs[5]), null);
check("категория 7 (продукты)", Cat.categorize(txs[6]), "Продукты");

// Платежи в Интернет-банке с одинаковым началом описания должны давать РАЗНЫЕ ключи,
// а одинаковые платежи с разными номерами и датами: ОДИН ключ.
const pay = (name, extra) => ({
  amount: -10, mcc: null,
  details: `Оплата в Интернет-банке, Наименование операции: ${name}, номер устройства 5M100016 ${extra || ""}`,
});
check("ключи: разные получатели", Cat.merchantKey(pay("Мобильная связь")) !== Cat.merchantKey(pay("Интернет дома")), true);
check("ключи: один получатель, разные номера",
  Cat.merchantKey(pay("Мобильная связь", "за 01.10.2026 счёт 12345")) === Cat.merchantKey(pay("Мобильная связь", "за 03.11.2026 счёт 67890")), true);
check("«Аренда и жильё» по словам", Cat.categorize({ amount: -50, mcc: null, details: "Оплата ЖКХ, коммунальные услуги" }), "Аренда и жильё");
check("«Аренда и жильё» по MCC (коммуналка)", Cat.categorize({ amount: -50, mcc: "4900", details: "Электроэнергия" }), "Аренда и жильё");
check("«Товары для дома» по MCC (мебель)", Cat.categorize({ amount: -300, mcc: "5712", details: "MEBEL SHOP" }), "Товары для дома");
check("в списке есть новые категории", ["Аренда и жильё", "Товары для дома", "Прочее"].every(c => Cat.DEFAULT_CATEGORIES.includes(c)), true);
check("есть категория «Дал в долг», а «Вернули долг» убрана", Cat.DEFAULT_CATEGORIES.includes(Cat.LOAN) && !Cat.DEFAULT_CATEGORIES.includes("Вернули долг"), true);
check("категории «Дом» больше нет", Cat.DEFAULT_CATEGORIES.includes("Дом"), false);

// Отклонённая операция (тип "E", баланса нет) не должна попадать в разбор
{
  const declined = toLines(`
425:7.20 ¦ 500:-
27:E ¦ 112:30.10.2026 ¦ 207:Превышена сумма лимита ¦ 390:BYN
425:5.00 ¦ 500:-
27:T ¦ 112:30.10.2026 ¦ 207:Покупка ¦ 390:BYN ¦ 532:100.00
`);
  const r = SP.parseTransactions(declined);
  check("отклонённая операция (тип E) пропущена", [r.length, r.length ? r[0].amount : null], [1, -5]);
}

// Устойчивость: мусор и повреждённые данные не роняют разбор и не портят итоги
{
  const Banks = require("../banks.js");
  check("пустая выписка не определяется как банк", Banks.parse([]), null);
  check("мусорные страницы не определяются как банк", Banks.parse([[{ x: 1, y: 1, text: "привет" }]]), null);
  const lines = toLines(PAGE3);
  const toItems = ls => ls.flatMap((line, i) => line.map(it => ({ x: it.x, y: 800 - i * 10, text: it.text })));
  const good = Banks.parse([toItems(lines)]);
  check("фрагмент разбирается как МТБ", good && good.bank.id, "mtb");
  const broken = toItems(lines).map(it => (/^\d+\.\d\d$/.test(it.text) && it.x >= 400 && it.x <= 470 && Math.random() < 0 ? it : it));
  const nan = toItems(lines); const firstAmt = nan.find(it => it.x >= 400 && it.x <= 470 && /^\d+\.\d\d$/.test(it.text));
  firstAmt.text = "NaN";
  const r = Banks.parse([nan]);
  check("повреждённая сумма не даёт NaN в операциях", r.txs.every(t => Number.isFinite(t.amount) && /^\d{4}-\d\d-\d\d$/.test(t.date)), true);
}

const v = SP.validate(txs, { income: 302.05, expense: 11.17 });
check("сверка итогов", [v.incomeOk, v.expenseOk, v.ok], [true, true, true]);

// v4.67: непроведённые операции (pending) не входят в сверку, но считаются отдельно
{
  const tx = (amount, pending) => Object.assign({ amount }, pending ? { pending: true } : {});
  const v2 = SP.validate([tx(-10), tx(-5.5, true), tx(20)], { income: 20, expense: 10 });
  check("непроведённая не ломает сверку", [v2.incomeOk, v2.expenseOk, v2.ok, v2.pending], [true, true, true, 1]);
  const v3 = SP.validate([tx(-10)], { income: 0, expense: 10 });
  check("без непроведённых поля pending нет", v3.pending, undefined);
}

// Сумма с пробелом в тысячах («1 150.00»): операция не теряется (аудит 13.11, Б1)
{
  const spaced = PAGE3.split("425:150.00").join("425:1 150.00");
  const t2 = SP.parseTransactions(toLines(spaced));
  check("сумма «1 150.00»: операций столько же", t2.length, 7);
  check("сумма «1 150.00» прочитана целиком", t2[2].amount, 1150);
}

console.log(failed === 0 ? "\nВсе проверки пройдены." : `\nПровалено проверок: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
