'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, nativeTheme, clipboard } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { Settings } = require('./settings');
const files = require('./files');
const { resolveLocale, makeT } = require('../shared/strings');

const isDev = !app.isPackaged;
// Tests point this at a scratch directory so they never touch real settings.
if (process.env.NOTERA_USER_DATA) app.setPath('userData', process.env.NOTERA_USER_DATA);
let settings;
let t;
let locale;
const pendingFiles = new Map(); // webContents.id -> string[]

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
  return { settings: settings.get(), locale, version: app.getVersion(), filesToOpen: list, platform: process.platform, isDev, dark: nativeTheme.shouldUseDarkColors };
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
ipcMain.handle('window:toggleFullscreen', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) w.setFullScreen(!w.isFullScreen());
  return w ? w.isFullScreen() : false;
});

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
function buildMenu() {
  const s = settings.get();
  const item = (label, action, accelerator, extra = {}) => ({ label, accelerator, click: () => send(action), ...extra });
  // Shown with a shortcut but not registered globally: CodeMirror/Chromium handle the key itself,
  // so the shortcut keeps working inside dialogs and search fields too.
  const local = (label, action, accelerator) => item(label, action, accelerator, { registerAccelerator: false });
  const check = (label, key, accelerator) => ({ label, type: 'checkbox', checked: !!s[key], accelerator, click: (mi) => updateSettings({ [key]: mi.checked }) });
  const radio = (label, key, value, accelerator) => ({ label, type: 'radio', checked: s[key] === value, accelerator, click: () => updateSettings({ [key]: value }) });
  const recent = (s.recentFiles || []).map((f) => ({ label: f, click: () => send('openPaths', [f]) }));

  const template = [
    {
      label: t('menu.file'),
      submenu: [
        item(t('menu.new'), 'new', 'CmdOrCtrl+N'),
        { label: t('menu.newWindow'), accelerator: 'CmdOrCtrl+Shift+N', click: () => createWindow() },
        item(t('menu.open'), 'open', 'CmdOrCtrl+O'),
        {
          label: t('menu.openRecent'),
          submenu: recent.length
            ? [...recent, { type: 'separator' }, { label: t('menu.clearRecent'), click: () => updateSettings({ recentFiles: [] }) }]
            : [{ label: '—', enabled: false }]
        },
        { type: 'separator' },
        item(t('menu.save'), 'save', 'CmdOrCtrl+S'),
        item(t('menu.saveAs'), 'saveAs', 'CmdOrCtrl+Shift+S'),
        item(t('menu.saveAll'), 'saveAll', 'CmdOrCtrl+Alt+S'),
        { type: 'separator' },
        item(t('menu.closeTab'), 'closeTab', 'CmdOrCtrl+W'),
        item(t('menu.print'), 'print', 'CmdOrCtrl+P'),
        { type: 'separator' },
        { label: t('menu.exit'), accelerator: process.platform === 'win32' ? 'Alt+F4' : 'CmdOrCtrl+Q', click: () => { for (const w of BrowserWindow.getAllWindows()) w.close(); } }
      ]
    },
    {
      label: t('menu.edit'),
      submenu: [
        local(t('menu.undo'), 'undo', 'CmdOrCtrl+Z'),
        local(t('menu.redo'), 'redo', 'CmdOrCtrl+Y'),
        { type: 'separator' },
        { label: t('menu.cut'), role: 'cut', accelerator: 'CmdOrCtrl+X', registerAccelerator: false },
        { label: t('menu.copy'), role: 'copy', accelerator: 'CmdOrCtrl+C', registerAccelerator: false },
        { label: t('menu.paste'), role: 'paste', accelerator: 'CmdOrCtrl+V', registerAccelerator: false },
        local(t('menu.delete'), 'delete'),
        { type: 'separator' },
        item(t('menu.find'), 'find', 'CmdOrCtrl+F'),
        item(t('menu.findNext'), 'findNext', 'F3'),
        item(t('menu.findPrevious'), 'findPrevious', 'Shift+F3'),
        item(t('menu.replace'), 'replace', 'CmdOrCtrl+H'),
        item(t('menu.goTo'), 'goTo', 'CmdOrCtrl+G'),
        { type: 'separator' },
        local(t('menu.selectAll'), 'selectAll', 'CmdOrCtrl+A'),
        item(t('menu.timeDate'), 'timeDate', 'F5'),
        { type: 'separator' },
        item(t('menu.font'), 'font')
      ]
    },
    {
      label: t('menu.format'),
      submenu: [
        local(t('menu.bold'), 'bold', 'CmdOrCtrl+B'),
        local(t('menu.italic'), 'italic', 'CmdOrCtrl+I'),
        local(t('menu.strikethrough'), 'strikethrough', 'CmdOrCtrl+Shift+X'),
        { type: 'separator' },
        local(t('menu.heading1'), 'heading1', 'CmdOrCtrl+1'),
        local(t('menu.heading2'), 'heading2', 'CmdOrCtrl+2'),
        local(t('menu.heading3'), 'heading3', 'CmdOrCtrl+3'),
        { type: 'separator' },
        local(t('menu.bulletList'), 'bulletList', 'CmdOrCtrl+Shift+8'),
        local(t('menu.numberedList'), 'numberedList', 'CmdOrCtrl+Shift+7'),
        local(t('menu.checkList'), 'checkList', 'CmdOrCtrl+Shift+9'),
        local(t('menu.quote'), 'quote', 'CmdOrCtrl+Shift+.'),
        { type: 'separator' },
        local(t('menu.code'), 'code', 'CmdOrCtrl+E'),
        local(t('menu.codeBlock'), 'codeBlock', 'CmdOrCtrl+Shift+E'),
        local(t('menu.link'), 'link', 'CmdOrCtrl+K'),
        item(t('menu.horizontalRule'), 'horizontalRule'),
        item(t('menu.table'), 'table')
      ]
    },
    {
      label: t('menu.view'),
      submenu: [
        {
          label: t('menu.zoom'),
          submenu: [
            item(t('menu.zoomIn'), 'zoomIn', 'CmdOrCtrl+='),
            item(t('menu.zoomOut'), 'zoomOut', 'CmdOrCtrl+-'),
            item(t('menu.zoomReset'), 'zoomReset', 'CmdOrCtrl+0')
          ]
        },
        { type: 'separator' },
        radio(t('menu.editorOnly'), 'viewMode', 'editor', 'CmdOrCtrl+Shift+1'),
        radio(t('menu.split'), 'viewMode', 'split', 'CmdOrCtrl+Shift+2'),
        radio(t('menu.previewOnly'), 'viewMode', 'preview', 'CmdOrCtrl+Shift+3'),
        { type: 'separator' },
        check(t('menu.wordWrap'), 'wordWrap', 'Alt+Z'),
        check(t('menu.lineNumbers'), 'lineNumbers'),
        check(t('menu.hideMarkers'), 'hideMarkers'),
        check(t('menu.formattingBar'), 'formattingBar'),
        check(t('menu.statusBar'), 'statusBar'),
        { type: 'separator' },
        check(t('menu.writingMode'), 'writingMode', 'CmdOrCtrl+Shift+W'),
        { label: t('menu.fullscreen'), accelerator: 'F11', click: () => { const w = focusedWindow(); if (w) w.setFullScreen(!w.isFullScreen()); } },
        check(t('menu.autosave'), 'autosave'),
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
        item(t('menu.shortcuts'), 'shortcuts', 'CmdOrCtrl+Shift+/'),
        {
          label: t('menu.about'),
          click: () => dialog.showMessageBox(focusedWindow(), { type: 'info', title: t('menu.about'), message: t('dialog.aboutMessage', { version: app.getVersion() }) })
        },
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
    buildMenu();
    createWindow(parseFileArgs(process.argv, process.cwd()));
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
