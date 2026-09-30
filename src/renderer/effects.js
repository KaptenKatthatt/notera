// effects.js: the built-in theme effects. A theme switches them on in notera.effects (see
// THEMES.md); this turns them into classes and custom properties on <html> that styles.css
// reads, and draws the typing particles on a canvas. Nothing here runs theme code: a theme can
// only pick effects and set their parameters.
//
// Editor and preview (Läs) get separate classes (fx-e-*, fx-r-*) because split view shows both
// at once and a theme's `read.effects` may differ from its editor effects.
import { ViewPlugin } from '@codemirror/view';
import { normalizeEffects, deepMerge } from '../shared/themeFormat.js';

const FX_CLASS = /^fx-/;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Current particle settings, read by the editor plugin on every keystroke; null when off. */
let particleConfig = null;
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
  }

  /**
   * @param {{ notera: any, read: any, enabled: boolean, view: string, type: string }} next
   */
  function update(next) {
    last = next;
    clear();
    isLightVariant = next.type !== 'dark';
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
  return { update, get particles() { return particleConfig; } };
}

// ---------- particles ----------
/** @type {HTMLCanvasElement | null} */
let canvas = null;
/** @type {CanvasRenderingContext2D | null} */
let g = null;
/** @type {Array<{ x: number, y: number, vx: number, vy: number, life: number, max: number, color: string, size: number }>} */
const particles = [];
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
  if (!running) { running = true; requestAnimationFrame(frame); }
}

function frame() {
  if (!g || !canvas) { running = false; return; }
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.globalCompositeOperation = isLightVariant ? 'source-over' : 'lighter';
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
  if (particles.length) requestAnimationFrame(frame);
  else running = false;
}

/** Editor extension: a burst of particles at the cursor on every typed or deleted character. */
export const typingParticles = ViewPlugin.fromClass(class {
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
