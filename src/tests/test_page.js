// Страница разрезана на куски (app/css/*.css, app/*.js), сборка и тесты склеивают их по порядку имён.
// Страж: куски названы по порядку и без повторов номеров, в склеенной странице не осталось меток,
// а в самом analyzer.html не появился код мимо кусков.
const fs = require("fs"), path = require("path");
const src = path.join(__dirname, "..");
let failed = 0;
function check(name, ok) { if (!ok) { failed++; console.log("ОШИБКА: " + name); } }

for (const [folder, ext] of [[path.join("app", "css"), ".css"], ["app", ".js"]]) {
  const files = fs.readdirSync(path.join(src, folder)).filter(f => f.endsWith(ext)).sort();
  check(folder + ": есть куски", files.length > 0);
  check(folder + ": имена вида 01-имя" + ext, files.every(f => /^\d\d-[a-z0-9-]+\.\w+$/.test(f)));
  const nums = files.map(f => f.slice(0, 2));
  check(folder + ": номера не повторяются", new Set(nums).size === nums.length);
  for (const f of files) check(folder + "/" + f + ": кончается переводом строки", fs.readFileSync(path.join(src, folder, f), "utf8").endsWith("\n"));
}
const raw = fs.readFileSync(path.join(src, "analyzer.html"), "utf8");
check("в analyzer.html одна метка /*app:css*/", raw.split("/*app:css*/").length === 2);
check("в analyzer.html одна метка /*app:js*/", raw.split("/*app:js*/").length === 2);
check("в analyzer.html нет кода мимо кусков", /<style>\s*\/\*app:css\*\/\s*<\/style>/.test(raw) && /<script>\s*\/\*app:js\*\/\s*<\/script>/.test(raw));
const page = require("../page.js").readPage();
check("в склеенной странице меток не осталось", !page.includes("/*app:css*/") && !page.includes("/*app:js*/"));
check("склеенная страница заметно больше заготовки", page.length > raw.length * 5);
if (failed) { console.log("FAIL: " + failed); process.exit(1); }
console.log("ok: страница склеивается из кусков");
