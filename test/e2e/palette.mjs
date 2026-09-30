// The command palette (Ctrl+Shift+P): every command and setting, the theme picker that previews
// as the selection moves and puts the old theme back on Esc, "New theme from current", Open
// settings (JSON) applied on save, and the view modes' new names Skriv / Delad / Läs.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'test/e2e/shots');
fs.mkdirSync(shots, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-pal-'));
const userData = path.join(tmp, 'ud');
const fixture = path.join(tmp, 'Anteckning.md');
fs.writeFileSync(fixture, '# Anteckning\n\n## Del två\n\nLite text.\n');
fs.mkdirSync(userData, { recursive: true });
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ language: 'sv', viewMode: 'split', checkUpdates: false, notesBannerDismissed: true, autosave: false }));
const app = await electron.launch({ args: [root, fixture], env: { ...process.env, NOTERA_USER_DATA: userData, NOTERA_TEST: '1' } });
const win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
await win.setViewportSize({ width: 1100, height: 700 });
const ok = (label) => console.log('ok  ', label);
const shot = (name) => win.screenshot({ path: path.join(shots, name + '.png') });
const settingsNow = () => win.evaluate(() => window.notera.getSettings());
const items = () => win.$$eval('#qp-list .qp-item', (els) => els.map((e) => ({
  label: e.querySelector('.qp-label').textContent, keys: e.querySelector('.qp-keys')?.textContent || '', checked: e.querySelector('.qp-check').textContent === '✓', sel: e.classList.contains('sel')
})));
const openPalette = async () => {
  if (await win.isVisible('.cm-content')) await win.click('.cm-content');
  await win.keyboard.press('Control+Shift+P');
  await win.waitForSelector('#quick-pick:not([hidden])');
};
const runInPalette = async (query) => {
  await openPalette();
  await win.keyboard.type(query);
  await win.waitForTimeout(80);
  const first = (await items())[0];
  await win.keyboard.press('Enter');
  return first;
};

// ---------- view names ----------
const viewButtons = await win.$$eval('#toolbar [data-mode]', (els) => els.map((e) => e.textContent));
assert.deepEqual(viewButtons, ['Skriv', 'Delad', 'Läs']);
ok('lägena heter Skriv, Delad och Läs');

// ---------- the palette ----------
await openPalette();
const all = await items();
assert.ok(all.length > 80, `${all.length} items`);
assert.ok(all.some((i) => i.label === 'Visa: Kommandopalett' ? false : i.label.startsWith('Arkiv: ')), 'commands carry their category');
assert.ok(!all.some((i) => i.label.includes('Kommandopalett')), 'the palette does not list itself');
await win.keyboard.type('radbyte');
await win.waitForTimeout(80);
let list = await items();
assert.equal(list[0].label, 'Visa: Radbyte');
assert.equal(list[0].checked, true, 'word wrap is on and shows a tick');
await shot('70-palette-search');
await win.keyboard.press('Enter');
await win.waitForFunction(() => window.notera.getSettings().then((s) => s.wordWrap === false));
ok('Ctrl+Shift+P, "radbyte", Enter slår av radbyte');

const lasItem = await runInPalette('visa läs');
assert.equal(lasItem.label, 'Visa: Läs');
assert.equal(lasItem.keys, 'Ctrl+Shift+3');
await win.waitForFunction(() => document.querySelector('#main').dataset.view === 'preview');
await runInPalette('visa delad');
await win.waitForFunction(() => document.querySelector('#main').dataset.view === 'split');
ok('kommandon visar sina kortkommandon och körs med Enter');

await openPalette();
await win.keyboard.type('läge');
await win.waitForTimeout(80);
list = await items();
assert.equal(list[0].label, 'Inställning: Läge…');
await win.keyboard.press('Enter');
await win.waitForSelector('#quick-pick:not([hidden])');
await win.keyboard.type('mörkt');
await win.keyboard.press('Enter');
await win.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
assert.equal((await settingsNow()).mode, 'dark');
ok('Inställning: Läge… öppnar en andra lista i samma ruta');

await openPalette();
await win.keyboard.type('xyzzyq');
await win.waitForTimeout(80);
assert.equal(await win.textContent('#qp-list .qp-empty'), 'Inget kommando matchar');
await win.keyboard.press('Escape');
await win.waitForSelector('#quick-pick', { state: 'hidden' });
ok('Esc stänger, inget matchar visar en rad');

// ---------- theme picker ----------
await runInPalette('bläddra bland teman');
await win.waitForSelector('#quick-pick:not([hidden])');
list = await items();
assert.deepEqual(list.map((i) => i.label), ['Standard', 'Those guys', 'The Other guys', 'Neon Chill', 'Neon', 'Neon OMG']);
assert.ok(list[0].sel && list[0].checked, 'starts on the current theme');
await win.keyboard.press('ArrowDown');
await win.waitForFunction(() => document.documentElement.dataset.themeId === 'those-guys');
assert.equal((await settingsNow()).theme, 'default', 'previewing does not save');
for (let i = 0; i < 4; i++) await win.keyboard.press('ArrowDown');
await win.waitForFunction(() => document.documentElement.dataset.themeId === 'neon-omg');
await win.evaluate(() => document.fonts.ready);
await win.waitForTimeout(300);
await shot('71-theme-picker-preview');
await win.keyboard.press('Escape');
await win.waitForFunction(() => document.documentElement.dataset.themeId === 'default' && !document.documentElement.classList.contains('fx-grid'));
ok('piltangenterna förhandsvisar, Esc lägger tillbaka Standard');

await win.evaluate(() => window.__notera.handleAction('pickTheme'));
await win.waitForSelector('#quick-pick:not([hidden])');
await win.keyboard.type('neon');
await win.waitForTimeout(80);
assert.equal((await items())[0].label, 'Neon');
await win.keyboard.press('Enter');
await win.waitForFunction(() => window.notera.getSettings().then((s) => s.theme === 'neon'));
ok('Enter behåller temat');

// ---------- new theme from current ----------
const tabsBefore = await win.evaluate(() => window.__notera.tabs.length);
await runInPalette('nytt tema');
await win.waitForSelector('#quick-pick:not([hidden])');
await win.keyboard.type('Mitt Neon');
await win.waitForTimeout(60);
assert.match(await win.textContent('#qp-list .qp-empty'), /Tryck Enter för att skapa "Mitt Neon"/);
await win.keyboard.press('Enter');
await win.waitForFunction((n) => window.__notera.tabs.length === n + 1, tabsBefore);
await win.waitForFunction(() => document.documentElement.dataset.themeId === 'mitt-neon');
const themeFile = path.join(userData, 'themes', 'mitt-neon', 'theme.json');
assert.ok(fs.existsSync(themeFile));
const created = fs.readFileSync(themeFile, 'utf8');
assert.match(created, /"extends": "neon"/);
assert.match(created, /\/\/ Bygger på "Neon"/);
assert.equal(await win.evaluate(() => window.__notera.active.name), 'theme.json');
ok('Nytt tema från nuvarande: mapp, theme.json som ärver Neon, temat valt och filen öppen');

// Edit the new theme in Notera itself and save: the window repaints.
await win.evaluate(() => {
  const v = window.__notera.view;
  const text = v.state.doc.toString();
  const at = text.indexOf('"editor.background": "#262335"');
  v.dispatch({ changes: { from: at, to: at + '"editor.background": "#262335"'.length, insert: '"editor.background": "#003344"' } });
});
await win.keyboard.press('Control+S');
await win.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(0, 51, 68)', null, { timeout: 5000 });
await shot('72-new-theme-edited');
ok('redigera theme.json i Notera, Ctrl+S, fönstret målas om');

// ---------- settings.json ----------
await runInPalette('öppna inställningar (json)');
await win.waitForFunction(() => window.__notera.active && window.__notera.active.name === 'settings.json');
const setText = await win.evaluate(() => window.__notera.view.state.doc.toString());
assert.match(setText, /"lineNumbers": false/);
await win.evaluate(() => {
  const v = window.__notera.view;
  const text = v.state.doc.toString();
  const at = text.indexOf('"lineNumbers": false');
  v.dispatch({ changes: { from: at, to: at + '"lineNumbers": false'.length, insert: '"lineNumbers": true' } });
});
await win.keyboard.press('Control+S');
await win.waitForFunction(() => window.notera.getSettings().then((s) => s.lineNumbers === true));
await win.waitForSelector('.cm-gutters .cm-lineNumbers');
ok('Öppna inställningar (JSON): ändra, spara, inställningen gäller direkt');

await win.evaluate(() => {
  const v = window.__notera.view;
  const text = v.state.doc.toString();
  const at = text.indexOf('"lineNumbers": true');
  v.dispatch({ changes: { from: at, to: at + '"lineNumbers": true'.length, insert: '"lineNumbers": false oops' } });
});
await win.keyboard.press('Control+S');
await win.waitForSelector('#theme-toast:not([hidden])');
const note = await win.textContent('#theme-toast-text');
assert.match(note, /settings\.json gick inte att läsa: rad \d+/);
assert.equal((await settingsNow()).lineNumbers, true, 'a broken file changes nothing');
assert.equal(await win.isVisible('#theme-toast-folder'), false);
await shot('73-settings-json-error');
ok(`trasig settings.json: "${note}"`);

await win.evaluate(() => { for (const t of window.__notera.tabs) { t.dirty = false; t.savedDoc = t === window.__notera.active ? window.__notera.view.state.doc : t.savedDoc; } });
await app.close();
console.log('palette OK');
