'use strict';
// Templates are plain .md files in the notes folder's templates folder (Mallar/Templates). This
// module turns a template's text into a note: placeholders filled, the template's heading as the
// note's title, the project header line under it, and where the cursor goes. CommonJS so main.js
// can require it and esbuild can bundle it into the renderer.
//
// Placeholders, in Swedish or English: {{datum}}/{{date}} 2026-09-30, {{tid}}/{{time}} 14:32,
// {{projekt}}/{{project}} the project's name. Anything else in braces is left as it is.
const H = require('./noteHeader');

const pad = (n) => String(n).padStart(2, '0');
const timeOf = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** @param {string} text @param {{ date?: Date, project?: string }} [opts] */
function fillPlaceholders(text, { date = new Date(), project = '' } = {}) {
  const values = {
    datum: H.formatDate(date), date: H.formatDate(date),
    tid: timeOf(date), time: timeOf(date),
    projekt: project, project
  };
  return String(text).replace(/\{\{\s*(datum|date|tid|time|projekt|project)\s*\}\}/gi, (_m, k) => values[k.toLowerCase()]);
}

/**
 * The first empty line after the first heading below the header line, as an offset; else the end
 * of the text. For the standup template that is the line under "## Done since last".
 */
function cursorAfterHeading(text, fromLine) {
  const lines = text.split('\n');
  let offset = 0;
  for (let i = 0; i < fromLine && i < lines.length; i++) offset += lines[i].length + 1;
  let seenHeading = false;
  for (let i = fromLine; i < lines.length; i++) {
    if (seenHeading && lines[i].trim() === '') return offset;
    if (/^#{1,6}\s/.test(lines[i])) seenHeading = true;
    offset += lines[i].length + 1;
  }
  return text.length;
}

/**
 * A project note made from a template: the template's first line becomes the title when it is a
 * "#" heading, then the header line, then the rest. Without a heading the note starts with an empty
 * "# " like any new note and the cursor goes there.
 * @param {string} template
 * @param {{ locale?: string, project: string, date?: Date }} opts
 * @returns {{ text: string, cursor: number }}
 */
function noteFromTemplate(template, { locale = 'en', project, date = new Date() }) {
  const filled = fillPlaceholders(String(template).replace(/\r\n/g, '\n'), { date, project });
  const meta = H.metaLine(locale, project, H.formatDateTime(date));
  const nl = filled.indexOf('\n');
  const first = nl < 0 ? filled : filled.slice(0, nl);
  if (/^#\s+\S/.test(first)) {
    const rest = (nl < 0 ? '' : filled.slice(nl + 1)).replace(/^\n+/, '');
    const text = `${first.trimEnd()}\n${meta}\n\n${rest}`;
    return { text, cursor: cursorAfterHeading(text, 2) };
  }
  const text = `# \n${meta}\n\n${filled.replace(/^\n+/, '')}`;
  return { text, cursor: 2 };
}

/** The Standup template written into a new templates folder, headings in the UI language. */
function standupTemplate(t, locale) {
  const date = locale === 'sv' ? '{{datum}}' : '{{date}}';
  return `# ${t('templates.standupTitle')} ${date}\n\n## ${t('templates.doneLast')}\n\n\n## ${t('templates.blockers')}\n\n\n## ${t('templates.nextUp')}\n`;
}

/** The one template offered before a notes folder is chosen (there is no templates folder yet). */
const BUILTIN = 'Standup';

module.exports = { fillPlaceholders, noteFromTemplate, cursorAfterHeading, standupTemplate, BUILTIN };
