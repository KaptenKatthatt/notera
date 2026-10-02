// Update flow against a local feed: auto check -> offer -> one click downloads with progress and
// installs, keeping untitled text as a draft. Plus the manual check's dialog, an install called off
// by a cancelled save, "Later", the no-update case and unsupported builds.
import { _electron as electron } from 'playwright';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'test/e2e/shots');
fs.mkdirSync(shots, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-u-'));
const ok = (label) => console.log('ok  ', label);

// ---- feed ----
const payload = crypto.randomBytes(3 * 1024 * 1024);
const sha512 = crypto.createHash('sha512').update(payload).digest('base64');
let feedVersion = '9.9.9';
let fileHits = 0;
let failNext = false;
// The feed closes this many connections to latest-linux.yml before it answers, like a dropped
// connection to GitHub (net::ERR_CONNECTION_CLOSED); a slow feed answers after feedDelay ms.
let dropFeed = 0;
let feedDelay = 0;
const yml = () => [
  `version: ${feedVersion}`, 'files:', `  - url: Notera-${feedVersion}.AppImage`, `    sha512: ${sha512}`, `    size: ${payload.length}`,
  `path: Notera-${feedVersion}.AppImage`, `sha512: ${sha512}`, "releaseDate: '2026-09-24T12:00:00.000Z'", ''
].join('\n');
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/latest-linux.yml')) {
    if (dropFeed > 0) { dropFeed--; req.socket.destroy(); return; }
    setTimeout(() => { res.writeHead(200, { 'Content-Type': 'text/yaml' }); res.end(yml()); }, feedDelay);
    return;
  }
  if (req.url.startsWith('/Notera-')) {
    fileHits++;
    if (failNext) { failNext = false; res.writeHead(500); res.end(); return; }
    if (req.headers.range) { res.writeHead(416); res.end(); return; } // no differential download: full file
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': payload.length });
    let off = 0;
    const chunk = 128 * 1024;
    const tick = () => { if (off >= payload.length) { res.end(); return; } res.write(payload.subarray(off, off + chunk)); off += chunk; setTimeout(tick, 100); };
    tick();
    return;
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const feed = `http://127.0.0.1:${server.address().port}/`;

const userData = path.join(tmp, 'ud');
const fakeAppImage = path.join(tmp, 'Notera-current.AppImage');
fs.writeFileSync(fakeAppImage, 'old');
const marker = path.join(tmp, 'installed.txt');
// Each launch gets its own updater cache, so every download really goes to the feed and parallel
// test runs never share ~/.cache/notera-updater-test.
let launches = 0;
const launch = (files = []) => electron.launch({
  args: [root, ...files],
  env: {
    ...process.env, NOTERA_USER_DATA: userData, NOTERA_UPDATE_FEED: feed, NOTERA_UPDATE_DRYRUN: marker, APPIMAGE: fakeAppImage,
    XDG_CACHE_HOME: path.join(tmp, `cache-${++launches}`), NOTERA_UPDATE_FAST_RETRY: '1'
  }
});

let app = await launch();
let win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
await win.evaluate(() => window.notera.setSettings({ language: 'sv' }));
const shot = (name) => win.screenshot({ path: path.join(shots, name + '.png') });

// Auto check shortly after start offers the update.
await win.waitForSelector('#update-toast:not([hidden])', { timeout: 15000 });
assert.equal(await win.textContent('#update-text'), 'Notera 9.9.9 finns.');
assert.equal(await win.textContent('#update-go'), 'Ladda ner och installera');
await shot('30-update-available');
ok('automatisk kontroll erbjuder 9.9.9');

// "Senare" hides it; a manual check brings it back.
await win.click('#update-later');
await win.waitForSelector('#update-toast[hidden]', { state: 'attached' });
const r = await win.evaluate(() => window.notera.checkForUpdates(false));
assert.equal(r.status, 'available');
await win.waitForSelector('#update-toast:not([hidden])');
ok('Senare döljer, ny kontroll visar igen');

// Untitled text that must survive the restart.
await win.click('.cm-content');
await win.keyboard.type('Osparad anteckning före uppdateringen');
await win.waitForTimeout(1200);

// One click downloads with progress and then installs, without a second click.
const closed = new Promise((res) => app.process().once('exit', res));
await win.click('#update-go');
await win.waitForFunction(() => window.__notera.update.state === 'downloading');
await win.waitForFunction(() => (window.__notera.update.percent || 0) > 10, null, { timeout: 15000 });
await shot('31-update-downloading');
// Text and bar read in one go: the install starts as soon as the download ends.
const bar = await win.evaluate(() => {
  const text = document.querySelector('#update-text').textContent;
  const outer = document.querySelector('#update-bar').getBoundingClientRect().width;
  const inner = document.querySelector('#update-bar i').getBoundingClientRect().width;
  return { text, pct: Number((/(\d+) %/.exec(text) || [])[1]), fill: Math.round((inner / outer) * 100) };
});
assert.match(bar.text, /^Laddar ner Notera 9\.9\.9… \d+ %$/);
assert.ok(Math.abs(bar.pct - bar.fill) <= 2, 'bar matches text: ' + JSON.stringify(bar));
ok('nedladdning visar förlopp');
await closed;
assert.ok(fileHits >= 1);
assert.equal(fs.readFileSync(marker, 'utf8'), '9.9.9');
const drafts = fs.readdirSync(path.join(userData, 'drafts'));
assert.equal(drafts.length, 1);
assert.match(fs.readFileSync(path.join(userData, 'drafts', drafts[0]), 'utf8'), /Osparad anteckning/);
ok('ett klick laddar ner och installerar: appen avslutas och utkastet behålls');

// No newer version: nothing is offered and a check reports "latest". The draft comes back.
feedVersion = '0.0.1';
app = await launch();
win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
await win.waitForTimeout(2000);
assert.equal(await win.evaluate(() => document.querySelector('#update-toast').hidden), true);
assert.equal((await win.evaluate(() => window.notera.checkForUpdates(false))).status, 'latest');
assert.equal(await win.evaluate(() => window.__notera.view.state.doc.toString()), 'Osparad anteckning före uppdateringen');
ok('ingen nyare version: ingen ruta, "senaste"; utkastet är tillbaka');

// A manual check says it is checking, and a dropped connection is tried again before it fails.
feedDelay = 800;
const pending = win.evaluate(() => window.notera.checkForUpdates(false).then(() => null));
await win.waitForTimeout(200);
assert.equal(await win.evaluate(() => document.querySelector('#update-toast').hidden), true, 'an automatic-style check stays silent');
await pending;
dropFeed = 2;
const manual = win.evaluate(() => new Promise((resolve) => {
  window.notera.checkForUpdates(true);
  const seen = setInterval(() => {
    if (!document.querySelector('#update-toast').hidden) { clearInterval(seen); resolve(document.querySelector('#update-text').textContent); }
  }, 20);
}));
await app.evaluate(({ dialog }) => { globalThis.__boxes = []; dialog.showMessageBox = async (_w, o) => { globalThis.__boxes.push((o || _w).message); return { response: 0 }; }; });
assert.equal(await manual, 'Söker efter uppdateringar…');
await win.waitForFunction(() => document.querySelector('#update-toast').hidden, null, { timeout: 10000 });
await app.evaluate(() => new Promise((r) => { const w = () => (globalThis.__boxes.length ? r() : setTimeout(w, 50)); w(); }));
const version = await app.evaluate(({ app: a }) => a.getVersion());
assert.deepEqual(await app.evaluate(() => globalThis.__boxes), [`Du har den senaste versionen av Notera (${version}).`], 'two dropped connections, then the answer');
assert.equal(dropFeed, 0);
// Every try dropped: the box says GitHub could not be reached, with the error under it.
dropFeed = 99;
await app.evaluate(() => { globalThis.__boxes = []; });
const failed = await win.evaluate(() => window.notera.checkForUpdates(true));
assert.equal(failed.status, 'error');
assert.equal(failed.network, true);
assert.match((await app.evaluate(() => globalThis.__boxes))[0], /^Notera nådde inte GitHub för att söka efter uppdateringar/);
assert.ok(99 - dropFeed >= 3, `one try and two retries at least (${99 - dropFeed}; electron-updater may retry on its own too)`);
dropFeed = 0;
feedDelay = 0;
ok('manuell kontroll visar "Söker efter uppdateringar…", försöker igen vid tappad anslutning, och säger tydligt när GitHub inte nås');
await win.evaluate(() => { for (const t of window.__notera.tabs) { t.dirty = false; } });
await app.close();

// Stubs the native message boxes in the main process. Each box is recorded; the answer is
// globalThis.__answer, or waits for release() when globalThis.__hold is set.
const stubDialogs = () => app.evaluate(({ dialog }) => {
  globalThis.__asked = [];
  globalThis.__answer = 0;
  dialog.showMessageBox = async (_w, opts) => {
    const o = opts || _w;
    globalThis.__asked.push({ message: o.message, buttons: o.buttons });
    if (globalThis.__hold) await new Promise((r) => { globalThis.__release = r; });
    return { response: globalThis.__answer, checkboxChecked: false };
  };
});
const answer = (n, hold = false) => app.evaluate((_e, [n, hold]) => { globalThis.__answer = n; globalThis.__hold = hold; globalThis.__asked = []; }, [n, hold]);
const asked = () => app.evaluate(() => globalThis.__asked);
const release = () => app.evaluate(() => { globalThis.__hold = false; globalThis.__release(); });

// Manual check that finds an update: one dialog asks; "Senare" dismisses, yes downloads and installs.
feedVersion = '9.9.9';
fs.rmSync(marker, { force: true });
app = await launch();
win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
await win.waitForSelector('#update-toast:not([hidden])', { timeout: 15000 });
await stubDialogs();
await answer(1);
assert.equal((await win.evaluate(() => window.notera.checkForUpdates(true))).status, 'available');
assert.deepEqual(await asked(), [{ message: 'Notera 9.9.9 finns. Vill du ladda ner och installera den nu?', buttons: ['Ladda ner och installera', 'Senare'] }]);
await win.waitForSelector('#update-toast[hidden]', { state: 'attached' });
assert.equal(await win.evaluate(() => window.__notera.update.state), 'dismissed');
ok('manuell kontroll frågar i en dialog; Senare döljer rutan');
await answer(0);
const closed2 = new Promise((res) => app.process().once('exit', res));
await app.evaluate(({ Menu }) => {
  const find = (items) => {
    for (const i of items) {
      if (i.label === 'Sök efter uppdateringar…') return i;
      const sub = i.submenu && find(i.submenu.items);
      if (sub) return sub;
    }
    return null;
  };
  find(Menu.getApplicationMenu().items).click();
});
await win.waitForFunction(() => window.__notera.update.state === 'downloading');
await shot('33-update-manual-downloading');
await closed2;
assert.equal(fs.readFileSync(marker, 'utf8'), '9.9.9');
ok('Hjälp → Sök efter uppdateringar, ja: laddar ner och installerar utan fler klick');

// A cancelled save calls the install off: the toast offers "Starta om och installera" instead,
// and that click installs once the save question is answered.
fs.rmSync(marker, { force: true });
const named = path.join(tmp, 'Inköp.md');
fs.writeFileSync(named, '# Inköp\n');
app = await launch([named]);
win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.some((t) => t.path));
await win.evaluate(() => window.notera.setSettings({ autosave: false }));
await win.waitForSelector('#update-toast:not([hidden])', { timeout: 15000 });
await stubDialogs();
await win.locator('.tab', { hasText: 'Inköp' }).click();
await win.click('.cm-content');
await win.keyboard.press('Control+End');
await win.keyboard.type('mjölk');
await win.waitForFunction(() => window.__notera.tabs.some((t) => t.path && t.dirty));
await answer(2, true); // "Avbryt" on the save question, held so the installing state can be seen
await win.click('#update-go');
await win.waitForFunction(() => window.__notera.update.state === 'installing', null, { timeout: 30000 });
await win.waitForFunction(() => document.querySelector('#update-text').textContent === 'Installerar Notera 9.9.9…');
assert.equal(await win.evaluate(() => document.querySelector('#update-go').hidden), true);
await shot('34-update-installing');
assert.match((await asked())[0].message, /Inköp/);
await release();
await win.waitForFunction(() => window.__notera.update.state === 'downloaded');
assert.equal(await win.textContent('#update-text'), 'Notera 9.9.9 är klar att installeras.');
assert.equal(await win.textContent('#update-go'), 'Starta om och installera');
assert.equal(await win.evaluate(() => document.querySelector('#update-toast').hidden), false);
assert.equal(fs.existsSync(marker), false);
await shot('35-update-install-cancelled');
ok('avbruten sparning: appen lever, rutan visar Starta om och installera');
await answer(1); // "Spara inte"
const closed3 = new Promise((res) => app.process().once('exit', res));
await win.click('#update-go');
await closed3;
assert.equal(fs.readFileSync(marker, 'utf8'), '9.9.9');
assert.equal(fs.readFileSync(named, 'utf8'), '# Inköp\n');
ok('Starta om och installera installerar när frågan är besvarad');

// A failed download shows the error toast; one click on retry downloads and installs.
fs.rmSync(marker, { force: true });
app = await launch();
win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
await win.waitForSelector('#update-toast:not([hidden])', { timeout: 15000 });
failNext = true;
await win.click('#update-go');
await win.waitForFunction(() => window.__notera.update.state === 'error', null, { timeout: 30000 });
assert.equal(await win.textContent('#update-text'), 'Uppdateringen gick inte att ladda ner.');
assert.equal(await win.textContent('#update-go'), 'Ladda ner och installera');
await shot('36-update-download-error');
ok('misslyckad nedladdning visar felrutan');
const hitsBefore = fileHits;
const closed4 = new Promise((res) => app.process().once('exit', res));
await win.click('#update-go');
await closed4;
assert.ok(fileHits > hitsBefore);
assert.equal(fs.readFileSync(marker, 'utf8'), '9.9.9');
ok('försök igen laddar ner och installerar med ett klick');

// Automatic checks can be turned off.
feedVersion = '9.9.9';
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8')), checkUpdates: false }));
app = await launch();
win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
await win.waitForTimeout(2000);
assert.equal(await win.evaluate(() => document.querySelector('#update-toast').hidden), true);
ok('avstängd automatisk kontroll visar ingenting');
await win.evaluate(() => { for (const t of window.__notera.tabs) { t.dirty = false; } });
await app.close();

// A source checkout without a feed says why it can't update.
app = await electron.launch({ args: [root], env: { ...process.env, NOTERA_USER_DATA: path.join(tmp, 'ud2') } });
win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
const u = await win.evaluate(() => window.notera.checkForUpdates(false));
assert.deepEqual(u, { status: 'unsupported', reason: 'dev' });
ok('källkodskörning: "unsupported"');
await app.close();

server.close();
console.log('update OK');
