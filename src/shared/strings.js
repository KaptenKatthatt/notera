'use strict';
// UI strings for both processes. CommonJS so main.js can require it and
// esbuild can bundle it into the renderer.
const en = {
  appName: 'Notera',
  untitled: 'Untitled',
  menu: {
    file: '&File', new: 'New', newWindow: 'New window', open: 'Open…', openRecent: 'Open recent',
    clearRecent: 'Clear list', save: 'Save', saveAs: 'Save as…', saveAll: 'Save all', closeTab: 'Close tab',
    print: 'Print…', exit: 'Exit',
    edit: '&Edit', undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', delete: 'Delete',
    find: 'Find…', findNext: 'Find next', findPrevious: 'Find previous', replace: 'Replace…', goTo: 'Go to…',
    selectAll: 'Select all', timeDate: 'Time/Date', font: 'Font…',
    format: 'F&ormat', bold: 'Bold', italic: 'Italic', strikethrough: 'Strikethrough', heading1: 'Heading 1',
    heading2: 'Heading 2', heading3: 'Heading 3', bulletList: 'Bulleted list', numberedList: 'Numbered list',
    checkList: 'Task list', quote: 'Quote', code: 'Code', codeBlock: 'Code block', link: 'Link',
    horizontalRule: 'Horizontal rule', table: 'Table',
    view: '&View', zoom: 'Zoom', zoomIn: 'Zoom in', zoomOut: 'Zoom out', zoomReset: 'Restore default zoom',
    statusBar: 'Status bar', wordWrap: 'Word wrap', lineNumbers: 'Line numbers', formattingBar: 'Formatting toolbar',
    editorOnly: 'Editor', split: 'Split view', previewOnly: 'Preview', theme: 'Theme', themeSystem: 'Use system setting',
    themeLight: 'Light', themeDark: 'Dark', language: 'Language', langAuto: 'Automatic', langEn: 'English', langSv: 'Svenska',
    help: '&Help', about: 'About Notera', toggleDevTools: 'Developer tools',
    writingMode: 'Writing mode', fullscreen: 'Full screen', autosave: 'Autosave', hideMarkers: 'Hide Markdown markers',
    shortcuts: 'Keyboard shortcuts'
  },
  dialog: {
    openTitle: 'Open', saveTitle: 'Save as', markdownFiles: 'Markdown files', textFiles: 'Text files', allFiles: 'All files',
    unsavedTitle: 'Notera', unsavedMessage: 'Do you want to save changes to {name}?', save: 'Save', dontSave: "Don't save", cancel: 'Cancel',
    readError: 'Could not open {name}', writeError: 'Could not save {name}', ok: 'OK',
    changedOnDisk: '{name} was changed by another program. Reload it?', reload: 'Reload', keep: 'Keep mine',
    aboutMessage: 'Notera {version}\nA streamlined Markdown and text notepad.', clearRecentConfirm: 'Clear the recent files list?'
  },
  ui: {
    line: 'Ln {line}, Col {col}', chars: '{n} characters', words: '{n} words', selected: '{n} selected', zoom: '{n}%',
    crlf: 'Windows (CRLF)', lf: 'Unix (LF)', utf8: 'UTF-8', utf8bom: 'UTF-8 with BOM', utf16le: 'UTF-16 LE', utf16be: 'UTF-16 BE', ansi: 'ANSI',
    markdown: 'Markdown', plainText: 'Plain text', newTab: 'New tab', closeTab: 'Close tab', modified: 'Unsaved changes',
    fontTitle: 'Font', fontFamily: 'Family', fontSize: 'Size', fontPreview: 'The quick brown fox jumps over the lazy dog 0123456789',
    apply: 'Apply', cancel: 'Cancel', goToTitle: 'Go to line', lineNumber: 'Line number', go: 'Go',
    linkTitle: 'Insert link', linkText: 'Text', linkUrl: 'Address', insert: 'Insert',
    heading: 'Heading', headingLevel: 'Heading {n}', list: 'List', more: 'More', view: 'View',
    editor: 'Editor', split: 'Split', preview: 'Preview', switchToMarkdown: 'Treat as Markdown', switchToText: 'Treat as plain text',
    emptyPreview: 'Nothing to preview yet.', toggleEol: 'Click to switch line endings', toggleEncoding: 'Click to change encoding',
    toggleZoom: 'Click to reset zoom', dropHint: 'Drop files to open them', menuEol: 'Line endings', menuEncoding: 'Encoding',
    startWriting: '# Start writing', unsaved: 'unsaved', saved: 'saved', recovered: 'recovered draft',
    exitWriting: 'Back to the full view', nextTab: 'Next tab', shortcutsTitle: 'Keyboard shortcuts', close: 'Close', save: 'Save', open: 'Open'
  },
  search: {
    'Find': 'Find', 'Replace': 'Replace', 'next': 'Next', 'previous': 'Previous', 'all': 'All', 'match case': 'Match case',
    'by word': 'Whole word', 'regexp': 'Regex', 'replace': 'Replace', 'replace all': 'Replace all', 'close': 'Close',
    'Go to line': 'Go to line', 'go': 'Go', 'current match': 'current match', 'replaced $ matches': 'replaced $ matches',
    'replaced match on line $': 'replaced match on line $', 'on line': 'on line'
  }
};

const sv = {
  appName: 'Notera',
  untitled: 'Namnlös',
  menu: {
    file: '&Arkiv', new: 'Nytt', newWindow: 'Nytt fönster', open: 'Öppna…', openRecent: 'Öppna senaste',
    clearRecent: 'Rensa listan', save: 'Spara', saveAs: 'Spara som…', saveAll: 'Spara alla', closeTab: 'Stäng flik',
    print: 'Skriv ut…', exit: 'Avsluta',
    edit: '&Redigera', undo: 'Ångra', redo: 'Gör om', cut: 'Klipp ut', copy: 'Kopiera', paste: 'Klistra in', delete: 'Ta bort',
    find: 'Sök…', findNext: 'Sök nästa', findPrevious: 'Sök föregående', replace: 'Ersätt…', goTo: 'Gå till…',
    selectAll: 'Markera allt', timeDate: 'Tid/datum', font: 'Teckensnitt…',
    format: 'F&ormat', bold: 'Fet', italic: 'Kursiv', strikethrough: 'Genomstruken', heading1: 'Rubrik 1',
    heading2: 'Rubrik 2', heading3: 'Rubrik 3', bulletList: 'Punktlista', numberedList: 'Numrerad lista',
    checkList: 'Att göra-lista', quote: 'Citat', code: 'Kod', codeBlock: 'Kodblock', link: 'Länk',
    horizontalRule: 'Avdelare', table: 'Tabell',
    view: '&Visa', zoom: 'Zoom', zoomIn: 'Zooma in', zoomOut: 'Zooma ut', zoomReset: 'Återställ standardzoom',
    statusBar: 'Statusfält', wordWrap: 'Radbyte', lineNumbers: 'Radnummer', formattingBar: 'Formateringsfält',
    editorOnly: 'Redigerare', split: 'Delad vy', previewOnly: 'Förhandsvisning', theme: 'Tema', themeSystem: 'Följ systemet',
    themeLight: 'Ljust', themeDark: 'Mörkt', language: 'Språk', langAuto: 'Automatiskt', langEn: 'English', langSv: 'Svenska',
    help: '&Hjälp', about: 'Om Notera', toggleDevTools: 'Utvecklarverktyg',
    writingMode: 'Skrivläge', fullscreen: 'Helskärm', autosave: 'Spara automatiskt', hideMarkers: 'Dölj Markdown-tecken',
    shortcuts: 'Kortkommandon'
  },
  dialog: {
    openTitle: 'Öppna', saveTitle: 'Spara som', markdownFiles: 'Markdown-filer', textFiles: 'Textfiler', allFiles: 'Alla filer',
    unsavedTitle: 'Notera', unsavedMessage: 'Vill du spara ändringarna i {name}?', save: 'Spara', dontSave: 'Spara inte', cancel: 'Avbryt',
    readError: 'Kunde inte öppna {name}', writeError: 'Kunde inte spara {name}', ok: 'OK',
    changedOnDisk: '{name} har ändrats av ett annat program. Läs in den igen?', reload: 'Läs in igen', keep: 'Behåll min',
    aboutMessage: 'Notera {version}\nEn avskalad anteckningsapp för Markdown och text.', clearRecentConfirm: 'Rensa listan med senaste filer?'
  },
  ui: {
    line: 'Rad {line}, kol {col}', chars: '{n} tecken', words: '{n} ord', selected: '{n} markerade', zoom: '{n} %',
    crlf: 'Windows (CRLF)', lf: 'Unix (LF)', utf8: 'UTF-8', utf8bom: 'UTF-8 med BOM', utf16le: 'UTF-16 LE', utf16be: 'UTF-16 BE', ansi: 'ANSI',
    markdown: 'Markdown', plainText: 'Text', newTab: 'Ny flik', closeTab: 'Stäng flik', modified: 'Osparade ändringar',
    fontTitle: 'Teckensnitt', fontFamily: 'Typsnitt', fontSize: 'Storlek', fontPreview: 'Flygande bäckasiner söka hwila på mjuka tuvor 0123456789',
    apply: 'Använd', cancel: 'Avbryt', goToTitle: 'Gå till rad', lineNumber: 'Radnummer', go: 'Gå',
    linkTitle: 'Infoga länk', linkText: 'Text', linkUrl: 'Adress', insert: 'Infoga',
    heading: 'Rubrik', headingLevel: 'Rubrik {n}', list: 'Lista', more: 'Mer', view: 'Vy',
    editor: 'Redigerare', split: 'Delad', preview: 'Förhandsvisning', switchToMarkdown: 'Behandla som Markdown', switchToText: 'Behandla som text',
    emptyPreview: 'Inget att förhandsvisa ännu.', toggleEol: 'Klicka för att byta radslut', toggleEncoding: 'Klicka för att byta teckenkodning',
    toggleZoom: 'Klicka för att återställa zoom', dropHint: 'Släpp filer här för att öppna dem', menuEol: 'Radslut', menuEncoding: 'Teckenkodning',
    startWriting: '# Börja skriva', unsaved: 'osparad', saved: 'sparad', recovered: 'återställt utkast',
    exitWriting: 'Tillbaka till hela vyn', nextTab: 'Nästa flik', shortcutsTitle: 'Kortkommandon', close: 'Stäng', save: 'Spara', open: 'Öppna'
  },
  search: {
    'Find': 'Sök', 'Replace': 'Ersätt', 'next': 'Nästa', 'previous': 'Föregående', 'all': 'Alla', 'match case': 'Matcha skiftläge',
    'by word': 'Hela ord', 'regexp': 'Regex', 'replace': 'Ersätt', 'replace all': 'Ersätt alla', 'close': 'Stäng',
    'Go to line': 'Gå till rad', 'go': 'Gå', 'current match': 'aktuell träff', 'replaced $ matches': 'ersatte $ träffar',
    'replaced match on line $': 'ersatte träff på rad $', 'on line': 'på rad'
  }
};

const LOCALES = { en, sv };

function resolveLocale(setting, systemLocale) {
  if (setting && setting !== 'auto' && LOCALES[setting]) return setting;
  const sys = String(systemLocale || '').toLowerCase();
  return sys.startsWith('sv') ? 'sv' : 'en';
}

function format(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) => (vars && k in vars ? String(vars[k]) : `{${k}}`));
}

function makeT(locale) {
  const dict = LOCALES[locale] || en;
  return function t(key, vars) {
    const val = key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), dict)
      ?? key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), en);
    if (val === undefined) return key;
    return vars ? format(val, vars) : val;
  };
}

module.exports = { LOCALES, resolveLocale, makeT, format };
