    // ---------- Чтение PDF ----------
    // CSV-выписка (пока Приорбанк): кодировка windows-1251, разбор тот же, что и у PDF
    async function readCsv(file, label) {
      if (file.size > 20 * 1024 * 1024) throw new Error("файл слишком большой для выписки");
      const text = PriorCsvParser.decode(new Uint8Array(await file.arrayBuffer()));
      const res = Banks.parseCsv(text);
      if (!res) {
        // Не Приорбанк: читаем таблицу тем же путём, что и PDF неизвестного банка
        let grid = null; try { grid = Universal.gridFromTable(Sheets.parseCsv(text)); } catch (e) { grid = null; }
        const u = await readUnknown(grid, file, label);
        if (u) return u;
        throw Object.assign(new Error("в этой таблице не нашлось колонок с датой и суммой. Попробуйте скачать выписку в PDF (где его взять, написано на главной) или подготовьте образец и отправьте автору (откроется пошаговое окно)"), { unsupported: true });
      }
      if (!res.txs.length) throw new Error("выписка " + res.bank.name + " распознана, но операций в ней не нашлось");
      const v = res.bank.validate(res.txs, res.header);
      res.check = res.header.income == null ? null :
        { headerIncome: res.header.income, headerExpense: res.header.expense, income: v.income, expense: v.expense, pending: v.pending || 0, incomeOk: v.incomeOk, expenseOk: v.expenseOk, ok: v.ok, accounts: res.header.accounts || 1 };
      addGap(res);
      return res;
    }
    // Сверка не сошлась: по цепочке остатков ищем, между какими датами пропала операция (если остатки в выписке есть)
    function addGap(res) {
      if (!res.check || res.check.ok || !Banks.balanceGap) return;
      const g = Banks.balanceGap(res.txs);
      if (g) { res.check.gapFrom = g.from; res.check.gapTo = g.to; }
    }
    // ---------- Банк не из списка: окно «Так читаем?» ----------
    // Показывает первые операции, как их прочитал сайт, и колонки файла с подписями; подпись колонки можно поменять.
    // Возвращает результат Universal.guess (с правками человека) или null, если человек отказался.
    let uniFinish = null;
    function askUniversal(grid, first) {
      return new Promise(resolve => {
        let cur = first, roles = first.roles.slice(), stuck = false;
        const sample = Universal.preview(grid, 3);
        const UNIQUE = ["date", "amount", "expense", "income", "balance", "currency", "sign"];
        const draw = () => {
          const p = cur.proof;
          $("uniProof").className = "uniproof" + (stuck || p === "mismatch" || p === "accounts" ? " bad" : p === "totals" || p === "balance" ? " ok" : "");
          $("uniProof").textContent = stuck ? "Так прочитать не получается: нужна колонка с датой и колонка с суммой (или «Расход» и «Приход»)."
            : p === "totals" ? "Проверено: суммы сошлись с итогами в самой выписке ✓"
            : p === "balance" ? "Проверено: суммы сходятся с остатком после каждой операции ✓"
            : p === "accounts" ? "Похоже, в файле несколько счетов: остаток несколько раз начинается заново. Операции всех счетов будут сложены вместе; если счета в разных валютах, итог получится неверным. Надёжнее загрузить выписку по каждому счёту отдельно."
            : p === "mismatch" ? "Суммы не сошлись с итогами выписки ✗. Посмотрите колонки ниже: возможно, сумма взята не из той."
            : "Прочитано по догадке: в выписке нет итогов и остатков, проверить суммы нечем. Сверьте операции ниже со своей выпиской.";
          const c = cur.header.currency || "BYN";
          $("uniOps").replaceChildren(...cur.txs.slice(0, 5).map(t => h("div", { class: "uniop" },
            h("span", {}, Banks.realDate(t.date) ? fmtDate(t.date) : "дата не читается"),
            h("span", { class: "unia" + (t.amount > 0 ? " pos" : "") }, Number.isFinite(t.amount) ? (t.amount > 0 ? "+" : "−") + fmt(Math.abs(t.amount)) + " " + c : "сумма не читается"),
            h("span", { class: "unit" }, t.details || "без описания"))));
          const good = cur.txs.filter(t => Number.isFinite(t.amount) && Banks.realDate(t.date)), bad = cur.txs.length - good.length;
          $("uniSum").textContent = `Всего ${good.length} ${opsWord(good.length)}` + (cur.header.from ? ` за ${fmtDate(cur.header.from)} — ${fmtDate(cur.header.to)}` : "") +
            `: пришло ${fmt(cur.check.income)}, ушло ${fmt(cur.check.expense)} ${c}. Как понято: ${cur.how}.` + (bad ? ` Не читается ${bad} ${opsWord(bad)}.` : "");
          $("uniCols").replaceChildren(...grid.cols.map((col, j) => {
            const ex = sample.map(r => r[j]).filter(Boolean);
            if (!ex.length && roles[j] === "skip") return null;
            const sel = h("select", { "aria-label": "Что в колонке " + (col.title || j + 1), onchange: ev => {
              const v = ev.currentTarget.value;
              if (UNIQUE.includes(v)) roles = roles.map((r, k) => k !== j && (r === v || (v === "amount" && (r === "expense" || r === "income")) || ((v === "expense" || v === "income") && r === "amount")) ? "skip" : r);
              roles[j] = v;
              let next = null; try { next = Universal.guess(grid, roles); } catch (e) { next = null; }
              stuck = !(next && next.txs.length);
              if (!stuck) cur = next;
              draw();
            } }, ...Universal.ROLES.map(([id, name]) => h("option", { value: id }, name)));
            sel.value = roles[j];
            return h("div", { class: "unicol" }, sel, h("div", { class: "unic" }, h("b", {}, col.title || "Без названия"), h("small", {}, ex.length ? ex.join(" · ") : "пусто")));
          }).filter(Boolean));
          $("uniOk").disabled = stuck;
        };
        uniFinish = ok => { uniFinish = null; $("uniSheet").hidden = true; resolve(ok && !stuck ? cur : null); };
        $("uniReset").onclick = () => { cur = first; roles = first.roles.slice(); stuck = false; draw(); };
        $("uniColsBox").open = first.proof === "mismatch";
        draw();
        $("uniSheet").hidden = false;
        try { $("uniSheet").querySelector(".modalcard").focus(); } catch (e) { /* без фокуса */ }
      });
    }
    // Пароль от PDF: своё окно в стиле сайта вместо системного window.prompt. Возвращает пароль или null (отмена).
    let pwFinish = null;
    function askPassword(text) {
      return new Promise(resolve => {
        pwFinish = v => { pwFinish = null; $("pwSheet").hidden = true; $("pwInput").value = ""; resolve(v); };
        $("pwText").textContent = text;
        $("pwInput").value = "";
        $("pwSheet").hidden = false;
        try { $("pwInput").focus(); } catch (e) { /* без фокуса */ }
      });
    }
    $("pwForm").addEventListener("submit", e => { e.preventDefault(); if (pwFinish) pwFinish($("pwInput").value || null); });
    $("pwCancel").addEventListener("click", () => { if (pwFinish) pwFinish(null); });
    $("pwSheet").addEventListener("click", e => { if (e.target === $("pwSheet") && pwFinish) pwFinish(null); });
    if (document.addEventListener) document.addEventListener("keydown", e => { if (e.key === "Escape" && pwFinish) pwFinish(null); });
    $("uniOk").addEventListener("click", () => { if (uniFinish) uniFinish(true); });
    $("uniCancel").addEventListener("click", () => { if (uniFinish) uniFinish(false); });
    if (document.addEventListener) document.addEventListener("keydown", e => { if (e.key === "Escape" && uniFinish) uniFinish(false); });
    // Банк не узнан: пробуем прочитать по колонкам и спрашиваем человека. null: прочитать не вышло (дальше обычная ошибка).
    async function readUnknown(grid, file, label) {
      let first = null;
      try { first = grid ? Universal.guess(grid) : null; } catch (e) { first = null; }
      if (!first || !first.txs.some(t => Number.isFinite(t.amount) && Banks.realDate(t.date))) return null;
      setStatus(`${label}Этого банка нет в списке: проверьте, верно ли прочитано…`);
      const g = await askUniversal(grid, first);
      if (!g) throw Object.assign(new Error("чтение отменено"), { unsupported: /\.(pdf|csv)$/i.test(file.name) });
      const res = Banks.fromUniversal(g);
      if (!res.txs.length) throw new Error("операций в файле не нашлось");
      const v = res.bank.validate(res.txs, res.header);
      res.check = res.header.income == null || res.header.expense == null ? null :
        { headerIncome: res.header.income, headerExpense: res.header.expense, income: v.income, expense: v.expense, pending: v.pending || 0, incomeOk: v.incomeOk, expenseOk: v.expenseOk, ok: v.ok };
      res.uni = { proof: g.proof === "accounts" ? "accounts" : res.check && !res.check.ok ? "mismatch" : g.proof };
      addGap(res);
      statsPing("другой-банк");
      return res;
    }
    // Excel: .xlsx и таблицы HTML под видом .xls. Читается тем же путём, что и PDF неизвестного банка.
    async function readSheet(file, label) {
      if (file.size > 20 * 1024 * 1024) throw new Error("файл слишком большой для выписки");
      setStatus(`${label}Открываю таблицу…`);
      const tables = await Sheets.read(new Uint8Array(await file.arrayBuffer()), file.name);
      const grids = tables.map(t => { try { return Universal.gridFromTable(t); } catch (e) { return null; } }).filter(Boolean).sort((a, b) => b.rows.length - a.rows.length);
      const u = await readUnknown(grids[0] || null, file, label);
      if (u) return u;
      throw new Error("в этой таблице не нашлось колонок с датой и суммой. Попробуйте скачать выписку из банка в PDF (где его взять, написано на главной)");
    }
    // Читает один файл и возвращает { bank, header, txs, check } или бросает ошибку с понятным текстом
    // Чтение PDF не должно висеть вечно: испорченный файл может «зациклить» читалку. Ждём шаг не дольше минуты и говорим об этом прямо
    const PDF_MAX_PAGES = 3000, PDF_MAX_PIECES = 600000, PDF_STEP_MS = 60000;
    const STUCK_MSG = "файл читается слишком долго: похоже, он повреждён. Попробуйте скачать выписку заново";
    function notForever(promise, ms) {
      let timer;
      const stop = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(STUCK_MSG), { stuck: true })), ms || PDF_STEP_MS); });
      return Promise.race([promise, stop]).finally(() => clearTimeout(timer));
    }
    async function readStatement(file, label) {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
      if (isCsv) return readCsv(file, label);
      if (/\.(xlsx|xlsm|xls)$/i.test(file.name) || /spreadsheet|ms-excel/.test(file.type || "")) return readSheet(file, label);
      if (!isPdf) throw new Error("формат не поддерживается. Нужна выписка из интернет-банка: PDF, CSV или Excel (.xlsx). Word и картинки не читаются");
      let pdf;
      if (file.size > 20 * 1024 * 1024) throw new Error("файл слишком большой для выписки");
      setStatus(`${label}Открываю PDF…`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      let password = null;
      for (let attempt = 0; ; attempt++) {
        try {
          pdf = await notForever(openPdf(bytes, password));
          break;
        } catch (err) {
          if (err && err.name === "PasswordException") {
            if (attempt >= 3) throw new Error("PDF защищён паролем, а пароль не подошёл. Пароль обычно приходит в письме или SMS вместе с выпиской");
            const ask = attempt === 0
              ? `Файл «${file.name}» защищён паролем. Введите пароль от выписки (обычно он в письме или SMS от банка). Пароль используется только здесь, в вашем браузере, и нигде не сохраняется.`
              : "Пароль не подошёл. Попробуйте ещё раз:";
            password = await askPassword(ask);
            if (!password) throw new Error("PDF защищён паролем. Загрузите файл ещё раз и введите пароль, или скачайте выписку без пароля");
            setStatus(`${label}Открываю PDF с паролем…`);
            continue;
          }
          if (err && err.stuck) throw new Error(STUCK_MSG);
          throw new Error("файл не открывается: он повреждён или это не настоящий PDF. Попробуйте скачать выписку заново");
        }
      }
      // Пределы для испорченных и нарочно раздутых файлов: настоящая выписка за несколько лет это сотни страниц, а не тысячи
      if (pdf.numPages > PDF_MAX_PAGES) throw new Error(`в файле ${pdf.numPages} страниц: для выписки это слишком много. Скачайте выписку за меньший период`);
      const pages = [];
      let pieces = 0;
      for (let p = 1; p <= pdf.numPages; p++) {
        setStatus(`${label}Читаю страницу ${p} из ${pdf.numPages}…`);
        let page, content;
        try { page = await notForever(pdf.getPage(p)); content = await notForever(page.getTextContent()); }
        catch (err) { throw new Error(err && err.stuck ? STUCK_MSG : `страница ${p} не читается: файл повреждён. Попробуйте скачать выписку заново`); }
        const t = page.getViewport({ scale: 1 }).transform;   // учитывает поворот страницы (выписка ВТБ альбомная)
        pieces += content.items.length;
        if (pieces > PDF_MAX_PIECES) throw new Error("в файле слишком много текста для выписки. Скачайте выписку за меньший период");
        pages.push(content.items.map(i => {
          const x = i.transform[4], y = i.transform[5];
          return { x, y, vx: t[0] * x + t[2] * y + t[4], vy: t[1] * x + t[3] * y + t[5], w: i.width, text: i.str };
        }));
      }
      if (!pages.some(pg => pg.some(i => i.text.trim()))) {
        throw new Error("в PDF нет текста: похоже на скан или фотографию. Нужна выписка, скачанная из интернет-банка, а не сфотографированная");
      }
      const res = Banks.parse(pages);
      const partial = !res && Banks.partialOf ? Banks.partialOf(pages) : null;
      if (partial) throw new Error("похоже на выписку «" + partial + "», но без начала: нет первой страницы с итогами и периодом. Скачайте выписку из банка заново целиком и загрузите весь файл");
      // Банк не узнан, или узнан по общей фразе, но его парсер ничего не нашёл (значит, это другой банк): читаем по колонкам
      if (!res || !res.txs.length) {
        let grid = null; try { grid = Universal.gridFromPages(pages); } catch (e) { grid = null; }
        const u = await readUnknown(grid, file, label);
        if (u) return u;
      }
      if (!res) throw Object.assign(new Error("этого банка нет в списке, и прочитать выписку по колонкам не получилось (из списка читаются: " + bankNames + "). Если ваш банк в этом списке, проверьте, что файл целый, с первой страницей: по ней сайт узнаёт банк. Можно за пару минут подготовить образец без личных данных и отправить автору (откроется пошаговое окно): тогда банк добавим. Файл пока никуда не отправлялся"), { unsupported: true });
      if (!res.txs.length) throw new Error("выписка " + res.bank.name + " распознана, но операций в ней не нашлось. Возможно, за выбранный период их не было, или банк изменил формат файла");
      const v = res.bank.validate(res.txs, res.header);
      res.check = res.header.income == null ? null :
        { headerIncome: res.header.income, headerExpense: res.header.expense, income: v.income, expense: v.expense, pending: v.pending || 0, incomeOk: v.incomeOk, expenseOk: v.expenseOk, ok: v.ok, accounts: res.header.accounts || 1 };
      addGap(res);
      return res;
    }
    const isRetail = t => !!(t.mcc && Cat.MCC[t.mcc]);

    $("file").addEventListener("change", async () => {
      const files = [...$("file").files];
      if (!files.length) return;
      leaveDemo();
      const notes = [];
      let failedFile = false;   // какой-то файл не прочитался: строку состояния выделяем
      await deviceReady;
      unpark();
      if (!txs.length && keepOnDevice && deviceSnap) {      // новая выписка добавляется к той, что хранится на устройстве (повторы пропускаются)
        try { applyBackup(deviceSnap); notes.push("К выписке, сохранённой на устройстве (" + Device.label(Device.describe(deviceSnap)) + "), добавляется новая."); } catch (e) { /* копия повреждена: работаем без неё */ }
      }
      txs = Splits.collapse(txs);
      let loaded = 0, unsupportedFile = null;
      for (let k = 0; k < files.length; k++) {
        const f = files[k];
        const label = files.length > 1 ? `Файл ${k + 1} из ${files.length}. ` : "";
        try {
          const res = await readStatement(f, label);
          const st = { txs, statements };
          const r = Merge.addStatement(st, res);
          loaded++;
          if (res.uni) Object.assign(statements[r.index], { universal: true, proof: res.uni.proof });
          notes.push(`${f.name}: ${res.bank.name}${res.uni ? (res.bank.name === Banks.OTHER.name ? "" : " (банка нет в списке)") + (res.uni.proof === "totals" || res.uni.proof === "balance" ? ", суммы проверены" : res.uni.proof === "mismatch" ? ", суммы не сошлись" : res.uni.proof === "accounts" ? ", в файле несколько счетов" : ", прочитано по догадке") : ""}, операций ${res.txs.length}, новых ${r.added}` + (r.skipped ? `, повторов пропущено ${r.skipped}` : "") + (res.header.broken ? `, не удалось прочитать операций: ${res.header.broken} (проверьте, что файл целый)` : "") + ".");
          const curNote = Merge.currencyNote(res.header, rates); if (curNote) notes.push(curNote);
        } catch (err) {
          notes.push(`${f.name}: ${String(err.message).replace(/\.$/, "")}.`); failedFile = true;
          if (err && err.unsupported) unsupportedFile = f;
        }
      }
      if (unsupportedFile) { offerSample(unsupportedFile); statsPing("банк-не-читается"); }
      if (loaded) {
        statsPing("загрузил-выписку");
        if (statements.length > 1) {
          const cross = Merge.markCrossPairs(txs, isRetail);
          if (cross) notes.push(`Найдено переводов между выписками: ${cross}. Они не считаются тратами и доходами.`);
        }
        { const back = Merge.markRoundTrips(txs, isRetail); if (back) notes.push(`Переводы, которые в тот же день вернулись на счёт: ${back}. Они не считаются тратами и доходами.`); }
        header = Merge.mergedHeader(statements);
        bottomTab = null;
        curSection = "overview";
        Rates.apply(txs, rates);
        applySplits();
        const cov = rulesCoverage();
        if (cov) notes.push(cov);
        render();
        $("backupMsg").textContent = backupSummary();
        try { window.scrollTo({ top: 0 }); } catch (e) { /* без прокрутки */ }
      }
      setStatus(notes.join("\n"), failedFile);
      $("file").value = "";
    });


