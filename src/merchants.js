// merchants.js: понятные названия магазинов и сервисов для показа в отчёте.
// Только отображение: категории, суммы и группировка операций от этого не меняются.
// pretty(text): известное место из списка → красивое название, иначе null.
// clean(text):  неизвестное место → название без мусора (www, «MINSK BY», «us», «r n» и т. п.), иначе null.
// Названия взяты из открытых источников (сайты сетей, обзоры рынка Беларуси), логотипы и фирменные цвета не используются.
// Работает и в браузере (глобальный объект Merchants), и в Node (для тестов).

(function (root) {
  "use strict";

  // Слово целиком: перед и после — пробел или край строки (на кириллице \b не работает, поэтому свои границы).
  const wb = alt => new RegExp("(?:^| )(?:" + alt + ")(?= |$)");

  // Порядок важен: частные случаи выше общих (WB Такси выше Wildberries, Яндекс Музыка выше Яндекс Go).
  // Шаблоны пишем латиницей в верхнем регистре: так банки печатают названия, а Categories.merchantKey приводит их к верхнему.
  const LIST = [
    ["Burger King", "BURGER KING"],
    ["Евроопт", "EVROOPT"],
    ["WB Такси", "WB TAXI"],
    ["Wildberries", "WILDBERRIES"],
    ["Соседи", "SOSEDI"],
    ["Кофейня PT", "PT KOFEJNYA"],
    ["Mak.by", "MAK BY"],
    ["Dodo Pizza", "DODO ?PIZ ?ZA"],
    ["Mila", "(?:SHOP|MAGAZIN) MILA"],
    ["Яндекс Доставка", "YANDEX DELIVERY"],
    ["Яндекс Еда", "YANDEX EDA"],
    ["Яндекс Музыка", "YANDEX MUSIC"],
    ["Яндекс Go", "YANDEX GO"],
    ["Копеечка", "KOPEECHKA"],
    ["Apple", "APPLE COM(?: BILL)?"],
    ["Метро (станция)", "(?:ST|STANTSIYA) METRO"],
    ["АЗС", "AZS"],
    ["Санта", "SANTA"],
    ["Аптека", "APTEKA"],
    ["Whoosh", "WHOOSH"],
    ["Telegram", "(?:GOOGLE )?TELEGRAM"],
    ["Google One", "(?:GOOGLE )?GOOGLE ONE"],
    ["Грин", "(?:SUPERMARKET|GIPERMARKET) GREEN"],
    ["bePaid", "BEPAID"],
    ["E-dostavka", "(?:WWW )?EDOSTAVKA"],
    ["Pizza Tempo", "PZZ(?: BY)?|PIZZA TEMPO|PIZZERIYA PITSTSA TEM"],
    ["Гиппо", "GIPPO"],
    ["Алми", "ALMI"],
    ["Molecule Coffee", "MOLECULE COFFEE"],
    ["Маяк", "SHOP MAYAK"],
    ["KFC", "KFC"],
    ["Три цены", "TRI TSENY"],
    ["Moda Maks", "MODA MAKS"],
    ["Перекрёсток", "PEREKRESTOK?"],
    ["FlowWow", "FLOWWOW"],
    ["Moooon", "MOOON"],
    ["Domino's", "DOMINOS"],
    ["Белмаркет", "BELMARKET"],
    ["Семь пятниц", "SEM PYATNITS"],
    ["Taro Babl", "TARO BABL"],
    ["Crispy", "CRISPY"],
    ["Золотое яблоко", "ZOLOTOE YABLOKO|GOLDAPPLE"],
    ["Sprinter", "PECHATNYI CENTR SPRINT(?:ER)?"],
    ["Троллейбусный парк", "TROLLEYBUSNYY PARK"],
    ["Paybycard", "PAYBYCARD"],
    ["Универсам", "UNIVERSAM"],
    // Дополнено по открытым источникам (сети Беларуси, маркетплейсы, кафе)
    ["Хит! Экспресс", "K?HIT EKSPRESS"],
    ["Грошык", "GROSHYK"],
    ["Zakrama", "ZAKRAMA"],
    ["Spar", "SPAR"],
    ["Доброном", "DOBRONOM"],
    ["Виталюр", "VITALUR"],
    ["Корона", "KORONA"],
    ["Светофор", "SVETOFOR"],
    ["Fix Price", "FIX PRICE"],
    ["Ozon", "OZON|OZ ON"],
    ["Lamoda", "LAMODA"],
    ["Kufar", "KUFAR"],
    ["Onliner", "ONLINER"],
    ["Электросила", "ELEKTROSILA|ELECTROSILA"],
    ["Megatop", "MEGATOP"],
    ["ЦУМ", "TSUM"],
    ["Европочта", "EVROPOCHTA"],
    ["Cinnabon", "CINNABON"],
    ["Cofix", "COFIX"],
    ["Lotus Bubble Tea", "LOTUS BUBBLE TEA"],
    ["Papa Doner", "PAPA DONER"],
    ["Boosty", "BOOSTY"],
  ].map(([name, alt]) => ({ name, re: wb(alt) }));

  // Служебные слова, которые банк дописывает вокруг названия. Убираем с краёв.
  const PHRASES = /(?:^| )(?:ОПЛАТА ТОВАРОВ И УСЛУГ|MOUNTAIN VIEW|MINSKIY R ?N|MINSKIY RAYON|MINSKAYA OBL|GOROD|HONG KONG|TALLINN|AMSTERDAM|SHERMAN OAKS)(?= |$)/g;
  const NOISE = new Set(["RETAIL", "BLR", "BY", "US", "USD", "EE", "NL", "SE", "SG", "UZ", "IE", "RU", "WWW", "COM", "SHOP", "MAGAZIN", "MINSK",
    "MOGILEV", "VITEBSK", "G", "I", "RES", "MOBIL", "PRIL", "PT", "TORG", "AVT", "TO", "R", "N", "D", "OOO", "OAO", "ZAO"]);
  const KEEP_UPPER = new Set(["KFC", "WB", "MTS", "ATM", "AZS", "VPN", "MFK"]);

  const lookup = text => String(text || "").toUpperCase().replace(/[^A-ZА-ЯЁ ]+/g, " ").replace(/\s+/g, " ").trim();

  function pretty(text) {
    const t = lookup(text);
    if (!t) return null;
    const hit = LIST.find(m => m.re.test(t));
    return hit ? hit.name : null;
  }

  // Очистка для неизвестных мест. Кириллицу (банковские фразы вроде «СПИСАНИЕ ПО ОПЕРАЦИИ…») не трогаем: вернём null.
  function clean(text) {
    const t = lookup(text).replace(PHRASES, " ").replace(/\s+/g, " ").trim();
    if (!t || /[А-ЯЁ]/.test(t)) return null;
    let words = t.split(" ").filter(Boolean);
    while (words.length && NOISE.has(words[0])) words.shift();
    while (words.length && NOISE.has(words[words.length - 1])) words.pop();
    if (!words.length) return null;
    return words.map(w => KEEP_UPPER.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()).join(" ");
  }

  const api = { pretty, clean, LIST };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Merchants = api;
})(typeof self !== "undefined" ? self : this);
