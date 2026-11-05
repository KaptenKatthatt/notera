// Tab right-click menu > Open in new window: the tab moves to a window of its own (saved file by
// path, untitled text through its draft), and the item is off when the tab is the window's only one.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-tw-'));
const files = ['Ett.md', 'Två.md'].map((n, i) => { const p = path.join(tmp, n); fs.writeFileSync(p, `# ${n}\n\nFil ${i + 1}\n`); return p; });

const app = await electron.launch({ args: [root, ...files], env: { ...process.env, NOTERA_USER_DATA: path.join(tmp, 'ud'), NOTERA_TEST: '1' } });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length === 2);
await win.evaluate(() => window.notera.setSettings({ language: 'en' }));
const order = (w) => w.evaluate(() => window.__notera.tabs.map((t) => t.name));
const menuFor = async (w, sel) => {
  await w.locator(sel).click({ button: 'right' });
  await w.waitForSelector('#sb-menu:not([hidden])');
};
const item = (w) => w.locator('#sb-menu > button', { hasText: 'Open in new window' });

// A saved file moves to a new window and leaves this one.
await menuFor(win, '.tab:has-text("Två")');
assert.equal(await item(win).isDisabled(), false, 'on with two tabs');
const w2p = app.waitForEvent('window');
await item(win).click();
const w2 = await w2p;
await w2.waitForFunction(() => window.__notera && window.__notera.tabs.length === 1);
assert.ok((await w2.evaluate(() => window.__notera.view.state.doc.toString())).includes('Fil 2'), 'new window has Två');
await win.waitForFunction(() => window.__notera.tabs.length === 1);
assert.deepEqual(await order(win), ['Ett.md'], 'Två left the first window');
console.log('ok   saved file moves to a new window');

// The only tab: the item is there but off.
await menuFor(win, '.tab');
assert.equal(await item(win).isDisabled(), true, 'off for the only tab');
await win.keyboard.press('Escape');
console.log('ok   off for the only tab');

// Untitled text goes along through its draft.
await win.evaluate(() => window.__notera.handleAction('new'));
await win.waitForFunction(() => window.__notera.tabs.length === 2);
await win.keyboard.type('osparad text');
await menuFor(win, '.tab.active');
const w3p = app.waitForEvent('window');
await item(win).click();
const w3 = await w3p;
await w3.waitForFunction(() => window.__notera && window.__notera.tabs.length === 1);
assert.ok((await w3.evaluate(() => window.__notera.view.state.doc.toString())).includes('osparad text'), 'untitled text followed');
await win.waitForFunction(() => window.__notera.tabs.length === 1);
assert.deepEqual(await order(win), ['Ett.md'], 'only Ett left');
console.log('ok   untitled text moves along');

assert.equal(await w3.evaluate(() => window.__notera.active.dirty), true, 'untitled text stays unsaved');
assert.deepEqual(errors, []);
// The unsaved tab would ask before closing.
await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
console.log('tabwindow e2e ok');
