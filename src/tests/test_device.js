// Память между визитами: описание сохранённой выписки, снимок, хранилище на IndexedDB (поддельное). Запуск: node tests/test_device.js
const D = require("../device.js");
const B = require("../backup.js");
let failed = 0;
const check = (name, ok) => { if (!ok) failed++; console.log((ok ? "OK    " : "FAIL  ") + name); };

const txs = [{ date: "2026-10-03", amount: -12.5, details: "Евроопт" }, { date: "2026-10-28", amount: -40, details: "Кафе" }, { date: "2026-10-05", amount: 900, details: "Зарплата" }];
const sts = [{ bank: "mtb", bankName: "МТБанк", from: "2026-10-01", to: "2026-10-31", count: 3, added: 3, skipped: 0, check: null }];
const now = new Date("2026-11-10T12:00:00Z");
const snap = D.makeSnapshot(txs, sts, { bank: "mtb", from: "2026-10-01", to: "2026-10-31" }, new Date("2026-11-08T09:00:00Z"));

const info = D.describe(snap, now);
check("описание: банк, период, число операций", info.banks.join() === "МТБанк" && info.period === "01.10.2026–31.10.2026" && info.count === 3);
check("описание: возраст копии в днях", info.daysAgo === 2 && D.when(info) === "2 дн. назад" && !info.old);
check("подпись читается по-русски", D.label(info) === "МТБанк, 01.10.2026–31.10.2026, 3 операции");
check("слова «операция»", D.word(1) === "операция" && D.word(2) === "операции" && D.word(5) === "операций" && D.word(11) === "операций" && D.word(21) === "операция");
check("пустая или чужая копия не описывается", D.describe(null) === null && D.describe({ txs: [] }) === null && D.describe({}) === null);
check("давняя копия помечается", D.describe(D.makeSnapshot(txs, sts, {}, new Date("2025-01-01")), now).old === true);
check("без шапки период берётся из дат операций", D.describe(D.makeSnapshot(txs, [], {}, now), now).period === "03.10.2026–28.10.2026");
check("«сегодня» и «вчера»", D.when({ daysAgo: 0 }) === "сегодня" && D.when({ daysAgo: 1 }) === "вчера");

// Копия проходит ту же проверку, что и файл разбора: мусор и опасные ключи не попадают на страницу
const dirty = JSON.parse(JSON.stringify(snap));
dirty.txs.push({ date: "плохо", amount: 1, details: "x" }, "строка");
dirty.statements.push(7);
const clean = B.sanitize(dirty);
check("копия проходит проверку как файл разбора", clean.txs.length === 3 && clean.statements.length === 1 && clean.header.bank === "mtb");

// Охват правил
const known = t => t.details === "Евроопт";
const cov = D.coverage(txs, known);
check("охват правил: считаются только траты", cov.total === 2 && cov.known === 1 && cov.share === 0.5);
check("охват правил: пусто — не ломается", D.coverage([], known).share === 0 && D.coverage(null, known).total === 0);

// Хранилище на поддельном IndexedDB
function fakeIDB() {
  const data = {};
  return { open() {
    const rq = {};
    setTimeout(() => {
      rq.result = { createObjectStore() {}, close() {},
        transaction() {
          const t = {}, st = {
            get: k => { const r = { result: data[k] }; setTimeout(() => t.oncomplete(), 0); return r; },
            put: (v, k) => { data[k] = JSON.parse(JSON.stringify(v)); const r = {}; setTimeout(() => t.oncomplete(), 0); return r; },
            delete: k => { delete data[k]; const r = {}; setTimeout(() => t.oncomplete(), 0); return r; } };
          t.objectStore = () => st; return t;
        } };
      rq.onupgradeneeded && rq.onupgradeneeded(); rq.onsuccess();
    }, 0);
    return rq;
  } };
}
(async () => {
  check("без IndexedDB хранилища нет", D.openStore(null) === null && D.openStore(undefined) === null);
  const store = D.openStore(fakeIDB());
  check("пустое хранилище ничего не возвращает", (await store.get()) === undefined);
  await store.put(snap);
  const back = await store.get();
  check("сохранённое читается обратно", back && back.txs.length === 3 && D.describe(back, now).count === 3);
  await store.del();
  check("«Забыть» стирает копию", (await store.get()) === undefined);
  console.log(failed ? "ОШИБКА: " + failed : "Все проверки пройдены");
  process.exit(failed ? 1 : 0);
})();
