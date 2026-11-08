// hints.js: подсказки для неразобранных групп операций («Разобрать»).
// transferHints(groups) смотрит на группу и, если видит знакомую картину, предлагает вариант.
// Категорию сам не назначает: подсказка только показывает кнопку, решает человек.
// Группа: { key, tx, items: [операции], sum }. Работает и в браузере (Hints), и в Node (для тестов).

(function (root) {
  "use strict";
  const cats = () => (typeof module !== "undefined" && module.exports ? require("./categories.js") : root.Categories);

  // Приходит и уходит почти поровну: вероятно, перевод между своими счетами
  const NEAR_ZERO = 0.2;

  // Суммы прихода и расхода по ключу без знака. На сайте ключ группы начинается со знака («+» или «−»),
  // поэтому приход и расход по одному месту лежат в разных группах; сводим их по всем операциям.
  const bare = k => String(k || "").replace(/^[+-]/, "");
  function totals(all, C) {
    const m = new Map();
    for (const t of all || []) {
      if (!t || !Number.isFinite(t.amount)) continue;
      const k = bare(C.merchantKey(t));
      const s = m.get(k) || { in: 0, out: 0 };
      if (t.amount > 0) s.in += t.amount; else s.out += -t.amount;
      m.set(k, s);
    }
    return m;
  }

  function hintFor(g, C, tot) {
    const items = (g && g.items) || [];
    const tx = (g && g.tx) || items[0];
    if (!tx) return null;
    if (C.maybeGamblingPayout(tx)) {
      return { key: g.key, kind: "gambling", cat: C.GAMBLING, text: "Похоже на вывод с игровой площадки?" };
    }
    const s = tot && tot.get(bare(g.key));
    const inSum = s ? s.in : items.reduce((a, t) => a + (t.amount > 0 ? t.amount : 0), 0);
    const outSum = s ? s.out : items.reduce((a, t) => a + (t.amount < 0 ? -t.amount : 0), 0);
    if (inSum > 0 && outSum > 0 && Math.abs(inSum - outSum) <= NEAR_ZERO * Math.max(inSum, outSum)) {
      return { key: g.key, kind: "roundtrip", cat: C.OWN, text: "Приходит и уходит почти поровну: похоже на перевод между своими счетами." };
    }
    if (C.looksLikePerson(tx.details)) {
      return { key: g.key, kind: "person", cat: null, text: "Похоже на перевод человеку. Свои или родные: выберите «Переводы между своими»; оплата услуги: подходящую категорию." };
    }
    return null;
  }

  // groups: массив групп; all (необязательно): все операции разбора, чтобы найти встречные суммы в других группах.
  // Возвращает массив подсказок { key, kind, cat, text }, не более одной на группу
  function transferHints(groups, C, all) {
    const cat = C || cats();
    const tot = all ? totals(all, cat) : null;
    return (groups || []).map(g => hintFor(g, cat, tot)).filter(Boolean);
  }

  const api = { transferHints, NEAR_ZERO };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Hints = api;
})(typeof self !== "undefined" ? self : this);
