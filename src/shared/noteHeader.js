'use strict';
// The header every project note starts with, and the file names derived from it:
//
//   # Title
//   Projekt: Enlantis · Skapad: 2026-09-25 14:32
//
// The labels follow the UI language at the time the note is written. Both languages are
// recognised when reading, so switching language never orphans an existing header.
// CommonJS so main.js can require it and esbuild can bundle it into the renderer.

const LABELS = {
  sv: { project: 'Projekt', created: 'Skapad' },
  en: { project: 'Project', created: 'Created' }
};
const SEP = ' · ';
const META_RE = /^(Projekt|Project): (.*) · (Skapad|Created): (.*)$/;
const DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})\b/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

const pad = (n) => String(n).padStart(2, '0');
function formatDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function formatDateTime(d) { return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }

function labelsFor(locale) { return LABELS[locale] || LABELS.en; }

function metaLine(locale, project, created) {
  const l = labelsFor(locale);
  return `${l.project}: ${project}${SEP}${l.created}: ${created}`;
}

/** Text of a brand-new note: empty heading, header line, blank line, cursor goes after "# ". */
function newNoteText(locale, project, date = new Date()) {
  return `# \n${metaLine(locale, project, formatDateTime(date))}\n\n`;
}

/** { project, created } from the header line, or null. Looks at the first few lines only. */
function parseMeta(text) {
  const lines = String(text).split('\n', 4);
  for (const l of lines) {
    const m = META_RE.exec(l.replace(/\r$/, ''));
    if (m) return { project: m[2], created: m[4], locale: m[1] === 'Projekt' ? 'sv' : 'en' };
  }
  return null;
}

/** Heading text of the first line ("# Title" -> "Title"), or '' when the first line is no heading. */
function titleOf(text) {
  const first = String(text).split('\n', 1)[0].replace(/\r$/, '');
  const m = /^#\s+(.*)$/.exec(first);
  return m ? m[1].trim() : '';
}

/**
 * Rewrite the project in the header line, keeping its labels and creation time. A text without a
 * header line gets one: after the first line when that is a heading, otherwise under a new heading
 * made from fallbackTitle.
 * @param {string} text
 * @param {string} project
 * @param {{ locale?: string, created?: string, fallbackTitle?: string }} [opts]
 */
function setProject(text, project, { locale = 'en', created, fallbackTitle = '' } = {}) {
  const lines = String(text).split('\n');
  for (let i = 0; i < Math.min(lines.length, 4); i++) {
    const cr = lines[i].endsWith('\r') ? '\r' : '';
    const m = META_RE.exec(lines[i].replace(/\r$/, ''));
    if (m) {
      lines[i] = `${m[1]}: ${project}${SEP}${m[3]}: ${m[4]}${cr}`;
      return lines.join('\n');
    }
  }
  const meta = metaLine(locale, project, created || formatDateTime(new Date()));
  if (/^#\s/.test(lines[0] || '')) { lines.splice(1, 0, meta); return lines.join('\n'); }
  const heading = `# ${fallbackTitle}`.trimEnd();
  return [heading, meta, '', ...lines].join('\n');
}

/**
 * Several lines pasted on a note's heading line. Pasted as they come, they would push the header
 * line down, and a later move would no longer find it and add a second one. Instead the first
 * line goes into the heading and the rest into the body under the header, the way Enter on the
 * heading line jumps past it. Returns the changes to make in place of the paste (positions in
 * doc) and where the cursor goes, or null when the paste is not of that kind.
 * @param {string} doc @param {number} from @param {number} to @param {string} text
 * @returns {{ changes: Array<{ from: number, to?: number, insert: string }>, cursor: number } | null}
 */
function pasteOnTitle(doc, from, to, text) {
  const nl = text.indexOf('\n');
  if (nl < 0) return null;
  const lines = doc.split('\n');
  const title = lines[0];
  if (lines.length < 2 || !/^#\s/.test(title) || !META_RE.test(lines[1]) || from < 2 || to > title.length) return null;
  let first = text.slice(0, nl).replace(/\r$/, '');
  // A Markdown text with its own heading, pasted into an empty one, keeps a single "#".
  if (/^#\s*$/.test(title.slice(0, from) + title.slice(to))) first = first.replace(/^#{1,6}\s+/, '');
  const rest = text.slice(nl + 1).replace(/^(?:[ \t]*\n)+/, '');
  /** @type {Array<{ from: number, to?: number, insert: string }>} */
  const changes = [{ from, to, insert: first }];
  const shift = first.length - (to - from);
  if (!rest) return { changes, cursor: from + first.length };
  const metaEnd = title.length + 1 + lines[1].length;
  let at; let insert; let cursorIn;
  if (lines.length >= 3 && lines[2] === '') {
    // Header, blank line: the body starts on line 4, or the text ends after the blank line.
    if (lines.length === 3) { at = doc.length; insert = '\n' + rest; cursorIn = insert.length; }
    else {
      at = metaEnd + 2;
      const more = !(lines.length === 4 && lines[3] === '');
      insert = more && !rest.endsWith('\n') ? rest + '\n' : rest;
      cursorIn = rest.length;
    }
  } else {
    // Header line last, or followed directly by text: open a blank line under it.
    const body = lines.length === 2 ? rest : rest.replace(/\n$/, '');
    at = metaEnd; insert = '\n\n' + body; cursorIn = insert.length;
  }
  changes.push({ from: at, insert });
  return { changes, cursor: at + shift + cursorIn };
}

/** Set the heading on the first line to title; a text whose first line is no heading gets one on top. */
function setTitle(text, title) {
  const lines = String(text).split('\n');
  const heading = `# ${String(title).trim()}`;
  if (/^#(\s|$)/.test(lines[0] || '')) lines[0] = heading; else lines.unshift(heading);
  return lines.join('\n');
}

/** A title made safe as a Windows file name: no reserved characters, no trailing dots/spaces. */
function sanitizeFileName(title) {
  // eslint-disable-next-line no-control-regex -- control characters are not allowed in file names
  let s = String(title).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();
  s = s.slice(0, 80).replace(/[. ]+$/, '');
  if (WINDOWS_RESERVED.test(s)) s = `_${s}`;
  return s;
}

/**
 * "2026-09-25 Title" (no extension). The date is the note's creation date, never today's. A title
 * that already holds that date does not repeat it: "Standup 2026-09-25" gives "2026-09-25 Standup".
 */
function baseName(datePrefix, title, untitledLabel) {
  const t = String(title || '');
  if (datePrefix && t.includes(datePrefix)) {
    const rest = sanitizeFileName(t.replace(datePrefix, ' ').replace(/^[\s\-–—:,.]+|[\s\-–—:,]+$/g, ''));
    return rest ? `${datePrefix} ${rest}` : datePrefix;
  }
  return `${datePrefix} ${sanitizeFileName(t) || untitledLabel}`;
}

/**
 * What a date-sorted project sorts a note by: the first YYYY-MM-DD in its heading, else the header's
 * Created date, else the file name's date, else the file's modified time. created breaks ties.
 * @returns {{ date: string, created: string }}
 */
function sortDateOf(text, fileName, mtimeMs) {
  const title = titleOf(text);
  const meta = parseMeta(text);
  const created = meta && /^\d{4}-\d{2}-\d{2}/.test(meta.created) ? meta.created : '';
  const inTitle = /\b(\d{4}-\d{2}-\d{2})\b/.exec(title);
  const inName = DATE_PREFIX_RE.exec(fileName || '');
  const date = (inTitle && inTitle[1]) || created.slice(0, 10) || (inName && inName[1]) || formatDate(new Date(mtimeMs || 0));
  return { date, created };
}

/** Creation date for the file name: the existing file-name prefix, else the header, else today. */
function datePrefixFor(fileName, text, now = new Date()) {
  const m = DATE_PREFIX_RE.exec(fileName || '');
  if (m) return m[1];
  const meta = text ? parseMeta(text) : null;
  if (meta && /^\d{4}-\d{2}-\d{2}/.test(meta.created)) return meta.created.slice(0, 10);
  return formatDate(now);
}

/** Why a project name cannot be used, as an i18n key, or '' when it is fine. */
function projectNameError(name, { taken = [], reserved = [] } = {}) {
  const n = String(name || '').trim();
  if (!n) return 'notes.nameEmpty';
  // eslint-disable-next-line no-control-regex -- control characters are not allowed in folder names
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(n) || /[. ]$/.test(n) || n.startsWith('.') || WINDOWS_RESERVED.test(n)) return 'notes.nameInvalid';
  const low = n.toLowerCase();
  if (reserved.some((r) => r.toLowerCase() === low)) return 'notes.nameReserved';
  if (taken.some((x) => x.toLowerCase() === low)) return 'notes.nameTaken';
  return '';
}

module.exports = {
  LABELS, META_RE, formatDate, formatDateTime, metaLine, newNoteText, parseMeta, titleOf, setProject, setTitle, pasteOnTitle,
  sanitizeFileName, baseName, sortDateOf, datePrefixFor, projectNameError
};
