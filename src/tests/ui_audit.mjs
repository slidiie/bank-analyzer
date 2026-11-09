// Автопроверка вёрстки без установки пакетов: Edge в безоконном режиме через CDP (встроенный WebSocket Node 22+).
// Запуск (сервер site должен работать): node tests/ui_audit.mjs [адрес] [--quick]
//   адрес по умолчанию http://localhost:8765/ ; --quick: только 390 и 1280.
// Проверяет главную, все вкладки демо и все окна на 320/390/768/1280 в светлой и тёмной теме:
//   зоны нажатия (меньше 768 px: не меньше 44 px, иначе не меньше 32 px; ссылки внутри текста не считаются),
//   контраст текста 4,5:1 (крупный 3:1; переходы цвета доводятся до конца перед замером),
//   страница не шире экрана, Tab и Shift+Tab по кругу внутри каждого окна (настоящие нажатия клавиш).
// Печатает только нарушения и итог; код возврата 1, если нарушения есть.
import { spawn } from 'node:child_process';
import { rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const url = args.find((a, i) => /^https?:/.test(a) && args[i - 1] !== '--shots') || 'http://localhost:8765/';
const WIDTHS = process.env.AUDIT_WIDTHS ? process.env.AUDIT_WIDTHS.split(',').map(Number) : args.includes('--quick') ? [390, 1280] : [320, 390, 768, 1280];
const THEMES = ['light', 'dark'];
const shotsDir = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;   // снимки экранов сценариев (мастер, ошибки, печать…)
if (shotsDir) mkdirSync(shotsDir, { recursive: true });
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!EDGE) { console.log('ОШИБКА: не найден Microsoft Edge'); process.exit(2); }
try { await fetch(url); } catch (e) { console.log('ОШИБКА: сервер не отвечает по адресу ' + url + ' (запусти сервер site)'); process.exit(2); }

const port = 9300 + Math.floor(Math.random() * 300);
const prof = join(tmpdir(), 'ba-audit-' + Date.now());
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const wait = ms => new Promise(r => setTimeout(r, ms));
let ws;
for (let i = 0; i < 60 && !ws; i++) { await wait(250); try { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const pg = l.find(x => x.type === 'page'); if (pg) ws = pg.webSocketDebuggerUrl; } catch (e) { /* ещё запускается */ } }
if (!ws) { console.log('ОШИБКА: Edge не запустился'); edge.kill(); process.exit(2); }
const sock = new WebSocket(ws); await new Promise(r => sock.onopen = r);
let id = 0; const pend = new Map();
sock.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'ошибка в странице');
  return r.result?.result?.value;
};
await send('Page.enable');
await send('Runtime.enable');
await send('DOM.enable');
// Выдуманные файлы для сценариев ошибок и мастера образца (никаких настоящих данных)
mkdirSync(prof, { recursive: true });
const FAKE_CSV = join(prof, 'neizvestny-bank.csv'), BROKEN_PDF = join(prof, 'bity.pdf');
writeFileSync(FAKE_CSV, 'Дата;Описание;Сумма;Валюта\n' + Array.from({ length: 12 }, (_, i) => `0${1 + (i % 9)}.10.2026;Магазин Тест ${i + 1};-${(i + 1) * 3},50;BYN`).join('\n') + '\n');
writeFileSync(BROKEN_PDF, '%PDF-1.4\nэто не настоящий PDF\n%%EOF');

// Код, который выполняется в странице: собирает нарушения в текущем состоянии
const PAGE_CHECK = `(() => {
  const print = matchMedia('print').matches;
  const W = innerWidth, mobile = W < 768, minT = mobile ? 44 : 32, out = [];
  document.getAnimations().forEach(a => { try { a.finish(); } catch (e) { /* бесконечная анимация */ } });
  const dlg = [...document.querySelectorAll('.modal:not([hidden]) [role=dialog]')].pop() || null;
  const root = dlg || document.body;
  const vis = el => el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : !!el.offsetParent;
  const name = el => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; else if (el.classList.length) s += '.' + [...el.classList].slice(0, 2).join('.');
    const t = (el.getAttribute('aria-label') || el.textContent || el.value || '').replace(/\\s+/g, ' ').trim().slice(0, 32); return t ? s + ' «' + t + '»' : s; };
  // 1) зоны нажатия
  const sel = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=switch], [role=tab]';
  for (const el of print ? [] : root.querySelectorAll(sel)) {
    if (!vis(el) || el.disabled) continue;
    let box = el;
    if (el.matches('input[type=checkbox], input[type=radio], input[type=file]')) { const l = el.closest('label') || (el.id && document.querySelector('label[for="' + el.id + '"]')); if (!l) { if (el.type === 'file') continue; } else box = l; }
    const cs = getComputedStyle(el);
    if (el.tagName === 'A' && cs.display === 'inline' && el.parentElement && /\\S/.test([...el.parentElement.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(''))) continue; // ссылка внутри текста
    const r = box.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (Math.round(r.height) < minT || Math.round(r.width) < Math.min(minT, 24)) out.push(['зона', name(el) + ' ' + Math.round(r.width) + '×' + Math.round(r.height) + ' (нужно ' + minT + ')']);
  }
  // 2) контраст
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = c => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const mix = (top, bot) => [0, 1, 2].map(i => top[i] * top[3] + bot[i] * (1 - top[3]));
  const bgOf = el => { const layers = []; for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null; const c = rgba(s.backgroundColor); if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } }
    let b = [255, 255, 255]; for (const l of layers.reverse()) b = mix(l, b); return b; };
  const seen = new Set();
  for (const el of root.querySelectorAll('*')) {
    if (el.closest('svg') || ['SCRIPT', 'STYLE', 'OPTION', 'TEXTAREA', 'INPUT', 'SELECT'].includes(el.tagName)) continue;
    if (![...el.childNodes].some(n => n.nodeType === 3 && /\\S/.test(n.textContent))) continue;
    if (!vis(el) || el.closest('[disabled], [aria-hidden=true]')) continue;
    const s = getComputedStyle(el), bg = bgOf(el); if (!bg) continue;
    const fg = rgba(s.color); const f = mix(fg, bg);
    const L1 = lum(f), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(s.fontSize), bold = parseInt(s.fontWeight) >= 700, big = px >= 24 || (bold && px >= 18.66);
    const need = big ? 3 : 4.5;
    if (ratio < need - 0.01) { const k = name(el); if (!seen.has(k)) { seen.add(k); out.push(['контраст', k + ' ' + ratio.toFixed(2) + ':1 (нужно ' + need + ')']); } }
  }
  // 3) ширина
  const sw = document.documentElement.scrollWidth;
  if (sw > W + 1) { const wide = [...document.body.querySelectorAll('*')].filter(e => vis(e) && e.getBoundingClientRect().right > W + 1 && !e.closest('[style*=overflow], .tablewrap')).slice(0, 3).map(name);
    out.push(['ширина', 'страница ' + sw + ' px при экране ' + W + (wide.length ? ': ' + wide.join(', ') : '')]); }
  return out;
})()`;

const vio = new Map(); // ключ → набор «ширина/тема»
let states = 0;
const note = (where, kind, text, tag) => { const k = kind + ' | ' + where + ' | ' + text.replace(/\d+×\d+/, 'N'); if (!vio.has(k)) vio.set(k, { kind, where, text, tags: new Set() }); vio.get(k).tags.add(tag); };

async function check(where, tag) {
  states++;
  await wait(350);
  for (const [kind, text] of await ev(PAGE_CHECK)) note(where, kind, text, tag);
}
async function key(shift) {
  const p = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, modifiers: shift ? 8 : 0 };
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...p }); await send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
}
// Tab и Shift+Tab по кругу: фокус не уходит из окна и после последнего элемента возвращается к первому
async function tabCycle(where, tag) {
  const n = await ev(`(() => { const d = [...document.querySelectorAll('.modal:not([hidden]) [role=dialog]')].pop(); if (!d) return -1;
    window.__ftab = [...d.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')].filter(e => e.checkVisibility()); return window.__ftab.length; })()`);
  if (n < 0) { note(where, 'Tab', 'окно не открылось', tag); return; }
  if (n === 0) return;
  for (const shift of [false, true]) {
    const seq = [];
    for (let i = 0; i < n * 2 + 2; i++) {
      await key(shift); await wait(40);
      seq.push(await ev(`(() => { const d = [...document.querySelectorAll('.modal:not([hidden]) [role=dialog]')].pop(); const a = document.activeElement; return !d ? -3 : !d.contains(a) ? -2 : window.__ftab.indexOf(a); })()`));
    }
    const dir = shift ? 'Shift+Tab' : 'Tab';
    if (process.env.AUDIT_DEBUG) console.log(where, dir, n, seq.join(','));
    if (seq.includes(-3)) { note(where, 'Tab', dir + ': окно закрылось от клавиши', tag); continue; }
    if (seq.includes(-2)) { note(where, 'Tab', dir + ': фокус уходит из окна', tag); continue; }
    const got = new Set(seq.filter(x => x >= 0));
    if (got.size < n) note(where, 'Tab', dir + ': обойдено ' + got.size + ' из ' + n, tag);
    const [from, to] = shift ? [0, n - 1] : [n - 1, 0];
    const wrap = seq.some((x, i) => i && x === to && seq[i - 1] === from);
    if (n > 1 && !wrap && got.size === n) note(where, 'Tab', dir + ': нет перехода по кругу', tag);
  }
}
async function closeDialog() {
  await ev(`(() => { const d = [...document.querySelectorAll('.modal:not([hidden])')].pop(); if (!d) return;
    const x = d.querySelector('#resetNo, #anonClose, .sheetx, [aria-label="Закрыть"], button.close'); if (x) x.click(); else d.hidden = true; })()`);
  await wait(250);
  await ev(`document.querySelectorAll('.modal:not([hidden])').forEach(d => d.hidden = true)`);
}
async function setFile(sel, path) {
  const doc = await send('DOM.getDocument', { depth: 0 });
  const q = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: sel });
  await send('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: [path] });
}
async function shot(name, tag) {
  if (!shotsDir) return;
  const w = await ev('innerWidth');
  const h = Math.min(await ev('Math.ceil(Math.max(document.documentElement.scrollHeight, innerHeight))'), 4000);
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 72, clip: { x: 0, y: 0, width: w, height: h, scale: 1 }, captureBeyondViewport: true });
  writeFileSync(join(shotsDir, (tag + ' ' + name).replace(/[«»:\/]/g, '').replace(/\s+/g, '-') + '.jpg'), Buffer.from(r.result.data, 'base64'));
}
const clickText = (sel, re) => `(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(x => ${re}.test(x.textContent.trim())); if (b) b.click(); return !!b; })()`;
async function dialog(where, tag, openJs) {
  await ev(openJs); await wait(400);
  await check(where, tag);
  await tabCycle(where, tag);
  await closeDialog();
}

for (const w of WIDTHS) for (const theme of THEMES) {
  const tag = w + (theme === 'light' ? ' светлая' : ' тёмная');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 860, deviceScaleFactor: 1, mobile: w < 768 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
  await send('Page.navigate', { url }); await wait(1400);
  await ev(`localStorage.setItem("ba_theme_v2", JSON.stringify("${theme}")); navigator.serviceWorker && navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())); location.reload()`).catch(() => {});
  await wait(1500);
  await check('главная', tag);
  await dialog('окно «Приватность»', tag, `document.getElementById("privRow").click()`);
  await dialog('окно «Как скачать»', tag, `document.getElementById("howRow").click()`);
  await dialog('карточка банка', tag, `document.getElementById("howRow").click(); setTimeout(() => document.querySelector("#howBanks .rowcard").click(), 100)`);
  await dialog('окно «Написать нам»', tag, `document.getElementById("fbOpen").click()`);
  await dialog('мастер образца, шаг 1', tag, `document.getElementById("anonOpen").click()`);
  await ev('document.getElementById("demoBtn").click()'); await wait(1200);
  const tabs = await ev('[...document.querySelectorAll("#tabbar button")].map(b => b.innerText.replace(/\\s*\\d+$/, "").trim())');
  for (let i = 0; i < tabs.length; i++) {
    await ev(`document.querySelectorAll("#tabbar button")[${i}].click(); scrollTo(0, 0); document.querySelectorAll("details").forEach(d => d.open = true)`);
    await check('демо: ' + tabs[i], tag);
  }
  await dialog('окно сброса', tag, `document.getElementById("reset").click()`);

  // «Все операции» с поиском и фильтром, «Своя категория»
  await ev(`[...document.querySelectorAll("#tabbar button")].find(b => /Разобрать|Уточнить/.test(b.textContent)).click()`); await wait(400);
  if (await ev(clickText('button', '/^Все операции/'))) {
    await ev(`(() => { const q = document.querySelector(".fq"); if (q) { q.value = "кофе"; q.dispatchEvent(new Event("input", { bubbles: true })); } })()`); await wait(500);
    await check('демо: «Все операции» с поиском', tag); await shot('все-операции-поиск', tag);
    await ev(`(() => { const q = document.querySelector(".fq"); if (q) { q.value = ""; q.dispatchEvent(new Event("input", { bubbles: true })); } })()`);
  } else note('демо', 'сценарий', 'нет кнопки «Все операции»', tag);
  if (await ev(clickText('button', '/Своя категория/'))) { await wait(500); await check('демо: «Своя категория»', tag); await shot('своя-категория', tag); }
  else note('демо', 'сценарий', 'нет кнопки «Своя категория»', tag);
  // Печать: обе темы печатаются светлыми
  await send('Emulation.setEmulatedMedia', { media: 'print', features: [{ name: 'prefers-color-scheme', value: theme }] }); await wait(400);
  const bgL = await ev(`(() => { const c = document.createElement("canvas").getContext("2d"); c.fillStyle = getComputedStyle(document.body).backgroundColor; c.fillRect(0, 0, 1, 1); const d = c.getImageData(0, 0, 1, 1).data; return d[3] ? (d[0] + d[1] + d[2]) / 3 : 255; })()`);
  if (bgL < 200) note('печать', 'печать', 'фон страницы при печати тёмный', tag);
  await check('печать (обзор)', tag); await shot('печать', tag);
  await send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-color-scheme', value: theme }] });

  // Мастер образца, шаги 2–4 на выдуманном файле
  await ev(`document.getElementById("anonOpen").click()`); await wait(300);
  await ev(`document.getElementById("anonNext").click()`); await wait(300);
  await check('мастер образца, шаг 2', tag); await tabCycle('мастер образца, шаг 2', tag);
  await setFile('#anonFile', FAKE_CSV); await wait(1200);
  await check('мастер образца, шаг 2 (файл прочитан)', tag); await shot('мастер-2', tag);
  await ev(`document.getElementById("anonNext").click()`); await wait(400);
  for (let i = 0; i < 20 && await ev('document.getElementById("anonNext").disabled'); i++) { await ev(clickText('#anonPager button', '/Дальше|Следующ|→|›|»/')); await wait(150); }
  await check('мастер образца, шаг 3', tag); await tabCycle('мастер образца, шаг 3', tag); await shot('мастер-3', tag);
  await ev(`document.getElementById("anonNext").click()`); await wait(400);
  await check('мастер образца, шаг 4', tag); await tabCycle('мастер образца, шаг 4', tag); await shot('мастер-4', tag);
  await ev(`(() => { const c = document.getElementById("anonOk"); if (c && !c.checked) c.click(); })()`); await wait(300);
  await check('мастер образца, шаг 4 (согласие)', tag);
  await closeDialog();

  // Ошибки загрузки: битый файл, банк не поддерживается (сразу открывается мастер)
  await setFile('#file', BROKEN_PDF); await wait(1500);
  await check('ошибка: битый файл', tag); await shot('ошибка-битый-файл', tag);
  await setFile('#file', FAKE_CSV); await wait(1500);
  await check('ошибка: банк не поддерживается', tag); await shot('ошибка-банк-не-поддерживается', tag);
  await tabCycle('ошибка: банк не поддерживается (мастер)', tag);
  await closeDialog(); await wait(200);
  await check('ошибка: банк не поддерживается (после окна)', tag); await shot('ошибка-после-окна', tag);
}
sock.close(); edge.kill(); await wait(400);
try { rmSync(prof, { recursive: true, force: true }); } catch (e) { /* профиль занят */ }

const all = WIDTHS.length * THEMES.length;
for (const v of [...vio.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.where.localeCompare(b.where))) {
  const tags = v.tags.size === all ? 'везде' : [...v.tags].join(', ');
  console.log(`НАРУШЕНИЕ [${v.kind}] ${v.where}: ${v.text} — ${tags}`);
}
console.log(`Итог: проверено состояний ${states} (${WIDTHS.join('/')} × 2 темы), нарушений ${vio.size}`);
process.exit(vio.size ? 1 : 0);
