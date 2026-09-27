const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeFileAtomic, writeFileAtomicSync } = require('../../src/main/atomicWrite');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'notera-atomic-'));

test('writes a new file and replaces an existing one, leaving no temporary file', async () => {
  const dir = tmpDir();
  const p = path.join(dir, 'note.md');
  await writeFileAtomic(p, 'first');
  assert.equal(fs.readFileSync(p, 'utf8'), 'first');
  await writeFileAtomic(p, Buffer.from('second'));
  assert.equal(fs.readFileSync(p, 'utf8'), 'second');
  writeFileAtomicSync(p, 'third');
  assert.equal(fs.readFileSync(p, 'utf8'), 'third');
  assert.deepEqual(fs.readdirSync(dir), ['note.md']);
});

test('a failed write leaves the old contents and cleans up', async () => {
  const dir = tmpDir();
  const p = path.join(dir, 'note.md');
  fs.writeFileSync(p, 'keep me');
  // A directory where the file should be makes the final rename fail.
  const blocked = path.join(dir, 'blocked');
  fs.mkdirSync(blocked);
  fs.writeFileSync(path.join(blocked, 'x'), '');
  await assert.rejects(writeFileAtomic(blocked, 'new'));
  assert.throws(() => writeFileAtomicSync(blocked, 'new'));
  assert.equal(fs.readFileSync(p, 'utf8'), 'keep me');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['blocked', 'note.md']);
});

test('writes through a symlink instead of replacing it', { skip: process.platform === 'win32' }, async () => {
  const dir = tmpDir();
  const real = path.join(dir, 'real.md');
  const link = path.join(dir, 'link.md');
  fs.writeFileSync(real, 'old');
  fs.symlinkSync(real, link);
  await writeFileAtomic(link, 'new');
  assert.ok(fs.lstatSync(link).isSymbolicLink());
  assert.equal(fs.readFileSync(real, 'utf8'), 'new');
});
