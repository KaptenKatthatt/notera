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

await reset('katt hund katt fisk katt', 1, 6);
await win.keyboard.press('Control+D');
assert.deepEqual(await sel(), [[5, 9]], 'Ctrl+D markerar ordet under markören');
console.log('ok   Ctrl+D markerar ordet under markören');
await win.keyboard.press('Control+D');
assert.deepEqual(await sel(), [[5, 9]], 'Ctrl+D igen ändrar inte markeringen');
console.log('ok   Ctrl+D igen lägger inte till nästa förekomst');
await win.keyboard.type('orm');
await check('Ctrl+D och skriv ersätter bara det ordet', 'katt orm katt fisk katt');
await reset('räksmörgås med ägg', 1, 3);
await win.keyboard.press('Control+D');
await win.keyboard.type('x');
await check('Ctrl+D markerar hela ord med å, ä, ö', 'x med ägg');
await reset('ett  två', 1, 4);
await win.keyboard.press('Control+D');
assert.deepEqual(await sel(), [[4, 4]], 'Ctrl+D mellan två mellanslag markerar ingenting');
console.log('ok   Ctrl+D i blanktecken gör ingenting');
await win.evaluate(() => window.__notera.handleAction('selectNextOccurrence'));
await reset('katt hund katt', 1, 1);
await win.evaluate(() => window.__notera.handleAction('selectNextOccurrence'));
await win.evaluate(() => window.__notera.handleAction('selectNextOccurrence'));
assert.equal((await sel()).length, 2, 'nästa förekomst finns kvar i menyn');
console.log('ok   Lägg till nästa förekomst fungerar via menyn');
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

await win.evaluate(() => { const t = window.__notera.active; t.dirty = false; t.savedDoc = window.__notera.view.state.doc; });
await app.close();
console.log('lines OK');
