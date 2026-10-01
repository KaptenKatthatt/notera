'use strict';
// UI strings for both processes. CommonJS so main.js can require it and
// esbuild can bundle it into the renderer.
const en = {
  appName: 'Notera',
  untitled: 'Untitled',
  menu: {
    file: '&File', new: 'New tab', newWindow: 'New window', open: 'Open…', openRecent: 'Open recent',
    newFromTemplate: 'New from template', applyTemplate: 'Apply template', noTemplates: 'No templates',
    clearRecent: 'Clear list', save: 'Save', saveAs: 'Save as…', saveAll: 'Save all', closeTab: 'Close tab',
    print: 'Print…', exit: 'Exit',
    edit: '&Edit', undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', delete: 'Delete',
    find: 'Find…', findNext: 'Find next', findPrevious: 'Find previous', replace: 'Replace…', goTo: 'Go to…',
    selectAll: 'Select all', timeDate: 'Time/Date', font: 'Font…', spellcheck: 'Spell check',
    addToDictionary: 'Add to dictionary', noSuggestions: 'No suggestions',
    format: 'F&ormat', bold: 'Bold', italic: 'Italic', strikethrough: 'Strikethrough', heading1: 'Heading 1',
    heading2: 'Heading 2', heading3: 'Heading 3', heading4: 'Heading 4', heading5: 'Heading 5', heading6: 'Heading 6', bulletList: 'Bulleted list', numberedList: 'Numbered list',
    checkList: 'Task list', quote: 'Quote', code: 'Code', codeBlock: 'Code block', link: 'Link',
    horizontalRule: 'Horizontal rule', table: 'Table',
    view: '&View', zoom: 'Zoom', zoomIn: 'Zoom in', zoomOut: 'Zoom out', zoomReset: 'Restore default zoom',
    statusBar: 'Status bar', narrowColumn: 'Narrow text column', wordWrap: 'Word wrap', lineNumbers: 'Line numbers', formattingBar: 'Formatting toolbar',
    editorOnly: 'Write', split: 'Split', previewOnly: 'Read', theme: 'Theme', themeSystem: 'Use system setting',
    themeLight: 'Light', themeDark: 'Dark', themeBroken: '{name} (broken)', openThemesFolder: 'Open themes folder', effects: 'Theme effects', commandPalette: 'Command palette…', pickTheme: 'Browse themes…', newThemeFromCurrent: 'New theme from current…', openSettingsJson: 'Open settings (JSON)', importVsCodeTheme: 'Import VS Code theme…', language: 'Language', langAuto: 'Automatic', langEn: 'English', langSv: 'Svenska',
    help: '&Help', about: 'About Notera', toggleDevTools: 'Developer tools',
    writingMode: 'Writing mode', fullscreen: 'Full screen', autosave: 'Autosave', hideMarkers: 'Hide Markdown markers',
    shortcuts: 'Keyboard shortcuts',
    line: 'Line', moveLineUp: 'Move line up', moveLineDown: 'Move line down', copyLineUp: 'Copy line up',
    copyLineDown: 'Copy line down', selectLine: 'Select line', deleteLine: 'Delete line', insertLineBelow: 'Insert line below',
    insertLineAbove: 'Insert line above', selectNextOccurrence: 'Add next occurrence', selectAllOccurrences: 'Select all occurrences',
    addCursorAbove: 'Add cursor above', addCursorBelow: 'Add cursor below', indentLine: 'Indent line', outdentLine: 'Outdent line',
    closeWindow: 'Close window', nextTab: 'Next tab', prevTab: 'Previous tab', settings: 'Settings…', checkForUpdates: 'Check for updates…',
    moveLine: 'Move line up/down', copyLine: 'Copy line up/down', cutCopyLine: 'Cut/copy line (no selection)', addCursor: 'Add cursor above/below', headings: 'Heading 1, 2, 3', indentBoth: 'Indent/outdent line', viewModes: 'Write, split, read'
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
    utf8: 'UTF-8', utf8bom: 'UTF-8 with BOM', utf16le: 'UTF-16 LE', utf16be: 'UTF-16 BE', ansi: 'ANSI',
    markdown: 'Markdown', plainText: 'Plain text', newTab: 'New tab', closeTab: 'Close tab', modified: 'Unsaved changes',
    fontTitle: 'Font', fontFamily: 'Family', fontSize: 'Size', fontPreview: 'The quick brown fox jumps over the lazy dog 0123456789',
    apply: 'Apply', cancel: 'Cancel', goToTitle: 'Go to line', lineNumber: 'Line number', go: 'Go',
    linkTitle: 'Insert link', linkText: 'Text', linkUrl: 'Address', insert: 'Insert',
    heading: 'Heading', headingLevel: 'Heading {n}', list: 'List', more: 'More', view: 'View',
    editor: 'Write', split: 'Split', preview: 'Read', switchToMarkdown: 'Treat as Markdown', switchToText: 'Treat as plain text',
    emptyPreview: 'Nothing to preview yet.', toggleEncoding: 'Click to change encoding',
    toggleZoom: 'Click to reset zoom', dropHint: 'Drop files to open them', menuEncoding: 'Encoding',
    startWriting: '# Start writing', unsaved: 'unsaved', saved: 'saved', recovered: 'recovered draft',
    exitWriting: 'Back to the full view', nextTab: 'Next tab', shortcutsTitle: 'Keyboard shortcuts', close: 'Close', save: 'Save', open: 'Open'
  },
  settings: {
    title: 'Settings', general: 'General', keyboard: 'Keyboard shortcuts', close: 'Close',
    appearance: 'Appearance', theme: 'Theme', mode: 'Mode', effects: 'Theme effects: glow, particles, backgrounds', language: 'Language', font: 'Editor font', fontChange: 'Change…',
    editing: 'Editing', autosave: 'Save files automatically while typing', hideMarkers: 'Hide Markdown markers off the cursor line',
    wordWrap: 'Word wrap', narrowColumn: 'Narrow text column', lineNumbers: 'Line numbers', spellcheck: 'Spell check (Swedish and English)', updates: 'Updates',
    tabsWindows: 'Tabs and windows', ctrlW: 'Ctrl+W closes', ctrlWTab: 'the tab', ctrlWWindow: 'the window', ctrlWOther: 'another command (see Keyboard shortcuts)', checkUpdates: 'Check for updates automatically',
    checkNow: 'Check now', version: 'Version {version}',
    searchPlaceholder: 'Search commands or keys', command: 'Command', keys: 'Keys', add: 'Add shortcut', remove: 'Remove {key}',
    reset: 'Reset', resetAll: 'Reset all shortcuts', resetAllConfirm: 'Reset every keyboard shortcut to its default?',
    record: 'Press the new key combination… (Esc cancels)', notAllowed: '{key} cannot be used. Use Ctrl, Alt or a function key.',
    inUse: '{key} is used by “{command}”.', reassign: 'Move it here', cancel: 'Cancel', custom: 'Changed', none: 'No shortcut',
    noResults: 'No command matches.',
    cat: { file: 'File', edit: 'Edit', line: 'Line', format: 'Format', view: 'View', help: 'Help' }
  },
  update: {
    available: 'Notera {version} is available.', download: 'Download and install', later: 'Later',
    downloading: 'Downloading Notera {version}… {percent} %', ready: 'Notera {version} is ready to install.',
    restart: 'Restart and install', latest: 'You have the latest version of Notera ({version}).',
    unsupported: 'Updates work in the installed version of Notera. This copy is {reason}.',
    reasonDev: 'running from source', reasonPortable: 'the portable version', error: 'Could not check for updates.',
    downloadError: 'The update could not be downloaded.', checking: 'Checking for updates…',
    confirm: 'Notera {version} is available. Do you want to download and install it now?', installing: 'Installing Notera {version}…'
  },
  palette: {
    commands: 'Type a command or a setting', noMatches: 'No command matches', setting: 'Setting',
    themes: 'Pick a theme (arrow keys preview it)', modes: 'Pick a mode', languages: 'Pick a language', ctrlW: 'Ctrl+W closes',
    userTheme: 'your own', themeName: 'Name of the new theme', createTheme: 'Press Enter to create "{name}"',
    defaultThemeName: 'My theme', newThemeComment1: 'Built on "{base}". Change any value and save: Notera repaints right away.',
    newThemeComment2: 'Every key is described in THEMES.md: https://github.com/KaptenKatthatt/notera/blob/master/THEMES.md',
    settingsError: 'settings.json could not be read: line {line}: {message}. The previous settings still apply.',
    on: 'on', off: 'off',
    vscode: 'Pick a VS Code theme (arrow keys preview it)', vscodeNone: 'No VS Code themes found on this computer',
    vsixItem: 'Choose a .vsix file…', vsixDetail: 'a VS Code extension file', withPair: 'with {name}', darkOnly: 'dark only', lightOnly: 'light only',
    vsixNoThemes: '{name} has no colour themes.', vsixError: '{name} could not be read: {message}',
    importedComment1: 'Imported from VS Code: {name} ({version}). The colours are the VS Code theme\'s own.',
    importedComment2: 'Add a "notera" section for heading colours, fonts and effects: see THEMES.md.'
  },
  theme: {
    error: 'The theme "{theme}" could not be loaded: {message}', errorAt: 'The theme "{theme}" could not be loaded: theme.json line {line}: {message}',
    openFolder: 'Open themes folder', dismiss: 'OK'
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
    file: '&Arkiv', new: 'Ny flik', newWindow: 'Nytt fönster', open: 'Öppna…', openRecent: 'Öppna senaste',
    newFromTemplate: 'Ny från mall', applyTemplate: 'Applicera mall', noTemplates: 'Inga mallar',
    clearRecent: 'Rensa listan', save: 'Spara', saveAs: 'Spara som…', saveAll: 'Spara alla', closeTab: 'Stäng flik',
    print: 'Skriv ut…', exit: 'Avsluta',
    edit: '&Redigera', undo: 'Ångra', redo: 'Gör om', cut: 'Klipp ut', copy: 'Kopiera', paste: 'Klistra in', delete: 'Ta bort',
    find: 'Sök…', findNext: 'Sök nästa', findPrevious: 'Sök föregående', replace: 'Ersätt…', goTo: 'Gå till…',
    selectAll: 'Markera allt', timeDate: 'Tid/datum', font: 'Teckensnitt…', spellcheck: 'Stavningskontroll',
    addToDictionary: 'Lägg till i ordlistan', noSuggestions: 'Inga förslag',
    format: 'F&ormat', bold: 'Fet', italic: 'Kursiv', strikethrough: 'Genomstruken', heading1: 'Rubrik 1',
    heading2: 'Rubrik 2', heading3: 'Rubrik 3', heading4: 'Rubrik 4', heading5: 'Rubrik 5', heading6: 'Rubrik 6', bulletList: 'Punktlista', numberedList: 'Numrerad lista',
    checkList: 'Att göra-lista', quote: 'Citat', code: 'Kod', codeBlock: 'Kodblock', link: 'Länk',
    horizontalRule: 'Avdelare', table: 'Tabell',
    view: '&Visa', zoom: 'Zoom', zoomIn: 'Zooma in', zoomOut: 'Zooma ut', zoomReset: 'Återställ standardzoom',
    statusBar: 'Statusfält', narrowColumn: 'Begränsad textbredd', wordWrap: 'Radbyte', lineNumbers: 'Radnummer', formattingBar: 'Formateringsfält',
    editorOnly: 'Skriv', split: 'Delad', previewOnly: 'Läs', theme: 'Tema', themeSystem: 'Följ systemet',
    themeLight: 'Ljust', themeDark: 'Mörkt', themeBroken: '{name} (trasigt)', openThemesFolder: 'Öppna temamappen', effects: 'Temaeffekter', commandPalette: 'Kommandopalett…', pickTheme: 'Bläddra bland teman…', newThemeFromCurrent: 'Nytt tema från nuvarande…', openSettingsJson: 'Öppna inställningar (JSON)', importVsCodeTheme: 'Importera VS Code-tema…', language: 'Språk', langAuto: 'Automatiskt', langEn: 'English', langSv: 'Svenska',
    help: '&Hjälp', about: 'Om Notera', toggleDevTools: 'Utvecklarverktyg',
    writingMode: 'Skrivläge', fullscreen: 'Helskärm', autosave: 'Spara automatiskt', hideMarkers: 'Dölj Markdown-tecken',
    shortcuts: 'Kortkommandon',
    line: 'Rad', moveLineUp: 'Flytta rad uppåt', moveLineDown: 'Flytta rad nedåt', copyLineUp: 'Kopiera rad uppåt',
    copyLineDown: 'Kopiera rad nedåt', selectLine: 'Markera rad', deleteLine: 'Radera rad', insertLineBelow: 'Ny rad under',
    insertLineAbove: 'Ny rad över', selectNextOccurrence: 'Lägg till nästa förekomst', selectAllOccurrences: 'Markera alla förekomster',
    addCursorAbove: 'Lägg till markör ovanför', addCursorBelow: 'Lägg till markör nedanför', indentLine: 'Öka indrag', outdentLine: 'Minska indrag',
    closeWindow: 'Stäng fönster', nextTab: 'Nästa flik', prevTab: 'Föregående flik', settings: 'Inställningar…', checkForUpdates: 'Sök efter uppdateringar…',
    moveLine: 'Flytta rad upp/ned', copyLine: 'Kopiera rad upp/ned', cutCopyLine: 'Klipp ut/kopiera rad (utan markering)', addCursor: 'Lägg till markör upp/ned', headings: 'Rubrik 1, 2, 3', indentBoth: 'Öka/minska indrag', viewModes: 'Skriv, delad, läs'
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
    utf8: 'UTF-8', utf8bom: 'UTF-8 med BOM', utf16le: 'UTF-16 LE', utf16be: 'UTF-16 BE', ansi: 'ANSI',
    markdown: 'Markdown', plainText: 'Text', newTab: 'Ny flik', closeTab: 'Stäng flik', modified: 'Osparade ändringar',
    fontTitle: 'Teckensnitt', fontFamily: 'Typsnitt', fontSize: 'Storlek', fontPreview: 'Flygande bäckasiner söka hwila på mjuka tuvor 0123456789',
    apply: 'Använd', cancel: 'Avbryt', goToTitle: 'Gå till rad', lineNumber: 'Radnummer', go: 'Gå',
    linkTitle: 'Infoga länk', linkText: 'Text', linkUrl: 'Adress', insert: 'Infoga',
    heading: 'Rubrik', headingLevel: 'Rubrik {n}', list: 'Lista', more: 'Mer', view: 'Vy',
    editor: 'Skriv', split: 'Delad', preview: 'Läs', switchToMarkdown: 'Behandla som Markdown', switchToText: 'Behandla som text',
    emptyPreview: 'Inget att förhandsvisa ännu.', toggleEncoding: 'Klicka för att byta teckenkodning',
    toggleZoom: 'Klicka för att återställa zoom', dropHint: 'Släpp filer här för att öppna dem', menuEncoding: 'Teckenkodning',
    startWriting: '# Börja skriva', unsaved: 'osparad', saved: 'sparad', recovered: 'återställt utkast',
    exitWriting: 'Tillbaka till hela vyn', nextTab: 'Nästa flik', shortcutsTitle: 'Kortkommandon', close: 'Stäng', save: 'Spara', open: 'Öppna'
  },
  settings: {
    title: 'Inställningar', general: 'Allmänt', keyboard: 'Kortkommandon', close: 'Stäng',
    appearance: 'Utseende', theme: 'Tema', mode: 'Läge', effects: 'Temaeffekter: glöd, partiklar, bakgrunder', language: 'Språk', font: 'Teckensnitt i editorn', fontChange: 'Ändra…',
    editing: 'Redigering', autosave: 'Spara filer automatiskt medan du skriver', hideMarkers: 'Dölj Markdown-tecken utanför markörens rad',
    wordWrap: 'Radbyte', narrowColumn: 'Begränsad textbredd', lineNumbers: 'Radnummer', spellcheck: 'Stavningskontroll (svenska och engelska)', updates: 'Uppdateringar',
    tabsWindows: 'Flikar och fönster', ctrlW: 'Ctrl+W stänger', ctrlWTab: 'fliken', ctrlWWindow: 'fönstret', ctrlWOther: 'ett annat kommando (se Kortkommandon)', checkUpdates: 'Sök efter uppdateringar automatiskt',
    checkNow: 'Sök nu', version: 'Version {version}',
    searchPlaceholder: 'Sök kommando eller tangent', command: 'Kommando', keys: 'Tangenter', add: 'Lägg till kortkommando', remove: 'Ta bort {key}',
    reset: 'Återställ', resetAll: 'Återställ alla kortkommandon', resetAllConfirm: 'Återställa alla kortkommandon till standard?',
    record: 'Tryck den nya tangentkombinationen… (Esc avbryter)', notAllowed: '{key} går inte att använda. Använd Ctrl, Alt eller en F-tangent.',
    inUse: '{key} används av ”{command}”.', reassign: 'Flytta hit', cancel: 'Avbryt', custom: 'Ändrad', none: 'Inget kortkommando',
    noResults: 'Inget kommando matchar.',
    cat: { file: 'Arkiv', edit: 'Redigera', line: 'Rad', format: 'Format', view: 'Visa', help: 'Hjälp' }
  },
  update: {
    available: 'Notera {version} finns.', download: 'Ladda ner och installera', later: 'Senare',
    downloading: 'Laddar ner Notera {version}… {percent} %', ready: 'Notera {version} är klar att installeras.',
    restart: 'Starta om och installera', latest: 'Du har den senaste versionen av Notera ({version}).',
    unsupported: 'Uppdateringar fungerar i den installerade versionen av Notera. Den här kopian är {reason}.',
    reasonDev: 'startad från källkoden', reasonPortable: 'den portabla versionen', error: 'Det gick inte att söka efter uppdateringar.',
    downloadError: 'Uppdateringen gick inte att ladda ner.', checking: 'Söker efter uppdateringar…',
    confirm: 'Notera {version} finns. Vill du ladda ner och installera den nu?', installing: 'Installerar Notera {version}…'
  },
  palette: {
    commands: 'Skriv ett kommando eller en inställning', noMatches: 'Inget kommando matchar', setting: 'Inställning',
    themes: 'Välj tema (piltangenterna förhandsvisar)', modes: 'Välj läge', languages: 'Välj språk', ctrlW: 'Ctrl+W stänger',
    userTheme: 'eget', themeName: 'Namn på det nya temat', createTheme: 'Tryck Enter för att skapa "{name}"',
    defaultThemeName: 'Mitt tema', newThemeComment1: 'Bygger på "{base}". Ändra ett värde och spara: Notera målar om direkt.',
    newThemeComment2: 'Alla nycklar beskrivs i THEMES.md: https://github.com/KaptenKatthatt/notera/blob/master/THEMES.md',
    settingsError: 'settings.json gick inte att läsa: rad {line}: {message}. De förra inställningarna gäller fortfarande.',
    on: 'på', off: 'av',
    vscode: 'Välj ett VS Code-tema (piltangenterna förhandsvisar)', vscodeNone: 'Hittade inga VS Code-teman på datorn',
    vsixItem: 'Välj en .vsix-fil…', vsixDetail: 'en fil med ett VS Code-tillägg', withPair: 'med {name}', darkOnly: 'bara mörkt', lightOnly: 'bara ljust',
    vsixNoThemes: '{name} innehåller inga färgteman.', vsixError: '{name} gick inte att läsa: {message}',
    importedComment1: 'Importerat från VS Code: {name} ({version}). Färgerna är VS Code-temats egna.',
    importedComment2: 'Lägg till en "notera"-sektion för rubrikfärger, typsnitt och effekter: se THEMES.md.'
  },
  theme: {
    error: 'Temat "{theme}" gick inte att läsa in: {message}', errorAt: 'Temat "{theme}" gick inte att läsa in: theme.json rad {line}: {message}',
    openFolder: 'Öppna temamappen', dismiss: 'OK'
  },
  search: {
    'Find': 'Sök', 'Replace': 'Ersätt', 'next': 'Nästa', 'previous': 'Föregående', 'all': 'Alla', 'match case': 'Matcha skiftläge',
    'by word': 'Hela ord', 'regexp': 'Regex', 'replace': 'Ersätt', 'replace all': 'Ersätt alla', 'close': 'Stäng',
    'Go to line': 'Gå till rad', 'go': 'Gå', 'current match': 'aktuell träff', 'replaced $ matches': 'ersatte $ träffar',
    'replaced match on line $': 'ersatte träff på rad $', 'on line': 'på rad'
  }
};

// Alt+1 … Alt+9
en.menu.goToTab = 'Go to tab';
sv.menu.goToTab = 'Gå till flik';
for (let n = 1; n <= 9; n++) {
  en.menu[`goToTab${n}`] = `Go to tab ${n}`;
  sv.menu[`goToTab${n}`] = `Gå till flik ${n}`;
}

en.templates = { standupTitle: 'Standup', doneLast: 'Done since last', blockers: 'Blockers', nextUp: 'To do for next meeting' };
sv.templates = { standupTitle: 'Standup', doneLast: 'Gjort sen sist', blockers: 'Blockers', nextUp: 'Göra till nästa möte' };

Object.assign(en.menu, {
  newNote: 'New note', newNoteInProject: 'New note in project', newProject: 'New project…', toggleSidebar: 'Sidebar',
  searchNotes: 'Search notes', archiveNote: 'Archive note', chooseNotesFolder: 'Notes folder…'
});
Object.assign(sv.menu, {
  newNote: 'Ny anteckning', newNoteInProject: 'Ny anteckning i projektet', newProject: 'Nytt projekt…', toggleSidebar: 'Sidopanel',
  searchNotes: 'Sök anteckningar', archiveNote: 'Arkivera anteckningen', chooseNotesFolder: 'Anteckningsmapp…'
});

en.notes = {
  create: 'Create', untitledNote: 'Untitled note', title: 'Notes', collapse: 'Hide the sidebar', search: 'Search notes', searchAll: 'Search all notes, including the archive',
  inbox: 'Unsorted', projects: 'Projects', newProject: 'New project', projectName: 'Project name',
  newNote: 'New note', newNoteIn: 'New note in {project}', more: 'More', open: 'Open', pin: 'Pin to top', unpin: 'Unpin',
  moveTo: 'Move to', moveToProject: 'Move to project', newProjectEllipsis: 'New project…', archive: 'Archive', delete: 'Delete…',
  rename: 'Rename', archiveProject: 'Archive project', deleteProject: 'Delete project…',
  archiveTitle: 'Archive', archiveHint: 'Hidden from the list but included in search. Restore puts a note back into its project.',
  archiveEmpty: 'The archive is empty.', wholeProject: 'whole project', restore: 'Restore', restoreTo: 'Restore to {project}',
  restoreProject: 'Restore project', deleteForever: 'Delete permanently…', back: 'Back',
  emptyInbox: 'Nothing unsorted. Ctrl+T writes here.', emptyProject: 'Empty. Click + for a note.',
  noResults: 'No notes match “{q}”.', archived: 'Archived', recent: 'Notes',
  setup: 'Collect your notes in projects. Choose a notes folder and Notera makes one subfolder per project in it.',
  chooseFolder: 'Choose notes folder…', chooseFolderTitle: 'Choose notes folder', banner: 'Collect your notes in projects: choose a folder where Notera sorts them.',
  notNow: 'Not now', folderChosen: 'Notes folder chosen. Ctrl+T now writes to {inbox}.',
  archivedBanner: 'Archived from {project}. Read-only until you restore it.', showInSidebar: 'Show in sidebar', closeTab: 'Close tab',
  closeOthers: 'Close others', closeToRight: 'Close to the right', closeAll: 'Close all',
  templates: 'Templates', newTemplate: 'New template', templateName: 'Template name', emptyTemplates: 'No templates. Click + to add one.',
  saveAsTemplate: 'Save as template…', defaultTemplate: 'Default template', noTemplate: 'None',
  sortBy: 'Sort', sortManual: 'Manual', sortDate: 'Date in note',
  chooseFolderFirst: 'Choose a notes folder first',
  toastArchived: 'Archived: {title}', toastMoved: 'Moved to {project}', toastRestored: 'Restored to {project}',
  toastRestoredNew: 'Restored to {project} (project re-created)', toastProjectArchived: 'Project {project} archived',
  toastProjectRestored: 'Project {project} restored', toastProjectRenamed: 'Renamed to {project}', toastDeleted: 'Moved to the Recycle Bin: {title}',
  toastProjectDeleted: 'Project {project} moved to the Recycle Bin', toastRenamed: 'Renamed the file to {file}', toastNewNote: 'New note in {project}',
  toastNoteRenamed: 'Renamed to {title}', noteName: 'Note name',
  undo: 'Undo', undone: 'Undone', undoFailed: 'Could not undo',
  nameEmpty: 'Enter a name.', nameInvalid: 'The name cannot contain < > : " / \\ | ? * or end with a dot.', nameReserved: '{name} is reserved.',
  nameTaken: 'There is already a project called {name}.',
  deleteNoteTitle: 'Delete the note?', deleteNoteMessage: '“{title}” will be moved to the Recycle Bin. You can restore it from there.',
  dontAsk: "Don't ask again", deleteButton: 'Delete',
  deleteProjectTitle: 'Delete the project {project}?', deleteProjectMessage: '{project} and {n} notes will be moved to the Recycle Bin.',
  deleteProjectDetail: 'To keep the notes out of the list without deleting them, archive the project instead.',
  deleteEmptyProject: 'The project is empty. Its folder will be removed.', archiveInstead: 'Archive instead', deleteProjectButton: 'Delete project',
  opFailed: 'That did not work: {error}', settingsSection: 'Notes', settingsFolder: 'Notes folder', notChosen: 'Not chosen', change: 'Change…', confirmDeleteSetting: 'Ask before deleting a note'
};
sv.notes = {
  create: 'Skapa', untitledNote: 'Namnlös anteckning', title: 'Anteckningar', collapse: 'Fäll in sidopanelen', search: 'Sök anteckningar', searchAll: 'Sök i alla anteckningar, arkivet inräknat',
  inbox: 'Osorterat', projects: 'Projekt', newProject: 'Nytt projekt', projectName: 'Projektnamn',
  newNote: 'Ny anteckning', newNoteIn: 'Ny anteckning i {project}', more: 'Mer', open: 'Öppna', pin: 'Fäst överst', unpin: 'Lossa',
  moveTo: 'Flytta till', moveToProject: 'Flytta till projekt', newProjectEllipsis: 'Nytt projekt…', archive: 'Arkivera', delete: 'Ta bort…',
  rename: 'Byt namn', archiveProject: 'Arkivera projekt', deleteProject: 'Ta bort projekt…',
  archiveTitle: 'Arkiv', archiveHint: 'Dolt i listan men med i sökningen. Återställ lägger tillbaka anteckningen i sitt projekt.',
  archiveEmpty: 'Arkivet är tomt.', wholeProject: 'helt projekt', restore: 'Återställ', restoreTo: 'Återställ till {project}',
  restoreProject: 'Återställ projektet', deleteForever: 'Ta bort permanent…', back: 'Tillbaka',
  emptyInbox: 'Inget osorterat. Ctrl+T skriver hit.', emptyProject: 'Tomt. Klicka på + för en anteckning.',
  noResults: 'Inga anteckningar matchar ”{q}”.', archived: 'Arkiverad', recent: 'Anteckningar',
  setup: 'Samla anteckningarna i projekt. Välj en anteckningsmapp så skapar Notera en undermapp per projekt där.',
  chooseFolder: 'Välj anteckningsmapp…', chooseFolderTitle: 'Välj anteckningsmapp', banner: 'Samla anteckningarna i projekt: välj en mapp där Notera sorterar dem.',
  notNow: 'Inte nu', folderChosen: 'Anteckningsmappen är vald. Ctrl+T skriver nu i {inbox}.',
  archivedBanner: 'Arkiverad från {project}. Skrivskyddad tills du återställer den.', showInSidebar: 'Visa i sidopanelen', closeTab: 'Stäng flik',
  closeOthers: 'Stäng andra', closeToRight: 'Stäng till höger', closeAll: 'Stäng alla',
  templates: 'Mallar', newTemplate: 'Ny mall', templateName: 'Mallnamn', emptyTemplates: 'Inga mallar. Klicka på + för att lägga till en.',
  saveAsTemplate: 'Spara som mall…', defaultTemplate: 'Standardmall', noTemplate: 'Ingen',
  sortBy: 'Sortering', sortManual: 'Manuell', sortDate: 'Datum i anteckningen',
  chooseFolderFirst: 'Välj en anteckningsmapp först',
  toastArchived: 'Arkiverad: {title}', toastMoved: 'Flyttad till {project}', toastRestored: 'Återställd till {project}',
  toastRestoredNew: 'Återställd till {project} (projektet återskapades)', toastProjectArchived: 'Projektet {project} arkiverat',
  toastProjectRestored: 'Projektet {project} återställt', toastProjectRenamed: 'Bytte namn till {project}', toastDeleted: 'Flyttad till papperskorgen: {title}',
  toastProjectDeleted: 'Projektet {project} flyttat till papperskorgen', toastRenamed: 'Filen döptes om till {file}', toastNewNote: 'Ny anteckning i {project}',
  toastNoteRenamed: 'Bytte namn till {title}', noteName: 'Anteckningens namn',
  undo: 'Ångra', undone: 'Ångrat', undoFailed: 'Det gick inte att ångra',
  nameEmpty: 'Ange ett namn.', nameInvalid: 'Namnet får inte innehålla < > : " / \\ | ? * eller sluta med punkt.', nameReserved: '{name} är reserverat.',
  nameTaken: 'Det finns redan ett projekt som heter {name}.',
  deleteNoteTitle: 'Ta bort anteckningen?', deleteNoteMessage: '”{title}” flyttas till papperskorgen. Därifrån går den att återställa.',
  dontAsk: 'Fråga inte igen', deleteButton: 'Ta bort',
  deleteProjectTitle: 'Ta bort projektet {project}?', deleteProjectMessage: '{project} och {n} anteckningar flyttas till papperskorgen.',
  deleteProjectDetail: 'Vill du bara få bort anteckningarna ur listan kan du arkivera projektet i stället.',
  deleteEmptyProject: 'Projektet är tomt. Mappen tas bort.', archiveInstead: 'Arkivera i stället', deleteProjectButton: 'Ta bort projektet',
  opFailed: 'Det gick inte: {error}', settingsSection: 'Anteckningar', settingsFolder: 'Anteckningsmapp', notChosen: 'Inte vald', change: 'Byt…', confirmDeleteSetting: 'Fråga innan en anteckning tas bort'
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
