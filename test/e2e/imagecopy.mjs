// Text with images copied from one note and pasted into a note in another project: the images are
// copied into that project's images folder and the links point there, so the pasted image shows as
// an image and not as the dashed missing-file box. The same image pasted twice is not copied twice;
// a different file of the same name gets the next number; within one folder the text goes in as it is.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { png } from './png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'test/e2e/shots');
fs.mkdirSync(shots, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-imgcopy-'));
const userData = path.join(tmp, 'userdata');
const notes = path.join(tmp, 'Notera');
fs.mkdirSync(userData, { recursive: true });
const put = (rel, data) => { const p = path.join(notes, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); return p; };
const red = png(300, 200, [200, 60, 60]);
const blue = png(120, 80, [40, 60, 200]);
const a = put('Enlantis/2026-10-21 Login error.md', '# Login error\nProjekt: Enlantis · Skapad: 2026-10-21 10:00\n\nFelet:\n\n![Bild 1](bilder/login-error-1.png)\n\nSlut.\n');
put('Enlantis/bilder/login-error-1.png', red);
const b = put('Kund/2026-10-22 Möte.md', '# Möte\nProjekt: Kund · Skapad: 2026-10-22 10:00\n\n');
const c = put('Tredje/2026-10-23 Annat.md', '# Annat\nProjekt: Tredje · Skapad: 2026-10-23 10:00\n\n');
put('Tredje/bilder/login-error-1.png', blue); // the same name, other bytes
put('Osorterat/.keep', '');
fs.writeFileSync(path.join(notes, '.notera.json'), JSON.stringify({ version: 1, inbox: 'Osorterat', archive: 'Arkiv', images: 'bilder', projects: ['Enlantis', 'Kund', 'Tredje'], archivedProjects: [], seeded: true }));
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({
  notesRoot: notes, sidebarOpen: true, language: 'sv', mode: 'light', checkUpdates: false, viewMode: 'editor', windowBounds: { width: 1200, height: 800 }
}));

const app = await electron.launch({ args: [root, a, b, c], env: { ...process.env, NOTERA_USER_DATA: userData } });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
await win.waitForFunction((n) => window.__notera && window.__notera.tabs.filter((t) => t.path).length === n, 3);
const doc = () => win.evaluate(() => window.__notera.view.state.doc.toString());
const activate = async (p) => {
  await win.evaluate((p) => window.__notera.openPaths([p]), p);
  await win.waitForFunction((p) => window.__notera.active.path === p, p);
};
/** Select from `start` to the end of the active note and copy it, as Ctrl+C does. */
const copyFrom = async (p, start) => {
  await activate(p);
  await win.click('.cm-content');
  await win.evaluate((s) => { const v = window.__notera.view; const t = v.state.doc.toString(); v.dispatch({ selection: { anchor: t.indexOf(s), head: t.length } }); }, start);
  await win.keyboard.press('Control+C');
};
const pasteAtEnd = async (p) => {
  await activate(p);
  await win.click('.cm-content');
  await win.keyboard.press('Control+End');
  await win.keyboard.press('Control+V');
};

// 1. Into a note in another project: the image is copied to Kund/bilder and shows as an image.
await copyFrom(a, 'Felet:');
await pasteAtEnd(b);
await win.waitForFunction(() => window.__notera.view.state.doc.toString().includes('Felet:\n\n![Bild 1](bilder/login-error-1.png)\n\nSlut.\n'));
const copied = path.join(notes, 'Kund', 'bilder', 'login-error-1.png');
assert.ok(fs.existsSync(copied), 'the image was copied into the project');
assert.equal(Buffer.compare(fs.readFileSync(copied), red), 0, 'byte for byte');
assert.ok(fs.existsSync(path.join(notes, 'Enlantis', 'bilder', 'login-error-1.png')), 'the original stays');
await win.waitForFunction(() => { const img = document.querySelector('#editor .cm-image img'); return img && img.naturalWidth === 300; });
assert.equal(await win.evaluate(() => document.querySelectorAll('#editor .img-missing').length), 0, 'no missing-file box');
await win.screenshot({ path: path.join(shots, 'images-copied.png') });
console.log('ok   inklistrad i annat projekt: bilden kopieras med och syns');

// 2. The same again: the file already there with the same bytes is used, no second copy.
await win.keyboard.press('Control+V');
await win.waitForFunction(() => (window.__notera.view.state.doc.toString().match(/bilder\/login-error-1\.png/g) || []).length === 2);
assert.deepEqual(fs.readdirSync(path.join(notes, 'Kund', 'bilder')), ['login-error-1.png']);
console.log('ok   samma bild igen: ingen ny kopia');

// 3. Another file of that name in the target: the copy gets the next number and the link follows.
await pasteAtEnd(c);
await win.waitForFunction(() => window.__notera.view.state.doc.toString().includes('![Bild 1](bilder/login-error-2.png)'));
assert.equal(Buffer.compare(fs.readFileSync(path.join(notes, 'Tredje', 'bilder', 'login-error-2.png')), red), 0);
assert.equal(Buffer.compare(fs.readFileSync(path.join(notes, 'Tredje', 'bilder', 'login-error-1.png')), blue), 0, 'the file already there is untouched');
console.log('ok   namnkrock: nästa nummer, länken följer med');

// 4. Within the same note (the same folder): the text goes in as it is, nothing is copied.
await activate(a);
const before = await doc();
await win.click('.cm-content');
await win.keyboard.press('Control+End');
await win.keyboard.press('Control+V');
await win.waitForFunction((n) => window.__notera.view.state.doc.toString().length > n, before.length);
assert.equal(await doc(), before + 'Felet:\n\n![Bild 1](bilder/login-error-1.png)\n\nSlut.\n');
assert.deepEqual(fs.readdirSync(path.join(notes, 'Enlantis', 'bilder')), ['login-error-1.png']);
console.log('ok   samma mapp: texten klistras in som den är');

// Everything pasted is saved.
await activate(b);
await win.waitForFunction(() => !window.__notera.active.dirty);
assert.deepEqual(errors, [], errors.join('\n'));
await app.close();
console.log('imagecopy OK; screenshots in ' + shots);
