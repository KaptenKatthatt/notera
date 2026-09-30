// Spell check: off by default, Swedish + English when on, and the editor's right-click menu.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-sp-'));
const file = path.join(tmp, 'Stavning.md');
fs.writeFileSync(file, 'Hej och välkommen\n');

const app = await electron.launch({ args: [root, file], env: { ...process.env, NOTERA_USER_DATA: path.join(tmp, 'ud'), NOTERA_TEST: '1' } });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length === 1);
await win.evaluate(() => window.notera.setSettings({ language: 'en' }));

const attr = () => win.evaluate(() => document.querySelector('.cm-content').getAttribute('spellcheck'));
const session = () => app.evaluate(({ session }) => ({ on: session.defaultSession.isSpellCheckerEnabled(), langs: session.defaultSession.getSpellCheckerLanguages() }));

assert.equal(await win.evaluate(() => window.__notera.settings.spellcheck), false, 'off by default');
assert.equal(await attr(), 'false', 'editor attribute off by default');
assert.equal((await session()).on, false, 'session spell checker off by default');
console.log('ok   av som standard');

// The right-click menu is a native menu: capture its template instead of drawing it.
await app.evaluate(({ Menu }) => {
  globalThis.__menus = [];
  const build = Menu.buildFromTemplate.bind(Menu);
  Menu.buildFromTemplate = (tpl) => {
    const m = build(tpl);
    if (tpl.some((i) => i.role === 'cut')) { globalThis.__menus.push(tpl.map((i) => i.type === 'separator' ? '-' : `${i.label}${i.checked ? ' [x]' : ''}`)); m.popup = () => {}; }
    return m;
  };
});
const lastMenu = () => app.evaluate(() => globalThis.__menus[globalThis.__menus.length - 1] || null);

await win.click('.cm-content', { button: 'right' });
await win.waitForTimeout(300);
assert.deepEqual(await lastMenu(), ['Cut', 'Copy', 'Paste', '-', 'Select all', '-', 'Spell check'], 'edit menu, spell check unticked');
console.log('ok   högerklicksmeny i editorn');

// Turn it on from the Edit menu's command: both the session and the editor follow.
await win.evaluate(() => window.__notera.handleAction('spellcheck'));
await win.waitForFunction(() => window.__notera.settings.spellcheck === true);
await win.waitForFunction(() => document.querySelector('.cm-content').getAttribute('spellcheck') === 'true');
const on = await session();
assert.equal(on.on, true, 'session spell checker on');
assert.ok(on.langs.some((l) => /^sv\b/.test(l)) && on.langs.some((l) => /^en\b/.test(l)), 'Swedish and English: ' + JSON.stringify(on.langs));
console.log('ok   på: svenska och engelska', JSON.stringify(on.langs));

await win.click('.cm-content', { button: 'right' });
await win.waitForTimeout(300);
const menuOn = await lastMenu();
assert.equal(menuOn[menuOn.length - 1], 'Spell check [x]', 'ticked when on: ' + JSON.stringify(menuOn));

// Off again: the session and the editor both follow.
await win.evaluate(() => window.notera.setSettings({ spellcheck: false }));
await win.waitForFunction(() => document.querySelector('.cm-content').getAttribute('spellcheck') === 'false');
assert.equal((await session()).on, false, 'session off again');
console.log('ok   av igen');

// The setting survives a restart.
await win.evaluate(() => window.notera.setSettings({ spellcheck: true }));
await app.close();
const app2 = await electron.launch({ args: [root, file], env: { ...process.env, NOTERA_USER_DATA: path.join(tmp, 'ud'), NOTERA_TEST: '1' } });
const win2 = await app2.firstWindow();
await win2.waitForFunction(() => window.__notera && window.__notera.tabs.length === 1);
assert.equal(await win2.evaluate(() => document.querySelector('.cm-content').getAttribute('spellcheck')), 'true', 'on after restart');
assert.equal(await app2.evaluate(({ session }) => session.defaultSession.isSpellCheckerEnabled()), true);
await app2.close();

assert.deepEqual(errors, []);
console.log('spellcheck OK');
