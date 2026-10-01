// Templates as files in Mallar/, the Standupanteckningar project, default templates and date sorting.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'test/e2e/shots');
fs.mkdirSync(shots, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-tpl-'));
const userData = path.join(tmp, 'userdata');
const notes = path.join(tmp, 'Anteckningar');
const bin = path.join(tmp, 'bin');
fs.mkdirSync(userData, { recursive: true });
fs.mkdirSync(bin);
const today = (() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();
const ls = (...rel) => fs.readdirSync(path.join(notes, ...rel)).filter((n) => !n.startsWith('.')).sort();
const read = (...rel) => fs.readFileSync(path.join(notes, ...rel), 'utf8');

// An existing notes folder from before this version: it gets set up on the first start.
fs.mkdirSync(path.join(notes, 'Enlantis'), { recursive: true });
fs.writeFileSync(path.join(notes, 'Enlantis', '2026-09-18 Sprint.md'), '# Sprint\nProjekt: Enlantis · Skapad: 2026-09-18 09:12\n\nPlanering\n');
fs.writeFileSync(path.join(notes, '.notera.json'), JSON.stringify({ version: 1, inbox: 'Osorterat', archive: 'Arkiv', projects: ['Enlantis'] }));
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({
  notesRoot: notes, sidebarOpen: true, language: 'sv', mode: 'light', checkUpdates: false, autosave: true, windowBounds: { width: 1200, height: 800 }
}));

const app = await electron.launch({ args: [root], env: { ...process.env, NOTERA_USER_DATA: userData } });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(e.message));
await win.waitForFunction(() => window.__notera && window.__notera.sidebar.tree && window.__notera.sidebar.tree.templates);
await app.evaluate(({ dialog, shell }, binDir) => {
  const fsm = process.mainModule.require('fs');
  const pathm = process.mainModule.require('path');
  dialog.showMessageBox = async () => ({ response: 0, checkboxChecked: false });
  shell.trashItem = async (p) => { fsm.renameSync(p, pathm.join(binDir, pathm.basename(p) + '-' + Date.now())); };
}, bin);
const shot = (name) => win.screenshot({ path: path.join(shots, name + '.png') });
const settle = () => win.waitForTimeout(350);
const proj = (folder) => win.locator(`#sb-list .sb-proj[data-folder="${folder}"]`);
const tplRow = (name) => win.locator(`#sb-list .sb-tpl[data-template="${name}"]`);
const titlesIn = (folder) => win.evaluate((f) => {
  const out = [];
  let el = document.querySelector(`#sb-list .sb-proj[data-folder="${f}"]`)?.nextElementSibling;
  while (el && el.classList.contains('sb-note')) { out.push(el.querySelector('.name').textContent); el = el.nextElementSibling; }
  return out;
}, folder);
const doc = () => win.evaluate(() => window.__notera.view.state.doc.toString());
const caret = () => win.evaluate(() => window.__notera.view.state.selection.main.head);

// 1. The existing folder was set up once: templates folder, Standup.md, Standupanteckningar.
assert.deepEqual(ls(), ['Arkiv', 'Enlantis', 'Mallar', 'Osorterat', 'Standupanteckningar']);
assert.deepEqual(ls('Mallar'), ['Standup.md']);
assert.equal(await tplRow('Standup').count(), 1, 'templates section lists Standup');
assert.equal(JSON.parse(read('.notera.json')).seeded, true);
console.log('ok   befintlig mapp sattes upp');

// 2. The plus on Standupanteckningar: a standup note, cursor under the first subheading.
await proj('Standupanteckningar').hover();
await proj('Standupanteckningar').locator('[data-act="new-note"]').click();
await win.waitForFunction(() => /Standupanteckningar[\\/]\d{4}-\d{2}-\d{2} Standup\.md$/.test(window.__notera.active.path || ''));
assert.deepEqual(ls('Standupanteckningar'), [`${today} Standup.md`], 'no repeated date in the file name');
const text = await doc();
assert.match(text, new RegExp(`^# Standup ${today}\\nProjekt: Standupanteckningar · Skapad: ${today} \\d\\d:\\d\\d\\n\\n## Gjort sen sist\\n`));
assert.ok(text.slice(0, await caret()).endsWith('## Gjort sen sist\n'), 'cursor under "## Gjort sen sist"');
await win.keyboard.type('Byggde mallar');
await settle();
assert.ok((await doc()).includes('## Gjort sen sist\nByggde mallar\n'), 'typing starts under the subheading');
await shot('50-templates-standup-note');
console.log('ok   plus i Standupanteckningar');

// 3. Date sorting: the date in the heading decides, newest first; no manual reordering.
const dir = path.join(notes, 'Standupanteckningar');
fs.writeFileSync(path.join(dir, '2026-09-01 Standup.md'), '# Standup 2026-09-01\nProjekt: Standupanteckningar · Skapad: 2026-09-01 09:00\n');
fs.writeFileSync(path.join(dir, '2026-09-15 Standup.md'), '# Standup 2099-01-01\nProjekt: Standupanteckningar · Skapad: 2026-09-15 09:00\n');
await win.evaluate(() => window.__notera.sidebar.refresh());
await settle();
assert.deepEqual(await titlesIn('Standupanteckningar'), ['Standup 2099-01-01', `Standup ${today}`, 'Standup 2026-09-01']);
const first = await win.locator('#sb-list .sb-note', { hasText: 'Standup 2026-09-01' }).boundingBox();
const top = await win.locator('#sb-list .sb-note', { hasText: 'Standup 2099-01-01' }).boundingBox();
await win.mouse.move(first.x + 40, first.y + first.height / 2);
await win.mouse.down();
await win.mouse.move(first.x + 40, first.y - 10, { steps: 4 });
await win.mouse.move(top.x + 40, top.y + 3, { steps: 6 });
await win.mouse.up();
await settle();
assert.deepEqual(await titlesIn('Standupanteckningar'), ['Standup 2099-01-01', `Standup ${today}`, 'Standup 2026-09-01'], 'dragging does not reorder a date-sorted project');
console.log('ok   datumsortering');

// 4. Project menu: Default template and Sort submenus, the current choice ticked.
await proj('Standupanteckningar').click({ button: 'right' });
await win.hover('#sb-menu button:has-text("Standardmall")');
await win.waitForSelector('#sb-menu .sb-submenu:not([hidden]) button');
const ticked = () => win.$$eval('#sb-menu .sb-submenu > button', (bs) => bs.map((b) => `${b.querySelector('.lab').textContent}${b.querySelector('svg') ? ' ✓' : ''}`));
assert.deepEqual(await ticked(), ['Ingen', 'Standup ✓']);
await shot('51-templates-default-submenu');
await win.hover('#sb-menu button:has-text("Sortering")');
await win.waitForFunction(() => document.querySelector('#sb-menu .sb-submenu > button .lab')?.textContent === 'Manuell');
assert.deepEqual(await ticked(), ['Manuell', 'Datum i anteckningen ✓']);
await win.keyboard.press('Escape');
await win.keyboard.press('Escape');
console.log('ok   projektmenyns undermenyer');

// 5. A new template via the plus on the section, then made Enlantis' default.
await win.click('#sb-list [data-act="new-template"]');
await win.fill('#sb-edit', 'Möte');
await win.keyboard.press('Enter');
await win.waitForFunction(() => /Mallar[\\/]Möte\.md$/.test(window.__notera.active.path || ''));
assert.deepEqual(ls('Mallar'), ['Möte.md', 'Standup.md']);
await win.evaluate(() => { const v = window.__notera.view; v.dispatch({ changes: { from: 0, insert: '# Möte {{datum}}\n\n## Agenda\n\n\n## Beslut\n' } }); });
await win.evaluate(() => window.__notera.handleAction('save'));
await win.waitForFunction(() => !window.__notera.active.dirty);
await settle();
assert.deepEqual(ls('Mallar'), ['Möte.md', 'Standup.md'], 'a template is not renamed after its heading');
await proj('Enlantis').click({ button: 'right' });
await win.hover('#sb-menu button:has-text("Standardmall")');
await win.waitForSelector('#sb-menu .sb-submenu:not([hidden]) button');
await win.click('#sb-menu .sb-submenu button:has-text("Möte")');
await settle();
assert.equal(JSON.parse(read('.notera.json')).options.Enlantis.template, 'Möte');
await proj('Enlantis').hover();
await proj('Enlantis').locator('[data-act="new-note"]').click();
await win.waitForFunction(() => /Enlantis[\\/].* Möte\.md$/.test(window.__notera.active.path || ''));
assert.match(await doc(), new RegExp(`^# Möte ${today}\\nProjekt: Enlantis · `));
assert.ok((await doc()).slice(0, await caret()).endsWith('## Agenda\n'));
console.log('ok   egen mall som standard i Enlantis');

// 6. File menu: New from template (in the current project) and Apply template (at the cursor).
await win.evaluate(() => window.__notera.handleAction('newFromTemplate', 'Standup'));
await win.waitForFunction(() => /Enlantis[\\/].*Standup\.md$/.test(window.__notera.active.path || ''));
assert.match(await doc(), /^# Standup .*\nProjekt: Enlantis · /);
await win.evaluate(() => { const v = window.__notera.view; v.dispatch({ selection: { anchor: v.state.doc.length } }); });
await win.evaluate(() => window.__notera.handleAction('applyTemplate', 'Möte'));
assert.ok((await doc()).endsWith(`# Möte ${today}\n\n## Agenda\n\n\n## Beslut\n`), 'applied at the cursor, date filled in');
console.log('ok   Arkiv-menyns mallkommandon');

// 7. Save as template from a note, rename a template (projects follow), delete it (projects let go).
await win.locator('#sb-list .sb-note', { hasText: 'Sprint' }).click({ button: 'right' });
await win.click('#sb-menu button:has-text("Spara som mall")');
await win.waitForSelector('#sb-edit');
await win.fill('#sb-edit', 'Sprintmall');
await win.keyboard.press('Enter');
await win.waitForFunction(() => /Mallar[\\/]Sprintmall\.md$/.test(window.__notera.active.path || ''));
assert.equal(read('Mallar', 'Sprintmall.md').replace(/\r\n/g, '\n'), '# Sprint\n\nPlanering\n', 'no header line');
await tplRow('Möte').click({ button: 'right' });
await win.click('#sb-menu button:has-text("Byt namn")');
await win.fill('#sb-edit', 'Veckomöte');
await win.keyboard.press('Enter');
await settle();
assert.deepEqual(ls('Mallar'), ['Sprintmall.md', 'Standup.md', 'Veckomöte.md']);
assert.equal(JSON.parse(read('.notera.json')).options.Enlantis.template, 'Veckomöte');
await shot('52-templates-sidebar');
await tplRow('Veckomöte').click({ button: 'right' });
await win.click('#sb-menu button:has-text("Ta bort")');
await settle();
assert.deepEqual(ls('Mallar'), ['Sprintmall.md', 'Standup.md']);
assert.equal((JSON.parse(read('.notera.json')).options.Enlantis || {}).template, undefined);
console.log('ok   spara som mall, byt namn, ta bort');

// 8. The templates section folds like a project: count while folded, remembered in .notera.json.
const tplToggle = win.locator('#sb-list [data-act="tpl-toggle"]');
assert.equal(await tplToggle.getAttribute('aria-expanded'), 'true');
await tplToggle.click();
await settle();
assert.equal(await tplToggle.getAttribute('aria-expanded'), 'false');
assert.equal(await win.locator('#sb-list .sb-tpl').count(), 0, 'folded: no template rows');
assert.equal(await win.textContent('#sb-list .sb-tpl-sec .count'), '2');
assert.ok(JSON.parse(read('.notera.json')).collapsed.includes('Mallar'), 'folded state saved');
await win.evaluate(() => window.__notera.sidebar.refresh());
assert.equal(await win.locator('#sb-list .sb-tpl').count(), 0, 'still folded after a reload of the tree');
await shot('53-templates-folded');
// The plus on a folded section unfolds it and opens the name field.
await win.click('#sb-list .sb-tpl-sec [data-act="new-template"]');
await win.waitForSelector('#sb-list .sb-tpl #sb-edit');
await win.keyboard.press('Escape');
await settle();
assert.equal(await win.locator('#sb-list .sb-tpl').count(), 2);
assert.ok(!JSON.parse(read('.notera.json')).collapsed.includes('Mallar'), 'unfolded state saved');
console.log('ok   mallsektionen fälls ihop');

assert.deepEqual(errors, []);
await win.evaluate(() => { for (const t of window.__notera.tabs) { t.dirty = false; t.savedDoc = t.state.doc; } });
await app.close();
console.log('templates OK; screenshots in', shots);
