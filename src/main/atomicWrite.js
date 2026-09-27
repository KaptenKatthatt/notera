'use strict';
// Write a file so that a crash or power cut leaves either the old contents or the new ones, never
// a truncated mix: write a temporary file next to the target, flush it to disk, then rename it
// over the target. A rename within one folder replaces the file in one step on NTFS and on POSIX.
//
// The temporary name starts with a dot and ends in .tmp, so the notes list (.md/.markdown/.txt)
// and the drafts list (.json) never pick it up, even if a crash leaves one behind.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

let seq = 0;
const tmpNameFor = (target) => path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}-${++seq}.tmp`);

// Windows: a virus scanner or the search indexer can hold the target open for a moment, and the
// rename then fails with EPERM/EBUSY/EACCES. Retry briefly before falling back to a plain write.
const RENAME_RETRY_MS = [20, 60, 150];
const BUSY = new Set(['EPERM', 'EBUSY', 'EACCES']);

/** A symlink is written through, not replaced by a regular file. */
async function resolveTarget(p) {
  try { return await fsp.realpath(p); } catch { return p; }
}

async function writeFileAtomic(p, data, { encoding = 'utf8' } = {}) {
  const target = await resolveTarget(p);
  const mode = await fsp.stat(target).then((s) => s.mode, () => undefined);
  const tmp = tmpNameFor(target);
  const fh = await fsp.open(tmp, 'wx', mode);
  try {
    await fh.writeFile(data, typeof data === 'string' ? encoding : undefined);
    await fh.sync();
  } catch (err) {
    await fh.close().catch(() => {});
    await fsp.unlink(tmp).catch(() => {});
    throw err;
  }
  await fh.close();
  for (let attempt = 0; ; attempt++) {
    try { await fsp.rename(tmp, target); return; } catch (err) {
      if (BUSY.has(err.code) && attempt < RENAME_RETRY_MS.length) {
        await new Promise((r) => setTimeout(r, RENAME_RETRY_MS[attempt]));
        continue;
      }
      await fsp.unlink(tmp).catch(() => {});
      if (!BUSY.has(err.code)) throw err;
      // Still locked: a plain write keeps the save working. A read-only target fails here too.
      await fsp.writeFile(target, data, typeof data === 'string' ? encoding : undefined);
      return;
    }
  }
}

/** Synchronous variant for the settings file, which is saved from synchronous code. */
function writeFileAtomicSync(p, data, { encoding = 'utf8' } = {}) {
  let target = p;
  try { target = fs.realpathSync(p); } catch { /* new file */ }
  const tmp = tmpNameFor(target);
  const fd = fs.openSync(tmp, 'wx');
  try {
    fs.writeFileSync(fd, data, typeof data === 'string' ? encoding : undefined);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
  } catch (err) {
    try { fs.closeSync(fd); } catch { /* already closed */ }
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    throw err;
  }
  try { fs.renameSync(tmp, target); } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    if (!BUSY.has(err.code)) throw err;
    fs.writeFileSync(target, data, typeof data === 'string' ? encoding : undefined);
  }
}

module.exports = { writeFileAtomic, writeFileAtomicSync };
