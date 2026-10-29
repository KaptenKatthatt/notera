// images.js: images in the Write view, shown like Word shows a picture. An image link,
// `![Bild 1](bilder/login-error-1.jpg)`, is replaced by the image itself, scaled to the text
// column, and the cursor steps over it as over one character: the arrow keys land before or after
// it, never in the link's text, and Backspace or Delete next to it removes the whole image. A
// selection that reaches into the link from elsewhere (a search match in the file name) shows that
// link as text. A file that cannot be loaded shows a dashed box with the alt text and the file name.
import { EditorView, Decoration, WidgetType, ViewPlugin } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { imageLine, resolveImagePath, imageUrl, baseOf } from '../shared/imageLinks.js';
import { openLightbox } from './lightbox.js';

/** Natural sizes of images loaded so far, so a widget made again (the note reopened) takes its height at once. */
const sizes = new Map();
/**
 * URLs that failed to load, and when: shown as missing without asking for them again. A local
 * file is tried again after a while (it may have been put there since); a web image never.
 */
const failed = new Map();
const RETRY_LOCAL_MS = 30 * 1000;
function isFailed(src) {
  const at = failed.get(src);
  if (at === undefined) return false;
  if (src.startsWith('notera-file:') && Date.now() - at > RETRY_LOCAL_MS) { failed.delete(src); return false; }
  return true;
}

/** The dashed box for an image that is not there (also used by the preview). */
export function missingImageBox(alt, file) {
  const box = document.createElement('span');
  box.className = 'img-missing';
  box.textContent = [alt, file].filter(Boolean).join(' · ') || file;
  box.title = file;
  return box;
}

class ImageWidget extends WidgetType {
  /** @param {string} src @param {string} alt @param {string} file @param {boolean} selected */
  constructor(src, alt, file, selected) { super(); this.src = src; this.alt = alt; this.file = file; this.selected = selected; }
  /** @param {ImageWidget} other */
  same(other) { return other.src === this.src && other.alt === this.alt && other.file === this.file; }
  /** @param {ImageWidget} other */
  eq(other) { return this.same(other) && other.selected === this.selected; }
  /** Selecting or unselecting keeps the image element: only the outline changes. @param {HTMLElement} dom @param {EditorView} _view */
  updateDOM(dom, _view, from) {
    if (!(from instanceof ImageWidget) || !this.same(from)) return false;
    dom.classList.toggle('cm-image-selected', this.selected);
    return true;
  }
  ignoreEvent() { return true; }
  get estimatedHeight() {
    const s = sizes.get(this.src);
    return s ? Math.min(s.h, 400) : -1;
  }
  /** @param {EditorView} view */
  toDOM(view) {
    const wrap = document.createElement('span');
    wrap.className = this.selected ? 'cm-image cm-image-selected' : 'cm-image';
    if (isFailed(this.src)) { wrap.appendChild(missingImageBox(this.alt, this.file)); return wrap; }
    const img = document.createElement('img');
    img.alt = this.alt;
    img.title = [this.alt, this.file].filter(Boolean).join(' · ');
    img.draggable = false;
    const known = sizes.get(this.src);
    if (known) { img.width = known.w; img.height = known.h; }
    img.addEventListener('load', () => {
      sizes.set(this.src, { w: img.naturalWidth, h: img.naturalHeight });
      if (!known) { img.width = img.naturalWidth; img.height = img.naturalHeight; }
      view.requestMeasure();
    });
    img.addEventListener('error', () => {
      failed.set(this.src, Date.now());
      wrap.replaceChildren(missingImageBox(this.alt, this.file));
      view.requestMeasure();
    });
    img.addEventListener('click', (e) => { e.preventDefault(); openLightbox(this.src, this.alt); });
    img.src = this.src;
    wrap.appendChild(img);
    return wrap;
  }
}

/**
 * The images' decorations, and whether the text has any image link at all (shown or not).
 * @param {import('@codemirror/state').EditorState} state
 * @param {string | null} baseDir
 */
function build(state, baseDir) {
  const { doc, selection } = state;
  /** A selection end strictly inside the link: show it as text, so what was found or selected there is seen. */
  const reaching = (from, to) => selection.ranges.some((r) => (r.from > from && r.from < to) || (r.to > from && r.to < to));
  /** Selected as a whole: outlined, as in Word. */
  const covered = (from, to) => selection.ranges.some((r) => !r.empty && r.from <= from && r.to >= to);
  const widgets = [];
  let any = false;
  // Image nodes only: inside a code block, inline code or raw HTML an image link is text.
  syntaxTree(state).iterate({
    enter: (n) => {
      if (n.name !== 'Image') return;
      any = true;
      const im = imageLine(doc.sliceString(n.from, n.to));
      if (!im || reaching(n.from, n.to)) return false;
      const abs = resolveImagePath(im.href, baseDir);
      const src = abs ? imageUrl(abs) : im.target;
      if (!src) return false;
      widgets.push(Decoration.replace({ widget: new ImageWidget(src, im.alt, baseOf(abs || im.target), covered(n.from, n.to)) }).range(n.from, n.to));
      return false;
    }
  });
  return { decorations: Decoration.set(widgets), any };
}

/**
 * The extension for one tab: its images resolve against the note's folder (null for an untitled
 * tab, whose relative links stay unresolved and show as missing). The images are atomic, so the
 * cursor moves and deletes over each one in one step.
 * @param {string | null} baseDir
 */
export function imagePreviews(baseDir) {
  const plugin = ViewPlugin.fromClass(class {
    /** @param {EditorView} view */
    constructor(view) { this.set(build(view.state, baseDir)); }
    /** @param {{ decorations: import('@codemirror/view').DecorationSet, any: boolean }} r */
    set(r) { this.decorations = r.decorations; this.any = r.any; }
    /** @param {import('@codemirror/view').ViewUpdate} u */
    update(u) {
      // A moved cursor only matters to a text with images: it may select one or reach into its link.
      if (u.docChanged || (u.selectionSet && this.any) || syntaxTree(u.startState) !== syntaxTree(u.state)) this.set(build(u.state, baseDir));
    }
  }, {
    decorations: (p) => p.decorations,
    provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.decorations || Decoration.none)
  });
  // Above the hidden markers (markers.js), which replace the `![` and `](…)` inside the same link:
  // where two replacements overlap the one with the higher precedence is drawn.
  return Prec.high(plugin);
}

/** For tests: forget failed loads, so a file written since is tried again. */
export function resetImageCache() { failed.clear(); sizes.clear(); }
