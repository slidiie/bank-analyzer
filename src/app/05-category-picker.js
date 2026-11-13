    // ---------- Выбор категории: один для всех экранов ----------
    // Чип категории (цветной значок и подпись) и кнопка-чип, по нажатию которой открывается окно с плитками, поиском и «＋ Создать».
    // Системного списка нет нигде. Новую категорию создают только отсюда, из разбора конкретной операции.
    function catChip(cat) {
      const s = h("span", { class: "catchip" }, iconEl(iconKey(cat)), h("span", { class: "catchip-t" }, cat));
      s.style.setProperty("--tile", catColor(cat));
      return s;
    }
    let pickDraft = "";
    // opts: { title, current, cats (список; по умолчанию все), onPick(cat), opener }
    function openCatPicker(opts) {
      const cats = opts.cats || allCategories().filter(c => !REVIEW_CATS.has(c));
      const body = $("cpBody"), search = $("cpSearch");
      $("cpTitle").textContent = opts.title || "Категория";
      search.value = pickDraft;
      const tiles = cats.map(c => {
        const b = h("button", { type: "button", class: "cattile" + (c === opts.current ? " sel" : ""), "aria-pressed": String(c === opts.current), onclick: () => { pickDraft = ""; closeSheets(); opts.onPick(c); } }, iconEl(iconKey(c)), h("span", {}, c));
        b.style.setProperty("--tile", catColor(c));
        return [c, b];
      });
      const create = name => openNewCat(name, c => { pickDraft = ""; closeSheets(); opts.onPick(c); }, $("catSheet"));
      const plus = h("button", { type: "button", class: "cattile more", onclick: () => create(search.value.trim()) }, h("span", {}, "＋ Создать"));
      const none = h("div", { class: "cpempty" });
      const grid = h("div", { class: "cattiles" }, tiles.map(x => x[1]), plus);
      body.replaceChildren(grid, none);
      const filter = () => {
        const q = search.value.trim().toLowerCase();
        pickDraft = search.value;
        let any = false;
        tiles.forEach(([c, el]) => { const hit = !q || c.toLowerCase().includes(q); el.hidden = !hit; if (hit) any = true; });
        none.replaceChildren();
        plus.hidden = !!q && !any;
        if (q && !any) none.append(h("p", { class: "muted" }, "Нет такой категории."), h("button", { type: "button", class: "cattile more", onclick: () => create(search.value.trim()) }, h("span", {}, `＋ Создать «${search.value.trim().slice(0, 40)}»`)));
      };
      search.oninput = filter;
      filter();
      openSheet("catSheet", opts.opener || null);
      try { const cur = body.querySelector(".sel"); if (cur) cur.scrollIntoView({ block: "center" }); } catch (e) { /* без прокрутки */ }
    }
    // Кнопка «выбрать категорию»: показывает текущую категорию чипом; выбор сразу вызывает onChange
    function catButton(current, onChange, label, opts) {
      const b = h("button", { type: "button", class: "catbtn", "aria-label": label || "Категория" });
      const paint = () => b.replaceChildren(current ? catChip(current) : h("span", { class: "muted" }, "Выбрать категорию"));
      paint();
      b.addEventListener("click", () => openCatPicker({ title: (opts && opts.title) || "Категория", current, opener: b, cats: opts && opts.cats, onPick: c => { current = c; paint(); onChange(c); } }));
      return b;
    }
    // Кнопка выбора + «Применить»: для мест, где выбор подтверждается отдельно
    function chooser(buttonText, onApply, opts) {
      let chosen = "";
      const apply = h("button", { type: "button", class: "primary", disabled: "", onclick: () => { if (chosen) onApply(chosen, ""); } }, buttonText);
      const pick = catButton("", c => { chosen = c; apply.disabled = false; }, "Категория");
      if (opts && opts.noQuick) return h("span", { class: "cpwrap" }, pick, apply);
      return h("span", { class: "cpwrap" }, pick, apply,
        h("button", { type: "button", onclick: () => onApply("Прочее"), title: "Если непонятно, что это, и сумма небольшая" }, "В «Прочее»"));
    }
    // ---------- «Новая категория»: на телефоне полный экран со стрелкой «назад», на ПК окно по центру ----------
    const ICON_GUESS = [[/спорт|зал|фитнес|трен|бассейн/i, "dumbbell"], [/кофе|чай/i, "coffee"], [/питом|кот|кош|собак|зоо|корм/i, "paw"], [/книг|чтени/i, "book"], [/подар|праздник|цвет/i, "gift"],
      [/машин|авто|бензин|парков|гараж/i, "car"], [/ремонт|инструмент|дач|сад|огород/i, "wrench"], [/музык|концерт|гитар/i, "music"], [/игр|гейм|стим/i, "gamepad"], [/путешеств|отпуск|поездк|авиа|билет/i, "plane"],
      [/работ|бизнес|офис/i, "briefcase"], [/учёб|учеб|курс|школ|универ|репетитор/i, "cap"], [/налог|штраф|коммун|квитанц/i, "receipt"], [/здоров|врач|лекарств|стомат/i, "heart"], [/идея|хобби|увлечени/i, "bulb"]];
    const guessIcon = name => { const m = ICON_GUESS.find(([re]) => re.test(name)); return m ? m[1] : "tag"; };
    const guessColor = name => CUSTOM_KEYS[[...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0) % CUSTOM_KEYS.length];
    let ncDraft = "";
    function openNewCat(prefill, onDone, opener) {
      const body = $("ncBody"), msg = $("ncMsg"), btn = $("ncCreate");
      const st = { icon: "", color: "", iconTouched: false, colorTouched: false };
      const name = h("input", { type: "text", maxlength: "40", autocomplete: "off", "aria-label": "Название категории", placeholder: "Например, Спорт" });
      name.value = (prefill || ncDraft || "").slice(0, 40);
      const prev = h("div", { class: "ncprev" });
      const dup = h("div", { class: "ncdup", role: "status" });
      const colors = h("div", { class: "ncgrid sw", role: "group", "aria-label": "Цвет" });
      const icons = h("div", { class: "ncgrid", role: "group", "aria-label": "Значок" });
      const colorBtns = CUSTOM_KEYS.map((k, i) => { const b = h("button", { type: "button", "aria-label": "Цвет " + (i + 1), onclick: () => { st.color = k; st.colorTouched = true; sync(); } }); b.style.setProperty("--tile", `var(--cat-${k})`); colors.append(b); return [k, b]; });
      const iconBtns = PICK_ICONS.map(k => { const b = h("button", { type: "button", "aria-label": ICON_NAMES[k] || k, title: ICON_NAMES[k] || k, onclick: () => { st.icon = k; st.iconTouched = true; sync(); } }, iconEl(k)); icons.append(b); return [k, b]; });
      const existing = () => { const n = Cat.canonical(name.value.trim()).toLowerCase(); return n && allCategories().find(c => c.toLowerCase() === n); };
      function sync() {
        const n = name.value.trim();
        ncDraft = name.value;
        if (!st.iconTouched) st.icon = guessIcon(n);
        if (!st.colorTouched) st.color = guessColor(n || "x");
        colorBtns.forEach(([k, b]) => { b.classList.toggle("sel", k === st.color); b.setAttribute("aria-pressed", String(k === st.color)); });
        iconBtns.forEach(([k, b]) => { b.classList.toggle("sel", k === st.icon); b.setAttribute("aria-pressed", String(k === st.icon)); b.style.setProperty("--tile", `var(--cat-${st.color})`); });
        const ex = existing();
        dup.textContent = ex ? `Такая уже есть: ${ex}.` : "";
        btn.textContent = ex ? "Выбрать её" : "Создать";
        btn.disabled = !n;
        const chip = h("span", { class: "catchip" }, iconEl(st.icon), h("span", { class: "catchip-t" }, n || "Название"));
        chip.style.setProperty("--tile", `var(--cat-${st.color})`);
        prev.replaceChildren(chip);
        msg.textContent = "";
      }
      name.addEventListener("input", sync);
      name.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); btn.click(); } });
      body.replaceChildren(h("label", { class: "ncfield" }, h("span", {}, "Название"), name), dup, prev,
        h("div", { class: "ncfield" }, h("span", {}, "Цвет"), colors), h("div", { class: "ncfield" }, h("span", {}, "Значок"), icons));
      btn.onclick = () => {
        const n = name.value.trim();
        if (!n) { msg.textContent = "Введите название."; return; }
        const ex = existing();
        ncDraft = "";
        if (ex) { closeSheets(); onDone(ex); return; }
        const c = Cat.canonical(n);
        ensureCategory(c, st.icon);
        customColors[c] = st.color; saveJSON("ba_catcolors_v1", customColors);
        closeSheets();
        onDone(c);
      };
      sync();
      if (!sheetOpener) sheetOpener = opener || null;
      $("newCatSheet").hidden = false;
      try { $("newCatSheet").querySelector(".modalcard").focus(); } catch (e) { /* без фокуса */ }
    }
    $("ncBack").addEventListener("click", () => { $("newCatSheet").hidden = true; });
    $("ncClose").addEventListener("click", () => { $("newCatSheet").hidden = true; });
    $("cpClose").addEventListener("click", () => { pickDraft = ""; closeSheets(); });

