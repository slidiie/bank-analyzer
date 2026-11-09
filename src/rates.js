// Валюты и ручной курс. Счёт не в белорусских рублях: у каждой операции есть cur (валюта счёта) и orig (сумма в ней).
// Пока курс не задан, amount = orig (суммы в валюте счёта, как раньше). Когда курс задан, amount = orig × курс (BYN за 1 единицу валюты).
// Курс вводит человек сам: автоматических запросов нет (приватность). Чистые функции, работает и в браузере (Rates), и в Node (тесты).
(function (root) {
  "use strict";
  const MAX_CODES = 12, MAX_RATE = 1e6, MAX_DATED = 60;
  const CODE = /^[A-Z]{3}$/;
  const r2 = v => Math.round(v * 100) / 100;
  const toNum = v => { const n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(/[\s ]/g, "").replace(",", ".")); return isFinite(n) ? n : NaN; };

  // Валюта счёта, не равная BYN, или null
  function foreignCode(header) {
    const c = header && typeof header.currency === "string" ? header.currency.trim().toUpperCase() : "";
    return CODE.test(c) && c !== "BYN" && c !== "BYR" ? c : null;
  }
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const okRate = v => v > 0 && v <= MAX_RATE;
  const round6 = v => Math.round(v * 1e6) / 1e6;
  // Курс валюты: { r: основной курс, at: [{ d: "ГГГГ-ММ-ДД", r }] }, at отсортирован по дате. Число или строка (старый формат) = основной курс.
  function cleanEntry(v) {
    const e = { at: [] };
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const r = toNum(v.r);
      if (okRate(r)) e.r = round6(r);
      if (Array.isArray(v.at)) {
        const seen = new Set();
        for (const x of v.at) {
          if (!x || typeof x.d !== "string" || !DATE.test(x.d) || seen.has(x.d)) continue;
          const rr = toNum(x.r);
          if (!okRate(rr)) continue;
          seen.add(x.d); e.at.push({ d: x.d, r: round6(rr) });
          if (e.at.length >= MAX_DATED) break;
        }
        e.at.sort((p, q) => (p.d < q.d ? -1 : 1));
      }
    } else {
      const r = toNum(v);
      if (okRate(r)) e.r = round6(r);
    }
    return e.r === undefined && !e.at.length ? null : e;
  }
  // Принимает { USD: 3.2 } или { USD: { r, at } }: оставляет только допустимые коды и положительные курсы
  function clean(map) {
    const out = {};
    if (!map || typeof map !== "object" || Array.isArray(map)) return out;
    let n = 0;
    for (const k of Object.keys(map)) {
      if (!CODE.test(k) || k === "BYN") continue;
      const e = cleanEntry(map[k]);
      if (!e) continue;
      out[k] = e;
      if (++n >= MAX_CODES) break;
    }
    return out;
  }
  // Курс валюты на дату: последний курс «с даты» не позже даты операции; иначе основной; иначе самый ранний «с даты»; иначе 0
  function rateFor(rates, code, date) {
    const e = rates && rates[code];
    if (!e) return 0;
    if (date && e.at && e.at.length) {
      let hit = null;
      for (const x of e.at) if (x.d <= date) hit = x;
      if (hit) return hit.r;
    }
    if (e.r > 0) return e.r;
    return e.at && e.at.length ? e.at[0].r : 0;
  }
  const has = (rates, code) => rateFor(rates, code, "") > 0;
  // Добавить к операциям выписки cur и orig (копии, исходные не меняются)
  function stamp(txs, header) {
    const c = foreignCode(header);
    if (!c) return txs;
    return txs.map(t => Object.assign({}, t, { cur: c, orig: t.amount }));
  }
  // Валюты, которые есть у операций, по алфавиту
  function codes(txs) {
    const s = new Set();
    (txs || []).forEach(t => { if (t && typeof t.cur === "string" && CODE.test(t.cur)) s.add(t.cur); });
    return [...s].sort();
  }
  // Пересчитать суммы по курсам. Меняет операции на месте. Возвращает коды без курса.
  function apply(txs, rates) {
    const missing = new Set();
    for (const t of txs) {
      if (!t || typeof t.cur !== "string" || typeof t.orig !== "number") continue;
      const k = rateFor(rates, t.cur, t.date);
      if (k > 0) { t.amount = r2(t.orig * k); t.currency = "BYN"; t.rate = k; }
      else { t.amount = t.orig; t.currency = t.cur; delete t.rate; missing.add(t.cur); }
    }
    return [...missing].sort();
  }
  // Сумма для идентификатора операции: исходная, чтобы смена курса не ломала заметки и выбор категорий
  const baseAmount = t => (typeof t.orig === "number" ? t.orig : t.amount);

  const api = { foreignCode, clean, rateFor, has, stamp, codes, apply, baseAmount, toNum };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Rates = api;
})(typeof window !== "undefined" ? window : globalThis);
