// «Помнит между визитами»: по желанию выписка хранится на этом устройстве (IndexedDB браузера, наружу ничего не уходит).
// Модуль без доступа к странице: хранилище передаётся снаружи, поэтому логику можно проверять тестами.
(function (root) {
  "use strict";

  const DB_NAME = "ba_device_v1", STORE = "snap", KEY = "last";
  const MAX_AGE_DAYS = 400;                          // совсем старую копию не предлагаем открывать молча: пишем возраст

  // Хранилище на IndexedDB: get / put / del возвращают обещания; без IndexedDB возвращается null
  function openStore(idb) {
    if (!idb) return null;
    const open = () => new Promise((res, rej) => {
      const rq = idb.open(DB_NAME, 1);
      rq.onupgradeneeded = () => { rq.result.createObjectStore(STORE); };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
      const tx = db.transaction(STORE, mode), rq = fn(tx.objectStore(STORE));
      tx.oncomplete = () => { db.close(); res(rq && rq.result); };
      tx.onerror = tx.onabort = () => { db.close(); rej(tx.error); };
    }));
    return {
      get: () => run("readonly", s => s.get(KEY)),
      put: v => run("readwrite", s => s.put(v, KEY)),
      del: () => run("readwrite", s => s.delete(KEY)),
    };
  }

  // Снимок для хранения: только операции, выписки и шапка. Правила и заметки живут отдельно в localStorage
  function makeSnapshot(txs, statements, header, now) {
    return { app: "bank-analyzer", kind: "device-copy", savedAt: (now || new Date()).toISOString(),
      txs: Array.isArray(txs) ? txs : [], statements: Array.isArray(statements) ? statements : [], header: header || {} };
  }

  // Краткое описание копии для главной: «МТБанк, 01.10–31.10.2026, 340 операций»
  const fmt = d => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.slice(8) + "." + d.slice(5, 7) + "." + d.slice(0, 4) : "");
  function describe(snap, now) {
    if (!snap || !Array.isArray(snap.txs) || !snap.txs.length) return null;
    const names = [...new Set((snap.statements || []).map(s => s && s.bankName).filter(Boolean))];
    const h = snap.header || {};
    const dates = snap.txs.map(t => t && t.date).filter(Boolean).sort();
    const from = h.from || dates[0] || null, to = h.to || dates[dates.length - 1] || null;
    const saved = snap.savedAt ? new Date(snap.savedAt) : null;
    const days = saved && !isNaN(saved) ? Math.max(0, Math.floor(((now || new Date()) - saved) / 86400000)) : null;
    return { banks: names, from, to, count: snap.txs.length, savedAt: snap.savedAt || null, daysAgo: days,
      old: days !== null && days > MAX_AGE_DAYS,
      period: from && to ? fmt(from) + "–" + fmt(to) : "" };
  }

  const word = n => (n % 10 === 1 && n % 100 !== 11 ? "операция" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "операции" : "операций");
  function label(info) {
    if (!info) return "";
    const parts = [];
    if (info.banks.length) parts.push(info.banks.join(", "));
    if (info.period) parts.push(info.period);
    parts.push(info.count + " " + word(info.count));
    return parts.join(", ");
  }
  const when = info => info.daysAgo === null ? "" : info.daysAgo === 0 ? "сегодня" : info.daysAgo === 1 ? "вчера" : info.daysAgo + " дн. назад";

  // Правила уже на месте: сколько операций новой выписки разобрано сохранёнными правилами (без ручной работы)
  function coverage(txs, isKnown) {
    const spend = (txs || []).filter(t => t && t.amount < 0);
    const known = spend.filter(isKnown).length;
    return { total: spend.length, known, share: spend.length ? known / spend.length : 0 };
  }

  const api = { openStore, makeSnapshot, describe, label, when, coverage, word, STORE, DB_NAME };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Device = api;
})(typeof self !== "undefined" ? self : this);
