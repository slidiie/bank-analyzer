// Тест кода расширенной версии (pro.js). Ключи создаются здесь же, настоящий закрытый ключ автора не нужен.
// Запуск из папки src:  node tests/test_pro.js

const Pro = require("../pro.js");
const { subtle } = globalThis.crypto;

let failed = 0;
const check = (name, ok) => { if (!ok) failed++; console.log((ok ? "OK    " : "FAIL  ") + name); };
const b64u = buf => Buffer.from(buf).toString("base64url");

(async () => {
  const kp = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = await subtle.exportKey("jwk", kp.publicKey);
  const issue = async payload => {
    const body = b64u(Buffer.from(JSON.stringify(payload)));
    const sig = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, new TextEncoder().encode(body));
    return Pro.PREFIX + body + "." + b64u(sig);
  };
  const lic = { v: 1, id: "test01", f: ["all"], iat: "2026-11-09", exp: "2027-11-09" };
  const code = await issue(lic);

  let r = await Pro.verify(code, { pub, today: "2026-12-01" });
  check("действующий код принят", r.ok === true && r.lic.id === "test01");
  r = await Pro.verify("  " + code.slice(0, 20) + "\n" + code.slice(20) + " ", { pub, today: "2026-12-01" });
  check("пробелы и перенос строки из письма не мешают", r.ok === true);
  r = await Pro.verify(code, { pub, today: "2027-11-10" });
  check("просроченный код не принят, причина понятна", r.ok === false && /Срок кода закончился 09\.11\.2027/.test(r.reason));
  const forged = Pro.PREFIX + b64u(Buffer.from(JSON.stringify({ ...lic, exp: "2099-01-01" }))) + "." + code.split(".")[1];
  r = await Pro.verify(forged, { pub, today: "2026-12-01" });
  check("подделанный срок не принят", r.ok === false && /не подходит/.test(r.reason));
  r = await Pro.verify(code, { today: "2026-12-01" });
  check("код, подписанный чужим ключом, не принят ключом автора", r.ok === false);
  r = await Pro.verify("abc", { pub });
  check("мусор вместо кода: понятное сообщение", r.ok === false && /BA1-/.test(r.reason));
  check("в коде нет личных данных: только номер, функции и сроки", Object.keys(Pro.parse(code).lic).sort().join() === "exp,f,iat,id,v");

  const yearOnly = (await Pro.verify(await issue({ v: 1, id: "y", f: ["year"], iat: "2026-11-09", exp: null }), { pub, today: "2030-01-01" })).lic;
  check("бессрочный код с одной функцией", Pro.has(yearOnly, "year", "2030-01-01") && !Pro.has(yearOnly, "pdf", "2030-01-01"));
  check("«all» открывает всё, пока срок не вышел", Pro.has(lic, "pdf", "2027-01-01") && !Pro.has(lic, "pdf", "2028-01-01"));
  check("без кода ничего не открыто", Pro.has(null, "year") === false);
  check("у каждой функции есть название и пояснение", Pro.FEATURES.every(f => f.id && f.title && f.text));

  console.log(failed ? `\nПровалено: ${failed}` : "\nВсе проверки пройдены.");
  process.exit(failed ? 1 : 0);
})();
