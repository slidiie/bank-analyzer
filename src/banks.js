// banks.js: список поддерживаемых банков и автоопределение банка по выписке.
// Каждый банк это «плагин» с полями id, name, detect(pages) и parse(pages) -> { header, txs }.
// Чтобы добавить банк: написать файл разбора и добавить его в список BANKS ниже.
// pages: список страниц, у каждой список фрагментов текста {x, y, vx, vy, text}:
//   x, y: исходные координаты pdf.js (y растёт вверх), vx, vy: координаты после поворота страницы (vy растёт вниз).
// Работает и в браузере (глобальный объект Banks), и в Node (для тестов).

(function (root) {
  "use strict";

  const need = (name, file) => root[name] || (typeof require !== "undefined" ? require(file) : null);
  const SP = need("StatementParser", "./parser.js");
  const VTB = need("VtbParser", "./vtb.js");
  const TR = need("Transfers", "./transfers.js");
  const BB = need("BelarusbankParser", "./belarusbank.js");
  const PR = need("PriorParser", "./prior.js");
  const PRCSV = need("PriorCsvParser", "./priorcsv.js");
  const AL = need("AlfaParser", "./alfa.js");
  const SB = need("SberParser", "./sber.js");
  const BI = need("BelinvestParser", "./belinvest.js");
  const UN = need("Universal", "./universal.js");

  const MTB = {
    id: "mtb",
    name: "МТБанк",
    detect(pages) {
      const text = pages.slice(0, 2).map(p => p.map(i => i.text).join(" ")).join(" ");
      // «Период выписки» и «Входящий остаток» бывают и у других банков: нужно два признака из трёх или название банка
      const signs = [/Транзакции по счету/i, /Период выписки/i, /Входящий остаток:/i].filter(re => re.test(text)).length;
      return signs >= 2 || (signs === 1 && /МТБанк|MTBank|mtbank\.by|Транзакции по счету/i.test(text));
    },
    parse(pages) {
      let header = {};
      const txs = [];
      pages.forEach((items, n) => {
        const lines = SP.groupLines(items.map(i => ({ x: i.x, y: i.y, text: i.text })));
        if (n === 0) header = SP.parseHeader(lines);
        txs.push(...SP.parseTransactions(lines));
      });
      header.bank = "mtb";
      return { header, txs };   // повреждённые операции отсеивает общий sieve() ниже, с описанием для пользователя
    },
    validate: (txs, header) => SP.validate(txs, header),
  };

  const VTBANK = {
    id: "vtb",
    name: "ВТБ (Беларусь)",
    detect: pages => VTB.detect(pages),
    parse(pages) {
      const res = VTB.parse(pages);
      res.header.pairs = TR.mark(res.txs, VTB.isPassThroughOut);
      return res;
    },
    validate: (txs, header) => VTB.validate(txs, header),
  };

  const BELARUSBANK = {
    id: "belarusbank",
    name: "Беларусбанк",
    detect: pages => BB.detect(pages),
    parse(pages) {
      const res = BB.parse(pages);
      res.header.pairs = TR.mark(res.txs, tx => tx.amount < 0 && /перевод p2p|плата за перевод/i.test(tx.details || ""));
      return res;
    },
    validate: (txs, header) => BB.validate(txs, header),
  };

  const PRIOR = {
    id: "prior",
    name: "Приорбанк",
    detect: pages => PR.detect(pages),
    parse: pages => PR.parse(pages),
    validate: (txs, header) => PR.validate(txs, header),
  };

  const ALFA = {
    id: "alfa",
    name: "Альфа-Банк",
    detect: pages => AL.detect(pages),
    parse(pages) {
      const res = AL.parse(pages);
      res.header.pairs = TR.mark(res.txs, tx => tx.kind === "card_out" && /transfers|popolnenie/i.test(tx.details || ""));
      return res;
    },
    validate: (txs, header) => AL.validate(txs, header),
  };

  const SBER = {
    id: "sber",
    name: "Сбер Банк",
    detect: pages => SB.detect(pages),
    parse(pages) {
      const res = SB.parse(pages);
      res.header.pairs = TR.mark(res.txs, tx => tx.amount < 0 && /p2p|р2р/i.test(tx.details || ""));
      return res;
    },
    validate: (txs, header) => SB.validate(txs, header),
  };

  const BELINVEST = {
    id: "belinvest",
    name: "Белинвестбанк",
    detect: pages => BI.detect(pages),
    parse(pages) {
      const res = BI.parse(pages);
      res.header.pairs = TR.mark(res.txs, tx => tx.amount < 0 && /перевод/i.test(tx.type || ""));
      return res;
    },
    validate: (txs, header) => BI.validate(txs, header),
  };

  // Порядок важен: сначала более узкие признаки (у МТБ признак «Период выписки» есть и у Приорбанка)
  const BANKS = [ALFA, SBER, VTBANK, BELARUSBANK, BELINVEST, PRIOR, MTB];

  // Банк не из списка: выписку читает universal.js (колонки находятся сами, результат проверяется сверкой).
  // В BANKS его нет: это не «поддерживаемый банк», а запасной путь.
  const OTHER = { id: "other", name: "Банк не из списка", validate: (txs, header) => UN.validate(txs, header) };

  // CSV-выписки (кроме PDF): пока только Приорбанк. text: уже расшифрованный текст файла.
  const CSV_BANKS = [{ bank: PRIOR, detect: PRCSV.detect, parse: PRCSV.parse }];

  // Проверка операций после любого разбора: дата настоящая (не 32.13) и в пределах периода выписки (±45 дней),
  // сумма число. Плохие не попадают в итоги, а описываются в header.unread, чтобы сайт прямо сказал, что не прочитано.
  const ISO = /^\d{4}-\d\d-\d\d$/;
  function realDate(iso) {
    if (!ISO.test(iso || "")) return false;
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return y >= 2000 && y <= 2100 && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  const shift = (iso, days) => new Date(Date.parse(iso + "T00:00:00Z") + days * 864e5).toISOString().slice(0, 10);
  const inPeriod = (iso, h) => !(realDate(h.from) && realDate(h.to)) || (iso >= shift(h.from, -45) && iso <= shift(h.to, 45));
  function sieve(header, txs) {
    const good = [], bad = Array.isArray(header.unread) ? header.unread.slice() : [];
    for (const t of txs) {
      if (realDate(t.date) && inPeriod(t.date, header) && Number.isFinite(t.amount)) { good.push(t); continue; }
      bad.push({ date: realDate(t.date) ? t.date : null, rawDate: realDate(t.date) ? null : String(t.date || "").slice(0, 12) || null,
        amount: Number.isFinite(t.amount) ? t.amount : null, details: String(t.details || "").replace(/\s+/g, " ").trim().slice(0, 70) });
    }
    if (good.length !== txs.length) header.broken = (header.broken || 0) + (txs.length - good.length);
    if (bad.length) header.unread = bad.slice(0, 30);
    return good;
  }
  // Цепочка остатков: если у операций есть остаток после операции, место пропуска видно по разрыву цепочки.
  // Возвращает { from, to } (даты по краям разрыва) или null (остатков нет, цепочка цела или разрывов слишком много).
  function balanceGap(txs) {
    const list = txs.filter(t => t.balance != null && Number.isFinite(t.balance) && !t.pending);
    if (list.length < 3) return null;
    const c = n => Math.round(n * 100);
    const breaks = dir => { const out = []; for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      const ok = dir > 0 ? c(a.balance + b.amount) === c(b.balance) : c(b.balance + a.amount) === c(a.balance);
      if (!ok) out.push([a.date, b.date]); } return out; };
    const f = breaks(1), r = breaks(-1), best = f.length <= r.length ? f : r;
    if (!best.length || best.length > 2) return null;   // показывается только при несошедшейся сверке
    const [x, y] = best[0]; return x <= y ? { from: x, to: y } : { from: y, to: x };
  }

  const api = {
    BANKS, OTHER, realDate, balanceGap,
    // Банк по идентификатору из шапки выписки (в том числе «не из списка»); null, если такого нет
    byId: id => id === OTHER.id ? OTHER : BANKS.find(b => b.id === id) || null,
    // Результат универсального чтения (Universal.guess) → та же форма, что у parse(): { bank, header, txs }
    fromUniversal(g) {
      const name = g.header.bankName ? g.header.bankName.slice(0, 40) : OTHER.name;
      return { bank: Object.assign({}, OTHER, { name }), header: g.header, txs: sieve(g.header, g.txs) };
    },
    // Найти банк по выписке; null, если ни один не подошёл
    detect: pages => BANKS.find(b => b.detect(pages)) || null,
    // CSV-выписка: { bank, header, txs } или null, если формат не узнан
    parseCsv(text) {
      const c = CSV_BANKS.find(b => b.detect(text));
      if (!c) return null;
      const { header, txs } = c.parse(text);
      return { bank: c.bank, header, txs: sieve(header, txs) };
    },
    // Разобрать выписку: { bank, header, txs } или null, если банк не определён
    parse(pages) {
      const bank = api.detect(pages);
      if (!bank) return null;
      const { header, txs } = bank.parse(pages);
      // Страховка для любого банка: операции без настоящей даты или с нечисловой суммой в итоги не попадают
      return { bank, header, txs: sieve(header, txs) };
    },
    // Банк не узнан: похоже ли это на выписку поддерживаемого банка без начала (первой страницы с шапкой)?
    // Возвращает название банка или null.
    partialOf(pages) {
      const text = pages.map(p => p.map(i => i.text).join(" ")).join(" ");
      const dates = (text.match(/\b\d{2}\.\d{2}\.\d{4}\b/g) || []).length;
      if (dates < 5) return null;
      const NAMES = [["МТБанк", /МТБанк|MTBank|MTB MOBILE/i], ["Приорбанк", /Приорбанк|Priorbank/i], ["ВТБ (Беларусь)", /ВТБ|VTB/],
        ["Беларусбанк", /Беларусбанк|Belarusbank|ASB/], ["Альфа-Банк", /Альфа-Банк|Alfa-Bank/i], ["Сбер Банк", /Сбер Банк|Sber/i], ["Белинвестбанк", /Белинвест|Belinvest/i]];
      // Название чаще всего встречается у своего банка (в операциях бывают чужие: «MTB MOBILE» в выписке ВТБ)
      const count = re => (text.match(new RegExp(re.source, re.flags.includes("i") ? "gi" : "g")) || []).length;
      const best = NAMES.map(([n, re]) => [n, count(re)]).sort((a, b) => b[1] - a[1])[0];
      return best && best[1] >= 3 ? best[0] : null;   // одно-два упоминания бывают в операциях (банкомат или платёж в другом банке)
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Banks = api;
})(typeof self !== "undefined" ? self : this);
