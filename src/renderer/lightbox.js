// lightbox.js: an image at its natural size over the whole window, from a click on an image in the
// preview or the editor. Esc, the close button or a click beside the image closes it.

let onClose = () => {};
let lastFocus = null;

const $ = (sel) => document.querySelector(sel);

export function initLightbox({ focusEditor }) {
  onClose = focusEditor;
  const box = $('#lightbox');
  if (!box) return;
  $('#lightbox-close').addEventListener('click', closeLightbox);
  // A click beside the image closes; a click on the image itself does nothing (scrolling it must work).
  box.addEventListener('click', (e) => { if (!(/** @type {HTMLElement} */ (e.target)).closest('img, button')) closeLightbox(); });
  window.addEventListener('keydown', (e) => {
    if (box.hidden || e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation();
    closeLightbox();
  }, true);
}

/** @param {string} src @param {string} [alt] */
export function openLightbox(src, alt = '') {
  const box = $('#lightbox');
  if (!box || !src) return;
  const img = /** @type {HTMLImageElement} */ ($('#lightbox-img'));
  img.src = src;
  img.alt = alt;
  lastFocus = document.activeElement;
  box.hidden = false;
  $('#lightbox-close').focus();
}

export function closeLightbox() {
  const box = $('#lightbox');
  if (!box || box.hidden) return;
  box.hidden = true;
  /** @type {HTMLImageElement} */ ($('#lightbox-img')).removeAttribute('src');
  if (lastFocus && lastFocus.isConnected && lastFocus !== document.body) /** @type {HTMLElement} */ (lastFocus).focus();
  else onClose();
}

export function lightboxOpen() { const box = $('#lightbox'); return !!box && !box.hidden; }
