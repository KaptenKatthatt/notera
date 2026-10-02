'use strict';
// Checks GitHub Releases for a newer Notera, and downloads and installs it when the user says so.
// One yes covers both: a download started with { install: true } ends in the 'installing' state,
// and main.js then saves or keeps everyone's work and installs.
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
/** A check gives up after this long rather than leave the user waiting on a dead connection. */
const CHECK_TIMEOUT_MS = 30000;
/** Network errors are often a blip (a connection GitHub or a proxy closed): try again, twice. */
const RETRY_DELAYS_MS = [1500, 4000];
const NETWORK_ERROR = /net::ERR_|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|timed out/i;

/** Rejects with a timeout error if `promise` takes longer than `ms`. */
function withTimeout(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_r, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${ms / 1000} s`)), ms); })])
    .finally(() => clearTimeout(timer));
}

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
  // Set by a download the user asked to install. Lives here, not in a window, so it holds no matter
  // which window or menu said yes, and survives a failed download until the retry finishes.
  let installWhenDownloaded = false;

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
    autoUpdater.on('update-downloaded', (info) => set({ state: installWhenDownloaded ? 'installing' : 'downloaded', version: info.version, percent: 100 }));
    autoUpdater.on('error', (err) => {
      log('error')(err);
      if (state.state === 'downloading') set({ state: 'error', error: 'download' });
    });
    return autoUpdater;
  }

  /** @returns {Promise<{ status: 'available'|'latest'|'unsupported'|'error'|'busy', version?, reason?, message?, network? }>} */
  /** @param {{ manual?: boolean }} [opts] */
  async function check({ manual } = {}) {
    if (reason) return { status: 'unsupported', reason };
    if (['downloading', 'downloaded', 'installing'].includes(state.state)) {
      if (manual) broadcast('update:status', state);
      return { status: 'busy', version: state.version };
    }
    if (checking) return checking;
    const u = load();
    // A manual check shows "Checking for updates…" until it has an answer; an automatic one is silent.
    set({ state: 'checking', manual: !!manual });
    checking = (async () => {
      try {
        let r;
        for (let attempt = 0; ; attempt++) {
          try { r = await withTimeout(u.checkForUpdates(), CHECK_TIMEOUT_MS); break; }
          catch (err) {
            if (attempt >= RETRY_DELAYS_MS.length || !NETWORK_ERROR.test(String(err && err.message))) throw err;
            log('warn')(`check failed, retrying (${attempt + 1})`, err);
            await new Promise((resolve) => setTimeout(resolve, testFeed && process.env.NOTERA_UPDATE_FAST_RETRY ? 50 : RETRY_DELAYS_MS[attempt]));
          }
        }
        const available = r && r.isUpdateAvailable !== false && r.updateInfo && r.updateInfo.version !== app.getVersion();
        if (available) {
          // The update-available event already set the state; make sure a manual check re-shows it.
          set({ state: 'available', version: r.updateInfo.version });
          return { status: 'available', version: r.updateInfo.version };
        }
        set({ state: 'idle' });
        return { status: 'latest', version: app.getVersion() };
      } catch (err) {
        log('error')('check failed', err);
        set({ state: 'idle' });
        const message = String(err && err.message || '');
        return { status: 'error', network: NETWORK_ERROR.test(message), message };
      } finally {
        checking = null;
      }
    })();
    return checking;
  }

  /**
   * @param {{ install?: boolean }} [opts] install: go on to install once the download is done
   * @returns {Promise<{ ok: boolean, install?: boolean, message?: string }>}
   */
  async function download({ install = false } = {}) {
    if (reason) return { ok: false };
    const u = load();
    if (!['available', 'error'].includes(state.state)) return { ok: false };
    if (install) installWhenDownloaded = true;
    set({ state: 'downloading', percent: 0, error: null });
    try {
      await u.downloadUpdate();
      const go = installWhenDownloaded;
      installWhenDownloaded = false;
      const done = go ? 'installing' : 'downloaded';
      if (state.state !== done) set({ state: done, percent: 100 });
      return { ok: true, install: go };
    } catch (err) {
      log('error')('download failed', err);
      set({ state: 'error', error: 'download' });
      return { ok: false, message: err && err.message };
    }
  }

  /** The install was called off (a window kept its unsaved work): offer "Restart and install" instead. */
  function installCancelled() {
    if (state.state === 'installing') set({ state: 'downloaded' });
  }

  function install() {
    if (!autoUpdater || !['downloaded', 'installing'].includes(state.state)) return false;
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

  return { check, download, install, installCancelled, dismiss, start, getState: () => state, reason: () => reason };
}

module.exports = { createUpdater };
