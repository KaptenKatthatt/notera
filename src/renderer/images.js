// images.js: the image under its line in the Write view. A line that is nothing but an image,
// `![Bild 1](bilder/login-error-1.jpg)`, shows the image below it, scaled to the text column,
// while the cursor is on another line; on the cursor's line the plain text is there to edit. A
// file that cannot be loaded shows a dashed box with the alt text and the file name instead.
import { EditorView, Decoration, WidgetType } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { imageLine, resolveImagePath, imageUrl, baseOf } from '../shared/imageLinks.js';
import { openLightbox } from './lightbox.js';

/** Natural sizes of images loaded so far, so a widget made again (the cursor left the line) takes its height at once. */
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
  /** @param {string} src @param {string} alt @param {string} file */
  constructor(src, alt, file) { super(); this.src = src; this.alt = alt; this.file = file; }
  eq(other) { return other.src === this.src && other.alt === this.alt && other.file === this.file; }
  ignoreEvent() { return true; }
  get estimatedHeight() {
    const s = sizes.get(this.src);
    return s ? Math.min(s.h, 400) : -1;
  }
  /** @param {EditorView} view */
  toDOM(view) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-image';
    if (isFailed(this.src)) { wrap.appendChild(missingImageBox(this.alt, this.file)); return wrap; }
    const img = document.createElement('img');
    img.alt = this.alt;
    img.title = this.file;
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

/** Inside a code block or raw HTML, an image line is text, not an image. */
function inCode(state, pos) {
  let n = syntaxTree(state).resolveInner(pos, 1);
  for (; n; n = n.parent) if (/^(FencedCode|CodeBlock|HTMLBlock|InlineCode)$/.test(n.name)) return true;
  return false;
}

/** The line above a shown image reads as its caption (the alt text), not as a link. */
const captionLine = Decoration.line({ class: 'cm-image-line' });

function build(state, baseDir) {
  const { doc, selection } = state;
  const cursorLines = new Set();
  for (const r of selection.ranges) {
    for (let n = doc.lineAt(r.from).number, end = doc.lineAt(r.to).number; n <= end; n++) cursorLines.add(n);
  }
  const widgets = [];
  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    if (line.length < 5 || line.text.indexOf('![') < 0) continue;
    const im = imageLine(line.text);
    if (!im || cursorLines.has(n) || inCode(state, line.from + line.text.search(/\S/))) continue;
    const abs = resolveImagePath(im.href, baseDir);
    const src = abs ? imageUrl(abs) : im.target;
    if (!src) continue;
    widgets.push(captionLine.range(line.from));
    widgets.push(Decoration.widget({ widget: new ImageWidget(src, im.alt, baseOf(abs || im.target)), block: true, side: 1 }).range(line.to));
  }
  return Decoration.set(widgets);
}

/**
 * The extension for one tab: its images resolve against the note's folder (null for an untitled
 * tab, whose relative links stay unresolved and show as missing).
 * @param {string | null} baseDir
 */
export function imagePreviews(baseDir) {
  return EditorView.decorations.compute(['doc', 'selection'], (state) => build(state, baseDir));
}

/** For tests: forget failed loads, so a file written since is tried again. */
export function resetImageCache() { failed.clear(); sizes.clear(); }
