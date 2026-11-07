// Проверка файла разбора и фильтра имён людей. Запуск из папки проекта:  node tests/test_backup.js
const B = require("../backup.js");
const Cat = require("../categories.js");
let failed = 0;
const check = (name, ok) => { if (!ok) failed++; console.log((ok ? "OK    " : "FAIL  ") + name); };
const throws = f => { try { f(); return false; } catch (e) { return true; } };

const evil2 = JSON.parse('{"app":"bank-analyzer","acctNames":{"7933-abc":"Мама","__proto__":"Хак","-":5,"k":"' + "x".repeat(60) + '"}}');
const c2 = B.sanitize(evil2);
check("подписи счетов: берутся только строки до 40 знаков, опасные ключи отброшены", Object.keys(c2.acctNames).join() === "7933-abc" && Object.getPrototypeOf(c2.acctNames) === Object.prototype && ({}).Хак === undefined);
check("без подписей счетов в файле получается пустой словарь", Object.keys(B.sanitize({ app: "bank-analyzer" }).acctNames).length === 0);
check("чужой файл отклоняется", throws(() => B.sanitize({ app: "x" })) && throws(() => B.sanitize(null)) && throws(() => B.sanitize([])));
const evil = JSON.parse('{"app":"bank-analyzer","rules":{"__proto__":"Хак","-1|A":"Продукты","-2|B":5,"constructor":"x"},"txRules":{"k":"Кафе"},"icons":{"Продукты":"cart"},"budgets":{"Продукты":100,"Кафе":-5,"Х":"abc","__proto__":7},"calc":{"income":3000,"saveMode":"pct","evil":1,"other":"x"},"cats":["Моя",5,null,"__x"],"txs":[{"date":"2026-01-05","amount":-10.5,"details":"Магазин","mcc":"5411","extra":"1","__proto__":{"a":1}},{"date":"плохо","amount":1,"details":"x"},{"date":"2026-01-06","amount":"1","details":"x"},"строка",null],"statements":[{"bank":"mtb","bankName":"МТБанк","from":"2026-01-01","to":"2026-01-31","count":1,"check":{"ok":true,"income":5,"bad":{"a":1}}},7]}');
const c = B.sanitize(evil);
check("опасные ключи и неверные типы в правилах отброшены", Object.keys(c.rules).join() === "-1|A" && Object.getPrototypeOf(c.rules) === Object.prototype && ({}).Хак === undefined);
check("бюджеты: только положительные числа", JSON.stringify(c.budgets) === '{"Продукты":100}');
check("калькулятор: только известные поля", JSON.stringify(c.calc) === '{"income":3000,"saveMode":"pct"}');
check("категории: только строки", c.cats.join() === "Моя,__x");
check("операции: валидная осталась, лишние поля убраны, плохие отброшены", c.txs.length === 1 && c.txs[0].mcc === "5411" && c.txs[0].extra === undefined && Object.keys(c.txs[0]).sort().join() === "amount,date,details,mcc");
check("выписки: проверка очищена, мусор отброшен", c.statements.length === 1 && c.statements[0].check.ok === true && c.statements[0].check.bad === undefined);
check("слишком много операций отклоняется", throws(() => B.sanitize({ app: "bank-analyzer", txs: new Array(100001).fill({}) })));
const old = B.sanitize({ app: "bank-analyzer", rules: {}, txs: [{ date: "2026-01-01", amount: -1, details: "a" }], header: { bank: "mtb", from: "2026-01-01", to: "2026-01-31" } });
check("старый файл без списка выписок: шапка сохранена", old.statements.length === 0 && old.header.bank === "mtb" && old.header.from === "2026-01-01");

check("ФИО скрываются, магазины нет",
  Cat.looksLikePerson("ИВАНОВ ИВАН ИВАНОВИЧ") &&
  Cat.looksLikePerson("Петрова Анна Сергеевна") && Cat.looksLikePerson("Сидоров И.П.") && Cat.looksLikePerson("IVANOV I.I.") &&
  !Cat.looksLikePerson("EVROOPT MINSK") && !Cat.looksLikePerson("Burger King") && !Cat.looksLikePerson("Фикс Прайс") && !Cat.looksLikePerson("A1 BY"));

console.log(failed ? `\nПровалено проверок: ${failed}` : "\nВсе проверки пройдены.");
process.exit(failed ? 1 : 0);
