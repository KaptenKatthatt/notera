// Images into a note: Ctrl+V with a screenshot on the clipboard writes a JPEG into the project's
// images folder and inserts the line; a dropped file is converted the same way (a jpg is copied as
// it is); Insert image… goes through a file dialog; an untitled tab becomes a note in Unsorted
// first; without a notes folder the paste does nothing and a toast says why.
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-imgins-'));
const userData = path.join(tmp, 'userdata');
const notes = path.join(tmp, 'Notera');
fs.mkdirSync(path.join(userData, 'drafts'), { recursive: true });
const put = (rel, data) => { const p = path.join(notes, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); return p; };
const note = put('Enlantis/2026-10-21 Login error.md', '# Login error\nProjekt: Enlantis · Skapad: 2026-10-21 10:00\n\nFelet:\n');
put('Osorterat/.keep', '');
fs.writeFileSync(path.join(notes, '.notera.json'), JSON.stringify({ version: 1, inbox: 'Osorterat', archive: 'Arkiv', projects: ['Enlantis'], archivedProjects: [], seeded: true }));
// An untitled tab comes from a draft.
fs.writeFileSync(path.join(userData, 'drafts', 'd1.json'), JSON.stringify({ text: '# Lös tanke\n\nText.\n', kind: 'md', savedAt: Date.now() }));
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({
  notesRoot: notes, sidebarOpen: true, language: 'sv', mode: 'light', checkUpdates: false, viewMode: 'editor', windowBounds: { width: 1200, height: 800 }
}));
const shot = path.join(tmp, 'shot.png');
fs.writeFileSync(shot, png(400, 300, [30, 160, 90]));
const jpgFile = path.join(tmp, 'foto.jpg');
const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
fs.writeFileSync(jpgFile, Buffer.concat([JPEG_HEAD, Buffer.from('not really decodable, copied as it is'), Buffer.from([0xff, 0xd9])]));

const app = await electron.launch({ args: [root, note], env: { ...process.env, NOTERA_USER_DATA: userData } });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
await win.waitForFunction((p) => window.__notera && window.__notera.active && window.__notera.active.path === p, note);
const screenshot = (name) => win.screenshot({ path: path.join(shots, name + '.png') });
const doc = () => win.evaluate(() => window.__notera.view.state.doc.toString());
const isJpeg = (p) => { const b = fs.readFileSync(p); return b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9; };
/** Drop files on the window the way Explorer would (the bytes travel with the File objects). */
const drop = async (files) => {
  const dt = await win.evaluateHandle((list) => {
    const dt = new DataTransfer();
    for (const f of list) dt.items.add(new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name, { type: f.type }));
    return dt;
  }, files.map((p) => ({ name: path.basename(p), type: /\.jpe?g$/i.test(p) ? 'image/jpeg' : 'image/png', b64: fs.readFileSync(p).toString('base64') })));
  await win.dispatchEvent('.cm-content', 'drop', { dataTransfer: dt });
};

// 1. Ctrl+V with an image on the clipboard: a JPEG in Enlantis/bilder, named after the note, and the line at the cursor.
await app.evaluate(async (_e, b64) => { const { clipboard, ClipboardItem } = process.mainModule.require('electron'); await clipboard.write([new ClipboardItem({ 'image/png': new Blob([Buffer.from(b64, 'base64')], { type: 'image/png' }) })]); }, png(640, 400, [200, 60, 60]).toString('base64'));
await win.click('.cm-content');
await win.keyboard.press('Control+End');
await win.keyboard.press('Control+V');
await win.waitForFunction(() => window.__notera.view.state.doc.toString().includes('![Bild 1](bilder/login-error-1.jpg)'));
const img1 = path.join(notes, 'Enlantis', 'bilder', 'login-error-1.jpg');
assert.ok(fs.existsSync(img1), 'the file is there');
assert.ok(isJpeg(img1), 'and it is a JPEG');
assert.ok(fs.statSync(img1).size < 60000, 'a flat 640×400 as JPEG is small');
let d = await doc();
assert.ok(d.endsWith('Felet:\n\n![Bild 1](bilder/login-error-1.jpg)\n'), JSON.stringify(d));
const cursor = await win.evaluate(() => window.__notera.view.state.selection.main.head);
assert.equal(cursor, d.length, 'the cursor on the blank line after the image');
await win.waitForFunction(() => document.querySelectorAll('#editor .cm-image img').length === 1 && document.querySelector('#editor .cm-image img').naturalWidth === 640);
await win.waitForFunction(() => !window.__notera.active.dirty);
await screenshot('images-pasted');
console.log('ok   Ctrl+V: JPEG i projektets bildmapp, raden infogad, bilden syns');

// 2. The same again: the next number. Pasting with text selected replaces the selection.
await win.keyboard.press('Control+V');
await win.waitForFunction(() => window.__notera.view.state.doc.toString().includes('![Bild 2](bilder/login-error-2.jpg)'));
assert.ok(fs.existsSync(path.join(notes, 'Enlantis', 'bilder', 'login-error-2.jpg')));
console.log('ok   nästa bild får nästa nummer');

// 3. A dropped PNG is converted; a dropped JPEG is copied as it is.
await drop([shot, jpgFile]);
await win.waitForFunction(() => /!\[Bild 4\]\(bilder\/login-error-4\.jpg\)/.test(window.__notera.view.state.doc.toString()));
d = await doc();
assert.ok(d.includes('![Bild 3](bilder/login-error-3.jpg)') && d.includes('![Bild 4](bilder/login-error-4.jpg)'), d);
assert.ok(isJpeg(path.join(notes, 'Enlantis', 'bilder', 'login-error-3.jpg')), 'png became jpeg');
assert.equal(Buffer.compare(fs.readFileSync(path.join(notes, 'Enlantis', 'bilder', 'login-error-4.jpg')), fs.readFileSync(jpgFile)), 0, 'jpg copied byte for byte');
assert.ok(!(await win.evaluate(() => window.__notera.tabs.some((t) => /\.(png|jpg)$/i.test(t.name || '')))), 'no tab was opened for the images');
console.log('ok   släpp: png konverteras, jpg kopieras som den är');

// 4. Insert image… (the dialog is stubbed) with the cursor in the middle of a text line.
await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, shot);
await win.evaluate(() => { const v = window.__notera.view; const t = v.state.doc.toString(); v.dispatch({ selection: { anchor: t.indexOf('Felet:') + 3 } }); });
await win.keyboard.press('Control+Shift+I');
await win.waitForFunction(() => /Fel\n\n!\[Bild 5\]\(bilder\/login-error-5\.jpg\)\n\net:/.test(window.__notera.view.state.doc.toString()));
console.log('ok   Infoga bild… lägger bilden på en egen rad mitt i texten');

// 5. A paste on the heading goes under the header line, never into it.
await win.evaluate(() => { window.__notera.view.dispatch({ selection: { anchor: 3 } }); });
await win.keyboard.press('Control+V');
await win.waitForFunction(() => window.__notera.view.state.doc.toString().startsWith('# Login error\nProjekt: Enlantis · Skapad: 2026-10-21 10:00\n\n![Bild 6](bilder/login-error-6.jpg)\n'));
console.log('ok   inklistring på rubriken hamnar under huvudet');

// 6. An untitled tab (a recovered draft): the paste makes it a note in Unsorted first.
await win.evaluate(() => window.__notera.handleAction('nextTab'));
await win.waitForFunction(() => window.__notera.active && !window.__notera.active.path);
await win.click('.cm-content');
await win.keyboard.press('Control+End');
await win.keyboard.press('Control+V');
await win.waitForFunction(() => window.__notera.active.path && window.__notera.view.state.doc.toString().includes('![Bild 1](bilder/lös-tanke-1.jpg)'));
const p = await win.evaluate(() => window.__notera.active.path);
assert.ok(p.startsWith(path.join(notes, 'Osorterat') + path.sep), p);
assert.ok(fs.existsSync(path.join(notes, 'Osorterat', 'bilder', 'lös-tanke-1.jpg')));
d = await doc();
assert.ok(/^# Lös tanke\nProjekt: Osorterat · Skapad: /.test(d), d);
console.log('ok   namnlös flik blir en anteckning i Osorterat och får bilden');

// 7. A plain-text tab ignores the image.
await win.evaluate(() => { window.__notera.active.kind = 'txt'; });
await win.evaluate(() => window.__notera.handleAction('prevTab'));
await win.evaluate(() => window.__notera.handleAction('nextTab'));
const before = await doc();
await win.click('.cm-content');
await win.keyboard.press('Control+V');
await win.waitForTimeout(400);
assert.equal(await doc(), before, 'nothing pasted into a plain-text tab');
assert.deepEqual(errors, [], errors.join('\n'));
await app.close();
console.log('ok   textflik: ingen bild');

// 8. Without a notes folder an untitled tab has nowhere to keep images: nothing happens, a toast says why.
const userData2 = path.join(tmp, 'userdata2');
fs.mkdirSync(path.join(userData2, 'drafts'), { recursive: true });
fs.writeFileSync(path.join(userData2, 'drafts', 'd1.json'), JSON.stringify({ text: 'Bara text.\n', kind: 'md', savedAt: Date.now() }));
fs.writeFileSync(path.join(userData2, 'settings.json'), JSON.stringify({ language: 'sv', mode: 'light', checkUpdates: false, notesBannerDismissed: true, windowBounds: { width: 1000, height: 700 } }));
const app2 = await electron.launch({ args: [root], env: { ...process.env, NOTERA_USER_DATA: userData2 } });
const win2 = await app2.firstWindow();
await win2.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
await app2.evaluate(async (_e, b64) => { const { clipboard, ClipboardItem } = process.mainModule.require('electron'); await clipboard.write([new ClipboardItem({ 'image/png': new Blob([Buffer.from(b64, 'base64')], { type: 'image/png' }) })]); }, png(20, 20, [1, 2, 3]).toString('base64'));
await win2.click('.cm-content');
await win2.keyboard.press('Control+V');
await win2.waitForFunction(() => { const el = document.querySelector('#notes-toast'); return el && !el.hidden && el.textContent.includes('Spara texten till en fil först'); });
assert.equal(await win2.evaluate(() => window.__notera.view.state.doc.toString()), 'Bara text.\n');
await app2.close();
console.log('ok   utan anteckningsmapp: inget händer, en toast förklarar');
console.log('imageinsert OK; screenshots in ' + shots);
