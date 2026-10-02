// The Theme tab in Settings: the appearance settings moved there, the dialog docks to the right,
// and every property of the active theme can be changed from a form generated from the theme
// format. A built-in theme is copied to "<name> (egen)" on the first change; a theme of one's
// own is edited in place and keeps its comments; light, dark or both; reset to the inherited value.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'test/e2e/shots');
fs.mkdirSync(shots, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-tt-'));
const userData = path.join(tmp, 'ud');
const userThemes = path.join(userData, 'themes');
const fixture = path.join(tmp, 'Tema.md');
fs.writeFileSync(fixture, '# Veckoplan\n\n## Att göra\n\nEn rad med text och [en länk](https://example.com).\n\n### Tredje\n');
fs.mkdirSync(userData, { recursive: true });
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ language: 'sv', checkUpdates: false, theme: 'neon-omg', mode: 'dark', windowBounds: { width: 1200, height: 800 } }));
const app = await electron.launch({ args: [root, fixture], env: { ...process.env, NOTERA_USER_DATA: userData } });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
const ok = (label) => console.log('ok  ', label);
const shot = (name) => win.screenshot({ path: path.join(shots, name + '.png') });
const cssVar = (name) => win.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const rowSel = (p) => `#set-theme .tt-row[data-path="${p}"]`;
const themeIdOnScreen = () => win.evaluate(() => document.documentElement.dataset.themeId);
/** Drags a slider to a value: input events while dragging, change on release. */
const slide = async (p, value, release = true) => {
  await win.evaluate(([sel, v, rel]) => {
    const input = /** @type {HTMLInputElement} */ (document.querySelector(`${sel} input[type="range"]`));
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (rel) input.dispatchEvent(new Event('change', { bubbles: true }));
  }, [rowSel(p), value, release]);
};
const openThemeTab = async () => {
  if (!(await win.evaluate(() => document.querySelector('#dlg-settings').open))) await win.evaluate(() => window.__notera.handleAction('settings'));
  await win.waitForSelector('#dlg-settings[open]');
  await win.click('.set-nav [data-pane="theme"]');
  await win.waitForSelector('#set-theme .tt-sec');
};

// 1. The tab: between General and Keyboard shortcuts, docked to the right, with the appearance settings.
await win.evaluate(() => window.__notera.handleAction('settings'));
await win.waitForSelector('#dlg-settings[open]');
assert.deepEqual(await win.locator('.set-nav [data-pane]').allTextContents(), ['Allmänt', 'Tema', 'Kortkommandon']);
assert.equal(await win.locator('#set-general select').count(), 2, 'General keeps language and Ctrl+W only');
await openThemeTab();
const box = await win.evaluate(() => {
  const r = document.querySelector('#dlg-settings').getBoundingClientRect();
  const ed = document.querySelector('.cm-editor').getBoundingClientRect();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: innerWidth, h: innerHeight, editorRight: ed.right };
});
// A card inside the window with a gap all round, so it is plain where it ends.
assert.ok(box.left > box.w / 2 && box.right <= box.w - 6 && box.right >= box.w - 10 && box.top >= 6 && box.bottom <= box.h - 6 && box.bottom >= box.h - 10, `docked card: ${JSON.stringify(box)}`);
assert.ok(box.editorRight <= box.left, `the document sits beside the panel, not under it: ${JSON.stringify(box)}`);
assert.equal(await win.evaluate(() => document.querySelector('#dlg-settings').matches(':modal')), false, 'not modal on the Theme tab');
const appearance = await win.locator('#set-theme > .set-row > span:first-child').allTextContents();
assert.deepEqual(appearance, ['Tema', 'Läge', 'Marköreffekt', 'Teckensnitt i editorn']);
assert.match(await win.textContent('#set-theme .tt-hint'), /"Neon OMG \(egen\)"/);
assert.equal(await win.getAttribute('#set-theme .tt-seg [aria-checked="true"]', 'role'), 'radio');
assert.equal(await win.textContent('#set-theme .tt-seg [aria-checked="true"]'), 'Mörkt', 'the version on screen is picked');
// Generated from the format: every section, each effect parameter and the cursor effects.
assert.deepEqual(await win.locator('#set-theme .tt-sec > summary').allTextContents(), ['Marköreffekt', 'Glöd, gradient och markör', 'Bakgrund', 'Färger', 'Typsnitt och radavstånd', 'Läsvyn']);
for (const p of ['notera.effects.typing', 'notera.effects.phosphor.strength', 'notera.effects.glow.strength', 'notera.effects.gradient.levels', 'notera.effects.cursor.style',
  'notera.effects.background.grid.speed', 'notera.effects.background.sun.colors', 'notera.effects.background.vignette', 'notera.colors.heading1', 'colors.editor.background',
  'notera.fonts.editor', 'notera.lineHeight', 'read.fonts.body', 'read.effects.glow.strength']) {
  assert.equal(await win.locator(rowSel(p)).count(), 1, p);
}
assert.equal(await win.inputValue(`${rowSel('notera.effects.glow.strength')} input`), '0.45', 'values as the theme sets them');
assert.equal(await win.inputValue(`${rowSel('notera.effects.typing')} select`), 'phosphor');
await shot('70-theme-tab-dark');
ok('fliken Tema: mellan Allmänt och Kortkommandon, dockad till höger, genererad från formatet');

// The document can be typed in while the Theme tab is open; its shortcuts work; other tabs are modal.
await win.click('.cm-content');
await win.keyboard.press('Control+End');
await win.keyboard.type(' Prov');
assert.ok((await win.evaluate(() => window.__notera.view.state.doc.toString())).endsWith(' Prov'), 'typed into the document');
assert.equal(await win.evaluate(() => document.querySelector('#dlg-settings').open), true, 'the panel stays open');
await win.keyboard.press('Control+Z');
assert.ok(!(await win.evaluate(() => window.__notera.view.state.doc.toString())).endsWith(' Prov'), 'editor shortcuts work beside the panel');
await win.click('.set-nav [data-pane="general"]');
assert.equal(await win.evaluate(() => document.querySelector('#dlg-settings').matches(':modal')), true, 'General is modal');
assert.equal(await win.evaluate(() => document.body.classList.contains('set-docked')), false);
await openThemeTab();
assert.equal(await win.evaluate(() => document.querySelector('#dlg-settings').matches(':modal')), false);
await win.focus('#set-theme select');
await win.keyboard.press('Escape');
await win.waitForFunction(() => !document.querySelector('#dlg-settings').open && !document.body.classList.contains('set-docked'));
await openThemeTab();
ok('man kan skriva i dokumentet med Tema-fliken öppen; Esc i panelen stänger; övriga flikar är modala');

// 2. Dragging previews without writing; letting go copies the built-in theme and writes the copy.
const glowBefore = await cssVar('--fx-glow-e');
await slide('notera.effects.glow.strength', 0.9, false);
await win.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--fx-glow-e').trim() === '0.9');
assert.equal(fs.existsSync(path.join(userThemes, 'neon-omg-egen')), false, 'a preview writes nothing');
await slide('notera.effects.glow.strength', 0.9);
await win.waitForFunction(() => document.documentElement.dataset.themeId === 'neon-omg-egen');
const copy = path.join(userThemes, 'neon-omg-egen', 'theme.json');
const text = fs.readFileSync(copy, 'utf8');
assert.match(text, /"name": "Neon OMG \(egen\)"/);
assert.match(text, /"extends": "neon-omg"/);
assert.match(text, /\/\/ Din egen kopia av neon-omg/);
assert.match(text, /"dark": \{ "notera": \{ "effects": \{ "glow": \{ "strength": 0\.9 \} \} \} \}/, 'only the change, in the dark version');
assert.equal(await win.evaluate(() => window.__notera.settings.theme), 'neon-omg-egen');
assert.equal(await cssVar('--fx-glow-e'), '0.9');
assert.notEqual(glowBefore, '0.9');
assert.ok(fs.existsSync(path.join(root, 'themes', 'neon-omg', 'theme.json')) && !/0\.9/.test(fs.readFileSync(path.join(root, 'themes', 'neon-omg', 'theme.json'), 'utf8')), 'the original is untouched');
await win.waitForSelector('#set-theme .tt-sec');
assert.match(await win.textContent('#set-theme .tt-head h3'), /Neon OMG \(egen\)/);
ok('dra visar direkt utan att skriva; släpp kopierar det inbyggda temat till "Neon OMG (egen)" som ärver');

// 3. In the copy: a colour, then reset to the inherited value; the other version is untouched.
await win.evaluate((sel) => {
  const input = /** @type {HTMLInputElement} */ (document.querySelector(`${sel} input[type="color"]`));
  input.value = '#00ff00';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}, rowSel('notera.colors.heading1'));
await win.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--md-h1').trim() === '#00ff00');
await win.waitForSelector(`${rowSel('notera.colors.heading1')} .tt-reset`);
await shot('71-theme-tab-edited');
await win.click(`${rowSel('notera.colors.heading1')} .tt-reset`);
await win.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--md-h1').trim() !== '#00ff00');
assert.ok(!/00ff00/.test(fs.readFileSync(copy, 'utf8')), 'reset removes the key');
assert.equal(fs.readdirSync(userThemes).filter((d) => d.startsWith('neon-omg')).length, 1, 'later changes go to the same copy');
ok('färg ändras och ↺ går tillbaka till det ärvda värdet');

// A real drag: input events over a few hundred ms, previews in between, then change on release.
// The slider must not be redrawn under the pointer, and the value it ends on is the one saved.
for (const v of [0.6, 0.65, 0.7, 0.75]) {
  await slide('notera.effects.background.grid.opacity', v, false);
  await win.waitForTimeout(90);
}
assert.equal(await win.inputValue(`${rowSel('notera.effects.background.grid.opacity')} input`), '0.75', 'the dragged slider stays where it is');
await slide('notera.effects.background.grid.opacity', 0.75);
await win.waitForTimeout(400);
assert.match(fs.readFileSync(copy, 'utf8'), /"opacity": 0\.75/, 'the value from the drag is saved');
ok('ett riktigt drag: reglaget står kvar och värdet sparas');

// 4. Both: written into the light and the dark version.
await win.click('#set-theme .tt-seg button:has-text("Båda")');
await win.selectOption(`${rowSel('notera.effects.cursor.style')} select`, 'underline');
await win.waitForFunction(() => document.documentElement.classList.contains('fx-cursor-underline'));
const parsed = fs.readFileSync(copy, 'utf8');
assert.match(parsed, /"light": \{ "notera": \{ "effects": \{ "cursor": \{ "style": "underline" \} \} \} \}/);
assert.match(parsed, /"style": "underline"[\s\S]*"style": "underline"/, 'in both versions');
await win.evaluate(() => window.notera.setSettings({ mode: 'light' }));
await win.waitForFunction(() => document.documentElement.dataset.theme === 'light' && document.documentElement.classList.contains('fx-cursor-underline'));
await openThemeTab();
await shot('72-theme-tab-light');
await win.evaluate(() => window.notera.setSettings({ mode: 'dark' }));
await win.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
ok('Båda skriver till den ljusa och den mörka versionen');

// 5. A theme of one's own is edited in place and keeps its comments.
const mine = path.join(userThemes, 'mitt');
fs.mkdirSync(mine, { recursive: true });
fs.writeFileSync(path.join(mine, 'theme.json'), '{\n  // Mitt tema, handskrivet.\n  "name": "Mitt",\n  "extends": "neon",\n  "notera": {\n    "effects": { "glow": true } // glöder\n  }\n}\n');
await win.evaluate(() => window.notera.setSettings({ theme: 'mitt' }));
await win.waitForFunction(() => document.documentElement.dataset.themeId === 'mitt');
await openThemeTab();
await win.waitForFunction(() => /Mitt/.test(document.querySelector('#set-theme .tt-head h3')?.textContent || ''));
await win.click('#set-theme .tt-seg button:has-text("Mörkt")');
assert.match(await win.textContent('#set-theme .tt-hint'), /syns direkt/, 'no copy for a theme of one\'s own');
await slide('notera.effects.background.vignette', 0.2);
await win.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--fx-vig').trim() === '0.2');
const mineText = fs.readFileSync(path.join(mine, 'theme.json'), 'utf8');
assert.match(mineText, /\/\/ Mitt tema, handskrivet\./);
assert.match(mineText, /\/\/ glöder/);
assert.match(mineText, /"vignette": 0\.2/);
assert.equal(await themeIdOnScreen(), 'mitt');
assert.equal(fs.readdirSync(userThemes).length, 2, 'no copy made');
ok('ett eget tema ändras på plats och behåller sina kommentarer');

// 6. The cursor effect: the user's setting at the top, the theme's suggestion below.
await win.selectOption(`${rowSel('notera.effects.typing')} select`, 'ripple');
await win.waitForFunction(() => document.documentElement.classList.contains('fx-type-ripple'));
assert.match(fs.readFileSync(path.join(mine, 'theme.json'), 'utf8'), /"typing": "ripple"/);
const userSel = win.locator('#set-theme > .set-row', { hasText: 'Marköreffekt' }).locator('select');
await userSel.selectOption('glitch');
await win.waitForFunction(() => document.documentElement.classList.contains('fx-type-glitch'));
assert.equal(await win.evaluate(() => window.__notera.settings.cursorEffect), 'glitch');
ok('marköreffekten: användarens val överst, temats förslag i temat');

await win.keyboard.press('Escape');
await win.waitForFunction(() => !document.querySelector('#dlg-settings').open);
assert.deepEqual(errors, []);
await win.evaluate(() => { for (const t of window.__notera.tabs) { t.dirty = false; t.savedDoc = t.state.doc; } });
await app.close();
console.log('themetab OK');
