const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('../../src/main/files');

test('decodes plain UTF-8 and detects LF', () => {
  const r = f.readBuffer(Buffer.from('hej\nvärld\n', 'utf8'), 'CRLF');
  assert.equal(r.encoding, 'utf8');
  assert.equal(r.eol, 'LF');
  assert.equal(r.text, 'hej\nvärld\n');
});

test('detects UTF-8 BOM and CRLF, strips BOM and normalises EOL', () => {
  const r = f.readBuffer(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('a\r\nb\r\n', 'utf8')]), 'LF');
  assert.equal(r.encoding, 'utf8bom');
  assert.equal(r.eol, 'CRLF');
  assert.equal(r.text, 'a\nb\n');
});

test('UTF-16 LE and BE round-trip', () => {
  for (const enc of ['utf16le', 'utf16be']) {
    const buf = f.writeBuffer('Räksmörgås\nrad 2', enc, 'CRLF');
    const r = f.readBuffer(buf, 'LF');
    assert.equal(r.encoding, enc);
    assert.equal(r.eol, 'CRLF');
    assert.equal(r.text, 'Räksmörgås\nrad 2');
  }
});

test('invalid UTF-8 falls back to ANSI (windows-1252)', () => {
  const buf = Buffer.from([0x52, 0xe4, 0x6b, 0x20, 0x80]); // "Räk €" in cp1252
  const r = f.readBuffer(buf, 'CRLF');
  assert.equal(r.encoding, 'ansi');
  assert.equal(r.text, 'Räk €');
  assert.deepEqual([...f.writeBuffer(r.text, 'ansi', 'LF')], [0x52, 0xe4, 0x6b, 0x20, 0x80]);
});

test('ANSI encode replaces unrepresentable characters with ?', () => {
  assert.equal(f.encodeAnsi('a→b').toString('latin1'), 'a?b');
});

test('empty file uses the platform default EOL', () => {
  assert.equal(f.readBuffer(Buffer.alloc(0), 'CRLF').eol, 'CRLF');
  assert.equal(f.readBuffer(Buffer.alloc(0), 'LF').eol, 'LF');
});

test('mixed line endings pick the majority', () => {
  assert.equal(f.detectEol('a\r\nb\r\nc\n', 'LF'), 'CRLF');
  assert.equal(f.detectEol('a\nb\nc\r\n', 'CRLF'), 'LF');
});

test('writeBuffer applies CRLF without doubling existing CRs', () => {
  assert.equal(f.writeBuffer('a\r\nb\nc', 'utf8', 'CRLF').toString('utf8'), 'a\r\nb\r\nc');
  assert.equal(f.writeBuffer('a\r\nb\nc', 'utf8', 'LF').toString('utf8'), 'a\nb\nc');
});

test('kindForPath maps markdown extensions', () => {
  assert.equal(f.kindForPath('C:\\notes\\todo.md'), 'md');
  assert.equal(f.kindForPath('/x/y.markdown'), 'md');
  assert.equal(f.kindForPath('/x/y.txt'), 'txt');
  assert.equal(f.kindForPath('/x/noext'), 'txt');
});
