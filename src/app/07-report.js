    // ---------- Отрисовка отчёта ----------
    // Одноразовая плашка после загрузки настоящей выписки: операции не хранятся, правила и итоги месяцев остаются
    function renderKeepNote() {
      const box = $("keepNote");
      if (demoMode || !txs.length || loadJSON("ba_keepnote_v1", false) || keepAskPending() || keepOnDevice) { box.hidden = true; return; }
      const msg = h("span", {}, "Выписка не сохраняется: после закрытия страницы загрузите её снова. Категории и заметки остаются в браузере. ");
      const save = h("button", { type: "button", class: "primary", onclick: () => { $("exportBtn").click(); box.replaceChildren(h("span", {}, "Файл «мой-разбор-трат.json» сохранён в папку загрузок. "), ok); } }, "Сохранить файл");
      const ok = h("button", { type: "button", onclick: () => { saveJSON("ba_keepnote_v1", true); box.hidden = true; } }, "Понятно");
      box.replaceChildren(msg, save, " ", ok);
      box.hidden = false;
    }

    function render() {
      splitByCurrency();
      $("report").hidden = false;
      $("demoMore").hidden = !demoMode;
      $("exportBox").hidden = false; $("setDl").hidden = false;
      document.body.setAttribute("data-view", curSection);
      $("demoBar").hidden = !demoMode;
      $("clearBtn").hidden = demoMode || !txs.length;
      $("printBtn").hidden = !txs.length && !demoMode;
      $("dlBtn").hidden = !txs.length || demoMode;
      renderKeepAsk();
      $("dataRules").hidden = demoMode; $("setData").hidden = demoMode;
      $("resetRow").hidden = demoMode;
      recurring = findRecurring();
      saveHistory();
      scheduleDeviceSave();
      renderCheck();
      renderCurBox();
      renderRates();
      renderKeepNote();
      refreshTop();
      renderReview();
      renderNav();
      renderAll();
      renderBottom();
      renderRules();
    }

    // Курсы валют: поле для каждой валюты, которая есть в загруженных выписках
    function applyRates() {
      unpark();
      txs = Splits.collapse(txs);
      const missing = Rates.apply(txs, rates);
      applySplits();
      return missing;
    }
    // Плашка над «Итогом»: в какой валюте показаны суммы и почему нет итога в рублях. Выдуманный курс не подставляется никогда.
    const NO_RATE = "Курс на эту дату недоступен, итог в рублях не посчитан.";
    const goRates = () => { showSection("more"); setTimeout(() => { try { $("ratesBox").scrollIntoView({ block: "start" }); } catch (e) { /* без прокрутки */ } }, 0); };
    function currencyTotals(list) {
      const r2 = v => Math.round(v * 100) / 100;
      return { n: Splits.collapse(list).length, income: r2(list.filter(isIncome).reduce((a, t) => a + t.amount, 0)), spent: r2(statsFor(list).total) };
    }
    function renderCurBox() {
      const box = $("curBox");
      if (!box) return;
      const rateBtn = () => h("button", { type: "button", class: "linklike", onclick: goRates }, "Указать курс");
      box.className = "note curbox";
      if (demoMode || !txs.length) { box.hidden = true; box.replaceChildren(); return; }
      if (curUnits.length > 1) {
        const all = txs.concat(parked);
        const row = u => {
          const t = currencyTotals(all.filter(x => unitOf(x) === u));
          return h("li", { class: u === CUR ? "on" : "" }, h("b", {}, u), h("span", {}, `пришло ${fmt(t.income)} ${u}`), h("span", {}, `потрачено ${fmt(t.spent)} ${u}`), h("span", { class: "muted" }, `${t.n} ${opsWord(t.n)}`));
        };
        box.hidden = false;
        box.replaceChildren(h("b", {}, `В выписках несколько валют: ${curUnits.join(", ")}`),
          h("p", {}, "Складывать их без курса нельзя: общий итог был бы неверным. Поэтому итог по каждой валюте отдельно."),
          h("ul", { class: "curlist" }, curUnits.map(row)),
          h("div", { class: "curpick" }, h("span", { class: "muted" }, "Разбор ниже по операциям в: "),
            curUnits.map(u => h("button", { type: "button", class: "tab" + (u === CUR ? " active" : ""), "aria-pressed": u === CUR ? "true" : "false", onclick: () => { if (u === CUR) return; unpark(); curPick = u; activeTab = "all"; render(); } }, u))),
          h("p", { class: "muted" }, NO_RATE, " ", rateBtn()));
        return;
      }
      if (CUR !== "BYN") {
        box.hidden = false;
        box.replaceChildren(h("b", {}, `Счёт в ${CUR}: все суммы в ${CUR}, как в выписке`), h("p", { class: "muted" }, NO_RATE, " ", rateBtn()));
        return;
      }
      // Весь счёт в одной валюте и пересчитан по курсу человека: рядом показываем точный итог в валюте счёта
      const base = Splits.collapse(txs), code = base.length && base[0].cur;
      if (code && base.every(t => t.cur === code && t.rate > 0 && typeof t.orig === "number")) {
        const t = currencyTotals(txs.map(x => Object.assign({}, x, { amount: Math.round(x.amount / x.rate * 100) / 100 })));
        box.hidden = false;
        box.replaceChildren(h("p", { class: "muted" }, `Счёт в ${code}, суммы пересчитаны в BYN по вашему курсу. В валюте счёта за весь период: пришло ${fmt(t.income)} ${code}, потрачено ${fmt(t.spent)} ${code}. `,
          h("button", { type: "button", class: "linklike", onclick: goRates }, "Изменить курс")));
        return;
      }
      box.hidden = true; box.replaceChildren();
    }
    let ratesSig = "";
    function renderRates() {
      const codes = demoMode ? [] : Rates.codes(Splits.collapse(txs.concat(parked)));
      $("ratesBox").hidden = !codes.length;
      const list = $("ratesList");
      if (!codes.length) { list.replaceChildren(); ratesSig = ""; return; }
      // поля не пересоздаём, пока человек печатает: список меняется только если изменился набор валют или дат
      const sig = codes.map(c => c + ":" + ((rates[c] && rates[c].at) || []).map(x => x.d).join("/")).join();
      if (ratesSig === sig) return;
      ratesSig = sig;
      const msg = t => { $("ratesMsg").textContent = t; };
      const copy = () => JSON.parse(JSON.stringify(rates));
      const commit = (next, okText) => {
        rates = Rates.clean(next);
        saveJSON("ba_rates_v1", rates);
        const missing = applyRates();
        render();
        msg(missing.length ? `Нет курса для: ${missing.join(", ")}. Эти суммы пока в своей валюте.` : okText);
      };
      const bad = code => msg(`Курс ${code} не принят: нужно положительное число, например 3,25.`);
      list.replaceChildren(...codes.map(code => {
        const e = rates[code] || { at: [] };
        const base = h("input", { type: "text", inputmode: "decimal", id: "rate_" + code, autocomplete: "off", placeholder: "например 3,25", "aria-label": `Основной курс: сколько BYN за 1 ${code}`, value: e.r ? String(e.r).replace(".", ",") : "" });
        base.addEventListener("change", () => {
          const v = Rates.toNum(base.value), next = copy();
          if (base.value.trim() === "") { if (next[code]) delete next[code].r; }
          else if (v > 0 && v <= 1e6) next[code] = Object.assign(next[code] || { at: [] }, { r: v });
          else return bad(code);
          commit(next, "Курсы сохранены, суммы пересчитаны в BYN.");
        });
        base.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); base.blur(); } });
        const rows = (e.at || []).map((x, i) => {
          // Дата текстом «ДД.ММ.ГГГГ»: системный календарь браузера не в стиле сайта
          const isoToRu = s => s.split("-").reverse().join(".");
          const ruToIso = s => { const m = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s*$/.exec(s); if (!m) return ""; const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; const t = new Date(iso + "T00:00:00Z"); return !isNaN(t) && t.toISOString().slice(0, 10) === iso ? iso : ""; };
          const d = h("input", { type: "text", inputmode: "numeric", autocomplete: "off", placeholder: "ДД.ММ.ГГГГ", maxlength: "10", class: "datein", value: isoToRu(x.d), "aria-label": `${code}: курс действует с даты (ДД.ММ.ГГГГ)` });
          const r = h("input", { type: "text", inputmode: "decimal", autocomplete: "off", value: String(x.r).replace(".", ","), "aria-label": `${code}: курс с ${x.d}` });
          const upd = () => {
            const v = Rates.toNum(r.value), next = copy(), day = ruToIso(d.value);
            if (!day) return msg("Дата курса: введите в виде ДД.ММ.ГГГГ, например 05.10.2026.");
            if (!(v > 0 && v <= 1e6)) return bad(code);
            if (day !== x.d && next[code].at.some(y => y.d === day)) return msg(`На дату ${d.value} курс ${code} уже есть.`);
            next[code].at[i] = { d: day, r: v };
            commit(next, "Курс с даты сохранён, суммы пересчитаны.");
          };
          d.addEventListener("change", upd); r.addEventListener("change", upd);
          d.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); d.blur(); } });
          const del = h("button", { type: "button", class: "wizx", "aria-label": `Убрать курс ${code} с ${x.d}`, onclick: () => { const next = copy(); next[code].at.splice(i, 1); commit(next, "Курс с даты убран."); } }, "✕");
          return h("div", { class: "condform" }, h("label", {}, "с ", d), h("label", {}, ` 1 ${code} = `, r, " BYN"), del);
        });
        const add = h("button", { type: "button", onclick: () => {
          const next = copy(), en = next[code] || { at: [] };
          const last = en.at.length ? en.at[en.at.length - 1].r : en.r;
          if (!(last > 0)) return msg(`Сначала введите основной курс ${code}.`);
          const dates = Splits.collapse(txs.concat(parked)).filter(t => t.cur === code && t.date).map(t => t.date).sort();
          let day = dates.length ? dates[dates.length - 1] : todayIso();
          while (en.at.some(y => y.d === day)) day = new Date(Date.parse(day) - 864e5).toISOString().slice(0, 10);
          en.at.push({ d: day, r: last }); next[code] = en;
          commit(next, "Добавлен курс с даты: укажите дату и курс.");
        } }, "Добавить курс с другой даты");
        return h("div", {}, h("div", { class: "muted", style: "margin-top:.6rem" }, rows.length ? "Основной курс (для операций до первой даты ниже)" : "Основной курс"), h("div", { class: "condform", style: "margin-top:.2rem" }, h("label", {}, `1 ${code} = `, base, " BYN")), ...rows, h("p", {}, add));
      }));
    }

    // Траты за выбранный период и выводы к ним (вызывается и при смене вкладки)
    function refreshTop() {
      const r = renderSummary();
      renderInsights(r.stats, r.label, r);
      renderPlan();
      renderSubs();
    }

    // Нижняя часть страницы: вкладки «Все операции» и «Нужно разобрать», плюс плашка наверху
    function openBottom(tab) {
      bottomTab = tab;
      bottomOpen = true;
      renderBottom();
      showSection("review");
    }
    const SMALL_LIMIT = 10;                          // «мелкой» считаем операцию меньше этой суммы
    const opsWord = n => (n % 10 === 1 && n % 100 !== 11 ? "операция" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "операции" : "операций");
    function renderBottom() {
      const period = currentPeriod();
      const allCount = txs.filter(t => period === "all" || (t.date && t.date.startsWith(period))).length;
      const hasReview = reviewOps > 0 || reviewOther > 0;
      if (bottomTab === null) bottomTab = hasReview ? "review" : "all";
      if (bottomTab === "income" && !incomeGroups) bottomTab = hasReview ? "review" : "all";
      if (bottomTab === "review" && !hasReview) bottomTab = "all";   // всё разобрано: показываем «Все операции»
      renderUndo();
      const rough = $("roughNote");
      rough.hidden = !(reviewOps > 0);
      if (reviewOps > 0) rough.textContent = `Без категории ещё ${reviewOps} ${opsWord(reviewOps)}: в лимиты они не попадают. Уточнить их можно на вкладке «Уточнить», это необязательно.`;
      $("reviewSection").hidden = !bottomOpen || bottomTab !== "review";
      $("incomeSection").hidden = !bottomOpen || bottomTab !== "income";
      $("allPanel").hidden = !bottomOpen || bottomTab !== "all";
      // Нажатие на вкладку открывает её; повторное нажатие на уже открытую сворачивает список
      const tab = (id, label) => h("button", { class: "tab" + (bottomOpen && bottomTab === id ? " active" : ""), onclick: () => {
        bottomTab = id;
        renderBottom();
      } }, label);
      $("bottomTabs").replaceChildren(
        tab("all", `Все операции (${allCount})`),
        hasReview ? tab("review", `Уточнить (${reviewOps})`) : "",
        incomeGroups ? tab("income", `Поступления (${incomeGroups})`) : "");
      // Плашка наверху: чтобы неразобранное не потерялось
      const banner = $("reviewBanner");
      banner.hidden = !hasReview;
      if (hasReview) {
        const more = reviewOther ? ` (и ещё ${reviewOther} в других месяцах)` : "";
        const pct = periodSpend > 0 ? Math.max(0, Math.min(100, Math.round((1 - periodUnclear / periodSpend) * 100))) : 100;
        banner.replaceChildren(
          // Одна строка: человек сначала должен увидеть итоги ниже, а не задание
          reviewOps ? h("div", {}, h("b", {}, `Разобрано ${pct}% трат${period === "all" ? "" : " за " + monthTitle(period)}. `),
            // Переводы это понятная часть «неразобранного»: говорим о ней сразу, чтобы низкий процент не пугал
            periodSpend > 0 && reviewTrSum / periodSpend >= 0.1 ? `Ещё ${Math.round(reviewTrSum / periodSpend * 100)}% это переводы: отметьте свои. ` : "",
            `Осталось уточнить: ${reviewGroups} ${groupsWord(reviewGroups)} (${reviewOps} ${opsWord(reviewOps)})${more}, это необязательно. `,
            h("button", { type: "button", onclick: () => openBottom("review") }, "Уточнить"))
            : h("div", {}, h("b", {}, "В этом месяце всё уточнено. "), `В других месяцах можно уточнить ещё ${reviewOther} ${opsWord(reviewOther)}. `,
              h("button", { type: "button", onclick: () => openBottom("review") }, "Уточнить")),
          reviewOps ? h("div", { class: "barwrap", style: "margin-top:.4rem", role: "img", "aria-label": `Категории определены для ${pct}% трат` }, h("div", { class: "bar", style: `width:${pct}%` })) : "");
      }
    }

    // Кнопки быстрого перехода к нужному разделу
    function renderNav() {
      const link = (href, label, action) => h("a", { href, onclick: e => { e.preventDefault(); action(); } }, label);
      $("nav").replaceChildren(
        link("#secSummary", "Траты", () => $("secSummary").scrollIntoView({ behavior: "smooth", block: "start" })),
        reviewOps || reviewOther ? link("#bottom", `Уточнить (${reviewOps})`, () => openBottom("review")) : "",
        link("#bottom", "Все операции", () => openBottom("all")));
      if (typeof renderTabbar === "function") renderTabbar();
    }

    // Плашки загруженных банков: одинаковые для всех, без логотипов и фирменных цветов (сайт с банками не связан)
    function renderBankChips() {
      const box = $("bankChips");
      const names = demoMode ? [] : [...new Set(statements.map(st => st.bankName).filter(Boolean))];
      box.replaceChildren(...names.map(n => h("span", { class: "bankchip" },
        h("span", { class: "mono", "aria-hidden": "true" }, n.trim().charAt(0).toUpperCase()), n)));
    }
    function renderCheck() {
      const box = $("check");
      renderBankChips();
      if (demoMode) { box.className = ""; box.replaceChildren(); renderReadWarn(); return; }
      let ok = true, unchecked = [];
      const lines = statements.map(st => {
        let t = `${st.bankName}${st.universal && st.bankName !== Banks.OTHER.name ? " (банка нет в списке, прочитано по колонкам)" : ""}: ${st.count} операций` + (st.from ? ` за период ${fmtDate(st.from)} — ${fmtDate(st.to)}` : "");
        if (st.skipped) t += `, повторов пропущено: ${st.skipped}`;
        t += ". ";
        const c = st.check;
        if (c && c.headerIncome != null) {
          t += `Поступления: по выписке ${fmt(c.headerIncome)}, найдено ${fmt(c.income)} ${c.incomeOk ? "✓" : "✗"}. `;
          t += `Списания: по выписке ${fmt(c.headerExpense)}, найдено ${fmt(c.expense)} ${c.expenseOk ? "✓" : "✗"}.`;
          if (c.pending) t += ` Ещё не проведено банком: ${c.pending} ${opsWord(c.pending)}. Они учтены в тратах и не входят в итоги выписки; после проведения банк покажет их в следующей выписке.`;
          if (!c.ok) { ok = false; t += c.accounts > 1 ? " Суммы не сошлись: в файле несколько счетов или валют, их операции сложены вместе ✗." : " Суммы не сошлись: часть операций прочитана неверно или пропущена (подробности вверху раздела)."; }
        } else if (st.universal && st.proof === "balance") t += "Суммы сходятся с остатком после каждой операции ✓.";
        else if (st.universal && st.proof === "totals") t += "Остаток на начало, операции и остаток на конец сходятся ✓.";
        else if (st.universal && st.proof === "mismatch") { ok = false; t += "Остатки на начало и конец не сходятся с операциями ✗."; }
        else if (st.universal && st.proof === "accounts") { ok = false; t += "В файле несколько счетов, их операции сложены вместе ✗."; }
        else { unchecked.push(st.bankName); t += st.universal ? "Этого банка нет в списке: прочитано по догадке, сверить не с чем." : "Итоговых сумм в этой выписке нет, сверить не с чем."; }
        if (st.unread && st.unread.length) ok = false;
        return h("div", {}, t);
      });
      if (statements.length > 1) lines.push(h("div", {}, `Всего операций: ${txs.length}.`));
      const pairs = Merge.pairCount(txs);
      if (pairs) lines.push(h("div", {}, `Пар «пришло и сразу ушло»: ${pairs}: они не считаются ни доходом, ни расходом, но остаются в списке.`));
      const allUnchecked = ok && unchecked.length === statements.length;
      box.className = ok && !allUnchecked ? "ok" : allUnchecked ? "note" : "warn";
      // Сверка свёрнута: если всё сошлось, хватает одной строки; при расхождении раскрыта сразу.
      // Нет итогов в выписке (бывает у Альфа-Банка): честно «сверить не с чем», а не «всё сходится ✓»
      const sum = !ok ? "Сверка итогов с выпиской: есть расхождения ✗"
        : allUnchecked ? `Сверка: в выписке нет итоговых сумм, сверить не с чем (операций: ${txs.length})`
        : `Сверка итогов с выпиской: всё сходится ✓ (выписок: ${statements.length - unchecked.length}${unchecked.length ? `, без итогов: ${unchecked.length}` : ""}, операций: ${txs.length})`;
      const det = h("details", ok ? {} : { open: "" }, h("summary", { style: "cursor:pointer" }, sum), ...lines);
      // Банки, у которых мало образцов: честно предупреждаем, что возможны ошибки
      const fresh = statements.some(st => st.bank === "alfa") ? [h("p", { class: "muted", style: "margin:.6rem 0 0" },
        "Альфа-Банк подключён недавно, образцов выписок пока мало (проверены кредитная карта и карта с несколькими операциями), поэтому чтение может быть неточным. Если заметили ошибку или пропущенную операцию, ",
        h("button", { type: "button", class: "linklike", onclick: () => showAnon(false) }, "отправьте образец выписки"), ".")] : [];
      box.replaceChildren(det, ...fresh);
      renderReadWarn();
    }
    // Плашка над «Итогом месяца»: что не удалось прочитать и насколько не сошлись суммы. Пока она есть, итог может врать,
    // поэтому говорим прямо: какая операция, на какую сумму и где искать.
    function readProblems() {
      if (demoMode) return [];
      const out = [];
      statements.forEach(st => {
        const c = st.check, items = [];
        if (st.unread && st.unread.length) {
          const n = st.unread.length;
          items.push(h("div", {}, `Не удалось прочитать ${n} ${opsWord(n)}:`));
          items.push(h("ul", { class: "unread" }, st.unread.slice(0, 5).map(u => h("li", {},
            [u.date ? fmtDate(u.date) : u.rawDate ? `дата «${u.rawDate}» неверная` : "без даты",
             u.amount != null ? `${u.amount > 0 ? "+" : "−"}${fmt(Math.abs(u.amount))} ${CUR}` : "сумма не читается",
             u.details || ""].filter(Boolean).join(" · ")))));
          if (n > 5) items.push(h("div", { class: "muted" }, `и ещё ${n - 5}.`));
        }
        if (c && c.headerIncome != null && !c.ok) {
          const part = (name, head, got) => {
            const d = Math.round((head - got) * 100) / 100;
            if (!d) return "";
            return d > 0 ? `в ${name} не хватает ${fmt(d)} ${CUR}` : `в ${name} лишние ${fmt(-d)} ${CUR}`;
          };
          const diffs = [part("поступлениях", c.headerIncome, c.income), part("списаниях", c.headerExpense, c.expense)].filter(Boolean);
          let t = `Суммы не совпали с итогами выписки: ${diffs.join(", ")}.`;
          if (c.accounts > 1) t += " В этом файле несколько счетов или валют, и их операции сложены вместе, поэтому итоги не сходятся. Надёжнее скачать в банке выписку по каждому счёту (каждой валюте) отдельным файлом и загрузить их по одной.";
          else if (c.gapFrom) t += ` Пропуск где-то ${c.gapFrom === c.gapTo ? fmtDate(c.gapFrom) : `между ${fmtDate(c.gapFrom)} и ${fmtDate(c.gapTo)}`}: сверьте эти дни с приложением банка.`;
          else t += " Скорее всего, одна или несколько операций не прочитаны или прочитаны с ошибкой.";
          items.push(h("div", {}, t));
        }
        if (st.universal && st.proof === "mismatch" && !(c && c.headerIncome != null))
          items.push(h("div", {}, "Остаток на начало и на конец выписки не сходится с прочитанными операциями: часть операций пропущена или сумма взята не из той колонки."));
        if (st.universal && st.proof === "accounts")
          items.push(h("div", {}, "В этом файле несколько счетов (остаток несколько раз начинается заново), и их операции сложены вместе. Если счета в разных валютах, итоги неверны. Надёжнее загрузить выписку по каждому счёту отдельным файлом."));
        if (items.length) out.push(h("div", { class: "rwbank" }, statements.length > 1 ? h("b", {}, st.bankName + ". ") : "", ...items));
      });
      return out;
    }
    // Выписки банков не из списка, которые нечем проверить (нет итогов и остатков): «прочитано по догадке»
    const guessed = () => demoMode ? [] : statements.filter(st => st.universal && st.proof !== "totals" && st.proof !== "balance" && st.proof !== "mismatch" && st.proof !== "accounts");
    function renderReadWarn() {
      const box = $("readWarn");
      if (!box) return;
      const probs = readProblems(), gs = guessed();
      box.hidden = !probs.length && !gs.length;
      if (!probs.length && !gs.length) { box.replaceChildren(); return; }
      const gnote = gs.length ? h("p", {}, (gs.length === 1 ? (gs[0].bankName === Banks.OTHER.name ? "Этого банка" : "Банка «" + gs[0].bankName + "»") + " нет в списке" : "Части банков нет в списке") + ", а в выписке нет итогов и остатков, чтобы проверить суммы. Сверьте итог и две-три операции с приложением банка.") : null;
      if (!probs.length) {
        box.className = "note readwarn";
        box.replaceChildren(h("b", {}, "Прочитано по догадке"), gnote,
          h("p", { class: "muted" }, "Если цифры не сходятся, ",
            h("button", { type: "button", class: "linklike", onclick: () => showAnon(false) }, "пришлите образец"), " (личные данные закроются): добавлю этот банк в список."));
        return;
      }
      box.className = "warn readwarn";
      box.replaceChildren(h("b", {}, "Выписка прочитана не полностью"),
        h("p", {}, "Цифры ниже могут быть неточными: итог месяца, категории и бюджет посчитаны без этих операций."),
        ...probs, ...(gnote ? [gnote] : []),
        h("p", { class: "muted" }, "Попробуйте скачать выписку из банка заново. Если ошибка повторится, ",
          h("button", { type: "button", class: "linklike", onclick: () => { $("fbTopic").value = "parse"; $("fbOpen4").click(); } }, "напишите, что не так"), " или ",
          h("button", { type: "button", class: "linklike", onclick: () => showAnon(false) }, "пришлите образец"), " (личные данные закроются), и я поправлю чтение."));
    }

    // ---------- Траты по категориям: за весь период и по месяцам ----------
    const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
    const monthTitle = ym => {
      const [y, m] = ym.split("-");
      const name = MONTHS[Number(m) - 1];
      return name[0].toUpperCase() + name.slice(1) + " " + y;
    };
    // Месяц внутри предложения: «за август 2026», а не «за Август 2026»
    const monthLow = ym => monthTitle(ym).toLowerCase();
    // «с августа по октябрь 2026» (год один раз, если он общий)
    const MONTHS_GEN_UI = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
    const monthRange = (a, b) => `с ${MONTHS_GEN_UI[+a.slice(5, 7) - 1]}${a.slice(0, 4) === b.slice(0, 4) ? "" : " " + a.slice(0, 4)} по ${monthLow(b)}`;
    // Склонение по числу: plur(5, "категория", "категории", "категорий")
    const plur = (n, one, few, many) => n % 10 === 1 && n % 100 !== 11 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many;
    const fmtDate = iso => iso.split("-").reverse().join(".");
    // Дата коротко: «17.10». Если в выписке несколько лет или год не текущий, с годом: «17.10.2024» (иначе непонятно, какой год)
    let dsMemo = { n: -1, many: false };
    function dShort(d) {
      if (!d || d.length < 10) return "";
      if (dsMemo.n !== txs.length) dsMemo = { n: txs.length, many: new Set(txs.map(t => t.date && t.date.slice(0, 4)).filter(Boolean)).size > 1 };
      return dsMemo.many || d.slice(0, 4) !== String(new Date().getFullYear()) ? fmtDate(d.slice(0, 10)) : `${d.slice(8, 10)}.${d.slice(5, 7)}`;
    }

    // Месяцы, в которых есть операции (по порядку)
    function monthsInStatement() {
      const set = new Set(txs.filter(t => t.date).map(t => t.date.slice(0, 7)));
      return [...set].sort();
    }

    // Пометка, если за месяц данные неполные (выписка началась или закончилась внутри месяца)
    function coverageNote(ym) {
      const dates = txs.map(t => t.date).filter(Boolean).sort();
      if (!dates.length) return "";
      const from = header.from || dates[0];
      const to = header.to || dates[dates.length - 1];
      const [y, m] = ym.split("-").map(Number);
      const first = `${ym}-01`;
      const last = `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
      const a = from > first ? from : first;
      const b = to < last ? to : last;
      if (a !== first || b !== last) return `неполный месяц: данные с ${Number(a.slice(8))} по ${Number(b.slice(8))} число`;
      // Несколько выписок с разными периодами: месяц считается неполным, только если какая-то выписка
      // затрагивает его частично (начинается или заканчивается внутри месяца). Выписка, которая месяц
      // вообще не касается (например, счёт открыт позже), неполным его не делает.
      if (statements.some(st => st.from && st.to && st.from <= b && st.to >= a && (st.from > a || st.to < b))) return "неполный месяц: его целиком охватывают не все загруженные выписки";
      return "";
    }

    // Траты по категориям для списка операций.
    // «Переводы между своими» и «Дал в долг» в траты не входят, но показываются отдельной строкой.
    function statsFor(list) {
      const sums = new Map();
      let total = 0, own = 0, loan = 0, saved = 0;
      for (const tx of list) {
        if (tx.amount >= 0) {
          if (displayCat(tx) === Cat.SAVINGS) saved -= tx.amount;                     // снятие с накоплений уменьшает «отложено»
          else if (displayCat(tx) === Cat.LOAN) loan -= tx.amount;                    // вернули долг: уменьшает «дал в долг»
          else if (isRefund(tx)) sums.set(displayCat(tx), (sums.get(displayCat(tx)) || 0) - tx.amount);   // возврат уменьшает траты своей категории
          continue;
        }
        const cat = displayCat(tx) || "Не разобрано";
        if (cat === Cat.OWN) { own += -tx.amount; continue; }
        if (cat === Cat.LOAN) { loan += -tx.amount; continue; }
        if (cat === Cat.SAVINGS) { saved += -tx.amount; continue; }
        sums.set(cat, (sums.get(cat) || 0) + -tx.amount);
      }
      // Возврат больше покупок за период: категория просто обнуляется, в минус не уходит
      const rows = [...sums.entries()].filter(([, v]) => v > 0.004).sort((a, b) => b[1] - a[1]);
      total = rows.reduce((a, [, v]) => a + v, 0);
      // Сколько возвратов не поместилось в свои категории (покупка была до начала периода): в «Потрачено» и «Пришло» их нет, говорим об этом отдельно
      const refundOver = Math.round([...sums.values()].filter(v => v < -0.004).reduce((a, v) => a - v, 0) * 100) / 100;
      const r2 = v => (Math.abs(v) < 0.005 ? 0 : v);
      return { rows, total, own, loan: r2(loan), saved: r2(saved), refundOver };
    }

    // Блок: заголовок, пояснение, таблица с полосками по категориям
    // Цвет категории: один и тот же в диаграмме, легенде и таблице (переменные --cat-* темы «Графит»).
    // Стандартные категории закреплены за ключами; «Прочее», корзины и «Не разобрано» серые; свои получают цвет по названию (всегда один и тот же).
    const CAT_COLOR = {
      "Продукты": "food", "Кафе и рестораны": "cafe", "Транспорт": "transport", "Путешествия": "transport",
      "Аренда и жильё": "home", "Товары для дома": "home", "Связь и подписки": "subs", "Образование": "subs",
      "Здоровье": "health", "Красота и уход": "health", "Одежда и покупки": "shop", "Подарки": "shop",
      "Развлечения": "fun", "Азартные игры": "fun", "Наличные": "cash", "Прочее": "other", "Не разобрано": "other",
      [Cat.OWN]: "transfer", [Cat.LOAN]: "transfer", [Cat.SAVINGS]: "transfer", [Cat.FEES]: "transfer",
      [Cat.BUCKETS[0]]: "other", [Cat.BUCKETS[1]]: "other", [Cat.BUCKETS[2]]: "transfer"
    };
    // «Нужно разобрать»: корзины (интернет-банк, ЕРИП) и «Не разобрано» на диаграмме сливаются в одну долю справа:
    // нейтральная заливка с пунктирной рамкой (как плашка «Нужно разобрать»), чтобы не путать с цветными категориями и серой группой мелких
    const REVIEW_CATS = new Set([...Cat.BUCKETS, "Не разобрано"]);
    // «Переводы на карты и счета» тоже ждут уточнения (свой счёт или другой человек), но на диаграмме это своя понятная доля,
    // а не часть «Нужно разобрать»: человек видит, что это переводы, а не «неизвестно куда»
    const TR_BUCKET = Cat.BUCKETS[2];
    const inReviewSlice = cat => REVIEW_CATS.has(cat) && cat !== TR_BUCKET;
    const CUSTOM_KEYS = ["food", "cafe", "transport", "home", "subs", "health", "shop", "fun"];
    const catVar = cat => "--cat-" + ((Object.prototype.hasOwnProperty.call(CAT_COLOR, cat) && CAT_COLOR[cat]) || (Object.prototype.hasOwnProperty.call(customColors, cat) && CUSTOM_KEYS.includes(customColors[cat]) && customColors[cat]) || CUSTOM_KEYS[[...String(cat)].reduce((a, c) => a + c.charCodeAt(0), 0) % CUSTOM_KEYS.length]);
    const catColor = cat => `var(${catVar(cat)})`;
    // Цвет подписи на доле: тёмный или светлый, смотря по яркости цвета в текущей теме (контраст не ниже ~4:1)
    function inkFor(varName) {
      try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        const m = /^#([0-9a-f]{6})$/i.exec(v);
        if (m) {
          const c = [0, 2, 4].map(i => parseInt(m[1].substr(i, 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
          return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 0.19 ? "#16181B" : "#F7F8F9";
        }
      } catch (e) { /* без вычисления: тёмный */ }
      return "#16181B";
    }
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    // Кольцо: у каждой доли значок и процент прямо на диаграмме (если доля достаточно большая).
    // Совсем мелкие категории (меньше 3%) сливаются в одну серую долю, чтобы кольцо не рябило.
    // Подсказка не всплывает над диаграммой, а показывается в отдельной строке над ней и мгновенно.
    // Доля в процентах для подписи: ненулевая сумма меньше 0.5% показывается как «<1%», а не «0%»
    const pctText = (part, total) => { if (!total || !part) return "0%"; const p = Math.round(part / total * 100); return p < 1 ? "<1%" : p + "%"; };
    function pieChart(st, opts = {}) {
      const MIN = 0.03;
      const MAX_SEPARATE_SMALL = 4;   // до 4 мелких категорий рисуем каждую своим цветом, больше: одна серая доля «Мелкие категории»
      const slices = [];
      const small = [];
      // «Нужно разобрать» идёт первой и ставится по центру правой стороны кольца (в 3 часа)
      const review = st.rows.filter(([cat]) => inReviewSlice(cat));
      const reviewSum = review.reduce((a, [, v]) => a + v, 0);
      if (review.length) slices.push({ cats: review, sum: reviewSum, color: "var(--surface-2)", v: "--surface-2", group: true, review: true });
      st.rows.forEach(([cat, sum]) => {
        if (inReviewSlice(cat)) return;
        if (sum / st.total < MIN) small.push([cat, sum]);
        else slices.push({ cats: [[cat, sum]], sum, color: catColor(cat), v: catVar(cat) });
      });
      const sliceOf = new Map();               // категория -> номер доли
      slices.forEach((sl, i) => sl.cats.forEach(([c]) => sliceOf.set(c, i)));
      if (small.length > MAX_SEPARATE_SMALL) {
        const sum = small.reduce((a, [, v]) => a + v, 0);
        slices.push({ cats: small, sum, color: "var(--cat-other)", v: "--cat-other", group: true });
        small.forEach(([cat]) => sliceOf.set(cat, slices.length - 1));
      } else {
        small.forEach(([cat, sum]) => { slices.push({ cats: [[cat, sum]], sum, color: catColor(cat), v: catVar(cat) }); sliceOf.set(cat, slices.length - 1); });
      }

      const CX = 50, CY = 50, R = 47, r = 24, M = (R + r) / 2;
      const pt = (rad, ang) => [CX + rad * Math.cos(ang), CY + rad * Math.sin(ang)];
      let acc = review.length && st.total ? 0.25 - reviewSum / st.total / 2 : 0, parts = "";
      slices.forEach((sl, i) => {
        const p0 = parts.length;
        const f = sl.sum / st.total;
        const a0 = -Math.PI / 2 + acc * 2 * Math.PI, a1 = a0 + f * 2 * Math.PI;
        acc += f;
        let shape;
        if (f > 0.9999) {
          shape = `<circle class="slice" data-i="${i}" cx="${CX}" cy="${CY}" r="${M}" fill="none" style="stroke:${sl.color}"/>`;
        } else {
          const [x0, y0] = pt(R, a0), [x1, y1] = pt(R, a1), [x2, y2] = pt(r, a1), [x3, y3] = pt(r, a0);
          const big = f > 0.5 ? 1 : 0;
          shape = `<path class="slice" data-i="${i}" style="fill:${sl.color}${sl.review ? ";stroke:var(--muted);stroke-dasharray:1.6 1.2;stroke-width:.7" : ""}" d="M${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 ${big} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}A${r} ${r} 0 ${big} 0 ${x3.toFixed(2)} ${y3.toFixed(2)}Z"/>`;
        }
        parts += shape;
        const ink = inkFor(sl.v);
        const pct = Math.round(f * 100);
        const [mx, my] = pt(M, (a0 + a1) / 2);
        if (f >= 0.06) {
          const icon = sl.group || f < 0.12 ? "" : `<g class="lbl" style="stroke:${ink}" transform="translate(${(mx - 3.6).toFixed(2)} ${(my - 8.2).toFixed(2)}) scale(0.3)">${ICON_SVG[iconKey(sl.cats[0][0])] || ICON_SVG.tag}</g>`;
          parts += icon + `<text class="pct" style="fill:${ink}" x="${mx.toFixed(2)}" y="${(my + (sl.group || f < 0.12 ? 1.8 : 6)).toFixed(2)}" text-anchor="middle" font-size="4.6">${pct}%</text>`;
        } else if (f >= 0.05) {
          parts += `<text class="pct" style="fill:${ink}" x="${mx.toFixed(2)}" y="${(my + 1.5).toFixed(2)}" text-anchor="middle" font-size="3.6">${pct}%</text>`;
        }
        // Выдвинутая доля (пример на главной): сдвиг наружу по середине доли, без обводки
        if (opts.pull && f < 0.5 && sl.cats.some(([c]) => c === opts.pull)) {
          const am = (a0 + a1) / 2;
          parts = parts.slice(0, p0) + `<g transform="translate(${(2.5 * Math.cos(am)).toFixed(2)} ${(2.5 * Math.sin(am)).toFixed(2)})">` + parts.slice(p0) + "</g>";
        }
      });

      // Подсказка: строка над диаграммой (место под неё зарезервировано, поэтому диаграмма не прыгает)
      const topTip = h("div", { class: "pietip" });
      const tipNodes = i => {
        const sl = slices[i];
        const pct = Math.round(sl.sum / st.total * 100);
        const sw = h("span", { class: sl.review ? "sw review" : "sw" });
        if (!sl.review) sw.style.background = sl.color;
        const head = sl.group
          ? h("div", {}, sw, h("b", {}, sl.review ? "Не разобрано" : "Мелкие категории"), ` · ${fmt(sl.sum)} ${CUR} · ${pct}%`)
          : h("div", {}, sw, iconEl(iconKey(sl.cats[0][0])), h("b", {}, sl.cats[0][0]), ` · ${fmt(sl.sum)} ${CUR} · ${pct}%`);
        const nodes = [head];
        if (sl.group) nodes.push(h("div", { class: "muted" }, sl.cats.map(([c, v]) => `${c}: ${fmt(v)}`).join("; ")));
        return nodes;
      };
      const defIdx = opts.pick ? (sliceOf.has(opts.pick) ? sliceOf.get(opts.pick) : -1) : -1;   // доля, подписанная заранее (пример на главной)
      const hideTip = () => { if (defIdx >= 0) { topTip.replaceChildren(...tipNodes(defIdx)); return; } topTip.replaceChildren(h("span", { class: "muted" }, (typeof matchMedia === "function" && matchMedia("(hover: none)").matches) ? "Нажмите на долю" : "Наведите или нажмите на долю")); };
      const show = i => { topTip.replaceChildren(...tipNodes(i)); };
      hideTip();

      const wrap = h("div", { class: "pie" });
      const left = h("div", { class: "pieleft" });
      const svg = document.createElement("span");
      svg.innerHTML = `<svg class="donut" viewBox="0 0 100 100" role="img" aria-label="Круговая диаграмма трат">${parts}` +
        `<text x="50" y="49" text-anchor="middle" font-size="7" font-weight="600" fill="currentColor">${fmt(st.total)}</text>` +
        `<text x="50" y="57" text-anchor="middle" font-size="4" fill="currentColor" opacity=".65">${CUR}</text></svg>`;
      left.append(topTip, svg);
      wrap.append(left);

      const legend = h("div", { class: "legend" });
      st.rows.forEach(([cat, sum], i) => {
        const si = sliceOf.get(cat);
        const sw = h("span", { class: slices[si].review ? "sw review" : "sw" });
        if (!slices[si].review) sw.style.background = slices[si].color;
        const oa = catOpenAttrs(cat, opts.onCat);
        const row = h("div", { ...oa, class: "lrow" + (oa.class ? " " + oa.class : "") }, h("span", { class: "lname" }, catChip(cat)),
          h("span", { class: "num" }, fmt(sum) + " · " + pctText(sum, st.total)));
        row.addEventListener("mouseenter", () => { show(si); markSlice(si); });
        row.addEventListener("mouseleave", () => { hideTip(); markSlice(defIdx); });
        bindCatOpen(row, cat, opts.onCat);
        legend.append(row);
      });
      wrap.append(legend);

      // Подсветка доли и подсказка при наведении (мышь) или нажатии (телефон)
      const markSlice = idx => {
        if (!svg.querySelectorAll) return;
        svg.querySelectorAll(".slice").forEach(el => el.classList.toggle("hot", +el.getAttribute("data-i") === idx));
      };
      if (svg.addEventListener) {
        const handler = e => {
          const el = e.target.closest && e.target.closest(".slice");
          if (el) { const i = +el.getAttribute("data-i"); show(i); markSlice(i); }
        };
        svg.addEventListener("mouseover", handler);
        svg.addEventListener("click", handler);
        svg.addEventListener("mouseleave", () => { hideTip(); markSlice(defIdx); });
      }
      markSlice(defIdx);
      return wrap;
    }
    function viewSwitch() {
      const mk = (id, label) => {
        const b = h("button", { type: "button", class: summaryView === id ? "active" : "" }, label);
        b.addEventListener("click", () => { summaryView = id; saveJSON("ba_view_v1", summaryView); render(); });
        return b;
      };
      const sw = h("div", { class: "viewswitch" }, mk("table", "Таблица"), mk("pie", "Диаграмма"));
      return sw;
    }

    // Плашка над диаграммой: «Прочее» занимает много, а вернуть разбор раньше было негде
    const otherUndo = [];
    // Порог зависит от длины показанного периода: чем короче, тем он выше (одна операция сильно меняет долю).
    // 6 мес. и больше: 20%, 3 мес.: 25%, 1 мес.: 30%, меньше месяца: 35%; между точками линейно. Нужно ещё хотя бы 5 операций.
    const OTHER_MIN_OPS = 5;
    function otherThreshold(days) {
      const pts = [[15, 0.35], [30, 0.30], [90, 0.25], [180, 0.20]];
      if (days <= pts[0][0]) return pts[0][1];
      for (let i = 1; i < pts.length; i++) if (days <= pts[i][0]) {
        const [d0, v0] = pts[i - 1], [d1, v1] = pts[i];
        return v0 + (v1 - v0) * (days - d0) / (d1 - d0);
      }
      return pts[pts.length - 1][1];
    }
    function otherPlateInfo() {
      const period = currentPeriod();
      const list = txs.filter(t => t.date && (period === "all" || t.date.startsWith(period)));
      const dates = list.map(t => t.date).sort();
      const days = dates.length ? Math.round((Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 864e5) + 1 : 0;
      const ops = list.filter(t => t.amount < 0 && !t.pair && displayCat(t) === "Прочее").length;
      return { threshold: otherThreshold(days), ops };
    }
    function otherPlate(st) {
      const row = st.rows.find(r => r[0] === "Прочее");
      if (!row || !st.total) return null;
      const info = otherPlateInfo();
      if (row[1] / st.total < info.threshold || info.ops < OTHER_MIN_OPS) return null;
      const pct = Math.round(row[1] / st.total * 100);
      const box = h("div", { class: "note otherplate" });
      const intro = () => box.replaceChildren(
        h("b", {}, `«Прочее»: ${pct}% трат (${fmt(row[1])} ${CUR})`),
        h("div", { class: "muted" }, "Так выглядит картина, если много операций отправлено в «Прочее». Их можно разобрать заново."),
        h("div", { class: "chips" },
          qchip("Разобрать заново", ask, "", "primary"),
          qchip("Показать, что там", () => { allCat = "Прочее"; allFilt = Filters.empty(); bottomTab = "all"; bottomOpen = true; showSection("review"); renderAll(); renderBottom(); })));
      const ask = () => {
        const rules = Object.keys(userRules).filter(k => userRules[k] === "Прочее");
        const tx = Object.keys(txRules).filter(k => txRules[k] === "Прочее");
        const n = txs.filter(t => displayCat(t) === "Прочее" && !t.pair).length;
        box.replaceChildren(
          h("b", {}, `Вернуть в «Уточнить» всё, что сейчас в «Прочее»: ${n} ${opsWord(n)}?`),
          h("div", { class: "muted" }, "Вернутся и те, что вы отметили «Прочее» сами. Остальной ваш выбор не меняется. Сразу после этого можно отменить."),
          h("div", { class: "chips" },
            qchip("Да, вернуть", () => {
              const e = { n, rules: {}, tx: {} };
              rules.forEach(k => { e.rules[k] = userRules[k]; delete userRules[k]; });
              tx.forEach(k => { e.tx[k] = txRules[k]; delete txRules[k]; });
              saveJSON("ba_rules_v1", userRules); saveJSON("ba_txrules_v1", txRules);
              otherUndo.push(e); if (otherUndo.length > 3) otherUndo.shift();
              render(); showSection("review");
            }, "", "primary"),
            qchip("Отмена", intro)));
      };
      intro();
      return box;
    }
    // Нажатие на категорию в «Обзоре»: её операции в «Уточнить» → «Все операции», там категорию можно сменить
    function openCatOps(cat) {
      if (REVIEW_CATS.has(cat)) { bottomTab = "review"; bottomOpen = true; showSection("review"); renderBottom(); return; }
      allCat = cat; allFilt = Filters.empty(); bottomTab = "all"; bottomOpen = true; showSection("review"); renderAll(); renderBottom();
    }
    const catOpenAttrs = (cat, onCat) => onCat ? { class: "catopen", role: "button", tabindex: "0", title: "Показать операции и поменять категорию", "aria-label": `${cat}: показать операции` } : {};
    function bindCatOpen(el, cat, onCat) {
      if (!onCat || !el.addEventListener) return el;
      el.addEventListener("click", () => onCat(cat));
      el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCat(cat); } });
      return el;
    }
    // Таблица трат по категориям с полосками (в отчёте и в примере на стартовом экране)
    function catTable(st, onCat) {
      const max = st.rows.length ? st.rows[0][1] : 1;
      return h("table", {},
          h("tr", {}, h("th", {}, "Категория"), h("th", { class: "num" }, `Сумма, ${CUR}`), h("th", { class: "num" }, "Доля"), h("th", { style: "width:35%" }, "")),
          st.rows.map(([cat, sum]) => bindCatOpen(h("tr", catOpenAttrs(cat, onCat),
            h("td", {}, inReviewSlice(cat) ? [h("span", { class: "sw review" }), iconEl(iconKey(cat)), cat] : catChip(cat)),
            h("td", { class: "num" }, fmt(sum)),
            h("td", { class: "num" }, st.total ? pctText(sum, st.total) : ""),
            h("td", {}, h("div", { class: "barwrap" }, h("div", { class: "bar", style: `width:${sum / max * 100}%;background:${catColor(cat)}` })))), cat, onCat)),
          h("tr", {}, h("th", {}, "Итого"), h("th", { class: "num" }, fmt(st.total)), h("th", {}, ""), h("th", {}, "")));
    }
    function summarySection(title, note, st) {
      const max = st.rows.length ? st.rows[0][1] : 1;
      const parts = [];
      if (title) parts.push(h("h3", { style: "margin-bottom:.2rem" }, `${title} · ${fmt(st.total)} ${CUR}`));
      if (note) parts.push(h("div", { class: "muted" }, note));
      if (!st.rows.length) {
        parts.push(h("p", {}, "Расходов нет."));
      } else if (summaryView === "pie") {
        const plate = otherPlate(st);
        if (plate) parts.push(plate);
        parts.push(viewSwitch(), pieChart(st, { onCat: openCatOps }));
      } else {
        { const plate = otherPlate(st); if (plate) parts.push(plate); }
        parts.push(viewSwitch());
        parts.push(catTable(st, openCatOps));
      }
      // Пояснения под диаграммой: короткий список, а не сплошной серый текст. Подсказка про переводы идёт первой:
      // она сильнее всего меняет итог (переводы на свои карты завышают «Потрачено»)
      const notes = [];
      const tr = st.rows.find(r => r[0] === TR_BUCKET);
      if (tr) notes.push(h("li", { class: "onote-key" }, h("b", {}, `Переводы на карты и счета: ${fmt(tr[1])} ${CUR}. `),
        "Если часть из них на ваши же карты, отметьте их «Мой счёт» в разделе «Уточнить»: они уйдут из трат.",
        " ", h("button", { type: "button", class: "linklike", onclick: () => openCatOps(TR_BUCKET) }, "Уточнить переводы ›")));
      { const cash = st.rows.find(r => /^Наличные/.test(r[0])); if (cash && st.total && cash[1] / st.total >= 0.05) notes.push(h("li", {}, `Наличные (${fmt(cash[1])} ${CUR}): по выписке не видно, на что они потрачены.`)); }
      if (st.rows.some(r => r[0] !== TR_BUCKET && Cat.BUCKETS.includes(r[0]))) notes.push(h("li", {}, "ЕРИП и интернет-банк: в выписке виден только способ оплаты, а не покупка. Их можно уточнить в разделе «Уточнить»."));
      { // Одно число «не разобрано»: строка «Не разобрано» в списке это только операции совсем без категории, а ЕРИП, интернет-банк и переводы по карте идут отдельными строками
        const un = st.rows.find(r => r[0] === "Не разобрано"), allUnclear = st.rows.filter(r => isUnclear(r[0])).reduce((a, r) => a + r[1], 0);
        if (un && st.total && allUnclear - un[1] >= 1) notes.push(h("li", {}, `Строка «Не разобрано» это операции совсем без категории. Вместе с ЕРИП, интернет-банком и переводами на карты не разобрано ${Math.round(allUnclear / st.total * 100)}% трат.`));
      }
      const extra = [];
      if (st.own) { const pc = Merge.pairCount(txs); extra.push(`переводы между своими: ${fmt(st.own)}` + (pc ? ` (${pc} ${plur(pc, "пара", "пары", "пар")} «пришло и сразу ушло» найдены сами, в «Все операции» они с пометкой ⇄)` : "")); }
      if (st.loan > 0) extra.push(`дал в долг: ${fmt(st.loan)}`);
      if (st.saved > 0) extra.push(`отложено в накопления: ${fmt(st.saved)}`);
      if (extra.length) notes.push(h("li", {}, `В траты не входит: ${extra.join("; ")} ${CUR}.`));
      { const back = [];
        if (st.loan < 0) back.push(`вернули долг: ${fmt(-st.loan)}`);
        if (st.saved < 0) back.push(`снято с накоплений: ${fmt(-st.saved)}`);
        if (back.length) notes.push(h("li", {}, `В «Пришло» не входит: ${back.join("; ")} ${CUR}.`)); }
      if (st.refundOver >= 1) notes.push(h("li", {}, `Возвраты на ${fmt(st.refundOver)} ${CUR} больше покупок в своих категориях за этот период (сама покупка была раньше): эти деньги не уменьшили «Потрачено» и не вошли в «Пришло».`));
      if (notes.length) parts.push(h("ul", { class: "onotes" }, notes));
      return h("div", { class: "ocard" }, h("h3", { class: "ohead" }, "Траты по категориям"), parts);
    }

