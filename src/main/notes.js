'use strict';
// The notes folder: one subfolder per project, an inbox folder, an archive folder and a small
// index file (.notera.json) that remembers what the file system cannot: the manual order of
// projects and notes, pinned notes, collapsed projects and which archive folders hold a whole
// project. The files are the truth; the index is only a hint and is repaired on the fly, so
// notes added or removed in Explorer simply show up or disappear.
//
//   <root>/
//     .notera.json
//     Osorterat/2026-09-25 Call the vet.md
//     Enlantis/2026-09-18 PBI-1234 Login error.md
//     Arkiv/Enlantis/2026-06-02 Old deploy list.md
//
// Every mutating operation runs through a queue (no two file operations interleave) and, where
// it can be undone, records a journal: file moves, rewritten files, created and removed folders
// and the index as it was. undo(id) replays that journal backwards.
const fsp = require('fs/promises');
const path = require('path');
const files = require('./files');
const H = require('../shared/noteHeader');

const INDEX_FILE = '.notera.json';
const NOTE_EXT = /\.(md|markdown|txt)$/i;
const FOLDER_NAMES = { sv: { inbox: 'Osorterat', archive: 'Arkiv' }, en: { inbox: 'Unsorted', archive: 'Archive' } };
const MAX_UNDO = 30;

const lower = (s) => String(s).toLowerCase();
const has = (list, name) => list.some((x) => lower(x) === lower(name));
const without = (list, name) => list.filter((x) => lower(x) !== lower(name));
const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

async function exists(p) { try { await fsp.access(p); return true; } catch { return false; } }

async function moveFile(from, to) {
  if (await exists(to)) throw new Error(`Target exists: ${to}`);
  await fsp.mkdir(path.dirname(to), { recursive: true });
  try { await fsp.rename(from, to); } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    // Different drive: copy, then remove the original. If the original cannot be removed, the
    // copy goes again, so a failed move never leaves the note in two places.
    await fsp.cp(from, to, { recursive: true, errorOnExist: true, force: false });
    try { await fsp.rm(from, { recursive: true }); } catch (rmErr) {
      await fsp.rm(to, { recursive: true, force: true }).catch(() => {});
      throw rmErr;
    }
  }
}

function createNotesStore({ root, getLocale = () => 'en', trash, untitled = () => 'Untitled note', eol = 'CRLF' }) {
  const indexPath = path.join(root, INDEX_FILE);
  const journals = new Map();
  let journalSeq = 0;
  let queue = Promise.resolve();

  function run(fn) {
    const next = queue.then(fn, fn);
    queue = next.catch(() => {});
    return next;
  }

  // ---------- index ----------
  async function loadIndex() {
    let raw = {};
    try { raw = JSON.parse(await fsp.readFile(indexPath, 'utf8')); } catch { /* missing or broken: start over */ }
    const names = FOLDER_NAMES[getLocale()] || FOLDER_NAMES.en;
    const order = raw.order && typeof raw.order === 'object' ? raw.order : {};
    return {
      version: 1,
      inbox: typeof raw.inbox === 'string' && raw.inbox ? raw.inbox : names.inbox,
      archive: typeof raw.archive === 'string' && raw.archive ? raw.archive : names.archive,
      projects: arr(raw.projects),
      order: Object.fromEntries(Object.entries(order).map(([k, v]) => [k, arr(v)])),
      pinned: arr(raw.pinned),
      collapsed: arr(raw.collapsed),
      archivedProjects: arr(raw.archivedProjects)
    };
  }

  async function saveIndex(idx) {
    const tmp = indexPath + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(idx, null, 2) + '\n', 'utf8');
    await fsp.rename(tmp, indexPath);
  }

  async function ensure() {
    await fsp.mkdir(root, { recursive: true });
    const idx = await loadIndex();
    await fsp.mkdir(path.join(root, idx.inbox), { recursive: true });
    await fsp.mkdir(path.join(root, idx.archive), { recursive: true });
    if (!(await exists(indexPath))) await saveIndex(idx);
    return idx;
  }

  // ---------- paths ----------
  const dirOf = (folder) => path.join(root, folder);
  const archiveDirOf = (idx, folder) => path.join(root, idx.archive, folder);
  const pinKey = (folder, file) => `${folder}/${file}`;

  /** Where a path sits: an active note, an archived note, or null for anything else. */
  function locate(idx, p) {
    const rel = path.relative(root, p);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
    const parts = rel.split(path.sep);
    if (parts.length === 2 && lower(parts[0]) !== lower(idx.archive) && !parts[0].startsWith('.')) {
      return { folder: parts[0], file: parts[1], archived: false };
    }
    if (parts.length === 3 && lower(parts[0]) === lower(idx.archive)) return { folder: parts[1], file: parts[2], archived: true };
    return null;
  }

  async function listNotes(dir) {
    try {
      const ents = await fsp.readdir(dir, { withFileTypes: true });
      return ents.filter((e) => e.isFile() && NOTE_EXT.test(e.name)).map((e) => e.name);
    } catch { return []; }
  }

  async function projectDirs(idx) {
    let ents = [];
    try { ents = await fsp.readdir(root, { withFileTypes: true }); } catch { return []; }
    return ents
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && lower(e.name) !== lower(idx.inbox) && lower(e.name) !== lower(idx.archive))
      .map((e) => e.name);
  }

  async function orderedProjects(idx) {
    const dirs = await projectDirs(idx);
    const known = idx.projects.filter((n) => dirs.includes(n));
    const rest = dirs.filter((n) => !known.includes(n)).sort((a, b) => a.localeCompare(b));
    return [...known, ...rest];
  }

  /** File names in display order: files the index does not know yet (newest first), then the known order. */
  async function orderedFiles(idx, folder) {
    const dir = dirOf(folder);
    const names = await listNotes(dir);
    const known = (idx.order[folder] || []).filter((n) => names.includes(n));
    const unknown = names.filter((n) => !known.includes(n));
    const mtimes = new Map(await Promise.all(unknown.map(async (n) => [n, (await fsp.stat(path.join(dir, n))).mtimeMs])));
    unknown.sort((a, b) => mtimes.get(b) - mtimes.get(a));
    return [...unknown, ...known];
  }

  async function uniqueName(dir, base, ext, selfName = null) {
    let taken = [];
    try { taken = (await fsp.readdir(dir)).filter((n) => !selfName || lower(n) !== lower(selfName)); } catch { /* new folder */ }
    let name = `${base}${ext}`;
    for (let i = 2; has(taken, name); i++) name = `${base} (${i})${ext}`;
    return name;
  }

  async function readText(p) {
    const buf = await fsp.readFile(p);
    return { buf, ...files.readBuffer(buf, eol) };
  }

  async function noteEntry(idx, folder, dir, file, archived) {
    const p = path.join(dir, file);
    let title = '';
    let mtimeMs = 0;
    try {
      const [{ text }, st] = await Promise.all([readText(p), fsp.stat(p)]);
      title = H.titleOf(text);
      mtimeMs = st.mtimeMs;
    } catch { /* unreadable: fall back to the file name */ }
    return {
      file, path: p, title: title || file.replace(NOTE_EXT, ''), hasTitle: !!title, mtimeMs,
      pinned: !archived && idx.pinned.includes(pinKey(folder, file))
    };
  }

  // ---------- journal (undo) ----------
  function begin(idx) { return { idxBefore: JSON.stringify(idx), entries: [], moved: [] }; }
  function commit(j) {
    const id = ++journalSeq;
    journals.set(id, j);
    if (journals.size > MAX_UNDO) journals.delete(journals.keys().next().value);
    return id;
  }
  /** A file renamed outside a journal: pending undos follow it to its new name. */
  function retargetJournals(from, to) {
    for (const j of journals.values()) {
      for (const e of j.entries) {
        // Undo brings the file back under its new name, which is what its heading says now.
        if (e.t === 'move' && e.to === from) { e.to = to; e.from = path.join(path.dirname(e.from), path.basename(to)); }
        if (e.t === 'write' && e.path === from) e.path = to;
      }
    }
  }
  async function jMove(j, from, to) {
    await moveFile(from, to);
    j.entries.push({ t: 'move', from, to });
    j.moved.push({ from, to });
  }
  async function jMkdir(j, dir) {
    if (await exists(dir)) return;
    await fsp.mkdir(dir, { recursive: true });
    j.entries.push({ t: 'mkdir', dir });
  }
  async function jRmdirIfEmpty(j, dir) {
    try {
      if ((await fsp.readdir(dir)).length) return;
      await fsp.rmdir(dir);
      j.entries.push({ t: 'rmdir', dir });
    } catch { /* not there or not empty */ }
  }
  /** Rewrite the project in a note's header line, keeping encoding and line endings. */
  async function jSetProject(j, p, project, fallbackTitle) {
    const r = await readText(p);
    const old = H.parseMeta(r.text);
    const created = await fsp.stat(p).then((s) => H.formatDateTime(s.birthtimeMs ? new Date(s.birthtimeMs) : s.mtime), () => undefined);
    const next = H.setProject(r.text, project, { locale: getLocale(), created, fallbackTitle });
    if (next === r.text) return;
    const after = files.writeBuffer(next, r.encoding, r.eol);
    await fsp.writeFile(p, after);
    j.entries.push({ t: 'write', path: p, before: r.buf, after, oldProject: old ? old.project : null });
  }

  async function undo(id) {
    return run(async () => {
      const j = journals.get(id);
      if (!j) return { ok: false, moved: [] };
      journals.delete(id);
      let failed = false;
      const moved = [];
      for (const e of [...j.entries].reverse()) {
        try {
          if (e.t === 'move') { await moveFile(e.to, e.from); moved.push({ from: e.to, to: e.from }); }
          else if (e.t === 'mkdir') await fsp.rmdir(e.dir).catch(() => {});
          else if (e.t === 'rmdir') await fsp.mkdir(e.dir, { recursive: true });
          else if (e.t === 'write') {
            const cur = await fsp.readFile(e.path).catch(() => null);
            if (cur && cur.equals(e.after)) await fsp.writeFile(e.path, e.before);
            else if (cur && e.oldProject) {
              // Edited since: only put the old project back into the header, keep the edits.
              const r = files.readBuffer(cur, eol);
              await fsp.writeFile(e.path, files.writeBuffer(H.setProject(r.text, e.oldProject), r.encoding, r.eol));
            }
          }
        } catch { failed = true; /* a file changed or moved away since: it stays where it is */ }
      }
      // The old index only fits when every step went back; otherwise keep the current one.
      if (!failed) await saveIndex(JSON.parse(j.idxBefore));
      return { ok: !failed, moved };
    });
  }

  // ---------- index bookkeeping ----------
  function forgetFile(idx, folder, file) {
    if (idx.order[folder]) idx.order[folder] = idx.order[folder].filter((n) => n !== file);
    const wasPinned = idx.pinned.includes(pinKey(folder, file));
    idx.pinned = idx.pinned.filter((k) => k !== pinKey(folder, file));
    return wasPinned;
  }
  function placeFile(idx, folder, file, { before = null, after = false, pinned = false } = {}) {
    const list = (idx.order[folder] || []).filter((n) => n !== file);
    const at = before ? list.indexOf(before) : -1;
    if (at >= 0) list.splice(at + (after ? 1 : 0), 0, file); else list.unshift(file);
    idx.order[folder] = list;
    if (pinned && !idx.pinned.includes(pinKey(folder, file))) idx.pinned.push(pinKey(folder, file));
  }
  function forgetProject(idx, name) {
    idx.projects = without(idx.projects, name);
    delete idx.order[name];
    idx.pinned = idx.pinned.filter((k) => !k.startsWith(`${name}/`));
    idx.collapsed = without(idx.collapsed, name);
  }

  // ---------- reads ----------
  async function tree() {
    return run(async () => {
      const idx = await ensure();
      const folder = async (name) => {
        const dir = dirOf(name);
        const entries = await Promise.all((await orderedFiles(idx, name)).map((f) => noteEntry(idx, name, dir, f, false)));
        return [...entries.filter((n) => n.pinned), ...entries.filter((n) => !n.pinned)];
      };
      const inbox = { name: idx.inbox, inbox: true, collapsed: has(idx.collapsed, idx.inbox), notes: await folder(idx.inbox) };
      const projects = [];
      for (const name of await orderedProjects(idx)) projects.push({ name, collapsed: has(idx.collapsed, name), notes: await folder(name) });
      const archive = [];
      let archiveDirs = [];
      try {
        archiveDirs = (await fsp.readdir(path.join(root, idx.archive), { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
      } catch { /* no archive yet */ }
      archiveDirs.sort((a, b) => a.localeCompare(b));
      for (const name of archiveDirs) {
        const dir = archiveDirOf(idx, name);
        const names = (await listNotes(dir)).sort((a, b) => b.localeCompare(a));
        archive.push({ name, wholeProject: has(idx.archivedProjects, name), notes: await Promise.all(names.map((f) => noteEntry(idx, name, dir, f, true))) });
      }
      return {
        root, inboxName: idx.inbox, archiveName: idx.archive, inbox, projects,
        archive: archive.filter((g) => g.notes.length || g.wholeProject),
        archiveCount: archive.reduce((n, g) => n + g.notes.length, 0)
      };
    });
  }

  async function search(query, limit = 50) {
    const q = lower(String(query || '').trim());
    if (!q) return [];
    return run(async () => {
      const idx = await ensure();
      const sources = [{ folder: idx.inbox, dir: dirOf(idx.inbox), archived: false }];
      for (const name of await orderedProjects(idx)) sources.push({ folder: name, dir: dirOf(name), archived: false });
      try {
        for (const e of await fsp.readdir(path.join(root, idx.archive), { withFileTypes: true })) {
          if (e.isDirectory()) sources.push({ folder: e.name, dir: archiveDirOf(idx, e.name), archived: true });
        }
      } catch { /* no archive */ }
      const hits = [];
      for (const s of sources) {
        for (const file of await listNotes(s.dir)) {
          const p = path.join(s.dir, file);
          let text = '';
          try { text = (await readText(p)).text; } catch { continue; }
          const title = H.titleOf(text) || file.replace(NOTE_EXT, '');
          const inTitle = lower(title).includes(q);
          const body = text.split('\n').filter((l, i) => !(i === 0 && /^#\s/.test(l)) && !H.META_RE.test(l))
            .map((l) => l.replace(/^\s*(#{1,6}\s|[-*+]\s(\[[ xX]\]\s)?|\d+\.\s|>\s?)/, '')).join(' ').replace(/\s+/g, ' ').trim();
          const at = lower(body).indexOf(q);
          if (!inTitle && at < 0) continue;
          const snippet = at >= 0 ? (at > 40 ? '…' : '') + body.slice(Math.max(0, at - 40), at + 80) : body.slice(0, 120);
          hits.push({ path: p, file, title, project: s.folder, archived: s.archived, inTitle, snippet });
        }
      }
      hits.sort((a, b) => (a.archived - b.archived) || (b.inTitle - a.inTitle) || a.title.localeCompare(b.title));
      return hits.slice(0, limit);
    });
  }

  // ---------- notes ----------
  async function createNote(folder, { text } = {}) {
    return run(async () => {
      const idx = await ensure();
      const dir = dirOf(folder);
      if (!(await exists(dir))) throw new Error(`No such project: ${folder}`);
      const now = new Date();
      let body = H.newNoteText(getLocale(), folder, now);
      let title = '';
      if (typeof text === 'string') {
        // A draft moved into a project: keep its text, add the header.
        title = H.titleOf(text);
        body = H.setProject(text, folder, { locale: getLocale(), created: H.formatDateTime(now), fallbackTitle: '' });
      }
      const name = await uniqueName(dir, H.baseName(H.formatDate(now), title, untitled()), '.md');
      const p = path.join(dir, name);
      // Pin down the order the user sees before adding to it, so the new note lands on top.
      idx.order[folder] = await orderedFiles(idx, folder);
      await fsp.writeFile(p, files.writeBuffer(body, 'utf8', eol), { flag: 'wx' });
      placeFile(idx, folder, name);
      await saveIndex(idx);
      return { path: p, text: body };
    });
  }

  /** Rename an active note after its heading: "2026-09-25 Title.md". A no-op for anything else. */
  async function renameForTitle(p, title) {
    return run(async () => {
      const idx = await loadIndex();
      const loc = locate(idx, p);
      if (!loc || loc.archived || !(await exists(p))) return { path: p, moved: [] };
      const dir = path.dirname(p);
      const ext = path.extname(loc.file) || '.md';
      const needsText = !/^\d{4}-\d{2}-\d{2}/.test(loc.file);
      const text = needsText ? (await readText(p)).text : '';
      const base = H.baseName(H.datePrefixFor(loc.file, text), title, untitled());
      const name = await uniqueName(dir, base, ext, loc.file);
      if (name === loc.file) return { path: p, moved: [] };
      const to = path.join(dir, name);
      const list = await orderedFiles(idx, loc.folder);
      if (lower(name) === lower(loc.file)) {
        // Only the case changed: Windows needs a detour through a temporary name.
        const tmp = path.join(dir, `.${name}.renaming`);
        await fsp.rename(p, tmp);
        await fsp.rename(tmp, to);
      } else await moveFile(p, to);
      retargetJournals(p, to);
      // Same place in the list, same pin: only the name changes.
      const at = list.indexOf(loc.file);
      if (at >= 0) list[at] = name; else list.unshift(name);
      idx.order[loc.folder] = list;
      idx.pinned = idx.pinned.map((k) => (k === pinKey(loc.folder, loc.file) ? pinKey(loc.folder, name) : k));
      await saveIndex(idx);
      return { path: to, moved: [{ from: p, to }] };
    });
  }

  /**
   * Move a note (active, archived or outside the notes folder) into a project folder, rewriting
   * the project in its header. Within the same project this only changes the order.
   */
  async function moveNote(p, toFolder, { before = null, after = false, reorderOnly = false } = {}) {
    return run(async () => {
      const idx = await ensure();
      const loc = locate(idx, p);
      // A reorder whose note has meanwhile left the folder (another window moved it) does nothing.
      if (reorderOnly && (!loc || loc.archived || loc.folder !== toFolder)) return { path: p, moved: [], undoId: null };
      const destDir = dirOf(toFolder);
      if (!(await exists(destDir))) throw new Error(`No such project: ${toFolder}`);
      if (loc && !loc.archived && loc.folder === toFolder) {
        const list = await orderedFiles(idx, toFolder);
        idx.order[toFolder] = list;
        placeFile(idx, toFolder, loc.file, { before, after });
        await saveIndex(idx);
        return { path: p, moved: [], undoId: null };
      }
      const j = begin(idx);
      const file = path.basename(p);
      const ext = path.extname(file) || '.md';
      let name;
      if (loc) {
        name = await uniqueName(destDir, file.slice(0, file.length - ext.length), ext);
      } else {
        // A file from outside the notes folder: named like any other note.
        const text = (await readText(p)).text;
        const st = await fsp.stat(p);
        const created = new Date(st.birthtimeMs || st.mtimeMs);
        const title = H.titleOf(text) || file.slice(0, file.length - ext.length);
        name = await uniqueName(destDir, H.baseName(H.formatDate(created), title, untitled()), ext);
      }
      const to = path.join(destDir, name);
      await jMove(j, p, to);
      await jSetProject(j, to, toFolder, file.slice(0, file.length - ext.length));
      let pinned = false;
      if (loc && !loc.archived) pinned = forgetFile(idx, loc.folder, loc.file);
      idx.order[toFolder] = (await orderedFiles(idx, toFolder)).filter((n) => n !== name);
      placeFile(idx, toFolder, name, { before, after, pinned });
      if (loc && loc.archived) {
        await jRmdirIfEmpty(j, archiveDirOf(idx, loc.folder));
        if (!(await exists(archiveDirOf(idx, loc.folder)))) idx.archivedProjects = without(idx.archivedProjects, loc.folder);
      }
      await saveIndex(idx);
      return { path: to, moved: j.moved, undoId: commit(j) };
    });
  }

  async function reorderNote(p, target, after) {
    const loc = locate(await loadIndex(), p);
    if (!loc || loc.archived) return { path: p, moved: [] };
    return moveNote(p, loc.folder, { before: target, after, reorderOnly: true });
  }

  async function setPinned(p, pinned) {
    return run(async () => {
      const idx = await loadIndex();
      const loc = locate(idx, p);
      if (!loc || loc.archived) return;
      const key = pinKey(loc.folder, loc.file);
      idx.pinned = idx.pinned.filter((k) => k !== key);
      if (pinned) {
        idx.pinned.push(key);
        idx.order[loc.folder] = await orderedFiles(idx, loc.folder);
        placeFile(idx, loc.folder, loc.file);
      }
      await saveIndex(idx);
    });
  }

  async function archiveNote(p) {
    return run(async () => {
      const idx = await ensure();
      const loc = locate(idx, p);
      if (!loc || loc.archived) throw new Error('Not an active note');
      const j = begin(idx);
      const dir = archiveDirOf(idx, loc.folder);
      await jMkdir(j, dir);
      const ext = path.extname(loc.file);
      const to = path.join(dir, await uniqueName(dir, loc.file.slice(0, loc.file.length - ext.length), ext));
      await jMove(j, p, to);
      forgetFile(idx, loc.folder, loc.file);
      await saveIndex(idx);
      return { path: to, moved: j.moved, undoId: commit(j) };
    });
  }

  /** Put an archived note back into its project, re-creating the project when it is gone. */
  async function restoreNote(p) {
    return run(async () => {
      const idx = await ensure();
      const loc = locate(idx, p);
      if (!loc || !loc.archived) throw new Error('Not an archived note');
      const j = begin(idx);
      const active = lower(loc.folder) === lower(idx.inbox) ? idx.inbox : (await projectDirs(idx)).find((n) => lower(n) === lower(loc.folder));
      const target = active || loc.folder;
      const recreated = !active;
      if (recreated) {
        await jMkdir(j, dirOf(target));
        idx.projects = [...without(idx.projects, target), target];
      }
      const ext = path.extname(loc.file);
      const to = path.join(dirOf(target), await uniqueName(dirOf(target), loc.file.slice(0, loc.file.length - ext.length), ext));
      await jMove(j, p, to);
      idx.order[target] = (await orderedFiles(idx, target)).filter((n) => n !== path.basename(to));
      placeFile(idx, target, path.basename(to));
      await jRmdirIfEmpty(j, archiveDirOf(idx, loc.folder));
      if (!(await exists(archiveDirOf(idx, loc.folder)))) idx.archivedProjects = without(idx.archivedProjects, loc.folder);
      await saveIndex(idx);
      return { path: to, project: target, recreated, moved: j.moved, undoId: commit(j) };
    });
  }

  async function deleteNote(p) {
    return run(async () => {
      const idx = await loadIndex();
      const loc = locate(idx, p);
      if (!loc) throw new Error('Not a note');
      await trash(p);
      if (!loc.archived) forgetFile(idx, loc.folder, loc.file);
      else if (!(await listNotes(archiveDirOf(idx, loc.folder))).length) {
        await fsp.rmdir(archiveDirOf(idx, loc.folder)).catch(() => {});
        if (!(await exists(archiveDirOf(idx, loc.folder)))) idx.archivedProjects = without(idx.archivedProjects, loc.folder);
      }
      await saveIndex(idx);
      return { deleted: [p] };
    });
  }

  /** Remove an empty note straight away (a new note closed before anything was written). */
  async function discardEmpty(p, expectedText) {
    return run(async () => {
      const idx = await loadIndex();
      const loc = locate(idx, p);
      if (!loc || loc.archived) return false;
      const r = await readText(p).catch(() => null);
      if (!r || r.text !== expectedText) return false;
      await fsp.unlink(p);
      forgetFile(idx, loc.folder, loc.file);
      await saveIndex(idx);
      return true;
    });
  }

  // ---------- projects ----------
  async function nameCheck(idx, name, except = null) {
    const taken = (await projectDirs(idx)).filter((n) => !except || lower(n) !== lower(except));
    return H.projectNameError(name, { taken, reserved: [idx.inbox, idx.archive] });
  }

  async function createProject(name) {
    return run(async () => {
      const idx = await ensure();
      const n = String(name || '').trim();
      const err = await nameCheck(idx, n);
      if (err) return { error: err };
      await fsp.mkdir(dirOf(n));
      idx.projects = [...without(idx.projects, n), n];
      await saveIndex(idx);
      return { name: n };
    });
  }

  async function renameProject(oldName, newName) {
    return run(async () => {
      const idx = await ensure();
      const n = String(newName || '').trim();
      if (n === oldName) return { name: n, moved: [] };
      const err = await nameCheck(idx, n, oldName);
      if (err) return { error: err };
      const j = begin(idx);
      if (lower(n) === lower(oldName)) {
        const tmp = dirOf(`.${n}.renaming`);
        await fsp.rename(dirOf(oldName), tmp);
        await fsp.rename(tmp, dirOf(n));
        j.entries.push({ t: 'move', from: dirOf(oldName), to: dirOf(n) });
        j.moved.push({ from: dirOf(oldName), to: dirOf(n) });
      } else await jMove(j, dirOf(oldName), dirOf(n));
      for (const f of await listNotes(dirOf(n))) await jSetProject(j, path.join(dirOf(n), f), n, '').catch(() => {});
      idx.projects = idx.projects.map((x) => (x === oldName ? n : x));
      if (!has(idx.projects, n)) idx.projects.push(n);
      if (idx.order[oldName]) { idx.order[n] = idx.order[oldName]; delete idx.order[oldName]; }
      idx.pinned = idx.pinned.map((k) => (k.startsWith(`${oldName}/`) ? `${n}/${k.slice(oldName.length + 1)}` : k));
      idx.collapsed = idx.collapsed.map((x) => (x === oldName ? n : x));
      await saveIndex(idx);
      return { name: n, moved: j.moved, undoId: commit(j) };
    });
  }

  async function reorderProject(name, target, after) {
    return run(async () => {
      const idx = await loadIndex();
      const list = (await orderedProjects(idx)).filter((n) => n !== name);
      const at = list.indexOf(target);
      if (at < 0) return;
      list.splice(at + (after ? 1 : 0), 0, name);
      idx.projects = list;
      await saveIndex(idx);
    });
  }

  async function setCollapsed(folder, collapsed) {
    return run(async () => {
      const idx = await loadIndex();
      idx.collapsed = without(idx.collapsed, folder);
      if (collapsed) idx.collapsed.push(folder);
      await saveIndex(idx);
    });
  }

  async function archiveProject(name) {
    return run(async () => {
      const idx = await ensure();
      const src = dirOf(name);
      if (!(await exists(src))) throw new Error(`No such project: ${name}`);
      const j = begin(idx);
      const dest = archiveDirOf(idx, name);
      if (!(await exists(dest))) {
        await jMove(j, src, dest);
      } else {
        // Notes of this project were archived one by one before: put everything together.
        for (const f of await fsp.readdir(src)) {
          const ext = path.extname(f);
          await jMove(j, path.join(src, f), path.join(dest, await uniqueName(dest, f.slice(0, f.length - ext.length), ext)));
        }
        await jRmdirIfEmpty(j, src);
      }
      forgetProject(idx, name);
      idx.archivedProjects = [...without(idx.archivedProjects, name), name];
      await saveIndex(idx);
      return { moved: j.moved, undoId: commit(j) };
    });
  }

  /** Bring every archived note of a project back, into the active project of that name. */
  async function restoreProject(name) {
    return run(async () => {
      const idx = await ensure();
      const src = archiveDirOf(idx, name);
      if (!(await exists(src))) throw new Error(`No archived project: ${name}`);
      const j = begin(idx);
      const active = (await projectDirs(idx)).find((n) => lower(n) === lower(name));
      if (!active) {
        await jMove(j, src, dirOf(name));
        idx.projects = [...without(idx.projects, name), name];
      } else {
        const list = await orderedFiles(idx, active);
        for (const f of await fsp.readdir(src)) {
          const ext = path.extname(f);
          const to = path.join(dirOf(active), await uniqueName(dirOf(active), f.slice(0, f.length - ext.length), ext));
          await jMove(j, path.join(src, f), to);
          list.unshift(path.basename(to));
        }
        idx.order[active] = list;
        await jRmdirIfEmpty(j, src);
      }
      idx.archivedProjects = without(idx.archivedProjects, name);
      await saveIndex(idx);
      return { name: active || name, moved: j.moved, undoId: commit(j) };
    });
  }

  /** Move a project folder (active or archived) with all its notes to the Recycle Bin. */
  async function deleteProject(name, { archived = false } = {}) {
    return run(async () => {
      const idx = await loadIndex();
      const dir = archived ? archiveDirOf(idx, name) : dirOf(name);
      if (!(await exists(dir))) throw new Error(`No such project: ${name}`);
      await trash(dir);
      if (archived) idx.archivedProjects = without(idx.archivedProjects, name);
      else forgetProject(idx, name);
      await saveIndex(idx);
      return { deleted: [dir] };
    });
  }

  async function countNotes(name, { archived = false } = {}) {
    const idx = await loadIndex();
    return (await listNotes(archived ? archiveDirOf(idx, name) : dirOf(name))).length;
  }

  return {
    root, ensure, tree, search, createNote, renameForTitle, moveNote, reorderNote, setPinned, archiveNote, restoreNote,
    deleteNote, discardEmpty, createProject, renameProject, reorderProject, setCollapsed, archiveProject, restoreProject,
    deleteProject, countNotes, undo, locate: async (p) => locate(await loadIndex(), p)
  };
}

module.exports = { createNotesStore, FOLDER_NAMES, INDEX_FILE };
