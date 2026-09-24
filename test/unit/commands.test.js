const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../../src/shared/commands');
const { LOCALES } = require('../../src/shared/strings');

const ev = (keyCode, mods = {}, extra = {}) => ({ keyCode, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, code: '', key: '', ...mods, ...extra });

test('normalize orders modifiers and aliases keys', () => {
  assert.equal(c.normalize('shift+alt+up'), 'Shift+Alt+Up');
  assert.equal(c.normalize('Alt+Shift+ArrowDown'), 'Shift+Alt+Down');
  assert.equal(c.normalize('CmdOrCtrl+shift+k'), 'Ctrl+Shift+K');
  assert.equal(c.normalize('Ctrl+='), 'Ctrl+Plus');
  assert.equal(c.normalize('Ctrl++'), 'Ctrl+Plus');
  assert.equal(c.normalize('ctrl+f4'), 'Ctrl+F4');
  assert.equal(c.normalize('Ctrl+Shift'), null);
  assert.equal(c.normalize(''), null);
});

test('fromEvent uses the virtual key code, so layouts agree', () => {
  assert.equal(c.fromEvent(ev(75, { ctrlKey: true, shiftKey: true }, { key: 'K' })), 'Ctrl+Shift+K');
  assert.equal(c.fromEvent(ev(38, { altKey: true }, { key: 'ArrowUp' })), 'Alt+Up');
  // Swedish "+" key reports VK_OEM_PLUS (187) and key "+": zoom in, not zoom out.
  assert.equal(c.fromEvent(ev(187, { ctrlKey: true }, { key: '+', code: 'Minus' })), 'Ctrl+Plus');
  assert.equal(c.fromEvent(ev(189, { ctrlKey: true }, { key: '-', code: 'Slash' })), 'Ctrl+-');
  // Ctrl+Shift+7 on a Swedish keyboard produces "/" but is still Ctrl+Shift+7.
  assert.equal(c.fromEvent(ev(55, { ctrlKey: true, shiftKey: true }, { key: '/' })), 'Ctrl+Shift+7');
  assert.equal(c.fromEvent(ev(107, { ctrlKey: true }, { key: '+', code: 'NumpadAdd' })), 'Ctrl+NumAdd');
  assert.equal(c.fromEvent(ev(116, {}, { key: 'F5' })), 'F5');
  assert.equal(c.fromEvent(ev(17, { ctrlKey: true }, { key: 'Control' })), null);
});

test('only bindings with Ctrl, Alt, Meta or a function key are allowed', () => {
  assert.ok(c.isAllowed('Ctrl+B'));
  assert.ok(c.isAllowed('Alt+Up'));
  assert.ok(c.isAllowed('F7'));
  assert.ok(c.isAllowed('Shift+Insert'));
  assert.ok(!c.isAllowed('B'));
  assert.ok(!c.isAllowed('Shift+B'));
  assert.ok(!c.isAllowed('Ctrl+Escape'));
});

test('overrides replace defaults, and a list equal to the defaults drops the override', () => {
  let o = c.withBinding({}, 'bold', ['Ctrl+Shift+B']);
  assert.deepEqual(o, { bold: ['Ctrl+Shift+B'] });
  let b = c.effectiveBindings(o);
  assert.deepEqual(b.bold, ['Ctrl+Shift+B']);
  assert.deepEqual(b.italic, ['Ctrl+I']);
  assert.equal(c.keyMap(b).get('Ctrl+Shift+B'), 'bold');
  assert.equal(c.keyMap(b).has('Ctrl+B'), false);
  o = c.withBinding(o, 'bold', ['ctrl+b']);
  assert.deepEqual(o, {});
  o = c.withBinding({}, 'bold', []);
  assert.deepEqual(c.effectiveBindings(o).bold, []);
  assert.ok(c.isCustomized(o, 'bold'));
});

test('conflict finds the other command using a key', () => {
  const b = c.effectiveBindings({});
  assert.equal(c.conflict(b, 'Ctrl+B', 'italic'), 'bold');
  assert.equal(c.conflict(b, 'Ctrl+B', 'bold'), null);
  assert.equal(c.conflict(b, 'Ctrl+Alt+J', 'bold'), null);
});

test('default bindings are unique, valid and have menu accelerators', () => {
  const seen = new Map();
  for (const cmd of c.COMMANDS) {
    for (const k of cmd.keys) {
      const n = c.normalize(k);
      assert.ok(n, `${cmd.id}: ${k}`);
      assert.ok(c.isAllowed(n), `${cmd.id}: ${k} allowed`);
      assert.ok(!seen.has(n), `${n} used by ${seen.get(n)} and ${cmd.id}`);
      seen.set(n, cmd.id);
    }
  }
  assert.equal(c.toAccelerator('Ctrl+Plus'), 'Ctrl+Plus');
  assert.equal(c.toAccelerator('Shift+Alt+Up'), 'Shift+Alt+Up');
  assert.equal(c.toAccelerator('Ctrl+NumAdd'), 'Ctrl+numadd');
  assert.equal(c.display('Ctrl+Plus'), 'Ctrl++');
  assert.equal(c.display('Shift+Alt+Up'), 'Shift+Alt+↑');
});

test('every command has an English and Swedish label', () => {
  for (const loc of ['en', 'sv']) {
    for (const cmd of c.COMMANDS) {
      const v = cmd.label.split('.').reduce((o, k) => (o ? o[k] : undefined), LOCALES[loc]);
      assert.equal(typeof v, 'string', `${loc} ${cmd.label}`);
    }
  }
});
