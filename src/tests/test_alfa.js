// Тест разбора выписки Альфа-Банка (кредит / кредитная карта) на ВЫДУМАННЫХ данных.
// Запуск из папки src:  node tests/test_alfa.js

const AL = require("../alfa.js");
const Banks = require("../banks.js");
const Cat = require("../categories.js");

let failed = 0;
const check = (name, ok) => { if (!ok) failed++; console.log((ok ? "OK    " : "FAIL  ") + name); };
const it = (vx, vy, text) => ({ vx, vy, text });

const HEAD = y => [it(458, y, "Сумма в"), it(54, y + 9, "Дата"), it(242, y + 9, "Примечание"), it(460, y + 9, "валюте"), it(465, y + 18, "счета"), it(516, y + 18, "операции")];
// Строка с датой и суммой; примечание: строки выше (up) и ниже (down) строки с датой, как в настоящем файле
const row = (y, date, amt, o = {}) => [
  it(45, y, date), it(455, y, amt + " BYN"), it(515, y, amt + " BYN"),
  ...(o.up || []).map((t, i) => it(91, y - 3 - 3 * (o.up.length - 1 - i), t)),
  ...(o.inline ? [it(91, y, o.inline)] : []),
  ...(o.down || []).map((t, i) => it(91, y + 6 + 6 * i, t)),
];

const page1 = [
  it(458, 54, 'ЗАКРЫТОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО "АЛЬФА-БАНК"'),
  it(42, 450, "Выписка по кредиту за период 01.06.2026 - 07.11.2026"),
  ...HEAD(476),
  ...row(513, "06.11.2026", "-230.38", { up: ["Дог. от 101024"], down: ["Погашение основного долга"] }),
  ...row(544, "06.11.2026", "300", { up: ["ЗАЧИ СЛЕНИЕ СРЕДСТВ НА ТЕКУЩИЙ СЧЕТ"], down: ["ЧЕРЕЗ СИСТЕМУ ЕРИП 'ПРИОРБАНК' ОАО"] }),
  ...row(580, "03.11.2026", "-21.78", { inline: "20261029 MINSK Покупка товара / получение услуг PT INTERNET MAGAZIN 21VEK" }),
  ...row(600, "03.11.2026", "21.78", { up: ["Дог. от 101024"], down: ["Операция предоставления транша"] }),
  ...row(640, "02.11.2026", "-9.9", { up: ["Карта . Вознаграждение за обс луживание согласно Перечню вознагра"], down: ["ждений"] }),
];
const page2 = [
  ...HEAD(458),
  ...row(505, "30.10.2026", "-6.51", { inline: "20261028 d.BOLSHOE STI Покупка товара / получение услуг SHOP MAYAK" }),
  // торговая точка не влезла в строку и перенесена вниз
  ...row(540, "29.10.2026", "-7.43", { up: ["20261027 GOROD NOVOGRU Покупка товара / получение услуг TORGOVAYa"], down: ["TOChKA SVETOF"] }),
  ...row(580, "28.10.2026", "-7", { inline: "20261026 ONLINE SERVICE MTS po ь telefona" }),
  ...row(610, "27.10.2026", "-67.92", { up: ["Дог. от 101024"], down: ["Погашение процентов"] }),
];
const pages = [page1, page2];

check("банк определяется как Альфа-Банк", Banks.detect(pages) && Banks.detect(pages).id === "alfa");
check("чужая выписка не принимается", !AL.detect([[it(1, 1, "Транзакции по счету")]]));

const { header, txs } = AL.parse(pages);
check("период из шапки", header.from === "2026-06-01" && header.to === "2026-11-07");
check("все строки распознаны: " + txs.length + " из 9", txs.length === 9 && header.broken === 0);

const by = k => txs.filter(t => t.kind === k);
check("погашение основного долга: сумма и знак", by("principal").length === 1 && by("principal")[0].amount === -230.38);
check("ЕРИП-зачисление (разорванное слово) распознано", by("erip").length === 1 && by("erip")[0].amount === 300);
check("транш распознан", by("tranche").length === 1 && by("tranche")[0].amount === 21.78);
check("комиссия за обслуживание (разорванное слово)", by("fee").length === 1 && by("fee")[0].amount === -9.9);
check("проценты распознаны", by("interest").length === 1 && by("interest")[0].amount === -67.92);
check("покупки: 4 штуки", by("purchase").length === 4);

const p = by("purchase");
check("магазин и город из строки примечания", p[0].details === "PT INTERNET MAGAZIN 21VEK · MINSK");
check("дата покупки из примечания", p[0].opDate === "2026-10-29" && p[0].date === "2026-11-03");
check("магазин, перенесённый на следующую строку, склеен", p.some(t => t.details === "TORGOVAYa TOChKA SVETOF · GOROD NOVOGRU"));
check("оплата без слов «Покупка товара» тоже покупка", p.some(t => /ONLINE SERVICE MTS/.test(t.details) && t.amount === -7));
check("ФИО, договор и счёт в разбор не попадают", !JSON.stringify(txs).includes("101024"));

// Категории: внутренние проводки не считаются тратой, комиссия и проценты это плата банку
check("транш: между своими", Cat.categorize(by("tranche")[0]) === Cat.OWN);
check("погашение долга: между своими", Cat.categorize(by("principal")[0]) === Cat.OWN);
check("ЕРИП-зачисление: между своими", Cat.categorize(by("erip")[0]) === Cat.OWN);
check("комиссия: комиссии банка", Cat.categorize(by("fee")[0]) === Cat.FEES);
check("проценты: комиссии банка", Cat.categorize(by("interest")[0]) === Cat.FEES);

// ---------- Шаблон «Выписка по карте» (направление словами, сумма без знака) ----------
const cardOp = (y, num, date, time, dir, amt, st = "Завершено") => [
  it(45, y, num), it(122, y - 5, date), it(122, y + 4, time), it(191, y - 5, dir), it(191, y + 4, "средств"),
  it(264, y - 5, st), it(264, y + 4, "успешно"), it(355, y, amt + " BYN"), it(481, y, "BLR"),
  it(427, y - 5, "ONLINE"), it(428, y + 4, "SERVIC"), it(512, y - 5, "TRANSFERS"), it(524, y + 4, "AK AM"),
];
const cardPage = [
  it(458, 54, 'ЗАКРЫТОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО "АЛЬФА-БАНК"'),
  it(42, 319, "Выписка по карте за период 31.10.2026 - 07.11.2026"),
  it(65, 345, "Номер"), it(139, 345, "Время"), it(280, 345, "Статус"), it(195, 349, "Тип операции"), it(354, 354, "операции"),
  ...cardOp(376, "7010000000000001", "2026-11-07", "22:16:26", "Отправление", "3.96"),
  ...cardOp(403, "7010000000000002", "2026-11-07", "22:12:23", "Получение", "3.96"),
  ...cardOp(431, "7010000000000003", "2026-11-07", "22:11:54", "Отправление", "2.00"),
  ...cardOp(459, "7010000000000004", "2026-11-06", "10:00:00", "Отправление", "5.00", "Отклонено"),
];
const cp = [cardPage];
check("карточный шаблон определяется как Альфа-Банк", Banks.detect(cp) && Banks.detect(cp).id === "alfa");
const cr = Banks.parse(cp);
check("карта: период из шапки", cr.header.from === "2026-10-31" && cr.header.to === "2026-11-07");
check("карта: 3 завершённые операции, отклонённая пропущена", cr.txs.length === 3 && cr.header.notCompleted === 1 && cr.header.broken === 0);
check("карта: знак по словам «Получение/Отправление»", cr.txs.filter(t => t.amount > 0).length === 1 && cr.txs.filter(t => t.amount < 0).length === 2);
check("карта: дата и время", cr.txs[0].date === "2026-11-07" && cr.txs[0].time === "22:16:26");
check("карта: описание из мест и детализации", /ONLINE SERVIC/.test(cr.txs[0].details) && /TRANSFERS AK AM/.test(cr.txs[0].details));
check("карта: пришло и сразу ушло найдено как пара", cr.header.pairs === 1 && cr.txs.filter(t => t.pair).length === 2);
check("карта: проверка состава пройдена", cr.bank.validate(cr.txs, cr.header).ok === true);

const v = AL.validate(txs, header);
check("проверка состава пройдена", v.ok === true && v.outside === 0 && v.count === 9);
check("приход и расход посчитаны", v.income === 321.78 && Math.abs(v.expense - 350.92) < 0.005);
check("пустая выписка не проходит проверку", AL.validate([], header).ok === false);
const out = AL.validate([{ date: "2027-01-01", amount: -1 }], header);
check("дата вне периода ловится", out.ok === false && out.outside === 1);

console.log(failed ? `\nПровалено: ${failed}` : "\nВсе проверки пройдены.");
process.exit(failed ? 1 : 0);
