# Сборка одного файла: вшивает скрипты и pdf.js в analyzer.html -> bank-analyzer.html
# Запуск: python3 build.py  (после любых правок analyzer.html и скриптов)
import os, re, hashlib, base64
d = os.path.dirname(os.path.abspath(__file__))
rd = lambda *p: open(os.path.join(d, *p), encoding='utf8').read()
s = rd('analyzer.html')
for f in ('parser.js', 'categories.js', 'vtb.js', 'belarusbank.js', 'prior.js', 'priorcsv.js', 'alfa.js', 'sber.js', 'transfers.js', 'banks.js', 'demo.js', 'merge.js', 'export.js', 'planner.js', 'backup.js', 'history.js', 'goals.js', 'anonymize.js'):
    tag = f'<script src="{f}"></script>'
    assert tag in s, tag
    s = s.replace(tag, '<script>\n' + rd(f) + '\n</script>', 1)

# pdf.js: основной модуль кладёт объект в window.pdfjsLib, воркер остаётся модулем (его код же идёт в Worker через Blob)
lib = rd('vendor', 'pdf.min.mjs')
i = lib.rindex('export{')
names = re.findall(r'([\w$]+)(?: as ([\w$]+))?', lib[i + 7:lib.rindex('}')])
lib = lib[:i] + 'globalThis.pdfjsLib={' + ','.join(f'{b or a}:{a}' for a, b in names) + '};'
worker = rd('vendor', 'pdf.worker.min.mjs')
for part in (lib, worker):
    assert '</script' not in part.lower() and '<!--' not in part
tags = '<script type="module">\n' + lib + '\n</script>\n  <script type="module" id="pdfWorkerModule">\n' + worker + '\n</script>'
assert '<!--PDFJS-->' in s
s = s.replace('<!--PDFJS-->', tags, 1)

# CSP: страница не может ходить в сеть; выполняются только встроенные скрипты (по хэшу), воркер из blob
hashes = []
for m in re.finditer(r'<script(?![^>]*\bsrc=)(?![^>]*type="text/plain")[^>]*>(.*?)</script>', s, re.S):
    hashes.append("'sha256-" + base64.b64encode(hashlib.sha256(m.group(1).encode('utf8')).digest()).decode() + "'")
csp = ("default-src 'none'; script-src " + ' '.join(hashes) + "; style-src 'unsafe-inline'; img-src data:; "
       "worker-src blob:; connect-src 'none'; form-action 'none'; base-uri 'none'")
meta = '<meta http-equiv="Content-Security-Policy" content="' + csp + '">'
assert '<!--CSP-->' in s
s = s.replace('<!--CSP-->', meta, 1)
open(os.path.join(d, '..', 'bank-analyzer.html'), 'w', encoding='utf8').write(s)
print('Готово: bank-analyzer.html,', round(len(s.encode('utf8')) / 1024), 'КБ, скриптов под CSP:', len(hashes))
