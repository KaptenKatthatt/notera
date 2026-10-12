// Ctrl+Shift+T reopens the last closed tab and Ctrl+Shift+N the last closed window, like Chrome.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-ro-'));
const files = ['Alfa.md', 'Beta.md', 'Gamma.md'].map((n) => { const p = path.join(tmp, n); fs.writeFileSync(p, `# ${n}\n\nrad två\n`); return p; });
const delta = path.join(tmp, 'Delta.md');
fs.writeFileSync(delta, '# Delta\n');

const app = await electron.launch({ args: [root, ...files], env: { ...process.env, NOTERA_USER_DATA: path.join(tmp, 'ud'), NOTERA_TEST: '1' } });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length === 3);
await win.evaluate(() => window.notera.setSettings({ autosave: false, language: 'en' }));
// Every unsaved-changes question answers Don't save.
await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
const ok = (label) => console.log('ok  ', label);
const order = (w = win) => w.evaluate(() => window.__notera.tabs.map((t) => t.name || (t.path ? '?' : `(${t.state.doc.toString().trim() || ''})`)));
const activeName = (w = win) => w.evaluate(() => window.__notera.active.name);
const press = async (keys, w = win) => { await w.keyboard.press(keys); await w.waitForTimeout(200); };
const activate = (name) => win.locator('.tab', { hasText: name }).click();

// A closed file comes back where it was, with its cursor.
await activate('Beta.md');
await win.evaluate(() => { const v = window.__notera.view; v.dispatch({ selection: { anchor: 5 } }); v.focus(); });
await press('Control+W');
assert.deepEqual(await order(), ['Alfa.md', 'Gamma.md']);
await press('Control+Shift+T');
assert.deepEqual(await order(), ['Alfa.md', 'Beta.md', 'Gamma.md'], 'Beta back in its place');
assert.equal(await activeName(), 'Beta.md');
assert.equal(await win.evaluate(() => window.__notera.view.state.selection.main.head), 5, 'cursor where it was');
ok('Ctrl+Shift+T öppnar den stängda filen på samma plats, med markören kvar');

// Newest first, one per press.
await activate('Alfa.md'); await press('Control+W');
await activate('Gamma.md'); await press('Control+W');
assert.deepEqual(await order(), ['Beta.md']);
await press('Control+Shift+T');
assert.deepEqual(await order(), ['Beta.md', 'Gamma.md']);
await press('Control+Shift+T');
assert.deepEqual(await order(), ['Alfa.md', 'Beta.md', 'Gamma.md']);
ok('flera stängda flikar kommer tillbaka i omvänd ordning');

// Untitled text closed with Don't save comes back, unsaved.
await press('Control+T');
await win.keyboard.type('osparad tanke');
await press('Control+W');
assert.equal((await order()).length, 3);
await press('Control+Shift+T');
const back = await win.evaluate(() => { const t = window.__notera.active; return { path: t.path, dirty: t.dirty, text: window.__notera.view.state.doc.toString() }; });
assert.deepEqual(back, { path: null, dirty: true, text: 'osparad tanke' });
ok('namnlös text som stängdes utan att sparas kommer tillbaka, osparad');

// An empty tab is not remembered, and an empty list does nothing.
await press('Control+W'); // the untitled text again: Don't save
await press('Control+Shift+T'); // back
await press('Control+W');
await press('Control+T');
await press('Control+W');
await press('Control+Shift+T');
assert.equal(await win.evaluate(() => window.__notera.active.state.doc.toString() || window.__notera.view.state.doc.toString()), 'osparad tanke', 'the empty tab was skipped');
await press('Control+W');
for (let i = 0; i < 8; i++) await press('Control+Shift+T');
const n = (await order()).length;
await press('Control+Shift+T');
assert.equal((await order()).length, n, 'nothing left to reopen');
ok('en tom flik sparas inte, och en tom lista gör ingenting');

// A closed window comes back with its tabs, the active one in front.
const win2Promise = app.waitForEvent('window');
await press('Control+N');
const win2 = await win2Promise;
await win2.waitForFunction(() => window.__notera && window.__notera.tabs.length === 1);
await win2.evaluate((p) => window.__notera.openPaths([p]), delta);
await win2.waitForFunction(() => window.__notera.tabs.length === 1 && window.__notera.active.name === 'Delta.md');
await press('Control+T', win2);
await win2.keyboard.type('fönstrets utkast');
await win2.locator('.tab', { hasText: 'Delta.md' }).click();
const closed = new Promise((r) => win2.once('close', r));
await win2.evaluate(() => window.__notera.handleAction('closeWindow'));
await closed;
assert.equal(app.windows().length, 1);
const win3Promise = app.waitForEvent('window');
await win.bringToFront();
await press('Control+Shift+N');
const win3 = await win3Promise;
await win3.waitForFunction(() => window.__notera && window.__notera.tabs.length === 2);
assert.deepEqual(await order(win3), ['Delta.md', '(fönstrets utkast)']);
assert.equal(await activeName(win3), 'Delta.md', 'the tab that was in front is in front');
assert.equal(await win3.evaluate(() => window.__notera.tabs[1].dirty), true);
ok('Ctrl+Shift+N öppnar det stängda fönstret med dess flikar');

// The menu has both, with their keys; Ctrl+N alone is New window now.
const items = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items[0].submenu.items.map((i) => [i.label, i.accelerator || '']));
const find = (label) => items.find(([l]) => l === label);
assert.deepEqual(find('Reopen closed tab'), ['Reopen closed tab', 'Ctrl+Shift+T']);
assert.deepEqual(find('Reopen closed window'), ['Reopen closed window', 'Ctrl+Shift+N']);
assert.deepEqual(find('New window'), ['New window', 'Ctrl+N']);
ok('Arkiv-menyn visar båda med sina kortkommandon');

assert.deepEqual(errors, []);
for (const w of app.windows()) await w.evaluate(() => { for (const t of window.__notera.tabs) { t.dirty = false; t.savedDoc = t.state.doc; } const t = window.__notera.active; t.dirty = false; t.savedDoc = window.__notera.view.state.doc; });
await app.close();
console.log('reopen OK');
