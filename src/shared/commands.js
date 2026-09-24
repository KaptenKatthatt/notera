'use strict';
// Every command in the app, with its default key bindings. Main builds the menu from this,
// the renderer dispatches keys from it, and Settings > Keyboard shortcuts edits it.
// CommonJS so main.js can require it and esbuild can bundle it into the renderer.
//
// Bindings are strings like "Ctrl+Shift+K". Keys are matched on the Windows virtual key code,
// the same way Notepad and VS Code do it: Ctrl and the "+" key zoom in on a Swedish keyboard too.

const MODS = ['Ctrl', 'Shift', 'Alt', 'Meta'];

// global: runs even when focus is in a text field (search box, dialog input).
// Editor-only commands leave text fields alone so Ctrl+Z / Ctrl+A keep working in them.
const COMMANDS = [
  // File
  { id: 'new', cat: 'file', label: 'menu.new', keys: ['Ctrl+T'], global: true },
  { id: 'newWindow', cat: 'file', label: 'menu.newWindow', keys: ['Ctrl+N', 'Ctrl+Shift+N'], global: true },
  { id: 'open', cat: 'file', label: 'menu.open', keys: ['Ctrl+O'], global: true },
  { id: 'save', cat: 'file', label: 'menu.save', keys: ['Ctrl+S'], global: true },
  { id: 'saveAs', cat: 'file', label: 'menu.saveAs', keys: ['Ctrl+Shift+S'], global: true },
  { id: 'saveAll', cat: 'file', label: 'menu.saveAll', keys: ['Ctrl+Alt+S'], global: true },
  { id: 'closeTab', cat: 'file', label: 'menu.closeTab', keys: ['Ctrl+W', 'Ctrl+F4'], global: true },
  { id: 'closeWindow', cat: 'file', label: 'menu.closeWindow', keys: [], global: true },
  { id: 'nextTab', cat: 'file', label: 'menu.nextTab', keys: ['Ctrl+Tab', 'Ctrl+PageDown'], global: true },
  { id: 'prevTab', cat: 'file', label: 'menu.prevTab', keys: ['Ctrl+Shift+Tab', 'Ctrl+PageUp'], global: true },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ id: `goToTab${n}`, cat: 'file', label: `menu.goToTab${n}`, keys: [`Alt+${n}`], global: true })),
  { id: 'print', cat: 'file', label: 'menu.print', keys: ['Ctrl+P'], global: true },
  { id: 'settings', cat: 'file', label: 'menu.settings', keys: ['Ctrl+,'], global: true },
  { id: 'exit', cat: 'file', label: 'menu.exit', keys: [], global: true },
  // Edit
  { id: 'undo', cat: 'edit', label: 'menu.undo', keys: ['Ctrl+Z'] },
  { id: 'redo', cat: 'edit', label: 'menu.redo', keys: ['Ctrl+Y', 'Ctrl+Shift+Z'] },
  { id: 'cut', cat: 'edit', label: 'menu.cut', keys: ['Ctrl+X', 'Shift+Delete'], global: true, native: true },
  { id: 'copy', cat: 'edit', label: 'menu.copy', keys: ['Ctrl+C', 'Ctrl+Insert'], global: true, native: true },
  { id: 'paste', cat: 'edit', label: 'menu.paste', keys: ['Ctrl+V', 'Shift+Insert'], global: true, native: true },
  { id: 'selectAll', cat: 'edit', label: 'menu.selectAll', keys: ['Ctrl+A'] },
  { id: 'find', cat: 'edit', label: 'menu.find', keys: ['Ctrl+F'], global: true },
  { id: 'findNext', cat: 'edit', label: 'menu.findNext', keys: ['F3'], global: true },
  { id: 'findPrevious', cat: 'edit', label: 'menu.findPrevious', keys: ['Shift+F3'], global: true },
  { id: 'replace', cat: 'edit', label: 'menu.replace', keys: ['Ctrl+H'], global: true },
  { id: 'goTo', cat: 'edit', label: 'menu.goTo', keys: ['Ctrl+G'], global: true },
  { id: 'timeDate', cat: 'edit', label: 'menu.timeDate', keys: ['F5'] },
  { id: 'font', cat: 'edit', label: 'menu.font', keys: [], global: true },
  // Line (VS Code)
  { id: 'moveLineUp', cat: 'line', label: 'menu.moveLineUp', keys: ['Alt+Up'] },
  { id: 'moveLineDown', cat: 'line', label: 'menu.moveLineDown', keys: ['Alt+Down'] },
  { id: 'copyLineUp', cat: 'line', label: 'menu.copyLineUp', keys: ['Shift+Alt+Up'] },
  { id: 'copyLineDown', cat: 'line', label: 'menu.copyLineDown', keys: ['Shift+Alt+Down'] },
  { id: 'selectLine', cat: 'line', label: 'menu.selectLine', keys: ['Ctrl+L'] },
  { id: 'deleteLine', cat: 'line', label: 'menu.deleteLine', keys: ['Ctrl+Shift+K'] },
  { id: 'insertLineBelow', cat: 'line', label: 'menu.insertLineBelow', keys: ['Ctrl+Enter'] },
  { id: 'insertLineAbove', cat: 'line', label: 'menu.insertLineAbove', keys: ['Ctrl+Shift+Enter'] },
  { id: 'selectNextOccurrence', cat: 'line', label: 'menu.selectNextOccurrence', keys: ['Ctrl+D'] },
  { id: 'selectAllOccurrences', cat: 'line', label: 'menu.selectAllOccurrences', keys: ['Ctrl+Shift+L'] },
  { id: 'addCursorAbove', cat: 'line', label: 'menu.addCursorAbove', keys: ['Ctrl+Alt+Up'] },
  { id: 'addCursorBelow', cat: 'line', label: 'menu.addCursorBelow', keys: ['Ctrl+Alt+Down'] },
  { id: 'indentLine', cat: 'line', label: 'menu.indentLine', keys: ['Ctrl+]'] },
  { id: 'outdentLine', cat: 'line', label: 'menu.outdentLine', keys: ['Ctrl+['] },
  // Format
  { id: 'bold', cat: 'format', label: 'menu.bold', keys: ['Ctrl+B'] },
  { id: 'italic', cat: 'format', label: 'menu.italic', keys: ['Ctrl+I'] },
  { id: 'strikethrough', cat: 'format', label: 'menu.strikethrough', keys: ['Ctrl+Shift+X'] },
  { id: 'heading1', cat: 'format', label: 'menu.heading1', keys: ['Ctrl+1'] },
  { id: 'heading2', cat: 'format', label: 'menu.heading2', keys: ['Ctrl+2'] },
  { id: 'heading3', cat: 'format', label: 'menu.heading3', keys: ['Ctrl+3'] },
  { id: 'bulletList', cat: 'format', label: 'menu.bulletList', keys: ['Ctrl+Shift+8'] },
  { id: 'numberedList', cat: 'format', label: 'menu.numberedList', keys: ['Ctrl+Shift+7'] },
  { id: 'checkList', cat: 'format', label: 'menu.checkList', keys: ['Ctrl+Shift+9'] },
  { id: 'quote', cat: 'format', label: 'menu.quote', keys: ['Ctrl+Shift+.'] },
  { id: 'code', cat: 'format', label: 'menu.code', keys: ['Ctrl+E'] },
  { id: 'codeBlock', cat: 'format', label: 'menu.codeBlock', keys: ['Ctrl+Shift+E'] },
  { id: 'link', cat: 'format', label: 'menu.link', keys: ['Ctrl+K'] },
  { id: 'horizontalRule', cat: 'format', label: 'menu.horizontalRule', keys: [] },
  { id: 'table', cat: 'format', label: 'menu.table', keys: [] },
  // View
  { id: 'zoomIn', cat: 'view', label: 'menu.zoomIn', keys: ['Ctrl+Plus', 'Ctrl+NumAdd'], global: true },
  { id: 'zoomOut', cat: 'view', label: 'menu.zoomOut', keys: ['Ctrl+-', 'Ctrl+NumSubtract'], global: true },
  { id: 'zoomReset', cat: 'view', label: 'menu.zoomReset', keys: ['Ctrl+0', 'Ctrl+Num0'], global: true },
  { id: 'viewEditor', cat: 'view', label: 'menu.editorOnly', keys: ['Ctrl+Shift+1'], global: true },
  { id: 'viewSplit', cat: 'view', label: 'menu.split', keys: ['Ctrl+Shift+2'], global: true },
  { id: 'viewPreview', cat: 'view', label: 'menu.previewOnly', keys: ['Ctrl+Shift+3'], global: true },
  { id: 'wordWrap', cat: 'view', label: 'menu.wordWrap', keys: ['Alt+Z'], global: true },
  { id: 'lineNumbers', cat: 'view', label: 'menu.lineNumbers', keys: [], global: true },
  { id: 'hideMarkers', cat: 'view', label: 'menu.hideMarkers', keys: [], global: true },
  { id: 'formattingBar', cat: 'view', label: 'menu.formattingBar', keys: [], global: true },
  { id: 'statusBar', cat: 'view', label: 'menu.statusBar', keys: [], global: true },
  { id: 'writingMode', cat: 'view', label: 'menu.writingMode', keys: ['Ctrl+Shift+W'], global: true },
  { id: 'fullscreen', cat: 'view', label: 'menu.fullscreen', keys: ['F11'], global: true },
  { id: 'autosave', cat: 'view', label: 'menu.autosave', keys: [], global: true },
  // Help
  { id: 'shortcuts', cat: 'help', label: 'menu.shortcuts', keys: ['Ctrl+Shift+/', 'F1'], global: true },
  { id: 'checkForUpdates', cat: 'help', label: 'menu.checkForUpdates', keys: [], global: true },
  { id: 'about', cat: 'help', label: 'menu.about', keys: [], global: true }
];

const BY_ID = Object.fromEntries(COMMANDS.map((c) => [c.id, c]));
const CATEGORIES = ['file', 'edit', 'line', 'format', 'view', 'help'];

// ---------- key names ----------
const NAMED = {
  8: 'Backspace', 9: 'Tab', 13: 'Enter', 27: 'Escape', 32: 'Space', 33: 'PageUp', 34: 'PageDown', 35: 'End', 36: 'Home',
  37: 'Left', 38: 'Up', 39: 'Right', 40: 'Down', 45: 'Insert', 46: 'Delete',
  59: ';', 61: 'Plus', 173: '-', 186: ';', 187: 'Plus', 188: ',', 189: '-', 190: '.', 191: '/', 192: '`',
  219: '[', 220: '\\', 221: ']', 222: "'", 226: 'IntlBackslash'
};
const NUMPAD = {
  NumpadAdd: 'NumAdd', NumpadSubtract: 'NumSubtract', NumpadMultiply: 'NumMultiply', NumpadDivide: 'NumDivide',
  NumpadDecimal: 'NumDecimal', NumpadEnter: 'Enter'
};
const MODIFIER_KEYS = new Set([16, 17, 18, 91, 92, 93, 225]);
const ALIASES = {
  control: 'Ctrl', ctrl: 'Ctrl', cmdorctrl: 'Ctrl', commandorcontrol: 'Ctrl', shift: 'Shift', alt: 'Alt', option: 'Alt',
  meta: 'Meta', super: 'Meta', win: 'Meta', cmd: 'Meta'
};
const KEY_ALIASES = {
  arrowup: 'Up', arrowdown: 'Down', arrowleft: 'Left', arrowright: 'Right', esc: 'Escape', escape: 'Escape', return: 'Enter',
  enter: 'Enter', del: 'Delete', delete: 'Delete', ins: 'Insert', insert: 'Insert', space: 'Space', ' ': 'Space', tab: 'Tab',
  backspace: 'Backspace', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown', plus: 'Plus', '=': 'Plus', '+': 'Plus',
  up: 'Up', down: 'Down', left: 'Left', right: 'Right', numadd: 'NumAdd', numsubtract: 'NumSubtract', nummultiply: 'NumMultiply',
  numdivide: 'NumDivide', numdecimal: 'NumDecimal', intlbackslash: 'IntlBackslash'
};

function normalizeKeyPart(k) {
  const low = k.toLowerCase();
  if (KEY_ALIASES[low]) return KEY_ALIASES[low];
  if (/^f([1-9]|1\d|2[0-4])$/.test(low)) return 'F' + low.slice(1);
  if (/^num[0-9]$/.test(low)) return 'Num' + low.slice(3);
  if (k.length === 1) return k.toUpperCase();
  return k;
}

/** "shift+alt+up" -> "Shift+Alt+Up". Returns null for an empty or modifier-only binding. */
function normalize(binding) {
  if (!binding) return null;
  // Split on '+' but keep a literal trailing '+' as the key.
  const raw = String(binding).trim();
  const parts = raw.endsWith('++') ? [...raw.slice(0, -2).split('+'), '+'] : raw.split('+');
  const mods = new Set();
  let key = null;
  for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
    const m = ALIASES[p.toLowerCase()];
    if (m) mods.add(m); else key = normalizeKeyPart(p);
  }
  if (!key) return null;
  return [...MODS.filter((m) => mods.has(m)), key].join('+');
}

/** Canonical binding for a keydown event, or null for a lone modifier. */
function fromEvent(e) {
  let key = null;
  if (e.code && e.code.startsWith('Numpad')) {
    key = NUMPAD[e.code] || (/^Numpad\d$/.test(e.code) ? 'Num' + e.code.slice(6) : null);
  }
  const kc = e.keyCode;
  if (!key) {
    if (MODIFIER_KEYS.has(kc)) return null;
    if (kc >= 65 && kc <= 90) key = String.fromCharCode(kc);
    else if (kc >= 48 && kc <= 57) key = String.fromCharCode(kc);
    else if (kc >= 112 && kc <= 135) key = 'F' + (kc - 111);
    else if (NAMED[kc]) key = NAMED[kc];
    else if (e.key && e.key.length === 1) key = normalizeKeyPart(e.key);
    else if (e.key && !['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'Dead', 'Unidentified', 'Process'].includes(e.key)) key = normalizeKeyPart(e.key);
  }
  if (!key) return null;
  const mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.shiftKey) mods.push('Shift');
  if (e.altKey) mods.push('Alt');
  if (e.metaKey) mods.push('Meta');
  return [...mods, key].join('+');
}

/** A binding needs Ctrl, Alt or Meta, unless it is a function key: plain keys are for typing. */
function isAllowed(binding) {
  const b = normalize(binding);
  if (!b) return false;
  const parts = b.split('+');
  const key = parts[parts.length - 1];
  if (key === 'Escape') return false;
  if (/^F\d+$/.test(key)) return true;
  if (parts.includes('Ctrl') || parts.includes('Alt') || parts.includes('Meta')) return true;
  // Shift+Insert / Shift+Delete are classic Windows clipboard keys.
  return b === 'Shift+Insert' || b === 'Shift+Delete';
}

const DISPLAY = { Up: '↑', Down: '↓', Left: '←', Right: '→', Plus: '+', IntlBackslash: '<', NumAdd: 'Num +', NumSubtract: 'Num -', NumMultiply: 'Num *', NumDivide: 'Num /', NumDecimal: 'Num ,' };
function display(binding) {
  const b = normalize(binding);
  if (!b) return '';
  return b.split('+').map((p) => DISPLAY[p] || (/^Num\d$/.test(p) ? 'Num ' + p.slice(3) : p)).join('+');
}

const ACCEL = {
  Plus: 'Plus', Escape: 'Esc', NumAdd: 'numadd', NumSubtract: 'numsub', NumMultiply: 'nummult', NumDivide: 'numdiv', NumDecimal: 'numdec',
  IntlBackslash: null
};
/** Electron menu accelerator for display in the native menu, or undefined. */
function toAccelerator(binding) {
  const b = normalize(binding);
  if (!b) return undefined;
  const parts = b.split('+');
  const key = parts.pop();
  let k = key in ACCEL ? ACCEL[key] : key;
  if (/^Num\d$/.test(key)) k = 'num' + key.slice(3);
  if (k === null) return undefined;
  return [...parts.map((m) => (m === 'Meta' ? 'Super' : m)), k].join('+');
}

/** Effective bindings: user overrides (by command id) on top of the defaults. */
function effectiveBindings(overrides) {
  const out = {};
  for (const c of COMMANDS) {
    const o = overrides && Object.prototype.hasOwnProperty.call(overrides, c.id) ? overrides[c.id] : null;
    const list = Array.isArray(o) ? o : c.keys;
    out[c.id] = [...new Set(list.map(normalize).filter(Boolean))];
  }
  return out;
}

/** binding -> command id. Later commands never steal a key from earlier ones. */
function keyMap(bindings) {
  const map = new Map();
  for (const c of COMMANDS) for (const k of bindings[c.id] || []) if (!map.has(k)) map.set(k, c.id);
  return map;
}

/** Which other command already uses this binding, if any. */
function conflict(bindings, binding, exceptId) {
  const b = normalize(binding);
  for (const c of COMMANDS) if (c.id !== exceptId && (bindings[c.id] || []).includes(b)) return c.id;
  return null;
}

/** Overrides to store after setting a command's list; drops entries equal to the defaults. */
function withBinding(overrides, id, list) {
  const next = { ...(overrides || {}) };
  const norm = [...new Set(list.map(normalize).filter(Boolean))];
  const def = BY_ID[id].keys.map(normalize);
  if (norm.length === def.length && norm.every((k, i) => k === def[i])) delete next[id];
  else next[id] = norm;
  return next;
}

function isCustomized(overrides, id) {
  return !!overrides && Object.prototype.hasOwnProperty.call(overrides, id);
}

module.exports = {
  COMMANDS, BY_ID, CATEGORIES, normalize, fromEvent, isAllowed, display, toAccelerator,
  effectiveBindings, keyMap, conflict, withBinding, isCustomized
};
