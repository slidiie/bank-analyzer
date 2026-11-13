    // ---------- Планирование: регулярные платежи, прогноз, накопления, бюджеты, «сколько остаётся» ----------
    const savePlan = () => { if (!demoMode) { saveJSON("ba_budget_v1", budgets); saveJSON("ba_calc_v1", calc); } };
    function planName(tx) {
      if (Cat.isErip(tx)) return "ЕРИП";
      const rc = Cat.recipient(tx);
      if (rc) return "Счёт …" + rc.last4 + (rc.op ? " · " + rc.op : "");
      const k = Cat.merchantKey(tx);
      return k.slice(k.indexOf("|") + 1).slice(0, 40) || "без названия";
    }
    const PLAN_SKIP = [Cat.OWN, Cat.LOAN, Cat.SAVINGS, Cat.GAMBLING, "Наличные"];
    const ESSENTIAL_CATS = ["Продукты", "Транспорт", "Аренда и жильё", "Связь и подписки"];   // крупная трата тут «крупная покупка», а не «необычная»
    const money = n => fmt(Math.round(n * 100) / 100);
    const num = v => { const x = parseFloat(String(v).replace(",", ".")); return Number.isFinite(x) && x >= 0 ? x : null; };
    let planOpen = [false, false, !Object.keys(budgets || {}).length];           // какие карточки раскрыты: накопления, регулярные, бюджет

    // Поле для числа: любое изменение пересчитывает весь блок, а курсор возвращается в то же поле
    function numInput(id, value, onValue, attrs) {
      const inp = h("input", Object.assign({ type: "text", inputmode: "decimal", autocomplete: "off", "data-id": id }, attrs || {}));
      inp.value = value == null ? "" : String(value);
      inp.addEventListener("input", () => { onValue(num(inp.value)); savePlan(); renderPlan(id); });
      return inp;
    }

    const PLAN_WINDOW = 6;                         // сколько последних полных месяцев берём для прогноза и средних
    // Общие данные для «Планирования» и «Подписок»: последние полные месяцы и регулярные платежи по ним
    function regularCtx() {
      const months = monthsInStatement();
      const fullAll = months.filter(ym => !coverageNote(ym));
      // Для прогноза, дохода и регулярных платежей берём последние полные месяцы: свежие данные точнее старых
      const full = fullAll.slice(-PLAN_WINDOW);
      const items = txs.map(t => ({ date: t.date, amount: t.amount, cat: displayCat(t) || "Не разобрано", name: planName(t) }));
      const winItems = items.filter(t => t.date && full.includes(t.date.slice(0, 7)));
      const regular = full.length >= 2 ? Planner.findRegular(winItems, full, PLAN_SKIP) : [];
      return { months, fullAll, full, items, regular };
    }

    const dmy = d => dShort(d);
    const todayIso = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

    // Экран «Подписки и регулярные»: сколько уходит в месяц, ближайшие списания, весь список
    // Регулярные платежи делятся на подписки (то, что можно отменить) и обязательные (жильё, коммуналка)
    const SUBS_CATS = ["Связь и подписки", "Развлечения", "Образование"];
    const MUST_CATS = ["Аренда и жильё", "Комиссии банка", "Здоровье"];
    // Без лимита в «Бюджете» только то, на что человек почти не влияет. «Здоровье» (аптека, врачи) часто гибкая трата: лимит можно поставить
    const NO_LIMIT_CATS = ["Аренда и жильё", "Комиссии банка"];
    function renderSubs() {
      const box = $("subs");
      if (!box) return;
      box.replaceChildren();
      const { months, full, items, regular } = regularCtx();
      if (months.length < 2) { box.append(h("p", { class: "muted" }, "Для этого нужны данные хотя бы за два месяца. Загрузите выписку за больший период.")); return; }
      if (full.length < 2) { box.append(h("p", { class: "muted" }, "Нужно минимум два полных месяца: сейчас таких " + full.length + ". Загрузите выписку за больший период.")); return; }
      if (!regular.length) { box.append(h("p", { class: "muted" }, "Одинаковых платежей не нашлось. Ищем платёж одной и той же суммы минимум в " + Math.max(2, Math.ceil(full.length * 0.6)) + " месяцах из " + full.length + ".")); return; }
      const dates = txs.map(t => t.date).filter(Boolean).sort();
      const dataEnd = [header.to, dates[dates.length - 1]].filter(Boolean).sort().pop();
      const today = demoMode ? dataEnd : todayIso();   // в примере «сегодня» = конец выписки, иначе ближайшие списания оказываются в прошлом
      const rows = regular.map(r => ({ r, s: Planner.schedule(r, items, dataEnd, PLAN_SKIP) })).filter(x => x.s);
      const sum = regular.reduce((a, r) => a + r.perMonth, 0);
      const spend = full.map(ym => statsFor(txs.filter(t => t.date && t.date.startsWith(ym))).total);
      const avg = spend.reduce((a, v) => a + v, 0) / spend.length;
      const share = avg > 0 ? Math.round(Math.min(100, sum / avg * 100)) : null;
      // ЕРИП и интернет-банк обычно коммуналка и связь (обязательные), а переводы на карты и счета нет: их в «Другие»
      const kindOf = r => SUBS_CATS.includes(r.cat) ? "subs" : (MUST_CATS.includes(r.cat) || (Cat.BUCKETS.includes(r.cat) && r.cat !== TR_BUCKET)) ? "must" : "other";
      const sumOf = k => regular.filter(r => kindOf(r) === k).reduce((a, r) => a + r.perMonth, 0);
      const subsSum = sumOf("subs"), mustSum = sumOf("must"), otherSum = sumOf("other");
      const nSubs = regular.filter(r => kindOf(r) === "subs").length;
      box.append(h("div", { class: "scard" },
        h("div", { class: "muted" }, "Связь, подписки и сервисы"),
        h("div", { class: "sbig" }, `≈ ${money(subsSum * 12)} ${CUR} в год`, h("span", { class: "syear" }, `${money(subsSum)} ${CUR} в месяц`)),
        h("div", { class: "muted" }, nSubs ? `Найдено: ${nSubs}. Проверьте, всем ли вы пользуетесь.` : "Подписок среди регулярных платежей не нашлось."),
        h("div", { class: "muted" }, `Обязательные (аренда, коммуналка, ЕРИП): ≈ ${money(mustSum * 12)} ${CUR} в год` + (otherSum ? ` · другие регулярные: ≈ ${money(otherSum * 12)} ${CUR}` : "") + (share != null ? ` · всего около ${share}% трат` : "")),
        h("details", { class: "rwraw" }, h("summary", {}, "Как посчитано ›"),
          h("p", { class: "muted" }, `Год посчитан так: платёж, как в последние ${full.length} ${plur(full.length, "полный месяц", "полных месяца", "полных месяцев")} (${monthRange(full[0], full[full.length - 1])}), умножено на 12. Сюда входят связь (пополнение телефона, интернет) и онлайн-сервисы. Платежи найдены по одинаковым суммам: проверьте список сами.`))));
      const when = d => {
        const n = Planner.daysBetween(today, d);
        return n < 0 ? `по выписке (она до ${dmy(dataEnd)})` : n === 0 ? "сегодня" : n === 1 ? "завтра" : demoMode ? `через ${n} дн. после конца выписки` : `через ${n} дн.`;
      };
      const upcoming = rows.filter(x => x.s.next && !x.s.skipped).sort((a, b) => a.s.next < b.s.next ? -1 : a.s.next > b.s.next ? 1 : b.r.amount - a.r.amount).slice(0, 5);
      box.append(h("h3", {}, "Ближайшие списания"));
      if (upcoming.length) {
        box.append(h("ul", { class: "slist" }, upcoming.map(x => h("li", {},
          h("span", { class: "sname" }, softCase(x.r.name)), h("span", { class: "swhen" }, `${dmy(x.s.next)} · ${when(x.s.next)}`), h("span", { class: "samount" }, `${money(x.r.amount)} ${CUR}`)))));
        box.append(h("p", { class: "muted" }, "Дата: последний платёж плюс обычный шаг между платежами. Если платёж не прошёл в срок, он ниже помечен."));
      } else box.append(h("p", { class: "muted" }, "Назвать ближайшие списания нельзя: у найденных платежей нет ровного срока или они не прошли в срок (ниже в списке)."));
      const stepName = s => s.kind === "month" ? "раз в месяц" : s.kind === "days" ? `каждые ${s.step} дн.` : "без чёткого срока";
      box.append(h("h3", {}, `Все регулярные платежи · ${rows.length}`));
      const liOf = x => h("li", {},
        h("span", { class: "sname" }, softCase(x.r.name), " ", catChip(x.r.cat)),
        h("span", { class: "swhen" }, `${stepName(x.s)} · последний ${dmy(x.s.last)}` + (x.r.prev ? ` · раньше ${money(x.r.prev)} ${CUR}` : "") + (x.s.skipped ? ` · ожидали ${dmy(x.s.next)}, не прошёл: возможно, отменён` : "")),
        h("span", { class: "samount" }, `${money(x.r.amount)} ${CUR}`, h("small", { class: "syr muted" }, `≈ ${money(x.r.perMonth * 12)} в год`)));
      const solid = rows.filter(x => x.s.kind === "month" || x.s.kind === "days"), loose = rows.filter(x => !(x.s.kind === "month" || x.s.kind === "days"));
      // Платёж без ровного срока не называем «обязательным» или «подпиской»: это скорее частая покупка на одну сумму
      [["subs", "Связь, подписки и сервисы"], ["must", "Обязательные"], ["other", "Другие регулярные"]].forEach(([k, title]) => {
        const part = solid.filter(x => kindOf(x.r) === k);
        if (part.length) box.append(h("h4", { class: "skind" }, `${title} · ${part.length}`), h("ul", { class: "slist" }, part.map(liOf)));
      });
      if (!solid.length && loose.length) box.append(h("h4", { class: "skind" }, `Без ровного срока · ${loose.length}`),
        h("p", { class: "muted" }, "Одна и та же сумма повторяется, но без ровного срока: скорее всего, это частые покупки или пополнения, а не подписки."),
        h("ul", { class: "slist" }, loose.map(liOf)));
      if (solid.length && loose.length) box.append(h("details", {}, h("summary", {}, `Без ровного срока: ${loose.length} (скорее всего, не подписки)`), h("ul", { class: "slist" }, loose.map(liOf))));
    }

    function renderPlan(focusId) {
      const box = $("plan");
      box.replaceChildren();
      const period = currentPeriod();
      const { months, fullAll, full, items, regular } = regularCtx();
      const listFor = ym => txs.filter(t => t.date && t.date.startsWith(ym));
      const totals = full.map(ym => statsFor(listFor(ym)).total);
      const fc = Planner.forecast(totals, regular);
      const useM = full.length ? full : months.slice(-PLAN_WINDOW);
      const n = Math.max(1, useM.length);
      const inUse = items.filter(t => t.date && useM.includes(t.date.slice(0, 7)));
      const incomeOf = list => list.filter(t => t.amount > 0 && t.cat === Cat.INCOME).reduce((a, t) => a + t.amount, 0);
      const avgIncome = incomeOf(inUse) / n;
      const monthIncome = period !== "all" && !coverageNote(period) ? incomeOf(items.filter(t => t.date && t.date.startsWith(period))) : null;
      const x = {
        period, full, regular, fc, n, useM,
        incomeDef: monthIncome != null ? monthIncome : avgIncome,
        incomeNote: monthIncome != null ? `доход за ${monthTitle(period)}` : `средний доход за месяц, по последним полным месяцам: ${n}`,
        regSum: regular.reduce((a, r) => a + r.perMonth, 0),
        rentNow: inUse.filter(t => t.amount < 0 && t.cat === "Аренда и жильё").reduce((a, t) => a - t.amount, 0) / n,
        avgSpend: inUse.filter(t => t.amount < 0 && !PLAN_SKIP.slice(0, 3).includes(t.cat)).reduce((a, t) => a - t.amount, 0) / n,
        factSaved: period === "all" ? statsFor(txs.filter(t => t.date && useM.includes(t.date.slice(0, 7)))).saved / n : statsFor(listFor(period)).saved,
        hasSavings: txs.some(t => displayCat(t) === Cat.SAVINGS),
      };
      x.income = calc.income != null ? calc.income : x.incomeDef;
      x.obligations = calc.obligations != null ? calc.obligations : x.regSum;
      x.other = calc.other != null ? calc.other : Math.max(0, (fc ? fc.avg : x.avgSpend) - x.regSum);
      x.mode = calc.saveMode === "byn" ? "byn" : "pct";
      x.plan = Planner.savingsPlan({ income: x.income, mode: x.mode, value: calc.saveVal });
      x.available = x.income - x.plan.amount;
      // Один список, как у Monarch: накопления, обязательные платежи и категории с лимитами в одной колонке, справа сводка с кольцом.
      // Строка = заголовок крупно, состояние справа и мелко; нажатие раскрывает правку на месте.
      const rowHead = (name, amt, note, fillPct) => h("summary", {},
        h("div", { class: "btop" }, h("span", { class: "bname" }, name), h("span", { class: "bamt" }, amt)),
        ...(fillPct != null ? [h("div", { class: "btrack" }, h("div", { class: "bfill", style: `width:${fillPct}%;background:var(--accent)` }))] : []),
        h("div", { class: "bnote muted" }, note));
      const regSum = x.regular.reduce((a, r) => a + r.perMonth, 0);
      const pctText = x.plan.pct != null ? `${String(Math.round(x.plan.pct * 10) / 10).replace(".", ",")}% от дохода ${money(x.income)} ${CUR}` : `из дохода ${money(x.income)} ${CUR}`;
      const factOk = x.plan.amount > 0 && x.hasSavings;
      const save = savingsBlock(x, rowHead("Откладывать в месяц",
        x.plan.amount > 0 ? `${money(x.plan.amount)} ${CUR}` : "не задано",
        x.plan.amount > 0 ? pctText + (factOk ? `. Отложено ${money(x.factSaved)}` : "") : "Нажмите, чтобы указать процент или сумму",
        x.plan.amount > 0 ? Math.min(100, Math.max(0, x.factSaved / x.plan.amount * 100)) : null));
      const calc2 = h("details", { class: "brow" }, h("summary", {}, h("div", { class: "btop" }, h("span", { class: "bname" }, "Сколько реально остаётся"), h("span", { class: "bamt" }, "прикинуть")),
        h("div", { class: "bnote muted" }, "Доход минус накопления, обязательные платежи и остальные траты")));
      calcBlock(x, calc2);
      const reg = regularBlock(x.regular, fc, months, full, fullAll.length, rowHead("Регулярные платежи",
        x.regular.length ? `${money(regSum)} ${CUR}` : "не найдены",
        x.regular.length ? `${x.regular.length} ${plur(x.regular.length, "платёж", "платежа", "платежей")} в месяц, список и прогноз по нажатию` : "Нужны платежи одной суммы минимум в двух месяцах"));
      [save, reg, calc2].forEach((d, i) => {
        if (planOpen[i]) d.setAttribute("open", "");
        d.addEventListener("toggle", () => { planOpen[i] = d.open; });
      });
      box.append(budgetBlock(x, { save, reg, calc: calc2 }));
      if (focusId) {
        const el = box.querySelector(`[data-id="${focusId}"]`);
        if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* не страшно */ } }
      }
    }

    function regularBlock(regular, fc, months, full, fullTotal, head) {
      const d = h("details", { class: "brow" }, head);
      if (months.length < 2) { d.append(h("p", { class: "muted" }, "Для этого нужны данные хотя бы за два месяца. Загрузите выписку за больший период.")); return d; }
      if (full.length >= 2) d.append(h("p", { class: "muted" }, `Считаем по последним ${full.length} полным месяцам (${monthRange(full[0], full[full.length - 1])})` + (fullTotal > full.length ? `, более ранние в расчёт не берутся.` : ".")));
      if (!regular.length) d.append(h("p", { class: "muted" }, `Одинаковых платежей не нашлось. Ищем платёж одной и той же суммы минимум в ${Math.max(2, Math.ceil(full.length * 0.6))} из ${full.length} месяцев; аренда и коммунальные платежи с меняющейся суммой так не находятся.`));
      else {
        const sum = regular.reduce((a, r) => a + r.perMonth, 0);
        d.append(h("p", {}, `Платежи одной и той же суммы почти в каждом месяце: около ${money(sum)} ${CUR} в месяц.`));
        d.append(h("table", {}, regular.slice(0, 12).map(r => h("tr", {},
          h("td", { class: "muted" }, r.count > r.months * 1.2 ? "чаще раза в месяц" : `~${r.day}-го`), h("td", {}, r.name), h("td", { class: "muted" }, r.cat), h("td", { class: "num" }, money(r.amount))))));
        if (regular.length > 12) d.append(h("p", { class: "muted" }, `…и ещё ${regular.length - 12}.`));
        d.append(h("p", { class: "muted" }, "Это совпадение сумм, а не подтверждённые подписки: проверьте список сами."));
        d.append(h("p", {}, h("button", { type: "button", onclick: () => showSection("subs") }, "Открыть «Регулярные»: ближайшие списания и весь список")));
      }
      if (fc) {
        const from = Planner.addMonths(full[full.length - 1], 1);
        const next = [0, 1, 2].map(i => monthLow(Planner.addMonths(from, i))).join(", ");
        d.append(h("p", {}, h("b", {}, `Прогноз (${next}): `),
          `около ${money(fc.avg)} ${CUR} в месяц. В прошлых полных месяцах было от ${money(fc.min)} до ${money(fc.max)}. Из них регулярные примерно ${money(fc.regularSum)}, остальное около ${money(fc.rest)}.`));
        d.append(h("p", { class: "muted" }, `Это ориентир по последним ${fc.n} полным месяцам, а не обещание: разовые крупные покупки он не предсказывает.`));
      } else d.append(h("p", { class: "muted" }, "Для прогноза нужно минимум два полных месяца."));
      return d;
    }

    function savingsBlock(x, head) {
      const d = h("details", { class: "brow" }, head);
      d.append(h("p", { class: "muted" }, `Доход для расчёта: ${money(x.income)} ${CUR} (${calc.income != null ? "введён вами ниже" : x.incomeNote}).`));
      // Два варианта: переключатель-плашки в стиле сайта, а не системный выпадающий список
      const modeBtn = (m, t) => h("button", { type: "button", class: "tab" + (x.mode === m ? " active" : ""), "aria-pressed": String(x.mode === m),
        onclick: () => { if (x.mode === m) return; calc.saveMode = m; savePlan(); renderPlan("saveVal"); } }, t);
      const sel = h("span", { class: "savemode", role: "group", "aria-label": "Как задать накопления" }, modeBtn("pct", "% от дохода"), modeBtn("byn", `${CUR} в месяц`));
      const val = numInput("saveVal", calc.saveVal, v => { if (v == null) delete calc.saveVal; else calc.saveVal = v; }, { placeholder: x.mode === "pct" ? "процент" : `${CUR} в месяц`, "aria-label": "Сколько откладывать" });
      d.append(h("div", { class: "prow" }, h("span", { class: "pname" }, "Откладывать"), val, sel));
      if (!(x.plan.amount > 0)) {
        d.append(h("p", { class: "muted" }, "Пока не задано. Введите процент или сумму, и сайт покажет, сколько останется на жизнь."));
        return d;
      }
      d.append(h("div", { class: "result" }, `План: ${money(x.plan.amount)} ${CUR} в месяц` + (x.plan.pct != null ? ` (${String(Math.round(x.plan.pct * 10) / 10).replace(".", ",")}% дохода)` : "")));
      d.append(h("div", { class: "result" }, `Доступно на траты: ${money(x.available)} ${CUR} в месяц`));
      const msgs = { "no-income": "Доход в выписке не найден: введите его вручную в блоке «Сколько реально остаётся», иначе расчёт неточный.", "over-income": "План накоплений больше дохода.", "no-room": "Накопления и обязательные платежи вместе превышают доход: на остальные траты ничего не остаётся." };
      Planner.savingsCheck({ income: x.income, savings: x.plan.amount, obligations: x.obligations }).forEach(c => d.append(h("p", { class: "lvl-over" }, msgs[c])));
      // План и факт: факт считается по переводам, которые вы отметили категорией «Накопления»
      const label = x.period === "all" ? "в среднем за полный месяц" : `за ${monthTitle(x.period)}`;
      const pct = Math.min(100, Math.max(0, x.factSaved / x.plan.amount * 100));
      const bar = h("div", { class: "bar", style: `width:${pct}%` });
      d.append(h("div", { class: "prow" }, h("span", { class: "pname" }, `Отложено фактически (${label})`), h("span", {}, `${money(x.factSaved)} ${CUR}`), h("div", { class: "pbar barwrap" }, bar)));
      if (!x.hasSavings) d.append(h("p", { class: "muted" }, "Факта пока нет: переводы на вклад или накопительный счёт нужно отметить категорией «Накопления» (вкладки «Нужно разобрать» и «Все операции»). Сайт сам их не угадывает: перевод на свой счёт может быть и не накоплением."));
      else d.append(h("p", { class: x.factSaved >= x.plan.amount ? "muted" : "lvl-warn" }, x.factSaved >= x.plan.amount ? "План накоплений выполнен." : `До плана не хватает ${money(x.plan.amount - x.factSaved)} ${CUR}.`));
      return d;
    }

    // «Лимиты на месяц»: сверху одна общая полоса, ниже строки категорий (как в YNAB, Monarch, Copilot): название, «потрачено из лимита», закруглённая полоса.
    // Нажатие на строку раскрывает правку: полоса-регулятор (без бегунка), поле и быстрые кнопки.
    const planOpenCats = new Set();
    function budgetBlock(x, extra) {
      const d = h("div", { class: "bmain" });
      const period = x.period;
      const inPeriod = period === "all" ? txs.filter(t => t.date && x.useM.includes(t.date.slice(0, 7))) : txs.filter(t => t.date && t.date.startsWith(period));
      const st = statsFor(inPeriod);
      const perMonthDiv = period === "all" ? Math.max(1, x.useM.length) : 1;
      const spentOf = new Map(st.rows.filter(r => !isUnclear(r[0])).map(r => [r[0], r[1] / perMonthDiv]));
      const cats = [...spentOf.keys()].filter(c => !NO_LIMIT_CATS.includes(c)).slice(0, 8);
      Object.keys(budgets).forEach(c => { if (!cats.includes(c)) cats.push(c); });
      const fixedCats = [...spentOf.keys()].filter(c => NO_LIMIT_CATS.includes(c) && !budgets[c]);
      const autoCats = cats.filter(c => !(budgets[c] > 0) && (spentOf.get(c) || 0) >= 10);
      const when = period === "all" ? "в среднем за полный месяц" : monthLow(period);
      const refresh = () => { savePlan(); renderPlan(); try { renderSummary(); } catch (e) { /* обзор обновится при следующей отрисовке */ } };
      const levelColor = (s, c) => s && s.level === "over" ? "var(--lvl-over)" : s && s.level === "warn" ? "var(--lvl-warn)" : catColor(c);
      // Общая полоса: траты по категориям с лимитом против суммы лимитов
      const limited = cats.filter(c => budgets[c] > 0);
      const limitSum = limited.reduce((a, c) => a + budgets[c], 0), spentLim = limited.reduce((a, c) => a + (spentOf.get(c) || 0), 0);
      // Правая колонка (на телефоне сверху): кольцо «Гибкие траты» и сводка месяца
      const left = limitSum - spentLim, pctRing = limitSum > 0 ? Math.min(100, spentLim / limitSum * 100) : 0;
      const R = 42, C = 2 * Math.PI * R;
      const ringEl = h("div", { class: "bring" });
      ringEl.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${R}" fill="none" stroke="var(--surface-2)" stroke-width="11"/>` +
        (limitSum > 0 && spentLim > 0 ? `<circle cx="50" cy="50" r="${R}" fill="none" stroke="${left < 0 ? "var(--lvl-over)" : "var(--accent)"}" stroke-width="11" stroke-linecap="round" stroke-dasharray="${(C * pctRing / 100).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"/>` : "") + `</svg>`;
      const stat = (k, v, cls) => h("div", { class: "bstat" }, h("div", { class: "bk" }, k), h("div", { class: "bv " + (cls || "") }, v));
      const hero = h("div", { class: "bhero" }, h("div", { class: "bcap" }, "Гибкие траты · " + when),
        h("div", { class: "bringrow" }, ringEl, h("div", { class: "bstats" },
          limitSum > 0
            ? [stat("Потрачено", `${money(spentLim)} ${CUR}`), stat(left >= 0 ? "Осталось" : "Превышено", `${money(Math.abs(left))} ${CUR}`, left < 0 ? "lvl-over" : "bgood")]
            : [stat("Лимитов", "пока нет"), h("div", { class: "muted bhint" }, "Лимит покажет, сколько ещё можно потратить на категорию.")])));
      if (limitSum > 0) hero.append(h("div", { class: "muted bhint" }, `Лимиты ${money(limitSum)} ${CUR}, из них ушло ${Math.round(pctRing)}%.`));
      if (autoCats.length) hero.append(h("div", { class: "bact" }, h("button", { type: "button", class: "primary", onclick: () => {
        autoCats.forEach(c => { budgets[c] = Math.ceil((spentOf.get(c) || 0) / 10) * 10; }); refresh();
      } }, `Поставить лимиты по среднему (${autoCats.length})`)));
      const sumRow = (k, v, cls) => h("div", { class: "bsumrow" }, h("span", { class: "muted" }, k), h("span", { class: cls || "" }, v));
      const regSumM = x.regular.reduce((a, r) => a + r.perMonth, 0);
      const month = h("div", { class: "bhero" }, h("div", { class: "bcap" }, "Месяц в числах"),
        sumRow("Доход", `${money(x.income)} ${CUR}`),
        sumRow("Откладываю", x.plan.amount > 0 ? `${money(x.plan.amount)} ${CUR}` : "не задано", x.plan.amount > 0 ? "" : "muted"),
        sumRow("Доступно на траты", `${money(x.available)} ${CUR}`, "bstrong"),
        ...(regSumM > 0 ? [sumRow("из них обязательные", `${money(regSumM)} ${CUR}`, "muted")] : []));
      if (x.plan.amount > 0 && limitSum > x.available) month.append(h("p", { class: "lvl-over bhint" }, `Лимиты больше доступного на ${money(limitSum - x.available)} ${CUR}.`));
      const side = h("aside", { class: "bside" }, hero, month);
      const group = (title, sub, ...kids) => h("section", { class: "bgroup" }, h("div", { class: "bgtitle" }, h("h3", {}, title), sub ? h("span", { class: "muted" }, sub) : ""), h("div", { class: "blist" }, ...kids));
      const staticRow = (name, amt, note) => h("div", { class: "brow" }, h("div", { class: "bsum" }, h("div", { class: "btop" }, h("span", { class: "bname" }, name), h("span", { class: "bamt" }, amt)), h("div", { class: "bnote muted" }, note)));
      d.append(group("Накопления", "сколько вы откладываете", extra.save));
      d.append(group("Обязательные платежи", "лимит не нужен", extra.reg, ...fixedCats.map(c => staticRow(c, `${money(spentOf.get(c) || 0)} ${CUR}`, "обязательные платежи, лимит не нужен"))));
      if (!cats.length) { d.append(h("section", { class: "bgroup" }, h("div", { class: "bgtitle" }, h("h3", {}, "Гибкие траты")), h("p", { class: "muted" }, "Пока нет разобранных категорий."))); d.append(group("Расчёт", "", extra.calc)); return h("div", { class: "bgrid" }, d, side); }
      const list = h("div", { class: "blist" });
      let over = 0, warn = 0;
      cats.forEach(c => {
        const spent = spentOf.get(c) || 0;
        const fill = h("div", { class: "bfill" }), amt = h("span", { class: "bamt" }), note = h("div", { class: "bnote muted" });
        const paint = () => {
          const s = Planner.budgetStatus(spent, budgets[c]);
          if (s && period === "all" && s.level === "warn") s.level = "ok";   // среднее против лимита по среднему: «близко» ничего не значит
          fill.style.width = (s ? Math.min(100, s.pct) : 0) + "%";
          fill.style.background = levelColor(s, c);
          amt.textContent = s ? `${money(spent)} из ${money(budgets[c])}` : `${money(spent)} ${CUR}`;
          note.className = "bnote " + (s && s.level !== "ok" ? "lvl-" + s.level : "muted");
          note.textContent = s ? (s.left >= 0 ? `Осталось ${money(s.left)} ${CUR}` : `Превышено на ${money(-s.left)} ${CUR}`) : "Лимита нет: нажмите, чтобы задать";
          return s;
        };
        const s0 = paint();
        if (s0 && s0.level === "over") over++; else if (s0 && s0.level === "warn") warn++;
        // Правка лимита
        const top0 = Math.max(spent * 2, (budgets[c] || 0) * 1.25, 50);
        const step = top0 > 2000 ? 100 : top0 > 500 ? 50 : 10;
        const slider = h("input", { type: "range", class: "lslider", min: "0", max: String(Math.ceil(top0 / step) * step), step: String(step), "aria-label": "Лимит на месяц: " + c });
        slider.value = budgets[c] > 0 ? budgets[c] : 0;
        const paintSlider = () => { slider.style.setProperty("--lc", catColor(c)); slider.style.setProperty("--fill", (Number(slider.max) > 0 ? Number(slider.value) / Number(slider.max) * 100 : 0) + "%"); };
        paintSlider();
        const input = numInput("lim:" + c, budgets[c] > 0 ? budgets[c] : "", v => { if (v && v > 0) budgets[c] = v; else delete budgets[c]; }, { placeholder: "лимит", "aria-label": "Лимит на месяц: " + c });
        const setLimit = v => {
          if (v > 0) budgets[c] = v; else delete budgets[c];
          refresh();
        };
        slider.addEventListener("input", () => {
          const v = Number(slider.value);
          if (v > 0) budgets[c] = v; else delete budgets[c];
          input.value = v > 0 ? String(v) : "";
          paint(); paintSlider(); savePlan();
        });
        slider.addEventListener("change", () => renderPlan());   // после отпускания обновляем итоги
        const chipVal = Math.ceil(spent / 10) * 10;
        const chips = h("span", { class: "limchips" },
          ...(chipVal >= 10 && budgets[c] !== chipVal ? [h("button", { type: "button", class: "chip", onclick: () => setLimit(chipVal) }, (period === "all" ? "по среднему: " : "как в этом месяце: ") + chipVal)] : []),
          ...(budgets[c] > 0 ? [h("button", { type: "button", class: "chip", "aria-label": "Убрать лимит: " + c, onclick: () => setLimit(0) }, "убрать")] : []));
        const row = h("details", { class: "brow" },
          h("summary", {}, h("div", { class: "btop" }, h("span", { class: "bname" }, catChip(c)), amt),
            h("div", { class: "btrack" }, fill), note),
          h("div", { class: "bedit" }, h("div", { class: "brow2" }, h("span", { class: "muted" }, "Лимит на месяц"), h("span", { class: "moneyfield" }, input, h("span", { class: "unit", "aria-hidden": "true" }, CUR))), slider, chips));
        if (planOpenCats.has(c)) row.setAttribute("open", "");
        row.addEventListener("toggle", () => { if (row.open) planOpenCats.add(c); else planOpenCats.delete(c); });
        list.append(row);
      });
      d.append(h("section", { class: "bgroup" }, h("div", { class: "bgtitle" }, h("h3", {}, "Гибкие траты"), h("span", { class: "muted" }, "лимиты по категориям")), list));
      d.append(group("Расчёт", "", extra.calc));
      const foot = [];
      foot.push(period === "all" ? "Сравниваем с вашим средним за полный месяц. Как вы укладываетесь в конкретном месяце, видно в «Обзоре»." : `Сравниваем с расходом за ${monthLow(period)}.`);
      if (period !== "all" && (over || warn)) foot.unshift(`Превышено лимитов: ${over}, близко к лимиту (от 80%): ${warn}.`);
      d.append(h("p", { class: "muted" }, foot.join(" ")));
      return h("div", { class: "bgrid" }, d, side);
    }

    function calcBlock(x, d) {
      d.append(h("h4", { class: "psub" }, "Сколько реально остаётся"));
      d.append(h("p", { class: "muted" }, "Числа подставлены из ваших данных. Измените любое, чтобы прикинуть свой случай. Введённое сохраняется только в этом браузере. Порядок расчёта: доход, минус накопления, минус обязательные платежи, минус остальные траты."));
      const defs = { income: x.incomeDef, obligations: x.regSum, other: Math.max(0, (x.fc ? x.fc.avg : x.avgSpend) - x.regSum) };
      const labels = { income: "Доход в месяц", obligations: "Обязательные платежи (аренда, связь, подписки)", other: "Остальные траты (еда, транспорт, мелочи)" };
      const rent = x.rentNow;
      for (const k of ["income"]) {
        d.append(h("div", { class: "prow" }, h("span", { class: "pname" }, labels[k]),
          numInput("calc:" + k, calc[k] != null ? calc[k] : Math.round(defs[k]), v => { if (v == null) delete calc[k]; else calc[k] = v; }, { "aria-label": labels[k] }), h("span", { class: "muted" }, calc[k] != null ? `${CUR}, введено вручную` : CUR)));
      }
      d.append(h("div", { class: "prow" }, h("span", { class: "pname" }, "Накопления (задаются в блоке выше)"), h("span", {}, money(x.plan.amount)), h("span", { class: "muted" }, CUR)));
      for (const k of ["obligations", "other"]) {
        d.append(h("div", { class: "prow" }, h("span", { class: "pname" }, labels[k]),
          numInput("calc:" + k, calc[k] != null ? calc[k] : Math.round(defs[k]), v => { if (v == null) delete calc[k]; else calc[k] = v; }, { "aria-label": labels[k] }), h("span", { class: "muted" }, calc[k] != null ? `${CUR}, введено вручную` : CUR)));
      }
      d.append(h("div", { class: "prow" }, h("span", { class: "pname" }, "А если жильё будет стоить…"),
        numInput("calc:rentNew", calc.rentNew != null ? calc.rentNew : "", v => { if (v == null) delete calc.rentNew; else calc.rentNew = v; }, { placeholder: "например, 600", "aria-label": "Новая стоимость жилья" }),
        h("span", { class: "muted" }, rent >= 50 ? `${CUR} (сейчас около ${money(rent)})` : CUR)));   // 18 BYN «за жильё» бывает, когда аренда идёт переводами: не подсказываем бессмыслицу
      const rentNew = calc.rentNew != null ? calc.rentNew : NaN;
      const r = Planner.leftover({ income: x.income, savings: x.plan.amount, obligations: x.obligations, other: x.other, rentNow: rent, rentNew });
      d.append(h("div", { class: "result" }, `В обычный месяц после накоплений и всех трат остаётся: ${r.base < 0 ? "−" : ""}${money(Math.abs(r.base))} ${CUR}`));
      if (r.scenario != null) d.append(h("div", { class: "result" }, `Если жильё будет стоить ${money(rentNew)} ${CUR}: ${r.scenario < 0 ? "−" : ""}${money(Math.abs(r.scenario))} ${CUR} в месяц (${r.delta >= 0 ? "+" : "−"}${money(Math.abs(r.delta))}).`));
      const CALC_KEYS = ["income", "obligations", "other", "rentNew"];
      if (CALC_KEYS.some(k => calc[k] != null)) {
        d.append(h("p", {}, h("button", { type: "button", onclick: () => { CALC_KEYS.forEach(k => delete calc[k]); savePlan(); renderPlan(); } }, "Сбросить мои числа")));
      }
      return d;
    }

    // Группируем неопознанные операции по «магазину», чтобы не разбирать каждую отдельно
    // Период, выбранный вкладкой наверху: месяц вида "2026-09" или "all"
    function currentPeriod() {
      return monthsInStatement().length > 1 && monthsInStatement().includes(activeTab) ? activeTab : "all";
    }
