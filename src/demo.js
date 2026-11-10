// demo.js: выдуманная выписка для демонстрации сайта (никаких настоящих данных).
// Даты и суммы задаёт генератор с зерном. Без зерна (так открывается демо на сайте) набор постоянный и правдоподобный для Минска:
// зарплата 1 800, аренда 700. Пример на главной взят из этого же набора (LANDING_SAMPLE в analyzer.html, сверяет test_render.js).
// Работает и в браузере (глобальный объект Demo), и в Node (для тестов).

(function (root) {
  "use strict";

  function make(startSeed, now) {
    now = now || new Date(2026, 10, 7);   // без аргумента дата фиксирована (для тестов)
    const fixed = startSeed === undefined;
    let seed = (fixed ? 20260811 : startSeed) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const between = (a, b) => Math.round((a + rnd() * (b - a)) * 100) / 100;
    const count = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const pick = list => list[Math.floor(rnd() * list.length)];

    // Постоянные платежи: размер выбирается один раз за запуск и одинаков во всех месяцах (так находятся повторы)
    // Зарплата (на карту, после налогов): от 900 до 7000, чаще небольшая (равномерно по логарифму).
    // Остальные траты растут вместе с ней, но медленнее, как в жизни.
    const rndSalary = Math.round(Math.exp(between(Math.log(900), Math.log(7000))) / 10) * 10;
    const salary = fixed ? 1800 : rndSalary;
    const k = Math.pow(salary / 1800, 0.8);
    const sc = (a, b) => between(a * k, b * k);
    const rndRent = Math.min(2200, Math.max(350, Math.round(salary * between(0.2, 0.4) / 10) * 10));
    const rent = fixed ? 700 : rndRent;
    const mobile = sc(12, 30);
    const sub = sc(7, 25);
    const cash = Math.max(20, Math.round(100 * k / 10) * 10);
    const own = Math.max(50, Math.round(300 * k / 50) * 50);
    const save = Math.max(20, Math.round(salary * 0.1 / 10) * 10);   // ежемесячный перевод на накопительный счёт (около 10% зарплаты)

    // Три последних полных месяца до текущего
    const months = [3, 2, 1].map(back => {
      const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
      return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()];
    });
    const ops = [];          // { date, amount, mcc, details, pair? }
    let pairNo = 0;
    const add = (ym, day, amount, mcc, details, pair) => ops.push({ date: `${ym}-${String(day).padStart(2, "0")}`, amount, mcc, details, pair });

    months.forEach(([ym, days]) => {
      add(ym, 5, salary, null, "Зачисление зарплаты организации");
      add(ym, 7, -rent, null, "Аренда квартиры (ЕРИП)");
      add(ym, 8, -mobile, "4814", "A1 BELARUS пополнение счёта");
      add(ym, 9, -sub, "4899", "VIDEO SERVICE подписка");
      add(ym, 14, -cash, "6011", "Снятие наличных в банкомате");
      add(ym, 6, -save, null, "Перевод на накопительный счёт");
      add(ym, 28, -3, null, "Комиссия за обслуживание карты");
      // перевод на свой же счёт: пришло и сразу ушло ровно столько же
      pairNo++;
      add(ym, 12, own, null, "Пополнение со своего счёта", pairNo);
      add(ym, 12, -own, null, "Перевод на свой счёт (ЕРИП)", pairNo);
      add(ym, 20, -sc(25, 70), null, "Перевод с карты на карту, Иванов И.И.");   // для подсказки «Похоже на перевод человеку»
      for (let i = 0, n = count(10, 16); i < n; i++) add(ym, 1 + Math.floor(rnd() * (days - 1)), -sc(8, 45), "5411", pick(['SHOP "EVROOPT"', 'SHOP "GREEN"', 'SHOP "SOSEDI"', "GIPERMARKET GIPPO"]));
      for (let i = 0, n = count(4, 8); i < n; i++) add(ym, 1 + Math.floor(rnd() * (days - 1)), -sc(7, 26), "5812", pick(['RBO "BURGER KING"', "COFFEE HOUSE", "PIZZA CAFE"]));
      for (let i = 0, n = count(2, 9); i < n; i++) add(ym, 1 + Math.floor(rnd() * (days - 1)), -sc(1.5, 14), pick(["4111", "4121"]), pick(["METRO MINSK", "TAXI MINSK"]));
      for (let i = 0, n = count(1, 3); i < n; i++) add(ym, 1 + Math.floor(rnd() * (days - 1)), -sc(10, 40), null, pick(fixed && ym !== months[2][0]
        // В постоянном демо непонятные платежи оставлены только в последнем месяце (2–3 штуки показывают функцию «Уточнить»,
        // но не создают впечатление, что сайт не справился). Число обращений к генератору то же, суммы не меняются.
        ? ["Оплата коммунальных услуг: электроэнергия", "BELTELECOM интернет", "Квартплата за месяц"]
        : ["Оплата услуг ЕРИП", "Оплата в интернет-банке, перевод", "Платёж по реквизитам"]));
    });
    add(months[0][0], 19, -Math.round(9.3 * k * 10) / 10, "5912", "APTEKA N 16");
    add(months[1][0], 21, -Math.round(140 * k), "5651", "SHOP CLOTHES");
    add(months[2][0], 17, -Math.round(18 * k * 2) / 2, "7832", "CINEMA MINSK");
    if (fixed) {
      // Постоянное демо: в последнем месяце «как в жизни» стало больше доставки еды и мелких покупок,
      // чтобы «Итогу месяца» было что показать. Генератор не трогаем, остальные суммы не меняются. Дни до 28-го (любой месяц).
      const last = months[2][0];
      [[3, 31.4], [9, 27.9], [13, 35.2], [19, 29.6], [24, 33.8], [27, 26.5]].forEach(([d, a]) => add(last, d, -a, "5814", "FOOD DELIVERY MINSK"));
      [4.2, 6.9, 3.5, 8.4, 5.1, 7.3, 4.8, 9.2, 3.9, 6.1, 5.6, 7.8, 4.4, 8.9, 5.3, 6.6, 3.7, 7.1].forEach((a, i) => add(last, 1 + (i * 3) % 28, -a, "5411", 'SHOP "SOSEDI"'));
    }

    ops.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let balance = 1000;
    const txs = ops.map((o, i) => {
      balance = Math.round((balance + o.amount) * 100) / 100;
      const tx = { date: o.date, time: `12:${String(i % 60).padStart(2, "0")}:00`, type: null, amount: o.amount, currency: "BYN", mcc: o.mcc, card: null, details: o.details, balance };
      if (o.pair) tx.pair = o.pair;
      return tx;
    });
    return { txs, header: { bank: "demo", from: `${months[0][0]}-01`, to: `${months[2][0]}-${months[2][1]}` } };
  }

  const api = { make };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Demo = api;
})(typeof self !== "undefined" ? self : this);
