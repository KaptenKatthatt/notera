'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  fontFamily: 'iA Writer Mono S',
  fontSize: 15,
  wordWrap: true,
  statusBar: true,
  lineNumbers: false,
  formattingBar: true,
  theme: 'system',      // 'system' | 'light' | 'dark'
  language: 'auto',     // 'auto' | 'en' | 'sv'
  zoom: 100,
  viewMode: 'editor',   // 'editor' | 'split' | 'preview'
  lastDir: null,
  recentFiles: [],
  windowBounds: null,
  defaultEncoding: 'utf8',
  writingMode: false,
  autosave: true,
  hideMarkers: true,
  keybindings: {},
  checkUpdates: true
};

class Settings {
  constructor(file) {
    this.file = file;
    this.data = { ...DEFAULTS };
    this.load();
  }
  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = { ...DEFAULTS, ...raw };
    } catch { this.data = { ...DEFAULTS }; }
  }
  get(key) { return key ? this.data[key] : { ...this.data }; }
  set(patch) {
    this.data = { ...this.data, ...patch };
    this.save();
    return { ...this.data };
  }
  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) { console.error('settings save failed', e); }
  }
  addRecent(file) {
    const list = [file, ...this.data.recentFiles.filter((f) => f !== file)].slice(0, 10);
    this.set({ recentFiles: list, lastDir: path.dirname(file) });
  }
}

module.exports = { Settings, DEFAULTS };
