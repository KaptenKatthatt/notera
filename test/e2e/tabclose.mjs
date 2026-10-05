// Tab right-click menu: Close others / Close to the right / Close all, and the wheel scrolling the tab strip.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'test/e2e/shots');
fs.mkdirSync(shots, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-tc-'));
const names = ['A1.md', 'A2.md', 'A3.md', 'A4.md', 'A5.md'];
const files = names.map((n) => { const p = path.join(tmp, n); fs.writeFileSync(p, `# ${n}\n`); return p; });

const app = await electron.launch({ args: [root, ...files], env: { ...process.env, NOTERA_USER_DATA: path.join(tmp, 'ud'), NOTERA_TEST: '1' } });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length === 5);
await win.evaluate(() => window.notera.setSettings({ autosave: false, language: 'en' }));
await app.evaluate(({ dialog }) => {
  globalThis.__answer = 2;
  globalThis.__asked = [];
  dialog.showMessageBox = async (_w, opts) => { globalThis.__asked.push((opts || _w).message); return { response: globalThis.__answer, checkboxChecked: false }; };
});
const order = () => win.evaluate(() => window.__notera.tabs.map((t) => t.name));
const answer = (n) => app.evaluate((_e, n) => { globalThis.__answer = n; globalThis.__asked = []; }, n);
const asked = () => app.evaluate(() => globalThis.__asked.length);
const menuFor = async (label) => {
  await win.locator('.tab', { hasText: label }).click({ button: 'right' });
  await win.waitForSelector('#sb-menu:not([hidden])');
};
const disabled = () => win.$$eval('#sb-menu > button', (bs) => Object.fromEntries(bs.map((b) => [b.querySelector('.lab').textContent, b.disabled])));
const pick = (text) => win.click(`#sb-menu button:has-text("${text}")`);

// Unsaved text in A4 and A5.
for (const n of ['A4.md', 'A5.md']) {
  await win.locator('.tab', { hasText: n }).click();
  await win.click('.cm-content');
  await win.keyboard.press('Control+End');
  await win.keyboard.type('ändrad');
}
await win.waitForFunction(() => window.__notera.tabs.filter((t) => t.dirty).length === 2);

await menuFor('A2.md');
const d = await disabled();
assert.equal(d['Close others'], false); assert.equal(d['Close to the right'], false); assert.equal(d['Close all'], false);
await win.screenshot({ path: path.join(shots, '40-tab-menu.png') });

// Cancel on the first unsaved tab: nothing closes, and nothing more is asked.
await answer(2);
await pick('Close to the right');
await win.waitForTimeout(300);
assert.equal(await asked(), 1, 'cancel stops at the first question');
assert.deepEqual(await order(), names, 'cancel closes nothing');
console.log('ok   Avbryt stänger ingenting');

// Don't save: both unsaved tabs are asked about, then everything to the right of A2 closes.
await answer(1);
await menuFor('A2.md');
await pick('Close to the right');
await win.waitForFunction(() => window.__notera.tabs.length === 2);
assert.equal(await asked(), 2, 'asked about A4 and A5');
assert.deepEqual(await order(), ['A1.md', 'A2.md']);
assert.equal(await win.evaluate(() => window.__notera.active.name), 'A2.md', 'the right-clicked tab is active');
assert.equal(fs.readFileSync(files[3], 'utf8'), '# A4.md\n', 'not saved');
console.log('ok   Stäng till höger');

// Show file: the file manager opens on the file's folder with the file selected.
await app.evaluate(({ shell }) => {
  globalThis.__shown = [];
  shell.showItemInFolder = (p) => { globalThis.__shown.push(['item', p]); };
  shell.openPath = async (p) => { globalThis.__shown.push(['folder', p]); return ''; };
});
const shown = () => app.evaluate(() => globalThis.__shown);
await menuFor('A1.md');
await pick('Show file');
await win.waitForFunction(() => !document.querySelector('#sb-menu:not([hidden])'));
await app.evaluate(() => new Promise((r) => setTimeout(r, 100)));
assert.deepEqual(await shown(), [['item', files[0]]]);
// A file deleted behind Notera's back: its folder opens instead.
assert.equal(await win.evaluate((p) => window.notera.showInFolder(p), path.join(tmp, 'gone.md')), true);
assert.deepEqual((await shown())[1], ['folder', tmp]);
assert.equal(await win.evaluate(() => window.notera.showInFolder('relative.md')), false, 'relative paths are refused');
console.log('ok   Visa fil');

await menuFor('A1.md');
await pick('Close others');
await win.waitForFunction(() => window.__notera.tabs.length === 1);
assert.deepEqual(await order(), ['A1.md']);
console.log('ok   Stäng andra');

await menuFor('A1.md');
const one = await disabled();
assert.equal(one['Close others'], true, 'nothing else to close'); assert.equal(one['Close to the right'], true); assert.equal(one['Close all'], false);
await pick('Close all');
await win.waitForFunction(() => window.__notera.tabs.length === 1 && !window.__notera.tabs[0].path);
await win.locator('.tab').first().click({ button: 'right' });
await win.waitForSelector('#sb-menu:not([hidden])');
assert.equal(await win.locator('#sb-menu button:has-text("Show file")').count(), 0, 'an unsaved tab has no file to show');
await win.keyboard.press('Escape');
await win.waitForFunction(() => window.__notera.tabs.length === 1 && !window.__notera.tabs[0].path);
assert.equal(app.windows().length, 1, 'the window stays open');
assert.equal(await win.evaluate(() => window.__notera.view.state.doc.length), 0, 'one empty tab');
console.log('ok   Stäng alla lämnar en tom flik');

// Many tabs: the wheel scrolls the strip sideways, a thumb shows on hover, the bar keeps its height.
const barHeight = () => win.evaluate(() => document.querySelector('#tabbar').getBoundingClientRect().height);
const heightBefore = await barHeight();
await win.evaluate(() => { for (let i = 0; i < 30; i++) window.__notera.handleAction('new'); });
await win.waitForFunction(() => window.__notera.tabs.length > 25);
await win.evaluate(() => { document.querySelector('#tabs').scrollLeft = 0; });
await win.hover('#tabs .tab >> nth=2');
await win.mouse.wheel(0, 300);
await win.waitForTimeout(200);
const strip = await win.evaluate(() => { const h = document.querySelector('#tabs'); return { left: h.scrollLeft, over: h.scrollWidth > h.clientWidth }; });
assert.ok(strip.over && strip.left > 100, 'wheel scrolls the tab strip: ' + JSON.stringify(strip));
assert.equal(await barHeight(), heightBefore, 'an overflowing strip does not grow the tab bar');
const thumb = await win.evaluate(() => { const t = document.querySelector('#tabs-thumb'); return { on: t.classList.contains('on'), opacity: getComputedStyle(t).opacity, width: t.getBoundingClientRect().width }; });
assert.ok(thumb.on && thumb.width > 20, 'scroll thumb shown: ' + JSON.stringify(thumb));
await win.screenshot({ path: path.join(shots, '41-tab-strip-scrolled.png') });
console.log('ok   hjulet scrollar flikfältet');

assert.deepEqual(errors, []);
await app.close();
console.log('tabclose OK');
