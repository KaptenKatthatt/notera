// Drag-reorder + detach: tre filer öppnas, flikar dras, ordningen assertas;
// släpp utanför fönstret (syntetiska pointer events — Playwright-musen kan inte
// lämna fönstret) lossar fliken till ett eget fönster.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-tabs-'));
const names = ['Alfa.md', 'Beta.md', 'Gamma.md'];
const files = names.map((n, i) => {
  const p = path.join(tmp, n);
  fs.writeFileSync(p, `# ${n}\n\nFil ${i + 1}\n`);
  return p;
});

const app = await electron.launch({
  args: [root, ...files],
  env: { ...process.env, NOTERA_USER_DATA: path.join(tmp, 'userdata'), NOTERA_TEST: '1' }
});
const win = await app.firstWindow();
await win.waitForSelector('.cm-content');
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length === 3);
const order = () => win.evaluate(() => window.__notera.tabs.map((t) => t.name));
const tabEl = (label) => win.evaluate((label) => {
  const el = Array.from(document.querySelectorAll('.tab')).find((t) => t.textContent.includes(label));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
}, label);
const dragBy = async (label, dx) => {
  const b = await tabEl(label);
  assert.ok(b, 'tab ' + label + ' synlig');
  await win.mouse.move(b.x, b.y);
  await win.mouse.down();
  await win.mouse.move(b.x + dx, b.y, { steps: 12 });
  await win.mouse.up();
};

assert.deepEqual(await order(), names, 'initial ordning');
await dragBy('Beta', 150);
assert.deepEqual(await order(), ['Alfa.md', 'Gamma.md', 'Beta.md'], 'Beta flyttad hoger');
await dragBy('Beta', -150);
assert.deepEqual(await order(), names, 'Beta tillbaka i mitten');

await win.locator('.tab', { hasText: 'Gamma' }).locator('.close').click();
await win.waitForFunction(() => window.__notera.tabs.length === 2);
assert.deepEqual(await order(), ['Alfa.md', 'Beta.md'], 'Gamma stangd, close funkar');

// Ny osparad flik med text -> draften ska kunna folja med vid detach
await win.evaluate(() => window.__notera.handleAction('new'));
await win.waitForFunction(() => window.__notera.tabs.length === 3);
await win.keyboard.type('utkast-text');

// Detach 1: sparad Beta slapps utanfor fonstret -> eget fonster
const winsBefore = app.windows().length;
const win2Promise = app.waitForEvent('window');
await win.evaluate(() => {
  const el = Array.from(document.querySelectorAll('.tab')).find((t) => t.textContent.includes('Beta'));
  const r = el.getBoundingClientRect();
  const y = r.top + r.height / 2;
  const opts = (cx) => ({ bubbles: true, pointerId: 7, button: 0, clientX: cx, clientY: y });
  el.dispatchEvent(new PointerEvent('pointerdown', opts(r.left + r.width / 2)));
  el.dispatchEvent(new PointerEvent('pointermove', opts(r.left + r.width / 2 + 10)));
  el.dispatchEvent(new PointerEvent('pointermove', opts(-160)));
  el.dispatchEvent(new PointerEvent('pointerup', opts(-160)));
});
await win.waitForFunction(() => window.__notera.tabs.length === 2);
const win2 = await win2Promise;
assert.equal(app.windows().length, winsBefore + 1, 'nytt fonster efter detach');
await win2.waitForFunction(() => window.__notera && window.__notera.tabs.length === 1);
const betaText = await win2.evaluate(() => window.__notera.view.state.doc.toString());
assert.ok(betaText.includes('Fil 2'), 'nytt fonster har Beta: ' + JSON.stringify(betaText.slice(0, 40)));

// Detach 2: osparad flik -> texten foljer med via draft
const win3Promise = app.waitForEvent('window');
await win.evaluate(() => {
  const els = document.querySelectorAll('.tab');
  const el = els[els.length - 1]; // sista fliken = den namnlosa
  const r = el.getBoundingClientRect();
  const y = r.top + r.height / 2;
  const opts = (cx) => ({ bubbles: true, pointerId: 8, button: 0, clientX: cx, clientY: y });
  el.dispatchEvent(new PointerEvent('pointerdown', opts(r.left + r.width / 2)));
  el.dispatchEvent(new PointerEvent('pointermove', opts(r.left + r.width / 2 + 10)));
  el.dispatchEvent(new PointerEvent('pointermove', opts(-160)));
  el.dispatchEvent(new PointerEvent('pointerup', opts(-160)));
});
await win.waitForFunction(() => window.__notera.tabs.length === 1);
const win3 = await win3Promise;
assert.equal(app.windows().length, winsBefore + 2, 'tva nya fonster totalt');
await win3.waitForFunction(() => window.__notera && window.__notera.tabs.length === 1);
const draftText = await win3.evaluate(() => window.__notera.view.state.doc.toString());
assert.ok(draftText.includes('utkast-text'), 'osparad text foljde med: ' + JSON.stringify(draftText.slice(0, 40)));
assert.deepEqual(await order(), ['Alfa.md'], 'kallfonstret har bara Alfa kvar');

await app.close();
console.log('tabs e2e ok');
