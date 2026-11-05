// Dragging tabs between windows, like Chrome: pulled out of the strip a tab becomes a window that
// follows the mouse; over another window's strip it shows there and moves in when let go; the only
// tab takes its window along; unsaved text and unsaved changes go with the tab. Synthetic pointer
// events (Playwright's mouse cannot leave the window), and main is told where the mouse is.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'test/e2e/shots');
fs.mkdirSync(shots, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-tabdrag-'));
const names = ['Alfa.md', 'Beta.md', 'Gamma.md'];
const files = names.map((n, i) => { const p = path.join(tmp, n); fs.writeFileSync(p, `# ${n}\n\nFil ${i + 1}\n`); return p; });

const app = await electron.launch({ args: [root, ...files], env: { ...process.env, NOTERA_USER_DATA: path.join(tmp, 'ud'), NOTERA_TEST: '1' } });
const A = await app.firstWindow();
const errors = [];
const watch = (w) => w.on('pageerror', (e) => errors.push(e.message));
watch(A);
await A.waitForFunction(() => window.__notera && window.__notera.tabs.length === 3);
await A.evaluate(() => window.notera.setSettings({ autosave: false, language: 'en' }));

const order = (w) => w.evaluate(() => window.__notera.tabs.map((t) => t.name || '(untitled)'));
const setCursor = (p) => app.evaluate((_e, p) => { globalThis.__noteraCursor = p; }, p);
const content = async (w) => (await app.browserWindow(w)).evaluate((bw) => bw.getContentBounds());
const away = { x: 6000, y: 6000 }; // over no window
/** Press on a tab and pull it down out of the strip; the mouse stays pressed. */
const pullOut = (w, label) => w.evaluate((label) => {
  const el = label === null ? document.querySelector('.tab.active') : Array.from(document.querySelectorAll('.tab')).find((t) => t.textContent.includes(label));
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const at = (cx, cy) => ({ bubbles: true, pointerId: 9, button: 0, clientX: cx, clientY: cy });
  el.dispatchEvent(new PointerEvent('pointerdown', at(x, y)));
  el.dispatchEvent(new PointerEvent('pointermove', at(x + 10, y)));
  el.dispatchEvent(new PointerEvent('pointermove', at(x + 10, y + 250)));
}, label);
const release = (w) => w.evaluate(() => document.querySelector('#tabbar').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9, button: 0 })));
/** A point on w's tab strip, right of its last tab (or at x). */
const overStrip = async (w, x) => {
  const c = await content(w);
  const r = await w.evaluate(() => {
    const b = document.querySelector('#tabbar').getBoundingClientRect();
    const tabs = document.querySelectorAll('.tab:not(.phantom)');
    return { y: (b.top + b.bottom) / 2, right: tabs[tabs.length - 1].getBoundingClientRect().right };
  });
  return { x: Math.round(c.x + (x ?? r.right + 40)), y: Math.round(c.y + r.y) };
};
const until = async (fn, what) => {
  for (let i = 0; i < 100; i++) { if (await fn()) return; await new Promise((r) => setTimeout(r, 50)); }
  throw new Error('timed out: ' + what);
};
const newWindow = async (n) => { await until(() => app.windows().length === n, n + ' windows'); return app.windows()[n - 1]; };

// 1. Beta pulled out of A becomes window B, which follows the mouse and stays where it is let go.
const a = await content(A);
await setCursor({ x: a.x + 400, y: a.y + 400 });
await pullOut(A, 'Beta');
const B = await newWindow(2); watch(B);
await B.waitForFunction(() => window.__notera && window.__notera.tabs.length === 1);
assert.deepEqual(await order(A), ['Alfa.md', 'Gamma.md'], 'Beta left A at once');
assert.deepEqual(await order(B), ['Beta.md'], 'B has Beta');
const b1 = await content(B);
await setCursor({ x: a.x + 500, y: a.y + 450 });
await until(async () => (await content(B)).x === b1.x + 100, 'B follows the mouse');
assert.equal((await content(B)).y, b1.y + 50, 'B follows the mouse down');
await release(A);
await new Promise((r) => setTimeout(r, 150));
assert.equal(app.windows().length, 2);
console.log('ok   a tab pulled out becomes a window that follows the mouse');

// 2. Gamma pulled out of A and over B's strip: B shows it, and it moves into B when let go.
await setCursor(away);
await pullOut(A, 'Gamma');
await newWindow(3);
await setCursor(await overStrip(B));
await B.waitForSelector('.tab.phantom');
assert.equal(await B.locator('.tab.phantom .name').textContent(), 'Gamma.md', 'B shows the tab coming in');
await B.screenshot({ path: path.join(shots, '50-tab-drop.png') });
await release(A);
await until(() => app.windows().length === 2, 'the dragged window is gone');
await B.waitForFunction(() => window.__notera.tabs.length === 2);
assert.deepEqual(await order(B), ['Beta.md', 'Gamma.md'], 'Gamma moved into B, at the end');
assert.equal(await B.evaluate(() => window.__notera.active.name), 'Gamma.md', 'and is in front');
assert.equal(await B.locator('.tab.phantom').count(), 0);
assert.deepEqual(await order(A), ['Alfa.md']);
console.log('ok   a tab dropped on another window\'s strip moves in');

// 3. A's only tab takes A along; dropped first in B's strip, A closes and Alfa is B's first tab.
const a3 = await content(A);
const p3 = { x: a3.x + 300, y: a3.y + 560 }; // over B, below its strip
await setCursor(p3);
await pullOut(A, 'Alfa');
await new Promise((r) => setTimeout(r, 100));
await setCursor({ x: p3.x + 60, y: p3.y + 40 });
await until(async () => (await content(A)).x === a3.x + 60, 'A follows the mouse');
assert.equal((await content(A)).y, a3.y + 40);
await setCursor(await overStrip(B, 20));
await B.waitForSelector('.tab.phantom');
await release(A);
await until(() => app.windows().length === 1, 'A closed');
await B.waitForFunction(() => window.__notera.tabs.length === 3);
assert.deepEqual(await order(B), ['Alfa.md', 'Beta.md', 'Gamma.md'], 'Alfa first in B');
console.log('ok   the only tab takes its window along, into another window');

// 4. Unsaved changes and untitled text go along; a tab dropped back on its own strip stays.
await B.locator('.tab', { hasText: 'Beta' }).click();
await B.click('.cm-content');
await B.keyboard.press('Control+End');
await B.keyboard.type(' ändrad');
await B.waitForFunction(() => window.__notera.active.dirty);
await setCursor(away);
await pullOut(B, 'Beta');
const D = await newWindow(2); watch(D);
await release(B);
await D.waitForFunction(() => window.__notera && window.__notera.tabs.length === 1);
const dtext = await D.evaluate(() => window.__notera.view.state.doc.toString()); assert.ok(dtext.includes("ändrad"), "unsaved change went along: " + JSON.stringify(dtext));
assert.equal(await D.evaluate(() => window.__notera.active.dirty), true, 'still unsaved');
assert.ok(!fs.readFileSync(files[1], 'utf8').includes('ändrad'), 'not written to disk');
console.log('ok   unsaved changes go along, still unsaved');

await B.evaluate(() => window.__notera.handleAction('new'));
await B.waitForFunction(() => window.__notera.tabs.length === 3);
await B.keyboard.type('utkast-text');
await setCursor(away);
await pullOut(B, null);
await newWindow(3);
assert.equal((await order(B)).length, 2, 'the untitled tab left B');
await setCursor(await overStrip(B));
await B.waitForSelector('.tab.phantom');
await release(B);
await until(() => app.windows().length === 2, 'the dragged window is gone');
await B.waitForFunction(() => window.__notera.tabs.length === 3);
assert.equal(await B.evaluate(() => window.__notera.view.state.doc.toString()), 'utkast-text', 'untitled text back in B');
assert.equal(await B.evaluate(() => window.__notera.active.dirty), true);
console.log('ok   a tab dropped back on its own strip stays, with its text');

// Reorder within the strip still works.
const tabAt = (w, label) => w.evaluate((label) => {
  const r = Array.from(document.querySelectorAll('.tab')).find((t) => t.textContent.includes(label)).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, label);
const p = await tabAt(B, 'Alfa');
await B.mouse.move(p.x, p.y); await B.mouse.down();
await B.mouse.move(p.x + 150, p.y, { steps: 12 }); await B.mouse.up();
assert.deepEqual((await order(B)).slice(0, 2), ['Gamma.md', 'Alfa.md'], 'Alfa moved right in the strip');
console.log('ok   reorder in the strip');

assert.deepEqual(errors, []);
// Unsaved tabs would ask before closing.
await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
console.log('tabdrag e2e ok');
