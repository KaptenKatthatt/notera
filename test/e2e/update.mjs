// Update flow against a local feed: auto check -> offer -> download with progress -> restart,
// keeping untitled text as a draft. Plus "Later", the no-update case and unsupported builds.
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
const yml = () => [
  `version: ${feedVersion}`, 'files:', `  - url: Notera-${feedVersion}.AppImage`, `    sha512: ${sha512}`, `    size: ${payload.length}`,
  `path: Notera-${feedVersion}.AppImage`, `sha512: ${sha512}`, "releaseDate: '2026-09-24T12:00:00.000Z'", ''
].join('\n');
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/latest-linux.yml')) { res.writeHead(200, { 'Content-Type': 'text/yaml' }); res.end(yml()); return; }
  if (req.url.startsWith('/Notera-')) {
    fileHits++;
    if (req.headers.range) { res.writeHead(416); res.end(); return; } // no differential download: full file
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': payload.length });
    let off = 0;
    const chunk = 128 * 1024;
    const tick = () => { if (off >= payload.length) { res.end(); return; } res.write(payload.subarray(off, off + chunk)); off += chunk; setTimeout(tick, 60); };
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
const launch = (extraEnv = {}) => electron.launch({
  args: [root],
  env: { ...process.env, NOTERA_USER_DATA: userData, NOTERA_UPDATE_FEED: feed, NOTERA_UPDATE_DRYRUN: marker, APPIMAGE: fakeAppImage, ...extraEnv }
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

// Download with progress.
await win.click('#update-go');
await win.waitForFunction(() => window.__notera.update.state === 'downloading');
await win.waitForFunction(() => (window.__notera.update.percent || 0) > 10, null, { timeout: 15000 });
await shot('31-update-downloading');
assert.match(await win.textContent('#update-text'), /^Laddar ner Notera 9\.9\.9… \d+ %$/);
const bar = await win.evaluate(() => {
  const pct = Number(/(\d+) %/.exec(document.querySelector('#update-text').textContent)[1]);
  const outer = document.querySelector('#update-bar').getBoundingClientRect().width;
  const inner = document.querySelector('#update-bar i').getBoundingClientRect().width;
  return { pct, fill: Math.round((inner / outer) * 100) };
});
assert.ok(Math.abs(bar.pct - bar.fill) <= 2, 'bar matches text: ' + JSON.stringify(bar));
ok('nedladdning visar förlopp');
await win.waitForFunction(() => window.__notera.update.state === 'downloaded', null, { timeout: 30000 });
assert.equal(await win.textContent('#update-text'), 'Notera 9.9.9 är klar att installeras.');
assert.equal(await win.textContent('#update-go'), 'Starta om och installera');
await shot('32-update-ready');
assert.ok(fileHits >= 1);
ok('nedladdad och verifierad mot sha512');

// Restart and install: the app quits, the draft is kept.
const closed = new Promise((res) => app.process().once('exit', res));
await win.click('#update-go');
await closed;
assert.equal(fs.readFileSync(marker, 'utf8'), '9.9.9');
const drafts = fs.readdirSync(path.join(userData, 'drafts'));
assert.equal(drafts.length, 1);
assert.match(fs.readFileSync(path.join(userData, 'drafts', drafts[0]), 'utf8'), /Osparad anteckning/);
ok('Starta om och installera avslutar appen och behåller utkastet');

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
await win.evaluate(() => { for (const t of window.__notera.tabs) { t.dirty = false; } });
await app.close();

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
