'use strict';
// Dokumentmallar för "Ny från mall…". Ny mall = ny post i TEMPLATES —
// menyn byggs automatiskt från arrayen. text(t) får appens översättarfunktion
// så rubrikerna följer valt språk (sv/en).
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
    // sidhuvud for 'applicera pa paborjat dokument': '# Titel:' + genererad datum/tid
    header: (t) => `# Titel:\n${now()}\n\n`
  }
];

module.exports = { TEMPLATES };
