// Right-click on an image: the menu has Copy image, which puts the picture itself on the clipboard.
// In the Write view, in the preview and in the full-size overlay; on text the edit menu stays as it was.
// The native menu cannot be clicked from here, so Menu#popup is swapped for a recorder and the
// item's click is called as a click on it would.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { png } from './png.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-imgmenu-'));
const userData = path.join(tmp, 'userdata');
const notes = path.join(tmp, 'Notera');
fs.mkdirSync(userData, { recursive: true });
const put = (rel, data) => { const p = path.join(notes, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); return p; };
put('Enlantis/bilder/login-error-1.png', png(320, 200, [200, 40, 40]));
put('Enlantis/bilder/liten.png', png(90, 60, [40, 120, 200]));
const note = put('Enlantis/2026-10-21 Login error.md',
  '# Login error\nProjekt: Enlantis · Skapad: 2026-10-21 10:00\n\nFelet:\n\n![Bild 1](bilder/login-error-1.png)\n\n![Bild 2](bilder/liten.png)\n\nSlut.\n');
fs.mkdirSync(path.join(notes, 'Osorterat'), { recursive: true });
fs.writeFileSync(path.join(notes, '.notera.json'), JSON.stringify({ version: 1, inbox: 'Osorterat', archive: 'Arkiv', projects: ['Enlantis'], archivedProjects: [], seeded: true }));
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({
  notesRoot: notes, sidebarOpen: true, language: 'sv', mode: 'light', checkUpdates: false, viewMode: 'editor', windowBounds: { width: 1200, height: 800 }
}));

const app = await electron.launch({ args: [root, note], env: { ...process.env, NOTERA_USER_DATA: userData } });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
await win.waitForFunction((p) => window.__notera && window.__notera.active && window.__notera.active.path === p, note);

await app.evaluate(({ Menu }) => {
  globalThis.__menus = [];
  Menu.prototype.popup = function () { globalThis.__menus.push(this); };
});
/** Right-click `sel` and return the labels of the menu that opened. */
const rightClick = async (sel) => {
  await app.evaluate(async ({ clipboard }) => { globalThis.__menus = []; await clipboard.clear(); });
  await win.click(sel, { button: 'right' });
  for (let i = 0; i < 50; i++) {
    const labels = await app.evaluate(() => (globalThis.__menus.length ? globalThis.__menus.at(-1).items.map((m) => m.type === 'separator' ? '—' : m.label) : null));
    if (labels) return labels;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('no context menu for ' + sel);
};
/** Choose "Kopiera bild" in the menu that opened and return the clipboard image's size. */
const copyImage = async () => {
  await app.evaluate(() => globalThis.__menus.at(-1).items.find((m) => m.label === 'Kopiera bild').click());
  for (let i = 0; i < 50; i++) {
    const size = await app.evaluate(async ({ clipboard, nativeImage }) => {
      const item = (await clipboard.read()).find((it) => it.types.includes('image/png'));
      if (!item) return null;
      const blob = /** @type {Blob} */ (await item.getType('image/png'));
      return nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer())).getSize();
    });
    if (size) return size;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('no image on the clipboard');
};

// 1. The Write view (the image is a widget, not editable text: Copy image alone).
await win.waitForFunction(() => Array.from(document.querySelectorAll('#editor .cm-image img')).every((i) => i.complete && i.naturalWidth > 0) && document.querySelectorAll('#editor .cm-image img').length === 2);
let labels = await rightClick('#editor .cm-image img >> nth=0');
assert.deepEqual(labels, ['Kopiera bild']);
assert.deepEqual(await copyImage(), { width: 320, height: 200 });
console.log('ok   skrivvyn: Kopiera bild lägger bilden på urklipp');

// Text in the editor: the edit menu, no Copy image.
labels = await rightClick('#editor .cm-line >> nth=0');
assert.ok(!labels.includes('Kopiera bild') && labels.includes('Klistra in'), labels.join(', '));
console.log('ok   högerklick på text: inget Kopiera bild');

// 2. The preview.
await win.evaluate(() => window.__notera.handleAction('viewSplit'));
await win.waitForFunction(() => document.querySelectorAll('#preview img').length === 2 && Array.from(document.querySelectorAll('#preview img')).every((i) => i.complete && i.naturalWidth > 0));
labels = await rightClick('#preview img >> nth=1');
assert.deepEqual(labels, ['Kopiera bild']);
assert.deepEqual(await copyImage(), { width: 90, height: 60 });
console.log('ok   förhandsvisningen: Kopiera bild');

// 3. The full-size overlay.
await win.click('#preview img >> nth=0');
await win.waitForSelector('#lightbox:not([hidden])');
await win.waitForFunction(() => { const i = document.querySelector('#lightbox-img'); return i.complete && i.naturalWidth > 0; });
labels = await rightClick('#lightbox-img');
assert.deepEqual(labels, ['Kopiera bild']);
assert.deepEqual(await copyImage(), { width: 320, height: 200 });
console.log('ok   helskärmsbilden: Kopiera bild');

assert.deepEqual(errors, [], errors.join('\n'));
await app.close();
console.log('imagecopymenu OK');
