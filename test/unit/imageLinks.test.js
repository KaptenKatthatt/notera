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
