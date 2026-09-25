const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createNotesStore } = require('../../src/main/notes');
const H = require('../../src/shared/noteHeader');

function setup(locale = 'sv') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-notes-'));
  const root = path.join(tmp, 'Notera');
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  const trashed = [];
  const store = createNotesStore({
    root, getLocale: () => locale, eol: 'LF', untitled: () => (locale === 'sv' ? 'Namnlös anteckning' : 'Untitled note'),
    trash: async (p) => { trashed.push(p); fs.renameSync(p, path.join(bin, path.basename(p) + '-' + trashed.length)); }
  });
  const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
  const ls = (...p) => fs.readdirSync(path.join(root, ...p)).sort();
  return { tmp, root, store, trashed, read, ls };
}

const today = H.formatDate(new Date());

test('noteHeader: new note text, title, project rewrite, file names', () => {
  const text = H.newNoteText('sv', 'Enlantis', new Date(2026, 8, 25, 14, 32));
  assert.equal(text, '# \nProjekt: Enlantis · Skapad: 2026-09-25 14:32\n\n');
  assert.equal(H.titleOf('# Login error\nx'), 'Login error');
  assert.equal(H.titleOf('Login error'), '');
  assert.deepEqual(H.parseMeta(text), { project: 'Enlantis', created: '2026-09-25 14:32', locale: 'sv' });
  const moved = H.setProject('# T\r\nProject: A · Created: 2026-01-02 03:04\r\n\r\nbody', 'B');
  assert.equal(moved, '# T\r\nProject: B · Created: 2026-01-02 03:04\r\n\r\nbody', 'keeps labels and CR');
  assert.equal(H.setProject('# T\nbody', 'P', { locale: 'sv', created: '2026-01-01 10:00' }), '# T\nProjekt: P · Skapad: 2026-01-01 10:00\nbody');
  assert.equal(H.setProject('loose text', 'P', { locale: 'en', created: 'c', fallbackTitle: 'ideas' }), '# ideas\nProject: P · Created: c\n\nloose text');
  assert.equal(H.sanitizeFileName(' a/b:c?  d. '), 'abc d');
  assert.equal(H.sanitizeFileName('CON'), '_CON');
  assert.equal(H.baseName('2026-09-25', '', 'Untitled note'), '2026-09-25 Untitled note');
  assert.equal(H.datePrefixFor('2026-01-02 x.md', ''), '2026-01-02');
  assert.equal(H.datePrefixFor('x.md', 'Projekt: A · Skapad: 2025-05-05 10:00'), '2025-05-05');
  assert.equal(H.projectNameError('Arkiv', { reserved: ['Arkiv'] }), 'notes.nameReserved');
  assert.equal(H.projectNameError('a/b'), 'notes.nameInvalid');
  assert.equal(H.projectNameError('enlantis', { taken: ['Enlantis'] }), 'notes.nameTaken');
  assert.equal(H.projectNameError('  '), 'notes.nameEmpty');
  assert.equal(H.projectNameError('Enlantis'), '');
});

test('first tree creates inbox, archive and index with localized folder names', async () => {
  const { store, ls, read } = setup('sv');
  const tree = await store.tree();
  assert.deepEqual(ls(), ['.notera.json', 'Arkiv', 'Osorterat']);
  assert.equal(tree.inbox.name, 'Osorterat');
  assert.deepEqual(tree.projects, []);
  assert.equal(JSON.parse(read('.notera.json')).archive, 'Arkiv');
  const en = setup('en');
  await en.store.tree();
  assert.deepEqual(en.ls(), ['.notera.json', 'Archive', 'Unsorted']);
});

test('create note, rename after title, pin and order', async () => {
  const { store, read, ls, root } = setup();
  assert.deepEqual(await store.createProject('Enlantis'), { name: 'Enlantis' });
  assert.equal((await store.createProject('enlantis')).error, 'notes.nameTaken');
  assert.equal((await store.createProject('Osorterat')).error, 'notes.nameReserved');
  const a = await store.createNote('Enlantis');
  assert.equal(path.basename(a.path), `${today} Namnlös anteckning.md`);
  assert.match(read('Enlantis', path.basename(a.path)), /^# \nProjekt: Enlantis · Skapad: \d{4}-\d{2}-\d{2} \d{2}:\d{2}\n\n$/);
  const b = await store.createNote('Enlantis');
  assert.equal(path.basename(b.path), `${today} Namnlös anteckning (2).md`, 'unique name');

  fs.writeFileSync(a.path, read('Enlantis', path.basename(a.path)).replace('# ', '# PBI-1234: Login?'));
  const r = await store.renameForTitle(a.path, 'PBI-1234: Login?');
  assert.equal(path.basename(r.path), `${today} PBI-1234 Login.md`);
  assert.deepEqual(r.moved, [{ from: a.path, to: r.path }]);
  assert.equal((await store.renameForTitle(r.path, 'PBI-1234: Login?')).path, r.path, 'no-op when unchanged');

  let tree = await store.tree();
  assert.deepEqual(tree.projects[0].notes.map((n) => n.title), ['Namnlös anteckning (2)', 'PBI-1234: Login?'].map((x, i) => (i === 0 ? `${today} ${x}` : x)));
  await store.setPinned(r.path, true);
  tree = await store.tree();
  assert.equal(tree.projects[0].notes[0].path, r.path);
  assert.equal(tree.projects[0].notes[0].pinned, true);
  // Renaming keeps the pin.
  const r2 = await store.renameForTitle(r.path, 'Login error');
  tree = await store.tree();
  assert.equal(tree.projects[0].notes[0].path, r2.path);
  assert.equal(tree.projects[0].notes[0].pinned, true);
  // A file dropped in by Explorer shows up, newest first among unknown files.
  fs.writeFileSync(path.join(root, 'Enlantis', 'loose.md'), 'hello');
  tree = await store.tree();
  assert.ok(tree.projects[0].notes.some((n) => n.file === 'loose.md' && n.title === 'loose'));
  assert.ok(ls('Enlantis').includes('loose.md'));
});

test('move between projects rewrites the header; undo puts it back', async () => {
  const { store, read, ls } = setup();
  await store.createProject('Enlantis');
  await store.createProject('Notera');
  const n = await store.createNote('Enlantis');
  const moved = await store.moveNote(n.path, 'Notera');
  assert.ok(moved.path.includes(`${path.sep}Notera${path.sep}`));
  assert.match(read('Notera', path.basename(moved.path)), /^# \nProjekt: Notera · Skapad: /);
  assert.deepEqual(ls('Enlantis'), []);
  const u = await store.undo(moved.undoId);
  assert.equal(u.ok, true);
  assert.deepEqual(u.moved, [{ from: moved.path, to: n.path }]);
  assert.match(read('Enlantis', path.basename(n.path)), /Projekt: Enlantis/);
  assert.deepEqual(ls('Notera'), []);
  assert.equal((await store.undo(moved.undoId)).ok, false, 'an undo runs once');
});

test('reorder notes and projects by drag targets', async () => {
  const { store } = setup();
  await store.createProject('A');
  await store.createProject('B');
  await store.createProject('C');
  await store.reorderProject('C', 'A', false);
  assert.deepEqual((await store.tree()).projects.map((p) => p.name), ['C', 'A', 'B']);
  const x = await store.createNote('A', { text: '# X\n' });
  const y = await store.createNote('A', { text: '# Y\n' });
  const z = await store.createNote('A', { text: '# Z\n' });
  assert.deepEqual((await store.tree()).projects[1].notes.map((n) => n.title), ['Z', 'Y', 'X']);
  await store.reorderNote(z.path, path.basename(x.path), true);
  assert.deepEqual((await store.tree()).projects[1].notes.map((n) => n.title), ['Y', 'X', 'Z']);
  void y;
  await store.setCollapsed('A', true);
  assert.equal((await store.tree()).projects[1].collapsed, true);
});

test('archive a note, restore it, and restore into a re-created project', async () => {
  const { store, ls } = setup();
  await store.createProject('Enlantis');
  const n = await store.createNote('Enlantis', { text: '# Old deploy list\n\n1. build\n' });
  const a = await store.archiveNote(n.path);
  assert.deepEqual(ls('Arkiv', 'Enlantis'), [path.basename(n.path)]);
  let tree = await store.tree();
  assert.equal(tree.archiveCount, 1);
  assert.equal(tree.archive[0].wholeProject, false);
  assert.equal(tree.projects[0].notes.length, 0);
  // Undo archive
  await store.undo(a.undoId);
  assert.deepEqual(ls('Enlantis'), [path.basename(n.path)]);
  assert.deepEqual(ls('Arkiv'), [], 'the archive folder made for the note is removed again');
  // Archive, delete the project, restore: the project comes back.
  const a2 = await store.archiveNote(n.path);
  await store.deleteProject('Enlantis');
  const r = await store.restoreNote(a2.path);
  assert.equal(r.recreated, true);
  assert.equal(r.project, 'Enlantis');
  tree = await store.tree();
  assert.deepEqual(tree.projects.map((p) => p.name), ['Enlantis']);
  assert.equal(tree.archiveCount, 0);
  assert.deepEqual(ls('Arkiv'), []);
});

test('archive and restore a whole project, merging with notes archived before', async () => {
  const { store, ls } = setup();
  await store.createProject('Q2');
  const one = await store.createNote('Q2', { text: '# One\n' });
  await store.createNote('Q2', { text: '# Two\n' });
  await store.archiveNote(one.path);
  const ap = await store.archiveProject('Q2');
  assert.ok(!ls().includes('Q2'));
  assert.equal(ls('Arkiv', 'Q2').length, 2);
  let tree = await store.tree();
  assert.equal(tree.archive[0].wholeProject, true);
  assert.deepEqual(tree.projects, []);
  await store.undo(ap.undoId);
  assert.equal(ls('Q2').length, 1);
  await store.archiveProject('Q2');
  const rp = await store.restoreProject('Q2');
  assert.equal(rp.name, 'Q2');
  tree = await store.tree();
  assert.equal(tree.projects[0].notes.length, 2);
  assert.equal(tree.archive.length, 0);
});

test('rename project rewrites every header; validation; undo', async () => {
  const { store, read, ls } = setup();
  await store.createProject('Old');
  await store.createProject('Other');
  const n = await store.createNote('Old', { text: '# A\n' });
  assert.equal((await store.renameProject('Old', 'other')).error, 'notes.nameTaken');
  const r = await store.renameProject('Old', 'New');
  assert.deepEqual(ls().filter((x) => !x.startsWith('.')), ['Arkiv', 'New', 'Osorterat', 'Other']);
  assert.match(read('New', path.basename(n.path)), /Projekt: New/);
  await store.undo(r.undoId);
  assert.match(read('Old', path.basename(n.path)), /Projekt: Old/);
});

test('delete note and project go to the trash', async () => {
  const { store, trashed, root, ls } = setup();
  await store.createProject('P');
  const n = await store.createNote('P');
  await store.createNote('P');
  assert.equal(await store.countNotes('P'), 2);
  await store.deleteNote(n.path);
  assert.deepEqual(trashed, [n.path]);
  await store.deleteProject('P');
  assert.deepEqual(trashed, [n.path, path.join(root, 'P')]);
  assert.ok(!ls().includes('P'));
});

test('import a file from outside and a draft text', async () => {
  const { store, tmp, read } = setup('en');
  await store.createProject('Ideas');
  const outside = path.join(tmp, 'loose thoughts.md');
  fs.writeFileSync(outside, 'Written before projects.\n');
  const m = await store.moveNote(outside, 'Ideas');
  assert.ok(!fs.existsSync(outside));
  const text = read('Ideas', path.basename(m.path));
  assert.match(text, /^# loose thoughts\nProject: Ideas · Created: .+\n\nWritten before projects\.\n$/);
  assert.match(path.basename(m.path), /^\d{4}-\d{2}-\d{2} loose thoughts\.md$/);
  await store.undo(m.undoId);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'Written before projects.\n', 'undo restores the original text');
  const d = await store.createNote('Unsorted', { text: '# Shopping\n- milk\n' });
  assert.equal(path.basename(d.path), `${today} Shopping.md`);
  assert.match(read('Unsorted', path.basename(d.path)), /^# Shopping\nProject: Unsorted · Created: .+\n- milk\n$/);
});

test('search covers titles, bodies and the archive', async () => {
  const { store } = setup();
  await store.createProject('Enlantis');
  const a = await store.createNote('Enlantis', { text: '# Login error\n\n## Found\n- Kinde lacks the callback URL\n' });
  const b = await store.createNote('Enlantis', { text: '# Deploy list\n\nKinde support ticket\n' });
  await store.archiveNote(b.path);
  const hits = await store.search('kinde');
  assert.deepEqual(hits.map((h) => [h.title, h.archived]), [['Login error', false], ['Deploy list', true]]);
  assert.match(hits[0].snippet, /^Found Kinde lacks/);
  assert.equal((await store.search('login'))[0].path, a.path);
  assert.deepEqual(await store.search('   '), []);
});

test('discardEmpty removes an untouched new note only', async () => {
  const { store, ls } = setup();
  const n = await store.createNote('Osorterat');
  assert.equal(await store.discardEmpty(n.path, 'something else'), false);
  assert.equal(await store.discardEmpty(n.path, n.text), true);
  assert.deepEqual(ls('Osorterat'), []);
});

test('a new note lands on top even when the index has never seen the folder', async () => {
  const { store, root } = setup();
  fs.mkdirSync(path.join(root, 'Old'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Old', 'a.md'), '# A\n');
  fs.writeFileSync(path.join(root, 'Old', 'b.md'), '# B\n');
  const n = await store.createNote('Old');
  let tree = await store.tree();
  const old = tree.projects.find((p) => p.name === 'Old');
  assert.equal(old.notes[0].path, n.path);
  // Renaming keeps its place instead of duplicating it.
  const r = await store.renameForTitle(n.path, 'Fresh');
  tree = await store.tree();
  const names = tree.projects.find((p) => p.name === 'Old').notes.map((x) => x.file);
  assert.equal(names[0], path.basename(r.path));
  assert.equal(names.length, 3);
});

test('undo after the note was renamed follows the new name; a failed undo keeps the index', async () => {
  const { store, ls, read, root } = setup();
  await store.createProject('A');
  await store.createProject('B');
  const n = await store.createNote('A');
  const m = await store.moveNote(n.path, 'B');
  const r = await store.renameForTitle(m.path, 'Named later');
  const u = await store.undo(m.undoId);
  assert.equal(u.ok, true);
  assert.deepEqual(u.moved, [{ from: r.path, to: path.join(root, 'A', path.basename(r.path)) }]);
  assert.deepEqual(ls('A'), [path.basename(r.path)]);
  assert.match(read('A', path.basename(r.path)), /Projekt: A/);
  // A file deleted behind Notera's back: undo reports failure and leaves the index alone.
  const m2 = await store.moveNote(path.join(root, 'A', path.basename(r.path)), 'B');
  await store.setPinned(m2.path, true);
  fs.unlinkSync(m2.path);
  const before = read('.notera.json');
  const u2 = await store.undo(m2.undoId);
  assert.equal(u2.ok, false);
  assert.equal(read('.notera.json'), before);
});

test('a reorder does not drag a note back after it moved elsewhere', async () => {
  const { store, ls } = setup();
  await store.createProject('A');
  await store.createProject('B');
  const x = await store.createNote('A', { text: '# X\n' });
  const y = await store.createNote('A', { text: '# Y\n' });
  const moved = store.moveNote(x.path, 'B');
  const reorder = store.reorderNote(x.path, path.basename(y.path), true);
  await Promise.all([moved, reorder]);
  assert.deepEqual(ls('B'), [path.basename(x.path)]);
  assert.deepEqual(ls('A'), [path.basename(y.path)]);
});
