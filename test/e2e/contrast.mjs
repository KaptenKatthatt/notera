// Contrast: every built-in theme, light and dark, meets WCAG 2.2 AA.
// - Text (1.4.3): axe-core's color-contrast rule over the whole window in several states
//   (split view with sidebar, tabs and search, Läs, the settings dialog, the command palette and
//   the update toast), plus text on the selection, which axe cannot see. 4.5:1, 3:1 for large text.
// - Non-text (1.4.11), 3:1 against what is next to it: the selection, the caret, the accent where
//   it marks focus or the active choice, input borders, and the active tab, note and palette row.
// - Background effects: text colours against the darkest and lightest pixel of the effect
//   background behind the editor column (the Neon sun and grid), which no DOM rule can see.
// `node test/e2e/contrast.mjs --report` prints every measurement instead of only the failures.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'test/e2e/shots');
fs.mkdirSync(shots, { recursive: true });
const report = process.argv.includes('--report');
const only = process.argv.find((a) => a.startsWith('--theme='))?.slice(8);
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-contrast-'));
const userData = path.join(tmp, 'ud');
const notes = path.join(tmp, 'Anteckningar');
fs.mkdirSync(path.join(notes, 'Projekt'), { recursive: true });
fs.mkdirSync(userData, { recursive: true });
const note = path.join(notes, 'Projekt', 'Veckoplan.md');
fs.writeFileSync(note, [
  '# Veckoplan', 'Projekt: Projekt · Skapad: 2026-10-01 09:00', '',
  'En **fet** rad, en *kursiv* och lite `kod`. Se [länken](https://example.com) och ~~struken~~.', '',
  '## Att göra', '', '- [ ] Handla', '- [x] Ringa vet', '1. Första', '', '### Nivå tre', '#### Nivå fyra', '##### Nivå fem', '###### Nivå sex', '',
  '> Citat från någon klok', '', '```js', 'console.log(1)', '```', '', '| A | B |', '| - | - |', '| 1 | 2 |', '', '---', ''
].join('\n'));
fs.writeFileSync(path.join(notes, 'Projekt', 'Andra.md'), '# Andra\n');
fs.writeFileSync(path.join(notes, '.notera.json'), JSON.stringify({ version: 1, inbox: 'Osorterat', archive: 'Arkiv', projects: ['Projekt'], seeded: true }));
fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({
  notesRoot: notes, sidebarOpen: true, language: 'sv', viewMode: 'split', checkUpdates: false, notesBannerDismissed: true,
  lineNumbers: true, windowBounds: { width: 1280, height: 820 }
}));

const app = await electron.launch({ args: [root, note], env: { ...process.env, NOTERA_USER_DATA: userData, NOTERA_TEST: '1' } });
const win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.some((t) => t.path) && window.__notera.sidebar && window.__notera.sidebar.tree);
await win.setViewportSize({ width: 1280, height: 820 });
await win.evaluate(axeSource + ';0');
const themeIds = ['default', 'those-guys', 'other-guys', 'neon-chill', 'neon', 'neon-omg'].filter((id) => !only || id === only);
const act = (id) => win.evaluate((a) => window.__notera.handleAction(a), id);
const settle = (ms = 250) => win.waitForTimeout(ms);

// Colour helpers, in the page: parse any computed colour, composite, WCAG contrast.
await win.evaluate(() => {
  const parse = (s) => {
    s = String(s).trim();
    let m = /^rgba?\(([^)]+)\)$/.exec(s);
    if (m) { const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
    m = /^color\(srgb ([^)]+)\)$/.exec(s);
    if (m) { const p = m[1].split(/[ /]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]; }
    if (s === 'transparent') return [0, 0, 0, 0];
    return null;
  };
  const over = (top, under) => { const a = top[3]; return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1]; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  // The colour a CSS value resolves to inside `host` (default <html>), e.g. 'var(--selection)'.
  const resolve = (value, host) => {
    const probe = document.createElement('div');
    probe.style.cssText = `position:absolute;width:1px;height:1px;background:${value}`;
    (host || document.body).appendChild(probe);
    const c = parse(getComputedStyle(probe).backgroundColor);
    probe.remove();
    return c;
  };
  // The opaque background an element sits on: its own and its ancestors' backgrounds, composited.
  const backdrop = (el) => {
    const stack = [];
    for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { stack.push(c); if (c[3] >= 1) break; } }
    let base = [255, 255, 255, 1];
    for (const c of stack.reverse()) base = over(c, base);
    return base;
  };
  const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  window.__c = { parse, over, lum, ratio, resolve, backdrop, hex };
});

const failures = [];
const rows = [];
function record(variant, kind, what, value, min, detail = '') {
  const ok = value + 1e-9 >= min;
  rows.push({ variant, kind, what, value, min, ok, detail });
  if (!ok) failures.push(`${variant}  ${kind}  ${what}: ${value.toFixed(2)} < ${min}${detail ? '  ' + detail : ''}`);
}

// The scanlines and the vignette darken the whole window from above; worst case is a scanline in
// a corner. Every pair is measured again under that much black.
const darkening = () => win.evaluate(() => {
  const h = document.documentElement, cs = getComputedStyle(h);
  const scan = h.classList.contains('fx-scanlines') ? Number(cs.getPropertyValue('--fx-scan')) || 0 : 0;
  const vig = h.classList.contains('fx-vignette') ? Number(cs.getPropertyValue('--fx-vig')) || 0 : 0;
  return 1 - (1 - scan) * (1 - vig);
});

async function axe(variant, state, context = 'html') {
  const dark = await darkening();
  const r = await win.evaluate(async ([ctx, dark]) => {
    const res = await window.axe.run(ctx, { runOnly: ['color-contrast'], resultTypes: ['violations', 'incomplete', 'passes'] });
    const { parse, over, ratio } = window.__c;
    const hexRgb = (h) => h && /^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1) : parse(h);
    const pick = (list) => list.flatMap((v) => v.nodes.map((n) => {
      const data = (n.any[0] || {}).data || {};
      const fg = hexRgb(data.fgColor), bg = hexRgb(data.bgColor);
      const shade = [0, 0, 0, dark];
      const value = fg && bg ? ratio(over(shade, fg), over(shade, bg)) : Number(data.contrastRatio) || 0;
      return { target: n.target.join(' '), html: n.html.slice(0, 90), data, value, msg: (n.any[0] || {}).message || '' };
    }));
    // axe leaves some nodes undecided: one-letter text (the palette's matched letters), icons, or
    // an element it thinks is overlapped. Those are measured here from the element's own colour
    // (with every ancestor's opacity) on its ancestors' backgrounds. A gradient is left out: the
    // effect background is measured with pixels and gradient headings stop by stop.
    const undecided = res.incomplete.flatMap((v) => v.nodes).filter((n) => !/gradient/.test((n.any[0] || {}).message || '')).map((n) => {
      const el = document.querySelector(n.target[n.target.length - 1]);
      if (!el || !el.getClientRects().length) return null;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden') return null;
      let c = parse(cs.color), op = 1;
      for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
      c = [c[0], c[1], c[2], c[3] * op];
      const bg = window.__c.backdrop(el);
      const shade = [0, 0, 0, dark];
      const icon = /non-text/.test((n.any[0] || {}).message || '');
      const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
      const min = icon ? 3 : (size >= 24 || (bold && size >= 18.66)) ? 3 : 4.5;
      const fgc = over(c, bg);
      return { target: n.target.join(' '), html: n.html.slice(0, 90), value: ratio(over(shade, fgc), over(shade, bg)), min, kind: icon ? 'non-text' : 'text', detail: `${window.__c.hex(fgc)} on ${window.__c.hex(bg)}` };
    }).filter(Boolean);
    return { violations: pick(res.violations), passes: pick(res.passes), incomplete: pick(res.incomplete), undecided };
  }, [context, dark]);
  for (const u of r.undecided) record(variant, u.kind, `${state}: ${u.target} (undecided by axe)`, u.value, u.min, `${u.detail} ${u.html}`);
  for (const v of [...r.violations, ...r.passes]) {
    if (!v.data.fgColor) continue;
    record(variant, 'text', `${state}: ${v.target}`, v.value, Number(String(v.data.expectedContrastRatio || '4.5').replace(':1', '')),
      `${v.data.fgColor} on ${v.data.bgColor}${dark ? ` under ${Math.round(dark * 100)} % shade` : ''} ${v.html}`);
  }
  // Incomplete = axe could not decide (a gradient, an image, overlapping elements). Listed with
  // --report; the effect backgrounds are measured with pixels below.
  if (report) for (const v of r.incomplete) rows.push({ variant, kind: 'axe?', what: `${state}: ${v.target}`, value: NaN, min: 0, ok: true, detail: v.msg.slice(0, 120) });
}

for (const id of themeIds) {
  for (const mode of ['light', 'dark']) {
    const variant = `${id}/${mode}`;
    await win.evaluate(([i, m]) => window.notera.setSettings({ theme: i, mode: m, viewMode: 'split' }), [id, mode]);
    await win.waitForFunction(([i, m]) => window.__notera.theme && document.documentElement.dataset.themeId === i && document.documentElement.dataset.theme === m, [id, mode]).catch(() => settle(600));
    await settle(400);

    // Main window: split view, sidebar, two tabs (one dirty), search panel with matches.
    if (await win.evaluate(() => window.__notera.tabs.length) < 2) { await act('new'); }
    await win.evaluate(() => { const t = window.__notera.tabs.find((x) => !x.path); if (t) t.dirty = true; });
    const named = await win.locator('.tab', { hasText: 'Veckoplan' });
    await named.click();
    await act('find');
    await win.keyboard.type('rad');
    await settle();
    await win.click('.cm-content');
    await axe(variant, 'main');
    await win.screenshot({ path: path.join(shots, `60-contrast-${id}-${mode}.png`) });
    await win.evaluate(() => { const v = window.__notera.view; const i = v.state.doc.toString().indexOf('Ringa vet'); v.dispatch({ selection: { anchor: i, head: i + 9 } }); });
    await settle(120);
    await win.screenshot({ path: path.join(shots, `63-contrast-selection-${id}-${mode}.png`) });
    await win.waitForSelector('.cm-selectionBackground');
    // The selection must be what is painted under the selected text: nothing opaque above the
    // selection layer (an effect pane on .cm-content once hid it, leaving dark text on dark).
    const selOnTop = await win.evaluate(() => {
      const r = document.querySelector('.cm-selectionBackground').getBoundingClientRect();
      const painted = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        .find((e) => !/^rgba\(.*, 0\)$|^transparent$/.test(getComputedStyle(e).backgroundColor));
      return !!painted && painted.classList.contains('cm-selectionBackground');
    });
    record(variant, 'non-text', 'the selection is painted above everything behind the text', selOnTop ? 99 : 0, 3);

    // Non-text and text on the selection, from the rendered colours.
    const m = await win.evaluate(() => {
      const { resolve, over, ratio, backdrop, parse, hex } = window.__c;
      const v = window.__notera.view;
      const bg = over(resolve('var(--bg)'), [255, 255, 255, 1]);
      v.dispatch({ selection: { anchor: v.state.doc.toString().indexOf('Handla'), head: v.state.doc.toString().indexOf('Handla') + 6 } });
      const sel = over(resolve('var(--selection)'), bg);
      const out = {};
      out.selectionVsBg = [ratio(sel, bg), `${hex(sel)} vs ${hex(bg)}`];
      const sfg = over(resolve('var(--selection-fg)'), sel);
      out['text --selection-fg on selection'] = [ratio(sfg, sel), `${hex(sfg)} on ${hex(sel)}`];
      const live = document.querySelector('.cm-selectedText');
      out['selected text is drawn in --selection-fg'] = [live && parse(getComputedStyle(live).color).slice(0, 3).join() === resolve('var(--selection-fg)').slice(0, 3).join() ? 99 : 0, ''];
            for (const [name, fgName] of [['--search-match', '--search-fg'], ['--search-current', '--search-current-fg']]) {
        const m = over(resolve(`var(${name})`), bg);
        const f = over(resolve(`var(${fgName})`), m);
        out[`text ${fgName} on ${name}`] = [ratio(f, m), `${hex(f)} on ${hex(m)}`];
      }
      const cur = over(resolve('var(--search-current)'), bg);
      out['current search match vs bg'] = [ratio(cur, bg), `${hex(cur)} vs ${hex(bg)}`];
      // Gradient headings: every stop against the editor background.
      const grad = getComputedStyle(document.documentElement).getPropertyValue('--fx-grad-e');
      const stops = grad.match(/#[0-9a-f]{3,8}|rgba?\([^)]+\)/gi) || [];
      stops.forEach((st, i) => { const c = over(resolve(st), bg); out[`text gradient stop ${i + 1}`] = [ratio(c, bg), `${hex(c)} on ${hex(bg)}`]; });
      v.dispatch({ selection: { anchor: 0 } }); v.focus();
      const caretEl = document.querySelector('.cm-cursorLayer .cm-cursor');
      const caret = caretEl ? over(parse(getComputedStyle(caretEl).borderLeftColor), bg) : null;
      if (caret) out.caretVsBg = [ratio(caret, bg), `${hex(caret)} vs ${hex(bg)}`];
      const accent = resolve('var(--accent)');
      for (const surf of ['--bg', '--bg-chrome', '--bg-popup']) {
        const s = over(resolve(`var(${surf})`), [255, 255, 255, 1]);
        out[`accent vs ${surf}`] = [ratio(over(accent, s), s), `${hex(over(accent, s))} vs ${hex(s)}`];
      }
      // Inputs: the border against the surface around the field.
      for (const sel2 of ['.sb-search', '.cm-panel.cm-search .cm-textfield']) {
        const el = document.querySelector(sel2);
        if (!el) continue;
        const around = backdrop(el.parentElement);
        const border = over(parse(getComputedStyle(el).borderTopColor), around);
        const fill = over(parse(getComputedStyle(el).backgroundColor) || [0, 0, 0, 0], around);
        out[`input ${sel2} boundary`] = [Math.max(ratio(border, around), ratio(fill, around)), `border ${hex(border)} / fill ${hex(fill)} on ${hex(around)}`];
      }
      // Active tab against the inactive tab strip; active note against the sidebar.
      const tabA = document.querySelector('.tab.active'), tabI = document.querySelector('.tab:not(.active)');
      if (tabA && tabI) out['active tab vs inactive'] = indicator(tabA, tabI);
      const noteA = document.querySelector('.sb-note.active'), noteI = document.querySelector('.sb-note:not(.active)');
      if (noteA && noteI) out['active note vs others'] = indicator(noteA, noteI);
      return out;
      // An active item is told apart by its fill or by an inset/edge bar (box-shadow or border).
      function indicator(a, b) {
        const fa = backdrop(a), fb = backdrop(b);
        let best = ratio(fa, fb), how = `fill ${hex(fa)} vs ${hex(fb)}`;
        const cs = getComputedStyle(a);
        const bar = /(rgba?\([^)]+\)|color\([^)]+\))/.exec(cs.boxShadow || '');
        if (bar && cs.boxShadow !== 'none') { const c = over(parse(bar[1]), fb); const r = ratio(c, fb); if (r > best) { best = r; how = `bar ${hex(c)} vs ${hex(fb)}`; } }
        for (const side of ['Top', 'Bottom', 'Left']) {
          if (parseFloat(cs[`border${side}Width`]) >= 2) { const c = over(parse(cs[`border${side}Color`]), fb); const r = ratio(c, fb); if (r > best) { best = r; how = `${side.toLowerCase()} border ${hex(c)} vs ${hex(fb)}`; } }
        }
        return [best, how];
      }
    });
    const dark = await darkening();
    for (const [what, [value, detail]] of Object.entries(m)) {
      const kind = what.startsWith('text ') ? 'text' : 'non-text';
      // Under the overlay a ratio r between two colours drops to at worst this (black over both).
      const shaded = dark ? await win.evaluate(([d, txt]) => {
        const { over, ratio } = window.__c;
        const hx = (txt.match(/#[0-9a-f]{6}/gi) || []).map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1));
        if (hx.length < 2) return null;
        const sh = [0, 0, 0, d];
        return ratio(over(sh, hx[0]), over(sh, hx[hx.length - 1]));
      }, [dark, detail]) : null;
      record(variant, kind, what, shaded ?? value, kind === 'text' ? 4.5 : 3, detail + (shaded ? ` under ${Math.round(dark * 100)} % shade` : ''));
    }

    // Effect backgrounds: text colours against every pixel behind the editor column and the
    // preview text, with the text itself hidden.
    const hasBg = await win.evaluate(() => document.documentElement.classList.contains('fx-bg'));
    if (hasBg) {
      await win.keyboard.press('Escape'); // the search panel would cover the top of the column
      await win.evaluate(() => { const v = window.__notera.view; v.dispatch({ selection: { anchor: 0 } }); });
      await win.addStyleTag({ content: '.cm-content *, .cm-content, .cm-gutters *, #preview, #preview * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; filter: none !important; border-color: transparent !important; } .cm-line .cm-hd, #preview :is(h1,h2,h3,h4,h5,h6) { background-image: none !important; } .cm-cursorLayer, .cm-selectionLayer, #fx-particles, #fx-overlay { visibility: hidden !important; } .cm-activeLine { background: transparent !important; } #preview :is(input, pre, code, table, hr, blockquote, img) { visibility: hidden !important; }' });
      await settle(200);
      const regions = await win.evaluate(() => {
        const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left) + 1, y: Math.round(r.top) + 1, width: Math.round(r.width) - 2, height: Math.min(Math.round(r.height), window.innerHeight - Math.round(r.top) - 30) - 2 }; };
        const sc = document.querySelector('.cm-scroller').getBoundingClientRect();
        const c = document.querySelector('.cm-content').getBoundingClientRect();
        return {
          editor: { x: Math.round(c.left) + 1, y: Math.round(sc.top) + 1, width: Math.round(c.width) - 2, height: Math.round(sc.height) - 2 },
          preview: box(document.querySelector('#preview'))
        };
      });
      for (const [where, clip] of Object.entries(regions)) {
        const png = await win.screenshot({ clip });
        const px = await win.evaluate(async (b64) => {
          const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
          const g = c.getContext('2d'); g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data;
          const { lum, resolve, ratio, hex } = window.__c;
          let lo = null, hi = null, loL = 2, hiL = -1;
          for (let i = 0; i < d.length; i += 4) {
            const p = [d[i], d[i + 1], d[i + 2], 1], l = lum(p);
            if (l < loL) { lo = p; loL = l; }
            if (l > hiL) { hi = p; hiL = l; }
          }
          const out = {};
          for (const name of ['--fg', '--md-h', '--md-h1', '--md-h2', '--md-h3', '--md-h4', '--md-h5', '--md-h6', '--md-link', '--md-quote', '--md-code', '--md-meta']) {
            const t = resolve(`var(${name})`);
            if (!t) continue;
            out[`text ${name} on effect background`] = [Math.min(ratio(t, lo), ratio(t, hi)), `${hex(t)} vs ${hex(lo)}..${hex(hi)}`];
          }
          return out;
        }, png.toString('base64'));
        for (const [what, [value, detail]] of Object.entries(px)) record(variant, 'text', `${where}: ${what}`, value, 4.5, detail);
      }
      await win.evaluate(() => { for (const st of document.querySelectorAll('style')) if (st.textContent.includes('#fx-particles, #fx-overlay')) st.remove(); });
      await settle(100);
    }
    await win.keyboard.press('Escape');
    await win.evaluate(() => { const v = window.__notera.view; v.focus(); });

    // Läs: the preview on its own.
    await win.evaluate(() => window.notera.setSettings({ viewMode: 'preview' }));
    await settle(300);
    await axe(variant, 'read', '#preview-pane');
    await win.evaluate(() => window.notera.setSettings({ viewMode: 'split' }));

    // Settings dialog.
    await act('settings');
    await win.waitForSelector('dialog.settings[open]');
    await settle(200);
    await axe(variant, 'settings', 'dialog.settings');
    await win.screenshot({ path: path.join(shots, `61-contrast-settings-${id}-${mode}.png`) });
    await win.keyboard.press('Escape');
    await settle(150);

    // Command palette with a query, and its selected row against the others.
    await act('commandPalette');
    await win.keyboard.type('vis');
    await settle(200);
    const pal = await win.evaluate(() => {
      const box = document.querySelector('#palette:not([hidden]), .quick-pick:not([hidden]), #qp:not([hidden])');
      return box ? '#' + (box.id || '') : null;
    });
    await axe(variant, 'palette', '#quick-pick');
    const palRow = await win.evaluate(() => {
      const { backdrop, ratio, hex, parse, over } = window.__c;
      const sel = document.querySelector('#qp-list [aria-selected="true"]');
      if (!sel) return null;
      const other = [...sel.parentElement.children].find((e) => e !== sel && e.getAttribute('aria-selected') !== 'true');
      if (!other) return null;
      const fa = backdrop(sel), fb = backdrop(other);
      let best = ratio(fa, fb), how = `fill ${hex(fa)} vs ${hex(fb)}`;
      const cs = getComputedStyle(sel);
      const bar = /(rgba?\([^)]+\)|color\([^)]+\))/.exec(cs.boxShadow || '');
      if (bar && cs.boxShadow !== 'none') { const c = over(parse(bar[1]), fb); const r = ratio(c, fb); if (r > best) { best = r; how = `bar ${hex(c)} vs ${hex(fb)}`; } }
      return [best, how];
    });
    if (palRow) record(variant, 'non-text', 'palette selected row vs others', palRow[0], 3, palRow[1]);
    else failures.push(`${variant}  palette: no selected row found (${pal})`);
    await win.screenshot({ path: path.join(shots, `62-contrast-palette-${id}-${mode}.png`) });
    await win.keyboard.press('Escape');
    await settle(150);

    // Update toast, both with and without its primary button.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('update:status', { state: 'downloaded', version: '9.9.9', percent: 100 }));
    await win.waitForSelector('#update-toast:not([hidden])');
    await axe(variant, 'toast', '#update-toast');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('update:status', { state: 'idle', version: null, percent: 0 }));
    console.log('measured', variant);
  }
}

await win.evaluate(() => { for (const t of window.__notera.tabs) t.dirty = false; });
await app.close();

if (report) {
  for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.variant.padEnd(18)} ${r.kind.padEnd(9)} ${Number.isNaN(r.value) ? '  ? ' : r.value.toFixed(2).padStart(5)}  ${r.what}  ${r.detail}`);
}
if (failures.length) {
  console.log(`\n${failures.length} contrast failures:\n` + failures.join('\n'));
  process.exit(1);
}
console.log('contrast OK');
