const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createImageServer } = require('../../src/main/images');
const { imageUrl } = require('../../src/shared/imageLinks');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

function setup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-img-'));
  const notes = path.join(tmp, 'Notera');
  fs.mkdirSync(path.join(notes, 'Enlantis', 'bilder'), { recursive: true });
  fs.writeFileSync(path.join(notes, 'Enlantis', 'bilder', 'a.png'), PNG);
  fs.writeFileSync(path.join(notes, 'Enlantis', 'secret.md'), '# hemligt');
  fs.mkdirSync(path.join(tmp, 'loose', 'bilder'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'loose', 'bilder', 'b.png'), PNG);
  fs.writeFileSync(path.join(tmp, 'outside.png'), PNG);
  let root = notes;
  const server = createImageServer({ roots: () => [root] });
  const get = (url, headers = {}) => server.serve(new Request(url, { headers }));
  return { tmp, notes, server, get, setRoot: (r) => { root = r; } };
}

test('image server: files under the notes folder, with ETag and 304', async () => {
  const { notes, get } = setup();
  const file = path.join(notes, 'Enlantis', 'bilder', 'a.png');
  const r = await get(imageUrl(file));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.compare(Buffer.from(await r.arrayBuffer()), PNG), 0);
  const etag = r.headers.get('etag');
  assert.ok(etag);
  const again = await get(imageUrl(file), { 'if-none-match': etag });
  assert.equal(again.status, 304);
  fs.writeFileSync(file, Buffer.concat([PNG, Buffer.from([0])]));
  const changed = await get(imageUrl(file), { 'if-none-match': etag });
  assert.equal(changed.status, 200, 'a changed file is sent again');
});

test('image server: nothing outside the allowed folders, nothing but images', async () => {
  const { tmp, notes, server, get, setRoot } = setup();
  assert.equal((await get(imageUrl(path.join(tmp, 'outside.png')))).status, 404, 'outside the notes folder');
  assert.equal((await get(imageUrl(path.join(notes, 'Enlantis', 'secret.md')))).status, 404, 'not an image');
  assert.equal((await get(imageUrl(path.join(notes, 'Enlantis', 'bilder', '..', '..', '..', 'outside.png')))).status, 404, 'climbing out');
  assert.equal((await get(imageUrl(path.join(notes, 'Enlantis', 'bilder', 'missing.png')))).status, 404);
  assert.equal((await get('notera-file://img/relative.png')).status, 404, 'relative');
  assert.equal((await get('notera-file://other/' + encodeURIComponent(path.join(notes, 'Enlantis', 'bilder', 'a.png')))).status, 404, 'wrong host');
  assert.equal((await get(imageUrl(path.join(notes, 'Enlantis', 'bilder')))).status, 404, 'a folder');
  // A file opened from outside the notes folder: images next to it may be shown.
  const loose = path.join(tmp, 'loose', 'bilder', 'b.png');
  assert.equal((await get(imageUrl(loose))).status, 404);
  server.allow(path.join(tmp, 'loose', 'note.md'));
  assert.equal((await get(imageUrl(loose))).status, 200);
  assert.equal((await get(imageUrl(path.join(tmp, 'outside.png')))).status, 404, 'allowing one folder opens nothing else');
  // No notes folder at all: only opened files' folders.
  setRoot(null);
  assert.equal((await get(imageUrl(path.join(notes, 'Enlantis', 'bilder', 'a.png')))).status, 404);
  assert.equal((await get(imageUrl(loose))).status, 200);
});
