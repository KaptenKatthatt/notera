// popups.js: the small menus that open from the status bar (line endings, encoding) and the
// formatting toolbar's drop-downs. One of them is open at a time; a click elsewhere or Escape
// closes it.

/**
 * @param {{ focusEditor: () => void }} ctx
 */
export function createPopups(ctx) {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function onDocMouseDown(e) { if (!$('#popup-menu').contains(e.target) && !e.target.closest('.tb-popup')) hide(); }
  function closeOnOutsideClick() { setTimeout(() => document.addEventListener('mousedown', onDocMouseDown), 0); }

  function closeToolbarPopups() {
    for (const p of $$('.tb-popup')) p.classList.remove('open');
    for (const b of $$('.tb-drop')) b.setAttribute('aria-expanded', 'false');
  }

  /** A menu above `anchor`. Items: { label, checked, onClick }. */
  function show(anchor, items) {
    const menu = $('#popup-menu');
    menu.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.textContent = it.label;
      b.classList.toggle('checked', !!it.checked);
      b.addEventListener('click', () => { hide(); it.onClick(); });
      menu.appendChild(b);
    }
    menu.hidden = false;
    const r = anchor.getBoundingClientRect();
    menu.style.left = `${Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)}px`;
    menu.style.top = `${r.top - menu.offsetHeight - 4}px`;
    closeOnOutsideClick();
  }

  function hide() {
    const menu = $('#popup-menu');
    const wasOpen = !menu.hidden;
    menu.hidden = true;
    document.removeEventListener('mousedown', onDocMouseDown);
    closeToolbarPopups();
    if (wasOpen) ctx.focusEditor();
  }

  /** Open or close the drop-down that belongs to a toolbar button. */
  function toggleToolbarPopup(button) {
    const popup = button.parentElement.querySelector('.tb-popup');
    const open = popup.classList.contains('open');
    hide();
    if (!open) { popup.classList.add('open'); button.setAttribute('aria-expanded', 'true'); closeOnOutsideClick(); }
  }

  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });

  return { show, hide, toggleToolbarPopup };
}
