// Handover-funktioner: mallar (standup), klickbara todo-rutor, parentes-wrap.
// Egen svit (ren appstart) for att inte kopplas till writing-svitens skrivlage/dialoger.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-abc-'));
const app = await electron.launch({
  args: [root],
  env: { ...process.env, NOTERA_USER_DATA: path.join(tmp, 'userdata'), NOTERA_TEST: '1' }
});
const win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
const doc = () => win.evaluate(() => window.__notera.view.state.doc.toString());

// C) Parentes-wrap a la VS Code
await win.evaluate(() => {
  const v = window.__notera.view;
  v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: 'Hej pa dej\n\nSista ordet' } });
  const l = v.state.doc.line(3);
  v.dispatch({ selection: { anchor: l.from + 6, head: l.to } });
  v.focus();
});
await win.waitForTimeout(200);
console.log('C: fore (');
await win.keyboard.press('(');
console.log('C: efter (');
await win.waitForFunction(() => window.__notera.view.state.doc.toString().includes('(ordet)'), undefined, { timeout: 5000 });
assert.ok((await doc()).includes('Sista (ordet)'), 'parentes wrappar selektionen: ' + JSON.stringify((await doc()).slice(-20)));

// A) Standup-mall: ny flik med rubrik + datum + tre underrubriker
console.log('A: oppnar mall');
await win.evaluate(() => window.__notera.handleAction('newFromTemplate', 'standup'));
await win.waitForFunction(() => window.__notera.tabs.length === 2, undefined, { timeout: 5000 });
const tplDoc = await doc();
assert.match(tplDoc, /^# Standup \d{4}-\d{2}-\d{2}\n/, 'standuprubrik med datum');
const headers = tplDoc.split('\n').filter((l) => l.startsWith('## '));
assert.equal(headers.length, 3, 'tre underrubriker: ' + JSON.stringify(headers));
assert.ok(tplDoc.dirty === undefined, ''); // no-op guard (doc() ar text)
await win.evaluate(() => { const t = window.__notera.active; t.dirty = false; t.savedDoc = t.state.doc; });

// B) Klickbara todo-rutor i forhandsvisningen
console.log('B: oppnar flik');
await win.evaluate(() => window.__notera.handleAction('new'));
await win.waitForFunction(() => window.__notera.tabs.length === 3, undefined, { timeout: 5000 });
await win.evaluate(() => {
  const v = window.__notera.view;
  v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: '# Todo\n\n- [ ] Oklar\n- [x] Klar' } });
});
await win.evaluate(() => window.notera.setSettings({ viewMode: 'split' }));
await win.waitForFunction(() => document.querySelectorAll('#preview input[type="checkbox"]').length === 2, undefined, { timeout: 5000 });
await win.waitForTimeout(400);
console.log('B: preview klar');
const boxes = win.locator('#preview input[type="checkbox"]');
assert.equal(await boxes.count(), 2, 'tva rutor i preview');
assert.equal(await boxes.nth(0).isDisabled(), false, 'rutan ar klickbar');
await boxes.nth(0).click();
await win.waitForFunction(() => window.__notera.view.state.doc.toString().includes('- [x] Oklar'), undefined, { timeout: 5000 });
assert.ok((await win.evaluate(() => window.__notera.view.state.doc.toString())).includes('- [x] Oklar'), 'klick togglade raden i dokumentet');

// D) Applicera mall pa paborjat dokument: sidhuvud + idempotens
await win.evaluate(() => window.__notera.handleAction('new'));
await win.waitForFunction(() => window.__notera.tabs.length === 4, undefined, { timeout: 5000 });
await win.evaluate(() => {
  const v = window.__notera.view;
  v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: 'Min paborjade text' } });
});
await win.evaluate(() => window.__notera.handleAction('applyTemplate', 'standup'));
const headDoc = await win.evaluate(() => window.__notera.view.state.doc.toString());
assert.ok(headDoc.startsWith('# Titel:' + String.fromCharCode(10)), 'sidhuvud forst');
const re = new RegExp('# Titel:' + String.fromCharCode(92) + 'n' + String.fromCharCode(92) + 'd{4}' + String.fromCharCode(92) + '-');
assert.ok(re.test(headDoc), 'datumtid genererad');
assert.ok(headDoc.endsWith('Min paborjade text'), 'text bevarad under sidhuvudet');
const caret = await win.evaluate(() => window.__notera.view.state.selection.main.anchor);
assert.equal(caret, 8, 'caret efter Titel:');
const before = await win.evaluate(() => window.__notera.view.state.doc.toString());
await win.evaluate(() => window.__notera.handleAction('applyTemplate', 'standup'));
await win.waitForTimeout(150);
const after = await win.evaluate(() => window.__notera.view.state.doc.toString());
assert.equal(before, after, 'andra appliceringen andrar inget');
console.log('D: applicera-mall OK');
console.log('B: klar, stanger app');
// nolla dirty pa ALLA flikar — annars blockeras nasta svits app.close() av
// 'osparat?'-dialogen (smoke.mjs-konventionen: t.dirty=false + savedDoc=state)
await win.evaluate(() => { for (const t of window.__notera.tabs) { t.dirty = false; t.savedDoc = t.state.doc; } });
await app.close();
console.log('abc OK');
