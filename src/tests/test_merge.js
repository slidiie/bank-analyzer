// Тест слияния нескольких выписок и выгрузки в таблицу на выдуманных данных.
// Запуск из папки проекта:  node tests/test_merge.js

const M = require("../merge.js");
const E = require("../export.js");

let failed = 0;
const check = (name, ok) => { if (!ok) failed++; console.log((ok ? "OK    " : "FAIL  ") + name); };

const tx = (date, time, amount, balance, details, extra) => Object.assign({ date, time, amount, balance, details, mcc: null, currency: "BYN" }, extra);
const bankA = { id: "vtb", name: "ВТБ (Беларусь)" }, bankB = { id: "mtb", name: "МТБанк" };

// ---- слияние без дублей ----
const jan = [tx("2026-01-05", "10:00:00", 1000, 1000, "Зарплата"), tx("2026-01-20", "12:00:00", -50, 950, "Магазин")];
const janFeb = [jan[0], jan[1], tx("2026-02-03", "09:00:00", -30, 920, "Кафе")];   // вторая выписка пересекается с первой
const state = M.newState();
const r1 = M.addStatement(state, { bank: bankA, header: { from: "2026-01-01", to: "2026-01-31" }, txs: jan, check: { ok: true } });
const r2 = M.addStatement(state, { bank: bankA, header: { from: "2026-01-01", to: "2026-02-28" }, txs: janFeb });
check("первая выписка добавлена целиком", r1.added === 2 && r1.skipped === 0);
check("пересекающаяся выписка: повторы пропущены, новая операция добавлена", r2.added === 1 && r2.skipped === 2 && state.txs.length === 3);
check("у операций есть банк и номер выписки", state.txs[0].bank === "vtb" && state.txs[0].src === 0 && state.txs[2].src === 1);
check("исходные данные выписок не изменены", jan[0].bank === undefined && jan[0].src === undefined);
check("список выписок хранит число новых и повторов", state.statements.length === 2 && state.statements[1].skipped === 2 && state.statements[1].bankName === "ВТБ (Беларусь)");
const h = M.mergedHeader(state.statements);
check("общий период и банк", h.from === "2026-01-01" && h.to === "2026-02-28" && h.bank === "vtb");
M.addStatement(state, { bank: bankB, header: { from: "2026-03-01", to: "2026-03-31" }, txs: [tx("2026-03-02", "08:00:00", -10, 5, "Метро")] });
check("банков несколько: bank = multi", M.mergedHeader(state.statements).bank === "multi" && M.mergedHeader(state.statements).to === "2026-03-31");

// ---- номера пар не совпадают между выписками ----
const pairedA = [tx("2026-04-01", "10:00:00", 100, 100, "Приход", { pair: 1 }), tx("2026-04-01", "11:00:00", -100, 0, "ЕРИП", { pair: 1 })];
const pairedB = [tx("2026-05-01", "10:00:00", 200, 200, "Приход", { pair: 1 }), tx("2026-05-01", "11:00:00", -200, 0, "ЕРИП", { pair: 1 })];
const ps = M.newState();
M.addStatement(ps, { bank: bankA, header: {}, txs: pairedA });
M.addStatement(ps, { bank: bankA, header: {}, txs: pairedB });
check("пары из разных выписок получили разные номера", M.pairCount(ps.txs) === 2);
// вторая половина пары оказалась повтором и пропущена: оставшаяся половина парой не считается
const half = M.newState();
M.addStatement(half, { bank: bankA, header: {}, txs: [pairedA[0]] });
M.addStatement(half, { bank: bankA, header: {}, txs: pairedA });
check("пара без второй половины перестаёт быть парой", M.pairCount(half.txs) === 0);

// ---- переводы между выписками ----
const A = { bank: bankA, header: {}, txs: [
  tx("2026-06-10", "10:00:00", -100, 400, "Перевод на карту другого банка"),
  tx("2026-06-11", "10:00:00", -40, 360, "Списание ПЦ \"Покупка товара\" в ТСС SHOP"),
  tx("2026-06-12", "10:00:00", -70, 290, "Платёж в магазине"),
  tx("2026-06-14", "10:00:00", -55, 235, "Перевод Иванову"),
] };
const B = { bank: bankB, header: {}, txs: [
  tx("2026-06-10", "10:05:00", 100, 600, "Пополнение при переводе в Интернет-банке"),
  tx("2026-06-11", "10:00:00", 40, 640, "Возврат средств"),
  tx("2026-06-12", "10:00:00", 70, 710, "Поступление"),
  tx("2026-06-20", "10:00:00", 55, 765, "Пополнение карты"),
] };
const cs = M.newState();
M.addStatement(cs, A); M.addStatement(cs, B);
const n = M.markCrossPairs(cs.txs, t => t.mcc === "5411");
const byD = (d, amount) => cs.txs.find(t => t.date === d && t.amount === amount);
check("перевод из одного банка и пополнение в другом в один день: пара", n === 1 && byD("2026-06-10", -100).pair && byD("2026-06-10", -100).pair === byD("2026-06-10", 100).pair);
check("покупка и «возврат» с равной суммой в пару не входят", !byD("2026-06-11", -40).pair && !byD("2026-06-11", 40).pair);
check("без слов про перевод пара не ищется", !byD("2026-06-12", -70).pair && !byD("2026-06-12", 70).pair);
check("разница больше суток: не пара", !byD("2026-06-14", -55).pair && !byD("2026-06-20", 55).pair);
const same = M.newState();
M.addStatement(same, { bank: bankA, header: {}, txs: [tx("2026-07-01", "10:00:00", 90, 90, "Пополнение"), tx("2026-07-01", "10:01:00", -90, 0, "Перевод")] });
check("внутри одной выписки перекрёстные пары не ищутся", M.markCrossPairs(same.txs) === 0);

// ---- выгрузка ----
check("ячейка с точкой с запятой берётся в кавычки", E.cell("a;b") === '"a;b"');
check("кавычки удваиваются", E.cell('say "hi"') === '"say ""hi"""');
check("текст-формула получает апостроф", E.cell("=1+1", true) === "'=1+1" && E.cell("-5", true) === "'-5");
check("число с минусом в нетекстовой ячейке не трогаем", E.cell("-5,00", false) === "-5,00");

const opts = { categoryOf: t => t.cat || null, ownCat: "Переводы между своими", loanCat: "Дал в долг", bankNames: { vtb: "ВТБ (Беларусь)" } };
const data = [
  tx("2026-02-10", "10:00:00", -50.5, 0, "SHOP; \"A\"", { cat: "Продукты", bank: "vtb" }),
  tx("2026-01-05", "10:00:00", 1000, 0, "Зарплата", { cat: "Пополнения", bank: "vtb" }),
  tx("2026-01-15", "10:00:00", -20, 0, "=HYPERLINK(\"x\")", { cat: "Продукты", bank: "vtb" }),
  tx("2026-01-20", "10:00:00", -300, 0, "Перевод себе", { cat: "Переводы между своими", bank: "vtb" }),
  tx("2026-01-21", "10:00:00", 300, 0, "Приход от себя", { cat: "Переводы между своими", bank: "vtb" }),
  tx("2026-02-01", "10:00:00", -100, 0, "Другу", { cat: "Дал в долг", bank: "vtb" }),
  tx("2026-02-02", "10:00:00", -7, 0, "Что-то", { bank: "vtb" }),
];
const ops = E.operationsCsv(data, opts).split("\r\n");
check("операции: заголовок и по строке на операцию", ops[0] === "Дата;Время;Банк;Сумма;Валюта;Категория;Тип;Описание" && ops.length === data.length + 2);
check("операции идут от старых к новым", ops[1].startsWith("2026-01-05") && ops[ops.length - 2].startsWith("2026-02-10"));
check("сумма с запятой, банк названием", ops[1].includes(";ВТБ (Беларусь);1000,00;BYN;Пополнения;доход;Зарплата"));
check("в описании кавычки и точка с запятой экранированы", ops.some(l => l.endsWith('"SHOP; ""A"""')));
check("описание-формула обезврежено", ops.some(l => l.endsWith("'=HYPERLINK(\"\"x\"\")\"") || l.includes("'=HYPERLINK")));
check("типы: между своими, долг, расход, неразобранное", ops.some(l => l.includes("между своими (не в счёт)")) && ops.some(l => l.includes("дал в долг (не в счёт)")) && ops.some(l => l.includes("Не разобрано;расход")));

{ const evil = E.operationsCsv([{ date: "2026-03-01", time: "=1+1", amount: -5, currency: "@SUM(A1)", details: "x", bank: "-cmd" }], opts).split("\r\n")[1];
  check("CSV: время, валюта и банк тоже экранируются", evil.includes(";'=1+1;") && evil.includes(";'@SUM(A1);") && evil.includes(";'-cmd;")); }
const withNote = E.operationsCsv(data, { ...opts, noteOf: tx => (tx.amount === 1000 ? "премия #работа" : "") }).split("\r\n");
check("CSV: колонка «Заметка» только если передан noteOf", withNote[0].endsWith(";Описание;Заметка") && withNote.some(l => l.endsWith(";премия #работа")) && !ops[0].includes("Заметка"));
const sum = E.summaryCsv(data, opts).split("\r\n");
check("итоги: месяцы колонками на русском", sum[0] === "Категория;Январь 2026;Февраль 2026;Итого");
check("итоги: продукты 20 и 50,5", sum.includes("Продукты;20,00;50,50;70,50"));
check("итоги: неразобранное отдельной строкой", sum.includes("Не разобрано;0,00;7,00;7,00"));
check("итого расходов без переводов и долга", sum.includes("Итого расходов;20,00;57,50;77,50"));
check("не в счёт и доходы", sum.includes("Не в счёт: между своими;300,00") && sum.includes("Не в счёт: дал в долг;100,00") && sum.includes("Доходы (без переводов между своими);1000,00"));

// Перевод между банками с датой «за ДД.ММ.ГГГГ» (зачисление через выходные)
{
  const st = M.newState();
  const mk = (bank, date, amount, details) => ({ date, time: "10:00:00", amount, balance: 0, details });
  M.addStatement(st, { bank: { id: "vtb", name: "ВТБ" }, header: {}, txs: [mk("vtb", "2026-01-09", -343.03, "Оплата коммунальных, почтовых или банковских услуг ЕРИП")] });
  M.addStatement(st, { bank: { id: "mtb", name: "МТБ" }, header: {}, txs: [mk("mtb", "2026-01-12", 343.03, "MP2P Пополнение счета за 09.01.2026")] });
  const n = M.markCrossPairs(st.txs, () => false);
  check("перевод «за 09.01» через выходные найден как пара", n === 1);
}

// Платежи в интернет-банке группируются по счёту получателя (номера в тесте выдуманные)
{
  const Cat = require("../categories.js");
  const ib = (acct, n) => ({ amount: -n, mcc: "6538", details: "MTB MOBILE BANK MINSK BY MP2B 140103 Оплата в Интернет-банке, Наименование операции: Пополнение карточки, номер счета " + acct + ", номер устройства 5M100016, 02.11.2026" });
  const a1 = ib("BY00TEST30000 00001234567890 0", 10), a2 = ib("BY00TEST30000 00001234567890 0", 25), b1 = ib("BY00TEST30000 00009999999999 0", 10);
  check("платежи на один счёт в одной группе", Cat.merchantKey(a1) === Cat.merchantKey(a2));
  check("платежи на разные счета в разных группах", Cat.merchantKey(a1) !== Cat.merchantKey(b1));
  check("полный номер счёта не попадает в ключ правила", !/12345678/.test(Cat.merchantKey(a1)) && /8900/.test(Cat.merchantKey(a1)));
  check("получатель: последние цифры и название операции", Cat.recipient(a1).last4 === "8900" && Cat.recipient(a1).op === "Пополнение карточки");
  check("приход и обычная покупка получателя не имеют", Cat.recipient({ amount: 10, details: a1.details }) === null && Cat.recipient({ amount: -5, details: "Покупка товара" }) === null);
  // «Корзины»: категории нет, но видно способ оплаты
  const erip = { amount: -20, details: "Оплата коммунальных, почтовых или банковских услуг · 123456,Oplata uslugi ERIP,BY" };
  check("платёж через интернет-банк попадает в корзину, а категории по-прежнему нет", Cat.categorize(a1) === null && Cat.bucket(a1) === "Переводы на карты и счета");
  check("«Пополнение карточки/счета» это перевод, «Пополнение баланса» и «Оплата товаров» остаются платежами", ["Пополнение банковской платежной карточки", "Пополнение счета"].every(op => Cat.bucket({ ...a1, details: a1.details.replace("Пополнение карточки", op) }) === "Переводы на карты и счета") && ["Пополнение баланса", "Оплата товаров, услуг"].every(op => Cat.bucket({ ...a1, details: a1.details.replace("Пополнение карточки", op) }) === "Платежи через интернет-банк"));
  check("платёж ЕРИП попадает в корзину ЕРИП", Cat.categorize(erip) === null && Cat.bucket(erip) === "Платежи ЕРИП");
  check("обычная покупка и приход в корзины не попадают", Cat.bucket({ amount: -5, details: "SHOP X MINSK BY" }) === null && Cat.bucket({ amount: 10, details: a1.details }) === null);
  check("у корзин есть значки", Cat.BUCKETS.every(b => Cat.ICONS[b]));
  // Азартные игры: по названию площадки и по MCC, в обе стороны
  check("оплата на MAXLINE.BY: азартные игры", Cat.categorize({ amount: -20, details: "MAXLINE.BY VITEBSK BY Оплата товаров и услуг" }) === Cat.GAMBLING);
  check("поступление со счёта MAXLINE.BY: азартные игры, а не обычный приход", Cat.categorize({ amount: 50, details: "MAXLINE.BY VITEBSK BY Пополнение тек. счет с банк. плат. карточкой" }) === Cat.GAMBLING);
  check("SUPERBEL (онлайн-лотерея): и выигрыш, и пополнение — азартные игры", Cat.categorize({ amount: 100, details: "SUPERBEL MINSK BY Перевод на БПК МТБ в системе Р2Р, номер устройства B2P40001, 31.12.2025" }) === Cat.GAMBLING && Cat.categorize({ amount: -20, details: "SUPERBEL MINSK BY Оплата товаров и услуг" }) === Cat.GAMBLING);
  check("MCC 7995 (ставки): азартные игры", Cat.categorize({ amount: -10, mcc: "7995", details: "SOME SITE" }) === Cat.GAMBLING);
  check("обычные слова вроде «процентная ставка» не считаются азартными играми", Cat.categorize({ amount: -3, details: "Процентная ставка по кредиту" }) !== Cat.GAMBLING);
  check("подсказка о выводе с площадки: «карточное» название + перевод, но не человек и не обычный приход", Cat.maybeGamblingPayout({ amount: 40, details: "SOMESITE MINSK BY Перевод на БПК МТБ в системе Р2Р" }) === true && Cat.maybeGamblingPayout({ amount: 40, details: "Иванов Иван Перевод на БПК в системе Р2Р" }) === false && Cat.maybeGamblingPayout({ amount: -40, details: "SOMESITE MINSK BY Перевод на БПК Р2Р" }) === false && Cat.maybeGamblingPayout({ amount: 40, details: "Зарплата" }) === false);
  check("у категории есть значок и она в списке", Cat.ICONS[Cat.GAMBLING] && Cat.DEFAULT_CATEGORIES.includes(Cat.GAMBLING));
  // Справочник мест (по открытым источникам)
  const cat = (d, mcc) => Cat.categorize({ amount: -10, mcc, details: d });
  check("игра в Google Play — «Развлечения», музыка — «Связь и подписки»", cat("GOOGLE *Hustle Castle", "7372") === "Развлечения" && cat("GOOGLE *Yandex Music", "7372") === "Связь и подписки");
  check("садовый магазин под MCC 5992 это товары для дома, а не подарки", cat("Оплата товаров и услуг SVOY OGORODIK/ BLR MINSK", "5992") === "Товары для дома" && cat("Цветочный салон Роза", "5992") === "Подарки");
  check("цветы и подарки", cat("FLOWWOW", "5992") === "Подарки" && cat("Rozi.bel", "5992") === "Подарки");
  check("маркетплейс без MCC — «Одежда и покупки»", cat("WILDBERRIES", "5300") === "Одежда и покупки");
  check("оптика — «Здоровье», Fix Price — «Товары для дома», алкомаркет — «Продукты»", cat("OPTIKA VSE VIZHU", "8043") === "Здоровье" && cat("FIX PRICE", "5399") === "Товары для дома" && cat("MTB MOBILE BANK MINSK BY MP2B 140103 Оплата", "5399") === null && cat("SEM PYATNITS", "5921") === "Продукты");
  check("VPN и подписки по названию сильнее MCC 5734/5817; обычный магазин с тем же MCC не затронут",
    cat("VPN* KCETQXVT5P GOTHENBURG, S SE Оплата товаров и услуг", "5734") === "Связь и подписки" && cat("PROTON AG GENEVA", "5817") === "Связь и подписки" &&
    cat("OUTLINE FURNITURE", "5734") === "Одежда и покупки" && cat("PROMOTION SHOP", "5734") === "Одежда и покупки" && cat("SOME SHOP", "5734") === "Одежда и покупки");
  check("причина категории: MCC и название", Cat.resolve({ details: "SOME SHOP", mcc: "5734", amount: -5 })[1] === "код MCC 5734" && /подписк/.test(Cat.resolve({ details: "VPN* X", mcc: "5734", amount: -5 })[1]));
  check("авиа и отели — «Путешествия»", cat("BELAVIA", "4511") === "Путешествия" && cat("X", "3100") === "Путешествия" && cat("X", "7011") === "Путешествия");
  check("посредники (bePaid, переводы банка) остаются неразобранными", cat("BEPAID.BY", "5300") === null && cat("MTBANK MINSK BY", "6538") === null);
  check("«Santander» не принимается за сеть «Санта»", cat("Santander Bank", "") === null);
  check("новые категории есть в списке и со значками", ["Красота и уход", "Подарки", "Путешествия", "Образование"].every(c => Cat.DEFAULT_CATEGORIES.includes(c) && Cat.ICONS[c]));
  check("двойники сливаются со стандартными", Cat.canonical("подарки") === "Подарки" && Cat.canonical("Подарки и цветы") === "Подарки" && Cat.canonical("Учёба") === "Образование" && Cat.canonical("отпуск") === "Путешествия" && Cat.canonical("Жилье") === "Аренда и жильё" && Cat.canonical("Кофе") === "Кофе");
  // Накопления
  check("«Накопления» есть в списке, со значком; «Сбережения»/«Копилка» сливаются с ней", Cat.DEFAULT_CATEGORIES.includes(Cat.SAVINGS) && Cat.ICONS[Cat.SAVINGS] && Cat.canonical("сбережения") === Cat.SAVINGS && Cat.canonical("Копилка") === Cat.SAVINGS);
  check("перевод на вклад сам накоплением не становится", Cat.categorize({ amount: -100, details: "Перевод на накопительный счёт" }) !== Cat.SAVINGS);
  const Ex = require("../export.js");
  const sv = [{ date: "2026-10-05", amount: 1000, details: "Зарплата" }, { date: "2026-10-06", amount: -200, details: "Вклад" }, { date: "2026-10-07", amount: -50, details: "Магазин" }, { date: "2026-10-20", amount: 30, details: "Снятие с вклада" }];
  const catOf = t => (/Вклад|вклада/.test(t.details) ? Cat.SAVINGS : t.amount > 0 ? Cat.INCOME : "Продукты");
  const csv = Ex.summaryCsv(sv, { categoryOf: catOf, ownCat: Cat.OWN, loanCat: Cat.LOAN, savingsCat: Cat.SAVINGS });
  check("экспорт: накопления не в расходах, строка «отложено» = 200 − 30, доход без снятия", /Итого расходов;50,00/.test(csv) && /отложено в накопления;170,00/.test(csv) && /Доходы[^;]*;1000,00/.test(csv));
}

// v4.61: одинаковые операции внутри одной выписки (без времени и остатка) не теряются
{
  const s = M.newState();
  const cof = tx("2026-03-05", null, -3.5, null, "COFFEE TEST");
  const r1 = M.addStatement(s, { bank: { id: "sber", name: "Сбер" }, header: {}, txs: [cof, Object.assign({}, cof)] });
  check("две одинаковые покупки в одной выписке: обе остались", r1.added === 2 && r1.skipped === 0 && s.txs.length === 2);
  const r2 = M.addStatement(s, { bank: { id: "sber", name: "Сбер" }, header: {}, txs: [cof, Object.assign({}, cof), Object.assign({}, cof)] });
  check("повторная выписка того же банка: пропущены только уже бывшие (2), третья добавлена", r2.skipped === 2 && r2.added === 1 && s.txs.length === 3);
  const r3 = M.addStatement(s, { bank: { id: "alfa", name: "Альфа" }, header: {}, txs: [cof] });
  check("такая же операция другого банка: не повтор", r3.added === 1 && r3.skipped === 0);
}
// v4.61: файл разбора поверх загруженной выписки: повторы того же банка, сдвиг пар и номеров выписок
{
  const s = M.newState();
  const a = tx("2026-04-01", "10:00:00", 50, 150, "Пополнение"), b = tx("2026-04-02", "11:00:00", -50, 100, "Перевод", { pair: 1 });
  a.pair = 1;
  M.addStatement(s, { bank: bankA, header: {}, txs: [a, b] });
  const saved = [
    Object.assign({}, a, { bank: "vtb", src: 0 }),                              // повтор
    tx("2026-04-03", null, 20, null, "Зачисление", { bank: "mtb", src: 1, pair: 1 }),
    tx("2026-04-03", null, -20, null, "Перевод", { bank: "mtb", src: 1, pair: 1 }),
    tx("2026-04-04", null, -7, null, "Кафе", { src: 1 }),                       // старый файл: банка у операции нет
  ];
  const sts = [{ bank: "vtb", from: "2026-04-01", to: "2026-04-02" }, { bank: "mtb", from: "2026-04-03", to: "2026-04-04" }];
  const r = M.addSaved(s, saved, sts, "mtb");
  check("файл разбора: повтор пропущен, новые добавлены", r.skipped === 1 && r.added === 3 && s.txs.length === 5);
  check("файл разбора: номера пар не совпали с уже загруженными", M.pairCount(s.txs) === 2);
  check("файл разбора: номера выписок сдвинуты", s.statements.length === 3 && s.txs.slice(2).every(t => t.src === 2));
  check("файл разбора: банк взят из выписки, если у операции его нет", s.txs[4].bank === "mtb");
  const r2 = M.addSaved(s, [Object.assign({}, saved[1], { pair: 9 })], [sts[1]], "mtb");
  check("файл разбора: половина пары без второй половины больше не пара", r2.added === 0 && M.pairCount(s.txs) === 2);
}

// v4.63: предупреждение о счёте не в рублях
check("счёт в USD: есть предупреждение", /USD/.test(M.currencyNote({ currency: "USD" }) || ""));
check("счёт в BYN или без валюты: предупреждения нет", M.currencyNote({ currency: "BYN" }) === null && M.currencyNote({}) === null && M.currencyNote(null) === null);
check("мусор в валюте: предупреждения нет", M.currencyNote({ currency: "<b>" }) === null);
// v4.63: слова внутри других слов не дают ложную категорию
{
  const C = require("../categories.js");
  const cat = d => C.categorize({ details: d, amount: -5 });
  check("TRANSPORT не «Развлечения» (sport внутри)", cat("TRANSPORT CARD TEST") !== "Развлечения");
  check("«транспорт» не «Развлечения» (спорт внутри)", cat("Оплата транспорт тест") !== "Развлечения");
  check("SPORTMASTER и «Спортзал» по-прежнему «Развлечения»", cat("SPORTMASTER TEST") === "Развлечения" && cat("Оплата спортзал") === "Развлечения");
  check("MOBI не «Товары для дома» (obi внутри)", cat("MOBI SHOP TEST") !== "Товары для дома");
  check("OBI по-прежнему «Товары для дома»", cat("OBI MINSK") === "Товары для дома");
  check("комиссионный магазин не «Комиссии банка»", cat("КОМИССИОННЫЙ МАГАЗИН ТЕСТ") !== C.FEES);
  check("комиссия за перевод и комиссионное вознаграждение: «Комиссии банка»", cat("Комиссия за перевод") === C.FEES && cat("Комиссионное вознаграждение") === C.FEES);
}

// v4.67: непроведённая операция (авторизация, тип A) и её проведённая версия в следующей выписке
{
  const st = (txs, bank = "mtb") => ({ bank: { id: bank, name: "Тест" }, header: { from: "2026-09-07", to: "2026-10-06" }, txs, check: null });
  const pend = { date: "2026-10-02", regDate: "2026-10-02", time: "12:16:48", amount: -5.5, balance: null, details: "тест", pending: true };
  const posted = { date: "2026-10-03", regDate: "2026-10-02", time: "12:16:48", amount: -5.5, balance: 100.25, details: "тест" };
  const s = M.newState();
  M.addStatement(s, st([pend]));
  const r = M.addStatement(s, st([posted]));
  check("проведённая заменяет непроведённую, без задвоения", s.txs.length === 1 && !s.txs[0].pending && r.added === 1);
  const s2 = M.newState();
  M.addStatement(s2, st([posted]));
  const r2 = M.addStatement(s2, st([pend]));
  check("непроведённая не дублирует уже проведённую", s2.txs.length === 1 && r2.skipped === 1);
  const s3 = M.newState();
  M.addStatement(s3, st([pend]));
  M.addStatement(s3, st([pend]));
  check("повторная загрузка той же непроведённой не задваивает", s3.txs.length === 1);
  const s4 = M.newState();
  M.addStatement(s4, st([pend]));
  M.addStatement(s4, st([posted], "belarusbank"));
  check("проведённая в другом банке непроведённую не вытесняет", s4.txs.length === 2);
}

console.log(failed ? `\nПровалено проверок: ${failed}` : "\nВсе проверки пройдены.");
process.exit(failed ? 1 : 0);
