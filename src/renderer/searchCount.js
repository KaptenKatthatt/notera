// Adds an Omawrite-style "current/total" counter to CodeMirror's search panel.
import { ViewPlugin } from '@codemirror/view';
import { getSearchQuery, searchPanelOpen } from '@codemirror/search';

function count(state) {
  const q = getSearchQuery(state);
  if (!q.valid || !q.search) return null;
  const main = state.selection.main;
  let total = 0, current = 0;
  const cursor = q.getCursor(state.doc);
  while (total < 5000) {
    const r = cursor.next();
    if (r.done) break;
    total++;
    if (r.value.from === main.from && r.value.to === main.to) current = total;
  }
  return { total, current };
}

export const searchCount = ViewPlugin.fromClass(
  class {
    constructor(view) { this.view = view; this.lastSearch = ''; this.render(); }
    update(u) {
      if (u.docChanged || u.selectionSet || u.transactions.length) this.render();
      // Omawrite jumps to the first match as you type; CodeMirror only highlights until Enter.
      const q = getSearchQuery(u.state);
      if (q.search !== this.lastSearch) {
        this.lastSearch = q.search;
        if (q.valid && q.search && searchPanelOpen(u.state)) queueMicrotask(() => this.selectFirst());
      }
    }
    selectFirst() {
      const state = this.view.state;
      const q = getSearchQuery(state);
      if (!q.valid || !q.search) return;
      const main = state.selection.main;
      let r = q.getCursor(state.doc, main.from).next();
      if (r.done) r = q.getCursor(state.doc, 0).next();
      if (r.done) return;
      const m = r.value;
      if (m.from === main.from && m.to === main.to) { this.render(); return; }
      this.view.dispatch({ selection: { anchor: m.from, head: m.to }, scrollIntoView: true, userEvent: 'select.search' });
    }
    render() {
      const panel = this.view.dom.querySelector('.cm-panel.cm-search');
      if (!panel || !searchPanelOpen(this.view.state)) return;
      let el = panel.querySelector('.cm-search-count');
      if (!el) {
        el = document.createElement('span');
        el.className = 'cm-search-count';
        const field = panel.querySelector('input[name="search"]');
        field?.insertAdjacentElement('afterend', el);
      }
      const c = count(this.view.state);
      el.textContent = c ? `${c.current}/${c.total}` : '';
    }
  }
);
