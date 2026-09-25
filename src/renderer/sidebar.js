// sidebar.js: the notes sidebar. Projects with their notes, the Unsorted inbox, the archive,
// search, drag and drop, context menus, the quick-search palette and the undo toast.
//
// The file system work happens in the main process (src/main/notes.js); this module draws the
// tree it returns and asks for changes. Everything that concerns open tabs (moving them along
// with their files, opening, creating) goes through the ctx callbacks from app.js.

const ICONS = {
  sidebar: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6 2.5v11" stroke="currentColor" stroke-width="1.3"/><path d="M3 5h1.6M3 7h1.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>',
  search: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  chev: '<svg class="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  folder: '<svg class="ico" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4.5a1 1 0 011-1h3.3l1.5 1.5h6.2a1 1 0 011 1v6.5a1 1 0 01-1 1h-11a1 1 0 01-1-1z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  inbox: '<svg class="ico" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 9.5l1.8-6h8.4l1.8 6v3.5H2z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M2 9.5h3.5l1 1.5h3l1-1.5H14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  plus: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  dots: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="8" r="1.3" fill="currentColor"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="12.5" cy="8" r="1.3" fill="currentColor"/></svg>',
  pin: '<svg class="pin" width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 1.8l4.7 4.7-1.6.6-2.4 2.4.3 3-1.2 1.2-3-3-3.6 3.6-.6-.6 3.6-3.6-3-3 1.2-1.2 3 .3 2.4-2.4z" fill="currentColor"/></svg>',
  archive: '<svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="3" rx=".8" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M2.5 5.5v7.5h11V5.5M6.5 8.5h3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  restore: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 7.5A5 5 0 118 13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M1 5.5l2 2.2 2.2-2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 9h6.6l.7-9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  move: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h10M9 5l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 13l.6-2.6L10.8 3.2l2 2L5.6 12.4z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  note: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.5h6l3 3v10h-9z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.5 8h5M5.5 10.5h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  close: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
};
export { ICONS };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createSidebar(ctx) {
  const { api } = ctx;
  const t = (...a) => ctx.t()(...a);
  const $ = (sel) => document.querySelector(sel);
  const list = $('#sb-list');
  const input = $('#sb-q');

  let tree = null;
  let archiveView = false;
  let results = null; // search hits while the search field has text
  let editing = null; // { kind: 'new' | 'rename', name, value, error }
  let byPath = new Map(); // key(path) -> { folder, archived, note }
  let searchTimer = null;
  let searchSeq = 0;

  const key = (p) => ctx.pathKey(p);

  // ---------- data ----------
  async function refresh() {
    if (!ctx.settings().notesRoot) { tree = null; byPath = new Map(); render(); return; }
    const r = await api.notes.call('tree');
    if (!r || r.error) { tree = null; byPath = new Map(); render(); return; }
    tree = r;
    byPath = new Map();
    for (const g of [tree.inbox, ...tree.projects]) for (const n of g.notes) byPath.set(key(n.path), { folder: g.name, archived: false, note: n });
    for (const g of tree.archive) for (const n of g.notes) byPath.set(key(n.path), { folder: g.name, archived: true, note: n });
    if (input.value.trim()) await runSearch(input.value);
    render();
    ctx.onTreeChanged();
  }

  /** { folder, archived, note } for a path inside the notes folder, or null. */
  function noteInfo(p) { return p ? byPath.get(key(p)) || null : null; }
  function activeFolders() { return tree ? [tree.inbox.name, ...tree.projects.map((p) => p.name)] : []; }
  function inboxName() { return tree ? tree.inboxName : null; }
  const folderLabel = (name) => (tree && name === tree.inboxName ? t('notes.inbox') : name);
  const findGroup = (name) => (tree ? [tree.inbox, ...tree.projects].find((g) => g.name === name) : null);

  // An open note shows the heading as it is being typed; a closed one the heading on disk, or
  // its file name when it has no heading.
  function titleFor(n) {
    const live = ctx.liveTitle(n.path);
    if (live !== null) return live || t('notes.untitledNote');
    return n.title;
  }
  function isUntitled(n) {
    const live = ctx.liveTitle(n.path);
    return live !== null ? !live : !n.hasTitle;
  }

  // ---------- operations ----------
  async function call(method, ...args) {
    await ctx.flush();
    const r = await api.notes.call(method, ...args);
    if (r && r.error) {
      if (r.error !== 'noRoot') toast(t('notes.opFailed', { error: r.message || r.error }));
      return null;
    }
    await ctx.applyResult(r);
    await refresh();
    return r;
  }
  function undoToast(r, msg) {
    toast(msg, r && r.undoId ? async () => {
      const u = await call('undo', r.undoId);
      toast(u && u.ok ? t('notes.undone') : t('notes.undoFailed'));
    } : null);
  }

  async function moveTo(p, folder, opts) {
    const r = await call('moveNote', p, folder, opts || {});
    if (r && r.undoId) undoToast(r, t('notes.toastMoved', { project: folderLabel(folder) }));
    return r;
  }
  async function archiveNote(p) {
    const info = noteInfo(p);
    const title = info ? titleFor(info.note) : '';
    const r = await call('archiveNote', p);
    if (r) undoToast(r, t('notes.toastArchived', { title }));
  }
  async function restoreNote(p) {
    const r = await call('restoreNote', p);
    if (r) undoToast(r, t(r.recreated ? 'notes.toastRestoredNew' : 'notes.toastRestored', { project: folderLabel(r.project) }));
  }
  async function deleteNote(p) {
    const info = noteInfo(p);
    const title = info ? titleFor(info.note) : p;
    if (ctx.settings().confirmDelete !== false && !(await api.notes.confirmDeleteNote(title))) return;
    const r = await call('deleteNote', p);
    if (r) toast(t('notes.toastDeleted', { title }));
  }
  async function togglePin(p, pinned) { await call('setPinned', p, pinned); }
  async function archiveProject(name) {
    const r = await call('archiveProject', name);
    if (r) undoToast(r, t('notes.toastProjectArchived', { project: name }));
  }
  async function restoreProject(name) {
    const r = await call('restoreProject', name);
    if (r) undoToast(r, t('notes.toastProjectRestored', { project: r.name }));
  }
  async function deleteProject(name, archived = false) {
    const n = await api.notes.call('countNotes', name, { archived });
    const choice = await api.notes.confirmDeleteProject({ project: name, n: typeof n === 'number' ? n : 0, archived });
    if (choice === 'archive') return archiveProject(name);
    if (choice !== 'delete') return;
    const r = await call('deleteProject', name, { archived });
    if (r) toast(t('notes.toastProjectDeleted', { project: name }));
  }
  async function createProject(name) {
    await ctx.flush();
    const r = await api.notes.call('createProject', name);
    if (r && r.error) return r.error === 'failed' ? t('notes.opFailed', { error: r.message }) : t(r.error, { name });
    await refresh();
    return '';
  }
  async function renameProject(oldName, name) {
    await ctx.flush();
    const r = await api.notes.call('renameProject', oldName, name);
    if (r && r.error) return r.error === 'failed' ? t('notes.opFailed', { error: r.message }) : t(r.error, { name });
    await ctx.applyResult(r);
    await refresh();
    if (r && r.undoId) undoToast(r, t('notes.toastProjectRenamed', { project: r.name }));
    return '';
  }
  async function setCollapsed(name, collapsed) {
    const g = findGroup(name);
    if (g) g.collapsed = collapsed;
    render();
    await api.notes.call('setCollapsed', name, collapsed);
  }

  // ---------- rendering ----------
  function noteRow(n, folder) {
    const title = titleFor(n);
    const active = ctx.activePath() && key(ctx.activePath()) === key(n.path);
    const untitled = isUntitled(n);
    return `<div class="sb-row sb-note${active ? ' active' : ''}${untitled ? ' untitled' : ''}" data-drag="note" data-drop="note" data-path="${esc(n.path)}" data-folder="${esc(folder)}" title="${esc(n.file)}">
      ${n.pinned ? ICONS.pin : ''}<span class="name">${esc(title)}</span>
      <span class="acts"><button type="button" data-act="note-menu" title="${esc(t('notes.more'))}" aria-label="${esc(t('notes.more'))}">${ICONS.dots}</button></span></div>`;
  }

  function groupBlock(g) {
    const isEdit = editing && editing.kind === 'rename' && editing.name === g.name;
    const label = folderLabel(g.name);
    let h = `<div class="sb-row sb-proj${g.inbox ? ' inbox' : ''}" ${g.inbox ? '' : 'data-drag="proj"'} data-drop="proj" data-folder="${esc(g.name)}" aria-expanded="${!g.collapsed}">
      ${ICONS.chev.replace('class="chev"', `class="chev${g.collapsed ? '' : ' open'}"`)}${g.inbox ? ICONS.inbox : ICONS.folder}
      ${isEdit ? `<input class="sb-edit" id="sb-edit" value="${esc(editing.value)}" autocomplete="off" spellcheck="false" aria-label="${esc(t('notes.projectName'))}" />`
        : `<span class="name">${esc(label)}</span>${g.collapsed && g.notes.length ? `<span class="count">${g.notes.length}</span>` : ''}`}
      <span class="acts"><button type="button" data-act="new-note" title="${esc(t('notes.newNoteIn', { project: label }))}" aria-label="${esc(t('notes.newNoteIn', { project: label }))}">${ICONS.plus}</button>${g.inbox ? '' : `<button type="button" data-act="proj-menu" title="${esc(t('notes.more'))}" aria-label="${esc(t('notes.more'))}">${ICONS.dots}</button>`}</span></div>`;
    if (isEdit && editing.error) h += `<div class="sb-err">${esc(editing.error)}</div>`;
    if (!g.collapsed) {
      h += g.notes.map((n) => noteRow(n, g.name)).join('');
      if (!g.notes.length) h += `<div class="sb-hint" data-drop="empty" data-folder="${esc(g.name)}">${esc(t(g.inbox ? 'notes.emptyInbox' : 'notes.emptyProject'))}</div>`;
    }
    return h;
  }

  function renderTree() {
    let h = groupBlock(tree.inbox);
    h += `<div class="sb-sec"><span>${esc(t('notes.projects'))}</span><span class="spacer"></span><button type="button" class="sb-ibtn" data-act="new-project" title="${esc(t('notes.newProject'))}" aria-label="${esc(t('notes.newProject'))}">${ICONS.plus}</button></div>`;
    h += tree.projects.map(groupBlock).join('');
    if (editing && editing.kind === 'new') {
      h += `<div class="sb-row sb-newproj">${ICONS.folder}<input class="sb-edit" id="sb-edit" placeholder="${esc(t('notes.projectName'))}" value="${esc(editing.value)}" autocomplete="off" spellcheck="false" aria-label="${esc(t('notes.projectName'))}" /></div>`;
      if (editing.error) h += `<div class="sb-err">${esc(editing.error)}</div>`;
    } else h += `<div class="sb-row sb-newproj" data-act="new-project">${ICONS.plus}<span class="name">${esc(t('notes.newProject'))}</span></div>`;
    return h;
  }

  function renderArchive() {
    let h = `<div class="sb-arch-head"><button type="button" class="sb-ibtn" data-act="arch-back" title="${esc(t('notes.back'))}" aria-label="${esc(t('notes.back'))}">${ICONS.back}</button><span>${esc(t('notes.archiveTitle'))}</span></div>`;
    h += `<div class="sb-arch-hint">${esc(t('notes.archiveHint'))}</div>`;
    if (!tree.archive.length) return h + `<div class="sb-empty">${esc(t('notes.archiveEmpty'))}</div>`;
    for (const g of tree.archive) {
      h += `<div class="sb-row sb-proj sb-arch-group" data-folder="${esc(g.name)}">${ICONS.folder}<span class="name">${esc(folderLabel(g.name))}</span>${g.wholeProject ? `<span class="sb-tag">${esc(t('notes.wholeProject'))}</span>` : ''}
        <span class="acts"><button type="button" data-act="arch-proj-restore" title="${esc(t('notes.restoreProject'))}" aria-label="${esc(t('notes.restoreProject'))}">${ICONS.restore}</button><button type="button" data-act="arch-proj-menu" title="${esc(t('notes.more'))}" aria-label="${esc(t('notes.more'))}">${ICONS.dots}</button></span></div>`;
      for (const n of g.notes) {
        const active = ctx.activePath() && key(ctx.activePath()) === key(n.path);
        h += `<div class="sb-row sb-note${active ? ' active' : ''}" data-path="${esc(n.path)}" data-folder="${esc(g.name)}" data-archived="1" title="${esc(n.file)}"><span class="name">${esc(n.title)}</span>
          <span class="acts"><button type="button" data-act="arch-restore" title="${esc(t('notes.restore'))}" aria-label="${esc(t('notes.restore'))}">${ICONS.restore}</button><button type="button" data-act="arch-menu" title="${esc(t('notes.more'))}" aria-label="${esc(t('notes.more'))}">${ICONS.dots}</button></span></div>`;
      }
    }
    return h;
  }

  function hilite(text, q) {
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (!q || i < 0) return esc(text);
    return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
  }
  function resultHtml(h, q, sel) {
    return `<div class="sb-res${sel ? ' sel' : ''}" data-open="${esc(h.path)}" role="option" aria-selected="${sel}">
      <div class="t">${ICONS.note}<span class="tt">${hilite(h.title, q)}</span>${h.archived ? `<span class="sb-tag">${esc(t('notes.archived'))}</span>` : ''}</div>
      ${h.snippet ? `<div class="s">${hilite(h.snippet, q)}</div>` : ''}<div class="p">${esc(folderLabel(h.project))}</div></div>`;
  }

  function render() {
    const settings = ctx.settings();
    const st = list.scrollTop;
    const hasRoot = !!settings.notesRoot && !!tree;
    $('#sb-searchbox').hidden = !hasRoot;
    if (!hasRoot) {
      list.innerHTML = `<div class="sb-setup"><p>${esc(t('notes.setup'))}</p><button type="button" class="primary" data-act="choose-root">${esc(t('notes.chooseFolder'))}</button></div>`;
      $('#sb-foot').innerHTML = '';
      return;
    }
    const q = input.value.trim();
    if (q && results) {
      list.innerHTML = results.length ? results.map((h) => resultHtml(h, q, false)).join('') : `<div class="sb-empty">${esc(t('notes.noResults', { q }))}</div>`;
    } else if (archiveView) list.innerHTML = renderArchive();
    else list.innerHTML = renderTree();
    list.scrollTop = st;
    $('#sb-foot').innerHTML = `<button type="button" data-act="archive-toggle" class="${archiveView ? 'on' : ''}" aria-pressed="${archiveView}">${ICONS.archive}<span>${esc(t('notes.archiveTitle'))}</span><span class="count">${tree.archiveCount}</span></button>`;
    const ed = $('#sb-edit');
    if (ed && document.activeElement !== ed) { ed.focus(); ed.setSelectionRange(ed.value.length, ed.value.length); }
  }

  /** Cheap redraw of titles while typing in a heading. */
  function renderTitles() {
    for (const row of list.querySelectorAll('.sb-note[data-path]')) {
      const info = noteInfo(row.dataset.path);
      if (!info) continue;
      const name = row.querySelector('.name');
      const title = titleFor(info.note);
      if (name && name.textContent !== title) name.textContent = title;
    }
  }

  function applyI18n() {
    input.placeholder = t('notes.search');
    $('#sb-q-kbd').textContent = ctx.shortcutLabel('searchNotes');
    $('#pal-q').placeholder = t('notes.searchAll');
    render();
  }

  // ---------- search ----------
  async function runSearch(q) {
    const seq = ++searchSeq;
    const r = q.trim() ? await api.notes.call('search', q) : [];
    if (seq !== searchSeq) return null;
    results = Array.isArray(r) ? r : [];
    return results;
  }
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    if (!input.value.trim()) { results = null; render(); return; }
    searchTimer = setTimeout(async () => { await ctx.flush(); await runSearch(input.value); render(); }, 120);
  });
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') { input.value = ''; results = null; render(); ctx.focusEditor(); }
    if (e.key === 'Enter') {
      await runSearch(input.value);
      if (results && results[0]) ctx.openNote(results[0].path);
    }
  });

  // ---------- quick search palette ----------
  const palette = $('#palette');
  const palInput = $('#pal-q');
  let palHits = [];
  let palSel = 0;
  let palSeq = 0;
  function recentNotes() {
    if (!tree) return [];
    const all = [tree.inbox, ...tree.projects].flatMap((g) => g.notes.map((n) => ({ path: n.path, title: titleFor(n), project: g.name, archived: false, snippet: '', mtimeMs: n.mtimeMs })));
    return all.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 8);
  }
  async function renderPalette() {
    const q = palInput.value.trim();
    const seq = ++palSeq;
    const hits = q ? await api.notes.call('search', q) : recentNotes();
    if (seq !== palSeq) return;
    palHits = Array.isArray(hits) ? hits : [];
    palSel = Math.min(palSel, Math.max(0, palHits.length - 1));
    $('#pal-list').innerHTML = (q ? '' : `<div class="pal-head">${esc(t('notes.recent'))}</div>`)
      + (palHits.length ? palHits.map((h, i) => resultHtml(h, q, i === palSel)).join('') : `<div class="sb-empty">${esc(q ? t('notes.noResults', { q }) : t('notes.emptyInbox'))}</div>`);
    const sel = $('#pal-list .sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  function openPalette() {
    palette.hidden = false;
    palInput.value = '';
    palSel = 0;
    void ctx.flush().then(renderPalette);
    palInput.focus();
  }
  function closePalette(refocus = true) { palette.hidden = true; if (refocus) ctx.focusEditor(); }
  palInput.addEventListener('input', () => { palSel = 0; void renderPalette(); });
  palInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); palSel = Math.min(palSel + 1, palHits.length - 1); void renderPalette(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); palSel = Math.max(palSel - 1, 0); void renderPalette(); }
    else if (e.key === 'Enter') { e.preventDefault(); const h = palHits[palSel]; if (h) { closePalette(false); ctx.openNote(h.path); } }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  });
  palette.addEventListener('mousedown', (e) => {
    const res = e.target.closest('[data-open]');
    if (res) { e.preventDefault(); closePalette(false); ctx.openNote(res.dataset.open); return; }
    if (e.target === palette) closePalette();
  });

  function openSearch() {
    if (!ctx.settings().notesRoot) { toast(t('notes.chooseFolderFirst')); return; }
    if (ctx.sidebarVisible()) { input.focus(); input.select(); return; }
    openPalette();
  }

  // ---------- menus ----------
  const menu = $('#sb-menu');
  function showMenu(anchor, items, title, point) {
    closeMenu();
    anchor?.closest?.('.sb-row')?.classList.add('menu-open');
    const draw = (entries, head, isSub) => {
      menu.innerHTML = (isSub ? `<button type="button" data-i="back">${ICONS.back}<span class="lab">${esc(t('notes.back'))}</span></button><div class="sep"></div>` : '')
        + (head ? `<div class="mh">${esc(head)}</div>` : '')
        + entries.map((it, i) => (it.sep ? '<div class="sep"></div>'
          : `<button type="button" data-i="${i}" class="${it.danger ? 'danger' : ''}" ${it.disabled ? 'disabled' : ''}>${it.icon || '<span class="ico-space"></span>'}<span class="lab">${esc(it.label)}</span>${it.sub ? '<span class="sub">›</span>' : ''}</button>`)).join('');
      menu.onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        e.stopPropagation();
        if (b.dataset.i === 'back') { draw(items, title, false); return; }
        const it = entries[+b.dataset.i];
        if (it.sub) { draw(it.sub(), it.label, true); return; }
        closeMenu();
        void it.act?.();
      };
      place();
    };
    const place = () => {
      menu.hidden = false;
      const w = menu.offsetWidth, h = menu.offsetHeight;
      let left, top;
      if (point) { left = point.x; top = point.y; } else {
        const r = anchor.getBoundingClientRect();
        left = r.right - w; top = r.bottom + 4;
        if (left < 6) left = r.left;
        if (top + h > window.innerHeight - 6) top = r.top - h - 4;
      }
      menu.style.left = `${Math.max(6, Math.min(left, window.innerWidth - w - 6))}px`;
      menu.style.top = `${Math.max(6, Math.min(top, window.innerHeight - h - 6))}px`;
    };
    draw(items, title, false);
    menu.querySelector('button:not([disabled])')?.focus();
  }
  function closeMenu() {
    if (menu.hidden) return;
    menu.hidden = true;
    for (const el of document.querySelectorAll('.sb-row.menu-open')) el.classList.remove('menu-open');
  }
  document.addEventListener('mousedown', (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); }, true);
  window.addEventListener('blur', closeMenu);
  menu.addEventListener('keydown', (e) => {
    const btns = [...menu.querySelectorAll('button:not([disabled])')];
    const i = btns.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
  });

  /** "Move to" targets: Unsorted, every project except the current one, and "New project…". */
  function moveTargets(currentFolder, onPick) {
    const items = activeFolders()
      .filter((f) => f !== currentFolder)
      .map((f) => ({ label: folderLabel(f), icon: f === inboxName() ? ICONS.inbox : ICONS.folder, act: () => onPick(f) }));
    items.push({ sep: true }, {
      label: t('notes.newProjectEllipsis'), icon: ICONS.plus,
      act: async () => { const name = await ctx.promptProjectName(); if (name) await onPick(name); }
    });
    return items;
  }

  function noteMenu(p, anchor, point) {
    const info = noteInfo(p);
    if (!info) return;
    const n = info.note;
    showMenu(anchor, [
      { label: t('notes.open'), icon: ICONS.note, act: () => ctx.openNote(p) },
      { label: n.pinned ? t('notes.unpin') : t('notes.pin'), icon: ICONS.pin.replace('class="pin"', ''), act: () => togglePin(p, !n.pinned) },
      { label: t('notes.moveTo'), icon: ICONS.move, sub: () => moveTargets(info.folder, (f) => moveTo(p, f)) },
      { sep: true },
      { label: t('notes.archive'), icon: ICONS.archive, act: () => archiveNote(p) },
      { label: t('notes.delete'), icon: ICONS.trash, danger: true, act: () => deleteNote(p) }
    ], titleFor(n), point);
  }
  function projMenu(name, anchor, point) {
    showMenu(anchor, [
      { label: t('notes.newNote'), icon: ICONS.plus, act: () => ctx.createNote(name) },
      { label: t('notes.rename'), icon: ICONS.edit, act: () => { editing = { kind: 'rename', name, value: name, error: '' }; render(); } },
      { sep: true },
      { label: t('notes.archiveProject'), icon: ICONS.archive, act: () => archiveProject(name) },
      { label: t('notes.deleteProject'), icon: ICONS.trash, danger: true, act: () => deleteProject(name) }
    ], name, point);
  }
  function archivedNoteMenu(p, anchor, point) {
    const info = noteInfo(p);
    if (!info) return;
    showMenu(anchor, [
      { label: t('notes.open'), icon: ICONS.note, act: () => ctx.openNote(p) },
      { label: t('notes.restoreTo', { project: folderLabel(info.folder) }), icon: ICONS.restore, act: () => restoreNote(p) },
      { sep: true },
      { label: t('notes.deleteForever'), icon: ICONS.trash, danger: true, act: () => deleteNote(p) }
    ], info.note.title, point);
  }
  function archivedProjectMenu(name, anchor, point) {
    showMenu(anchor, [
      { label: t('notes.restoreProject'), icon: ICONS.restore, act: () => restoreProject(name) },
      { sep: true },
      { label: t('notes.deleteForever'), icon: ICONS.trash, danger: true, act: () => deleteProject(name, true) }
    ], folderLabel(name), point);
  }

  /** Right-click menu of a tab: move it into a project, show it, archive it. */
  function showTabMenu(tab, point) {
    const settings = ctx.settings();
    const info = tab.path ? noteInfo(tab.path) : null;
    const items = [];
    if (!settings.notesRoot) {
      items.push({ label: t('notes.chooseFolder'), icon: ICONS.folder, act: () => ctx.chooseRoot() });
    } else if (!info || !info.archived) {
      items.push({
        label: t('notes.moveToProject'), icon: ICONS.move,
        sub: () => moveTargets(info ? info.folder : null, (f) => (info ? moveTo(tab.path, f) : ctx.moveTabToProject(tab, f)))
      });
    }
    if (info) {
      items.push({ label: t('notes.showInSidebar'), icon: ICONS.sidebar, act: () => reveal(tab.path) });
      if (info.archived) items.push({ label: t('notes.restore'), icon: ICONS.restore, act: () => restoreNote(tab.path) });
      else items.push({ label: t('notes.archive'), icon: ICONS.archive, act: () => archiveNote(tab.path) });
    }
    items.push({ sep: true }, { label: t('notes.closeTab'), icon: ICONS.close, act: () => ctx.closeTab(tab) });
    showMenu(null, items, tab.path ? (info ? titleFor(info.note) : tab.path) : null, point);
  }

  // ---------- list events ----------
  let suppressClick = false;
  list.addEventListener('click', (e) => {
    if (suppressClick) { suppressClick = false; return; }
    const res = e.target.closest('[data-open]');
    if (res) { ctx.openNote(res.dataset.open); return; }
    if (e.target.closest('input')) return;
    const actEl = e.target.closest('[data-act]');
    const act = actEl?.dataset.act;
    const row = e.target.closest('.sb-row');
    const p = row?.dataset.path;
    const folder = row?.dataset.folder;
    switch (act) {
      case 'new-note': return void ctx.createNote(folder);
      case 'note-menu': return noteMenu(p, actEl);
      case 'proj-menu': return projMenu(folder, actEl);
      case 'new-project': editing = { kind: 'new', value: '', error: '' }; return render();
      case 'choose-root': return void ctx.chooseRoot();
      case 'arch-back': archiveView = false; return render();
      case 'arch-restore': return void restoreNote(p);
      case 'arch-menu': return archivedNoteMenu(p, actEl);
      case 'arch-proj-restore': return void restoreProject(folder);
      case 'arch-proj-menu': return archivedProjectMenu(folder, actEl);
      default: break;
    }
    if (!row) return;
    if (p) { ctx.openNote(p); return; }
    if (row.classList.contains('sb-proj') && !row.classList.contains('sb-arch-group') && folder) {
      const g = findGroup(folder);
      if (g) void setCollapsed(folder, !g.collapsed);
    }
  });
  list.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.sb-row');
    if (!row) return;
    e.preventDefault();
    const point = { x: e.clientX, y: e.clientY };
    const p = row.dataset.path;
    const folder = row.dataset.folder;
    if (row.classList.contains('sb-arch-group')) archivedProjectMenu(folder, row, point);
    else if (p && row.dataset.archived) archivedNoteMenu(p, row, point);
    else if (p) noteMenu(p, row, point);
    else if (folder && folder !== inboxName()) projMenu(folder, row, point);
  });
  $('#sb-foot').addEventListener('click', (e) => {
    if (!e.target.closest('[data-act="archive-toggle"]')) return;
    archiveView = !archiveView;
    input.value = '';
    results = null;
    render();
  });

  // Inline name editing (new project, rename project).
  list.addEventListener('input', (e) => { if (e.target.id === 'sb-edit' && editing) editing.value = e.target.value; });
  list.addEventListener('keydown', (e) => {
    if (e.target.id !== 'sb-edit' || !editing) return;
    if (e.key === 'Escape') { e.preventDefault(); editing = null; render(); }
    else if (e.key === 'Enter') { e.preventDefault(); void finishEdit(false); }
  });
  list.addEventListener('focusout', (e) => {
    if (e.target.id !== 'sb-edit' || !editing) return;
    setTimeout(() => {
      if (!editing || document.activeElement?.id === 'sb-edit') return;
      if (editing.value.trim() && editing.value.trim() !== editing.name) void finishEdit(true);
      else { editing = null; render(); }
    }, 150);
  });
  async function finishEdit(fromBlur) {
    const ed = editing;
    if (!ed) return;
    const value = ed.value.trim();
    const err = ed.kind === 'new' ? await createProject(value) : await renameProject(ed.name, value);
    if (editing !== ed) return;
    if (err) {
      if (fromBlur) { editing = null; render(); toast(err); return; }
      ed.error = err; render(); return;
    }
    editing = null;
    render();
  }

  // ---------- drag and drop (notes and projects) ----------
  let pend = null;
  let drag = null;
  let scrollRaf = 0;
  let lastY = 0;
  const ghost = $('#sb-ghost');
  function clearMarks() { for (const el of list.querySelectorAll('.drop-before,.drop-after,.drop-into')) el.classList.remove('drop-before', 'drop-after', 'drop-into'); }
  function beginDrag(row, x, y) {
    drag = { row, kind: row.dataset.drag, path: row.dataset.path, folder: row.dataset.folder, target: null };
    row.classList.add('dragging');
    ghost.textContent = row.querySelector('.name')?.textContent || '';
    ghost.hidden = false;
    document.body.classList.add('sb-dragging');
    moveGhost(x, y);
    const tick = () => {
      if (!drag) return;
      const r = list.getBoundingClientRect();
      if (lastY && lastY < r.top + 28) list.scrollTop -= 6;
      else if (lastY && lastY > r.bottom - 28) list.scrollTop += 6;
      scrollRaf = requestAnimationFrame(tick);
    };
    scrollRaf = requestAnimationFrame(tick);
  }
  function moveGhost(x, y) { ghost.style.transform = `translate(${x + 14}px, ${y + 6}px)`; }
  function dragMove(x, y) {
    lastY = y;
    moveGhost(x, y);
    clearMarks();
    drag.target = null;
    const el = document.elementFromPoint(x, y);
    const row = el && el.closest('#sb-list [data-drop]');
    if (!row) return;
    const r = row.getBoundingClientRect();
    const after = y > r.top + r.height / 2;
    if (drag.kind === 'note') {
      if (row.dataset.drop === 'note') {
        if (row.dataset.path === drag.path) return;
        drag.target = { type: 'note', path: row.dataset.path, folder: row.dataset.folder, after };
        row.classList.add(after ? 'drop-after' : 'drop-before');
      } else {
        drag.target = { type: 'folder', folder: row.dataset.folder };
        row.classList.add('drop-into');
      }
    } else {
      let pr = row.dataset.drop === 'proj' ? row : list.querySelector(`.sb-proj[data-folder="${CSS.escape(row.dataset.folder || '')}"]`);
      if (!pr || pr.dataset.folder === inboxName() || pr.dataset.folder === drag.folder) return;
      const aft = pr === row ? after : true;
      drag.target = { type: 'proj', folder: pr.dataset.folder, after: aft };
      pr.classList.add(aft ? 'drop-after' : 'drop-before');
    }
  }
  async function dragEnd() {
    const d = drag;
    drag = null;
    lastY = 0;
    cancelAnimationFrame(scrollRaf);
    ghost.hidden = true;
    document.body.classList.remove('sb-dragging');
    clearMarks();
    d.row.classList.remove('dragging');
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    const tg = d.target;
    if (!tg) return;
    if (d.kind === 'note') {
      if (tg.type === 'note') {
        const file = tg.path.split(/[\\/]/).pop();
        if (tg.folder === d.folder) { await call('reorderNote', d.path, file, tg.after); return; }
        await moveTo(d.path, tg.folder, { before: file, after: tg.after });
      } else if (tg.folder !== d.folder) await moveTo(d.path, tg.folder);
    } else {
      await call('reorderProject', d.folder, tg.folder, tg.after);
    }
  }
  list.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || drag) return;
    const row = e.target.closest('[data-drag]');
    if (!row || e.target.closest('button, input')) return;
    pend = { row, x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  window.addEventListener('pointermove', (e) => {
    if (drag) { dragMove(e.clientX, e.clientY); return; }
    if (pend && e.pointerId === pend.id && Math.hypot(e.clientX - pend.x, e.clientY - pend.y) > 5) {
      const p = pend;
      pend = null;
      beginDrag(p.row, p.x, p.y);
      dragMove(e.clientX, e.clientY);
    }
  });
  window.addEventListener('pointerup', () => { pend = null; if (drag) void dragEnd(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drag) { drag.target = null; void dragEnd(); }
  }, true);

  // ---------- resizing ----------
  const resizer = $('#sb-resizer');
  resizer.addEventListener('pointerdown', (e) => {
    resizer.setPointerCapture(e.pointerId);
    resizer.classList.add('on');
    const x0 = e.clientX;
    const w0 = ctx.settings().sidebarWidth || 264;
    let w = w0;
    const mv = (ev) => {
      w = Math.round(Math.min(520, Math.max(200, w0 + ev.clientX - x0)));
      document.documentElement.style.setProperty('--sb-width', `${w}px`);
    };
    const up = () => {
      resizer.classList.remove('on');
      resizer.removeEventListener('pointermove', mv);
      resizer.removeEventListener('pointerup', up);
      void api.setSettings({ sidebarWidth: w });
    };
    resizer.addEventListener('pointermove', mv);
    resizer.addEventListener('pointerup', up);
  });

  // ---------- toast ----------
  const toastEl = $('#notes-toast');
  let toastTimer = null;
  function toast(msg, undo) {
    clearTimeout(toastTimer);
    toastEl.innerHTML = `<span class="msg"></span>${undo ? `<button type="button">${esc(t('notes.undo'))}</button>` : ''}`;
    toastEl.querySelector('.msg').textContent = msg;
    toastEl.hidden = false;
    if (undo) toastEl.querySelector('button').onclick = () => { hideToast(); void undo(); };
    toastTimer = setTimeout(hideToast, undo ? 6000 : 3000);
  }
  function hideToast() { toastEl.hidden = true; }

  // ---------- reveal ----------
  async function reveal(p) {
    const info = noteInfo(p);
    if (!info) return;
    input.value = '';
    results = null;
    archiveView = info.archived;
    if (!info.archived) {
      const g = findGroup(info.folder);
      if (g && g.collapsed) await setCollapsed(info.folder, false);
    }
    await ctx.showSidebar();
    render();
    const row = list.querySelector(`.sb-note[data-path="${CSS.escape(p)}"]`);
    if (row) {
      row.scrollIntoView({ block: 'center' });
      row.classList.remove('flash');
      void row.offsetWidth;
      row.classList.add('flash');
    }
  }

  function expand(folder) {
    const g = findGroup(folder);
    if (g && g.collapsed) void setCollapsed(folder, false);
  }

  function startNewProject() {
    archiveView = false;
    input.value = '';
    results = null;
    editing = { kind: 'new', value: '', error: '' };
    render();
  }

  return {
    refresh, render, renderTitles, applyI18n, noteInfo, activeFolders, inboxName, folderLabel, openSearch, closePalette,
    showTabMenu, closeMenu, reveal, expand, toast, archiveNote, restoreNote, moveTo, createProject, startNewProject,
    get tree() { return tree; }
  };
}
