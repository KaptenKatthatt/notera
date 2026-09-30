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
//     Mallar/Standup.md
//
// Mallar (Templates) holds the templates: one .md file per template, named after it. It is not a
// project. Every notes folder is set up once (the index remembers it): the templates folder with
// Standup.md in it and the project Standupanteckningar, which uses that template and sorts its notes
// by the date written in them. Removing either later does not bring it back. Per-project options
// (default template, sort order) live in the index too.
//
// Every mutating operation runs through a queue (no two file operations interleave) and, where
// it can be undone, records a journal: file moves, rewritten files, created and removed folders
// and the index as it was. undo(id) replays that journal backwards.
const fsp = require('fs/promises');
const path = require('path');
const files = require('./files');
const { writeFileAtomic } = require('./atomicWrite');
const H = require('../shared/noteHeader');
const T = require('../shared/templates');
const { makeT } = require('../shared/strings');

const INDEX_FILE = '.notera.json';
const NOTE_EXT = /\.(md|markdown|txt)$/i;
const FOLDER_NAMES = {
  sv: { inbox: 'Osorterat', archive: 'Arkiv', templates: 'Mallar', standup: 'Standupanteckningar' },
  en: { inbox: 'Unsorted', archive: 'Archive', templates: 'Templates', standup: 'Standup notes' }
};
const STANDUP_TEMPLATE = 'Standup';
const MAX_UNDO = 30;

const lower = (s) => String(s).toLowerCase();
const has = (list, name) => list.some((x) => lower(x) === lower(name));
const without = (list, name) => list.filter((x) => lower(x) !== lower(name));
const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
/** One plain folder name: nothing that could climb out of the folder it is joined to. */
const isSegment = (name) => typeof name === 'string' && name !== '' && name !== '.' && name !== '..' && !/[\\/:\0]/.test(name);

async function exists(p) { try { await fsp.access(p); return true; } catch { return false; } }

/** Rename within one folder. A change of case only takes a detour, which Windows needs. */
async function renameFile(from, to) {
  if (lower(from) !== lower(to)) return moveFile(from, to);
  const tmp = path.join(path.dirname(to), `.${path.basename(to)}.renaming`);
  await fsp.rename(from, tmp);
  await fsp.rename(tmp, to);
}

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

function createNotesStore({ root, getLocale = () => 'en', trash, untitled = () => 'Untitled note', eol = 'CRLF', seed = false }) {
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
    const rawOptions = raw.options && typeof raw.options === 'object' ? raw.options : {};
    /** @type {Record<string, { template?: string, sort?: string }>} */
    const options = {};
    for (const [k, v] of Object.entries(rawOptions)) {
      if (!v || typeof v !== 'object') continue;
      const o = {};
      if (typeof v.template === 'string' && v.template) o.template = v.template;
      if (v.sort === 'date') o.sort = 'date';
      if (Object.keys(o).length) options[k] = o;
    }
    return {
      version: 1,
      inbox: isSegment(raw.inbox) ? raw.inbox : names.inbox,
      archive: isSegment(raw.archive) ? raw.archive : names.archive,
      projects: arr(raw.projects),
      order: Object.fromEntries(Object.entries(order).map(([k, v]) => [k, arr(v)])),
      pinned: arr(raw.pinned),
      collapsed: arr(raw.collapsed),
      archivedProjects: arr(raw.archivedProjects),
      // null until the folder is set up: a folder of that name is then still an ordinary project.
      templates: isSegment(raw.templates) ? raw.templates : null,
      options,
      seeded: raw.seeded === true
    };
  }

  async function saveIndex(idx) {
    await writeFileAtomic(indexPath, JSON.stringify(idx, null, 2) + '\n');
  }

  async function ensure() {
    await fsp.mkdir(root, { recursive: true });
    const idx = await loadIndex();
    await fsp.mkdir(path.join(root, idx.inbox), { recursive: true });
    await fsp.mkdir(path.join(root, idx.archive), { recursive: true });
    if (!(await exists(indexPath))) await saveIndex(idx);
    if (seed && !idx.seeded) await setUp(idx);
    return idx;
  }

  /** The templates folder's name, chosen the first time it is needed; a project of that name keeps it. */
  async function claimTemplatesFolder(idx) {
    if (idx.templates) return idx.templates;
    const names = FOLDER_NAMES[getLocale()] || FOLDER_NAMES.en;
    const taken = await projectDirs(idx);
    idx.templates = has(taken, names.templates) ? `Notera ${names.templates}` : names.templates;
    await fsp.mkdir(path.join(root, idx.templates), { recursive: true });
    return idx.templates;
  }

  /**
   * Once per notes folder: the templates folder with Standup.md, and the project Standupanteckningar
   * using it, sorted by date. A project of that name that already exists is reused.
   */
  async function setUp(idx) {
    const names = FOLDER_NAMES[getLocale()] || FOLDER_NAMES.en;
    await claimTemplatesFolder(idx);
    const std = templatePath(idx, STANDUP_TEMPLATE);
    if (!(await exists(std))) {
      const text = T.standupTemplate(makeT(getLocale()), getLocale());
      await fsp.writeFile(std, files.writeBuffer(text, 'utf8', eol), { flag: 'wx' }).catch(() => {});
    }
    const existing = (await projectDirs(idx)).find((n) => lower(n) === lower(names.standup));
    const project = existing || names.standup;
    if (!existing) {
      await fsp.mkdir(dirOf(project), { recursive: true });
      idx.projects = [...without(idx.projects, project), project];
    }
    idx.options[project] = { ...(idx.options[project] || {}), template: STANDUP_TEMPLATE, sort: 'date' };
    idx.seeded = true;
    await saveIndex(idx);
  }

  // ---------- paths ----------
  // Folder names arrive over IPC from the renderer, so every path built from one goes through a
  // check that it names a single folder directly inside the notes folder (or its archive).
  function segment(name) {
    if (!isSegment(name)) throw new Error(`Invalid folder name: ${name}`);
    return name;
  }
  const dirOf = (folder) => path.join(root, segment(folder));
  const archiveDirOf = (idx, folder) => path.join(root, idx.archive, segment(folder));
  /** The inbox or a project: somewhere a note may be written. Never the archive or a hidden folder. */
  function noteDirOf(idx, folder) {
    const dir = dirOf(folder);
    if (folder.startsWith('.') || lower(folder) === lower(idx.archive)) throw new Error(`Not a project: ${folder}`);
    return dir;
  }
  /** A project folder that exists now, by its exact name. The inbox and the archive are not projects. */
  async function requireProject(idx, name) {
    segment(name);
    if (!(await projectDirs(idx)).includes(name)) throw new Error(`No such project: ${name}`);
  }
  const pinKey = (folder, file) => `${folder}/${file}`;
  const isTemplatesDir = (idx, name) => !!idx.templates && lower(name) === lower(idx.templates);
  function templatePath(idx, name) {
    if (!idx.templates) throw new Error('No templates folder');
    return path.join(root, segment(idx.templates), `${segment(String(name))}.md`);
  }

  /** Where a path sits: an active note, an archived note, or null for anything else. */
  function locate(idx, p) {
    const rel = path.relative(root, p);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
    const parts = rel.split(path.sep);
    if (parts.length === 2 && lower(parts[0]) !== lower(idx.archive) && !parts[0].startsWith('.') && !isTemplatesDir(idx, parts[0])) {
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
    let ents;
    try { ents = await fsp.readdir(root, { withFileTypes: true }); } catch { return []; }
    return ents
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && lower(e.name) !== lower(idx.inbox) && lower(e.name) !== lower(idx.archive) && !isTemplatesDir(idx, e.name))
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
    const mtimes = new Map(await Promise.all(unknown.map(async (n) => /** @type {[string, number]} */ ([n, (await fsp.stat(path.join(dir, n))).mtimeMs]))));
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

  /** Note text flattened for search: no heading line, no header line, no list or quote markers. */
  function searchBody(text) {
    return text.split('\n').filter((l, i) => !(i === 0 && /^#\s/.test(l)) && !H.META_RE.test(l))
      .map((l) => l.replace(/^\s*(#{1,6}\s|[-*+]\s(\[[ xX]\]\s)?|\d+\.\s|>\s?)/, '')).join(' ').replace(/\s+/g, ' ').trim();
  }

  // Title and search text per note, valid while the file's size and mtime are unchanged. Every
  // window re-reads the tree after each change, and search runs per keystroke; with the cache
  // both cost one stat per note instead of reading every file. tree() drops entries for files
  // that are gone.
  const noteCache = new Map();
  async function noteInfo(p) {
    const st = await fsp.stat(p);
    const hit = noteCache.get(p);
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit;
    const { text } = await readText(p);
    const info = { mtimeMs: st.mtimeMs, size: st.size, title: H.titleOf(text), body: searchBody(text), sort: H.sortDateOf(text, path.basename(p), st.mtimeMs) };
    info.bodyLower = lower(info.body);
    noteCache.set(p, info);
    return info;
  }

  async function noteEntry(idx, folder, dir, file, archived) {
    const p = path.join(dir, file);
    let title = '';
    let mtimeMs = 0;
    let sort = { date: '', created: '' };
    try {
      ({ title, mtimeMs, sort } = await noteInfo(p));
    } catch { /* unreadable: fall back to the file name */ }
    return {
      file, path: p, title: title || file.replace(NOTE_EXT, ''), hasTitle: !!title, mtimeMs, sortDate: sort.date, sortCreated: sort.created,
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
        if ((e.t === 'move' || e.t === 'rename') && e.to === from) { e.to = to; e.from = path.join(path.dirname(e.from), path.basename(to)); }
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
    await writeFileAtomic(p, after);
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
          else if (e.t === 'rename') { await renameFile(e.to, e.from); moved.push({ from: e.to, to: e.from }); }
          else if (e.t === 'mkdir') await fsp.rmdir(e.dir).catch(() => {});
          else if (e.t === 'rmdir') await fsp.mkdir(e.dir, { recursive: true });
          else if (e.t === 'write') {
            const cur = await fsp.readFile(e.path).catch(() => null);
            if (cur && cur.equals(e.after)) await writeFileAtomic(e.path, e.before);
            else if (cur && (e.oldProject || e.oldTitle !== undefined)) {
              // Edited since: only put the old project or heading back, keep the edits.
              const r = files.readBuffer(cur, eol);
              const text = e.oldProject ? H.setProject(r.text, e.oldProject) : H.setTitle(r.text, e.oldTitle);
              await writeFileAtomic(e.path, files.writeBuffer(text, r.encoding, r.eol));
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
        // Newest date first; the header's Created time, then the file's, break ties.
        if (sortOf(idx, name) === 'date') entries.sort((a, b) => b.sortDate.localeCompare(a.sortDate) || b.sortCreated.localeCompare(a.sortCreated) || b.mtimeMs - a.mtimeMs);
        return [...entries.filter((n) => n.pinned), ...entries.filter((n) => !n.pinned)];
      };
      const inbox = { name: idx.inbox, inbox: true, collapsed: has(idx.collapsed, idx.inbox), notes: await folder(idx.inbox) };
      const templates = await templateEntries(idx);
      const projects = [];
      for (const name of await orderedProjects(idx)) {
        const template = (idx.options[name] || {}).template || null;
        projects.push({
          name, collapsed: has(idx.collapsed, name), notes: await folder(name), sort: sortOf(idx, name),
          // A template that is gone no longer counts: new notes are plain again.
          template: template && templates.some((x) => lower(x.name) === lower(template)) ? template : null
        });
      }
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
      const seen = new Set([inbox, ...projects, ...archive].flatMap((g) => g.notes.map((n) => n.path)));
      for (const p of noteCache.keys()) if (!seen.has(p)) noteCache.delete(p);
      return {
        root, inboxName: idx.inbox, archiveName: idx.archive, inbox, projects, templates, templatesName: idx.templates,
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
        const found = await Promise.all((await listNotes(s.dir)).map(async (file) => {
          const p = path.join(s.dir, file);
          let info;
          try { info = await noteInfo(p); } catch { return null; }
          const title = info.title || file.replace(NOTE_EXT, '');
          const inTitle = lower(title).includes(q);
          const at = info.bodyLower.indexOf(q);
          if (!inTitle && at < 0) return null;
          const snippet = at >= 0 ? (at > 40 ? '…' : '') + info.body.slice(Math.max(0, at - 40), at + 80) : info.body.slice(0, 120);
          return { path: p, file, title, project: s.folder, archived: s.archived, inTitle, snippet };
        }));
        hits.push(...found.filter(Boolean));
      }
      hits.sort((a, b) => (a.archived - b.archived) || (b.inTitle - a.inTitle) || a.title.localeCompare(b.title));
      return hits.slice(0, limit);
    });
  }

  // ---------- notes ----------
  /**
   * A new note in a project. It is made from the project's default template unless a template is
   * named (null: none); a draft moved into a project keeps its text. cursor: where typing starts.
   * @param {string} folder @param {{ text?: string, template?: string | null }} [opts]
   */
  async function createNote(folder, { text, template } = {}) {
    return run(async () => {
      const idx = await ensure();
      const dir = noteDirOf(idx, folder);
      if (!(await exists(dir))) throw new Error(`No such project: ${folder}`);
      const now = new Date();
      let body = H.newNoteText(getLocale(), folder, now);
      let title = '';
      let cursor = 2;
      const tplName = template !== undefined ? template : (idx.options[folder] || {}).template;
      if (typeof text === 'string') {
        // A draft moved into a project: keep its text, add the header.
        title = H.titleOf(text);
        body = H.setProject(text, folder, { locale: getLocale(), created: H.formatDateTime(now), fallbackTitle: '' });
      } else if (tplName && idx.templates) {
        const tpl = await readText(templatePath(idx, tplName)).catch(() => null);
        if (tpl) {
          ({ text: body, cursor } = T.noteFromTemplate(tpl.text, { locale: getLocale(), project: folder, date: now }));
          title = H.titleOf(body);
        }
      }
      const name = await uniqueName(dir, H.baseName(H.formatDate(now), title, untitled()), '.md');
      const p = path.join(dir, name);
      // Pin down the order the user sees before adding to it, so the new note lands on top.
      idx.order[folder] = await orderedFiles(idx, folder);
      await fsp.writeFile(p, files.writeBuffer(body, 'utf8', eol), { flag: 'wx' });
      placeFile(idx, folder, name);
      await saveIndex(idx);
      return { path: p, text: body, cursor };
    });
  }

  /**
   * Give an active note the file name its heading asks for: "2026-09-25 Title.md". Keeps its place
   * in the list and its pin. Returns the new path, or null when the name already fits.
   */
  async function renameToTitle(idx, loc, p, title, text, j) {
    const dir = path.dirname(p);
    const ext = path.extname(loc.file) || '.md';
    const base = H.baseName(H.datePrefixFor(loc.file, text), title, untitled());
    const name = await uniqueName(dir, base, ext, loc.file);
    if (name === loc.file) return null;
    const to = path.join(dir, name);
    const list = await orderedFiles(idx, loc.folder);
    await renameFile(p, to);
    if (j) { j.entries.push({ t: 'rename', from: p, to }); j.moved.push({ from: p, to }); } else retargetJournals(p, to);
    // Same place in the list, same pin: only the name changes.
    const at = list.indexOf(loc.file);
    if (at >= 0) list[at] = name; else list.unshift(name);
    idx.order[loc.folder] = list;
    idx.pinned = idx.pinned.map((k) => (k === pinKey(loc.folder, loc.file) ? pinKey(loc.folder, name) : k));
    await saveIndex(idx);
    return to;
  }

  /** Rename an active note after its heading. A no-op for anything else. */
  async function renameForTitle(p, title) {
    return run(async () => {
      const idx = await loadIndex();
      const loc = locate(idx, p);
      if (!loc || loc.archived || !(await exists(p))) return { path: p, moved: [] };
      const text = /^\d{4}-\d{2}-\d{2}/.test(loc.file) ? '' : (await readText(p)).text;
      const to = await renameToTitle(idx, loc, p, title, text, null);
      return to ? { path: to, moved: [{ from: p, to }] } : { path: p, moved: [] };
    });
  }

  /**
   * Rename a note by hand: the heading becomes the new title and the file name follows it, the
   * same way it does when the heading is edited in the editor. Undoable.
   */
  async function renameNote(p, title) {
    return run(async () => {
      const name = String(title || '').trim();
      if (!name) return { error: 'notes.nameEmpty' };
      const idx = await loadIndex();
      const loc = locate(idx, p);
      if (!loc || loc.archived) throw new Error(`Not an active note: ${p}`);
      const j = begin(idx);
      const r = await readText(p);
      const oldTitle = H.titleOf(r.text);
      const next = H.setTitle(r.text, name);
      if (next !== r.text) {
        const after = files.writeBuffer(next, r.encoding, r.eol);
        await writeFileAtomic(p, after);
        j.entries.push({ t: 'write', path: p, before: r.buf, after, oldTitle });
      }
      const to = await renameToTitle(idx, loc, p, name, next, j);
      if (!j.entries.length) return { path: p, moved: [] };
      return { path: to || p, moved: j.moved, undoId: commit(j) };
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
      const destDir = noteDirOf(idx, toFolder);
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
      await requireProject(idx, oldName);
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
      if (idx.options[oldName]) { idx.options[n] = idx.options[oldName]; delete idx.options[oldName]; }
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
      await requireProject(idx, name);
      const src = dirOf(name);
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
      if (!archived) await requireProject(idx, name);
      const dir = archived ? archiveDirOf(idx, name) : dirOf(name);
      if (!(await exists(dir))) throw new Error(`No such project: ${name}`);
      await trash(dir);
      if (archived) idx.archivedProjects = without(idx.archivedProjects, name);
      else forgetProject(idx, name);
      delete idx.options[name];
      await saveIndex(idx);
      return { deleted: [dir] };
    });
  }

  // ---------- project options ----------
  function sortOf(idx, name) { return (idx.options[name] || {}).sort === 'date' ? 'date' : 'manual'; }

  /** Set a project's default template (null: none) and/or sort order ('manual' | 'date'). */
  async function setProjectOptions(name, patch) {
    return run(async () => {
      const idx = await loadIndex();
      await requireProject(idx, name);
      const o = { ...(idx.options[name] || {}) };
      if ('template' in patch) { if (patch.template) o.template = String(patch.template); else delete o.template; }
      if ('sort' in patch) { if (patch.sort === 'date') o.sort = 'date'; else delete o.sort; }
      if (Object.keys(o).length) idx.options[name] = o; else delete idx.options[name];
      await saveIndex(idx);
    });
  }

  // ---------- templates ----------
  async function templateEntries(idx) {
    if (!idx.templates) return [];
    const dir = path.join(root, idx.templates);
    const names = (await listNotes(dir)).filter((f) => /\.md$/i.test(f));
    return names.map((f) => ({ name: f.replace(/\.md$/i, ''), file: f, path: path.join(dir, f) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  async function templates() { return run(async () => templateEntries(await loadIndex())); }

  /** A template's text, or null when there is none of that name. */
  async function readTemplate(name) {
    return run(async () => {
      const idx = await loadIndex();
      if (!idx.templates) return null;
      const r = await readText(templatePath(idx, name)).catch(() => null);
      return r ? r.text : null;
    });
  }

  async function templateNameError(idx, name, except = null) {
    const taken = (await templateEntries(idx)).map((x) => x.name).filter((n) => !except || lower(n) !== lower(except));
    return H.projectNameError(name, { taken });
  }
  /** Where a path sits among the templates, or null. */
  function templateOf(idx, p) {
    if (!idx.templates) return null;
    const rel = path.relative(root, p);
    const parts = rel.split(path.sep);
    if (parts.length !== 2 || !isTemplatesDir(idx, parts[0]) || !/\.md$/i.test(parts[1])) return null;
    return { name: parts[1].replace(/\.md$/i, ''), file: parts[1] };
  }

  async function addTemplate(idx, name, text) {
    const n = String(name || '').trim();
    await claimTemplatesFolder(idx);
    const err = await templateNameError(idx, n);
    if (err) return { error: err };
    const p = templatePath(idx, n);
    await fsp.writeFile(p, files.writeBuffer(text, 'utf8', eol), { flag: 'wx' });
    await saveIndex(idx);
    return { name: n, path: p };
  }

  /** A new, empty template. */
  async function createTemplate(name) {
    return run(async () => addTemplate(await ensure(), name, ''));
  }

  /** A new template from a note: its text without the project header line. */
  async function saveAsTemplate(notePath, name) {
    return run(async () => {
      const idx = await ensure();
      const { text } = await readText(notePath);
      const lines = text.split('\n');
      const at = lines.slice(0, 4).findIndex((l) => H.META_RE.test(l.replace(/\r$/, '')));
      if (at >= 0) lines.splice(at, 1);
      return addTemplate(idx, name, lines.join('\n'));
    });
  }

  /** Rename a template; projects using it follow. */
  async function renameTemplate(oldName, newName) {
    return run(async () => {
      const idx = await loadIndex();
      const n = String(newName || '').trim();
      const from = templatePath(idx, oldName);
      if (!(await exists(from))) throw new Error(`No such template: ${oldName}`);
      if (n === oldName) return { name: n, moved: [] };
      const err = await templateNameError(idx, n, oldName);
      if (err) return { error: err };
      const to = templatePath(idx, n);
      await renameFile(from, to);
      for (const o of Object.values(idx.options)) if (o.template && lower(o.template) === lower(oldName)) o.template = n;
      await saveIndex(idx);
      return { name: n, path: to, moved: [{ from, to }] };
    });
  }

  /** Move a template to the Recycle Bin; projects using it make plain notes again. */
  async function deleteTemplate(name) {
    return run(async () => {
      const idx = await loadIndex();
      const p = templatePath(idx, name);
      await trash(p);
      for (const [k, o] of Object.entries(idx.options)) {
        if (o.template && lower(o.template) === lower(name)) { delete o.template; if (!Object.keys(o).length) delete idx.options[k]; }
      }
      await saveIndex(idx);
      return { deleted: [p] };
    });
  }

  async function countNotes(name, { archived = false } = {}) {
    const idx = await loadIndex();
    return (await listNotes(archived ? archiveDirOf(idx, name) : dirOf(name))).length;
  }

  return {
    root, ensure, tree, search, createNote, renameForTitle, renameNote, moveNote, reorderNote, setPinned, archiveNote, restoreNote,
    deleteNote, discardEmpty, createProject, renameProject, reorderProject, setCollapsed, archiveProject, restoreProject,
    deleteProject, countNotes, undo, locate: async (p) => locate(await loadIndex(), p),
    setProjectOptions, templates, readTemplate, createTemplate, saveAsTemplate, renameTemplate, deleteTemplate,
    templateOf: async (p) => templateOf(await loadIndex(), p)
  };
}

module.exports = { createNotesStore, FOLDER_NAMES, INDEX_FILE, STANDUP_TEMPLATE };
