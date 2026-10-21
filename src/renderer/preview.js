// preview.js: the rendered Markdown pane next to (or instead of) the editor, its scroll sync with
// the editor in split view, and printing.
import { renderMarkdown } from './markdown.js';
import { bindTaskCheckboxes } from './previewTasks.js';
import { missingImageBox } from './images.js';
import { openLightbox } from './lightbox.js';

const PREVIEW_DELAY_MS = 150;   // the preview re-renders this long after the last keystroke

/**
 * @param {{ getView: () => any, getActive: () => any, getBaseDir: () => string | null, t: () => (key: string) => string }} ctx
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
    // Images already on screen stay as they are: a re-render after every keystroke would otherwise
    // load each of them again and flash them blank meanwhile.
    const shown = new Map();
    for (const img of el.querySelectorAll('img')) if (img.complete && img.naturalWidth) shown.set(img.getAttribute('src'), img);
    el.innerHTML = renderMarkdown(text, { baseDir: ctx.getBaseDir() });
    for (const img of Array.from(el.querySelectorAll('img'))) {
      const old = shown.get(img.getAttribute('src'));
      if (!old) continue;
      old.alt = img.alt; old.title = img.title; old.dataset.file = img.dataset.file || '';
      img.replaceWith(old);
    }
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
    if (active.kind === 'md') { area.className = 'preview'; area.innerHTML = renderMarkdown(text, { baseDir: ctx.getBaseDir() }); }
    else { area.className = ''; area.innerHTML = ''; const pre = document.createElement('pre'); pre.textContent = text; area.appendChild(pre); }
    window.print();
  }

  // An image that cannot be loaded becomes a dashed box with its alt text and file name. The error
  // event does not bubble, so it is caught on the way down.
  $('#preview').addEventListener('error', (e) => {
    const img = /** @type {HTMLElement} */ (e.target);
    if (!(img instanceof HTMLImageElement)) return;
    img.replaceWith(missingImageBox(img.alt, img.dataset.file || img.getAttribute('src') || ''));
  }, true);
  // A click on an image shows it at full size; a linked image follows its link instead (app.js).
  $('#preview').addEventListener('click', (e) => {
    const img = /** @type {HTMLElement} */ (e.target).closest('img');
    if (!img || img.closest('a[href]')) return;
    e.preventDefault();
    openLightbox(img.currentSrc || img.src, img.alt);
  });

  return { schedule, render, syncScroll, print };
}
