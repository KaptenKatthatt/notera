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
  const n = window.__notera; const a = n.active;
  return { title: document.title, tabs: n.tabs.map((t) => ({ name: t.name, dirty: t.dirty, kind: t.kind, eol: t.eol, encoding: t.encoding })),
    doc: n.view.state.doc.toString(), settings: n.settings, view: document.querySelector('#main').dataset.view,
    status: Array.from(document.querySelectorAll('#statusbar > *')).map((e) => e.textContent).filter(Boolean) };
});

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
assert.ok(s.status.includes('Windows (CRLF)'));
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
await win.click('#dlg-font button[value="cancel"]');

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
assert.equal(bg, 'rgb(31, 31, 31)', 'dark background');
await win.evaluate(() => window.__notera.handleAction('prevTab'));
await win.waitForFunction(() => window.__notera.active.name === 'Anteckningar.md');
await win.waitForTimeout(200);
await shot('07-dark-sv-split');

// Close the plain-text tab: discard via dialog is native, so drop dirtiness first.
await win.evaluate(() => { const t = window.__notera.tabs[1]; t.dirty = false; t.savedDoc = t.state.doc; });
await win.evaluate(() => window.__notera.handleAction('nextTab'));
await win.evaluate(() => window.__notera.handleAction('closeTab'));
await win.waitForFunction(() => window.__notera.tabs.length === 1);

// Window close with no dirty tabs exits cleanly
await win.evaluate(() => window.__notera.handleAction('new'));
await app.close();
console.log('smoke OK; screenshots in', shots);
