// Theme effects and the Neon family: per-level heading colours, glow, the H1 gradient, the
// cursor, typing particles, the synthwave background, scanlines, the Theme effects switch,
// reduced motion, and that printing stays plain.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'test/e2e/shots');
fs.mkdirSync(shots, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-fx-'));
const userData = path.join(tmp, 'ud');
const fixture = path.join(tmp, 'Neon.md');
fs.writeFileSync(fixture, [
  '# Veckoplan', '', 'En **fet** rad, en *kursiv* och lite `kod`. Se [länken](https://example.com).', '',
  '## Att göra', '', '- [ ] Handla', '- [x] Ringa vet', '', '### Tredje nivån', '', '> Citat från någon klok', '',
  '#### Fjärde', '', '##### Femte', '', '###### Sjätte', '', 'Sista raden.', ''
].join('\n'));
fs.mkdirSync(userData, { recursive: true });
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ language: 'sv', viewMode: 'split', checkUpdates: false, theme: 'neon-omg', mode: 'dark' }));
const launch = (extra = {}) => electron.launch({ args: [root, fixture], env: { ...process.env, NOTERA_USER_DATA: userData, NOTERA_TEST: '1' }, ...extra });
const ok = (label) => console.log('ok  ', label);

let app = await launch();
let win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
await win.setViewportSize({ width: 1200, height: 760 });
await win.waitForSelector('#preview h1');
const shot = (name) => win.screenshot({ path: path.join(shots, name + '.png') });
const css = (sel, prop) => win.evaluate(([s, p]) => { const el = document.querySelector(s); return el ? getComputedStyle(el)[p] : null; }, [sel, prop]);
const cls = () => win.evaluate(() => [...document.documentElement.classList].filter((c) => c.startsWith('fx-')).sort());
const setTheme = async (theme, mode) => {
  await win.evaluate(([t, m]) => window.notera.setSettings({ theme: t, mode: m }), [theme, mode]);
  await win.waitForFunction(([t, m]) => document.documentElement.dataset.themeId === t && document.documentElement.dataset.theme === m, [theme, mode]);
  await win.evaluate(() => document.fonts.ready);
  await win.waitForTimeout(250);
};
const typeAtEnd = async (text) => {
  await win.click('.cm-content');
  await win.keyboard.press('Control+End');
  await win.keyboard.type(text, { delay: 30 });
};

// ---------- Neon OMG, dark: everything on ----------
await setTheme('neon-omg', 'dark');
let c = await cls();
for (const want of ['fx-e-glow-all', 'fx-r-glow-headings', 'fx-e-grad-1', 'fx-e-grad-2', 'fx-cursor-block', 'fx-cursor-glow', 'fx-cursor-smooth', 'fx-bg', 'fx-grid', 'fx-grid-move', 'fx-sun', 'fx-scanlines', 'fx-vignette']) {
  assert.ok(c.includes(want), `${want} in ${c.join(' ')}`);
}
assert.equal(await css('.cm-line.cm-h2 .cm-hd:last-child', 'color'), 'rgba(0, 0, 0, 0)', 'H2 text is transparent under its gradient');
assert.match(await css('.cm-line.cm-h1 .cm-hd', 'backgroundImage'), /linear-gradient/);
assert.match(await css('.cm-line.cm-h1', 'fontFamily'), /^Monoton/);
assert.match(await css('.cm-line.cm-h3', 'fontFamily'), /^Orbitron/);
assert.equal(await css('.cm-line.cm-h3 .cm-hd:last-child', 'color'), 'rgb(254, 222, 93)', 'H3 is yellow');
assert.match(await css('.cm-content', 'textShadow'), /px/, 'every letter glows in the editor');
assert.equal(await css('#preview p', 'textShadow'), 'none', 'body text in Läs does not glow');
assert.match(await css('#preview h3', 'textShadow'), /px/, 'headings in Läs glow');
assert.match(await css('.cm-scroller', 'fontFamily'), /^"Victor Mono"/);
assert.ok(await win.evaluate(() => document.fonts.check('16px Orbitron') && document.fonts.check('16px Monoton') && document.fonts.check('16px "Victor Mono"')), 'theme fonts loaded over notera-theme://');
assert.equal(await css('.cm-editor', 'backgroundColor'), 'rgba(0, 0, 0, 0)', 'the editor is see-through to the background');
assert.equal(await css('#fx-bg .fx-sun', 'display'), 'block');
await typeAtEnd('Neon!');
await win.waitForTimeout(60);
const lit = await win.evaluate(() => {
  const cv = document.querySelector('#fx-particles');
  if (!cv) return 0;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
  return n;
});
assert.ok(lit > 20, `particles drawn (${lit} lit pixels)`);
await shot('60-neon-omg-dark');
await win.waitForTimeout(1500);
ok('Neon OMG mörkt: glöd, gradient, Monoton, blockmarkör, partiklar, sol och rutnät');

// Smooth cursor: CodeMirror moves the same element, so the transition glides.
assert.match(await css('.cm-cursorLayer .cm-cursor', 'transitionProperty'), /left/);
await win.evaluate(() => window.notera.setSettings({ viewMode: 'preview' }));
await win.waitForTimeout(200);
await shot('61-neon-omg-dark-read');
await win.evaluate(() => window.notera.setSettings({ viewMode: 'split' }));
ok('Neon OMG i Läs');

// ---------- light ----------
await setTheme('neon-omg', 'light');
c = await cls();
assert.ok(c.includes('fx-e-glow-headings') && !c.includes('fx-e-glow-all'), c.join(' '));
await typeAtEnd(' ljus');
await win.waitForTimeout(60);
await shot('62-neon-omg-light');
ok('Neon OMG ljust: glöd bara på rubriker, dämpad bakgrund');

for (const [theme, mode, name] of [['neon', 'dark', '63-neon-dark'], ['neon', 'light', '64-neon-light'], ['neon-chill', 'dark', '65-neon-chill-dark'], ['neon-chill', 'light', '66-neon-chill-light']]) {
  await setTheme(theme, mode);
  await win.click('.cm-content');
  await win.keyboard.press('Control+Home');
  await shot(name);
}
await setTheme('neon', 'dark');
c = await cls();
assert.deepEqual(c, ['fx-cursor-glow', 'fx-cursor-line', 'fx-cursor-smooth', 'fx-e-glow-headings', 'fx-e-grad-1', 'fx-r-glow-headings', 'fx-r-grad-1', 'fx-scanlines', 'fx-vignette'].sort());
await setTheme('neon-chill', 'dark');
c = await cls();
assert.deepEqual(c, ['fx-cursor-glow', 'fx-cursor-line', 'fx-e-glow-headings', 'fx-r-glow-headings'].sort());
assert.equal(await css('#preview h2', 'color'), 'rgb(54, 249, 246)', 'H2 is cyan in the preview');
ok('Neon och Neon Chill slår på färre effekter');

// ---------- the switch ----------
await setTheme('neon-omg', 'dark');
await win.evaluate(() => window.notera.setSettings({ effects: false }));
await win.waitForFunction(() => ![...document.documentElement.classList].some((x) => x.startsWith('fx-')));
assert.equal(await css('.cm-line.cm-h3 .cm-hd:last-child', 'color'), 'rgb(254, 222, 93)', 'heading colours stay without effects');
assert.equal(await css('.cm-content', 'textShadow'), 'none');
await shot('67-neon-omg-effects-off');
const menuEffects = await app.evaluate(({ Menu }) => {
  let hit = null;
  const walk = (items) => { for (const i of items) { if (i.type === 'checkbox' && i.label === 'Temaeffekter') hit = i.checked; if (i.submenu) walk(i.submenu.items); } };
  walk(Menu.getApplicationMenu().items);
  return hit;
});
assert.equal(menuEffects, false);
await win.evaluate(() => window.__notera.handleAction('effects'));
await win.waitForFunction(() => document.documentElement.classList.contains('fx-grid'));
ok('Temaeffekter av: bara färger och typsnitt, på igen via kommandot');

// ---------- printing stays plain ----------
await win.emulateMedia({ media: 'print' });
await win.evaluate(() => { const a = document.querySelector('#print-area'); a.className = 'preview'; a.innerHTML = '<h1>Rubrik</h1><h2>Två</h2><p>Text</p>'; });
assert.equal(await css('#print-area h1', 'textShadow'), 'none');
assert.equal(await css('#print-area h2', 'color'), 'rgb(0, 0, 0)', 'print headings are plain black, not neon');
assert.equal(await css('#fx-bg', 'display'), 'none');
await win.emulateMedia({ media: 'screen' });
ok('utskrift utan effekter och med vanliga färger');

await win.evaluate(() => { const t = window.__notera.active; t.dirty = false; t.savedDoc = window.__notera.view.state.doc; });
await app.close();

// ---------- reduced motion ----------
app = await launch();
win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
await win.emulateMedia({ reducedMotion: 'reduce' });
await win.evaluate(() => window.notera.setSettings({ mode: 'light' }));
await win.evaluate(() => window.notera.setSettings({ mode: 'dark' }));
await win.waitForFunction(() => document.documentElement.classList.contains('fx-grid'));
c = await cls();
assert.ok(!c.includes('fx-grid-move') && !c.includes('fx-cursor-smooth'), c.join(' '));
assert.ok(c.includes('fx-e-glow-all'), 'glow is not motion and stays');
await typeAtEnd('x');
await win.waitForTimeout(60);
const litReduced = await win.evaluate(() => {
  const cv = document.querySelector('#fx-particles');
  if (!cv) return 0;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
  return n;
});
assert.equal(litReduced, 0, 'no particles with reduced motion');
ok('minska animationer: inga partiklar, stilla rutnät, markören hoppar');
await win.evaluate(() => { const t = window.__notera.active; t.dirty = false; t.savedDoc = window.__notera.view.state.doc; });
await app.close();
console.log('effects OK');
