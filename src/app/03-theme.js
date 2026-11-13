    // ---------- Тема оформления: Авто (как в системе) / Светлая / Тёмная; выбор запоминается ----------
    // Режим ставит и маленький скрипт в <head> (до отрисовки); здесь переключатель, theme-color и перерисовка цветов диаграммы.
    // Один переключатель: пока человек ничего не нажимал, тема следует системе (в памяти ничего нет); после нажатия выбор запоминается.
    let themeMode = loadJSON("ba_theme_v2", null) || loadJSON("ba_theme_v1", "auto");
    if (!["auto", "light", "dark"].includes(themeMode)) themeMode = "auto";
    const THEME_COLOR = { light: "#F4F6F9", dark: "#111112" };
    const systemDark = () => { try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch (e) { return false; } };
    const effectiveDark = () => themeMode === "dark" || (themeMode === "auto" && systemDark());
    function applyTheme() {
      document.documentElement.setAttribute("data-theme", themeMode);
      const dark = effectiveDark();
      $("themeToggle").setAttribute("aria-checked", String(dark));
      $("themeToggle").setAttribute("data-dark", String(dark));
      document.documentElement.setAttribute("data-dark", String(dark));
      // Цвет строки браузера: при явном выборе обе метки получают один цвет, пока выбора нет возвращаются свои
      $("themeMetaL").setAttribute("content", themeMode === "dark" ? THEME_COLOR.dark : THEME_COLOR.light);
      $("themeMetaD").setAttribute("content", themeMode === "light" ? THEME_COLOR.light : THEME_COLOR.dark);
      if (typeof txs !== "undefined" && txs.length) refreshTop();   // подписи на диаграмме подбираются под цвета темы
    }
    // Касание или клавиатура: от этого зависит, показывать ли рамку фокуса (см. html.touch в стилях)
    document.addEventListener("pointerdown", e => { document.documentElement.classList.toggle("touch", e.pointerType === "touch" || e.pointerType === "pen"); }, true);
    document.addEventListener("keydown", e => { if (e.key === "Tab" || e.key.startsWith("Arrow")) document.documentElement.classList.remove("touch"); }, true);
    $("themeToggle").addEventListener("click", () => {
      themeMode = effectiveDark() ? "light" : "dark";
      saveJSON("ba_theme_v2", themeMode);
      applyTheme();
    });
    try {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      if (mq.addEventListener) mq.addEventListener("change", () => { if (themeMode === "auto") applyTheme(); });
    } catch (e) { /* без слежения за системной темой */ }
    applyTheme();

