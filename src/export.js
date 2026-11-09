// export.js: выгрузка результатов в таблицу (CSV, который открывается в Excel и Google Таблицах).
// Разделитель «;», дробная часть через запятую: так Excel с русскими настройками читает числа как числа.
// Работает и в браузере (глобальный объект Exporter), и в Node (для тестов).

(function (root) {
  "use strict";

  const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const monthTitle = ym => MONTHS[Number(ym.slice(5, 7)) - 1] + " " + ym.slice(0, 4);
  const num = n => n.toFixed(2).replace(".", ",");

  // Ячейка CSV. Текст, начинающийся с = + - @, Excel принял бы за формулу: добавляем апостроф.
  function cell(v, isText) {
    let s = v == null ? "" : String(v);
    if (isText && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[;"\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  const row = (cells, textFlags) => cells.map((c, i) => cell(c, textFlags ? textFlags[i] : false)).join(";");

  // opts: { categoryOf(tx), ownCat, loanCat, savingsCat, bankNames: {id: имя} }
  function kind(tx, cat, opts) {
    if (cat === opts.ownCat) return "между своими (не в счёт)";
    if (cat === opts.loanCat) return "дал в долг (не в счёт)";
    if (opts.savingsCat && cat === opts.savingsCat) return "накопления (не в счёт)";
    return tx.amount < 0 ? "расход" : "доход";
  }

  // Все операции: по одной строке на операцию, от старых к новым
  function operationsCsv(txs, opts) {
    const names = opts.bankNames || {};
    const lines = [row(["Дата", "Время", "Банк", "Сумма", "Валюта", "Категория", "Тип", "Описание"].concat(opts.noteOf ? ["Заметка"] : []))];
    [...txs].sort((a, b) => ((a.date || "") + (a.time || "") < (b.date || "") + (b.time || "") ? -1 : 1)).forEach(tx => {
      const cat = opts.categoryOf(tx) || "Не разобрано";
      lines.push(row([tx.date, tx.time || "", names[tx.bank] || tx.bank || "", num(tx.amount), tx.currency || "BYN", cat, kind(tx, cat, opts), tx.details || ""].concat(opts.noteOf ? [opts.noteOf(tx) || ""] : []),
        [false, false, true, false, false, true, false, true, true]));
    });
    return lines.join("\r\n") + "\r\n";
  }

  // Итоги: расходы по категориям и месяцам. Переводы между своими и долги в расходы не входят.
  function summaryCsv(txs, opts) {
    const byCat = new Map(), months = new Set();
    const totalByMonth = new Map();
    let own = 0, loan = 0, saved = 0, income = 0;
    for (const tx of txs) {
      const cat = opts.categoryOf(tx) || "Не разобрано";
      if (tx.amount > 0) {
        if (opts.savingsCat && cat === opts.savingsCat) saved -= Math.round(tx.amount * 100);
        else if (cat !== opts.ownCat) income += Math.round(tx.amount * 100);
        continue;
      }
      const sum = Math.round(-tx.amount * 100);
      if (cat === opts.ownCat) { own += sum; continue; }
      if (cat === opts.loanCat) { loan += sum; continue; }
      if (opts.savingsCat && cat === opts.savingsCat) { saved += sum; continue; }
      const ym = (tx.date || "").slice(0, 7);
      if (!ym) continue;
      months.add(ym);
      if (!byCat.has(cat)) byCat.set(cat, new Map());
      const m = byCat.get(cat);
      m.set(ym, (m.get(ym) || 0) + sum);
      totalByMonth.set(ym, (totalByMonth.get(ym) || 0) + sum);
    }
    const ms = [...months].sort();
    const total = m => [...m.values()].reduce((a, b) => a + b, 0);
    const cats = [...byCat.entries()].sort((a, b) => total(b[1]) - total(a[1]));
    const c2 = v => num((v || 0) / 100);
    const lines = [row(["Категория", ...ms.map(monthTitle), "Итого"])];
    cats.forEach(([cat, m]) => lines.push(row([cat, ...ms.map(ym => c2(m.get(ym))), c2(total(m))], [true])));
    lines.push(row(["Итого расходов", ...ms.map(ym => c2(totalByMonth.get(ym))), c2(total(totalByMonth))]));
    lines.push("");
    lines.push(row(["Не в счёт: между своими", c2(own)]));
    lines.push(row(["Не в счёт: дал в долг", c2(loan)]));
    if (saved) lines.push(row(["Не в счёт: отложено в накопления", c2(saved)]));
    lines.push(row(["Доходы (без переводов между своими)", c2(income)]));
    return lines.join("\r\n") + "\r\n";
  }

  const api = { cell, operationsCsv, summaryCsv, monthTitle };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Exporter = api;
})(typeof self !== "undefined" ? self : this);
