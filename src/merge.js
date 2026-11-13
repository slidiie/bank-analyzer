// merge.js: несколько выписок в одном разборе.
// Добавляет новую выписку к уже загруженным без дублей (если периоды пересекаются, повторы пропускаются),
// держит список загруженных выписок и находит переводы между разными выписками (пришло в одном банке,
// ушло из другого). Работает и в браузере (глобальный объект Merge), и в Node (для тестов).

(function (root) {
  "use strict";

  const cents = n => Math.round(n * 100);
  const DAY = 24 * 3600 * 1000;
  const stamp = t => (t.date || "") + " " + (t.time || "00:00:00");
  // Тот же идентификатор операции, что и в analyzer.html (дата, время, сумма, остаток)
  // Для валютных операций (cur, orig) берётся исходная сумма: смена курса не ломает идентификатор
  const baseAmt = tx => (typeof tx.orig === "number" ? tx.orig : tx.amount);
  const txId = tx => [tx.date, tx.time || "", baseAmt(tx), tx.balance].join("|");

  // Слова, по которым операция похожа на перевод между счетами. Покупки и наличные сюда не входят.
  const TRANSFERISH = /перевод|p2p|пополнен|интернет-банк|internetbank|ерип|erip|между своими|своего счёта|своего счета/i;
  // Зарплата, пенсия, пособие приходят от работодателя или государства: парой к чужому переводу на ту же сумму они быть не могут
  // Сильные слова (прямо «перевод», «пополнение»). «Интернет-банк» и «ЕРИП» слабые: так начинается почти любой платёж
  // МТБ за интернет или связь. Если на перевод похожа только одна сторона и только слабым словом, это не пара.
  const STRONG_TRANSFER = /перевод|p2p|пополнен|между своими|своего счёта|своего счета/i;
  const NOT_TRANSFER = /покупка товара|выдача наличных|снятие наличных|заработн|зарплат|пенси|стипенд|пособи|отпускны/i;

  const newState = () => ({ txs: [], statements: [] });

  // Сколько раз каждая операция уже есть в разборе: ключ «банк|идентификатор».
  // Повтором считается только операция того же банка, и столько раз, сколько она уже встречалась:
  // две одинаковые покупки в одной выписке (без времени и остатка) обе остаются.
  // У операций из старых файлов разбора банка нет: они сравниваются с любым банком.
  // Та же выписка в другом формате (PDF и CSV одного банка): время «10:00» против «10:00:00», остаток есть только в одном файле.
  // Свободное сравнение: банк, дата, сумма, часы и минуты совпали; секунды и остаток либо равны, либо у одной стороны их нет.
  // Без времени свободно не сравниваем: две покупки на одну сумму в один день обычное дело.
  const hm = t => (/^\d\d:\d\d/.test(t.time || "") ? t.time.slice(0, 5) : "");
  const looseKey = (bank, t) => (hm(t) ? [bank, t.date, hm(t), cents(baseAmt(t))].join("|") : "");
  const noVal = v => v === null || v === undefined || v === "";
  const sameShape = (a, b) => (a.time === b.time || a.time.length === 5 || b.time.length === 5) &&
    (noVal(a.balance) || noVal(b.balance) || cents(a.balance) === cents(b.balance));
  function counter(txs) {
    const exact = new Map(), loose = new Map();
    const push = (m, k, e) => { if (!m.has(k)) m.set(k, []); m.get(k).push(e); };
    for (const t of txs) {
      const e = { t, used: false }, bank = t.bank || "?";
      push(exact, bank + "|" + txId(t), e);
      const lk = looseKey(bank, t); if (lk) push(loose, lk, e);
    }
    return { exact, loose };
  }
  function takeDup(cnt, bank, t) {
    const id = txId(t);
    for (const k of [bank + "|" + id, "?|" + id]) {
      const e = (cnt.exact.get(k) || []).find(x => !x.used);
      if (e) { e.used = true; return true; }
    }
    if (!hm(t)) return false;
    for (const b of [bank, "?"]) {
      const e = (cnt.loose.get(looseKey(b, t)) || []).find(x => !x.used && sameShape(x.t, t));
      if (e) { e.used = true; return true; }
    }
    return false;
  }

  // Добавить операции в разбор без повторов. Номера пар и выписок сдвигаются, чтобы не совпасть с уже загруженными.
  function addTxs(state, list, bankOf, srcOf) {
    const cnt = counter(state.txs);
    const offset = state.txs.reduce((m, t) => Math.max(m, t.pair || 0), 0);
    let added = 0, skipped = 0;
    // Непроведённая операция (авторизация) потом приходит в новой выписке уже проведённой, с другим остатком и датой.
    // Ключ «банк, дата и время регистрации, сумма»: проведённая заменяет непроведённую, а непроведённая не дублирует проведённую.
    const pkey = (bank, t) => [bank, t.regDate || t.date || "", t.time || "", baseAmt(t)].join("|");
    const posted = new Set(), pending = new Map();
    state.txs.forEach(t => { if (t.pending) pending.set(pkey(t.bank || "?", t), t); else posted.add(pkey(t.bank || "?", t)); });
    for (const t of list) {
      const bank = bankOf(t);
      if (t.pending && posted.has(pkey(bank, t))) { skipped++; continue; }
      if (!t.pending) {
        let pk = pending.has(pkey(bank, t)) ? pkey(bank, t) : null;
        // Покупка в валюте: банк списывает по курсу дня проведения, сумма отличается от холда на проценты.
        // Та же секунда регистрации, тот же знак и сумма в пределах 10 %: это та же операция, холд заменяется списанием
        if (!pk && t.time) {
          const head = [bank, t.regDate || t.date || "", t.time, ""].join("|"), a = baseAmt(t);
          for (const [k, p] of pending) {
            const b = baseAmt(p);
            if (k.startsWith(head) && a * b > 0 && Math.abs(a - b) <= 0.1 * Math.abs(b)) { pk = k; break; }
          }
        }
        if (pk) {
          const i = state.txs.indexOf(pending.get(pk));
          if (i >= 0) state.txs.splice(i, 1);
          pending.delete(pk);
        }
      }
      if (takeDup(cnt, bank, t)) { skipped++; continue; }
      const copy = Object.assign({}, t, { bank, src: srcOf(t) });
      if (copy.pair) copy.pair += offset;       // номера пар из разных выписок не должны совпасть
      state.txs.push(copy);
      if (copy.pending) pending.set(pkey(bank, copy), copy); else posted.add(pkey(bank, copy));
      added++;
    }
    return { added, skipped };
  }

  // Добавить выписку. res = { bank: {id, name}, header, txs, check }.
  // Возвращает { added, skipped, index }.
  function addStatement(state, res) {
    const index = state.statements.length;
    // Счёт в валюте: операции получают cur и orig, чтобы потом пересчитать по курсу, заданному вручную
    const cur = foreignCode(res.header);
    const list = cur ? res.txs.map(t => Object.assign({}, t, { cur, orig: t.amount })) : res.txs;
    const { added, skipped } = addTxs(state, list, () => res.bank.id, () => index);
    state.statements.push({
      bank: res.bank.id, bankName: res.bank.name,
      from: res.header.from || null, to: res.header.to || null,
      count: res.txs.length, added, skipped,
      check: res.check || null,
    });
    // Что не удалось прочитать (только в памяти, в файл разбора не попадает): показывается над «Итогом»
    if (res.header.unread && res.header.unread.length) state.statements[index].unread = res.header.unread;
    if (cur) state.statements[index].currency = cur;
    dropOrphanPairs(state.txs);
    return { added, skipped, index };
  }

  // Добавить операции из файла разбора к уже загруженным. statements: выписки из файла
  // (номер выписки src у операций указывает на них). Возвращает { added, skipped }.
  function addSaved(state, txs, statements, defaultBank) {
    const base = state.statements.length;
    const sts = statements || [];
    const bankOf = t => t.bank || (sts[t.src] && sts[t.src].bank) || defaultBank || "?";
    const r = addTxs(state, txs, bankOf, t => (Number.isInteger(t.src) && t.src >= 0 && t.src < sts.length ? t.src : 0) + base);
    state.statements.push(...sts);
    dropOrphanPairs(state.txs);
    return r;
  }

  // Пара, у которой не нашлась вторая половина (её пропустили как повтор), больше не пара
  function dropOrphanPairs(txs) {
    const cnt = new Map();
    txs.forEach(t => { if (t.pair) cnt.set(t.pair, (cnt.get(t.pair) || 0) + 1); });
    txs.forEach(t => { if (t.pair && cnt.get(t.pair) < 2) { delete t.pair; delete t.pfee; } });
  }

  // Общий период и банк для шапки: если банков несколько, bank = "multi"
  function mergedHeader(statements) {
    const froms = statements.map(s => s.from).filter(Boolean).sort();
    const tos = statements.map(s => s.to).filter(Boolean).sort();
    const banks = [...new Set(statements.map(s => s.bank))];
    const h = {};
    if (froms.length) h.from = froms[0];
    if (tos.length) h.to = tos[tos.length - 1];
    if (banks.length) h.bank = banks.length === 1 ? banks[0] : "multi";
    return h;
  }

  // Переводы между разными выписками: равные суммы с противоположными знаками, в пределах суток,
  // из разных выписок, хотя бы одна сторона похожа на перевод. isRetail(tx) отсекает покупки по MCC.
  // Возвращает число найденных пар.
  const forDate = t => {
    const m = /за (\d\d)\.(\d\d)\.(\d{4})/.exec(t.details || "");
    return m ? m[3] + "-" + m[2] + "-" + m[1] : t.date;
  };

  function markCrossPairs(txs, isRetail, allowSame) {
    let next = txs.reduce((m, t) => Math.max(m, t.pair || 0), 0) + 1;
    const eligible = t => !t.pair && !NOT_TRANSFER.test(t.details || "") && !(isRetail && isRetail(t));
    const free = txs.filter(eligible);
    const credits = free.filter(t => t.amount > 0).sort((a, b) => (stamp(a) < stamp(b) ? -1 : 1));
    let n = 0;
    for (const c of credits) {
      if (c.pair) continue;
      let best = null, bestGap = Infinity;
      for (const d of free) {
        if (d.pair || d.amount >= 0 || (d.src === c.src && !allowSame) || cents(-d.amount) !== cents(c.amount)) continue;
        if (!TRANSFERISH.test(c.details || "") && !TRANSFERISH.test(d.details || "")) continue;
        if (!(TRANSFERISH.test(c.details || "") && TRANSFERISH.test(d.details || "")) &&
            !STRONG_TRANSFER.test(c.details || "") && !STRONG_TRANSFER.test(d.details || "")) continue;
        if (allowSame && d.src === c.src && !(TRANSFERISH.test(c.details || "") && TRANSFERISH.test(d.details || ""))) continue;   // внутри одной выписки: перевод туда и обратно, обе стороны похожи на перевод
        // МТБ пишет в пополнении «за ДД.ММ.ГГГГ»: настоящая дата перевода (зачисление бывает позже, например через выходные)
        const gap = Math.min(
          Math.abs(Date.parse(c.date) - Date.parse(d.date)),
          Math.abs(Date.parse(forDate(c)) - Date.parse(d.date)),
          Math.abs(Date.parse(c.date) - Date.parse(forDate(d))),
          Math.abs(Date.parse(forDate(c)) - Date.parse(forDate(d))));
        if (gap > DAY) continue;
        const fine = Math.abs(Date.parse(stamp(c).replace(" ", "T")) - Date.parse(stamp(d).replace(" ", "T")));
        if (fine < bestGap) { best = d; bestGap = fine; }
      }
      if (best) { c.pair = best.pair = next++; n++; }
    }
    if (!allowSame) n += markLoosePairs(txs, eligible, () => next++);
    return n;
  }

  // Два осторожных случая перевода между своими банками, которые точное правило выше не ловит.
  // Ложная пара хуже пропуска (из итогов пропали бы настоящий доход и настоящая трата), поэтому условия строже:
  // обе стороны похожи на перевод, выписки разные, валюта одна, и кандидат единственный в обе стороны
  // (если подходящих списаний или поступлений два, не выбираем ни одного).
  //  а) через выходные: сумма равна до копейки, ушло раньше, чем пришло, не больше 4 суток,
  //     и все дни между ними суббота или воскресенье (пятница → понедельник, суббота → понедельник);
  //  б) с комиссией: в пределах суток ушло больше, чем пришло, на комиссию не больше 3 % и не больше 30
  //     (или ровно на комиссию, которую банк сам указал в операции). Комиссия пишется в pfee списания:
  //     при показе она отделяется в «Комиссии банка» (splits.js), между своими идёт только пришедшая сумма.
  const FEE_SHARE = 0.03, FEE_MAX = 30;
  const dayNum = iso => Math.round(Date.parse(iso) / DAY);
  function weekendBetween(dDate, cDate) {
    const a = dayNum(dDate), b = dayNum(cDate);
    if (!(b - a >= 2 && b - a <= 4)) return false;
    for (let x = a + 1; x < b; x++) { const wd = new Date(x * DAY).getUTCDay(); if (wd !== 0 && wd !== 6) return false; }
    return true;
  }
  function markLoosePairs(txs, eligible, nextId) {
    const isT = t => TRANSFERISH.test(t.details || "");
    const sameCur = (a, b) => (a.cur || "") === (b.cur || "");
    const okDate = t => /^\d{4}-\d\d-\d\d$/.test(t.date || "");
    const base = t => eligible(t) && isT(t) && okDate(t);
    const feeOf = (c, d) => cents(-d.amount) - cents(c.amount);
    const rules = [
      (c, d) => feeOf(c, d) === 0 && weekendBetween(d.date, c.date),
      (c, d) => {
        const fee = feeOf(c, d);
        if (fee <= 0 || c.cur || d.cur) return false;
        if (typeof d.fee === "number" && d.fee > 0 ? fee !== cents(d.fee) : fee > FEE_SHARE * cents(c.amount) || fee > FEE_MAX * 100) return false;
        return Math.abs(dayNum(c.date) - dayNum(d.date)) <= 1;
      },
    ];
    let n = 0;
    for (const rule of rules) {
      const credits = txs.filter(t => t.amount > 0 && base(t)), debits = txs.filter(t => t.amount < 0 && base(t));
      const fits = (c, d) => !c.pair && !d.pair && c.src !== d.src && sameCur(c, d) && rule(c, d);
      for (const c of credits) {
        if (c.pair) continue;
        const ds = debits.filter(d => fits(c, d));
        if (ds.length !== 1 || credits.filter(x => fits(x, ds[0])).length !== 1) continue;
        const fee = feeOf(c, ds[0]);
        c.pair = ds[0].pair = nextId();
        if (fee > 0) ds[0].pfee = fee / 100;
        n++;
      }
    }
    return n;
  }

  const foreignCode = header => {
    const c = header && typeof header.currency === "string" ? header.currency.trim().toUpperCase() : "";
    return /^[A-Z]{3}$/.test(c) && c !== "BYN" && c !== "BYR" ? c : null;
  };
  // Счёт не в белорусских рублях и курс не задан: суммы остаются в валюте счёта и так и подписаны (выдуманный курс не подставляется). Возвращает текст подсказки или null.
  function currencyNote(header, rates) {
    const c = foreignCode(header);
    const e = rates && rates[c];
    if (!c || (e && (e.r > 0 || (e.at && e.at.length)))) return null;
    return `Счёт в валюте ${c}: суммы показаны в ${c}, как в выписке. Курс на эту дату недоступен, итог в рублях не посчитан: курс можно указать в «Настройках», «Курсы валют». Если вместе загружены выписки в другой валюте, итоги показаны по каждой валюте отдельно и не складываются.`;
  }

  const pairCount = txs => new Set(txs.filter(t => t.pair).map(t => t.pair)).size;

  // Перевод туда и обратно на тот же счёт в пределах суток: деньги вернулись, это не трата и не доход
  const markRoundTrips = (txs, isRetail) => markCrossPairs(txs, isRetail, true);

  const api = { markRoundTrips, newState, addStatement, addSaved, mergedHeader, currencyNote, markCrossPairs, pairCount, txId, TRANSFERISH };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Merge = api;
})(typeof self !== "undefined" ? self : this);
