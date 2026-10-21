// Images follow their note: a note moved to another project takes its images along and still shows
// them, Undo brings everything back, archiving and restoring do the same, and a deleted note takes
// the images only it links to the Recycle Bin.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { png } from './png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-imgmove-'));
const userData = path.join(tmp, 'userdata');
const notes = path.join(tmp, 'Notera');
const bin = path.join(tmp, 'bin');
fs.mkdirSync(userData, { recursive: true });
fs.mkdirSync(bin);
const put = (rel, data) => { const p = path.join(notes, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); return p; };
const note = put('Enlantis/2026-10-21 Login error.md', '# Login error\nProjekt: Enlantis · Skapad: 2026-10-21 10:00\n\n![Bild 1](bilder/login-error-1.png)\n\n![Bild 2](bilder/delad.png)\n');
put('Enlantis/2026-10-20 Annan.md', '# Annan\nProjekt: Enlantis · Skapad: 2026-10-20 10:00\n\n![Bild 1](bilder/delad.png)\n');
put('Enlantis/bilder/login-error-1.png', png(300, 200, [200, 40, 40]));
put('Enlantis/bilder/delad.png', png(100, 100, [40, 40, 200]));
fs.mkdirSync(path.join(notes, 'Lund'));
fs.mkdirSync(path.join(notes, 'Osorterat'));
fs.writeFileSync(path.join(notes, '.notera.json'), JSON.stringify({ version: 1, inbox: 'Osorterat', archive: 'Arkiv', projects: ['Enlantis', 'Lund'], archivedProjects: [], images: 'bilder', seeded: true }));
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({
  notesRoot: notes, sidebarOpen: true, language: 'sv', mode: 'light', checkUpdates: false, viewMode: 'editor', confirmDelete: false, windowBounds: { width: 1200, height: 800 }
}));

const app = await electron.launch({ args: [root, note], env: { ...process.env, NOTERA_USER_DATA: userData } });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
await win.waitForFunction((p) => window.__notera && window.__notera.active && window.__notera.active.path === p && window.__notera.sidebar.tree, note);
await app.evaluate(({ shell }, binDir) => {
  const fsm = process.mainModule.require('fs');
  const pathm = process.mainModule.require('path');
  shell.trashItem = async (p) => { fsm.renameSync(p, pathm.join(binDir, pathm.basename(p) + '-' + Date.now())); };
}, bin);
const ls = (...p) => (fs.existsSync(path.join(notes, ...p)) ? fs.readdirSync(path.join(notes, ...p)).sort() : null);
const imagesShown = () => win.waitForFunction(() => {
  const imgs = Array.from(document.querySelectorAll('#editor .cm-image img'));
  return imgs.length === 2 && imgs.every((i) => i.complete && i.naturalWidth > 0) && !document.querySelector('#editor .img-missing');
});
await imagesShown();

// 1. Move to Lund: the own image moves, the shared one is copied, the tab follows and still shows both.
await win.evaluate((p) => window.__notera.sidebar.moveTo(p, 'Lund'), note);
await win.waitForFunction((d) => window.__notera.active.path.startsWith(d), path.join(notes, 'Lund') + path.sep);
assert.deepEqual(ls('Lund', 'bilder'), ['delad.png', 'login-error-1.png']);
assert.deepEqual(ls('Enlantis', 'bilder'), ['delad.png']);
await imagesShown();
console.log('ok   flytt: bilderna följer med och syns i den flyttade anteckningen');

// 2. Undo from the toast: everything back.
await win.click('#notes-toast button');
await win.waitForFunction((p) => window.__notera.active.path === p, note);
assert.deepEqual(ls('Enlantis', 'bilder'), ['delad.png', 'login-error-1.png']);
assert.deepEqual(ls('Lund', 'bilder'), null, 'the empty images folder in Lund is gone');
await imagesShown();
console.log('ok   ångra: tillbaka');

// 3. Archive and restore.
await win.evaluate((p) => window.__notera.sidebar.archiveNote(p), note);
await win.waitForFunction((d) => window.__notera.active.path.startsWith(d), path.join(notes, 'Arkiv', 'Enlantis') + path.sep);
assert.deepEqual(ls('Arkiv', 'Enlantis', 'bilder'), ['delad.png', 'login-error-1.png']);
await imagesShown();
const archived = await win.evaluate(() => window.__notera.active.path);
await win.evaluate((p) => window.__notera.sidebar.restoreNote(p), archived);
await win.waitForFunction((p) => window.__notera.active.path === p, note);
assert.deepEqual(ls('Enlantis', 'bilder'), ['delad.png', 'login-error-1.png']);
assert.equal(ls('Arkiv', 'Enlantis'), null);
await imagesShown();
console.log('ok   arkivera och återställ: bilderna följer med');

// 4. Delete: the own image goes to the Recycle Bin with the note, the shared one stays for Annan.
await win.evaluate((p) => window.notera.notes.call('deleteNote', p), note);
await win.waitForFunction((p) => window.__notera.active.path !== p, note);
assert.deepEqual(ls('Enlantis', 'bilder'), ['delad.png']);
assert.ok(fs.readdirSync(bin).some((n) => n.startsWith('login-error-1.png')), 'the image is in the bin');
assert.ok(fs.readdirSync(bin).some((n) => n.startsWith('2026-10-21 Login error.md')), 'and so is the note');
console.log('ok   radera: bara den egna bilden går till papperskorgen');

assert.deepEqual(errors, [], errors.join('\n'));
await app.close();
console.log('imagemove OK');
