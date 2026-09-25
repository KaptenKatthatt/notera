// Omawrite-inspired features: writing mode, hidden markers, autosave, draft recovery, search counter, shortcuts.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'test/e2e/shots');
fs.mkdirSync(shots, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-w-'));
const userData = path.join(tmp, 'userdata');
const fixture = path.join(tmp, 'Essay.md');
fs.writeFileSync(fixture, [
  '# European Delusions & Danish Drones', '',
  'Europe is finally waking up from many decades of naive pacifism. While the continent is loath to give America credit, this is largely where it\'s due.', '',
  'That\'s the thing about **delusions**. Their upkeep seems *free* until reality intrudes, and [the Danish prime minister](https://example.org/dk) declared "buy, buy, buy".', '',
  '> A quote in the margin.', '',
  '- one', '- two', ''
].join('\n'));

const launch = (args) => electron.launch({ args: [root, ...args], env: { ...process.env, NOTERA_USER_DATA: userData } });
let app = await launch([fixture]);
let win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
const shot = (name) => win.screenshot({ path: path.join(shots, name + '.png') });

// Markers hidden off the cursor line: the rendered DOM text of line 5 has no ** or link syntax.
await win.click('.cm-content');
await win.keyboard.press('Control+Home');
const line5 = await win.evaluate(() => document.querySelectorAll('.cm-line')[4].textContent);
assert.ok(!line5.includes('**') && !line5.includes('](') && line5.includes('delusions'), 'markers hidden: ' + line5);
// Move the cursor onto that line: markers reveal.
await win.evaluate(() => { const v = window.__notera.view; const l = v.state.doc.line(5); v.dispatch({ selection: { anchor: l.from + 3 } }); });
const line5open = await win.evaluate(() => document.querySelectorAll('.cm-line')[4].textContent);
assert.ok(line5open.includes('**delusions**') && line5open.includes('](https://example.org/dk)'), 'markers revealed: ' + line5open);
await win.keyboard.press('Control+Home');
await shot('10-normal-hidden-markers');

// Writing mode
await win.evaluate(() => window.notera.setSettings({ writingMode: true }));
await win.waitForFunction(() => document.body.classList.contains('writing'));
await win.waitForTimeout(300);
const layout = await win.evaluate(() => {
  const c = document.querySelector('.cm-content').getBoundingClientRect();
  return { tabbar: getComputedStyle(document.querySelector('#tabbar')).display, toolbar: getComputedStyle(document.querySelector('#toolbar')).display,
    status: getComputedStyle(document.querySelector('#statusbar')).display, footer: getComputedStyle(document.querySelector('#footer')).display,
    left: c.left, right: window.innerWidth - c.right, width: c.width, fontSize: getComputedStyle(document.querySelector('.cm-editor')).fontSize,
    words: document.querySelector('#ft-words').textContent, status2: document.querySelector('#ft-status').textContent };
});
assert.equal(layout.tabbar, 'none'); assert.equal(layout.toolbar, 'none'); assert.equal(layout.status, 'none'); assert.equal(layout.footer, 'flex');
assert.ok(Math.abs(layout.left - layout.right) < 20, 'column centred (scrollbar allowance): ' + JSON.stringify(layout));
assert.ok(layout.width < 900 && layout.width > 500, 'column width ~66ch: ' + layout.width);
assert.equal(layout.fontSize, '19.95px', 'writing mode scales 15px by 1.33');
assert.ok(/^\d+ words$/.test(layout.words), layout.words);
assert.ok(layout.status2.startsWith('Essay.md'), layout.status2);
await shot('11-writing-light');
await win.evaluate(() => window.notera.setSettings({ theme: 'dark' }));
await win.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
await win.waitForTimeout(300);
await shot('12-writing-dark');
const bg = await win.evaluate(() => getComputedStyle(document.body).backgroundColor);
assert.equal(bg, 'rgb(16, 16, 16)', 'Omawrite dark background');

// Search card with counter
await win.keyboard.press('Control+F');
await win.waitForSelector('.cm-search');
await win.keyboard.type('the');
await win.waitForFunction(() => /^\d+\/\d+$/.test(document.querySelector('.cm-search-count')?.textContent || ''));
const cnt = await win.textContent('.cm-search-count');
assert.ok(/^1\/\d+$/.test(cnt), 'search count: ' + cnt);
await shot('13-writing-search');
await win.keyboard.press('Escape');

// Autosave: type, wait, file on disk updates without Ctrl+S
await win.keyboard.press('Control+End');
await win.keyboard.type('Autosaved line.');
await win.waitForFunction(() => window.__notera.active.dirty === false, null, { timeout: 5000 });
assert.ok(fs.readFileSync(fixture, 'utf8').includes('Autosaved line.'), 'autosave wrote to disk');

// Smart Enter continues lists (from lang-markdown)
await win.evaluate(() => { const v = window.__notera.view; const l = v.state.doc.line(10); v.dispatch({ selection: { anchor: l.to } }); });
await win.keyboard.press('Enter');
await win.keyboard.type('three');
await win.waitForFunction(() => window.__notera.view.state.doc.line(11).text === '- three');

// Draft recovery: untitled tab with text, kill the app, relaunch -> text is back.
await win.evaluate(() => window.__notera.handleAction('new'));
await win.waitForFunction(() => window.__notera.tabs.length === 2);
await win.click('.cm-content');
await win.keyboard.type('Ett utkast som inte sparats');
await win.waitForTimeout(1600);
const draftFiles = fs.readdirSync(path.join(userData, 'drafts'));
assert.equal(draftFiles.length, 1, 'one draft file written');
await win.evaluate(() => window.notera.setSettings({ writingMode: false, theme: 'system' }));
await app.process().kill('SIGKILL');
await new Promise((r) => setTimeout(r, 800));
app = await launch([]);
win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
const rec = await win.evaluate(() => ({ n: window.__notera.tabs.length, text: window.__notera.view.state.doc.toString(), dirty: window.__notera.active.dirty, status: document.querySelector('#ft-status').textContent }));
assert.equal(rec.n, 1); assert.equal(rec.text, 'Ett utkast som inte sparats'); assert.equal(rec.dirty, true);

// Shortcuts dialog
await win.evaluate(() => window.__notera.handleAction('shortcuts'));
await win.waitForSelector('#dlg-keys[open]');
assert.ok((await win.locator('.keys-grid tr').count()) > 20);
await shot('14-shortcuts');
await win.keyboard.press('Escape');

// Discarding the recovered tab removes its draft
await win.evaluate(() => { const t = window.__notera.active; t.dirty = false; t.savedDoc = t.state.doc; });
await win.evaluate(() => window.__notera.handleAction('closeTab'));
await win.waitForFunction(() => window.__notera.tabs.length === 1 && window.__notera.active.state.doc.length === 0);
await win.waitForTimeout(300);
assert.equal(fs.readdirSync(path.join(userData, 'drafts')).length, 0, 'draft deleted after discard');
// stang appen (och rensa dirty sa dialoger inte blockar) — annars hangde nsta svit i electron.launch
await win.evaluate(() => { for (const t of window.__notera.tabs) { t.dirty = false; t.savedDoc = t.state.doc; } });
await app.close();
console.log('writing OK');