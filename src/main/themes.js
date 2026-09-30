'use strict';
// Themes on disk: the built-in ones shipped next to the app (themes/<id>/) and the user's own in
// <userData>/themes/<id>/. Loads and resolves them (see shared/themeFormat.js), serves their files
// to the window over notera-theme://<id>/<path>, and watches the user folder so a saved
// theme.json or style.css repaints the window right away.
const fs = require('fs');
const path = require('path');
const {
  DEFAULT_THEME, ThemeError, isValidId, parseJsonc, resolveTheme, themeName, variantOf, cssVars
} = require('../shared/themeFormat');

const SCHEME = 'notera-theme';
const RELOAD_DELAY_MS = 120;
// Built-in themes in menu order; user themes follow, sorted by name.
const BUILTIN_ORDER = [DEFAULT_THEME, 'those-guys', 'other-guys', 'neon-chill', 'neon', 'neon-omg'];
const MIME = {
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf'
};

/**
 * @param {{ builtinDir: string, userDir: string }} dirs
 */
function createThemeStore({ builtinDir, userDir }) {
  /** @type {Map<string, { dir: string, builtin: boolean }>} */
  let index = new Map();
  /** @type {Map<string, { raw?: any, error?: any }>} */
  const cache = new Map();

  function scan() {
    const next = new Map();
    /** @type {Array<[string, boolean]>} */
    const roots = [[builtinDir, true], [userDir, false]];
    for (const [dir, builtin] of roots) {
      let names = [];
      try { names = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { /* no folder yet */ }
      for (const name of names.sort()) {
        if (!isValidId(name)) continue;
        if (!builtin && next.has(name)) continue; // a user folder cannot shadow a built-in theme
        if (!fs.existsSync(path.join(dir, name, 'theme.json'))) continue;
        next.set(name, { dir: path.join(dir, name), builtin });
      }
    }
    index = next;
    cache.clear();
  }

  /** The parsed theme.json of one theme, or null. Parse errors are kept and rethrown. */
  function raw(id) {
    const entry = index.get(id);
    if (!entry) return null;
    let hit = cache.get(id);
    if (!hit) {
      try { hit = { raw: parseJsonc(fs.readFileSync(path.join(entry.dir, 'theme.json'), 'utf8')) }; }
      catch (e) { hit = { error: e instanceof ThemeError ? e : new ThemeError(String(e && /** @type {any} */ (e).message || e)) }; }
      cache.set(id, hit);
    }
    if (hit.error) { const err = new ThemeError(hit.error.message, hit.error.line, hit.error.column); /** @type {any} */ (err).file = id; throw err; }
    return hit.raw;
  }

  /** Every theme for menus and pickers: id, display name, built-in or not, and its error if broken. */
  function list(locale) {
    const out = [];
    for (const [id, entry] of index) {
      let name = id;
      let error = null;
      try { name = themeName(resolveTheme(id, raw).theme.name, locale, id); }
      catch (e) { error = describeError(id, e); }
      out.push({ id, name, builtin: entry.builtin, error });
    }
    const rank = (t) => {
      if (!t.builtin) return BUILTIN_ORDER.length + 1;
      const i = BUILTIN_ORDER.indexOf(t.id);
      return i === -1 ? BUILTIN_ORDER.length : i;
    };
    return out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, locale));
  }

  /**
   * Everything the window needs to paint a theme: CSS variables for both variants, the style
   * sheets and font faces of its whole extends chain (as notera-theme:// URLs), and its name.
   * Throws a ThemeError when the theme or anything it extends is broken.
   */
  function payload(id, locale) {
    const r = resolveTheme(id, raw);
    const variants = {};
    for (const dark of [false, true]) {
      const v = variantOf(r.theme, dark);
      variants[dark ? 'dark' : 'light'] = { type: v.type, vars: cssVars(v), notera: v.notera, read: v.read };
    }
    const stamp = Date.now();
    const url = (owner, rel) => `${SCHEME}://${owner}/${String(rel).replace(/^\.?\/+/, '')}?v=${stamp}`;
    return {
      id,
      name: themeName(r.theme.name, locale, id),
      builtin: !!index.get(id)?.builtin,
      chain: r.chain,
      variants,
      styles: r.styles.filter((s) => safeRel(s.path)).map((s) => url(s.owner, s.path)),
      fonts: r.fonts.filter((f) => typeof f.family === 'string' && typeof f.src === 'string' && safeRel(f.src)).map((f) => ({
        family: f.family, url: url(f.owner, f.src),
        weight: typeof f.weight === 'string' || typeof f.weight === 'number' ? String(f.weight) : '400',
        style: f.style === 'italic' ? 'italic' : 'normal'
      }))
    };
  }

  /**
   * The payload for a theme that is not on disk yet (a VS Code theme being previewed). It may
   * extend installed themes like any other.
   */
  function payloadFromRaw(rawTheme, id, locale) {
    const saved = index;
    index = new Map(index);
    index.set(id, { dir: '', builtin: false });
    cache.set(id, { raw: rawTheme });
    try { return payload(id, locale); }
    finally { index = saved; cache.delete(id); }
  }

  /** The theme's folder on disk, if it is known. */
  function dirOf(id) { return index.get(id)?.dir || null; }

  /** notera-theme://<id>/<path> -> the file inside that theme's folder, never outside it. */
  async function serve(request) {
    try {
      const u = new URL(request.url);
      const dir = dirOf(u.hostname);
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
      if (!dir || !safeRel(rel)) return new Response('Not found', { status: 404 });
      const file = path.join(dir, rel);
      if (!file.startsWith(dir + path.sep)) return new Response('Not found', { status: 404 });
      const body = await fs.promises.readFile(file);
      return new Response(body, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  }

  let watcher = null;
  let timer = null;
  /** Watch the user folder; `onChange` runs once per burst of writes. */
  function watch(onChange) {
    try { fs.mkdirSync(userDir, { recursive: true }); } catch { /* read-only profile: nothing to watch */ }
    try {
      watcher = fs.watch(userDir, { recursive: true }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => { scan(); onChange(); }, RELOAD_DELAY_MS);
      });
      watcher.on('error', () => {});
    } catch { /* recursive watching unsupported: themes still load on restart */ }
  }
  function close() { clearTimeout(timer); if (watcher) watcher.close(); }

  scan();
  return { scan, list, payload, payloadFromRaw, raw, dirOf, serve, watch, close, has: (id) => index.has(id), userDir };
}

function safeRel(rel) {
  if (typeof rel !== 'string' || !rel || rel.length > 200) return false;
  if (path.isAbsolute(rel) || /^[a-z]+:/i.test(rel)) return false;
  return !rel.split(/[\\/]/).some((part) => part === '..');
}

/** A readable one-liner for a broken theme: which theme, which line, what went wrong. */
function describeError(id, e) {
  const err = /** @type {any} */ (e);
  return {
    theme: err && err.file ? err.file : id,
    message: err && err.message ? String(err.message) : String(e),
    line: err && err.line ? err.line : null,
    column: err && err.column ? err.column : null
  };
}

module.exports = { createThemeStore, describeError, SCHEME };
