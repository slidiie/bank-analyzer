// recap.js: «Итог месяца» — 3–5 главных выводов о последнем полном месяце простыми словами.
// Чистые функции без доступа к странице: их можно проверять тестами.
// Работает и в браузере (глобальный объект Recap), и в Node (для тестов).
//
// Вход monthRecap(opts):
//   items:      траты всей выписки [{ date: "2026-10-05", amount: -12.5, cat: "Продукты", name: "ЕВРООПТ" }];
//               amount < 0 — трата, amount > 0 — возврат за покупку (уменьшает траты своей категории).
//               Переводы себе, долги, накопления сюда не передаются: это не траты.
//   fullMonths: полные месяцы выписки по порядку ["2026-08", "2026-09", "2026-10"] (неполные не входят).
//   month:      какой месяц подводить (по умолчанию последний полный).
//   period:     { from, to } — период выписки; нужен, если полных месяцев нет (тогда итог за эти дни без сравнений).
//   unsorted:   названия «неразобранных» категорий (корзины ЕРИП, интернет-банк, «Не разобрано»).
//   fixed:      категории, которые не предлагаем «вернуть к обычному уровню» (жильё, комиссии, здоровье, образование).
//   income:     поступления [{ date, amount > 0 }] без переводов себе и возвратов; нужны для вывода «доход вырос, а траты вместе с ним».
//   regular:    регулярные платежи [{ name, cat, perMonth }] (из Planner.findRegular); подписки берутся из них.
//   subsCats:   категории подписок среди регулярных.
//   nice:       как показать название места (по умолчанию как есть).
// Выход: null (нечего сказать) или
//   { month, partial, days, total, sortedShare, save, lines: [{ kind, text, value }] }.
// Ничего не советует «куда вложить»: только что было и сколько вышло бы при обычном уровне.

(function (root) {
  "use strict";

  const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const MONTHS_NOM = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

  const BASE_MONTHS = 3;      // с чем сравниваем: среднее до трёх предыдущих полных месяцев
  const THIN = 0.4;            // месяц, где трат меньше 40 % обычного, с обычным не сравниваем
  const MIN_USUAL = 20;       // категория меньше 20 BYN в обычный месяц: рост «в 5 раз» ничего не значит
  const MIN_DIFF = 25;        // разница меньше 25 BYN не стоит отдельной строки
  const GROW = 1.3;           // «больше обычного»: от +30 %
  const NEW_CAT = 100;        // категории не было, а теперь от 100 BYN
  const SMALL = 10;           // «мелкая покупка»: до 10 BYN
  const SMALL_MIN_N = 15, SMALL_MIN_SUM = 50;
  const INC_MIN = 100, INC_GROW = 0.1, INC_DIFF = 50;   // доход вырос от +10 % и от +50 BYN (обычный месяц от 100 BYN)
  const SORTED_OK = 0.9;      // разобрано от 90 % трат: оговорка не нужна

  // Числа: пробел между тысячами, без копеек от 100 и выше (в выводах важна величина, а не копейки)
  function money(n) {
    const v = Math.abs(n) >= 100 ? Math.round(Math.abs(n)) : Math.round(Math.abs(n) * 100) / 100;
    let s = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",");
    s = s.replace(/^(\d+)/, d => d.replace(/\B(?=(\d{3})+(?!\d))/g, " "));
    return (n < 0 && v ? "−" : "") + s;
  }
  const plural = (n, one, few, many) => {
    const a = Math.abs(n) % 100, b = a % 10;
    return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
  };
  // «в 2 раза», «в 3,6 раза», «в 5 раз». Округляем до десятых: человек пересчитывает руками, полшага давали «3,5» вместо 3,64
  function times(r) {
    const x = Math.round(r * 10) / 10;
    const s = Number.isInteger(x) ? String(x) : String(x).replace(".", ",");
    return `в ${s} ${Number.isInteger(x) ? plural(x, "раз", "раза", "раз") : "раза"}`;
  }
  function addMonths(ym, n) {
    const [y, m] = ym.split("-").map(Number);
    const t = y * 12 + (m - 1) + n;
    return Math.floor(t / 12) + "-" + String(t % 12 + 1).padStart(2, "0");
  }
  const monthNom = ym => MONTHS_NOM[Number(ym.slice(5, 7)) - 1];
  const monthGen = ym => MONTHS_GEN[Number(ym.slice(5, 7)) - 1];
  const ms = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));

  // Траты по категориям для списка (возвраты уменьшают свою категорию, ниже нуля не уходят)
  function byCat(list) {
    const m = new Map();
    for (const t of list) {
      if (!t || !Number.isFinite(t.amount)) continue;
      const c = t.cat || "Не разобрано";
      m.set(c, (m.get(c) || 0) - t.amount);
    }
    for (const [c, v] of m) if (v <= 0.004) m.delete(c);
    return m;
  }
  const sum = m => [...m.values()].reduce((a, v) => a + v, 0);

  function monthRecap(opts) {
    const o = opts || {};
    const items = (o.items || []).filter(t => t && t.date && Number.isFinite(t.amount));
    const full = (o.fullMonths || []).slice().sort();
    const unsorted = new Set(o.unsorted || ["Не разобрано"]);
    const fixed = new Set(o.fixed || []);
    const subsCats = new Set(o.subsCats || []);
    const nice = typeof o.nice === "function" ? o.nice : (s => s);
    if (!items.length) return null;

    // Какой месяц подводим. Полного месяца нет: подводим период выписки целиком, без сравнений с «обычным»
    const month = o.month && full.includes(o.month) ? o.month : full[full.length - 1] || null;
    let list, days, partial = false;
    if (month) {
      list = items.filter(t => t.date.startsWith(month));
      days = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
    } else {
      const dates = items.map(t => t.date).sort();
      const from = (o.period && o.period.from) || dates[0], to = (o.period && o.period.to) || dates[dates.length - 1];
      list = items.filter(t => t.date >= from && t.date <= to);
      days = Math.round((ms(to) - ms(from)) / 864e5) + 1;
      partial = { from, to };
    }
    const cur = byCat(list);
    const total = sum(cur);
    if (total < 1) return null;
    const sortedSum = [...cur].filter(([c]) => !unsorted.has(c)).reduce((a, [, v]) => a + v, 0);
    const sortedShare = sortedSum / total;

    // «Обычно»: среднее по предыдущим полным месяцам (до трёх), только идущим подряд перед этим месяцем
    const base = [];
    if (month) {
      for (let i = 1; i <= BASE_MONTHS; i++) {
        const ym = addMonths(month, -i);
        if (!full.includes(ym)) break;
        base.push(byCat(items.filter(t => t.date.startsWith(ym))));
      }
    }
    const usual = new Map();
    base.forEach(m => m.forEach((v, c) => usual.set(c, (usual.get(c) || 0) + v / base.length)));
    let usualTotal = sum(usual);
    // Месяц почти без трат (отпуск, карта лежала без дела, выписка за часть месяца): сравнивать с обычным нечестно, «траты упали на 97%» было бы ложью
    let thinNote = "";
    if (month && base.length && usualTotal > 0 && total < usualTotal * THIN) {
      thinNote = `В этом месяце трат всего ${money(total)} BYN при обычных около ${money(usualTotal)} BYN: возможно, карта почти не использовалась, поэтому с обычным месяцем не сравниваем.`;
      base.length = 0; usual.clear();
    }
    const usualWord = base.length === 1 ? `, чем в ${monthNom(addMonths(month, -1)).replace(/ь$/, "е").replace(/й$/, "е").replace(/т$/, "те")}` : " обычного";

    const lines = [];
    // 1. Всего за месяц и к обычному уровню
    if (month && base.length && usualTotal > 0) {
      const d = (total - usualTotal) / usualTotal;
      const how = Math.abs(d) < 0.03 ? "почти как обычно" : `на ${Math.round(Math.abs(d) * 100)}% ${d > 0 ? "больше" : "меньше"}${usualWord}`;
      lines.push({ kind: "total", value: total, text: `Всего потрачено ${money(total)} BYN: ${how}`, short: `Траты: ${how}` });
    } else if (month) {
      lines.push({ kind: "total", value: total, text: `Всего потрачено ${money(total)} BYN, в среднем ${money(total / days)} BYN в день` });
    } else {
      lines.push({ kind: "total", value: total, text: `За ${days} ${plural(days, "день", "дня", "дней")} потрачено ${money(total)} BYN, в среднем ${money(total / days)} BYN в день` });
    }

    // 1б. Доход и траты: прибавка к доходу уходит в траты? (без советов, только арифметика по выписке)
    const inc = (o.income || []).filter(t => t && t.date && t.amount > 0);
    const incIn = ym => inc.filter(t => t.date.startsWith(ym)).reduce((a, t) => a + t.amount, 0);
    // Зарплата, пришедшая то раньше, то позже, даёт «рост дохода» на ровном месте: если в прошлых месяцах доход скачет вдвое, строку не пишем
    const incSteady = !base.length || (() => { const v = base.map((_, i) => incIn(addMonths(month, -(i + 1)))); return Math.min(...v) >= 0.5 * Math.max(...v); })();
    if (month && base.length && usualTotal > 0 && inc.length && incSteady) {
      const incCur = incIn(month);
      const incUsual = [...Array(base.length).keys()].reduce((a, i) => a + incIn(addMonths(month, -(i + 1))), 0) / base.length;
      const dInc = incCur - incUsual, dSpend = total - usualTotal;
      if (incUsual >= INC_MIN && dInc >= INC_DIFF && dInc / incUsual >= INC_GROW) {
        const pi = Math.round(dInc / incUsual * 100), share = Math.max(0, dSpend) / dInc;
        const head = `Доход вырос на ${pi}% (+${money(dInc)} BYN)`;
        let tail;
        if (dSpend / usualTotal < 0.03) tail = dSpend < 0 ? `, а траты снизились на ${money(-dSpend)} BYN: вся прибавка осталась` : ", а траты почти не изменились: вся прибавка осталась";
        else if (share > 1.05) tail = `, а траты выросли сильнее: на ${Math.round(dSpend / usualTotal * 100)}% (+${money(dSpend)} BYN), это больше всей прибавки`;
        else if (share >= 0.9) tail = `, траты выросли почти на столько же (+${money(dSpend)} BYN): почти вся прибавка ушла в расходы`;
        else tail = `, траты выросли на ${Math.round(dSpend / usualTotal * 100)}% (+${money(dSpend)} BYN): на расходы ушло ${Math.round(share * 100)}% прибавки`;
        lines.push({ kind: "income", value: dInc, text: head + tail, short: `Доход вырос на ${pi}%` });
      }
    }

    // 2. Категории, которые выросли заметнее всего (только разобранные: про «Не разобрано» сказать нечего)
    const grew = [];
    if (base.length) {
      for (const [c, v] of cur) {
        if (unsorted.has(c)) continue;
        const u = usual.get(c) || 0;
        if (u >= MIN_USUAL && v >= u * GROW && v - u >= MIN_DIFF) grew.push({ cat: c, cur: v, usual: u, diff: v - u, ratio: v / u });
        else if (u < MIN_USUAL && v >= NEW_CAT && v - u >= MIN_DIFF) grew.push({ cat: c, cur: v, usual: u, diff: v - u, ratio: null });
      }
      grew.sort((a, b) => b.diff - a.diff);
      for (const g of grew.slice(0, 2)) {
        const how = g.ratio == null ? (base.length === 1 ? `${usualWord.replace(/^, чем в /, "в ")} почти не было` : "обычно таких трат почти нет")
          : g.ratio >= 1.9 ? `${times(g.ratio)} больше${usualWord}` : `на ${Math.round((g.ratio - 1) * 100)}% больше${usualWord}`;
        lines.push({ kind: "grew", cat: g.cat, value: g.cur, text: `${g.cat}: ${money(g.cur)} BYN, ${how}`, short: `${g.cat}: ${how}` });
      }
    }

    // 3. Подписки: регулярные платежи из категорий подписок
    const subs = (o.regular || []).filter(r => r && subsCats.has(r.cat) && r.perMonth > 0);
    if (subs.length) {
      const s = subs.reduce((a, r) => a + r.perMonth, 0);
      lines.push({ kind: "subs", value: s, text: `Связь и подписки: ${money(s)} BYN в месяц, это ${money(s * 12)} BYN в год (${subs.length} ${plural(subs.length, "платёж", "платежа", "платежей")})`, short: `Связь и подписки: ${subs.length} регулярных ${plural(subs.length, "платёж", "платежа", "платежей")}` });
    }

    // 4. Мелкие покупки: много мелочи незаметно складывается в заметную сумму
    const small = list.filter(t => t.amount < 0 && -t.amount <= SMALL && !unsorted.has(t.cat || "Не разобрано") && t.cat !== "Комиссии банка");
    const smallSum = small.reduce((a, t) => a - t.amount, 0);
    if (small.length >= SMALL_MIN_N && smallSum >= SMALL_MIN_SUM) {
      lines.push({ kind: "small", value: smallSum, text: `Мелкие покупки до ${SMALL} BYN: ${small.length} ${plural(small.length, "штука", "штуки", "штук")} на ${money(smallSum)} BYN`, short: `Мелкие покупки до ${SMALL} BYN: ${small.length} ${plural(small.length, "штука", "штуки", "штук")}` });
    }

    // 5. Сколько осталось бы, если вернуть выросшие гибкие траты к обычному уровню
    const flex = grew.filter(g => !fixed.has(g.cat) && g.ratio != null);
    const save = Math.round(flex.reduce((a, g) => a + g.diff, 0));
    if (save >= MIN_DIFF) {
      const q = flex.map(g => `«${g.cat}»`), more = flex.length - 2;
      const names = flex.length <= 2 ? q.join(" и ") : `${q[0]}, ${q[1]} и ещё ${more} ${plural(more, "категорию", "категории", "категорий")}`;
      lines.push({ kind: "save", value: save, text: `Если вернуть ${names} к обычному уровню, останется +${money(save)} BYN за месяц` });
    }

    // Что заметно уменьшилось: тоже полезно знать (без оценок «хорошо/плохо»)
    if (base.length && lines.length < 4) {
      const fell = [...usual].filter(([c, u]) => !unsorted.has(c) && !fixed.has(c) && u >= MIN_USUAL && (cur.get(c) || 0) <= u / GROW && (cur.get(c) || 0) > 0 && u - (cur.get(c) || 0) >= MIN_DIFF)
        .map(([c, u]) => ({ cat: c, cur: cur.get(c) || 0, usual: u })).sort((a, b) => (b.usual - b.cur) - (a.usual - a.cur))[0];
      if (fell) lines.push({ kind: "fell", cat: fell.cat, value: fell.cur, text: `${fell.cat}: ${money(fell.cur)} BYN, на ${Math.round((1 - fell.cur / fell.usual) * 100)}% меньше${usualWord}`, short: `${fell.cat}: на ${Math.round((1 - fell.cur / fell.usual) * 100)}% меньше${usualWord}` });
    }

    // Запасные выводы, если строк мало (например, в выписке один месяц): где чаще всего платили и самая крупная категория
    if (lines.length < 3) {
      // Жильё и комиссии почти не зависят от выбора, поэтому называем крупнейшую из остальных
      const named = new Set(lines.map(l => l.cat).filter(Boolean));
      const top = [...cur].filter(([c]) => !unsorted.has(c) && !fixed.has(c) && !named.has(c)).sort((a, b) => b[1] - a[1])[0];
      if (top) lines.push({ kind: "top", cat: top[0], value: top[1], text: `Больше всего из повседневных трат ушло на «${top[0]}»: ${money(top[1])} BYN, ${Math.round(top[1] / total * 100)}% всех трат` });
    }
    if (lines.length < 3) {
      const freq = new Map();
      list.filter(t => t.amount < 0 && t.name && !unsorted.has(t.cat || "Не разобрано")).forEach(t => {
        const f = freq.get(t.name) || { n: 0, s: 0 }; f.n++; f.s -= t.amount; freq.set(t.name, f);
      });
      const often = [...freq].sort((a, b) => b[1].n - a[1].n || b[1].s - a[1].s)[0];
      if (often && often[1].n >= 4) lines.push({ kind: "often", value: often[1].s, text: `Чаще всего платили в «${nice(often[0])}»: ${often[1].n} ${plural(often[1].n, "раз", "раза", "раз")} на ${money(often[1].s)} BYN` });
    }

    // Доля дохода, которая не потрачена (в процентах от дохода: так понятнее, чем в рублях). Без «норм» и советов, только факт и сравнение со своим обычным
    let rate = null;
    {
      let usualPct = null;
      const incCur = month ? incIn(month) : inc.filter(t => t.date >= partial.from && t.date <= partial.to).reduce((a, t) => a + t.amount, 0);
      if (incCur >= INC_MIN) {
        const left = incCur - total, pct = Math.round(Math.abs(left) / incCur * 100);
        let text;
        if (left < 0 && pct === 0) text = `Потрачено почти столько же, сколько пришло: на ${money(-left)} BYN больше дохода`;
        else if (left < 0) text = `Потрачено на ${pct}% больше, чем пришло: ${money(-left)} BYN сверх дохода`;
        else if (pct === 0) text = "Почти весь доход ушёл в траты: не потрачено меньше 1%";
        else text = `Не потрачено ${pct}% дохода (${money(left)} BYN)`;
        if (month && base.length) {
          const incU = [...Array(base.length).keys()].reduce((a, i) => a + incIn(addMonths(month, -(i + 1))), 0) / base.length;
          if (incU >= INC_MIN) {
            const uPct = Math.round((incU - usualTotal) / incU * 100);
            usualPct = uPct;
            if (uPct >= 0 && Math.abs(uPct - Math.round(left / incCur * 100)) >= 3) text += `; обычно ${uPct}%`;
          }
        }
        if (save >= MIN_DIFF && left >= 0) text += `; без выросших трат было бы ${Math.round((left + save) / incCur * 100)}%`;
        rate = Math.round(left / incCur * 100);
        lines.splice(1, 0, { kind: "rate", value: rate, usual: usualPct, text, short: left < 0 ? (pct === 0 ? "Потрачено почти столько же, сколько пришло" : `Потрачено на ${pct}% больше, чем пришло`) : pct === 0 ? "Почти весь доход ушёл в траты" : `Не потрачено ${pct}% дохода` });
      }
    }

    return {
      month, partial, days, total, sortedShare, rate,
      save: save >= MIN_DIFF ? save : 0,
      compared: base.length,
      title: month ? `Итог ${monthGen(month)}` : `Итог за ${days} ${plural(days, "день", "дня", "дней")}`,
      thin: !!thinNote,
      note: (thinNote ? thinNote + " " : "") + (sortedShare < SORTED_OK ? `Выводы по разобранным ${Math.floor(sortedShare * 100)}% трат. Остальное можно уточнить, и итог станет точнее.` : ""),
      lines: lines.slice(0, 5),
    };
  }

  const api = { monthRecap, money, times };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Recap = api;
})(typeof self !== "undefined" ? self : this);
