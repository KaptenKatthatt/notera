const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveLocale, makeT, LOCALES } = require('../../src/shared/strings');

test('resolveLocale prefers the explicit setting, else system language', () => {
  assert.equal(resolveLocale('sv', 'en-US'), 'sv');
  assert.equal(resolveLocale('auto', 'sv-SE'), 'sv');
  assert.equal(resolveLocale('auto', 'de-DE'), 'en');
  assert.equal(resolveLocale(undefined, undefined), 'en');
});

test('makeT interpolates and falls back to English', () => {
  const t = makeT('sv');
  assert.equal(t('ui.line', { line: 3, col: 7 }), 'Rad 3, kol 7');
  assert.equal(t('nonexistent.key'), 'nonexistent.key');
});

test('every English key has a Swedish translation', () => {
  const walk = (o, prefix = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? walk(v, prefix + k + '.') : [prefix + k]));
  const en = walk(LOCALES.en), sv = new Set(walk(LOCALES.sv));
  const missing = en.filter((k) => !sv.has(k));
  assert.deepEqual(missing, []);
});
