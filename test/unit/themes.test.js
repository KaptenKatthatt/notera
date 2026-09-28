'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { THEMES, themeSource, skinOf } = require('../../src/shared/themes');
const { makeT } = require('../../src/shared/strings');

test('named themes run Electron in their own scheme, the base settings pass through', () => {
  assert.equal(themeSource('those-guys'), 'dark');
  assert.equal(themeSource('other-guys'), 'dark');
  for (const base of ['system', 'light', 'dark']) assert.equal(themeSource(base), base);
  assert.equal(themeSource(undefined), 'system');
  assert.equal(themeSource('no-such-theme'), 'system');
});

test('only named themes set a skin', () => {
  assert.equal(skinOf('those-guys'), 'those-guys');
  assert.equal(skinOf('dark'), '');
  assert.equal(skinOf('__proto__'), '');
});

test('every named theme has a menu label in both languages', () => {
  for (const locale of ['en', 'sv']) {
    const t = makeT(locale);
    for (const th of Object.values(THEMES)) assert.notEqual(t(th.label), th.label, `${locale}: ${th.label}`);
  }
});
