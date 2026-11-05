// Drag-reorder: tre filer öppnas, flikar dras, ordningen assertas. Att dra flikar
// mellan fönster testas i tabdrag.mjs.
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

await app.close();
console.log('tabs e2e ok');
