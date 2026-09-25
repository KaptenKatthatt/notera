'use strict';
// Dokumentmallar för "Ny från mall…". Ny mall = ny post i TEMPLATES —
// menyn byggs automatiskt från arrayen. text(t) får appens översättarfunktion
// så rubrikerna följer valt språk (sv/en).
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const TEMPLATES = [
  {
    id: 'standup',
    menu: 'menu.standup',
    text: (t) => `# ${t('templates.standupTitle')} ${today()}\n\n## ${t('templates.doneLast')}\n\n\n## ${t('templates.blockers')}\n\n\n## ${t('templates.nextUp')}\n`
  }
];

module.exports = { TEMPLATES };
