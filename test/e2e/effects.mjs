// Theme effects and the Neon family: per-level heading colours, glow, the H1 gradient, the
// cursor, the phosphor letter and cursor trail, typing particles (in a theme of one's own), the
// synthwave background, scanlines, the Theme effects switch, reduced motion, and that printing
// stays plain.
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
// Neon OMG no longer has sparks, so a theme of one's own brings them back to test them.
fs.mkdirSync(path.join(userData, 'themes', 'gnistor'), { recursive: true });
fs.writeFileSync(path.join(userData, 'themes', 'gnistor', 'theme.json'), JSON.stringify({
  name: 'Gnistor', extends: 'neon-omg',
  notera: { effects: { phosphor: false, trail: false, particles: { amount: 10, colors: ['#ff7edb', '#36f9f6', '#fede5d'], size: 2.5 } } }
}));
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
/** Pixels drawn on the effects canvas (particles and the cursor trail). */
const litPixels = () => win.evaluate(() => {
  const cv = /** @type {HTMLCanvasElement | null} */ (document.querySelector('#fx-particles'));
  if (!cv) return 0;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
  return n;
});
const phosphorMarks = () => win.evaluate(() => [...document.querySelectorAll('.cm-content .fx-ph')].map((e) => ({
  text: e.textContent, anim: e.getAnimations().map((a) => /** @type {CSSAnimation} */ (a).animationName).join(),
  inToken: e.parentElement.classList.contains('cm-line') ? '' : e.parentElement.className
})));
/**
 * Starts counting the most pixels lit on the effects canvas in any frame over the next `ms`, and
 * returns a function that waits for the count. Started before a key press, so it never misses it.
 */
const peakLit = async (ms) => {
  await win.evaluate((ms) => {
    const cv = /** @type {HTMLCanvasElement | null} */ (document.querySelector('#fx-particles'));
    let peak = 0;
    const end = performance.now() + ms;
    window.__peakLit = new Promise((resolve) => {
      const tick = () => {
        if (cv) {
          const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
          let n = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
          peak = Math.max(peak, n);
        }
        if (performance.now() < end) requestAnimationFrame(tick); else resolve(peak);
      };
      requestAnimationFrame(tick);
    });
  }, ms);
  return () => win.evaluate(() => window.__peakLit);
};
/** Waits until earlier trails and particles have faded, jumps from the end to the top, and
 * returns the most pixels the trail lit. */
const jumpTrail = async () => {
  await win.keyboard.press('Control+End');
  await win.waitForTimeout(400);
  const peak = await peakLit(300);
  await win.keyboard.press('Control+Home');
  return peak();
};

// ---------- Neon OMG, dark: everything on ----------
await setTheme('neon-omg', 'dark');
let c = await cls();
for (const want of ['fx-e-glow-all', 'fx-r-glow-headings', 'fx-e-grad-1', 'fx-e-grad-2', 'fx-cursor-block', 'fx-cursor-glow', 'fx-cursor-smooth', 'fx-phosphor', 'fx-bg', 'fx-grid', 'fx-grid-move', 'fx-sun', 'fx-scanlines', 'fx-vignette']) {
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
let marks = await phosphorMarks();
assert.ok(marks.length >= 2 && marks.length <= 5, `the newest letters flash: ${JSON.stringify(marks)}`);
assert.ok(marks.every((m) => m.anim === 'fx-phosphor'), JSON.stringify(marks));
assert.equal(marks.map((m) => m.text).join('').slice(-1), '!');
await shot('60-neon-omg-dark');
await win.waitForFunction(() => !document.querySelector('.cm-content .fx-ph'), null, { timeout: 2000 });
ok('fosforbokstav: de senaste bokstäverna lyser upp och märkningen tas bort efteråt');

// The phosphor mark sits inside the heading's own span, so it flashes in the heading's colour.
await win.evaluate(() => { const v = window.__notera.view; const l = v.state.doc.line(10); v.dispatch({ selection: { anchor: l.to } }); });
await win.keyboard.type('!', { delay: 10 });
marks = await phosphorMarks();
assert.ok(marks.length === 1 && /cm-hd/.test(marks[0].inToken), `inside the H3 token: ${JSON.stringify(marks)}`);
await win.keyboard.press('Backspace');
ok('fosfor i en rubrik ärver rubrikens färg');

// A dead key or an IME composes; nothing may be wrapped around the text while it does.
await win.evaluate(() => { const v = window.__notera.view; const at = v.state.selection.main.head; v.dispatch({ changes: { from: at, insert: 'é' }, selection: { anchor: at + 1 }, userEvent: 'input.type.compose' }); });
assert.equal((await phosphorMarks()).length, 0, 'no phosphor mark while composing');
await win.keyboard.press('Backspace');
ok('ingen fosfor runt en pågående komposition (döda tangenter)');

const trailLit = await jumpTrail();
assert.ok(trailLit > 200, `the cursor trail is drawn on a jump (${trailLit} lit pixels)`);
await shot('60b-neon-omg-dark-jump');
await win.keyboard.press('Control+End');
await win.keyboard.type('Ny rad', { delay: 30 });
await win.waitForTimeout(400);
const enterPeak = await peakLit(300);
await win.keyboard.press('Enter');
await win.waitForTimeout(30);
await shot('60c-neon-omg-dark-enter');
assert.ok(await enterPeak() > 20, 'a trail at a new line');
await win.waitForTimeout(400);
assert.equal(await litPixels(), 0, 'the trail fades out');
ok('Neon OMG mörkt: glöd, gradient, Monoton, blockmarkör, fosfor, markörsvans, sol och rutnät');

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
// No glow on a light page: a halo in the text's colour lowers its contrast (contrast.mjs).
assert.ok(!c.some((x) => /glow-(headings|all)/.test(x)) && c.includes('fx-sun') && c.includes('fx-phosphor'), c.join(' '));
assert.equal(await win.evaluate(() => document.documentElement.style.getPropertyValue('--fx-ph-color')), '#d6249f', 'a light page flashes pink, not white');
await typeAtEnd(' ljus');
assert.ok((await phosphorMarks()).length >= 2);
await shot('62-neon-omg-light');
await win.waitForTimeout(400);
const lightPeak = await peakLit(300);
await win.keyboard.press('Enter');
await win.waitForTimeout(30);
await shot('62b-neon-omg-light-enter');
assert.ok(await lightPeak() > 20, 'the trail shows on a light page');
await win.keyboard.press('Backspace');
ok('Neon OMG ljust: ingen glöd, rosa fosfor, markörsvans, dämpad bakgrund');

// ---------- particles, in a theme of one's own ----------
await setTheme('gnistor', 'dark');
c = await cls();
assert.ok(!c.includes('fx-phosphor'), c.join(' '));
await typeAtEnd('Gnistor');
await win.waitForTimeout(60);
const lit = await litPixels();
assert.ok(lit > 20, `particles drawn (${lit} lit pixels)`);
assert.equal((await phosphorMarks()).length, 0, 'no phosphor where the theme turned it off');
await shot('62c-particles');
await win.waitForTimeout(1500);
ok('partiklar finns kvar för teman som vill ha dem');

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
// A glowing heading is a neon tube: cyan halo, letters mixed 30 % toward white.
assert.match(await css('#preview h2', 'textShadow'), /rgb\(54, 249, 246\)/, 'H2 glows cyan in the preview');
assert.equal(await css('#preview h2', 'color'), 'color(srgb 0.448235 0.983529 0.975294)', 'H2 letters are the cyan core');
ok('Neon och Neon Chill slår på färre effekter');

// ---------- the switch ----------
await setTheme('neon-omg', 'dark');
await win.evaluate(() => window.notera.setSettings({ effects: false }));
await win.waitForFunction(() => ![...document.documentElement.classList].some((x) => x.startsWith('fx-')));
assert.equal(await css('.cm-line.cm-h3 .cm-hd:last-child', 'color'), 'rgb(254, 222, 93)', 'heading colours stay without effects');
assert.equal(await css('.cm-content', 'textShadow'), 'none');
await shot('67-neon-omg-effects-off');
await typeAtEnd('av');
assert.equal((await phosphorMarks()).length, 0, 'no phosphor with effects off');
assert.equal(await jumpTrail(), 0, 'no trail with effects off');
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
assert.ok(!c.includes('fx-grid-move') && !c.includes('fx-cursor-smooth') && !c.includes('fx-phosphor'), c.join(' '));
assert.ok(c.includes('fx-e-glow-all'), 'glow is not motion and stays');
await typeAtEnd('x');
assert.equal((await phosphorMarks()).length, 0, 'no phosphor with reduced motion');
assert.equal(await jumpTrail(), 0, 'no trail with reduced motion');
await win.evaluate(() => window.notera.setSettings({ theme: 'gnistor' }));
await win.waitForFunction(() => document.documentElement.dataset.themeId === 'gnistor');
await typeAtEnd('x');
await win.waitForTimeout(60);
assert.equal(await litPixels(), 0, 'no particles with reduced motion');
ok('minska animationer: ingen fosfor, svans eller partiklar, stilla rutnät, markören hoppar');
await win.evaluate(() => { const t = window.__notera.active; t.dirty = false; t.savedDoc = window.__notera.view.state.doc; });
await app.close();
console.log('effects OK');
