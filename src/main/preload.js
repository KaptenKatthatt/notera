'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

function on(channel, cb) {
  const handler = (_e, ...args) => cb(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('notera', {
  platform: process.platform,
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  openDialog: () => ipcRenderer.invoke('file:openDialog'),
  readFile: (p) => ipcRenderer.invoke('file:read', p),
  writeFile: (args) => ipcRenderer.invoke('file:write', args),
  saveAsDialog: (args) => ipcRenderer.invoke('file:saveAsDialog', args),
  statFile: (p) => ipcRenderer.invoke('file:stat', p),
  confirmUnsaved: (name) => ipcRenderer.invoke('dialog:confirmUnsaved', name),
  confirmReload: (name) => ipcRenderer.invoke('dialog:confirmReload', name),
  showError: (args) => ipcRenderer.invoke('dialog:error', args),
  confirm: (message) => ipcRenderer.invoke('dialog:confirm', message),
  setTitle: (t) => ipcRenderer.send('window:setTitle', t),
  clipboardText: () => ipcRenderer.invoke('clipboard:readText'),
  toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
  quit: () => ipcRenderer.invoke('app:quit'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  about: () => ipcRenderer.invoke('app:about'),
  nativeEdit: (op) => ipcRenderer.invoke('edit:native', op),
  checkForUpdates: (manual) => ipcRenderer.invoke('update:check', { manual }),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  dismissUpdate: () => ipcRenderer.invoke('update:dismiss'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (cb) => on('update:status', cb),
  onPrepareQuit: (cb) => on('window:prepareQuit', cb),
  prepareQuitResult: (id, ok) => ipcRenderer.send('window:prepareQuitResult', id, ok),
  listDrafts: () => ipcRenderer.invoke('draft:list'),
  writeDraft: (args) => ipcRenderer.invoke('draft:write', args),
  deleteDraft: (id) => ipcRenderer.invoke('draft:delete', id),
  closeConfirmed: () => ipcRenderer.send('window:closeConfirmed'),
  newWindow: () => ipcRenderer.send('window:new'),
  detachTab: (args) => ipcRenderer.send('tab:detach', args),
  print: () => ipcRenderer.invoke('window:print'),
  openExternal: (url) => ipcRenderer.send('shell:openExternal', url),
  setMenuState: (state) => ipcRenderer.send('menu:state', state),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onMenu: (cb) => on('menu:action', cb),
  onOpenFiles: (cb) => on('files:open', cb),
  onRequestClose: (cb) => on('window:requestClose', cb),
  onSettingsChanged: (cb) => on('settings:changed', cb),
  onThemeChanged: (cb) => on('theme:changed', cb),
  notes: {
    call: (method, ...args) => ipcRenderer.invoke('notes:call', method, ...args),
    chooseRoot: () => ipcRenderer.invoke('notes:chooseRoot'),
    confirmDeleteNote: (title) => ipcRenderer.invoke('notes:confirmDeleteNote', title),
    confirmDeleteProject: (args) => ipcRenderer.invoke('notes:confirmDeleteProject', args),
    onChanged: (cb) => on('notes:changed', cb)
  }
});
