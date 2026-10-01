// themeTab.js: the Theme tab in Settings. At the top the appearance settings (theme, mode, theme
// effects, cursor effect, editor font); below them an editor for the active theme's own
// properties, generated from theme.schema.json and CURSOR_EFFECTS, so a new effect or parameter
// shows up here without UI code of its own.
//
// Every change shows at once in the window behind the docked dialog: dragging a slider or a
// colour paints a preview (nothing written), letting go writes theme.json through main, which
// keeps the file's comments and copies a built-in theme to "<name> (own)" on the first change.
import schema from '../../theme.schema.json';
import { normalizeEffects, CURSOR_EFFECTS } from '../shared/themeFormat.js';

/** The VS Code colours the tab offers; the rest stay for theme.json and imports. */
const UI_COLORS = ['editor.background', 'editor.foreground', 'button.background', 'editor.selectionBackground', 'editor.lineHighlightBackground', 'editorCursor.foreground'];
/** Keys in notera.effects that are not sections of their own. */
const NOT_A_SECTION = new Set(['typing', 'particles', 'trail', ...Object.keys(CURSOR_EFFECTS)]);
const PREVIEW_MS = 40;

const defs = /** @type {any} */ (schema).definitions;
const deref = (node) => (node && node.$ref ? defs[node.$ref.replace('#/definitions/', '')] : node);
const getIn = (obj, path) => path.reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
const humanize = (key) => key.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/[._]/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * How to edit a schema node: a slider, a list, a switch with its parameters, a colour …
 * @returns {{ kind: string, node: any }}
 */
function kindOf(raw) {
  const node = deref(raw);
  if (!node) return { kind: 'unknown', node };
  if (node === defs.color) return { kind: 'color', node };
  if (node === defs.fontList) return { kind: 'font', node };
  if (node.oneOf) {
    const obj = node.oneOf.map(deref).find((o) => o.type === 'object');
    if (obj) return { kind: 'switch', node: obj };
  }
  if (node.enum) return { kind: 'enum', node };
  if (node.type === 'boolean') return { kind: 'bool', node };
  if ((node.type === 'number' || node.type === 'integer') && node.minimum !== undefined && node.maximum !== undefined) return { kind: 'range', node };
  if (node.type === 'array' && deref(node.items) === defs.color) return { kind: 'colors', node };
  if (node.type === 'array' && deref(node.items).type === 'integer') return { kind: 'levels', node: deref(node.items) };
  if (node.type === 'object' && node.properties) return { kind: 'group', node };
  return { kind: 'unknown', node };
}

/**
 * @param {{
 *   t: (key: string, vars?: object) => string, api: any, getSettings: () => any, getThemes: () => any[],
 *   cursorEffectChoices: () => Array<[string, string]>, openFontDialog: () => any,
 *   previewTheme: (msg: any) => void, restoreTheme: () => void, isDark: () => boolean
 * }} ctx
 */
export function createThemeTab(ctx) {
  const t = ctx.t;
  /** Which variant edits go to: the one on screen until the user picks. */
  let variant = null;
  let info = null;
  let previewTimer = 0;
  /** Sections the user folded, by title key; remembered while the window is open. */
  const folded = new Set();

  // Strings are looked up by key with dots as underscores (editor.background -> editor_background).
  const label = (key) => {
    const id = `themeTab.f.${key.replace(/\./g, '_')}`;
    const v = t(id);
    return typeof v !== 'string' || v === id ? humanize(key) : v;
  };
  const enumLabel = (v) => {
    const s = t(`themeTab.v.${v}`);
    return s === `themeTab.v.${v}` ? humanize(String(v)) : s;
  };

  // ---------- reading values ----------
  /** The variant the controls show: the picked one, or the one on screen for "both". */
  const shown = () => (variant === 'both' || !variant ? (ctx.isDark() ? 'dark' : 'light') : variant);
  /** The value as the theme resolves it, with the format's defaults for effects that leave it out. */
  function valueAt(path) {
    const v = info.variants[shown()];
    const own = getIn(v, path);
    if (own !== undefined) return own;
    // Läs takes the editor's effects unless read.effects says otherwise.
    if (path[0] === 'read' && path[1] === 'effects') return valueAt(['notera', ...path.slice(1)]);
    if (path[0] === 'notera' && path[1] === 'effects' && path.length > 2) {
      const n = normalizeEffects(v.notera.effects, { cursorEffect: CURSOR_EFFECTS[path[2]] ? path[2] : undefined });
      if (CURSOR_EFFECTS[path[2]]) return n.typing ? getIn(n.typing, path.slice(3)) : undefined;
      return getIn(n, path.slice(2));
    }
    return undefined;
  }
  /** True when the theme's own theme.json sets this (where an edit would go), so it can be reset. */
  function isOwn(path) {
    if (info.builtin || !info.own) return false;
    const where = variant === 'light' || variant === 'dark' ? [variant] : ['light', 'dark'];
    return where.some((w) => getIn(info.own, [w, ...path]) !== undefined) || (variant === 'both' && getIn(info.own, path) !== undefined);
  }

  // ---------- writing values ----------
  const editOf = (path, value) => ({ variant: variant || shown(), path, value });
  function preview(path, value) {
    clearTimeout(previewTimer);
    previewTimer = window.setTimeout(async () => {
      const msg = await ctx.api.previewThemeEdit(editOf(path, value));
      if (msg && msg.theme) ctx.previewTheme(msg);
    }, PREVIEW_MS);
  }
  async function commit(path, value) {
    clearTimeout(previewTimer);
    const r = await ctx.api.editTheme(editOf(path, value));
    if (r && r.error) { ctx.restoreTheme(); return; }
    info = r;
    rerender();
  }

  // ---------- controls ----------
  let host = null;
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  /** A labelled row with a reset button when the theme sets the value itself. */
  function row(parent, key, path, control) {
    const r = el('div', 'set-row tt-row');
    r.dataset.path = path.join('.');
    const name = el('span', 'tt-label', label(key));
    const wrap = el('span', 'tt-control');
    wrap.append(control);
    if (isOwn(path)) {
      const reset = el('button', 'tt-reset', '↺');
      reset.type = 'button';
      reset.title = t('themeTab.reset');
      reset.setAttribute('aria-label', `${t('themeTab.reset')}: ${label(key)}`);
      reset.addEventListener('click', () => void commit(path, undefined));
      wrap.append(reset);
    }
    r.append(name, wrap);
    parent.append(r);
    return r;
  }

  function rangeControl(spec, path) {
    const box = el('span', 'tt-range');
    const input = el('input');
    input.type = 'range';
    input.min = String(spec.minimum); input.max = String(spec.maximum);
    input.step = spec.type === 'integer' ? '1' : String((spec.maximum - spec.minimum) / 100);
    const v = valueAt(path);
    input.value = String(typeof v === 'number' ? v : spec.default ?? spec.minimum);
    const out = el('output', 'tt-num', input.value);
    const num = () => (spec.type === 'integer' ? Math.round(Number(input.value)) : Math.round(Number(input.value) * 100) / 100);
    input.addEventListener('input', () => { out.textContent = String(num()); preview(path, num()); });
    input.addEventListener('change', () => void commit(path, num()));
    box.append(input, out);
    return box;
  }

  function colorControl(path) {
    const box = el('span', 'tt-color');
    const v = valueAt(path);
    const pick = el('input');
    pick.type = 'color';
    // Nothing set: the swatch is faint, so black does not read as the colour.
    if (typeof v !== 'string' || !v) pick.classList.add('unset');
    pick.value = typeof v === 'string' && HEX.test(v) ? v : typeof v === 'string' && /^#[0-9a-f]{3}$/i.test(v) ? `#${[...v.slice(1)].map((c) => c + c).join('')}` : '#000000';
    const text = el('input');
    text.type = 'text';
    text.value = typeof v === 'string' ? v : '';
    text.placeholder = t('themeTab.fromTheme');
    text.spellcheck = false;
    pick.addEventListener('input', () => { text.value = pick.value; preview(path, pick.value); });
    pick.addEventListener('change', () => void commit(path, pick.value));
    text.addEventListener('change', () => void commit(path, text.value.trim() || undefined));
    box.append(pick, text);
    return box;
  }

  function colorsControl(path) {
    const box = el('span', 'tt-colors');
    const list = Array.isArray(valueAt(path)) ? [...valueAt(path)] : [];
    const write = () => void commit(path, list.length ? list : undefined);
    list.forEach((c, i) => {
      const pick = el('input');
      pick.type = 'color';
      pick.value = HEX.test(c) ? c : '#000000';
      pick.title = c;
      pick.addEventListener('input', () => { const next = [...list]; next[i] = pick.value; preview(path, next); });
      pick.addEventListener('change', () => { list[i] = pick.value; write(); });
      pick.addEventListener('contextmenu', (e) => { e.preventDefault(); list.splice(i, 1); write(); });
      box.append(pick);
    });
    const add = el('button', 'tt-add', '+');
    add.type = 'button';
    add.title = t('themeTab.addColor');
    add.setAttribute('aria-label', t('themeTab.addColor'));
    add.addEventListener('click', () => { list.push(list[list.length - 1] || '#ff7edb'); write(); });
    box.append(add);
    if (list.length) box.title = t('themeTab.removeColorHint');
    return box;
  }

  function levelsControl(spec, path) {
    const box = el('span', 'tt-levels');
    const on = new Set(Array.isArray(valueAt(path)) ? valueAt(path) : []);
    for (let n = spec.minimum; n <= spec.maximum; n++) {
      const l = el('label', 'tt-level');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.checked = on.has(n);
      cb.addEventListener('change', () => {
        if (cb.checked) on.add(n); else on.delete(n);
        void commit(path, [...on].sort((a, b) => a - b));
      });
      l.append(cb, el('span', '', `H${n}`));
      box.append(l);
    }
    return box;
  }

  function enumControl(values, path, extra = [], name = enumLabel) {
    const sel = el('select');
    for (const [v, text] of [...extra, ...values.map((v) => [v, name(v)])]) {
      const o = el('option', '', text);
      o.value = String(v);
      sel.append(o);
    }
    const v = valueAt(path);
    sel.value = v === undefined ? (extra[0] ? String(extra[0][0]) : String(values[0])) : String(v);
    sel.addEventListener('change', () => void commit(path, sel.value === '' ? undefined : sel.value));
    return sel;
  }

  function boolControl(path) {
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = valueAt(path) === true;
    cb.addEventListener('change', () => void commit(path, cb.checked));
    return cb;
  }

  function fontControl(path) {
    const input = el('input');
    input.type = 'text';
    const v = valueAt(path);
    input.value = Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : '';
    input.placeholder = t('themeTab.fromTheme');
    input.spellcheck = false;
    input.addEventListener('change', () => {
      const list = input.value.split(',').map((f) => f.trim()).filter(Boolean);
      void commit(path, list.length ? (list.length === 1 ? list[0] : list) : undefined);
    });
    return input;
  }

  /** One property from the schema, at `path`, with whatever control its kind needs. */
  function field(parent, key, raw, path) {
    const { kind, node } = kindOf(raw);
    if (kind === 'range') row(parent, key, path, rangeControl(node, path));
    else if (kind === 'color') row(parent, key, path, colorControl(path));
    else if (kind === 'colors') row(parent, key, path, colorsControl(path));
    else if (kind === 'levels') row(parent, key, path, levelsControl(node, path));
    else if (kind === 'enum') row(parent, key, path, enumControl(node.enum, path));
    else if (kind === 'bool') row(parent, key, path, boolControl(path));
    else if (kind === 'font') row(parent, key, path, fontControl(path));
    else if (kind === 'switch') switchField(parent, key, node, path);
    else if (kind === 'group') for (const [k, v] of Object.entries(node.properties)) field(parent, k, v, [...path, k]);
  }

  /** An effect that is on or off, with its parameters under it while it is on. */
  function switchField(parent, key, node, path) {
    const v = valueAt(path);
    const on = v === true || (v !== null && typeof v === 'object');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = on;
    // On is an empty object, which keeps parameters the theme inherits; off is false.
    cb.addEventListener('change', () => void commit(path, cb.checked ? {} : false));
    const r = row(parent, key, path, cb);
    r.classList.add('tt-switch');
    if (!on) return;
    const sub = el('div', 'tt-sub');
    parent.append(sub);
    for (const [k, p] of Object.entries(node.properties)) field(sub, k, p, [...path, k]);
  }

  /** A foldable section; `fill` adds its rows. */
  function section(titleKey, fill) {
    const d = el('details', 'tt-sec');
    d.open = !folded.has(titleKey);
    d.addEventListener('toggle', () => { if (d.open) folded.delete(titleKey); else folded.add(titleKey); });
    d.append(el('summary', '', t(`themeTab.sec.${titleKey}`)));
    const body = el('div', 'tt-body');
    d.append(body);
    fill(body);
    host.append(d);
  }

  // ---------- the appearance settings ----------
  function renderAppearance(box) {
    const s = ctx.getSettings();
    const h = el('h3', '', t('settings.appearance'));
    box.append(h);
    const plainRow = (text, control) => {
      const r = el('label', 'set-row');
      r.append(el('span', '', text), control);
      box.append(r);
    };
    const select = (key, options, value) => {
      const sel = el('select');
      for (const [v, text] of options) { const o = el('option', '', text); o.value = v; sel.append(o); }
      sel.value = value ?? s[key];
      sel.addEventListener('change', () => ctx.api.setSettings({ [key]: sel.value }));
      return sel;
    };
    const clean = (k) => t(k).replace('&', '').replace(/…$/, '');
    plainRow(t('settings.theme'), select('theme', ctx.getThemes().filter((th) => !th.error).map((th) => [th.id, th.name])));
    plainRow(t('settings.mode'), select('mode', [['system', clean('menu.themeSystem')], ['light', clean('menu.themeLight')], ['dark', clean('menu.themeDark')]]));
    const fx = el('label', 'set-check');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = s.effects !== false;
    cb.addEventListener('change', () => ctx.api.setSettings({ effects: cb.checked }));
    fx.append(cb, el('span', '', t('settings.effects')));
    box.append(fx);
    plainRow(t('settings.cursorEffect'), select('cursorEffect', ctx.cursorEffectChoices(), s.cursorEffect || 'theme'));
    const fontBox = el('span', 'set-inline');
    const fontBtn = el('button', '', t('settings.fontChange'));
    fontBtn.type = 'button';
    fontBtn.addEventListener('click', () => void ctx.openFontDialog());
    fontBox.append(el('span', '', `${s.fontFamily}, ${s.fontSize} px`), fontBtn);
    plainRow(t('settings.font'), fontBox);
  }

  // ---------- the theme's own properties ----------
  function renderEditor(box) {
    const head = el('div', 'tt-head');
    head.append(el('h3', '', t('themeTab.editTitle', { name: info.name })));
    const seg = el('div', 'tt-seg');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', t('themeTab.variant'));
    const current = variant || shown();
    for (const v of ['light', 'dark', 'both']) {
      const b = el('button', v === current ? 'on' : '', t(`themeTab.${v}`));
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(v === current));
      b.addEventListener('click', () => { variant = v; rerender(); });
      seg.append(b);
    }
    head.append(seg);
    box.append(head);
    box.append(el('p', 'tt-hint', info.builtin ? t('themeTab.builtinHint', { copy: info.copyName }) : t(variant === 'both' ? 'themeTab.bothHint' : 'themeTab.ownHint')));

    const fx = defs.effects.properties;
    section('cursorEffect', (body) => {
      const typingPath = ['notera', 'effects', 'typing'];
      row(body, 'typing', typingPath, enumControl(fx.typing.enum, typingPath, [['', t('themeTab.noSuggestion')]], (v) => t(`fx.${v}`)));
      // The parameters of the effect that runs now: the user's own choice, else the theme's.
      const s = ctx.getSettings();
      const user = s.cursorEffect && s.cursorEffect !== 'theme' && s.cursorEffect !== 'none' ? s.cursorEffect : null;
      const id = user || valueAt(typingPath);
      if (id && CURSOR_EFFECTS[id] && Object.keys(CURSOR_EFFECTS[id].params).length) {
        body.append(el('p', 'tt-hint', t('themeTab.paramsOf', { name: t(`fx.${id}`) })));
        const node = kindOf(fx[id]).node;
        for (const [k, p] of Object.entries(node.properties)) field(body, k, p, ['notera', 'effects', id, k]);
      }
    });
    section('effects', (body) => {
      for (const [k, p] of Object.entries(fx)) {
        if (NOT_A_SECTION.has(k) || p.deprecated || k === 'background') continue;
        field(body, k, p, ['notera', 'effects', k]);
      }
    });
    section('background', (body) => field(body, 'background', fx.background, ['notera', 'effects', 'background']));
    section('colors', (body) => {
      for (const [k, p] of Object.entries(defs.notera.properties.colors.properties)) field(body, k, p, ['notera', 'colors', k]);
      for (const k of UI_COLORS) field(body, k, defs.colors.properties[k], ['colors', k]);
    });
    section('fonts', (body) => {
      for (const [k, p] of Object.entries(defs.notera.properties.fonts.properties)) field(body, k, p, ['notera', 'fonts', k]);
      field(body, 'lineHeight', defs.notera.properties.lineHeight, ['notera', 'lineHeight']);
    });
    section('read', (body) => {
      for (const [k, p] of Object.entries(defs.read.properties.fonts.properties)) field(body, `read.${k}`, p, ['read', 'fonts', k]);
      field(body, 'lineHeight', defs.read.properties.lineHeight, ['read', 'lineHeight']);
      field(body, 'readGlow', fx.glow, ['read', 'effects', 'glow']);
    });
  }

  let root = null;
  async function render(el0) {
    root = el0 || root;
    if (!root) return;
    info = await ctx.api.themeEditInfo();
    rerender();
  }
  function rerender() {
    if (!root) return;
    const focusedRow = /** @type {HTMLElement | null} */ (document.activeElement?.closest?.('.tt-row') || null);
    const focusedPath = focusedRow ? focusedRow.dataset.path : null;
    const top = root.closest('.set-pane')?.scrollTop || 0;
    root.innerHTML = '';
    renderAppearance(root);
    host = root;
    if (info && !info.error) renderEditor(root);
    else if (info && info.error) root.append(el('p', 'tt-hint', t('theme.error', { theme: info.error.theme, message: info.error.message })));
    const pane = root.closest('.set-pane');
    if (pane) pane.scrollTop = top;
    if (focusedPath) /** @type {HTMLElement | null} */ (root.querySelector(`.tt-row[data-path="${CSS.escape(focusedPath)}"] input, .tt-row[data-path="${CSS.escape(focusedPath)}"] select`))?.focus();
  }

  return { render, reset: () => { variant = null; } };
}
