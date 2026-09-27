// preview.js: the rendered Markdown pane next to (or instead of) the editor, its scroll sync with
// the editor in split view, and printing.
import { renderMarkdown } from './markdown.js';
import { bindTaskCheckboxes } from './previewTasks.js';

const PREVIEW_DELAY_MS = 150;   // the preview re-renders this long after the last keystroke

/**
 * @param {{ getView: () => any, getActive: () => any, t: () => (key: string) => string }} ctx
 */
export function createPreview(ctx) {
  const $ = (sel) => document.querySelector(sel);
  let timer = null;

  function schedule(delay = PREVIEW_DELAY_MS) {
    clearTimeout(timer);
    timer = setTimeout(render, delay);
  }

  function render() {
    const active = ctx.getActive();
    if (!active) return;
    const mode = $('#main').dataset.view;
    if (mode === 'editor' || active.kind !== 'md') return;
    const view = ctx.getView();
    const text = view.state.doc.toString();
    const el = $('#preview');
    if (!text.trim()) { el.classList.add('empty'); el.textContent = ctx.t()('ui.emptyPreview'); return; }
    el.classList.remove('empty');
    el.innerHTML = renderMarkdown(text);
    bindTaskCheckboxes(el, view);
  }

  function syncScroll() {
    const pane = $('#preview-pane');
    if ($('#main').dataset.view !== 'split') return;
    const sc = ctx.getView().scrollDOM;
    const max = sc.scrollHeight - sc.clientHeight;
    if (max <= 0) return;
    const ratio = sc.scrollTop / max;
    pane.scrollTop = ratio * (pane.scrollHeight - pane.clientHeight);
  }

  /** Print the active tab: rendered Markdown for .md, plain text for .txt. */
  function print() {
    const active = ctx.getActive();
    if (!active) return;
    const area = $('#print-area');
    const text = ctx.getView().state.doc.toString();
    if (active.kind === 'md') { area.className = 'preview'; area.innerHTML = renderMarkdown(text); }
    else { area.className = ''; area.innerHTML = ''; const pre = document.createElement('pre'); pre.textContent = text; area.appendChild(pre); }
    window.print();
  }

  return { schedule, render, syncScroll, print };
}
