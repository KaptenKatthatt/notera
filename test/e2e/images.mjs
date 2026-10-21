// Images in notes: a relative link shows the image under its line in the Write view (not on the
// cursor's line), in the preview, and at full size on a click; a missing file shows a dashed box;
// files outside the notes folder are not served.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'test/e2e/shots');
fs.mkdirSync(shots, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-img-'));
const userData = path.join(tmp, 'userdata');
const notes = path.join(tmp, 'Notera');
fs.mkdirSync(userData, { recursive: true });

/** A w×h PNG in one colour, written here so the test needs no binary fixture. */
export function png(w, h, [r, g, b]) {
  const crc = (buf) => { let c = ~0; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (~c) >>> 0; };
  const chunk = (type, data) => {
    const td = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(td.length + 8);
    out.writeUInt32BE(data.length, 0); td.copy(out, 4); out.writeUInt32BE(crc(td), td.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const put = (rel, data) => { const p = path.join(notes, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); return p; };
put('Enlantis/bilder/login-error-1.png', png(320, 200, [200, 40, 40]));
put('Enlantis/bilder/stor.png', png(1800, 1200, [40, 120, 200]));
fs.writeFileSync(path.join(tmp, 'utanför.png'), png(50, 50, [0, 0, 0]));
const note = put('Enlantis/2026-10-21 Login error.md',
  '# Login error\nProjekt: Enlantis · Skapad: 2026-10-21 10:00\n\nFelet syns i bild 1.\n\n![Bild 1](bilder/login-error-1.png)\n\nOch i stor:\n\n![Bild 2](bilder/stor.png)\n\n![Borta](bilder/saknas.png)\n\n```\n![Kod](bilder/login-error-1.png)\n```\n\n![Utanför](../../utanför.png)\n');
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
const shot = (name) => win.screenshot({ path: path.join(shots, name + '.png') });
const widgets = () => win.evaluate(() => Array.from(document.querySelectorAll('#editor .cm-image')).map((w) => {
  const img = w.querySelector('img'), miss = w.querySelector('.img-missing');
  return img ? { alt: img.alt, loaded: img.complete && img.naturalWidth > 0, w: img.naturalWidth, shown: img.getBoundingClientRect().width } : { missing: miss ? miss.textContent : null };
}));

// 1. Write view: the two images show under their lines; the missing one and the one outside the
// notes folder show as missing; the one inside the code block is text.
await win.waitForFunction(() => document.querySelectorAll('#editor .cm-image img').length >= 2 && Array.from(document.querySelectorAll('#editor .cm-image img')).every((i) => i.complete));
await win.waitForFunction(() => document.querySelectorAll('#editor .img-missing').length === 2);
const w = await widgets();
assert.equal(w.length, 4, JSON.stringify(w));
assert.deepEqual(w.map((x) => x.alt || x.missing), ['Bild 1', 'Bild 2', 'Borta · saknas.png', 'Utanför · utanför.png']);
assert.ok(w[0].loaded && w[0].w === 320 && Math.round(w[0].shown) === 320, 'a small image at its own size: ' + JSON.stringify(w[0]));
assert.ok(w[1].loaded && w[1].w === 1800 && w[1].shown < 1000, 'a wide image scaled to the column: ' + JSON.stringify(w[1]));
const column = await win.evaluate(() => { const l = document.querySelector('#editor .cm-line'); const cs = getComputedStyle(l); return l.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); });
assert.ok(Math.abs(w[1].shown - column) < 2, `scaled to the text column (${w[1].shown} vs ${column})`);
const left = await win.evaluate(() => ({ text: document.querySelector('#editor .cm-image-line').getBoundingClientRect().left + parseFloat(getComputedStyle(document.querySelector('#editor .cm-image-line')).paddingLeft), img: document.querySelector('#editor .cm-image img').getBoundingClientRect().left }));
assert.ok(Math.abs(left.text - left.img) < 2, `the image lines up with the text (${JSON.stringify(left)})`);
// The image syntax is hidden: the line reads as its alt text.
const lineText = await win.evaluate(() => Array.from(document.querySelectorAll('#editor .cm-line')).map((l) => l.innerText).find((x) => x.includes('Bild 1')));
assert.equal(lineText.trim(), 'Bild 1', `markers hidden: ${JSON.stringify(lineText)}`);
await shot('images-write');
console.log('ok   skrivläge: bilder under sina rader, saknade som streckad ruta');

// 2. The cursor on the image line: the text comes back and the widget goes away.
await win.click('.cm-content');
await win.evaluate(() => {
  const v = window.__notera.view;
  const pos = v.state.doc.toString().indexOf('![Bild 1]');
  v.dispatch({ selection: { anchor: pos + 3 } });
});
await win.waitForFunction(() => document.querySelectorAll('#editor .cm-image img').length === 1);
const onLine = await win.evaluate(() => Array.from(document.querySelectorAll('#editor .cm-line')).map((l) => l.innerText).find((x) => x.includes('Bild 1')));
assert.equal(onLine.trim(), '![Bild 1](bilder/login-error-1.png)');
await win.keyboard.press('ArrowUp');
await win.waitForFunction(() => document.querySelectorAll('#editor .cm-image img').length === 2);
console.log('ok   markören på raden visar texten, lämnar den visar bilden');

// 3. Preview: the images render over notera-file:, the missing one is a box, click opens the overlay.
await win.evaluate(() => window.__notera.handleAction('viewSplit'));
await win.waitForFunction(() => document.querySelectorAll('#preview img').length >= 2 && Array.from(document.querySelectorAll('#preview img')).every((i) => i.complete));
await win.waitForFunction(() => document.querySelectorAll('#preview .img-missing').length === 2);
const pv = await win.evaluate(() => Array.from(document.querySelectorAll('#preview img')).map((i) => ({ src: i.getAttribute('src'), w: i.naturalWidth, alt: i.alt })));
assert.equal(pv.length, 2, JSON.stringify(pv));
assert.ok(pv[0].src.startsWith('notera-file://img/'), pv[0].src);
assert.equal(pv[0].w, 320);
assert.equal(pv[1].w, 1800);
// Typing keeps the images on screen (no reload): the element is the same one.
await win.evaluate(() => { document.querySelector('#preview img').dataset.mark = 'same'; });
await win.evaluate(() => { const v = window.__notera.view; const t = v.state.doc.toString(); v.dispatch({ selection: { anchor: t.indexOf('bild 1.') + 7 } }); });
await win.keyboard.type(' x');
await win.waitForFunction(() => document.querySelector('#preview').textContent.includes('bild 1. x'));
assert.equal(await win.evaluate(() => document.querySelector('#preview img').dataset.mark), 'same', 'the image element survived a re-render');
await shot('images-split');
await win.click('#preview img');
await win.waitForSelector('#lightbox:not([hidden])');
const lb = await win.evaluate(() => { const i = document.querySelector('#lightbox-img'); return { w: i.getBoundingClientRect().width, alt: i.alt }; });
assert.equal(Math.round(lb.w), 320);
assert.equal(lb.alt, 'Bild 1');
await shot('images-lightbox');
await win.keyboard.press('Escape');
await win.waitForSelector('#lightbox', { state: 'hidden' });
// The big one at its natural size, scrollable.
await win.click('#preview img >> nth=1');
await win.waitForFunction(() => Math.round(document.querySelector('#lightbox-img').getBoundingClientRect().width) === 1800);
await win.click('#lightbox-close');
await win.waitForSelector('#lightbox', { state: 'hidden' });
console.log('ok   läs: bilder via notera-file:, klick visar full storlek, Esc stänger');

// 4. A click on the editor's image opens the overlay too.
await win.evaluate(() => window.__notera.handleAction('viewEditor'));
await win.waitForFunction(() => document.querySelectorAll('#editor .cm-image img').length === 2);
await win.click('#editor .cm-image img');
await win.waitForSelector('#lightbox:not([hidden])');
await win.keyboard.press('Escape');
await win.waitForSelector('#lightbox', { state: 'hidden' });
assert.equal(await win.evaluate(() => document.activeElement && document.activeElement.closest('.cm-editor') !== null), true, 'focus back in the editor');
console.log('ok   klick i skrivläget öppnar också');

// 5. The server refuses the file outside the notes folder outright.
const status = await win.evaluate(async (p) => {
  const r = await fetch('notera-file://img/' + encodeURIComponent(p)).catch((e) => ({ status: String(e) }));
  return r.status;
}, path.join(tmp, 'utanför.png'));
assert.notEqual(status, 200, `outside file not served: ${status}`);
console.log('ok   filer utanför anteckningsmappen serveras inte');

// 6. Hide Markdown markers off: the text only, no image under the line.
await win.evaluate(() => window.__notera.handleAction('hideMarkers'));
await win.waitForFunction(() => document.querySelectorAll('#editor .cm-image').length === 0);
await win.evaluate(() => window.__notera.handleAction('hideMarkers'));
await win.waitForFunction(() => document.querySelectorAll('#editor .cm-image').length === 4);
console.log('ok   dolda markörer av: bara text');

assert.deepEqual(errors, [], errors.join('\n'));
await app.close();
console.log('images OK; screenshots in ' + shots);
