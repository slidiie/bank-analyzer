// Тест подсказок для неразобранных групп на выдуманных данных.
// Запуск из папки проекта:  node tests/test_hints.js

const H = require("../hints.js");
const Cat = require("../categories.js");
let failed = 0;
const check = (n, ok) => { console.log((ok ? "OK    " : "FAIL  ") + n); if (!ok) failed++; };

const tx = (details, amount) => ({ details, amount, date: "2026-10-05" });
const grp = (key, items) => ({ key, tx: items[0], items, sum: items.reduce((a, t) => a + t.amount, 0) });

const gamb = grp("g", [tx("ARENA PLAY MINSK BY Перевод на БПК МТБ в системе Р2Р", 120)]);
const back = grp("r", [tx("ANNA TEST SHOP", 100), tx("ANNA TEST SHOP", -95)]);
const person = grp("p", [tx("Перевод Петров П.П.", -50)]);
const plain = grp("x", [tx("Покупка в магазине", -30)]);
const smallBack = grp("s", [tx("Некто Некто", 100), tx("Некто Некто", -10)]);

const r = H.transferHints([gamb, back, person, plain]);
const by = Object.fromEntries(r.map(h => [h.key, h]));

check("игровая площадка: подсказка с категорией", by.g && by.g.kind === "gambling" && by.g.cat === Cat.GAMBLING);
check("пришло и ушло почти поровну: свои счета", by.r && by.r.kind === "roundtrip" && by.r.cat === Cat.OWN);
check("перевод человеку: подсказка без категории", by.p && by.p.kind === "person" && by.p.cat === null);
check("обычная покупка: подсказки нет", !by.x);
check("не больше одной подсказки на группу", r.length === 3);
check("сильно разные суммы туда и обратно: не свои", !H.transferHints([smallBack]).some(h => h.kind === "roundtrip"));
check("пустой список и пустые группы не падают", H.transferHints([]).length === 0 && H.transferHints([{ key: "e", items: [] }]).length === 0 && H.transferHints(null).length === 0);
check("тексты подсказок не пустые", r.every(h => h.text && h.text.length > 10));

console.log(failed ? `\nОшибок: ${failed}` : "\nВсе проверки пройдены");
process.exit(failed ? 1 : 0);
