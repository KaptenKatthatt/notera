'use strict';
// Encoding + line-ending handling for reading and writing files.
// Internally the editor always works with "\n"; the original EOL and
// encoding are remembered per tab and re-applied on save.

const ENCODINGS = ['utf8', 'utf8bom', 'utf16le', 'utf16be', 'ansi'];

// windows-1252 code points for bytes 0x80..0x9F (undefined slots map to U+FFFD on decode, '?' on encode)
const CP1252_HIGH = [
  0x20ac, undefined, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, undefined, 0x017d, undefined,
  undefined, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, undefined, 0x017e, 0x0178
];
const CP1252_REVERSE = new Map();
CP1252_HIGH.forEach((cp, i) => { if (cp !== undefined) CP1252_REVERSE.set(cp, 0x80 + i); });

function decodeAnsi(buf) {
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b >= 0x80 && b <= 0x9f) {
      const cp = CP1252_HIGH[b - 0x80];
      out += cp === undefined ? '�' : String.fromCharCode(cp);
    } else out += String.fromCharCode(b);
  }
  return out;
}

function encodeAnsi(text) {
  const out = Buffer.alloc(text.length);
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) out[n++] = cp;
    else if (CP1252_REVERSE.has(cp)) out[n++] = CP1252_REVERSE.get(cp);
    else out[n++] = 0x3f; // '?'
  }
  return out.subarray(0, n);
}

function swapBytes(buf) {
  const out = Buffer.from(buf);
  for (let i = 0; i + 1 < out.length; i += 2) { const t = out[i]; out[i] = out[i + 1]; out[i + 1] = t; }
  return out;
}

/** @returns {{ text: string, encoding: string }} */
function decode(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: buf.subarray(3).toString('utf8'), encoding: 'utf8bom' };
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: buf.subarray(2).toString('utf16le'), encoding: 'utf16le' };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return { text: swapBytes(buf.subarray(2)).toString('utf16le'), encoding: 'utf16be' };
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return { text, encoding: 'utf8' };
  } catch {
    return { text: decodeAnsi(buf), encoding: 'ansi' };
  }
}

function encode(text, encoding) {
  switch (encoding) {
    case 'utf8bom': return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]);
    case 'utf16le': return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
    case 'utf16be': return Buffer.concat([Buffer.from([0xfe, 0xff]), swapBytes(Buffer.from(text, 'utf16le'))]);
    case 'ansi': return encodeAnsi(text);
    default: return Buffer.from(text, 'utf8');
  }
}

/** Detect dominant line ending. Falls back to the platform default when the text has no newlines. */
function detectEol(text, platformDefault) {
  let crlf = 0, lf = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) { if (i > 0 && text.charCodeAt(i - 1) === 13) crlf++; else lf++; }
  }
  if (crlf === 0 && lf === 0) return platformDefault;
  return crlf >= lf ? 'CRLF' : 'LF';
}

function normalizeEol(text) { return text.replace(/\r\n?/g, '\n'); }
function applyEol(text, eol) { return eol === 'CRLF' ? text.replace(/\n/g, '\r\n') : text; }

function readBuffer(buf, platformDefault) {
  const { text, encoding } = decode(buf);
  const eol = detectEol(text, platformDefault);
  return { text: normalizeEol(text), encoding, eol };
}

function writeBuffer(text, encoding, eol) {
  return encode(applyEol(normalizeEol(text), eol), encoding);
}

function kindForPath(p) {
  const m = /\.([a-z0-9]+)$/i.exec(p || '');
  const ext = m ? m[1].toLowerCase() : '';
  if (['md', 'markdown', 'mdown', 'mkd', 'mdx'].includes(ext)) return 'md';
  return 'txt';
}

module.exports = { ENCODINGS, decode, encode, detectEol, normalizeEol, applyEol, readBuffer, writeBuffer, kindForPath, decodeAnsi, encodeAnsi };
