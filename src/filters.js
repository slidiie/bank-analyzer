// Поиск и фильтры по операциям в списке «Все операции».
// Чистые функции, без доступа к странице. Состояние фильтра живёт только в сессии и никуда не сохраняется.
(function (root) {
  "use strict";

  // Пустой фильтр. query: слова через пробел (все должны найтись); kind: all | expense | income;
  // min, max: границы суммы по модулю, строкой как ввёл человек; cat: "all" или название категории.
  const empty = () => ({ query: "", kind: "all", min: "", max: "", cat: "all" });

  // Нижний регистр, «ё» как «е», лишние пробелы убраны
  const norm = s => String(s == null ? "" : s).toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

  // «1 234,5», «1234.50», «-12» -> число; пусто или не число -> null
  function parseAmount(s) {
    const t = String(s == null ? "" : s).replace(/[\s ]/g, "").replace(",", ".");
    if (!/^[-+]?\d+(\.\d+)?$/.test(t) && !/^[-+]?\.\d+$/.test(t)) return null;
    const n = parseFloat(t);
    return isFinite(n) ? Math.abs(n) : null;
  }

  // Строка, в которой ищем: описание, категория, дата (ISO и привычная) и сумма (с точкой и с запятой)
  function haystack(tx, catOf) {
    const abs = Math.abs(tx.amount || 0);
    const two = abs.toFixed(2);
    const forms = [two, two.replace(".", ","), String(abs), String(abs).replace(".", ",")];
    const d = tx.date || "";
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    const ru = m ? `${m[3]}.${m[2]}.${m[1]}` : "";
    return norm([tx.details, catOf ? catOf(tx) : "", d, ru, ...forms].join(" "));
  }

  function isActive(f) {
    return !!f && (norm(f.query) !== "" || (f.kind && f.kind !== "all") || parseAmount(f.min) !== null || parseAmount(f.max) !== null || (f.cat && f.cat !== "all"));
  }

  // catOf(tx) -> название категории, как её видит человек (для поиска и для фильтра по категории)
  function matches(tx, f, catOf) {
    if (!f) return true;
    if (f.kind === "expense" && !(tx.amount < 0)) return false;
    if (f.kind === "income" && !(tx.amount > 0)) return false;
    const abs = Math.abs(tx.amount || 0), lo = parseAmount(f.min), hi = parseAmount(f.max);
    if (lo !== null && abs < lo - 1e-9) return false;
    if (hi !== null && abs > hi + 1e-9) return false;
    if (f.cat && f.cat !== "all" && (catOf ? catOf(tx) : "") !== f.cat) return false;
    const q = norm(f.query);
    if (q) {
      const hay = haystack(tx, catOf);
      for (const w of q.split(" ")) if (!hay.includes(w)) return false;
    }
    return true;
  }

  const apply = (txs, f, catOf) => (isActive(f) ? txs.filter(t => matches(t, f, catOf)) : txs.slice());

  const api = { empty, norm, parseAmount, haystack, isActive, matches, apply };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Filters = api;
})(typeof self !== "undefined" ? self : this);
