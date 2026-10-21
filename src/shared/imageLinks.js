'use strict';
// Images in notes: the Markdown links that point at them, how a relative link becomes a file on
// disk, and the URL the window loads that file over (notera-file://img/<encoded absolute path>,
// served by main/images.js). CommonJS so main.js can require it and esbuild can bundle it into
// the renderer; no Node modules, since the renderer has none.

const IMAGE_SCHEME = 'notera-file';
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|avif|svg)$/i;
// A line that is nothing but one image: `![alt](path)`, `![alt](<path with spaces>)`, an optional "title".
const IMAGE_LINE_RE = /^\s*!\[([^\]]*)\]\(\s*(<[^>]*>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)\s*$/;
// Every image link in a text, in order.
const IMAGE_LINK_RE = /!\[([^\]]*)\]\(\s*(<[^>]*>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;

/** `https:`, `data:`, `file:`, `c:` (one letter is a Windows drive, not a scheme). */
function hasScheme(href) { return /^[a-z][a-z0-9+.-]+:/i.test(href); }

function isWindowsPath(p) { return /^[A-Za-z]:[\\/]/.test(p) || /^\\\\/.test(p); }
function isAbsolutePath(p) { return isWindowsPath(p) || p.startsWith('/'); }

/** The link's target as it was written, without the `<>` of a spaced path and percent-encoding undone. */
function hrefTarget(href) {
  let h = String(href || '').trim();
  if (h.startsWith('<') && h.endsWith('>')) h = h.slice(1, -1);
  try { h = decodeURIComponent(h); } catch { /* a stray %: keep it as written */ }
  return h;
}

/** The folder of a file path, with the separator the path uses. */
function dirOf(p) {
  const s = String(p || '');
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return i < 0 ? '' : s.slice(0, i);
}
function baseOf(p) { return String(p || '').split(/[\\/]/).pop() || ''; }

/** Resolve `.` and `..` without touching the disk. */
function normalize(p, sep) {
  const win = sep === '\\';
  let prefix = '';
  let rest = p;
  const m = win ? /^([A-Za-z]:|\\\\[^\\]+\\[^\\]+)?(.*)$/.exec(p) : null;
  if (m && m[1]) { prefix = m[1]; rest = m[2]; }
  const rooted = /^[\\/]/.test(rest);
  const out = [];
  for (const part of rest.split(/[\\/]+/)) {
    if (!part || part === '.') continue;
    if (part === '..') { if (out.length) out.pop(); continue; }
    out.push(part);
  }
  return prefix + (rooted ? sep : '') + out.join(sep);
}

/**
 * The file a link in a note points at, as an absolute path, or null when the link is a URL, or
 * relative without a folder to be relative to. The separator follows the note's own path.
 * @param {string} href @param {string | null | undefined} baseDir the note's folder
 */
function resolveImagePath(href, baseDir) {
  const h = hrefTarget(href);
  if (!h || h.startsWith('//') || hasScheme(h)) return null;
  const base = String(baseDir || '');
  const sep = isWindowsPath(base) || base.includes('\\') || isWindowsPath(h) ? '\\' : '/';
  if (isAbsolutePath(h)) return normalize(h.replace(/[\\/]/g, sep), sep);
  if (!base) return null;
  return normalize(base + sep + h.replace(/[\\/]/g, sep), sep);
}

/** The URL the window loads a file over. */
function imageUrl(absPath) { return `${IMAGE_SCHEME}://img/${encodeURIComponent(absPath)}`; }

/** The absolute path a notera-file URL names, or null for anything else. */
function pathFromUrl(url) {
  let u;
  try { u = new URL(String(url)); } catch { return null; }
  if (u.protocol !== `${IMAGE_SCHEME}:` || u.hostname !== 'img') return null;
  try { return decodeURIComponent(u.pathname.replace(/^\/+/, '')); } catch { return null; }
}

/**
 * The images a text links, in order: { alt, href, target } with the target as written (no `<>`,
 * percent-encoding undone).
 * @param {string} text
 */
function imageLinks(text) {
  const out = [];
  for (const m of String(text || '').matchAll(IMAGE_LINK_RE)) out.push({ alt: m[1], href: m[2], target: hrefTarget(m[2]) });
  return out;
}

/** The one image a line consists of, or null. */
function imageLine(lineText) {
  const m = IMAGE_LINE_RE.exec(lineText);
  return m ? { alt: m[1], href: m[2], target: hrefTarget(m[2]) } : null;
}

/**
 * A file name stem from a note's title: letters (åäö too) and digits kept, lower-cased, everything
 * else a single dash. Empty when the title has nothing to keep.
 */
function slugOf(title) {
  return String(title || '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}

const META_LINE_RE = /^(?:Projekt|Project): .* · (?:Skapad|Created): /;

/**
 * Where an image line goes when the cursor is at `pos` in `doc`: on a line of its own, with a blank
 * line before and after when the neighbours are not blank, never inside a note's header, and the
 * cursor on the blank line after it. Returns the change and the cursor position after it.
 * @param {string} doc @param {number} pos @param {string} text the `![alt](link)` line
 */
function insertImageText(doc, pos, text) {
  const lines = doc.split('\n');
  const starts = [];
  for (let i = 0, p = 0; i < lines.length; i++) { starts.push(p); p += lines[i].length + 1; }
  let p = Math.max(0, Math.min(pos, doc.length));
  let ln = starts.findIndex((s, i) => i === starts.length - 1 || starts[i + 1] > p);
  // The heading and the header line stay first: an image pasted there goes under the header.
  if (ln <= 1 && lines.length >= 2 && /^#\s/.test(lines[0]) && META_LINE_RE.test(lines[1])) { ln = 1; p = starts[1] + lines[1].length; }
  const line = lines[ln];
  const lineStart = starts[ln];
  const lineEnd = lineStart + line.length;
  const last = ln === lines.length - 1;
  const prevBlank = ln === 0 || lines[ln - 1].trim() === '';
  const nextBlank = !last && lines[ln + 1].trim() === '';
  const before = prevBlank ? '' : '\n';
  if (line.trim() === '') {
    // On a blank line: the image takes the line; a blank line follows (the next one, or a new one).
    const insert = before + text + (nextBlank ? '' : '\n');
    return { from: lineStart, to: lineEnd, insert, cursor: lineStart + insert.length + (nextBlank ? 1 : 0) };
  }
  if (p === lineEnd) {
    const insert = '\n\n' + text + (nextBlank ? '' : '\n');
    return { from: p, to: p, insert, cursor: p + insert.length + (nextBlank ? 1 : 0) };
  }
  if (p === lineStart) {
    const insert = before + text + '\n\n';
    return { from: p, to: p, insert, cursor: p + insert.length - 1 };
  }
  const insert = '\n\n' + text + '\n\n';
  return { from: p, to: p, insert, cursor: p + insert.length - 1 };
}

module.exports = { IMAGE_SCHEME, slugOf, insertImageText, IMAGE_EXT_RE, IMAGE_LINE_RE, hasScheme, hrefTarget, dirOf, baseOf, resolveImagePath, imageUrl, pathFromUrl, imageLinks, imageLine };
