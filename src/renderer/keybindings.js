// Dispatches every app shortcut from the command registry. Runs in the capture phase so it sees
// keys before CodeMirror, and CodeMirror's own bindings for these commands have been removed.
import { BY_ID, fromEvent, keyMap, effectiveBindings } from '../shared/commands.js';

// Keys Chromium would act on by itself if nothing claimed them. When the user moves e.g. Copy
// to another key, Ctrl+C should stop copying inside the editor.
const NATIVE_DEFAULTS = new Set(['Ctrl+X', 'Ctrl+C', 'Ctrl+V', 'Ctrl+Insert', 'Shift+Insert', 'Shift+Delete', 'Ctrl+A', 'Ctrl+Z', 'Ctrl+Y']);

export function createKeyDispatcher({ run }) {
  let map = new Map();
  let bindings = effectiveBindings({});

  function setOverrides(overrides) {
    bindings = effectiveBindings(overrides);
    map = keyMap(bindings);
  }

  function onKeyDown(e) {
    if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
    // AltGr is Ctrl+Alt on Windows: it types characters like { [ @ on a Swedish keyboard.
    if (e.getModifierState && e.getModifierState('AltGraph')) return;
    if (document.querySelector('dialog[open]')) return;
    const combo = fromEvent(e);
    if (!combo) return;
    const target = e.target instanceof Element ? e.target : document.body;
    const inEditor = !!target.closest('.cm-content');
    const inField = !inEditor && target.matches('input, textarea, select, [contenteditable="true"]');
    const id = map.get(combo);
    if (!id) {
      if (inEditor && NATIVE_DEFAULTS.has(combo)) e.preventDefault();
      return;
    }
    if (inField && !BY_ID[id].global) return;
    e.preventDefault();
    e.stopPropagation();
    run(id);
  }

  window.addEventListener('keydown', onKeyDown, true);
  return { setOverrides, bindings: () => bindings };
}
