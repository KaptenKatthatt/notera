// effects.js: the built-in theme effects. A theme switches them on in notera.effects (see
// THEMES.md); this turns them into classes and custom properties on <html> that styles.css
// reads, flashes newly typed letters (phosphor), and draws the typing particles and the cursor
// trail on a canvas. Nothing here runs theme code: a theme can
// only pick effects and set their parameters.
//
// Editor and preview (Läs) get separate classes (fx-e-*, fx-r-*) because split view shows both
// at once and a theme's `read.effects` may differ from its editor effects.
import { ViewPlugin, Decoration, EditorView } from '@codemirror/view';
import { StateField, StateEffect, Prec } from '@codemirror/state';
import { normalizeEffects, deepMerge } from '../shared/themeFormat.js';

const FX_CLASS = /^fx-/;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Current particle settings, read by the editor plugin on every keystroke; null when off. */
let particleConfig = null;
/** Current trail settings, read when the cursor moves; null when off. */
let trailConfig = null;
let phosphorOn = false;
let isLightVariant = false;

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
    particleConfig = null;
    trailConfig = null;
    phosphorOn = false;
  }

  /**
   * @param {{ notera: any, read: any, enabled: boolean, view: string, type: string }} next
   */
  function update(next) {
    last = next;
    clear();
    isLightVariant = next.type !== 'dark';
    // Glowing headings get a core mixed toward white (dark) or black (light); see styles.css.
    set('--fx-core', isLightVariant ? '#000000' : '#ffffff');
    if (!next.enabled) return;
    const raw = next.notera && next.notera.effects;
    const e = normalizeEffects(raw);
    const r = normalizeEffects(deepMerge(raw || {}, (next.read && next.read.effects) || {}));
    const motion = !reducedMotion.matches;
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
    if (e.particles && motion) particleConfig = e.particles;
    if (e.phosphor && motion) {
      // A white flash vanishes on a light page, so there the letter flashes in its own colour
      // with a wider halo instead.
      phosphorOn = true;
      add('fx-phosphor');
      set('--fx-ph-color', e.phosphor.color || (isLightVariant ? 'currentColor' : '#ffffff'));
      set('--fx-ph-strength', String(e.phosphor.strength * (isLightVariant ? 1.8 : 1)));
    }
    if (e.trail && motion) trailConfig = e.trail;
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

  reducedMotion.addEventListener('change', () => update(last));
  return { update, get particles() { return particleConfig; }, get trail() { return trailConfig; } };
}

// ---------- particles ----------
/** @type {HTMLCanvasElement | null} */
let canvas = null;
/** @type {CanvasRenderingContext2D | null} */
let g = null;
/** @type {Array<{ x: number, y: number, vx: number, vy: number, life: number, max: number, color: string, size: number }>} */
const particles = [];
/**
 * A cursor trail: a quad from the old caret box (x0, y0, h0) to the new one (x1, y1, h1), clipped
 * to the editor's scroller so it never crosses the toolbar.
 * @type {Array<{ x0: number, y0: number, h0: number, x1: number, y1: number, h1: number, w: number, life: number, rgb: string, alpha: number, clip: { left: number, top: number, right: number, bottom: number } }>}
 */
const trails = [];
let running = false;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.id = 'fx-particles';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  g = canvas.getContext('2d');
  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  window.addEventListener('resize', resize);
  resize();
}

function particleColors(cfg) {
  if (cfg.colors.length) return cfg.colors;
  const cs = getComputedStyle(document.documentElement);
  return [cs.getPropertyValue('--accent'), cs.getPropertyValue('--md-h'), cs.getPropertyValue('--caret')].map((c) => c.trim()).filter(Boolean);
}

function burst(x, y, cfg) {
  ensureCanvas();
  const colors = particleColors(cfg);
  for (let i = 0; i < cfg.amount; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const speed = 0.6 + Math.random() * 2.2;
    const max = 32 + Math.random() * 36;
    particles.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: max, max,
      color: colors[i % colors.length] || '#ff7edb', size: cfg.size * (0.6 + Math.random() * 0.8)
    });
  }
  if (particles.length > 600) particles.splice(0, particles.length - 600);
  run();
}

function run() {
  if (!running) { running = true; requestAnimationFrame(frame); }
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

/** Frames a trail lives: about 150 ms. */
const TRAIL_FRAMES = 9;

function addTrail(t) {
  ensureCanvas();
  const rgb = rgbOf(t.color);
  if (!rgb) return;
  trails.push({ ...t, rgb, life: 1 });
  if (trails.length > 12) trails.shift();
  run();
}

function drawTrails() {
  for (let i = trails.length - 1; i >= 0; i--) {
    const t = trails[i];
    t.life -= 1 / TRAIL_FRAMES;
    if (t.life <= 0) { trails.splice(i, 1); continue; }
    const inset = t.h0 * 0.17;
    const grad = g.createLinearGradient(t.x0, t.y0 + t.h0 / 2, t.x1, t.y1 + t.h1 / 2);
    grad.addColorStop(0, `rgba(${t.rgb}, 0)`);
    grad.addColorStop(1, `rgba(${t.rgb}, ${t.alpha * t.life})`);
    g.save();
    g.beginPath();
    g.rect(t.clip.left, t.clip.top, t.clip.right - t.clip.left, t.clip.bottom - t.clip.top);
    g.clip();
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(t.x0, t.y0 + inset);
    g.lineTo(t.x0 + t.w, t.y0 + t.h0 - inset);
    g.lineTo(t.x1 + t.w, t.y1 + t.h1);
    g.lineTo(t.x1, t.y1);
    g.closePath();
    g.fill();
    g.restore();
  }
}

function frame() {
  if (!g || !canvas) { running = false; return; }
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.globalCompositeOperation = isLightVariant ? 'source-over' : 'lighter';
  drawTrails();
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.07; p.vx *= 0.985; p.life -= 1;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    const a = p.life / p.max;
    g.globalAlpha = a;
    g.fillStyle = p.color;
    g.shadowColor = p.color;
    g.shadowBlur = p.size * 4;
    g.beginPath();
    g.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.shadowBlur = 0;
  if (particles.length || trails.length) requestAnimationFrame(frame);
  else running = false;
}

/** A burst of particles at the cursor on every typed or deleted character. */
const typingParticles = ViewPlugin.fromClass(class {
  update(u) {
    const cfg = particleConfig;
    if (!cfg || !u.docChanged) return;
    if (!u.transactions.some((tr) => tr.isUserEvent('input') || tr.isUserEvent('delete'))) return;
    const view = u.view;
    const head = view.state.selection.main.head;
    view.requestMeasure({
      read: () => view.coordsAtPos(head),
      write: (c) => { if (c) burst(c.left, (c.top + c.bottom) / 2, cfg); }
    });
  }
});

// ---------- cursor trail ----------
/** A fading streak from where the cursor was to where it went: faint while typing, clear on jumps. */
const cursorTrail = ViewPlugin.fromClass(class {
  constructor() {
    /** @type {{ left: number, top: number, bottom: number, sl: number, st: number } | null} */
    this.last = null;
  }

  update(u) {
    const cfg = trailConfig;
    if (!cfg) { this.last = null; return; }
    if (!u.selectionSet && !u.docChanged) return;
    const view = u.view;
    const { head, assoc } = view.state.selection.main;
    view.requestMeasure({
      read: () => {
        const c = view.coordsAtPos(head, assoc || 1);
        if (!c) return null;
        const cursor = view.dom.querySelector('.cm-cursor-primary');
        const cs = getComputedStyle(document.documentElement);
        return {
          left: c.left, top: c.top, bottom: c.bottom, sl: view.scrollDOM.scrollLeft, st: view.scrollDOM.scrollTop,
          w: Math.max(2, cursor ? cursor.getBoundingClientRect().width : 2),
          clip: view.scrollDOM.getBoundingClientRect(),
          color: cfg.color || cs.getPropertyValue('--caret').trim() || cs.getPropertyValue('--fg').trim()
        };
      },
      write: (m) => {
        const prev = this.last;
        this.last = m && { left: m.left, top: m.top, bottom: m.bottom, sl: m.sl, st: m.st };
        if (!m || !prev || !view.hasFocus) return;
        // The old caret box where it is on screen now, if the editor scrolled on the way.
        const x0 = prev.left - (m.sl - prev.sl), y0 = prev.top - (m.st - prev.st);
        if (Math.hypot(m.left - x0, m.top - y0) < 0.5) return;
        addTrail({
          x0, y0, h0: prev.bottom - prev.top, x1: m.left, y1: m.top, h1: m.bottom - m.top, w: m.w,
          color: m.color, alpha: cfg.opacity, clip: m.clip
        });
      }
    });
  }
});

// ---------- phosphor ----------
/** How long a newly typed letter glows, in ms; matches the fx-phosphor animation in styles.css. */
const PHOSPHOR_MS = 550;
/** Drops phosphor marks born before the given time. */
const expirePhosphor = /** @type {import('@codemirror/state').StateEffectType<number>} */ (StateEffect.define());
let phosphorSeq = 0;

/**
 * The letters just typed carry an fx-ph mark while they flash. Only the newest few characters of
 * each insertion, never whole lines, and nothing for a paste or a drop.
 */
const phosphorField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    if (!phosphorOn) return deco.size ? Decoration.none : deco;
    deco = deco.map(tr.changes);
    for (const ef of tr.effects) {
      if (ef.is(expirePhosphor)) deco = deco.update({ filter: (_f, _t, v) => v.spec.born > ef.value });
    }
    if (tr.docChanged && tr.isUserEvent('input') && !tr.isUserEvent('input.paste') && !tr.isUserEvent('input.drop')) {
      const born = Date.now();
      /** @type {import('@codemirror/state').Range<Decoration>[]} */
      const add = [];
      tr.changes.iterChangedRanges((_fA, _tA, fromB, toB) => {
        const from = Math.max(fromB, toB - 3);
        // A unique attribute, so CodeMirror never joins neighbouring marks into one element and
        // restarts the animation of a letter that is already fading.
        if (toB > from) add.push(Decoration.mark({ class: 'fx-ph', attributes: { 'data-ph': String(++phosphorSeq) }, born }).range(from, toB));
      });
      if (add.length) deco = deco.update({ add, sort: true });
    }
    return deco;
  },
  provide: (f) => Prec.highest(EditorView.decorations.from(f))
});

/** Takes the marks off again once their animation is over. */
const phosphorExpiry = ViewPlugin.fromClass(class {
  constructor(view) { this.view = view; this.timer = 0; }
  update(u) {
    if (this.timer || !u.state.field(phosphorField).size) return;
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      this.view.dispatch({ effects: expirePhosphor.of(Date.now() - PHOSPHOR_MS) });
    }, PHOSPHOR_MS + 50);
  }
  destroy() { clearTimeout(this.timer); }
});

/** Editor extension for the effects that follow typing: particles, phosphor, the cursor trail. */
export const typingEffects = [typingParticles, phosphorField, phosphorExpiry, cursorTrail];
