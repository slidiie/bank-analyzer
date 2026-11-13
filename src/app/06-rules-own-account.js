    // ---------- «Мои правила»: что запомнено и сколько операций затрагивает ----------
    function ruleLabel(key) {
      const text = key.slice(key.indexOf("|") + 1).replace(/СЧЁТ (\d{4})-([0-9a-z]+)/i, (m, d4, hs) => acctNames[d4 + "-" + hs] ? `«${acctNames[d4 + "-" + hs]}» (…${d4})` : "Счёт …" + d4).trim();
      return (text || "(без названия)").slice(0, 70);
    }
    // Заголовок группы в «Нужно разобрать»: сначала то, что понятно человеку (что за операция), цифры счёта и карты потом.
    // Было «Счёт …3456 ПОПОЛНЕНИЕ КАРТОЧКИ», стало «Пополнение карточки → счёт …3456».
    const sentence = s => { const t = String(s || "").trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
    // Только для показа: «ООО ПРОДТОРГ» → «Ооо продторг». Названия в обычном регистре не трогаем.
    const SHORT_WORDS = new Set(["в", "во", "на", "за", "по", "и", "с", "со", "от", "до", "из", "для", "к", "о", "об", "у", "не"]);
    const softCase = s => {
      const t = String(s || "");
      if (!(/[A-ZА-ЯЁ]{2}/.test(t) && t === t.toUpperCase())) return t;
      const orig = t.trim().split(/(\s+)/);
      // короткие слова-аббревиатуры (ЕРИП, ООО, МТС, A1) оставляем заглавными, предлоги делаем строчными
      return sentence(t).split(/(\s+)/).map((w, i) => { const o = orig[i] || ""; return i > 0 && /^[A-ZА-ЯЁ0-9]{2,4}$/.test(o) && !SHORT_WORDS.has(o.toLowerCase()) ? o : w; }).join("");
    };
    // Только для показа: «… карту иванов и и» → «… карту Иванов И. И.» (ключ в памяти не меняется)
    function tidyName(t) {
      return String(t).replace(/([А-Яа-яЁёA-Za-z]{3,})((?:\s+[А-Яа-яЁёA-Za-z]){1,2})\s*$/, (m, fam, ini) => {
        if (/^(?:и|на|в|с|по|за|от|до|из|к|о|у)$/i.test(ini.trim()) || SHORT_WORDS.has(fam.toLowerCase())) return m;
        return fam.charAt(0).toUpperCase() + fam.slice(1).toLowerCase() + ini.trim().split(/\s+/).map(c => " " + c.toUpperCase() + ".").join("");
      });
    }
    // Для показа: служебный код MCC обычному человеку не нужен (в «Показать как в выписке» остаётся как есть)
    const cleanDetails = d => String(d || "").replace(/[\s;,]*\b(?:MCC|МСС)\b[\s:№#]*\d{4}\b/gi, "").replace(/\s{2,}/g, " ").trim();
    const friendlyTitle = tx => tidyName(softCase(friendlyTitle0(tx)));
    // Латиница банков, которую человек не поймёт: «Erip», «Pavil On», «Pomeshchenie»
    const TRANSLIT = [[/erip/gi, "ЕРИП"], [/pavil ?on/gi, "Павильон"], [/pomeshchenie/gi, "Помещение"], [/magazin/gi, "Магазин"], [/apteka/gi, "Аптека"]];
    const readable = t => TRANSLIT.reduce((a, [re, w]) => a.replace(re, w), String(t || ""));
    function friendlyTitle0(tx) { return readable(friendlyTitle1(tx)); }
    function friendlyTitle1(tx) {
      const rc = Cat.recipient(tx);
      if (rc) {
        const name = acctNames[rc.last4 + "-" + rc.hash];
        return (rc.op ? sentence(rc.op) : "Платёж в интернет-банке") + (name ? ` → «${name}» (…${rc.last4})` : ` → счёт …${rc.last4}`);
      }
      if (Cat.isErip(tx)) return `Платёж через ЕРИП, ${fmt(Math.abs(tx.amount))} ${CUR}`;
      if (/списание при переводе/i.test(tx.details || "")) return "Списание при переводе";
      if (/\bp2p|р2р/i.test(tx.details || "")) return "Перевод с карты на карту, получатель не указан";
      if (/\bsou sber bank/i.test(tx.details || "")) return "Платёж из приложения Сбера, получатель не указан";
      // Банкоматы: «Списание по операции ПЦ выдача наличных денег в АТМ …» → «Снятие наличных»
      if (tx.amount < 0 && /выдача наличных|снятие наличных|\bATM\b|АТМ|банкомат/i.test(tx.details || "")) return "Снятие наличных";
      if (/дебетная часть перевода/i.test(tx.details || "")) return "Перевод с карты через интернет-банк, получатель не указан";
      // Остальное: название места без хвоста «MINSK BY» и без общей фразы «Оплата товаров и услуг»
      // Известные места получают красивое название (merchants.js), остальные очищаются от мусора; категории и суммы не затрагиваются
      const label = ruleLabel(Cat.merchantKey(tx)).replace(/^Списание по операции ПЦ\s*/i, "");
      const pretty = Merchants.pretty(label);
      if (pretty) return pretty;
      return Merchants.clean(label) || label.replace(/\s+(MINSK|МИНСК)\s+BY\b/i, " ").replace(/\s*ОПЛАТА ТОВАРОВ И УСЛУГ\s*$/i, "").replace(/\s+BY\s*$/i, "").replace(/\s+/g, " ").trim() || "Без названия";
    }
    // Что это за операция человеческим языком: направление, кто или что, и честная подсказка, если банк этого не показал
    const NAME_RE = /\p{Lu}\p{Ll}+ \p{Lu}\./u;   // «Иванов И. И.»
    function txWhat(tx) {
      const dir = tx.amount > 0 ? "Пришло" : "Ушло";
      const raw = String(tx.details || "").replace(/,?\s*номер устройства\s*\S+/gi, "").replace(/\s+/g, " ").trim();
      const noWho = !Cat.recipient(tx) && !Cat.isErip(tx) && /p2p|р2р|перевод|sou sber|реквизит|интернет-банк/i.test(raw) && !NAME_RE.test(friendlyTitle(tx));   // имя в заголовке есть: не говорим, что получателя не видно
      return { dir, title: friendlyTitle(tx), raw: raw.length > 110 ? raw.slice(0, 110) + "…" : raw,
        hint: noWho ? "Банк не указал, кому и за что. Найдите перевод в приложении банка по дате и сумме: там обычно виден получатель." : "" };
    }
    // В строке операции одна короткая фраза; сырой текст из выписки спрятан под «Подробнее», общая подсказка пишется один раз на группу
    const whatBlock = tx => { const w = txWhat(tx); return [h("div", { class: "muted" }, w.dir + ": " + (w.title === w.title.toUpperCase() ? sentence(w.title) : w.title)),
      w.raw && w.raw.toLowerCase() !== w.title.toLowerCase() ? h("details", { class: "revmore" }, h("summary", {}, "Подробнее"), h("div", { class: "muted details" }, w.raw)) : ""]; };
    const groupHint = items => (items.some(t => txWhat(t).hint) ? h("div", { class: "muted", style: "margin:.3rem 0" }, "Банк не указал, кому и за что. Найдите перевод в приложении банка по дате и сумме: там обычно виден получатель.") : "");
    // Когда и как часто повторяется группа: по этому часто видно, что это (аренда, связь, подписка)
    function rhythmText(items) {
      const months = new Set(items.map(t => (t.date || "").slice(0, 7)).filter(Boolean));
      if (items.length < 2 || months.size < 2) return "";
      const days = items.map(t => parseInt((t.date || "").slice(8, 10), 10)).filter(Number.isFinite).sort((a, b) => a - b);
      const day = days.length ? days[Math.floor(days.length / 2)] : null;
      return `за ${months.size} мес.` + (day ? `, обычно около ${day}-го числа` : "");
    }
    // ---------- «Это мой счёт» и подпись счёта ----------
    const acctId = tx => { const rc = Cat.recipient(tx); return rc ? rc.last4 + "-" + rc.hash : null; };
    // Все операции на этот же счёт (по любым «Наименованиям операции»), которые сейчас идут по правилу группы
    function acctOps(id) {
      const keys = new Set(txs.filter(t => acctId(t) === id).map(t => Cat.merchantKey(t)));
      return { keys, ops: txs.filter(t => keys.has(Cat.merchantKey(t)) && !txRules[txId(t)] && !t.pair) };
    }
    function markOwnAccount(tx, title) {
      const { keys, ops } = acctOps(acctId(tx));
      const entry = { title, n: ops.length, sum: ops.reduce((a, t) => a + Math.abs(t.amount), 0), prev: [...keys].map(k => [k, userRules[k]]) };
      ownUndo.unshift(entry); ownUndo.splice(5);
      keys.forEach(k => { userRules[k] = Cat.OWN; });
      saveJSON("ba_rules_v1", userRules);
      render();
    }
    function undoOwn(entry) {
      entry.prev.forEach(([k, was]) => { if (was === undefined) delete userRules[k]; else userRules[k] = was; });
      saveJSON("ba_rules_v1", userRules);
      ownUndo.splice(ownUndo.indexOf(entry), 1);
      render();
    }
    // Кнопка с подтверждением: сначала вопрос с суммой, действие только после «Да»
    function ownAccountControl(tx, title, opts) {
      const { ops } = acctOps(acctId(tx));
      if (!ops.length) return "";
      const sum = ops.reduce((a, t) => a + Math.abs(t.amount), 0);
      const box = h("div", { style: "margin-top:.35rem" });
      const ask = h("button", { type: "button", class: opts && opts.chip ? "qchip" : "", title: "Переводы на ваш собственный счёт не считаются тратами" }, (opts && opts.label) || "Это мой счёт");
      ask.addEventListener("click", () => {
        box.replaceChildren(h("div", { class: "note" },
          h("b", {}, "Это точно ваш счёт? "),
          `Из расходов уйдёт ${fmt(sum)} ${CUR} (${ops.length} ${opsWord(ops.length)} во всех месяцах), будущие платежи на него тоже не будут считаться тратами. Сразу после этого появится кнопка «Отменить». `,
          h("button", { type: "button", class: "primary", onclick: () => markOwnAccount(tx, title) }, "Да, это мой счёт"), " ",
          h("button", { type: "button", onclick: () => box.replaceChildren(ask) }, "Отмена")));
      });
      box.append(ask);
      return box;
    }
    // Плашка «отмечено, можно отменить»: остаётся на странице, даже когда группа уже ушла из списка
    function renderUndo() { [$("undoBar"), $("undoBarTop")].forEach(b => { if (b) fillUndo(b); }); }
    function fillUndo(box) {
      box.replaceChildren();
      for (const e of tailUndo) {
        box.append(h("div", { class: "ok", style: "margin:.4rem 0" },
          e.label ? `✓ ${e.label} ` : `✓ ${e.groups} групп (${e.ops} ${opsWord(e.ops)}, ${fmt(e.sum)} ${CUR}) отправлены в «Прочее». `,
          h("button", { type: "button", onclick: () => {
            e.prev.forEach(([k, v]) => { if (v === undefined) delete userRules[k]; else userRules[k] = v; });
            (e.prevTx || []).forEach(([k, v]) => { if (v === undefined) delete txRules[k]; else txRules[k] = v; });
            saveJSON("ba_rules_v1", userRules); saveJSON("ba_txrules_v1", txRules);
            tailUndo.splice(tailUndo.indexOf(e), 1);
            render();
          } }, "Отменить"), " ",
          h("button", { type: "button", onclick: () => { tailUndo.splice(tailUndo.indexOf(e), 1); renderUndo(); } }, "Скрыть")));
      }
      for (const e of otherUndo) {
        box.append(h("div", { class: "ok", style: "margin:.4rem 0" },
          `✓ ${e.n} ${opsWord(e.n)} возвращены в «Уточнить». `,
          h("button", { type: "button", onclick: () => {
            Object.assign(userRules, e.rules); Object.assign(txRules, e.tx);
            saveJSON("ba_rules_v1", userRules); saveJSON("ba_txrules_v1", txRules);
            otherUndo.splice(otherUndo.indexOf(e), 1); render();
          } }, "Отменить"), " ",
          h("button", { type: "button", onclick: () => { otherUndo.splice(otherUndo.indexOf(e), 1); renderUndo(); } }, "Скрыть")));
      }
      for (const e of ownUndo) {
        box.append(h("div", { class: "ok", style: "margin:.4rem 0" },
          `✓ «${e.title}» отмечено как ваш счёт: ${e.n} ${opsWord(e.n)}, ${fmt(e.sum)} ${CUR} убраны из расходов. `,
          h("button", { type: "button", onclick: () => undoOwn(e) }, "Отменить"), " ",
          h("button", { type: "button", onclick: () => { ownUndo.splice(ownUndo.indexOf(e), 1); renderUndo(); } }, "Скрыть")));
      }
    }
    // Подпись счёта: чтобы через полгода было видно, что это за счёт
    function labelEditor(tx) {
      const id = acctId(tx);
      const input = h("input", { type: "text", maxlength: "40", placeholder: "Например: Мама", "aria-label": "Название счёта", value: acctNames[id] || "", autocomplete: "off" });
      const save = () => { const v = input.value.trim(); if (v) acctNames[id] = v; else delete acctNames[id]; saveJSON("ba_acctnames_v1", acctNames); render(); };
      input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save(); } });
      return h("div", { class: "labeled" }, h("div", { class: "muted" }, "Хотите запомнить, чей это счёт? Подпишите его (по желанию, видно только вам):"),
        h("div", { class: "labelrow" }, input, h("button", { type: "button", onclick: save }, "Сохранить название")));
    }
    let condCatVal = "";
    function saveCond() { if (!demoMode) saveJSON("ba_condrules_v1", condRules); }
    function renderCond() {
      const box = $("condList");
      box.replaceChildren();
      $("condSummary").textContent = "Правила с условиями" + (condRules.length ? `: ${condRules.length}` : "");
      if (condCatVal && !allCategories().includes(condCatVal)) condCatVal = "";
      $("condCat").replaceChildren(catButton(condCatVal, c => { condCatVal = c; }, "Категория правила", { cats: allCategories().filter(c => c !== Cat.OWN && !isUnclear(c)) }));
      condRules.forEach((r, i) => {
        const n = txs.filter(t => !txRules[txId(t)] && !t.pair && !userRules[Cat.merchantKey(t)] && CondRules.firstMatch(condRules, t) === r).length;
        box.append(h("div", { class: "prow" },
          h("span", { class: "pname" }, CondRules.describe(r)),
          h("span", { class: "pcat" }, "→ ", catChip(r.c)),
          h("span", { class: "muted" }, txs.length ? `${n} ${opsWord(n)}` : ""),
          h("button", { type: "button", "aria-label": "Выше", disabled: i === 0, onclick: () => { condRules.splice(i - 1, 0, condRules.splice(i, 1)[0]); saveCond(); afterCond(); } }, "↑"),
          h("button", { type: "button", onclick: () => { condRules.splice(i, 1); saveCond(); afterCond(); } }, "Удалить")));
      });
    }
    function afterCond() { if (txs.length) render(); else renderCond(); }
    function addCondRule() {
      const r = CondRules.clean({ t: $("condText").value, min: $("condMin").value, max: $("condMax").value, kind: $("condKind").value, c: condCatVal });
      const msg = $("condMsg");
      if (!r) { msg.textContent = "Укажите текст или границы суммы (от не больше до) и категорию."; return; }
      if (condRules.length >= CondRules.MAX_RULES) { msg.textContent = `Правил может быть не больше ${CondRules.MAX_RULES}.`; return; }
      condRules.push(r); saveCond();
      ["condText", "condMin", "condMax"].forEach(id => { $(id).value = ""; });
      const hit = txs.filter(t => CondRules.firstMatch(condRules, t) === r).length;
      msg.textContent = txs.length ? `Добавлено. Подходит операций: ${hit}.` : "Добавлено.";
      afterCond();
    }
    $("condAdd").addEventListener("click", addCondRule);
    function renderRules() {
      renderCond();
      const box = $("rulesList");
      box.replaceChildren();
      const keys = Object.keys(userRules);
      const singles = Object.keys(txRules).length;
      $("rulesBox").hidden = !keys.length && !singles;
      $("rulesSummary").textContent = `Мои правила: ${keys.length}` + (singles ? ` и ещё ${singles} отдельных` : "");
      const counts = new Map();
      txs.forEach(t => { const k = Cat.merchantKey(t); if (k in userRules && !txRules[txId(t)] && !t.pair) counts.set(k, (counts.get(k) || 0) + 1); });
      if (!keys.length && !singles) { box.append(h("p", { class: "muted" }, "Пока ничего не запомнено.")); return; }
      box.append(h("p", { class: "muted" }, "Правило группы действует на все платежи этого получателя или магазина, в том числе в новых выписках. Отмена возвращает такие операции на разбор." +
        (txs.length ? "" : " Число операций появится, когда загрузите выписку.")));
      keys.sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0)).slice(0, 60).forEach(k => {
        const n = counts.get(k) || 0;
        box.append(h("div", { class: "prow" },
          h("span", { class: "pname" }, ruleLabel(k)),
          h("span", { class: "pcat" }, "→ ", catChip(userRules[k])),
          h("span", { class: "muted" }, txs.length ? `${n} ${opsWord(n)}` : ""),
          h("button", { type: "button", onclick: () => { delete userRules[k]; saveJSON("ba_rules_v1", userRules); if (txs.length) render(); else renderRules(); } }, "Отменить")));
      });
      if (keys.length > 60) box.append(h("p", { class: "muted" }, `…и ещё ${keys.length - 60}.`));
      if (singles) box.append(h("div", { class: "prow" }, h("span", { class: "pname" }, `Операции, отмеченные по одной: ${singles}`),
        h("button", { type: "button", onclick: () => { Object.keys(txRules).forEach(k => delete txRules[k]); saveJSON("ba_txrules_v1", txRules); if (txs.length) render(); else renderRules(); } }, "Отменить все")));
    }

