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
  closeConfirmed: () => ipcRenderer.send('window:closeConfirmed'),
  newWindow: () => ipcRenderer.send('window:new'),
  print: () => ipcRenderer.invoke('window:print'),
  openExternal: (url) => ipcRenderer.send('shell:openExternal', url),
  setMenuState: (state) => ipcRenderer.send('menu:state', state),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onMenu: (cb) => on('menu:action', cb),
  onOpenFiles: (cb) => on('files:open', cb),
  onRequestClose: (cb) => on('window:requestClose', cb),
  onSettingsChanged: (cb) => on('settings:changed', cb),
  onThemeChanged: (cb) => on('theme:changed', cb)
});
