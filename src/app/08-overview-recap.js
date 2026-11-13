    // ---- Обзор: главная мысль сверху, динамика и топ получателей снизу ----
    const spendList = list => list.filter(t => (t.amount < 0 && ![Cat.OWN, Cat.LOAN, Cat.SAVINGS].includes(displayCat(t))) || isRefund(t));
    const MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
    const shortDate = iso => `${parseInt(iso.slice(8, 10), 10)} ${MON[parseInt(iso.slice(5, 7), 10) - 1]}`;
    function periodDays(list) {
      const d = list.map(t => t.date).filter(Boolean).sort();
      if (!d.length) return 0;
      // Крайние месяцы, покрытые выпиской целиком, считаем по календарю (1-е число, последний день месяца), а не от первой до последней операции
      let a = d[0], b = d[d.length - 1];
      // Неполный крайний месяц: от начала (до конца) самой выписки, а не от первой до последней операции, как и в «Итоге»:
      // иначе «в день» в двух блоках одного экрана расходится
      if (!coverageNote(a.slice(0, 7))) a = a.slice(0, 7) + "-01";
      else if (header.from && header.from <= a && header.from.slice(0, 7) === a.slice(0, 7)) a = header.from;
      if (!coverageNote(b.slice(0, 7))) b = b.slice(0, 7) + "-" + String(new Date(+b.slice(0, 4), +b.slice(5, 7), 0).getDate()).padStart(2, "0");
      else if (header.to && header.to >= b && header.to.slice(0, 7) === b.slice(0, 7)) b = header.to;
      let n = Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;
      // Месяцы внутри периода, за которые нет ни одной операции (например, между выписками двух лет), в «в день» не входят
      for (const ym of emptyMonths(list)) n -= new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
      return Math.max(n, 1);
    }
    // Месяцы между первой и последней операцией, за которые операций нет
    function emptyMonths(list) {
      const have = new Set(list.map(t => (t.date || "").slice(0, 7)).filter(Boolean)), ms = [...have].sort(), out = [];
      if (ms.length < 2) return out;
      let y = +ms[0].slice(0, 4), m = +ms[0].slice(5, 7);
      const last = ms[ms.length - 1];
      for (;;) {
        m++; if (m > 12) { m = 1; y++; }
        const ym = y + "-" + String(m).padStart(2, "0");
        if (ym >= last) break;
        if (!have.has(ym)) out.push(ym);
      }
      return out;
    }
    let lastHeadline = "", lastTrend = "", ovMoreOpen = false;
    // История между выписками (только в этом браузере): итоги по месяцам, без описаний операций
    let historyStore = loadJSON("ba_history_v1", {});
    function statementSummary() {
      const dates = txs.map(t => t.date).filter(Boolean).sort();
      if (!dates.length) return {};
      const sum = History.summarize(spendList(txs).map(t => ({ date: t.date, amount: t.amount, cat: displayCat(t) || "Прочее", refund: t.amount > 0 })), { from: header.from || dates[0], to: header.to || dates[dates.length - 1], dates });
      Object.keys(sum).forEach(ym => {
        const m = sum[ym], full = m.first === 1 && m.last === new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
        if (full && coverageNote(ym)) delete sum[ym];   // месяц покрыт выписками не целиком: полным его не считаем
      });
      return sum;
    }
    function saveHistory() {
      if (demoMode || !txs.length || CUR !== "BYN" || curUnits.length > 1) return;   // история между визитами ведётся в рублях: валютные суммы в неё не пишем
      try { historyStore = History.merge(historyStore, statementSummary()); saveJSON("ba_history_v1", historyStore); } catch (e) { /* история необязательна */ }
    }
    function historyFact(ctx) {
      if (demoMode || CUR !== "BYN" || curUnits.length > 1) return null;
      const months = ctx.months || monthsInStatement(), ym = ctx.current === undefined ? months[months.length - 1] : months[ctx.current];
      if (!ym || months.includes(History.addMonths(ym, -1))) return null;   // прошлый месяц и так в этой выписке
      const cur = statementSummary()[ym], prev = historyStore[History.addMonths(ym, -1)], c = History.compare(ym, cur, prev);
      if (!c) return null;
      const name = monthTitle(c.prevYm), d = Math.abs(c.pct);
      const body = d < 1 ? "почти как" : `на ${d}% ${c.pct > 0 ? "больше" : "меньше"}, чем`;
      return c.full ? `${monthTitle(ym)}: ${body} в предыдущем месяце (${name}), по истории на этом устройстве`
        : `С ${c.a} по ${c.b} число: ${body} за те же числа в предыдущем месяце (${name}), по истории на этом устройстве`;
    }
    // «Обычно за месяц» по категории: одно правило для «Обзора» и «Бюджета» (середина по полным месяцам, округлено до 10)
    function usualMonthly(cat, exceptYm) {
      const store = demoMode ? statementSummary() : Object.assign({}, historyStore, statementSummary());
      const ms = monthsInStatement();
      return Goals.usual(store, cat, exceptYm === undefined ? ms[ms.length - 1] : exceptYm, y => new Date(+y.slice(0, 4), +y.slice(5, 7), 0).getDate());
    }
    // Цели и бюджеты: «осталось X на категорию до конца месяца» по лимитам из «Планирования»
    function goalsBlock(ctx) {
      const months = ctx.months && ctx.months.length ? ctx.months : monthsInStatement();
      const ym = ctx.current === undefined ? months[months.length - 1] : months[ctx.current];
      if (!ym) return null;
      const dim = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
      const dates = txs.map(t => t.date).filter(Boolean).sort();
      const dataEnd = [header.to, dates[dates.length - 1]].filter(Boolean).sort().pop() || ym + "-" + String(dim).padStart(2, "0");
      const day = dataEnd.slice(0, 7) < ym ? 0 : dataEnd.slice(0, 7) > ym ? dim : +dataEnd.slice(8);
      if (!day) return null;
      // Сегодняшняя дата нужна, чтобы прошедший месяц не считался идущим: выписка могла оборваться посреди него
      const nowYm = todayIso().slice(0, 7);
      const closed = ym < nowYm;
      const prevYm = (() => { const d = new Date(+nowYm.slice(0, 4), +nowYm.slice(5, 7) - 2, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); })();
      const st = statsFor(txs.filter(t => t.date && t.date.startsWith(ym)));
      const spentBy = {};
      st.rows.forEach(([c, v]) => { spentBy[c] = v; });
      const list = Goals.rows({ budgets, spentBy, day, dim, closed });
      const box = h("div", { class: "goals ocard" });
      const partial = coverageNote(ym), startsLate = partial && !/ с 1 по /.test(partial);   // «с 1 по N» это просто конец выписки: он и так виден в подписи
      if (!list.length) {
        // Лимитов нет: подсказываем по истории, где обычно уходит больше всего
        const tips = st.rows.filter(r => !isUnclear(r[0])).slice(0, 5).map(([c]) => [c, usualMonthly(c, ym)]).filter(x => x[1]).slice(0, 3);
        if (!tips.length) return null;
        box.append(h("h3", {}, "Цели и бюджеты"),
          h("p", { class: "muted" }, "Лимитов на месяц пока нет. Задайте их в разделе «Бюджет», и здесь появится, сколько осталось до конца месяца. Обычно за полный месяц у вас уходит:"),
          h("ul", {}, tips.map(([c, v]) => h("li", {}, `${c}: около ${Recap.money(v)} ${CUR}`))));
        return box;
      }
      if (ym < prevYm) {
        // Лимиты из «Планирования» заданы на текущий месяц: к давним периодам их не применяем
        box.append(h("p", { class: "muted gnote" }, `Лимиты из «Бюджета» действуют на текущий месяц, поэтому за ${monthTitle(ym).toLowerCase()} мы их не сравниваем.`));
        return box;
      }
      const t = Goals.totals(list);
      const finished = day >= dim || closed;
      box.append(h("h3", {}, "Цели и бюджеты · " + monthTitle(ym)),
        h("div", { class: "muted" }, finished
          ? `Месяц прошёл. Лимиты: ${fmt(t.limit)} ${CUR}, потрачено ${fmt(t.spent)} ${CUR}`
          : `По выписке до ${dmy(dataEnd)} (${day} из ${dim} дн.). Лимиты: ${fmt(t.limit)} ${CUR}, потрачено ${fmt(t.spent)} ${CUR}`));
      list.forEach(r => {
        const left = r.left >= 0 ? `осталось ${fmt(r.left)}` : `перебор ${fmt(-r.left)}`;
        let note;
        if (r.level === "over") note = r.finished ? `Месяц прошёл, лимит превышен на ${fmt(-r.left)} ${CUR}.` : `Лимит уже превышен на ${fmt(-r.left)} ${CUR}, до конца месяца осталось дней: ${r.daysLeft}.`;
        else if (r.finished) note = "Уложились в лимит.";
        else {
          note = `Можно тратить около ${fmt(r.perDay)} ${CUR} в день, осталось дней: ${r.daysLeft}`;
          if (r.level === "risk") note += `. При таком темпе выйдет около ${fmt(r.projected)} ${CUR}: больше лимита`;
          else if (r.projected !== null) note += `. При таком темпе выйдет около ${fmt(r.projected)} ${CUR}`;
        }
        box.append(h("div", { class: "grow" },
          h("div", { class: "gtop" }, h("span", { class: "gname" }, r.cat), h("span", { class: "gleft lvl-" + r.level }, `${left} из ${fmt(r.limit)} ${CUR}`)),
          h("div", { class: "gtrack" }, h("i", { class: "lvl-" + r.level, style: `width:${Math.min(100, r.pct).toFixed(1)}%` })),
          h("div", { class: "gnote " + (r.level === "ok" ? "muted" : "lvl-" + r.level) }, note)));
      });
      if (closed && dataEnd < ym + "-" + String(dim).padStart(2, "0")) box.append(h("p", { class: "muted gnote" }, "Выписка заканчивается " + dmy(dataEnd) + ", траты за остаток месяца в неё не попали."));
      if (startsLate) box.append(h("p", { class: "muted gnote" }, "Выписка охватывает месяц не с начала (" + partial.replace("неполный месяц: ", "") + "), траты могут быть занижены."));
      box.append(h("p", { class: "muted gnote" }, finished ? "Лимиты меняются в разделе «Бюджет»." : "Темп считается по тратам с начала месяца и не знает о будущих разовых платежах. Лимиты меняются в разделе «Бюджет»."));
      const sm = Goals.summary(list, finished);
      const word = sm.level === "over" ? `превышено ${sm.over} из ${sm.n}` : sm.level === "warn" ? `${sm.near} из ${sm.n} близко к лимиту` : sm.n === 1 ? "в норме" : `все ${sm.n} в норме`;
      box._sum = { level: sm.level, text: `Лимиты · ${monthTitle(ym).toLowerCase()}: ${word}` };
      return box;
    }
    function countUp(el, to) {
      const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (calm || typeof requestAnimationFrame !== "function" || typeof performance === "undefined") { el.textContent = fmt(to); return; }
      const t0 = performance.now(), dur = 600;
      const step = now => {
        const k = Math.min(1, (now - t0) / dur);
        el.textContent = fmt(k < 1 ? to * (1 - Math.pow(1 - k, 3)) : to);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    // Главная мысль: крупная сумма и 3–5 коротких фактов (без советов, только то, что видно в выписке)
    function headlineCard(ctx) {
      const st = ctx.stats;
      if (!st || !st.total) return null;
      const all = ctx.list || txs, days = periodDays(all), months = ctx.months || [], facts = [];
      const cmp = (iNow, iPrev, subject) => {
        const a = ctx.per[iNow].total, b = ctx.per[iPrev].total;
        if (!b) return null;
        // Год в скобках не повторяем, если он тот же, что у месяца впереди
        const d = Math.round((a - b) / b * 100), name = months[iPrev].slice(0, 4) === months[iNow].slice(0, 4) ? monthTitle(months[iPrev]).replace(/ \d{4}$/, "") : monthTitle(months[iPrev]);
        const body = Math.abs(d) < 1 ? `почти как в предыдущем месяце (${name.toLowerCase()})` : `на ${Math.abs(d)}% ${d > 0 ? "больше" : "меньше"}, чем в предыдущем месяце (${name.toLowerCase()})`;
        return subject ? subject + body : body.charAt(0).toUpperCase() + body.slice(1);
      };
      try { const hf = historyFact(ctx); if (hf) facts.push(hf); } catch (e) { /* без сравнения с историей */ }
      { const gap = emptyMonths(all); if (gap.length) facts.push(`В выписках нет данных за ${gap.length} ${plur(gap.length, "месяц", "месяца", "месяцев")} внутри периода: в «в день» они не учтены`); }
      if (days >= 2) facts.push(`В среднем ${fmt(st.total / days)} ${CUR} в день`);
      const fullIdx = months.map((m, i) => i).filter(i => !coverageNote(months[i]));
      if (ctx.current === undefined && fullIdx.length >= 2) {
        facts.push(`В среднем ${fmt(fullIdx.reduce((a, i) => a + ctx.per[i].total, 0) / fullIdx.length)} ${CUR} в полный месяц` + (statements.length > 1 ? ` (по ${fullIdx.length} ${plur(fullIdx.length, "месяцу", "месяцам", "месяцам")}; добавили карту или банк, и среднее меняется)` : ""));
        const [p, c] = fullIdx.slice(-2);
        if (c - p === 1) { const t = cmp(c, p, `${monthTitle(months[c])}: `); if (t) facts.push(t); }
      } else if (ctx.current > 0 && !coverageNote(months[ctx.current]) && !coverageNote(months[ctx.current - 1])) {
        const t = cmp(ctx.current, ctx.current - 1, ""); if (t) facts.push(t);
      }
      const top = st.rows.find(([c]) => !REVIEW_CATS.has(c));
      if (top) facts.push(`Больше всего: ${top[0]}, ${Math.round(top[1] / st.total * 100)}%`);
      const biggest = spendList(all).reduce((m, t) => (!m || t.amount < m.amount ? t : m), null);
      if (biggest) facts.push(`Самая крупная трата: ${fmt(-biggest.amount)} ${CUR}${biggest.date ? ", " + shortDate(biggest.date) : ""}`);
      // Пришло: поступления без переводов между своими счетами и без возвратов (возврат уменьшает траты, а не доход)
      const income = Math.round(all.filter(isIncome).reduce((a, t) => a + t.amount, 0) * 100) / 100;
      const diff = Math.round((income - st.total) * 100) / 100;
      // «Разница» считается до накоплений: отложенное не траты. Показываем, что осталось на счёте после откладывания, чтобы «осталось 152, отложено 180» не путало
      if (st.saved) {
        const after = Math.round((diff - st.saved) * 100) / 100;
        facts.push(`${st.saved > 0 ? `Отложено в накопления: ${fmt(st.saved)} ${CUR} (не траты)` : `Снято с накоплений: ${fmt(-st.saved)} ${CUR} (не доход)`}. С учётом этого на счёте ${after >= 0 ? "прибавилось" : "убавилось"} ${fmt(Math.abs(after))} ${CUR}`);
      }
      const big = h("span", {}, fmt(st.total));
      const key = `${ctx.label}|${st.total.toFixed(2)}`;
      const fresh = key !== lastHeadline;
      if (fresh) { lastHeadline = key; countUp(big, st.total); }
      const tile = (label, val, cls, hint) => h("div", { class: "ftile" + (cls ? " " + cls : "") }, h("div", { class: "flabel" }, label), h("div", { class: "fval" }, val, " ", h("small", {}, CUR)), hint ? h("div", { class: "fhint" }, hint) : "");
      // Реальное изменение остатка по итогам самих выписок (если они есть у всех): «Разница» считает только то, что входит в «Пришло» и «Потрачено»
      let balNote = "";
      if (!ctx.list || ctx.list.length === txs.length) {
        const cs = statements.map(x => x.check).filter(c => c && c.headerIncome != null);
        if (cs.length && cs.length === statements.length) {
          const bal = Math.round(cs.reduce((a, c) => a + c.headerIncome - c.headerExpense, 0) * 100) / 100;
          if (Math.abs(bal) >= 1 && (bal >= 0) !== (diff >= 0)) balNote = `Почему «Разница» ${diff >= 0 ? "плюс" : "минус"}, а на счетах денег ${bal >= 0 ? "стало больше" : "стало меньше"} на ${fmt(Math.abs(bal))} ${CUR}: в «Пришло» не входят переводы между своими счетами и возвраты, поэтому выписки и «Разница» считают немного по-разному.`;
        }
      }
      const tiles = income > 0
        ? [tile("Пришло", fmt(income)), tile("Потрачено", big, "spent"), tile("Разница", (diff >= 0 ? "+" : "−") + fmt(Math.abs(diff)), (diff >= 0 ? "pos" : "neg") + " wide", diff >= 0 ? (st.saved > 0 ? "за период: пришло минус потрачено, до накоплений" : "за период: пришло минус потрачено") : "за период: ушло больше, чем пришло")]
        : [tile("Потрачено", big, "spent")];
      if (balNote) facts.unshift(balNote);
      return h("div", { class: "hsum" + (fresh ? " anim" : "") },
        h("div", { class: "hlabel muted" }, ctx.label ? ctx.label.charAt(0).toUpperCase() + ctx.label.slice(1) : "За период"),
        h("div", { class: "flow" }, tiles),
        facts.length ? h("ul", {}, facts.slice(0, 5).map(f => h("li", {}, f))) : "");
    }
    // Месяц, к которому относится столбец «Динамики»: день и месяц понятны сразу, неделя относится к месяцу своего четверга (как в ISO).
    // Если такого месяца нет в выписке, возвращает null (столбец остаётся без перехода).
    function barMonth(key, mode, months) {
      let ym = key.slice(0, 7);
      if (mode === "week") ym = new Date(Date.parse(key + "T00:00:00Z") + 3 * 864e5).toISOString().slice(0, 7);
      return months.includes(ym) ? ym : null;
    }
    // Динамика: столбики по дням, неделям или месяцам (по длине периода) и пять самых затратных получателей
    function dynamicsBlock(ctx) {
      const all = ctx.list || txs, list = spendList(all).filter(t => t.date);
      if (!list.length) return null;
      // Столбики всегда по месяцам всей выписки (выбранный месяц подсвечен), а «Куда ушло больше всего» считается по выбранному периоду
      const barList = spendList(txs).filter(t => t.date);
      const mode = "month", DAY = 864e5;
      const utc = iso => Date.parse(iso + "T00:00:00Z");
      const keyOf = iso => {
        if (mode === "day") return iso;
        if (mode === "month") return iso.slice(0, 7);
        const t = utc(iso);
        return new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
      };
      const next = k => {
        if (mode === "month") { let y = +k.slice(0, 4), m = +k.slice(5, 7) + 1; if (m > 12) { m = 1; y++; } return y + "-" + String(m).padStart(2, "0"); }
        return new Date(utc(k) + (mode === "day" ? 1 : 7) * DAY).toISOString().slice(0, 10);
      };
      const sums = new Map();
      barList.forEach(t => { const k = keyOf(t.date); sums.set(k, (sums.get(k) || 0) - t.amount); });
      const keys = [...sums.keys()].sort(), seq = [];
      for (let k = keys[0], guard = 0; k <= keys[keys.length - 1] && guard < 400; k = next(k), guard++) seq.push([k, Math.max(0, sums.get(k) || 0)]);
      const box = h("div", { class: "dyn ocard" });
      const dmonths = monthsInStatement(), canOpen = dmonths.length > 1;   // месяц можно выбрать (и снять выбор) из любого периода
      if (seq.length >= 2) {
        const labelOf = k => mode === "month" ? monthTitle(k) : mode === "week" ? `неделя с ${shortDate(k)}` : shortDate(k);
        const tickOf = k => mode === "month" ? `${MON[+k.slice(5, 7) - 1]} ${k.slice(2, 4)}` : shortDate(k);
        const max = Math.max(...seq.map(s => s[1]), 1), W = 600, H = 120, n = seq.length, step = W / n;
        // Мало месяцев (короткая выписка): столбцы шире, чтобы не было больших пустот между ними; много месяцев: тонкие, как раньше
        const bw = Math.max(2, Math.min(n <= 3 ? 72 : n <= 6 ? 60 : n <= 12 ? 40 : 28, step * (n <= 12 ? 0.6 : 0.72)));
        let bars = "", hits = "", ticks = "";
        seq.forEach(([k, v], i) => {
          const bh = v ? Math.max(2, v / max * (H - (n <= 6 ? 30 : 14))) : 0, x = i * step + (step - bw) / 2;
          if (n <= 6 && v) bars += `<text class="val" x="${(i * step + step / 2).toFixed(1)}" y="${(H - bh - 7).toFixed(1)}" text-anchor="middle">${esc(Math.round(v).toLocaleString("ru-RU"))}</text>`;
          bars += `<rect class="col${v === max ? " max" : ""}${k === activeTab ? " sel" : ""}" x="${x.toFixed(1)}" y="${(H - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="${Math.min(3, bw / 2).toFixed(1)}"/>`;
          const go = canOpen ? barMonth(k, mode, dmonths) : null;
          hits += `<rect class="hit" data-i="${i}"${go ? ` data-m="${go}" tabindex="0" role="button" aria-label="${esc(labelOf(k))}: ${esc(fmt(v))} ${CUR}. Выбрать ${esc(monthTitle(go))}"` : ""} x="${(i * step).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${H}"/>`;
        });
        const tc = n <= 6 ? n : 5;   // до шести месяцев подписан каждый столбец
        for (let j = 0; j < tc; j++) { const i = tc === 1 ? 0 : Math.round(j * (n - 1) / (tc - 1)); ticks += `<text x="${Math.min(W - 30, Math.max(30, i * step + step / 2)).toFixed(1)}" y="${H + 18}" text-anchor="middle">${esc(tickOf(seq[i][0]))}</text>`; }
        const trendKey = `${n}|${max.toFixed(2)}`, freshTrend = trendKey !== lastTrend;
        lastTrend = trendKey;
        const selTitle = () => activeTab !== "all" && /^\d{4}-\d{2}$/.test(activeTab) ? `Выбран: ${monthTitle(activeTab)}` : "Выбран весь период";
        const tip = h("div", { class: "pietip" }, h("span", { class: "muted" }, `${selTitle()} · нажмите на месяц, чтобы выбрать`));
        const holder = document.createElement("span");
        holder.innerHTML = `<svg class="trend${freshTrend ? " anim" : ""}${canOpen ? " go" : ""}${/^\d{4}-\d{2}$/.test(activeTab) ? " hasSel" : ""}" viewBox="0 0 ${W} ${H + 24}" role="img" aria-label="Траты по ${mode === "day" ? "дням" : mode === "week" ? "неделям" : "месяцам"}">${bars}${ticks}${hits}</svg>`;
        const show = e => {
          const el = e.target.closest && e.target.closest(".hit");
          if (!el) return;
          const i = +el.getAttribute("data-i");
          holder.querySelectorAll(".col").forEach((b, j) => b.classList.toggle("hot", j === i));
          const m = el.getAttribute("data-m");
          tip.replaceChildren(h("b", {}, labelOf(seq[i][0])), ` · ${fmt(seq[i][1])} ${CUR}`, ...(m ? [h("span", { class: "muted" }, ` · ${m === activeTab ? "выбран, нажмите ещё раз, чтобы снять" : "нажмите, чтобы выбрать"}`)] : []));
        };
        // Мышь и клавиатура открывают месяц сразу; на сенсорном экране первое касание показывает сумму, второе по тому же столбцу открывает месяц
        // Выбор месяца не прокручивает страницу: пользователь остаётся на месте, меняются суммы и «Куда ушло больше всего»; повторное нажатие снимает выбор
        const openMonth = m => {
          const y = typeof window !== "undefined" ? window.scrollY : 0;
          activeTab = m === activeTab ? "all" : m; refreshTop(); renderReview(); renderNav(); renderAll(); renderBottom();
          try { if (y) window.scrollTo(0, y); } catch (e) { /* без прокрутки */ }
        };
        const act = e => {
          show(e);
          const el = e.target.closest && e.target.closest(".hit"), m = el && el.getAttribute("data-m");
          if (!m) return;
          openMonth(m);
        };
        if (holder.addEventListener) {
          // Касание и щелчок не ставят фокус на столбец (на iOS он рисует системную синюю рамку); клавиатура фокусируется как раньше
          holder.addEventListener("mousedown", e => { if (e.target.closest && e.target.closest(".hit")) e.preventDefault(); });
          holder.addEventListener("focusin", e => { const el = e.target; if (el && el.matches && el.matches(".hit") && !el.matches(":focus-visible") && el.blur) el.blur(); });
          holder.addEventListener("mouseover", show); holder.addEventListener("focusin", show); holder.addEventListener("click", act);
          holder.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.getAttribute && e.target.getAttribute("data-m")) { e.preventDefault(); act(e); } });
        }
        box.append(h("h3", { style: "margin-bottom:.2rem" }, "Динамика трат"),
          h("div", { class: "muted" }, "По месяцам"), tip, holder);
      }
      const groups = new Map();
      const unclear = list.filter(t => REVIEW_CATS.has(displayCat(t)));
      list.filter(t => !REVIEW_CATS.has(displayCat(t))).forEach(t => { const k = displayCat(t) === "Наличные" ? "cash:" : Cat.merchantKey(t), g = groups.get(k) || { sum: 0, n: 0, tx: t }; g.sum -= t.amount; g.n++; groups.set(k, g); });
      const top = [...groups.values()].sort((a, b) => b.sum - a.sum).slice(0, 5);
      if (top.length) {
        const topMax = top[0].sum;
        box.append(h("h3", { style: "margin:1rem 0 .2rem" }, "Куда ушло больше всего"),
          ...top.map(g => {
            const nm = friendlyTitle(g.tx);
            return h("div", { class: "toprow" },
              h("span", { class: "tname" }, h("span", { class: "tn" }, softCase(nm)), h("span", { class: "muted" }, ` · ${g.n} ${opsWord(g.n)}`)),
              h("span", { class: "num" }, fmt(g.sum)),
              h("div", { class: "tbar" }, h("i", { style: `width:${(g.sum / topMax * 100).toFixed(1)}%;background:${catColor(displayCat(g.tx))}` })));
          }),
          ...(unclear.length ? [h("div", { class: "muted", style: "margin-top:.4rem" }, `Не входит в список: ${fmt(unclear.reduce((a, t) => a - t.amount, 0))} ${CUR} в платежах, где банк не показал получателя (интернет-банк, ЕРИП). Их можно уточнить в разделе «Уточнить».`)] : []));
      }
      return box;
    }
    // «Что заметили»: 2–3 строки под кольцом из уже готовых расчётов (к прошлому месяцу, аномалии, регулярные). Нечего сказать: блока нет.
    function noticedBlock(ctx) {
      if (!ctx || !ctx.list) return null;
      const lines = [];
      const chip = t => h("span", { class: "sigchip" }, t);
      if (ctx.current != null && ctx.current > 0) {
        const cur = ctx.months[ctx.current], prev = ctx.months[ctx.current - 1];
        const okM = ym => !coverageNote(ym) && txs.filter(t => t.date && t.date.startsWith(ym)).length >= 5;
        if (Planner.addMonths(prev, 1) === cur && okM(cur) && okM(prev)) {
          const c = Planner.compareMonths(ctx.per[ctx.current].rows, ctx.per[ctx.current - 1].rows, []);
          if (c.pct != null && Math.abs(c.pct) >= 3) {
            const t = c.top[0];
            lines.push(["Траты к прошлому месяцу: ", chip(`${c.pct > 0 ? "+" : "−"}${Math.round(Math.abs(c.pct))}%`),
              t ? ` · сильнее всего изменились «${t.cat}»: ${t.diff > 0 ? "+" : "−"}${fmt(Math.abs(t.diff))} ${CUR}` : ""]);
          }
        }
      }
      const an = Planner.findAnomalies(ctx.list.filter(t => !t.part).map(t => ({ date: t.date, amount: t.amount, cat: displayCat(t) || "Не разобрано", name: planName(t) })), PLAN_SKIP, ESSENTIAL_CATS);
      if (an.double.length) lines.push(["Возможное двойное списание: ", chip(`${fmt(an.double[0].amount)} ${CUR} × ${an.double[0].count}`), ` · ${softCase(an.double[0].name)}, ${dmy(an.double[0].date)}`]);
      else if (an.big.length) lines.push(["Необычно крупная трата: ", chip(`${fmt(an.big[0].amount)} ${CUR}`), ` · ${an.big[0].cat}, ${dmy(an.big[0].date)}`]);
      const { regular } = regularCtx();
      if (regular.length) {
        const sum = regular.reduce((a, r) => a + r.perMonth, 0);
        lines.push(["Регулярные платежи: ", chip(`≈ ${money(sum)} ${CUR} в месяц`), ` · ${regular.length} шт., `, h("button", { type: "button", class: "linklike", onclick: () => showSection("subs") }, "подробнее")]);
      }
      if (!lines.length) return null;
      return h("div", { class: "noticed" }, h("h3", {}, "Что заметили"), h("ul", {}, lines.slice(0, 3).map(l => h("li", {}, ...l))));
    }

    // Период для «Итога» без целых месяцев: от начала до конца загруженных выписок (а не только дни, когда были операции:
    // выписка за 8 дней с операциями в один день: это «8 дней», а не «1 день»)
    function recapPeriod(dates) {
      const st = statements.filter(x => x.from && x.to);
      const from = [...st.map(x => x.from), dates[0]].filter(Boolean).sort()[0];
      const to = [...st.map(x => x.to), dates[dates.length - 1]].filter(Boolean).sort().pop();
      return { from, to };
    }
    // «Итог месяца»: 3–5 выводов о последнем полном месяце (или о выбранном полном). Логика в recap.js, здесь только данные и вид
    function recapCard() {
      if (typeof Recap === "undefined" || !txs.length) return null;
      const months = monthsInStatement();
      const full = months.filter(ym => !coverageNote(ym));
      const items = spendList(txs).filter(t => t.date).map(t => ({ date: t.date, amount: t.amount, cat: displayCat(t) || "Не разобрано", name: planName(t) }));
      const dates = txs.map(t => t.date).filter(Boolean).sort();
      let regular = [];
      try { regular = regularCtx().regular; } catch (e) { /* без подписок */ }
      const income = txs.filter(t => t.date && isIncome(t)).map(t => ({ date: t.date, amount: t.amount }));
      const r = Recap.monthRecap({
        items, income, fullMonths: full, month: full.includes(activeTab) ? activeTab : undefined,
        period: recapPeriod(dates),
        unsorted: [...REVIEW_CATS], fixed: ["Аренда и жильё", "Комиссии банка", "Здоровье", "Образование", "Наличные", Cat.GAMBLING, Cat.P2P],
        regular, subsCats: ["Связь и подписки"], nice: softCase, unit: CUR,
      });
      if (!r || !r.lines.length) return null;
      const sub = r.month ? (r.compared ? `Сравнение со средним за ${r.compared === 1 ? "прошлый месяц" : r.compared + " прошлых месяца"}` : "Для сравнения загрузите выписку и за прошлые месяцы")
        : "В выписке нет ни одного целого месяца, поэтому без сравнения с обычным уровнем";
      try {
        const unsortedSet = new Set(REVIEW_CATS), per = new Map();
        items.filter(t => t.amount < 0 && (!r.month || t.date.startsWith(r.month))).forEach(t => {
          const c = unsortedSet.has(t.cat) ? "Остальное" : t.cat;
          per.set(c, (per.get(c) || 0) - t.amount);
        });
        const rows = [...per].filter(([c]) => c !== "Остальное").sort((a, b) => b[1] - a[1]);
        const all = [...per.values()].reduce((a, v) => a + v, 0);
        const top = rows.slice(0, 4), rest = all - top.reduce((a, x) => a + x[1], 0);
        shareData = { r, bar: all > 0 ? top.map(([c, v]) => ({ name: c, v, key: catVar(c) })).concat(rest > 0.5 ? [{ name: "Остальное", v: rest, key: "--cat-other" }] : []) : [], total: all };
      } catch (e) { shareData = null; }
      const goReview = h("button", { type: "button", class: "linklike", onclick: () => showSection("review") }, "Уточнить");
      // Разобрано слишком мало: громкие выводы были бы гаданием, честно просим сначала уточнить крупное
      if (r.sortedShare < 0.25) return h("section", { class: "ocard recap", "aria-label": r.title },
        h("h3", {}, r.title), h("p", {}, `Пока рано делать выводы: понятно, на что ушло, только ${Math.round(r.sortedShare * 100)}% трат. Остальное это переводы, ЕРИП и платежи без названия. Уточните самые крупные, и здесь появится итог.`), goReview);
      const weak = r.sortedShare < 0.6;
      return h("section", { class: "ocard recap", "aria-label": r.title },
        h("h3", {}, r.title), h("div", { class: "muted" }, sub),
        r.note ? h("p", { class: "rnote" + (weak ? " rweak" : " muted") }, r.note, " ", goReview) : "",
        r.save && !weak ? h("div", { class: "rsave" }, `+${Recap.money(r.save)} ${CUR}`, h("small", {}, "можно было бы сохранить, если бы выросшие траты были на обычном уровне")) : "",
        h("ul", {}, r.lines.filter(l => l.kind !== "save" || !r.save).map(l => h("li", { class: "k-" + l.kind }, l.text))),
        shareData && shareData.bar.length && !readProblems().length && !guessed().length ? h("div", { class: "rshare" }, h("button", { type: "button", onclick: ev => openShare(ev.currentTarget) }, "Поделиться итогом")) : "");
    }

