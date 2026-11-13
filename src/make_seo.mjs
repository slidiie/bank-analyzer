// Страницы для поиска: «Анализ расходов по выписке <банк>» по каждому банку, который сайт умеет читать,
// и общая «Анализ выписки онлайн». Короткая справка «где взять выписку» осталась внизу страницы банка.
// Текст справки берётся из BANK_HELP в analyzer.html (там он правится один раз), страницы кладутся в
// <out>/banks/<банк>/index.html и <out>/analiz-vypiski/index.html, рядом sitemap.xml и robots.txt.
// Запуск: node make_seo.mjs <папка pwa> (вызывается из build.py).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] || path.join(here, "..", "pwa"));
const SITE = "https://fernwood.by";
const html = createRequire(import.meta.url)("./page.js").readPage(here);

const i0 = html.indexOf("const BANK_HELP = [");
if (i0 < 0) throw new Error("BANK_HELP не найден в analyzer.html");
const i1 = html.indexOf("\n    ];", i0);
const BANK_HELP = new Function("return " + html.slice(html.indexOf("[", i0), i1 + 6))();
const readBanks = BANK_HELP.filter(b => b.reads);
if (readBanks.length < 5) throw new Error("Слишком мало банков с поддержкой: " + readBanks.length);
const banks = BANK_HELP; // страницы делаем для всех банков списка: читаемые и нет

const SLUG = { belarusbank: "belarusbank", mtbank: "mtbank", vtb: "vtb", prior: "priorbank", bps: "sber-bank", alfa: "alfa-bank", belinvest: "belinvestbank",
  belapb: "belagroprombank", bnb: "bnb-bank", reshenie: "reshenie", paritet: "paritetbank", belveb: "belveb", bsb: "bsb-bank", tb: "technobank", bgpb: "belgazprombank", dabrabyt: "dabrabyt" };
const slug = b => SLUG[b.id] || b.id;
// «Анализ выписки МТБанка»: нужен родительный падеж
const GEN = { belarusbank: "Беларусбанка", mtbank: "МТБанка", vtb: "ВТБ", prior: "Приорбанка", bps: "Сбер Банка", alfa: "Альфа-Банка", belinvest: "Белинвестбанка",
  belapb: "Белагропромбанка", bnb: "БНБ-Банка", reshenie: "банка «Решение»", paritet: "Паритетбанка", belveb: "банка БелВЭБ", bsb: "БСБ Банка", tb: "Технобанка", bgpb: "Белгазпромбанка", dabrabyt: "банка Дабрабыт" };
const gen = b => GEN[b.id] || b.name;
const howUrl = b => `/kak-poluchit-vypisku/${slug(b)}/`;
// Порядок индексирования (лимит Google на запросы в день): сначала самые широкие запросы, потом страницы крупных банков, потом мелкие.
// Крупность банков по числу клиентов в Беларуси, ориентировочно.
const BIG = ["belarusbank", "prior", "mtbank", "alfa", "bps", "vtb", "belapb", "bgpb", "belinvest", "bnb", "reshenie", "paritet", "belveb", "bsb", "tb", "dabrabyt"];
const bigFirst = [...banks].sort((a, b) => BIG.indexOf(a.id) - BIG.indexOf(b.id));
// Блоки «как получить»: обычно приложение первым; если приложение делает выписку долго (appSlow), наверх идёт сайт банка, приложение ниже с пометкой
const howBlocksHtml = b => {
  const webB = b.web && b.web.length ? `<h3>На сайте банка (быстрее)</h3><ul>${b.web.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : "";
  const appB = `<h3>В мобильном приложении</h3>${b.appSlow ? `<p class="note"><b>Занимает время.</b> ${esc(b.appSlow)}</p>` : ""}<ul>${(b.app || []).map(t => `<li>${esc(t)}</li>`).join("")}</ul>${b.appSure === false ? `<p class="muted">Не везде подтверждено: пункты в приложении зависят от версии.</p>` : ""}`;
  return b.appSlow ? webB + appB : appB + webB;
};
const otherWays = b => { const used = new Set([...(b.app || []), ...(b.web || [])]); const how = (b.how || []).filter(t => !used.has(t)); return how.length ? `<h3>Другие способы</h3><ul>${how.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : ""; };
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CSS = `
:root{--bg:#fff;--text:#16171a;--muted:#5b5e66;--line:#e1e3e8;--card:#f5f6f8;--accent:#16171a;--on:#fff;--lime:#b7e34a}
@media (prefers-color-scheme:dark){:root{--bg:#111112;--text:#f2f2f3;--muted:#9a9ba2;--line:#323236;--card:#1a1a1c;--accent:#f2f2f3;--on:#111112}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
.wrap{max-width:720px;margin:0 auto;padding:0 16px 56px}
header.top{display:flex;align-items:center;justify-content:space-between;padding:20px 0}
.logo{display:inline-flex;align-items:center;gap:10px;font-weight:650;color:var(--text);text-decoration:none}
.logo i{width:26px;height:26px;border-radius:7px;background:#16171a;border:1px solid var(--line);display:inline-flex;align-items:center;justify-content:center}
.logo i::after{content:"";width:12px;height:12px;border-radius:50%;border:3px solid var(--lime);border-right-color:transparent}
h1{font-size:clamp(1.55rem,5.5vw,2.1rem);line-height:1.2;margin:.6rem 0 .8rem;letter-spacing:-.01em}
h2{font-size:1.2rem;margin:2rem 0 .6rem}
p,li{margin:.4rem 0}
.lead{color:var(--muted);font-size:1.05rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:1.2rem 0}
.btn{display:inline-block;background:var(--accent);color:var(--on);text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;min-height:44px}
.btn.alt{background:transparent;color:var(--text);border:1px solid var(--line)}
.row{display:flex;flex-wrap:wrap;gap:10px;margin:1rem 0}
ul,ol{padding-left:1.3rem}
.muted{color:var(--muted);font-size:.92rem}
a{color:var(--text);text-underline-offset:3px}
.chips{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0}
.chips a{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:8px 14px;text-decoration:none;min-height:40px}
h3{font-size:1.02rem;margin:1.1rem 0 .2rem}
.note{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px}
footer{margin-top:2.5rem;border-top:1px solid var(--line);padding-top:1rem}
`;

// Вопросы-ответы: один и тот же текст идёт и в страницу, и в разметку для поисковиков
const faqLd = items => items.length ? `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) })}</script>` : "";
const faqHtml = items => `<h2>Частые вопросы</h2>${items.map(([q, a]) => `<h3 style="font-size:1.02rem;margin:1.1rem 0 .2rem">${esc(q)}</h3><p>${esc(a)}</p>`).join("")}`;

const shell = ({ title, desc, url, body, faq = [] }) => `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${url}">
<meta property="og:type" content="article">
<meta property="og:locale" content="ru_RU">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${url}">
<meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
<style>${CSS}</style>
${faqLd(faq)}
</head>
<body>
<div class="wrap">
<header class="top"><a class="logo" href="/"><i aria-hidden="true"></i>Fernwood</a><a href="/banks/">Банки</a></header>
<main>
${body}
</main>
<footer class="muted">
<p>Fernwood: анализ выписки. Файл читается в вашем браузере и никуда не отправляется. Это не сайт банка и не финансовый советник.</p>
<p><a href="/">fernwood.by</a></p>
</footer>
</div>
</body>
</html>
`;

const others = cur => `<h2>Выписки других банков</h2>
<ul class="chips">${bigFirst.filter(b => b !== cur).map(b => `<li><a href="/banks/${slug(b)}/">${esc(b.name)}</a></li>`).join("")}</ul>`;

const bankFaq = b => [
  ["Нужно ли регистрироваться?", "Нет. Откройте сайт, выберите файл выписки и сразу получите разбор. Бесплатно, без аккаунта."],
  ["Куда уходит моя выписка?", "Никуда. Файл разбирается в вашем браузере, на сервер он не отправляется. Проверить можно так: отключите интернет после открытия страницы, разбор всё равно сработает."],
  [`Какую выписку ${gen(b)} загружать?`, "Файл PDF, который вы скачали в приложении или интернет-банке. Чем длиннее период (лучше несколько месяцев), тем точнее видно, что выросло против обычного."],
];

const bankPage = b => {
  const title = `Анализ расходов по выписке ${gen(b)}: категории, подписки, итог месяца`;
  const desc = b.reads
    ? `Загрузите выписку ${gen(b)} и за минуту увидите, куда уходят деньги: траты по категориям, подписки, регулярные платежи, что выросло против обычного месяца. Бесплатно, без регистрации, файл остаётся в браузере.`
    : `Анализ расходов по выписке ${gen(b)}: сайт пробует прочитать выписку сам и показывает траты по категориям, подписки и регулярные платежи. Бесплатно, без регистрации, файл остаётся в браузере.`;
  const faq = bankFaq(b);
  const lead = b.reads
    ? `Выписка ${esc(gen(b))} — это сотни строк вроде «оплата в магазине». Fernwood превращает их в картину месяца: на что ушло больше всего, что выросло против обычного, сколько уходит на подписки.`
    : `Выписка ${esc(gen(b))} — это сотни строк вроде «оплата в магазине». Fernwood превращает их в картину месяца. Выписки этого банка сайт отдельно пока не разбирает, но пробует прочитать файл сам и показывает, как понял колонки и сошлись ли суммы.`;
  const nr = b.reads ? "" : `<div class="card"><p style="margin:0"><b>Честно о поддержке.</b> Формат выписки ${esc(gen(b))} мы ещё не изучали, поэтому чтение может не получиться или быть неточным. Загрузите файл: если не выйдет, напишите нам из сайта, и мы добавим банк.</p></div>`;
  const body = `
<h1>Анализ расходов по выписке ${esc(gen(b))}</h1>
<p class="lead">${lead}</p>
<div class="row"><a class="btn" href="/">Загрузить выписку</a><a class="btn alt" href="/#demo">Посмотреть на примере</a></div>
${nr}
<h2>Что вы увидите</h2>
<ul>
<li><b>Итог месяца</b> простыми словами: какие траты выросли, что уменьшилось, сколько могло остаться.</li>
<li><b>Траты по категориям</b>: продукты, кафе, транспорт, подписки, переводы. Категории определяются правилами, не нейросетью, и их можно поправить.</li>
<li><b>Подписки и регулярные платежи</b>: сколько уходит в месяц и в год.</li>
<li><b>Мелкие покупки</b>, которые по одной незаметны, а за месяц складываются в сумму.</li>
<li><b>Лимиты по категориям</b> и выгрузка в Excel, если хочется считать дальше самому.</li>
</ul>
<h2>Как это работает</h2>
<ol>
<li>Скачайте выписку ${esc(gen(b))} (<a href="${howUrl(b)}">как получить выписку ${esc(gen(b))}</a>).</li>
<li>Откройте <a href="/">fernwood.by</a> и выберите файл.</li>
<li>Посмотрите итог. Операции, которые сайт не опознал, разбираются в пару нажатий, а выбор запоминается для следующих выписок.</li>
</ol>
<p class="muted">Файл разбирается в вашем браузере и никуда не отправляется. Сайт не даёт финансовых советов: он показывает, куда ушли деньги, а решаете вы.</p>
<h2>Где взять выписку ${esc(b.name)}</h2>
${howBlocksHtml(b)}
${otherWays(b)}
${b.wait ? `<p><b>Сколько ждать.</b> ${esc(b.wait)}</p>` : ""}
<p class="muted">Сведения собраны из открытых материалов банка и опыта пользователей (ноябрь 2026), названия пунктов меню могут отличаться.${b.link ? ` Источник: <a href="${esc(b.link[0])}" rel="noopener nofollow">${esc(b.link[1])}</a>.` : ""}</p>
${faqHtml(faq)}
<div class="card">
<h2 style="margin-top:0">Готово? Загрузите выписку</h2>
<p>Бесплатно, без регистрации, за минуту.</p>
<div class="row"><a class="btn" href="/">Загрузить выписку</a><a class="btn alt" href="/analiz-lichnogo-byudzheta/">Как анализировать бюджет</a></div>
</div>
${others(b)}`;
  return shell({ title, desc, url: `/banks/${slug(b)}/`, body, faq });
};

// «Как получить выписку <банк>»: самый частый запрос, шаги уже собраны в BANK_HELP
const howPage = b => {
  const title = `Как получить выписку ${gen(b)}: в приложении и интернет-банке`;
  const desc = `Как скачать выписку по карте ${gen(b)}: где найти в приложении и на сайте банка, нужно ли ждать, какой файл брать. Потом выписку можно разобрать по категориям бесплатно и без регистрации.`;
  const faq = [
    [`Как получить выписку по карте ${gen(b)}?`, [(b.web && b.web[0]) || "", ...(b.app || []).slice(0, 1)].filter(Boolean).join(" ") || "Откройте приложение или интернет-банк и ищите пункт «Выписка» или «История операций»."],
    [`Сколько ждать выписку ${gen(b)}?`, b.wait || "Уточните в приложении или в банке."],
    ["Что делать с выпиской дальше?", "Загрузите файл на Fernwood: сайт разложит операции по категориям, покажет подписки и итог месяца. Бесплатно, без регистрации, файл остаётся в вашем браузере."],
  ];
  const body = `
<h1>Как получить выписку ${esc(gen(b))}</h1>
<p class="lead">Пошагово: где найти выписку по карте или счёту ${esc(gen(b))}, нужно ли её ждать и какой файл брать.</p>
${howBlocksHtml(b)}
${otherWays(b)}
${b.wait ? `<h2>Нужно ли ждать</h2><p>${esc(b.wait)}</p>` : ""}
<p class="muted">Сведения собраны из открытых материалов банка и опыта пользователей (ноябрь 2026), названия пунктов меню могут отличаться.${b.link ? ` Источник: <a href="${esc(b.link[0])}" rel="noopener nofollow">${esc(b.link[1])}</a>.` : ""}</p>
<div class="card">
<h2 style="margin-top:0">Есть выписка? Посмотрите, куда ушли деньги</h2>
<p>Загрузите файл на Fernwood: траты по категориям, подписки, итог месяца. Бесплатно, без регистрации, файл остаётся в браузере.${b.reads ? "" : " Выписки этого банка сайт пробует прочитать сам; если не получится, напишите нам из сайта."}</p>
<div class="row"><a class="btn" href="/">Загрузить выписку</a><a class="btn alt" href="/banks/${slug(b)}/">Анализ выписки ${esc(gen(b))}</a></div>
</div>
${faqHtml(faq)}
<h2>Выписки других банков</h2>
<ul class="chips">${bigFirst.filter(x => x !== b).map(x => `<li><a href="${howUrl(x)}">${esc(x.name)}</a></li>`).join("")}</ul>`;
  return shell({ title, desc, url: howUrl(b), body, faq });
};

const howHub = () => {
  const title = "Как получить выписку из банка в Беларуси: Беларусбанк, МТБанк, Приорбанк и другие";
  const desc = "Как скачать выписку по карте в банках Беларуси: Беларусбанк, МТБанк, ВТБ, Приорбанк, Сбер, Альфа-Банк, Белинвестбанк и другие. Где найти в приложении и интернет-банке, нужно ли ждать.";
  const body = `
<h1>Как получить выписку из банка</h1>
<p class="lead">Выберите свой банк: покажем, где найти выписку по карте, в приложении или на сайте, и нужно ли её ждать. Потом выписку можно разобрать по категориям на Fernwood.</p>
<ul class="chips">${bigFirst.map(b => `<li><a href="${howUrl(b)}">${esc(b.name)}</a></li>`).join("")}</ul>
<div class="row"><a class="btn" href="/">Загрузить выписку</a><a class="btn alt" href="/banks/">Анализ расходов по банкам</a></div>`;
  return shell({ title, desc, url: "/kak-poluchit-vypisku/", body });
};

const generalPage = () => {
  const title = "Анализ выписки онлайн: бесплатно, без регистрации, для банков Беларуси";
  const desc = "Загрузите банковскую выписку и увидите, куда уходят деньги: траты по категориям, подписки, что выросло против обычного месяца. Беларусбанк, МТБанк, ВТБ, Приорбанк, Сбер, Альфа, Белинвестбанк. Файл остаётся в браузере.";
  const faq = [
    ["Как проанализировать расходы по выписке карты?", "Скачайте выписку в PDF в приложении банка и загрузите её на Fernwood. Сайт разложит операции по категориям и покажет итог месяца: что выросло, что уменьшилось, сколько ушло на подписки и мелкие покупки."],
    ["Это бесплатно? Нужна ли регистрация?", "Бесплатно и без регистрации. Открыли сайт, выбрали файл, получили разбор."],
    ["Безопасно ли загружать выписку?", "Файл читается прямо в вашем браузере и на сервер не отправляется. Проверить можно, отключив интернет после открытия страницы."],
    ["А если моего банка нет в списке?", "Загрузите выписку всё равно: PDF, CSV или Excel другого банка сайт пробует прочитать сам и показывает, как понял колонки и сошлись ли суммы. Если не получилось, напишите нам из сайта, добавим."],
    ["Чем это отличается от таблицы в Excel?", "Не нужно ничего размечать вручную: категории определяются сами, сразу видно, что выросло против обычного месяца, а подписки и регулярные платежи собираются отдельно. Excel-файл при желании тоже можно скачать."],
  ];
  const body = `
<h1>Анализ выписки онлайн</h1>
<p class="lead">Выписка из банка — это список операций, а не ответ на вопрос «куда уходят деньги». Fernwood читает выписку белорусского банка и за минуту показывает, на что ушёл месяц и что можно было сделать иначе.</p>
<div class="row"><a class="btn" href="/">Загрузить выписку</a><a class="btn alt" href="/#demo">Посмотреть на примере</a></div>
<h2>Что показывает анализ</h2>
<ul>
<li>Итог месяца простыми словами: что выросло, что уменьшилось, сколько могло остаться.</li>
<li>Траты по категориям: продукты, кафе, транспорт, подписки, переводы.</li>
<li>Подписки и регулярные платежи: сколько в месяц и в год.</li>
<li>Мелкие покупки, которые по одной незаметны.</li>
<li>Лимиты по категориям и выгрузка в Excel.</li>
</ul>
<h2>Для каких банков</h2>
<p>Читаем выписки напрямую. Выберите банк, чтобы увидеть, что покажет анализ и где взять выписку:</p>
<ul class="chips">${bigFirst.map(b => `<li><a href="/banks/${slug(b)}/">${esc(b.name)}</a></li>`).join("")}</ul>
<p class="muted">Другого банка в списке нет? Загрузите выписку всё равно, сайт попробует прочитать её сам.</p>
<p>Хотите сначала понять, как вообще разбирать бюджет? <a href="/analiz-lichnogo-byudzheta/">Анализ личного бюджета: с чего начать</a>.</p>
${faqHtml(faq)}
<div class="card">
<h2 style="margin-top:0">Попробуйте на своей выписке</h2>
<p>Бесплатно, без регистрации. Файл остаётся в вашем браузере.</p>
<div class="row"><a class="btn" href="/">Загрузить выписку</a></div>
</div>`;
  return shell({ title, desc, url: "/analiz-vypiski/", body, faq });
};

// Страница под запросы про бюджет («анализ личного бюджета», «анализ семейного бюджета», «куда уходят деньги»).
// Человеку, который ищет анализ бюджета, всё равно, что нужна выписка: сначала польза, потом «самый быстрый способ».
const budgetPage = () => {
  const title = "Анализ личного бюджета онлайн: куда уходят деньги";
  const desc = "Как проанализировать личный или семейный бюджет по банковским выпискам: что считать, на что смотреть, как найти лишнее. Fernwood делает это за минуту: бесплатно, без регистрации, файл остаётся в браузере.";
  const faq = [
    ["Сколько месяцев нужно для анализа бюджета?", "Лучше три-четыре. Один месяц может оказаться необычным (отпуск, крупная покупка, праздники), и по нему трудно понять, что у вас «обычно»."],
    ["Как проанализировать семейный бюджет?", "Соберите выписки по всем картам семьи за один и тот же период и посмотрите их вместе. Fernwood принимает несколько выписок и несколько банков сразу и старается не считать переводы между своими картами тратами; если не уверен, спросит."],
    ["Нужно ли вручную вводить каждую трату?", "Нет. Все операции уже есть в выписке банка. Остаётся проверить категории там, где сайт не уверен, и это занимает несколько нажатий."],
    ["Даёт ли сайт финансовые советы?", "Нет. Он показывает факты: куда ушли деньги, что выросло против обычного, сколько уходит на подписки. Что с этим делать, решаете вы."],
  ];
  const body = `
<h1>Анализ личного бюджета: куда уходят деньги</h1>
<p class="lead">Денег вроде хватает, а лишних нет, и непонятно почему. Ответ почти всегда в расходах, которых по одному не замечаешь. Ниже, как разобрать личный или семейный бюджет и не запутаться в цифрах.</p>
<div class="row"><a class="btn" href="/">Проанализировать по выписке</a><a class="btn alt" href="/#demo">Посмотреть на примере</a></div>
<h2>С чего начать</h2>
<ol>
<li><b>Возьмите несколько месяцев, а не один.</b> Один месяц легко оказывается необычным. Три-четыре показывают, что у вас происходит обычно.</li>
<li><b>Разделите траты на обязательные и гибкие.</b> Жильё, связь, транспорт, кредиты почти не меняются. Кафе, покупки, развлечения, доставка меняются, и именно там видно, что можно сделать иначе.</li>
<li><b>Найдите регулярные платежи и подписки.</b> Сумма в месяц кажется небольшой, но за год она умножается на двенадцать. Часть подписок обычно забыта.</li>
<li><b>Посмотрите на мелкие покупки.</b> Десятки небольших платежей по отдельности незаметны, а за месяц складываются в заметную сумму.</li>
<li><b>Сравнивайте с собой, а не с чужой нормой.</b> Правильная доля расходов у каждого своя. Полезнее другое: что выросло против вашего обычного месяца.</li>
</ol>
<h2>Самый быстрый способ: по выписке из банка</h2>
<p>Вручную записывать каждую трату долго, и записи быстро забрасываются. Все операции уже есть в выписке банка. Fernwood читает выписку белорусского банка и сам делает то, что описано выше:</p>
<ul>
<li>раскладывает траты по категориям;</li>
<li>пишет «Итог месяца» простыми словами: что выросло, что уменьшилось, сколько могло остаться;</li>
<li>собирает подписки и регулярные платежи, показывает, сколько они стоят за год;</li>
<li>выделяет мелкие покупки;</li>
<li>позволяет задать лимиты по категориям и выгрузить всё в Excel.</li>
</ul>
<p class="muted">Бесплатно, без регистрации. Файл разбирается в вашем браузере и никуда не отправляется. Сайт не даёт финансовых советов.</p>
<h2>Какие банки читаем</h2>
<ul class="chips">${bigFirst.map(b => `<li><a href="/banks/${slug(b)}/">${esc(b.name)}</a></li>`).join("")}</ul>
<p class="muted">Другого банка нет в списке? Загрузите выписку всё равно: сайт попробует прочитать её сам и покажет, как понял колонки.</p>
${faqHtml(faq)}
<div class="card">
<h2 style="margin-top:0">Посмотрите на свой бюджет</h2>
<p>Загрузите выписку и через минуту увидите, куда ушёл месяц.</p>
<div class="row"><a class="btn" href="/">Загрузить выписку</a><a class="btn alt" href="/analiz-vypiski/">Как это работает</a></div>
</div>`;
  return shell({ title, desc, url: "/analiz-lichnogo-byudzheta/", body, faq });
};

const indexPage = () => {
  const title = "Анализ расходов по выписке банка Беларуси: выберите свой банк";
  const desc = "Анализ расходов по выписке Беларусбанка, МТБанка, ВТБ, Приорбанка, Сбер Банка, Альфа-Банка и Белинвестбанка: категории, подписки, итог месяца. Бесплатно, без регистрации.";
  const body = `
<h1>Анализ расходов по выписке банка</h1>
<p class="lead">Выберите свой банк: расскажем, что покажет анализ и где взять выписку. Потом загрузите её на Fernwood и за минуту увидите, куда ушли деньги.</p>
<ul class="chips">${bigFirst.map(b => `<li><a href="/banks/${slug(b)}/">${esc(b.name)}</a></li>`).join("")}</ul>
<p class="muted">Вашего банка нет в списке? Загрузите выписку всё равно или напишите нам из сайта.</p>
<div class="row"><a class="btn" href="/">Открыть Fernwood</a><a class="btn alt" href="/analiz-vypiski/">Как устроен анализ</a></div>`;
  return shell({ title, desc, url: "/banks/", body });
};

const write = (rel, text) => {
  const f = path.join(out, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text, "utf8");
};
write("banks/index.html", indexPage());
write("analiz-vypiski/index.html", generalPage());
write("analiz-lichnogo-byudzheta/index.html", budgetPage());
write("kak-poluchit-vypisku/index.html", howHub());
banks.forEach(b => { write(`banks/${slug(b)}/index.html`, bankPage(b)); write(`kak-poluchit-vypisku/${slug(b)}/index.html`, howPage(b)); });
// Порядок в sitemap = порядок важности: широкие запросы, потом «как получить выписку» по крупным банкам, потом «анализ по банку»
const urls = ["/", "/analiz-lichnogo-byudzheta/", "/kak-poluchit-vypisku/", "/analiz-vypiski/", "/banks/", ...bigFirst.map(howUrl), ...bigFirst.map(b => `/banks/${slug(b)}/`)];
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${SITE}${u}</loc></url>`).join("\n")}\n</urlset>\n`);
write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log("Страницы для поиска:", banks.length, "банков (читаем: " + readBanks.length + "), адресов в sitemap:", urls.length);
