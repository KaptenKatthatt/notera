'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const v = require('../../src/main/vscodeImport');
const { resolveTheme, variantOf, cssVars } = require('../../src/shared/themeFormat');
const { makeZip } = require('./zipWriter');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-vsc-'));
const pkg = (themes, extra = {}) => JSON.stringify({ name: 'fake', publisher: 'tester', version: '1.2.3', displayName: '%displayName%', contributes: { themes }, ...extra });
const dark = {
  // VS Code theme files carry comments
  name: 'Fake Dark', type: 'dark',
  colors: { 'editor.background': '#101820', 'editor.foreground': '#e0e0e0', 'activityBar.background': '#000000', 'button.background': '#ff00aa' },
  tokenColors: [
    { scope: 'keyword', settings: { foreground: '#123456' } },
    { scope: ['heading.2.markdown', 'markup.heading'], settings: { foreground: '#ff7edb' } },
    { scope: 'markup.quote', settings: { foreground: '#999999', fontStyle: 'italic' } }
  ]
};
const light = { name: 'Fake Light', include: './base-light.json', colors: { 'editor.background': '#fafafa' } };
const baseLight = { colors: { 'editor.foreground': '#202020', 'editor.background': '#ffffff' }, tokenColors: [{ scope: 'markup.heading', settings: { foreground: '#aa0066' } }] };
const files = {
  'extension/package.json': pkg([
    { label: '%dark%', uiTheme: 'vs-dark', path: './themes/dark.json' },
    { label: 'Fake Light', uiTheme: 'vs', path: './themes/light.json' },
    { label: 'Fake Dark High Contrast', uiTheme: 'hc-black', path: './themes/dark.json' }
  ]),
  'extension/package.nls.json': JSON.stringify({ displayName: 'Fake Themes', dark: 'Fake Dark' }),
  'extension/themes/dark.json': '// comment\n' + JSON.stringify(dark, null, 2).replace('"#e0e0e0",', '"#e0e0e0", // text\n'),
  'extension/themes/light.json': JSON.stringify(light),
  'extension/themes/base-light.json': JSON.stringify(baseLight)
};

test('a .vsix is read with deflated and stored entries alike', () => {
  for (const store of [false, true]) {
    const zip = v.readZip(makeZip({ 'a.txt': 'hej', 'dir/b.json': '{"x":1}' }, { store }));
    assert.equal(zip.get('a.txt')().toString(), 'hej');
    assert.equal(zip.get('dir/b.json')().toString(), '{"x":1}');
  }
  assert.throws(() => v.readZip(Buffer.from('not a zip at all, just text that is long enough')), /not a zip/);
});

test('themes in an extension: labels localized from package.nls.json, light and dark told apart', () => {
  const file = path.join(tmp, 'fake.vsix');
  fs.writeFileSync(file, makeZip(files));
  const list = v.themesIn(v.vsixSource(file));
  assert.deepEqual(list.map((th) => [th.label, th.dark]), [['Fake Dark', true], ['Fake Light', false], ['Fake Dark High Contrast', true]]);
  assert.equal(list[0].extension.name, 'Fake Themes');
  assert.equal(list[0].extension.version, '1.2.3');
});

test('a theme pairs with the closest-named theme of the other type from the same extension', () => {
  const list = v.themesIn(v.vsixSource(path.join(tmp, 'fake.vsix')));
  assert.equal(v.counterpart(list[0], list).label, 'Fake Light');
  assert.equal(v.counterpart(list[1], list).label, 'Fake Dark', 'a high-contrast variant is not picked over the plain one');
  const gh = ['GitHub Light Default', 'GitHub Dark Default', 'GitHub Dark Dimmed', 'GitHub Light', 'GitHub Light High Contrast'].map((label) => ({
    label, dark: /Dark/.test(label), extension: { id: 'gh' }, src: { id: 'x' }
  }));
  const find = (l) => gh.find((x) => x.label === l);
  assert.equal(v.counterpart(find('GitHub Dark Default'), gh).label, 'GitHub Light Default');
  assert.equal(v.counterpart(find('GitHub Dark Dimmed'), gh).label, 'GitHub Light');
});

test('conversion: include chains resolved, only the colours Notera reads and the Markdown rules kept', () => {
  const list = v.themesIn(v.vsixSource(path.join(tmp, 'fake.vsix')));
  const nt = v.toNoteraTheme(list[0], v.counterpart(list[0], list));
  assert.deepEqual(nt.importedFrom, { extension: 'tester.fake', version: '1.2.3', themes: ['Fake Dark', 'Fake Light'] });
  assert.equal(nt.dark.colors['activityBar.background'], undefined, 'colours Notera does not read are dropped');
  assert.equal(nt.dark.colors['button.background'], '#ff00aa');
  assert.deepEqual(nt.dark.tokenColors.map((r) => r.scope), [['heading.2.markdown', 'markup.heading'], ['markup.quote']]);
  assert.deepEqual(nt.light.colors, { 'editor.foreground': '#202020', 'editor.background': '#fafafa' }, 'include first, own colours over it');
  const r = resolveTheme('x', () => nt);
  const d = cssVars(variantOf(r.theme, true));
  const l = cssVars(variantOf(r.theme, false));
  assert.equal(d['--bg'], '#101820');
  assert.equal(d['--md-h'], '#ff7edb');
  assert.equal(d['--md-h2'], '#ff7edb', 'per-level heading scopes become heading colours');
  assert.equal(l['--bg'], '#fafafa');
  assert.equal(l['--md-h'], '#aa0066');
});

test('an extension folder on disk reads the same as a .vsix', () => {
  const dir = path.join(tmp, 'ext', 'tester.fake-1.2.3');
  for (const [name, content] of Object.entries(files)) {
    const f = path.join(dir, name.replace(/^extension\//, ''));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content);
  }
  process.env.NOTERA_VSCODE_EXTENSIONS = path.join(tmp, 'ext');
  try {
    const list = v.listInstalled();
    assert.deepEqual(list.map((th) => th.label), ['Fake Dark', 'Fake Dark High Contrast', 'Fake Light']);
    assert.equal(v.folderSource(dir).read('../../../etc/passwd'), null, 'reads stay inside the extension');
  } finally { delete process.env.NOTERA_VSCODE_EXTENSIONS; }
});

test('theme names become folder names', () => {
  assert.equal(v.slugify("SynthWave '84"), 'synthwave-84');
  assert.equal(v.slugify('Catppuccin Frappé'), 'catppuccin-frappe');
  assert.equal(v.slugify('!!!'), 'vscode-theme');
});
