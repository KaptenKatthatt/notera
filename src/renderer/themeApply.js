// themeApply.js: paints the active theme. The main process resolves the theme (src/main/themes.js)
// and sends both variants; this picks the one for the current mode, writes its CSS variables and
// font faces into one <style>, links the theme's own style sheets, and shows a card when the
// theme on disk is broken (the previous theme stays on screen until it is fixed).

/**
 * @param {{ t: () => (key: string, vars?: object) => string, openFolder: () => void }} ctx
 */
export function createThemeApplier(ctx) {
  const $ = (sel) => document.querySelector(sel);
  let current = null;       // the last theme message from main
  let shownError = '';      // the error the card shows, so a repeat broadcast does not reopen it
  let styleKey = '';

  function varsBlock(vars) {
    return ':root {\n' + Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n') + '\n}';
  }

  function fontFaces(fonts) {
    return fonts.map((f) => `@font-face { font-family: ${JSON.stringify(f.family)}; src: url(${JSON.stringify(f.url)}); font-weight: ${/^[0-9 ]+$/.test(f.weight) ? f.weight : '400'}; font-style: ${f.style}; font-display: block; }`).join('\n');
  }

  /** The variant on screen: the one for the current mode (a single-variant theme uses its only one). */
  function variant() {
    const th = current && current.theme;
    if (!th) return null;
    return th.variants[current.dark ? 'dark' : 'light'];
  }

  /**
   * Apply a theme message from main. Returns true when the window switched between light and dark
   * CodeMirror, which the caller has to reconfigure for.
   * @param {{ dark: boolean, theme: any, error: any }} msg
   */
  function apply(msg) {
    const wasDark = isDark();
    current = msg;
    const th = msg.theme;
    const v = variant();
    const root = document.documentElement;
    if (th && v) {
      root.dataset.theme = v.type === 'dark' ? 'dark' : 'light';
      root.dataset.themeId = th.id;
      let style = /** @type {HTMLStyleElement | null} */ ($('#theme-vars'));
      if (!style) { style = document.createElement('style'); style.id = 'theme-vars'; document.head.appendChild(style); }
      style.textContent = fontFaces(th.fonts) + '\n' + varsBlock(v.vars);
      const key = th.styles.join('\n');
      if (key !== styleKey) {
        styleKey = key;
        for (const el of document.querySelectorAll('link[data-theme-style]')) el.remove();
        for (const href of th.styles) {
          const link = document.createElement('link');
          link.rel = 'stylesheet'; link.href = href; link.dataset.themeStyle = '';
          document.head.appendChild(link);
        }
      }
    } else root.dataset.theme = msg.dark ? 'dark' : 'light';
    renderError(msg.error);
    return wasDark !== isDark();
  }

  function isDark() { return document.documentElement.dataset.theme === 'dark'; }

  function renderError(error) {
    const box = $('#theme-toast');
    if (!box) return;
    const key = error ? `${error.theme}|${error.line}|${error.message}` : '';
    if (key === shownError && (!error || !box.hidden)) return;
    shownError = key;
    box.hidden = !error;
    if (!error) return;
    const t = ctx.t();
    $('#theme-toast-text').textContent = error.line
      ? t('theme.errorAt', { theme: error.theme, line: error.line, message: error.message })
      : t('theme.error', { theme: error.theme, message: error.message });
  }

  $('#theme-toast-close').addEventListener('click', () => { $('#theme-toast').hidden = true; });
  $('#theme-toast-folder').addEventListener('click', () => ctx.openFolder());

  return {
    apply,
    isDark,
    /** Re-render texts after a language change. */
    refresh() { if ($('#theme-toast').hidden) return; shownError = ''; renderError(current && current.error); },
    get current() { return current; },
    /** The notera section of the variant on screen: effects and fonts read it. */
    get notera() { const v = variant(); return v ? v.notera : {}; },
    /** The read section (Läs overrides) of the variant on screen. */
    get read() { const v = variant(); return v ? v.read : {}; },
    get type() { const v = variant(); return v ? v.type : 'light'; }
  };
}
