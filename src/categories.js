// categories.js: категории трат и правила их определения.
// Порядок такой: сначала смотрим на текст описания, потом на MCC-код (вид торговой точки).
// Что не удалось определить, возвращается как null: такие операции пользователь разбирает сам.

(function (root) {
  "use strict";

  const OWN = "Переводы между своими";
  const INCOME = "Пополнения";
  const FEES = "Комиссии банка";
  const GAMBLING = "Азартные игры";  // ставки, казино: считаем и вносимое, и выводимое (итог «внесено − выведено»)
  const LOAN = "Дал в долг";        // деньги, которые одолжил другому человеку: не считаются тратой
  const P2P = "Переводы людям";     // переводы другим людям (не себе и не в долг): расход, но не покупка в магазине
  const SAVINGS = "Накопления";     // переводы на вклад или накопительный счёт: не трата, а «отложено». Определяет только сам пользователь

  // «Корзины»: операции, у которых по выписке видно только способ оплаты, но не цель.
  // Это не настоящие категории: такие операции по-прежнему ждут разбора, но в итогах показываются понятной строкой.
  const BUCKET_IB = "Платежи через интернет-банк";
  const BUCKET_ERIP = "Платежи ЕРИП";
  // Переводы на карту или счёт и P2P: не покупка, а перемещение денег (себе или другому человеку).
  // Отдельная строка, чтобы в «Обзоре» не было одной большой непонятной доли «интернет-банк».
  const BUCKET_TR = "Переводы на карты и счета";
  const BUCKETS = [BUCKET_IB, BUCKET_ERIP, BUCKET_TR];

  const DEFAULT_CATEGORIES = [
    "Продукты",
    "Кафе и рестораны",
    "Аренда и жильё",
    "Товары для дома",
    "Транспорт",
    "Связь и подписки",
    "Здоровье",
    "Одежда и покупки",
    "Развлечения",
    "Красота и уход",
    "Подарки",
    "Путешествия",
    "Образование",
    GAMBLING,
    "Наличные",
    "Прочее",
    P2P,
    LOAN,
    SAVINGS,
    FEES,
    OWN,
    INCOME,
  ];

  // Значки стандартных категорий: имена линейных значков (рисуются в analyzer.html)
  const ICONS = {
    "Продукты": "cart",
    "Кафе и рестораны": "utensils",
    "Аренда и жильё": "home",
    "Товары для дома": "sofa",
    "Транспорт": "bus",
    "Связь и подписки": "phone",
    "Здоровье": "cross",
    "Одежда и покупки": "bag",
    "Развлечения": "film",
    "Красота и уход": "heart",
    "Подарки": "gift",
    "Путешествия": "plane",
    "Образование": "cap",
    [GAMBLING]: "gamepad",
    "Наличные": "cash",
    "Прочее": "box",
    [P2P]: "swap",
    [LOAN]: "arrow-out",
    [SAVINGS]: "coins",
    [FEES]: "bank",
    [OWN]: "swap",
    [INCOME]: "arrow-in",
    [BUCKET_IB]: "arrow-out",
    [BUCKET_ERIP]: "receipt",
    [BUCKET_TR]: "swap",
  };

  // Названия-двойники: если пользователь завёл свою категорию, совпадающую по смыслу со стандартной,
  // они сливаются в одну (стандартное имя побеждает). Сравнение без регистра, «ё» = «е».
  const ALIASES = {
    "Подарки": ["подарки", "подарок", "подарки и цветы", "цветы"],
    "Красота и уход": ["красота", "уход", "красота и уход", "косметика", "парикмахерская", "салон красоты"],
    "Путешествия": ["путешествия", "путешествие", "поездки", "поездка", "отпуск", "туризм"],
    "Образование": ["образование", "учеба", "обучение", "курсы", "школа"],
    "Продукты": ["продукты", "продукты питания", "супермаркеты", "магазины продуктов"],
    "Кафе и рестораны": ["кафе", "рестораны", "кафе и рестораны", "рестораны и кафе", "общепит", "фастфуд"],
    "Аренда и жильё": ["аренда", "жилье", "аренда и жилье", "коммуналка", "коммунальные услуги", "квартира"],
    "Товары для дома": ["товары для дома", "хозтовары", "для дома"],
    "Транспорт": ["транспорт", "проезд", "такси", "бензин", "топливо"],
    "Связь и подписки": ["связь", "подписки", "интернет", "связь и подписки"],
    "Здоровье": ["здоровье", "медицина", "аптека", "лекарства"],
    "Одежда и покупки": ["одежда", "покупки", "шопинг", "одежда и покупки"],
    "Развлечения": ["развлечения", "развлечение", "досуг"],
    "Наличные": ["наличные", "нал", "снятие наличных"],
    [P2P]: ["переводы людям", "перевод человеку", "переводы другим людям", "переводы родным"],
    [SAVINGS]: ["накопления", "сбережения", "копилка", "вклад", "депозит", "отложено"],
  };
  const norm = n => String(n || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  const ALIAS_MAP = {};
  for (const [canon, list] of Object.entries(ALIASES)) { ALIAS_MAP[norm(canon)] = canon; list.forEach(a => { ALIAS_MAP[norm(a)] = canon; }); }
  for (const c of DEFAULT_CATEGORIES) ALIAS_MAP[norm(c)] = c;
  // Приводит имя категории к стандартному, если у него есть двойник; иначе возвращает как есть
  const canonical = name => ALIAS_MAP[norm(name)] || name;

  // Стандартные MCC-коды (международная классификация торговых точек)
  const MCC = {};
  const add = (category, codes) => codes.forEach(c => { MCC[c] = category; });
  add("Продукты", ["5411", "5422", "5441", "5451", "5462", "5499", "5921"]);   // 5921 = алкоголь
  add("Кафе и рестораны", ["5811", "5812", "5813", "5814"]);
  add("Аренда и жильё", ["4900"]);  // коммунальные услуги (электричество, газ, вода)
  add("Товары для дома", ["5200", "5211", "5231", "5251", "5261", "5712", "5713", "5714", "5718", "5719", "5722", "5198", "5072"]);
  add("Транспорт", ["4011", "4111", "4112", "4121", "4131", "4784", "5541", "5542", "5983", "7512", "7523", "7531", "7534", "7535", "7538", "7542", "7549", "5511", "5521", "5531", "5532", "5533"]);
  add("Связь и подписки", ["4814", "4816", "4899", "5815", "5816", "5817", "5818", "7372", "7841"]);
  add("Здоровье", ["5122", "5912", "5975", "5976", "8011", "8021", "8031", "8042", "8043", "8049", "8050", "8062", "8071", "8099"]);
  add("Одежда и покупки", ["5310", "5311", "5331", "5611", "5621", "5631", "5641", "5651", "5655", "5661", "5681", "5691", "5697", "5698", "5699", "5732", "5733", "5734", "5942", "5943", "5944", "5945", "5946", "5948", "5949", "5999"]);
  add("Развлечения", ["7832", "7911", "7922", "7929", "7932", "7933", "7941", "7991", "7992", "7993", "7994", "7996", "7997", "7998", "7999"]);
  add("Красота и уход", ["5977", "7230", "7231", "7297", "7298"]);
  add("Подарки", ["5947", "5992"]);
  add("Путешествия", ["4511", "4722", "7011", "4582"]);
  for (let c = 3000; c <= 3299; c++) MCC[String(c)] = "Путешествия";   // авиакомпании
  for (let c = 3500; c <= 3999; c++) MCC[String(c)] = "Путешествия";   // гостиницы
  add("Образование", ["8211", "8220", "8241", "8244", "8249", "8299"]);
  add(GAMBLING, ["7995"]);   // ставки, лотереи, казино
  add("Наличные", ["6010", "6011"]);

  // Слова, по которым операция относится к оплате жилья (аренда, коммунальные услуги и т. п.)
  const RENT_RE = /жкх|жилищн|коммунал|квартплат|аренд|водоснабж|электроэнерг|электроснабж|газоснабж|теплоснабж|отоплен/i;

  // Ключ «магазина»: по нему запоминаем выбор пользователя и склеиваем похожие операции.
  // Убираем всё, что содержит цифры (даты, номера счетов, устройств, чеков), и оставляем слова.
  // Берём достаточно длинный кусок описания (не 40 символов), иначе все платежи
  // «Оплата в Интернет-банке…» с одинаковым началом сольются в один.
  // Платёж через ЕРИП у ВТБ: по выписке не видно, за что заплачено (у всех одно и то же назначение).
  // Поэтому такие платежи группируем не по тексту, а по сумме: одинаковая сумма это обычно один и тот же счёт.
  const ERIP_RE = /коммунальных, почтовых или банковских услуг/i;
  const isErip = tx => ERIP_RE.test(tx.details || "");

  // Платёж через интернет-банк на конкретный счёт (МТБанк): «Наименование операции: ..., номер счета ...».
  // Все платежи на один счёт собираются в одну группу: разобрать её можно один раз.
  // Полный номер чужого счёта в ключе правила не хранится: только последние 4 цифры и короткий хэш.
  const IB_RE = /оплата в интернет-банке|списание при переводе в интернет-банке/i;
  function recipient(tx) {
    const d = tx.details || "";
    if (!(tx.amount < 0) || !IB_RE.test(d)) return null;
    const m = /номер счета\s+(.+?),\s*номер устройства/i.exec(d) || /номер счета\s+([^,]+),/i.exec(d);
    if (!m) return null;
    const acct = m[1].replace(/\s+/g, "").toUpperCase();
    if (acct.length < 4) return null;
    let hsh = 2166136261;                                       // FNV-1a, 32 бита
    for (let i = 0; i < acct.length; i++) { hsh ^= acct.charCodeAt(i); hsh = Math.imul(hsh, 16777619) >>> 0; }
    const op = (/наименование операции:\s*([^,]+)/i.exec(d) || [])[1];
    return { last4: acct.slice(-4), hash: hsh.toString(36), op: op ? op.trim() : "" };
  }

  function merchantKey(tx) {
    if (isErip(tx)) return (tx.amount > 0 ? "+" : "-") + (tx.mcc || "") + "|ЕРИП " + Math.abs(tx.amount).toFixed(2);
    const rc = recipient(tx);
    if (rc) return "-" + (tx.mcc || "") + "|СЧЁТ " + rc.last4 + "-" + rc.hash + " " + rc.op.toUpperCase();
    let d = (tx.details || "").toUpperCase();
    d = d.replace(/\S*\d\S*/g, " ").replace(/[^A-ZА-ЯЁ ]+/g, " ").replace(/\s+/g, " ").trim();
    return (tx.amount > 0 ? "+" : "-") + (tx.mcc || "") + "|" + d.slice(0, 140);
  }

  // Банки без MCC-кодов (ВТБ): смотрим на название места или магазина в описании
  // Названия букмекеров и казино, которые встречаются прямо в описании операции
  const GAMBLING_RE = /maxline|superbel|belbet|betera|1xbet|1хбет|fonbet|marathon ?bet|parimatch|winline|melbet|pin-?up|mostbet|betboom|1win|betwinner|bet365|vulkan ?(bet|vegas)|casino|казино|букмекер|bookmaker/i;
  // Подсказка: поступление с названием площадки в «карточном» виде («NAME CITY BY … Перевод на БПК … Р2Р / Пополнение тек. счет»),
  // которое сайт не опознал. Это может быть вывод выигрыша; категорию назначает сам человек.
  const PAYOUT_RE = /пополнение тек|р2р|p2p|перевод на бпк/i, PLACE_PREFIX_RE = /^[A-Z0-9][A-Z0-9 .\-_*]+ (BY|RU|CY|MT|GB|LT|IE|EE)\b/;
  function maybeGamblingPayout(tx) {
    const d = String((tx && tx.details) || "").trim();
    return !!tx && tx.amount > 0 && PAYOUT_RE.test(d) && PLACE_PREFIX_RE.test(d);
  }
  // Игры и игровые покупки: сильнее MCC 7372 («программное обеспечение»), под которым Google Play пишет и игры, и подписки
  const GAME_RE = /hustle castle|supercell|clash of|roblox|steam|playstation|xbox|nintendo|epic games|wargaming|world of tanks|genshin|mobile legends|brawl|pubg|dota|valorant|riot games|blizzard/i;
  // Правила по названию места. Сведения о сетях собраны вручную по открытым источникам (см. MERCHANTS.md).
  // Намеренно НЕ включены посредники (bePaid, переводы MTBANK, Account Funding): по ним не видно, за что заплачено.
  const GARDEN_RE = /ogorod|огород|sadovod|садовод|садов[ыа]й|semena|семена|rassad|рассад|garden ?cent|gardencent|sad ?i ?ogorod|pitomnik|питомник/i;
  const PLACE_RULES = [
    [GAMBLING, GAMBLING_RE],
    // Садоводческие магазины банк часто ведёт под MCC 5992 («цветы»): название места сильнее кода
    ["Товары для дома", GARDEN_RE],
    ["Подарки", /flowwow|rozi\.?bel|rozibel|florist|цвет[ыов]|букет|flowers|\bc?tsvety\b|\bcvety\b|buket|podarki|сувенир|souvenir/i],
    ["Путешествия", /belavia|белавиа|airline|airways|ryanair|wizz ?air|turkish air|aeroflot|аэрофлот|booking\.com|airbnb|agoda|hostel|hotel|отель|гостиниц|ostrovok|tutu\.ru|aviasales|ржд|rzd|белорусская железная дорога|\bbzd\b|бжд|bus ?for|ecolines|lux ?express/i],
    ["Продукты", /kopeechk|копеечк|universam|универсам|evroopt|euroopt|евроопт|groshyk|грошык|gippo|gipermarket|hippo|belmarket|белмаркет|sosedi|соседи|prostore|\bsanta\b|санта ритейл|\bgreen\b|korona|корона|\balmi\b|алми|zakrama|закрама|\bspar\b|vitalur|виталюр|dobronom|доброном|belkoopsoyuz|белкоопсоюз|sem[ -]?pyatnits|семь пятниц|магазин продукт|продукты|\bprodukty\b|e-?dostavka|е-?доставка|svetofor|светофор|hit ?ekspress|хит ?экспресс|groshyk|minimarket|минимаркет|gastronom|гастроном|supermarket|супермаркет|pekarn|пекарн|bakery|konditer|кондитер|myasn|мясн|ovoshi|овощ|bellakt|vinoteka|винотек|alkomarket|алкомаркет|\bmayak\b|маяк/i],
    ["Кафе и рестораны", /kofejn|кофейн|burger king|mcdonald|\bkfc\b|pizza|пицц|coffee|кофе|cafe|\bkafe\b|кафе|\bkofe\b|restoran|ресторан|sushi|суши|shaurm|шаурм|bistro|mak\.by|вкусно|vkusno|ksb ?v|dodo|додо|papa ?john|папа джонс|vasilki|васильки|темпо|sushivesla|сушивесла|yandex[. ]?eda|яндекс[. ]?еда|rostic|ростикс|starbucks|кофейн|бургер|burger|столов[аa]я|canteen|stolovaya|\bpzz\b|crispy|taro ?babl|bubble ?tea|cofix|cinnabon|kafeteri|\bvarka\b|smakata|papa ?doner|doner|kebab|shawarma|\bgrill\b|\bpub\b|пивн|ramen|рамен|chajnaya|чайная|donuts|пончик|morozhenoe|мороженое|ice ?cream|pitstsa|pizzeriya|pizzeria|steak|стейк/i],
    ["Транспорт", /\bmetro\b|метро|minsktrans|минсктранс|taxi|такси|yandex[. ]?go|яндекс[. ]?go|\buber\b|\bmaxim\b|\bbolt\b|belorusneft|белоруснефть|\ba-?100\b|lukoil|лукойл|gazpromneft|газпромнефть|rosneft|роснефть|\btriple\b|трайпл|\bazs\b|\bазс\b|парковк|parking|carsharing|каршеринг|paybycard|trolleybus|троллейбус|avtobus|автобус|tramvay|трамвай|whoosh|avtomoyka|автомойка|moyka|шиномонтаж|shinomontazh/i],
    ["Здоровье", /apteka|аптек|pharm|фармаци|planeta zdorov|планета здоровья|lyubimaya apt|любимая аптека|ostrov zdorov|остров здоровья|zabotliv|заботлив|belfarm|белфарм|optika|оптик|klinik|клиник|clinic|stomatolog|стоматолог|dental|медицин|medcentr|медцентр|laborator|лаборатор|анализ|veterin|ветеринар|zoomag|зоомагазин|ortoped|ортопед|dermat|логопед|medsi|медси|synlab|синлаб/i],
    ["Красота и уход", /salon|салон красот|barber|барбершоп|парикмахер|beauty|маникюр|manicure|kosmetik|косметик|rive ?gauche|ривгош|belita|белита|vitex|витэкс|\bspa\b|солярий|massage|массаж|gold ?apple|zolotoe ?yabloko|золотое яблоко|parfum|parfyum|парфюм|nogti|ногтев|\bnails?\b|brow ?bar|podruzhka|подружка|letual|летуаль|sephora|cosmetic|kosmetika|epilyaci|эпиляц|tattoo|ресниц/i],
    ["Образование", /udemy|coursera|skillbox|skyeng|duolingo|школа|school|универс|universit|лицей|гимназ|детский сад|kindergarten|repetitor|репетитор|kursy|курсы|academy|академия|логопед|razvivayush|развивающ/i],
    ["Товары для дома", /fix ?price|фикс ?прайс|три цены|tri ?ceny|tri ?tseny|ikea|икеа|leroy|леруа|castorama|касторама|\bobi\b|domovoy|домовой|hoff|хофф|domovenok|santehnika|сантехник|stroitel|строитель|\bstroy|mebel|мебел|elektrotovar|электротовар|hozyajstvenn|хозяйственн|bauhaus|baucenter|posuda|посуда|tekstil|текстиль/i],
    ["Одежда и покупки", /wildberries|verally|\bwb\b|\bozon\b|озон|lamoda|aliexpress|алиэкспресс|21vek|21 век|onliner|\bemall\b|kufar|куфар|deal\.by|shop\.by|delivio|5element|5 элемент|5 element|electrosila|электросила|\bmila\b|\bмила\b|megatop|мегатоп|\bmarko\b|belwest|белвест|formelle|\bconte\b|милавица|milavitsa|zara|bershka|oodji|o'?stin|остин|lc ?waikiki|sinsay|reserved|deichmann|белпочта|belpost|evropochta|европочта|moda ?maks|\bmodi\b|mooon|moooon|\btvoe\b|\bтвое\b|gloria ?jeans|obuv|обув|odezhd|одежд|trikotazh|трикотаж|detskiy ?mir|детский мир|knigi|книги|knizhn|книжн|kanctovar|канцтовар|kancelyar|канцеляр|igrushk|игрушк|zapchast|запчаст|avtotovar|автотовар|avtomagazin|автомагазин/i],
    ["Связь и подписки", /\ba1\b|a1\.by|\bmts\b|мтс|\blife[:)]|beltelecom|белтелеком|byfly|байфлай|\bzala\b|атлант телеком|velcom|google ?\*? ?(youtube|one|play)|yandex ?(plus|music)|яндекс ?(плюс|музыка)|spotify|netflix|itunes|apple\.com\/bill|icloud|okko|kinopoisk|кинопоиск|megogo|boosty|patreon|openai|chatgpt|telegram premium|подписка|subscription|telegram|\bmts ?money|\blife ?:\)|a1 ?\.?by|beltelecom|интернет-провайдер|provider/i],
    ["Развлечения", /fitnes|fitness|фитнес|world ?class|kino|кино|cinema|театр|\bsport|(?:^|[^а-яё])спорт|бассейн|aquapark|аквапарк|bowling|боулинг|квест|музей|museum|zoo|зоопарк/i],
  ];


  // Категории банка (колонка «Категория операции» в CSV Приорбанка) → наши категории.
  // Только однозначные: «Денежные переводы», «Цифровые товары», «Поставщик услуг», «Оптовые…» решает пользователь.
  // Сильнее только названия мест и MCC: банк иногда ошибается (у «MOBILE BANK» он ставит «Денежные переводы»).
  const BANK_CATS = {
    "ресторация / бары / кафе": "Кафе и рестораны",
    "магазины продуктовые": "Продукты",
    "транспорт - такси": "Транспорт",
    "транспортировка": "Транспорт",
    "магазины хозтоваров": "Товары для дома",
    "магазины мебели и интерьера": "Товары для дома",
    "аптеки": "Здоровье",
    "магазины косметики / парфюмерии": "Красота и уход",
    "развлечения - кино": "Развлечения",
    "магазины цветов": "Подарки",
    "магазины одежды": "Одежда и покупки",
    "магазины обуви": "Одежда и покупки",
    "интернет-магазины": "Одежда и покупки",
    "различные магазины": "Одежда и покупки",
    "снятие наличных": "Наличные",
  };

  // МТБанк: «Пополнение карточки / банковской платежной карточки / счета» это перевод на карту или счёт (свой или чужой)
  const TRANSFER_OP_RE = /^пополнение (карточки|банковской платежной карточки|счета|счёта)/i;
  const TRANSFER_MCC = new Set(["6012", "6538", "4829", "6540"]);
  // Корзина для операции, которую не удалось отнести к категории (иначе null)
  function bucket(tx) {
    if (!(tx.amount < 0)) return null;
    if (isErip(tx)) return BUCKET_ERIP;
    const rc = recipient(tx);
    if (rc) return TRANSFER_OP_RE.test(rc.op) ? BUCKET_TR : BUCKET_IB;
    // P2P (Приорбанк, Сбер, Беларусбанк, ВТБ): перевод с карты на карту, получателя в выписке нет
    if (/\bp2p|р2р/i.test(tx.details || "")) return BUCKET_TR;
    // Приорбанк «MOBILE BANK», Сбер «SOU Sber Bank»: платежи из приложения, получателя в выписке нет
    if (/mobile ?bank|\bsou sber bank/i.test(tx.details || "")) return BUCKET_IB;
    // Денежные переводы по коду MCC и «Account Funding» / Visa Direct: перемещение денег, а не покупка
    if (TRANSFER_MCC.has(String(tx.mcc || "")) || /account funding|visa direct|\bch debit\b/i.test(tx.details || "")) return BUCKET_TR;
    return null;
  }

  // Подписки и онлайн-сервисы по названию. Сильнее MCC: у них код часто общий («ПО», «товары»),
  // а название однозначно говорит, за что платёж. «VPN*» это префикс платёжного шлюза.
  const SUBS_RE = /\b(?:vpn\b|proton ?(vpn|mail|drive)?\b|nord ?(vpn|pass|layer)|surfshark|mullvad|express ?vpn|windscribe|ipvanish|cyberghost|hide\.?me|tunnelbear|amnezia|1password|bitwarden|lastpass|dropbox|icloud|google ?one|spotify|netflix|youtube ?(premium|music)|chatgpt|openai|anthropic|claude\.ai|midjourney|github|telegram ?premium|notion|figma|canva|adobe|microsoft ?\*? ?(365|office)|apple\.com\/bill|itunes)/i;

  // Возвращает [категория или null, причина]: «why» для подписи «почему здесь»
  function resolve(tx) {
    const d = tx.details || "";
    // Операция «пришло и сразу ушло» (пара найдена при разборе выписки)
    if (tx.pair) return [OWN, "перевод между своими счетами"];
    // Служебные списания ВТБ вроде «Погашение расчётных обязательств» это мелкие комиссии банка
    if (/погашение расчётных обязательств|погашение расчетных обязательств/i.test(d)) return [FEES, "служебное списание банка"];
    // Кредитная карта Альфа-Банка: транши, погашение долга и зачисление через ЕРИП это внутренние проводки
    if (/предоставления транша по кредиту|погашение основного долга по кредиту|зачисление на счёт кредита/i.test(d)) return [OWN, "внутренняя проводка кредитной карты"];
    if (/вознаграждение за обслуживание кредитной карты|погашение процентов по кредиту/i.test(d)) return [FEES, "плата банку по кредитной карте"];
    // БПС-Сбербанк: абонентская плата за пакет услуг и проценты по овердрафту это плата банку
    if (/абонентская плата за пакетное обслуживание|погашение процентов по договору овердрафта/i.test(d)) return [FEES, "плата банку (пакет услуг, проценты по овердрафту)"];
    // Пополнение своего вклада
    if (/On-line пополнение тек\.счета\/ вклада/i.test(d)) return [OWN, "пополнение своего вклада"];
    // В выписке встречается слово «комиссии» с латинскими буквами «c», поэтому [сc]
    // «Комиссионный магазин» это магазин, а не плата банку
    if (/ком[иi][сc]{2}(?![иi][оo]нн\S* магазин)/i.test(d)) return [FEES, "в названии есть «комиссия»"];
    if (/(^|\s)плата за (перевод|обслуживани|смс|sms|уведомлен|выпуск|перевыпуск|снят)/i.test(d)) return [FEES, "плата банку за услугу"];
    if (/в рамках одного клиента/i.test(d)) return [OWN, "перевод в рамках одного клиента"];
    if (tx.amount > 0) {
      if (GAMBLING_RE.test(d)) return [GAMBLING, "название игровой площадки"];
      if (/возврат/i.test(d) && tx.mcc && MCC[tx.mcc]) return [MCC[tx.mcc], "возврат по коду MCC " + tx.mcc];
      return [INCOME, "поступление"];
    }
    // Платёж через ЕРИП: по выписке не видно, за что именно заплачено, поэтому его разбирает пользователь
    const erip = /erip|коммунальных, почтовых/i.test(d);
    // ЕРИП с кодом 4900: код означает «коммунальные услуги», но через ЕРИП платят за что угодно, поэтому решает пользователь
    if (erip && tx.mcc === "4900") return [null, ""];
    if (!erip && RENT_RE.test(d)) return ["Аренда и жильё", "в названии есть аренда"];
    if (GAME_RE.test(d)) return ["Развлечения", "название игровой площадки"];
    if (!erip && SUBS_RE.test(d)) return ["Связь и подписки", "название подписки или онлайн-сервиса"];
    if (!erip && GARDEN_RE.test(d)) return ["Товары для дома", "название садового магазина"];   // сильнее MCC 5992 («цветы»)
    if (tx.mcc && MCC[tx.mcc]) return [MCC[tx.mcc], "код MCC " + tx.mcc];
    if (/Выдача наличных/i.test(d)) return ["Наличные", "выдача наличных"];
    if (!erip) for (const [cat, re] of PLACE_RULES) if (re.test(d)) return [cat, "название места"];
    const bc = tx.bankCat && BANK_CATS[norm(tx.bankCat)];
    if (bc) return [bc, "категория банка «" + tx.bankCat + "»"];
    // Нет кода MCC (PDF Приорбанка): безымянный «магазин» или «торговый объект» почти всегда продуктовый у дома.
    // Только последним шагом, когда ни одно правило не сработало (в CSV те же покупки узнаются по коду MCC)
    if (!erip && !tx.mcc && tx.amount < 0 && /\b(magazin|shop n ?\d+|torg\.? ?ob\.?|магазин)\b/i.test(d)) return ["Продукты", "похоже на магазин у дома"];
    return [null, ""];
  }
  const categorize = tx => resolve(tx)[0];

  // Похоже на ФИО человека: отчество (Иванович, Ивановна, оглы…) или «Иванов И.И.». Такое в общий справочник не отдаём.
  const PATRONYMIC_RE = /[а-яё]+(ович|евич|ьич|овна|евна|ична|кызы|оглы|улы)(?![а-яё])/i;
  const INITIALS_RE = /(?:[А-ЯЁ][а-яё]+|[A-ZА-ЯЁ]{3,})\s+[A-ZА-ЯЁ]\.\s?[A-ZА-ЯЁ]\./;
  const looksLikePerson = text => { const t = String(text || ""); return PATRONYMIC_RE.test(t) || INITIALS_RE.test(t); };

  const api = { P2P, looksLikePerson, maybeGamblingPayout, resolve, SUBS_RE, OWN, INCOME, FEES, LOAN, SAVINGS, GAMBLING, DEFAULT_CATEGORIES, ICONS, MCC, BUCKETS, canonical, merchantKey, categorize, bucket, isErip, recipient };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Categories = api;
})(typeof self !== "undefined" ? self : this);
