// Settings > Keyboard shortcuts: rebind, remove, move a key between commands, persistence, menu labels.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'test/e2e/shots');
fs.mkdirSync(shots, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-s-'));
const userData = path.join(tmp, 'ud');
const launch = () => electron.launch({ args: [root], env: { ...process.env, NOTERA_USER_DATA: userData } });

let app = await launch();
let win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
await win.setViewportSize({ width: 1100, height: 760 });
await win.evaluate(() => window.notera.setSettings({ autosave: false, language: 'en' }));
await win.waitForFunction(() => document.documentElement.lang === 'en');
const shot = (name) => win.screenshot({ path: path.join(shots, name + '.png') });
const ok = (label) => console.log('ok  ', label);
const doc = () => win.evaluate(() => window.__notera.view.state.doc.toString());
const reset = (text, pos) => win.evaluate(([t, p]) => {
  const v = window.__notera.view;
  v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: t }, selection: { anchor: p } });
  v.focus();
}, [text, pos]);
const row = (id) => win.locator(`.kb-row[data-id="${id}"]`);
const chips = (id) => row(id).locator('kbd').allTextContents();
const menuAccel = (id) => app.evaluate(({ Menu }, id) => {
  const find = (items) => { for (const i of items) { if (i.click && i.id === id) return i; if (i.submenu) { const r = find(i.submenu.items); if (r) return r; } } return null; };
  const labels = [];
  const walk = (items) => { for (const i of items) { labels.push([i.label, i.accelerator]); if (i.submenu) walk(i.submenu.items); } };
  walk(Menu.getApplicationMenu().items);
  return labels.filter(([l]) => l === id).map(([, a]) => a)[0];
}, id);

// Ctrl+T opens a tab, Ctrl+N a window.
await win.click('.cm-content');
await win.keyboard.press('Control+T');
await win.waitForFunction(() => window.__notera.tabs.length === 2);
ok('Ctrl+T öppnar en ny flik');
await win.keyboard.press('Control+T');
await win.waitForFunction(() => window.__notera.tabs.length === 3);
const activeIndex = () => win.evaluate(() => window.__notera.tabs.indexOf(window.__notera.active));
await win.keyboard.press('Alt+1');
assert.equal(await activeIndex(), 0);
await win.keyboard.press('Alt+3');
assert.equal(await activeIndex(), 2);
await win.keyboard.press('Alt+2');
assert.equal(await activeIndex(), 1);
await win.keyboard.press('Alt+7');
assert.equal(await activeIndex(), 1, 'Alt+7 with three tabs does nothing');
ok('Alt+1, Alt+2, Alt+3 byter flik; Alt+7 utan sjunde flik gör ingenting');
await win.evaluate(() => window.__notera.handleAction('closeTab'));
await win.waitForFunction(() => window.__notera.tabs.length === 2);
const newWin = app.waitForEvent('window');
await win.keyboard.press('Control+N');
const second = await newWin;
await second.waitForFunction(() => window.__notera && window.__notera.tabs.length === 1);
assert.equal(app.windows().length, 2);
assert.equal(await win.evaluate(() => window.__notera.tabs.length), 2, 'Ctrl+N does not add a tab');
await second.close();
await win.evaluate(() => window.__notera.handleAction('closeTab'));
await win.waitForFunction(() => window.__notera.tabs.length === 1);
ok('Ctrl+N öppnar ett nytt fönster');

// Ctrl+W closes the tab by default; Settings can make it close the window instead.
await win.keyboard.press('Control+T');
await win.waitForFunction(() => window.__notera.tabs.length === 2);
await win.keyboard.press('Control+W');
await win.waitForFunction(() => window.__notera.tabs.length === 1);
ok('Ctrl+W stänger fliken som standard');
await win.keyboard.press('Control+Comma');
await win.waitForSelector('#dlg-settings[open] #set-ctrlw');
assert.equal(await win.inputValue('#set-ctrlw'), 'tab');
await win.selectOption('#set-ctrlw', 'window');
await win.waitForFunction(() => JSON.stringify(window.__notera.settings.keybindings.closeWindow) === '["Ctrl+W"]');
await win.screenshot({ path: path.join(shots, '24-settings-ctrlw.png') });
await win.click('.set-nav [data-pane="keyboard"]');
assert.deepEqual(await chips('closeWindow'), ['Ctrl+W']);
assert.deepEqual(await chips('closeTab'), ['Ctrl+F4']);
ok('valet flyttar Ctrl+W från Stäng flik till Stäng fönster');
await win.keyboard.press('Escape');
await win.waitForFunction(() => !document.querySelector('#dlg-settings').open);
const w2p = app.waitForEvent('window');
await win.keyboard.press('Control+N');
const w2 = await w2p;
await w2.waitForFunction(() => window.__notera && window.__notera.tabs.length === 1);
await w2.keyboard.press('Control+T');
await w2.waitForFunction(() => window.__notera.tabs.length === 2);
const closedP = w2.waitForEvent('close');
await w2.keyboard.press('Control+W');
await closedP;
assert.equal(app.windows().length, 1);
ok('Ctrl+W stänger hela fönstret med alla flikar');
await win.keyboard.press('Control+Comma');
await win.waitForSelector('#dlg-settings[open] #set-ctrlw');
await win.selectOption('#set-ctrlw', 'tab');
await win.waitForFunction(() => !window.__notera.settings.keybindings.closeWindow && !window.__notera.settings.keybindings.closeTab);
await win.keyboard.press('Escape');
ok('tillbaka till fliken: inga ändrade tangenter kvar');

// Ctrl+, opens Settings on the General pane.
await win.click('.cm-content');
await win.keyboard.press('Control+Comma');
await win.waitForSelector('#dlg-settings[open]');
assert.equal(await win.locator('.set-nav .active').textContent(), 'General');
ok('Ctrl+, öppnar Inställningar');
await shot('20-settings-general');

// Keyboard pane, search.
await win.click('.set-nav [data-pane="keyboard"]');
await win.waitForSelector('#kb-list .kb-row');
const allRows = await win.locator('.kb-row').count();
assert.ok(allRows >= 80, 'every command listed: ' + allRows);
ok(`${allRows} kommandon listas`);
await shot('21-settings-keyboard');
await win.fill('#kb-search', 'bold');
assert.equal(await win.locator('.kb-row').count(), 1);
await win.fill('#kb-search', 'ctrl+shift+k');
assert.deepEqual(await win.locator('.kb-row').evaluateAll((r) => r.map((x) => x.dataset.id)), ['deleteLine']);
ok('sökning på namn och på tangent');
await win.fill('#kb-search', '');

// Add Ctrl+Shift+J to Bold, then remove Ctrl+B.
await row('bold').hover();
await row('bold').locator('.kb-add').click();
await win.waitForSelector('.kb-row.recording');
await win.keyboard.press('Control+Shift+J');
await win.waitForFunction(() => document.querySelectorAll('.kb-row[data-id="bold"] kbd').length === 2);
await row('bold').locator('.kb-x').first().click();
await win.waitForFunction(() => document.querySelectorAll('.kb-row[data-id="bold"] kbd').length === 1);
assert.deepEqual(await chips('bold'), ['Ctrl+Shift+J']);
assert.equal(await row('bold').locator('.kb-tag').count(), 1, 'marked as changed');
ok('Fet: Ctrl+Shift+J tillagd, Ctrl+B borttagen');

// A key used elsewhere: Ctrl+I on Strikethrough asks, then moves it.
await row('strikethrough').hover();
await row('strikethrough').locator('.kb-add').click();
await win.keyboard.press('Control+I');
await win.waitForSelector('.kb-row.recording .primary');
assert.match(await row('strikethrough').locator('.kb-record').textContent(), /Ctrl\+I is used by “Italic”/);
await shot('22-settings-conflict');
await row('strikethrough').locator('.primary').click();
await win.waitForFunction(() => !document.querySelector('.kb-row.recording'));
assert.deepEqual(await chips('strikethrough'), ['Ctrl+Shift+X', 'Ctrl+I']);
assert.deepEqual(await chips('italic'), []);
ok('krock: Ctrl+I flyttas från Kursiv till Genomstruken');

// Plain letters are refused; Esc cancels recording without closing Settings.
await row('code').hover();
await row('code').locator('.kb-add').click();
await win.keyboard.press('Q');
await win.waitForSelector('.kb-error');
assert.match(await win.locator('.kb-error').textContent(), /Q cannot be used/);
await win.keyboard.press('Escape');
await win.waitForFunction(() => !document.querySelector('.kb-row.recording'));
assert.equal(await win.evaluate(() => document.querySelector('#dlg-settings').open), true);
ok('vanliga bokstäver nekas, Esc avbryter utan att stänga');

// Remove Alt+Up from Move line up: the key must stop working (CodeMirror's own binding is gone too).
await row('moveLineUp').locator('.kb-x').click();
// Move Copy to Ctrl+Shift+C only.
await row('copy').locator('.kb-x').first().click();
await row('copy').locator('.kb-x').first().click();
await row('copy').hover();
await row('copy').locator('.kb-add').click();
await win.keyboard.press('Control+Shift+C');
await win.waitForFunction(() => document.querySelectorAll('.kb-row[data-id="copy"] kbd').length === 1);
await win.keyboard.press('Escape');
await win.waitForFunction(() => !document.querySelector('#dlg-settings').open);
ok('Esc stänger Inställningar');

// The keys do what Settings says.
await reset('ord', 1);
await win.keyboard.press('Control+B');
assert.equal(await doc(), 'ord', 'Ctrl+B does nothing now');
await win.keyboard.press('Control+Shift+J');
assert.equal(await doc(), '**ord**');
ok('Ctrl+B gör ingenting, Ctrl+Shift+J gör fet');
await reset('ord', 1);
await win.keyboard.press('Control+I');
assert.equal(await doc(), '~~ord~~');
ok('Ctrl+I gör genomstruken');
await reset('ett\ntvå', 5);
await win.keyboard.press('Alt+ArrowUp');
assert.equal(await doc(), 'ett\ntvå', 'Alt+Up unbound');
await reset('ett\ntvå', 1);
await win.keyboard.press('Alt+ArrowDown');
assert.equal(await doc(), 'två\nett', 'Alt+Down still bound');
ok('borttagen Alt+Up gör ingenting, Alt+Down fungerar');
await app.evaluate(({ clipboard }) => clipboard.writeText('FÖRE'));
await win.evaluate(() => { const v = window.__notera.view; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: 'abc' }, selection: { anchor: 0, head: 3 } }); v.focus(); });
await win.keyboard.press('Control+C');
await win.waitForTimeout(200);
assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'FÖRE', 'Ctrl+C no longer copies');
await win.keyboard.press('Control+Shift+C');
await win.waitForTimeout(200);
assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'abc');
ok('Kopiera flyttad: Ctrl+C kopierar inte, Ctrl+Shift+C gör det');

// Native menu labels follow.
assert.equal(await menuAccel('Bold'), 'Ctrl+Shift+J');
assert.ok(!(await menuAccel('Italic')), 'Italic has no shortcut in the menu');
assert.equal(await menuAccel('Strikethrough'), 'Ctrl+Shift+X');
ok('menyn visar de nya tangenterna');

// Shortcut reference follows.
await win.keyboard.press('F1');
await win.waitForSelector('#dlg-keys[open]');
const ref = await win.locator('.keys-grid').textContent();
assert.ok(ref.includes('Ctrl+Shift+JBold') && !ref.includes('Ctrl+IItalic'), 'reference uses live bindings');
await win.keyboard.press('Escape');
ok('kortkommandolistan följer med');

// Persisted across a restart.
await win.evaluate(() => { const t = window.__notera.active; t.dirty = false; t.savedDoc = window.__notera.view.state.doc; });
await app.close();
const saved = JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8')).keybindings;
assert.deepEqual(saved.bold, ['Ctrl+Shift+J']);
app = await launch();
win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
await reset('ord', 1);
await win.keyboard.press('Control+Shift+J');
assert.equal(await doc(), '**ord**');
ok('ändringarna finns kvar efter omstart');

// Swedish UI, then reset all.
await win.evaluate(() => window.notera.setSettings({ language: 'sv' }));
await win.waitForFunction(() => document.documentElement.lang === 'sv');
await win.evaluate(() => window.__notera.handleAction('keyboardSettings'));
await win.waitForSelector('#dlg-settings[open] .kb-row');
assert.equal(await win.locator('.set-nav .active').textContent(), 'Kortkommandon');
await win.fill('#kb-search', 'fet');
await shot('23-settings-sv');
await win.fill('#kb-search', '');
await win.evaluate(() => window.notera.setSettings({ keybindings: {} })); // what "Återställ alla" does after its confirm box
await win.waitForFunction(() => document.querySelectorAll('.kb-tag').length === 0);
assert.deepEqual(await chips('bold'), ['Ctrl+B']);
ok('Återställ alla ger standardtangenterna');
await win.keyboard.press('Escape');
await reset('ord', 1);
await win.keyboard.press('Control+B');
assert.equal(await doc(), '**ord**');
await win.evaluate(() => { const t = window.__notera.active; t.dirty = false; t.savedDoc = window.__notera.view.state.doc; });
await app.close();
console.log('settings OK');
