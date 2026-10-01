// quickPick.js: a VS Code-style quick pick. A box at the top of the window with a filter field
// and a list. Arrow keys move, Enter picks, Esc cancels. The command palette, the theme and mode
// pickers and the "New theme" name prompt all use it.

/**
 * @typedef {{ id: string, label: string, detail?: string, keys?: string, checked?: boolean }} PickItem
 * @typedef {{
 *   placeholder: string, items: PickItem[], initial?: string, emptyText?: string,
 *   freeText?: (query: string) => string,
 *   onHighlight?: (item: PickItem) => void, onPick: (item: PickItem | null, query: string) => void, onCancel?: () => void
 * }} PickOptions
 */

/**
 * How well `query` matches `text`: every query character in order, with a bonus for runs and for
 * word starts. Null when it does not match. Returns the matched positions for highlighting.
 * @param {string} query @param {string} text
 */
export function fuzzyMatch(query, text) {
  const q = query.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!q) return { score: 0, hits: [] };
  const s = text.toLowerCase();
  // A plain substring wins outright, earlier and at a word start better.
  const at = s.indexOf(q);
  if (at !== -1) {
    const start = at === 0 || /[\s:(/-]/.test(s[at - 1]);
    const exact = s.length === q.length ? 300 : 0;
    return { score: 1000 - at + (start ? 200 : 0) + exact - s.length * 0.1, hits: Array.from({ length: q.length }, (_, i) => at + i) };
  }
  const hits = [];
  let score = 0;
  let prev = -2;
  let i = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const j = s.indexOf(ch, i);
    if (j === -1) return null;
    score += j === prev + 1 ? 8 : 1;
    if (j === 0 || /[\s:(/-]/.test(s[j - 1])) score += 5;
    hits.push(j);
    prev = j;
    i = j + 1;
  }
  return { score, hits };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function marked(text, hits) {
  if (!hits || !hits.length) return esc(text);
  const set = new Set(hits);
  let out = '';
  for (let i = 0; i < text.length; i++) out += set.has(i) ? `<mark>${esc(text[i])}</mark>` : esc(text[i]);
  return out;
}

/**
 * @param {{ focusEditor: () => void }} ctx
 */
export function createQuickPick(ctx) {
  const root = document.createElement('div');
  root.id = 'quick-pick';
  root.hidden = true;
  root.innerHTML = '<div class="pal qp"><label class="sb-search"><input id="qp-q" type="text" autocomplete="off" spellcheck="false" /><kbd>Esc</kbd></label><div class="pal-list" id="qp-list" role="listbox"></div></div>';
  document.body.appendChild(root);
  const input = /** @type {HTMLInputElement} */ (root.querySelector('#qp-q'));
  const list = /** @type {HTMLElement} */ (root.querySelector('#qp-list'));

  /** @type {PickOptions | null} */
  let opts = null;
  /** @type {Array<{ item: PickItem, hits: number[] }>} */
  let shown = [];
  let sel = 0;
  let lastHighlight = null;

  function filter() {
    const q = input.value;
    const out = [];
    for (const item of opts.items) {
      const m = fuzzyMatch(q, item.label);
      if (m) out.push({ item, hits: m.hits, score: m.score });
    }
    if (q.trim()) out.sort((a, b) => b.score - a.score);
    return out;
  }

  function render(keepSelection = false) {
    const prevId = keepSelection && shown[sel] ? shown[sel].item.id : null;
    shown = filter();
    if (prevId) sel = Math.max(0, shown.findIndex((s) => s.item.id === prevId));
    sel = Math.min(Math.max(0, sel), Math.max(0, shown.length - 1));
    if (!shown.length) {
      const q = input.value.trim();
      const text = opts.freeText && q ? opts.freeText(q) : opts.emptyText || '';
      list.innerHTML = text ? `<div class="qp-empty">${esc(text)}</div>` : '';
      return;
    }
    list.innerHTML = shown.map(({ item, hits }, i) => `<div class="qp-item${i === sel ? ' sel' : ''}" role="option" aria-selected="${i === sel}" data-i="${i}">`
      + `<span class="qp-check">${item.checked ? '✓' : ''}</span>`
      + `<span class="qp-label">${marked(item.label, hits)}</span>`
      + (item.detail ? `<span class="qp-detail">${esc(item.detail)}</span>` : '')
      + (item.keys ? `<kbd class="qp-keys">${esc(item.keys)}</kbd>` : '')
      + '</div>').join('');
    const el = list.querySelector('.sel');
    if (el) el.scrollIntoView({ block: 'nearest' });
    highlight();
  }

  function highlight() {
    const cur = shown[sel] && shown[sel].item;
    if (!cur || cur === lastHighlight || !opts.onHighlight) return;
    lastHighlight = cur;
    opts.onHighlight(cur);
  }

  function move(delta) {
    if (!shown.length) return;
    sel = (sel + delta + shown.length) % shown.length;
    for (const el of list.querySelectorAll('.qp-item')) {
      const on = Number(/** @type {HTMLElement} */ (el).dataset.i) === sel;
      el.classList.toggle('sel', on);
      el.setAttribute('aria-selected', String(on));
      if (on) el.scrollIntoView({ block: 'nearest' });
    }
    highlight();
  }

  function finish(picked) {
    const o = opts;
    const query = input.value.trim();
    close(false);
    if (!o) return;
    if (picked === undefined) { if (o.onCancel) o.onCancel(); ctx.focusEditor(); return; }
    o.onPick(picked, query);
  }

  /** @param {PickOptions} o */
  function open(o) {
    // A picker opened over another one cancels it, so the one before can undo its preview.
    const prev = opts;
    opts = null;
    if (prev && prev.onCancel) prev.onCancel();
    opts = o;
    lastHighlight = null;
    input.value = '';
    input.placeholder = o.placeholder;
    root.hidden = false;
    shown = filter();
    sel = Math.max(0, o.initial ? shown.findIndex((s) => s.item.id === o.initial) : 0);
    render();
    input.focus();
  }

  function close(refocus = true) {
    root.hidden = true;
    opts = null;
    if (refocus) ctx.focusEditor();
  }

  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (!opts) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'PageDown') { e.preventDefault(); move(Math.min(8, shown.length - 1 - sel) || 0); }
    else if (e.key === 'PageUp') { e.preventDefault(); move(-Math.min(8, sel) || 0); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const cur = shown[sel] && shown[sel].item;
      if (cur) finish(cur);
      else if (opts.freeText && input.value.trim()) finish(null);
    } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(undefined); }
  });
  list.addEventListener('mousedown', (e) => {
    const el = /** @type {HTMLElement | null} */ (e.target instanceof Element ? e.target.closest('.qp-item') : null);
    if (!el) return;
    e.preventDefault();
    sel = Number(el.dataset.i);
    finish(shown[sel].item);
  });
  root.addEventListener('mousedown', (e) => { if (e.target === root) finish(undefined); });

  return { open, close, get isOpen() { return !root.hidden; }, refresh: () => { if (opts) render(true); } };
}
