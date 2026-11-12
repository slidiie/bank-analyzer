// Тест чтения файлов-таблиц (CSV, Excel .xlsx, HTML под видом .xls) на ВЫДУМАННЫХ данных.
// Запуск из папки src:  node tests/test_sheets.js

const zlib = require("zlib");
const S = require("../sheets.js");
const U = require("../universal.js");

let failed = 0;
const check = (name, ok) => { if (!ok) failed++; console.log((ok ? "OK    " : "FAIL  ") + name); };

// Мини-сборщик zip для теста: первый файл сжат (deflate), остальные лежат как есть
function zip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  files.forEach(([name, text], k) => {
    const nm = enc.encode(name), raw = enc.encode(text), packed = k === 0 ? new Uint8Array(zlib.deflateRawSync(Buffer.from(raw))) : raw, method = k === 0 ? 8 : 0;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(8, method, true); lh.setUint32(18, packed.length, true); lh.setUint32(22, raw.length, true); lh.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(lh.buffer), nm, packed);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(10, method, true); ch.setUint32(20, packed.length, true); ch.setUint32(24, raw.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), nm);
    off += 30 + nm.length + packed.length;
  });
  const csize = central.reduce((a, p) => a + p.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
  let p = 0; all.forEach(x => { out.set(x, p); p += x.length; });
  return out;
}

(async () => {
  // ---------- CSV ----------
  const csv = 'Дата;Описание;Сумма\r\n01.02.2026;"Магазин ""У дома""; Минск";-12,50\r\n02.02.2026;Зарплата;1 000,00\r\n';
  const rows = S.parseCsv(csv);
  check("CSV: точка с запятой, кавычки и «;» внутри поля", rows.length === 3 && rows[1][1] === 'Магазин "У дома"; Минск' && rows[1][2] === "-12,50");
  check("CSV: запятая как разделитель определяется сама", S.parseCsv("date,text,amount\n2026-02-01,Shop,-12.50\n2026-02-02,Pay,100.00\n")[1][2] === "-12.50");
  check("CSV: табуляция", S.parseCsv("Дата\tОписание\tСумма\n01.02.2026\tКафе\t-5,00\n")[1][1] === "Кафе");
  const cp1251 = new Uint8Array([0xc4, 0xe0, 0xf2, 0xe0, 0x3b, 0xd1, 0xf3, 0xec, 0xec, 0xe0]);   // «Дата;Сумма» в windows-1251
  check("кодировка windows-1251 читается", S.decode(cp1251) === "Дата;Сумма");
  check("UTF-8 с меткой читается", S.decode(new Uint8Array([0xef, 0xbb, 0xbf, 0xd0, 0x94])) === "Д");
  const viaRead = await S.read(new TextEncoder().encode(csv), "выписка.csv");
  check("read: CSV отдаётся одной таблицей", viaRead.length === 1 && viaRead[0][2][1] === "Зарплата");

  // ---------- XLSX ----------
  const sheet = '<?xml version="1.0"?><worksheet><sheetData>' +
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
    '<row r="2"><c r="A2" s="1"><v>46054</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>-12.5</v></c></row>' +
    '<row r="3"><c r="A3" s="1"><v>46055.5</v></c><c r="B3" t="inlineStr"><is><t>Зарплата &amp; премия</t></is></c><c r="C3"><v>1000.1000000000001</v></c></row>' +
    '<row r="4"><c r="A4" s="1"><v>46056</v></c><c r="C4"><v>-40</v></c></row>' +
    '</sheetData></worksheet>';
  const shared = '<sst><si><t>Дата</t></si><si><t>Описание</t></si><si><t>Сумма</t></si><si><r><t>Магазин </t></r><r><t>ТЕСТ</t></r></si></sst>';
  const styles = '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd\\.mm\\.yyyy"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>';
  const xlsx = zip([["xl/worksheets/sheet1.xml", sheet], ["xl/sharedStrings.xml", shared], ["xl/styles.xml", styles]]);
  const tables = await S.read(xlsx, "выписка.xlsx");
  const t = tables[0];
  check("XLSX: лист прочитан (в том числе сжатый)", tables.length === 1 && t.length === 4);
  check("XLSX: общие строки, в том числе из кусков", t[0].join("|") === "Дата|Описание|Сумма" && t[1][1] === "Магазин ТЕСТ");
  check("XLSX: дата из числа Excel", t[1][0] === "01.02.2026" && t[2][0] === "02.02.2026 12:00:00");
  check("XLSX: числа без хвостов, пустая ячейка на месте", t[1][2] === "-12.5" && t[2][2] === "1000.1" && t[3][1] === "" && t[3][2] === "-40");
  check("XLSX: строка внутри ячейки и &amp;", t[2][1] === "Зарплата & премия");
  const r = U.guess(U.gridFromTable(t));
  check("XLSX → те же операции, что из PDF и CSV", r && r.txs.length === 3 && r.txs[0].date === "2026-02-01" && r.txs[0].amount === -12.5 && r.txs[1].amount === 1000.1 && r.txs[1].time === "12:00:00");

  // ---------- HTML под видом .xls и старый .xls ----------
  const html = "<html><body><table><tr><th>Дата</th><th>Описание</th><th>Сумма</th></tr><tr><td>01.02.2026</td><td>Кафе&nbsp;<b>ТЕСТ</b></td><td>-7,20</td></tr></table></body></html>";
  const ht = await S.read(new TextEncoder().encode(html), "выписка.xls");
  check("HTML-таблица (бывает под видом .xls)", ht[0].length === 2 && ht[0][1][1] === "Кафе ТЕСТ" && ht[0][1][2] === "-7,20");
  let msg = "";
  try { await S.read(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), "старый.xls"); } catch (e) { msg = e.message; }
  check("старый .xls: понятная просьба пересохранить", /xlsx/.test(msg) && /сохраните/i.test(msg));
  msg = "";
  try { await S.read(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), "битый.xlsx"); } catch (e) { msg = e.message; }
  check("битый .xlsx: понятная ошибка", /не открывается/.test(msg));

  console.log(failed ? `\nОШИБКА: не прошло проверок: ${failed}` : "\nВсе проверки пройдены");
  process.exit(failed ? 1 : 0);
})();
