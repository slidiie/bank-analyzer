# Сборка одного файла: вшивает скрипты и pdf.js в analyzer.html -> bank-analyzer.html
# Запуск: python3 build.py  (после любых правок analyzer.html и скриптов)
import os, re, hashlib, base64, shutil
d = os.path.dirname(os.path.abspath(__file__))
rd = lambda *p: open(os.path.join(d, *p), encoding='utf8').read()
s = rd('analyzer.html')
for f in ('parser.js', 'categories.js', 'vtb.js', 'belarusbank.js', 'belinvest.js', 'prior.js', 'priorcsv.js', 'alfa.js', 'sber.js', 'transfers.js', 'merchants.js', 'universal.js', 'sheets.js', 'banks.js', 'demo.js', 'merge.js', 'export.js', 'planner.js', 'recap.js', 'backup.js', 'device.js', 'history.js', 'goals.js', 'filters.js', 'condrules.js', 'splits.js', 'rates.js', 'feedback.js', 'hints.js', 'pwa.js', 'anonymize.js', 'pro.js'):
    tag = f'<script src="{f}"></script>'
    assert tag in s, tag
    s = s.replace(tag, '<script>\n' + rd(f) + '\n</script>', 1)

# pdf.js: основной модуль кладёт объект в window.pdfjsLib, воркер остаётся модулем (его код же идёт в Worker через Blob)
lib = rd('vendor', 'pdf.min.mjs')
i = lib.rindex('export{')
names = re.findall(r'([\w$]+)(?: as ([\w$]+))?', lib[i + 7:lib.rindex('}')])
lib = lib[:i] + 'globalThis.pdfjsLib={' + ','.join(f'{b or a}:{a}' for a, b in names) + '};'
# pdf.js (1,8 МБ, 70 % веса) больше не вшивается в страницу: два отдельных файла pdfjs/lib.js и pdfjs/worker.js
# грузятся только когда человек выбирает выписку (страница открывается в ~2,5 раза быстрее). Офлайн их держит sw.js.
# В воркер сразу вписаны дополнения для Safari (installPolyfills из analyzer.html).
m = re.search(r'\n    (function installPolyfills\(\) \{.*?\n    \})\n', s, re.S)
assert m, 'installPolyfills'
worker = '(' + m.group(1) + ')();\n' + rd('vendor', 'pdf.worker.min.mjs')
pdfv = hashlib.sha256((lib + worker).encode('utf8')).hexdigest()[:10]
assert '__PDFV__' in s
s = s.replace('__PDFV__', pdfv)
def _write_pdfjs(folder):
    os.makedirs(os.path.join(folder, 'pdfjs'), exist_ok=True)
    for name, body in (('lib.js', lib), ('worker.js', worker)):
        open(os.path.join(folder, 'pdfjs', name), 'w', encoding='utf8', newline='').write(body)

# Шрифт Inter (лицензия OFL, переменный, кириллица и латиница) вшивается в страницу как data: (CSP не пускает внешние файлы)
def _font(name, rng):
    b64 = base64.b64encode(open(os.path.join(d, 'vendor', 'fonts', name), 'rb').read()).decode()
    return ("@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url(data:font/woff2;base64," + b64 + ") format('woff2');unicode-range:" + rng + "}")
fonts = _font('inter-cyrillic.woff2', 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116') + chr(10) + '    ' + _font('inter-latin.woff2', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD')
assert '/*FONTS*/' in s
s = s.replace('/*FONTS*/', fonts, 1)

# PWA: манифест и иконки подключаются только в сборке (в src/analyzer.html их нет: файлов рядом нет)
pwa = chr(10).join('  ' + t if i else t for i, t in enumerate(['<link rel="manifest" href="manifest.webmanifest">', '<link rel="icon" type="image/png" href="icons/icon-192.png">', '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
       '<meta name="mobile-web-app-capable" content="yes">', '<meta name="apple-mobile-web-app-capable" content="yes">',
       '<meta name="apple-mobile-web-app-title" content="Fernwood">']))
assert '<!--PWA-->' in s
s = s.replace('<!--PWA-->', pwa, 1)

# CSP: страница не может ходить в сеть (кроме картинки-счётчика GoatCounter); выполняются только встроенные скрипты (по хэшу), воркер из blob
hashes = []
for m in re.finditer(r'<script(?![^>]*\bsrc=)(?![^>]*type="text/plain")[^>]*>(.*?)</script>', s, re.S):
    hashes.append("'sha256-" + base64.b64encode(hashlib.sha256(m.group(1).encode('utf8')).digest()).decode() + "'")
csp = ("default-src 'none'; script-src 'self' " + ' '.join(hashes) + "; style-src 'unsafe-inline'; font-src data:; img-src 'self' data: https://bankanalyzer.goatcounter.com; "
       "manifest-src 'self'; worker-src blob: 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'")
meta = '<meta http-equiv="Content-Security-Policy" content="' + csp + '">'
assert '<!--CSP-->' in s
s = s.replace('<!--CSP-->', meta, 1)
open(os.path.join(d, '..', 'bank-analyzer.html'), 'w', encoding='utf8').write(s)

# Файлы PWA рядом со страницей: ../pwa/ (sw.js получает версию = хэш страницы; manifest и иконки копируются)
out = os.path.join(d, '..', 'pwa')
shutil.rmtree(out, ignore_errors=True)
shutil.copytree(os.path.join(d, 'pwa'), out)
_write_pdfjs(out)                     # для сайта (docs/pdfjs/)
_write_pdfjs(os.path.join(d, '..'))   # для просмотра bank-analyzer.html из папки проекта (конфигурация real)
ver = hashlib.sha256(s.encode('utf8')).hexdigest()[:12]
sw = rd('sw.js')
assert '__VERSION__' in sw
open(os.path.join(out, 'sw.js'), 'w', encoding='utf8', newline='').write(sw.replace('__VERSION__', ver))
# Страницы для поиска (по банкам, которые читаем), sitemap.xml и robots.txt: рядом со страницей, в ../pwa/
import subprocess
subprocess.run(['node', os.path.join(d, 'make_seo.mjs'), out], check=True)
print('Готово: bank-analyzer.html,', round(len(s.encode('utf8')) / 1024), 'КБ, скриптов под CSP:', len(hashes))
