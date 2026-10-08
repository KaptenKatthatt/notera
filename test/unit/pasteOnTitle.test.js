const test = require('node:test');
const assert = require('node:assert/strict');
const { pasteOnTitle, parseMeta, setProject } = require('../../src/shared/noteHeader.js');

const META = 'Projekt: Osorterat · Skapad: 2026-10-08 14:00';
/** Apply what pasteOnTitle asks for (positions in the old text, applied back to front). */
function paste(doc, from, to, text) {
  const r = pasteOnTitle(doc, from, to, text);
  if (!r) return null;
  let out = doc;
  for (const c of [...r.changes].sort((a, b) => b.from - a.from)) out = out.slice(0, c.from) + c.insert + out.slice(c.to ?? c.from);
  return { text: out, cursor: r.cursor };
}

test('a new note: first line to the heading, the rest under the header', () => {
  const r = paste(`# \n${META}\n\n`, 2, 2, 'Rad ett\nRad två\nRad tre\n');
  assert.equal(r.text, `# Rad ett\n${META}\n\nRad två\nRad tre\n`);
  assert.equal(r.cursor, r.text.length);
});

test('the header stays where a move looks for it, so a move gives one header line', () => {
  const r = paste(`# \n${META}\n\n`, 2, 2, 'Rad ett\nRad två\nRad tre\nRad fyra\n');
  assert.equal(parseMeta(r.text).project, 'Osorterat');
  const moved = setProject(r.text, 'Enlantis');
  assert.equal(moved.match(/^Projekt: /gm).length, 1);
  assert.match(moved, /^# Rad ett\nProjekt: Enlantis · Skapad: 2026-10-08 14:00\n\nRad två/);
});

test('a body already there: the pasted lines go on top of it', () => {
  const r = paste(`# \n${META}\n\nGammal text\n`, 2, 2, 'Titel\nNy rad');
  assert.equal(r.text, `# Titel\n${META}\n\nNy rad\nGammal text\n`);
  assert.equal(r.text.slice(r.cursor), '\nGammal text\n');
});

test('header line with text right under it, or nothing after it', () => {
  assert.equal(paste(`# \n${META}\nText`, 2, 2, 'A\nB\n').text, `# A\n${META}\n\nB\nText`);
  assert.equal(paste(`# \n${META}`, 2, 2, 'A\nB').text, `# A\n${META}\n\nB`);
  assert.equal(paste(`# \n${META}\n`, 2, 2, 'A\nB').text, `# A\n${META}\n\nB`);
});

test('a pasted Markdown heading into an empty heading keeps one hash; blank lines after it go', () => {
  assert.equal(paste(`# \n${META}\n\n`, 2, 2, '# Rapport\n\nBrödtext\n').text, `# Rapport\n${META}\n\nBrödtext\n`);
  assert.equal(paste(`# Gammal\n${META}\n\n`, 8, 8, '# X\nY').text, `# Gammal# X\n${META}\n\nY`);
});

test('a selection in the heading is replaced; one line plus a newline only sets the heading', () => {
  assert.equal(paste(`# Gammal\n${META}\n\n`, 2, 8, 'Ny\nKropp').text, `# Ny\n${META}\n\nKropp`);
  const r = paste(`# \n${META}\n\n`, 2, 2, 'Bara titel\n');
  assert.equal(r.text, `# Bara titel\n${META}\n\n`);
  assert.equal(r.cursor, '# Bara titel'.length);
});

test('everything else pastes as it comes', () => {
  assert.equal(pasteOnTitle(`# \n${META}\n\n`, 2, 2, 'En rad'), null, 'a single line');
  assert.equal(pasteOnTitle(`# \n${META}\n\nText`, 20, 20, 'A\nB'), null, 'not on the heading line');
  assert.equal(pasteOnTitle(`# \n${META}\n\n`, 2, 10, 'A\nB'), null, 'a selection past the heading');
  assert.equal(pasteOnTitle('# \nIngen rubrikrad\n', 2, 2, 'A\nB'), null, 'no header line');
  assert.equal(pasteOnTitle('Vanlig text\n', 0, 0, 'A\nB'), null, 'not a note');
  assert.equal(pasteOnTitle(`# \n${META}\n`, 0, 0, 'A\nB'), null, 'before the hash');
});
