'use strict';
// VS Code theme import: finds colour themes in the local VS Code install (and VSCodium, Cursor,
// Insiders) or in a .vsix file, and turns one into a Notera theme. Only JSON files are read, never
// run. A theme is paired with its light or dark counterpart from the same extension when there is
// one (GitHub Dark Default with GitHub Light Default, Catppuccin Mocha with Latte), so the Light
// and Dark modes both work; a dark-only theme is used for both.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { parseJsonc, KNOWN_COLOR_KEYS } = require('../shared/themeFormat');

const MAX_FILE = 8 * 1024 * 1024;
const MAX_ENTRIES = 20000;
// tokenColors rules that paint Markdown; the rest of a code theme does not matter to Notera.
const MARKDOWN_SCOPE = /^(markup|heading\.[1-6]\.markdown|punctuation\.definition|entity\.name\.section|string\.other\.link|comment|meta\.link|beginning\.punctuation)/;

/** Folders that hold VS Code-family extensions on this machine. Tests point NOTERA_VSCODE_EXTENSIONS elsewhere. */
function extensionRoots() {
  if (process.env.NOTERA_VSCODE_EXTENSIONS) return process.env.NOTERA_VSCODE_EXTENSIONS.split(path.delimiter).filter(Boolean);
  const home = os.homedir();
  const roots = ['.vscode', '.vscode-insiders', '.vscode-oss', '.cursor', '.windsurf'].map((d) => path.join(home, d, 'extensions'));
  // VS Code's own themes (Dark+, Light+, Monokai, ...) ship inside the app: per-user or machine-wide install.
  for (const base of [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs'), process.env.ProgramFiles]) {
    if (base) roots.push(path.join(base, 'Microsoft VS Code', 'resources', 'app', 'extensions'));
  }
  return roots;
}

// ---------- reading extensions ----------

/**
 * A source of files: a folder on disk, or the entries of a .vsix. `read(rel)` returns text or null.
 * @typedef {{ id: string, read: (rel: string) => string | null }} Source
 */

/** @param {string} dir @returns {Source} */
function folderSource(dir) {
  return {
    id: dir,
    read(rel) {
      const file = path.resolve(dir, rel);
      if (!file.startsWith(path.resolve(dir) + path.sep)) return null;
      try {
        const st = fs.statSync(file);
        return st.isFile() && st.size <= MAX_FILE ? fs.readFileSync(file, 'utf8') : null;
      } catch { return null; }
    }
  };
}

/**
 * The files in a zip (a .vsix is one), read lazily. Supports stored and deflated entries, which is
 * what vsce writes.
 * @param {Buffer} buf
 * @returns {Map<string, () => Buffer | null>}
 */
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count > MAX_ENTRIES) throw new Error('too many files in the archive');
  const out = new Map();
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('broken zip directory');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    out.set(name, () => {
      if (usize > MAX_FILE || local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) return null;
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + csize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return zlib.inflateRawSync(data, { maxOutputLength: MAX_FILE });
      return null;
    });
  }
  return out;
}

/** @param {string} file @returns {Source} */
function vsixSource(file) {
  const entries = readZip(fs.readFileSync(file));
  return {
    id: file,
    read(rel) {
      const name = path.posix.normalize(`extension/${rel.replace(/\\/g, '/').replace(/^\.\//, '')}`);
      if (!name.startsWith('extension/')) return null;
      const get = entries.get(name);
      const b = get ? get() : null;
      return b ? b.toString('utf8') : null;
    }
  };
}

/** "%key%" strings in package.json are looked up in package.nls.json. */
function localize(value, nls) {
  if (typeof value !== 'string') return '';
  const m = /^%(.+)%$/.exec(value);
  if (!m) return value;
  const hit = nls && nls[m[1]];
  return typeof hit === 'string' ? hit : typeof hit?.message === 'string' ? hit.message : value;
}

/**
 * The colour themes one extension contributes.
 * @param {Source} src
 * @returns {Array<{ key: string, label: string, dark: boolean, file: string, extension: { id: string, name: string, version: string }, src: Source }>}
 */
function themesIn(src) {
  const pkgText = src.read('package.json');
  if (!pkgText) return [];
  let pkg; let nls = null;
  try { pkg = parseJsonc(pkgText); } catch { return []; }
  try { const n = src.read('package.nls.json'); if (n) nls = parseJsonc(n); } catch { /* labels stay as keys */ }
  const list = pkg && pkg.contributes && Array.isArray(pkg.contributes.themes) ? pkg.contributes.themes : [];
  const extId = `${pkg.publisher || 'unknown'}.${pkg.name || 'extension'}`;
  const extension = { id: extId, name: localize(pkg.displayName, nls) || pkg.name || extId, version: String(pkg.version || '') };
  return list
    .filter((t) => t && typeof t.path === 'string' && typeof t.label === 'string')
    .map((t) => {
      const label = localize(t.label, nls);
      return {
        key: `${src.id}::${t.path}`, label, dark: t.uiTheme === 'vs-dark' || t.uiTheme === 'hc-black',
        file: t.path, extension, src
      };
    });
}

/** Every colour theme in every VS Code-family install on this machine, sorted by name. */
function listInstalled() {
  const out = [];
  const seen = new Set();
  for (const root of extensionRoots()) {
    let dirs;
    try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { continue; }
    for (const d of dirs) {
      for (const th of themesIn(folderSource(path.join(root, d)))) {
        const dup = `${th.extension.id}|${th.label}`;
        if (seen.has(dup)) continue; // the same extension in two installs, or two versions
        seen.add(dup);
        out.push(th);
      }
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * A theme file with its "include" chain resolved, as VS Code does: the included file first, the
 * including file's colours over it, tokenColors appended.
 * @param {Source} src @param {string} rel
 */
function loadThemeFile(src, rel, depth = 0) {
  if (depth > 8) throw new Error('"include" chain is too long');
  const text = src.read(rel);
  if (text == null) throw new Error(`${rel} is missing`);
  const raw = parseJsonc(text);
  let colors = {};
  let tokenColors = [];
  let type = typeof raw.type === 'string' ? raw.type : null;
  if (typeof raw.include === 'string') {
    const base = loadThemeFile(src, path.posix.join(path.posix.dirname(rel.replace(/\\/g, '/')), raw.include), depth + 1);
    colors = base.colors; tokenColors = base.tokenColors; type = type || base.type;
  }
  if (raw.colors && typeof raw.colors === 'object') colors = { ...colors, ...raw.colors };
  // tokenColors may name a .tmTheme file instead; its colours are not read, the workbench colours still are.
  if (Array.isArray(raw.tokenColors)) tokenColors = [...tokenColors, ...raw.tokenColors];
  return { name: typeof raw.name === 'string' ? raw.name : null, type, colors, tokenColors };
}

/**
 * Keep the colours Notera reads and the tokenColors rules that touch Markdown, so the imported
 * theme.json stays short enough to read and mod. Re-import to pick up keys a later Notera reads.
 */
function slimVariant(file) {
  const colors = {};
  for (const [k, v] of Object.entries(file.colors || {})) if (typeof v === 'string' && KNOWN_COLOR_KEYS.has(k)) colors[k] = v;
  const tokenColors = [];
  for (const rule of file.tokenColors || []) {
    if (!rule || typeof rule !== 'object' || !rule.settings || typeof rule.settings.foreground !== 'string') continue;
    const scopes = (Array.isArray(rule.scope) ? rule.scope : typeof rule.scope === 'string' ? rule.scope.split(',') : []).map((s) => String(s).trim());
    const keep = scopes.filter((s) => s && MARKDOWN_SCOPE.test(s));
    if (keep.length) tokenColors.push({ scope: keep, settings: { foreground: rule.settings.foreground } });
  }
  return { colors, tokenColors };
}

// ---------- pairing ----------
const MODE_WORDS = /\b(dark|light|day|night|dimmed|dim|darker|lighter|black|white|latte|mocha|macchiato|frapp[e\u00e9])\b/gi;
function nameTokens(label) {
  return label.toLowerCase().replace(/\(.*?\)/g, ' ').replace(MODE_WORDS, ' ').split(/[^a-z0-9\u00e5\u00e4\u00f6\u00fc]+/).filter(Boolean);
}

/**
 * The theme from the same extension to use for the other mode: the opposite type whose name
 * shares the most words once "Dark", "Light" and the like are left out; ties go to the shorter name.
 */
function counterpart(theme, all) {
  const want = !theme.dark;
  const mine = new Set(nameTokens(theme.label));
  let best = null; let bestScore = -1;
  for (const t of all) {
    if (t === theme || t.dark !== want || t.extension.id !== theme.extension.id || t.src.id !== theme.src.id) continue;
    const toks = nameTokens(t.label);
    const shared = toks.filter((x) => mine.has(x)).length;
    const score = shared * 100 - toks.length * 10 - t.label.length * 0.01 - (/high contrast|colorblind/i.test(t.label) ? 50 : 0);
    if (score > bestScore) { best = t; bestScore = score; }
  }
  return best;
}

// ---------- conversion ----------

/**
 * A Notera theme.json object for a VS Code theme and, when there is one, its counterpart.
 * @param {ReturnType<typeof themesIn>[number]} theme
 * @param {ReturnType<typeof themesIn>[number] | null} other
 */
function toNoteraTheme(theme, other) {
  const main = loadThemeFile(theme.src, theme.file);
  const variants = { [theme.dark ? 'dark' : 'light']: slimVariant(main) };
  const paired = [];
  if (other) {
    try {
      variants[other.dark ? 'dark' : 'light'] = slimVariant(loadThemeFile(other.src, other.file));
      paired.push(other.label);
    } catch { /* the counterpart is broken: import the one that works */ }
  }
  return {
    $schema: 'https://raw.githubusercontent.com/KaptenKatthatt/notera/master/theme.schema.json',
    name: theme.label,
    importedFrom: { extension: theme.extension.id, version: theme.extension.version, themes: [theme.label, ...paired] },
    ...variants
  };
}

function slugify(label) {
  return label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'vscode-theme';
}

module.exports = {
  extensionRoots, listInstalled, themesIn, folderSource, vsixSource, readZip, loadThemeFile, slimVariant,
  counterpart, toNoteraTheme, slugify, nameTokens
};
