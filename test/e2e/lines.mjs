// VS Code line editing, driven with real key presses.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-l-'));
const app = await electron.launch({ args: [root], env: { ...process.env, NOTERA_USER_DATA: path.join(tmp, 'ud') } });
const win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
await win.evaluate(() => window.notera.setSettings({ autosave: false }));

const doc = () => win.evaluate(() => window.__notera.view.state.doc.toString());
const sel = () => win.evaluate(() => window.__notera.view.state.selection.ranges.map((r) => [r.from, r.to]));
const reset = (text, line, col = 0) => win.evaluate(([t, l, c]) => {
  const v = window.__notera.view;
  v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: t } });
  const ln = v.state.doc.line(l);
  v.dispatch({ selection: { anchor: ln.from + c } });
  v.focus();
}, [text, line, col]);
const check = async (label, expected) => { const d = await doc(); assert.equal(d, expected, label); console.log('ok  ', label); };

await win.click('.cm-content');

await reset('ett\ntvå\ntre', 2, 1);
await win.keyboard.press('Alt+ArrowUp');
await check('Alt+Up flyttar raden uppåt', 'två\nett\ntre');
await win.keyboard.press('Alt+ArrowDown');
await win.keyboard.press('Alt+ArrowDown');
await check('Alt+Down flyttar raden nedåt två gånger', 'ett\ntre\ntvå');
assert.equal((await sel())[0][0], 'ett\ntre\n'.length + 1, 'markören följer med raden');

await reset('a\nb\nc\nd', 2);
await win.keyboard.press('Shift+ArrowDown');
await win.keyboard.press('Alt+ArrowDown');
await check('en markering som slutar i kolumn 0 tar inte med nästa rad (som VS Code)', 'a\nc\nb\nd');
await reset('a\nb\nc\nd', 2);
await win.keyboard.press('Shift+ArrowDown');
await win.keyboard.press('Shift+End');
await win.keyboard.press('Alt+ArrowDown');
await check('Alt+Down flyttar flera markerade rader', 'a\nd\nb\nc');

await reset('ett\ntvå', 1);
await win.keyboard.press('Shift+Alt+ArrowDown');
await check('Shift+Alt+Down kopierar raden nedåt', 'ett\nett\ntvå');
await win.keyboard.press('Shift+Alt+ArrowUp');
await check('Shift+Alt+Up kopierar raden uppåt', 'ett\nett\nett\ntvå');

await reset('ett\ntvå\ntre', 2, 1);
await win.keyboard.press('Control+L');
assert.deepEqual(await sel(), [[4, 8]], 'Ctrl+L markerar hela raden inklusive radbrytning');
console.log('ok   Ctrl+L markerar hela raden');
await win.keyboard.press('Control+L');
assert.deepEqual(await sel(), [[4, 11]], 'Ctrl+L igen utökar till nästa rad');
console.log('ok   Ctrl+L igen utökar markeringen');
await win.keyboard.press('Delete');
await check('Delete tar bort de markerade raderna', 'ett\n');

await reset('ett\ntvå\ntre', 2, 2);
await win.keyboard.press('Control+Shift+K');
await check('Ctrl+Shift+K raderar raden', 'ett\ntre');

await reset('ett\ntvå\ntre', 2, 1);
await win.keyboard.press('Control+X');
await check('Ctrl+X utan markering klipper ut hela raden', 'ett\ntre');
await win.keyboard.press('Control+V');
await check('Ctrl+V klistrar in raden ovanför', 'ett\ntvå\ntre');

await reset('ett\ntvå', 1, 1);
await win.keyboard.press('Control+C');
await win.keyboard.press('Control+V');
await check('Ctrl+C utan markering kopierar hela raden', 'ett\nett\ntvå');

await reset('  ett\ntvå', 1, 2);
await win.keyboard.press('Control+Enter');
await win.keyboard.type('under');
await check('Ctrl+Enter ger ny rad under med samma indrag', '  ett\n  under\ntvå');
await reset('  ett\ntvå', 1, 3);
await win.keyboard.press('Control+Shift+Enter');
await win.keyboard.type('över');
await check('Ctrl+Shift+Enter ger ny rad över med samma indrag', '  över\n  ett\ntvå');

await reset('katt hund katt fisk katt', 1, 1);
await win.keyboard.press('Control+D');
await win.keyboard.press('Control+D');
assert.equal((await sel()).length, 2, 'Ctrl+D två gånger ger två markeringar');
await win.keyboard.type('orm');
await check('Ctrl+D och skriv ersätter båda', 'orm hund orm fisk katt');
await reset('katt hund katt fisk katt', 1, 1);
await win.keyboard.press('Control+D');
await win.keyboard.press('Control+Shift+L');
await win.keyboard.type('x');
await check('Ctrl+Shift+L markerar alla förekomster', 'x hund x fisk x');

await reset('ett\ntvå\ntre', 1, 1);
await win.keyboard.press('Control+Alt+ArrowDown');
await win.keyboard.type('!');
await check('Ctrl+Alt+Down lägger till markör nedanför', 'e!tt\nt!vå\ntre');

await reset('ett', 1);
await win.keyboard.press('Control+]');
await check('Ctrl+] ökar indrag', '  ett');
await win.keyboard.press('Control+[');
await check('Ctrl+[ minskar indrag', 'ett');

// Undo steps back through a line move in one press.
await reset('ett\ntvå', 2);
await win.keyboard.press('Alt+ArrowUp');
await win.keyboard.press('Control+Z');
await check('Ctrl+Z ångrar radflytten', 'ett\ntvå');

// Formatting shortcuts still win over CodeMirror defaults (Ctrl+I is italic, not select-parent).
await reset('ord', 1, 1);
await win.keyboard.press('Control+I');
await check('Ctrl+I är fortfarande kursiv', '*ord*');

// Menu path: Edit > Line > Delete line through the IPC action.
await reset('ett\ntvå', 1);
await win.evaluate(() => window.__notera.handleAction('deleteLine'));
await check('Redigera > Rad > Radera rad via menyn', 'två');

// Also works in writing mode and in a plain-text tab.
await win.evaluate(() => window.notera.setSettings({ writingMode: true }));
await win.waitForFunction(() => document.body.classList.contains('writing'));
await reset('ett\ntvå', 2);
await win.keyboard.press('Alt+ArrowUp');
await check('Alt+Up i skrivläget', 'två\nett');
await win.evaluate(() => window.notera.setSettings({ writingMode: false }));
await win.click('#st-kind');
await win.waitForFunction(() => window.__notera.active.kind === 'txt');
await reset('ett\ntvå', 2);
await win.keyboard.press('Alt+ArrowUp');
await check('Alt+Up i en textfil', 'två\nett');

// Word wrap keeps a wrapped line's indentation (VS Code's wrappingIndent "same"): the second
// visual line starts under the first non-blank character, for spaces, a tab and a proportional font.
await win.keyboard.press('Control+T');
await win.waitForFunction(() => window.__notera.active.kind === 'md');
const long = 'Hitta varför exporten tappar kolumner när filen har fler än tjugo fält och semikolon som avgränsare. Fixade.';
await reset(`Inledning\n  - ${long}\n\t${long}\n${long}`, 1);
const wrapOffsets = () => win.evaluate(() => {
  const v = window.__notera.view;
  return [2, 3, 4].map((n) => {
    const line = v.state.doc.line(n);
    const ws = /^[ \t]*/.exec(line.text)[0].length;
    const first = v.coordsAtPos(line.from + ws);
    for (let p = line.from + ws + 1; p < line.to; p++) {
      const c = v.coordsAtPos(p, 1);
      if (c.top > first.top + 2) return { start: Math.round(first.left), wrapped: Math.round(c.left), left: Math.round(v.coordsAtPos(v.state.doc.line(1).from).left) };
    }
    return null;
  });
});
for (const font of [null, 'DejaVu Sans']) {
  if (font) await win.evaluate((f) => window.notera.setSettings({ fontFamily: f }), font);
  await win.waitForTimeout(300);
  if (font) assert.match(await win.evaluate(() => getComputedStyle(window.__notera.view.contentDOM).fontFamily), /DejaVu Sans/);
  const [sp, tab, flat] = await wrapOffsets();
  assert.ok(sp && tab && flat, 'all three lines wrap');
  assert.ok(Math.abs(sp.wrapped - sp.start) <= 1, `spaces: continuation under the "-" (${JSON.stringify(sp)}, ${font || 'default font'})`);
  assert.ok(Math.abs(tab.wrapped - tab.start) <= 1, `tab: continuation under the text (${JSON.stringify(tab)}, ${font || 'default font'})`);
  assert.ok(sp.start > sp.left + 5, 'the indented line itself still starts indented');
  // The first visual line stays where it was: the "-" sits where two spaces after the left edge put it.
  const twoSpaces = await win.evaluate(() => { const v = window.__notera.view; const l = v.state.doc.line(2); return Math.round(v.coordsAtPos(l.from + 2).left - v.coordsAtPos(l.from).left); });
  assert.ok(Math.abs(sp.start - sp.left - twoSpaces) <= 1, `first line not shifted (${JSON.stringify(sp)}, two spaces ${twoSpaces})`);
  assert.equal(flat.wrapped, flat.left, 'an unindented line wraps to the left edge');
}
await win.screenshot({ path: path.join(root, 'test/e2e/shots/lines-wrap-indent.png') });
console.log('ok   radbrytning behåller radens indrag');

await win.evaluate(() => { for (const t of window.__notera.tabs) { t.dirty = false; t.savedDoc = t.state.doc; } const t = window.__notera.active; t.dirty = false; t.savedDoc = window.__notera.view.state.doc; });
await app.close();
console.log('lines OK');
