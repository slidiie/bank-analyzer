// sheets.js: файл-таблица (CSV, Excel .xlsx, «Excel» в виде HTML) → обычная таблица: список строк, в строке список ячеек-текстов.
// Дальше таблицу читает universal.js тем же путём, что и PDF. Сторонних библиотек нет: .xlsx это zip-архив с XML,
// распаковка встроенным в браузер DecompressionStream. Старый двоичный .xls не читается (просим пересохранить).
// Работает и в браузере (глобальный объект Sheets), и в Node 18+ (для тестов).

(function (root) {
  "use strict";

  // Байты → текст: UTF-8 (строго), UTF-16 по метке, иначе windows-1251 (так выгружают белорусские банки)
  function decode(bytes) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes).replace(/^﻿/, "");
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes).replace(/^﻿/, "");
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, ""); }
    catch (e) { return new TextDecoder("windows-1251").decode(bytes); }
  }

  // ---------- CSV ----------
  function delimiterOf(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 40);
    let best = ";", bestN = -1;
    for (const d of [";", "\t", "|", ","]) {
      const n = lines.filter(l => l.replace(/"[^"]*"/g, "").split(d).length >= 3).length;
      if (n > bestN) { best = d; bestN = n; }
    }
    return best;
  }
  function parseCsv(text, delim) {
    text = String(text).replace(/^﻿/, "");
    const d = delim || delimiterOf(text), rows = [];
    let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"' && cur.trim() === "") { q = true; cur = ""; }
      else if (c === d) { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; rows.push(row); row = []; }
      else cur += c;
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    return rows.map(r => r.map(c => c.replace(/\s+/g, " ").trim()));
  }

  // ---------- HTML-таблица (банки иногда отдают её с расширением .xls) ----------
  const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  const unesc = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e.toLowerCase()] != null ? ENT[e.toLowerCase()] : m));
  function parseHtml(text) {
    const rows = [];
    (text.match(/<tr[\s\S]*?<\/tr>/gi) || []).forEach(tr => {
      const cells = [];
      tr.replace(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi, (m, inner) => { cells.push(unesc(inner.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim()); return ""; });
      if (cells.length) rows.push(cells);
    });
    return rows;
  }

  // ---------- XLSX ----------
  async function inflate(data) {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  // Список файлов zip-архива: имя → функция, отдающая текст
  function unzip(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let e = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error("не zip");
    const count = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
    const files = new Map(), td = new TextDecoder("utf-8");
    for (let k = 0; k < count && p + 46 <= bytes.length; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = td.decode(bytes.subarray(p + 46, p + 46 + nl));
      files.set(name, async () => {
        if (usize > 60 * 1024 * 1024) throw new Error("слишком большой лист");
        const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), raw = bytes.subarray(start, start + csize);
        return td.decode(method === 0 ? raw : await inflate(raw));
      });
      p += 46 + nl + xl + cl;
    }
    return files;
  }
  const attr = (tag, name) => { const m = tag.match(new RegExp("\\b" + name + '="([^"]*)"')); return m ? unesc(m[1]) : null; };
  const texts = xml => { let out = ""; xml.replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, (m, t) => { out += unesc(t); return ""; }); return out; };
  const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
  const p2 = n => String(n).padStart(2, "0");
  // Число Excel (дни от 30.12.1899) → «дд.мм.гггг» и время, если оно есть
  function serialDate(v) {
    const ms = Math.round(v * 86400000), d = new Date(Date.UTC(1899, 11, 30) + ms);
    const date = p2(d.getUTCDate()) + "." + p2(d.getUTCMonth() + 1) + "." + d.getUTCFullYear();
    return ms % 86400000 ? date + " " + p2(d.getUTCHours()) + ":" + p2(d.getUTCMinutes()) + ":" + p2(d.getUTCSeconds()) : date;
  }
  const colIndex = ref => { let n = 0; for (const ch of ref) { if (ch < "A" || ch > "Z") break; n = n * 26 + ch.charCodeAt(0) - 64; } return n - 1; };
  async function readXlsx(bytes) {
    const files = unzip(bytes), get = async name => files.has(name) ? files.get(name)() : "";
    const shared = []; (await get("xl/sharedStrings.xml")).replace(/<si>([\s\S]*?)<\/si>|<si\/>/g, (m, inner) => { shared.push(inner ? texts(inner) : ""); return ""; });
    const styles = await get("xl/styles.xml"), custom = new Map(), dateXf = [];
    styles.replace(/<numFmt\s[^>]*>/g, m => { custom.set(+attr(m, "numFmtId"), attr(m, "formatCode") || ""); return ""; });
    const xfs = styles.match(/<cellXfs[\s\S]*?<\/cellXfs>/);
    if (xfs) xfs[0].replace(/<xf\s[^>]*>/g, m => { const id = +attr(m, "numFmtId"), code = (custom.get(id) || "").replace(/"[^"]*"|\[[^\]]*\]|\\./g, ""); dateXf.push(BUILTIN_DATE.has(id) || /[dmyhs]/i.test(code)); return ""; });
    const names = [...files.keys()].filter(n => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).slice(0, 6);
    const tables = [];
    for (const name of names) {
      const xml = await get(name), rows = [];
      xml.replace(/<row\b[^>]*>([\s\S]*?)<\/row>/g, (m, inner) => {
        const row = [];
        inner.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (mc, at, body) => {
          const j = colIndex(attr(at, "r") || ""), t = attr(at, "t"), s = attr(at, "s");
          const vm = body ? body.match(/<v>([\s\S]*?)<\/v>/) : null, v = vm ? unesc(vm[1]) : "";
          let text = "";
          if (t === "s") text = shared[+v] || "";
          else if (t === "inlineStr") text = texts(body || "");
          else if (t === "str" || t === "b" || t === "e") text = v;
          else if (v !== "") {
            const x = Number(v);
            if (!Number.isFinite(x)) text = v;
            else if (s != null && dateXf[+s] && x > 20000 && x < 80000) text = serialDate(x);
            else text = String(Math.round(x * 1e6) / 1e6);
          }
          row[j >= 0 ? j : row.length] = text.replace(/\s+/g, " ").trim();
          return "";
        });
        rows.push(Array.from(row, c => c || ""));
        return "";
      });
      if (rows.length) tables.push(rows);
    }
    return tables;
  }

  // Любой файл-таблица → список таблиц (в .xlsx листов может быть несколько). Ошибка с понятным текстом, если формат не читается.
  async function read(bytes, fileName) {
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      let tables;
      try { tables = await readXlsx(bytes); } catch (e) { throw new Error("файл Excel не открывается: он повреждён или защищён паролем. Сохраните выписку заново"); }
      return tables;
    }
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) throw new Error("это старый формат Excel (.xls). Откройте файл в Excel и сохраните как «Книга Excel (.xlsx)» или как CSV, потом загрузите его сюда");
    const text = decode(bytes);
    if (/<table[\s>]/i.test(text.slice(0, 200000))) return [parseHtml(text)];
    return [parseCsv(text)];
  }

  const api = { decode, parseCsv, parseHtml, readXlsx, read, serialDate, delimiterOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Sheets = api;
})(typeof self !== "undefined" ? self : this);
