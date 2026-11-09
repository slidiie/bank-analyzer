// Этап B: новые правила категорий и «корзина» переводов. Данные выдуманные.
// Запуск из папки src:  node tests/test_review_b.js
const Cat = require("../categories.js");
let failed = 0;
const check = (n, ok) => { console.log((ok ? "OK    " : "FAIL  ") + n); if (!ok) failed++; };
const spend = (details, mcc) => ({ details, mcc: mcc || null, amount: -10, date: "2026-10-05" });
const cat = (d, m) => Cat.categorize(spend(d, m));

// Названия мест (общеизвестные сети и сервисы)
const cases = [
  ["RETAIL BLR MINSK WWW EDOSTAVKA BY", "Продукты"],
  ["TORGOVAYA TOCHKA SVETOFOR GOROD MINSK", "Продукты"],
  ["RETAIL BLR MINSK PEKARNYA 5", "Продукты"],
  ["RETAIL BLR MACHULISHCHI WWW PZZ BY", "Кафе и рестораны"],
  ["RETAIL BLR MINSK CRISPY", "Кафе и рестораны"],
  ["RETAIL BLR MINSK COFIX", "Кафе и рестораны"],
  ["RETAIL BLR MINSK LOTUS BUBBLE TEA", "Кафе и рестораны"],
  ["RETAIL BLR MINSK PAPA DONER", "Кафе и рестораны"],
  ["RETAIL BLR MINSK GOLDAPPLE BY", "Красота и уход"],
  ["ZOLOTOE YABLOKO MINSK", "Красота и уход"],
  ["RETAIL BLR G MINSK TRANSPORT PAYBYCARD BY", "Транспорт"],
  ["RETAIL BLR G MOGILEV TROLLEYBUSNYY PARK", "Транспорт"],
  ["MAGAZIN CVETY MOGILEV", "Подарки"],
  ["MAGAZIN MODA MAKS MINSK", "Одежда и покупки"],
  ["RETAIL BLR MINSK WWW MOOON BY", "Одежда и покупки"],
  ["RETAIL HKG HONG KONG OTO TELEGRAM RUB", "Связь и подписки"],
];
for (const [d, want] of cases) check(`«${d}» → ${want}`, cat(d) === want);
check("MCC без названия: 5499 → Продукты", cat("RETAIL BLR MINSK UNKNOWN", "5499") === "Продукты");
check("посредник bePaid по-прежнему без категории", cat("BEPAID BY MINSK BY Оплата товаров и услуг", "5300") === null);
check("фитнес по-прежнему «Развлечения», а не одежда", cat("FITNES CLUB MINSK") === "Развлечения");

// Переводы: по MCC и посредникам это «корзина переводов», а не «совсем без категории»
const T = Cat.BUCKETS[2];
check("MCC 6538 (MTBANK) → корзина «Переводы»", Cat.bucket(spend("MTBANK MINSK BY Оплата товаров и услуг", "6538")) === T);
check("MCC 4829 (Account Funding) → корзина «Переводы»", Cat.bucket(spend("ACCOUNT FUNDING MC TASHKENT UZ", "4829")) === T);
check("MCC 6012 (перевод) → корзина «Переводы»", Cat.bucket(spend("PEREVOD BLR MINSK", "6012")) === T);
check("обычная покупка не попадает в корзину переводов", Cat.bucket(spend("RETAIL BLR MINSK UNKNOWN SHOP")) === null);

// Новая категория «Переводы людям»
check("«Переводы людям» есть в списке и со значком", Cat.DEFAULT_CATEGORIES.includes(Cat.P2P) && !!Cat.ICONS[Cat.P2P]);
check("двойники названия сливаются", Cat.canonical("перевод человеку") === Cat.P2P && Cat.canonical("Переводы людям") === Cat.P2P);

console.log(failed ? `\nОшибок: ${failed}` : "\nВсе проверки пройдены");
process.exit(failed ? 1 : 0);
