// imageInsert.js: images into a note. From the clipboard (Ctrl+V with a screenshot on it), files
// dropped on the window, or Format > Insert image…: the file is written into the note's images
// folder (main/images.js names it after the note's title) and `![Bild N](bilder/name.jpg)` goes
// in at the cursor on a line of its own. Everything but jpg, gif and svg is converted to JPEG
// here, on a canvas, since the window's Chromium decodes every image type there is.
import { imageLinks, insertImageText } from '../shared/imageLinks.js';

const JPEG_QUALITY = 0.85;
const KEEP_AS_IS = new Set(['jpg', 'jpeg', 'gif', 'svg']);

/** The extension a file name has, lower-cased, or '' . */
function extOf(name) { const m = /\.([a-z0-9]+)$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }

/** True for a File (clipboard, drop) that is an image by type or name. */
export function isImageFile(file) {
  return /^image\//.test(file.type || '') || /\.(jpe?g|png|gif|webp|bmp|avif|svg)$/i.test(file.name || '');
}

/** Draw a file on a white canvas and encode it as JPEG. Throws for a file Chromium cannot decode. */
async function toJpeg(file) {
  const bmp = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width; canvas.height = bmp.height;
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height); // transparency becomes white, not black
    g.drawImage(bmp, 0, 0);
    const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', JPEG_QUALITY));
    return new Uint8Array(await blob.arrayBuffer());
  } finally { bmp.close(); }
}

/** The bytes to write and their extension: jpg, gif and svg as they are, everything else as JPEG. */
export async function prepareImage(file) {
  const ext = extOf(file.name) || (file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/gif' ? 'gif' : file.type === 'image/svg+xml' ? 'svg' : 'png');
  if (KEEP_AS_IS.has(ext)) return { ext: ext === 'jpeg' ? 'jpg' : ext, bytes: new Uint8Array(await file.arrayBuffer()) };
  return { ext: 'jpg', bytes: await toJpeg(file) };
}

/**
 * @param {{
 *   api: any, t: () => (key: string, vars?: object) => string, getView: () => any, getActive: () => any,
 *   titleOf: (tab: any) => string, ensureFile: (tab: any) => Promise<boolean>, toast: (msg: string) => void, afterInsert: () => void
 * }} ctx
 */
export function createImageInserter(ctx) {
  /** @type {(key: string, vars?: object) => string} */
  const t = (key, vars) => ctx.t()(key, vars);

  /** Put `![alt](link)` into the active tab at the cursor, on a line of its own. */
  function insertLink(view, link) {
    const { from, to } = view.state.selection.main;
    if (from !== to) view.dispatch({ changes: { from, to, insert: '' }, selection: { anchor: from } });
    const doc = view.state.doc.toString();
    const alt = t('ui.imageAlt', { n: imageLinks(doc).length + 1 });
    const r = insertImageText(doc, from, `![${alt}](${link})`);
    view.dispatch({ changes: { from: r.from, to: r.to, insert: r.insert }, selection: { anchor: r.cursor }, scrollIntoView: true, userEvent: 'input' });
  }

  /**
   * Add image files to the active Markdown tab. An untitled tab becomes a note first (ctx.ensureFile);
   * without a file to sit next to, nothing happens and a toast says why.
   * @param {File[]} files
   */
  async function addFiles(files) {
    const tab = ctx.getActive();
    if (!tab || tab.kind !== 'md' || tab.readOnly || !files.length) return false;
    if (!tab.path && !(await ctx.ensureFile(tab))) { ctx.toast(t('ui.imageSaveFirst')); return false; }
    const view = ctx.getView();
    for (const file of files) {
      let prepared;
      try { prepared = await prepareImage(file); } catch { ctx.toast(t('ui.imageUnsupported', { name: file.name || 'image' })); continue; }
      if (ctx.getActive() !== tab || !tab.path) return false; // the tab went away meanwhile
      const r = await ctx.api.images.save({ notePath: tab.path, bytes: prepared.bytes, ext: prepared.ext, title: ctx.titleOf(tab) });
      if (!r || !r.ok) { ctx.toast(t('ui.imageFailed', { error: (r && r.error) || '?' })); continue; }
      insertLink(view, r.link);
    }
    view.focus();
    ctx.afterInsert();
    return true;
  }

  /** Format > Insert image…: a file dialog, then the same path as a drop. */
  async function pick() {
    const tab = ctx.getActive();
    if (!tab || tab.kind !== 'md' || tab.readOnly) return;
    const picked = await ctx.api.images.pick();
    if (!picked || !picked.length) { ctx.getView().focus(); return; }
    await addFiles(picked.map((f) => new File([f.bytes], f.name)));
  }

  return { addFiles, pick, insertLink };
}
