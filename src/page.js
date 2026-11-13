// Текст страницы целиком: analyzer.html, в который на место строк /*app:css*/ и /*app:js*/ подставлены
// куски из app/css/*.css и app/*.js по порядку имён (01-…, 02-…). Так же склеивает build.py.
// Все, кому нужен текст страницы (тесты, make_seo.mjs), берут его отсюда, а не читают analyzer.html сами.
const fs = require("fs"), path = require("path");

function glue(s, dir, mark, folder, ext) {
  const m = new RegExp("^[ \\t]*" + mark.replace(/[*/]/g, "\\$&") + "[ \\t]*\\n", "m").exec(s);
  if (!m) throw new Error("в analyzer.html нет строки " + mark);
  const files = fs.readdirSync(path.join(dir, folder)).filter(f => f.endsWith(ext)).sort();
  if (!files.length) throw new Error("нет файлов " + ext + " в " + folder);
  const body = files.map(f => fs.readFileSync(path.join(dir, folder, f), "utf8").replace(/\r\n/g, "\n")).join("");
  return s.slice(0, m.index) + body + s.slice(m.index + m[0].length);
}

function readPage(dir) {
  dir = dir || __dirname;
  let s = fs.readFileSync(path.join(dir, "analyzer.html"), "utf8").replace(/\r\n/g, "\n");
  s = glue(s, dir, "/*app:css*/", path.join("app", "css"), ".css");
  s = glue(s, dir, "/*app:js*/", "app", ".js");
  return s;
}

module.exports = { readPage };
