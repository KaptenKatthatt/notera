import { makeT, LOCALES } from '../shared/strings.js';
import { createState, reconfigureEffects, EditorView, EditorState } from './editor.js';
import * as fmt from './format.js';
import { lineCommands } from './lines.js';
import { renderMarkdown, countWords } from './markdown.js';
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
const platformEol = api.platform === 'win32' ? 'CRLF' : 'LF';
const ENCODINGS = ['utf8', 'utf8bom', 'utf16le', 'utf16be', 'ansi'];

// ---------- helpers ----------
function editorOpts(tab) {
  return {
    kind: tab.kind,
    wordWrap: settings.wordWrap !== false,
    lineNumbers: !!settings.lineNumbers,
    dark: isDark,
    phrases: LOCALES[locale].search,
    extraKeys: formatKeymap,
    hideMarkers: settings.hideMarkers !== false,
    placeholder: tab.kind === 'md' ? t('ui.startWriting') : ''
  };
}

const formatKeymap = [
  { key: 'Mod-b', run: (v) => runFormat('bold', v) },
  { key: 'Mod-i', run: (v) => runFormat('italic', v) },
  { key: 'Mod-Shift-x', run: (v) => runFormat('strikethrough', v) },
  { key: 'Mod-1', run: (v) => runFormat('heading1', v) },
  { key: 'Mod-2', run: (v) => runFormat('heading2', v) },
  { key: 'Mod-3', run: (v) => runFormat('heading3', v) },
  { key: 'Mod-Shift-8', run: (v) => runFormat('bulletList', v) },
  { key: 'Mod-Shift-7', run: (v) => runFormat('numberedList', v) },
  { key: 'Mod-Shift-9', run: (v) => runFormat('checkList', v) },
  { key: 'Mod-Shift-.', run: (v) => runFormat('quote', v) },
  { key: 'Mod-e', run: (v) => runFormat('code', v) },
  { key: 'Mod-Shift-e', run: (v) => runFormat('codeBlock', v) },
  { key: 'Mod-k', run: (v) => runFormat('link', v) }
];

function runFormat(action, v = view) {
  if (!active || active.kind !== 'md') return true; // swallow, but do nothing for plain text
  switch (action) {
    case 'bold': return fmt.toggleInline(v, '**');
    case 'italic': return fmt.toggleInline(v, '*');
    case 'strikethrough': return fmt.toggleInline(v, '~~');
    case 'code': return fmt.toggleInline(v, '`');
    case 'heading1': return fmt.toggleLinePrefix(v, 'h1');
    case 'heading2': return fmt.toggleLinePrefix(v, 'h2');
    case 'heading3': return fmt.toggleLinePrefix(v, 'h3');
    case 'bulletList': return fmt.toggleLinePrefix(v, 'bullet');
    case 'numberedList': return fmt.toggleLinePrefix(v, 'number');
    case 'checkList': return fmt.toggleLinePrefix(v, 'check');
    case 'quote': return fmt.toggleLinePrefix(v, 'quote');
    case 'codeBlock': return fmt.toggleCodeBlock(v);
    case 'horizontalRule': fmt.insertBlock(v, '---'); return true;
    case 'table': fmt.insertBlock(v, fmt.TABLE_TEMPLATE); return true;
    case 'link': void insertLinkSmart(); return true;
    default: return false;
  }
}

function suggestedName(tab) {
  const firstLine = tab.state.doc.toString().split('\n').find((l) => l.trim().length > 0) || '';
  const cleaned = firstLine.replace(/^[#>\-*\s\d.]+/, '').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 40).trim();
  return cleaned || t('untitled');
}

function tabTitle(tab) { return tab.name || t('untitled'); }

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
    draftTimer: null
  };
  tab.state = createState(init.text || '', editorOpts(tab));
  tab.savedDoc = tab.state.doc;
  tabs.push(tab);
  return tab;
}

function activateTab(tab) {
  if (active && active !== tab) { active.state = view.state; void flushPending(active); }
  active = tab;
  view.setState(tab.state);
  // A fresh state may have stale compartment config if settings changed while inactive.
  view.dispatch({ effects: reconfigureEffects(editorOpts(tab)) });
  renderTabs();
  applyKindUi();
  updateStatus();
  updateTitle();
  schedulePreview(0);
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
    host.appendChild(el);
  }
  const activeEl = host.querySelector('.tab.active');
  if (activeEl) activeEl.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

function newTab(init) {
  const tab = makeTab(init);
  activateTab(tab);
  return tab;
}

async function closeTab(tab) {
  if (tab.dirty) {
    activateTab(tab);
    const answer = await api.confirmUnsaved(tabTitle(tab));
    if (answer === 'cancel') return false;
    if (answer === 'save') { const ok = await saveTab(tab); if (!ok) return false; }
  }
  clearTimeout(tab.autosaveTimer);
  await dropDraft(tab);
  const idx = tabs.indexOf(tab);
  tabs.splice(idx, 1);
  if (tabs.length === 0) newTab();
  else if (tab === active) activateTab(tabs[Math.min(idx, tabs.length - 1)]);
  else renderTabs();
  return true;
}

function cycleTab(delta) {
  if (tabs.length < 2) return;
  const idx = tabs.indexOf(active);
  activateTab(tabs[(idx + delta + tabs.length) % tabs.length]);
}

// ---------- files ----------
async function openPaths(paths) {
  for (const p of paths) {
    const existing = tabs.find((x) => x.path === p);
    if (existing) { activateTab(existing); continue; }
    const r = await api.readFile(p);
    if (!r.ok) { await api.showError({ kind: 'read', name: r.name, detail: r.error }); continue; }
    // Replace a pristine untitled tab, like Notepad does.
    if (active && !active.path && !active.dirty && active.state.doc.length === 0 && tabs.length === 1) {
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

/** Write a tab that already has a path, without touching which tab is active. */
async function writeTab(tab) {
  clearTimeout(tab.autosaveTimer); tab.autosaveTimer = null;
  const doc = docFor(tab);
  const r = await api.writeFile({ path: tab.path, text: doc.toString(), encoding: tab.encoding, eol: tab.eol });
  if (!r.ok) { await api.showError({ kind: 'write', name: r.name, detail: r.error }); return false; }
  tab.name = r.name; tab.mtimeMs = r.mtimeMs;
  tab.savedDoc = doc;
  tab.dirty = !docFor(tab).eq(doc);
  tab.lastSavedAt = Date.now();
  renderTabs(); updateTitle(); updateStatus();
  return true;
}

async function saveTab(tab, forceAs = false) {
  if (tab.path && !forceAs) return writeTab(tab);
  if (tab !== active) activateTab(tab);
  const target = await api.saveAsDialog({ currentPath: tab.path, suggestedName: suggestedName(tab), kind: tab.kind });
  if (!target) return false;
  const text = view.state.doc.toString();
  const r = await api.writeFile({ path: target, text, encoding: tab.encoding, eol: tab.eol });
  if (!r.ok) { await api.showError({ kind: 'write', name: r.name, detail: r.error }); return false; }
  const kindChanged = r.kind !== tab.kind;
  tab.path = r.path; tab.name = r.name; tab.kind = r.kind; tab.mtimeMs = r.mtimeMs;
  tab.savedDoc = view.state.doc;
  tab.dirty = false;
  tab.lastSavedAt = Date.now();
  void dropDraft(tab);
  if (kindChanged) { view.dispatch({ effects: reconfigureEffects(editorOpts(tab)) }); applyKindUi(); }
  renderTabs(); updateTitle(); updateStatus();
  return true;
}

// ---------- autosave + drafts (Omawrite: it saves as you type, and recovers unsaved text) ----------
function scheduleAutosave(tab) {
  if (tab.path) {
    if (settings.autosave === false) return;
    clearTimeout(tab.autosaveTimer);
    tab.autosaveTimer = setTimeout(() => { if (tab.dirty) void writeTab(tab); }, 800);
  } else {
    clearTimeout(tab.draftTimer);
    tab.draftTimer = setTimeout(() => void writeDraft(tab), 1000);
  }
}

async function writeDraft(tab) {
  const text = docFor(tab).toString();
  if (!text.trim()) { await dropDraft(tab); return; }
  if (!tab.draftId) tab.draftId = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  await api.writeDraft({ id: tab.draftId, text, kind: tab.kind });
}

async function dropDraft(tab) {
  clearTimeout(tab.draftTimer); tab.draftTimer = null;
  if (!tab.draftId) return;
  const id = tab.draftId; tab.draftId = null;
  await api.deleteDraft(id);
}

async function flushPending(tab) {
  if (tab.autosaveTimer && tab.path && tab.dirty) await writeTab(tab);
  if (tab.draftTimer && !tab.path) await writeDraft(tab);
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
  for (const tab of [...tabs]) {
    if (!tab.dirty) continue;
    activateTab(tab);
    const answer = await api.confirmUnsaved(tabTitle(tab));
    if (answer === 'cancel') return;
    if (answer === 'save') { const ok = await saveTab(tab); if (!ok) return; }
  }
  api.closeConfirmed();
}

// ---------- status bar ----------
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
  $('#st-eol').textContent = active.eol === 'CRLF' ? t('ui.crlf') : t('ui.lf');
  $('#st-enc').textContent = encodingLabel(active.encoding);
  $('#st-kind').textContent = active.kind === 'md' ? t('ui.markdown') : t('ui.plainText');
  $('#st-kind').title = active.kind === 'md' ? t('ui.switchToText') : t('ui.switchToMarkdown');
  const words = countWords(s.doc.toString());
  $('#ft-words').textContent = t('ui.words', { n: words });
  const state = active.recovered && active.dirty ? t('ui.recovered') : active.dirty ? t('ui.unsaved') : (active.path ? t('ui.saved') : '');
  $('#ft-status').textContent = [tabTitle(active), state].filter(Boolean).join(' · ');
}

function applyKindUi() {
  const md = active && active.kind === 'md';
  document.body.classList.toggle('no-formatting', !md);
  $('#view-mode').hidden = !md;
  const mode = md && !settings.writingMode ? settings.viewMode || 'editor' : 'editor';
  $('#main').dataset.view = mode;
  for (const b of $$('#view-mode button')) b.classList.toggle('active', b.dataset.mode === mode);
}

// ---------- preview ----------
let previewTimer = null;
function schedulePreview(delay = 150) {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, delay);
}
function renderPreview() {
  if (!active) return;
  const mode = $('#main').dataset.view;
  if (mode === 'editor' || active.kind !== 'md') return;
  const text = view.state.doc.toString();
  const el = $('#preview');
  if (!text.trim()) { el.classList.add('empty'); el.textContent = t('ui.emptyPreview'); return; }
  el.classList.remove('empty');
  el.innerHTML = renderMarkdown(text);
}
function syncPreviewScroll() {
  const pane = $('#preview-pane');
  if ($('#main').dataset.view !== 'split') return;
  const sc = view.scrollDOM;
  const max = sc.scrollHeight - sc.clientHeight;
  if (max <= 0) return;
  const ratio = sc.scrollTop / max;
  pane.scrollTop = ratio * (pane.scrollHeight - pane.clientHeight);
}

// ---------- settings application ----------
function applySettings(next, prev = {}) {
  settings = next;
  const root = document.documentElement.style;
  root.setProperty('--zoom-base', String((settings.zoom || 100) / 100));
  document.body.classList.toggle('writing', !!settings.writingMode);
  root.setProperty('--editor-font', `"${settings.fontFamily || 'Consolas'}", Consolas, "Cascadia Mono", monospace`);
  root.setProperty('--editor-size', `${settings.fontSize || 15}px`);
  document.body.classList.toggle('no-statusbar', settings.statusBar === false);
  document.body.classList.toggle('no-formatting-bar', settings.formattingBar === false);
  const newLocale = settings.language && settings.language !== 'auto' ? settings.language : (prev.__locale || locale);
  if (settings.language === 'auto' && prev.language && prev.language !== 'auto') {
    // Falling back to the system locale requires the main process' answer; reuse bootstrap locale.
    locale = bootLocale;
  } else locale = newLocale;
  t = makeT(locale);
  applyI18n();
  if (view) {
    const reconfigure = prev.wordWrap !== settings.wordWrap || prev.lineNumbers !== settings.lineNumbers || prev.language !== settings.language || prev.hideMarkers !== settings.hideMarkers;
    if (reconfigure) reconfigureAll();
    applyKindUi();
    updateStatus();
    updateTitle();
    renderTabs();
    schedulePreview(0);
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
}

function setZoom(z) {
  const zoom = Math.max(10, Math.min(500, Math.round(z / 10) * 10));
  void api.setSettings({ zoom });
}

// ---------- popup menus (status bar) ----------
function showPopup(anchor, items) {
  const menu = $('#popup-menu');
  menu.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button');
    b.textContent = it.label;
    b.classList.toggle('checked', !!it.checked);
    b.addEventListener('click', () => { hidePopup(); it.onClick(); });
    menu.appendChild(b);
  }
  menu.hidden = false;
  const r = anchor.getBoundingClientRect();
  menu.style.left = `${Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)}px`;
  menu.style.top = `${r.top - menu.offsetHeight - 4}px`;
  setTimeout(() => document.addEventListener('mousedown', onDocMouseDown), 0);
}
function hidePopup() {
  const menu = $('#popup-menu');
  const wasOpen = !menu.hidden;
  menu.hidden = true;
  document.removeEventListener('mousedown', onDocMouseDown);
  closeToolbarPopups();
  if (wasOpen && view) view.focus();
}
function onDocMouseDown(e) { if (!$('#popup-menu').contains(e.target) && !e.target.closest('.tb-popup')) hidePopup(); }
function closeToolbarPopups() {
  for (const p of $$('.tb-popup')) p.classList.remove('open');
  for (const b of $$('.tb-drop')) b.setAttribute('aria-expanded', 'false');
}

// ---------- dialogs ----------
async function openFontDialog() {
  const dlg = $('#dlg-font');
  const sel = $('#font-family');
  const size = $('#font-size');
  const preview = $('#font-preview');
  let families = ['Consolas', 'Cascadia Mono', 'Cascadia Code', 'Courier New', 'Lucida Console', 'Segoe UI', 'Calibri', 'Arial', 'Times New Roman', 'Georgia', 'Verdana'];
  try {
    if (window.queryLocalFonts) {
      const fonts = await window.queryLocalFonts();
      const set = new Set(fonts.map((f) => f.family));
      if (set.size) families = Array.from(set).sort((a, b) => a.localeCompare(b));
    }
  } catch { /* permission denied or unsupported: keep fallback list */ }
  if (!families.includes(settings.fontFamily)) families.unshift(settings.fontFamily);
  sel.innerHTML = '';
  for (const f of families) { const o = document.createElement('option'); o.value = f; o.textContent = f; o.style.fontFamily = `"${f}"`; sel.appendChild(o); }
  sel.value = settings.fontFamily;
  size.value = settings.fontSize;
  const updatePreview = () => { preview.style.fontFamily = `"${sel.value}"`; preview.style.fontSize = `${size.value}px`; };
  sel.oninput = updatePreview; size.oninput = updatePreview; updatePreview();
  dlg.returnValue = '';
  dlg.showModal();
  await new Promise((res) => dlg.addEventListener('close', res, { once: true }));
  if (dlg.returnValue === 'ok') {
    const fontSize = Math.max(6, Math.min(72, parseInt(size.value, 10) || 15));
    await api.setSettings({ fontFamily: sel.value, fontSize });
  }
  view.focus();
}

async function insertLinkSmart() {
  const clip = ((await api.clipboardText()) || '').trim();
  const range = view.state.selection.main;
  const selected = view.state.doc.sliceString(range.from, range.to).trim();
  if (/^https?:\/\/\S+$/i.test(clip) && selected) { fmt.insertLink(view, selected, clip); return; }
  await openLinkDialog(/^https?:\/\/\S+$/i.test(clip) ? clip : '');
}

async function openLinkDialog(prefillUrl = '') {
  const dlg = $('#dlg-link');
  const text = $('#link-text'), url = $('#link-url');
  const range = view.state.selection.main;
  const selected = view.state.doc.sliceString(range.from, range.to);
  if (/^https?:\/\//i.test(selected)) { text.value = ''; url.value = selected; } else { text.value = selected; url.value = prefillUrl; }
  dlg.returnValue = '';
  dlg.showModal();
  (text.value ? url : text).focus();
  await new Promise((res) => dlg.addEventListener('close', res, { once: true }));
  if (dlg.returnValue === 'ok' && url.value.trim()) fmt.insertLink(view, text.value.trim(), url.value.trim());
  view.focus();
}

function insertTimeDate() {
  const now = new Date();
  const time = now.toLocaleTimeString(locale === 'sv' ? 'sv-SE' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  const date = now.toLocaleDateString(locale === 'sv' ? 'sv-SE' : 'en-US');
  fmt.insertAtCursor(view, `${time} ${date}`);
}

function printCurrent() {
  if (!active) return;
  const area = $('#print-area');
  const text = view.state.doc.toString();
  if (active.kind === 'md') { area.className = 'preview'; area.innerHTML = renderMarkdown(text); }
  else { area.className = ''; area.innerHTML = ''; const pre = document.createElement('pre'); pre.textContent = text; area.appendChild(pre); }
  window.print();
}

const SHORTCUTS = [
  ['Ctrl+N', 'menu.new'], ['Ctrl+Shift+N', 'menu.newWindow'], ['Ctrl+O', 'menu.open'], ['Ctrl+S', 'menu.save'], ['Ctrl+Shift+S', 'menu.saveAs'],
  ['Ctrl+W', 'menu.closeTab'], ['Ctrl+Tab', 'ui.nextTab'], ['Ctrl+P', 'menu.print'], ['Ctrl+F', 'menu.find'], ['F3 / Shift+F3', 'menu.findNext'],
  ['Ctrl+H', 'menu.replace'], ['Ctrl+G', 'menu.goTo'], ['F5', 'menu.timeDate'], ['Ctrl+B', 'menu.bold'], ['Ctrl+I', 'menu.italic'],
  ['Ctrl+Shift+X', 'menu.strikethrough'], ['Ctrl+1 / 2 / 3', 'menu.headings'], ['Ctrl+Shift+8', 'menu.bulletList'], ['Ctrl+Shift+7', 'menu.numberedList'],
  ['Ctrl+Shift+9', 'menu.checkList'], ['Ctrl+Shift+.', 'menu.quote'], ['Ctrl+E', 'menu.code'], ['Ctrl+Shift+E', 'menu.codeBlock'], ['Ctrl+K', 'menu.link'],
  ['Alt+↑ / Alt+↓', 'menu.moveLine'], ['Shift+Alt+↑ / ↓', 'menu.copyLine'], ['Ctrl+L', 'menu.selectLine'],
  ['Ctrl+Shift+K', 'menu.deleteLine'], ['Ctrl+X / Ctrl+C', 'menu.cutCopyLine'], ['Ctrl+Enter', 'menu.insertLineBelow'],
  ['Ctrl+Shift+Enter', 'menu.insertLineAbove'], ['Ctrl+D', 'menu.selectWord'], ['Ctrl+Shift+L', 'menu.selectAllOccurrences'],
  ['Ctrl+Alt+↑ / ↓', 'menu.addCursor'], ['Ctrl+] / Ctrl+[', 'menu.indentBoth'],
  ['Ctrl+Shift+1 / 2 / 3', 'menu.viewModes'], ['Ctrl+Shift+W', 'menu.writingMode'], ['F11', 'menu.fullscreen'], ['Ctrl+= / Ctrl+-', 'menu.zoom'],
  ['Ctrl+0', 'menu.zoomReset'], ['Alt+Z', 'menu.wordWrap'], ['Ctrl+?', 'menu.shortcuts']
];

function openShortcutsDialog() {
  const tables = [$('#keys-table'), $('#keys-table-2')];
  tables.forEach((tb) => { tb.innerHTML = ''; });
  const half = Math.ceil(SHORTCUTS.length / 2);
  SHORTCUTS.forEach(([keys, label], i) => {
    const tr = document.createElement('tr');
    const a = document.createElement('td'); a.textContent = keys;
    const b = document.createElement('td'); b.textContent = t(label).replace('&', '').replace(/…$/, '');
    tr.append(a, b); tables[i < half ? 0 : 1].appendChild(tr);
  });
  const dlg = $('#dlg-keys');
  dlg.showModal();
  dlg.addEventListener('close', () => view.focus(), { once: true });
}

function ensureEditorVisible() {
  if ($('#main').dataset.view === 'preview') void api.setSettings({ viewMode: 'split' });
}

// ---------- menu / actions ----------
async function handleAction(action, payload) {
  switch (action) {
    case 'new': newTab(); break;
    case 'open': await openDialog(); break;
    case 'openPaths': await openPaths(payload || []); break;
    case 'save': await saveTab(active); break;
    case 'saveAs': await saveTab(active, true); break;
    case 'saveAll': await saveAll(); break;
    case 'closeTab': await closeTab(active); break;
    case 'print': printCurrent(); break;
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
    case 'timeDate': insertTimeDate(); break;
    case 'font': await openFontDialog(); break;
    case 'zoomIn': setZoom((settings.zoom || 100) + 10); break;
    case 'zoomOut': setZoom((settings.zoom || 100) - 10); break;
    case 'zoomReset': setZoom(100); break;
    case 'nextTab': cycleTab(1); break;
    case 'writingMode': await api.setSettings({ writingMode: !settings.writingMode }); break;
    case 'fullscreen': await api.toggleFullscreen(); break;
    case 'shortcuts': openShortcutsDialog(); break;
    case 'moveLineUp': case 'moveLineDown': case 'copyLineUp': case 'copyLineDown': case 'deleteLine': case 'selectLine':
    case 'insertLineBelow': case 'insertLineAbove': case 'selectWord': case 'selectNextOccurrence': case 'selectAllOccurrences':
    case 'addCursorAbove': case 'addCursorBelow': case 'indentLine': case 'outdentLine':
      ensureEditorVisible(); lineCommands[action](view); view.focus(); break;
    case 'prevTab': cycleTab(-1); break;
    default:
      if (!runFormat(action)) console.warn('unknown action', action);
  }
}

function bindUi() {
  $('#tab-add').addEventListener('click', () => newTab());
  for (const b of $$('#toolbar [data-action]')) {
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep editor focus
    b.addEventListener('click', () => { hidePopup(); runFormat(b.dataset.action); });
  }
  for (const b of $$('.tb-drop')) {
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const popup = b.parentElement.querySelector('.tb-popup');
      const open = popup.classList.contains('open');
      hidePopup();
      if (!open) { popup.classList.add('open'); b.setAttribute('aria-expanded', 'true'); setTimeout(() => document.addEventListener('mousedown', onDocMouseDown), 0); }
    });
  }
  for (const b of $$('#view-mode button')) b.addEventListener('click', () => api.setSettings({ viewMode: b.dataset.mode }));
  for (const b of $$('#footer [data-action]')) b.addEventListener('click', () => void handleAction(b.dataset.action));

  $('#st-zoom').addEventListener('click', () => setZoom(100));
  $('#st-eol').addEventListener('click', (e) => showPopup(e.currentTarget, [
    { label: t('ui.crlf'), checked: active.eol === 'CRLF', onClick: () => { active.eol = 'CRLF'; markDirty(); } },
    { label: t('ui.lf'), checked: active.eol === 'LF', onClick: () => { active.eol = 'LF'; markDirty(); } }
  ]));
  $('#st-enc').addEventListener('click', (e) => showPopup(e.currentTarget, ENCODINGS.map((enc) => ({
    label: encodingLabel(enc), checked: active.encoding === enc, onClick: () => { active.encoding = enc; markDirty(); }
  }))));
  $('#st-kind').addEventListener('click', () => {
    active.kind = active.kind === 'md' ? 'txt' : 'md';
    view.dispatch({ effects: reconfigureEffects(editorOpts(active)) });
    applyKindUi(); updateStatus(); schedulePreview(0);
    view.focus();
  });

  // Global shortcuts that the native menu does not register.
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Tab') { e.preventDefault(); cycleTab(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') hidePopup();
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

  window.addEventListener('focus', () => void checkExternalChange());
  api.onThemeChanged((dark) => applyTheme(dark));

  api.onMenu((action, payload) => void handleAction(action, payload));
  api.onOpenFiles((paths) => void openPaths(paths));
  api.onRequestClose(() => void requestClose());
  api.onSettingsChanged((next) => applySettings(next, settings));
}

function applyTheme(dark) {
  isDark = !!dark;
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  if (view) reconfigureAll();
}

function markDirty() {
  if (!active) return;
  active.dirty = true;
  renderTabs(); updateTitle(); updateStatus();
}

// ---------- boot ----------
let bootLocale = 'en';
async function boot() {
  const b = await api.bootstrap();
  bootLocale = b.locale;
  locale = b.locale;
  applyTheme(b.dark);
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
        schedulePreview();
      }
      if (docChanged || trs.some((tr) => tr.selection)) updateStatus();
    }
  });
  view.scrollDOM.addEventListener('scroll', syncPreviewScroll, { passive: true });
  bindUi();
  applySettings(b.settings, { __locale: b.locale });
  const restored = await restoreDrafts();
  if (b.filesToOpen.length) { await openPaths(b.filesToOpen); if (!tabs.length) newTab(); }
  else if (restored) activateTab(tabs[0]);
  else newTab();
  window.__notera = { get tabs() { return tabs; }, get active() { return active; }, get view() { return view; }, get settings() { return settings; }, handleAction, openPaths };
}

void boot();
