// Кнопка «Что не так?»: собирает письмо для разработчика (mailto), ничего не отправляя само.
// Чистые функции, без доступа к странице. В письмо попадает только то, что ниже в INFO_KEYS, и текст, который человек написал сам.
// Операции, суммы, описания, даты и номера из выписки сюда не попадают ни при каких входных данных.
(function (root) {
  "use strict";
  const MAIL = "bankanalyzer.help@gmail.com";
  const TOPICS = [
    { id: "parse", label: "Не прочиталась выписка" },
    { id: "cat", label: "Неверная категория" },
    { id: "unclear", label: "Непонятно, что делать" },
    { id: "other", label: "Другое" },
  ];
  const MAX_TEXT = 1500;

  const clean = (s, n) => String(s == null ? "" : s).replace(/[\r\n\t]+/g, " ").slice(0, n).trim();
  const num = x => (Number.isFinite(+x) && +x >= 0 ? Math.round(+x) : 0);

  // Только эти поля, и только в таком виде: версия, названия банков, число операций, раздел, размер экрана, тема
  function info(raw) {
    const r = raw || {};
    return {
      version: clean(r.version, 20),
      banks: (Array.isArray(r.banks) ? r.banks : []).slice(0, 8).map(b => clean(b, 40)).filter(Boolean),
      count: num(r.count),
      unread: num(r.unread),
      mismatch: r.mismatch === true,
      section: clean(r.section, 20),
      screen: num(r.width) + "×" + num(r.height),
      theme: r.theme === "dark" ? "тёмная" : "светлая",
    };
  }

  // Название банка для письма. Банк из нашего списка пишется как есть. У банка не из списка название угадано
  // из шапки выписки, и рядом с ним могли оказаться чужие слова, например фамилия и имя владельца счёта
  // («Сидоров Пётр Белагропромбанк»). В письмо берём только само слово с «банк» или «bank», без соседних слов.
  function bankLabel(name, known) {
    const n = clean(name, 80);
    if (!n) return "";
    if ((known || []).indexOf(n) >= 0) return n;
    const word = n.split(/[^A-Za-zА-Яа-яЁё-]+/).find(w => /банк|bank/i.test(w) && w.length > 5);
    return "нет в списке" + (word ? " (" + word + ")" : "");
  }

  function topicLabel(id) { const t = TOPICS.find(x => x.id === id); return t ? t.label : TOPICS[TOPICS.length - 1].label; }

  // Тело письма (видно человеку в окне до отправки)
  function body(topic, text, raw) {
    const i = info(raw);
    const lines = [clean(text, MAX_TEXT) ? String(text).replace(/\r/g, "").slice(0, MAX_TEXT).trim() : "(опишите, что случилось)", "",
      "— Техническая справка (без данных выписки) —",
      "Версия сайта: " + (i.version || "—"),
      "Банки: " + (i.banks.length ? i.banks.join(", ") : "—"),
      "Операций загружено: " + i.count,
      "Не прочитано операций: " + i.unread + ", суммы с итогами выписки " + (i.mismatch ? "не сошлись" : "сошлись или сверить не с чем"),
      "Раздел: " + (i.section || "—"),
      "Экран: " + i.screen + ", тема: " + i.theme];
    return lines.join("\n");
  }

  function subject(topic, raw) { const v = info(raw).version; return "Что не так: " + topicLabel(topic) + (v ? " (" + v + ")" : ""); }

  function buildMail(topic, text, raw) {
    const s = subject(topic, raw), b = body(topic, text, raw);
    return { to: MAIL, subject: s, body: b, href: "mailto:" + MAIL + "?subject=" + encodeURIComponent(s) + "&body=" + encodeURIComponent(b) };
  }

  const api = { MAIL, TOPICS, MAX_TEXT, info, body, subject, buildMail, topicLabel, bankLabel };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Feedback = api;
})(typeof self !== "undefined" ? self : this);
