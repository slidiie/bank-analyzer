// Страницы для поиска: «Как скачать выписку <банк>» по каждому банку, который сайт умеет читать.
// Текст берётся из BANK_HELP в analyzer.html (там он правится один раз), страницы кладутся в <out>/banks/<банк>/index.html,
// рядом sitemap.xml и robots.txt. Запуск: node make_seo.mjs <папка pwa> (вызывается из build.py).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] || path.join(here, "..", "pwa"));
const SITE = "https://fernwood.by";
const html = fs.readFileSync(path.join(here, "analyzer.html"), "utf8");

const i0 = html.indexOf("const BANK_HELP = [");
if (i0 < 0) throw new Error("BANK_HELP не найден в analyzer.html");
const i1 = html.indexOf("\n    ];", i0);
const BANK_HELP = new Function("return " + html.slice(html.indexOf("[", i0), i1 + 6))();
const banks = BANK_HELP.filter(b => b.reads);
if (banks.length < 5) throw new Error("Слишком мало банков с поддержкой: " + banks.length);

const SLUG = { belarusbank: "belarusbank", mtbank: "mtbank", vtb: "vtb", prior: "priorbank", bps: "sber-bank", alfa: "alfa-bank", belinvest: "belinvestbank" };
const slug = b => SLUG[b.id] || b.id;
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
footer{margin-top:2.5rem;border-top:1px solid var(--line);padding-top:1rem}
`;

const shell = ({ title, desc, url, body }) => `<!doctype html>
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
</head>
<body>
<div class="wrap">
<header class="top"><a class="logo" href="/"><i aria-hidden="true"></i>Fernwood</a><a href="/banks/">Все банки</a></header>
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
<ul class="chips">${banks.filter(b => b !== cur).map(b => `<li><a href="/banks/${slug(b)}/">${esc(b.name)}</a></li>`).join("")}</ul>`;

const bankPage = b => {
  const appSet = new Set(b.app || []);
  const how = (b.how || []).filter(t => !appSet.has(t));
  const title = `Выписка ${b.name}: как скачать и посмотреть, куда уходят деньги`;
  const desc = `Как получить выписку ${b.name} в приложении и интернет-банке, сколько ждать и что с ней делать дальше. Fernwood разберёт траты по категориям за минуту, файл остаётся в вашем браузере.`;
  const body = `
<h1>Как скачать выписку ${esc(b.name)}</h1>
<p class="lead">Выписка нужна, чтобы увидеть траты не списком операций, а по категориям: сколько ушло на продукты, кафе, подписки, что выросло против обычного месяца. Ниже, где её взять в ${esc(b.name)}.</p>
${b.app && b.app.length ? `<h2>В мобильном приложении</h2>${b.appSure === false ? `<p class="muted">Не везде подтверждено: пункты в приложении зависят от версии.</p>` : ""}<ul>${b.app.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
${how.length ? `<h2>Другие способы</h2><ul>${how.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
${b.wait ? `<h2>Сколько ждать</h2><p>${esc(b.wait)}</p>` : ""}
<p class="muted">Сведения собраны из открытых материалов банка (ноябрь 2026), названия пунктов меню могут отличаться.${b.link ? ` Источник: <a href="${esc(b.link[0])}" rel="noopener nofollow">${esc(b.link[1])}</a>.` : ""}</p>
<div class="card">
<h2 style="margin-top:0">Что делать с выпиской</h2>
<p>Загрузите файл на Fernwood: сайт читает выписки ${esc(b.name)}, раскладывает траты по категориям и пишет «Итог месяца» простыми словами: что выросло, сколько уходит на подписки, сколько ушло на мелкие покупки.</p>
<p class="muted">Без регистрации. Файл разбирается в вашем браузере и никуда не отправляется: можно проверить, отключив интернет.</p>
<div class="row"><a class="btn" href="/">Загрузить выписку</a><a class="btn alt" href="/#demo">Посмотреть на примере</a></div>
</div>
${others(b)}`;
  return shell({ title, desc, url: `/banks/${slug(b)}/`, body });
};

const indexPage = () => {
  const title = "Выписка банка Беларуси: как скачать и разобрать траты";
  const desc = "Инструкции, как получить выписку в Беларусбанке, МТБанке, ВТБ, Приорбанке, Сбер Банке, Альфа-Банке и Белинвестбанке, и как за минуту увидеть, куда уходят деньги.";
  const body = `
<h1>Выписка банка: как скачать и разобрать траты</h1>
<p class="lead">Выберите свой банк: подскажем, где взять выписку в приложении или интернет-банке. Потом загрузите её на Fernwood и за минуту увидите, куда ушли деньги.</p>
<ul class="chips">${banks.map(b => `<li><a href="/banks/${slug(b)}/">${esc(b.name)}</a></li>`).join("")}</ul>
<p class="muted">Вашего банка нет в списке? Напишите нам из сайта, добавим.</p>
<div class="row"><a class="btn" href="/">Открыть Fernwood</a></div>`;
  return shell({ title, desc, url: "/banks/", body });
};

const write = (rel, text) => {
  const f = path.join(out, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text, "utf8");
};
write("banks/index.html", indexPage());
banks.forEach(b => write(`banks/${slug(b)}/index.html`, bankPage(b)));
const urls = ["/", "/banks/", ...banks.map(b => `/banks/${slug(b)}/`)];
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${SITE}${u}</loc></url>`).join("\n")}\n</urlset>\n`);
write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
console.log("Страницы для поиска:", banks.length, "банков, адресов в sitemap:", urls.length);
