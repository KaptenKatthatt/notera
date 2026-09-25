const test = require('node:test');
const assert = require('node:assert/strict');
const { TEMPLATES } = require('../../src/shared/templates');
const { makeT } = require('../../src/shared/strings');

test('standup-mallen: rubrik med datum + tre underrubriker', () => {
  const tpl = TEMPLATES.find((x) => x.id === 'standup');
  assert.ok(tpl, 'standup-mallen finns');
  const text = tpl.text(makeT('sv'));
  assert.match(text, /^# Standup \d{4}-\d{2}-\d{2}\n/);
  for (const h of ['Gjort sen sist', 'Blockers', 'Göra till nästa möte']) {
    assert.ok(text.includes('## ' + h), 'underrubrik: ' + h);
  }
  const sections = text.split(/^## /m);
  assert.ok(sections.length >= 4, 'rubrik + 3 sektioner');
});

test('standup-mallen på engelska', () => {
  const tpl = TEMPLATES.find((x) => x.id === 'standup');
  const text = tpl.text(makeT('en'));
  assert.match(text, /^# Standup \d{4}-\d{2}-\d{2}\n/);
  assert.ok(text.includes('## Done since last'));
  assert.ok(text.includes('## Blockers'));
  assert.ok(text.includes('## To do for next meeting'));
});

test('standup-header för applicera-på-dokument: # Titel: + datum/tid', () => {
  const tpl = TEMPLATES.find((x) => x.id === 'standup');
  const head = tpl.header(makeT('sv'));
  assert.match(head, /^# Titel:\n\d{4}-\d{2}-\d{2} \d{2}:\d{2}\n\n$/);
});
