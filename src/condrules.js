// Правила с условиями: «если в названии есть текст и сумма в пределах, то категория».
// Чистые функции, без доступа к странице. Правило: { t: текст, min, max (числа или null, по модулю суммы), kind: "any" | "expense" | "income", c: категория }.
(function (root) {
  "use strict";
  const MAX_RULES = 50, MAX_TEXT = 40;
  const KINDS = ["any", "expense", "income"];
  const norm = s => String(s == null ? "" : s).toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  const num = v => { if (v === null || v === undefined || v === "") return null; const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[\s ]/g, "").replace(",", ".")); return isFinite(n) && n >= 0 ? n : null; };

  // Очищает одно правило; без текста и без границ суммы правило не имеет смысла (подошло бы ко всему) и отбрасывается
  function clean(r) {
    if (!r || typeof r !== "object") return null;
    const t = norm(r.t).slice(0, MAX_TEXT), c = typeof r.c === "string" ? r.c.trim().slice(0, 40) : "";
    const min = num(r.min), max = num(r.max);
    if (!c || (!t && min === null && max === null)) return null;
    if (min !== null && max !== null && min > max) return null;
    return { t, min, max, kind: KINDS.includes(r.kind) ? r.kind : "any", c };
  }
  function cleanList(list) {
    if (!Array.isArray(list)) return [];
    return list.map(clean).filter(Boolean).slice(0, MAX_RULES);
  }
  function matches(r, tx) {
    const a = tx.amount || 0, abs = Math.abs(a);
    if (r.kind === "expense" && !(a < 0)) return false;
    if (r.kind === "income" && !(a > 0)) return false;
    if (r.min !== null && abs < r.min - 1e-9) return false;
    if (r.max !== null && abs > r.max + 1e-9) return false;
    return !r.t || norm(tx.details).includes(r.t);
  }
  // Первое подходящее правило (порядок в списке = приоритет) или null
  function firstMatch(rules, tx) {
    for (const r of rules || []) if (matches(r, tx)) return r;
    return null;
  }
  // Человеческая запись правила для списка
  function describe(r) {
    const parts = [];
    if (r.t) parts.push(`в названии «${r.t}»`);
    if (r.min !== null && r.max !== null) parts.push(`сумма от ${r.min} до ${r.max}`);
    else if (r.min !== null) parts.push(`сумма от ${r.min}`);
    else if (r.max !== null) parts.push(`сумма до ${r.max}`);
    if (r.kind === "expense") parts.push("только расходы");
    if (r.kind === "income") parts.push("только поступления");
    return parts.join(", ");
  }
  const api = { clean, cleanList, matches, firstMatch, describe, MAX_RULES };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.CondRules = api;
})(typeof window !== "undefined" ? window : globalThis);
