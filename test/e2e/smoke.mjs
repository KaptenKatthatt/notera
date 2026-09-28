// Launches the real Electron app (under xvfb on Linux) and drives it through the main flows.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'test/e2e/shots');
fs.mkdirSync(shots, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-'));
const fixture = path.join(tmp, 'Anteckningar.md');
fs.writeFileSync(fixture, '# Veckoplan\r\n\r\nEn **fet** rad och en *kursiv*.\r\n\r\n- [ ] Handla\r\n- [x] Ringa vet\r\n\r\n> Citat\r\n\r\n```js\r\nconsole.log(1)\r\n```\r\n');

const app = await electron.launch({
  args: [root, fixture],
  env: { ...process.env, NOTERA_USER_DATA: path.join(tmp, 'userdata'), NOTERA_TEST: '1' }
});
const win = await app.firstWindow();
await win.waitForSelector('.cm-content');
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
const shot = (name) => win.screenshot({ path: path.join(shots, name + '.png') });
const state = () => win.evaluate(() => {
  const n = window.__notera;
  return { title: document.title, tabs: n.tabs.map((t) => ({ name: t.name, dirty: t.dirty, kind: t.kind, eol: t.eol, encoding: t.encoding })),
    doc: n.view.state.doc.toString(), settings: n.settings, view: document.querySelector('#main').dataset.view,
    status: Array.from(document.querySelectorAll('#statusbar > *')).map((e) => e.textContent).filter(Boolean) };
});

// The File menu no longer carries tab navigation, archiving or the notes folder; the keys still work.
const fileMenu = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items[0].submenu.items.map((i) => i.label).filter(Boolean));
for (const gone of ['Close tab', 'Close window', 'Next tab', 'Previous tab', 'Go to tab', 'Archive note']) {
  assert.ok(!fileMenu.some((l) => l.replace('&', '').startsWith(gone)), `${gone} is gone from File: ${fileMenu.join('|')}`);
}
assert.ok(!fileMenu.some((l) => /notes folder/i.test(l)), fileMenu.join('|'));
assert.ok(fileMenu.some((l) => l.startsWith('Print')), 'Print is still there');

let s = await state();
assert.equal(s.tabs[0].name, 'Anteckningar.md');
assert.equal(s.tabs[0].eol, 'CRLF');
assert.equal(s.tabs[0].kind, 'md');
assert.ok(s.title.startsWith('Anteckningar.md - Notera'), s.title);
assert.ok(!s.doc.includes('\r'), 'doc normalised to LF');
await shot('01-editor-light');

// Split view + preview rendering
await win.evaluate(() => window.notera.setSettings({ viewMode: 'split' }));
await win.waitForFunction(() => document.querySelector('#main').dataset.view === 'split');
await win.waitForSelector('#preview h1');
assert.equal(await win.textContent('#preview h1'), 'Veckoplan');
assert.equal(await win.locator('#preview input[type=checkbox]').count(), 2);
await shot('02-split-light');

// Formatting: bold via keyboard, toolbar heading, list
await win.click('.cm-content');
await win.keyboard.press('Control+End');
await win.keyboard.press('Enter');
await win.keyboard.type('ny rad');
await win.keyboard.press('Control+B');
s = await state();
assert.ok(s.doc.endsWith('ny **rad**'), 'bold wraps word under cursor: ' + JSON.stringify(s.doc.slice(-20)));
assert.equal(s.tabs[0].dirty, true);
assert.ok(s.title.startsWith('*Anteckningar.md'), s.title);
await win.click('[data-menu="heading"]');
await win.click('[data-action="heading2"]');
s = await state();
assert.ok(s.doc.endsWith('## ny **rad**'), s.doc.slice(-20));
await win.click('[data-action="bulletList"]');
s = await state();
assert.ok(s.doc.endsWith('- ny **rad**'), 'list replaces heading prefix: ' + s.doc.slice(-20));
await win.click('[data-action="bulletList"]');
s = await state();
assert.ok(s.doc.endsWith('\nny **rad**'), 'second click removes list: ' + s.doc.slice(-20));
await shot('03-after-format');

// Status bar content
s = await state();
assert.ok(s.status.some((x) => /^Ln \d+, Col \d+$/.test(x)), s.status.join('|'));
// The status bar no longer shows line endings; the file keeps its own (checked on save below).
assert.ok(!s.status.some((x) => /CRLF|\(LF\)/.test(x)), s.status.join('|'));
assert.equal(await win.locator('#st-eol').count(), 0);
// Narrow windows: every field stays on one line inside the bar; the least useful ones drop out.
const statusFit = () => win.evaluate(() => {
  const bar = document.querySelector('#statusbar').getBoundingClientRect();
  const shown = [...document.querySelectorAll('#statusbar > *')].filter((e) => !e.hidden && getComputedStyle(e).display !== 'none');
  return { bad: shown.filter((e) => { const r = e.getBoundingClientRect(); return r.height > bar.height || r.right > bar.right + 0.5 || r.top < bar.top; }).map((e) => e.id),
    shown: shown.map((e) => e.id).filter(Boolean) };
});
for (const w of [900, 600, 480]) {
  await app.evaluate(({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0].setSize(w, 600), w);
  await win.waitForFunction((w) => innerWidth <= w, w);
  await win.waitForTimeout(100);
  const fit = await statusFit();
  assert.deepEqual(fit.bad, [], `status bar at ${w}px: ${fit.bad.join(',')}`);
  assert.ok(fit.shown.includes('st-pos') && fit.shown.includes('st-kind'), fit.shown.join(','));
  if (w === 480) await shot('02b-statusbar-narrow');
}
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 700));
await win.waitForFunction(() => innerWidth > 900);
assert.ok(s.status.includes('UTF-8'));
assert.ok(s.status.some((x) => /\d+ words/.test(x)));

// Search panel
await win.keyboard.press('Control+F');
await win.waitForSelector('.cm-search');
await win.keyboard.type('fet');
await shot('04-search');
await win.keyboard.press('Escape');

// Save (path already set -> no dialog) and verify CRLF + content on disk
await win.evaluate(() => window.__notera.handleAction('save'));
await win.waitForFunction(() => window.__notera.active.dirty === false);
const saved = fs.readFileSync(fixture, 'utf8');
assert.ok(saved.includes('\r\nny **rad**'), 'saved with CRLF');
assert.ok(!/[^\r]\n/.test(saved), 'no bare LF in saved file');

// New tab, plain text, formatting toolbar hidden, no preview control
await win.evaluate(() => window.__notera.handleAction('new'));
await win.waitForFunction(() => window.__notera.tabs.length === 2);
await win.click('#st-kind');
await win.waitForFunction(() => document.body.classList.contains('no-formatting'));
const fmtHidden = await win.evaluate(() => getComputedStyle(document.querySelector('#format-group')).visibility);
assert.equal(fmtHidden, 'hidden');
assert.equal(await win.evaluate(() => document.querySelector('#view-mode').hidden), true);
await win.keyboard.type('Bara text');
await win.keyboard.press('Control+B');
s = await state();
assert.equal(s.doc, 'Bara text', 'Ctrl+B is a no-op in plain text');
await shot('05-plain-text-tab');

// Font dialog
await win.evaluate(() => { window.__notera.handleAction('font'); });
await win.waitForSelector('#dlg-font[open]');
await shot('06-font-dialog');
await win.click('#dlg-font [data-close="cancel"]');
await win.waitForFunction(() => !document.querySelector('#dlg-font').open);

// Zoom + Swedish + dark theme
await win.evaluate(() => window.notera.setSettings({ zoom: 150, language: 'sv', theme: 'dark' }));
await win.waitForFunction(() => window.__notera.settings.zoom === 150 && document.documentElement.lang === 'sv');
await win.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
await win.waitForTimeout(300);
s = await state();
assert.ok(s.status.some((x) => /^Rad \d+, kol \d+$/.test(x)), s.status.join('|'));
assert.ok(s.status.includes('150 %'));
const fontSize = await win.evaluate(() => getComputedStyle(document.querySelector('.cm-editor')).fontSize);
assert.equal(fontSize, '22.5px', 'zoom 150% of 15px');
const bg = await win.evaluate(() => getComputedStyle(document.body).backgroundColor);
assert.equal(bg, 'rgb(16, 16, 16)', 'dark background');
await win.evaluate(() => window.__notera.handleAction('prevTab'));
await win.waitForFunction(() => window.__notera.active.name === 'Anteckningar.md');
await win.waitForTimeout(200);
await shot('07-dark-sv-split');

// Close the plain-text tab: discard via dialog is native, so drop dirtiness first.
await win.evaluate(() => { const t = window.__notera.tabs[1]; t.dirty = false; t.savedDoc = t.state.doc; });
// Real keys, since the menu no longer carries these commands.
await win.click('.cm-content');
await win.keyboard.press('Control+Tab');
await win.waitForFunction(() => window.__notera.active === window.__notera.tabs[1]);
await win.keyboard.press('Control+W');
await win.waitForFunction(() => window.__notera.tabs.length === 1);

// Link dialog (Swedish UI now): Enter in a field inserts the link; Cancel used to be the form's default button
await win.evaluate(() => { const v = window.__notera.view; v.dispatch({ selection: { anchor: v.state.doc.length } }); window.__notera.handleAction('link'); });
await win.waitForSelector('#dlg-link[open]');
await win.fill('#link-text', 'Notera');
await win.fill('#link-url', 'https://example.com');
await win.press('#link-url', 'Enter');
await win.waitForFunction(() => !document.querySelector('#dlg-link').open);
s = await state();
assert.ok(s.doc.endsWith('[Notera](https://example.com)'), s.doc);

// Window close with no dirty tabs exits cleanly
await win.evaluate(() => window.__notera.handleAction('new'));
await app.close();
console.log('smoke OK; screenshots in', shots);
