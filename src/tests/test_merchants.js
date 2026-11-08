// Проверка merchants.js: красивые названия, границы слов, очистка неизвестных мест.
// Запуск из папки проекта:  node tests/test_merchants.js

const M = require("../merchants.js");
const Cat = require("../categories.js");
let fails = 0;
const eq = (got, want, msg) => { if (got !== want) { fails++; console.log("FAIL:", msg, "| получено:", JSON.stringify(got), "| ожидалось:", JSON.stringify(want)); } };

// Известные места: как их печатает банк (после Categories.merchantKey) → красивое название
const KNOWN = [
  ["RETAIL BLR MINSK BURGER KING BY", "Burger King"],
  ["RBO BURGER KING MINSK BY ОПЛАТА ТОВАРОВ И УСЛУГ", "Burger King"],
  ["WWW BURGER KING BY MINSK BY", "Burger King"],
  ["MAGAZIN EVROOPT G MINSK BY", "Евроопт"],
  ["ОПЛАТА ТОВАРОВ И УСЛУГ I SHOP WILDBERRIES", "Wildberries"],
  ["RETAIL BLR MINSK MP WB TAXI", "WB Такси"],
  ["RETAIL BLR MINSK SHOP SOSEDI EKSPRESS", "Соседи"],
  ["RETAIL BLR MINSK PT KOFEJNYA N", "Кофейня PT"],
  ["MAK BY MINSK BY ОПЛАТА ТОВАРОВ И УСЛУГ", "Mak.by"],
  ["WWW DODOPIZ ZA BY BLR MINSK", "Dodo Pizza"],
  ["DODO PIZZA MINSK BY", "Dodo Pizza"],
  ["DODOPIZZA BY MINSK BY", "Dodo Pizza"],
  ["SHOP MILA MINSK BY", "Mila"],
  ["MOBIL PRIL YANDEX GO MINSK BY", "Яндекс Go"],
  ["YANDEX DELIVERY MINSK BY", "Яндекс Доставка"],
  ["YANDEX EDA MINSK BY", "Яндекс Еда"],
  ["GOOGLE YANDEX MUSIC B MOUNTAIN VIEW US", "Яндекс Музыка"],
  ["SHOP KOPEECHKA MINSK BY", "Копеечка"],
  ["APPLE COM BILL CORK IE", "Apple"],
  ["RETAIL BLR MINSK ST METRO PLOSHCHAD YAK", "Метро (станция)"],
  ["STANTSIYA METRO INSTITU MINSK BY", "Метро (станция)"],
  ["AZS MINSK", "АЗС"],
  ["SHOP SANTA BAPB MINSK BY", "Санта"],
  ["APTEKA MINSK BY", "Аптека"],
  ["WHOOSH BIKE MINSK BY", "Whoosh"],
  ["GOOGLE TELEGRAM MOUNTAIN VIEW US", "Telegram"],
  ["SUPERMARKET GREEN BA MINSK BY", "Грин"],
  ["GIPERMARKET GREEN G MINSK BY", "Грин"],
  ["BEPAID BY MINSK BY", "bePaid"],
  ["I SHOP WWW EDOSTAVKA MINSKIY R N BY", "E-dostavka"],
  ["RETAIL BLR MACHULISHCHI WWW PZZ BY", "Pizza Tempo"],
  ["PIZZERIYA PITSTSA TEM MINSK BY", "Pizza Tempo"],
  ["GIPERMARKET GIPPO MINSK BY", "Гиппо"],
  ["SUPERMARKET ALMI MINSK BY", "Алми"],
  ["RETAIL BLR MINSK MOLECULE COFFEE", "Molecule Coffee"],
  ["SHOP MAYAK D BOLSHOE STI", "Маяк"],
  ["I RES WWW KFC BY MINSK BY", "KFC"],
  ["SHOP TRI TSENY MINSK BY", "Три цены"],
  ["MAGAZIN MODA MAKS MINSK", "Moda Maks"],
  ["MAGAZIN PEREKRESTO", "Перекрёсток"],
  ["WWW FLOWWOW BY MINSK BY", "FlowWow"],
  ["PP K MOOON DANA MALL MINSK BY", "Moooon"],
  ["DOMINOS PIZZA MINSK BY", "Domino's"],
  ["SHOP N BELMARKET MINSK BY", "Белмаркет"],
  ["SHOP SEM PYATNITS MINSK BY", "Семь пятниц"],
  ["RETAIL BLR MINSK TARO BABL CHAJNAYA", "Taro Babl"],
  ["RETAIL BLR MINSK CRISPY", "Crispy"],
  ["RETAIL BLR MINSK GOLDAPPLE BY", "Золотое яблоко"],
  ["ZOLOTOE YABLOKO MINSK", "Золотое яблоко"],
  ["PECHATNYI CENTR SPRINT MINSK BY", "Sprinter"],
  ["G MOGILEV TROLLEYBUSNYY PARK", "Троллейбусный парк"],
  ["TRANSPORT PAYBYCARD BY G MINSK", "Paybycard"],
  ["UNIVERSAM MINSK", "Универсам"],
  ["OMBSHOP OZ ON BY BLR MINSKIY R N", "Ozon"],
  ["SHOP KHIT EKSPRESS BLR MOGILEV", "Хит! Экспресс"],
  ["SHOP GROSHYK BLR MOGILEV", "Грошык"],
  ["OAO TSUM MINSK MINSK BY", "ЦУМ"],
  ["GOOGLE GOOGLE ONE US USD", "Google One"],
  ["MINSK COFIX", "Cofix"],
];
for (const [raw, want] of KNOWN) eq(M.pretty(raw), want, "pretty " + raw);

// Чужие названия не должны совпадать (границы слов)
const FOREIGN = [
  "TEMPOVAYA ZAPCHAST MINSK BY", "MILANO CAFE MINSK BY", "SHOP MILANA MINSK BY", "SPARTA GYM MINSK BY", "MAKSIM BAR MINSK BY",
  "MAK BYSTRO MINSK BY", "GREENPEACE SHOP MINSK BY", "HITECH SHOP MINSK BY", "SANTANA SHOP MINSK BY", "ALMIRA BEAUTY MINSK BY",
  "AZSTORE MINSK BY", "KFCX MINSK BY", "OZONE SPA MINSK BY", "SOSEDKA MINSK BY", "APTEKARSHA MINSK BY", "DOMINOSA MINSK BY",
  "METROPOLIS MINSK BY", "WILDBERRIESX MINSK BY", "BURGER KINGDOM MINSK BY", "KORONATION SHOP MINSK BY", "EVROOPTIKA MINSK BY",
  "CAFE ROMA MINSK BY", "ПУШКА BY MOGILEV",
];
for (const raw of FOREIGN) eq(M.pretty(raw), null, "чужое не совпадает: " + raw);

// Hustle Castle и другие игры в список не входят
eq(M.pretty("GOOGLE HUSTLE CASTLE MOUNTAIN VIEW US ОПЛАТА ТОВАРОВ И УСЛУГ"), null, "Hustle Castle не в списке");
eq(M.LIST.some(m => /hustle|castle|clash|royale/i.test(m.name)), false, "игр нет в списке");

// Очистка неизвестных мест
eq(M.clean("RETAIL BLR MINSK UNKNOWN SHOPPE BY"), "Unknown Shoppe", "очистка: RETAIL BLR MINSK ... BY");
eq(M.clean("SHOP N ZELENIY SVE MINSK BY ОПЛАТА ТОВАРОВ И УСЛУГ"), "Zeleniy Sve", "очистка: хвост банка");
eq(M.clean("GOOGLE HUSTLE CASTLE MOUNTAIN VIEW US ОПЛАТА ТОВАРОВ И УСЛУГ"), "Google Hustle Castle", "очистка: хвост «Mountain View US»");
eq(M.clean("I SHOP WWW SOMEWHERE MINSKIY R N BY"), "Somewhere", "очистка: www и «r n»");
eq(M.clean("СПИСАНИЕ ПО ОПЕРАЦИИ ПЦ ПОКУПКА"), null, "кириллицу не трогаем");
eq(M.clean("RETAIL BLR MINSK BY"), null, "одни служебные слова: нет названия");
eq(M.clean(""), null, "пустое");
eq(M.clean(null), null, "null");

// Работает поверх реального ключа группировки
const key = Cat.merchantKey({ amount: -10, mcc: "5411", details: "SHOP EVROOPT G MINSK BY ОПЛАТА ТОВАРОВ И УСЛУГ 123" });
eq(M.pretty(key.slice(key.indexOf("|") + 1)), "Евроопт", "через merchantKey");

if (fails) { console.log(fails + " ОШИБОК"); process.exit(1); }
console.log("merchants: все проверки пройдены (" + (KNOWN.length + FOREIGN.length) + " названий + очистка)");
