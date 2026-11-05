'use strict';
// Dragging tabs between windows, the way Chrome does it. A tab pulled out of the tab strip becomes a
// window of its own that follows the mouse; the only tab of a window takes its window along. Over
// the tab strip of another window (or back over its own) that window shows the tab in its strip
// where it would land, and the dragged window steps aside; let go there and the tab moves in.
//
// The window the drag started in keeps the mouse captured until the button comes up, so it is the
// one that says when the drag ends (end()). Where the mouse is, main reads itself, ~60 times a second.

const TICK_MS = 16;
const SLACK = 14; // DIP above and below a tab strip that still counts as over it

/**
 * @param {{
 *   BrowserWindow: typeof import('electron').BrowserWindow,
 *   screen: import('electron').Screen,
 *   createWindow: (files: string[], source: any, reopen: any, opts: { inactive?: boolean }) => any,
 *   discardWindow: (win: any) => void
 * }} deps
 */
function createTabDrag({ BrowserWindow, screen, createWindow, discardWindow }) {
  /** webContents.id -> the tab strip's top and height in CSS px, as the window last reported it. */
  const strips = new Map();
  /** Windows, most recently focused first: the stand-in for which window is on top. */
  const order = [];
  let drag = null;

  function focused(win) {
    const i = order.indexOf(win);
    if (i >= 0) order.splice(i, 1);
    order.unshift(win);
  }
  function forget(win, id) {
    const i = order.indexOf(win);
    if (i >= 0) order.splice(i, 1);
    strips.delete(id);
    if (drag && (drag.win === win || drag.src === win)) finish(false);
    else if (drag && drag.target === win) drag.target = null;
  }
  function setStrip(id, r) {
    if (r && Number.isFinite(r.y) && Number.isFinite(r.height)) strips.set(id, { y: r.y, height: r.height });
  }

  // Tests can't move the real mouse, so they say where it is.
  const cursor = () => globalThis.__noteraCursor || screen.getCursorScreenPoint();

  /** The window whose tab strip is under p, and p's x in its page; null when p is over none. */
  function targetAt(p) {
    for (const w of byFocus()) {
      if (w.isDestroyed() || w === drag.win || !w.isVisible() || w.isMinimized()) continue;
      const c = w.getContentBounds();
      if (p.x < c.x || p.x >= c.x + c.width || p.y < c.y - SLACK || p.y >= c.y + c.height) continue;
      // The topmost window under the mouse decides, even when the mouse is not over its tab strip.
      const s = strips.get(w.webContents.id);
      if (!s || !s.height) return null;
      const z = w.webContents.getZoomFactor() || 1;
      const top = c.y + s.y * z - SLACK, bottom = c.y + (s.y + s.height) * z + SLACK;
      return p.y >= top && p.y <= bottom ? { win: w, x: (p.x - c.x) / z } : null;
    }
    return null;
  }

  function send(win, channel, payload) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
  // Out of sight but still there: hiding the window that holds the mouse would let go of it.
  function conceal(win, hidden) {
    if (win.isDestroyed() || drag.hidden === hidden) return;
    drag.hidden = hidden;
    win.setOpacity(hidden ? 0 : 1);
    win.setIgnoreMouseEvents(hidden);
  }

  function tick() {
    if (!drag) return;
    if (drag.win.isDestroyed()) { finish(false); return; }
    const p = cursor();
    if (drag.last && drag.last.x === p.x && drag.last.y === p.y) return;
    drag.last = { x: p.x, y: p.y };
    const t = targetAt(p);
    if (drag.target && (!t || t.win !== drag.target)) { send(drag.target, 'tabdrag:leave'); drag.target = null; }
    if (t) {
      drag.target = t.win;
      conceal(drag.win, true);
      send(t.win, 'tabdrag:hover', { x: t.x, name: drag.name, width: drag.width, grabX: drag.grabX, dirty: drag.dirty });
    } else {
      conceal(drag.win, false);
      drag.win.setPosition(Math.round(p.x - drag.offset.x), Math.round(p.y - drag.offset.y));
    }
  }

  /**
   * A tab has left the strip of the window that sent this. info.tab is what the tab needs to open
   * elsewhere; info.single says it was the window's only tab, so the window itself moves.
   * grabX/grabY: where the mouse holds the tab, in page px, as if it were the strip's first tab.
   */
  function start(sender, info = {}) {
    const src = BrowserWindow.fromWebContents(sender);
    if (drag || !src || !info.tab) return false;
    const z = sender.getZoomFactor() || 1;
    const p = cursor();
    let win, offset;
    if (info.single) {
      win = src;
      const wasMax = win.isMaximized();
      if (wasMax) win.unmaximize();
      const b = win.getBounds(), c = win.getContentBounds();
      offset = wasMax
        ? { x: Math.min((c.x - b.x) + info.grabX * z, b.width - 40), y: (c.y - b.y) + info.grabY * z }
        : { x: p.x - b.x, y: p.y - b.y };
    } else {
      const nb = src.getNormalBounds();
      win = createWindow([], src, { tabs: [info.tab], active: 0, bounds: { x: p.x, y: p.y, width: nb.width, height: nb.height } }, { inactive: true });
      const b = win.getBounds(), c = win.getContentBounds();
      offset = { x: (c.x - b.x) + info.grabX * z, y: (c.y - b.y) + info.grabY * z };
    }
    drag = {
      src, win, offset, tab: info.tab, target: null, hidden: false, last: null,
      name: String(info.name || ''), width: Number(info.width) || 160, grabX: Number(info.tabGrabX) || 20, dirty: !!info.dirty,
      timer: setInterval(tick, TICK_MS)
    };
    tick();
    return true;
  }

  /** The mouse button came up in the window the drag started in. */
  function end(sender) {
    if (!drag || drag.src.isDestroyed() || drag.src.webContents !== sender) return;
    drag.last = null;
    tick();
    finish(true);
  }

  function finish(commit) {
    if (!drag) return;
    const { win, target, tab, timer } = drag;
    clearInterval(timer);
    if (commit && target && !target.isDestroyed()) {
      send(target, 'tabdrag:drop', { tab });
      drag = null;
      target.focus();
      if (!win.isDestroyed()) discardWindow(win);
      return;
    }
    if (target) send(target, 'tabdrag:leave');
    if (!win.isDestroyed()) { conceal(win, false); win.focus(); }
    drag = null;
  }

  /** The open windows, most recently focused first. */
  function byFocus() {
    const all = BrowserWindow.getAllWindows();
    return [...order.filter((w) => all.includes(w)), ...all.filter((w) => !order.includes(w))];
  }

  return { start, end, focused, forget, setStrip, byFocus, get active() { return !!drag; } };
}

module.exports = { createTabDrag };
