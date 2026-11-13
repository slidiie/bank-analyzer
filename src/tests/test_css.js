// Страж вёрстки: ловит шаблоны, которые на iPhone ломали страницу (легенда в щели шириной 8 px, раздувание шире экрана).
// Реальную проверку на разных ширинах экрана делает tests/ui_audit.mjs (автопроверка в Edge).
const fs = require("fs");
const path = require("path");
const html = require("../page.js").readPage();
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];

let failed = 0;
function check(name, ok) { if (!ok) { failed++; console.log("ОШИБКА: " + name); } }

check("в <style> найден CSS", css.length > 1000);
check("viewport: width=device-width", /name="viewport"[^>]*width=device-width/.test(html));
check("viewport: minimum-scale=1 (iOS не уменьшает страницу сам)", /name="viewport"[^>]*minimum-scale=1/.test(html));

// «flex: 1» без базы (то есть база 0) в контейнерах с flex-wrap оставляет блок в той же строке в щели из нескольких пикселей
const bareFlex = css.match(/flex:\s*\d+\s*;/g) || [];
check("в CSS нет «flex: N» без базы (нужно «flex: N 1 Nrem»): " + bareFlex.join(" "), bareFlex.length === 0);
const bareInline = html.match(/style[:=]\s*["'][^"']*flex:\s*\d+\s*[;"']/g) || [];
check("в inline-стилях нет «flex: N» без базы: " + bareInline.join(" "), bareInline.length === 0);

check("легенда диаграммы имеет базу ширины", /\.pie \.legend\s*\{[^}]*flex:\s*\d+\s+\d+\s+[\d.]+rem/.test(css));
check("на узких экранах легенда занимает всю строку", /@media \(max-width: 520px\)[\s\S]*\.pie \.legend\s*\{[^}]*flex:\s*1 1 100%/.test(css));
check("длинные слова переносятся (overflow-wrap) и страница не прокручивается вбок", /overflow-wrap:\s*anywhere/.test(css) && /html\s*\{[^}]*overflow-x:\s*clip/.test(css));
check("карточки: minmax не шире экрана", !/minmax\(\s*\d+(\.\d+)?rem\s*,\s*1fr\)/.test(css));

// Печать / PDF: правила @media print и кнопка
check("есть @media print", /@media print\s*\{/.test(css));
check("печать: светлая тема принудительно", /@media print\s*\{[\s\S]*color-scheme:\s*light/.test(css));
check("печать: скрыты вкладки, кнопки и загрузка", /@media print[\s\S]*#tabbar[\s\S]*display:\s*none\s*!important/.test(css));
check("кнопка «Печать / PDF» есть и вызывает window.print", /id="printBtn"/.test(html) && /window\.print\(\)/.test(html));

if (failed) { console.log("Не пройдено проверок: " + failed); process.exit(1); }
console.log("Все проверки пройдены.");
