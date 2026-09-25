// Projects in the sidebar: the notes folder, new notes with a header, renaming after the heading,
// moving by drag and by menu, undo, archive and restore, search, pinning, project rename and delete,
// moving a loose file into a project, and the first run without a notes folder.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'test/e2e/shots');
fs.mkdirSync(shots, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-p-'));
const userData = path.join(tmp, 'userdata');
const notes = path.join(tmp, 'Notera');
const bin = path.join(tmp, 'bin');
fs.mkdirSync(userData, { recursive: true });
fs.mkdirSync(bin);
const put = (rel, text) => { const p = path.join(notes, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); return p; };
const read = (...rel) => fs.readFileSync(path.join(notes, ...rel), 'utf8');
const ls = (...rel) => fs.readdirSync(path.join(notes, ...rel)).filter((n) => !n.startsWith('.')).sort();
const today = (() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();

put('Osorterat/2026-09-25 Ringa veterinären.md', '# Ringa veterinären om Stella\nProjekt: Osorterat · Skapad: 2026-09-25 07:55\n\nHälta vänster fram.\n');
put('Enlantis/2026-09-18 PBI-1234 Inloggningsfel.md', '# PBI-1234 Inloggningsfel\nProjekt: Enlantis · Skapad: 2026-09-18 09:12\n\nKinde saknar callback-URL:en.\n');
put('Enlantis/2026-09-21 Sprintplanering v39.md', '# Sprintplanering v39\nProjekt: Enlantis · Skapad: 2026-09-21 08:30\n\n- Hemma PR 9\n');
put('Notera/2026-09-24 Releasechecklista.md', '# Releasechecklista\nProjekt: Notera · Skapad: 2026-09-24 16:40\n\n- [ ] dist:win\n');
put('Hackytel/2026-09-10 Visdomsatlasen.md', '# Visdomsatlasen\nProjekt: Hackytel · Skapad: 2026-09-10 20:15\n\nKarta över citat.\n');
put('Arkiv/Q2-rapport/2026-06-20 Utkast Q2.md', '# Utkast Q2\nProjekt: Q2-rapport · Skapad: 2026-06-20 09:00\n\nIntäkter upp.\n');
fs.writeFileSync(path.join(notes, '.notera.json'), JSON.stringify({
  version: 1, inbox: 'Osorterat', archive: 'Arkiv', projects: ['Enlantis', 'Notera', 'Hackytel'], archivedProjects: ['Q2-rapport']
}));
const loose = path.join(tmp, 'lösa tankar.md');
fs.writeFileSync(loose, 'Skrev det här innan Notera hade projekt.\n');
const settingsFile = path.join(userData, 'settings.json');
fs.writeFileSync(settingsFile, JSON.stringify({
  notesRoot: notes, sidebarOpen: true, language: 'sv', theme: 'light', checkUpdates: false, windowBounds: { width: 1200, height: 760 }
}));

const launch = (args = []) => electron.launch({ args: [root, ...args], env: { ...process.env, NOTERA_USER_DATA: userData } });
let app = await launch();
let win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0 && window.__notera.sidebar.tree);
// Dialogs and the Recycle Bin are stubbed in the main process: answers come from globalThis.__answer.
await app.evaluate(({ dialog, shell }, binDir) => {
  const fsm = process.mainModule.require('fs');
  const pathm = process.mainModule.require('path');
  globalThis.__answer = 0;
  globalThis.__asked = [];
  dialog.showMessageBox = async (_w, opts) => { globalThis.__asked.push((opts || _w).message); return { response: globalThis.__answer, checkboxChecked: false }; };
  shell.trashItem = async (p) => { fsm.renameSync(p, pathm.join(binDir, pathm.basename(p) + '-' + Date.now())); };
}, bin);
const shot = (name) => win.screenshot({ path: path.join(shots, name + '.png') });
const row = (folder) => `#sb-list .sb-proj[data-folder="${folder}"]`;
const noteRow = (title) => win.locator('#sb-list .sb-note', { hasText: title });
const titlesIn = (folder) => win.evaluate((f) => {
  const out = [];
  let el = document.querySelector(`#sb-list .sb-proj[data-folder="${f}"]`)?.nextElementSibling;
  while (el && el.classList.contains('sb-note')) { out.push(el.querySelector('.name').textContent); el = el.nextElementSibling; }
  return out;
}, folder);
const activePath = () => win.evaluate(() => window.__notera.active.path);
const activeText = () => win.evaluate(() => window.__notera.view.state.doc.toString());
const settle = () => win.waitForTimeout(350);

// 1. The tree
assert.deepEqual(await titlesIn('Osorterat'), ['Ringa veterinären om Stella']);
assert.deepEqual(await titlesIn('Enlantis'), ['PBI-1234 Inloggningsfel', 'Sprintplanering v39']);
assert.equal(await win.textContent('#sb-foot .count'), '1');
await shot('30-notes-sidebar');

// 2. + on a project: a new note on top with the header, renamed after the heading on Enter
await win.hover(row('Enlantis'));
await win.click(`${row('Enlantis')} [data-act="new-note"]`);
await win.waitForFunction(() => /Namnlös anteckning\.md$/.test(window.__notera.active.path || ''));
assert.match(await activeText(), /^# \nProjekt: Enlantis · Skapad: \d{4}-\d{2}-\d{2} \d{2}:\d{2}\n\n$/);
await win.keyboard.type('PBI-2001 Export: fel?');
assert.equal((await titlesIn('Enlantis'))[0], 'PBI-2001 Export: fel?', 'the sidebar title follows the heading while typing');
await win.keyboard.press('Enter');
await win.keyboard.type('CSV-exporten tappar kolumner.');
await win.waitForFunction(() => /PBI-2001 Export fel\.md$/.test(window.__notera.active.path));
assert.ok(ls('Enlantis').includes(`${today} PBI-2001 Export fel.md`));
await win.waitForFunction(() => !window.__notera.active.dirty);
assert.match(read('Enlantis', `${today} PBI-2001 Export fel.md`), /^# PBI-2001 Export: fel\?\nProjekt: Enlantis · Skapad: .+\n\nCSV-exporten tappar kolumner\.$/);
assert.match(await win.textContent('#st-note'), /^Enlantis › \d{4}-\d{2}-\d{2} PBI-2001 Export fel\.md$/);
await shot('31-notes-new-note');

// 3. Ctrl+T writes to Unsorted; Ctrl+Alt+N to the current project; an untouched new note leaves nothing behind
await win.keyboard.press('Control+T');
await win.waitForFunction(() => /Osorterat/.test(window.__notera.active.path || ''));
assert.equal(ls('Osorterat').length, 2);
await win.keyboard.press('Control+W');
await win.waitForFunction(() => !/Osorterat/.test(window.__notera.active.path || ''));
await settle();
assert.equal(ls('Osorterat').length, 1, 'closing an empty new note removes its file');
await noteRow('PBI-1234').click();
await win.keyboard.press('Control+Alt+N');
await win.waitForFunction(() => /Enlantis.*Namnlös/.test(window.__notera.active.path || ''));
await win.keyboard.press('Control+W');
await settle();
assert.ok(!ls('Enlantis').some((n) => n.includes('Namnlös')));

// 4. Drag a note onto another project: the file moves, its header follows, its tab follows; undo
await noteRow('Sprintplanering').click();
const src = await noteRow('Sprintplanering').boundingBox();
const dst = await win.locator(row('Notera')).boundingBox();
await win.mouse.move(src.x + 40, src.y + src.height / 2);
await win.mouse.down();
await win.mouse.move(src.x + 50, src.y + 30, { steps: 4 });
await win.mouse.move(dst.x + 60, dst.y + dst.height / 2, { steps: 8 });
await shot('32-notes-dragging');
await win.mouse.up();
await win.waitForFunction(() => /Notera[\\/]2026-09-21 Sprintplanering v39\.md$/.test(window.__notera.active.path));
assert.match(read('Notera', '2026-09-21 Sprintplanering v39.md'), /^# Sprintplanering v39\nProjekt: Notera · Skapad: 2026-09-21 08:30\n/);
assert.match((await activeText()).split('\n')[1], /^Projekt: Notera/, 'the open tab shows the new header');
await win.waitForFunction(() => document.querySelector('#notes-toast .msg')?.textContent === 'Flyttad till Notera');
await win.click('#notes-toast button');
await win.waitForFunction(() => /Enlantis[\\/]2026-09-21 Sprintplanering v39\.md$/.test(window.__notera.active.path));
assert.match(read('Enlantis', '2026-09-21 Sprintplanering v39.md'), /Projekt: Enlantis/);

// 5. Reorder within a project by drag
await win.waitForFunction(() => /Ångrat/.test(document.querySelector('#notes-toast .msg')?.textContent || ''));
await settle();
const a = await noteRow('Sprintplanering').boundingBox();
const b = await noteRow('PBI-1234').boundingBox();
await win.mouse.move(a.x + 40, a.y + a.height / 2);
await win.mouse.down();
await win.mouse.move(a.x + 40, a.y - 10, { steps: 4 });
await win.mouse.move(b.x + 40, b.y + 4, { steps: 6 });
await win.mouse.up();
await settle();
assert.deepEqual((await titlesIn('Enlantis')).slice(0, 3), ['PBI-2001 Export: fel?', 'Sprintplanering v39', 'PBI-1234 Inloggningsfel']);

// 6. Pin via the menu
await noteRow('PBI-1234').hover();
await noteRow('PBI-1234').locator('[data-act="note-menu"]').click();
await shot('33-notes-menu');
await win.click('#sb-menu button:has-text("Fäst överst")');
await settle();
assert.equal((await titlesIn('Enlantis'))[0], 'PBI-1234 Inloggningsfel');
assert.equal(await noteRow('PBI-1234').locator('.pin').count(), 1);

// 7. Move via the menu, into a new project made on the spot
await noteRow('Visdomsatlasen').hover();
await noteRow('Visdomsatlasen').locator('[data-act="note-menu"]').click();
await win.click('#sb-menu button:has-text("Flytta till")');
await win.click('#sb-menu button:has-text("Nytt projekt…")');
await win.fill('#project-name', 'Kund X');
await win.click('#project-ok');
await win.waitForFunction(() => document.querySelector('#sb-list .sb-proj[data-folder="Kund X"]'));
await settle();
assert.deepEqual(ls('Kund X'), ['2026-09-10 Visdomsatlasen.md']);
assert.match(read('Kund X', '2026-09-10 Visdomsatlasen.md'), /Projekt: Kund X/);

// 8. Archive the open note: read-only with a banner; restore from the banner
await noteRow('PBI-2001').click();
await noteRow('PBI-2001').locator('[data-act="note-menu"]').click();
await win.click('#sb-menu button:has-text("Arkivera")');
await win.waitForFunction(() => /Arkiv[\\/]Enlantis/.test(window.__notera.active.path));
await win.waitForFunction(() => document.querySelector('#sb-foot .count')?.textContent === '2');
assert.equal(await win.evaluate(() => window.__notera.view.state.readOnly), true);
assert.match(await win.textContent('#notes-banner'), /Arkiverad från Enlantis/);
await shot('34-notes-archived-banner');
await win.click('#notes-banner [data-nb="restore"]');
await win.waitForFunction(() => /Enlantis[\\/]\d{4}-\d{2}-\d{2} PBI-2001/.test(window.__notera.active.path) && !window.__notera.view.state.readOnly);
assert.equal(await win.textContent('#notes-banner'), '');

// 9. The archive view: restore a whole project
await win.click('#sb-foot [data-act="archive-toggle"]');
await settle();
await shot('35-notes-archive');
assert.match(await win.textContent('#sb-list'), /Q2-rapport\s*helt projekt/);
await win.locator('.sb-arch-group[data-folder="Q2-rapport"]').hover();
await win.click('.sb-arch-group[data-folder="Q2-rapport"] [data-act="arch-proj-restore"]');
await settle();
assert.deepEqual(ls('Q2-rapport'), ['2026-06-20 Utkast Q2.md']);
await win.click('#sb-foot [data-act="archive-toggle"]');

// 10. Search in the sidebar and in the palette (sidebar closed)
await win.fill('#sb-q', 'kinde');
await win.waitForSelector('#sb-list .sb-res');
assert.match(await win.textContent('#sb-list .sb-res .tt'), /PBI-1234 Inloggningsfel/);
await shot('36-notes-search');
await win.fill('#sb-q', '');
await win.dispatchEvent('#sb-q', 'input');
await win.keyboard.press('Control+Shift+B');
await win.waitForFunction(() => !document.body.classList.contains('sb-open'));
await win.keyboard.press('Control+Shift+F');
await win.waitForSelector('#palette:not([hidden])');
await win.keyboard.type('utkast');
await win.waitForFunction(() => /Utkast Q2/.test(document.querySelector('#pal-list')?.textContent || ''));
await shot('37-notes-palette');
await win.keyboard.press('Enter');
await win.waitForFunction(() => /Utkast Q2/.test(window.__notera.active.path));
await win.keyboard.press('Control+Shift+B');
await win.waitForFunction(() => document.body.classList.contains('sb-open'));

// 11. Rename a project inline: folder renamed, headers rewritten, open tab follows
await win.locator(row('Q2-rapport')).hover();
await win.click(`${row('Q2-rapport')} [data-act="proj-menu"]`);
await win.click('#sb-menu button:has-text("Byt namn")');
await win.fill('#sb-edit', 'Q2 2026');
await win.keyboard.press('Enter');
await win.waitForFunction(() => /Q2 2026[\\/]2026-06-20 Utkast Q2\.md$/.test(window.__notera.active.path));
assert.match(read('Q2 2026', '2026-06-20 Utkast Q2.md'), /Projekt: Q2 2026/);
assert.match((await activeText()).split('\n')[1], /^Projekt: Q2 2026/);

// 12. Delete a project with notes (dialog answered "Delete project")
await win.locator(row('Hackytel')).hover();
await win.click(`${row('Hackytel')} [data-act="proj-menu"]`);
await win.click('#sb-menu button:has-text("Ta bort projekt")');
await settle();
assert.ok(!ls().includes('Hackytel'));
assert.ok((await app.evaluate(() => globalThis.__asked)).some((m) => /Hackytel/.test(m)));

// 13. A loose file from outside moves into a project from the tab menu
await win.evaluate((p) => window.__notera.openPaths([p]), loose);
await win.waitForFunction(() => /lösa tankar/.test(window.__notera.active.path));
await win.click('.tab.active', { button: 'right' });
await win.click('#sb-menu button:has-text("Flytta till projekt")');
await win.click('#sb-menu button:has-text("Notera")');
await win.waitForFunction(() => /Notera[\\/]\d{4}-\d{2}-\d{2} lösa tankar\.md$/.test(window.__notera.active.path));
assert.ok(!fs.existsSync(loose));
assert.match(await activeText(), /^# lösa tankar\nProjekt: Notera · Skapad: .+\n\nSkrev det här/);

// 14. Dark theme
await win.evaluate(() => window.notera.setSettings({ theme: 'dark' }));
await win.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
await settle();
await shot('38-notes-dark');
assert.deepEqual(errors, []);
await app.close();

// 15. First run: no notes folder yet
fs.writeFileSync(settingsFile, JSON.stringify({ language: 'sv', theme: 'light', checkUpdates: false, windowBounds: { width: 1200, height: 760 } }));
const fresh = path.join(tmp, 'Nya anteckningar');
app = await launch();
win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
assert.equal(await win.evaluate(() => document.body.classList.contains('sb-open')), false, 'closed until a folder is chosen');
assert.match(await win.textContent('#notes-banner'), /välj en mapp/);
await win.keyboard.press('Control+T');
assert.equal(await win.evaluate(() => window.__notera.active.path), null, 'Ctrl+T without a notes folder opens an untitled tab');
await win.keyboard.press('Control+Shift+B');
await win.waitForSelector('#sb-list .sb-setup');
await shot('39-notes-first-run');
await app.evaluate(({ dialog }, dir) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] }); }, fresh);
await win.click('#sb-list [data-act="choose-root"]');
await win.waitForSelector('#sb-list .sb-proj[data-folder="Osorterat"]');
assert.deepEqual(fs.readdirSync(fresh).sort(), ['.notera.json', 'Arkiv', 'Osorterat']);
assert.equal(await win.textContent('#notes-banner'), '');
await win.keyboard.press('Control+T');
await win.waitForFunction(() => /Osorterat/.test(window.__notera.active.path || ''));
await app.close();

console.log('notes OK; screenshots in', shots);
