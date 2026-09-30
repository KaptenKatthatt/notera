const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../../src/shared/templates');
const H = require('../../src/shared/noteHeader');
const { makeT } = require('../../src/shared/strings');

const when = new Date(2026, 8, 30, 9, 2);

test('platshållare: svenska och engelska, okända lämnas orörda', () => {
  const out = T.fillPlaceholders('{{datum}} {{date}} {{tid}} {{time}} {{projekt}} {{project}} {{annat}} {{ DATUM }}', { date: when, project: 'Enlantis' });
  assert.equal(out, '2026-09-30 2026-09-30 09:02 09:02 Enlantis Enlantis {{annat}} 2026-09-30');
});

test('standup-mallen på svenska och engelska', () => {
  assert.equal(T.standupTemplate(makeT('sv'), 'sv'), '# Standup {{datum}}\n\n## Gjort sen sist\n\n\n## Blockers\n\n\n## Göra till nästa möte\n');
  assert.equal(T.standupTemplate(makeT('en'), 'en'), '# Standup {{date}}\n\n## Done since last\n\n\n## Blockers\n\n\n## To do for next meeting\n');
});

test('anteckning från mall: rubrik, metarad, resten; markören under första underrubriken', () => {
  const r = T.noteFromTemplate(T.standupTemplate(makeT('sv'), 'sv'), { locale: 'sv', project: 'Standupanteckningar', date: when });
  assert.equal(r.text, '# Standup 2026-09-30\nProjekt: Standupanteckningar · Skapad: 2026-09-30 09:02\n\n## Gjort sen sist\n\n\n## Blockers\n\n\n## Göra till nästa möte\n');
  assert.equal(r.text.slice(0, r.cursor), '# Standup 2026-09-30\nProjekt: Standupanteckningar · Skapad: 2026-09-30 09:02\n\n## Gjort sen sist\n');
  assert.deepEqual(H.parseMeta(r.text), { project: 'Standupanteckningar', created: '2026-09-30 09:02', locale: 'sv' });
});

test('mall utan rubrik: tom "# " överst, metarad, mallen; markören efter "# "', () => {
  const r = T.noteFromTemplate('- [ ] punkt\n', { locale: 'en', project: 'P', date: when });
  assert.equal(r.text, '# \nProject: P · Created: 2026-09-30 09:02\n\n- [ ] punkt\n');
  assert.equal(r.cursor, 2);
});

test('mall med rubrik men utan underrubrik: markören sist', () => {
  const r = T.noteFromTemplate('# Möte {{datum}}\n\nAgenda\n', { locale: 'sv', project: 'P', date: when });
  assert.equal(r.text, '# Möte 2026-09-30\nProjekt: P · Skapad: 2026-09-30 09:02\n\nAgenda\n');
  assert.equal(r.cursor, r.text.length);
});

test('filnamn: datumet upprepas inte när titeln redan har det', () => {
  assert.equal(H.baseName('2026-09-30', 'Standup 2026-09-30', 'U'), '2026-09-30 Standup');
  assert.equal(H.baseName('2026-09-30', '2026-09-30', 'U'), '2026-09-30');
  assert.equal(H.baseName('2026-09-30', 'Standup 2026-10-01', 'U'), '2026-09-30 Standup 2026-10-01');
  assert.equal(H.baseName('2026-09-30', 'Planering', 'U'), '2026-09-30 Planering');
});

test('sorteringsdatum: rubrik, sedan Skapad, sedan filnamn, sedan ändringstid', () => {
  assert.deepEqual(H.sortDateOf('# Standup 2026-10-01\nProjekt: S · Skapad: 2026-09-30 09:02\n', 'x.md', 0), { date: '2026-10-01', created: '2026-09-30 09:02' });
  assert.equal(H.sortDateOf('# Standup\nProjekt: S · Skapad: 2026-09-30 09:02\n', 'x.md', 0).date, '2026-09-30');
  assert.equal(H.sortDateOf('# Standup 30/9\n', '2026-09-28 Standup.md', 0).date, '2026-09-28');
  assert.equal(H.sortDateOf('text', 'x.md', new Date(2026, 0, 5, 12).getTime()).date, '2026-01-05');
});
