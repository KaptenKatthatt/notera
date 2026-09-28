// Named themes: "Those guys" (Claude Code) and "The Other guys" (Codex). Each one switches the
// window to dark, paints its own palette and survives a restart; going back to Light clears it.
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
const fixture = path.join(tmp, 'Veckoplan.md');
fs.writeFileSync(fixture, '# Veckoplan\n\nEn **fet** rad, en *kursiv* och lite `kod`. Se [länken](https://example.com).\n\n## Att göra\n\n- [ ] Handla\n- [x] Ringa vet\n\n> Citat från någon klok\n\n```js\nconsole.log(1)\n```\n');
const launch = () => electron.launch({ args: [root, fixture], env: { ...process.env, NOTERA_USER_DATA: userData, NOTERA_TEST: '1' } });
const ok = (label) => console.log('ok  ', label);

let app = await launch();
let win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
await win.setViewportSize({ width: 1100, height: 700 });
await win.evaluate(() => window.notera.setSettings({ language: 'sv', viewMode: 'split', checkUpdates: false }));
await win.waitForSelector('#preview h1');
const shot = (name) => win.screenshot({ path: path.join(shots, name + '.png') });
const css = (sel, prop) => win.evaluate(([s, p]) => getComputedStyle(document.querySelector(s))[p], [sel, prop]);
const menuThemes = () => app.evaluate(({ Menu }) => {
  const out = [];
  const walk = (items) => { for (const i of items) { if (i.type === 'radio' && i.label && /guys/.test(i.label)) out.push([i.label, i.checked]); if (i.submenu) walk(i.submenu.items); } };
  walk(Menu.getApplicationMenu().items);
  return out;
});

const cases = [
  { id: 'those-guys', label: 'Those guys', bg: 'rgb(38, 38, 36)', accent: '#d77757', h1: 'rgb(215, 119, 87)', caret: 'rgb(215, 119, 87)', shot: '40-those-guys' },
  { id: 'other-guys', label: 'The Other guys', bg: 'rgb(17, 17, 17)', accent: '#ececec', h1: 'rgb(236, 236, 236)', caret: 'rgb(255, 255, 255)', shot: '41-other-guys' }
];
for (const c of cases) {
  await win.evaluate((id) => window.notera.setSettings({ theme: id }), c.id);
  await win.waitForFunction((id) => document.documentElement.dataset.skin === id && document.documentElement.dataset.theme === 'dark', c.id);
  assert.equal(await css('body', 'backgroundColor'), c.bg);
  assert.equal(await win.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()), c.accent);
  assert.equal(await css('#preview h1', 'color'), c.h1);
  assert.ok((await menuThemes()).some(([l, checked]) => l === c.label && checked), `menu radio for ${c.label} is checked`);
  await win.click('.cm-content');
  await win.keyboard.press('Control+End');
  await win.keyboard.type('x');
  await win.waitForTimeout(150);
  assert.equal(await css('.cm-cursorLayer .cm-cursor', 'borderLeftColor'), c.caret);
  await shot(c.shot);
  await win.keyboard.press('Backspace');
  ok(`${c.label}: mörk bas, egen palett, bockad i menyn`);
}

await win.evaluate(() => window.__notera.handleAction('settings'));
await win.waitForSelector('#dlg-settings[open]');
const options = await win.locator('#dlg-settings select').first().locator('option').allTextContents();
assert.ok(options.includes('Those guys') && options.includes('The Other guys'), options.join('|'));
await win.waitForTimeout(150);
await shot('42-other-guys-settings');
await win.keyboard.press('Escape');
ok('båda temana går att välja i Inställningar');

await win.evaluate(() => { const t = window.__notera.active; t.dirty = false; t.savedDoc = window.__notera.view.state.doc; });
await app.close();
app = await launch();
win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
await win.waitForFunction(() => document.documentElement.dataset.skin === 'other-guys');
ok('temat finns kvar efter omstart');

await win.evaluate(() => window.notera.setSettings({ theme: 'light' }));
await win.waitForFunction(() => !document.documentElement.dataset.skin && document.documentElement.dataset.theme === 'light');
assert.equal(await css('body', 'backgroundColor'), 'rgb(255, 255, 255)');
ok('Ljust tar bort det namngivna temat');
await app.close();
console.log('themes OK');
