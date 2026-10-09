// historyDialog.js: File > Version history. Lists the versions main keeps of a file (history.js),
// shows the chosen one, and resolves with its text when the user restores it.

/**
 * @param {{ api: any, t: () => (key: string, vars?: object) => string, locale: () => string }} ctx
 */
export function createHistoryDialog(ctx) {
  const $ = (sel) => /** @type {HTMLElement} */ (document.querySelector(sel));
  const dlg = /** @type {HTMLDialogElement} */ ($('#dlg-history'));
  const listEl = $('#hist-list');
  const preview = $('#hist-preview');
  const restoreBtn = /** @type {HTMLButtonElement} */ ($('#hist-restore'));
  let state = null; // { path, current, readOnly, versions, sel, text }

  const t = (k, v) => ctx.t()(k, v);
  const num = (n) => new Intl.NumberFormat(ctx.locale()).format(n);

  /** "Today 14:32", "Yesterday 09:10", "3 Oct 18:00" (with the year when it is not this one). */
  function when(time) {
    const d = new Date(time);
    const loc = ctx.locale() === 'sv' ? 'sv-SE' : 'en-GB';
    const hm = d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(new Date()) - day(d)) / 86400000);
    if (diff === 0) return t('history.today', { time: hm });
    if (diff === 1) return t('history.yesterday', { time: hm });
    const opts = /** @type {Intl.DateTimeFormatOptions} */ ({ day: 'numeric', month: 'short' });
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return `${d.toLocaleDateString(loc, opts)} ${hm}`;
  }

  function delta(chars) {
    const d = chars - state.current.length;
    if (d === 0) return t('history.sameLength');
    return d > 0 ? t('history.more', { n: num(d) }) : t('history.fewer', { n: num(-d) });
  }

  function renderList() {
    listEl.innerHTML = '';
    state.versions.forEach((v, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hist-item' + (i === state.sel ? ' sel' : '');
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(i === state.sel));
      b.dataset.i = String(i);
      const w = document.createElement('span'); w.className = 'when'; w.textContent = when(v.time);
      const c = document.createElement('span'); c.className = 'delta'; c.textContent = delta(v.chars);
      b.append(w, c);
      listEl.appendChild(b);
    });
    const sel = listEl.querySelector('.sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  async function select(i) {
    if (!state || i < 0 || i >= state.versions.length) return;
    state.sel = i;
    renderList();
    const v = state.versions[i];
    const text = await ctx.api.history.read(state.path, v.id);
    if (!state || state.sel !== i) return;
    state.text = text;
    preview.textContent = text === null ? '' : text;
    preview.scrollTop = 0;
    const same = text === state.current;
    restoreBtn.disabled = text === null || same || state.readOnly;
    restoreBtn.textContent = same ? t('history.same') : t('history.restore');
  }

  listEl.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('.hist-item');
    if (b) void select(Number(/** @type {HTMLElement} */ (b).dataset.i));
  });
  listEl.addEventListener('keydown', (e) => {
    if (!state) return;
    const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[e.key];
    if (step) { e.preventDefault(); void select(Math.max(0, Math.min(state.versions.length - 1, state.sel + step))); }
    else if (e.key === 'Home') { e.preventDefault(); void select(0); }
    else if (e.key === 'End') { e.preventDefault(); void select(state.versions.length - 1); }
  });
  $('#hist-folder').addEventListener('click', () => { if (state) void ctx.api.history.showFolder(state.path); });

  /**
   * Show the versions of a file. Resolves with { text, time } of the version to restore, or null.
   * @param {{ path: string, name: string, current: string, readOnly: boolean }} opts
   */
  async function open({ path, name, current, readOnly }) {
    const versions = await ctx.api.history.list(path);
    state = { path, current, readOnly, versions, sel: 0, text: null };
    $('#hist-of').textContent = t('history.of', { name });
    const none = !versions.length;
    $('#hist-body').hidden = none;
    $('#hist-empty').hidden = !none;
    const note = $('#hist-note');
    note.hidden = !readOnly || none;
    note.textContent = readOnly ? t('history.archived') : '';
    restoreBtn.hidden = none;
    restoreBtn.disabled = true;
    restoreBtn.textContent = t('history.restore');
    preview.textContent = '';
    listEl.innerHTML = '';
    dlg.returnValue = '';
    dlg.showModal();
    if (!none) { await select(0); listEl.focus(); }
    const answer = await new Promise((res) => dlg.addEventListener('close', () => res(dlg.returnValue), { once: true }));
    const s = state;
    state = null;
    if (answer !== 'restore' || !s || s.text === null || s.readOnly) return null;
    return { text: s.text, time: when(s.versions[s.sel].time) };
  }

  return { open, isOpen: () => dlg.open };
}
