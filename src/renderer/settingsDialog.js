// Settings: a General pane and a Keyboard shortcuts pane where every command can be rebound.
import {
  COMMANDS, BY_ID, CATEGORIES, display, fromEvent, isAllowed, normalize, conflict, withBinding, isCustomized, effectiveBindings
} from '../shared/commands.js';

const $ = (sel, root = document) => root.querySelector(sel);

export function createSettingsDialog(ctx) {
  // ctx: { t, api, getSettings, openFontDialog, version, updateReason }
  const dlg = $('#dlg-settings');
  let pane = 'general';
  let recording = null; // { id, pending?: { combo, owner } , error? }
  let query = '';

  const t = (...a) => ctx.t(...a);
  const cleanLabel = (key) => t(key).replace('&', '').replace(/…$/, '');
  const overrides = () => ctx.getSettings().keybindings || {};

  async function save(id, list) {
    await ctx.api.setSettings({ keybindings: withBinding(overrides(), id, list) });
  }

  // ---------- general ----------
  function renderGeneral() {
    const s = ctx.getSettings();
    const el = $('#set-general');
    el.innerHTML = '';
    const section = (title) => { const h = document.createElement('h3'); h.textContent = title; el.appendChild(h); };
    const row = (labelText, control) => {
      const r = document.createElement('label'); r.className = 'set-row';
      const span = document.createElement('span'); span.textContent = labelText;
      r.append(span, control); el.appendChild(r); return r;
    };
    const select = (key, options) => {
      const sel = document.createElement('select');
      for (const [value, text] of options) { const o = document.createElement('option'); o.value = value; o.textContent = text; sel.appendChild(o); }
      sel.value = s[key];
      sel.addEventListener('change', () => ctx.api.setSettings({ [key]: sel.value }));
      return sel;
    };
    const toggle = (key, text, invertDefault = false) => {
      const r = document.createElement('label'); r.className = 'set-check';
      const cb = document.createElement('input'); cb.type = 'checkbox';
      cb.checked = invertDefault ? s[key] !== false : !!s[key];
      cb.addEventListener('change', () => ctx.api.setSettings({ [key]: cb.checked }));
      const span = document.createElement('span'); span.textContent = text;
      r.append(cb, span); el.appendChild(r); return cb;
    };

    section(t('settings.appearance'));
    row(t('settings.theme'), select('theme', [['system', cleanLabel('menu.themeSystem')], ['light', cleanLabel('menu.themeLight')], ['dark', cleanLabel('menu.themeDark')]]));
    row(t('settings.language'), select('language', [['auto', cleanLabel('menu.langAuto')], ['en', 'English'], ['sv', 'Svenska']]));
    const fontBox = document.createElement('span'); fontBox.className = 'set-inline';
    const fontName = document.createElement('span'); fontName.textContent = `${s.fontFamily}, ${s.fontSize} px`;
    const fontBtn = document.createElement('button'); fontBtn.type = 'button'; fontBtn.textContent = t('settings.fontChange');
    fontBtn.addEventListener('click', () => void ctx.openFontDialog());
    fontBox.append(fontName, fontBtn);
    row(t('settings.font'), fontBox);

    section(t('settings.editing'));
    toggle('autosave', t('settings.autosave'), true);
    toggle('hideMarkers', t('settings.hideMarkers'), true);
    toggle('wordWrap', t('settings.wordWrap'), true);
    toggle('lineNumbers', t('settings.lineNumbers'));

    section(t('settings.updates'));
    toggle('checkUpdates', t('settings.checkUpdates'), true);
    const upd = document.createElement('div'); upd.className = 'set-inline';
    const ver = document.createElement('span'); ver.className = 'set-muted'; ver.textContent = t('settings.version', { version: ctx.version });
    const now = document.createElement('button'); now.type = 'button'; now.textContent = t('settings.checkNow');
    now.addEventListener('click', async () => { now.disabled = true; try { await ctx.api.checkForUpdates(true); } finally { now.disabled = false; } });
    upd.append(ver, now);
    el.appendChild(upd);
  }

  // ---------- keyboard ----------
  function renderKeyboard() {
    const list = $('#kb-list');
    const bindings = effectiveBindings(overrides());
    const q = query.trim().toLowerCase();
    list.innerHTML = '';
    let shown = 0;
    for (const cat of CATEGORIES) {
      const cmds = COMMANDS.filter((c) => c.cat === cat).filter((c) => {
        if (!q) return true;
        const text = cleanLabel(c.label).toLowerCase();
        return text.includes(q) || bindings[c.id].some((k) => display(k).toLowerCase().includes(q) || k.toLowerCase().includes(q));
      });
      if (!cmds.length) continue;
      const h = document.createElement('h3'); h.textContent = t(`settings.cat.${cat}`); list.appendChild(h);
      for (const c of cmds) { list.appendChild(renderRow(c, bindings)); shown++; }
    }
    if (!shown) { const p = document.createElement('p'); p.className = 'set-muted'; p.textContent = t('settings.noResults'); list.appendChild(p); }
  }

  function renderRow(c, bindings) {
    const row = document.createElement('div');
    row.className = 'kb-row';
    row.dataset.id = c.id;
    const name = document.createElement('div'); name.className = 'kb-name'; name.textContent = cleanLabel(c.label);
    if (isCustomized(overrides(), c.id)) {
      const tag = document.createElement('span'); tag.className = 'kb-tag'; tag.textContent = t('settings.custom'); name.appendChild(tag);
    }
    const keys = document.createElement('div'); keys.className = 'kb-keys';
    const current = bindings[c.id];
    if (!current.length && !(recording && recording.id === c.id)) {
      const none = document.createElement('span'); none.className = 'set-muted'; none.textContent = t('settings.none'); keys.appendChild(none);
    }
    for (const k of current) {
      const chip = document.createElement('span'); chip.className = 'kb-chip';
      const kbd = document.createElement('kbd'); kbd.textContent = display(k);
      const x = document.createElement('button'); x.type = 'button'; x.className = 'kb-x'; x.textContent = '×';
      x.title = t('settings.remove', { key: display(k) }); x.setAttribute('aria-label', x.title);
      x.addEventListener('click', () => void save(c.id, current.filter((b) => b !== k)));
      chip.append(kbd, x); keys.appendChild(chip);
    }
    const actions = document.createElement('div'); actions.className = 'kb-actions';
    if (recording && recording.id === c.id) {
      row.classList.add('recording');
      const box = document.createElement('div'); box.className = 'kb-record';
      if (recording.pending) {
        const msg = document.createElement('span');
        msg.textContent = t('settings.inUse', { key: display(recording.pending.combo), command: cleanLabel(BY_ID[recording.pending.owner].label) });
        const move = document.createElement('button'); move.type = 'button'; move.className = 'primary'; move.textContent = t('settings.reassign');
        move.addEventListener('click', () => void assign(c.id, recording.pending.combo, recording.pending.owner));
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = t('settings.cancel');
        cancel.addEventListener('click', () => { recording = null; renderKeyboard(); });
        box.append(msg, move, cancel);
      } else {
        const msg = document.createElement('span');
        msg.textContent = recording.error || t('settings.record');
        if (recording.error) msg.className = 'kb-error';
        const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = t('settings.cancel');
        cancel.addEventListener('click', () => { recording = null; renderKeyboard(); });
        box.append(msg, cancel);
      }
      row.append(name, keys, box);
      return row;
    }
    const add = document.createElement('button'); add.type = 'button'; add.className = 'kb-add'; add.textContent = '+';
    add.title = t('settings.add'); add.setAttribute('aria-label', `${t('settings.add')}: ${cleanLabel(c.label)}`);
    add.addEventListener('click', () => { recording = { id: c.id }; renderKeyboard(); dlg.focus(); });
    actions.appendChild(add);
    if (isCustomized(overrides(), c.id)) {
      const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'kb-reset'; reset.textContent = t('settings.reset');
      reset.addEventListener('click', () => void save(c.id, BY_ID[c.id].keys));
      actions.appendChild(reset);
    }
    row.append(name, keys, actions);
    return row;
  }

  async function assign(id, combo, takeFrom) {
    let o = overrides();
    const bindings = effectiveBindings(o);
    if (takeFrom) o = withBinding(o, takeFrom, bindings[takeFrom].filter((k) => k !== combo));
    o = withBinding(o, id, [...bindings[id], combo]);
    recording = null;
    await ctx.api.setSettings({ keybindings: o });
  }

  function onRecordKey(e) {
    if (!recording || recording.pending) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { recording = null; renderKeyboard(); return; }
    const combo = fromEvent(e);
    if (!combo) return; // a lone modifier: keep waiting
    if (!isAllowed(combo)) { recording = { id: recording.id, error: t('settings.notAllowed', { key: display(combo) }) }; renderKeyboard(); return; }
    const bindings = effectiveBindings(overrides());
    if (bindings[recording.id].includes(normalize(combo))) { recording = null; renderKeyboard(); return; }
    const owner = conflict(bindings, combo, recording.id);
    if (owner) { recording = { id: recording.id, pending: { combo, owner } }; renderKeyboard(); return; }
    void assign(recording.id, combo, null);
  }

  function showPane(name) {
    pane = name;
    for (const b of dlg.querySelectorAll('.set-nav [data-pane]')) b.classList.toggle('active', b.dataset.pane === name);
    for (const p of dlg.querySelectorAll('.set-pane')) p.hidden = p.dataset.pane !== name;
    if (name === 'keyboard') { renderKeyboard(); $('#kb-search').focus(); } else { renderGeneral(); dlg.focus(); }
  }

  function render() {
    $('#set-title').textContent = t('settings.title');
    for (const b of dlg.querySelectorAll('.set-nav [data-pane]')) b.textContent = t(`settings.${b.dataset.pane}`);
    $('#kb-search').placeholder = t('settings.searchPlaceholder');
    $('#kb-reset-all').textContent = t('settings.resetAll');
    $('#set-close').title = t('settings.close');
    $('#set-close').setAttribute('aria-label', t('settings.close'));
    if (pane === 'keyboard') renderKeyboard(); else renderGeneral();
  }

  // wiring
  dlg.addEventListener('keydown', onRecordKey, true);
  dlg.addEventListener('cancel', (e) => { if (recording) { e.preventDefault(); recording = null; renderKeyboard(); } });
  dlg.addEventListener('close', () => { recording = null; ctx.onClose && ctx.onClose(); });
  for (const b of dlg.querySelectorAll('.set-nav [data-pane]')) b.addEventListener('click', () => showPane(b.dataset.pane));
  $('#kb-search').addEventListener('input', (e) => { query = e.target.value; renderKeyboard(); });
  $('#kb-reset-all').addEventListener('click', async () => {
    if (await ctx.api.confirm(t('settings.resetAllConfirm'))) await ctx.api.setSettings({ keybindings: {} });
  });
  $('#set-close').addEventListener('click', () => dlg.close());

  return {
    open(which = pane) { render(); if (!dlg.open) dlg.showModal(); showPane(which); },
    refresh() { if (dlg.open) render(); },
    isOpen: () => dlg.open
  };
}
