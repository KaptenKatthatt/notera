// palette.js: the command palette (Ctrl+Shift+P) and the pickers it opens. Every command in the
// registry is listed with its category and current keys, plus the settings that have no command
// of their own. The theme picker previews each theme on the open document as the selection
// moves; Enter keeps it, Esc puts the previous one back.
import { COMMANDS, CATEGORIES, display, effectiveBindings, ctrlWTarget, withCtrlW } from '../shared/commands.js';
import { createQuickPick } from './quickPick.js';

// Commands that need an argument the palette cannot give, or that are the palette itself.
const HIDDEN = new Set(['commandPalette', 'newFromTemplate', 'applyTemplate']);
// Commands that are on/off settings: [setting key, true when the setting is unset].
const TOGGLES = {
  wordWrap: ['wordWrap', true], lineNumbers: ['lineNumbers', false], formattingBar: ['formattingBar', true],
  statusBar: ['statusBar', true], spellcheck: ['spellcheck', false], hideMarkers: ['hideMarkers', true],
  autosave: ['autosave', true], narrowColumn: ['narrowColumn', true], effects: ['effects', true],
  writingMode: ['writingMode', false], toggleSidebar: ['sidebarOpen', false]
};
const VIEWS = { viewEditor: 'editor', viewSplit: 'split', viewPreview: 'preview' };

/**
 * @param {{
 *   t: () => (key: string, vars?: object) => string, api: any, getSettings: () => any,
 *   run: (id: string) => Promise<void> | void, focusEditor: () => void,
 *   previewTheme: (msg: any) => void, restoreTheme: () => void, openPaths: (paths: string[]) => Promise<void> | void,
 *   notice: (text: string) => void
 * }} ctx
 */
export function createPalette(ctx) {
  const pick = createQuickPick({ focusEditor: ctx.focusEditor });
  const clean = (s) => s.replace('&', '').replace(/…$/, '');

  function isOn(key, dflt) {
    const v = ctx.getSettings()[key];
    return v === undefined ? dflt : dflt ? v !== false : !!v;
  }

  /** Every command, then the settings without a command, as quick-pick items. */
  function commandItems() {
    const t = ctx.t();
    const s = ctx.getSettings();
    const bindings = effectiveBindings(s.keybindings || {});
    const cat = (c) => t(`settings.cat.${c}`);
    const items = [];
    const order = (c) => CATEGORIES.indexOf(c.cat);
    for (const c of [...COMMANDS].sort((a, b) => order(a) - order(b))) {
      if (HIDDEN.has(c.id)) continue;
      const keys = (bindings[c.id] || []).map(display).join(', ');
      const toggle = TOGGLES[c.id];
      const checked = toggle ? isOn(toggle[0], toggle[1]) : VIEWS[c.id] ? (s.viewMode || 'editor') === VIEWS[c.id] : false;
      items.push({ id: c.id, label: `${cat(c.cat)}: ${clean(t(c.label))}`, keys, checked });
    }
    const setting = t('palette.setting');
    items.push(
      { id: 'set:mode', label: `${setting}: ${clean(t('settings.mode'))}…`, detail: modeLabel(s.mode) },
      { id: 'set:language', label: `${setting}: ${clean(t('settings.language'))}…` },
      { id: 'set:ctrlW', label: `${setting}: ${t('settings.ctrlW')}…` },
      { id: 'set:checkUpdates', label: `${setting}: ${t('settings.checkUpdates')}`, checked: s.checkUpdates !== false },
      { id: 'set:confirmDelete', label: `${setting}: ${t('notes.confirmDeleteSetting')}`, checked: s.confirmDelete !== false }
    );
    return items;
  }

  function modeLabel(mode) {
    const t = ctx.t();
    return clean(t(mode === 'light' ? 'menu.themeLight' : mode === 'dark' ? 'menu.themeDark' : 'menu.themeSystem'));
  }

  function openCommands() {
    const t = ctx.t();
    pick.open({
      placeholder: t('palette.commands'),
      emptyText: t('palette.noMatches'),
      items: commandItems(),
      onPick: (item) => { if (item) void runItem(item.id); }
    });
  }

  async function runItem(id) {
    const s = ctx.getSettings();
    switch (id) {
      case 'set:mode': return pickMode();
      case 'set:language': return pickLanguage();
      case 'set:ctrlW': return pickCtrlW();
      case 'set:checkUpdates': ctx.focusEditor(); return ctx.api.setSettings({ checkUpdates: s.checkUpdates === false });
      case 'set:confirmDelete': ctx.focusEditor(); return ctx.api.setSettings({ confirmDelete: s.confirmDelete === false });
      default: ctx.focusEditor(); return ctx.run(id);
    }
  }

  // ---------- theme picker ----------
  async function pickTheme() {
    const t = ctx.t();
    const s = ctx.getSettings();
    const list = (await ctx.api.listThemes()).filter((th) => !th.error);
    let previewed = s.theme;
    pick.open({
      placeholder: t('palette.themes'),
      items: list.map((th) => ({ id: th.id, label: th.name, detail: th.builtin ? '' : t('palette.userTheme'), checked: th.id === s.theme })),
      initial: s.theme,
      onHighlight: async (item) => {
        if (item.id === previewed) return;
        previewed = item.id;
        const msg = await ctx.api.previewTheme(item.id);
        if (previewed === item.id && msg.theme) ctx.previewTheme(msg);
      },
      onPick: (item) => { if (item) void ctx.api.setSettings({ theme: item.id }); ctx.focusEditor(); },
      onCancel: () => ctx.restoreTheme()
    });
  }

  function pickMode() {
    const t = ctx.t();
    const s = ctx.getSettings();
    pick.open({
      placeholder: t('palette.modes'),
      items: ['system', 'light', 'dark'].map((m) => ({ id: m, label: modeLabel(m), checked: (s.mode || 'system') === m })),
      initial: s.mode || 'system',
      onPick: (item) => { if (item) void ctx.api.setSettings({ mode: item.id }); ctx.focusEditor(); }
    });
  }

  function pickLanguage() {
    const t = ctx.t();
    const s = ctx.getSettings();
    pick.open({
      placeholder: t('palette.languages'),
      items: [['auto', clean(t('menu.langAuto'))], ['en', 'English'], ['sv', 'Svenska']].map(([id, label]) => ({ id, label, checked: (s.language || 'auto') === id })),
      initial: s.language || 'auto',
      onPick: (item) => { if (item) void ctx.api.setSettings({ language: item.id }); ctx.focusEditor(); }
    });
  }

  function pickCtrlW() {
    const t = ctx.t();
    const s = ctx.getSettings();
    const now = ctrlWTarget(effectiveBindings(s.keybindings || {}));
    pick.open({
      placeholder: t('palette.ctrlW'),
      items: [['tab', t('settings.ctrlWTab')], ['window', t('settings.ctrlWWindow')]].map(([id, label]) => ({ id, label, checked: now === id })),
      initial: now === 'other' ? 'tab' : now,
      onPick: (item) => { if (item) void ctx.api.setSettings({ keybindings: withCtrlW(s.keybindings || {}, item.id) }); ctx.focusEditor(); }
    });
  }

  // ---------- new theme ----------
  function newTheme() {
    const t = ctx.t();
    pick.open({
      placeholder: t('palette.themeName'),
      items: [],
      freeText: (q) => t('palette.createTheme', { name: q }),
      emptyText: t('palette.themeName'),
      onPick: async (_item, name) => {
        const r = await ctx.api.createTheme(name);
        if (r && r.file) await ctx.openPaths([r.file]);
      }
    });
  }

  // ---------- VS Code import ----------
  async function importVsCode() {
    showVsCode(await ctx.api.vscode.list(), true);
  }

  /** A dropped or opened .vsix: straight to its themes. */
  async function importVsix(file) {
    const r = await ctx.api.vscode.readVsix(file);
    if (r.error) { ctx.notice(r.error); return; }
    showVsCode(r.themes, false);
  }

  /**
   * VS Code themes in the quick pick. The arrow keys preview each one on the open document before
   * anything is written; Enter imports it into the themes folder and switches to it.
   */
  function showVsCode(list, withVsix) {
    const t = ctx.t();
    const items = list.map((th) => ({
      id: th.key, label: th.label,
      detail: `${th.extension} · ${th.pair ? t('palette.withPair', { name: th.pair }) : t(th.dark ? 'palette.darkOnly' : 'palette.lightOnly')}`
    }));
    if (withVsix) items.push({ id: '__vsix', label: t('palette.vsixItem'), detail: t('palette.vsixDetail') });
    let previewed = null;
    pick.open({
      placeholder: withVsix && !list.length ? t('palette.vscodeNone') : t('palette.vscode'),
      items,
      emptyText: t('palette.noMatches'),
      onHighlight: async (item) => {
        if (item.id === '__vsix') { previewed = null; ctx.restoreTheme(); return; }
        previewed = item.id;
        const msg = await ctx.api.vscode.preview(item.id);
        if (previewed === item.id && msg.theme) ctx.previewTheme(msg);
      },
      onPick: async (item) => {
        if (!item) return;
        if (item.id === '__vsix') {
          ctx.restoreTheme();
          const r = await ctx.api.vscode.openVsix();
          if (r.canceled) return;
          if (r.error) { ctx.notice(r.error); return; }
          showVsCode(r.themes, false);
          return;
        }
        previewed = null;
        await ctx.api.vscode.importTheme(item.id);
        ctx.focusEditor();
      },
      onCancel: () => { previewed = null; ctx.restoreTheme(); }
    });
  }

  return { openCommands, pickTheme, pickMode, newTheme, importVsCode, importVsix, get isOpen() { return pick.isOpen; } };
}
