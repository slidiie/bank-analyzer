// Каждый $("id") в скрипте страницы должен иметь элемент с таким id: иначе скрипт падает и всё ниже перестаёт работать.
const fs = require("fs"), path = require("path");
const s = fs.readFileSync(path.join(__dirname, "..", "analyzer.html"), "utf8");
const ids = new Set([...s.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const used = [...new Set([...s.matchAll(/\$\("([A-Za-z0-9_-]+)"\)/g)].map(m => m[1]))];
const missing = used.filter(u => !ids.has(u));
if (missing.length) { console.log("FAIL: нет элементов для $(...):", missing.join(", ")); process.exit(1); }
console.log("ok: все " + used.length + " обращений $(\"id\") найдены");
