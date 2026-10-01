// Themes: every built-in theme in both its light and its dark version, the Theme menu's two
// groups (theme, then mode) with one pick each, user themes in <userData>/themes that repaint on
// save, a broken theme.json that keeps the previous theme and names the line, and the migration
// from the old single `theme` setting.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'test/e2e/shots');
fs.mkdirSync(shots, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-th-'));
const userData = path.join(tmp, 'ud');
const userThemes = path.join(userData, 'themes');
const fixture = path.join(tmp, 'Veckoplan.md');
fs.writeFileSync(fixture, '# Veckoplan\n\nEn **fet** rad, en *kursiv* och lite `kod`. Se [länken](https://example.com).\n\n## Att göra\n\n- [ ] Handla\n- [x] Ringa vet\n\n> Citat från någon klok\n\n```js\nconsole.log(1)\n```\n');
// The old settings format: one `theme` value that was both palette and mode.
fs.mkdirSync(userData, { recursive: true });
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ theme: 'those-guys', language: 'sv', viewMode: 'split', checkUpdates: false }));
const launch = () => electron.launch({ args: [root, fixture], env: { ...process.env, NOTERA_USER_DATA: userData, NOTERA_TEST: '1' } });
const ok = (label) => console.log('ok  ', label);

let app = await launch();
let win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
await win.setViewportSize({ width: 1100, height: 700 });
await win.waitForSelector('#preview h1');
const shot = (name) => win.screenshot({ path: path.join(shots, name + '.png') });
const css = (sel, prop) => win.evaluate(([s, p]) => getComputedStyle(document.querySelector(s))[p], [sel, prop]);
const cssVar = (name) => win.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
// True when the first painted background over the middle of the selection is the selection itself.
const selectionOnTop = () => win.evaluate(() => {
  const r = document.querySelector('.cm-selectionBackground').getBoundingClientRect();
  const painted = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    .find((e) => !/^rgba\(.*, 0\)$|^transparent$/.test(getComputedStyle(e).backgroundColor));
  return !!painted && painted.classList.contains('cm-selectionBackground');
});
const settingsNow = () => win.evaluate(() => window.notera.getSettings());
/** The Theme submenu's radio items, split at the separators: [themes, modes]. */
const menuGroups = () => app.evaluate(({ Menu }) => {
  let found = null;
  const walk = (items) => { for (const i of items) { if (i.submenu && i.submenu.items.some((x) => x.type === 'radio' && /Standard|Default/.test(x.label))) found = i.submenu.items; else if (i.submenu) walk(i.submenu.items); } };
  walk(Menu.getApplicationMenu().items);
  const groups = [[]];
  for (const i of found) { if (i.type === 'separator') groups.push([]); else if (i.type === 'radio') groups[groups.length - 1].push([i.label, i.checked]); }
  return groups.filter((g) => g.length);
});
const waitTheme = (id, scheme) => win.waitForFunction(([i, s]) => document.documentElement.dataset.themeId === i && document.documentElement.dataset.theme === s, [id, scheme]);

// ---------- migration ----------
const s = await settingsNow();
assert.equal(s.theme, 'those-guys');
assert.equal(s.mode, 'dark');
await waitTheme('those-guys', 'dark');
ok('gamla inställningen theme: those-guys blir tema Those guys i läge Mörkt');

// ---------- built-in themes, both variants ----------
const cases = [
  { id: 'default', mode: 'light', bg: 'rgb(255, 255, 255)', accent: '#0067c0', h1: 'rgb(34, 35, 36)', caret: 'rgb(34, 35, 36)' },
  { id: 'default', mode: 'dark', bg: 'rgb(16, 16, 16)', accent: '#4cc2ff', h1: 'rgb(238, 238, 238)', caret: 'rgb(238, 238, 238)' },
  { id: 'those-guys', mode: 'dark', bg: 'rgb(38, 38, 36)', accent: '#d77757', h1: 'rgb(215, 119, 87)', caret: 'rgb(215, 119, 87)' },
  { id: 'those-guys', mode: 'light', bg: 'rgb(250, 249, 245)', accent: '#c6613f', h1: 'rgb(198, 97, 63)', caret: 'rgb(198, 97, 63)' },
  { id: 'other-guys', mode: 'dark', bg: 'rgb(17, 17, 17)', accent: '#ececec', h1: 'rgb(255, 255, 255)', caret: 'rgb(255, 255, 255)' },
  { id: 'other-guys', mode: 'light', bg: 'rgb(255, 255, 255)', accent: '#0d0d0d', h1: 'rgb(0, 0, 0)', caret: 'rgb(13, 13, 13)' }
];
for (const c of cases) {
  await win.evaluate(([id, mode]) => window.notera.setSettings({ theme: id, mode }), [c.id, c.mode]);
  await waitTheme(c.id, c.mode);
  await win.waitForTimeout(80);
  assert.equal(await css('body', 'backgroundColor'), c.bg, `${c.id}/${c.mode} background`);
  assert.equal(await cssVar('--accent'), c.accent, `${c.id}/${c.mode} accent`);
  assert.equal(await css('#preview h1', 'color'), c.h1, `${c.id}/${c.mode} preview h1`);
  const [themesGroup, modesGroup] = await menuGroups();
  assert.equal(themesGroup.filter(([, on]) => on).length, 1, 'exactly one theme is ticked');
  assert.equal(modesGroup.filter(([, on]) => on).length, 1, 'exactly one mode is ticked');
  assert.equal(modesGroup.find(([, on]) => on)[0], c.mode === 'dark' ? 'Mörkt' : 'Ljust');
  await win.click('.cm-content');
  await win.keyboard.press('Control+End');
  await win.keyboard.type('x');
  await win.waitForTimeout(120);
  assert.equal(await css('.cm-cursorLayer .cm-cursor', 'borderLeftColor'), c.caret, `${c.id}/${c.mode} caret`);
  await shot(`40-theme-${c.id}-${c.mode}`);
  await win.keyboard.press('Backspace');
  // A double-clicked word shows its selection: nothing opaque is painted over the selection layer.
  const at = await win.evaluate(() => {
    const v = window.__notera.view;
    const c = v.coordsAtPos(v.state.doc.toString().indexOf('Handla') + 3);
    return { x: c.left, y: (c.top + c.bottom) / 2 };
  });
  await win.mouse.dblclick(at.x, at.y);
  assert.equal(await win.evaluate(() => { const v = window.__notera.view; const r = v.state.selection.main; return v.state.sliceDoc(r.from, r.to); }), 'Handla');
  assert.equal(await selectionOnTop(), true, `${c.id}/${c.mode} a double-clicked word is visibly selected`);
  ok(`${c.id} ${c.mode}: egen palett, en bock per grupp i menyn`);
}
assert.equal(await css('.preview', 'fontFamily').then((f) => f.split(',')[0]), '"Segoe UI Variable"');
await win.evaluate(() => window.notera.setSettings({ theme: 'those-guys' }));
await waitTheme('those-guys', 'light');
await win.waitForFunction(() => getComputedStyle(document.querySelector('.preview')).fontFamily.startsWith('"Tiempos Text"'));
await win.waitForFunction(() => getComputedStyle(document.querySelector('.tab.active')).boxShadow.includes('inset'));
ok('Those guys läser med serif och har sin flikmarkering (style.css via notera-theme://)');
const lh = () => win.evaluate(() => { const cs = getComputedStyle(document.querySelector('.cm-scroller')); return parseFloat(cs.lineHeight) / parseFloat(cs.fontSize); });
assert.ok(Math.abs((await lh()) - 1.4) < 0.01, `editor line height is 1.4 (${await lh()})`);
assert.deepEqual((await menuGroups())[0].map(([l]) => l), ['Standard', 'Those guys', 'The Other guys', 'Neon Chill', 'Neon', 'Neon OMG']);
ok('menyn listar Standard, Those guys, The Other guys, Neon-familjen och sedan lägena');

// ---------- settings dialog ----------
await win.evaluate(() => window.__notera.handleAction('settings'));
await win.waitForSelector('#dlg-settings[open]');
const selects = await win.locator('#dlg-settings select').evaluateAll((els) => els.map((e) => [...e.options].map((o) => o.textContent)));
assert.deepEqual(selects[0], ['Standard', 'Those guys', 'The Other guys', 'Neon Chill', 'Neon', 'Neon OMG']);
assert.deepEqual(selects[1], ['Följ systemet', 'Ljust', 'Mörkt']);
await shot('42-theme-settings');
await win.keyboard.press('Escape');
ok('Inställningar har tema och läge som två val');

// ---------- a user theme, reloaded on save ----------
const mine = path.join(userThemes, 'mitt-tema');
fs.mkdirSync(path.join(mine), { recursive: true });
fs.writeFileSync(path.join(mine, 'style.css'), '.tab.active { outline: 3px solid rgb(1, 2, 3); }\n');
const writeMine = (bg) => fs.writeFileSync(path.join(mine, 'theme.json'), `{
  // extends Those guys and only changes the background
  "name": "Mitt tema",
  "extends": "those-guys",
  "style": "style.css",
  "notera": { "lineHeight": 1.75 },
  "dark": { "colors": { "editor.background": "${bg}", }, },
  "light": { "colors": { "editor.background": "${bg}" } }
}
`);
writeMine('#203040');
await win.waitForFunction(() => window.notera.listThemes().then((l) => l.some((t) => t.id === 'mitt-tema')));
await win.evaluate(() => window.notera.setSettings({ theme: 'mitt-tema', mode: 'dark' }));
await waitTheme('mitt-tema', 'dark');
await win.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(32, 48, 64)');
assert.equal(await cssVar('--accent'), '#d77757', 'inherits the accent from Those guys');
await win.waitForFunction(() => getComputedStyle(document.querySelector('.tab.active')).outlineColor === 'rgb(1, 2, 3)');
assert.ok(Math.abs((await lh()) - 1.75) < 0.01, `the theme's lineHeight applies (${await lh()})`);
ok('eget tema i temamappen ärver av Those guys, laddar sin style.css och sätter radhöjd 1,75');

writeMine('#402030');
await win.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(64, 32, 48)', null, { timeout: 5000 });
ok('ändrad theme.json målas om direkt när filen sparas');

fs.writeFileSync(path.join(mine, 'theme.json'), '{\n  "name": "Mitt tema",\n  "extends": "those-guys"\n  "dark": {}\n}\n');
await win.waitForSelector('#theme-toast:not([hidden])', { timeout: 5000 });
const toast = await win.textContent('#theme-toast-text');
assert.match(toast, /mitt-tema/);
assert.match(toast, /rad 4/);
assert.equal(await css('body', 'backgroundColor'), 'rgb(64, 32, 48)', 'the previous theme stays on screen');
await shot('43-theme-broken');
ok(`trasig theme.json: "${toast}", förra temat ligger kvar`);

writeMine('#304020');
await win.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(48, 64, 32)', null, { timeout: 5000 });
await win.waitForSelector('#theme-toast', { state: 'hidden' });
await shot('44-theme-user');
ok('när filen är lagad försvinner felet och temat målas');

// ---------- restart ----------
await win.evaluate(() => { const t = window.__notera.active; t.dirty = false; t.savedDoc = window.__notera.view.state.doc; });
await app.close();
app = await launch();
win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
await waitTheme('mitt-tema', 'dark');
assert.equal(await css('body', 'backgroundColor'), 'rgb(48, 64, 32)');
ok('temat och läget finns kvar efter omstart');

// A theme folder that disappears falls back to Default.
fs.rmSync(mine, { recursive: true });
await win.waitForFunction(() => document.documentElement.dataset.themeId === 'default', null, { timeout: 5000 });
ok('ett borttaget tema faller tillbaka på Standard');
await win.evaluate(() => { const t = window.__notera.active; t.dirty = false; t.savedDoc = window.__notera.view.state.doc; });
await app.close();
console.log('themes OK');
