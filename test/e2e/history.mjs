// Version history: a save keeps the text it replaces (at once when most of it goes), leaving a
// note keeps a version, the dialog lists and restores versions, a moved note takes its history
// along, a deleted note leaves its last text, and a file outside the notes folder has history too.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'test/e2e/shots');
fs.mkdirSync(shots, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-hi-'));
const userData = path.join(tmp, 'userdata');
const notes = path.join(tmp, 'Notera');
const bin = path.join(tmp, 'bin');
fs.mkdirSync(userData, { recursive: true });
fs.mkdirSync(bin);
const put = (rel, text) => { const p = path.join(notes, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); return p; };
const BODY = 'Budget: 40 000 kr.\nTidplan: klart i november.\nAnsvar: Jonas tar leverantörerna, Stella tar hästarna.\n';
const meeting = put('Osorterat/2026-10-09 Möte.md', `# Möte\nProjekt: Osorterat · Skapad: 2026-10-09 09:00\n\n${BODY}`);
put('Osorterat/2026-10-08 Annat.md', '# Annat\nProjekt: Osorterat · Skapad: 2026-10-08 09:00\n\nNågot annat.\n');
fs.mkdirSync(path.join(notes, 'Enlantis'));
fs.writeFileSync(path.join(notes, '.notera.json'), JSON.stringify({ version: 1, inbox: 'Osorterat', archive: 'Arkiv', projects: ['Enlantis'], archivedProjects: [] }));
const loose = path.join(tmp, 'lös fil.md');
fs.writeFileSync(loose, 'En lös fil med en hel del text som inte får försvinna bara så där.\n');
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({
  notesRoot: notes, sidebarOpen: true, language: 'sv', mode: 'light', checkUpdates: false, windowBounds: { width: 1200, height: 760 }
}));

const app = await electron.launch({ args: [root], env: { ...process.env, NOTERA_USER_DATA: userData } });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0 && window.__notera.sidebar.tree);
await app.evaluate(({ dialog, shell }, binDir) => {
  const fsm = process.mainModule.require('fs');
  const pathm = process.mainModule.require('path');
  dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  shell.trashItem = async (p) => { fsm.renameSync(p, pathm.join(binDir, pathm.basename(p) + '-' + Date.now())); };
  globalThis.__shown = [];
  shell.showItemInFolder = (p) => { globalThis.__shown.push(p); };
}, bin);

const histDir = (rel) => path.join(notes, '.notera-history', rel);
const versions = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);
const versionTexts = (dir) => versions(dir).map((n) => fs.readFileSync(path.join(dir, n), 'utf8'));
const activeText = () => win.evaluate(() => window.__notera.view.state.doc.toString());
const saved = () => win.waitForFunction(() => !window.__notera.active.dirty);
const noteRow = (title) => win.locator('#sb-list .sb-note', { hasText: title });
const openHistory = async () => {
  await win.evaluate(() => void window.__notera.handleAction('versionHistory'));
  await win.waitForSelector('#dlg-history[open]');
  await win.waitForFunction(() => document.querySelector('#hist-body').hidden || document.querySelector('#hist-preview').textContent.length > 0);
};
const meetingHist = histDir('Osorterat/2026-10-09 Möte.md');

// 1. No versions yet: the dialog says how versions come about.
await noteRow('Möte').click();
await win.waitForFunction((p) => window.__notera.active.path === p, meeting);
await openHistory();
assert.equal(await win.isVisible('#hist-empty'), true);
assert.equal(await win.isVisible('#hist-restore'), false);
await win.click('#dlg-history button[data-close]');
console.log('ok   inga versioner: dialogen förklarar');

// 2. The first save keeps the text it replaces.
await win.click('.cm-content');
await win.keyboard.press('Control+End');
await win.keyboard.type('Nästa möte: tisdag.');
await saved();
assert.deepEqual(versionTexts(meetingHist), [fs.readFileSync(meeting, 'utf8').replace('Nästa möte: tisdag.', '')]);
console.log('ok   första sparningen behåller texten den ersätter');

// 3. Wiping the text (select all, a few letters) keeps the full text at once, within five minutes.
const full = await activeText();
await win.keyboard.press('Control+A');
await win.keyboard.type('oj');
await saved();
assert.equal(fs.readFileSync(meeting, 'utf8'), 'oj');
assert.ok(versionTexts(meetingHist).includes(full), 'the text before the wipe is a version');
console.log('ok   en sparning som tar bort det mesta sparar versionen direkt');

// 4. The dialog lists the versions, shows them, and restores one; the replaced text is a version too.
await openHistory();
const items = await win.$$eval('#hist-list .hist-item', (bs) => bs.map((b) => b.textContent));
assert.ok(items.length >= 2, 'two versions listed');
assert.match(items[0], /^I dag \d\d:\d\d(:\d\d)?/);
assert.match(items[0], /tecken fler/);
assert.equal(await win.textContent('#hist-preview'), full, 'the newest version is shown first');
await win.screenshot({ path: path.join(shots, '60-history-dialog.png') });
await win.click('#hist-folder');
assert.equal((await app.evaluate(() => globalThis.__shown)).at(-1), meetingHist, 'Show folder opens the history folder');
await win.focus('#hist-list');
await win.keyboard.press('ArrowDown');
await win.waitForFunction((t) => document.querySelector('#hist-preview').textContent !== t, full);
await win.keyboard.press('ArrowUp');
await win.waitForFunction((t) => document.querySelector('#hist-preview').textContent === t, full);
await win.click('#hist-restore');
await win.waitForFunction((t) => window.__notera.view.state.doc.toString() === t, full);
await saved();
assert.equal(fs.readFileSync(meeting, 'utf8').replace(/\r\n/g, '\n'), full, 'the restored text is saved');
assert.ok(versionTexts(meetingHist).includes('oj'), 'the text the restore replaced is a version');
assert.match(await win.textContent('#notes-toast'), /återställd/);
console.log('ok   dialogen visar och återställer, och texten innan blir en version');

// 5. Ctrl+Z takes the restore back.
await win.keyboard.press('Control+Z');
assert.equal(await activeText(), 'oj');
await win.keyboard.press('Control+Y');
assert.equal(await activeText(), full);
await saved();
console.log('ok   Ctrl+Z ångrar återställningen');

// 6. A version with the same text as now cannot be restored.
await openHistory();
await win.focus('#hist-list');
for (let i = 0; i < 10 && (await win.textContent('#hist-preview')) !== full; i++) {
  const prev = await win.textContent('#hist-preview');
  await win.keyboard.press('ArrowDown');
  await win.waitForFunction((t) => document.querySelector('#hist-preview').textContent !== t, prev).catch(() => {});
}
assert.equal(await win.textContent('#hist-preview'), full);
assert.equal(await win.isDisabled('#hist-restore'), true);
assert.equal(await win.textContent('#hist-restore'), 'Samma som nu');
await win.keyboard.press('Escape');
console.log('ok   samma text som nu går inte att återställa');

// 7. Leaving a note keeps its text as a version.
await win.click('.cm-content');
await win.keyboard.press('Control+End');
await win.keyboard.type(' Lämnas nu.');
await saved();
await noteRow('Annat').click();
await win.waitForFunction(() => /Annat/.test(window.__notera.active.path));
await win.waitForTimeout(400);
assert.ok(versionTexts(meetingHist).some((t) => t.endsWith('Lämnas nu.')), 'the text when the note was left is a version');
console.log('ok   att lämna anteckningen sparar en version');

// 8. Tab menu and note menu offer Version history.
await win.locator('#tabs .tab', { hasText: 'Möte' }).click({ button: 'right' });
await win.waitForSelector('#sb-menu:not([hidden])');
await win.click('#sb-menu button:has-text("Versionshistorik")');
await win.waitForSelector('#dlg-history[open]');
assert.match(await win.textContent('#hist-of'), /Möte/);
await win.keyboard.press('Escape');
await noteRow('Annat').click({ button: 'right' });
await win.waitForSelector('#sb-menu:not([hidden])');
assert.equal(await win.locator('#sb-menu button:has-text("Versionshistorik")').count(), 1);
await win.keyboard.press('Escape');
console.log('ok   flikmenyn och anteckningsmenyn har Versionshistorik');

// 9. A moved note takes its history along.
const before = versions(meetingHist).length;
await win.evaluate((p) => window.__notera.sidebar.moveTo(p, 'Enlantis'), meeting);
await win.waitForFunction(() => window.__notera.tabs.some((t) => /Enlantis/.test(t.path || '')));
const movedHist = histDir('Enlantis/2026-10-09 Möte.md');
assert.equal(versions(movedHist).length, before);
assert.ok(!fs.existsSync(meetingHist));
console.log('ok   en flyttad anteckning tar med sin historik');

// 10. A deleted note leaves its history, with its last text.
const other = path.join(notes, 'Osorterat', '2026-10-08 Annat.md');
await noteRow('Annat').click({ button: 'right' });
await win.waitForSelector('#sb-menu:not([hidden])');
await win.keyboard.press('d'); // D deletes; the question is answered Delete
await win.waitForFunction((p) => !window.__notera.tabs.some((t) => t.path === p), other);
assert.ok(versionTexts(histDir('Osorterat/2026-10-08 Annat.md')).some((t) => t.includes('Något annat.')));
console.log('ok   en raderad anteckning lämnar sin historik');

// 11. A file outside the notes folder has history in the app's own folder.
await win.evaluate((p) => window.__notera.openPaths([p]), loose);
await win.waitForFunction((p) => window.__notera.active.path === p, loose);
await win.click('.cm-content');
await win.keyboard.press('Control+A');
await win.keyboard.type('kort');
await saved();
const looseRoot = path.join(userData, 'history');
const looseDirs = fs.readdirSync(looseRoot);
assert.equal(looseDirs.length, 1);
assert.ok(versionTexts(path.join(looseRoot, looseDirs[0]))[0].startsWith('En lös fil'));
console.log('ok   en fil utanför anteckningsmappen har historik');

// 12. Nothing of the history shows up as a project or in search.
const names = await win.$$eval('#sb-list .sb-proj', (els) => els.map((e) => e.dataset.folder || ''));
assert.ok(names.length > 0 && !names.some((n) => n.startsWith('.')), names.join(', '));
await win.fill('#sb-q', 'Budget');
await win.waitForTimeout(500);
assert.equal(await win.locator('#sb-list [data-open]').count(), 1, 'search finds the note once, not its versions');
await win.fill('#sb-q', '');
console.log('ok   historiken syns inte som projekt');

assert.deepEqual(errors, []);
await app.close();
console.log('history OK');
