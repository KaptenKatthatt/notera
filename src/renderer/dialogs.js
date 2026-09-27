// dialogs.js: the small modal dialogs in index.html (font, link, shortcut reference, new project).
// Each opens a <dialog>, waits for it to close and acts on the answer.
import * as fmt from './format.js';
import { COMMANDS, CATEGORIES, display } from '../shared/commands.js';

const FALLBACK_FONTS = ['Consolas', 'Cascadia Mono', 'Cascadia Code', 'Courier New', 'Lucida Console', 'Segoe UI', 'Calibri', 'Arial', 'Times New Roman', 'Georgia', 'Verdana'];
const URL_RE = /^https?:\/\/\S+$/i;

/** Show a dialog and resolve with its returnValue once it closes. */
function showModal(dlg) {
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise((res) => dlg.addEventListener('close', () => res(dlg.returnValue), { once: true }));
}

/**
 * @param {{
 *   api: any, t: () => (key: string, vars?: object) => string, getView: () => any,
 *   getSettings: () => any, getKeys: () => any, getSidebar: () => any, settingsDialogOpen: () => boolean
 * }} ctx
 */
export function createDialogs(ctx) {
  const $ = (sel) => document.querySelector(sel);
  const { api } = ctx;
  const view = () => ctx.getView();

  async function font() {
    const settings = ctx.getSettings();
    const sel = $('#font-family');
    const size = $('#font-size');
    const preview = $('#font-preview');
    let families = FALLBACK_FONTS;
    try {
      if (window.queryLocalFonts) {
        const fonts = await window.queryLocalFonts();
        const set = new Set(fonts.map((f) => f.family));
        if (set.size) families = Array.from(set).sort((a, b) => a.localeCompare(b));
      }
    } catch { /* permission denied or unsupported: keep fallback list */ }
    if (!families.includes(settings.fontFamily)) families = [settings.fontFamily, ...families];
    sel.innerHTML = '';
    for (const f of families) { const o = document.createElement('option'); o.value = f; o.textContent = f; o.style.fontFamily = `"${f}"`; sel.appendChild(o); }
    sel.value = settings.fontFamily;
    size.value = settings.fontSize;
    const updatePreview = () => { preview.style.fontFamily = `"${sel.value}"`; preview.style.fontSize = `${size.value}px`; };
    sel.oninput = updatePreview; size.oninput = updatePreview; updatePreview();
    if ((await showModal($('#dlg-font'))) === 'ok') {
      const fontSize = Math.max(6, Math.min(72, parseInt(size.value, 10) || 15));
      await api.setSettings({ fontFamily: sel.value, fontSize });
    }
    if (!ctx.settingsDialogOpen()) view().focus();
  }

  /** Ctrl+K: a URL on the clipboard over selected text makes the link at once; otherwise ask. */
  async function insertLinkSmart() {
    const clip = ((await api.clipboardText()) || '').trim();
    const v = view();
    const range = v.state.selection.main;
    const selected = v.state.doc.sliceString(range.from, range.to).trim();
    if (URL_RE.test(clip) && selected) { fmt.insertLink(v, selected, clip); return; }
    await link(URL_RE.test(clip) ? clip : '');
  }

  async function link(prefillUrl = '') {
    const v = view();
    const text = $('#link-text'), url = $('#link-url');
    const range = v.state.selection.main;
    const selected = v.state.doc.sliceString(range.from, range.to);
    if (/^https?:\/\//i.test(selected)) { text.value = ''; url.value = selected; } else { text.value = selected; url.value = prefillUrl; }
    const answer = showModal($('#dlg-link'));
    (text.value ? url : text).focus();
    if ((await answer) === 'ok' && url.value.trim()) fmt.insertLink(v, text.value.trim(), url.value.trim());
    v.focus();
  }

  // The shortcut reference is generated from the live bindings, so it shows the user's own keys.
  function shortcuts() {
    const t = ctx.t();
    const tables = [$('#keys-table'), $('#keys-table-2')];
    tables.forEach((tb) => { tb.innerHTML = ''; });
    const bindings = ctx.getKeys().bindings();
    const rows = [];
    for (const cat of CATEGORIES) {
      for (const c of COMMANDS.filter((x) => x.cat === cat && bindings[x.id].length)) {
        if (/^goToTab[2-9]$/.test(c.id)) continue;
        if (c.id === 'goToTab1') { rows.push([`${display(bindings.goToTab1[0])} … ${display((bindings.goToTab9 || [])[0] || '')}`, t('menu.goToTab')]); continue; }
        rows.push([bindings[c.id].slice(0, 2).map(display).join(' / '), t(c.label).replace('&', '').replace(/…$/, '')]);
      }
    }
    rows.push(['Ctrl+X / Ctrl+C', t('menu.cutCopyLine')]);
    const half = Math.ceil(rows.length / 2);
    rows.forEach(([k, label], i) => {
      const tr = document.createElement('tr');
      const a = document.createElement('td'); a.textContent = k;
      const b = document.createElement('td'); b.textContent = label;
      tr.append(a, b); tables[i < half ? 0 : 1].appendChild(tr);
    });
    const dlg = $('#dlg-keys');
    dlg.showModal();
    dlg.addEventListener('close', () => view().focus(), { once: true });
  }

  /** Ask for a new project name and create it. Resolves to the name, or null. */
  async function projectName() {
    const dlg = $('#dlg-project');
    const input = $('#project-name');
    const err = $('#project-error');
    input.value = '';
    err.textContent = '';
    for (;;) {
      const answer = showModal(dlg);
      input.focus();
      if ((await answer) !== 'ok') { view().focus(); return null; }
      const name = input.value.trim();
      const e = await ctx.getSidebar().createProject(name);
      if (!e) { view().focus(); return name; }
      err.textContent = e;
    }
  }

  return { font, link, insertLinkSmart, shortcuts, projectName };
}
