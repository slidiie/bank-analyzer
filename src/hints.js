// hints.js: подсказки для неразобранных групп операций («Разобрать»).
// transferHints(groups) смотрит на группу и, если видит знакомую картину, предлагает вариант.
// Категорию сам не назначает: подсказка только показывает кнопку, решает человек.
// Группа: { key, tx, items: [операции], sum }. Работает и в браузере (Hints), и в Node (для тестов).

(function (root) {
  "use strict";
  const cats = () => (typeof module !== "undefined" && module.exports ? require("./categories.js") : root.Categories);

  // Приходит и уходит почти поровну: вероятно, перевод между своими счетами
  const NEAR_ZERO = 0.2;

  function hintFor(g, C) {
    const items = (g && g.items) || [];
    const tx = (g && g.tx) || items[0];
    if (!tx) return null;
    if (C.maybeGamblingPayout(tx)) {
      return { key: g.key, kind: "gambling", cat: C.GAMBLING, text: "Похоже на вывод с игровой площадки?" };
    }
    const inSum = items.reduce((a, t) => a + (t.amount > 0 ? t.amount : 0), 0);
    const outSum = items.reduce((a, t) => a + (t.amount < 0 ? -t.amount : 0), 0);
    if (inSum > 0 && outSum > 0 && Math.abs(inSum - outSum) <= NEAR_ZERO * Math.max(inSum, outSum)) {
      return { key: g.key, kind: "roundtrip", cat: C.OWN, text: "Приходит и уходит почти поровну: похоже на перевод между своими счетами." };
    }
    if (C.looksLikePerson(tx.details)) {
      return { key: g.key, kind: "person", cat: null, text: "Похоже на перевод человеку. Свои или родные: выберите «Переводы между своими»; оплата услуги: подходящую категорию." };
    }
    return null;
  }

  // groups: массив групп. Возвращает массив подсказок { key, kind, cat, text }, не более одной на группу
  function transferHints(groups, C) {
    const cat = C || cats();
    return (groups || []).map(g => hintFor(g, cat)).filter(Boolean);
  }

  const api = { transferHints, NEAR_ZERO };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Hints = api;
})(typeof self !== "undefined" ? self : this);
