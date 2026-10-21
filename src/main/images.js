'use strict';
// Serves the images notes link to the window over notera-file://img/<encoded absolute path>
// (see shared/imageLinks.js). Only image files, and only under the notes folder or a folder the
// window has opened a file from; everything else is 404, so a note cannot show files it has no
// business with. A file is answered with an ETag, so the window's cache asks "still the same?"
// and gets a 304 instead of the bytes again.
const path = require('path');
const fsp = require('fs/promises');
const { IMAGE_EXT_RE, pathFromUrl } = require('../shared/imageLinks');

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
    const p = pathFromUrl(url);
    if (!p || !path.isAbsolute(p) || !IMAGE_EXT_RE.test(p)) return null;
    const abs = path.resolve(p);
    return allowed(abs) ? abs : null;
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

  return { serve, allow, fileFor };
}

module.exports = { createImageServer, isInside, MIME };
