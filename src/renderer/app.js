import { makeT, LOCALES } from '../shared/strings.js';
import { createState, reconfigureEffects, EditorView, EditorState } from './editor.js';
import * as fmt from './format.js';
import { lineCommands } from './lines.js';
import { createKeyDispatcher } from './keybindings.js';
import { createSettingsDialog } from './settingsDialog.js';
import { attachTabDrag } from './tabdrag.js';
import { display } from '../shared/commands.js';
import { fillPlaceholders, cursorAfterHeading, standupTemplate, BUILTIN } from '../shared/templates.js';
import { createThemeApplier } from './themeApply.js';
import { createEffects, demoCursorEffect } from './effects.js';
import { normalizeEffects, CURSOR_EFFECT_IDS } from '../shared/themeFormat.js';
import { createPalette } from './palette.js';
import { countWords } from './markdown.js';
import { createSidebar, ICONS } from './sidebar.js';
import { createPreview } from './preview.js';
import { createDialogs } from './dialogs.js';
import { createPopups } from './popups.js';
import { createUpdateToast } from './updateToast.js';
import { undo, redo, selectAll, deleteCharForward } from '@codemirror/commands';
import { openSearchPanel, findNext, findPrevious, gotoLine } from '@codemirror/search';

const api = window.notera;
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let settings = {};
let locale = 'en';
let t = makeT('en');
let tabs = [];
let active = null;
let nextId = 1;
let view;
let isDark = false;
let themes = null;
let effects = null;
let palette = null;
let themeMsg = null;     // the theme main last sent; the theme picker's previews do not replace it
let settingsFile = null; // settings.json, so saving it by hand applies it
let themeList = [];   // every installed theme, for the settings dialog
const platformEol = api.platform === 'win32' ? 'CRLF' : 'LF';
const ENCODINGS = ['utf8', 'utf8bom', 'utf16le', 'utf16be', 'ansi'];
const AUTOSAVE_DELAY_MS = 800;   // a named file is written this long after the last keystroke
const DRAFT_DELAY_MS = 1000;     // an untitled tab's draft is written this long after the last keystroke

// ---------- helpers ----------
function editorOpts(tab) {
  return {
    kind: tab.kind,
    wordWrap: settings.wordWrap !== false,
    lineNumbers: !!settings.lineNumbers,
    dark: isDark,
    phrases: LOCALES[locale].search,
    hideMarkers: settings.hideMarkers !== false,
    placeholder: tab.kind === 'md' ? t('ui.startWriting') : '',
    readOnly: !!tab.readOnly,
    spellcheck: !!settings.spellcheck
  };
}


function runFormat(action, v = view) {
  if (!active || active.kind !== 'md' || active.readOnly) return true; // swallow, but do nothing for plain text
  switch (action) {
    case 'bold': return fmt.toggleInline(v, '**');
    case 'italic': return fmt.toggleInline(v, '*');
    case 'strikethrough': return fmt.toggleInline(v, '~~');
    case 'code': return fmt.toggleInline(v, '`');
    case 'heading1': return fmt.toggleLinePrefix(v, 'h1');
    case 'heading2': return fmt.toggleLinePrefix(v, 'h2');
    case 'heading3': return fmt.toggleLinePrefix(v, 'h3');
    case 'heading4': return fmt.toggleLinePrefix(v, 'h4');
    case 'heading5': return fmt.toggleLinePrefix(v, 'h5');
    case 'heading6': return fmt.toggleLinePrefix(v, 'h6');
    case 'bulletList': return fmt.toggleLinePrefix(v, 'bullet');
    case 'numberedList': return fmt.toggleLinePrefix(v, 'number');
    case 'checkList': return fmt.toggleLinePrefix(v, 'check');
    case 'quote': return fmt.toggleLinePrefix(v, 'quote');
    case 'codeBlock': return fmt.toggleCodeBlock(v);
    case 'horizontalRule': fmt.insertBlock(v, '---'); return true;
    case 'table': fmt.insertBlock(v, fmt.TABLE_TEMPLATE); return true;
    case 'link': void dialogs.insertLinkSmart(); return true;
    default: return false;
  }
}

function suggestedName(tab) {
  const firstLine = docFor(tab).toString().split('\n').find((l) => l.trim().length > 0) || '';
  const cleaned = firstLine.replace(/^[#>\-*\s\d.]+/, '').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 40).trim();
  return cleaned || t('untitled');
}

// ---------- notes (projects) ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SEP = api.platform === 'win32' ? '\\' : '/';
const pathKey = (p) => (api.platform === 'win32' ? String(p).toLowerCase() : String(p));
const baseName = (p) => String(p).split(/[\\/]/).pop();
function findTab(p) { return p ? tabs.find((x) => x.path && pathKey(x.path) === pathKey(p)) : null; }
/** Heading of the first line ("" for an empty "# "), or null when the first line is no heading. */
function headingOf(text) {
  const m = /^#(?:\s+(.*))?$/.exec(String(text).split('\n', 1)[0]);
  return m ? (m[1] || '').trim() : null;
}
function lineTitle(tab) { return headingOf(docFor(tab).line(1).text); }
function noteInfo(tab) { return sidebar && tab && tab.path ? sidebar.noteInfo(tab.path) : null; }

function tabTitle(tab) {
  if (noteInfo(tab)) {
    const h = lineTitle(tab);
    if (h === null) return (tab.name || '').replace(/\.(md|markdown|txt)$/i, '');
    return h || t('notes.untitledNote');
  }
  return tab.name || t('untitled');
}

function updateTitle() {
  if (!active) return;
  document.title = `${active.dirty ? '*' : ''}${tabTitle(active)} - ${t('appName')}`;
}

function encodingLabel(enc) { return t(`ui.${enc}`); }

// ---------- tabs ----------
function makeTab(init = {}) {
  const tab = {
    id: nextId++,
    path: init.path || null,
    name: init.name || '',
    kind: init.kind || 'md',
    encoding: init.encoding || settings.defaultEncoding || 'utf8',
    eol: init.eol || platformEol,
    mtimeMs: init.mtimeMs || null,
    dirty: false,
    state: null,
    savedDoc: null,
    draftId: init.draftId || null,
    autosaveTimer: null,
    draftTimer: null,
    readOnly: false,
    lastTitle: headingOf(init.text || '') || ''
  };
  tab.state = createState(init.text || '', editorOpts(tab));
  tab.savedDoc = tab.state.doc;
  tabs.push(tab);
  return tab;
}

function activateTab(tab) {
  // The view holds the newest text of the active tab; tab.state is only a snapshot from when it was
  // last activated. Activating the tab already shown (clicking its tab or sidebar row, a search
  // hit, Close others) must keep the view: loading the snapshot put back old text, and the next
  // keystroke autosaved that over the file.
  const switching = active !== tab;
  if (active) active.state = view.state;
  if (active && switching) { void flushPending(active); void maybeRenameNote(active); }
  if (sidebar && tab.path) syncReadOnly(tab);
  active = tab;
  if (switching) {
    view.setState(tab.state);
    // A fresh state may have stale compartment config if settings changed while inactive.
    view.dispatch({ effects: reconfigureEffects(editorOpts(tab)) });
  }
  renderTabs();
  applyKindUi();
  updateStatus();
  updateTitle();
  preview.schedule(0);
  renderNotesBanner();
  if (sidebar) sidebar.render();
  view.focus();
}

function renderTabs() {
  const host = $('#tabs');
  host.innerHTML = '';
  for (const tab of tabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (tab === active ? ' active' : '');
    el.setAttribute('role', 'tab');
    el.setAttribute('aria-selected', tab === active ? 'true' : 'false');
    el.dataset.id = tab.id;
    el.title = tab.path || tabTitle(tab);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = tabTitle(tab);
    el.appendChild(name);
    if (tab.dirty) {
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.title = t('ui.modified');
      el.appendChild(dot);
    }
    const close = document.createElement('button');
    close.className = 'close';
    close.title = t('ui.closeTab');
    close.setAttribute('aria-label', t('ui.closeTab'));
    close.textContent = '×';
    close.addEventListener('click', (e) => { e.stopPropagation(); void closeTab(tab); });
    el.appendChild(close);
    el.addEventListener('click', () => activateTab(tab));
    el.addEventListener('auxclick', (e) => { if (e.button === 1) void closeTab(tab); });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (tab !== active) activateTab(tab);
      sidebar.showTabMenu(tab, { x: e.clientX, y: e.clientY });
    });
    host.appendChild(el);
  }
  const activeEl = host.querySelector('.tab.active');
  if (activeEl) activeEl.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  placeTabsThumb();
}

// The tab strip's scroll thumb: shown on hover when the tabs do not all fit, draggable.
function placeTabsThumb() {
  const host = $('#tabs'), thumb = $('#tabs-thumb');
  const over = host.scrollWidth - host.clientWidth > 1;
  thumb.classList.toggle('on', over);
  if (!over) return;
  const ratio = host.clientWidth / host.scrollWidth;
  thumb.style.width = `${Math.max(24, host.clientWidth * ratio)}px`;
  thumb.style.left = `${host.offsetLeft + host.scrollLeft * ratio}px`;
}
$('#tabs').addEventListener('scroll', placeTabsThumb, { passive: true });
new ResizeObserver(placeTabsThumb).observe($('#tabs'));
$('#tabs-thumb').addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const host = $('#tabs'), thumb = /** @type {HTMLElement} */ (e.currentTarget);
  const startX = e.clientX, startLeft = host.scrollLeft, scale = host.scrollWidth / host.clientWidth;
  thumb.setPointerCapture(e.pointerId);
  thumb.classList.add('dragging');
  const move = (ev) => { host.scrollLeft = startLeft + (ev.clientX - startX) * scale; };
  const up = () => { thumb.classList.remove('dragging'); thumb.removeEventListener('pointermove', move); thumb.removeEventListener('pointerup', up); };
  thumb.addEventListener('pointermove', move);
  thumb.addEventListener('pointerup', up);
});

// The mouse wheel scrolls the tab strip sideways; Ctrl+wheel stays zoom.
$('#tabs').addEventListener('wheel', (e) => {
  if (e.ctrlKey) return;
  const host = /** @type {HTMLElement} */ (e.currentTarget);
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (!delta || host.scrollWidth <= host.clientWidth) return;
  host.scrollLeft += e.deltaMode === 1 ? delta * 40 : delta;
  e.preventDefault();
}, { passive: false });

attachTabDrag($('#tabbar'), {
  onReorder: (order) => {
    const byId = new Map(tabs.map((tb) => [String(tb.id), tb]));
    const next = order.map((id) => byId.get(id)).filter(Boolean);
    if (next.length !== tabs.length) return; // tabelländring mitt i draget — ignora
    tabs = next;
    renderTabs();
  },
  onDetach: (tabId) => void detachTabToWindow(tabs.find((tb) => String(tb.id) === String(tabId)))
});

const preview = createPreview({ getView: () => view, getActive: () => active, t: () => t });
const popups = createPopups({ focusEditor: () => { if (view) view.focus(); } });
const updates = createUpdateToast({ api, t: () => t });
const dialogs = createDialogs({
  api, t: () => t, getView: () => view, getSettings: () => settings, getKeys: () => keys, getSidebar: () => sidebar,
  settingsDialogOpen: () => !!settingsDialog && settingsDialog.isOpen()
});

function newTab(init) {
  const tab = makeTab(init);
  activateTab(tab);
  return tab;
}

/**
 * Ask what to do with a tab's unsaved changes, showing the tab first. True when the tab may go
 * (saved, or the user chose not to save); false when the user cancelled or the save failed.
 */
async function resolveUnsaved(tab) {
  activateTab(tab);
  const answer = await api.confirmUnsaved(tabTitle(tab));
  if (answer === 'cancel') return false;
  if (answer === 'save') return saveTab(tab);
  return true;
}

/** asked: the unsaved-changes question was already answered, e.g. by closeTabs. */
async function closeTab(tab, { asked = false } = {}) {
  if (!asked && tab.dirty && !(await resolveUnsaved(tab))) return false;
  clearTimeout(tab.autosaveTimer);
  await dropDraft(tab);
  // A new note closed before anything was written leaves no empty file behind.
  if (tab.pristine && tab.path && docFor(tab).toString() === tab.pristine) {
    tab.discarded = true;
    await api.notes.call('discardEmpty', tab.path, tab.pristine);
  }
  const idx = tabs.indexOf(tab);
  if (idx < 0) return true;
  tabs.splice(idx, 1);
  if (tabs.length === 0) newTab();
  else if (tab === active) activateTab(tabs[Math.min(idx, tabs.length - 1)]);
  else renderTabs();
  if (sidebar) sidebar.render();
  return true;
}

/** The tabs Close others / Close all / Close to the right would close, from the tab right-clicked. */
function tabsToClose(tab, which) {
  if (which === 'all') return [...tabs];
  if (which === 'others') return tabs.filter((x) => x !== tab);
  return tabs.slice(tabs.indexOf(tab) + 1);
}

/**
 * Close several tabs. Every unsaved one is asked about first, in tab order, like closing the
 * window; Cancel on any of them closes none. Closing them all leaves one empty tab, never the window.
 */
async function closeTabs(tab, which) {
  const list = tabsToClose(tab, which);
  if (!list.length) return false;
  for (const x of list) await flushPending(x);
  for (const x of list) if (x.dirty && !(await resolveUnsaved(x))) return false;
  for (const x of list) await closeTab(x, { asked: true });
  if (tabs.includes(tab)) activateTab(tab);
  return true;
}

function cycleTab(delta) {
  if (tabs.length < 2) return;
  const idx = tabs.indexOf(active);
  activateTab(tabs[(idx + delta + tabs.length) % tabs.length]);
}

/** Lossa en flik till ett eget fönster. Sparad fil: öppnas via path i nytt
 * fönster. Osparad text: flyttas via draft-systemet (draftId ägs över). */
async function detachTabToWindow(tab) {
  if (!tab) return;
  if (tab === active) { tab.state = view.state; void flushPending(tab); }
  if (tab.dirty && tab.path && !(await resolveUnsaved(tab))) return;
  if (!tab.path) { await flushPending(tab); await writeDraft(tab); }
  api.detachTab({ path: tab.path || null, draftId: tab.draftId || null });
  clearTimeout(tab.autosaveTimer); tab.autosaveTimer = null;
  clearTimeout(tab.draftTimer); tab.draftTimer = null;
  if (tab.path) void dropDraft(tab); // sparad fil: draften ska bort; draft-fallet ägs av nya fönstret
  const idx = tabs.indexOf(tab);
  tabs.splice(idx, 1);
  if (tabs.length === 0) newTab();
  else if (tab === active) activateTab(tabs[Math.min(idx, tabs.length - 1)]);
  else renderTabs();
}

// ---------- files ----------
async function openPaths(paths) {
  // A VS Code extension dropped on the window (or opened) imports its theme instead of opening as text.
  const vsix = paths.find((p) => /\.vsix$/i.test(p));
  if (vsix && palette) void palette.importVsix(vsix);
  for (const p of paths.filter((x) => !/\.vsix$/i.test(x))) {
    const existing = tabs.find((x) => x.path === p);
    if (existing) { activateTab(existing); continue; }
    const r = await api.readFile(p);
    if (!r.ok) { await api.showError({ kind: 'read', name: r.name, detail: r.error }); continue; }
    // Replace a pristine untitled tab, like Notepad does.
    if (active && !active.path && !active.dirty && docFor(active).length === 0 && tabs.length === 1) {
      tabs = [];
    }
    newTab({ path: r.path, name: r.name, kind: r.kind, encoding: r.encoding, eol: r.eol, text: r.text, mtimeMs: r.mtimeMs });
  }
}

async function openDialog() {
  const paths = await api.openDialog();
  if (paths && paths.length) await openPaths(paths);
}

function docFor(tab) { return tab === active ? view.state.doc : tab.state.doc; }

/**
 * Run a tab's disk writes (file, draft, draft removal) one at a time, in the order they were asked
 * for. Switching tabs starts a save without waiting for it, so without this a later autosave could
 * land before an earlier one, or a draft write could land after the draft was removed.
 */
function serial(tab, fn) {
  const next = (tab.diskQueue || Promise.resolve()).then(fn);
  tab.diskQueue = next.catch(() => false);
  return next;
}

/** Write a tab that already has a path, without touching which tab is active. */
function writeTab(tab) {
  clearTimeout(tab.autosaveTimer); tab.autosaveTimer = null;
  return serial(tab, () => writeTabNow(tab));
}

async function writeTabNow(tab) {
  const doc = docFor(tab);
  const r = await api.writeFile({ path: tab.path, text: doc.toString(), encoding: tab.encoding, eol: tab.eol });
  if (!r.ok) { await api.showError({ kind: 'write', name: r.name, detail: r.error }); return false; }
  tab.name = r.name; tab.mtimeMs = r.mtimeMs;
  tab.savedDoc = doc;
  tab.dirty = !docFor(tab).eq(doc);
  tab.lastSavedAt = Date.now();
  renderTabs(); updateTitle(); updateStatus();
  afterWrite(r);
  return true;
}

async function saveTab(tab, forceAs = false) {
  if (tab.path && !forceAs) return writeTab(tab);
  if (tab !== active) activateTab(tab);
  // Fix: Windows kan lämna cursorn gömd efter native-dialog — återställ den.
  document.body.style.cursor = 'auto';
  const target = await api.saveAsDialog({ currentPath: tab.path, suggestedName: suggestedName(tab), kind: tab.kind });
  document.body.style.cursor = '';
  if (!target) return false;
  clearTimeout(tab.autosaveTimer); tab.autosaveTimer = null;
  return serial(tab, () => saveTabAsNow(tab, target));
}

async function saveTabAsNow(tab, target) {
  const doc = docFor(tab);
  const r = await api.writeFile({ path: target, text: doc.toString(), encoding: tab.encoding, eol: tab.eol });
  if (!r.ok) { await api.showError({ kind: 'write', name: r.name, detail: r.error }); return false; }
  const kindChanged = r.kind !== tab.kind;
  tab.path = r.path; tab.name = r.name; tab.kind = r.kind; tab.mtimeMs = r.mtimeMs;
  tab.savedDoc = doc;
  tab.dirty = !docFor(tab).eq(doc);
  tab.lastSavedAt = Date.now();
  await deleteDraftNow(tab);
  afterWrite(r);
  if (kindChanged) {
    if (tab === active) { view.dispatch({ effects: reconfigureEffects(editorOpts(tab)) }); applyKindUi(); }
    else tab.state = tab.state.update({ effects: reconfigureEffects(editorOpts(tab)) }).state;
  }
  renderTabs(); updateTitle(); updateStatus();
  return true;
}

/** Main applies settings.json when it is saved by hand; a file that does not parse changes nothing and says why. */
function afterWrite(r) {
  const reload = r && r.settingsReload;
  if (!reload) return;
  if (reload.error) themes.notice(t('palette.settingsError', { line: reload.error.line || 1, message: reload.error.message }));
  else themes.notice('');
}

// ---------- autosave + drafts (Omawrite: it saves as you type, and recovers unsaved text) ----------
function scheduleAutosave(tab) {
  if (tab.path) {
    if (settings.autosave === false) return;
    clearTimeout(tab.autosaveTimer);
    tab.autosaveTimer = setTimeout(() => { if (tab.dirty) void writeTab(tab); }, AUTOSAVE_DELAY_MS);
  } else {
    clearTimeout(tab.draftTimer);
    tab.draftTimer = setTimeout(() => void writeDraft(tab), DRAFT_DELAY_MS);
  }
}

function writeDraft(tab) {
  clearTimeout(tab.draftTimer); tab.draftTimer = null;
  return serial(tab, async () => {
    const text = docFor(tab).toString();
    if (!text.trim()) { await deleteDraftNow(tab); return; }
    if (!tab.draftId) tab.draftId = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    await api.writeDraft({ id: tab.draftId, text, kind: tab.kind });
  });
}

function dropDraft(tab) {
  clearTimeout(tab.draftTimer); tab.draftTimer = null;
  return serial(tab, () => deleteDraftNow(tab));
}

async function deleteDraftNow(tab) {
  if (!tab.draftId) return;
  const id = tab.draftId; tab.draftId = null;
  await api.deleteDraft(id);
}

/**
 * Write what a pending autosave or draft timer would write, and wait for writes already under
 * way. False when a save failed. Afterwards the file on disk holds the tab's text, so it is safe
 * to rename or move it.
 */
async function flushPending(tab) {
  if (tab.autosaveTimer && tab.path && tab.dirty && !(await writeTab(tab))) return false;
  if (tab.draftTimer && !tab.path) await writeDraft(tab);
  return (await tab.diskQueue) !== false;
}

async function restoreDrafts() {
  const drafts = await api.listDrafts();
  for (const d of drafts) {
    if (!d.text || !d.text.trim()) { await api.deleteDraft(d.id); continue; }
    const tab = makeTab({ text: d.text, kind: d.kind || 'md', draftId: d.id });
    tab.savedDoc = tab.state.doc.slice(0, 0); // never saved: stays dirty
    tab.dirty = true;
    tab.recovered = true;
  }
  return drafts.length;
}

async function saveAll() {
  for (const tab of [...tabs]) if (tab.dirty || !tab.path) { const ok = await saveTab(tab); if (!ok) return; }
}

async function checkExternalChange() {
  const tab = active;
  if (!tab || !tab.path || !tab.mtimeMs) return;
  const st = await api.statFile(tab.path);
  if (!st.ok || Math.abs(st.mtimeMs - tab.mtimeMs) < 1) return;
  tab.mtimeMs = st.mtimeMs;
  if (tab.dirty) {
    const reload = await api.confirmReload(tabTitle(tab));
    if (!reload) return;
  }
  const r = await api.readFile(tab.path);
  if (!r.ok) return;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: r.text } });
  tab.savedDoc = view.state.doc; tab.dirty = false; tab.encoding = r.encoding; tab.eol = r.eol; tab.mtimeMs = r.mtimeMs;
  renderTabs(); updateTitle(); updateStatus();
}

async function requestClose() {
  for (const tab of [...tabs]) await flushPending(tab);
  for (const tab of [...tabs]) if (tab.dirty && !(await resolveUnsaved(tab))) return;
  api.closeConfirmed();
}

// ---------- notes: tabs follow their files ----------
/** Replace a tab's text with the smallest possible change, so the cursor stays where it is. */
function replaceDoc(tab, text) {
  const cur = docFor(tab).toString();
  if (cur === text) return;
  let a = 0;
  while (a < cur.length && a < text.length && cur[a] === text[a]) a++;
  let b = 0;
  while (b < cur.length - a && b < text.length - a && cur[cur.length - 1 - b] === text[text.length - 1 - b]) b++;
  const changes = { from: a, to: cur.length - b, insert: text.slice(a, text.length - b) };
  if (tab === active) view.dispatch({ changes, annotations: [] });
  else tab.state = tab.state.update({ changes }).state;
}

/** A file moved (renamed, moved to another project, archived, restored): the tab goes with it. */
async function followMove(from, to) {
  const fk = pathKey(from);
  for (const tab of tabs) {
    if (!tab.path) continue;
    const k = pathKey(tab.path);
    let next = null;
    if (k === fk) next = to;
    else if (k.startsWith(fk + SEP)) next = to + tab.path.slice(from.length);
    if (!next) continue;
    tab.path = next;
    tab.name = baseName(next);
    // The header line may have been rewritten (new project): take the text from disk.
    const r = await api.readFile(next);
    if (!r.ok) continue;
    if (!tab.dirty) {
      replaceDoc(tab, r.text);
      tab.savedDoc = docFor(tab);
      tab.dirty = false;
      clearTimeout(tab.autosaveTimer); tab.autosaveTimer = null;
    } else {
      // Unsaved edits stay; only the header line follows the file.
      const diskMeta = r.text.split('\n', 4).find((l) => /^(Projekt|Project): .* · (Skapad|Created): /.test(l));
      const doc = docFor(tab);
      for (let n = 1; n <= Math.min(3, doc.lines) && diskMeta; n++) {
        const line = doc.line(n);
        if (/^(Projekt|Project): .* · (Skapad|Created): /.test(line.text) && line.text !== diskMeta) {
          const changes = { from: line.from, to: line.to, insert: diskMeta };
          if (tab === active) view.dispatch({ changes }); else tab.state = tab.state.update({ changes }).state;
          break;
        }
      }
    }
    tab.mtimeMs = r.mtimeMs;
    tab.encoding = r.encoding;
    tab.eol = r.eol;
  }
}

/** Files that went to the Recycle Bin: their tabs close without asking. */
function dropDeleted(p) {
  const pk = pathKey(p);
  for (const tab of [...tabs]) {
    if (!tab.path) continue;
    const k = pathKey(tab.path);
    if (k !== pk && !k.startsWith(pk + SEP)) continue;
    clearTimeout(tab.autosaveTimer); clearTimeout(tab.draftTimer);
    const idx = tabs.indexOf(tab);
    tabs.splice(idx, 1);
    if (tab === active) {
      active = null;
      if (tabs.length) activateTab(tabs[Math.min(idx, tabs.length - 1)]); else newTab();
    }
  }
}

async function applyResult(r) {
  if (!r || typeof r !== 'object') return;
  for (const m of r.moved || []) await followMove(m.from, m.to);
  for (const d of r.deleted || []) dropDeleted(d);
  renderTabs(); updateTitle(); updateStatus();
}

async function flushAll() {
  if (active) active.state = view.state;
  for (const tab of [...tabs]) await flushPending(tab);
}

/** Archived notes are read-only until restored. */
function syncReadOnly(tab) {
  const info = noteInfo(tab);
  const ro = !!(info && info.archived);
  if (ro === tab.readOnly) return false;
  tab.readOnly = ro;
  if (tab === active) view.dispatch({ effects: reconfigureEffects(editorOpts(tab)) });
  else tab.state = tab.state.update({ effects: reconfigureEffects(editorOpts(tab)) }).state;
  return true;
}

function onTreeChanged() {
  for (const tab of tabs) syncReadOnly(tab);
  renderTabs(); updateTitle(); updateStatus(); renderNotesBanner();
}

/**
 * A note renamed from the sidebar: its heading on disk changed. A tab that still holds unsaved
 * text gets the new heading too, so saving it later does not rename the file back.
 */
function retitleTab(p, title) {
  const tab = findTab(p);
  if (!tab) return;
  tab.lastTitle = title;
  const line = docFor(tab).line(1);
  if (headingOf(line.text) === title) return;
  const insert = `# ${title}`;
  const changes = headingOf(line.text) === null ? { from: 0, insert: insert + '\n' } : { from: line.from, to: line.to, insert };
  if (tab === active) view.dispatch({ changes }); else tab.state = tab.state.update({ changes }).state;
  renderTabs(); updateTitle();
}

/** When the cursor leaves the title line, the file is renamed after the heading. */
async function maybeRenameNote(tab) {
  if (!tab || !tab.path || tab.readOnly || tab.discarded || !tabs.includes(tab)) return;
  const info = noteInfo(tab);
  if (!info || info.archived) return;
  const title = lineTitle(tab);
  if (title === null || title === tab.lastTitle) return;
  if (tab.renaming) { tab.renameAgain = true; return; }
  tab.renaming = true;
  try {
    // Never rename a file whose new text did not reach the disk.
    if (!(await flushPending(tab))) return;
    const r = await api.notes.call('renameForTitle', tab.path, title);
    if (r && !r.error) {
      tab.lastTitle = title;
      await applyResult(r);
      if (r.moved && r.moved.length) { sidebar.toast(t('notes.toastRenamed', { file: baseName(r.path) })); await sidebar.refresh(); }
    }
  } finally {
    tab.renaming = false;
    if (tab.renameAgain) { tab.renameAgain = false; void maybeRenameNote(tab); }
  }
}

async function inboxFolder() {
  if (!sidebar.inboxName()) await sidebar.refresh();
  return sidebar.inboxName();
}

/** The project of the note in the active tab, or Unsorted. */
async function currentFolder() {
  const info = noteInfo(active);
  if (info && !info.archived) return info.folder;
  return inboxFolder();
}

/** A new note in a project, from its default template unless opts.template names another. */
async function createNoteIn(folder, opts = {}) {
  if (!settings.notesRoot) { newTab(); return; }
  await flushAll();
  const r = await api.notes.call('createNote', folder || (await inboxFolder()), opts);
  if (!r || r.error) { sidebar.toast(t('notes.opFailed', { error: (r && (r.message || r.error)) || '?' })); return; }
  sidebar.expand(folder);
  await sidebar.refresh();
  await openPaths([r.path]);
  const tab = findTab(r.path);
  if (!tab) return;
  tab.pristine = r.text;
  tab.lastTitle = '';
  if (tab === active) { view.dispatch({ selection: { anchor: typeof r.cursor === 'number' ? r.cursor : 2 }, scrollIntoView: true }); view.focus(); }
  renderTabs(); sidebar.render();
}

async function openNote(p) {
  const tab = findTab(p);
  if (tab) activateTab(tab); else await openPaths([p]);
}

/**
 * Before a file moves: write the text its tab holds, so the moved file carries it. Without this a
 * note with unsaved text (autosave off, or a write still pending) moved as it was on disk, and a
 * new note kept only its heading and header line. False when the write failed: the file stays.
 */
async function saveBeforeMove(p) {
  const tab = findTab(p);
  if (!tab) return true;
  if (tab.dirty && !(await writeTab(tab))) return false;
  return flushPending(tab);
}

/** Move an untitled draft or a file from outside the notes folder into a project. */
async function moveTabToProject(tab, folder) {
  if (tab.path) {
    await sidebar.moveTo(tab.path, folder);
    return;
  }
  const r = await api.notes.call('createNote', folder, { text: docFor(tab).toString() });
  if (!r || r.error) { sidebar.toast(t('notes.opFailed', { error: (r && (r.message || r.error)) || '?' })); return; }
  replaceDoc(tab, r.text);
  tab.path = r.path; tab.name = baseName(r.path); tab.kind = 'md';
  tab.savedDoc = docFor(tab); tab.dirty = false; tab.recovered = false;
  tab.lastTitle = headingOf(r.text) || '';
  const st = await api.statFile(r.path);
  tab.mtimeMs = st.ok ? st.mtimeMs : null;
  await dropDraft(tab);
  await sidebar.refresh();
  renderTabs(); updateTitle(); updateStatus();
  sidebar.toast(t('notes.toastMoved', { project: sidebar.folderLabel(folder) }));
}

async function chooseNotesRoot() {
  const r = await api.notes.chooseRoot();
  if (!r) return;
  await sidebar.refresh();
  sidebar.toast(t('notes.folderChosen', { inbox: t('notes.inbox') }));
}

function renderNotesBanner() {
  const el = $('#notes-banner');
  if (!el) return;
  const info = noteInfo(active);
  if (!settings.notesRoot && !settings.notesBannerDismissed) {
    el.innerHTML = `<div class="nb-banner"><span class="grow">${esc(t('notes.banner'))}</span><button type="button" class="primary" data-nb="choose">${esc(t('notes.chooseFolder'))}</button><button type="button" data-nb="dismiss">${esc(t('notes.notNow'))}</button></div>`;
  } else if (info && info.archived) {
    el.innerHTML = `<div class="nb-banner"><span class="grow">${esc(t('notes.archivedBanner', { project: sidebar.folderLabel(info.folder) }))}</span><button type="button" class="primary" data-nb="restore">${esc(t('notes.restore'))}</button></div>`;
  } else el.innerHTML = '';
}

function applySidebarLayout() {
  document.body.classList.toggle('sb-open', !!settings.sidebarOpen);
  document.documentElement.style.setProperty('--sb-width', `${settings.sidebarWidth || 264}px`);
  $('#sb-toggle').classList.toggle('on', !!settings.sidebarOpen);
}

// ---------- status bar ----------
// Dropped first when the status bar is too narrow for everything. The cursor position, the file
// location and the mode button always stay.
const STATUS_DROP_ORDER = ['#st-chars', '#st-zoom', '#st-words', '#st-enc', '#st-sel'];
function fitStatus() {
  const bar = $('#statusbar');
  for (const sel of STATUS_DROP_ORDER) $(sel).classList.remove('st-drop');
  for (const sel of STATUS_DROP_ORDER) {
    if (bar.scrollWidth <= bar.clientWidth) break;
    $(sel).classList.add('st-drop');
  }
}

function updateStatus() {
  if (!active) return;
  const s = view.state;
  const main = s.selection.main;
  const line = s.doc.lineAt(main.head);
  $('#st-pos').textContent = t('ui.line', { line: line.number, col: main.head - line.from + 1 });
  const selLen = s.selection.ranges.reduce((n, r) => n + Math.abs(r.head - r.anchor), 0);
  $('#st-sel').textContent = selLen ? t('ui.selected', { n: selLen }) : '';
  $('#st-chars').textContent = t('ui.chars', { n: s.doc.length });
  $('#st-words').textContent = active.kind === 'md' ? t('ui.words', { n: countWords(s.doc.toString()) }) : '';
  $('#st-zoom').textContent = t('ui.zoom', { n: settings.zoom || 100 });
  $('#st-enc').textContent = encodingLabel(active.encoding);
  $('#st-kind').textContent = active.kind === 'md' ? t('ui.markdown') : t('ui.plainText');
  $('#st-kind').title = active.kind === 'md' ? t('ui.switchToText') : t('ui.switchToMarkdown');
  const words = countWords(s.doc.toString());
  $('#ft-words').textContent = t('ui.words', { n: words });
  const info = noteInfo(active);
  const stNote = $('#st-note');
  stNote.hidden = !info;
  if (info) {
    const where = info.archived ? `${t('notes.archiveTitle')} › ${sidebar.folderLabel(info.folder)}` : sidebar.folderLabel(info.folder);
    stNote.textContent = `${where} › ${active.name}`;
    stNote.title = active.path;
  }
  const state = active.recovered && active.dirty ? t('ui.recovered') : active.dirty ? t('ui.unsaved') : (active.path ? t('ui.saved') : '');
  $('#ft-status').textContent = [tabTitle(active), state].filter(Boolean).join(' · ');
  fitStatus();
}

function applyKindUi() {
  const md = active && active.kind === 'md';
  document.body.classList.toggle('no-formatting', !md);
  $('#view-mode').hidden = !md;
  const mode = md && !settings.writingMode ? settings.viewMode || 'editor' : 'editor';
  $('#main').dataset.view = mode;
  for (const b of $$('#view-mode button')) b.classList.toggle('active', b.dataset.mode === mode);
}

// ---------- settings application ----------
function applySettings(next, prev = {}) {
  settings = next;
  if (keys) keys.setOverrides(settings.keybindings);
  const root = document.documentElement.style;
  root.setProperty('--zoom-base', String((settings.zoom || 100) / 100));
  document.body.classList.toggle('writing', !!settings.writingMode);
  document.body.classList.toggle('narrow', settings.narrowColumn !== false);
  if (prev.effects !== settings.effects || prev.viewMode !== settings.viewMode || prev.cursorEffect !== settings.cursorEffect) applyEffects();
  root.setProperty('--editor-font', `"${settings.fontFamily || 'Consolas'}", Consolas, "Cascadia Mono", monospace`);
  root.setProperty('--editor-size', `${settings.fontSize || 15}px`);
  document.body.classList.toggle('no-statusbar', settings.statusBar === false);
  document.body.classList.toggle('no-formatting-bar', settings.formattingBar === false);
  applySidebarLayout();
  const newLocale = settings.language && settings.language !== 'auto' ? settings.language : (prev.__locale || locale);
  if (settings.language === 'auto' && prev.language && prev.language !== 'auto') {
    // Falling back to the system locale requires the main process' answer; reuse bootstrap locale.
    locale = bootLocale;
  } else locale = newLocale;
  t = makeT(locale);
  applyI18n();
  if (themes) themes.refresh();
  if (view) {
    const reconfigure = prev.wordWrap !== settings.wordWrap || prev.lineNumbers !== settings.lineNumbers || prev.language !== settings.language || prev.hideMarkers !== settings.hideMarkers || prev.spellcheck !== settings.spellcheck;
    if (reconfigure) reconfigureAll();
    applyKindUi();
    updateStatus();
    updateTitle();
    renderTabs();
    preview.schedule(0);
    updates.render();
    if (settingsDialog) settingsDialog.refresh();
    if (sidebar && prev.notesRoot !== settings.notesRoot) void sidebar.refresh();
    renderNotesBanner();
  }
}

function reconfigureAll() {
  for (const tab of tabs) {
    if (tab === active) view.dispatch({ effects: reconfigureEffects(editorOpts(tab)) });
    else tab.state = tab.state.update({ effects: reconfigureEffects(editorOpts(tab)) }).state;
  }
}

function applyI18n() {
  document.documentElement.lang = locale;
  for (const el of $$('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of $$('[data-i18n-title]')) { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', el.title); }
  $('#tabbar').setAttribute('aria-label', t('ui.newTab'));
  for (const el of $$('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  if (sidebar) sidebar.applyI18n();
}

function setZoom(z) {
  const zoom = Math.max(10, Math.min(500, Math.round(z / 10) * 10));
  void api.setSettings({ zoom });
}

function insertTimeDate() {
  const now = new Date();
  const time = now.toLocaleTimeString(locale === 'sv' ? 'sv-SE' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString(locale === 'sv' ? 'sv-SE' : 'en-US');
  fmt.insertAtCursor(view, `${time} ${date}`);
}

function ensureEditorVisible() {
  if ($('#main').dataset.view === 'preview') void api.setSettings({ viewMode: 'split' });
}

// ---------- menu / actions ----------
async function handleAction(action, payload) {
  switch (action) {
    case 'new': if (settings.notesRoot) await createNoteIn(await inboxFolder()); else newTab(); break;
    case 'newNoteInProject': if (settings.notesRoot) await createNoteIn(await currentFolder()); else newTab(); break;
    case 'newProject':
      if (!settings.notesRoot) await chooseNotesRoot();
      else if (settings.sidebarOpen && !settings.writingMode) sidebar.startNewProject();
      else await dialogs.projectName();
      break;
    case 'archiveNote': { const info = noteInfo(active); if (info && !info.archived) await sidebar.archiveNote(active.path); break; }
    case 'chooseNotesFolder': await chooseNotesRoot(); break;
    case 'toggleSidebar': await api.setSettings({ sidebarOpen: !settings.sidebarOpen }); break;
    case 'searchNotes': sidebar.openSearch(); break;
    case 'newFromTemplate': {
      // In the current project with that template; before a notes folder exists, a loose tab.
      if (settings.notesRoot) { await createNoteIn(await currentFolder(), { template: payload }); break; }
      if (payload !== BUILTIN) break;
      const text = fillPlaceholders(standupTemplate(t, locale));
      newTab({ text });
      view.dispatch({ selection: { anchor: cursorAfterHeading(text, 1) } });
      view.focus();
      break;
    }
    case 'applyTemplate': {
      // The template's text, placeholders filled, where the cursor is (replacing a selection).
      if (!active || active.readOnly) break;
      const tpl = settings.notesRoot ? await api.notes.call('readTemplate', payload)
        : payload === BUILTIN ? standupTemplate(t, locale) : null;
      if (typeof tpl !== 'string') break;
      const info = noteInfo(active);
      const text = fillPlaceholders(tpl.replace(/\r\n/g, '\n'), { project: info && !info.archived ? info.folder : '' });
      const { from, to } = view.state.selection.main;
      view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, scrollIntoView: true });
      view.focus();
      preview.schedule(0);
      break;
    }
    case 'open': await openDialog(); break;
    case 'openPaths': await openPaths(payload || []); break;
    case 'save': await saveTab(active); break;
    case 'saveAs': await saveTab(active, true); break;
    case 'saveAll': await saveAll(); break;
    case 'closeTab':
      // Closing the only tab closes the window, like a browser. requestClose still asks about unsaved text.
      if (tabs.length === 1) await api.closeWindow();
      else await closeTab(active);
      break;
    case 'print': preview.print(); break;
    case 'undo': undo(view); view.focus(); break;
    case 'redo': redo(view); view.focus(); break;
    case 'delete': deleteCharForward(view); view.focus(); break;
    case 'selectAll': selectAll(view); view.focus(); break;
    case 'find': ensureEditorVisible(); openSearchPanel(view); break;
    case 'findNext': ensureEditorVisible(); findNext(view); break;
    case 'findPrevious': ensureEditorVisible(); findPrevious(view); break;
    case 'replace': {
      ensureEditorVisible(); openSearchPanel(view);
      const f = view.dom.querySelector('.cm-search input[name="replace"]');
      if (f) f.focus();
      break;
    }
    case 'goTo': ensureEditorVisible(); gotoLine(view); break;
    case 'timeDate': if (!active.readOnly) insertTimeDate(); break;
    case 'font': await dialogs.font(); break;
    case 'zoomIn': setZoom((settings.zoom || 100) + 10); break;
    case 'zoomOut': setZoom((settings.zoom || 100) - 10); break;
    case 'zoomReset': setZoom(100); break;
    case 'nextTab': cycleTab(1); break;
    case 'writingMode': await api.setSettings({ writingMode: !settings.writingMode }); break;
    case 'fullscreen': await api.toggleFullscreen(); break;
    case 'shortcuts': dialogs.shortcuts(); break;
    case 'moveLineUp': case 'moveLineDown': case 'copyLineUp': case 'copyLineDown': case 'deleteLine': case 'selectLine':
    case 'insertLineBelow': case 'insertLineAbove': case 'selectNextOccurrence': case 'selectAllOccurrences':
    case 'addCursorAbove': case 'addCursorBelow': case 'indentLine': case 'outdentLine':
      if (active.readOnly) break;
      ensureEditorVisible(); lineCommands[action](view); view.focus(); break;
    case 'prevTab': cycleTab(-1); break;
    case 'newWindow': api.newWindow(); break;
    case 'closeWindow': await api.closeWindow(); break;
    case 'goToTab1': case 'goToTab2': case 'goToTab3': case 'goToTab4': case 'goToTab5':
    case 'goToTab6': case 'goToTab7': case 'goToTab8': case 'goToTab9': {
      const tab = tabs[Number(action.slice(-1)) - 1];
      if (tab && tab !== active) activateTab(tab);
      break;
    }
    case 'exit': await api.quit(); break;
    case 'settings': settingsDialog.open('general'); break;
    case 'keyboardSettings': settingsDialog.open('keyboard'); break;
    case 'viewEditor': await api.setSettings({ viewMode: 'editor' }); break;
    case 'viewSplit': await api.setSettings({ viewMode: 'split' }); break;
    case 'viewPreview': await api.setSettings({ viewMode: 'preview' }); break;
    case 'wordWrap': case 'lineNumbers': case 'formattingBar': case 'statusBar': case 'spellcheck':
      await api.setSettings({ [action]: !settings[action] }); break;
    case 'hideMarkers': case 'autosave': case 'narrowColumn': case 'effects':
      await api.setSettings({ [action]: settings[action] === false }); break;
    case 'cut': case 'copy': case 'paste': await api.nativeEdit(action); break;
    case 'checkForUpdates': await api.checkForUpdates(true); break;
    case 'commandPalette': palette.openCommands(); break;
    case 'pickTheme': await palette.pickTheme(); break;
    case 'pickCursorEffect': palette.pickCursorEffect(); break;
    case 'newThemeFromCurrent': palette.newTheme(); break;
    case 'openThemesFolder': await api.openThemesFolder(); break;
    case 'importVsCodeTheme': await palette.importVsCode(); break;
    case 'openSettingsJson': await openPaths([settingsFile || await api.settingsPath()]); break;
    case 'about': await api.about(); break;
    default:
      if (!runFormat(action)) console.warn('unknown action', action);
  }
}

function bindUi() {
  $('#tab-add').addEventListener('click', () => void handleAction('new'));
  $('#sb-toggle').innerHTML = ICONS.sidebar;
  $('#sb-close').innerHTML = ICONS.back;
  for (const el of $$('.sb-search-ico')) el.innerHTML = ICONS.search;
  $('#sb-toggle').addEventListener('click', () => void handleAction('toggleSidebar'));
  $('#sb-close').addEventListener('click', () => void handleAction('toggleSidebar'));
  $('#st-note').addEventListener('click', () => { if (active && active.path) void sidebar.reveal(active.path); });
  $('#notes-banner').addEventListener('click', (e) => {
    const b = e.target.closest('[data-nb]');
    if (!b) return;
    if (b.dataset.nb === 'choose') void chooseNotesRoot();
    else if (b.dataset.nb === 'dismiss') void api.setSettings({ notesBannerDismissed: true });
    else if (b.dataset.nb === 'restore' && active && active.path) void sidebar.restoreNote(active.path);
  });
  for (const b of $$('#toolbar [data-action]')) {
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep editor focus
    b.addEventListener('click', () => { popups.hide(); runFormat(b.dataset.action); });
  }
  for (const b of $$('.tb-drop')) {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => { e.stopPropagation(); popups.toggleToolbarPopup(b); });
  }
  for (const b of $$('#view-mode button')) b.addEventListener('click', () => api.setSettings({ viewMode: b.dataset.mode }));
  for (const b of $$('#footer [data-action]')) b.addEventListener('click', () => void handleAction(b.dataset.action));

  $('#st-zoom').addEventListener('click', () => setZoom(100));
  $('#st-enc').addEventListener('click', (e) => popups.show(e.currentTarget, ENCODINGS.map((enc) => ({
    label: encodingLabel(enc), checked: active.encoding === enc, onClick: () => { active.encoding = enc; markDirty(); }
  }))));
  $('#st-kind').addEventListener('click', () => {
    active.kind = active.kind === 'md' ? 'txt' : 'md';
    view.dispatch({ effects: reconfigureEffects(editorOpts(active)) });
    applyKindUi(); updateStatus(); preview.schedule(0);
    view.focus();
  });

  // Ctrl+wheel zoom like Notepad.
  window.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom((settings.zoom || 100) + (e.deltaY < 0 ? 10 : -10));
  }, { passive: false });

  // Drag and drop files.
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; $('#drop-overlay').hidden = false; } });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop-overlay').hidden = true; } });
  window.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    dragDepth = 0; $('#drop-overlay').hidden = true;
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;
    e.preventDefault();
    void openPaths(files.map((f) => api.pathForFile(f)).filter(Boolean));
  });

  // Links in the preview open in the system browser.
  $('#preview').addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute('href');
    if (/^https?:|^mailto:/i.test(href)) api.openExternal(href);
  });
  $('#preview-pane').addEventListener('dblclick', () => { if (active?.kind === 'md') void api.setSettings({ viewMode: 'split' }); });

  window.addEventListener('focus', () => { void checkExternalChange(); if (sidebar) void sidebar.refresh(); });
  window.addEventListener('blur', () => { if (active) void maybeRenameNote(active); });
  api.notes.onChanged(async (ev) => { await applyResult(ev); await sidebar.refresh(); });
  api.onThemeChanged((msg) => applyTheme(msg));

  api.onMenu((action, payload) => void handleAction(action, payload));
  api.onOpenFiles((paths) => void openPaths(paths));
  api.onRequestClose(() => void requestClose());
  api.onSettingsChanged((next) => applySettings(next, settings));
}

// Before an update restarts the app: save or keep everything. Named files are saved (or the user
// is asked, when autosave is off); untitled text is kept as a draft and comes back after restart.
async function prepareQuit(id) {
  let ok = true;
  try {
    if (active) active.state = view.state;
    for (const tab of [...tabs]) await flushPending(tab);
    for (const tab of [...tabs]) if (!tab.path && tab.dirty) await writeDraft(tab);
    for (const tab of [...tabs]) {
      if (tab.path && tab.dirty && !(await resolveUnsaved(tab))) { ok = false; break; }
    }
  } finally {
    api.prepareQuitResult(id, ok);
  }
}

/**
 * The theme's effects, unless the Theme effects switch is off, and the cursor effect: the user's
 * setting, or `cursorEffect` while the picker previews one.
 * @param {string} [cursorEffect]
 */
function applyEffects(cursorEffect = settings.cursorEffect) {
  if (!themes) return;
  if (!effects) effects = createEffects();
  effects.update({ notera: themes.notera, read: themes.read, type: themes.type, enabled: settings.effects !== false, view: settings.viewMode || 'editor', cursorEffect });
}

/** While the cursor effect picker highlights an effect, it runs at the cursor now and then. */
const EFFECT_DEMO_MS = 900;
let effectDemo = 0;
function previewCursorEffect(id) {
  stopEffectDemo();
  applyEffects(id);
  const demo = () => demoCursorEffect(view);
  demo();
  effectDemo = window.setInterval(demo, EFFECT_DEMO_MS);
}
function stopEffectDemo() { clearInterval(effectDemo); effectDemo = 0; }

/** The cursor effect the current theme suggests, or null; shown next to "Theme's choice". */
function themeCursorEffect() {
  if (!themes || settings.effects === false) return null;
  const fx = normalizeEffects(themes.notera && themes.notera.effects).typing;
  return fx ? fx.id : null;
}

// The theme and its mode come from main as one message (see themeApply.js). CodeMirror only needs
// reconfiguring when the variant on screen flips between light and dark.
function applyTheme(msg) {
  themeMsg = msg;
  paintTheme(msg);
  // Only for main's messages: a preview (the Theme tab's, many a second while a slider is dragged)
  // must not re-render the settings dialog under the control being dragged.
  void api.listThemes().then((list) => { themeList = list; if (settingsDialog) settingsDialog.refresh(); });
}

/** Paint a theme message: main's, or a preview from the theme picker. */
function paintTheme(msg) {
  if (!themes) themes = createThemeApplier({ t: () => t, openFolder: () => void api.openThemesFolder() });
  const flipped = themes.apply(msg);
  isDark = themes.isDark();
  if (view && flipped) reconfigureAll();
  applyEffects();
}

function markDirty() {
  if (!active) return;
  active.dirty = true;
  renderTabs(); updateTitle(); updateStatus();
}

// ---------- boot ----------
let bootLocale = 'en';
let keys = null;
let settingsDialog = null;
let sidebar = null;
async function boot() {
  const b = await api.bootstrap();
  keys = createKeyDispatcher({ run: (id) => void handleAction(id) });
  bootLocale = b.locale;
  locale = b.locale;
  applyTheme(b.theme);
  view = new EditorView({
    parent: $('#editor'),
    state: EditorState.create({ doc: '' }),
    dispatchTransactions: (trs, v) => {
      v.update(trs);
      if (!active) return;
      const docChanged = trs.some((tr) => tr.docChanged);
      if (docChanged) {
        const dirty = !v.state.doc.eq(active.savedDoc);
        if (dirty !== active.dirty) { active.dirty = dirty; renderTabs(); updateTitle(); }
        if (dirty) scheduleAutosave(active);
        preview.schedule();
        if (trs.some((tr) => tr.docChanged && tr.changes.touchesRange(0, tr.startState.doc.line(1).to))) {
          renderTabs(); updateTitle(); if (sidebar) sidebar.renderTitles();
        }
      }
      if (docChanged || trs.some((tr) => tr.selection)) {
        updateStatus();
        const onTitle = v.state.doc.lineAt(v.state.selection.main.head).number === 1;
        if (active.onTitle && !onTitle) void maybeRenameNote(active);
        active.onTitle = onTitle;
      }
    }
  });
  view.scrollDOM.addEventListener('scroll', preview.syncScroll, { passive: true });
  settingsDialog = createSettingsDialog({
    t: (...a) => t(...a), api, getSettings: () => settings, getThemes: () => themeList, cursorEffectChoices: () => palette.cursorEffectChoices(), openFontDialog: dialogs.font,
    previewTheme: (msg) => paintTheme(msg), restoreTheme: () => { if (themeMsg) paintTheme(themeMsg); }, isDark: () => document.documentElement.dataset.theme === 'dark', version: b.version, chooseNotesRoot: () => chooseNotesRoot(),
    onClose: () => view.focus()
  });
  settingsFile = await api.settingsPath();
  palette = createPalette({
    t: () => t, api, getSettings: () => settings, run: (id) => handleAction(id), focusEditor: () => view.focus(),
    previewTheme: (msg) => paintTheme(msg), restoreTheme: () => { if (themeMsg) paintTheme(themeMsg); },
    cursorEffects: CURSOR_EFFECT_IDS, themeCursorEffect, previewCursorEffect, restoreCursorEffect: () => { stopEffectDemo(); applyEffects(); },
    openPaths: (paths) => openPaths(paths), notice: (text) => themes.notice(text)
  });
  sidebar = createSidebar({
    api, t: () => t, settings: () => settings, pathKey,
    liveTitle: (p) => { const tab = findTab(p); return tab ? lineTitle(tab) : null; },
    activePath: () => (active ? active.path : null),
    flush: flushAll, saveBeforeMove, applyResult, onTreeChanged, openNote, createNote: createNoteIn, chooseRoot: chooseNotesRoot,
    promptProjectName: dialogs.projectName, moveTabToProject, closeTab: (tab) => closeTab(tab), retitleTab,
    tabsToClose, closeTabs,
    focusEditor: () => view.focus(),
    sidebarVisible: () => !!settings.sidebarOpen && !settings.writingMode,
    showSidebar: async () => { if (settings.writingMode) await api.setSettings({ writingMode: false }); if (!settings.sidebarOpen) await api.setSettings({ sidebarOpen: true }); },
    shortcutLabel: (id) => display((keys.bindings()[id] || [])[0] || '')
  });
  bindUi();
  new ResizeObserver(fitStatus).observe($('#statusbar'));
  api.onPrepareQuit((id) => void prepareQuit(id));
  applySettings(b.settings, { __locale: b.locale });
  if (b.update) updates.onStatus(b.update);
  const restored = b.restoreDrafts ? await restoreDrafts() : 0;
  if (b.filesToOpen.length) { await openPaths(b.filesToOpen); if (!tabs.length) newTab(); }
  else if (b.pendingTab) {
    const drafts = await api.listDrafts();
    const d = drafts.find((x) => x.id === b.pendingTab);
    if (d && d.text && d.text.trim()) newTab({ text: d.text, kind: d.kind || 'md', draftId: d.id });
    else newTab();
  }
  else if (restored) activateTab(tabs[0]);
  else newTab();
  await sidebar.refresh();
  sidebar.applyI18n();
  renderNotesBanner();
  window.__notera = { get tabs() { return tabs; }, get active() { return active; }, get view() { return view; }, get settings() { return settings; }, get update() { return updates.state; }, get sidebar() { return sidebar; }, get theme() { return themes && themes.current; }, handleAction, openPaths, keys };
}

void boot();
