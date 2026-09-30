'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { effectiveBindings, ctrlWTarget, withCtrlW, BY_ID } = require('../../src/shared/commands');

test('the palette and theme commands are registered, Ctrl+Shift+P opens the palette', () => {
  assert.deepEqual(BY_ID.commandPalette.keys, ['Ctrl+Shift+P']);
  for (const id of ['pickTheme', 'newThemeFromCurrent', 'openThemesFolder', 'openSettingsJson', 'effects']) assert.ok(BY_ID[id], id);
  const owners = Object.entries(effectiveBindings({})).filter(([, keys]) => keys.includes('Ctrl+Shift+P'));
  assert.deepEqual(owners.map(([id]) => id), ['commandPalette'], 'no other command has Ctrl+Shift+P');
});

test('Ctrl+W moves between closing the tab and the window', () => {
  assert.equal(ctrlWTarget(effectiveBindings({})), 'tab');
  const win = withCtrlW({}, 'window');
  assert.equal(ctrlWTarget(effectiveBindings(win)), 'window');
  assert.equal(ctrlWTarget(effectiveBindings(withCtrlW(win, 'tab'))), 'tab');
});

test('fuzzy matching prefers exact, then early, then word-start matches', async () => {
  const { fuzzyMatch } = await import('../../src/renderer/quickPick.js');
  assert.equal(fuzzyMatch('xyz', 'Visa: Radbyte'), null);
  assert.ok(fuzzyMatch('neon', 'Neon').score > fuzzyMatch('neon', 'Neon Chill').score);
  assert.ok(fuzzyMatch('radb', 'Visa: Radbyte').score > fuzzyMatch('rdbt', 'Visa: Radbyte').score);
  assert.deepEqual(fuzzyMatch('vr', 'Visa: Radbyte').hits, [0, 6]);
  assert.deepEqual(fuzzyMatch('', 'x'), { score: 0, hits: [] });
});
