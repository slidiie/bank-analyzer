// Проверка отрисовки отчёта без браузера: подставляем «заглушку» вместо страницы (DOM),
// запускаем скрипт из analyzer.html и смотрим, что в отчёте появились нужные блоки.
// Запуск из папки проекта:  node tests/test_render.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SP = require("../parser.js");
const Cat = require("../categories.js");
const Banks = require("../banks.js");
const Demo = require("../demo.js");
const Merge = require("../merge.js");
const Exporter = require("../export.js");
const Planner = require("../planner.js");
const Backup = require("../backup.js");
const History = require("../history.js");
const Filters = require("../filters.js");
const CondRules = require("../condrules.js");
const Splits = require("../splits.js");
const Rates = require("../rates.js");
const Feedback = require("../feedback.js");
const Hints = require("../hints.js");
const Merchants = require("../merchants.js");
const Recap = require("../recap.js");
const Goals = require("../goals.js");
const lsWrites = [];

// ---- Заглушка страницы ----
class Node {}
class El extends Node {
  constructor(tag) {
    super();
    this.tag = tag; this.children = []; this.attrs = {}; this.listeners = {};
    this.className = ""; this.textContent = ""; this.hidden = false; this.classList = { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); }, toggle(c, on) { if (on === undefined) on = !this._s.has(c); on ? this._s.add(c) : this._s.delete(c); return on; } }; this.style = { setProperty(k, v) { this[k] = v; } };
    this.open = false; this.selected = false; this.value = "";
  }
  append(...kids) { this.children.push(...kids); }
  replaceChildren(...kids) { this.children = [...kids]; }
  setAttribute(k, v) { this.attrs[k] = v; }
  scrollIntoView() {}
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
}
const byId = {};
const document = {
  getElementById: id => (byId[id] = byId[id] || new El("#" + id)),
  createElement: tag => new El(tag),
  listeners: {},
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
  documentElement: new El("html"),
  body: Object.assign(new El("body"), { classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } } }),
};
const textOf = n => (typeof n === "string" ? n : [n.textContent, ...n.children.map(textOf)].join(" "));
// Находит кнопку по тексту и «нажимает» на неё
function clickButton(root, label) {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    if (typeof n === "string") continue;
    if (n.tag === "button" && textOf(n).includes(label)) { n.listeners.click[0](); return true; }
    stack.push(...n.children);
  }
  return false;
}

const html = fs.readFileSync(path.join(__dirname, "..", "analyzer.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const ctx = vm.createContext({
  document, Node, console,
  localStorage: { getItem: () => null, setItem: k => lsWrites.push(k) },
  pdfjsLib: { GlobalWorkerOptions: {}, getDocument: () => { throw new Error("не нужен в тесте"); } },
  StatementParser: SP, Categories: Cat, Banks, Demo, Merge, Exporter, Planner, Backup, History, Filters, CondRules, Splits, Rates, Feedback, Hints, Merchants, Recap, Goals,
});
vm.runInContext(script, ctx);

let failed = 0;
function check(name, ok) {
  if (!ok) failed++;
  console.log((ok ? "OK    " : "FAIL  ") + name);
}
const summaryText = () => textOf(byId["summary"]);
const hasTotal = (s, n) => new RegExp("Итого\\s+" + n.replace(".", "\\.")).test(s);

// ---- Выписка на три месяца (последний неполный) ----
vm.runInContext(`
  header = { from: "2026-09-01", to: "2026-11-02" };
  txs = [
    { date: "2026-09-10", time: "10:00:00", amount: -50,   mcc: "5411", details: "SHOP A", balance: 1 },
    { date: "2026-09-15", time: "10:00:00", amount: -200,  mcc: "5812", details: "CAFE B", balance: 2 },
    { date: "2026-10-05", time: "10:00:00", amount: -300,  mcc: "5411", details: "SHOP A", balance: 3 },
    { date: "2026-10-12", time: "10:00:00", amount: 1000,  mcc: null,   details: "Пополнение счета", balance: 4 },
    { date: "2026-10-20", time: "10:00:00", amount: -100,  mcc: null,   details: "Погашение комиссии", balance: 5 },
    { date: "2026-10-25", time: "10:00:00", amount: -500,  mcc: null,   details: "Оплата в Интернет-банке, перевод", balance: 6 },
    { date: "2026-11-02", time: "10:00:00", amount: -20,   mcc: "5411", details: "SHOP A", balance: 7 },
  ];
  summaryView = "table";
  render();
`, ctx);

// По умолчанию открыта вкладка «За весь период»: видны общие итоги и сравнение месяцев
let s = summaryText();
check("есть вкладки: весь период и три месяца",
  ["За весь период", "Сен", "Окт", "Ноя"].every(t => s.includes(t)) && !s.includes("Октябрь 2026"));
check("вкладка неполного месяца помечена звёздочкой", s.includes("Ноя *"));
{
  const rc = textOf(byId["recap"]);
  check("«Итог месяца»: последний полный месяц — октябрь, неполный ноябрь не подводится", rc.includes("Итог октября") && !rc.includes("Итог ноября"));
  check("«Итог месяца»: всего за октябрь 900 и сравнение с сентябрём", /Всего потрачено 900 BYN/.test(rc) && /чем в сентябре/.test(rc));
  check("«Итог месяца»: оговорка про неразобранное (500 из 900 не разобрано)", /по разобранным 44/.test(rc));
}
check("по умолчанию показан весь период: итого 1170 (долг ещё в тратах)", hasTotal(s, "1\u00A0170,00"));
check("на вкладке «весь период» нет отдельного «Сравнения месяцев» (его заменяет «Динамика трат»)", !s.includes("Сравнение месяцев"));
check("на странице видна только одна вкладка: итогов по месяцам отдельно нет", !hasTotal(s, "250,00"));

// Отмечаем 500 как «Дал в долг»: уходит из трат и показывается отдельной строкой
vm.runInContext(`setTxRule(txs[5], "Дал в долг");`, ctx);
s = summaryText();
check("после «Дал в долг» итого за период 670", hasTotal(s, "670,00"));
check("строка «дал в долг: 500,00»", s.includes("дал в долг: 500,00"));

// Переключаем вкладки
check("нажатие на вкладку «Сентябрь»", clickButton(byId["summary"], "Сен"));
s = summaryText();
check("сентябрь: итого 250", hasTotal(s, "250,00"));
check("сентябрь: нет сравнения месяцев", !s.includes("Сравнение месяцев"));
check("выводы сменились на сентябрь", textOf(byId["insightsTitle"]).includes("Сентябрь 2026"));

check("нажатие на вкладку «Октябрь»", clickButton(byId["summary"], "Окт"));
s = summaryText();
check("октябрь без долга: итого 400", hasTotal(s, "400,00"));

check("нажатие на вкладку «Ноябрь»", clickButton(byId["summary"], "Ноя *"));
s = summaryText();
check("ноябрь: пометка о неполном месяце (с 1 по 2 число)", s.includes("неполный месяц: данные с 1 по 2 число"));
check("ноябрь: итого 20", hasTotal(s, "20,00"));

// Вкладка запоминается при перерисовке (например, после выбора категории)
vm.runInContext(`render();`, ctx);
check("после перерисовки осталась вкладка «Ноябрь»", hasTotal(summaryText(), "20,00"));

// ---- Таблица «Все операции»: фильтр по месяцу ----
vm.runInContext(`activeTab = "all"; renderAll();`, ctx);
let all = textOf(byId["all"]);
check("все операции: по умолчанию видны и сентябрь, и октябрь", all.includes("CAFE B") && all.includes("Погашение комиссии"));
vm.runInContext(`activeTab = "2026-10"; renderAll();`, ctx);
all = textOf(byId["all"]);
check("фильтр «Октябрь»: операции сентября скрыты", !all.includes("CAFE B") && all.includes("Погашение комиссии"));
check("заголовок раздела показывает месяц", textOf(byId["allSummary"]).includes("Октябрь"));
vm.runInContext(`activeTab = "all"; renderAll();`, ctx);
check("на вкладке «За весь период» заголовок показывает общее число операций", textOf(byId["allSummary"]).includes("(7)"));

// Клик по вкладке месяца сразу меняет и таблицу внизу
clickButton(byId["summary"], "Сен");
check("клик по вкладке «Сентябрь»: внизу только сентябрь", textOf(byId["all"]).includes("CAFE B") && !textOf(byId["all"]).includes("Погашение комиссии"));
clickButton(byId["summary"], "За весь период");
check("клик по «За весь период»: внизу снова все месяцы", textOf(byId["all"]).includes("CAFE B") && textOf(byId["all"]).includes("Погашение комиссии"));

// ---- Кнопки быстрого перехода ----
let nav = textOf(byId["nav"]);
check("кнопки перехода: траты и все операции", nav.includes("Траты") && nav.includes("Все операции"));
check("пока всё разобрано, кнопки «Нужно разобрать» нет", !nav.includes("Нужно разобрать"));
vm.runInContext(`
  txs.push({ date: "2026-10-28", time: "11:00:00", amount: -70, mcc: null, details: "Неизвестный платёж", balance: 9 });
  render();
`, ctx);
nav = textOf(byId["nav"]);
check("появилась неопознанная операция: кнопка «Нужно разобрать (1)»", nav.includes("Нужно разобрать (1)"));
check("неопознанная операция попала в блок «Нужно разобрать»", textOf(byId["review"]).includes("Неизвестный платёж"));

// ---- Выписка на один месяц: вкладок быть не должно ----
vm.runInContext(`
  header = { from: "2026-09-01", to: "2026-09-30" };
  txs = txs.filter(t => t.date.startsWith("2026-09"));
  activeTab = "all";
  render();
`, ctx);
s = summaryText();
check("один месяц: нет вкладок и сравнения", !s.includes("За весь период") && !s.includes("Сравнение месяцев"));
check("один месяц: есть таблица с категориями", s.includes("Продукты") && s.includes("Кафе и рестораны"));
check("один месяц: нет кнопки «Нужно разобрать», когда разбирать нечего", !textOf(byId["nav"]).includes("Нужно разобрать"));

// ---- Мастер «образец выписки» ----
vm.runInContext(`showAnon(false)`, ctx);
check("мастер: открывается на шаге 1, «Далее» доступно", vm.runInContext(`anonStep`, ctx) === 1 && byId["anonSheet"].hidden === false && byId["anonNext"].disabled === false && byId["anonBack"].hidden === true);
vm.runInContext(`anonGo(2)`, ctx);
check("мастер: шаг 2 без файла: дальше нельзя", byId["anonNext"].disabled === true && textOf(byId["anonNeed"]).includes("Выберите файл"));
vm.runInContext(`anon = { model: [[[]], [[]]], kind: "csv", page: 0, seen: new Set([0]) }; anonNextState()`, ctx);
check("мастер: файл прочитан, шаг 2 пускает дальше", byId["anonNext"].disabled === false);
vm.runInContext(`anonGo(3)`, ctx);
check("мастер: шаг 3, пока не просмотрены все страницы, дальше нельзя", byId["anonNext"].disabled === true && textOf(byId["anonNeed"]).includes("осталось: 1"));
vm.runInContext(`anon.seen.add(1); anonNextState(); anonGo(4); anonUpdateButtons()`, ctx);
check("мастер: шаг 4 из 4, главная кнопка недоступна без согласия, закрывать можно", byId["anonSend"].disabled === true && byId["anonNext"].disabled === false && byId["anonNext"].textContent === "Закрыть окно" && textOf(byId["anonStepNo"]).includes("4 из 4"));
vm.runInContext(`anonMade = "file"; anonPrepareMail()`, ctx);
check("мастер: письмо mailto собрано, Яндекса нет", /^mailto:bankanalyzer\.help@gmail\.com\?subject=/.test(byId["anonMail"].href || "") && !byId["anonYandex"]);
byId["anonNext"].listeners.click[0]();
check("мастер: «Закрыть окно» закрывает шторку и стирает образец из памяти", byId["anonSheet"].hidden === true && vm.runInContext(`anon === null && anonStep === 1`, ctx));

// ---- «Как получить выписку»: банки и ссылки ----
check("справка по банкам: не меньше 15 банков, у каждого шаги и срок", vm.runInContext(`BANK_HELP.length >= 15 && BANK_HELP.every(b => b.name && b.how.length && b.wait)`, ctx));
check("справка по банкам: у каждого банка есть раздел про мобильное приложение", vm.runInContext(`BANK_HELP.every(b => Array.isArray(b.app) && b.app.length && typeof b.appSure === "boolean")`, ctx));
check("справка по банкам: ссылки только https на сайты банков", vm.runInContext(`BANK_HELP.every(b => !b.link || /^https:[/][/][a-z0-9.-]+[.]by[/]/.test(b.link[0]))`, ctx));
check("справка по банкам: «читается сайтом» совпадает с Banks.BANKS", vm.runInContext(`BANK_HELP.filter(b => b.reads).length === Banks.BANKS.length`, ctx));
check("справка по банкам: список показывает все банки", byId["howBanks"].children.length === vm.runInContext(`BANK_HELP.length`, ctx));
vm.runInContext(`showHowBank("alfa")`, ctx);
check("справка по банкам: страница банка со ссылкой на сайт банка", byId["howList"].hidden === true && byId["howDetail"].hidden === false && JSON.stringify(byId["howDetail"]).includes("help.alfabank.by") && JSON.stringify(byId["howDetail"]).includes("noopener"));
vm.runInContext(`showHowList()`, ctx);

// ---- Тема и значки ----
check("тема по умолчанию следует системе", document.documentElement.attrs["data-theme"] === "auto" && byId["themeToggle"] && byId["themeToggle"].attrs["data-dark"] === "false");
byId["themeToggle"].listeners.click[0]();
check("один клик: включается тёмная и запоминается", document.documentElement.attrs["data-theme"] === "dark" && byId["themeToggle"].attrs["data-dark"] === "true");
check("theme-color следует выбору", byId["themeMetaL"].attrs["content"] === "#111112" && byId["themeMetaD"].attrs["content"] === "#111112");
byId["themeToggle"].listeners.click[0]();
check("второй клик возвращает светлую", document.documentElement.attrs["data-theme"] === "light" && byId["themeMetaL"].attrs["content"] === "#F4F6F9" && byId["themeMetaD"].attrs["content"] === "#F4F6F9");
check("цвет категории постоянен и из --cat-*", vm.runInContext(`catColor("Продукты") === "var(--cat-food)" && catColor("Прочее") === "var(--cat-other)" && catColor("Моя своя") === catColor("Моя своя") && /^var\\(--cat-/.test(catColor("Моя своя"))`, ctx));
check("диаграмма: корзины и «Не разобрано» слиты в одну долю «Нужно разобрать» (пунктир), она первая и стоит справа", vm.runInContext(`(() => { const j = JSON.stringify(pieChart({ rows: [["Продукты", 100], ["Платежи через интернет-банк", 60], ["Не разобрано", 20], ["Транспорт", 10]], total: 190 })); return (j.split("data-i=").length - 1) === 3 && !j.includes("pattern") && j.includes("stroke-dasharray") && /data-i=.{1,4}0.{1,4} style=.{1,4}fill:var[(]--surface-2/.test(j); })()`, ctx));
check("диаграмма: «Переводы на карты и счета» своя доля, не внутри «Нужно разобрать»", vm.runInContext(`(() => { const j = JSON.stringify(pieChart({ rows: [["Продукты", 100], ["Переводы на карты и счета", 60], ["Не разобрано", 20]], total: 180 })); return (j.split("data-i=").length - 1) === 3 && j.includes("--cat-transfer"); })()`, ctx));
check("под диаграммой пояснения списком, первым про переводы и кнопка «Уточнить переводы»", vm.runInContext(`(() => { const j = JSON.stringify(summarySection("", "", { rows: [["Продукты", 100], ["Переводы на карты и счета", 60]], total: 160 })); return j.includes("onotes") && j.includes("Уточнить переводы") && j.indexOf("Переводы на карты и счета: ") < j.indexOf("Уточнить переводы"); })()`, ctx));
check("в таблице у категории цветная точка", JSON.stringify(byId["summary"]).includes("var(--cat-"));
check("у всех стандартных категорий есть значок", vm.runInContext(`Cat.DEFAULT_CATEGORIES.every(c => Cat.ICONS[c])`, ctx));
check("значок своей категории сохраняется", vm.runInContext(`ensureCategory("Питомцы","paw"); iconKey("Питомцы")`, ctx) === "paw");
check("без значка — запасной", vm.runInContext(`ensureCategory("Без значка"); iconKey("Без значка")`, ctx) === "tag");
check("у каждого значка есть рисунок", vm.runInContext(`Object.values(Cat.ICONS).concat(PICK_ICONS).every(k => ICON_SVG[k])`, ctx));
check("в таблице категорий есть значки", JSON.stringify(byId["summary"]).includes('<svg'));

// ---- Загрузка разбора из файла ----
vm.runInContext(`applyBackup({app:"bank-analyzer",rules:{"k1":"Продукты"},txRules:{"t1":"Прочее"},cats:["Тест"],icons:{"Тест":"gift"}})`, ctx);
check("разбор из файла применился", vm.runInContext(`userRules.k1==="Продукты" && txRules.t1==="Прочее" && customCats.includes("Тест") && iconKey("Тест")==="gift"`, ctx));
check("чужой файл отклоняется", vm.runInContext(`try{applyBackup({x:1});false}catch(e){true}`, ctx));

// ---- Сквозной сценарий: разбор из файла применяется к уже загруженной выписке ----
vm.runInContext(`
  txs = [{ date: "2026-10-28", time: "11:00:00", amount: -70, mcc: null, details: "Загадочный магазин", balance: 9 }];
  header = { from: "2026-10-01", to: "2026-10-31" };
  userRules = {}; txRules = {}; customCats = []; customIcons = {};
  render();
`, ctx);
check("до загрузки разбора операция в «Нужно разобрать»", vm.runInContext(`reviewOps`, ctx) === 1);
vm.runInContext(`applyBackup({app:"bank-analyzer",txRules:{[txId(txs[0])]:"Здоровье"}}); render();`, ctx);
check("после загрузки разбора операция разобрана", vm.runInContext(`reviewOps === 0 && categoryOf(txs[0]) === "Здоровье"`, ctx));

// ---- Загрузка только разбора, без выписки ----
const snapshot = vm.runInContext(`JSON.stringify(backupData())`, ctx);
vm.runInContext(`txs = []; header = {}; userRules = {}; txRules = {}; customCats = []; customIcons = {};`, ctx);
vm.runInContext(`applyBackup(JSON.parse(${JSON.stringify(snapshot)})); render();`, ctx);
check("разбор без выписки: операции вернулись", vm.runInContext(`txs.length === 1 && header.from === "2026-10-01"`, ctx));
check("разбор без выписки: категории на месте", vm.runInContext(`reviewOps === 0 && categoryOf(txs[0]) === "Здоровье"`, ctx));

// ---- Круговая диаграмма ----
vm.runInContext(`txs = [{ date: "2026-10-05", time: "10:00:00", amount: -30, mcc: "5411", details: "Магазин", balance: 1 }, { date: "2026-10-06", time: "10:00:00", amount: -70, mcc: "5812", details: "Кафе", balance: 2 }]; header = { from: "2026-10-01", to: "2026-10-31" }; summaryView = "pie"; render();`, ctx);
const pieText = JSON.stringify(byId["summary"]);
check("диаграмма: нарисован круг и есть легенда", pieText.includes("donut") && pieText.includes("Продукты") && pieText.includes("70%"));
vm.runInContext(`summaryView = "table"; render();`, ctx);
check("таблица возвращается", !JSON.stringify(byId["summary"]).includes("donut") && JSON.stringify(byId["summary"]).includes("Сумма, BYN"));

// ---- Все операции: категория и порядок ----
vm.runInContext(`
  userRules = {}; txRules = {}; customCats = []; customIcons = {};
  txs = [
    { date: "2026-10-05", time: "10:00:00", amount: -30, mcc: "5411", details: "ПРОДУКТЫ-А", balance: 1 },
    { date: "2026-10-06", time: "10:00:00", amount: -300, mcc: "5812", details: "КАФЕ-Б", balance: 2 },
    { date: "2026-10-07", time: "10:00:00", amount: -90, mcc: "5411", details: "ПРОДУКТЫ-В", balance: 3 },
    { date: "2026-10-08", time: "10:00:00", amount: -5, mcc: null, details: "НЕИЗВЕСТНО-Г", balance: 4 },
  ];
  header = { from: "2026-10-01", to: "2026-10-31" };
  activeTab = "all"; allCat = "all"; allSort = "date-desc"; render();
`, ctx);
const allText = () => textOf(byId["all"]);
check("все операции: по умолчанию сначала новые", allText().indexOf("НЕИЗВЕСТНО-Г") < allText().indexOf("ПРОДУКТЫ-А"));
vm.runInContext(`allCat = "Продукты"; renderAll();`, ctx);
check("фильтр категории: остаются операции продуктов", allText().includes("ПРОДУКТЫ-А") && allText().includes("ПРОДУКТЫ-В"));
check("фильтр категории: остальные операции скрыты", !allText().includes("КАФЕ-Б") && !allText().includes("НЕИЗВЕСТНО-Г"));
vm.runInContext(`allSort = "sum-desc"; renderAll();`, ctx);
check("сортировка по сумме: сначала крупные", allText().indexOf("ПРОДУКТЫ-В") < allText().indexOf("ПРОДУКТЫ-А"));
vm.runInContext(`allSort = "sum-asc"; renderAll();`, ctx);
check("сортировка по сумме: сначала мелкие", allText().indexOf("ПРОДУКТЫ-А") < allText().indexOf("ПРОДУКТЫ-В"));
vm.runInContext(`allCat = "Не разобрано"; renderAll();`, ctx);
check("«Не разобрано» оставляет только неразобранные", allText().includes("НЕИЗВЕСТНО-Г") && !allText().includes("ПРОДУКТЫ-А"));
vm.runInContext(`allCat = "all"; allSort = "date-asc"; renderAll();`, ctx);
check("сортировка по дате: сначала старые", allText().indexOf("ПРОДУКТЫ-А") < allText().indexOf("НЕИЗВЕСТНО-Г"));

// ---- Сортировка кликом по заголовкам и подтверждение сброса ----
function clickTh(root, label) {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    if (typeof n === "string") continue;
    if (n.tag === "th" && textOf(n).trim().startsWith(label) && n.listeners.click) { n.listeners.click[0](); return true; }
    stack.push(...n.children);
  }
  return false;
}
vm.runInContext(`allCat = "all"; allSort = "date-desc"; renderAll();`, ctx);
clickTh(byId["all"], "Сумма");
check("клик по «Сумма»: сначала крупные", vm.runInContext(`allSort`, ctx) === "sum-desc");
clickTh(byId["all"], "Сумма");
check("второй клик по «Сумма»: сначала мелкие", vm.runInContext(`allSort`, ctx) === "sum-asc");
clickTh(byId["all"], "Дата");
check("клик по «Дата»: сначала новые", vm.runInContext(`allSort`, ctx) === "date-desc");
clickTh(byId["all"], "Дата");
check("второй клик по «Дата»: сначала старые", vm.runInContext(`allSort`, ctx) === "date-asc");
check("на активном столбце есть стрелка", textOf(byId["all"]).includes("Дата ▲"));
vm.runInContext(`ensureCategory("Временная"); setTxRule(txs[0], "Временная");`, ctx);
byId["reset"].listeners.click[0]();
check("сброс: сначала только предупреждение", vm.runInContext(`txRules[txId(txs[0])]`, ctx) === "Временная" && byId["resetBox"].hidden === false);
byId["resetNo"].listeners.click[0]();
check("отмена сброса ничего не стирает", vm.runInContext(`txRules[txId(txs[0])]`, ctx) === "Временная" && byId["resetBox"].hidden === true);
byId["reset"].listeners.click[0]();
byId["resetYes"].listeners.click[0]();
check("подтверждённый сброс стирает выбор", vm.runInContext(`Object.keys(txRules).length === 0 && customCats.length === 0`, ctx));

// ---- «Нужно разобрать» следует за вкладкой месяца и стоит первым ----
vm.runInContext(`
  userRules = {}; txRules = {}; customCats = []; customIcons = {};
  txs = [
    { date: "2026-09-05", time: "10:00:00", amount: -30, mcc: "5411", details: "ИЗВЕСТНО", balance: 1 },
    { date: "2026-09-06", time: "10:00:00", amount: -11, mcc: null, details: "СЕНТЯБРЬ-НЕИЗВЕСТНО", balance: 2 },
    { date: "2026-10-07", time: "10:00:00", amount: -22, mcc: null, details: "ОКТЯБРЬ-НЕИЗВЕСТНО", balance: 3 },
    { date: "2026-10-08", time: "10:00:00", amount: -44, mcc: "5411", details: "ЕЩЁ-ИЗВЕСТНО", balance: 4 },
  ];
  header = { from: "2026-09-01", to: "2026-10-31" };
  activeTab = "all"; allCat = "all"; render();
`, ctx);
check("разбор: на вкладке «За весь период» видны оба месяца", textOf(byId["review"]).includes("СЕНТЯБРЬ-НЕИЗВЕСТНО") && textOf(byId["review"]).includes("ОКТЯБРЬ-НЕИЗВЕСТНО"));
clickButton(byId["summary"], "Сен");
check("разбор: на вкладке «Сентябрь» только сентябрьские", textOf(byId["review"]).includes("СЕНТЯБРЬ-НЕИЗВЕСТНО") && !textOf(byId["review"]).includes("ОКТЯБРЬ-НЕИЗВЕСТНО"));
check("разбор: есть ссылка на неразобранные в октябре", textOf(byId["reviewOther"]).includes("Октябрь 2026: 1"));
check("разбор: в заголовке указан месяц", textOf(byId["reviewCount"]).includes("Сентябрь"));
check("разбор: в навигации счётчик по выбранному месяцу", textOf(byId["nav"]).includes("Нужно разобрать (1)"));
clickButton(byId["reviewOther"], "Октябрь");
check("клик по ссылке открывает октябрь", vm.runInContext(`activeTab`, ctx) === "2026-10" && textOf(byId["review"]).includes("ОКТЯБРЬ-НЕИЗВЕСТНО"));
check("плашка разбора стоит под итогами, вкладки внизу", html.indexOf('id="summary"') < html.indexOf('id="reviewBanner"') && html.indexOf('id="reviewBanner"') < html.indexOf('id="bottomTabs"') && html.indexOf('id="summary"') < html.indexOf('id="bottomTabs"') && html.indexOf('id="bottomTabs"') < html.indexOf('id="insightsTitle"'));   // с v4.28 неразобранное стоит сразу под диаграммой, до «Выводов» и «Планирования»
check("плашка показывает число и кнопку", !byId["reviewBanner"].hidden && textOf(byId["reviewBanner"]).includes("Можно уточнить") && textOf(byId["reviewBanner"]).length < 200 && textOf(byId["reviewBanner"]).includes("Уточнить"));
check("есть нижние вкладки «Все операции» и «Нужно разобрать»", textOf(byId["bottomTabs"]).includes("Все операции") && textOf(byId["bottomTabs"]).includes("Нужно разобрать"));
vm.runInContext(`bottomTab = null; render();`, ctx);
check("если есть неразобранное, открыта вкладка «Нужно разобрать»", byId["reviewSection"].hidden === false && byId["allPanel"].hidden === true);
clickButton(byId["bottomTabs"], "Все операции");
check("клик по вкладке «Все операции» переключает панель", byId["reviewSection"].hidden === true && byId["allPanel"].hidden === false);
clickButton(byId["reviewBanner"], "Уточнить");
check("кнопка на плашке открывает «Нужно разобрать»", byId["reviewSection"].hidden === false);
// Разбираем всё: операция уходит из «Нужно разобрать» и попадает в «Все операции»
vm.runInContext(`txs.filter(t => !categoryOf(t)).forEach(t => setTxRule(t, "Прочее"));`, ctx);
check("всё разобрано: плашки и вкладки «Нужно разобрать» нет", byId["reviewBanner"].hidden === true && !textOf(byId["bottomTabs"]).includes("Нужно разобрать"));
check("всё разобрано: в разделе «Разобрать» открыты «Все операции», «Нужно разобрать» нет", byId["allPanel"].hidden === false && byId["reviewSection"].hidden === true && textOf(byId["bottomTabs"]).includes("Все операции"));

// ---- Список в разделе «Разобрать» всегда развёрнут: клик по вкладке только переключает ----
vm.runInContext(`bottomOpen = true; bottomTab = "all"; render();`, ctx);
check("список внизу по умолчанию развёрнут", byId["allPanel"].hidden === false);
check("отдельной кнопки «Свернуть список» нет", !textOf(byId["bottomTabs"]).includes("Свернуть") && !textOf(byId["bottomTabs"]).includes("Развернуть"));
clickButton(byId["bottomTabs"], "Все операции");
check("клик по открытой вкладке список не сворачивает", byId["allPanel"].hidden === false);
clickButton(byId["bottomTabs"], "Все операции");
check("клик по вкладке снова: список открыт", byId["allPanel"].hidden === false);

// ---- Разделы-экраны и панель разделов ----
check("панель: пять разделов", ["Обзор", "Уточнить", "Регулярные", "Бюджет", "Ещё"].every(n => textOf(byId["tabbar"]).includes(n)) && !textOf(byId["tabbar"]).includes("Выводы"));
vm.runInContext(`curSection = "overview"; render();`, ctx);
check("панель: у «Обзора» отмечен текущий раздел", vm.runInContext("curSection", ctx) === "overview" && byId["tabbar"].children[0].className === "active");
clickButton(byId["tabbar"], "Регулярные");
check("раздел «Регулярные»: data-view и активная кнопка", document.body.attrs["data-view"] === "subs" && byId["tabbar"].children[2].className === "active");
clickButton(byId["tabbar"], "Ещё");
check("раздел «Ещё»: data-view", document.body.attrs["data-view"] === "more");
clickButton(byId["tabbar"], "Обзор");
check("возврат на «Обзор»", document.body.attrs["data-view"] === "overview");

// ---- Категории по кругу и поиск: выбранная категория поднимается наверх, остальные остаются ----
function findEl(root, pred) {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    if (typeof n === "string") continue;
    if (pred(n)) return n;
    stack.push(...n.children);
  }
  return null;
}
vm.runInContext(`
  userRules = {}; txRules = {}; customCats = []; customIcons = {};
  txs = [
    { date: "2026-10-05", time: "10:00:00", amount: -30, mcc: "5411", details: "ПРОДУКТЫ-А", balance: 1 },
    { date: "2026-10-06", time: "10:00:00", amount: -300, mcc: "5812", details: "КАФЕ-Б", balance: 2 },
    { date: "2026-10-07", time: "10:00:00", amount: -90, mcc: "5411", details: "ПРОДУКТЫ-В", balance: 3 },
    { date: "2026-10-08", time: "10:00:00", amount: -5, mcc: null, details: "НЕИЗВЕСТНО-Г", balance: 4 },
  ];
  header = { from: "2026-10-01", to: "2026-10-31" };
  allCat = "all"; allSort = "date-desc"; activeTab = "all"; render();
`, ctx);
const cats = vm.runInContext(`[...new Set(txs.map(t => categoryOf(t) || "Не разобрано"))].sort((x, y) => x === "Не разобрано" ? -1 : y === "Не разобрано" ? 1 : x.localeCompare(y, "ru"))`, ctx);
const seen = [];
for (let i = 0; i < cats.length; i++) { clickTh(byId["all"], "Категория"); seen.push(vm.runInContext(`allCat`, ctx)); }
check("каждый клик по «Категория» показывает следующую категорию", JSON.stringify(seen) === JSON.stringify(cats));
check("при этом список сужен до выбранной категории", ["ПРОДУКТЫ-А", "ПРОДУКТЫ-В", "КАФЕ-Б", "НЕИЗВЕСТНО-Г"].filter(x => allText().includes(x)).length < 4);
clickTh(byId["all"], "Категория");
check("после последней категории круг начинается заново", vm.runInContext(`allCat`, ctx) === "all");
clickTh(byId["all"], "Категория");
check("и снова первая категория", vm.runInContext(`allCat`, ctx) === cats[0]);
const box = findEl(byId["all"], n => n.tag === "input" && n.attrs.placeholder === "категория");
check("поле поиска стоит в заголовке «Категория» и показывает текущую", box && box.value === cats[0]);
box.value = "кафе";
box.listeners.input[0]();
check("поиск категории: начало названия оставляет только её", vm.runInContext(`allCat`, ctx) === "Кафе и рестораны" && allText().includes("КАФЕ-Б") && !allText().includes("ПРОДУКТЫ-А"));
box.value = "";
box.listeners.input[0]();
check("пустой поиск возвращает обычный порядок", vm.runInContext(`allCat`, ctx) === "all");
vm.runInContext(`allCat = "all"; renderAll();`, ctx);

// ---- Поиск и фильтры над таблицей ----
const filt = () => byId["allFilter"];
const input = ph => findEl(filt(), n => n.tag === "input" && n.attrs.placeholder === ph);
const typeIn = (el, v) => { el.value = v; el.listeners.input[0](); };
vm.runInContext(`allCat = "all"; allFilt = Filters.empty(); renderAll();`, ctx);
check("панель фильтров на месте: поиск, сумма от и до", input("поиск: описание, сумма, дата") && input("от") && input("до"));
typeIn(input("поиск: описание, сумма, дата"), "продукты-в");
check("поиск по описанию оставляет только совпавшее", allText().includes("ПРОДУКТЫ-В") && !allText().includes("КАФЕ-Б") && !allText().includes("ПРОДУКТЫ-А"));
check("в итогах: найдено X из Y", textOf(filt()).includes("найдено операций: 1 из 4"));
typeIn(input("поиск: описание, сумма, дата"), "нет-такого");
check("ничего не найдено: понятная строка со сбросом", allText().includes("Ничего не найдено"));
typeIn(input("поиск: описание, сумма, дата"), "");
typeIn(input("от"), "50");
check("сумма от: мелкие операции скрыты", allText().includes("ПРОДУКТЫ-В") && !allText().includes("НЕИЗВЕСТНО-Г"));
typeIn(input("до"), "95");
check("сумма от и до", allText().includes("ПРОДУКТЫ-В") && !allText().includes("ПРОДУКТЫ-А"));
const resetEl = findEl(filt(), n => n.tag === "button" && textOf(n).trim() === "Сбросить");
check("кнопка «Сбросить» видна при активном фильтре", resetEl && !resetEl.hidden);
resetEl.listeners.click[0]();
check("сброс возвращает все операции", ["ПРОДУКТЫ-А", "ПРОДУКТЫ-В", "КАФЕ-Б", "НЕИЗВЕСТНО-Г"].every(x => allText().includes(x)) && !textOf(filt()).includes("найдено"));
const expBtn = findEl(filt(), n => n.tag === "button" && textOf(n).trim() === "Расходы");
expBtn.listeners.click[0]();
check("«Расходы»: нажатая кнопка помечена", expBtn.attrs["aria-pressed"] === "true" && vm.runInContext(`allFilt.kind`, ctx) === "expense");
vm.runInContext(`allFilt = Filters.empty(); allCat = "all"; renderAll();`, ctx);
check("сортировка не сбрасывает фильтр", (() => { typeIn(input("поиск: описание, сумма, дата"), "продукты"); clickTh(byId["all"], "Сумма"); return vm.runInContext(`allFilt.query`, ctx) === "продукты"; })());
vm.runInContext(`allFilt = Filters.empty(); allCat = "all"; renderAll();`, ctx);

// ---- Пары «пришло и сразу ушло» (ВТБ): видны в списке, но не считаются ----
vm.runInContext(`
  header = { from: "2026-03-01", to: "2026-03-31", bank: "vtb" };
  txs = [
    { date: "2026-03-02", time: "10:00:00", amount: 500,  mcc: null, details: "ЗАЧИСЛЕНИЕ-ПАРА", balance: 500, pair: 1 },
    { date: "2026-03-02", time: "11:00:00", amount: -500, mcc: null, details: "ЕРИП-ПАРА", balance: 0, pair: 1 },
    { date: "2026-03-03", time: "11:00:00", amount: -40,  mcc: "5411", details: "МАГАЗИН-ОБЫЧНЫЙ", balance: -40 },
    { date: "2026-03-04", time: "11:00:00", amount: 100,  mcc: null, details: "ЗАРПЛАТА-ОБЫЧНАЯ", balance: 60 },
  ];
  allCat = "all"; allSort = "date-desc"; activeTab = "all"; render();
`, ctx);
const allAfter = textOf(byId["all"]);
check("пара остаётся в списке операций", allAfter.includes("ЗАЧИСЛЕНИЕ-ПАРА") && allAfter.includes("ЕРИП-ПАРА"));
check("у пары заметная пометка «между своими»", (allAfter.match(/между своими/g) || []).length >= 2);
check("пара в тратах не учитывается: итого 40", hasTotal(summaryText(), "40,00"));
const infoLine = textOf(byId["allFilter"]);
check("в строке итогов расходы 40, поступления 100 (без пары)", infoLine.includes("расходы: 40,00") && infoLine.includes("поступления: 100,00"));
check("в строке итогов отдельно показаны переводы между своими", infoLine.includes("между своими (не в счёт): 2"));
vm.runInContext(`setTxRule(txs[1], "Прочее"); renderAll();`, ctx);
check("выбор пользователя для операции сильнее пометки пары", vm.runInContext(`categoryOf(txs[1]) === "Прочее"`, ctx));
vm.runInContext(`txs.forEach(t => delete t.pair); txRules = {}; allCat = "all"; renderAll();`, ctx);

// ---- Демо на выдуманных данных ----
vm.runInContext(`
  userRules = { realkey: "Здоровье" }; txRules = { realtx: "Прочее" }; customCats = ["Моя"]; customIcons = {};
  header = { from: "2026-03-01", to: "2026-03-31", bank: "vtb" };
  txs = [{ date: "2026-03-03", time: "11:00:00", amount: -40, mcc: "5411", details: "НАСТОЯЩАЯ-ОПЕРАЦИЯ", balance: 1 }];
  render();
`, ctx);
lsWrites.length = 0;
vm.runInContext(`enterDemo();`, ctx);
check("демо: начальная страница на месте, плашка «Демо» показана", !(byId["landing"] && byId["landing"].hidden) && byId["demoBar"].hidden === false);
check("демо: блок сохранения разбора спрятан", byId["dataRules"].hidden === true && byId["resetRow"].hidden === true);
check("демо: выдуманные операции", vm.runInContext(`header.bank === "demo" && txs.length > 50 && !txs.some(t => /НАСТОЯЩАЯ/.test(t.details))`, ctx));
check("демо: есть что разбирать и есть пары «между своими»", vm.runInContext(`reviewOps > 0 && txs.some(t => t.pair)`, ctx));
check("демо: в траты попали категории", textOf(byId["summary"]).includes("Продукты") && !textOf(byId["summary"]).includes("НАСТОЯЩАЯ"));
vm.runInContext(`setTxRule(txs.find(t => !categoryOf(t)), "Прочее");`, ctx);
check("демо: выбор категории ничего не пишет в хранилище", lsWrites.filter(k => k.startsWith("ba_rules") || k.startsWith("ba_txrules") || k.startsWith("ba_cats") || k.startsWith("ba_icons")).length === 0);
vm.runInContext(`leaveDemo();`, ctx);
check("выход из демо возвращает настоящие данные и разбор", vm.runInContext(`txs.length === 1 && txs[0].details === "НАСТОЯЩАЯ-ОПЕРАЦИЯ" && userRules.realkey === "Здоровье" && txRules.realtx === "Прочее" && customCats[0] === "Моя"`, ctx));
check("после выхода плашка демо спрятана, блок разбора виден", byId["demoBar"].hidden === true && byId["dataRules"].hidden === false);
vm.runInContext(`txs = []; header = {}; enterDemo(); leaveDemo();`, ctx);
check("выход из демо без своих данных прячет отчёт, начальная страница на месте", !(byId["landing"] && byId["landing"].hidden) && byId["report"].hidden === true);

// ---- Несколько выписок, выгрузка, очистка ----
vm.runInContext(`
  userRules = {}; txRules = {}; customCats = []; customIcons = {};
  txs = [
    { date: "2026-03-02", time: "10:00:00", amount: 100, mcc: null, details: "ЗАРПЛАТА", balance: 100, bank: "vtb", src: 0 },
    { date: "2026-03-03", time: "11:00:00", amount: -40, mcc: "5411", details: "МАГАЗИН", balance: 60, bank: "mtb", src: 1 },
  ];
  statements = [
    { bank: "vtb", bankName: "ВТБ (Беларусь)", from: "2026-03-01", to: "2026-03-31", count: 1, added: 1, skipped: 0, check: { headerIncome: 100, headerExpense: 0, income: 100, expense: 0, incomeOk: true, expenseOk: true, ok: true } },
    { bank: "mtb", bankName: "МТБанк", from: "2026-03-01", to: "2026-03-31", count: 2, added: 1, skipped: 1, check: null },
  ];
  header = Merge.mergedHeader(statements);
  allCat = "all"; activeTab = "all"; render();
`, ctx);
const chk = textOf(byId["check"]);
check("сверка показана для каждой выписки", chk.includes("ВТБ (Беларусь): 1 операций") && chk.includes("МТБанк: 2 операций") && chk.includes("повторов пропущено: 1"));
check("у выписки с итогами видны галочки, общее число операций", chk.includes("найдено 100,00 ✓") && chk.includes("Всего операций: 2"));
check("кнопка «Убрать выписки» видна", byId["clearBtn"].hidden === false);
byId["expSumText"].listeners.click[0]();
check("выгрузка итогов текстом: заголовок таблицы с месяцем", byId["exportText"].value.startsWith("Категория;Март 2026;Итого") && byId["exportText"].value.includes("Продукты;40,00;40,00"));
byId["expOpsText"].listeners.click[0]();
check("выгрузка операций текстом: банк и тип", byId["exportText"].value.includes("ВТБ (Беларусь);100,00;BYN;Пополнения;доход;ЗАРПЛАТА") && byId["exportText"].value.includes("МТБанк;-40,00;BYN;Продукты;расход;МАГАЗИН"));
// резервная копия: список выписок сохраняется и возвращается
const snap3 = vm.runInContext(`JSON.stringify(backupData())`, ctx);
check("в резервной копии версия 3 и список выписок", JSON.parse(snap3).version === 3 && JSON.parse(snap3).statements.length === 2);
vm.runInContext(`txs = []; header = {}; statements = []; applyBackup(JSON.parse(${JSON.stringify(snap3)})); render();`, ctx);
check("список выписок восстановлен из копии", vm.runInContext(`statements.length === 2 && header.bank === "multi" && txs.length === 2`, ctx));
vm.runInContext(`txs = []; header = {}; statements = []; applyBackup({app:"bank-analyzer", txs:[{date:"2026-01-01",time:"1",amount:-5,balance:1,details:"X"}], header:{from:"2026-01-01",to:"2026-01-31",bank:"mtb"}}); render();`, ctx);
check("старая копия без списка выписок: одна запись из шапки", vm.runInContext(`statements.length === 1 && statements[0].bankName === "МТБанк" && statements[0].count === 1`, ctx));
byId["clearBtn"].listeners.click[0]();
check("«Убрать выписки»: операции и отчёт убраны, разбор остался", vm.runInContext(`txs.length === 0 && statements.length === 0`, ctx) && byId["report"].hidden === true);


// ---- «Нужно разобрать»: быстрые категории, подсказки, ключи памяти, разбор по одной ----
vm.runInContext(`
  txs = [
    { date: "2026-09-07", time: "10:00:00", amount: -50, mcc: null, details: "Оплата услуг ЕРИП", balance: 1 },
    { date: "2026-10-07", time: "10:00:00", amount: -50, mcc: null, details: "Оплата услуг ЕРИП", balance: 2 },
    { date: "2026-10-09", time: "11:00:00", amount: -30, mcc: null, details: "Перевод P2P SBERBANK", balance: 3 },
    { date: "2026-10-12", time: "12:00:00", amount: -75, mcc: null, details: "Перевод P2P SBERBANK", balance: 4 },
  ];
  header = { from: "2026-09-01", to: "2026-10-31" };
  userRules = {}; txRules = {}; activeTab = "all"; allCat = "all"; render();
`, ctx);
const rvQuick = textOf(byId["review"]);
check("переводы: компактная панель «в пару нажатий», кнопки «Свой счёт» и «Человеку»", rvQuick.includes("Переводы: 1 группа") && rvQuick.includes("Свой счёт") && rvQuick.includes("Человеку") && rvQuick.includes("Запомнить для всех будущих"));
clickButton(byId["review"], "Подробно");
const rv = textOf(byId["review"]);
check("разбор: подсказка по признакам помечена как предположение", rv.includes("Предположение") && rv.includes("ЕРИП"));
check("разбор: на карточке видны последние операции и совет про приложение банка", rv.includes("Последние:") && rv.includes("07.10 · 50,00") && html.includes("в приложении банка"));
check("разбор: есть быстрые категории и «Пропустить»", rv.includes("Связь и подписки") && rv.includes("Пропустить") && rv.includes("Ещё…"));
check("разбор: переводы без получателя с разными суммами идут по одной", rv.includes("отметьте каждую операцию") && rv.includes("12.10") && rv.includes("09.10"));
check("разбор: пояснение короткое, подробности под «Как это работает»", html.includes("Как это работает") && !html.includes("Непонятное и мелкое отправляйте"));
clickButton(byId["review"], "Подарки");
check("разбор: клик по быстрой категории в режиме «по одной» применяется только к этой операции", vm.runInContext(`Object.keys(txRules).length === 1 && Object.values(txRules)[0] === "Подарки"`, ctx));


// ---- Перевод на конкретный счёт: один вопрос «чей он» вместо общих категорий ----
vm.runInContext(`
  const D = n => "MTB MOBILE BANK MINSK BY MP2B 140103 Оплата в Интернет-банке, Наименование операции: Пополнение карточки, номер счета BY00TEST000000000000000007933 3, номер устройства 5M100016, 0" + n + ".11.2026";
  txs = [
    { date: "2026-11-02", time: "10:00:00", amount: -10, mcc: "5399", details: D(2), balance: 1 },
    { date: "2026-11-03", time: "10:00:00", amount: -20, mcc: "5399", details: D(3), balance: 2 },
    { date: "2026-11-04", time: "10:00:00", amount: -30, mcc: "5399", details: D(4), balance: 3 },
  ];
  header = { from: "2026-11-01", to: "2026-11-30" };
  userRules = {}; txRules = {}; activeTab = "all"; allCat = "all"; render();
`, ctx);
clickButton(byId["review"], "Подробно");
const rv2 = textOf(byId["review"]);
check("счёт: вместо общих категорий задан вопрос «чей он»", rv2.includes("Чей этот счёт или карта?") && rv2.includes("Мой счёт") && rv2.includes("Другого человека") && rv2.includes("Оплата услуги или магазина") && !rv2.includes("Продукты"));
clickButton(byId["review"], "Другого человека");
check("счёт: «Другого человека» показывает варианты перевода", textOf(byId["review"]).includes("Дал в долг") && textOf(byId["review"]).includes("Подарки"));
clickButton(byId["review"], "Подарки");
check("счёт: выбор применяется ко всей группе", vm.runInContext(`Object.values(userRules).includes("Подарки")`, ctx));


// ---- Переводы в пару нажатий: одна кнопка на группу, запоминание для будущих, отмена ----
vm.runInContext(`
  const D2 = (acct, n) => "MTB MOBILE BANK MINSK BY MP2B 140103 Оплата в Интернет-банке, Наименование операции: Пополнение карточки, номер счета BY00TEST00" + acct + ", номер устройства 5M100016, 0" + n + ".11.2026";
  txs = [
    { date: "2026-11-02", time: "10:00:00", amount: -10, mcc: "5399", details: D2("1111", 2), balance: 1 },
    { date: "2026-11-03", time: "10:00:00", amount: -20, mcc: "5399", details: D2("1111", 3), balance: 2 },
    { date: "2026-11-04", time: "10:00:00", amount: -30, mcc: "5399", details: D2("2222", 4), balance: 3 },
  ];
  header = { from: "2026-11-01", to: "2026-11-30" };
  userRules = {}; txRules = {}; tailUndo.length = 0; trExpanded.clear(); activeTab = "all"; allCat = "all"; render();
`, ctx);
check("переводы: две группы по получателю в одной панели", textOf(byId["review"]).includes("Переводы: 2 группы"));
clickButton(byId["review"], "Человеку");
check("переводы: «Человеку» относит группу к «Переводы людям» и запоминает правило", vm.runInContext(`Object.values(userRules).filter(c => c === Cat.P2P).length === 1 && Object.keys(txRules).length === 0`, ctx));
check("переводы: после нажатия осталась одна группа и есть «Отменить»", textOf(byId["review"]).includes("Переводы: 1 группа") && textOf(byId["undoBar"]).includes("Переводы людям") && textOf(byId["undoBar"]).includes("Запомнено для будущих"));
clickButton(byId["undoBar"], "Отменить");
check("переводы: отмена возвращает группу", vm.runInContext(`Object.keys(userRules).length === 0`, ctx) && textOf(byId["review"]).includes("Переводы: 2 группы"));
vm.runInContext(`trRemember = false;`, ctx);
clickButton(byId["review"], "Человеку");
check("переводы: без «запомнить» правило ставится только на операции этой группы", vm.runInContext(`Object.keys(userRules).length === 0 && Object.keys(txRules).length >= 1 && Object.values(txRules).every(c => c === Cat.P2P)`, ctx));
vm.runInContext(`trRemember = true;`, ctx);


// ---- Остальные группы тоже начинаются с понятного вопроса ----
vm.runInContext(`
  txs = [
    { date: "2026-10-05", time: "10:00:00", amount: -50, mcc: null, details: "Оплата услуг ЕРИП", balance: 1 },
    { date: "2026-09-05", time: "10:00:00", amount: -50, mcc: null, details: "Оплата услуг ЕРИП", balance: 2 },
    { date: "2026-10-07", time: "10:00:00", amount: -80, mcc: null, details: "Платёж по реквизитам", balance: 3 },
    { date: "2026-10-17", time: "10:00:00", amount: -95, mcc: null, details: "Платёж по реквизитам", balance: 4 },
    { date: "2026-10-09", time: "10:00:00", amount: -12, mcc: null, details: "НЕИЗВЕСТНЫЙ МАГАЗИН", balance: 5 },
  ];
  header = { from: "2026-09-01", to: "2026-10-31" };
  userRules = {}; txRules = {}; activeTab = "all"; allCat = "all"; render();
`, ctx);
const rv3 = textOf(byId["review"]);
check("вопрос: ЕРИП спрашивает «за что платите»", rv3.includes("За что вы платите через ЕРИП каждый месяц?"));
check("вопрос: платёж по реквизитам спрашивает «кому или за что» и не предлагает случайные категории", rv3.includes("Кому или за что?") && rv3.includes("Перевод человеку") && rv3.includes("Оплата услуги или магазина"));
check("вопрос: у прочих групп общий понятный вопрос", rv3.includes("К какой категории это отнести?"));


// ---- Хвост: мелкие группы свёрнуты и уходят в «Прочее» одним нажатием, с отменой ----
vm.runInContext(`
  txs = [];
  const sums = [900, 700, 500, 300, 200, 9, 8, 7, 6, 5, 4, 3];
  sums.forEach((a, i) => txs.push({ date: "2026-10-" + String(i + 1).padStart(2, "0"), time: "10:00:00", amount: -a, mcc: null, details: "ЛАВКА " + ["АЛЬФА","БЕТА","ГАММА","ДЕЛЬТА","ЭПСИЛОН","ДЗЕТА","ЭТА","ТЕТА","ЙОТА","КАППА","ЛЯМБДА","МЮ"][i], balance: i }));
  header = { from: "2026-10-01", to: "2026-10-31" };
  userRules = {}; txRules = {}; activeTab = "all"; allCat = "all"; render();
`, ctx);
check("хвост: мелкие группы свёрнуты в одну строку", textOf(byId["review"]).includes("Ещё 7 групп") && !textOf(byId["review"]).includes("ЛАВКА МЮ"));
clickButton(byId["review"], "Всё в «Прочее»");
check("хвост: перед применением просит подтверждение", textOf(byId["review"]).includes("Отправить все эти группы в «Прочее»?"));
clickButton(byId["review"], "Да, в «Прочее»");
check("хвост: группы ушли в «Прочее», есть плашка отмены", vm.runInContext(`Object.values(userRules).filter(v => v === "Прочее").length === 7`, ctx) && textOf(byId["undoBar"]).includes("отправлены в «Прочее»"));
clickButton(byId["undoBar"], "Отменить");
check("хвост: отмена возвращает прежнее состояние", vm.runInContext(`Object.keys(userRules).length === 0`, ctx));

// История между выписками: сравнение с прошлым месяцем, которого нет в текущей выписке
vm.runInContext(`demoMode = false; statements = []; activeTab = "all"; userRules = {}; txRules = {};
  historyStore = { "2026-10": { first: 1, last: 31, total: 400, days: { 2: 100, 5: 50, 20: 200, 31: 50 }, cats: {} } };
  header = { from: "2026-11-01", to: "2026-11-08", bank: "mtb" };
  txs = [2, 4, 8].map((d, i) => ({ date: "2026-11-0" + d, time: "10:0" + i, amount: -[150, 50, 50][i], balance: 1, details: "ЛАВКА " + i }));
  render();`, ctx);
const headText = () => textOf(vm.runInContext(`headlineCard(renderSummaryCore())`, ctx));
const hs = headText();
check("история: «на 67% больше, чем за те же числа» и подпись об источнике", hs.includes("на 67% больше"));
check("история: текст про числа 1–8", hs.includes("С 1 по 8 число"));
check("история: выписка сохранила месяц, без описаний операций", vm.runInContext(`Object.keys(historyStore).includes("2026-11") && !JSON.stringify(historyStore).includes("ЛАВКА")`, ctx));
vm.runInContext(`historyStore = {}; render();`, ctx);
check("история: без истории строки сравнения нет", !headText().includes("по истории на этом устройстве"));
vm.runInContext(`historyStore = { "2026-10": { first: 1, last: 31, total: 400, days: { 2: 100 }, cats: {} } }; demoMode = true;`, ctx);
check("история: в демо сравнения нет", !headText().includes("по истории на этом устройстве"));
vm.runInContext(`demoMode = false;`, ctx);

// ---- Раздел «Подписки» ----
clickButton(byId["tabbar"], "Регулярные");
check("раздел «Подписки»: data-view", document.body.attrs["data-view"] === "subs");
vm.runInContext(`
  header = { from: "2026-07-01", to: "2026-10-31" };
  txs = [
    { date: "2026-07-07", time: "10:00:00", amount: -30, mcc: "4899", details: "STREAM SERVICE", balance: 1 },
    { date: "2026-08-07", time: "10:00:00", amount: -30, mcc: "4899", details: "STREAM SERVICE", balance: 2 },
    { date: "2026-09-07", time: "10:00:00", amount: -30, mcc: "4899", details: "STREAM SERVICE", balance: 3 },
    { date: "2026-10-07", time: "10:00:00", amount: -30, mcc: "4899", details: "STREAM SERVICE", balance: 4 },
    { date: "2026-07-20", time: "10:00:00", amount: -55, mcc: "5411", details: "SHOP A", balance: 5 },
    { date: "2026-09-21", time: "10:00:00", amount: -80, mcc: "5411", details: "SHOP A", balance: 6 },
  ];
  render(); renderSubs();
`, ctx);
const subsText = textOf(byId["subs"]);
check("подписки: сумма в месяц и число платежей", /30,00\s*BYN/.test(subsText) && subsText.includes("BYN в месяц") && subsText.includes("Обязательные"));
check("подписки: ближайшее списание 07.11", subsText.includes("Ближайшие списания") && subsText.includes("07.11"));
check("подписки: есть полный список и оговорка про совпадение сумм", subsText.includes("Все регулярные платежи") && subsText.includes("по одинаковым суммам"));
vm.runInContext(`txs = txs.slice(0, 2); header = { from: "2026-07-05", to: "2026-08-31" }; render(); renderSubs();`, ctx);
check("подписки: мало месяцев — пояснение, а не список", textOf(byId["subs"]).includes("минимум два полных месяца") && !textOf(byId["subs"]).includes("Ближайшие списания"));

// ---- Динамика: какому месяцу принадлежит столбец ----
const bm = (k, mode, ms) => vm.runInContext(`barMonth(${JSON.stringify(k)}, ${JSON.stringify(mode)}, ${JSON.stringify(ms)})`, ctx);
check("столбец-месяц и столбец-день ведут в свой месяц", bm("2026-09", "month", ["2026-08", "2026-09"]) === "2026-09" && bm("2026-09-14", "day", ["2026-08", "2026-09"]) === "2026-09");
check("неделя относится к месяцу своего четверга", bm("2026-08-31", "week", ["2026-08", "2026-09"]) === "2026-09" && bm("2026-08-24", "week", ["2026-08", "2026-09"]) === "2026-08");
check("месяца нет в выписке: перехода нет", bm("2026-07", "month", ["2026-08", "2026-09"]) === null);

// ---- v4.65: возврат за покупку уменьшает траты своей категории и не считается доходом ----
{
  const r = vm.runInContext(`(() => { const L = [
      { date: "2026-09-02", time: null, amount: -50, balance: null, details: "SHOP TEST", mcc: "5411" },
      { date: "2026-09-04", time: null, amount: 20, balance: null, details: "Возврат SHOP TEST", mcc: "5411" },
      { date: "2026-09-05", time: null, amount: 100, balance: null, details: "Зачисление TEST", mcc: null },
      { date: "2026-09-06", time: null, amount: 70, balance: null, details: "Возврат CAFE TEST", mcc: "5812" }];
    const st = statsFor(L), food = st.rows.find(x => x[0] === "Продукты");
    return [st.total, food ? food[1] : null, st.rows.some(x => x[0] === "Кафе и рестораны"), isRefund(L[1]), isRefund(L[2]), spendList(L).length].join(","); })()`, ctx);
  check("возврат: Продукты 50 − 20 = 30, итог 30; поступление не возврат", r === "30,30,false,true,false,3");
}

// ---- v4.65: значок ищется только среди своих значков ----
check("значок «constructor» из файла разбора и категория «toString»: обычный значок",
  vm.runInContext(`customIcons["Тест-кат"] = "constructor"; const a = iconKey("Тест-кат"), b = iconKey("toString"); delete customIcons["Тест-кат"]; a + "," + b`, ctx) === "tag,tag");

// ---- v4.64: Tab по кругу внутри открытого окна ----
{
  const r = vm.runInContext(`(() => { const a = {n:"a"}, b = {n:"b"}, c = {n:"c"}, L = [a, b, c], out = {n:"out"};
    const nm = x => x ? x.n : null;
    return [nm(nextFocus(L, c, false)), nm(nextFocus(L, a, true)), nm(nextFocus(L, b, false)), nm(nextFocus(L, out, false)), nm(nextFocus(L, out, true)), nm(nextFocus([], a, false))].join(","); })()`, ctx);
  check("окно: с последнего на первый, с первого назад на последний, снаружи внутрь, пустое окно без перехода", r === "a,c,,a,c,");
}

// ---- v4.63: повреждённое хранилище (значения не того вида) не ломает страницу ----
{
  const bad = { ba_cats_v1: '{"x":1}', ba_rules_v1: '"строка"', ba_txrules_v1: "[1,2]", ba_icons_v1: "5", ba_keepcats_v1: '"a"',
    ba_mergenote_v1: "{}", ba_budget_v1: "[]", ba_calc_v1: "true", ba_history_v1: '"x"', ba_view_v1: "{}", ba_acctnames_v1: "null" };
  const ctx2 = vm.createContext(Object.assign({}, ctx, { localStorage: { getItem: k => (k in bad ? bad[k] : null), setItem: () => {} } }));
  let err = null;
  try {
    vm.runInContext(script, ctx2);
    vm.runInContext(`header = { from: "2026-09-01", to: "2026-09-30" };
      txs = [{ date: "2026-09-03", time: null, amount: -10, balance: null, details: "SHOP TEST", mcc: "5411" }]; render();`, ctx2);
  } catch (e) { err = e; }
  check("повреждённое хранилище: страница отрисовалась без ошибки" + (err ? " (" + err.message + ")" : ""), !err);
  check("повреждённое хранилище: свои категории пустые, правила пустые",
    vm.runInContext(`Array.isArray(customCats) && customCats.length === 0 && Object.keys(userRules).length === 0 && !Array.isArray(txRules)`, ctx2));
}

// Правила с условиями
check("правило с условием: даёт категорию операции без других правил", vm.runInContext(`condRules = CondRules.cleanList([{ t: "зюзя маркет", max: 20, c: "Продукты" }]); categoryOf({ details: "ЗЮЗЯ МАРКЕТ Минск", amount: -15 }) === "Продукты" && categoryOf({ details: "ЗЮЗЯ МАРКЕТ Минск", amount: -50 }) !== "Продукты"`, ctx));
check("правило с условием: выбор для получателя главнее", vm.runInContext(`userRules[Cat.merchantKey({ details: "ЗЮЗЯ МАРКЕТ Минск", amount: -15 })] = "Развлечения"; const r = categoryOf({ details: "ЗЮЗЯ МАРКЕТ Минск", amount: -15 }) === "Развлечения"; delete userRules[Cat.merchantKey({ details: "ЗЮЗЯ МАРКЕТ Минск", amount: -15 })]; r`, ctx));
vm.runInContext(`condRules = [];`, ctx);
// Разделение операции: чек на 100 BYN, 30 из них в «Товары для дома»; остаток 70 остаётся в категории операции
vm.runInContext(`txs = [{ date: "2026-03-05", time: "10:00", amount: -100, balance: 500, details: "ЗЮЗЯ МАРКЕТ Минск" }]; txRules = {}; userRules = {}; condRules = []; splits = {}; txRules[txId(txs[0])] = "Продукты"; splits[txId(txs[0])] = [{ a: 30, c: "Товары для дома" }]; applySplits();`, ctx);
check("разделение: операция стала остатком и частью", vm.runInContext(`txs.length === 2 && txs[0].amount === -70 && txs[1].amount === -30`, ctx));
check("разделение: остаток сохраняет выбор для операции, часть берёт свою категорию", vm.runInContext(`categoryOf(txs[0]) === "Продукты" && categoryOf(txs[1]) === "Товары для дома"`, ctx));
check("разделение: итоги по категориям делятся, общая сумма та же", vm.runInContext(`(() => { const r = statsFor(txs); const m = new Map(r.rows); return Math.abs(m.get("Продукты") - 70) < 1e-9 && Math.abs(m.get("Товары для дома") - 30) < 1e-9 && Math.abs(r.total - 100) < 1e-9; })()`, ctx));
check("разделение: в файл уходит исходная операция", vm.runInContext(`(() => { const d = backupData(); return d.txs.length === 1 && d.txs[0].amount === -100 && d.splits[txId(d.txs[0])].length === 1; })()`, ctx));
check("разделение: CSV помечает часть", vm.runInContext(`Exporter.operationsCsv(txs, exportOpts()).includes("часть разделённой операции")`, ctx));
check("разделение: отмена склеивает обратно", vm.runInContext(`splits = {}; applySplits(); txs.length === 1 && txs[0].amount === -100`, ctx));
vm.runInContext(`txs = []; txRules = {};`, ctx);
// Валюты и ручной курс: счёт в USD, курс вводится вручную
vm.runInContext(`txs = [{ date: "2026-03-05", time: "10:00", amount: -10, orig: -10, cur: "USD", balance: 90, details: "ЗЮЗЯ МАРКЕТ Минск" }]; rates = {}; splits = {}; txRules = {}; demoMode = false; render();`, ctx);
const findInput = n => (n.tag === "input" ? n : n.children.map(c => (typeof c === "string" ? null : findInput(c))).find(Boolean));
const rateInput = () => findInput(byId["ratesList"]);
check("валюты: без курса карточка показана, суммы как были", vm.runInContext(`!$("ratesBox").hidden && txs[0].amount === -10`, ctx) && !!rateInput());
rateInput().value = "3,2"; rateInput().listeners.change[0]();
check("валюты: курс пересчитал суммы в BYN и сохранён", vm.runInContext(`txs[0].amount === -32 && rates.USD.r === 3.2 && backupData().rates.USD.r === 3.2 && backupData().txs[0].orig === -10`, ctx));
check("валюты: идентификатор операции не зависит от курса", vm.runInContext(`(() => { const a = txId(txs[0]); rates = Rates.clean({ USD: 3.5 }); applyRates(); return a === txId(txs[0]) && txs[0].amount === -35; })()`, ctx));
check("валюты: в операции виден оригинал и курс", vm.runInContext(`rates = Rates.clean({ USD: 3.2 }); applyRates(); txs[0].rate === 3.2 && txs[0].orig === -10`, ctx));
{
  // курс с даты: операция от 2026-03-05 считается по курсу с 2026-03-01
  vm.runInContext(`rates = Rates.clean({ USD: { r: 3, at: [{ d: "2026-03-01", r: 4 }] } }); ratesSig = ""; applyRates(); render();`, ctx);
  check("валюты: курс с даты применён к операции", vm.runInContext(`txs[0].amount === -40 && txs[0].rate === 4`, ctx));
  check("валюты: в карточке есть строка курса с даты", textOf(byId["ratesList"]).includes("с "));
  const kids = byId["ratesList"].children[0].children;
  check("валюты: у валюты подпись, основная строка, одна строка даты и кнопка добавления", kids.length === 4);
}
vm.runInContext(`rates = {}; ratesSig = ""; applyRates(); txs = []; render();`, ctx);
check("валюты: без валютных операций карточки нет", vm.runInContext(`$("ratesBox").hidden`, ctx));
// Передача на телефон: без операций в файле нет ни операций, ни выписок; правила и заметки остаются
vm.runInContext(`txs = [{ date: "2026-03-05", amount: -10, balance: 1, details: "X" }]; txNotes = { a: "заметка" }; statements = [{ bank: "mtb" }]; header = { from: "2026-03-01" };`, ctx);
check("передача: без операций файл пустой по операциям, заметки остаются", vm.runInContext(`(() => { const d = backupData(false); return d.txs.length === 0 && d.statements.length === 0 && Object.keys(d.header).length === 0 && d.notes.a === "заметка"; })()`, ctx));
check("передача: с операциями в файле операции есть", vm.runInContext(`backupData(true).txs.length === 1`, ctx));
vm.runInContext(`txs = []; txNotes = {}; statements = []; header = {};`, ctx);
// Пример на главной совпадает с последним месяцем постоянного демо, а кнопка «Посмотреть такой отчёт» открывает этот месяц
vm.runInContext(`enterDemo(true);`, ctx);
check("демо постоянное: два входа дают одни и те же операции", vm.runInContext(`JSON.stringify(Demo.make(undefined, new Date()).txs) === JSON.stringify(Demo.make(undefined, new Date()).txs)`, ctx));
check("«Посмотреть такой отчёт» открывает последний месяц демо", vm.runInContext(`activeTab === header.to.slice(0, 7)`, ctx));
{ const got = vm.runInContext(`JSON.stringify(statsFor(txs.filter(t => t.date.startsWith(activeTab))).rows.map(r => [r[0], Math.round(r[1] * 100) / 100]))`, ctx); const want = vm.runInContext(`JSON.stringify(LANDING_SAMPLE)`, ctx); if (got !== want) console.log("  LANDING_SAMPLE должен быть:", got); check("пример на главной = последний месяц демо", got === want); }
{ const rc = vm.runInContext(`(() => { const t = n => typeof n === "string" ? n : (n.children || []).map(t).join(""); const c = recapCard(); return c ? t(c) : ""; })()`, ctx); const w = JSON.parse(vm.runInContext(`JSON.stringify(LANDING_RECAP)`, ctx)); const miss = [w.save, ...w.lines.map(l => l[1])].filter(s => !rc.includes(s)); if (miss.length) console.log("  «Итог» в демо:", rc, " | нет строк:", miss); check("«Итог месяца» на главной = «Итог» последнего месяца демо", miss.length === 0); }
// Нажатие на категорию в «Обзоре» открывает её операции в «Все операции»
check("категория из «Обзора»: открываются её операции", vm.runInContext(`(() => { openCatOps("Продукты"); return allCat === "Продукты" && bottomTab === "all"; })()`, ctx));
check("категория из «Обзора»: в таблице строки нажимаются, в примере на главной нет", vm.runInContext(`(() => { const st = statsFor(txs); const t1 = catTable(st, openCatOps), t2 = catTable(st); const has = (n, c) => String(n.className || (n.attrs && n.attrs.class) || "").includes(c) || (n.children || []).some(x => typeof x !== "string" && has(x, c)); return has(t1, "catopen") && !has(t2, "catopen"); })()`, ctx));
vm.runInContext(`leaveDemo();`, ctx);
// Файл напоминания: запятые экранированы, строки не длиннее 75 байт, переносы CRLF
{
  const ics = vm.runInContext(`remindIcs(30)`, ctx);
  const lines = ics.split("\r\n");
  check("напоминание: запятая в названии экранирована", ics.includes("SUMMARY:Проверить\\, куда"));
  check("напоминание: строки не длиннее 75 байт", lines.every(l => Buffer.byteLength(l, "utf8") <= 75));
  check("напоминание: после склейки текст целый", ics.replace(/\r\n /g, "").includes("загрузите на https://slidiie.github.io/bank-analyzer/ . Ваши категории"));
  check("напоминание: только CRLF и событие на весь день", !/[^\r]\n/.test(ics) && /DTSTART;VALUE=DATE:\d{8}\r\n/.test(ics));
}
// ---- Чистовая шлифовка: числа в одном виде, имена получателей, без повторов ----
{
  const fm = vm.runInContext(`[fmt(4608.04), fmt(-1536.01), fmt(5400), fmt(0)]`, ctx);
  check("суммы: запятая и неразрывный пробел между тысячами", fm[0] === "4 608,04" && fm[1] === "−1 536,01" && fm[2] === "5 400,00" && fm[3] === "0,00");
  check("суммы в выводах «Итога»: запятая, как и везде", Recap.money(40.49) === "40,49" && Recap.money(9.5) === "9,50");
  const nm = vm.runInContext(`[tidyName("Перевод с карты на карту иванов и и"), tidyName("Перевод Петров А"), tidyName("Оплата в Евроопт"), tidyName("Перевод на карту иванов и")]`, ctx);
  check("имя получателя: «Иванов И. И.», не «иванов и и»", nm[0] === "Перевод с карты на карту Иванов И. И." && nm[1] === "Перевод Петров А." && nm[2] === "Оплата в Евроопт" && nm[3] === "Перевод на карту иванов и");
  check("в демо один выход (в полосе сверху), второй кнопки нет", !html.includes('id="demoMoreExit"'));
  check("«ещё не уточнено» только в «Бюджете», в «Обзоре» его нет", /id="roughNote" data-sec="plan"/.test(html));
}
console.log(failed === 0 ? "\nВсе проверки пройдены." : `\nПровалено проверок: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
