'use strict';
// Checks GitHub Releases for a newer Notera, and downloads and installs it when the user says so.
// Only the installed (NSIS) Windows build updates itself: the portable exe and a source checkout
// report why they can't.
//
// NOTERA_UPDATE_FEED points the updater at a generic feed (a local HTTP server in tests) and
// lets it run unpackaged.

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_MS = 8000;

function createUpdater({ broadcast, getSettings }) {
  const testFeed = process.env.NOTERA_UPDATE_FEED || null;
  let reason = null;
  if (!testFeed) {
    if (!app.isPackaged) reason = 'dev';
    else if (process.env.PORTABLE_EXECUTABLE_DIR) reason = 'portable';
    else if (process.platform !== 'win32') reason = 'dev';
  }

  let autoUpdater = null;
  let state = { state: 'idle', version: null, percent: 0 };
  let timer = null;
  let checking = null;

  const logFile = path.join(app.getPath('userData'), 'updater.log');
  const log = (level) => (...args) => {
    const line = `${new Date().toISOString()} ${level} ${args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`;
    try { fs.appendFileSync(logFile, line); } catch { /* ignore */ }
  };

  function set(next) {
    state = { ...state, ...next };
    broadcast('update:status', state);
  }

  function load() {
    if (autoUpdater || reason) return autoUpdater;
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.logger = { info: log('info'), warn: log('warn'), error: log('error'), debug: () => {} };
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;
    autoUpdater.disableWebInstaller = true; // we ship a full installer, never a web installer
    if (testFeed) {
      // Unpackaged runs have no app-update.yml, so write the one electron-builder would have made.
      const cfg = path.join(app.getPath('userData'), 'test-app-update.yml');
      fs.writeFileSync(cfg, `provider: generic\nurl: ${testFeed}\nupdaterCacheDirName: notera-updater-test\n`);
      autoUpdater.forceDevUpdateConfig = true;
      autoUpdater.updateConfigPath = cfg;
    }
    autoUpdater.on('update-available', (info) => set({ state: 'available', version: info.version, percent: 0 }));
    autoUpdater.on('update-not-available', (info) => { if (state.state === 'checking') set({ state: 'idle', latest: info.version }); });
    autoUpdater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.floor(p.percent || 0) }));
    autoUpdater.on('update-downloaded', (info) => set({ state: 'downloaded', version: info.version, percent: 100 }));
    autoUpdater.on('error', (err) => {
      log('error')(err);
      if (state.state === 'downloading') set({ state: 'error', error: 'download' });
    });
    return autoUpdater;
  }

  /** @returns {Promise<{ status: 'available'|'latest'|'unsupported'|'error'|'busy', version?, reason?, message? }>} */
  async function check({ manual } = {}) {
    if (reason) return { status: 'unsupported', reason };
    if (['downloading', 'downloaded'].includes(state.state)) {
      if (manual) broadcast('update:status', state);
      return { status: 'busy', version: state.version };
    }
    if (checking) return checking;
    const u = load();
    const prev = state.state;
    set({ state: 'checking' });
    checking = (async () => {
      try {
        const r = await u.checkForUpdates();
        const available = r && r.isUpdateAvailable !== false && r.updateInfo && r.updateInfo.version !== app.getVersion();
        if (available) {
          // The update-available event already set the state; make sure a manual check re-shows it.
          set({ state: 'available', version: r.updateInfo.version });
          return { status: 'available', version: r.updateInfo.version };
        }
        set({ state: prev === 'checking' ? 'idle' : 'idle' });
        return { status: 'latest', version: app.getVersion() };
      } catch (err) {
        log('error')('check failed', err);
        set({ state: 'idle' });
        return { status: 'error', message: err && err.message };
      } finally {
        checking = null;
      }
    })();
    return checking;
  }

  async function download() {
    if (reason) return { ok: false };
    const u = load();
    if (!['available', 'error'].includes(state.state)) return { ok: false };
    set({ state: 'downloading', percent: 0, error: null });
    try {
      await u.downloadUpdate();
      return { ok: true };
    } catch (err) {
      log('error')('download failed', err);
      set({ state: 'error', error: 'download' });
      return { ok: false, message: err && err.message };
    }
  }

  function install() {
    if (!autoUpdater || state.state !== 'downloaded') return false;
    // Tests stop here: the real installer step is the Windows NSIS one and cannot run on Linux.
    if (testFeed && process.env.NOTERA_UPDATE_DRYRUN) {
      fs.writeFileSync(process.env.NOTERA_UPDATE_DRYRUN, state.version);
      setImmediate(() => app.quit());
      return true;
    }
    // Silent install into the same folder, then start the new version.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return true;
  }

  function dismiss() {
    if (state.state === 'available') set({ state: 'dismissed' });
  }

  function start() {
    if (reason) return;
    const auto = () => { if (getSettings().checkUpdates !== false) void check(); };
    setTimeout(auto, testFeed ? 500 : FIRST_CHECK_MS);
    timer = setInterval(auto, CHECK_EVERY_MS);
    timer.unref?.();
  }

  return { check, download, install, dismiss, start, getState: () => state, reason: () => reason };
}

module.exports = { createUpdater };
