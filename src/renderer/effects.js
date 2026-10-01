// effects.js: the built-in theme effects and the cursor effect. A theme switches effects on in
// notera.effects (see THEMES.md); this turns them into classes and custom properties on <html>
// that styles.css reads. The cursor effect (what happens where you type) is the user's own
// setting, with the theme's suggestion as the default: letter effects mark the letters just typed
// so styles.css can draw a glowing copy over them, canvas effects are drawn here. Nothing here
// runs theme code: a theme can only pick effects and set their parameters.
//
// Everything that moves is cheap to draw: the letter copies animate only opacity, transform and
// filter (the compositor runs those), the canvas is at 1x with pre-rendered glow sprites instead
// of shadowBlur, and its frame loop runs only while something moves. Lifetimes are in
// milliseconds, so an effect takes as long at 144 Hz as at 60.
//
// Editor and preview (Läs) get separate classes (fx-e-*, fx-r-*) because split view shows both
// at once and a theme's `read.effects` may differ from its editor effects.
import { ViewPlugin, Decoration, EditorView } from '@codemirror/view';
import { StateField, StateEffect, Prec, findClusterBreak } from '@codemirror/state';
import { normalizeEffects, deepMerge, CURSOR_EFFECTS } from '../shared/themeFormat.js';

const FX_CLASS = /^fx-/;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * The cursor effect now on, read by the editor plugins on every keystroke; null when off.
 * @type {null | { id: string, kind: string, [param: string]: any }}
 */
let typing = null;
let isLightVariant = false;
/** Resolved colours for the canvas effects; filled on the first burst after an update. */
let palette = null;

/**
 * @param {{ onChange?: () => void }} [ctx]
 */
export function createEffects(ctx = {}) {
  const root = document.documentElement;
  let last = { notera: {}, read: {}, enabled: true, view: 'editor', type: 'light' };

  function set(name, value) { root.style.setProperty(name, value); }
  function clear() {
    for (const c of [...root.classList]) if (FX_CLASS.test(c)) root.classList.remove(c);
    for (const p of [...root.style]) if (p.startsWith('--fx-')) root.style.removeProperty(p);
    typing = null;
    palette = null;
  }

  /**
   * @param {{ notera: any, read: any, enabled: boolean, view: string, type: string, cursorEffect?: string }} next
   */
  function update(next) {
    last = next;
    clear();
    isLightVariant = next.type !== 'dark';
    // Glowing headings get a core mixed toward white (dark) or black (light); see styles.css.
    set('--fx-core', isLightVariant ? '#000000' : '#ffffff');
    const raw = next.notera && next.notera.effects;
    const motion = !reducedMotion.matches;
    // The cursor effect is the user's: Theme effects off drops only the theme's suggestion.
    const choice = next.cursorEffect && next.cursorEffect !== 'theme' ? next.cursorEffect : null;
    if (!next.enabled) {
      if (choice && motion) startTyping(normalizeEffects({}, { cursorEffect: choice }).typing);
      if (ctx.onChange) ctx.onChange();
      return;
    }
    const e = normalizeEffects(raw, { cursorEffect: choice });
    const r = normalizeEffects(deepMerge(raw || {}, (next.read && next.read.effects) || {}));
    const add = (c) => root.classList.add(c);

    /** @type {Array<[string, ReturnType<typeof normalizeEffects>]>} */
    const sides = [['e', e], ['r', r]];
    for (const [side, fx] of sides) {
      if (fx.glow) {
        add(`fx-${side}-glow-${fx.glow.target}`);
        set(`--fx-glow-${side}`, String(fx.glow.strength));
        if (fx.glow.color) set(`--fx-glow-color-${side}`, fx.glow.color);
      }
      if (fx.gradient) {
        for (const n of fx.gradient.levels) add(`fx-${side}-grad-${n}`);
        set(`--fx-grad-${side}`, `linear-gradient(90deg, ${fx.gradient.colors.join(', ')})`);
        set(`--fx-grad-glow-${side}`, fx.gradient.colors[0]);
      }
    }
    if (e.cursor) {
      add(`fx-cursor-${e.cursor.style}`);
      if (e.cursor.glow > 0) { add('fx-cursor-glow'); set('--fx-cursor-glow', String(e.cursor.glow)); }
      if (e.cursor.smooth && motion) add('fx-cursor-smooth');
    }
    if (e.typing && motion) startTyping(e.typing);
    // The background belongs to the window, so it follows the view: Läs alone uses read's.
    const bg = (next.view === 'preview' ? r : e).background;
    if (bg.grid || bg.sun) add('fx-bg');
    if (bg.grid) {
      add('fx-grid');
      if (bg.grid.color) set('--fx-grid-color', bg.grid.color);
      set('--fx-grid-opacity', String(bg.grid.opacity));
      set('--fx-grid-duration', `${(6 - bg.grid.speed * 5).toFixed(2)}s`);
      if (motion && bg.grid.speed > 0) add('fx-grid-move');
    }
    if (bg.sun) {
      add('fx-sun');
      const [a, b] = bg.sun.colors.length >= 2 ? bg.sun.colors : ['#fede5d', '#ff7edb'];
      set('--fx-sun-a', a); set('--fx-sun-b', b);
      set('--fx-sun-opacity', String(bg.sun.opacity));
    }
    if (bg.scanlines > 0) { add('fx-scanlines'); set('--fx-scan', String(bg.scanlines)); }
    if (bg.vignette > 0) { add('fx-vignette'); set('--fx-vig', String(bg.vignette)); }
    if (ctx.onChange) ctx.onChange();
  }

  /** @param {{ id: string, [param: string]: any }} fx */
  function startTyping(fx) {
    typing = { ...fx, kind: CURSOR_EFFECTS[fx.id].kind };
    root.classList.add(`fx-type-${fx.id}`);
    if (fx.id === 'phosphor' || fx.id === 'phosphorTrail') {
      // A white flash vanishes on a light page, so there the letter flashes in its own colour
      // with a wider halo instead.
      set('--fx-ph-color', fx.color || (isLightVariant ? 'currentColor' : '#ffffff'));
      set('--fx-ph-strength', String(fx.strength * (isLightVariant ? 1.8 : 1)));
    }
    if (fx.id === 'laser') set('--fx-laser', fx.color);
  }

  reducedMotion.addEventListener('change', () => update(last));
  return { update, get typing() { return typing; } };
}

// ---------- the effects canvas ----------
/** @type {HTMLCanvasElement | null} */
let canvas = null;
/** @type {CanvasRenderingContext2D | null} */
let g = null;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.id = 'fx-particles';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  g = canvas.getContext('2d');
  // At 1x, not devicePixelRatio: everything drawn here is a soft glow, and a full-window canvas at
  // 2x is four times the pixels to clear, draw and hand to the compositor every frame.
  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  window.addEventListener('resize', resize);
  resize();
}

/** "r, g, b" of a CSS colour, via the canvas's own colour parser; null if it cannot parse it. */
function rgbOf(color) {
  if (!g) return null;
  g.fillStyle = '#000001';
  g.fillStyle = color;
  const v = String(g.fillStyle);
  if (v === '#000001') return null;
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
  if (hex) return hex.slice(1).map((h) => parseInt(h, 16)).join(', ');
  const rgba = /^rgba?\(([^,]+),([^,]+),([^,)]+)/.exec(v);
  return rgba ? rgba.slice(1).map((n) => n.trim()).join(', ') : null;
}

/** Pre-rendered glow dots, one per colour: drawImage of a sprite instead of shadowBlur. */
const sprites = new Map();
function sprite(rgb) {
  let c = sprites.get(rgb);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.18, `rgb(${rgb})`); gr.addColorStop(0.32, `rgb(${rgb})`);
  gr.addColorStop(0.55, `rgba(${rgb}, 0.33)`); gr.addColorStop(1, `rgba(${rgb}, 0)`);
  x.fillStyle = gr;
  x.fillRect(0, 0, 32, 32);
  sprites.set(rgb, c);
  return c;
}
/** A soft halo for the pulse around the cursor: a white core on a dark page, none on a light one. */
function halo(rgb) {
  const key = `halo ${rgb} ${isLightVariant}`;
  let c = sprites.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, isLightVariant ? `rgb(${rgb})` : '#ffffff'); gr.addColorStop(0.3, `rgba(${rgb}, 0.85)`);
  gr.addColorStop(0.62, `rgba(${rgb}, 0.3)`); gr.addColorStop(1, `rgba(${rgb}, 0)`);
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  sprites.set(key, c);
  return c;
}

/** True for a colour that reads as a colour: not grey, black or white, which glow like smudges. */
function vivid(rgb) {
  const [r, gg, b] = rgb.split(',').map((v) => Number(v) / 255);
  const max = Math.max(r, gg, b), min = Math.min(r, gg, b);
  const l = (max + min) / 2;
  const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  return sat > 0.3 && l > 0.2 && l < 0.85;
}

/**
 * The colours canvas effects use when the theme gives none: the accent, heading and cursor
 * colours that are vivid (a near-black heading colour on a light page would draw soot), else the
 * accent.
 */
function colorsFor(fx) {
  if (!palette) {
    const cs = getComputedStyle(document.documentElement);
    const rgb = (n) => rgbOf(cs.getPropertyValue(n).trim() || 'transparent');
    const accent = rgb('--accent') || '255, 126, 219';
    const many = [...new Set(['--accent', '--md-h', '--md-h2', '--md-link', '--caret'].map(rgb).filter((c) => c && vivid(c)))];
    const caret = rgb('--caret');
    palette = { many: many.length ? many : [accent], caret: caret && vivid(caret) ? caret : accent };
  }
  if (fx.colors && fx.colors.length) return fx.colors.map(rgbOf).filter(Boolean);
  if (fx.color) return [rgbOf(fx.color) || palette.caret];
  return fx.id === 'pulse' ? [palette.caret] : palette.many;
}

/**
 * Everything on the canvas is one of these: a particle (a sprite that moves), a ring, a halo, a
 * beam or a sight line. `t` counts down from `life` in ms. Velocities are in px per 1/60 s, as in
 * the cursor lab the effects were tuned in.
 * @typedef {{ type: 'dot', x: number, y: number, vx: number, vy: number, g: number, drag: number, size: number, rgb: string }} Dot
 * @typedef {{ type: 'ring', x: number, y: number, rgb: string }} Ring
 * @typedef {{ type: 'halo', x: number, y: number, w: number, h: number, rgb: string }} Halo
 * @typedef {{ type: 'beam', x: number, y: number, right: number, rgb: string }} Beam
 * @typedef {{ type: 'sight', x: number, y: number, left: number, right: number, rgb: string }} Sight
 * @typedef {{ type: 'trail', x0: number, y0: number, h0: number, x1: number, y1: number, h1: number, w: number, alpha: number, rgb: string }} Trail
 * @type {Array<(Dot | Ring | Halo | Beam | Sight | Trail) & { t: number, life: number, clip: DOMRect }>}
 */
const items = [];
let raf = 0;
let lastT = 0;
const FRAME = 1000 / 60;

function kick() {
  if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); }
}

function frame(now) {
  raf = 0;
  if (!g || !canvas) return;
  const dt = Math.min(50, now - lastT);
  lastT = now;
  const k = dt / FRAME;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.globalCompositeOperation = isLightVariant ? 'source-over' : 'lighter';
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    it.t -= dt;
    if (it.t <= 0) { items.splice(i, 1); continue; }
    const a = it.t / it.life;
    g.save();
    g.beginPath();
    g.rect(it.clip.left, it.clip.top, it.clip.width, it.clip.height);
    g.clip();
    if (it.type === 'dot') {
      it.x += it.vx * k; it.y += it.vy * k; it.vy += it.g * k; it.vx *= it.drag ** k;
      g.globalAlpha = a;
      const r = it.size * (0.5 + a * 0.5) * 3.2;
      g.drawImage(sprite(it.rgb), it.x - r, it.y - r, r * 2, r * 2);
    } else if (it.type === 'ring') {
      const r = 4 + (1 - a) * 12;
      g.strokeStyle = `rgb(${it.rgb})`;
      g.beginPath(); g.arc(it.x, it.y, r, 0, Math.PI * 2);
      g.globalAlpha = a * 0.25; g.lineWidth = 5; g.stroke();
      g.globalAlpha = a * 0.9; g.lineWidth = 1.5; g.stroke();
    } else if (it.type === 'halo') {
      // Flares up around the cursor and shrinks back into it: scale 1.15 to 0.6 while it fades.
      const s = 0.6 + 0.55 * a;
      const w = it.w * s, h = it.h * s;
      g.globalAlpha = a;
      // Blended normally even on a dark page: added up, the halo would saturate into a solid blot.
      g.globalCompositeOperation = 'source-over';
      g.drawImage(halo(it.rgb), it.x - w, it.y - h, w * 2, h * 2);
    } else if (it.type === 'beam') {
      g.beginPath(); g.moveTo(it.right, it.y); g.lineTo(it.x, it.y);
      g.globalAlpha = a * 0.3; g.strokeStyle = `rgb(${it.rgb})`; g.lineWidth = 6; g.stroke();
      g.globalAlpha = a; g.lineWidth = 1.8; g.stroke();
      g.globalAlpha = a * 0.9; g.strokeStyle = '#ffd6d6'; g.lineWidth = 0.6; g.stroke();
      g.globalAlpha = a;
      g.drawImage(sprite(it.rgb), it.x - 9, it.y - 9, 18, 18);
    } else if (it.type === 'trail') {
      // A quad from the old cursor box to the new one, fading from nothing at the old end.
      const inset = it.h0 * 0.17;
      const gr = g.createLinearGradient(it.x0, it.y0 + it.h0 / 2, it.x1, it.y1 + it.h1 / 2);
      gr.addColorStop(0, `rgba(${it.rgb}, 0)`);
      gr.addColorStop(1, `rgba(${it.rgb}, ${it.alpha * a})`);
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(it.x0, it.y0 + inset);
      g.lineTo(it.x0 + it.w, it.y0 + it.h0 - inset);
      g.lineTo(it.x1 + it.w, it.y1 + it.h1);
      g.lineTo(it.x1, it.y1);
      g.closePath();
      g.fill();
    } else {
      const w = it.right - it.left;
      const at = Math.min(Math.max((it.x - it.left) / w, 0.01), 0.99);
      const gr = g.createLinearGradient(it.left, 0, it.right, 0);
      gr.addColorStop(0, `rgba(${it.rgb}, 0)`);
      gr.addColorStop(at, `rgba(${it.rgb}, ${a})`);
      gr.addColorStop(1, `rgba(${it.rgb}, 0)`);
      g.globalAlpha = 1; g.fillStyle = gr;
      g.fillRect(it.left, it.y - 0.75, w, 1.5);
      g.globalAlpha = a * 0.35; g.fillRect(it.left, it.y - 3, w, 6);
      g.globalAlpha = a;
      g.drawImage(sprite(it.rgb), it.x - 5, it.y - 5, 10, 10);
    }
    g.restore();
  }
  g.globalAlpha = 1;
  // The loop stops when nothing moves; the next keystroke starts it again.
  if (items.length) raf = requestAnimationFrame(frame);
  else g.clearRect(0, 0, canvas.width, canvas.height);
}

const rand = Math.random;
/** Frames at 60 Hz to ms. */
const ms = (frames) => frames * FRAME;

/**
 * The canvas part of the cursor effect, at the cursor: `x` its left edge, `top`/`bottom` its line,
 * `w` its width, `clip` the editor's scroller (nothing is drawn over the toolbar), `right` the
 * text column's right edge.
 */
function burst(fx, c) {
  ensureCanvas();
  const colors = colorsFor(fx);
  let ci = 0;
  const next = () => colors[ci++ % colors.length];
  const mid = (c.top + c.bottom) / 2;
  const add = (it, life) => items.push({ ...it, t: life, life, clip: c.clip });
  switch (fx.id) {
    case 'sparks':
      // An upward fan: 32 to 68 frames, gravity 0.07.
      for (let i = 0; i < fx.amount; i++) {
        const ang = -Math.PI / 2 + (rand() - 0.5) * Math.PI * 1.1, sp = 0.6 + rand() * 2.2;
        add({ type: 'dot', x: c.x, y: mid, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: 0.07, drag: 0.985, size: fx.size * (0.6 + rand() * 0.8), rgb: next() }, ms(32 + rand() * 36));
      }
      break;
    case 'pixie': {
      // Two or three dots at the baseline that drift a few pixels and fade within a line height.
      const n = 2 + (rand() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        add({ type: 'dot', x: c.x - rand() * c.w * 1.6, y: c.bottom - 4, vx: (rand() - 0.5) * 0.5, vy: 0.12 + rand() * 0.22, g: 0, drag: 0.99, size: 0.9 + rand() * 0.7, rgb: next() }, ms(30 + rand() * 22));
      }
      break;
    }
    case 'ripple':
      add({ type: 'ring', x: c.x + c.w / 2, y: mid, rgb: next() }, ms(13));
      break;
    case 'pulse':
      // 18 px beside the cursor and 16 above and below it, as in the cursor lab.
      add({ type: 'halo', x: c.x + c.w / 2, y: mid, w: c.w / 2 + 18, h: (c.bottom - c.top) / 2 + 16, rgb: next() }, 340);
      break;
    case 'laser': {
      // A beam from the right edge of the text hits the cursor; two embers fly off.
      const rgb = next();
      add({ type: 'beam', x: c.x + c.w, y: mid, right: Math.max(c.right, c.x + c.w), rgb }, ms(8));
      for (let i = 0; i < 2; i++) {
        add({ type: 'dot', x: c.x + c.w, y: mid, vx: 0.4 + rand() * 1.2, vy: (rand() - 0.6) * 1.4, g: 0.1, drag: 0.97, size: 1.1, rgb: '255, 138, 61' }, ms(10 + rand() * 10));
      }
      break;
    }
    case 'sight':
      add({ type: 'sight', x: c.x + c.w / 2, y: c.bottom - 2, left: c.left, right: c.right, rgb: next() }, ms(22));
      break;
    default: return;
  }
  if (items.length > 600) items.splice(0, items.length - 600);
  kick();
}

/** A fading streak from where the cursor was to where it is, in about 150 ms. */
function addTrail(fx, prev, c) {
  ensureCanvas();
  const rgb = fx.trailColor ? rgbOf(fx.trailColor) : colorsFor({ id: 'pulse' })[0];
  if (!rgb) return;
  items.push({ type: 'trail', x0: prev.x, y0: prev.top, h0: prev.bottom - prev.top, x1: c.x, y1: c.top, h1: c.bottom - c.top, w: c.w, alpha: fx.trailOpacity, rgb, t: ms(9), life: ms(9), clip: c.clip });
  if (items.length > 600) items.splice(0, items.length - 600);
  kick();
}

/**
 * The trail of phosphorTrail: when the cursor moves (typing, Enter, a click, the arrow keys, a
 * jump), a streak from where it was. Barely there while typing, clear at a new line or a jump.
 */
const cursorTrail = ViewPlugin.fromClass(class {
  constructor() { this.last = null; }
  update(u) {
    const fx = typing;
    if (!fx || fx.id !== 'phosphorTrail') { this.last = null; return; }
    if (!u.selectionSet && !u.docChanged) return;
    const view = u.view;
    const { head, assoc } = view.state.selection.main;
    view.requestMeasure({
      read: () => {
        const c = view.coordsAtPos(head, assoc || 1);
        if (!c) return null;
        const cur = view.dom.querySelector('.cm-cursor-primary');
        return {
          x: c.left, top: c.top, bottom: c.bottom, sl: view.scrollDOM.scrollLeft, st: view.scrollDOM.scrollTop,
          w: Math.max(2, cur ? cur.getBoundingClientRect().width : 2), clip: view.scrollDOM.getBoundingClientRect()
        };
      },
      write: (m) => {
        const prev = this.last;
        this.last = m;
        if (!m || !prev || !view.hasFocus || typing !== fx) return;
        // The old cursor box where it is on screen now, if the editor scrolled on the way.
        const old = { x: prev.x - (m.sl - prev.sl), top: prev.top - (m.st - prev.st), bottom: prev.bottom - (m.st - prev.st) };
        if (Math.hypot(m.x - old.x, m.top - old.top) < 0.5) return;
        addTrail(fx, old, m);
      }
    });
  }
});

/** The canvas part of the cursor effect, at the cursor after every typed or deleted character. */
const typingCanvas = ViewPlugin.fromClass(class {
  update(u) {
    const fx = typing;
    if (!fx || fx.kind === 'letter' || !u.docChanged) return;
    if (!u.transactions.some((tr) => tr.isUserEvent('input') || tr.isUserEvent('delete'))) return;
    burstAtCursor(u.view, fx);
  }
});

/** Measures the cursor (in CodeMirror's read phase) and runs the canvas part of `fx` there. */
function burstAtCursor(view, fx) {
  const head = view.state.selection.main.head;
  view.requestMeasure({
    read: () => {
      const c = view.coordsAtPos(head, -1) || view.coordsAtPos(head, 1);
      if (!c) return null;
      const cur = view.dom.querySelector('.cm-cursor-primary');
      const content = view.contentDOM.getBoundingClientRect();
      return {
        x: c.left, top: c.top, bottom: c.bottom, w: Math.max(2, cur ? cur.getBoundingClientRect().width : view.defaultCharacterWidth),
        left: content.left, right: content.right, clip: view.scrollDOM.getBoundingClientRect()
      };
    },
    write: (c) => { if (c && typing === fx) burst(fx, c); }
  });
}

/**
 * Shows the cursor effect now on, at the cursor, without typing: the picker previews each effect
 * this way while it is highlighted. The letter effects run on the letter before the cursor.
 * @param {EditorView} view
 */
export function demoCursorEffect(view) {
  const fx = typing;
  if (!fx) return;
  if (fx.id === 'phosphorTrail') {
    // A streak into the cursor from a few letters back.
    const head = view.state.selection.main.head;
    view.requestMeasure({
      read: () => { const c = view.coordsAtPos(head, 1); return c && { x: c.left, top: c.top, bottom: c.bottom, w: view.defaultCharacterWidth, clip: view.scrollDOM.getBoundingClientRect() }; },
      write: (c) => { if (c && typing === fx) addTrail(fx, { x: c.x - 8 * c.w, top: c.top, bottom: c.bottom }, c); }
    });
  } else if (fx.kind !== 'letter') burstAtCursor(view, fx);
  if (fx.kind !== 'canvas') {
    const { state } = view;
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    const text = state.doc.sliceString(line.from, head);
    const end = text.replace(/\s+$/, '').length;
    if (end > 0) view.dispatch({ effects: demoLetter.of({ from: line.from + findClusterBreak(text, end, false), to: line.from + end }) });
  }
}

// ---------- letter effects ----------
/** How long each letter effect's copy shows, in ms; matches the animations in styles.css. */
const LETTER_MS = { phosphor: 550, phosphorTrail: 550, laser: 700, neon: 500, glitch: 320, focus: 300 };
/** Drops letter marks born before the given time. */
const expireLetters = /** @type {import('@codemirror/state').StateEffectType<number>} */ (StateEffect.define());
/** Runs the letter effect on the letter at a position, as if just typed (the picker's preview). */
const demoLetter = /** @type {import('@codemirror/state').StateEffectType<{ from: number, to: number }>} */ (StateEffect.define({ map: (v, m) => ({ from: m.mapPos(v.from), to: m.mapPos(v.to) }) }));
let letterSeq = 0;
const letterMark = (ch, born) => Decoration.mark({ class: 'fx-ltr', attributes: { 'data-ph': String(++letterSeq), 'data-t': ch }, born });

/**
 * The letters just typed carry an fx-ltr mark while their effect runs. One mark per letter, with
 * the letter in data-t: styles.css draws glowing copies of it in ::before/::after and animates
 * only their opacity, transform and filter, which the compositor does without repainting the
 * line. Only the newest few characters of each insertion, never whole lines, nothing for a paste
 * or a drop, and nothing while composing.
 */
const letterField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    const fx = typing;
    if (!fx || fx.kind === 'canvas') return deco.size ? Decoration.none : deco;
    deco = deco.map(tr.changes);
    // A mark whose letter was just edited would show the old letter: drop it.
    if (tr.docChanged && deco.size) {
      tr.changes.iterChangedRanges((_fA, _tA, fromB, toB) => {
        deco = deco.update({ filter: (f, t) => t <= fromB || f >= toB, filterFrom: fromB, filterTo: toB });
      });
    }
    for (const ef of tr.effects) {
      if (ef.is(expireLetters)) deco = deco.update({ filter: (_f, _t, v) => v.spec.born > ef.value });
      if (ef.is(demoLetter)) {
        const { from, to } = ef.value;
        deco = deco.update({ filter: (f) => f !== from, filterFrom: from, filterTo: to, add: [letterMark(tr.state.doc.sliceString(from, to), Date.now()).range(from, to)] });
      }
    }
    // Dead keys like ´ and ¨ on a Swedish keyboard and IMEs compose: changing the DOM around an
    // active composition can cancel or garble it.
    if (tr.docChanged && tr.isUserEvent('input') && !tr.isUserEvent('input.paste') && !tr.isUserEvent('input.drop') &&
        !tr.isUserEvent('input.type.compose')) {
      const born = Date.now();
      /** @type {import('@codemirror/state').Range<Decoration>[]} */
      const add = [];
      tr.changes.iterChangedRanges((_fA, _tA, fromB, toB) => {
        // Whole characters (grapheme clusters), never half an emoji's surrogate pair.
        const base = Math.max(fromB, toB - 32);
        const text = tr.newDoc.sliceString(base, toB);
        for (let end = text.length, n = 0; end > 0 && n < 3; n++) {
          const start = findClusterBreak(text, end, false);
          const ch = text.slice(start, end);
          if (!/^\s+$/.test(ch)) add.push(letterMark(ch, born).range(base + start, base + end));
          end = start;
        }
      });
      if (add.length) deco = deco.update({ add, sort: true });
    }
    return deco;
  },
  provide: (f) => Prec.highest(EditorView.decorations.from(f))
});

/** Takes the marks off again once their animation is over. */
const letterExpiry = ViewPlugin.fromClass(class {
  constructor(view) { this.view = view; this.timer = 0; }
  update(u) {
    if (!this.timer && u.state.field(letterField).size) this.arm();
  }
  arm() {
    const span = LETTER_MS[typing ? typing.id : ''] || 550;
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      // Wait out a composition rather than redraw the text under it.
      if (this.view.composing) this.arm();
      else this.view.dispatch({ effects: expireLetters.of(Date.now() - span) });
    }, span + 50);
  }
  destroy() { clearTimeout(this.timer); }
});

// ---------- typing ----------
/** How long after the last keystroke the moving background starts again, in ms. */
const TYPING_PAUSE_MS = 1200;
let typingTimer = 0;
/**
 * html.fx-typing while the user types: the moving grid holds still then, so the compositor has one
 * moving thing less to redraw while every keystroke wants a frame. It goes on where it stopped.
 */
const typingPause = ViewPlugin.fromClass(class {
  update(u) {
    if (!u.docChanged || !u.transactions.some((tr) => tr.isUserEvent('input') || tr.isUserEvent('delete'))) return;
    const root = document.documentElement;
    if (!root.classList.contains('fx-grid-move')) return;
    root.classList.add('fx-typing');
    clearTimeout(typingTimer);
    typingTimer = window.setTimeout(() => root.classList.remove('fx-typing'), TYPING_PAUSE_MS);
  }
});

/** Editor extension for the cursor effect and the pause of the moving background while typing. */
export const typingEffects = [typingCanvas, cursorTrail, letterField, letterExpiry, typingPause];
