const F = require("../feedback.js");
let failed = 0;
const check = (n, ok) => { console.log((ok ? "OK    " : "ОШИБКА ") + n); if (!ok) failed++; };

const raw = { version: "v4.55", banks: ["БПС-Сбербанк", "ВТБ"], count: 342, section: "overview", width: 390, height: 844, theme: "dark",
  // посторонние поля: в письмо попасть не должны
  txs: [{ date: "2026-10-01", amount: 12345.67, desc: "ОПЛАТА SECRET SHOP CARD 4111 1111" }], amount: 987654.32, iban: "BY00SECRETIBAN" };
const m = F.buildMail("parse", "Выписка не читается", raw);

check("адрес получателя", m.to === "bankanalyzer.help@gmail.com" && m.href.startsWith("mailto:bankanalyzer.help@gmail.com?"));
check("тема содержит тему обращения и версию", m.subject === "Что не так: Не прочиталась выписка (v4.55)");
check("в письме есть текст человека и справка", m.body.includes("Выписка не читается") && m.body.includes("Версия сайта: v4.55") && m.body.includes("БПС-Сбербанк, ВТБ") && m.body.includes("Операций загружено: 342") && m.body.includes("390×844") && m.body.includes("тёмная"));
const all = decodeURIComponent(m.href);
check("суммы, описания, карты и счета из операций в письмо не попадают", !/12345|SECRET|4111|987654|BY00/.test(all));
check("href закодирован: перенос строки и кириллица", m.href.includes("%0A") && !/\s/.test(m.href));

const e = F.buildMail("zzz", "   ", {});
check("пустой текст: подсказка; неизвестная тема: «Другое»", e.body.startsWith("(опишите") && e.subject === "Что не так: Другое");
check("без данных: прочерки и нули, ничего не падает", e.body.includes("Банки: —") && e.body.includes("Операций загружено: 0") && e.body.includes("0×0"));
check("длинный текст обрезается", F.body("other", "а".repeat(5000), {}).split("\n")[0].length <= F.MAX_TEXT);
check("банков не больше 8, названия обрезаются", F.info({ banks: Array(20).fill("Б".repeat(100)) }).banks.length === 8 && F.info({ banks: ["Б".repeat(100)] }).banks[0].length === 40);
check("мусор в числах не ломает", F.info({ count: "abc", width: -5, height: NaN }).count === 0 && F.info({ width: -5 }).screen === "0×0");
check("четыре темы", F.TOPICS.length === 4 && F.TOPICS.every(t => t.id && t.label));

{
  const b = F.buildMail("parse", "x", Object.assign({}, raw, { unread: 3, mismatch: true, secret: "SECRET9" })).body;
  check("в справке видно, сколько операций не прочитано и сошлись ли суммы", b.includes("Не прочитано операций: 3") && b.includes("не сошлись") && !b.includes("SECRET9"));
}

if (failed) { console.log("Не пройдено проверок: " + failed); process.exit(1); }
console.log("Все проверки пройдены.");
