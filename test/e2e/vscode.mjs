// VS Code theme import: themes from a (fake) local VS Code install listed in the palette with
// their light/dark partner, previewed with the arrow keys before anything is written, imported
// into the themes folder on Enter; a .vsix dropped on the window; a broken .vsix.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { makeZip } = require('../unit/zipWriter.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'test/e2e/shots');
fs.mkdirSync(shots, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-vsc-'));
const userData = path.join(tmp, 'ud');
const extensions = path.join(tmp, 'vscode-extensions');
const fixture = path.join(tmp, 'Anteckning.md');
fs.writeFileSync(fixture, '# Anteckning\n\n## Del två\n\nLite text med `kod` och en [länk](https://example.com).\n\n> Ett citat\n');
fs.mkdirSync(userData, { recursive: true });
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ language: 'sv', viewMode: 'split', checkUpdates: false, notesBannerDismissed: true, autosave: false, mode: 'dark' }));

// A local VS Code with two theme extensions: a dark-only one whose file includes another, and one
// with a light and a dark theme.
const ext = (dir, pkg, files) => {
  const base = path.join(extensions, dir);
  fs.mkdirSync(path.join(base, 'themes'), { recursive: true });
  fs.writeFileSync(path.join(base, 'package.json'), JSON.stringify(pkg));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(base, name), content);
};
const md = (h, link, quote, code) => [
  { scope: ['markup.heading', 'entity.name.section.markdown'], settings: { foreground: h } },
  { scope: 'markup.underline.link', settings: { foreground: link } },
  { scope: 'markup.quote', settings: { foreground: quote } },
  { scope: 'markup.inline.raw.string.markdown', settings: { foreground: code } }
];
ext('vamp.nightfall-2.0.0', { name: 'nightfall', publisher: 'vamp', version: '2.0.0', displayName: 'Nightfall', contributes: { themes: [{ label: 'Nightfall', uiTheme: 'vs-dark', path: './themes/nightfall.json' }] } }, {
  'themes/nightfall.json': '{\n  // Nightfall\n  "name": "Nightfall",\n  "include": "./base.json",\n  "colors": { "editor.background": "#282a36", "button.background": "#bd93f9", },\n  "tokenColors": ' + JSON.stringify(md('#ff79c6', '#8be9fd', '#6272a4', '#50fa7b')) + '\n}\n',
  'themes/base.json': JSON.stringify({ colors: { 'editor.foreground': '#f8f8f2', 'sideBar.background': '#21222c' } })
});
ext('hub.hubtheme-6.0.0', { name: 'hubtheme', publisher: 'hub', version: '6.0.0', displayName: 'Hub Theme', contributes: { themes: [
  { label: 'Hub Light Default', uiTheme: 'vs', path: './themes/light.json' },
  { label: 'Hub Dark Default', uiTheme: 'vs-dark', path: './themes/dark.json' }
] } }, {
  'themes/light.json': JSON.stringify({ colors: { 'editor.background': '#ffffff', 'editor.foreground': '#1f2328', 'button.background': '#1f883d' }, tokenColors: md('#0550ae', '#0a3069', '#57606a', '#953800') }),
  'themes/dark.json': JSON.stringify({ colors: { 'editor.background': '#0d1117', 'editor.foreground': '#e6edf3', 'button.background': '#238636' }, tokenColors: md('#79c0ff', '#a5d6ff', '#8b949e', '#ffa657') })
});

const app = await electron.launch({ args: [root, fixture], env: { ...process.env, NOTERA_USER_DATA: userData, NOTERA_TEST: '1', NOTERA_VSCODE_EXTENSIONS: extensions } });
const win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
await win.setViewportSize({ width: 1100, height: 700 });
const ok = (label) => console.log('ok  ', label);
const shot = (name) => win.screenshot({ path: path.join(shots, name + '.png') });
const settingsNow = () => win.evaluate(() => window.notera.getSettings());
const bg = () => win.evaluate(() => getComputedStyle(document.body).backgroundColor);
const items = () => win.$$eval('#qp-list .qp-item', (els) => els.map((e) => ({ label: e.querySelector('.qp-label').textContent, detail: e.querySelector('.qp-detail')?.textContent || '' })));
const openImport = async () => {
  await win.click('.cm-content');
  await win.keyboard.press('Control+Shift+P');
  await win.waitForSelector('#quick-pick:not([hidden])');
  await win.keyboard.type('importera vs code');
  await win.waitForTimeout(80);
  assert.equal((await items())[0].label, 'Visa: Importera VS Code-tema');
  await win.keyboard.press('Enter');
  await win.waitForFunction(() => document.querySelector('#qp-q').placeholder.startsWith('Välj ett VS Code-tema'));
};

// ---------- list and preview ----------
await openImport();
const list = await items();
assert.deepEqual(list.map((i) => i.label), ['Hub Dark Default', 'Hub Light Default', 'Nightfall', 'Välj en .vsix-fil…']);
assert.equal(list[0].detail, 'Hub Theme · med Hub Light Default');
assert.equal(list[2].detail, 'Nightfall · bara mörkt');
await win.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(13, 17, 23)');
await win.keyboard.press('ArrowDown');
await win.keyboard.press('ArrowDown');
await win.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(40, 42, 54)');
assert.equal(await win.evaluate(() => getComputedStyle(document.querySelector('#preview h2')).color), 'rgb(255, 121, 198)', 'preview headings take markup.heading too');
assert.equal(await win.evaluate(() => getComputedStyle(document.querySelector('.cm-line.cm-h2 .cm-hd:last-child')).color), 'rgb(255, 121, 198)', 'editor headings take markup.heading');
assert.equal(fs.existsSync(path.join(userData, 'themes')) && fs.readdirSync(path.join(userData, 'themes')).length, 0, 'previewing writes nothing');
await shot('80-vscode-preview-nightfall');
await win.keyboard.press('Escape');
await win.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(16, 16, 16)');
assert.equal((await settingsNow()).theme, 'default');
ok('installerade VS Code-teman listas med sin ljusa/mörka partner, piltangenterna förhandsvisar, Esc ångrar');

// ---------- import a pair ----------
await openImport();
await win.keyboard.press('Enter');
await win.waitForFunction(() => window.notera.getSettings().then((s) => s.theme === 'hub-dark-default'));
const file = path.join(userData, 'themes', 'hub-dark-default', 'theme.json');
const text = fs.readFileSync(file, 'utf8');
assert.match(text, /\/\/ Importerat från VS Code: Hub Dark Default \+ Hub Light Default \(6\.0\.0\)/);
const imported = JSON.parse(text.replace(/^\s*\/\/.*$/mg, ''));
assert.deepEqual(Object.keys(imported).sort(), ['$schema', 'dark', 'importedFrom', 'light', 'name']);
await win.waitForFunction(() => document.documentElement.dataset.themeId === 'hub-dark-default');
assert.equal(await bg(), 'rgb(13, 17, 23)');
await win.evaluate(() => window.notera.setSettings({ mode: 'light' }));
await win.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(255, 255, 255)');
assert.equal(await win.evaluate(() => getComputedStyle(document.querySelector('.cm-line.cm-h2 .cm-hd:last-child')).color), 'rgb(5, 80, 174)');
await shot('81-vscode-imported-light');
ok('Enter importerar paret: theme.json i temamappen, Ljust visar Hub Light, Mörkt Hub Dark');

// Importing again replaces the earlier copy instead of making hub-dark-default-2.
await openImport();
await win.keyboard.press('Enter');
await win.waitForTimeout(400);
assert.deepEqual(fs.readdirSync(path.join(userData, 'themes')), ['hub-dark-default']);
ok('samma tema importerat igen ersätter den förra kopian');

// ---------- a .vsix dropped on the window ----------
const perLevel = [1, 2, 3].map((n, i) => ({ scope: `heading.${n}.markdown`, settings: { foreground: ['#f38ba8', '#fab387', '#f9e2af'][i] } }));
const vsix = path.join(tmp, 'kattpuss.vsix');
fs.writeFileSync(vsix, makeZip({
  'extension/package.json': JSON.stringify({ name: 'kattpuss', publisher: 'katt', version: '3.1.0', displayName: 'Kattpuss', contributes: { themes: [
    { label: 'Kattpuss Mocka', uiTheme: 'vs-dark', path: './themes/mocka.json' },
    { label: 'Kattpuss Latte', uiTheme: 'vs', path: './themes/latte.json' }
  ] } }),
  'extension/themes/mocka.json': JSON.stringify({ colors: { 'editor.background': '#1e1e2e', 'editor.foreground': '#cdd6f4' }, tokenColors: perLevel }),
  'extension/themes/latte.json': JSON.stringify({ colors: { 'editor.background': '#eff1f5', 'editor.foreground': '#4c4f69' }, tokenColors: perLevel })
}));
await win.evaluate((p) => window.__notera.openPaths([p]), vsix);
await win.waitForSelector('#quick-pick:not([hidden])');
assert.deepEqual((await items()).map((i) => i.label), ['Kattpuss Mocka', 'Kattpuss Latte'], 'in the order the extension lists them');
assert.equal(await win.evaluate(() => window.__notera.tabs.some((t) => /\.vsix$/.test(t.name))), false, 'the .vsix is not opened as text');
await win.keyboard.press('Enter');
await win.waitForFunction(() => window.notera.getSettings().then((s) => s.theme === 'kattpuss-mocka'));
await win.evaluate(() => window.notera.setSettings({ mode: 'dark' }));
await win.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(30, 30, 46)');
assert.equal(await win.evaluate(() => getComputedStyle(document.querySelector('#preview h2')).color), 'rgb(250, 179, 135)', 'per-level heading colours from heading.2.markdown');
await shot('82-vscode-vsix-per-level');
ok('en .vsix som släpps på fönstret visar sina teman och importeras, med rubrikfärg per nivå');

const broken = path.join(tmp, 'trasig.vsix');
fs.writeFileSync(broken, 'det här är ingen zip-fil, bara text som råkar heta .vsix');
await win.evaluate((p) => window.__notera.openPaths([p]), broken);
await win.waitForSelector('#theme-toast:not([hidden])');
assert.match(await win.textContent('#theme-toast-text'), /trasig\.vsix gick inte att läsa/);
ok('en trasig .vsix säger att den inte gick att läsa');

await win.evaluate(() => { for (const t of window.__notera.tabs) { t.dirty = false; } });
await app.close();
console.log('vscode OK');
