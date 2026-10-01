'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, nativeTheme, clipboard, session, protocol } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { Settings } = require('./settings');
const files = require('./files');
const { writeFileAtomic } = require('./atomicWrite');
const { resolveLocale, makeT } = require('../shared/strings');
const commands = require('../shared/commands');
const { createUpdater } = require('./updater');
const templates = require('../shared/templates');
const { DEFAULT_THEME, MODES, parseJsonc, migrateThemeSettings, CURSOR_EFFECT_IDS, resolveTheme, variantOf, themeName } = require('../shared/themeFormat');
const { setJsonc } = require('../shared/jsoncEdit');
const fsSync = require('fs');
const { createThemeStore, describeError, SCHEME } = require('./themes');
const vscode = require('./vscodeImport');
const { createNotesStore } = require('./notes');

const isDev = !app.isPackaged;
// Tests point this at a scratch directory so they never touch real settings.
if (process.env.NOTERA_USER_DATA) app.setPath('userData', process.env.NOTERA_USER_DATA);
let settings;
let t;
let locale;
// AUMID: matchar electron-builder appId — krav för att JumpList (taskbar-
// högerklicket) och notifieringar ska knytas till appens identitet i Windows.
app.setAppUserModelId('se.jonasolson.notera');
const pendingFiles = new Map(); // webContents.id -> string[]
const pendingTabs = new Map(); // webContents.id -> draftId (flik lossad till nytt fönster)
const closeConfirmed = new WeakSet(); // windows whose renderer has settled unsaved work, so close() may go ahead
let draftsClaimed = false; // only the first window restores drafts, or a second window would duplicate them
let updater;
let notesStore = null;
let themeStore = null;
/** The active theme as the window paints it, and the last load error if any. */
let themeState = { payload: null, error: null };

// Theme files (fonts, images, style.css) reach the window over notera-theme://<id>/<path>.
// Registered before the app is ready, as Electron requires for privileged schemes.
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

function parseFileArgs(argv, cwd) {
  const args = process.defaultApp ? argv.slice(2) : argv.slice(1);
  return args
    .filter((a) => a && !a.startsWith('-') && a !== '.')
    .map((a) => path.resolve(cwd || process.cwd(), a));
}

function refreshLocale() {
  locale = resolveLocale(settings.get('language'), app.getLocale());
  t = makeT(locale);
}

// ---------- themes ----------
/**
 * Load the theme in settings. A broken theme keeps the one already on screen (Default at startup)
 * and records the error, so a half-saved theme.json never blanks the window.
 */
function loadActiveTheme() {
  const id = settings.get('theme');
  try {
    themeState = { payload: themeStore.payload(themeStore.has(id) ? id : DEFAULT_THEME, locale), error: null };
  } catch (e) {
    const error = describeError(id, e);
    if (!themeState.payload) {
      try { themeState = { payload: themeStore.payload(DEFAULT_THEME, locale), error }; return; } catch { /* Default itself is missing */ }
    }
    themeState = { payload: themeState.payload, error };
  }
}

function themeMessage() {
  return { dark: nativeTheme.shouldUseDarkColors, theme: themeState.payload, error: themeState.error };
}

function broadcastTheme() { broadcast('theme:changed', themeMessage()); }

/** The window background before the page paints: the active variant's editor background. */
function themeBackground() {
  const v = themeState.payload?.variants?.[nativeTheme.shouldUseDarkColors ? 'dark' : 'light'];
  const bg = v?.vars?.['--bg'];
  return typeof bg === 'string' && /^#[0-9a-f]{3,8}$/i.test(bg) ? bg : (nativeTheme.shouldUseDarkColors ? '#101010' : '#ffffff');
}

/**
 * "New theme from current": a folder in the user's themes with a theme.json that extends the
 * active theme and repeats a few of its colours as a starting point. Switches to it.
 */
async function createThemeFromCurrent(name) {
  const clean = name.trim().slice(0, 60) || t('palette.defaultThemeName');
  const base = themeStore.has(settings.get('theme')) ? settings.get('theme') : DEFAULT_THEME;
  const id = freeThemeId(clean, 'my-theme');
  const payload = themeStore.payload(base, locale);
  const pick = (v, key) => v?.vars?.[key];
  const variant = (v) => ({
    colors: { 'editor.background': pick(v, '--bg'), 'editor.foreground': pick(v, '--fg'), 'button.background': pick(v, '--accent') },
    notera: { colors: { heading: pick(v, '--md-h') } }
  });
  const body = {
    $schema: 'https://raw.githubusercontent.com/KaptenKatthatt/notera/master/theme.schema.json',
    name: clean,
    extends: base,
    dark: variant(payload.variants.dark),
    light: variant(payload.variants.light)
  };
  const intro = `// ${t('palette.newThemeComment1', { base: payload.name })}\n// ${t('palette.newThemeComment2')}\n`;
  const json = JSON.stringify(body, null, 2);
  const text = json.replace(/^\{\n/, `{\n  ${intro.trim().split('\n').join('\n  ')}\n`) + '\n';
  const dir = path.join(themeStore.userDir, id);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'theme.json');
  await writeFileAtomic(file, text);
  themeStore.scan();
  updateSettings({ theme: id });
  buildMenu();
  return { id, file };
}

// ---------- Theme tab: editing the active theme ----------
/** A theme id made from a display name: lowercase ASCII, dashes, and -2, -3 … when it is taken. */
function freeThemeId(name, fallback) {
  const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56) || fallback;
  let id = slug;
  for (let n = 2; themeStore.has(id) || fsSync.existsSync(path.join(themeStore.userDir, id)); n++) id = `${slug}-${n}`;
  return id;
}

const activeThemeId = () => (themeStore.has(settings.get('theme')) ? settings.get('theme') : DEFAULT_THEME);
const isBuiltinTheme = (id) => !(themeStore.dirOf(id) || '').startsWith(themeStore.userDir);

/** The theme.json text a user copy of a built-in theme starts as: it extends the original. */
function ownCopyText(base) {
  const name = t('theme.ownCopy', { name: themeName(resolveTheme(base, themeStore.raw).theme.name, locale, base) });
  const head = `{\n  "$schema": "https://raw.githubusercontent.com/KaptenKatthatt/notera/master/theme.schema.json",\n  // ${t('theme.ownCopyComment', { base })}\n`;
  return { name, text: `${head}  "name": ${JSON.stringify(name)},\n  "extends": ${JSON.stringify(base)}\n}\n` };
}

/**
 * What the Theme tab shows: the active theme, whether it is built in (the first change then makes
 * a copy), what its own theme.json sets, and both variants as they resolve with everything it
 * extends.
 */
function themeEditInfo() {
  const id = activeThemeId();
  try {
    const theme = resolveTheme(id, themeStore.raw).theme;
    return {
      id, name: themeName(theme.name, locale, id), builtin: isBuiltinTheme(id), own: themeStore.raw(id),
      copyName: isBuiltinTheme(id) ? ownCopyText(id).name : null,
      variants: { light: variantOf(theme, false), dark: variantOf(theme, true) }, error: null
    };
  } catch (e) { return { id, error: describeError(id, e) }; }
}

/** One change: `path` inside a variant ('colors', …, or 'notera', …), in light, dark or both. */
function applyThemeEdit(text, { variant, path: p, value }, existing = []) {
  const parts = Array.isArray(p) ? p.map(String) : [];
  if (!parts.length) return text;
  // Both, in a theme with only one variant (it is used for both modes): only that one, since a new
  // section for the other would replace it in that mode instead of adding to it.
  const variants = variant === 'light' || variant === 'dark' ? [variant] : existing.length === 1 ? existing : ['light', 'dark'];
  // Both: written into each variant, since a value at the top would lose to a variant's own value
  // inherited from the original. Resetting both also clears the top level.
  if (variants.length === 2 && value === undefined) text = setJsonc(text, parts, undefined);
  for (const v of variants) text = setJsonc(text, [v, ...parts], value);
  return text;
}

/** The text an edit would give, and the theme it goes to, without writing anything. */
async function themeEditText(edit) {
  const base = activeThemeId();
  const resolved = resolveTheme(base, themeStore.raw).theme;
  const existing = ['light', 'dark'].filter((k) => resolved[k] && typeof resolved[k] === 'object' && !Array.isArray(resolved[k]));
  if (isBuiltinTheme(base)) return { id: null, base, text: applyThemeEdit(ownCopyText(base).text, edit, existing) };
  const file = path.join(themeStore.dirOf(base), 'theme.json');
  return { id: base, base, file, text: applyThemeEdit(await fs.readFile(file, 'utf8'), edit, existing) };
}

/** The window painted with an edit, before it is written: the Theme tab's live preview. */
async function previewThemeEdit(edit) {
  try {
    const { id, text } = await themeEditText(edit);
    // A theme of your own keeps its id, so its own style.css and fonts still load in the preview.
    return { dark: nativeTheme.shouldUseDarkColors, theme: themeStore.payloadFromRaw(parseJsonc(text), id || '__theme-edit', locale), error: null };
  } catch (e) { return { dark: nativeTheme.shouldUseDarkColors, theme: null, error: describeError(activeThemeId(), e) }; }
}

/**
 * Writes one change to the active theme's theme.json. A built-in theme is copied first, as
 * "<name> (own)" extending it, and the window switches to the copy.
 */
async function editTheme(edit) {
  const { text, base, ...target } = await themeEditText(edit);
  let { id, file } = target;
  if (!id) {
    const { name } = ownCopyText(base);
    id = freeThemeId(name, `${base}-own`);
    const dir = path.join(themeStore.userDir, id);
    await fs.mkdir(dir, { recursive: true });
    file = path.join(dir, 'theme.json');
  }
  parseJsonc(text); // never write what would not load
  await writeFileAtomic(file, text);
  themeStore.scan();
  if (settings.get('theme') !== id) { updateSettings({ theme: id }); buildMenu(); }
  else { loadActiveTheme(); broadcastTheme(); }
  return themeEditInfo();
}

/** Edits one at a time: two at once would read the same file, and the second would undo the first. */
/** @type {Promise<any>} */
let themeEditQueue = Promise.resolve();
function queueThemeEdit(edit) {
  const run = themeEditQueue.then(() => editTheme(edit)).catch((e) => ({ error: describeError(activeThemeId(), e) }));
  themeEditQueue = run;
  return run;
}

// ---------- VS Code themes ----------
/** VS Code themes the palette has listed, by key, so preview and import can find them again. */
const vscodeThemes = new Map();

function listVsCodeThemes(themes) {
  return themes.map((th) => {
    vscodeThemes.set(th.key, { theme: th, all: themes });
    const other = vscode.counterpart(th, themes);
    return { key: th.key, label: th.label, dark: th.dark, extension: th.extension.name, pair: other ? other.label : null };
  });
}

function readVsix(file) {
  try {
    const themes = vscode.themesIn(vscode.vsixSource(file));
    if (!themes.length) return { error: t('palette.vsixNoThemes', { name: path.basename(file) }) };
    return { themes: listVsCodeThemes(themes) };
  } catch (err) {
    return { error: t('palette.vsixError', { name: path.basename(file), message: /** @type {any} */ (err).message }) };
  }
}

function vscodeTheme(key) {
  const hit = vscodeThemes.get(key);
  if (!hit) throw new Error('theme not listed');
  return vscode.toNoteraTheme(hit.theme, vscode.counterpart(hit.theme, hit.all));
}

/**
 * Write a VS Code theme into the user's themes folder as a Notera theme and switch to it. A
 * re-import of the same theme replaces the earlier copy; another theme with the same name gets
 * its own folder.
 */
async function importVsCodeTheme(key) {
  const nt = vscodeTheme(key);
  const slug = vscode.slugify(nt.name);
  let id = slug;
  for (let n = 2; ; n++) {
    const file = path.join(themeStore.userDir, id, 'theme.json');
    const builtin = themeStore.has(id) && !themeStore.dirOf(id)?.startsWith(themeStore.userDir);
    let same = false;
    try {
      const old = parseJsonc(fsSync.readFileSync(file, 'utf8'));
      same = old?.importedFrom?.extension === nt.importedFrom.extension && old?.name === nt.name;
    } catch { /* no theme there */ }
    if (!builtin && (same || !fsSync.existsSync(path.join(themeStore.userDir, id)))) break;
    id = `${slug}-${n}`;
  }
  const intro = [t('palette.importedComment1', { name: nt.importedFrom.themes.join(' + '), version: nt.importedFrom.version }), t('palette.importedComment2')];
  const json = JSON.stringify(nt, null, 2);
  const text = json.replace(/^\{\n/, `{\n${intro.map((l) => `  // ${l}`).join('\n')}\n`) + '\n';
  const dir = path.join(themeStore.userDir, id);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'theme.json');
  await writeFileAtomic(file, text);
  themeStore.scan();
  updateSettings({ theme: id });
  return { id, file };
}

// Settings Notera keeps up to date by itself; an open settings.json tab holds them as they were
// when it was opened, so saving it must not roll them back.
const APP_MANAGED = new Set(['recentFiles', 'lastDir', 'windowBounds', 'sidebarWidth']);

/**
 * Re-read settings.json after it was edited by hand and apply what changed. A file that does not
 * parse changes nothing and says where it broke.
 */
function reloadSettingsFile() {
  let raw;
  try { raw = parseJsonc(fsSync.readFileSync(settings.file, 'utf8')); }
  catch (e) { return { error: describeError('settings.json', e) }; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: { theme: 'settings.json', message: 'not an object', line: 1, column: 1 } };
  const next = migrateThemeSettings(raw);
  const cur = settings.get();
  const patch = {};
  for (const [k, v] of Object.entries(next)) {
    if (k in cur && !APP_MANAGED.has(k) && JSON.stringify(cur[k]) !== JSON.stringify(v)) patch[k] = v;
  }
  if (Object.keys(patch).length) updateSettings(patch);
  return { changed: Object.keys(patch) };
}

function samePath(a, b) {
  const norm = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
  return norm(a) === norm(b);
}

function openThemesFolder() {
  const dir = themeStore.userDir;
  void fs.mkdir(dir, { recursive: true }).catch(() => {}).then(() => shell.openPath(dir));
}

function focusedWindow() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

// Spell checking: Swedish and English at once, so a word counts as right when either dictionary has it.
// Off by default; the editor's spellcheck attribute follows the same setting.
// Dictionaries are named 'sv-SE' on some platforms and plain 'sv' on others: take whichever exists.
const SPELL_LANGUAGES = [['sv-SE', 'sv'], ['en-US', 'en']];
function setupSpellcheck() {
  const ses = session.defaultSession;
  const available = ses.availableSpellCheckerLanguages || [];
  const langs = SPELL_LANGUAGES.map((names) => (available.length ? names.find((n) => available.includes(n)) : names[0])).filter(Boolean);
  try { if (langs.length) ses.setSpellCheckerLanguages(langs); } catch { /* macOS picks its own */ }
  ses.setSpellCheckerEnabled(!!settings.get('spellcheck'));
}

/** Right-click in a text field: spelling suggestions when spell check flags the word, then the edit commands. */
function showEditContextMenu(win, p) {
  if (!p.isEditable) return;
  const s = settings.get();
  const label = (id) => t(commands.BY_ID[id].label);
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const items = [];
  if (s.spellcheck && p.misspelledWord) {
    const words = (p.dictionarySuggestions || []).slice(0, 6);
    for (const w of words) items.push({ label: w, click: () => win.webContents.replaceMisspelling(w) });
    if (!words.length) items.push({ label: t('menu.noSuggestions'), enabled: false });
    items.push({ label: t('menu.addToDictionary'), click: () => win.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
    items.push({ type: 'separator' });
  }
  items.push(
    { label: label('cut'), role: 'cut', enabled: p.editFlags.canCut },
    { label: label('copy'), role: 'copy', enabled: p.editFlags.canCopy },
    { label: label('paste'), role: 'paste', enabled: p.editFlags.canPaste },
    { type: 'separator' },
    { label: label('selectAll'), click: () => win.webContents.send('menu:action', 'selectAll') },
    { type: 'separator' },
    { label: label('spellcheck'), type: 'checkbox', checked: !!s.spellcheck, click: (mi) => updateSettings({ spellcheck: mi.checked }) }
  );
  Menu.buildFromTemplate(items).popup({ window: win });
}

function send(action, payload) {
  const win = focusedWindow();
  if (win) win.webContents.send('menu:action', action, payload);
}

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload);
}

function updateSettings(patch) {
  // The old single `theme` setting also held the mode; accept it from older callers.
  if (MODES.includes(patch.theme)) patch = { ...patch, theme: DEFAULT_THEME, mode: patch.theme };
  const next = settings.set(patch);
  if ('language' in patch) refreshLocale();
  if ('mode' in patch) nativeTheme.themeSource = MODES.includes(next.mode) ? next.mode : 'system';
  if ('theme' in patch || 'language' in patch) loadActiveTheme();
  if ('theme' in patch || 'mode' in patch || 'language' in patch) broadcastTheme();
  if ('writingMode' in patch) for (const w of BrowserWindow.getAllWindows()) applyMenuBar(w, next.writingMode);
  if ('checkUpdates' in patch && next.checkUpdates && updater) void updater.check();
  if ('spellcheck' in patch) session.defaultSession.setSpellCheckerEnabled(!!next.spellcheck);
  broadcast('settings:changed', next);
  buildMenu();
  return next;
}

// Writing mode hides the menu bar; Alt still reveals it.
function applyMenuBar(win, writing) {
  win.autoHideMenuBar = !!writing;
  win.setMenuBarVisibility(!writing);
}

function draftsDir() { return path.join(app.getPath('userData'), 'drafts'); }

function createWindow(filesToOpen = [], pendingDraftId = null, sourceWin = null) {
  const srcBounds = sourceWin && !sourceWin.isDestroyed() ? sourceWin.getNormalBounds() : null;
  const bounds = srcBounds
    ? { x: srcBounds.x + 32, y: srcBounds.y + 32, width: srcBounds.width, height: srcBounds.height }
    : (settings.get('windowBounds') || {});
  const win = new BrowserWindow({
    width: bounds.width || 1000,
    height: bounds.height || 700,
    x: bounds.x,
    y: bounds.y,
    minWidth: 480,
    minHeight: 320,
    title: t('appName'),
    backgroundColor: themeBackground(),
    autoHideMenuBar: false,
    icon: path.join(__dirname, '../../build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  });
  if (bounds.maximized) win.maximize();
  applyMenuBar(win, settings.get('writingMode'));
  pendingFiles.set(win.webContents.id, filesToOpen);
  if (pendingDraftId) pendingTabs.set(win.webContents.id, pendingDraftId);

  win.webContents.on('context-menu', (_e, p) => showEditContextMenu(win, p));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url); }
  });

  win.on('close', (e) => {
    if (closeConfirmed.has(win)) return;
    e.preventDefault();
    win.webContents.send('window:requestClose');
  });
  const saveBounds = () => {
    if (win.isDestroyed()) return;
    const b = win.getNormalBounds();
    settings.set({ windowBounds: { ...b, maximized: win.isMaximized() } });
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  return win;
}

function fileFilters(kind) {
  const md = { name: t('dialog.markdownFiles'), extensions: ['md', 'markdown'] };
  const txt = { name: t('dialog.textFiles'), extensions: ['txt'] };
  const all = { name: t('dialog.allFiles'), extensions: ['*'] };
  return kind === 'txt' ? [txt, md, all] : [md, txt, all];
}

// ---------- IPC ----------
ipcMain.handle('app:bootstrap', (e) => {
  const list = pendingFiles.get(e.sender.id) || [];
  pendingFiles.delete(e.sender.id);
  const pendingTab = pendingTabs.get(e.sender.id) || null;
  pendingTabs.delete(e.sender.id);
  const restoreDrafts = !draftsClaimed;
  draftsClaimed = true;
  return {
    settings: settings.get(), locale, version: app.getVersion(), filesToOpen: list, pendingTab, platform: process.platform, isDev,
    dark: nativeTheme.shouldUseDarkColors, theme: themeMessage(), restoreDrafts, update: updater ? { ...updater.getState(), reason: updater.reason() } : null
  };
});

// ---------- App-level commands the renderer asks for ----------
function quitAll() { for (const w of BrowserWindow.getAllWindows()) w.close(); }
function toggleFullscreen(win) { if (win) win.setFullScreen(!win.isFullScreen()); return win ? win.isFullScreen() : false; }
function showAbout(win) {
  return dialog.showMessageBox(win || focusedWindow(), { type: 'info', title: t('menu.about'), message: t('dialog.aboutMessage', { version: app.getVersion() }) });
}

async function manualUpdateCheck(win) {
  const r = await updater.check({ manual: true });
  /** @type {(message: string, type?: 'info' | 'warning' | 'error') => Promise<any>} */
  const box = (message, type = 'info') => dialog.showMessageBox(win || focusedWindow(), { type, title: t('appName'), message, buttons: [t('dialog.ok')] });
  if (r.status === 'latest') await box(t('update.latest', { version: app.getVersion() }));
  else if (r.status === 'unsupported') await box(t('update.unsupported', { reason: t(r.reason === 'portable' ? 'update.reasonPortable' : 'update.reasonDev') }));
  else if (r.status === 'error') await box(t('update.error') + (r.message ? '\n\n' + r.message : ''), 'warning');
  else if (r.status === 'available') {
    const a = await dialog.showMessageBox(win || focusedWindow(), {
      type: 'question', title: t('appName'), message: t('update.confirm', { version: r.version }),
      buttons: [t('update.download'), t('update.later')], defaultId: 0, cancelId: 1, noLink: true
    });
    if (a.response === 0) void downloadAndInstall();
    else updater.dismiss();
  }
  return r;
}

// One yes, from the toast or the manual check's dialog, downloads and then installs.
async function downloadAndInstall() {
  const r = await updater.download({ install: true });
  if (r.ok && r.install) return installUpdate();
  return false;
}

// Every window saves or keeps its work first. If one refuses (the user cancels a save), the toast
// falls back to "Restart and install"; autoInstallOnAppQuit still installs on the next quit.
let installRunning = false;
async function installUpdate() {
  if (installRunning || !['downloaded', 'installing'].includes(updater.getState().state)) return false;
  installRunning = true;
  try {
    const ok = await prepareAllForQuit();
    if (!ok) { updater.installCancelled(); return false; }
    for (const w of BrowserWindow.getAllWindows()) closeConfirmed.add(w);
    return updater.install();
  } finally {
    installRunning = false;
  }
}

// Before installing an update every window saves or keeps its work. Untitled text is kept as a
// draft and comes back after the restart.
const prepareWaiters = new Map();
let prepareSeq = 0;
function prepareAllForQuit() {
  const wins = BrowserWindow.getAllWindows();
  return Promise.all(wins.map((w) => new Promise((resolve) => {
    const id = ++prepareSeq;
    prepareWaiters.set(id, resolve);
    w.webContents.send('window:prepareQuit', id);
  }))).then((results) => results.every(Boolean));
}
ipcMain.on('window:prepareQuitResult', (_e, id, ok) => {
  const r = prepareWaiters.get(id);
  if (r) { prepareWaiters.delete(id); r(!!ok); }
});

ipcMain.handle('app:quit', () => quitAll());
// Goes through the window's close handler, so unsaved tabs still ask first.
ipcMain.handle('window:close', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.close(); });
ipcMain.handle('app:about', (e) => showAbout(BrowserWindow.fromWebContents(e.sender)));
ipcMain.handle('edit:native', (e, op) => {
  if (['cut', 'copy', 'paste', 'undo', 'redo', 'selectAll', 'delete'].includes(op)) e.sender[op]();
});
ipcMain.handle('update:check', (e, { manual } = {}) => (manual ? manualUpdateCheck(BrowserWindow.fromWebContents(e.sender)) : updater.check()));
ipcMain.handle('update:download', () => downloadAndInstall());
ipcMain.handle('update:dismiss', () => updater.dismiss());
ipcMain.handle('update:install', () => installUpdate());
ipcMain.handle('settings:get', () => settings.get());
ipcMain.handle('themes:list', () => themeStore.list(locale));
ipcMain.handle('themes:openFolder', () => openThemesFolder());
// The theme picker previews a theme in the asking window only, without saving the setting.
ipcMain.handle('themes:preview', (_e, id) => {
  try { return { dark: nativeTheme.shouldUseDarkColors, theme: themeStore.payload(String(id), locale), error: null }; }
  catch (e) { return { dark: nativeTheme.shouldUseDarkColors, theme: null, error: describeError(String(id), e) }; }
});
ipcMain.handle('themes:create', (_e, name) => createThemeFromCurrent(String(name || '')));
ipcMain.handle('themes:editInfo', () => themeEditInfo());
ipcMain.handle('themes:previewEdit', (_e, edit) => previewThemeEdit(edit || {}));
ipcMain.handle('themes:edit', (_e, edit) => queueThemeEdit(edit || {}));
ipcMain.handle('settings:path', () => settings.file);
ipcMain.handle('vscode:list', () => listVsCodeThemes(vscode.listInstalled()));
ipcMain.handle('vscode:openVsix', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'VS Code extension', extensions: ['vsix'] }] });
  if (r.canceled || !r.filePaths[0]) return { canceled: true };
  return readVsix(r.filePaths[0]);
});
ipcMain.handle('vscode:readVsix', (_e, file) => readVsix(String(file)));
ipcMain.handle('vscode:preview', (_e, key) => {
  try {
    const nt = vscodeTheme(String(key));
    return { dark: nativeTheme.shouldUseDarkColors, theme: themeStore.payloadFromRaw(nt, '__vscode-preview', locale), error: null };
  } catch (err) { return { dark: nativeTheme.shouldUseDarkColors, theme: null, error: describeError(String(key), err) }; }
});
ipcMain.handle('vscode:import', (_e, key) => importVsCodeTheme(String(key)));
ipcMain.handle('settings:set', (_e, patch) => updateSettings(patch));

ipcMain.handle('file:openDialog', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, {
    title: t('dialog.openTitle'),
    defaultPath: settings.get('lastDir') || app.getPath('documents'),
    filters: fileFilters('md'),
    properties: ['openFile', 'multiSelections']
  });
  if (r.canceled) return [];
  if (r.filePaths.length) settings.set({ lastDir: path.dirname(r.filePaths[0]) });
  return r.filePaths;
});

ipcMain.handle('file:read', async (_e, p) => {
  try {
    const [buf, st] = await Promise.all([fs.readFile(p), fs.stat(p)]);
    const platformDefault = process.platform === 'win32' ? 'CRLF' : 'LF';
    const r = files.readBuffer(buf, platformDefault);
    settings.addRecent(p);
    buildMenu();
    return { ok: true, path: p, name: path.basename(p), kind: files.kindForPath(p), mtimeMs: st.mtimeMs, ...r };
  } catch (err) {
    return { ok: false, path: p, name: path.basename(p), error: err.message };
  }
});

ipcMain.handle('file:stat', async (_e, p) => {
  try { const st = await fs.stat(p); return { ok: true, mtimeMs: st.mtimeMs }; } catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('file:write', async (_e, { path: p, text, encoding, eol }) => {
  try {
    await writeFileAtomic(p, files.writeBuffer(text, encoding, eol));
    // settings.json saved by hand is applied, not added to recent files: addRecent would write the
    // settings still in memory straight over the file that was just saved.
    const isSettings = samePath(p, settings.file);
    const settingsReload = isSettings ? reloadSettingsFile() : null;
    if (!isSettings) settings.addRecent(p);
    buildMenu();
    return { ok: true, path: p, name: path.basename(p), kind: files.kindForPath(p), mtimeMs: (await fs.stat(p)).mtimeMs, settingsReload };
  } catch (err) {
    return { ok: false, path: p, name: path.basename(p), error: err.message };
  }
});

// Save As opens in the directory of the current file; a new file opens in the
// last directory used, falling back to Documents.
ipcMain.handle('file:saveAsDialog', async (_e, { currentPath, suggestedName, kind }) => {
  const ext = kind === 'txt' ? '.txt' : '.md';
  const defaultPath = currentPath
    ? currentPath
    : path.join(settings.get('lastDir') || app.getPath('documents'), (suggestedName || t('untitled')) + ext);
  // Fix: dialog utan parent-fönster (non-modal) — med parent försvinner muspekaren
  // över dialogen på Windows (Electron 44, known issue med modal + cursor).
  const r = await dialog.showSaveDialog({
    title: t('dialog.saveTitle'),
    defaultPath,
    filters: fileFilters(kind)
  });
  if (r.canceled || !r.filePath) return null;
  settings.set({ lastDir: path.dirname(r.filePath) });
  return r.filePath;
});

ipcMain.handle('dialog:confirmUnsaved', async (e, name) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showMessageBox(win, {
    type: 'question',
    title: t('dialog.unsavedTitle'),
    message: t('dialog.unsavedMessage', { name }),
    buttons: [t('dialog.save'), t('dialog.dontSave'), t('dialog.cancel')],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  });
  return ['save', 'discard', 'cancel'][r.response];
});

ipcMain.handle('dialog:confirmReload', async (e, name) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showMessageBox(win, {
    type: 'question', title: t('appName'), message: t('dialog.changedOnDisk', { name }),
    buttons: [t('dialog.reload'), t('dialog.keep')], defaultId: 0, cancelId: 1, noLink: true
  });
  return r.response === 0;
});

ipcMain.handle('dialog:confirm', async (e, message) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showMessageBox(win, {
    type: 'question', title: t('appName'), message, buttons: [t('dialog.ok'), t('dialog.cancel')], defaultId: 0, cancelId: 1, noLink: true
  });
  return r.response === 0;
});

ipcMain.handle('dialog:error', async (e, { kind, name, detail }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  await dialog.showMessageBox(win, {
    type: 'error', title: t('appName'),
    message: t(kind === 'write' ? 'dialog.writeError' : 'dialog.readError', { name }),
    detail: detail || '', buttons: [t('dialog.ok')]
  });
});

ipcMain.handle('window:print', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  return new Promise((resolve) => win.webContents.print({}, (ok, reason) => resolve({ ok, reason })));
});

ipcMain.handle('clipboard:readText', () => clipboard.readText());
ipcMain.handle('window:toggleFullscreen', (e) => toggleFullscreen(BrowserWindow.fromWebContents(e.sender)));

// Drafts: crash recovery for untitled tabs, one JSON file per draft.
ipcMain.handle('draft:list', async () => {
  try {
    const dir = draftsDir();
    const names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json'));
    const out = [];
    for (const n of names) {
      try { out.push({ id: n.slice(0, -5), ...JSON.parse(await fs.readFile(path.join(dir, n), 'utf8')) }); } catch { /* skip broken draft */ }
    }
    return out;
  } catch { return []; }
});
ipcMain.handle('draft:write', async (_e, { id, text, kind }) => {
  if (!/^[\w-]+$/.test(id)) return false;
  await fs.mkdir(draftsDir(), { recursive: true });
  await writeFileAtomic(path.join(draftsDir(), id + '.json'), JSON.stringify({ text, kind, savedAt: Date.now() }));
  return true;
});
ipcMain.handle('draft:delete', async (_e, id) => {
  if (!/^[\w-]+$/.test(id)) return false;
  try { await fs.unlink(path.join(draftsDir(), id + '.json')); } catch { /* already gone */ }
  return true;
});

ipcMain.on('window:setTitle', (e, title) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setTitle(title); });
ipcMain.on('window:closeConfirmed', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) { closeConfirmed.add(w); w.close(); }
});
ipcMain.on('window:new', () => createWindow());
ipcMain.on('tab:detach', (e, p = {}) => {
  const src = BrowserWindow.fromWebContents(e.sender);
  const files = typeof p.path === 'string' && p.path ? [p.path] : [];
  const draftId = typeof p.draftId === 'string' && p.draftId ? p.draftId : null;
  createWindow(files, draftId, src);
});
ipcMain.on('shell:openExternal', (_e, url) => { if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url); });

// ---------- Notes (projects in the sidebar) ----------
// One store per notes folder, shared by every window. Mutations are broadcast so every window
// moves its open tabs along with the files and redraws its sidebar.
function getNotesStore() {
  const root = settings.get('notesRoot');
  if (!root) return null;
  if (!notesStore || notesStore.root !== root) {
    notesStore = createNotesStore({
      root,
      getLocale: () => locale,
      trash: (p) => shell.trashItem(p),
      untitled: () => t('notes.untitledNote'),
      eol: process.platform === 'win32' ? 'CRLF' : 'LF',
      seed: true
    });
  }
  return notesStore;
}

// The File menu's template submenus list the templates folder. buildMenu is synchronous, so the
// names are kept here and refreshed after every notes change. null: no notes folder yet.
let templateNames = null;
async function refreshTemplates() {
  const store = getNotesStore();
  const next = store ? (await store.templates().catch(() => [])).map((x) => x.name) : null;
  if (JSON.stringify(next) === JSON.stringify(templateNames)) return;
  templateNames = next;
  buildMenu();
}

const NOTES_READS = new Set(['tree', 'search', 'countNotes', 'locate', 'templates', 'readTemplate', 'templateOf']);
const NOTES_WRITES = new Set([
  'createNote', 'renameForTitle', 'renameNote', 'moveNote', 'reorderNote', 'setPinned', 'archiveNote', 'restoreNote', 'deleteNote', 'discardEmpty',
  'createProject', 'renameProject', 'reorderProject', 'setCollapsed', 'archiveProject', 'restoreProject', 'deleteProject', 'undo',
  'setProjectOptions', 'createTemplate', 'saveAsTemplate', 'renameTemplate', 'deleteTemplate'
]);
ipcMain.handle('notes:call', async (_e, method, ...args) => {
  if (!NOTES_READS.has(method) && !NOTES_WRITES.has(method)) return { error: 'unknown' };
  const store = getNotesStore();
  if (!store) return { error: 'noRoot' };
  try {
    const r = await store[method](...args);
    if (NOTES_WRITES.has(method)) broadcast('notes:changed', { moved: (r && r.moved) || [], deleted: (r && r.deleted) || [] });
    // A tree read also notices templates added or removed in Explorer.
    if (NOTES_WRITES.has(method) || method === 'tree') void refreshTemplates();
    return r === undefined ? null : r;
  } catch (err) {
    return { error: 'failed', message: err.message };
  }
});

async function chooseNotesRoot(win) {
  const r = await dialog.showOpenDialog(win || focusedWindow(), {
    title: t('notes.chooseFolderTitle'),
    defaultPath: settings.get('notesRoot') || app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory', 'promptToCreate']
  });
  if (r.canceled || !r.filePaths.length) return null;
  return setNotesRoot(r.filePaths[0]);
}
async function setNotesRoot(root) {
  const store = createNotesStore({
    root, getLocale: () => locale, trash: (p) => shell.trashItem(p), untitled: () => t('notes.untitledNote'),
    eol: process.platform === 'win32' ? 'CRLF' : 'LF', seed: true
  });
  const idx = await store.ensure();
  updateSettings({ notesRoot: root, sidebarOpen: true });
  void refreshTemplates();
  broadcast('notes:changed', { moved: [], deleted: [] });
  return { root, inbox: idx.inbox };
}
ipcMain.handle('notes:chooseRoot', (e) => chooseNotesRoot(BrowserWindow.fromWebContents(e.sender)));

ipcMain.handle('notes:confirmDeleteNote', async (e, title) => {
  const r = await dialog.showMessageBox(BrowserWindow.fromWebContents(e.sender), {
    type: 'question', title: t('notes.deleteNoteTitle'), message: t('notes.deleteNoteMessage', { title }),
    buttons: [t('notes.deleteButton'), t('dialog.cancel')], defaultId: 0, cancelId: 1, noLink: true,
    checkboxLabel: t('notes.dontAsk'), checkboxChecked: false
  });
  if (r.response !== 0) return false;
  if (r.checkboxChecked) updateSettings({ confirmDelete: false });
  return true;
});

// 'delete' | 'archive' | 'cancel'
ipcMain.handle('notes:confirmDeleteProject', async (e, { project, n, archived }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (n === 0) {
    const r = await dialog.showMessageBox(win, {
      type: 'question', title: t('notes.deleteProjectTitle', { project }), message: t('notes.deleteProjectTitle', { project }),
      detail: t('notes.deleteEmptyProject'), buttons: [t('notes.deleteButton'), t('dialog.cancel')], defaultId: 1, cancelId: 1, noLink: true
    });
    return r.response === 0 ? 'delete' : 'cancel';
  }
  const buttons = archived
    ? [t('notes.deleteProjectButton'), t('dialog.cancel')]
    : [t('notes.deleteProjectButton'), t('notes.archiveInstead'), t('dialog.cancel')];
  const r = await dialog.showMessageBox(win, {
    type: 'warning', title: t('notes.deleteProjectTitle', { project }), message: t('notes.deleteProjectMessage', { project, n }),
    detail: archived ? '' : t('notes.deleteProjectDetail'), buttons, defaultId: buttons.length - 1, cancelId: buttons.length - 1, noLink: true
  });
  if (r.response === 0) return 'delete';
  if (!archived && r.response === 1) return 'archive';
  return 'cancel';
});

// ---------- Menu ----------
// Built from the command registry, so a shortcut changed in Settings shows up here too.
// Accelerators are labels only (registerAccelerator: false): the renderer dispatches every key.
function buildMenu() {
  const s = settings.get();
  const bindings = commands.effectiveBindings(s.keybindings);
  const accel = (id) => commands.toAccelerator((bindings[id] || [])[0]);
  const label = (id) => t(commands.BY_ID[id].label);
  const cmd = (id, extra = {}) => ({ label: label(id), accelerator: accel(id), registerAccelerator: false, click: () => send(id), ...extra });
  /** @returns {Electron.MenuItemConstructorOptions} */
  const check = (id, key = id) => ({
    label: label(id), type: 'checkbox', checked: !!s[key], accelerator: accel(id), registerAccelerator: false,
    click: (mi) => updateSettings({ [key]: mi.checked })
  });
  /** @returns {Electron.MenuItemConstructorOptions} */
  const viewRadio = (id, value) => ({
    label: label(id), type: 'radio', checked: s.viewMode === value, accelerator: accel(id), registerAccelerator: false,
    click: () => updateSettings({ viewMode: value })
  });
  /** @returns {Electron.MenuItemConstructorOptions} */
  const radio = (text, key, value) => ({ label: text, type: 'radio', checked: s[key] === value, click: () => updateSettings({ [key]: value }) });
  const recent = (s.recentFiles || []).map((f) => ({ label: f, click: () => send('openPaths', [f]) }));
  const exitAccel = accel('exit') || (process.platform === 'win32' ? 'Alt+F4' : undefined);
  // Without a notes folder there is no templates folder: the built-in Standup stands in.
  /** @returns {Electron.MenuItemConstructorOptions[]} */
  const templateItems = (action) => {
    const names = templateNames || (s.notesRoot ? [] : [templates.BUILTIN]);
    return names.length ? names.map((n) => ({ label: n, click: () => send(action, n) })) : [{ label: t('menu.noTemplates'), enabled: false }];
  };

  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    {
      label: t('menu.file'),
      submenu: [
        cmd('new', s.notesRoot ? { label: t('menu.newNote') } : {}),
        cmd('newNoteInProject', { enabled: !!s.notesRoot }),
        cmd('newProject', { enabled: !!s.notesRoot }),
        cmd('newWindow', { click: () => createWindow() }),
        cmd('open'),
        { label: t('menu.newFromTemplate'), submenu: templateItems('newFromTemplate') },
        { label: t('menu.applyTemplate'), submenu: templateItems('applyTemplate') },
        {
          label: t('menu.openRecent'),
          submenu: recent.length
            ? [...recent, { type: 'separator' }, { label: t('menu.clearRecent'), click: () => updateSettings({ recentFiles: [] }) }]
            : [{ label: '—', enabled: false }]
        },
        { type: 'separator' },
        cmd('save'),
        cmd('saveAs'),
        cmd('saveAll'),
        { type: 'separator' },
        cmd('print'),
        { type: 'separator' },
        cmd('settings'), cmd('openSettingsJson'),
        { type: 'separator' },
        { label: label('exit'), accelerator: exitAccel, registerAccelerator: false, click: () => quitAll() }
      ]
    },
    {
      label: t('menu.edit'),
      submenu: [
        cmd('undo'),
        cmd('redo'),
        { type: 'separator' },
        { label: label('cut'), role: 'cut', accelerator: accel('cut'), registerAccelerator: false },
        { label: label('copy'), role: 'copy', accelerator: accel('copy'), registerAccelerator: false },
        { label: label('paste'), role: 'paste', accelerator: accel('paste'), registerAccelerator: false },
        { label: t('menu.delete'), click: () => send('delete') },
        { type: 'separator' },
        cmd('find'),
        cmd('findNext'),
        cmd('findPrevious'),
        cmd('replace'),
        cmd('goTo'),
        { type: 'separator' },
        cmd('selectAll'),
        {
          label: t('menu.line'),
          submenu: [
            cmd('moveLineUp'), cmd('moveLineDown'), cmd('copyLineUp'), cmd('copyLineDown'),
            { type: 'separator' },
            cmd('selectLine'), cmd('deleteLine'), cmd('insertLineBelow'), cmd('insertLineAbove'),
            { type: 'separator' },
            cmd('selectNextOccurrence'), cmd('selectAllOccurrences'), cmd('addCursorAbove'), cmd('addCursorBelow'),
            { type: 'separator' },
            cmd('indentLine'), cmd('outdentLine')
          ]
        },
        cmd('timeDate'),
        { type: 'separator' },
        check('spellcheck'),
        cmd('font')
      ]
    },
    {
      label: t('menu.format'),
      submenu: [
        cmd('bold'), cmd('italic'), cmd('strikethrough'),
        { type: 'separator' },
        cmd('heading1'), cmd('heading2'), cmd('heading3'), cmd('heading4'), cmd('heading5'), cmd('heading6'),
        { type: 'separator' },
        cmd('bulletList'), cmd('numberedList'), cmd('checkList'), cmd('quote'),
        { type: 'separator' },
        cmd('code'), cmd('codeBlock'), cmd('link'), cmd('horizontalRule'), cmd('table')
      ]
    },
    {
      label: t('menu.view'),
      submenu: [
        cmd('commandPalette'),
        { type: 'separator' },
        { label: t('menu.zoom'), submenu: [cmd('zoomIn'), cmd('zoomOut'), cmd('zoomReset')] },
        { type: 'separator' },
        viewRadio('viewEditor', 'editor'), viewRadio('viewSplit', 'split'), viewRadio('viewPreview', 'preview'),
        { type: 'separator' },
        check('toggleSidebar', 'sidebarOpen'), cmd('searchNotes', { enabled: !!s.notesRoot }),
        { type: 'separator' },
        check('wordWrap'), check('lineNumbers'), check('hideMarkers'), check('formattingBar'), check('statusBar'), check('narrowColumn'),
        { type: 'separator' },
        check('writingMode'),
        cmd('fullscreen', { click: () => toggleFullscreen(focusedWindow()) }),
        check('autosave'),
        { type: 'separator' },
        {
          label: t('menu.theme'),
          // Two choices, one pick each: the theme, then the mode that picks its light or dark version.
          submenu: [
            ...themeStore.list(locale).map((th) => ({ ...radio(th.error ? t('menu.themeBroken', { name: th.name }) : th.name, 'theme', th.id), enabled: !th.error })),
            { type: 'separator' },
            radio(t('menu.themeSystem'), 'mode', 'system'), radio(t('menu.themeLight'), 'mode', 'light'), radio(t('menu.themeDark'), 'mode', 'dark'),
            { type: 'separator' },
            check('effects'),
            {
              label: t('menu.cursorEffect'),
              submenu: [
                { ...radio(t('fx.theme'), 'cursorEffect', 'theme'), checked: !s.cursorEffect || s.cursorEffect === 'theme' },
                radio(t('fx.none'), 'cursorEffect', 'none'),
                { type: 'separator' },
                ...CURSOR_EFFECT_IDS.map((id) => radio(t(`fx.${id}`), 'cursorEffect', id))
              ]
            },
            cmd('pickTheme'), cmd('newThemeFromCurrent'), cmd('importVsCodeTheme'),
            cmd('openThemesFolder', { click: () => openThemesFolder() })
          ]
        },
        {
          label: t('menu.language'),
          submenu: [radio(t('menu.langAuto'), 'language', 'auto'), radio(t('menu.langEn'), 'language', 'en'), radio(t('menu.langSv'), 'language', 'sv')]
        }
      ]
    },
    {
      label: t('menu.help'),
      submenu: [
        cmd('shortcuts'),
        cmd('checkForUpdates', { click: () => void manualUpdateCheck(focusedWindow()) }),
        { type: 'separator' },
        cmd('about', { click: () => showAbout(focusedWindow()) }),
        ...(isDev ? [/** @type {Electron.MenuItemConstructorOptions} */ ({ label: t('menu.toggleDevTools'), role: 'toggleDevTools', accelerator: 'F12' })] : [])
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- App lifecycle ----------
const gotLock = app.requestSingleInstanceLock();
// JumpList: "Nytt fönster" i taskbar-högerklicket (Windows). Nytt fönster — på
// aktuellt skrivbord via flaggan i second-instance/startflödet.
let jumplistTask = null;
function setJumplist() {
  if (process.platform !== 'win32' || jumplistTask) return;
  jumplistTask = [
    {
      type: 'tasks',
      items: [{
        type: 'task',
        program: process.execPath,
        args: '--new-window',
        iconPath: process.execPath,
        iconIndex: 0,
        title: t('menu.newWindow'),
        description: t('menu.newWindow')
      }]
    },
    { type: 'recent' }
  ];
  try { app.setJumpList(jumplistTask); } catch { /* jumplist ej tillgänglig */ }
}
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv, cwd) => {
    if (argv.some((a) => a === '--new-window')) { createWindow(); return; }
    const list = parseFileArgs(argv, cwd);
    const win = focusedWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (list.length) win.webContents.send('files:open', list);
    } else createWindow(list);
  });

  app.whenReady().then(() => {
    settings = new Settings(path.join(app.getPath('userData'), 'settings.json'));
    refreshLocale();
    themeStore = createThemeStore({ builtinDir: path.join(__dirname, '../../themes'), userDir: path.join(app.getPath('userData'), 'themes') });
    protocol.handle(SCHEME, (req) => themeStore.serve(req));
    loadActiveTheme();
    nativeTheme.themeSource = MODES.includes(settings.get('mode')) ? settings.get('mode') : 'system';
    nativeTheme.on('updated', () => broadcastTheme());
    themeStore.watch(() => { loadActiveTheme(); buildMenu(); broadcastTheme(); });
    updater = createUpdater({ broadcast, getSettings: () => settings.get() });
    setupSpellcheck();
    buildMenu();
    void refreshTemplates();
    setJumplist();
    if (process.argv.some((a) => a === '--new-window')) createWindow();
    else createWindow(parseFileArgs(process.argv, process.cwd()));
    updater.start();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
