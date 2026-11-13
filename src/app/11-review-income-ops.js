    // ---------- «Нужно разобрать»: подсказки по признакам, ключи для памяти, быстрые категории ----------
    const dm = d => dShort(d);
    const isPersonTransfer = tx => /p2p|р2р|на карту|перевод/i.test(tx.details || "") && !/интернет-банк|ерип/i.test(tx.details || "");
    const chipLabel = c => (c === Cat.OWN ? "Это мои деньги (между своими счетами)" : c);
    // Самые частые категории, которые человек уже выбирал: ими дополняем подсказки
    function usedCats() {
      const cnt = new Map();
      for (const c of [...Object.values(userRules), ...Object.values(txRules)]) {
        if (!c || REVIEW_CATS.has(c) || [Cat.OWN, Cat.LOAN, Cat.SAVINGS, Cat.FEES, Cat.INCOME, Cat.P2P].includes(c)) continue;
        cnt.set(c, (cnt.get(c) || 0) + 1);
      }
      return [...cnt.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
    }
    // Предположение по сумме, ритму и типу операции. Это только подсказка: сама она ничего не применяет.
    function suggestFor(g, items) {
      const amts = items.map(t => Math.abs(t.amount));
      const months = new Set(items.map(t => (t.date || "").slice(0, 7)).filter(Boolean)).size;
      const same = items.length > 1 && amts.every(a => Math.abs(a - amts[0]) < 0.005);
      let cats = [], hint = "", q = "К какой категории это отнести?";
      const erip = Cat.isErip(g.tx) || /ерип/i.test(g.tx.details || "");
      if (erip && same && months >= 2) { q = "За что вы платите через ЕРИП каждый месяц?"; hint = "Одна сумма каждый месяц: похоже на связь, интернет или аренду."; cats = ["Связь и подписки", "Аренда и жильё"]; }
      else if (erip) { q = "За что этот платёж через ЕРИП?"; hint = "Чаще всего это коммунальные услуги, связь, налоги или штрафы."; cats = ["Аренда и жильё", "Связь и подписки"]; }
      else if (same && months >= 2) { q = "Платёж повторяется каждый месяц. За что он?"; hint = "Одна и та же сумма: похоже на аренду, кредит или подписку."; cats = ["Аренда и жильё", "Связь и подписки"]; }
      else if (isPersonTransfer(g.tx) && !Cat.recipient(g.tx)) { q = "Кому и за что этот перевод?"; hint = "По выписке не видно, кому и за что."; cats = [Cat.OWN, Cat.LOAN, "Подарки"]; }
      if (!cats.length) for (const c of [...usedCats(), "Продукты", "Кафе и рестораны", "Транспорт"]) { if (cats.length >= 3) break; if (!cats.includes(c)) cats.push(c); }   // общие категории только когда подсказки нет
      return { cats: cats.slice(0, 3), hint, q };
    }
    // Подсказка группе (hints.js): одна строка и, если есть, кнопка с категорией. Категорию назначает человек
    const hintLine = (hint, tx) => hint ? h("div", { class: "muted", style: "margin-top:.3rem" }, hint.text + " ",
      hint.cat ? h("button", { type: "button", class: "linklike", onclick: () => setRule(tx, hint.cat, Cat.ICONS[hint.cat]) }, "Отметить как «" + hint.cat + "»") : "") : "";
    const qchip = (label, onclick, title, cls) => h("button", { type: "button", class: "qchip" + (cls ? " " + cls : ""), onclick, title: title || "" }, label);

    // ---------- Мастер «Уточнить»: одна группа на экране, категория значком, подтверждение одной кнопкой ----------
    let wizKey = null, wizTotal = 0, wizPeriod = null, wizTxN = 0, wizAllOpen = false;   // текущая группа; сколько групп было в начале (для «3 из 12»)
    let wizState = { key: null, cat: "", off: new Set(), ops: false, more: false };       // выбор на экране: сбрасывается при смене группы
    const groupsWord = n => ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "группы" : n % 10 === 1 && n % 100 !== 11 ? "группа" : "групп");
    const byDateTime = (a, b) => ((a.date || "") + (a.time || "")).localeCompare((b.date || "") + (b.time || ""));
    // «Получатель не указан» запоминать для будущих выписок нельзя: под правило попали бы любые чужие переводы, поэтому выбор только для этих операций
    const isLooseGroup = g => !Cat.recipient(g.tx) && !Cat.isErip(g.tx) && !g.tx.__keys && (Cat.bucket(g.tx) === TR_BUCKET || isPersonTransfer(g.tx)) && !NAME_RE.test(softCase(friendlyTitle(g.tx)));   // имя получателя в описании («Иванов И. И.») входит в ключ группы, такую запоминать можно
    // Перевод (на счёт, карту, по реквизитам): вместо общих категорий сначала «мои деньги или человеку»
    const isTransferGroup = g => g.tx.amount < 0 && !Cat.isErip(g.tx) && !/ерип/i.test(g.tx.details || "") &&
      (Cat.bucket(g.tx) === TR_BUCKET || !!Cat.recipient(g.tx) || isPersonTransfer(g.tx) || /реквизит|интернет-банк/i.test(g.tx.details || ""));
    const TILE_LABEL = { [Cat.OWN]: "Мои деньги", [Cat.P2P]: "Человеку" };
    const TILE_TITLE = { [Cat.OWN]: "Перевод между своими счетами: не считается тратой", [Cat.P2P]: "Перевод другому человеку: считается расходом" };
    function wizApply(g, cat, title, off) {
      const picked = g.items.filter(t => !off.has(txId(t)));
      if (!picked.length) return;
      cat = Cat.canonical(cat);
      ensureCategory(cat);
      wizKey = null; wizState = { key: null };   // следующий экран начинается с чистого выбора
      if (picked.length === g.items.length && !isLooseGroup(g)) {
        // Вся группа: правило на получателя, действует и на будущие выписки
        if (cat === Cat.OWN && Cat.recipient(g.tx)) markOwnAccount(g.tx, title); else setRule(g.tx, cat);
        return;
      }
      // Часть операций (или получатель не указан): только отмеченные; снятые остаются в группе и будут спрошены снова
      wizKey = g.key;                               // остаток этой же группы спрашиваем сразу, а не после других
      const ids = picked.map(txId);
      appliedWithUndo(title + (picked.length > 1 ? ` (${picked.length} ${opsWord(picked.length)})` : ""), cat, [], ids, () => { ids.forEach(id => { txRules[id] = cat; }); saveJSON("ba_txrules_v1", txRules); });
    }
    function renderWizard(list, hintByKey) {
      const g = list.find(x => x.key === wizKey) || list[0];
      wizKey = g.key;
      const items = [...g.items].sort(byDateTime);
      const n = items.length, rec = Cat.recipient(g.tx), loose = isLooseGroup(g);
      if (wizState.key !== g.key) wizState = { key: g.key, cat: "", off: new Set(), ops: loose && n > 1, more: false };
      const st = wizState;
      // Одинаковые заголовки (у разных счетов бывают одни и те же последние цифры) различаем датой последней операции
      const titleCount = new Map();
      const rawTitle = x => x.title || softCase(friendlyTitle(x.tx));
      for (const x of list) titleCount.set(rawTitle(x), (titleCount.get(rawTitle(x)) || 0) + 1);
      const titleOf = x => { let t = rawTitle(x); if (titleCount.get(t) > 1) { const d = x.items.map(i => i.date).filter(Boolean).sort().pop(); if (d) t += ` · последний ${dm(d)}`; } return t; };
      const title = titleOf(g);
      const pos = Math.max(1, wizTotal - list.length + 1);
      const share = g.sum < 0 && periodSpend > 0 ? Math.abs(g.sum) / periodSpend * 100 : null;
      const sc = loose || g.tx.__keys ? n : Math.max(n, ruleScope(g.tx));
      const hint = hintByKey.get(g.key);
      // Одна фраза под названием: что будет с выбором
      const note = loose ? "Получатель в выписке не указан: выбор только для отмеченных операций."
        : hint && hint.cat ? hint.text
        : share !== null && share < 1 ? "Меньше 1% трат: если не знаете, что это, оставьте без категории, на итог почти не влияет."
        : sc > n ? `Выбор применится ко всем ${sc} таким операциям (во всех месяцах) и к будущим выпискам.`
        : n > 1 ? `Выбор применится ко всем ${n} операциям и к будущим выпискам.` : "Выбор запомнится и для будущих выписок.";

      const picked = () => items.filter(t => !st.off.has(txId(t)));
      const tiles = [];
      const confirm = h("button", { type: "button", class: "primary", onclick: () => { if (st.cat && picked().length) wizApply(g, st.cat, title, st.off); } }, "Подтвердить выбор");
      const opsBtn = h("button", { type: "button", "aria-expanded": String(st.ops), onclick: () => { st.ops = !st.ops; opsBox.hidden = !st.ops; opsBtn.setAttribute("aria-expanded", String(st.ops)); } });
      const sync = () => {
        const k = picked().length;
        confirm.disabled = !(st.cat && k);
        confirm.textContent = st.cat ? "Подтвердить выбор" : "Выберите категорию";
        opsBtn.textContent = (k === n ? `${n} ${opsWord(n)}` : `${k} из ${n} ${n % 10 === 1 && n % 100 !== 11 ? "операции" : "операций"}`) + " ›";
        tiles.forEach(([c, el]) => { const on = c === st.cat; el.classList.toggle("sel", on); el.setAttribute("aria-pressed", String(on)); });
      };
      const catTile = (cat, label, tip) => {
        const b = h("button", { type: "button", class: "cattile", "aria-pressed": "false", title: tip || "", onclick: () => { st.cat = st.cat === cat ? "" : cat; sync(); } }, iconEl(iconKey(cat)), h("span", {}, label || cat));
        b.style.setProperty("--tile", catColor(cat));
        tiles.push([cat, b]);
        return b;
      };
      // Операции группы: дата, сумма, описание; галочку можно снять, тогда операция в выбор не попадёт
      const opsBox = h("div", { class: "rwops" }, items.slice(0, 60).map(tx => {
        const line = [h("b", {}, `${dm(tx.date)}${tx.time ? " " + tx.time.slice(0, 5) : ""}`),
          h("span", { class: "rwsum" }, `${tx.amount > 0 ? "+" : ""}${fmt(Math.abs(tx.amount))} ${CUR}`),
          h("span", { class: "muted rwdesc" }, (tx.details || "описание не найдено").slice(0, 120))];
        if (n === 1) return h("div", { class: "rwop" }, line);
        const cb = h("input", { type: "checkbox" });
        cb.checked = !st.off.has(txId(tx));
        cb.addEventListener("change", () => { if (cb.checked) st.off.delete(txId(tx)); else st.off.add(txId(tx)); sync(); });
        return h("label", { class: "rwop" }, cb, line);
      }), n > 60 ? h("div", { class: "muted" }, `И ещё ${n - 60}: они тоже отмечены.`) : "");
      opsBox.hidden = !st.ops;

      // Три подсказанные категории и «Ещё»: у переводов «Мои деньги», «Человеку», «Магазин или услуга»
      const transfer = isTransferGroup(g);
      const isBalance = !!(rec && /баланс/i.test(rec.op || ""));
      const recs = [];
      const want = transfer ? [hint && hint.cat, isBalance ? "Связь и подписки" : null, ...(hint && hint.kind === "person" ? [Cat.P2P, Cat.OWN] : [Cat.OWN, Cat.P2P])] : [hint && hint.cat, ...suggestFor(g, items).cats];
      for (const c of want) if (c && !recs.includes(c) && recs.length < (transfer ? 2 + (isBalance ? 1 : 0) : 3)) recs.push(c);
      const gridCats = allCategories().filter(c => !REVIEW_CATS.has(c) && (g.sum > 0 || c !== Cat.INCOME));
      const gridTiles = gridCats.map(c => [c, catTile(c, c, TILE_TITLE[c])]);
      const search = h("input", { type: "text", placeholder: "Найти категорию", "aria-label": "Найти категорию", autocomplete: "off" });
      const noMatch = h("p", { class: "muted" });
      noMatch.hidden = true;
      search.addEventListener("input", () => {
        const q = search.value.trim().toLowerCase();
        let any = false;
        gridTiles.forEach(([c, el]) => { el.hidden = !!q && !c.toLowerCase().includes(q); if (!el.hidden) any = true; });
        noMatch.hidden = !q || any;
        noMatch.textContent = q && !any ? `Нет такой категории. Нажмите «＋ Создать», название «${search.value.trim().slice(0, 40)}» подставится.` : "";
      });
      const newCat = h("button", { type: "button", class: "cattile more", onclick: () => openNewCat(search.value.trim(), c => { st.cat = c; st.more = true; render(); }, newCat) }, h("span", {}, "＋ Создать"));
      const grid = h("div", { class: "rwgrid" }, search, noMatch, h("div", { class: "cattiles" }, gridTiles.map(x => x[1]), newCat));
      grid.hidden = !st.more;
      const moreBtn = h("button", { type: "button", class: "cattile more", "aria-expanded": String(st.more), onclick: () => { st.more = !st.more; grid.hidden = !st.more; moreBtn.setAttribute("aria-expanded", String(st.more)); } },
        transfer ? [iconEl("bag"), h("span", {}, "Магазин или услуга")] : h("span", {}, "Ещё категории"));
      const recRow = h("div", { class: "cattiles" }, recs.map(c => catTile(c, TILE_LABEL[c] || c, TILE_TITLE[c])), moreBtn);

      const pct = Math.round((pos - 1) / Math.max(1, wizTotal) * 100);
      const card = h("div", { class: "rw" },
        h("div", { class: "rwprog" }, h("span", {}, `${pos} из ${wizTotal}`),
          h("div", { class: "rwbar", role: "img", "aria-label": `Уточнено ${pos - 1} из ${wizTotal}` }, h("div", { style: `width:${pct}%` }))),
        h("div", { class: "revhead" }, h("b", {}, title), h("span", { class: "revsum" }, `${fmt(g.sum)} ${CUR}`)),
        h("div", { class: "rwsub" }, opsBtn,
          share !== null ? h("span", {}, share < 1 ? "меньше 1% трат" : `${Math.round(share)}% трат`) : "",
          rec ? h("span", {}, `счёт …${rec.last4}`) : "",
          rhythmText(items) ? h("span", {}, rhythmText(items)) : ""),
        opsBox,
        h("p", { class: "rwnote" }, note),
        recRow, grid,
        h("div", { class: "rwact" }, confirm,
          h("button", { type: "button", class: "skip", title: "Категория не назначается, операции останутся в доле «Не разобрано»", onclick: () => { wizKey = null; deferKey(g.key); } }, "Оставить без категории")));
      sync();
      if (list.length < 2) return card;
      // Все оставшиеся группы одним списком: можно перейти к любой
      const all = h("details", { class: "rwall" }, h("summary", {}, `Все группы (${list.length})`),
        list.slice(0, 40).map(x => h("button", { type: "button", class: "rwjump" + (x === g ? " cur" : ""), onclick: () => {
          wizKey = x.key; wizAllOpen = false; renderReview();
          try { const el = document.querySelector("#review .rw"); if (el) el.scrollIntoView({ block: "nearest" }); } catch (e) { /* без прокрутки */ }
        } }, iconEl(iconKey(Cat.bucket(x.tx) || "Не разобрано")), h("span", { class: "rwj" }, titleOf(x)), h("span", { class: "revsum" }, `${fmt(x.sum)} ${CUR}`))),
        list.length > 40 ? h("div", { class: "muted" }, `И ещё ${list.length - 40}: появятся, когда уточните эти.`) : "");
      all.open = wizAllOpen;
      all.addEventListener("toggle", () => { wizAllOpen = all.open; });
      return h("div", {}, card, all);
    }

    // ЕРИП без названия получателя ключуется по сумме, и ежемесячный платёж с разной суммой распадается на десятки групп.
    // Платежи ЕРИП в один и тот же день месяца (±2 дня) минимум в 3 разных месяцах собираем в одну группу:
    // одна категория для всех (правило ставится на ключ каждой операции).
    function mergeEripByDay(groups, parked) {
      const erip = [...groups.values()].filter(g => g.items.length <= 2 && g.items[0].amount < 0 && Cat.isErip(g.tx) && g.items.every(t => t.date));
      const byDay = new Map();
      for (const g of erip) {
        const d = Math.round(g.items.reduce((a, t) => a + Number(t.date.slice(8, 10)), 0) / g.items.length);
        let slot = [...byDay.keys()].find(k => Math.abs(k - d) <= 2);
        if (slot == null) { slot = d; byDay.set(slot, []); }
        byDay.get(slot).push(g);
      }
      for (const [slot, all] of byDay) {
        // Только платежи близкого размера (в пределах ×3 от медианы): 14 BYN и 1 500 BYN в один день это скорее разные услуги
        const sums = all.map(g => Math.abs(g.sum) / g.items.length).sort((x, y) => x - y), med = sums[Math.floor(sums.length / 2)];
        const gs = all.filter(g => { const v = Math.abs(g.sum) / g.items.length; return v >= med / 3 && v <= med * 3; });
        const months = new Set(gs.flatMap(g => g.items.map(t => t.date.slice(0, 7))));
        if (gs.length < 3 || months.size < 3) continue;
        const items = gs.flatMap(g => g.items).sort((a, b) => a.date.localeCompare(b.date));
        const days = items.map(t => Number(t.date.slice(8, 10))).sort((x, y) => x - y), day = days[Math.floor(days.length / 2)];
        const key = "erip-day:" + slot + ":" + Math.round(med);
        gs.forEach(g => groups.delete(g.key));
        if (deferred.has(key)) { parked.push(...items); continue; }
        const tx = Object.assign({}, items[items.length - 1], { __keys: [...new Set(gs.map(g => g.key))] });
        groups.set(key, { key, tx, items, sum: items.reduce((a, t) => a + t.amount, 0), title: `Платежи через ЕРИП около ${day}-го числа`, monthly: months.size });
      }
    }
    const deferred = new Set();                // отложено кнопкой «Пропустить»: только в памяти страницы, категория не назначается
    const deferKey = k => { deferred.add(k); render(); };
    function renderReview() {
      const period = currentPeriod();
      const groups = new Map();
      const other = new Map();                 // месяц -> сколько неразобранных там, вне выбранной вкладки
      const parked = [];                       // операции, отложенные кнопкой «Пропустить»
      for (const tx of txs) {
        if (categoryOf(tx)) continue;
        if (period !== "all" && !(tx.date && tx.date.startsWith(period))) {
          const ym = (tx.date || "").slice(0, 7);
          other.set(ym, (other.get(ym) || 0) + 1);
          continue;
        }
        const key = Cat.merchantKey(tx);
        if (deferred.has(key) || deferred.has(txId(tx))) { parked.push(tx); continue; }
        if (!groups.has(key)) groups.set(key, { key, tx, items: [], sum: 0 });
        const g = groups.get(key);
        g.items.push(tx); g.sum += tx.amount;
      }
      mergeEripByDay(groups, parked);
      // Сначала самые крупные по сумме
      const list = [...groups.values()].sort((a, b) => Math.abs(b.sum) - Math.abs(a.sum));
      const hintByKey = new Map(Hints.transferHints(list, Cat, txs).map(x => [x.key, x]));
      const opsLeft = list.reduce((n, g) => n + g.items.length, 0);
      reviewOps = opsLeft; reviewGroups = list.length;
      reviewSum = list.reduce((a, g) => a + Math.abs(g.sum), 0);
      reviewTrSum = list.filter(g => Cat.bucket(g.tx) === TR_BUCKET).reduce((a, g) => a + Math.abs(g.sum), 0);
      periodSpend = txs.filter(t => t.amount < 0 && (period === "all" || (t.date && t.date.startsWith(period))) && ![Cat.OWN, Cat.LOAN, Cat.SAVINGS].includes(displayCat(t)))
        .reduce((a, t) => a - t.amount, 0);
      // «Разобрано N%»: одно число для всего сайта (то же, что в «Итоге месяца» и «Не разобрано»): доля трат с понятной категорией
      periodUnclear = txs.filter(t => t.amount < 0 && (period === "all" || (t.date && t.date.startsWith(period))) && ![Cat.OWN, Cat.LOAN, Cat.SAVINGS].includes(displayCat(t)) && isUnclear(displayCat(t)))
        .reduce((a, t) => a - t.amount, 0);
      $("reviewCount").textContent = (period !== "all" ? `· ${monthTitle(period)} ` : "") + (list.length ? `· ${opsLeft} ${opsWord(opsLeft)} в ${list.length} ${list.length % 10 === 1 && list.length % 100 !== 11 ? "группе" : "группах"}` : "");
      reviewOther = [...other.values()].reduce((a, n) => a + n, 0);
      // Неразобранные операции в других месяцах не теряются: показываем ссылки на эти месяцы
      const otherBox = $("reviewOther");
      otherBox.replaceChildren();
      if (other.size) {
        otherBox.append(list.length ? "Ещё ждут уточнения в других месяцах: " : "В этом месяце всё уточнено. Ещё ждут уточнения: ");
        [...other.entries()].sort().forEach(([ym, n]) => {
          otherBox.append(h("button", { type: "button", onclick: () => { activeTab = ym; refreshTop(); renderReview(); renderNav(); renderAll(); renderBottom(); } }, `${ym ? monthTitle(ym) : "без даты"}: ${n}`), " ");
        });
      }
      $("reviewTools").replaceChildren();          // раньше тут была фраза «начните с первых N групп»: в мастере группа на экране одна
      const foot = $("reviewFoot");
      foot.replaceChildren();
      const footBox = h("div", { class: "note footbox" });
      let footN = 0;
      if (list.length > 1) {
        const allOps = list.reduce((a, g) => a + g.items.length, 0);
        const skipBox = h("div", { class: "skipall" });
        const skipIntro = () => skipBox.replaceChildren(qchip("Всё остальное в «Прочее»", skipAsk, "Все оставшиеся группы попадут в категорию «Прочее», это можно отменить", "ghost"));
        const skipAsk = () => skipBox.replaceChildren(h("b", {}, "Отправить всё оставшееся в «Прочее»? "),
          `${list.length} групп, ${allOps} ${opsWord(allOps)}, ${fmt(reviewSum)} ${CUR}. Это можно отменить.`,
          h("div", { class: "chips" },
            qchip("Да, в «Прочее»", () => {
              const prev = list.map(g => [g.key, userRules[g.key]]);
              list.forEach(g => { userRules[g.key] = "Прочее"; });
              saveJSON("ba_rules_v1", userRules);
              tailUndo.push({ prev, groups: list.length, ops: allOps, sum: reviewSum });
              if (tailUndo.length > 3) tailUndo.shift();
              render();
            }, "", "primary"),
            qchip("Отмена", skipIntro)));
        skipIntro();
        footBox.append(skipBox); footN++;
      }
      if (footN) foot.append(footBox);
      const box = $("review");
      box.replaceChildren();
      // Мастер: на экране одна группа (самая крупная из оставшихся), остальные в списке «Все группы»
      if (wizPeriod !== period || wizTxN !== txs.length || !list.length) { wizPeriod = period; wizTxN = txs.length; wizTotal = 0; wizKey = null; }
      wizTotal = Math.max(wizTotal, list.length);
      if (list.length) box.append(renderWizard(list, hintByKey));
      if (parked.length) {
        const pv = [...parked].sort((a, b) => ((a.date || "") + (a.time || "")).localeCompare((b.date || "") + (b.time || "")));
        box.append(h("details", { class: "parkbox" },
          h("summary", {}, `Пропущено: ${parked.length} ${opsWord(parked.length)}`),
          h("p", { class: "muted" }, "Вы их пропустили: категория не назначена, в отчёте они в доле «Не разобрано». Найдите платёж в приложении банка по дате и сумме: там часто виден получатель."),
          pv.slice(0, 15).map(t => h("div", { class: "muted" }, `${dm(t.date)} · ${t.amount > 0 ? "+" : "−"}${fmt(Math.abs(t.amount))} ${CUR} · ${txWhat(t).dir.toLowerCase()}: ${friendlyTitle(t)}`)),
          parked.length > 15 ? h("div", { class: "muted" }, `…и ещё ${parked.length - 15}.`) : "",
          h("p", {}, h("button", { type: "button", class: "primary", onclick: () => { deferred.clear(); render(); } }, "Вернуться к ним"))));
      }
      renderIncome();
    }

    // Поступления, которые сайт не опознал (не зарплата): разбираются так же, как «Уточнить»: одна группа на экране, плитки категорий, две кнопки
    let incKey = null, incTotal = 0, incPeriod = null, incAllOpen = false;
    let incState = { key: null, cat: "", off: new Set(), ops: false, more: false };
    function renderIncome() {
      const period = currentPeriod();
      const groups = new Map();
      for (const tx of txs) {
        if (!(tx.amount > 0) || categoryOf(tx) !== Cat.INCOME || /зарплат|пособи|больничн/i.test(tx.details || "")) continue;
        if (period !== "all" && !(tx.date && tx.date.startsWith(period))) continue;
        const key = Cat.merchantKey(tx);
        if (!groups.has(key)) groups.set(key, { key, tx, items: [], sum: 0 });
        const g = groups.get(key);
        g.items.push(tx); g.sum += tx.amount;
      }
      const list = [...groups.values()].sort((a, b) => b.sum - a.sum);
      const incomeHints = new Map(Hints.transferHints(list, Cat, txs).map(x => [x.key, x]));
      incomeGroups = list.length;
      $("incomeCount").textContent = list.length ? `· ${list.reduce((n, g) => n + g.items.length, 0)} ${opsWord(list.reduce((n, g) => n + g.items.length, 0))} в ${list.length} ${list.length % 10 === 1 && list.length % 100 !== 11 ? "группе" : "группах"}` : "";
      const box = $("income");
      box.replaceChildren();
      if (incPeriod !== period || !list.length) { incPeriod = period; incTotal = 0; incKey = null; }
      if (!list.length) return;
      incTotal = Math.max(incTotal, list.length);
      const g = list.find(x => x.key === incKey) || list[0];
      incKey = g.key;
      const items = [...g.items].sort(byDateTime);
      const n = items.length;
      if (incState.key !== g.key) incState = { key: g.key, cat: "", off: new Set(), ops: n > 1, more: false };
      const st = incState;
      const hint = incomeHints.get(g.key);
      const sc = Math.max(n, ruleScope(g.tx));
      const title = friendlyTitle(g.tx);
      const pos = Math.max(1, incTotal - list.length + 1);
      const note = hint && hint.text ? hint.text
        : sc > n ? `Выбор применится ко всем ${sc} таким поступлениям (во всех месяцах) и к будущим выпискам.`
        : n > 1 ? `Выбор применится ко всем ${n} поступлениям и к будущим выпискам.` : "Выбор запомнится и для будущих выписок.";
      const picked = () => items.filter(t => !st.off.has(txId(t)));
      const tiles = [];
      const apply = h("button", { type: "button", class: "primary", onclick: () => doApply(st.cat) }, scopeText(sc));
      const toOther = h("button", { type: "button", class: "skip", title: "Если непонятно, что это, и сумма небольшая", onclick: () => doApply("Прочее") }, "В «Прочее»");
      const opsBtn = h("button", { type: "button", "aria-expanded": String(st.ops), onclick: () => { st.ops = !st.ops; opsBox.hidden = !st.ops; opsBtn.setAttribute("aria-expanded", String(st.ops)); } });
      const sync = () => {
        const k = picked().length;
        apply.disabled = !(st.cat && k);
        apply.textContent = !st.cat ? "Выберите категорию" : k === n ? scopeText(sc) : `Применить к ${k} из ${n}`;
        opsBtn.textContent = (k === n ? `${n} ${opsWord(n)}` : `${k} из ${n} ${n % 10 === 1 && n % 100 !== 11 ? "операции" : "операций"}`) + " ›";
        tiles.forEach(([c, el]) => { const on = c === st.cat; el.classList.toggle("sel", on); el.setAttribute("aria-pressed", String(on)); });
      };
      function doApply(cat) {
        const pk = picked();
        if (!cat || !pk.length) return;
        cat = Cat.canonical(cat); ensureCategory(cat);
        incState = { key: null, cat: "", off: new Set(), ops: false, more: false };
        if (pk.length === n) { setRule(g.tx, cat); return; }
        incKey = g.key;                       // остаток этой же группы спрашиваем сразу
        const ids = pk.map(txId);
        appliedWithUndo(title + ` (${pk.length} ${opsWord(pk.length)})`, cat, [], ids, () => { ids.forEach(id => { txRules[id] = cat; }); saveJSON("ba_txrules_v1", txRules); });
      }
      const catTile = (cat, label, tip) => {
        const b = h("button", { type: "button", class: "cattile", "aria-pressed": "false", title: tip || "", onclick: () => { st.cat = st.cat === cat ? "" : cat; sync(); } }, iconEl(iconKey(cat)), h("span", {}, label || cat));
        b.style.setProperty("--tile", catColor(cat));
        tiles.push([cat, b]);
        return b;
      };
      const opsBox = h("div", { class: "rwops" }, items.slice(0, 60).map(tx => {
        const line = [h("b", {}, `${dm(tx.date)}${tx.time ? " " + tx.time.slice(0, 5) : ""}`),
          h("span", { class: "rwsum" }, `+${fmt(tx.amount)} ${CUR}`),
          h("span", { class: "muted rwdesc" }, (tx.details || "описание не найдено").slice(0, 120))];
        if (n === 1) return h("div", { class: "rwop" }, line);
        const cb = h("input", { type: "checkbox" });
        cb.checked = !st.off.has(txId(tx));
        cb.addEventListener("change", () => { if (cb.checked) st.off.delete(txId(tx)); else st.off.add(txId(tx)); sync(); });
        return h("label", { class: "rwop" }, cb, line);
      }), n > 60 ? h("div", { class: "muted" }, `И ещё ${n - 60}: они тоже отмечены.`) : "");
      opsBox.hidden = !st.ops;
      const recs = [];
      for (const c of [hint && hint.cat, Cat.OWN]) if (c && !recs.includes(c)) recs.push(c);
      const gridTiles = allCategories().filter(c => !REVIEW_CATS.has(c) && c !== Cat.INCOME).map(c => [c, catTile(c, c, TILE_TITLE[c])]);
      const search = h("input", { type: "text", placeholder: "Найти категорию", "aria-label": "Найти категорию", autocomplete: "off" });
      const noMatch = h("p", { class: "muted" });
      noMatch.hidden = true;
      search.addEventListener("input", () => {
        const q = search.value.trim().toLowerCase();
        let any = false;
        gridTiles.forEach(([c, el]) => { el.hidden = !!q && !c.toLowerCase().includes(q); if (!el.hidden) any = true; });
        noMatch.hidden = !q || any;
        noMatch.textContent = q && !any ? `Нет такой категории. Нажмите «＋ Создать», название «${search.value.trim().slice(0, 40)}» подставится.` : "";
      });
      const newCat = h("button", { type: "button", class: "cattile more", onclick: () => openNewCat(search.value.trim(), c => { st.cat = c; st.more = true; render(); }, newCat) }, h("span", {}, "＋ Создать"));
      const grid = h("div", { class: "rwgrid" }, search, noMatch, h("div", { class: "cattiles" }, gridTiles.map(x => x[1]), newCat));
      grid.hidden = !st.more;
      const moreBtn = h("button", { type: "button", class: "cattile more", "aria-expanded": String(st.more), onclick: () => { st.more = !st.more; grid.hidden = !st.more; moreBtn.setAttribute("aria-expanded", String(st.more)); } }, h("span", {}, "Ещё категории"));
      const recRow = h("div", { class: "cattiles" }, recs.map(c => catTile(c, TILE_LABEL[c] || c, TILE_TITLE[c])), moreBtn);
      const dates = items.map(t => t.date).filter(Boolean);
      const range = dates.length ? (dates[0] === dates[dates.length - 1] ? fmtDate(dates[0]) : `${fmtDate(dates[0])} — ${fmtDate(dates[dates.length - 1])}`) : "";
      const pct = Math.round((pos - 1) / Math.max(1, incTotal) * 100);
      const card = h("div", { class: "rw" },
        h("div", { class: "rwprog" }, h("span", {}, `${pos} из ${incTotal}`),
          h("div", { class: "rwbar", role: "img", "aria-label": `Уточнено ${pos - 1} из ${incTotal}` }, h("div", { style: `width:${pct}%` }))),
        h("div", { class: "revhead" }, h("b", {}, title), h("span", { class: "revsum" }, `+${fmt(g.sum)} ${CUR}`)),
        h("div", { class: "rwsub" }, opsBtn, range ? h("span", {}, range) : ""),
        opsBox,
        h("p", { class: "rwnote" }, note),
        recRow, grid,
        h("div", { class: "rwact" }, apply, toOther),
        g.tx.details ? h("details", { class: "rwraw" }, h("summary", {}, "Показать как в выписке"), h("p", { class: "muted" }, g.tx.details)) : "");
      sync();
      box.append(card);
      if (list.length > 1) {
        const all = h("details", { class: "rwall" }, h("summary", {}, `Все группы (${list.length})`),
          list.slice(0, 40).map(x => h("button", { type: "button", class: "rwjump" + (x === g ? " cur" : ""), onclick: () => { incKey = x.key; incAllOpen = false; renderIncome(); } },
            iconEl(iconKey(Cat.INCOME)), h("span", { class: "rwj" }, friendlyTitle(x.tx)), h("span", { class: "revsum" }, `+${fmt(x.sum)} ${CUR}`))),
          list.length > 40 ? h("div", { class: "muted" }, `И ещё ${list.length - 40}: появятся, когда уточните эти.`) : "");
        all.open = incAllOpen;
        all.addEventListener("toggle", () => { incAllOpen = all.open; });
        box.append(all);
      }
    }

    // Таблица всех операций (свёрнута по умолчанию) с фильтром по месяцу
    const SORTS = {
      "date-desc": (x, y) => (y.date + (y.time || "")).localeCompare(x.date + (x.time || "")),
      "date-asc": (x, y) => (x.date + (x.time || "")).localeCompare(y.date + (y.time || "")),
      "sum-desc": (x, y) => Math.abs(y.amount) - Math.abs(x.amount),
      "sum-asc": (x, y) => Math.abs(x.amount) - Math.abs(y.amount),
    };
    // Клик по заголовку «Дата» или «Сумма»: первый раз «по убыванию», второй раз наоборот
    function sortBy(col) {
      const pair = { date: ["date-desc", "date-asc"], sum: ["sum-desc", "sum-asc"] }[col];
      allSort = allSort === pair[0] ? pair[1] : pair[0];
      renderAll();
    }
    const UNSORTED = "Не разобрано";
    function renderAll() {
      const months = monthsInStatement();
      // Период берётся из выбранной вкладки наверху: открыт сентябрь, значит, и внизу только сентябрь
      const period = months.length > 1 && months.includes(activeTab) ? activeTab : "all";
      const byMonth = txs.filter(t => period === "all" || (t.date && t.date.startsWith(period)));
      // Категории выбранного периода и пустые (по алфавиту, «Не разобрано» первой)
      const counts = new Map();
      byMonth.forEach(t => { const c = displayCat(t) || UNSORTED; counts.set(c, (counts.get(c) || 0) + 1); });
      const names = new Set([UNSORTED, ...counts.keys(), ...allCategories()]);   // «Не разобрано» есть всегда   // и категории без операций (с нулём рядом)
      const catNames = [...names].sort((x, y) => x === UNSORTED ? -1 : y === UNSORTED ? 1 : x.localeCompare(y, "ru"));
      if (allCat !== "all" && !names.has(allCat)) allCat = "all";
      if (!SORTS[allSort]) allSort = "date-desc";
      $("allSummary").textContent = period === "all" ? `Все операции (${txs.length})` : `Все операции · ${monthTitle(period)} (${byMonth.length})`;

      // Заголовок таблицы создаётся один раз, чтобы поле поиска не теряло курсор при вводе
      const search = h("input", { type: "text", placeholder: "категория", "aria-label": "Фильтр по категории", autocomplete: "off", style: "width:9rem;margin-left:.4rem;font-weight:400;user-select:text" });
      search.value = allCat !== "all" ? allCat : "";
      const suggest = h("div", { class: "suggest" });
      suggest.hidden = true;
      let hi = -1;                                   // подсвеченный пункт при управлении стрелками
      const closeList = () => { suggest.hidden = true; hi = -1; };
      const pick = name => {                         // выбор категории из списка (или сброс)
        allCat = name;
        search.value = name === "all" ? "" : name;
        closeList();
        renderTable();
      };
      // Список подсказок: пустое поле показывает все категории, введённый текст сужает список
      function openList() {
        const q = search.value.trim().toLowerCase();
        const shown = allCat !== "all" && search.value === allCat ? catNames : catNames.filter(c => !q || c.toLowerCase().includes(q));
        suggest.replaceChildren();
        if (allCat !== "all") {
          const reset = h("div", { class: "opt" }, "Показать все категории");
          reset.addEventListener("mousedown", e => { e.preventDefault(); pick("all"); });
          suggest.append(reset);
        }
        shown.forEach(c => {
          const o = h("div", { class: "opt" + (c === allCat ? " cur" : "") }, iconEl(iconKey(c)), c, h("span", { class: "muted" }, ` ${counts.get(c) || 0}`));
          o.addEventListener("mousedown", e => { e.preventDefault(); pick(c); });
          suggest.append(o);
        });
        if (!shown.length) suggest.append(h("div", { class: "muted", style: "padding:.3rem .6rem" }, "Такой категории нет"));
        suggest.hidden = false;
        hi = -1;
      }
      search.addEventListener("click", e => e.stopPropagation());   // клик в поле не листает категории
      search.addEventListener("focus", () => { search.select && search.select(); openList(); });
      search.addEventListener("blur", closeList);
      search.addEventListener("keydown", e => {
        const opts = [...suggest.children].filter(el => el.className && el.className.includes("opt"));
        if (e.key === "Escape") { closeList(); return; }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          if (suggest.hidden) openList();
          e.preventDefault && e.preventDefault();
          hi = opts.length ? (hi + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length : -1;
          opts.forEach((el, i) => el.classList.toggle("hi", i === hi));
        } else if (e.key === "Enter") {
          const target = hi >= 0 ? opts[hi] : opts.find(el => !el.textContent.startsWith("Показать"));
          if (target && target.listeners && target.listeners.mousedown) target.listeners.mousedown[0]({ preventDefault() {} });
          else if (target) target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        }
      });
      const wrapSearch = h("span", { class: "searchwrap" }, search, suggest);
      wrapSearch.addEventListener("click", e => e.stopPropagation());
      const dateTh = h("th", { class: "sortable", title: "Нажмите, чтобы отсортировать все операции", onclick: () => sortBy("date") });
      const sumTh = h("th", { class: "sortable num", title: "Нажмите, чтобы отсортировать все операции", onclick: () => sortBy("sum") });
      const catTh = h("th", { class: "sortable", title: "Нажмите, чтобы показать следующую категорию", onclick: nextCategory },
        h("span", {}, "Категория ›"), wrapSearch);
      for (const th of [dateTh, sumTh, catTh]) {      // сортировку можно включить с клавиатуры
        th.setAttribute("tabindex", "0"); th.setAttribute("role", "button");
        th.addEventListener("keydown", e => { if (e.target === th && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); th.click(); } });
      }
      const tbody = h("tbody");
      const info = h("p", { class: "muted" });
      // Панель поиска и фильтров над таблицей; создаётся один раз, чтобы поле поиска не теряло курсор при вводе
      const q = h("input", { type: "text", class: "fq", placeholder: "поиск: описание, сумма, дата", "aria-label": "Поиск по операциям", autocomplete: "off", enterkeyhint: "search" });
      q.value = allFilt.query;
      q.addEventListener("input", () => { allFilt.query = q.value; renderTable(); });
      const kindBtns = [["all", "Все"], ["expense", "Расходы"], ["income", "Поступления"]].map(([k, label]) => {
        const b = h("button", { type: "button", class: "qchip", "aria-pressed": "false" }, label);
        b.addEventListener("click", () => { allFilt.kind = k; syncKind(); renderTable(); });
        b.dataset = b.dataset || {}; b.kindKey = k;
        return b;
      });
      function syncKind() {
        for (const b of kindBtns) { const on = allFilt.kind === b.kindKey; b.setAttribute("aria-pressed", on ? "true" : "false"); b.className = "qchip" + (on ? " primary" : ""); }
      }
      syncKind();
      const mkAmount = (key, label) => {
        const el = h("input", { type: "text", class: "fa", inputmode: "decimal", placeholder: label, "aria-label": "Сумма " + label, autocomplete: "off" });
        el.value = allFilt[key];
        el.addEventListener("input", () => { allFilt[key] = el.value; renderTable(); });
        return el;
      };
      const minIn = mkAmount("min", "от"), maxIn = mkAmount("max", "до");
      const resetBtn = h("button", { type: "button", class: "qchip ghost", onclick: () => resetFilters() }, "Сбросить");
      resetBtn.hidden = true;
      function resetFilters() {
        allFilt = Filters.empty(); allCat = "all";
        q.value = ""; minIn.value = ""; maxIn.value = ""; search.value = "";
        syncKind(); renderTable();
      }
      const panel = h("div", { class: "ffilters" }, q, h("div", { class: "frow" }, ...kindBtns),
        h("div", { class: "frow" }, h("span", { class: "flab" }, "Сумма"), minIn, maxIn, resetBtn));
      const arrow = (a, d) => (allSort === d ? " ▼" : allSort === a ? " ▲" : "");

      // Заметка к операции: «＋ Заметка» или текст с метками #тег (нажатие на метку ищет по ней); хранится в браузере, входит в файл разбора и CSV
      function noteCtl(tx) {
        const id = txId(tx);
        const box = h("div", { class: "opnote" });
        const label = `операции ${tx.date || ""}, ${fmt(tx.amount)} ${CUR}`;
        const show = () => {
          box.replaceChildren();
          const text = txNotes[id];
          if (!text) { box.append(h("button", { type: "button", class: "qchip ghost", onclick: edit, "aria-label": "Добавить заметку к " + label }, "＋ Заметка")); return; }
          box.append(h("span", { class: "notetext" }, ...text.split(/(#[\p{L}\d_-]+)/u).map(p => /^#/.test(p)
            ? h("button", { type: "button", class: "qchip tag", title: "Найти все операции с этой меткой", onclick: () => { allFilt.query = p; q.value = p; renderTable(); } }, p) : p)),
            h("button", { type: "button", class: "qchip ghost", onclick: edit, "aria-label": "Изменить заметку к " + label }, "✎"));
        };
        function edit() {
          box.replaceChildren();
          const inp = h("input", { type: "text", class: "notein", maxlength: "200", autocomplete: "off", placeholder: "заметка, метки через #: #подарок", "aria-label": "Заметка к " + label });
          inp.value = txNotes[id] || "";
          let done = false;
          const save = () => {
            if (done) return; done = true;
            const v = inp.value.trim();
            if (v) txNotes[id] = v; else delete txNotes[id];
            if (!demoMode) saveJSON("ba_notes_v1", txNotes);
            show();
          };
          inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); save(); } else if (e.key === "Escape") { done = true; show(); } });
          inp.addEventListener("blur", save);
          box.append(inp);
          inp.focus({ preventScroll: true });
        }
        show();
        return box;
      }
      // Разделение операции: «✂ Разделить» открывает части (сумма + категория); остаток остаётся в исходной категории
      function splitCtl(tx) {
        const o = tx._o || tx, id = tx.splitOf || txId(tx);
        const box = h("div", { class: "opsplit" });
        const label = `операции ${o.date || ""}, ${fmt(o.amount)} ${CUR}`;
        if (!Splits.canSplit(o)) return box;
        const show = () => {
          box.replaceChildren();
          if (tx.splitOf) {
            box.append(h("span", { class: "badge", title: "Одна операция разделена на части по категориям. Итоги считают каждую часть отдельно." }, (tx.part ? "✂ часть " : "✂ остаток ") + "из " + fmt(o.amount)),
              h("button", { type: "button", class: "qchip ghost", onclick: () => edit(splits[id] || []), "aria-label": "Изменить разделение " + label }, "✎ Изменить"),
              h("button", { type: "button", class: "qchip ghost", onclick: () => setSplit(id, null), "aria-label": "Отменить разделение " + label }, "Отменить разделение"));
          } else box.append(h("button", { type: "button", class: "qchip ghost", onclick: () => edit([]), "aria-label": "Разделить " + label }, "✂ Разделить"));
        };
        function edit(initial) {
          const rows = initial.length ? initial.map(p => ({ a: String(p.a), c: p.c })) : [{ a: "", c: "" }];
          const draw = () => {
            box.replaceChildren();
            const info = h("div", { class: "muted why", "aria-live": "polite" });
            const parsed = () => rows.map(r => ({ a: parseFloat(String(r.a).replace(/[\s ]/g, "").replace(",", ".")), c: r.c }));
            const upd = () => {
              const p = parsed(), sum = p.reduce((a, x) => a + (x.a > 0 ? Math.round(x.a * 100) : 0), 0), rest = Math.round(-o.amount * 100) - sum;
              info.textContent = rest < 0 ? `Части больше суммы операции (${fmt(o.amount)} ${CUR}) на ${fmt(-rest / 100)}.` : `Остаток ${fmt(rest / 100)} ${CUR} останется в категории «${displayCat(o) || "Не разобрано"}».`;
              return rest;
            };
            rows.forEach((r, i) => {
              const inp = h("input", { type: "text", class: "fa", inputmode: "decimal", autocomplete: "off", placeholder: "сумма", "aria-label": `Сумма части ${i + 1}` });
              inp.value = r.a; inp.addEventListener("input", () => { r.a = inp.value; upd(); });
              const line = h("div", { class: "frow" }, inp, catButton(r.c, v => { if (v) { ensureCategory(Cat.canonical(v)); r.c = Cat.canonical(v); } }, `Категория части ${i + 1}`));
              if (rows.length > 1) line.append(h("button", { type: "button", class: "qchip ghost", "aria-label": `Убрать часть ${i + 1}`, onclick: () => { rows.splice(i, 1); draw(); } }, "✕"));
              box.append(line);
            });
            const msg = h("div", { class: "muted why", role: "status" });
            const add = h("button", { type: "button", class: "qchip ghost", onclick: () => { if (rows.length < Splits.MAX_PARTS) { rows.push({ a: "", c: "" }); draw(); } } }, "＋ Часть");
            const save = h("button", { type: "button", class: "qchip primary", onclick: () => {
              const p = parsed();
              if (p.some(x => !(x.a >= 0.01) || !x.c)) { msg.textContent = "У каждой части нужны сумма и категория."; return; }
              const clean = Splits.cleanParts(p);
              if (!Splits.valid(o, clean)) { msg.textContent = "Сумма частей не может быть больше суммы операции."; return; }
              setSplit(id, clean);
            } }, "Сохранить");
            box.append(info, h("div", { class: "frow" }, add, save, h("button", { type: "button", class: "qchip ghost", onclick: show }, "Отмена")), msg);
            upd();
          };
          draw();
        }
        show();
        return box;
      }
      function renderTable() {
        // Поиск и фильтры (текст, расходы/поступления, сумма, категория) оставляют в списке только подходящие операции
        const sorted = [...byMonth].sort(SORTS[allSort]);
        const filt = { ...allFilt, cat: allCat };
        const filtered = Filters.isActive(filt);
        const list = Filters.apply(sorted, filt, tx => displayCat(tx) || UNSORTED, noteOf);
        resetBtn.hidden = !filtered;
        dateTh.textContent = "Дата" + arrow("date-asc", "date-desc");
        sumTh.textContent = "Сумма" + arrow("sum-asc", "sum-desc");
        const isOwn = t => categoryOf(t) === Cat.OWN;
        const isSaving = t => categoryOf(t) === Cat.SAVINGS;
        const spent = list.filter(t => t.amount < 0 && !isOwn(t) && !isSaving(t)).reduce((a, t) => a + -t.amount, 0);
        const got = list.filter(t => t.amount > 0 && !isOwn(t) && !isSaving(t) && !isRefund(t)).reduce((a, t) => a + t.amount, 0);
        const refunded = list.filter(t => t.amount > 0 && !isOwn(t) && isRefund(t)).reduce((a, t) => a + t.amount, 0);
        const ownList = list.filter(isOwn);
        const parts = [filtered ? `найдено операций: ${list.length} из ${byMonth.length}` : `операций: ${list.length}`];
        if (spent) parts.push(refunded ? `потрачено: ${fmt(Math.max(spent - refunded, 0))} ${CUR} (${fmt(spent)} минус возвраты ${fmt(refunded)})` : `потрачено: ${fmt(spent)} ${CUR}`);
        if (got) parts.push(`поступления: ${fmt(got)} ${CUR}`);
        if (ownList.length) parts.push(`⇄ между своими (не в счёт): ${ownList.length} ${opsWord(ownList.length)}, ${fmt(ownList.filter(t => t.amount < 0).reduce((a, t) => a + -t.amount, 0))} ${CUR}`);
        info.textContent = parts.join(" · ");
        const limitKey = period + "|" + allSort + "|" + allCat + "|" + JSON.stringify(allFilt);
        if (limitKey !== allLimitKey) { allLimitKey = limitKey; allLimit = PAGE_ROWS; }
        const view = list.slice(0, allLimit);
        const more = list.length - view.length;
        tbody.replaceChildren(...view.map(tx => {
          const cat = displayCat(tx), clean = cleanDetails(tx.details);
          const row = h("tr", { class: isOwn(tx) ? "own" : "", "data-tx": txId(tx) },
            h("td", { class: "cdate" }, dShort(tx.date) || tx.date || "", recurLabel(tx) ? h("span", { title: recurLabel(tx) }, " ↻") : ""),
            h("td", { class: "num" }, (tx.amount > 0 ? "+" : "") + fmt(tx.amount), tx.rate && !tx.splitOf ? h("div", { class: "muted why" }, `${fmt(tx.orig)} ${tx.cur}, курс ${String(tx.rate).replace(".", ",")}`) : ""),
            h("td", { class: "ccat" },
              h("div", { class: "catview" }, h("span", { class: "dt" }, dShort(tx.date) || tx.date || ""), cat ? catChip(cat) : h("span", { class: "muted" }, "Без категории")),
              h("div", { class: "catedit" }, catButton(cat, v => v && (tx.part && !tx.feePart ? setPartCat(tx, v) : setTxRule(tx, v)), `Категория операции ${tx.date || ""}, ${fmt(tx.amount)} ${CUR}`, { title: "Категория операции" }),
                h("div", { class: "muted why" }, whyCat(tx)))),
            h("td", { class: "details" },
              h("div", { class: "dtext" },
                isOwn(tx) ? h("span", { class: "badge", title: tx.pair
                  ? "Пришло и сразу ушло ровно столько же. Не считается ни доходом, ни расходом. Если это не так, выберите другую категорию."
                  : "Перевод между своими счетами: не считается ни доходом, ни расходом." }, "⇄ между своими") : "",
                tx.pending ? h("span", { class: "badge", title: "Банк деньги заблокировал, но ещё не провёл операцию. В следующей выписке она появится уже проведённой." }, "⏳ не проведена") : "",
                clean || "описание не найдено"),
              h("div", { class: "dextra" },
                tx.details && clean !== tx.details ? h("details", { class: "rwraw" }, h("summary", {}, "Показать как в выписке"), h("p", { class: "muted" }, tx.details)) : "",
                splitCtl(tx), noteCtl(tx))));
          // На телефоне операция одной строкой; нажатие раскрывает категорию, заметку и разделение
          row.addEventListener("click", e => {
            if (!(window.matchMedia && window.matchMedia("(max-width: 520px)").matches)) return;
            if (e.target && e.target.closest && e.target.closest("button, input, a, label, summary, details")) return;
            row.classList.toggle("open");
          });
          return row;
        }));
        if (!list.length && filtered) tbody.append(h("tr", {}, h("td", { colspan: "4" }, "Ничего не найдено. ", h("button", { type: "button", onclick: resetFilters }, "Сбросить фильтры"))));
        if (more > 0) {
          tbody.append(h("tr", {}, h("td", { colspan: "4" },
            `Показано ${view.length} из ${list.length}. `,
            h("button", { type: "button", onclick: () => { allLimit += PAGE_ROWS; renderTable(); } }, `Показать ещё ${Math.min(PAGE_ROWS, more)}`), " ",
            h("button", { type: "button", onclick: () => { allLimit = list.length; renderTable(); } }, "Показать все"))));
        }
      }
      // Клик по «Категория»: наверх поднимается следующая по списку категория, остальные остаются ниже
      function nextCategory() {
        const seq = ["all", ...catNames.filter(c => counts.get(c))];   // по клику листаем только категории с операциями
        const i = Math.max(seq.indexOf(allCat), 0);
        allCat = seq[(i + 1) % seq.length];
        search.value = allCat === "all" ? "" : allCat;
        closeList();
        renderTable();
      }
      // Поиск: вписал название (или его начало), и эта категория поднялась наверх; список подсказок сужается
      search.addEventListener("input", () => {
        const v = search.value.trim().toLowerCase();
        if (!v) allCat = "all";
        else allCat = catNames.find(c => c.toLowerCase() === v) || catNames.find(c => c.toLowerCase().startsWith(v)) ||
          catNames.find(c => c.toLowerCase().includes(v)) || "all";
        renderTable();
        openList();
      });

      $("allFilter").replaceChildren(panel, info);
      $("all").replaceChildren(h("table", {}, h("thead", {}, h("tr", {}, dateTh, sumTh, catTh, h("th", {}, "Описание"))), tbody));
      renderTable();
    }

