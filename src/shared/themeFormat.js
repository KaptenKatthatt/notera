'use strict';
// The theme format: parsing theme.json (JSON with comments, like VS Code's), resolving
// "extends" chains, and turning a resolved light or dark variant into the CSS custom properties
// that styles.css reads. Pure functions only, so main, renderer and unit tests share them.
// The format itself is documented in THEMES.md and theme.schema.json.

const MODES = ['system', 'light', 'dark'];
const DEFAULT_THEME = 'default';
const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** A theme id is its folder name: lowercase, so it survives as the host of a notera-theme:// URL. */
function isValidId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

class ThemeError extends Error {
  /** @param {string} message @param {number} [line] @param {number} [column] */
  constructor(message, line, column) {
    super(message);
    this.line = line;
    this.column = column;
  }
}

/**
 * JSON with // and /* comments and trailing commas, as VS Code writes its theme files.
 * Throws a ThemeError that carries the 1-based line and column of the problem.
 * @param {string} text
 */
function parseJsonc(text) {
  const src = String(text).replace(/^\uFEFF/, '');
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
    } else if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      for (; i < stop; i++) out += src[i] === '\n' ? '\n' : ' ';
    } else if (c === ',') {
      let j = i + 1;
      for (;;) {
        while (j < src.length && /\s/.test(src[j])) j++;
        if (src[j] === '/' && src[j + 1] === '/') { while (j < src.length && src[j] !== '\n') j++; continue; }
        if (src[j] === '/' && src[j + 1] === '*') { const e = src.indexOf('*/', j + 2); j = e === -1 ? src.length : e + 2; continue; }
        break;
      }
      out += src[j] === '}' || src[j] === ']' ? ' ' : ',';
      i++;
    } else { out += c; i++; }
  }
  return parseJson(out);
}

/**
 * A strict JSON parser that reports where it failed. V8's JSON.parse no longer puts a position in
 * its messages, and "line 12" is the one thing a theme author needs to find the typo.
 * @param {string} text
 */
function parseJson(text) {
  let i = 0;
  const fail = (msg, at = i) => {
    const before = text.slice(0, at);
    throw new ThemeError(msg, before.split('\n').length, at - before.lastIndexOf('\n'));
  };
  const ws = () => { while (i < text.length && ' \t\n\r'.includes(text[i])) i++; };
  const describe = () => (i >= text.length ? 'end of file' : `'${text[i]}'`);
  function value() {
    ws();
    const c = text[i];
    if (c === '{') return object();
    if (c === '[') return array();
    if (c === '"') return string();
    if (c === '-' || (c >= '0' && c <= '9')) return number();
    if (text.startsWith('true', i)) { i += 4; return true; }
    if (text.startsWith('false', i)) { i += 5; return false; }
    if (text.startsWith('null', i)) { i += 4; return null; }
    return fail(`Unexpected ${describe()}`);
  }
  function object() {
    const out = {};
    i++; ws();
    if (text[i] === '}') { i++; return out; }
    for (;;) {
      ws();
      if (text[i] !== '"') fail(`Expected a "key" but found ${describe()}`);
      const key = string();
      ws();
      if (text[i] !== ':') fail(`Expected ':' after "${key}" but found ${describe()}`);
      i++;
      const v = value();
      if (key !== '__proto__') out[key] = v;
      ws();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === '}') { i++; return out; }
      fail(`Expected ',' or '}' but found ${describe()}`);
    }
  }
  function array() {
    const out = [];
    i++; ws();
    if (text[i] === ']') { i++; return out; }
    for (;;) {
      out.push(value());
      ws();
      if (text[i] === ',') { i++; continue; }
      if (text[i] === ']') { i++; return out; }
      fail(`Expected ',' or ']' but found ${describe()}`);
    }
  }
  function string() {
    const start = i;
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\n') fail('Line break inside a string');
      i += text[i] === '\\' ? 2 : 1;
    }
    if (i >= text.length) fail('Unterminated string', start);
    i++;
    try { return JSON.parse(text.slice(start, i)); } catch { return fail('Invalid escape in string', start); }
  }
  function number() {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m) fail(`Unexpected ${describe()}`);
    i += m[0].length;
    return Number(m[0]);
  }
  const v = value();
  ws();
  if (i < text.length) fail(`Unexpected ${describe()} after the end of the theme`);
  return v;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Objects merge key by key, everything else (arrays included) is replaced by the child. */
function deepMerge(base, over) {
  if (!isPlainObject(base) || !isPlainObject(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
}

/**
 * Follow a theme's "extends" chain and merge it, parents first. `load(id)` returns the parsed
 * theme.json of a theme or null when there is none. Fonts and style sheets are collected from the
 * whole chain, each tagged with the theme that owns the file, since that decides its URL.
 * @param {string} id
 * @param {(id: string) => any} load
 */
function resolveTheme(id, load) {
  const chain = [];
  const seen = new Set();
  let cur = id;
  while (cur) {
    if (seen.has(cur)) throw new ThemeError(`"extends" loops back to "${cur}"`);
    seen.add(cur);
    const raw = load(cur);
    if (!raw) throw new ThemeError(cur === id ? `Theme "${cur}" not found` : `"extends": theme "${cur}" not found`);
    if (!isPlainObject(raw)) throw new ThemeError('theme.json must be an object');
    chain.unshift({ id: cur, raw });
    if (raw.extends !== undefined && typeof raw.extends !== 'string') throw new ThemeError('"extends" must be a theme id');
    cur = raw.extends;
    if (chain.length > 16) throw new ThemeError('"extends" chain is too long');
  }
  let merged = {};
  const fonts = [];
  const styles = [];
  for (const { id: owner, raw } of chain) {
    const rest = { ...raw };
    for (const k of ['fonts', 'style', 'extends', '$schema']) delete rest[k];
    const f = raw.fonts;
    const style = raw.style;
    merged = deepMerge(merged, rest);
    if (Array.isArray(f)) for (const font of f) if (isPlainObject(font)) fonts.push({ ...font, owner });
    if (typeof style === 'string') styles.push({ owner, path: style });
  }
  merged.name = chain[chain.length - 1].raw.name ?? id;
  return { id, theme: merged, fonts, styles, chain: chain.map((c) => c.id) };
}

/** The display name of a theme: a plain string, or a map of locale to string. */
function themeName(name, locale, fallback) {
  if (typeof name === 'string' && name.trim()) return name;
  if (isPlainObject(name)) return name[locale] || name.en || Object.values(name).find((v) => typeof v === 'string') || fallback;
  return fallback;
}

/**
 * One variant of a resolved theme: the top-level shared values with the light or dark section
 * merged over them. A theme that only has one of the two uses it for both modes.
 */
function variantOf(theme, dark) {
  const want = dark ? 'dark' : 'light';
  const other = dark ? 'light' : 'dark';
  const own = isPlainObject(theme[want]) ? theme[want] : null;
  const section = own || (isPlainObject(theme[other]) ? theme[other] : {});
  const type = own ? want : isPlainObject(theme[other]) ? other : want;
  const shared = {
    colors: theme.colors, tokenColors: theme.tokenColors, notera: theme.notera, read: theme.read
  };
  const v = deepMerge(shared, section);
  return {
    type,
    colors: isPlainObject(v.colors) ? v.colors : {},
    tokenColors: Array.isArray(v.tokenColors) ? v.tokenColors : [],
    notera: isPlainObject(v.notera) ? v.notera : {},
    read: isPlainObject(v.read) ? v.read : {}
  };
}

// Notera's CSS custom properties and the VS Code colour keys that fill them, first match wins.
/** @type {Array<[string, string[], string?]>} */
// `derive` is used when none of the keys is set: a color-mix over properties already filled, so an
// imported VS Code theme that only sets a handful of colours still paints every surface.
const COLOR_VARS = [
  ['--bg', ['editor.background']],
  ['--fg', ['editor.foreground', 'foreground']],
  ['--bg-chrome', ['editorGroupHeader.tabsBackground', 'sideBar.background', 'titleBar.activeBackground'], 'color-mix(in srgb, var(--fg) 4%, var(--bg))'],
  ['--bg-hover', ['list.hoverBackground', 'toolbar.hoverBackground'], 'color-mix(in srgb, var(--fg) 9%, var(--bg-chrome))'],
  ['--bg-active', ['tab.activeBackground'], 'var(--bg)'],
  ['--bg-popup', ['editorWidget.background', 'menu.background', 'quickInput.background'], 'var(--bg)'],
  ['--fg-muted', ['descriptionForeground', 'tab.inactiveForeground'], 'color-mix(in srgb, var(--fg) 58%, var(--bg))'],
  ['--border', ['panel.border', 'editorGroup.border', 'sideBar.border', 'contrastBorder'], 'color-mix(in srgb, var(--fg) 14%, var(--bg))'],
  ['--accent', ['button.background', 'focusBorder', 'textLink.foreground'], 'var(--fg)'],
  ['--accent-fg', ['button.foreground'], 'var(--bg)'],
  ['--selection', ['editor.selectionBackground'], 'color-mix(in srgb, var(--accent) 25%, transparent)'],
  ['--selection-fg', ['editor.selectionForeground'], 'var(--fg)'],
  ['--active-line', ['editor.lineHighlightBackground'], 'color-mix(in srgb, var(--fg) 3%, var(--bg))'],
  ['--code-bg', ['textCodeBlock.background', 'textPreformat.background'], 'color-mix(in srgb, var(--fg) 5%, var(--bg))'],
  ['--caret', ['editorCursor.foreground']],
  ['--sel-row', ['list.activeSelectionBackground', 'list.inactiveSelectionBackground'], 'color-mix(in srgb, var(--accent) 16%, transparent)'],
  ['--danger', ['errorForeground', 'editorError.foreground'], '#e5484d'],
  ['--search-bg', ['input.background', 'editorWidget.background'], 'var(--bg-popup)'],
  ['--search-match', ['editor.findMatchHighlightBackground'], 'color-mix(in srgb, var(--accent) 30%, transparent)'],
  ['--search-current', ['editor.findMatchBackground'], 'color-mix(in srgb, var(--accent) 55%, transparent)'],
  ['--search-fg', ['editor.findMatchHighlightForeground'], 'var(--fg)'],
  ['--search-current-fg', ['editor.findMatchForeground'], 'var(--search-fg)'],
  ['--input-border', ['input.border'], 'color-mix(in srgb, var(--fg) 58%, var(--bg))'],
  ['--widget-border', ['editorWidget.border'], 'var(--border)'],
  ['--dirty-dot', ['tab.activeModifiedBorder'], 'var(--accent)'],
  ['--flash', ['editor.rangeHighlightBackground'], 'color-mix(in srgb, var(--accent) 22%, transparent)']
];

/** @type {Array<[string, string, string[], string[], string]>} */
// Markdown colours: the notera.colors key, then the TextMate scopes VS Code themes colour
// Markdown with, then a VS Code UI colour, then a fallback over properties already set.
const MD_VARS = [
  ['--md-h', 'heading', ['markup.heading', 'entity.name.section.markdown', 'markup.heading.markdown', 'heading.1.markdown'], [], 'var(--fg)'],
  ['--md-link', 'link', ['markup.underline.link', 'string.other.link.title.markdown', 'string.other.link'], ['textLink.foreground'], 'var(--accent)'],
  ['--md-quote', 'quote', ['markup.quote', 'markup.quote.markdown'], ['textBlockQuote.foreground'], 'var(--fg-muted)'],
  ['--md-code', 'code', ['markup.inline.raw', 'markup.inline.raw.string.markdown', 'markup.raw', 'markup.fenced_code.block.markdown'], ['textPreformat.foreground'], 'var(--fg)'],
  ['--md-meta', 'markup', ['punctuation.definition.heading.markdown', 'punctuation.definition.markdown', 'punctuation.definition', 'comment'], [], 'var(--fg-muted)']
];

/** Every VS Code colour key Notera reads; an imported theme keeps these and drops the rest. */
const KNOWN_COLOR_KEYS = new Set([...COLOR_VARS.flatMap(([, keys]) => keys), ...MD_VARS.flatMap(([, , , ui]) => ui), 'widget.shadow']);

/** Only strings that cannot break out of a declaration become CSS values. */
function safeCss(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 200 || /[;{}<>\\]|\/\*|url\s*\(/i.test(s)) return null;
  return s;
}

/**
 * The colour a list of VS Code tokenColors rules gives a TextMate scope. A rule matches when one
 * of its scopes equals the wanted scope or is a dotted prefix of it; the longest match wins, later
 * rules win ties, like VS Code does it (minus scope selectors with spaces, which we skip).
 * @param {any[]} tokenColors @param {string} scope
 */
function tokenColor(tokenColors, scope) {
  let best = null;
  let bestLen = -1;
  for (const rule of tokenColors) {
    if (!isPlainObject(rule) || !isPlainObject(rule.settings) || typeof rule.settings.foreground !== 'string') continue;
    const scopes = Array.isArray(rule.scope) ? rule.scope : typeof rule.scope === 'string' ? rule.scope.split(',') : [];
    for (const raw of scopes) {
      const s = String(raw).trim();
      if (!s || /\s/.test(s)) continue;
      if ((scope === s || scope.startsWith(s + '.')) && s.length >= bestLen) { best = rule.settings.foreground; bestLen = s.length; }
    }
  }
  return best;
}

/**
 * The CSS custom properties for one variant, as a plain name -> value map.
 * @param {{ colors: Record<string, any>, tokenColors: any[], notera: any, read?: any }} variant
 */
function cssVars(variant) {
  const out = {};
  const colors = variant.colors || {};
  for (const [name, keys, derive] of COLOR_VARS) {
    const hit = keys.map((k) => safeCss(colors[k])).find(Boolean);
    if (hit) out[name] = hit;
    else if (derive) out[name] = derive;
  }
  const shadow = safeCss(colors['widget.shadow']);
  if (shadow) out['--shadow'] = `0 8px 24px ${shadow}`;
  const nc = isPlainObject(variant.notera?.colors) ? variant.notera.colors : {};
  for (const [name, key, scopes, uiKeys, fallback] of MD_VARS) {
    const own = safeCss(nc[key]);
    const fromTokens = own ? null : scopes.map((s) => safeCss(tokenColor(variant.tokenColors || [], s))).find(Boolean);
    const fromUi = own || fromTokens ? null : uiKeys.map((k) => safeCss(colors[k])).find(Boolean);
    out[name] = own || fromTokens || fromUi || fallback;
  }
  // Per-level heading colours: notera.colors, or the per-level Markdown scopes some VS Code themes
  // colour (Catppuccin's heading.1.markdown and so on).
  for (let n = 1; n <= 6; n++) {
    const c = safeCss(nc[`heading${n}`]) || safeCss(tokenColor(variant.tokenColors || [], `heading.${n}.markdown`));
    if (c) out[`--md-h${n}`] = c;
  }
  const fonts = isPlainObject(variant.notera?.fonts) ? variant.notera.fonts : {};
  const readFonts = isPlainObject(variant.read?.fonts) ? variant.read.fonts : {};
  const headingFont = fontStack(fonts.headings);
  const heading1Font = fontStack(fonts.heading1);
  const readHeadingFont = fontStack(readFonts.headings);
  if (headingFont) out['--heading-font'] = headingFont;
  if (heading1Font) out['--heading1-font'] = heading1Font;
  if (readHeadingFont) out['--read-heading-font'] = readHeadingFont;
  const ui = fontStack(fonts.ui);
  const editor = fontStack(fonts.editor);
  const read = fontStack(isPlainObject(variant.read?.fonts) ? variant.read.fonts.body : undefined);
  const lineHeight = (v) => (typeof v === 'number' && v >= 1 && v <= 3 ? String(v) : null);
  const editorLh = lineHeight(variant.notera?.lineHeight);
  const readLh = lineHeight(variant.read?.lineHeight);
  if (editorLh) out['--theme-line-height'] = editorLh;
  if (readLh) out['--read-line-height'] = readLh;
  if (ui) out['--ui-font'] = ui;
  if (editor) out['--theme-editor-font'] = editor;
  if (read) out['--read-font'] = read;
  return out;
}

/** A font setting is a family name or a list of them; quoted and joined into a CSS stack. */
function fontStack(v) {
  const list = (Array.isArray(v) ? v : [v]).filter((f) => typeof f === 'string' && f.trim());
  const ok = list.map((f) => f.trim()).filter((f) => !/["';{}<>\\]/.test(f) && f.length <= 80);
  if (!ok.length) return null;
  const generic = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-monospace', 'ui-serif', 'ui-sans-serif']);
  return ok.map((f) => (generic.has(f) ? f : `"${f}"`)).join(', ');
}

const clamp01 = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
const colorList = (v) => (Array.isArray(v) ? v : [v]).map(safeCss).filter(Boolean).slice(0, 6);

/**
 * The cursor effects: what happens where you type. The user picks one in Settings, any of them
 * with any theme; a theme only suggests one (`notera.effects.typing`) and may tune each one's
 * parameters under its id (`notera.effects.sparks`, …). Each parameter has its type, range and
 * default here, so Settings and theme.schema.json follow this table. Colours left out follow the
 * theme: `colors` the accent and heading colours, `color` the cursor's (phosphor: see THEMES.md).
 * `kind`: drawn on the effects canvas, or a glowing copy over the letter just typed.
 */
const CURSOR_EFFECTS = {
  sparks: { kind: 'canvas', params: { amount: { type: 'int', min: 1, max: 40, default: 10 }, size: { type: 'number', min: 1, max: 8, default: 2.5 }, colors: { type: 'colors' } } },
  pixie: { kind: 'canvas', params: { colors: { type: 'colors' } } },
  ripple: { kind: 'canvas', params: { colors: { type: 'colors' } } },
  pulse: { kind: 'canvas', params: { color: { type: 'color' } } },
  phosphor: { kind: 'letter', params: { color: { type: 'color' }, strength: { type: 'number', min: 0, max: 1, default: 1 } } },
  laser: { kind: 'both', params: { color: { type: 'color', default: '#ff3344' } } },
  sight: { kind: 'canvas', params: { color: { type: 'color', default: '#ff3344' } } },
  neon: { kind: 'letter', params: {} },
  glitch: { kind: 'letter', params: {} },
  focus: { kind: 'letter', params: {} }
};
const CURSOR_EFFECT_IDS = Object.keys(CURSOR_EFFECTS);

/** One cursor effect's parameters, checked against CURSOR_EFFECTS and defaulted. */
function effectParams(id, raw) {
  const p = isPlainObject(raw) ? raw : {};
  /** @type {Record<string, any>} */
  const out = {};
  for (const [name, spec] of Object.entries(CURSOR_EFFECTS[id].params)) {
    const v = p[name];
    if (spec.type === 'colors') out[name] = colorList(v);
    else if (spec.type === 'color') out[name] = safeCss(v) || spec.default || null;
    else {
      const n = typeof v === 'number' && Number.isFinite(v) ? Math.min(spec.max, Math.max(spec.min, v)) : spec.default;
      out[name] = spec.type === 'int' ? Math.round(n) : n;
    }
  }
  return out;
}

/**
 * Which cursor effect is on: the user's choice ('none' or an id) when there is one, else the one
 * the theme suggests in `typing`. Themes from before 0.11 had no `typing` and switched effects on
 * by their keys: `phosphor`, then `particles` (now sparks). A theme's `typing` naming an effect it
 * also sets to false (an inherited suggestion switched off) falls back the same way.
 * @param {any} e the theme's effects
 * @param {string | null | undefined} choice the user's setting; 'theme' or empty follows the theme
 */
function typingEffect(e, choice) {
  const params = (id) => effectParams(id, id === 'sparks' && e.sparks === undefined ? e.particles : e[id]);
  if (choice === 'none') return null;
  if (CURSOR_EFFECT_IDS.includes(choice)) return { id: choice, ...params(choice) };
  const on = (v) => v === true || isPlainObject(v);
  if (e.typing === 'none') return null;
  if (CURSOR_EFFECT_IDS.includes(e.typing) && e[e.typing] !== false && !(e.typing === 'sparks' && e.particles === false && e.sparks === undefined)) {
    return { id: e.typing, ...params(e.typing) };
  }
  if (on(e.phosphor)) return { id: 'phosphor', ...params('phosphor') };
  if (on(e.sparks) || on(e.particles)) return { id: 'sparks', ...params('sparks') };
  return null;
}

/**
 * The built-in effects a theme switched on, with every parameter checked and defaulted. Missing
 * or false means off. The same shape comes back for the editor and for Läs (the preview), where
 * `read.effects` is merged over the theme's own effects. `typing` is the cursor effect, with the
 * user's choice (`opts.cursorEffect`) over the theme's suggestion.
 * @param {any} fx
 * @param {{ cursorEffect?: string | null }} [opts]
 */
function normalizeEffects(fx, opts = {}) {
  const e = isPlainObject(fx) ? fx : {};
  const on = (v) => v === true || isPlainObject(v);
  const obj = (v) => (isPlainObject(v) ? v : {});
  const glow = obj(e.glow);
  const grad = obj(e.gradient);
  const cursor = obj(e.cursor);
  const bg = obj(e.background);
  const grid = obj(bg.grid);
  const sun = obj(bg.sun);
  const gradColors = colorList(grad.colors);
  const levels = (Array.isArray(grad.levels) ? grad.levels : [1]).filter((n) => Number.isInteger(n) && n >= 1 && n <= 6);
  return {
    glow: on(e.glow) && ['headings', 'all'].includes(glow.target ?? 'headings')
      ? { target: glow.target ?? 'headings', strength: clamp01(glow.strength, 0.5), color: safeCss(glow.color) }
      : null,
    gradient: on(e.gradient) && gradColors.length >= 2 ? { colors: gradColors, levels: levels.length ? levels : [1] } : null,
    cursor: on(e.cursor)
      ? {
        style: ['line', 'block', 'underline'].includes(cursor.style) ? cursor.style : 'line',
        glow: clamp01(cursor.glow, 0), smooth: cursor.smooth === true
      }
      : null,
    typing: typingEffect(e, opts.cursorEffect),
    background: {
      grid: on(bg.grid) ? { color: safeCss(grid.color), opacity: clamp01(grid.opacity, 0.5), speed: clamp01(grid.speed, 0.5) } : null,
      sun: on(bg.sun) ? { colors: colorList(sun.colors), opacity: clamp01(sun.opacity, 0.5) } : null,
      scanlines: clamp01(bg.scanlines, 0),
      vignette: clamp01(bg.vignette, 0)
    }
  };
}

/** `:root { ... }` for a set of custom properties. */
function cssBlock(vars) {
  return ':root {\n' + Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n') + '\n}';
}

/**
 * The settings used to hold one `theme` value for both the palette and the mode; now they are
 * `theme` (an id) and `mode`. Old values: system/light/dark were modes of the one built-in look,
 * and the two named themes were dark only.
 */
function migrateThemeSettings(data) {
  const out = { ...data };
  const old = out.theme;
  if (MODES.includes(old)) { out.theme = DEFAULT_THEME; if (!MODES.includes(out.mode)) out.mode = old; }
  else if ((old === 'those-guys' || old === 'other-guys') && !MODES.includes(out.mode)) out.mode = 'dark';
  if (!isValidId(out.theme)) out.theme = DEFAULT_THEME;
  if (!MODES.includes(out.mode)) out.mode = 'system';
  return out;
}

module.exports = {
  MODES, DEFAULT_THEME, ThemeError, isValidId, parseJsonc, deepMerge, resolveTheme, themeName,
  variantOf, cssVars, cssBlock, tokenColor, fontStack, migrateThemeSettings, normalizeEffects, safeCss, COLOR_VARS, MD_VARS, KNOWN_COLOR_KEYS,
  CURSOR_EFFECTS, CURSOR_EFFECT_IDS
};
