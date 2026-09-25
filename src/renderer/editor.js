import { EditorState, Compartment, Prec, RangeSetBuilder } from '@codemirror/state';
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor,
  rectangularSelection, crosshairCursor, highlightSpecialChars, placeholder, ViewPlugin, Decoration
} from '@codemirror/view';
import { hideMarkers } from './markers.js';
import { searchCount } from './searchCount.js';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { syntaxHighlighting, HighlightStyle, indentUnit } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { META_RE } from '../shared/noteHeader.js';

export const compartments = {
  language: new Compartment(),
  wrap: new Compartment(),
  gutter: new Compartment(),
  theme: new Compartment(),
  phrases: new Compartment(),
  extraKeys: new Compartment(),
  markers: new Compartment(),
  placeholder: new Compartment(),
  readOnly: new Compartment()
};

// ---------- project notes: the "Projekt: X · Skapad: …" header line ----------
const metaLineDeco = Decoration.line({ class: 'cm-note-meta' });
const noteMeta = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = this.build(view); }
  update(u) { if (u.docChanged) this.decorations = this.build(u.view); }
  build(view) {
    const b = new RangeSetBuilder();
    const doc = view.state.doc;
    for (let n = 1; n <= Math.min(3, doc.lines); n++) {
      const line = doc.line(n);
      if (META_RE.test(line.text)) { b.add(line.from, line.from, metaLineDeco); break; }
    }
    return b.finish();
  }
}, { decorations: (v) => v.decorations });

/** Enter on the title line of a note jumps past the header line to the body instead of splitting it. */
function enterPastHeader(view) {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty || state.selection.ranges.length > 1 || state.readOnly || state.doc.lines < 2) return false;
  if (state.doc.lineAt(sel.head).number !== 1 || !/^#\s/.test(state.doc.line(1).text)) return false;
  const meta = state.doc.line(2);
  if (!META_RE.test(meta.text)) return false;
  let insert = '';
  let target;
  if (state.doc.lines >= 3 && state.doc.line(3).text === '') {
    if (state.doc.lines >= 4) target = state.doc.line(4).from;
    else { insert = '\n'; target = state.doc.length + 1; }
  } else if (state.doc.lines >= 3) {
    // Header line followed directly by text: open a blank line under the header.
    view.dispatch({ changes: { from: meta.to, insert: '\n' }, selection: { anchor: meta.to + 1 }, scrollIntoView: true, userEvent: 'input' });
    return true;
  } else { insert = '\n\n'; target = state.doc.length + 2; }
  view.dispatch({
    changes: insert ? { from: state.doc.length, insert } : undefined,
    selection: { anchor: target }, scrollIntoView: true, userEvent: 'select'
  });
  return true;
}
const noteKeys = Prec.high(keymap.of([{ key: 'Enter', run: enterPastHeader }]));

const mdHighlight = HighlightStyle.define([
  { tag: [t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: '700', color: 'var(--fg)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--md-link)', textDecoration: 'underline' },
  { tag: t.url, color: 'var(--md-meta)' },
  { tag: t.monospace, backgroundColor: 'var(--code-bg)', borderRadius: '3px' },
  { tag: t.quote, color: 'var(--md-quote)', fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.meta, t.labelName, t.contentSeparator], color: 'var(--md-meta)' },
  { tag: t.keyword, color: 'var(--md-h)' },
  { tag: t.comment, color: 'var(--md-meta)', fontStyle: 'italic' },
  { tag: [t.string, t.special(t.string)], color: 'var(--md-code)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--md-code)' }
]);

function themeFor(dark) {
  return EditorView.theme({}, { dark });
}

// CodeMirror's own bindings for keys that belong to app commands. Those keys are dispatched from
// the command registry (see keybindings.js), so a shortcut removed in Settings really goes away.
const TAKEN = new Set([
  'Alt-ArrowUp', 'Shift-Alt-ArrowUp', 'Alt-ArrowDown', 'Shift-Alt-ArrowDown', 'Mod-Alt-ArrowUp', 'Mod-Alt-ArrowDown',
  'Mod-Enter', 'Alt-l', 'Mod-i', 'Mod-[', 'Mod-]', 'Shift-Mod-k', 'Mod-a',
  'Mod-f', 'F3', 'Mod-g', 'Shift-F3', 'Shift-Mod-g', 'Mod-Alt-g', 'Mod-d', 'Mod-Shift-l',
  'Mod-z', 'Mod-y', 'Mod-Shift-z', 'Ctrl-Shift-z'
]);
function editorKeymap() {
  const keep = (b) => !TAKEN.has(b.key) && !TAKEN.has(b.linux) && !TAKEN.has(b.win);
  return [...closeBracketsKeymap.filter(keep), ...searchKeymap.filter(keep), ...historyKeymap.filter(keep), indentWithTab, ...defaultKeymap.filter(keep)];
}

export function markdownExtension() {
  return markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true });
}

export function baseExtensions(opts) {
  return [
    compartments.language.of(opts.kind === 'md' ? markdownExtension() : []),
    compartments.wrap.of(opts.wordWrap ? EditorView.lineWrapping : []),
    compartments.gutter.of(opts.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
    compartments.theme.of(themeFor(opts.dark)),
    compartments.phrases.of(EditorState.phrases.of(opts.phrases || {})),
    compartments.extraKeys.of(keymap.of(opts.extraKeys || [])),
    compartments.markers.of(opts.kind === 'md' && opts.hideMarkers ? hideMarkers : []),
    compartments.placeholder.of(placeholder(opts.placeholder || '')),
    compartments.readOnly.of(readOnlyExt(opts.readOnly)),
    noteMeta,
    noteKeys,
    searchCount,
    history(),
    closeBrackets(),
    drawSelection(),
    dropCursor(),
    highlightSpecialChars(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    rectangularSelection(),
    crosshairCursor(),
    search({ top: true }),
    syntaxHighlighting(mdHighlight),
    indentUnit.of('  '),
    EditorState.allowMultipleSelections.of(true),
    keymap.of(editorKeymap()),
    EditorView.contentAttributes.of({ spellcheck: 'true', autocapitalize: 'off', autocorrect: 'off' })
  ];
}

function readOnlyExt(on) { return on ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []; }

export function createState(text, opts) {
  return EditorState.create({ doc: text, extensions: baseExtensions(opts) });
}

/** Reconfigure every compartment on a state (used for inactive tabs). */
export function reconfigureState(state, opts) {
  return state.update({ effects: reconfigureEffects(opts) }).state;
}

export function reconfigureEffects(opts) {
  return [
    compartments.language.reconfigure(opts.kind === 'md' ? markdownExtension() : []),
    compartments.wrap.reconfigure(opts.wordWrap ? EditorView.lineWrapping : []),
    compartments.gutter.reconfigure(opts.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
    compartments.theme.reconfigure(themeFor(opts.dark)),
    compartments.phrases.reconfigure(EditorState.phrases.of(opts.phrases || {})),
    compartments.extraKeys.reconfigure(keymap.of(opts.extraKeys || [])),
    compartments.markers.reconfigure(opts.kind === 'md' && opts.hideMarkers ? hideMarkers : []),
    compartments.placeholder.reconfigure(placeholder(opts.placeholder || '')),
    compartments.readOnly.reconfigure(readOnlyExt(opts.readOnly))
  ];
}

export { EditorView, EditorState };
