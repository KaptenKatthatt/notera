'use strict';
// Document templates for "New from template…". A new template is a new entry in TEMPLATES; the
// menu is built from the array. text(t) and header(t) get the app's translate function, so the
// headings follow the chosen language (sv/en).
const { LOCALES } = require('./strings');

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function now() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${today()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const TEMPLATES = [
  {
    id: 'standup',
    menu: 'menu.standup',
    text: (t) => `# ${t('templates.standupTitle')} ${today()}\n\n## ${t('templates.doneLast')}\n\n\n## ${t('templates.blockers')}\n\n\n## ${t('templates.nextUp')}\n`,
    // Header for "Apply template" on a document already started: "# Title:" and the date/time.
    header: (t) => `# ${t('templates.titleLabel')}:\n${now()}\n\n`
  }
];

/** True when a document already starts with a template header, in any UI language. */
function hasTemplateHeader(text) {
  return Object.values(LOCALES).some((l) => String(text).startsWith(`# ${l.templates.titleLabel}:`));
}

module.exports = { TEMPLATES, hasTemplateHeader };
