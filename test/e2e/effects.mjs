// Theme effects and the Neon family: per-level heading colours, glow, the H1 gradient, the
// cursor, the synthwave background, scanlines, the Theme effects switch, reduced motion, and that
// printing stays plain. The cursor effects: the theme's suggestion, the user's own choice over it
// (Settings, the menu, the palette with its preview), and each of the ten effects mid-animation.
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
const phosphorMarks = () => win.evaluate(() => [...document.querySelectorAll('.cm-content .fx-ltr')].map((e) => ({
  text: e.textContent, anim: e.getAnimations({ subtree: true }).map((a) => /** @type {CSSAnimation} */ (a).animationName).join(),
  // Only the glowing copy in ::after animates, and only its opacity (compositor work, no repaint).
  own: e.getAnimations().length, props: [...new Set(e.getAnimations({ subtree: true }).flatMap((a) => Object.keys(/** @type {KeyframeEffect} */ (a.effect).getKeyframes()[0]).filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k))))].sort().join(),
  copy: getComputedStyle(e, '::after').content,
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
/** Waits until nothing is drawn on the effects canvas. */
const canvasClear = () => win.waitForFunction(() => {
  const cv = /** @type {HTMLCanvasElement | null} */ (document.querySelector('#fx-particles'));
  return !cv || !cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data.some((v, i) => i % 4 === 3 && v > 0);
}, null, { timeout: 6000, polling: 200 });
const setCursorEffect = async (id) => {
  await win.evaluate((v) => window.notera.setSettings({ cursorEffect: v }), id);
  await win.waitForFunction((v) => window.__notera.settings.cursorEffect === v, id);
  await win.waitForTimeout(100);
};

// ---------- Neon OMG, dark: everything on ----------
await setTheme('neon-omg', 'dark');
let c = await cls();
for (const want of ['fx-e-glow-all', 'fx-r-glow-headings', 'fx-e-grad-1', 'fx-e-grad-2', 'fx-cursor-block', 'fx-cursor-glow', 'fx-cursor-smooth', 'fx-type-phosphor', 'fx-bg', 'fx-grid', 'fx-grid-move', 'fx-sun', 'fx-scanlines', 'fx-vignette']) {
  assert.ok(c.includes(want), `${want} in ${c.join(' ')}`);
}
assert.equal(await css('.cm-line.cm-h2 .cm-hd:last-child', 'color'), 'rgba(0, 0, 0, 0)', 'H2 text is transparent under its gradient');
assert.match(await css('.cm-line.cm-h1 .cm-hd', 'backgroundImage'), /linear-gradient/);
assert.match(await css('.cm-line.cm-h1', 'fontFamily'), /^"Bungee Inline"/);
assert.equal(await css('.cm-line.cm-h1 .cm-hd', 'fontWeight'), '400', 'H1 at Bungee Inline\'s own weight, no fake bold');
assert.match(await css('.cm-line.cm-h3', 'fontFamily'), /^Orbitron/);
assert.equal(await css('.cm-line.cm-h3 .cm-hd:last-child', 'color'), 'rgb(254, 222, 93)', 'H3 is yellow');
assert.match(await css('.cm-content', 'textShadow'), /px/, 'every letter glows in the editor');
assert.equal(await css('#preview p', 'textShadow'), 'none', 'body text in Läs does not glow');
assert.match(await css('#preview h3', 'textShadow'), /px/, 'headings in Läs glow');
assert.match(await css('.cm-scroller', 'fontFamily'), /^"Victor Mono"/);
assert.ok(await win.evaluate(() => document.fonts.check('16px Orbitron') && document.fonts.check('16px "Bungee Inline"') && document.fonts.check('16px "Victor Mono"')), 'theme fonts loaded over notera-theme://');
assert.equal(await css('.cm-editor', 'backgroundColor'), 'rgba(0, 0, 0, 0)', 'the editor is see-through to the background');
assert.equal(await css('#fx-bg .fx-sun', 'display'), 'block');
await typeAtEnd('Neon!');
let marks = await phosphorMarks();
assert.ok(marks.length >= 2 && marks.length <= 5, `the newest letters flash: ${JSON.stringify(marks)}`);
assert.ok(marks.every((m) => m.anim === 'fx-fade' && m.own === 0 && m.props === 'opacity' && m.copy === `"${m.text}"`), JSON.stringify(marks));
assert.equal(marks.map((m) => m.text).join('').slice(-1), '!');
await shot('60-neon-omg-dark');
await win.waitForFunction(() => !document.querySelector('.cm-content .fx-ltr'), null, { timeout: 2000 });
ok('Neon OMG föreslår fosforbokstaven: de senaste bokstäverna lyser upp och märkningen tas bort efteråt');

// The grid moves by transform (compositor only), holds still while typing and goes on afterwards.
const gridAnim = () => win.evaluate(() => {
  const a = document.querySelector('#fx-bg .fx-grid').getAnimations({ subtree: true })[0];
  return a ? { name: /** @type {CSSAnimation} */ (a).animationName, state: a.playState, props: Object.keys(/** @type {KeyframeEffect} */ (a.effect).getKeyframes()[1]).filter((k) => k === 'transform' || k === 'backgroundPosition').join() } : null;
});
await win.waitForFunction(() => !document.documentElement.classList.contains('fx-typing'), null, { timeout: 3000 });
assert.deepEqual(await gridAnim(), { name: 'fx-grid-run', state: 'running', props: 'transform' });
await win.keyboard.type('x', { delay: 10 });
assert.ok((await cls()).includes('fx-typing'));
assert.equal((await gridAnim()).state, 'paused', 'the grid holds still while typing');
await win.waitForFunction(() => !document.documentElement.classList.contains('fx-typing'), null, { timeout: 3000 });
assert.equal((await gridAnim()).state, 'running', 'and moves again after a pause');
await win.keyboard.press('Backspace');
ok('rutnätet rör sig med transform och står still medan man skriver');

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

// The cursor trail is gone: moving the cursor draws nothing.
await win.keyboard.press('Control+End');
const jumpPeak = await peakLit(300);
await win.keyboard.press('Control+Home');
assert.equal(await jumpPeak(), 0, 'no trail on a jump');
ok('Neon OMG mörkt: glöd, gradient, Bungee Inline, blockmarkör, fosfor, sol och rutnät');

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
assert.ok(!c.some((x) => /glow-(headings|all)/.test(x)) && c.includes('fx-sun') && c.includes('fx-type-phosphor'), c.join(' '));
assert.equal(await win.evaluate(() => document.documentElement.style.getPropertyValue('--fx-ph-color')), '#d6249f', 'a light page flashes pink, not white');
await typeAtEnd(' ljus');
assert.ok((await phosphorMarks()).length >= 2);
await shot('62-neon-omg-light');
ok('Neon OMG ljust: ingen glöd, rosa fosfor, dämpad bakgrund');

// ---------- a theme from before cursor effects: particles are sparks ----------
await setTheme('gnistor', 'dark');
c = await cls();
assert.ok(!c.includes('fx-type-phosphor') && c.includes('fx-type-sparks'), c.join(' '));
await typeAtEnd('Gnistor');
await win.waitForTimeout(60);
const lit = await litPixels();
assert.ok(lit > 20, `particles drawn (${lit} lit pixels)`);
assert.equal((await phosphorMarks()).length, 0, 'no phosphor where the theme turned it off');
await shot('62c-particles');
assert.deepEqual(await win.evaluate(() => { const cv = document.querySelector('#fx-particles'); return [cv.width, cv.height]; }),
  await win.evaluate(() => [innerWidth, innerHeight]), 'the effects canvas is drawn at 1x');
await canvasClear();
ok('ett äldre tema med particles får fyrverkeriet');
// Moving the cursor draws the trail of phosphorTrail; a jump gives a clear streak.
await setCursorEffect('phosphorTrail');
await win.keyboard.press('Control+End');
await canvasClear();
const jump = await peakLit(300);
await win.keyboard.press('Control+Home');
assert.ok(await jump() > 200, 'a streak on a jump');
await setCursorEffect('theme');
ok('fosfor och svans: svansen följer markören vid hopp');

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
assert.equal((await phosphorMarks()).length, 0, 'no phosphor with effects off: it was only the theme\'s suggestion');
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

// ---------- the cursor effect is the user's ----------
await setTheme('neon-omg', 'dark');
await setCursorEffect('ripple');
c = await cls();
assert.ok(c.includes('fx-type-ripple') && !c.includes('fx-type-phosphor'), `the user's pick wins over the theme's: ${c.join(' ')}`);
await setTheme('neon-chill', 'dark');
assert.ok((await cls()).includes('fx-type-ripple'), 'and survives a theme switch, also to a theme that suggests none');
await win.evaluate(() => window.notera.setSettings({ effects: false }));
await win.waitForFunction(() => !document.documentElement.classList.contains('fx-e-glow-headings'));
assert.deepEqual(await cls(), ['fx-type-ripple'], 'Theme effects off keeps the effect the user picked');
await win.evaluate(() => window.notera.setSettings({ effects: true }));
await setCursorEffect('none');
assert.ok(!(await cls()).some((x) => x.startsWith('fx-type-')), 'none');
await setTheme('neon-omg', 'dark');
assert.ok(!(await cls()).some((x) => x.startsWith('fx-type-')), 'none stays none in a theme that suggests phosphor');
await setCursorEffect('theme');
assert.ok((await cls()).includes('fx-type-phosphor'), "back to the theme's choice");
ok('marköreffekten är användarens: vinner över temat, följer med vid temabyte, kvar med temaeffekter av');

// The menu, the settings and the palette offer the theme's choice, none and the ten effects.
const NAMES = ['Fyrverkeri', 'Älvstoft', 'Ringar', 'Pulserande markör', 'Fosforbokstav', 'Fosfor och svans', 'Röd laser', 'Lasersikte', 'Neonrör', 'Glitch', 'Skärpa'];
const menuFx = await app.evaluate(({ Menu }) => {
  let hit = null;
  const walk = (items) => { for (const i of items) { if (i.label === 'Marköreffekt' && i.submenu) hit = i.submenu.items.filter((x) => x.type === 'radio').map((x) => [x.label, x.checked]); else if (i.submenu) walk(i.submenu.items); } };
  walk(Menu.getApplicationMenu().items);
  return hit;
});
assert.deepEqual(menuFx.map((x) => x[0]), ['Temats val', 'Ingen', ...NAMES]);
assert.deepEqual(menuFx.filter((x) => x[1]).map((x) => x[0]), ['Temats val']);
await win.evaluate(() => window.__notera.handleAction('settings'));
await win.waitForSelector('#dlg-settings[open]');
const opts = await win.evaluate(() => [...document.querySelectorAll('#set-general select')].map((sel) => [...sel.options].map((o) => o.textContent)).find((o) => o.includes('Ingen')));
assert.deepEqual(opts, ['Temats val (Fosforbokstav)', 'Ingen', ...NAMES]);
await win.keyboard.press('Escape');
await win.waitForSelector('#dlg-settings:not([open])', { state: 'attached' });
// Closing the dialog gives the editor focus back; open the picker after that, not before.
await win.waitForFunction(() => window.__notera.view.hasFocus);
const openPicker = async () => {
  await win.evaluate(() => window.__notera.handleAction('pickCursorEffect'));
  await win.waitForSelector('#quick-pick:not([hidden]) .qp-item');
  await win.waitForFunction(() => document.activeElement && document.activeElement.closest('#quick-pick'));
};
await openPicker();
assert.deepEqual(await win.locator('#quick-pick .qp-label').allTextContents(), ['Temats val (Fosforbokstav)', 'Ingen', ...NAMES]);
await win.keyboard.press('ArrowDown');
await win.keyboard.press('ArrowDown');
await win.waitForFunction(() => document.documentElement.classList.contains('fx-type-sparks'));
const demoLit = await peakLit(400);
assert.ok(await demoLit() > 20, 'the highlighted effect plays at the cursor without typing');
await win.keyboard.press('Escape');
await win.waitForFunction(() => document.documentElement.classList.contains('fx-type-phosphor'));
assert.equal(await win.evaluate(() => window.__notera.settings.cursorEffect), 'theme', 'Esc puts the old one back');
await openPicker();
await win.keyboard.type('glitch');
await win.keyboard.press('Enter');
await win.waitForFunction(() => window.__notera.settings.cursorEffect === 'glitch');
ok('meny, inställningar och palett (med förhandsvisning) erbjuder temats val, ingen och de elva');

// Every effect, mid-animation, on a dark and a light theme. Letter effects animate only
// opacity, transform and filter on copies of the letter (or the letter's own opacity: neon).
const LETTER = { phosphor: 'fx-fade', phosphorTrail: 'fx-fade', laser: 'fx-burn-hot,fx-burn-warm', neon: 'fx-flicker,fx-flicker-glow', glitch: 'fx-glitch-a,fx-glitch-b', focus: 'fx-focus' };
const CANVAS = ['sparks', 'pixie', 'ripple', 'pulse', 'phosphorTrail', 'laser', 'sight'];
const caretClip = () => win.evaluate(() => {
  const v = window.__notera.view; const r = v.coordsAtPos(v.state.selection.main.head);
  return { x: Math.max(0, Math.round(r.left) - 260), y: Math.max(0, Math.round(r.top) - 70), width: 420, height: 140 };
});
for (const [theme, mode] of [['neon-omg', 'dark'], ['default', 'light']]) {
  await setTheme(theme, mode);
  for (const id of ['sparks', 'pixie', 'ripple', 'pulse', 'phosphor', 'phosphorTrail', 'laser', 'sight', 'neon', 'glitch', 'focus']) {
    await setCursorEffect(id);
    await canvasClear();
    await typeAtEnd('\nGlöd');
    const peak = await peakLit(250);
    await win.keyboard.type('x', { delay: 0 });
    await win.waitForTimeout(id === 'glitch' || id === 'focus' ? 40 : 80);
    await win.screenshot({ path: path.join(shots, `68-fx-${id}-${theme}-${mode}.png`), clip: await caretClip() });
    if (LETTER[id]) {
      const m = await phosphorMarks();
      assert.ok(m.length >= 1, `${id}: the letter carries its mark`);
      const last = m[m.length - 1];
      assert.equal(last.anim.split(',').sort().join(','), LETTER[id].split(',').sort().join(','), `${id} animations`);
      assert.ok(last.props.split(',').every((p) => ['opacity', 'transform', 'filter'].includes(p)), `${id} animates only compositor properties: ${last.props}`);
    } else assert.equal((await phosphorMarks()).length, 0, `${id} marks no letters`);
    if (CANVAS.includes(id)) assert.ok(await peak() > 5, `${id} draws on the canvas (${theme} ${mode})`);
    else assert.equal(await peak(), 0, `${id} draws nothing on the canvas`);
  }
}
await setCursorEffect('theme');
await setTheme('neon-omg', 'dark');
ok('alla elva effekterna mitt i animationen, mörkt och ljust');

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
assert.ok(!c.includes('fx-grid-move') && !c.includes('fx-cursor-smooth') && !c.some((x) => x.startsWith('fx-type-')), c.join(' '));
assert.ok(c.includes('fx-e-glow-all'), 'glow is not motion and stays');
await typeAtEnd('x');
assert.equal((await phosphorMarks()).length, 0, 'no phosphor with reduced motion');
await win.evaluate(() => window.notera.setSettings({ theme: 'gnistor' }));
await win.waitForFunction(() => document.documentElement.dataset.themeId === 'gnistor');
await typeAtEnd('x');
await win.waitForTimeout(60);
assert.equal(await litPixels(), 0, 'no particles with reduced motion');
await win.evaluate(() => window.notera.setSettings({ cursorEffect: 'ripple' }));
await typeAtEnd('x');
await win.waitForTimeout(60);
assert.equal(await litPixels(), 0, 'not even a cursor effect the user picked');
ok('minska animationer: ingen marköreffekt, stilla rutnät, markören hoppar');
await win.evaluate(() => { const t = window.__notera.active; t.dirty = false; t.savedDoc = window.__notera.view.state.doc; });
await app.close();
console.log('effects OK');
