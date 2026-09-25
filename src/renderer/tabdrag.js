// tabdrag.js — dra i flikar: omordna i flikraden, eller släpp utanför fönstret
// för att lossa fliken till ett eget fönster (onDetach). Pointer events, ingen
// drag&drop-API. Delegation på #tabbar: renderTabs() tömmer #tabs vid varje
// render, så elementlyssnare hade dött vid första omritningen.
export function attachTabDrag(bar, { onReorder, onDetach }) {
  const host = bar.querySelector('#tabs') || bar;
  let drag = null; // { el, tabId, pointerId, startX, startY, grabDx, started, lastX, lastY }

  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || drag) return;
    if (e.target.closest('.close')) return; // stäng-knappen ska inte starta drag
    const el = e.target.closest('.tab');
    if (!el || !host.contains(el)) return;
    drag = {
      el,
      tabId: el.dataset.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      grabDx: e.clientX - el.getBoundingClientRect().left,
      started: false,
      lastX: e.clientX,
      lastY: e.clientY
    };
  });

  function place(el, desiredLeft) {
    // Fäst flikens vänsterkant på pekaren, oavsett var i DOM den ligger just nu.
    el.style.transform = 'none';
    const r = el.getBoundingClientRect();
    el.style.transform = 'translateX(' + (desiredLeft - r.left) + 'px)';
  }

  bar.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    if (!drag.started) {
      if (Math.abs(e.clientX - drag.startX) < 4 && Math.abs(e.clientY - drag.startY) < 4) return;
      if (!drag.el.isConnected) { drag = null; return; }
      drag.started = true;
      drag.el.classList.add('dragging');
      try { bar.setPointerCapture(e.pointerId); } catch {}
    }
    if (!drag.el.isConnected) { endDrag(false, e); return; } // renderTabs() rev DOM:en mitt i draget
    place(drag.el, e.clientX - drag.grabDx);
    const rect = drag.el.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const prev = drag.el.previousElementSibling;
    if (prev && prev.classList.contains('tab')) {
      const r = prev.getBoundingClientRect();
      if (center < r.left + r.width / 2) { host.insertBefore(drag.el, prev); place(drag.el, e.clientX - drag.grabDx); return; }
    }
    const next = drag.el.nextElementSibling;
    if (next && next.classList.contains('tab')) {
      const r = next.getBoundingClientRect();
      if (center > r.left + r.width / 2) { host.insertBefore(drag.el, next.nextSibling); place(drag.el, e.clientX - drag.grabDx); }
    }
  });

  function outsideWindow(x, y) {
    const m = 8;
    return x < -m || y < -m || x > window.innerWidth + m || y > window.innerHeight + m;
  }

  function endDrag(commit, e) {
    if (!drag) return;
    const { el, tabId, started, pointerId, lastX, lastY } = drag;
    drag = null;
    if (!started) return;
    el.classList.remove('dragging');
    el.style.transform = '';
    try { bar.releasePointerCapture(pointerId); } catch {}
    if (!commit || !el.isConnected) return;
    if (onDetach && outsideWindow(lastX, lastY)) { onDetach(tabId); return; }
    const order = Array.from(host.querySelectorAll('.tab')).map((n) => n.dataset.id);
    if (order.includes(tabId)) onReorder(order);
  }

  bar.addEventListener('pointerup', (e) => endDrag(true, e));
  bar.addEventListener('pointercancel', (e) => endDrag(false, e));
  bar.addEventListener('lostpointercapture', (e) => endDrag(true, e));
}
