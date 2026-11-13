// Проверка файла разбора: из присланного JSON берём только ожидаемые поля ожидаемых типов.
// Лишние и опасные ключи (например __proto__) отбрасываются, размеры ограничены.
// Чистые функции без доступа к странице: их можно проверять тестами.
(function (root) {
  "use strict";

  const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);
  const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
  const str = (v, max) => (typeof v === "string" && v.length <= max ? v : null);
  const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const LIMITS = { entries: 20000, txs: 100000, statements: 200, cats: 200 };

  // Словарь «ключ → строка»: правила по получателям и по отдельным операциям
  function cleanStrMap(src, maxVal) {
    const out = {};
    if (!isObj(src)) return out;
    let n = 0;
    for (const k of Object.keys(src)) {
      if (BAD_KEYS.has(k) || k.length > 400 || n >= LIMITS.entries) continue;
      const v = str(src[k], maxVal);
      if (v) { out[k] = v; n++; }
    }
    return out;
  }
  function cleanBudgets(src) {
    const out = {};
    if (!isObj(src)) return out;
    for (const k of Object.keys(src)) {
      const v = num(src[k]);
      if (BAD_KEYS.has(k) || k.length > 80 || v === null || v <= 0 || v > 1e9) continue;
      out[k] = v;
    }
    return out;
  }
  function cleanCalc(src) {
    const out = {};
    if (!isObj(src)) return out;
    for (const k of ["income", "obligations", "other", "rentNew", "saveVal"]) {
      const v = num(src[k]);
      if (v !== null && v >= 0 && v <= 1e9) out[k] = v;
    }
    if (src.saveMode === "pct" || src.saveMode === "byn") out.saveMode = src.saveMode;
    return out;
  }
  function cleanTx(t) {
    if (!isObj(t)) return null;
    const amount = num(t.amount);
    const details = str(t.details, 2000);
    if (amount === null || details === null) return null;
    if (t.date != null && !(typeof t.date === "string" && DATE.test(t.date))) return null;
    const o = { date: t.date || null, amount, details };
    for (const k of ["regDate", "time", "type", "currency", "cur", "mcc", "card", "bank", "purpose", "place", "bankCat"]) {
      const v = str(t[k], 300); if (v !== null) o[k] = v;
    }
    // Формат проверяем там, где он известен: файл разбора мог прийти от другого человека (формула вместо валюты и т. п.)
    if (o.currency !== undefined && !/^[A-Z]{3}$/.test(o.currency)) delete o.currency;
    if (o.time !== undefined && !/^\d{2}:\d{2}(:\d{2})?$/.test(o.time)) delete o.time;
    if (t.pending === true) o.pending = true;
    for (const k of ["balance", "origAmount", "orig", "src", "pair"]) {
      const v = num(t[k]); if (v !== null) o[k] = v;
    }
    // Комиссия перевода между своими: только у пары, положительная и меньше самой суммы
    { const v = num(t.pfee); if (v !== null && o.pair && amount < 0 && v >= 0.01 && v < -amount) o.pfee = v; }
    return o;
  }
  function cleanStatement(s) {
    if (!isObj(s)) return null;
    const o = { bank: str(s.bank, 40) || "", bankName: str(s.bankName, 80) || "" };
    for (const k of ["from", "to"]) o[k] = typeof s[k] === "string" && DATE.test(s[k]) ? s[k] : null;
    for (const k of ["count", "added", "skipped"]) o[k] = num(s[k]) || 0;
    if (typeof s.currency === "string" && /^[A-Z]{3}$/.test(s.currency)) o.currency = s.currency;
    // Банк не из списка: как проверено чтение (итоги, остатки, не сошлось, проверить нечем)
    if (s.universal === true) { o.universal = true; if (typeof s.proof === "string" && /^(totals|balance|mismatch|none|partial|accounts)$/.test(s.proof)) o.proof = s.proof; }
    if (isObj(s.check)) {
      const c = {};
      for (const k of Object.keys(s.check)) {
        const v = s.check[k];
        if (!BAD_KEYS.has(k) && k.length <= 40 && (typeof v === "number" ? Number.isFinite(v) : typeof v === "boolean")) c[k] = v;
      }
      o.check = c;
    }
    return o;
  }

  // Возвращает очищенные данные или бросает ошибку с понятным текстом
  function sanitize(data) {
    if (!isObj(data) || data.app !== "bank-analyzer") throw new Error("это не файл разбора");
    const out = {
      app: "bank-analyzer",
      rules: cleanStrMap(data.rules, 80),
      txRules: cleanStrMap(data.txRules, 80),
      notes: cleanStrMap(data.notes, 200),
      condRules: (typeof require !== "undefined" ? require("./condrules.js") : root.CondRules).cleanList(data.condRules),
      splits: (typeof require !== "undefined" ? require("./splits.js") : root.Splits).cleanMap(data.splits),
      icons: cleanStrMap(data.icons, 30),
      colors: cleanStrMap(data.colors, 12),
      acctNames: cleanStrMap(data.acctNames, 40),
      budgets: cleanBudgets(data.budgets),
      calc: cleanCalc(data.calc),
      rates: (typeof require !== "undefined" ? require("./rates.js") : root.Rates).clean(data.rates),
      cats: Array.isArray(data.cats) ? data.cats.slice(0, LIMITS.cats).map(c => str(c, 40)).filter(Boolean) : [],
      txs: [], statements: [], header: {},
    };
    if (Array.isArray(data.txs)) {
      if (data.txs.length > LIMITS.txs) throw new Error("в файле слишком много операций");
      out.txs = data.txs.map(cleanTx).filter(Boolean);
    }
    if (Array.isArray(data.statements)) out.statements = data.statements.slice(0, LIMITS.statements).map(cleanStatement).filter(Boolean);
    if (isObj(data.header)) {
      out.header = { bank: str(data.header.bank, 40) || undefined,
        from: typeof data.header.from === "string" && DATE.test(data.header.from) ? data.header.from : undefined,
        to: typeof data.header.to === "string" && DATE.test(data.header.to) ? data.header.to : undefined };
    }
    return out;
  }

  const api = { sanitize };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Backup = api;
})(typeof self !== "undefined" ? self : this);
