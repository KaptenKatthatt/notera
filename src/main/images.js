'use strict';
// Serves the images notes link to the window over notera-file://img/<encoded absolute path>
// (see shared/imageLinks.js). Only image files, and only under the notes folder or a folder the
// window has opened a file from; everything else is 404, so a note cannot show files it has no
// business with. A file is answered with an ETag, so the window's cache asks "still the same?"
// and gets a 304 instead of the bytes again.
const path = require('path');
const fsp = require('fs/promises');
const fsSync = require('fs');
const { IMAGE_EXT_RE, pathFromUrl } = require('../shared/imageLinks');
const { writeFileAtomic } = require('./atomicWrite');

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.bmp': 'image/bmp', '.avif': 'image/avif', '.svg': 'image/svg+xml'
};

const notFound = () => new Response('Not found', { status: 404 });

/** p is dir or inside it (case-insensitive on Windows, like the file system). */
function isInside(dir, p) {
  const rel = path.relative(dir, p);
  if (!rel) return true;
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  return process.platform !== 'win32' || path.relative(dir, p).toLowerCase() === rel.toLowerCase();
}

/**
 * @param {{ roots: () => (string | null | undefined)[] }} opts folders whose images may be shown (the notes folder)
 */
function createImageServer({ roots }) {
  /** @type {Set<string>} folders of files opened in this session: their images may be shown too */
  const opened = new Set();

  /** A file was opened or saved: images next to it (and in its subfolders) may be shown. */
  function allow(file) {
    if (typeof file !== 'string' || !path.isAbsolute(file)) return;
    opened.add(path.resolve(path.dirname(file)));
  }

  function allowed(file) {
    for (const r of roots()) if (typeof r === 'string' && r && isInside(path.resolve(r), file)) return true;
    for (const d of opened) if (isInside(d, file)) return true;
    return false;
  }

  /** The file a URL names, when it may be shown; null otherwise. */
  function fileFor(url) {
    return allowedFile(pathFromUrl(url));
  }

  async function serve(request) {
    try {
      const file = fileFor(request.url);
      if (!file) return notFound();
      const st = await fsp.stat(file);
      if (!st.isFile()) return notFound();
      const etag = `"${st.size}-${Math.floor(st.mtimeMs)}"`;
      const headers = { etag, 'cache-control': 'no-cache', 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' };
      if (request.headers && request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
      return new Response(await fsp.readFile(file), { headers });
    } catch {
      return notFound();
    }
  }

  /** The file at an absolute path, when the window may show it (and so copy it into a note); null otherwise. */
  function allowedFile(p) {
    if (typeof p !== 'string' || !path.isAbsolute(p) || !IMAGE_EXT_RE.test(p)) return null;
    const abs = path.resolve(p);
    return allowed(abs) ? abs : null;
  }

  return { serve, allow, fileFor, allowedFile };
}

const lower = (s) => String(s).toLowerCase();
/** The first free `<slug>-<n>.<ext>` in a folder, counting from 1. */
async function uniqueImageName(dir, slug, ext) {
  let taken = [];
  try { taken = (await fsp.readdir(dir)).map(lower); } catch { /* new folder */ }
  for (let n = 1; ; n++) {
    const name = `${slug}-${n}.${ext}`;
    if (!taken.includes(lower(name))) return name;
  }
}

/** A free name in dir for an image called `name`: the name itself, or the same stem with the next number. */
async function freeImageName(dir, name) {
  let taken = [];
  try { taken = (await fsp.readdir(dir)).map(lower); } catch { /* new folder */ }
  if (!taken.includes(lower(name))) return name;
  const m = /^(.*?)(?:-(\d+))?(\.[^.]+)$/.exec(name) || [name, name, undefined, ''];
  for (let n = Number(m[2] || 1) + 1; ; n++) {
    const cand = `${m[1]}-${n}${m[3]}`;
    if (!taken.includes(lower(cand))) return cand;
  }
}

async function sameBytes(a, b) {
  const [sa, sb] = await Promise.all([fsp.stat(a), fsp.stat(b)]);
  if (sa.size !== sb.size) return false;
  const [ba, bb] = await Promise.all([fsp.readFile(a), fsp.readFile(b)]);
  return ba.equals(bb);
}

/**
 * Copy an image another note links into the images folder `dir` (text with images pasted from a
 * note in another folder). The file keeps its name when that is free; a file already there with the
 * same name and the same bytes is used as it is (the same image pasted twice); otherwise the name
 * gets the next free number. The original is left alone.
 * @param {{ src: string, dir: string }} opts
 * @returns {Promise<string>} the file's name in dir
 */
async function importImage({ src, dir }) {
  if (!IMAGE_EXT_RE.test(src)) throw new Error(`Not an image: ${src}`);
  const st = await fsp.stat(src);
  if (!st.isFile()) throw new Error(`Not a file: ${src}`);
  const name = path.basename(src);
  if (lower(path.resolve(path.dirname(src))) === lower(path.resolve(dir))) return name;
  const same = path.join(dir, name);
  try { if (await sameBytes(src, same)) return name; } catch { /* not there */ }
  await fsp.mkdir(dir, { recursive: true });
  const free = await freeImageName(dir, name);
  await fsp.copyFile(src, path.join(dir, free), fsSync.constants.COPYFILE_EXCL);
  return free;
}

const SAVE_EXT = new Set(['jpg', 'gif', 'svg', 'png', 'webp']);
/**
 * Write an image into a note's images folder under a name made from the note's title. The window
 * has already converted what should be JPEG; main only names and writes.
 * @param {{ dir: string, slug: string, ext: string, bytes: Uint8Array | Buffer }} opts
 * @returns {Promise<string>} the file's name
 */
async function saveImage({ dir, slug, ext, bytes }) {
  const e = lower(ext).replace(/^\./, '').replace(/^jpeg$/, 'jpg');
  if (!SAVE_EXT.has(e)) throw new Error(`Not an image type Notera writes: ${ext}`);
  if (!(bytes instanceof Uint8Array) || !bytes.length) throw new Error('Empty image');
  await fsp.mkdir(dir, { recursive: true });
  const name = await uniqueImageName(dir, slug, e);
  await writeFileAtomic(path.join(dir, name), Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  return name;
}

module.exports = { createImageServer, isInside, MIME, uniqueImageName, saveImage, freeImageName, importImage };
