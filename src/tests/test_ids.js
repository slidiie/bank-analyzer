// Каждый $("id") в скрипте страницы должен иметь элемент с таким id: иначе скрипт падает и всё ниже перестаёт работать.
const fs = require("fs"), path = require("path");
const s = require("../page.js").readPage();
const ids = new Set([...s.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const used = [...new Set([...s.matchAll(/\$\("([A-Za-z0-9_-]+)"\)/g)].map(m => m[1]))];
const missing = used.filter(u => !ids.has(u));
// Списки id, по которым потом идёт $(): ["a", "b"].forEach(x => $(x)...)
for (const m of s.matchAll(/\[((?:"[A-Za-z0-9_-]+",?\s*)+)\]\.forEach\((\w+) => \$\(\2\)/g)) for (const id of m[1].match(/"([^"]+)"/g).map(x => x.slice(1, -1))) if (!ids.has(id)) missing.push(id);
if (missing.length) { console.log("FAIL: нет элементов для $(...):", missing.join(", ")); process.exit(1); }
console.log("ok: все " + used.length + " обращений $(\"id\") найдены");
