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

/** A title made safe as a Windows file name: no reserved characters, no trailing dots/spaces. */
function sanitizeFileName(title) {
  let s = String(title).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();
  s = s.slice(0, 80).replace(/[. ]+$/, '');
  if (WINDOWS_RESERVED.test(s)) s = `_${s}`;
  return s;
}

/** "2026-09-25 Title" (no extension). The date is the note's creation date, never today's. */
function baseName(datePrefix, title, untitledLabel) {
  return `${datePrefix} ${sanitizeFileName(title) || untitledLabel}`;
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
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(n) || /[. ]$/.test(n) || n.startsWith('.') || WINDOWS_RESERVED.test(n)) return 'notes.nameInvalid';
  const low = n.toLowerCase();
  if (reserved.some((r) => r.toLowerCase() === low)) return 'notes.nameReserved';
  if (taken.some((x) => x.toLowerCase() === low)) return 'notes.nameTaken';
  return '';
}

module.exports = {
  LABELS, META_RE, formatDate, formatDateTime, metaLine, newNoteText, parseMeta, titleOf, setProject,
  sanitizeFileName, baseName, datePrefixFor, projectNameError
};
