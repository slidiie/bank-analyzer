    // ---------- Карточка «Поделиться итогом»: картинка 4:5, рисуется на canvas в браузере (без сумм по умолчанию) ----------
    let shareData = null;
    const SHARE_COLORS = { "--cat-food": "#E76F51", "--cat-cafe": "#F4A261", "--cat-transport": "#E9C46A", "--cat-home": "#2A9D8F", "--cat-subs": "#5FA8D3", "--cat-health": "#8E7DBE", "--cat-shop": "#D66BA0", "--cat-fun": "#B5838D", "--cat-cash": "#A3B18A", "--cat-transfer": "#8C93A1", "--cat-other": "#6E727B" };
    function shareModel(withMoney) {
      const r = shareData.r, rate = r.lines.find(l => l.kind === "rate");
      let kicker, big, good = true, neutral = false, used = null;
      if (rate && rate.value > 0) {
        // хуже обычного для этого человека: не подаём как успех
        const worse = rate.usual != null && rate.value <= rate.usual - 3;
        kicker = worse ? `Не потрачено (обычно ${rate.usual}%)` : "Не потрачено"; big = rate.value + "% дохода"; used = rate; good = !worse; neutral = worse;
      }
      else if (rate && rate.value < 0) { kicker = "Потрачено больше, чем пришло"; big = "на " + Math.abs(rate.value) + "%"; good = false; used = rate; }
      else if (rate) { kicker = "Почти весь доход"; big = "ушёл в траты"; good = false; used = rate; }
      else if (withMoney && r.save) { kicker = "Могло остаться"; big = "+" + Recap.money(r.save) + ` ${CUR}`; }
      else { kicker = "Куда ушли деньги"; big = r.title; }
      const lines = r.lines.filter(l => l !== used && l.kind !== "save" && (withMoney || l.short)).slice(0, 3).map(l => withMoney ? l.text : l.short);
      return { kicker, big, good, neutral, lines, title: r.title };
    }
    async function drawShareCard(canvas, withMoney) {
      if (!shareData) return;
      const m = shareModel(withMoney), W = 1080, H = 1350, P = 76, F = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
      canvas.width = W; canvas.height = H;
      try { await document.fonts.load("400 30px Inter"); await document.fonts.load("600 30px Inter"); } catch (e) { /* системный шрифт */ }
      const g = canvas.getContext("2d");
      const rrect = (x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };
      const wrap = (text, maxW) => { const out = []; let cur = ""; text.split(" ").forEach(w => { const t = cur ? cur + " " + w : w; if (g.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; }); if (cur) out.push(cur); return out; };
      g.fillStyle = "#111112"; g.fillRect(0, 0, W, H);
      // шапка: знак и название
      // тот же знак, что в шапке сайта (SVG из того же кода), чтобы картинка узнавалась
      try {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#16171A"/><g transform="rotate(-90 256 256)" fill="none" stroke-width="64"><circle cx="256" cy="256" r="124" pathLength="100" stroke="#C8EE4A" stroke-dasharray="44 56"/><circle cx="256" cy="256" r="124" pathLength="100" stroke="#FFFFFF" stroke-dasharray="28 72" stroke-dashoffset="-47"/><circle cx="256" cy="256" r="124" pathLength="100" stroke="#7C8494" stroke-dasharray="19 81" stroke-dashoffset="-78"/></g></svg>';
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); });
        g.drawImage(img, P, P, 52, 52);
        g.strokeStyle = "#2A2B2F"; g.lineWidth = 2; rrect(P, P, 52, 52, 13); g.stroke();
      } catch (e) { g.fillStyle = "#16171A"; rrect(P, P, 52, 52, 13); g.fill(); }
      g.textBaseline = "middle"; g.fillStyle = "#F2F2F3"; g.font = "600 36px " + F; g.textAlign = "left"; g.fillText("Fernwood", P + 70, P + 27);
      g.fillStyle = "#8C8D93"; g.font = "400 30px " + F; g.textAlign = "right"; g.fillText(m.title, W - P, P + 27);
      g.textAlign = "left"; g.textBaseline = "alphabetic";
      // главное число
      g.fillStyle = "#8C8D93"; g.font = "400 34px " + F; g.fillText(m.kicker, P, 330);
      let fs = 132; g.font = "600 " + fs + "px " + F;
      while (g.measureText(m.big).width > W - 2 * P && fs > 56) { fs -= 4; g.font = "600 " + fs + "px " + F; }
      g.fillStyle = m.good ? "#5FD08A" : (m.neutral ? "#F2F2F3" : "#F2806A"); g.fillText(m.big, P, 330 + fs + 10);
      // полоса «куда ушли»
      const by = 600, bw = W - 2 * P, tot = shareData.bar.reduce((a, x) => a + x.v, 0), gap = 4;
      let x = P;
      shareData.bar.forEach(b => {
        const w = Math.max(6, bw * b.v / tot - gap);
        g.fillStyle = SHARE_COLORS[b.key] || "#9BA2B0"; rrect(x, by, w, 30, 15); g.fill(); x += w + gap;
      });
      g.font = "400 31px " + F; g.fillStyle = "#B9BAC0";
      const leg = shareData.bar.map(b => b.name + " " + Math.round(b.v / tot * 100) + "%").join(" · ");
      wrap(leg, bw).slice(0, 3).forEach((ln, i) => g.fillText(ln, P, by + 80 + i * 46));
      // выводы
      g.fillStyle = "#2A2B2F"; g.fillRect(P, 800, bw, 2);
      let y = 870; g.font = "400 37px " + F;
      m.lines.forEach(t => {
        const ls = wrap(t, bw - 40).slice(0, 2);
        g.fillStyle = "#B7E34A"; g.beginPath(); g.arc(P + 8, y - 12, 7, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#F2F2F3"; ls.forEach((ln, i) => g.fillText(ln, P + 40, y + i * 52));
        y += ls.length * 52 + 26;
      });
      g.fillStyle = "#8C8D93"; g.font = "400 30px " + F; g.fillText("fernwood.by · файл остаётся у вас", P, H - P);
    }
    function openShare(opener) {
      $("shareMoney").checked = false; $("shareMsg").textContent = "";
      $("shareSend").hidden = !(navigator.canShare && navigator.share);
      openSheet("shareSheet", opener);
      drawShareCard($("shareCanvas"), false);
    }
    const shareBlob = () => new Promise(res => $("shareCanvas").toBlob(res, "image/png"));
    $("shareMoney").addEventListener("change", () => drawShareCard($("shareCanvas"), $("shareMoney").checked));
    $("shareClose").addEventListener("click", closeSheets);
    $("shareSave").addEventListener("click", async () => {
      const b = await shareBlob(); if (!b) return;
      const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "fernwood-итог.png"; a.click();
      $("shareMsg").textContent = "Картинка сохранена в папку загрузок.";
    });
    $("shareSend").addEventListener("click", async () => {
      try {
        const b = await shareBlob(), f = new File([b], "fernwood-итог.png", { type: "image/png" });
        if (navigator.canShare({ files: [f] })) await navigator.share({ files: [f], text: "fernwood.by" });
        else $("shareMsg").textContent = "Здесь «Поделиться» недоступно: скачайте картинку.";
      } catch (e) { /* человек закрыл окно */ }
    });
    function renderSummary() {
      const ctx = renderSummaryCore(), box = $("summary");
      try {
        const head = headlineCard(ctx); ctx._head = head; const tabs = [...box.children].filter(c => c.classList && c.classList.contains("tabs")).pop();
        if (head) { if (tabs && tabs.nextSibling) box.insertBefore(head, tabs.nextSibling); else box.insertBefore(head, box.firstChild); }
        const goals = goalsBlock(ctx);
        if (goals && goals._sum) {
          // Сводка лимитов сверху, подробности раскрываются на месте
          const det = h("details", { class: "goalsdet" }, h("summary", {}, h("i", { class: "gdot lvl-" + goals._sum.level, "aria-hidden": "true" }), h("span", {}, goals._sum.text)), goals);
          const anchor = head && head.nextSibling ? head.nextSibling : null;
          if (head && head.parentNode === box) box.insertBefore(det, anchor); else box.insertBefore(det, box.firstChild);
        } else if (goals) box.append(goals);
        const dyn = dynamicsBlock(ctx);
        if (dyn) box.append(dyn);
        // Напоминание в календарь убрано по решению владельца (10.11): напоминания не нужны
      } catch (e) { /* без украшений, основной обзор уже построен */ }
      try {
        const nb = noticedBlock(ctx), vs = box.querySelector(".viewswitch");
        const card = vs && vs.closest ? vs.closest(".ocard") : null;   // «Что заметили» идёт отдельной карточкой сразу под диаграммой
        if (nb && card) card.after(nb);
      } catch (e) { /* блок «Что заметили» необязателен */ }
      try { const rb = $("recap"), rc = recapCard(); if (rb) { rb.replaceChildren(); if (rc) rb.append(rc); } } catch (e) { /* «Итог месяца» необязателен */ }
      // «Обзор» не должен быть простынёй: сверху вкладки, главная мысль, лимиты и «Куда ушло», остальное под «Подробнее»
      try {
        const keep = c => !c.classList || c.classList.contains("tabs") || c.classList.contains("goalsdet") || c.classList.contains("shortnote") || c === ctx._head || (c.classList.contains("ocard") && c.querySelector(".viewswitch"));
        const rest = [...box.children].filter(c => !keep(c));
        if (rest.length >= 2) {
          const det = h("details", { class: "ovmore" }, h("summary", {}, h("span", {}, "Подробнее о периоде"), h("small", { class: "muted" }, "динамика, получатели, сравнение")), ...rest);
          if (ovMoreOpen) det.setAttribute("open", "");
          det.addEventListener("toggle", () => { ovMoreOpen = det.open; });
          box.append(det);
        }
      } catch (e) { /* без сворачивания всё остаётся на виду */ }
      // Кнопки периода на телефоне листаются вбок: выбранную показываем, сдвигая только ряд (страница не прокручивается)
      try { box.querySelectorAll(".tabs").forEach(row => { const a = row.querySelector(".tab.active"); if (a && row.scrollWidth > row.clientWidth) row.scrollLeft = Math.max(0, a.offsetLeft - row.offsetLeft - 16); }); } catch (e) { /* не важно */ }
      return ctx;
    }

    // Показывает траты выбранного периода. Возвращает его статистику и название (для блока «Выводы»).
    function renderSummaryCore() {
      const months = monthsInStatement();
      if (activeTab !== "all" && !months.includes(activeTab)) activeTab = "all";
      const box = $("summary");
      box.replaceChildren();
      const overall = statsFor(txs);
      const period = header.from ? `${fmtDate(header.from)} — ${fmtDate(header.to)}` : "";

      if (months.length <= 1) {
        box.append(summarySection("", period, overall));
        if (txs.length) box.append(h("p", { class: "muted shortnote" }, "Загрузите выписку за 3 месяца, и здесь появится сравнение по месяцам и средние траты."));
        return { stats: overall, label: "", list: txs };
      }

      // Выписка больше одного месяца: вкладки «За весь период» и по одной на каждый месяц.
      // Видна только выбранная, поэтому страница не растягивается.
      const per = months.map(ym => statsFor(txs.filter(t => t.date && t.date.startsWith(ym))));
      const pick = id => () => { activeTab = id; refreshTop(); renderReview(); renderNav(); renderAll(); renderBottom(); };
      const mLabel = ym => monthTitle(ym) + (coverageNote(ym) ? " (неполный)" : "");
      const years = [...new Set(months.map(ym => ym.slice(0, 4)))];
      if (months.length <= 12 || years.length < 2) {
        // Внутри одного года год лишний: «Авг», «Сен», «Окт» влезают без прокрутки (полное название в подсказке)
        // Месяц называем полностью; неполный помечен словом (на телефоне ряд прокручивается вбок)
        const tabLabel = mLabel;
        const tabs = [["all", "За весь период"], ...months.map(ym => [ym, tabLabel(ym)])];
        box.append(h("div", { class: "tabs" }, tabs.map(([id, label]) =>
          h("button", Object.assign({ class: "tab" + (id === activeTab ? " active" : ""), onclick: pick(id) }, id === "all" ? {} : { title: monthTitle(id) }), label))));
      } else {
        // Много месяцев: сначала год, потом месяц внутри него (30 кнопок в ряд не нужны)
        const shownYear = activeTab !== "all" ? activeTab.slice(0, 4) : (years.includes(tabYear) ? tabYear : years[years.length - 1]);
        box.append(h("div", { class: "tabs" },
          h("button", { class: "tab" + (activeTab === "all" ? " active" : ""), onclick: pick("all") }, "За весь период"),
          ...years.map(y => h("button", { class: "tab yeartab" + (y === shownYear ? " shown" : ""), onclick: () => { tabYear = y; refreshTop(); } }, y))));
        box.append(h("div", { class: "tabs monthtabs" }, months.filter(ym => ym.startsWith(shownYear)).map(ym =>
          h("button", { class: "tab" + (ym === activeTab ? " active" : ""), onclick: pick(ym), title: monthTitle(ym) }, mLabel(ym).replace(/\s?\d{4}/, "")))));
      }

      if (activeTab === "all") {
        box.append(summarySection("", period, overall));
        return { stats: overall, label: "за весь период", list: txs, months, per };
      }
      const i = months.indexOf(activeTab);
      box.append(summarySection("", coverageNote(activeTab), per[i]));
      return { stats: per[i], label: monthTitle(activeTab), list: txs.filter(t => t.date && t.date.startsWith(activeTab)), months, per, current: i };
    }

    // Показать операцию в таблице «Все операции»: поиск по дате и сумме оставляет одну строку, она подсвечивается
    function showTx(tx) {
      const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(tx.date || "");
      allCat = "all"; allFilt = Filters.empty();
      allFilt.query = (m ? `${m[3]}.${m[2]}.${m[1]} ` : "") + Math.abs(tx.amount).toFixed(2).replace(".", ",");
      bottomTab = "all"; bottomOpen = true; showSection("review"); renderAll(); renderBottom();
      try {
        const row = [...document.querySelectorAll("#all tr[data-tx]")].find(r => r.getAttribute("data-tx") === txId(tx)) || document.querySelector("#all tr[data-tx]");
        if (row) { row.classList.add("hl"); row.scrollIntoView({ block: "center", behavior: "smooth" }); setTimeout(() => row.classList.remove("hl"), 3000); }
      } catch (e) { /* без подсветки */ }
    }
    // «Что это было?»: по умолчанию ответ запоминается для получателя (userRules, как «Для всей группы»),
    // кнопка «Только эта операция» ставит категорию лишь выбранным операциям (txRules)
    function whatWasIt(list, knownCat) {
      let only = false;
      const keys = [...new Set(list.map(t => Cat.merchantKey(t)))];
      const keyOk = keys.every(k => !/\|\s*$/.test(k));          // пустое название: правило «по получателю» зацепило бы всё подряд
      const same = keyOk ? txs.filter(t => keys.includes(Cat.merchantKey(t)) && !t.pair && !txRules[txId(t)]).length : 0;
      const n = list.length;
      const apply = cat => {
        cat = Cat.canonical(cat); ensureCategory(cat);
        const name = softCase(friendlyTitle(list[0]));
        if (only || !keyOk) appliedWithUndo(name, cat, [], list.map(txId), () => { list.forEach(t => { txRules[txId(t)] = cat; }); saveJSON("ba_txrules_v1", txRules); });
        else appliedWithUndo(name, cat, keys, [], () => { keys.forEach(k => { userRules[k] = cat; }); saveJSON("ba_rules_v1", userRules); });
      };
      const panel = h("div", { class: "morechoose", hidden: "" });
      const show = (...kids) => { panel.replaceChildren(...kids); panel.hidden = false; };
      // Категория уже определена сайтом: не спрашиваем «что это было?» заново, а предлагаем поправить, если сайт ошибся
      const known = knownCat && !isUnclear(knownCat) && knownCat !== "не разобрано" && knownCat !== "Не разобрано";
      const hint = h("div", { class: "muted" });
      const scopeBtn = qchip("", () => { only = !only; refresh(); }, "", "ghost");
      const refresh = () => {
        hint.textContent = only || !keyOk
          ? (n > 1 ? `Выбор применится только к этим ${n} операциям.` : "Выбор применится только к этой операции.")
          : `Выбор запомнится для этого получателя: ${same} ${plur(same, "операция", "операции", "операций")}, в том числе в следующих выписках.`;
        scopeBtn.textContent = only ? "Запомнить для получателя" : (n > 1 ? "Только эти операции" : "Только эта операция");
      };
      refresh();
      const chipsBox = h("div", { class: "chips" },
        qchip("Аренда", () => apply("Аренда и жильё")),
        qchip("Перевод человеку", () => apply(Cat.P2P)),
        qchip("Мои деньги (между своими счетами)", () => apply(Cat.OWN), "Не считается тратой"),
        qchip("Магазин или услуга", () => show(h("div", { class: "chips" }, ["Продукты", "Кафе и рестораны", "Транспорт", "Покупки"].filter(c => allCategories().includes(c)).map(c => qchip(c, () => apply(c)))))),
        qchip("Другое…", () => show(chooser("Применить", cat => apply(cat), { noQuick: true })), "Выбрать из полного списка", "ghost"));
      const tail = [hint, ...(keyOk ? [h("p", {}, scopeBtn)] : [])];
      if (!known) return h("div", { class: "bigask" }, h("div", { class: "muted" }, "Что это было?"), chipsBox, panel, ...tail);
      chipsBox.hidden = true;
      const fix = qchip("Это не так, изменить категорию", () => { chipsBox.hidden = false; fix.hidden = true; }, "", "ghost");
      return h("div", { class: "bigask" }, h("div", { class: "muted" }, `Сайт определил категорию: «${knownCat}».`), h("p", {}, fix), chipsBox, panel, ...tail);
    }
    // Строка списка «Что заметно»: слева сумма, справа одна фраза, › ; подробности раскрываются на месте
    function wrow(sum, text, body) {
      const panel = h("div", { class: "wbody", hidden: "" }, body);
      const head = h("button", { type: "button", class: "whead", "aria-expanded": "false", onclick: () => { const open = panel.hidden; panel.hidden = !open; head.setAttribute("aria-expanded", String(open)); } },
        h("span", { class: "wsum" }, sum), h("span", { class: "wtxt" }, text), h("span", { class: "wgo", "aria-hidden": "true" }, "›"));
      return h("li", { class: "wrow" }, head, panel);
    }
    // Блок «Что заметно»: не больше 4 строк, без повторов «Итога месяца»
    function renderInsights({ rows, total }, label, ctx) {
      $("insightsTitle").textContent = label ? `Что заметно · ${label}` : "Что заметно";
      const ul = $("insights");
      ul.replaceChildren();
      if (!rows.length) { ul.append(h("li", { class: "wnone" }, "Расходов в выписке не найдено.")); return; }
      const items = [];                                       // {p: приоритет, el}
      const list = (ctx && ctx.list) || [];
      const shortDate = d => (/^\d{4}-(\d\d)-(\d\d)$/.test(d) ? d.slice(8, 10) + "." + d.slice(5, 7) : d);
      const fullDate = d => (/^\d{4}-(\d\d)-(\d\d)$/.test(d) ? shortDate(d) + "." + d.slice(0, 4) : d);
      const fd = d => d.slice(8, 10) + "." + d.slice(5, 7) + "." + d.slice(0, 4);
      const showBtn = tx => h("p", {}, qchip("Показать операцию", () => showTx(tx), "Открыть её в таблице «Все операции»", "ghost"));
      const spend = list.filter(t => t.amount < 0 && ![Cat.OWN, Cat.LOAN, Cat.SAVINGS].includes(categoryOf(t)));
      // Азартные игры: внесено (расходы) и выведено (поступления с этой категорией): итог за период
      if (ctx && ctx.list) {
        let put = 0, got = 0;
        list.forEach(t => { if (categoryOf(t) !== Cat.GAMBLING) return; if (t.amount < 0) put -= t.amount; else got += t.amount; });
        // Строку показываем, только когда потеря заметна: от 15% дохода за период (нет дохода: от 15% всех трат). Мелочь не выпячиваем
        const net0 = got - put, inc = list.filter(t => isIncome(t) && categoryOf(t) !== Cat.GAMBLING).reduce((a, t) => a + t.amount, 0);
        const base = inc > 0 ? inc : (ctx.stats && ctx.stats.total) || 0;
        const share = base > 0 ? -net0 / base : 0;
        if ((put > 0 || got > 0) && (!put || share >= 0.15)) {
          if (!put) items.push({ p: 1, el: wrow(`${fmt(got)} ${CUR}`, "Азартные игры: поступления за период", h("p", { class: "muted" }, `Расходов в этой категории нет, учтены только поступления, которые вы отметили сами. Внесено 0 ${CUR}.`)) });
          else {
            // Выводы сайт сам не угадывает: поступления без названия площадки могут быть чем угодно. Только нейтральная строка и кнопка
            const tail = got === 0 ? h("div", {}, h("p", { class: "muted" }, "Выводов в выписке не отмечено. Выписка не показывает, откуда пришли деньги: если вы выводили средства, отметьте эти поступления сами."),
              h("div", { class: "chips" }, qchip("Открыть поступления", () => openBottom("income"), "", "ghost"))) : null;
            items.push({ p: 1, el: wrow(`${net0 < 0 ? "−" : "+"}${fmt(Math.abs(net0))} ${CUR}`, "Азартные игры: итог за период", h("div", {}, h("p", { class: "muted" }, `Внесено ${fmt(put)} ${CUR}, выведено ${fmt(got)} ${CUR}. Это ${Math.round(share * 100)}% ${inc > 0 ? "дохода" : "всех трат"} за период.`), tail)) });
          }
        }
      }
      // Аномалии: только подозрения, проверьте сами
      if (ctx && ctx.list) {
        const an = Planner.findAnomalies(list.filter(t => !t.part).map(t => ({ date: t.date, amount: t.amount, cat: displayCat(t) || "Не разобрано", name: planName(t) })), PLAN_SKIP, ESSENTIAL_CATS);
        const findTx = d => list.find(t => !t.part && t.date === d.date && Math.abs(Math.abs(t.amount) - d.amount) < 0.005);
        if (an.double.length) items.push({ p: 2, el: wrow(`${an.double.length} ${an.double.length === 1 ? "случай" : "случая"}`, "Возможное двойное списание",
          h("div", {}, h("p", { class: "muted" }, `Одна и та же сумма под одним названием в один день (от 10 ${CUR}): ` + an.double.slice(0, 5).map(d => `${d.name}, ${fmt(d.amount)} ${CUR} × ${d.count} (${fd(d.date)})`).join("; ") + ". Это может быть и две настоящие покупки: проверьте по чекам."),
            findTx(an.double[0]) ? showBtn(findTx(an.double[0])) : null)) });
        if (an.big.length) {
          const tx0 = findTx(an.big[0]);
          items.push({ p: 4, el: wrow(`${fmt(an.big[0].amount)} ${CUR}`, `Необычно крупная трата · ${an.big[0].cat}`,
            h("div", {}, h("p", { class: "muted" }, "Проверьте в приложении банка. Минимум в 4 раза больше обычного в своей категории: " + an.big.slice(0, 5).map(d => `${d.name}, ${fmt(d.amount)} ${CUR} (${fd(d.date)}, обычно около ${fmt(d.usual)} ${CUR})`).join("; ") + "."),
              tx0 ? showBtn(tx0) : null)) });
        }
      }
      // Операции без категории: одна строка-счётчик, внутри получатели по убыванию суммы, ответ на месте
      const unclearTx = spend.filter(t => isUnclear(displayCat(t)));
      const unkSum = rows.filter(r => isUnclear(r[0])).reduce((a, r) => a + r[1], 0);
      if (unclearTx.length && unkSum > 0) {
        const gm = new Map();
        unclearTx.forEach(t => { const k = Cat.merchantKey(t); if (!gm.has(k)) gm.set(k, { name: softCase(friendlyTitle(t)), sum: 0, list: [] }); const g = gm.get(k); g.sum -= t.amount; g.list.push(t); });
        const groups = [...gm.values()].sort((a, b) => b.sum - a.sum);
        const nOps = unclearTx.length;
        const lines = groups.slice(0, 4).map(g => {
          const slot = h("div", { hidden: "" });
          const ask = qchip("Что это?", () => { if (slot.hidden) slot.replaceChildren(whatWasIt(g.list, "")); slot.hidden = !slot.hidden; }, "Выбрать, что это было", "ghost");
          return h("div", { class: "wgroup" }, h("div", { class: "wgline" }, h("span", { class: "wgname" }, g.name + (g.list.length > 1 ? ` × ${g.list.length}` : "")), h("span", { class: "wgsum" }, `${fmt(g.sum)} ${CUR}`), ask), slot);
        });
        items.push({ p: 3, el: wrow(`${fmt(unkSum)} ${CUR}`, `${nOps} ${plur(nOps, "операция ждёт", "операции ждут", "операций ждут")} ответа`,
          h("div", {}, h("p", { class: "muted" }, "Сначала самые крупные получатели. Ответ запомнится для получателя: в следующих выписках он уже не спросится."), ...lines,
            h("div", { class: "chips" }, qchip("Все в «Уточнить»", () => openCatOps("Не разобрано"), "Открыть «Уточнить»", "ghost")))) });
      }
      // Несколько крупных переводов людям: одной строкой
      const gmap = new Map();
      spend.filter(t => displayCat(t) === Cat.P2P && -t.amount >= 50).forEach(t => {
        const key = Math.round(-t.amount * 100); if (!gmap.has(key)) gmap.set(key, { amount: -t.amount, list: [] }); gmap.get(key).list.push(t);
      });
      const tg = [...gmap.values()].sort((a, b) => b.amount - a.amount).slice(0, 3);
      const tOps = tg.reduce((a, g) => a + g.list.length, 0);
      if (tOps >= 2) {
        const all = tg.flatMap(g => g.list);
        const amounts = tg.map(g => fmt(g.amount) + (g.list.length > 1 ? ` × ${g.list.length}` : ""));
        const sumTxt = (amounts.length > 1 ? amounts.slice(0, -1).join(", ") + " и " + amounts[amounts.length - 1] : amounts[0]) + ` ${CUR}`;
        items.push({ p: 5, el: wrow(sumTxt, `${tOps} крупных ${plur(tOps, "перевод", "перевода", "переводов")} людям`,
          h("div", {}, h("p", { class: "muted" }, all.map(t => `${fullDate(t.date || "без даты")}: ${fmt(-t.amount)} ${CUR}`).join("; ") + "."), whatWasIt(all, Cat.P2P), showBtn(all[0]))) });
      }
      const fees = rows.find(r => r[0] === Cat.FEES);
      if (fees) items.push({ p: 6, el: wrow(`${fmt(fees[1])} ${CUR}`, "Комиссии банка", h("p", { class: "muted" }, "Проверьте, какими платными опциями и услугами вы реально пользуетесь.")) });
      items.sort((a, b) => a.p - b.p).slice(0, 4).forEach(i => ul.append(i.el));
      if (!ul.children.length) ul.append(h("li", { class: "wnone" }, "Ничего необычного не нашлось."));
    }

