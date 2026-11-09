// pro.js: код расширенной версии. Проверка целиком в браузере, ничего никуда не отправляется.
// Код выдаёт автор после оплаты (скрипт скрины/pro_keys.mjs, закрытый ключ хранится только у автора).
// Формат: "BA1-" + base64url(JSON) + "." + base64url(подпись ECDSA P-256 / SHA-256 над первой частью).
// В коде нет имени, почты и номера карты: только номер кода, набор функций и срок.
// Защита честная, но не абсолютная: сайт работает у человека, и обойти проверку можно. Платят те, кто хочет поддержать проект.

(function (root) {
  "use strict";

  // Открытый ключ автора (закрытый лежит в W:/bank-analyzer/ключи и не публикуется)
  const PUB = { kty: "EC", crv: "P-256", x: "ijUoCBwd6z95ciGQEslpH5qMMwFjsgunODnps_zX0oY", y: "WHi3ybBjjvk_ZEADyHBeuPHl8fUUG8S1rmSobT8UaPg", ext: true };
  const PREFIX = "BA1-";
  const KEY = "ba_pro_v1";

  // Что входит в расширенную версию. Сейчас это список «на будущее»: ни одна бесплатная функция не закрыта.
  // Ключ (id) пишется в коде покупателя; "all" = всё, что есть и появится за время действия кода.
  const FEATURES = [
    { id: "year", title: "Год целиком", text: "Итоги и сравнение месяцев за 12 месяцев: куда уходит больше, чем год назад" },
    { id: "pdf", title: "Годовой отчёт", text: "Итоги года одним документом: для себя, семьи или бухгалтера (печать отчёта за месяц остаётся бесплатной)" },
    { id: "family", title: "Семейный бюджет", text: "Выписки нескольких людей в одном отчёте, общие и личные траты" },
    { id: "rules", title: "Больше автоматики", text: "Свои правила без ограничений, перенос разбора на другие устройства" },
  ];

  const b64uToBytes = s => {
    const t = String(s).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(t + "===".slice((t.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  // Разбор без проверки подписи: только форма. Пробелы и переносы (код скопирован из письма) убираются.
  function parse(code) {
    const c = String(code || "").replace(/\s+/g, "");
    if (!c.startsWith(PREFIX)) return null;
    const [body, sig] = c.slice(PREFIX.length).split(".");
    if (!body || !sig || !/^[\w-]+$/.test(body) || !/^[\w-]+$/.test(sig)) return null;
    try {
      const lic = JSON.parse(new TextDecoder().decode(b64uToBytes(body)));
      if (!lic || lic.v !== 1 || !Array.isArray(lic.f) || typeof lic.id !== "string") return null;
      if (lic.exp != null && !/^\d{4}-\d{2}-\d{2}$/.test(lic.exp)) return null;
      return { body, sig: b64uToBytes(sig), lic, code: c };
    } catch (e) { return null; }
  }

  const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

  // Проверка кода: { ok, lic, reason }. reason для человека: «код не подходит», «срок кода закончился».
  async function verify(code, opts = {}) {
    const p = parse(code);
    if (!p) return { ok: false, reason: "Код не похож на код расширенной версии. Скопируйте его целиком, начиная с BA1-." };
    const g = typeof globalThis !== "undefined" ? globalThis : root;
    const subtle = opts.subtle || (g.crypto && g.crypto.subtle);
    if (!subtle) return { ok: false, reason: "Браузер не умеет проверять код. Откройте сайт по адресу https://, а не из файла." };
    try {
      const key = await subtle.importKey("jwk", opts.pub || PUB, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      const good = await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, p.sig, new TextEncoder().encode(p.body));
      if (!good) return { ok: false, reason: "Код не подходит. Проверьте, что он скопирован без изменений." };
    } catch (e) { return { ok: false, reason: "Код не подходит. Проверьте, что он скопирован без изменений." }; }
    const now = opts.today || today();
    if (p.lic.exp && p.lic.exp < now) return { ok: false, lic: p.lic, code: p.code, reason: `Срок кода закончился ${p.lic.exp.split("-").reverse().join(".")}.` };
    return { ok: true, lic: p.lic, code: p.code };
  }

  // Есть ли функция в действующем коде
  function has(lic, feature, now) {
    if (!lic) return false;
    if (lic.exp && lic.exp < (now || today())) return false;
    return lic.f.includes("all") || lic.f.includes(feature);
  }

  const api = { PREFIX, KEY, FEATURES, parse, verify, has };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Pro = api;
})(typeof self !== "undefined" ? self : this);
