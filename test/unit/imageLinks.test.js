const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../src/shared/imageLinks');

test('image links: resolving relative links against the note folder', () => {
  assert.equal(L.resolveImagePath('bilder/a.jpg', 'C:\\Notes\\Enlantis'), 'C:\\Notes\\Enlantis\\bilder\\a.jpg');
  assert.equal(L.resolveImagePath('bilder/a.jpg', '/home/j/Notes/Enlantis'), '/home/j/Notes/Enlantis/bilder/a.jpg');
  assert.equal(L.resolveImagePath('./bilder/../bilder/a.jpg', '/n/p'), '/n/p/bilder/a.jpg');
  assert.equal(L.resolveImagePath('../Osorterat/bilder/a.jpg', 'C:\\Notes\\Enlantis'), 'C:\\Notes\\Osorterat\\bilder\\a.jpg');
  assert.equal(L.resolveImagePath('<bilder/sk%C3%A4rm 1.jpg>', '/n/p'), '/n/p/bilder/skärm 1.jpg', 'angle brackets and percent-encoding');
  assert.equal(L.resolveImagePath('C:\\Elsewhere\\x.png', 'C:\\Notes\\P'), 'C:\\Elsewhere\\x.png', 'an absolute path stays');
  assert.equal(L.resolveImagePath('/abs/x.png', '/n/p'), '/abs/x.png');
  assert.equal(L.resolveImagePath('https://x.se/a.png', '/n/p'), null, 'a URL is not a file');
  assert.equal(L.resolveImagePath('data:image/png;base64,AAAA', '/n/p'), null);
  assert.equal(L.resolveImagePath('//cdn/x.png', '/n/p'), null);
  assert.equal(L.resolveImagePath('bilder/a.jpg', null), null, 'an untitled tab has no folder');
  assert.equal(L.resolveImagePath('', '/n/p'), null);
  assert.equal(L.resolveImagePath('..\\..\\..\\etc\\passwd.png', 'C:\\Notes\\P'), 'C:\\etc\\passwd.png', 'climbing stops at the root; main refuses it anyway');
});

test('image links: the URL the window loads and the path it names', () => {
  const win = 'C:\\Notes\\Enlantis\\bilder\\skärm 1.jpg';
  const url = L.imageUrl(win);
  assert.equal(url, 'notera-file://img/C%3A%5CNotes%5CEnlantis%5Cbilder%5Csk%C3%A4rm%201.jpg');
  assert.equal(L.pathFromUrl(url), win);
  assert.equal(L.pathFromUrl(L.imageUrl('/n/p/bilder/a.jpg')), '/n/p/bilder/a.jpg');
  assert.equal(L.pathFromUrl('notera-file://other/x'), null);
  assert.equal(L.pathFromUrl('https://x.se/a.png'), null);
  assert.equal(L.pathFromUrl('not a url'), null);
});

test('image links: the links in a text and a line that is one image', () => {
  const text = 'Se bild 1.\n\n![Bild 1](bilder/login-error-1.jpg)\n\nOch ![Bild 2](<bilder/med blank.jpg> "titel") mitt i. ![x](https://a/b.png)\n';
  assert.deepEqual(L.imageLinks(text).map((x) => [x.alt, x.target]), [['Bild 1', 'bilder/login-error-1.jpg'], ['Bild 2', 'bilder/med blank.jpg'], ['x', 'https://a/b.png']]);
  assert.deepEqual(L.imageLine('![Bild 1](bilder/login-error-1.jpg)'), { alt: 'Bild 1', href: 'bilder/login-error-1.jpg', target: 'bilder/login-error-1.jpg' });
  assert.deepEqual(L.imageLine('  ![](<a b.png> "t")  ').target, 'a b.png');
  assert.equal(L.imageLine('Text ![Bild 1](a.jpg)'), null, 'not alone on its line');
  assert.equal(L.imageLine('[Bild 1](a.jpg)'), null, 'a link, not an image');
  assert.equal(L.imageLine('![Bild 1](a.jpg) and more'), null);
  assert.equal(L.dirOf('C:\\a\\b.md'), 'C:\\a');
  assert.equal(L.dirOf('/a/b.md'), '/a');
  assert.equal(L.baseOf('/a/b/c.jpg'), 'c.jpg');
  assert.equal(L.hasScheme('c:\\x'), false, 'a drive letter is not a scheme');
  assert.equal(L.hasScheme('https://x'), true);
});

test('image links: a file name stem from the title', () => {
  assert.equal(L.slugOf('Login error'), 'login-error');
  assert.equal(L.slugOf('  PBI-1234: Skärmdump åäö/ÅÄÖ!  '), 'pbi-1234-skärmdump-åäö-åäö');
  assert.equal(L.slugOf('???'), '');
  assert.equal(L.slugOf(''), '');
  assert.equal(L.slugOf('a'.repeat(60)).length, 40);
  assert.equal(L.slugOf('2026-10-21 Standup'), '2026-10-21-standup');
});

test('image links: where the image line goes', () => {
  const img = '![Bild 1](bilder/a.jpg)';
  const apply = (doc, pos) => { const r = L.insertImageText(doc, pos, img); const out = doc.slice(0, r.from) + r.insert + doc.slice(r.to); return { out, cursor: r.cursor, at: out.slice(0, r.cursor) + '|' + out.slice(r.cursor) }; };
  // On a blank line between paragraphs: takes the line, the next blank line follows.
  assert.equal(apply('a\n\nb', 2).at, `a\n\n${img}\n|\nb`);
  // On a blank line with a blank line after it: no extra blank line, cursor on the next (blank) line.
  assert.equal(apply('a\n\n\nb', 2).at, `a\n\n${img}\n|\nb`);
  // On the empty last line.
  assert.equal(apply('a\n', 2).at, `a\n\n${img}\n|`);
  // Empty document.
  assert.equal(apply('', 0).at, `${img}\n|`);
  // At the end of a text line: a blank line, the image, a blank line.
  assert.equal(apply('abc\ndef', 3).at, `abc\n\n${img}\n|\ndef`);
  assert.equal(apply('abc', 3).at, `abc\n\n${img}\n|`);
  // At the start of a text line.
  assert.equal(apply('abc\ndef', 4).at, `abc\n\n${img}\n|\ndef`);
  assert.equal(apply('abc', 0).at, `${img}\n|\nabc`);
  // In the middle: the line is split.
  assert.equal(apply('abcdef', 3).at, `abc\n\n${img}\n|\ndef`);
  // On the heading or header line of a note: under the header.
  const note = '# T\nProjekt: P · Skapad: 2026-01-01 10:00\n\ntext';
  assert.equal(apply(note, 1).at, `# T\nProjekt: P · Skapad: 2026-01-01 10:00\n\n${img}\n|\ntext`);
  assert.equal(apply(note, 10).at, apply(note, 1).at);
  // A new note (header, then one empty line): the image under the header, the empty line stays after the cursor.
  assert.equal(apply('# T\nProjekt: P · Skapad: 2026-01-01 10:00\n\n', 1).at, `# T\nProjekt: P · Skapad: 2026-01-01 10:00\n\n${img}\n|\n`);
});
