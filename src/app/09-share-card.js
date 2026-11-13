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

    // Карточка вывода: одна крупная цифра, короткая подпись, подробности под «Подробнее»
    const icard = (big, label, more, extra) => h("li", {}, h("div", { class: "icard" },
      h("div", { class: "ibig" }, big), h("div", { class: "ilabel muted" }, label),
      ...(more ? [h("details", {}, h("summary", {}, "Подробнее"), h("p", { class: "muted" }, more))] : []),
      ...(extra ? [extra] : [])));
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
    // «Что это было?»: одно нажатие ставит категорию всем операциям карточки (или одной)
    function whatWasIt(list, knownCat) {
      const apply = cat => { cat = Cat.canonical(cat); ensureCategory(cat); appliedWithUndo(softCase(friendlyTitle(list[0])), cat, [], list.map(txId), () => { list.forEach(t => { txRules[txId(t)] = cat; }); saveJSON("ba_txrules_v1", txRules); }); };
      const panel = h("div", { class: "morechoose", hidden: "" });
      const show = (...kids) => { panel.replaceChildren(...kids); panel.hidden = false; };
      const n = list.length;
      // Категория уже определена сайтом: не спрашиваем «что это было?» заново, а предлагаем поправить, если сайт ошибся
      const known = knownCat && !isUnclear(knownCat) && knownCat !== "не разобрано" && knownCat !== "Не разобрано";
      const chipsBox = h("div", { class: "chips" },
          qchip("Аренда", () => apply("Аренда и жильё")),
          qchip("Перевод человеку", () => apply(Cat.P2P)),
          qchip("Мои деньги (между своими счетами)", () => apply(Cat.OWN), "Не считается тратой"),
          qchip("Магазин или услуга", () => show(h("div", { class: "chips" }, ["Продукты", "Кафе и рестораны", "Транспорт", "Покупки"].filter(c => allCategories().includes(c)).map(c => qchip(c, () => apply(c)))))),
          qchip("Другое…", () => show(chooser("Применить", cat => apply(cat), { noQuick: true })), "Выбрать из полного списка", "ghost"));
      if (!known) return h("div", { class: "bigask" }, h("div", { class: "muted" }, n > 1 ? `Что это было? Выбор применится ко всем ${n}.` : "Что это было?"), chipsBox, panel);
      chipsBox.hidden = true;
      const fix = qchip("Это не так, изменить категорию", () => { chipsBox.hidden = false; fix.hidden = true; }, "", "ghost");
      return h("div", { class: "bigask" }, h("div", { class: "muted" }, `Сайт определил категорию: «${knownCat}».` + (n > 1 ? ` Если это не так, выбор применится ко всем ${n}.` : "")), h("p", {}, fix), chipsBox, panel);
    }
    function renderInsights({ rows, total }, label, ctx) {
      $("insightsTitle").textContent = label ? `Подробнее о тратах · ${label}` : "Подробнее о тратах";
      const ul = $("insights");
      ul.replaceChildren();
      if (!rows.length) { ul.append(h("li", {}, "Расходов в выписке не найдено.")); return; }
      const known = rows.filter(r => !isUnclear(r[0]));
      if (known.length) {
        ul.append(icard(`${fmt(known[0][1])} ${CUR}`, `Больше всего ушло на категорию «${known[0][0]}» · ${Math.round(known[0][1] / total * 100)}% всех трат`));
      }
      const fees = rows.find(r => r[0] === Cat.FEES);
      if (fees) ul.append(icard(`${fmt(fees[1])} ${CUR}`, "Комиссии банка", "Проверьте, какими платными опциями и услугами вы реально пользуетесь."));
      let bigShown = null;                                    // группа, для которой уже есть карточка «Самая крупная трата» («необычно крупную» второй раз не показываем)
      if (ctx) {
        // Месяц к среднему: сравниваем только с полными месяцами, неполные искажают картину
        const full = (ctx.months || []).map((ym, i) => ({ ym, st: ctx.per[i], n: txs.filter(t => t.date && t.date.startsWith(ym)).length })).filter(m => !coverageNote(m.ym) && m.n >= 5);
        if (ctx.current != null && !coverageNote(ctx.months[ctx.current])) {
          const others = full.filter(m => m.ym !== ctx.months[ctx.current]);
          if (others.length) {
            const avg = others.reduce((a, m) => a + m.st.total, 0) / others.length;
            if (avg > 0) {
              const diff = Math.round((total - avg) / avg * 100);
              ul.append(icard(Math.abs(diff) < 3 ? "Как обычно" : `${diff > 0 ? "+" : "−"}${Math.abs(diff)}%`, `Расходы за месяц: ${fmt(total)} ${CUR}`,
                Math.abs(diff) < 3
                  ? `Это почти как обычно: в среднем за другие полные месяцы ${fmt(avg)} ${CUR}.`
                  : `Это на ${Math.abs(diff)}% ${diff > 0 ? "больше" : "меньше"}, чем в среднем за другие полные месяцы (${fmt(avg)} ${CUR}).`));
              // Какая категория изменилась сильнее всего относительно своего среднего
              const avgBy = new Map();
              others.forEach(m => m.st.rows.forEach(([c, v]) => avgBy.set(c, (avgBy.get(c) || 0) + v / others.length)));
              let best = null;
              rows.forEach(([c, v]) => { const d = v - (avgBy.get(c) || 0); if (!isUnclear(c) && (!best || Math.abs(d) > Math.abs(best.d))) best = { c, d }; });
              avgBy.forEach((a, c) => { if (!rows.find(r => r[0] === c) && !isUnclear(c) && (!best || a > Math.abs(best.d))) best = { c, d: -a }; });
              if (best && Math.abs(best.d) >= 20) ul.append(icard(`${best.d > 0 ? "+" : "−"}${fmt(Math.abs(best.d))} ${CUR}`, `Сильнее всего изменилась «${best.c}»`, "Разница к её обычному месяцу."));
            }
          }
        } else if (ctx.current == null && full.length > 1) {
          const hi = full.reduce((a, m) => (m.st.total > a.st.total ? m : a)), nz = full.filter(m => m.st.total >= 1), lo = nz.length > 1 ? nz.reduce((a, m) => (m.st.total < a.st.total ? m : a)) : null;
          // Месяц без трат (карта лежала без дела) «скромным» не называем
          ul.append(icard(monthTitle(hi.ym), `Самый затратный полный месяц · ${fmt(hi.st.total)} ${CUR}`, lo && lo !== hi ? `Самый скромный: ${monthTitle(lo.ym)} (${fmt(lo.st.total)} ${CUR}).` : ""));
        }
        // К прошлому месяцу: только если оба месяца полные и идут подряд
        if (ctx.current != null && ctx.current > 0) {
          const cur = ctx.months[ctx.current], prev = ctx.months[ctx.current - 1];
          const okM = ym => !coverageNote(ym) && txs.filter(t => t.date && t.date.startsWith(ym)).length >= 5;
          if (Planner.addMonths(prev, 1) === cur && okM(cur) && okM(prev)) {
            const c = Planner.compareMonths(ctx.per[ctx.current].rows, ctx.per[ctx.current - 1].rows, []);
            if (c.pct != null) {
              const sign = v => (v > 0 ? "+" : "−") + fmt(Math.abs(v)) + ` ${CUR}`;
              ul.append(icard(Math.abs(c.pct) < 3 ? "Как в прошлом месяце" : `${c.pct > 0 ? "+" : "−"}${Math.round(Math.abs(c.pct))}%`, `К прошлому месяцу (${monthTitle(prev)}): ${fmt(c.prevTotal)} → ${fmt(c.curTotal)} ${CUR}`,
                c.top.length ? "Больше всего изменилось: " + c.top.map(x => `«${x.cat}» ${sign(x.diff)}`).join("; ") + "." : "Заметных изменений по категориям нет."));
            }
          }
        }
        // Самые крупные траты (без переводов между своими и долгов). Одинаковые платежи (та же сумма и категория) объединяем в одну строку.
        const groups = new Map();
        (ctx.list || []).filter(t => t.amount < 0 && ![Cat.OWN, Cat.LOAN, Cat.SAVINGS].includes(categoryOf(t))).forEach(t => {
          const key = Math.round(-t.amount * 100) + "|" + (displayCat(t) || "");
          if (!groups.has(key)) groups.set(key, { amount: -t.amount, cat: displayCat(t) || "не разобрано", dates: [], list: [] });
          groups.get(key).dates.push(t.date || "без даты");
          groups.get(key).list.push(t);
        });
        const big = [...groups.values()].sort((a, b) => b.amount - a.amount).slice(0, 3);
        const shortDate = d => (/^\d{4}-(\d\d)-(\d\d)$/.test(d) ? d.slice(8, 10) + "." + d.slice(5, 7) : d);
        const fullDate = d => (/^\d{4}-(\d\d)-(\d\d)$/.test(d) ? shortDate(d) + "." + d.slice(0, 4) : d);
        if (big.length && big[0].amount >= 50) {
          bigShown = big[0];
          const anAll = ctx.list && Planner.findAnomalies(ctx.list.filter(t => !t.part).map(t => ({ date: t.date, amount: t.amount, cat: displayCat(t) || "Не разобрано", name: planName(t) })), PLAN_SKIP, ESSENTIAL_CATS);
          const anSame = anAll && anAll.big.find(d => Math.abs(d.amount - big[0].amount) < 0.005 && big[0].dates.includes(d.date));
          const usualCat = anAll && anAll.usual[big[0].cat];
          // «Необычно» только для необязательных категорий; для продуктов, транспорта, жилья и связи просто «крупная покупка»
          const unusual = anSame ? ` Необычно много для этой категории: обычно около ${fmt(anSame.usual)} ${CUR}.`
            : (usualCat && big[0].amount >= 2 * usualCat ? ` Крупная покупка · обычно ~${fmt(usualCat)} ${CUR}.` : "");
          const catKnown = big[0].cat && !isUnclear(big[0].cat) && big[0].cat !== "не разобрано" && big[0].cat !== "Не разобрано";
          const card = icard(`${fmt(big[0].amount)} ${CUR}`, big[0].dates.length > 1 ? `Самая крупная трата, была ${big[0].dates.length} ${[2, 3, 4].includes(big[0].dates.length % 10) && ![12, 13, 14].includes(big[0].dates.length % 100) ? "раза" : "раз"} · ${big[0].cat}` : `Самая крупная трата · ${fullDate(big[0].dates[0])}, ${big[0].cat}`,
            "Самые крупные траты: " + big.map(g => g.dates.length > 1
              ? `${fmt(g.amount)} ${CUR} × ${g.dates.length} (${g.cat}; ${g.dates.sort().map(shortDate).join(", ")})`
              : `${fmt(g.amount)} ${CUR} (${fullDate(g.dates[0])}, ${g.cat})`).join("; ") + "." + unusual,
            h("div", {}, ...(catKnown ? [] : [whatWasIt(big[0].list, big[0].cat)]), h("p", {}, qchip("Показать операцию", () => showTx(big[0].list[0]), "Открыть её в таблице «Все операции»", "ghost"))));
          ul.append(card);
        }
      }
      // Аномалии: только подозрения, проверьте сами
      if (ctx && ctx.list) {
        const an = Planner.findAnomalies(ctx.list.filter(t => !t.part).map(t => ({ date: t.date, amount: t.amount, cat: displayCat(t) || "Не разобрано", name: planName(t) })), PLAN_SKIP, ESSENTIAL_CATS);
        const fd = d => d.slice(8, 10) + "." + d.slice(5, 7) + "." + d.slice(0, 4);
        const findTx = d => ctx.list.find(t => !t.part && t.date === d.date && Math.abs(Math.abs(t.amount) - d.amount) < 0.005);
        if (an.double.length) ul.append(icard(`${an.double.length} ${an.double.length === 1 ? "случай" : "случая"}`, "Возможное двойное списание",
          `Одна и та же сумма под одним названием в один день (от 10 ${CUR}): ` + an.double.slice(0, 5).map(d => `${d.name}, ${fmt(d.amount)} ${CUR} × ${d.count} (${fd(d.date)})`).join("; ") + ". Это может быть и две настоящие покупки: проверьте по чекам.",
          findTx(an.double[0]) ? h("p", {}, qchip("Показать операцию", () => showTx(findTx(an.double[0])), "Открыть её в таблице «Все операции»", "ghost")) : null));
        // Если самая крупная трата уже показана карточкой выше, второй раз её не повторяем
        const anBig = an.big.filter(d => !(bigShown && Math.abs(d.amount - bigShown.amount) < 0.005 && bigShown.dates.includes(d.date)));
        if (anBig.length) {
          const tx0 = findTx(anBig[0]);
          ul.append(icard(`${fmt(anBig[0].amount)} ${CUR}`, `Необычно крупная трата · ${anBig[0].cat}`,
            "Проверьте в приложении банка. Минимум в 4 раза больше обычного в своей категории: " + anBig.slice(0, 5).map(d => `${d.name}, ${fmt(d.amount)} ${CUR} (${fd(d.date)}, обычно около ${fmt(d.usual)} ${CUR})`).join("; ") + ".",
            tx0 ? h("div", {}, ...(isUnclear(anBig[0].cat) ? [whatWasIt([tx0], anBig[0].cat)] : []), h("p", {}, qchip("Показать операцию", () => showTx(tx0), "Открыть её в таблице «Все операции»", "ghost"))) : null));
        }
      }
      // Азартные игры: внесено (расходы) и выведено (поступления с этой категорией): итог за период
      if (ctx && ctx.list) {
        let put = 0, got = 0;
        ctx.list.forEach(t => { if (categoryOf(t) !== Cat.GAMBLING) return; if (t.amount < 0) put -= t.amount; else got += t.amount; });
        if (put > 0 || got > 0) {
          const net = got - put;
          if (!put) ul.append(icard(`${fmt(got)} ${CUR}`, "Азартные игры: поступления за период", `Расходов в этой категории нет, учтены только поступления, которые вы отметили сами. Внесено 0 ${CUR}.`));
          else {
            // Выводы сайт сам не угадывает: поступления без названия площадки могут быть чем угодно. Только нейтральная строка и кнопка
            const tail = got === 0 ? h("div", {}, h("p", {}, "Выводов в выписке не отмечено. Выписка не показывает, откуда пришли деньги: если вы выводили средства, отметьте эти поступления сами."),
              h("div", { class: "chips" }, qchip("Открыть поступления", () => openBottom("income"), "", "ghost"))) : null;
            ul.append(icard(`${net < 0 ? "−" : "+"}${fmt(Math.abs(net))} ${CUR}`, "Азартные игры: итог за период", `Внесено ${fmt(put)} ${CUR}, выведено ${fmt(got)} ${CUR}.`, tail));
          }
        }
      }
      const unkSum = rows.filter(r => isUnclear(r[0])).reduce((a, r) => a + r[1], 0);
      if (unkSum > 0) ul.append(icard(`${fmt(unkSum)} ${CUR}`, `Не разобрано · ${Math.round(unkSum / total * 100)}% трат`, "По выписке видно только способ оплаты. Подпишите самых крупных получателей в разделе «Уточнить», и картина станет точнее.",
        h("p", {}, qchip("Уточнить", () => openCatOps("Не разобрано"), "Открыть «Уточнить»", "ghost"))));
    }

