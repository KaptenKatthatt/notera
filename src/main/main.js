'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, nativeTheme, clipboard } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { Settings } = require('./settings');
const files = require('./files');
const { resolveLocale, makeT } = require('../shared/strings');
const commands = require('../shared/commands');
const { createUpdater } = require('./updater');

const isDev = !app.isPackaged;
// Tests point this at a scratch directory so they never touch real settings.
if (process.env.NOTERA_USER_DATA) app.setPath('userData', process.env.NOTERA_USER_DATA);
let settings;
let t;
let locale;
const pendingFiles = new Map(); // webContents.id -> string[]
let draftsClaimed = false; // only the first window restores drafts, or a second window would duplicate them
let updater;

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

function focusedWindow() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

function send(action, payload) {
  const win = focusedWindow();
  if (win) win.webContents.send('menu:action', action, payload);
}

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload);
}

function updateSettings(patch) {
  const next = settings.set(patch);
  if ('theme' in patch) { nativeTheme.themeSource = next.theme; broadcast('theme:changed', nativeTheme.shouldUseDarkColors); }
  if ('language' in patch) refreshLocale();
  if ('writingMode' in patch) for (const w of BrowserWindow.getAllWindows()) applyMenuBar(w, next.writingMode);
  if ('checkUpdates' in patch && next.checkUpdates && updater) void updater.check();
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

function createWindow(filesToOpen = []) {
  const bounds = settings.get('windowBounds') || {};
  const win = new BrowserWindow({
    width: bounds.width || 1000,
    height: bounds.height || 700,
    x: bounds.x,
    y: bounds.y,
    minWidth: 480,
    minHeight: 320,
    title: t('appName'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1f1f1f' : '#ffffff',
    autoHideMenuBar: false,
    icon: path.join(__dirname, '../../build/icon.png'),
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

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url); }
  });

  win.on('close', (e) => {
    if (win._closeConfirmed) return;
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
  const restoreDrafts = !draftsClaimed;
  draftsClaimed = true;
  return {
    settings: settings.get(), locale, version: app.getVersion(), filesToOpen: list, platform: process.platform, isDev,
    dark: nativeTheme.shouldUseDarkColors, restoreDrafts, update: updater ? { ...updater.getState(), reason: updater.reason() } : null
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
  const box = (message, type = 'info') => dialog.showMessageBox(win || focusedWindow(), { type, title: t('appName'), message, buttons: [t('dialog.ok')] });
  if (r.status === 'latest') await box(t('update.latest', { version: app.getVersion() }));
  else if (r.status === 'unsupported') await box(t('update.unsupported', { reason: t(r.reason === 'portable' ? 'update.reasonPortable' : 'update.reasonDev') }));
  else if (r.status === 'error') await box(t('update.error') + (r.message ? '\n\n' + r.message : ''), 'warning');
  return r;
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
ipcMain.handle('update:download', () => updater.download());
ipcMain.handle('update:dismiss', () => updater.dismiss());
ipcMain.handle('update:install', async () => {
  if (updater.getState().state !== 'downloaded') return false;
  const ok = await prepareAllForQuit();
  if (!ok) return false;
  for (const w of BrowserWindow.getAllWindows()) w._closeConfirmed = true;
  return updater.install();
});
ipcMain.handle('settings:get', () => settings.get());
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
    await fs.writeFile(p, files.writeBuffer(text, encoding, eol));
    const st = await fs.stat(p);
    settings.addRecent(p);
    buildMenu();
    return { ok: true, path: p, name: path.basename(p), kind: files.kindForPath(p), mtimeMs: st.mtimeMs };
  } catch (err) {
    return { ok: false, path: p, name: path.basename(p), error: err.message };
  }
});

// Save As opens in the directory of the current file; a new file opens in the
// last directory used, falling back to Documents.
ipcMain.handle('file:saveAsDialog', async (e, { currentPath, suggestedName, kind }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const ext = kind === 'txt' ? '.txt' : '.md';
  const defaultPath = currentPath
    ? currentPath
    : path.join(settings.get('lastDir') || app.getPath('documents'), (suggestedName || t('untitled')) + ext);
  const r = await dialog.showSaveDialog(win, {
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
  await fs.writeFile(path.join(draftsDir(), id + '.json'), JSON.stringify({ text, kind, savedAt: Date.now() }), 'utf8');
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
  if (w) { w._closeConfirmed = true; w.close(); }
});
ipcMain.on('window:new', () => createWindow());
ipcMain.on('shell:openExternal', (_e, url) => { if (/^https?:|^mailto:/i.test(url)) shell.openExternal(url); });

// ---------- Menu ----------
// Built from the command registry, so a shortcut changed in Settings shows up here too.
// Accelerators are labels only (registerAccelerator: false): the renderer dispatches every key.
function buildMenu() {
  const s = settings.get();
  const bindings = commands.effectiveBindings(s.keybindings);
  const accel = (id) => commands.toAccelerator((bindings[id] || [])[0]);
  const label = (id) => t(commands.BY_ID[id].label);
  const cmd = (id, extra = {}) => ({ label: label(id), accelerator: accel(id), registerAccelerator: false, click: () => send(id), ...extra });
  const check = (id, key = id) => ({
    label: label(id), type: 'checkbox', checked: !!s[key], accelerator: accel(id), registerAccelerator: false,
    click: (mi) => updateSettings({ [key]: mi.checked })
  });
  const viewRadio = (id, value) => ({
    label: label(id), type: 'radio', checked: s.viewMode === value, accelerator: accel(id), registerAccelerator: false,
    click: () => updateSettings({ viewMode: value })
  });
  const radio = (text, key, value) => ({ label: text, type: 'radio', checked: s[key] === value, click: () => updateSettings({ [key]: value }) });
  const recent = (s.recentFiles || []).map((f) => ({ label: f, click: () => send('openPaths', [f]) }));
  const exitAccel = accel('exit') || (process.platform === 'win32' ? 'Alt+F4' : undefined);

  const template = [
    {
      label: t('menu.file'),
      submenu: [
        cmd('new'),
        cmd('newWindow', { click: () => createWindow() }),
        cmd('open'),
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
        cmd('closeTab'),
        cmd('closeWindow', { click: () => { const w = focusedWindow(); if (w) w.close(); } }),
        cmd('nextTab'),
        cmd('prevTab'),
        { label: t('menu.goToTab'), submenu: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => cmd(`goToTab${n}`)) },
        { type: 'separator' },
        cmd('print'),
        { type: 'separator' },
        cmd('settings'),
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
        cmd('font')
      ]
    },
    {
      label: t('menu.format'),
      submenu: [
        cmd('bold'), cmd('italic'), cmd('strikethrough'),
        { type: 'separator' },
        cmd('heading1'), cmd('heading2'), cmd('heading3'),
        { type: 'separator' },
        cmd('bulletList'), cmd('numberedList'), cmd('checkList'), cmd('quote'),
        { type: 'separator' },
        cmd('code'), cmd('codeBlock'), cmd('link'), cmd('horizontalRule'), cmd('table')
      ]
    },
    {
      label: t('menu.view'),
      submenu: [
        { label: t('menu.zoom'), submenu: [cmd('zoomIn'), cmd('zoomOut'), cmd('zoomReset')] },
        { type: 'separator' },
        viewRadio('viewEditor', 'editor'), viewRadio('viewSplit', 'split'), viewRadio('viewPreview', 'preview'),
        { type: 'separator' },
        check('wordWrap'), check('lineNumbers'), check('hideMarkers'), check('formattingBar'), check('statusBar'),
        { type: 'separator' },
        check('writingMode'),
        cmd('fullscreen', { click: () => toggleFullscreen(focusedWindow()) }),
        check('autosave'),
        { type: 'separator' },
        {
          label: t('menu.theme'),
          submenu: [radio(t('menu.themeSystem'), 'theme', 'system'), radio(t('menu.themeLight'), 'theme', 'light'), radio(t('menu.themeDark'), 'theme', 'dark')]
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
        ...(isDev ? [{ label: t('menu.toggleDevTools'), role: 'toggleDevTools', accelerator: 'F12' }] : [])
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- App lifecycle ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv, cwd) => {
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
    nativeTheme.themeSource = settings.get('theme') || 'system';
    nativeTheme.on('updated', () => broadcast('theme:changed', nativeTheme.shouldUseDarkColors));
    updater = createUpdater({ broadcast, getSettings: () => settings.get() });
    buildMenu();
    createWindow(parseFileArgs(process.argv, process.cwd()));
    updater.start();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
