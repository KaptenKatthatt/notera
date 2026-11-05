// tabdrag.js — dragging tabs, like Chrome. Along the tab strip a tab follows the mouse and the
// others slide aside to make room (reorder). Pulled up or down out of the strip, or out of the
// window, it leaves: onDetach hands it to main, which makes it a window that follows the mouse (the
// only tab takes its window along), and this window holds the mouse until the button comes up
// (onDragEnd). A tab dragged in from another window shows in this strip where it would land
// (createTabDropZone). Pointer events, no drag&drop API. Listeners sit on #tabbar: renderTabs()
// empties #tabs at every render, so listeners on the tabs themselves would die at the first redraw.

const SLIDE = 'transform 150ms ease';
const PULL_OUT = 30; // px above or below the tab strip that pull a tab out of it

/** Move `el` so its left edge is at `left` (client px), wherever it sits in the DOM. */
function place(el, left) {
  el.style.transition = 'none';
  el.style.transform = 'none';
  const r = el.getBoundingClientRect();
  el.style.transform = 'translateX(' + (left - r.left) + 'px)';
}

/** Run `mutate` (which moves tabs in the DOM) and let the tabs other than `skip` slide to their new places. */
function slide(host, skip, mutate) {
  const els = Array.from(host.querySelectorAll('.tab')).filter((n) => n !== skip);
  const before = new Map(els.map((n) => [n, n.getBoundingClientRect().left]));
  mutate();
  const moved = [];
  for (const n of els) {
    if (!n.isConnected) continue;
    n.style.transition = 'none';
    n.style.transform = '';
    moved.push(n);
  }
  for (const n of moved) {
    const dx = before.get(n) - n.getBoundingClientRect().left;
    if (!dx) continue;
    n.style.transform = 'translateX(' + dx + 'px)';
    n.getBoundingClientRect();
    n.style.transition = SLIDE;
    n.style.transform = '';
  }
}

/** Put `el` where its center falls among the other tabs. */
function reorderAround(host, el, left) {
  place(el, left);
  const rect = el.getBoundingClientRect();
  const center = rect.left + rect.width / 2;
  const prev = el.previousElementSibling;
  if (prev && prev.classList.contains('tab')) {
    const r = prev.getBoundingClientRect();
    if (center < r.left + r.width / 2) { slide(host, el, () => host.insertBefore(el, prev)); place(el, left); return; }
  }
  const next = el.nextElementSibling;
  if (next && next.classList.contains('tab')) {
    const r = next.getBoundingClientRect();
    if (center > r.left + r.width / 2) { slide(host, el, () => host.insertBefore(el, next.nextSibling)); place(el, left); }
  }
}

/**
 * @param {HTMLElement} bar
 * @param {{
 *   onReorder: (order: string[]) => void,
 *   onDetach?: (tabId: string, grab: { grabX: number, grabY: number, tabGrabX: number, width: number }) => Promise<boolean> | boolean,
 *   onDragEnd?: () => void
 * }} handlers
 */
export function attachTabDrag(bar, { onReorder, onDetach, onDragEnd }) {
  const host = bar.querySelector('#tabs') || bar;
  let drag = null; // { el, tabId, pointerId, startX, startY, grabDx, grabDy, started, out }

  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || drag) return;
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.closest('.close')) return; // the close button does not start a drag
    const el = /** @type {HTMLElement | null} */ (target.closest('.tab'));
    if (!el || !host.contains(el) || el.classList.contains('phantom')) return;
    const r = el.getBoundingClientRect();
    drag = {
      el, tabId: el.dataset.id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY,
      grabDx: e.clientX - r.left, grabDy: e.clientY - r.top, started: false, out: false
    };
  });

  function pulledOut(x, y) {
    const b = bar.getBoundingClientRect();
    return y < b.top - PULL_OUT || y > b.bottom + PULL_OUT || x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight;
  }

  async function detach() {
    drag.out = true;
    const { el, tabId, grabDx, grabDy } = drag;
    const r = el.getBoundingClientRect();
    el.style.transform = '';
    el.classList.remove('dragging');
    const ok = await onDetach(tabId, {
      grabX: host.getBoundingClientRect().left + grabDx, grabY: r.top + grabDy, tabGrabX: grabDx, width: r.width
    });
    if (!ok && drag && drag.out) drag.out = false; // main said no: go on as a drag in the strip
  }

  bar.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId || drag.out) return;
    if (!drag.started) {
      if (Math.abs(e.clientX - drag.startX) < 4 && Math.abs(e.clientY - drag.startY) < 4) return;
      if (!drag.el.isConnected) { drag = null; return; }
      drag.started = true;
      drag.el.classList.add('dragging');
      try { bar.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ }
      // The only tab takes its window along at once.
      if (onDetach && host.querySelectorAll('.tab:not(.phantom)').length === 1) { void detach(); return; }
    }
    if (!drag.el.isConnected) { endDrag(false); return; } // renderTabs() replaced the tabs mid-drag
    if (onDetach && pulledOut(e.clientX, e.clientY)) { void detach(); return; }
    reorderAround(host, drag.el, e.clientX - drag.grabDx);
  });

  function endDrag(commit) {
    if (!drag) return;
    const { el, tabId, started, pointerId, out } = drag;
    drag = null;
    if (!started) return;
    try { bar.releasePointerCapture(pointerId); } catch { /* not captured */ }
    if (out) { if (onDragEnd) onDragEnd(); return; }
    el.classList.remove('dragging');
    if (!commit || !el.isConnected) { el.style.transform = ''; return; }
    // Settle into its slot, then hand over the order.
    const r = el.getBoundingClientRect();
    el.style.transform = 'none';
    const dx = r.left - el.getBoundingClientRect().left;
    el.style.transform = 'translateX(' + dx + 'px)';
    el.getBoundingClientRect();
    el.style.transition = SLIDE;
    el.style.transform = '';
    const order = Array.from(host.querySelectorAll('.tab:not(.phantom)')).map((n) => /** @type {HTMLElement} */ (n).dataset.id);
    if (order.includes(tabId)) onReorder(order);
  }

  bar.addEventListener('pointerup', () => endDrag(true));
  bar.addEventListener('pointercancel', () => endDrag(true));
  bar.addEventListener('lostpointercapture', () => endDrag(true));
}

/**
 * Where a tab dragged in from another window would land: a stand-in tab in the strip that follows
 * the mouse while the other tabs slide aside. take() removes it and says at which index it stood.
 * @param {HTMLElement} bar
 */
export function createTabDropZone(bar) {
  const host = bar.querySelector('#tabs') || bar;
  let ph = null;

  function make(name, width, dirty) {
    const el = document.createElement('div');
    el.className = 'tab active dragging phantom';
    el.setAttribute('aria-hidden', 'true');
    el.style.width = width + 'px';
    const n = document.createElement('span');
    n.className = 'name';
    n.textContent = name;
    el.appendChild(n);
    if (dirty) { const d = document.createElement('span'); d.className = 'dot'; el.appendChild(d); }
    const c = document.createElement('span');
    c.className = 'close';
    c.textContent = '×';
    el.appendChild(c);
    return el;
  }

  /** x: the mouse in client px; grabX: where on the tab it holds it. */
  function hover({ x, name, width, grabX, dirty }) {
    const left = x - grabX;
    if (!ph || !ph.isConnected) {
      ph = make(name, width, dirty);
      const tabs = Array.from(host.querySelectorAll('.tab'));
      const before = tabs.find((n) => { const r = n.getBoundingClientRect(); return left + width / 2 < r.left + r.width / 2; });
      slide(host, ph, () => host.insertBefore(ph, before || null));
      ph.style.zIndex = '6';
    }
    reorderAround(host, ph, left);
  }

  function leave() {
    if (!ph) return;
    const el = ph;
    ph = null;
    if (el.isConnected) slide(host, el, () => el.remove());
  }

  /** Remove the stand-in; its index among the tabs, or null when there was none. */
  function take() {
    if (!ph || !ph.isConnected) { ph = null; return null; }
    const i = Array.from(host.querySelectorAll('.tab')).indexOf(ph);
    ph.remove();
    ph = null;
    return i;
  }

  return { hover, leave, take };
}
