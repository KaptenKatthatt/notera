const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHistory, keepSet, timeOf, stampOf, HISTORY_DIR } = require('../../src/main/history');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function setup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-hist-'));
  const root = path.join(tmp, 'Notera');
  const userData = path.join(tmp, 'ud');
  fs.mkdirSync(path.join(root, 'Osorterat'), { recursive: true });
  const clock = { t: new Date(2026, 9, 9, 14, 0, 0).getTime() };
  const h = createHistory({ getRoot: () => root, userDataDir: userData, now: () => clock.t });
  const note = path.join(root, 'Osorterat', '2026-10-09 Möte.md');
  const write = (p, text) => fs.writeFileSync(p, text);
  /** What the app does on a save: history first, then the write. */
  const save = async (p, text) => { await h.beforeWrite(p, text); write(p, text); };
  const versions = (p) => { const d = h.dirFor(p); return fs.existsSync(d) ? fs.readdirSync(d).sort() : []; };
  return { tmp, root, userData, clock, h, note, write, save, versions };
}

const LONG = 'Mötesanteckningar: budget, tidplan, vem gör vad, och allt det andra vi pratade om.\n';

test('history: version names carry the time they were kept', () => {
  const t = new Date(2026, 9, 9, 14, 32, 5).getTime();
  assert.equal(stampOf(t), '2026-10-09 14-32-05');
  assert.equal(timeOf('2026-10-09 14-32-05.md'), t);
  assert.equal(timeOf('2026-10-09 14-32-05 (2).txt'), t + 2);
  assert.equal(timeOf('notes.md'), null);
  assert.equal(timeOf('../2026-10-09 14-32-05.md'), null);
});

test('history: a note in the notes folder keeps its history beside it, mirrored by path', () => {
  const { root, userData, h, note } = setup();
  assert.equal(h.dirFor(note), path.join(root, HISTORY_DIR, 'Osorterat', '2026-10-09 Möte.md'));
  const loose = path.join(os.tmpdir(), 'lös fil.md');
  assert.ok(h.dirFor(loose).startsWith(path.join(userData, 'history') + path.sep));
  assert.equal(h.dirFor(path.join(root, HISTORY_DIR, 'x.md')), null, 'history files have no history');
});

test('history: a save keeps the old text at most every five minutes', async () => {
  const { clock, write, save, versions, note } = setup();
  write(note, 'v1 ' + LONG);
  await save(note, 'v2 ' + LONG);
  assert.equal(versions(note).length, 1, 'the first save keeps the text it replaces');
  clock.t += 1 * MIN;
  await save(note, 'v3 ' + LONG);
  assert.equal(versions(note).length, 1, 'not again within five minutes');
  clock.t += 5 * MIN;
  await save(note, 'v4 ' + LONG);
  assert.equal(versions(note).length, 2);
});

test('history: a save that removes more than half of the text keeps it at once', async () => {
  const { clock, h, write, save, versions, note } = setup();
  write(note, LONG + LONG);
  await save(note, LONG + LONG + 'x');
  clock.t += 30 * 1000;
  await save(note, '# \nProjekt: Osorterat · Skapad: 2026-10-09 14:00\n\n');
  const list = await h.list(note);
  assert.equal(list.length, 2);
  assert.equal(await h.read(note, list[0].id), LONG + LONG + 'x', 'the text before the wipe is there');
  assert.equal(versions(note).length, 2);
});

test('history: the same text is not kept twice; empty text is not kept', async () => {
  const { clock, h, write, versions, note } = setup();
  write(note, LONG);
  assert.equal(await h.snapshot(note), true);
  clock.t += 10 * MIN;
  assert.equal(await h.snapshot(note), false);
  write(note, '   \n');
  assert.equal(await h.snapshot(note), false);
  assert.equal(versions(note).length, 1);
});

test('history: a restore keeps the text it replaces, even text not on disk', async () => {
  const { h, write, note } = setup();
  write(note, LONG);
  await h.snapshot(note, 'unsaved text in the editor');
  const list = await h.list(note);
  assert.equal(await h.read(note, list[0].id), 'unsaved text in the editor');
});

test('history: two versions in the same second get distinct names', async () => {
  const { h, write, versions, note } = setup();
  write(note, 'a ' + LONG);
  await h.snapshot(note);
  await h.snapshot(note, 'b ' + LONG);
  assert.deepEqual(versions(note), ['2026-10-09 14-00-00 (2).md', '2026-10-09 14-00-00.md']);
  const list = await h.list(note);
  assert.equal(await h.read(note, list[0].id), 'b ' + LONG, 'the later one is listed first');
});

test('history: a moved note or project takes its history along, merging into an old one', async () => {
  const { root, clock, h, write, versions, note } = setup();
  write(note, LONG);
  await h.snapshot(note);
  const moved = path.join(root, 'Enlantis', '2026-10-09 Möte.md');
  await h.follow(note, moved);
  assert.equal(versions(note).length, 0);
  assert.equal(versions(moved).length, 1);
  assert.ok(!fs.existsSync(path.join(root, HISTORY_DIR, 'Osorterat')), 'an emptied folder goes');
  // The whole project renamed.
  await h.follow(path.join(root, 'Enlantis'), path.join(root, 'Hemma'));
  const renamed = path.join(root, 'Hemma', '2026-10-09 Möte.md');
  assert.equal(versions(renamed).length, 1);
  // A new note with the old name gets history, then the moved one comes back: both histories stay.
  fs.mkdirSync(path.join(root, 'Osorterat'), { recursive: true });
  write(note, 'other ' + LONG);
  await h.snapshot(note);
  clock.t += 1000;
  await h.follow(renamed, note);
  assert.equal(versions(note).length, 2);
});

test('history: a loose file moved into the notes folder brings its history', async () => {
  const { tmp, root, h, write, versions } = setup();
  const loose = path.join(tmp, 'lös.md');
  write(loose, LONG);
  await h.snapshot(loose);
  const into = path.join(root, 'Osorterat', 'lös.md');
  await h.follow(loose, into);
  assert.equal(versions(into).length, 1);
});

test('history: snapshotTree keeps every note of a folder before it is deleted', async () => {
  const { root, h, write, versions } = setup();
  const a = path.join(root, 'Proj', 'a.md');
  const b = path.join(root, 'Proj', 'b.txt');
  fs.mkdirSync(path.dirname(a), { recursive: true });
  write(a, 'A ' + LONG); write(b, 'B ' + LONG);
  fs.writeFileSync(path.join(root, 'Proj', 'bild.png'), 'x');
  await h.snapshotTree(path.join(root, 'Proj'));
  assert.equal(versions(a).length, 1);
  assert.equal(versions(b).length, 1);
  assert.ok(versions(b)[0].endsWith('.txt'));
});

test('history: retention keeps a day of everything, a week of hours, a month of days', () => {
  const now = new Date(2026, 9, 31, 12, 0, 0).getTime();
  const v = (ago, n = '') => ({ name: stampOf(now - ago) + n + '.md', time: now - ago });
  const list = [
    v(1 * MIN), v(6 * MIN), v(23 * HOUR),              // last day: all
    v(2 * DAY + 5 * MIN), v(2 * DAY + 15 * MIN, 'b'),   // same hour two days ago: newest only
    v(3 * DAY), v(10 * DAY), v(10 * DAY + 2 * HOUR),    // 10 days ago, same day: newest only
    v(31 * DAY)                                         // gone
  ].sort((a, b) => b.time - a.time);
  const keep = keepSet(list, now);
  assert.deepEqual(list.map((x) => keep.has(x.name)), [true, true, true, true, false, true, true, false, false]);
});

test('history: pruneAll applies retention everywhere and removes emptied folders', async () => {
  const { root, clock, h, write, versions, note } = setup();
  write(note, LONG);
  await h.snapshot(note);
  const gone = path.join(root, 'Raderat', 'x.md');
  fs.mkdirSync(path.dirname(gone), { recursive: true });
  write(gone, LONG);
  await h.snapshot(gone);
  fs.rmSync(path.dirname(gone), { recursive: true });
  clock.t += 31 * DAY;
  await h.pruneAll();
  assert.equal(versions(note).length, 0);
  assert.ok(!fs.existsSync(path.join(root, HISTORY_DIR, 'Raderat')));
});

test('history: read accepts only a version name of that note', async () => {
  const { h, write, note } = setup();
  write(note, LONG);
  await h.snapshot(note);
  assert.equal(await h.read(note, '../../.notera.json'), null);
  assert.equal(await h.read(note, 'secret.md'), null);
  const [v] = await h.list(note);
  assert.equal(await h.read(note, v.id), LONG);
});
