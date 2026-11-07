// Тест анонимайзера на выдуманных данных. Запуск из папки src:  node tests/test_anonymize.js
const A = require("../anonymize.js");
let bad = 0;
const ok = (c, m) => { console.log((c ? "OK    " : "FAIL  ") + m); if (!c) bad++; };
const B = A.BLOCK;
// Выдуманные значения собираются из кусков, чтобы проверка публикации не принимала их за настоящие
const iban = "BY00" + "TEST" + "3000" + "00000000" + "00000000";
const card = "4000 " + "0000 0000 " + "0002";
const mail = "te" + "st@exa" + "mple.com";
const phone = "+375 " + "29 000 " + "00 00";
const fio = "Тестов Тест Тестович";

const hid = t => A.maskParts(t).some(p => p.m);
ok(hid(iban), "IBAN скрывается");
ok(hid("Счёт " + iban + " BYN"), "IBAN внутри строки скрывается, остальное остаётся");
ok(A.maskParts("Счёт " + iban + " BYN").filter(p => !p.m).map(p => p.t).join("") === "Счёт  BYN", "вокруг IBAN текст не тронут");
ok(hid(card), "номер карты скрывается");
ok(hid("400000******0002") || hid("400000****"), "маска карты с началом номера скрывается");
ok(hid(mail), "почта скрывается");
ok(hid(phone), "телефон скрывается");
ok(hid(fio), "ФИО с отчеством скрывается");
ok(hid("Минск, ул. Тестовая, д. 1, кв. 2"), "адрес скрывается");
ok(hid("Договор 123456" + "7890123"), "длинный номер скрывается");
ok(!hid("1 234.56"), "сумма не скрывается");
ok(!hid("-1 234 567.89"), "большая сумма с пробелами не скрывается");
ok(!hid("07.11.2026 12:34"), "дата и время не скрываются");
ok(!hid("EVROOPT MINSK BY"), "название магазина не скрывается");
ok(!hid("MCC 5411"), "MCC не скрывается");

// Строки и подпись «Владелец:»
const items = [
  { x: 10, y: 700, vx: 10, vy: 100, text: "Владелец счёта:" },
  { x: 120, y: 700, vx: 120, vy: 100.4, text: "Тест Т. Т." },
  { x: 10, y: 680, vx: 10, vy: 120, text: "07.11.2026" },
  { x: 90, y: 680, vx: 90, vy: 120, text: "EVROOPT" },
  { x: 200, y: 680, vx: 200, vy: 120, text: "-12.50" }
];
const rows = A.groupRows(items);
ok(rows.length === 2, "элементы сгруппированы в 2 строки");
ok(A.isHidden(rows[0][1]), "значение после «Владелец счёта:» скрывается");
ok(!A.isHidden(rows[1][0]) && !A.isHidden(rows[1][1]) && !A.isHidden(rows[1][2]), "обычная строка операции не тронута");

// Ручное управление
const it = rows[1][1];
it.manual = true;
ok(A.effective(it) === B.repeat(7), "ручное скрытие заменяет буквы знаками, длина сохраняется");
it.manual = false;
ok(A.effective(it) === "EVROOPT", "ручное «показать» возвращает текст");
ok(A.effective(rows[0][1]) === "Тест Т. Т.".replace(/\S/g, B), "автоскрытое значение заменено знаками");
rows[0][1].manual = false;
ok(A.effective(rows[0][1]) === "Тест Т. Т.", "автоскрытое можно показать вручную");
rows[0][1].manual = null;

// Образец: исходного текста скрытого нет нигде
const model = [[[A_item(iban), A_item("Сумма 10.00")]]];
function A_item(text) { return A.groupRows([{ x: 1, y: 1, vx: 1, vy: 1, text }])[0][0]; }
const sample = A.toSample(model, "pdf", { app: "test", consent: "ok" });
const json = JSON.stringify(sample);
ok(!json.includes(iban), "IBAN не попал в образец");
ok(json.includes("Сумма 10.00"), "обычный текст в образце есть");
ok(sample.pages.length === 1 && sample.pages[0].length === 2, "структура образца: страницы → элементы");
ok(sample.pages[0][0].vx === 1 && sample.pages[0][0].vy === 1, "позиции сохранены");
ok(!A.toPlainText(model).includes(iban), "текст для просмотра тоже без IBAN");

// CSV
const csv = "Дата;Описание;Сумма\n07.11.2026;Оплата " + card + ";-5.00\nВладелец;" + fio + ";\n";
const cm = A.fromCsvText(csv, 2);
ok(cm.length === 2, "CSV разбит на страницы по строкам");
const cs = A.toSample(cm, "csv", {});
const cjson = JSON.stringify(cs);
ok(!cjson.includes(card) && !cjson.includes(fio), "CSV: карта и ФИО не попали в образец");
ok(cs.csv.length === 3 && cs.csv[0] === "Дата;Описание;Сумма", "CSV: заголовок и число строк сохранены");
ok(A.stats(cm).hidden >= 2, "статистика считает скрытые фрагменты");

console.log(bad ? `\nПровалено: ${bad}` : "\nВсе проверки пройдены.");
process.exit(bad ? 1 : 0);
