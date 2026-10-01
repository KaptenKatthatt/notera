'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  parseJsonc, resolveTheme, variantOf, cssVars, tokenColor, fontStack, migrateThemeSettings, themeName, isValidId, ThemeError
} = require('../../src/shared/themeFormat');
const { makeT } = require('../../src/shared/strings');

const themesDir = path.join(__dirname, '../../themes');
const builtin = (id) => {
  const file = path.join(themesDir, id, 'theme.json');
  return fs.existsSync(file) ? parseJsonc(fs.readFileSync(file, 'utf8')) : null;
};

test('theme.json may carry comments and trailing commas, like VS Code theme files', () => {
  const v = parseJsonc('{\n  // a comment\n  "a": "http://x/*not a comment*/", /* block\n */ "b": [1, 2,],\n  "c": { "d": 1, // trailing\n },\n}');
  assert.deepEqual(v, { a: 'http://x/*not a comment*/', b: [1, 2], c: { d: 1 } });
});

test('a parse error names its line', () => {
  try {
    parseJsonc('{\n  "a": 1,\n  "b": oops\n}');
    assert.fail('should throw');
  } catch (e) {
    assert.ok(e instanceof ThemeError);
    assert.equal(e.line, 3);
  }
});

test('extends merges parents first, objects key by key, and keeps fonts and styles with their owner', () => {
  const themes = {
    base: { name: 'Base', style: 'a.css', fonts: [{ family: 'A', src: 'fonts/a.ttf' }], dark: { colors: { 'editor.background': '#000', 'editor.foreground': '#fff' } } },
    child: { name: 'Child', extends: 'base', style: 'b.css', dark: { colors: { 'editor.background': '#111' } } }
  };
  const r = resolveTheme('child', (id) => themes[id] || null);
  assert.deepEqual(r.chain, ['base', 'child']);
  assert.equal(r.theme.name, 'Child');
  assert.deepEqual(r.theme.dark.colors, { 'editor.background': '#111', 'editor.foreground': '#fff' });
  assert.deepEqual(r.styles, [{ owner: 'base', path: 'a.css' }, { owner: 'child', path: 'b.css' }]);
  assert.equal(r.fonts[0].owner, 'base');
});

test('extends loops and missing parents are errors', () => {
  assert.throws(() => resolveTheme('a', (id) => ({ a: { extends: 'b' }, b: { extends: 'a' } })[id]), /loops/);
  assert.throws(() => resolveTheme('a', (id) => ({ a: { extends: 'gone' } })[id] || null), /"gone" not found/);
});

test('a theme with only a dark variant uses it for both modes', () => {
  const theme = { dark: { colors: { 'editor.background': '#123456' } } };
  assert.equal(variantOf(theme, false).type, 'dark');
  assert.equal(cssVars(variantOf(theme, false))['--bg'], '#123456');
});

test('shared values sit under both variants, the variant wins', () => {
  const theme = { notera: { fonts: { editor: 'Victor Mono' }, colors: { heading: '#111' } }, light: { notera: { colors: { heading: '#222' } } } };
  const v = variantOf(theme, false);
  assert.equal(v.notera.fonts.editor, 'Victor Mono');
  assert.equal(v.notera.colors.heading, '#222');
});

test('VS Code colour keys fill Notera variables, with derived fallbacks for the rest', () => {
  const vars = cssVars({ colors: { 'editor.background': '#1e1e1e', 'editor.foreground': '#d4d4d4', 'sideBar.background': '#252526' }, tokenColors: [], notera: {} });
  assert.equal(vars['--bg'], '#1e1e1e');
  assert.equal(vars['--bg-chrome'], '#252526');
  assert.match(vars['--bg-hover'], /^color-mix/);
  assert.equal(vars['--md-h'], 'var(--fg)');
});

test('Markdown colours come from tokenColors scopes like VS Code, notera.colors wins', () => {
  const tokenColors = [
    { scope: ['markup.heading', 'entity.name.section.markdown'], settings: { foreground: '#ff79c6' } },
    { scope: 'markup.quote', settings: { foreground: '#f1fa8c' } },
    { scope: 'markup.inline.raw.string.markdown', settings: { foreground: '#50fa7b' } }
  ];
  assert.equal(tokenColor(tokenColors, 'markup.heading'), '#ff79c6');
  const vars = cssVars({ colors: {}, tokenColors, notera: { colors: { quote: '#abcdef' } } });
  assert.equal(vars['--md-h'], '#ff79c6');
  assert.equal(vars['--md-quote'], '#abcdef');
  assert.equal(vars['--md-code'], '#50fa7b');
});

test('values that could break out of a CSS declaration are dropped', () => {
  const vars = cssVars({ colors: { 'editor.background': 'red; } body { display: none', 'editor.foreground': 'url(x)' }, tokenColors: [], notera: {} });
  assert.equal(vars['--bg'], undefined);
  assert.equal(vars['--fg'], undefined);
  assert.equal(fontStack('Evil"; x'), null);
  assert.equal(fontStack(['Victor Mono', 'monospace']), '"Victor Mono", monospace');
});

test('old theme settings migrate to theme + mode', () => {
  assert.deepEqual(migrateThemeSettings({ theme: 'dark' }), { theme: 'default', mode: 'dark' });
  assert.deepEqual(migrateThemeSettings({ theme: 'system' }), { theme: 'default', mode: 'system' });
  assert.deepEqual(migrateThemeSettings({ theme: 'those-guys' }), { theme: 'those-guys', mode: 'dark' });
  assert.deepEqual(migrateThemeSettings({ theme: 'neon', mode: 'light' }), { theme: 'neon', mode: 'light' });
  assert.deepEqual(migrateThemeSettings({}), { theme: 'default', mode: 'system' });
  assert.deepEqual(migrateThemeSettings({ theme: '../etc' }), { theme: 'default', mode: 'system' });
});

test('theme ids are lowercase folder names', () => {
  assert.ok(isValidId('neon-omg'));
  assert.ok(!isValidId('Neon'));
  assert.ok(!isValidId('../x'));
  assert.ok(!isValidId('__proto__x'.toUpperCase()));
});

test('names may be localized', () => {
  assert.equal(themeName({ en: 'Default', sv: 'Standard' }, 'sv', 'x'), 'Standard');
  assert.equal(themeName({ en: 'Default' }, 'sv', 'x'), 'Default');
  assert.equal(themeName(undefined, 'sv', 'x'), 'x');
});

test('every built-in theme parses, resolves and ships both a light and a dark variant', () => {
  const ids = fs.readdirSync(themesDir).filter((d) => fs.existsSync(path.join(themesDir, d, 'theme.json')));
  assert.ok(ids.includes('default') && ids.includes('those-guys') && ids.includes('other-guys'), ids.join(','));
  for (const id of ids) {
    const r = resolveTheme(id, builtin);
    for (const dark of [false, true]) {
      const v = variantOf(r.theme, dark);
      assert.equal(v.type, dark ? 'dark' : 'light', `${id} has its own ${dark ? 'dark' : 'light'} variant`);
      const vars = cssVars(v);
      for (const name of ['--bg', '--fg', '--accent', '--md-h']) assert.ok(vars[name], `${id} ${v.type} sets ${name}`);
    }
    for (const s of r.styles) assert.ok(fs.existsSync(path.join(themesDir, s.owner, s.path)), `${id}: ${s.path} exists`);
    for (const f of r.fonts) assert.ok(fs.existsSync(path.join(themesDir, f.owner, f.src)), `${id}: ${f.src} exists`);
  }
});

test('Default keeps its palette, with the AA contrast fixes', () => {
  const r = resolveTheme('default', builtin);
  const light = cssVars(variantOf(r.theme, false));
  const dark = cssVars(variantOf(r.theme, true));
  assert.equal(light['--bg'], '#ffffff');
  assert.equal(light['--accent'], '#0067c0');
  assert.equal(light['--md-code'], '#8b3a00');
  assert.equal(dark['--bg'], '#101010');
  assert.equal(dark['--accent'], '#4cc2ff');
  assert.equal(dark['--md-meta'], '#80838a'); // was #4f525a, 2.4:1; now 4.5:1 or more
  assert.equal(light['--selection-fg'], '#ffffff');
  assert.equal(light['--input-border'], 'color-mix(in srgb, var(--fg) 58%, var(--bg))');
});

test('theme strings exist in both languages', () => {
  for (const locale of ['en', 'sv']) {
    const t = makeT(locale);
    for (const key of ['theme.error', 'theme.errorAt', 'theme.openFolder', 'menu.themeBroken', 'menu.openThemesFolder', 'settings.mode']) {
      assert.notEqual(t(key), key, `${locale}: ${key}`);
    }
  }
});

test('effects are off unless a theme turns them on, and every parameter is checked', () => {
  const { normalizeEffects } = require('../../src/shared/themeFormat');
  const none = normalizeEffects(undefined);
  assert.equal(none.glow, null);
  assert.equal(none.cursor, null);
  assert.equal(none.particles, null);
  assert.deepEqual(none.background, { grid: null, sun: null, scanlines: 0, vignette: 0 });
  const fx = normalizeEffects({
    glow: { target: 'all', strength: 3 },
    gradient: { colors: ['#f0f', 'red; x', '#0ff'], levels: [1, 9, 2] },
    cursor: { style: 'banana', glow: -1, smooth: true },
    particles: { amount: 500 },
    background: { grid: true, sun: { colors: ['#fff'] }, scanlines: 0.3, vignette: 'lots' }
  });
  assert.deepEqual(fx.glow, { target: 'all', strength: 1, color: null });
  assert.deepEqual(fx.gradient, { colors: ['#f0f', '#0ff'], levels: [1, 2] });
  assert.deepEqual(fx.cursor, { style: 'line', glow: 0, smooth: true });
  assert.equal(fx.particles.amount, 40);
  assert.deepEqual(fx.background.grid, { color: null, opacity: 0.5, speed: 0.5 });
  assert.equal(fx.background.scanlines, 0.3);
  assert.equal(fx.background.vignette, 0);
  assert.equal(normalizeEffects({ glow: false }).glow, null, 'false switches an inherited effect off');
  assert.equal(normalizeEffects({ gradient: { colors: ['#fff'] } }).gradient, null, 'a gradient needs two colours');
});

test('heading colours and fonts per level become variables', () => {
  const vars = cssVars({ colors: {}, tokenColors: [], notera: { colors: { heading2: '#36f9f6' }, fonts: { headings: 'Orbitron', heading1: ['Monoton', 'sans-serif'] } }, read: { fonts: { headings: 'Georgia' } } });
  assert.equal(vars['--md-h2'], '#36f9f6');
  assert.equal(vars['--md-h1'], undefined);
  assert.equal(vars['--heading-font'], '"Orbitron"');
  assert.equal(vars['--heading1-font'], '"Monoton", sans-serif');
  assert.equal(vars['--read-heading-font'], '"Georgia"');
});

test('the Neon family goes from calm to everything, and light variants keep glow low', () => {
  const { normalizeEffects, deepMerge } = require('../../src/shared/themeFormat');
  const fx = (id, dark) => {
    const v = variantOf(resolveTheme(id, builtin).theme, dark);
    return { e: normalizeEffects(v.notera.effects), r: normalizeEffects(deepMerge(v.notera.effects || {}, v.read.effects || {})) };
  };
  assert.equal(fx('neon-chill', true).e.background.grid, null);
  assert.equal(fx('neon', true).e.particles, null);
  const omg = fx('neon-omg', true);
  assert.equal(omg.e.glow.target, 'all');
  assert.equal(omg.r.glow.target, 'headings', 'Läs does not make a page of glowing body text');
  assert.ok(omg.e.particles && omg.e.background.grid && omg.e.background.sun);
  for (const id of ['neon-chill', 'neon', 'neon-omg']) {
    const light = fx(id, false);
    for (const side of [light.e, light.r]) assert.ok(!side.glow || side.glow.strength <= 0.3, `${id} light glow`);
  }
});

test('a theme can set the line height in the editor and in Läs, within 1 to 3', () => {
  const vars = cssVars({ colors: {}, tokenColors: [], notera: { lineHeight: 1.75 }, read: { lineHeight: 1.8 } });
  assert.equal(vars['--theme-line-height'], '1.75');
  assert.equal(vars['--read-line-height'], '1.8');
  const bad = cssVars({ colors: {}, tokenColors: [], notera: { lineHeight: 9 }, read: { lineHeight: '2; color: red' } });
  assert.equal(bad['--theme-line-height'], undefined);
  assert.equal(bad['--read-line-height'], undefined);
});
