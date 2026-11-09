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

  const MTB = {
    id: "mtb",
    name: "МТБанк",
    detect(pages) {
      const text = pages.slice(0, 2).map(p => p.map(i => i.text).join(" ")).join(" ");
      return /Транзакции по счету|Период выписки|Входящий остаток:/i.test(text);
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
      // Повреждённые операции (нет даты или сумма не число) не пропускаем в разбор: они бы испортили итоги и таблицу
      const good = txs.filter(t => /^\d{4}-\d\d-\d\d$/.test(t.date || "") && Number.isFinite(t.amount));
      header.broken = txs.length - good.length;
      return { header, txs: good };
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
    name: "БПС-Сбербанк (Сбер Банк)",
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

  // CSV-выписки (кроме PDF): пока только Приорбанк. text: уже расшифрованный текст файла.
  const CSV_BANKS = [{ bank: PRIOR, detect: PRCSV.detect, parse: PRCSV.parse }];

  const api = {
    BANKS,
    // Найти банк по выписке; null, если ни один не подошёл
    detect: pages => BANKS.find(b => b.detect(pages)) || null,
    // CSV-выписка: { bank, header, txs } или null, если формат не узнан
    parseCsv(text) {
      const c = CSV_BANKS.find(b => b.detect(text));
      if (!c) return null;
      const { header, txs } = c.parse(text);
      const good = txs.filter(t => /^\d{4}-\d\d-\d\d$/.test(t.date || "") && Number.isFinite(t.amount));
      if (good.length !== txs.length) header.broken = (header.broken || 0) + (txs.length - good.length);
      return { bank: c.bank, header, txs: good };
    },
    // Разобрать выписку: { bank, header, txs } или null, если банк не определён
    parse(pages) {
      const bank = api.detect(pages);
      if (!bank) return null;
      const { header, txs } = bank.parse(pages);
      // Страховка для любого банка: операции без даты или с нечисловой суммой в разбор не попадают
      const good = txs.filter(t => /^\d{4}-\d\d-\d\d$/.test(t.date || "") && Number.isFinite(t.amount));
      if (good.length !== txs.length) header.broken = (header.broken || 0) + (txs.length - good.length);
      return { bank, header, txs: good };
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Banks = api;
})(typeof self !== "undefined" ? self : this);
