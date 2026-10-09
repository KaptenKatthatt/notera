// Clicking the note or tab you are already in must never throw away what you wrote. Every way of
// "opening" the active tab again (its tab, its sidebar row, a search hit, Open file, Close others,
// the unsaved-changes question) once put the editor back to the text the tab had when it was last
// activated, and the next keystroke autosaved that over the file.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-nw-'));
const userData = path.join(tmp, 'userdata');
const notes = path.join(tmp, 'Notera');
fs.mkdirSync(userData, { recursive: true });
const put = (rel, text) => { const p = path.join(notes, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); return p; };
put('Osorterat/2026-09-25 Ringa veterinären.md', '# Ringa veterinären\nProjekt: Osorterat · Skapad: 2026-09-25 07:55\n\nHälta vänster fram.\n');
fs.writeFileSync(path.join(notes, '.notera.json'), JSON.stringify({ version: 1, inbox: 'Osorterat', archive: 'Arkiv', projects: [], archivedProjects: [] }));
const loose = path.join(tmp, 'lös fil.md');
fs.writeFileSync(loose, 'Första raden.\n');
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({
  notesRoot: notes, sidebarOpen: true, language: 'sv', mode: 'light', checkUpdates: false, windowBounds: { width: 1200, height: 760 }
}));

const app = await electron.launch({ args: [root], env: { ...process.env, NOTERA_USER_DATA: userData } });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0 && window.__notera.sidebar.tree);
await app.evaluate(({ dialog }) => {
  globalThis.__answer = 0;
  dialog.showMessageBox = async () => ({ response: globalThis.__answer, checkboxChecked: false });
});

const activeText = () => win.evaluate(() => window.__notera.view.state.doc.toString());
const activePath = () => win.evaluate(() => window.__notera.active.path);
const disk = (p) => fs.readFileSync(p, 'utf8');
const saved = () => win.waitForFunction(() => !window.__notera.active.dirty && !window.__notera.active.autosaveTimer);
const activeTab = () => win.locator('#tabs .tab.active');
const activeRow = () => win.locator('#sb-list .sb-note.active');

/** A new note from Ctrl+T, left untitled, with text written below its header. */
async function newUntitled(words) {
  const before = await activePath();
  await win.keyboard.press('Control+T');
  await win.waitForFunction((b) => window.__notera.active.path !== b && window.__notera.active.pristine
    && window.__notera.view.hasFocus && window.__notera.view.state.selection.main.head === 2, before);
  await win.keyboard.press('Control+End');
  await win.keyboard.type(words);
  return activePath();
}

/** The text survived: in the editor, after typing more, and on disk. */
async function kept(p, words, label) {
  assert.ok((await activeText()).includes(words), `${label}: the editor still holds the text`);
  await win.keyboard.type(' mer');
  await saved();
  assert.ok(disk(p).includes(words + ' mer'), `${label}: the file holds the text after typing on`);
  console.log(`ok   ${label}`);
}

// 1. The reported case: Ctrl+T, write without a heading, autosave runs, click "Namnlös anteckning".
let words = 'Mötesanteckningar som inte får försvinna';
let p = await newUntitled(words);
await saved();
assert.ok(disk(p).includes(words));
await activeRow().click();
await win.waitForTimeout(300);
await kept(p, words, 'klick på den aktiva anteckningen i sidofältet');

// 2. The same click before autosave has run: the pending save must write the new text, not the old.
words = 'Skrivet precis innan klicket';
p = await newUntitled(words);
await activeRow().click();
await win.waitForTimeout(1200);
assert.ok(disk(p).includes(words), 'a save pending at the click writes what was typed');
await kept(p, words, 'klick i sidofältet innan autospar hunnit köra');

// 3. A double click on the row, and a click on the row's name.
await activeRow().dblclick();
await win.waitForTimeout(300);
await kept(p, words, 'dubbelklick på anteckningen i sidofältet');

// 4. The active tab in the tab bar.
words = 'Text i en flik';
p = await newUntitled(words);
await activeTab().click();
await win.waitForTimeout(300);
await kept(p, words, 'klick på den aktiva fliken');

// 5. Switching away and back keeps the text (it did before; it must still).
await win.locator('#sb-list .sb-note', { hasText: 'Ringa veterinären' }).click();
await win.waitForFunction(() => /Ringa/.test(window.__notera.active.path));
await win.locator('#tabs .tab', { hasText: 'Namnlös' }).last().click();
await win.waitForFunction((q) => window.__notera.active.path === q, p);
await kept(p, words, 'byta flik och tillbaka');

// 6. A sidebar search hit for the note already open.
words = 'tappa inte detta';
await win.keyboard.type(' ' + words);
await saved();
await win.fill('#sb-q', 'tappa inte');
await win.locator('#sb-list [data-open]').first().click();
await win.waitForTimeout(300);
await win.fill('#sb-q', '');
await win.dispatchEvent('#sb-q', 'input');
await win.click('.cm-content');
await win.keyboard.press('Control+End');
await kept(p, words, 'sökträff för den öppna anteckningen');

// 7. Opening the file that is already open (Open file, a drop, a second launch with the path).
await win.evaluate((q) => window.__notera.openPaths([q]), p);
await win.waitForTimeout(300);
await kept(p, words, 'öppna samma fil igen');

// 8. Close others from the active tab's menu.
await win.locator('#tabs .tab.active').click({ button: 'right' });
await win.waitForSelector('#sb-menu:not([hidden])');
await win.click('#sb-menu button:has-text("Stäng andra")');
await win.waitForFunction(() => window.__notera.tabs.length === 1);
await win.click('.cm-content');
await win.keyboard.press('Control+End');
await kept(p, words, 'Stäng andra från den aktiva fliken');

// 9. Autosave off: closing the active tab asks, and Save writes what is in the editor.
await win.evaluate(() => window.notera.setSettings({ autosave: false }));
await win.evaluate((q) => window.__notera.openPaths([q]), loose);
await win.waitForFunction((q) => window.__notera.active.path === q, loose);
await win.click('.cm-content');
await win.keyboard.press('Control+End');
words = 'osparad text utan autospar';
await win.keyboard.type(words);
await win.locator('#tabs .tab.active').click();
await win.locator('#tabs .tab.active').click();
assert.ok((await activeText()).includes(words), 'autosave off: clicking the tab keeps the text');
await app.evaluate(() => { globalThis.__answer = 0; });
await win.keyboard.press('Control+W');
await win.waitForFunction((q) => !window.__notera.tabs.some((t) => t.path === q), loose);
assert.ok(disk(loose).includes(words), 'Save in the unsaved-changes question writes the edited text');
console.log('ok   autospar av: stäng aktiv flik och spara');
await win.evaluate(() => window.notera.setSettings({ autosave: true }));

assert.ok(fs.existsSync(p), 'the note with text is still there');

assert.deepEqual(errors, []);
await app.close();
console.log('nowipe: alla scenarier höll texten kvar');
