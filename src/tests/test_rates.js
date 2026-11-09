const R = require("../rates.js");
const M = require("../merge.js");
let bad = 0;
const check = (name, ok) => { if (!ok) { bad++; console.log("FAIL:", name); } };

check("валюта счёта: USD", R.foreignCode({ currency: "usd" }) === "USD");
check("BYN, пусто и мусор: не валюта", R.foreignCode({ currency: "BYN" }) === null && R.foreignCode({}) === null && R.foreignCode({ currency: "<b>" }) === null);

const c = R.clean({ USD: "3,25", EUR: 3.5, BYN: 1, XX: 2, usd: 4, RUB: -1, GBP: "abc", JPY: 1e9, __proto__: 5 });
check("clean: оставляет нормальные курсы", c.USD.r === 3.25 && c.EUR.r === 3.5);
check("clean: отбрасывает BYN, плохие коды и значения", !("BYN" in c) && !("XX" in c) && !("usd" in c) && !("RUB" in c) && !("GBP" in c) && !("JPY" in c));
check("clean: не объект", Object.keys(R.clean(null)).length === 0 && Object.keys(R.clean([1])).length === 0);

const txs = R.stamp([{ date: "2026-01-02", amount: -10, balance: 90, details: "a" }, { date: "2026-01-03", amount: 50, balance: 140, details: "b" }], { currency: "USD" });
check("stamp: cur и orig", txs.every(t => t.cur === "USD" && t.orig === t.amount));
const plain = [{ amount: -1 }];
check("stamp: BYN не меняет", R.stamp(plain, { currency: "BYN" }) === plain);
check("codes", R.codes(txs).join() === "USD" && R.codes(plain).length === 0);

check("apply без курса: сумма как была, USD в списке", R.apply(txs, {}).join() === "USD" && txs[0].amount === -10 && txs[0].currency === "USD");
check("apply с курсом", R.apply(txs, R.clean({ USD: 3.2 })).length === 0 && txs[0].amount === -32 && txs[1].amount === 160 && txs[0].currency === "BYN");
check("apply: смена курса считается от исходной суммы", (R.apply(txs, R.clean({ USD: 3 })), txs[0].amount === -30 && txs[0].orig === -10));
check("apply: курс убрали, суммы вернулись", (R.apply(txs, {}), txs[0].amount === -10));
check("apply: копейки округляются", (R.apply(txs, R.clean({ USD: 3.333333 })), txs[1].amount === 166.67));

// Merge: идентификатор и повторы не зависят от курса
const st = M.newState();
const res = { bank: { id: "x", name: "X" }, header: { currency: "USD", from: "2026-01-01", to: "2026-01-31" }, txs: [{ date: "2026-01-02", amount: -10, balance: 90, details: "a" }] };
M.addStatement(st, res);
check("addStatement: операции получили cur и orig", st.txs[0].cur === "USD" && st.txs[0].orig === -10 && st.statements[0].currency === "USD");
R.apply(st.txs, R.clean({ USD: 3 }));
const again = M.addStatement(st, res);
check("повторная загрузка при заданном курсе: повтор пропущен", again.added === 0 && again.skipped === 1 && st.txs.length === 1);
check("txId по исходной сумме", M.txId(st.txs[0]) === "2026-01-02||-10|90");
check("currencyNote: курс задан — предупреждения нет", M.currencyNote({ currency: "USD" }, R.clean({ USD: 3 })) === null);
check("currencyNote: курса нет — есть подсказка про «Курсы валют»", /Курсы валют/.test(M.currencyNote({ currency: "USD" }, {}) || ""));

// Курс по дате операции
const dr = R.clean({ USD: { r: 3, at: [{ d: "2026-03-01", r: 3.4 }, { d: "2026-02-01", r: 3.2 }, { d: "bad", r: 9 }, { d: "2026-04-01", r: -1 }, { d: "2026-02-01", r: 5 }] } });
check("clean: даты отсортированы, плохие и повторы убраны", dr.USD.at.length === 2 && dr.USD.at[0].d === "2026-02-01" && dr.USD.at[0].r === 3.2);
check("rateFor: до первой даты основной, потом по датам", R.rateFor(dr, "USD", "2026-01-15") === 3 && R.rateFor(dr, "USD", "2026-02-10") === 3.2 && R.rateFor(dr, "USD", "2026-03-01") === 3.4 && R.rateFor(dr, "USD", "2027-01-01") === 3.4);
check("rateFor: без основного до первой даты берётся самый ранний", R.rateFor(R.clean({ EUR: { at: [{ d: "2026-02-01", r: 3.5 }] } }), "EUR", "2026-01-01") === 3.5);
check("rateFor: нет валюты", R.rateFor(dr, "EUR", "2026-01-01") === 0 && !R.has(dr, "EUR") && R.has(dr, "USD"));
const dt = R.stamp([{ date: "2026-01-10", amount: -10 }, { date: "2026-02-10", amount: -10 }, { date: "2026-03-10", amount: -10 }], { currency: "USD" });
R.apply(dt, dr);
check("apply по датам: -30, -32, -34 и запись курса", dt[0].amount === -30 && dt[1].amount === -32 && dt[2].amount === -34 && dt[1].rate === 3.2);
if (bad) { console.log(bad + " провалено"); process.exit(1); }
console.log("rates: ok");
