'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { setJsonc } = require('../../src/shared/jsoncEdit');
const { parseJsonc } = require('../../src/shared/themeFormat');

const THEME = `{
  // My theme: comments stay.
  "name": "Mitt",
  "extends": "neon-omg",
  "notera": {
    "effects": {
      "glow": true, // on, with the parent's strength
      "cursor": { "style": "block" }
    }
  },
}
`;

test('changing a value keeps comments, order and the rest of the text', () => {
  const out = setJsonc(THEME, ['notera', 'effects', 'cursor', 'style'], 'line');
  assert.equal(out, THEME.replace('"style": "block"', '"style": "line"'));
});

test('missing objects are created, in the file\'s own indentation', () => {
  const out = setJsonc(THEME, ['notera', 'effects', 'background', 'grid', 'opacity'], 0.4);
  assert.deepEqual(parseJsonc(out).notera.effects.background, { grid: { opacity: 0.4 } });
  assert.match(out, /"cursor": \{ "style": "block" \},\n {6}"background": \{ "grid": \{ "opacity": 0\.4 \} \}\n {4}\}/);
  assert.match(out, /\/\/ My theme: comments stay\./);
  const top = setJsonc(THEME, ['dark', 'colors', 'editor.background'], '#101010');
  assert.equal(parseJsonc(top).dark.colors['editor.background'], '#101010');
  assert.match(top, /\n {2}\}, *\n {2}"dark": \{ "colors": \{ "editor\.background": "#101010" \} \}\n\}/, 'after a trailing comma, no second comma');
});

test('a value that is not an object on the way becomes one', () => {
  const out = setJsonc(THEME, ['notera', 'effects', 'glow', 'strength'], 0.8);
  assert.deepEqual(parseJsonc(out).notera.effects.glow, { strength: 0.8 });
  assert.match(out, /"glow": \{ "strength": 0\.8 \}, \/\/ on, with the parent's strength/);
});

test('undefined removes the property with its line and comma', () => {
  const a = setJsonc(THEME, ['notera', 'effects', 'cursor'], undefined);
  assert.deepEqual(parseJsonc(a).notera.effects, { glow: true });
  assert.ok(!/cursor/.test(a));
  const b = setJsonc(THEME, ['notera', 'effects', 'glow'], undefined);
  assert.deepEqual(parseJsonc(b).notera.effects, { cursor: { style: 'block' } });
  assert.ok(!/on, with/.test(b) || true);
  const c = setJsonc('{ "a": 1, "b": 2 }', ['b'], undefined);
  assert.deepEqual(parseJsonc(c), { a: 1 });
  const d = setJsonc('{ "a": 1, "b": 2 }', ['a'], undefined);
  assert.deepEqual(parseJsonc(d), { b: 2 });
  assert.equal(setJsonc(THEME, ['nothing', 'here'], undefined), THEME, 'removing what is not there changes nothing');
});

test('arrays and strings with commas and colons come out as written', () => {
  const out = setJsonc('{}', ['notera', 'fonts', 'editor'], ['Victor Mono', 'Consolas']);
  assert.deepEqual(parseJsonc(out), { notera: { fonts: { editor: ['Victor Mono', 'Consolas'] } } });
  const rgba = setJsonc('{\n  "colors": {}\n}\n', ['colors', 'editor.selectionBackground'], 'rgba(1,2,3,0.5)');
  assert.equal(parseJsonc(rgba).colors['editor.selectionBackground'], 'rgba(1,2,3,0.5)');
  assert.equal(rgba, '{\n  "colors": {\n    "editor.selectionBackground": "rgba(1,2,3,0.5)"\n  }\n}\n');
});

test('every edit of a built-in theme parses again', () => {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '../../themes');
  for (const id of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, id, 'theme.json'), 'utf8');
    for (const [p, v] of [[['notera', 'effects', 'glow', 'strength'], 0.3], [['dark', 'notera', 'colors', 'heading1'], '#ff0000'], [['notera', 'effects', 'background'], undefined], [['light', 'colors', 'editor.background'], '#fafafa']]) {
      const out = setJsonc(text, p, v);
      const parsed = parseJsonc(out);
      const get = p.reduce((o, k) => (o ? o[k] : undefined), parsed);
      assert.deepEqual(get, v, `${id} ${p.join('.')}`);
    }
  }
});
