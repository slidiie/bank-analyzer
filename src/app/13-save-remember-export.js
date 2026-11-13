    // ---------- Сохранение и загрузка разбора ----------
    function applyBackup(data) {
      unpark();
      data = Backup.sanitize(data);                 // берём только ожидаемые поля ожидаемых типов
      Object.assign(userRules, data.rules || {});
      Object.assign(txRules, data.txRules || {});
      if ((data.condRules || []).length) { condRules = CondRules.cleanList(condRules.concat(data.condRules.filter(n => !condRules.some(o => JSON.stringify(o) === JSON.stringify(n))))); saveCond(); }
      Object.assign(txNotes, data.notes || {}); saveJSON("ba_notes_v1", txNotes);
      Object.assign(splits, data.splits || {}); saveSplits(); applySplits();
      Object.assign(customIcons, data.icons || {});
      Object.assign(customColors, data.colors || {}); saveJSON("ba_catcolors_v1", customColors);
      Object.assign(acctNames, data.acctNames || {}); saveJSON("ba_acctnames_v1", acctNames);
      Object.assign(budgets, data.budgets || {}); Object.assign(calc, data.calc || {}); savePlan();
      if (Object.keys(data.rates || {}).length) { rates = Object.assign({}, data.rates, rates); saveJSON("ba_rates_v1", rates); }
      (data.cats || []).forEach(c => { if (!customCats.includes(c)) customCats.push(c); });
      mergeDuplicateCats(); renderMergeNote();
      saveJSON("ba_rules_v1", userRules); saveJSON("ba_cats_v1", customCats);
      saveJSON("ba_txrules_v1", txRules); saveJSON("ba_icons_v1", customIcons); saveJSON("ba_catcolors_v1", customColors);
      // Операции из файла: если выписка ещё не загружена, берём их целиком; иначе добавляем недостающие
      if (Array.isArray(data.txs) && data.txs.length) {
        // выписки из файла: у старых файлов списка нет, тогда делаем одну запись из шапки
        const incoming = Array.isArray(data.statements) && data.statements.length ? data.statements :
          [{ bank: (data.header && data.header.bank) || "mtb", from: data.header && data.header.from, to: data.header && data.header.to, count: data.txs.length, added: data.txs.length, skipped: 0, check: null }];
        incoming.forEach(st => { if (!st.bankName) { const b = Banks.BANKS.find(x => x.id === st.bank); st.bankName = b ? b.name : "Выписка"; } });
        if (!txs.length) { txs = data.txs.slice(); statements = incoming.slice(); bottomTab = null; }
        else {
          // Те же правила, что и при загрузке выписки: повторы того же банка пропускаются, номера пар и выписок сдвигаются
          Merge.addSaved({ txs, statements }, data.txs, incoming, data.header && data.header.bank);
          Merge.markCrossPairs(txs, isRetail); Merge.markRoundTrips(txs, isRetail);
        }
        header = Merge.mergedHeader(statements);
        Rates.apply(txs, rates);
        applySplits();
      }
    }
    const backupData = (withTxs = true) => ({ app: "bank-analyzer", version: 3, saved: new Date().toISOString(),
      rules: userRules, txRules: txRules, condRules: condRules, splits: splits, notes: txNotes, cats: customCats, icons: customIcons, colors: customColors, acctNames: acctNames, budgets: budgets, calc: calc, rates: rates, txs: withTxs ? Splits.collapse(txs.concat(parked)) : [], header: withTxs ? header : {}, statements: withTxs ? statements : [] });
    $("exportBtn").addEventListener("click", () => {
      const data = backupData();
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "мой-разбор-трат.json";
      a.click();
      $("backupMsg").textContent = "Сохранено: " + txs.length + " операций выписки и ваш выбор категорий. Файл «мой-разбор-трат.json» в папке загрузок.";
    });
    // Передача на телефон: системное «Поделиться» с файлом (телефон), иначе скачивание и три шага. Сайт сам ничего не отправляет.
    async function sendToPhone(withTxs) {
      const name = withTxs ? "разбор-с-операциями.json" : "разбор-правила.json";
      const text = JSON.stringify(backupData(withTxs), null, 1);
      const msg = $("phoneMsg");
      if (withTxs && !txs.length) { msg.textContent = "Выписка не загружена, поэтому операций нет. Выберите «Только правила и заметки» или сначала загрузите выписку."; return; }
      $("phoneSteps").hidden = false;
      try {
        const file = new File([text], name, { type: "application/json" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "Мой разбор трат" });
          msg.textContent = "Файл передан в выбранное приложение. Дальше шаги ниже.";
          return;
        }
      } catch (e) {
        if (e && e.name === "AbortError") { msg.textContent = "Отправка отменена."; return; }
        /* «Поделиться» не сработало: скачиваем файл */
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      a.download = name;
      a.click();
      msg.textContent = `Файл «${name}» сохранён в папке загрузок` + (withTxs ? ` (в нём ${txs.length} операций)` : " (сумм и названий операций в нём нет)") + ". Дальше шаги ниже.";
    }
    $("phoneRules").addEventListener("click", () => sendToPhone(false));
    $("phoneAll").addEventListener("click", () => sendToPhone(true));
    // ---------- Память между визитами: правила уже на месте, выписка по желанию хранится на этом устройстве ----------
    const isKnownTx = t => !!(txRules[txId(t)] || userRules[Cat.merchantKey(t)]);
    function rulesCoverage() {
      if (!Object.keys(userRules).length && !Object.keys(txRules).length) return "";
      const c = Device.coverage(txs, isKnownTx);
      return c.known ? `Ваши прошлые правила сработали на ${c.known} из ${c.total} трат: их разбирать заново не нужно.` : "";
    }
    const devStore = (() => { try { return Device.openStore(window.indexedDB); } catch (e) { return null; } })();
    let keepOnDevice = !!loadJSON("ba_keep_v1", false) && !!devStore;
    let deviceSnap = null, deviceTimer = null;
    $("keepDevice").checked = keepOnDevice;
    if (!devStore) { $("keepDevice").disabled = true; $("deviceMsg").textContent = "Этот браузер не разрешает хранить данные, поэтому выписку придётся загружать заново. Правила и категории сохраняются."; }
    // Один раз после первой загрузки: человек сам решает, хранить ли выписку (по умолчанию не храним)
    const keepAskPending = () => !!(devStore && txs.length && !demoMode && !keepOnDevice && !loadJSON("ba_keep_asked_v1", false));
    function renderKeepAsk() { $("keepAsk").hidden = !keepAskPending(); }
    $("keepYes").addEventListener("click", () => { saveJSON("ba_keep_asked_v1", true); $("keepDevice").checked = true; $("keepDevice").dispatchEvent(new Event("change")); $("keepAsk").hidden = true; setStatus("Выписка будет храниться на этом устройстве. Выключить можно в «Настройках»."); });
    $("keepNo").addEventListener("click", () => { saveJSON("ba_keep_asked_v1", true); $("keepAsk").hidden = true; });
    function renderDeviceCard() {
      const info = deviceSnap && keepOnDevice ? Device.describe(deviceSnap) : null;
      $("deviceCard").hidden = !info || txs.length > 0 || demoMode;
      $("startBtn").classList.toggle("primary", $("deviceCard").hidden);   // на первом экране одна главная кнопка
      if (info) $("deviceInfo").textContent = Device.label(info) + (Device.when(info) ? ", сохранено " + Device.when(info) : "") + (info.old ? ". Копия давно не обновлялась, лучше загрузить свежую выписку." : ".");
    }
    const deviceReady = (async () => {
      if (!keepOnDevice) return;
      try { const snap = await devStore.get(); if (snap && Device.describe(snap)) deviceSnap = snap; } catch (e) { /* без копии */ }
      renderDeviceCard();
    })();
    function scheduleDeviceSave() {
      if (!keepOnDevice || demoMode || !txs.length) return;
      clearTimeout(deviceTimer);
      deviceTimer = setTimeout(async () => {
        try {
          const snap = Device.makeSnapshot(Splits.collapse(txs.concat(parked)), statements, header);
          await devStore.put(snap); deviceSnap = snap;
        } catch (e) { $("deviceMsg").textContent = "Не удалось сохранить выписку на этом устройстве (возможно, нет места). Остальное работает как обычно."; }
      }, 500);
    }
    function forgetDeviceCopy() {
      if (deviceTimer) clearTimeout(deviceTimer);
      deviceSnap = null;
      if (devStore) devStore.del().catch(() => { /* нечего стирать */ });
      renderDeviceCard();
    }
    $("keepDevice").addEventListener("change", () => {
      keepOnDevice = $("keepDevice").checked && !!devStore;
      saveJSON("ba_keep_v1", keepOnDevice);
      if (keepOnDevice) { $("deviceMsg").textContent = txs.length ? "Включено: выписка сохранена на этом устройстве." : "Включено: после загрузки выписка сохранится на этом устройстве."; scheduleDeviceSave(); }
      else { forgetDeviceCopy(); $("deviceMsg").textContent = "Выключено: сохранённая копия выписки стёрта. Категории и правила остались."; }
    });
    $("deviceOpen").addEventListener("click", () => {
      if (!deviceSnap) return;
      try {
        applyBackup(deviceSnap);
        bottomTab = null; curSection = "overview";
        render();
        setStatus("Открыта выписка, сохранённая на этом устройстве. Можно загрузить новую: она добавится к ней.");
        try { window.scrollTo({ top: 0 }); } catch (e) { /* без прокрутки */ }
      } catch (e) { forgetDeviceCopy(); setStatus("Сохранённая копия повреждена и удалена. Загрузите выписку заново."); }
      renderDeviceCard();
    });
    $("deviceForget").addEventListener("click", () => { forgetDeviceCopy(); setStatus("Сохранённая копия выписки стёрта с этого устройства."); });
    function backupSummary() {
      const n = Object.keys(txRules).length, g = Object.keys(userRules).length;
      if (txs.length) {
        const used = txs.filter(t => txRules[txId(t)] || userRules[Cat.merchantKey(t)]).length;
        // Разбор с операциями без ручных правил: раньше писало «0 операций и 0 групп… 0 из N», будто ничего не загрузилось
        if (!n && !g) return `Загружено ${txs.length} ${opsWord(txs.length)}. Своих правил пока нет: категории подставлены автоматически.`;
        return `Ваших правил: ${n} для отдельных операций и ${g} для получателей. Сработали на ${used} из ${txs.length} ${txs.length % 10 === 1 && txs.length % 100 !== 11 ? "операции" : "операций"}.`;
      }
      return n || g ? `Сейчас в браузере: ${g} ${plur(g, "правило", "правила", "правил")} для получателей и ${n} для отдельных операций. Можно сразу загрузить выписку.` :
        "Есть сохранённый разбор? Загрузите только его: выписку из банка тогда загружать не нужно.";
    }
    $("backupMsg").textContent = backupSummary();
    $("importBtn").addEventListener("click", () => $("importFile").click());
    $("importFile").addEventListener("change", async e => {
      const f = e.target.files[0];
      if (!f) return;
      // Сообщение и на главной: до загрузки выписки блок «Мой разбор» скрыт, и без этого ответа не видно
      const say = t => { $("backupMsg").textContent = t; $("landStatus").textContent = t; };
      try {
        applyBackup(JSON.parse(await f.text()));
        say("Разбор загружен. " + backupSummary());
        if (txs.length) render();
      } catch (err) {
        say("Не получилось загрузить: " + err.message);
      }
      e.target.value = "";
    });


    // Запасной способ для боковой панели, где скачивание файлов запрещено: копирование текстом
    // «Помочь справочнику»: только название места и категория, без сумм и дат. Ничего не отправляется: пользователь копирует текст сам.
    $("textExportBtn").addEventListener("click", () => {
      const box = $("backupText");
      box.style.display = "block";
      box.value = JSON.stringify(backupData());
      box.select();
      try { document.execCommand("copy"); } catch (e) {}
      $("backupMsg").textContent = "Текст разбора выше (" + Object.keys(txRules).length + " операций, " + Object.keys(userRules).length + " групп). Скопируйте его и сохраните в текстовый файл с расширением .json";
    });
    $("textImportBtn").addEventListener("click", () => {
      const box = $("backupText");
      box.style.display = "block";
      if (!box.value.trim()) { $("backupMsg").textContent = "Вставьте текст разбора в поле выше и нажмите кнопку ещё раз."; return; }
      try {
        applyBackup(JSON.parse(box.value));
        $("backupMsg").textContent = "Разбор загружен. " + (txs.length ? txs.length + " операций показаны ниже. " : "") + backupSummary();
        if (txs.length) render();
      } catch (err) { $("backupMsg").textContent = "Не получилось загрузить: " + err.message; }
    });

    // ---------- Выгрузка в таблицу ----------
    const exportOpts = () => ({
      categoryOf: t => displayCat(t), noteOf, ownCat: Cat.OWN, loanCat: Cat.LOAN, savingsCat: Cat.SAVINGS,
      bankNames: Object.assign({ demo: "Демо" }, ...Banks.BANKS.map(b => ({ [b.id]: b.name }))),
    });
    function downloadCsv(name, text) {
      const blob = new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      $("exportMsg").textContent = `Сохранено: «${name}» в папке загрузок. Если файл не появился, нажмите «текстом».`;
    }
    function showCsvText(text, what) {
      const box = $("exportText");
      box.style.display = "block";
      box.value = text;
      if (box.select) box.select();
      try { document.execCommand("copy"); } catch (e) { /* копирование недоступно */ }
      $("exportMsg").textContent = `${what}: текст выше (скопирован). Вставьте его в блокнот и сохраните как файл с расширением .csv, потом откройте в Excel.`;
    }
    $("expOps").addEventListener("click", () => downloadCsv("операции.csv", Exporter.operationsCsv(txs.concat(parked), exportOpts())));
    $("expSum").addEventListener("click", () => downloadCsv("итоги-по-месяцам.csv", Exporter.summaryCsv(txs, exportOpts())));
    $("expOpsText").addEventListener("click", () => showCsvText(Exporter.operationsCsv(txs.concat(parked), exportOpts()), "Все операции"));
    $("expSumText").addEventListener("click", () => showCsvText(Exporter.summaryCsv(txs, exportOpts()), "Итоги по месяцам"));

    // Сброс только после подтверждения: сначала предупреждение, потом уже стирание
    $("reset").addEventListener("click", () => { $("resetBox").hidden = false; try { $("resetNo").focus(); } catch (e) { /* без фокуса */ } });
    // Окно сброса закрылось без сброса: фокус возвращается на кнопку «Сбросить»
    const closeReset = () => { if ($("resetBox").hidden) return; $("resetBox").hidden = true; try { $("reset").focus(); } catch (e) { /* без фокуса */ } };
    $("resetNo").addEventListener("click", closeReset);
    // Окно закрывается и по клику на затемнённый фон, и по Esc
    $("resetBox").addEventListener("click", e => { if (e.target === $("resetBox")) closeReset(); });
    if (document.addEventListener) document.addEventListener("keydown", e => { if (e.key === "Escape") closeReset(); });
    $("resetSave").addEventListener("click", () => $("exportBtn").click());
    $("resetYes").addEventListener("click", () => {
      userRules = {}; customCats = []; txRules = {}; condRules = []; saveJSON("ba_condrules_v1", condRules); splits = {}; saveJSON("ba_splits_v1", splits); applySplits(); txNotes = {}; saveJSON("ba_notes_v1", txNotes); customIcons = {}; customColors = {}; acctNames = {}; budgets = {}; calc = {}; rates = {}; saveJSON("ba_rates_v1", rates); historyStore = {}; saveJSON("ba_history_v1", historyStore);
      ownUndo.length = 0; saveJSON("ba_acctnames_v1", acctNames);
      saveJSON("ba_budget_v1", budgets); saveJSON("ba_calc_v1", calc);
      mergeNote = []; keepCats = []; saveJSON("ba_mergenote_v1", mergeNote); saveJSON("ba_keepcats_v1", keepCats); renderMergeNote();
      saveJSON("ba_rules_v1", userRules); saveJSON("ba_cats_v1", customCats); saveJSON("ba_txrules_v1", txRules); saveJSON("ba_icons_v1", customIcons); saveJSON("ba_catcolors_v1", customColors);
      $("resetBox").hidden = true;
      $("backupMsg").textContent = "Категории и выбор по операциям сброшены.";
      if (txs.length) render(); else renderRules();
    });
