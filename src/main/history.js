'use strict';
// Version history: earlier texts of every note, so nothing written is ever lost to a click, a bug
// or a bad paste. Each version is a plain text file named after the time it was kept (the note
// read like that until then), readable in any editor even when Notera does not start:
//
//   <notes folder>/.notera-history/Enlantis/2026-09-18 PBI-1234.md/2026-10-09 14-32-05.md
//   <user data>/history/<hash of the path>/2026-10-09 14-32-05.txt   (files outside the notes folder)
//
// Inside the notes folder the history mirrors the note's own path, so it is backed up and synced
// with the notes, and a moved or renamed note (or project) takes its history along by moving one
// folder. The dot keeps it out of the sidebar.
//
// When: before a save replaces the text on disk, the old text becomes a version if the last one
// was taken five minutes ago or more, or at once when the save removes more than half of it. Also
// when the note is left, before it is deleted, and before a version is restored. A text equal to
// the newest version is not stored again.
//
// How long: everything from the last day, the newest per hour for a week, the newest per day for
// 30 days. History of deleted notes is kept the same 30 days.
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const files = require('./files');
const { writeFileAtomic } = require('./atomicWrite');

const HISTORY_DIR = '.notera-history';
const INTERVAL_MS = 5 * 60 * 1000;
const SHRINK_RATIO = 0.5;      // a save that keeps less than half of the text is a big deletion
const SHRINK_MIN_CHARS = 40;   // ...unless the text was this short anyway
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const VERSION_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})-(\d{2})-(\d{2})(?: \((\d+)\))?\.(md|txt)$/;

const pad = (n) => String(n).padStart(2, '0');
function stampOf(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
/** The time a version file's name gives, or null when the name is no version. */
function timeOf(name) {
  const m = VERSION_RE.exec(name);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() + (m[7] ? +m[7] : 0);
}
const isInside = (parent, p) => {
  const rel = path.relative(parent, p);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
};

/** Versions in a folder, newest first. */
async function versionsIn(dir) {
  let names;
  try { names = await fsp.readdir(dir); } catch { return []; }
  return names
    .map((name) => ({ name, time: timeOf(name) }))
    .filter((v) => v.time !== null)
    .sort((a, b) => b.time - a.time || b.name.localeCompare(a.name));
}

/** Which versions retention keeps, from a newest-first list. */
function keepSet(versions, now) {
  const keep = new Set();
  const hours = new Set();
  const days = new Set();
  for (const v of versions) {
    const age = now - v.time;
    if (age < DAY) { keep.add(v.name); continue; }
    if (age < 7 * DAY) {
      const h = Math.floor(v.time / HOUR);
      if (!hours.has(h)) { hours.add(h); keep.add(v.name); }
      continue;
    }
    if (age < 30 * DAY) {
      const d = stampOf(v.time).slice(0, 10);
      if (!days.has(d)) { days.add(d); keep.add(v.name); }
    }
  }
  return keep;
}

/** Move a folder, merging into one that is already there (a note moved onto an old name). */
async function mergeMove(from, to) {
  await fsp.mkdir(path.dirname(to), { recursive: true });
  try { await fsp.rename(from, to); return; } catch (err) {
    if (err.code === 'ENOENT') return;
    if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EXDEV', 'EACCES'].includes(err.code)) throw err;
  }
  for (const e of await fsp.readdir(from, { withFileTypes: true })) {
    const src = path.join(from, e.name);
    let dst = path.join(to, e.name);
    if (e.isDirectory()) { await mergeMove(src, dst); continue; }
    await fsp.mkdir(to, { recursive: true });
    for (let n = 1; await fsp.access(dst).then(() => true, () => false); n++) {
      dst = path.join(to, e.name.replace(/(\.\w+)$/, ` (m${n})$1`));
    }
    await fsp.copyFile(src, dst);
    await fsp.unlink(src);
  }
  await fsp.rm(from, { recursive: true, force: true });
}

/**
 * @param {{ getRoot: () => string | null | undefined, userDataDir: string, now?: () => number }} opts
 */
function createHistory({ getRoot, userDataDir, now = Date.now }) {
  const looseRoot = path.join(userDataDir, 'history');
  const lastTaken = new Map(); // history folder -> when a version was last stored or found
  let queue = Promise.resolve();
  /** One history operation at a time, so a move never races a snapshot of the same note. */
  function run(fn) {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  }

  function notesHistoryRoot() {
    const root = getRoot();
    return root ? path.join(root, HISTORY_DIR) : null;
  }

  /** The history folder of a file, or null for a file inside a history folder. */
  function dirFor(p) {
    const abs = path.resolve(p);
    const root = getRoot();
    const hroot = notesHistoryRoot();
    if (hroot && (abs === hroot || isInside(hroot, abs))) return null;
    if (isInside(looseRoot, abs)) return null;
    if (root && isInside(root, abs)) return path.join(hroot, path.relative(root, abs));
    const key = process.platform === 'win32' ? abs.toLowerCase() : abs;
    return path.join(looseRoot, crypto.createHash('sha1').update(key).digest('hex').slice(0, 16));
  }

  async function readCurrent(p) {
    try { return files.readBuffer(await fsp.readFile(p), 'LF').text; } catch { return null; }
  }

  /** Store text as a version of p (unless the newest version holds the same). True when stored. */
  async function store(p, text) {
    const dir = dirFor(p);
    if (!dir || !text || !text.trim()) return false;
    const list = await versionsIn(dir);
    if (list.length) {
      const newest = await fsp.readFile(path.join(dir, list[0].name), 'utf8').catch(() => null);
      if (newest === text) { lastTaken.set(dir, now()); return false; }
    }
    const ext = files.kindForPath(p) === 'md' ? '.md' : '.txt';
    const t = now();
    let name = stampOf(t) + ext;
    for (let n = 2; list.some((v) => v.name === name); n++) name = `${stampOf(t)} (${n})${ext}`;
    await fsp.mkdir(dir, { recursive: true });
    await writeFileAtomic(path.join(dir, name), text);
    lastTaken.set(dir, now());
    await prune(dir);
    return true;
  }

  async function prune(dir) {
    const list = await versionsIn(dir);
    const keep = keepSet(list, now());
    for (const v of list) if (!keep.has(v.name)) await fsp.unlink(path.join(dir, v.name)).catch(() => {});
    if (!keep.size) await removeEmpty(dir);
  }

  /** Remove a folder left empty, and its parents up to the history root. */
  async function removeEmpty(dir) {
    const stops = [notesHistoryRoot(), looseRoot].filter(Boolean);
    let d = dir;
    while (d && !stops.includes(d) && stops.some((s) => isInside(s, d))) {
      try { await fsp.rmdir(d); } catch { return; }
      d = path.dirname(d);
    }
  }

  /** When the last version of a folder was stored: this session's memory, else the newest file. */
  async function lastTime(dir) {
    if (lastTaken.has(dir)) return lastTaken.get(dir);
    const list = await versionsIn(dir);
    const t = list.length ? list[0].time : 0;
    lastTaken.set(dir, t);
    return t;
  }

  return {
    HISTORY_DIR,
    dirFor,

    /** Called before p is overwritten with newText: keep the text on disk when it is time to. */
    beforeWrite(p, newText) {
      return run(async () => {
        const dir = dirFor(p);
        if (!dir) return false;
        const cur = await readCurrent(p);
        if (cur === null || cur === newText || !cur.trim()) return false;
        const shrinks = cur.length >= SHRINK_MIN_CHARS && String(newText).length < cur.length * SHRINK_RATIO;
        if (!shrinks && now() - (await lastTime(dir)) < INTERVAL_MS) return false;
        return store(p, cur);
      });
    },

    /** Keep the text on disk now (a note left, about to be deleted), or the text given (a restore). */
    snapshot(p, text) {
      return run(async () => {
        const t = typeof text === 'string' ? text : await readCurrent(p);
        return t === null ? false : store(p, t);
      });
    },

    /** Every file under p (a note or a whole project folder) is kept before it goes. */
    snapshotTree(p) {
      return run(async () => {
        const walk = async (q) => {
          let st;
          try { st = await fsp.stat(q); } catch { return; }
          if (st.isDirectory()) { for (const n of await fsp.readdir(q)) await walk(path.join(q, n)); return; }
          if (!/\.(md|markdown|txt)$/i.test(q)) return;
          const cur = await readCurrent(q);
          if (cur !== null) await store(q, cur);
        };
        await walk(p);
      });
    },

    /** A note or folder moved: its history goes along. */
    follow(from, to) {
      return run(async () => {
        const a = dirFor(from);
        const b = dirFor(to);
        if (!a || !b || a === b) return;
        await mergeMove(a, b);
        lastTaken.delete(a);
        await removeEmpty(path.dirname(a));
      });
    },

    /** The versions of p, newest first: { id, time, chars }. */
    async list(p) {
      const dir = dirFor(p);
      if (!dir) return [];
      const out = [];
      for (const v of await versionsIn(dir)) {
        const text = await fsp.readFile(path.join(dir, v.name), 'utf8').catch(() => null);
        if (text !== null) out.push({ id: v.name, time: v.time, chars: text.length });
      }
      return out;
    },

    /** The text of one version, or null. The id must be a version name in p's history folder. */
    async read(p, id) {
      const dir = dirFor(p);
      if (!dir || typeof id !== 'string' || timeOf(id) === null || path.basename(id) !== id) return null;
      return fsp.readFile(path.join(dir, id), 'utf8').catch(() => null);
    },

    /** Apply retention to every history folder (deleted notes' history too). */
    pruneAll() {
      return run(async () => {
        const walk = async (dir) => {
          let ents;
          try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
          for (const e of ents) if (e.isDirectory()) await walk(path.join(dir, e.name));
          if (ents.some((e) => e.isFile() && timeOf(e.name) !== null)) await prune(dir);
        };
        for (const r of [notesHistoryRoot(), looseRoot]) if (r) await walk(r);
      });
    }
  };
}

module.exports = { createHistory, keepSet, timeOf, stampOf, HISTORY_DIR, INTERVAL_MS };
