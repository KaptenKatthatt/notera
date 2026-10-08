import { EditorState, Compartment, Prec, RangeSetBuilder } from '@codemirror/state';
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor,
  rectangularSelection, crosshairCursor, highlightSpecialChars, placeholder, ViewPlugin, Decoration, scrollPastEnd
} from '@codemirror/view';
import { hideMarkers } from './markers.js';
import { headings } from './headings.js';
import { typingEffects } from './effects.js';
import { searchCount } from './searchCount.js';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { syntaxHighlighting, HighlightStyle, indentUnit } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { META_RE, pasteOnTitle } from '../shared/noteHeader.js';

export const compartments = {
  language: new Compartment(),
  wrap: new Compartment(),
  gutter: new Compartment(),
  theme: new Compartment(),
  phrases: new Compartment(),
  extraKeys: new Compartment(),
  markers: new Compartment(),
  placeholder: new Compartment(),
  readOnly: new Compartment(),
  spellcheck: new Compartment()
};

// ---------- project notes: the "Projekt: X · Skapad: …" header line ----------
const metaLineDeco = Decoration.line({ class: 'cm-note-meta' });
const noteMeta = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = this.build(view); }
  update(u) { if (u.docChanged) this.decorations = this.build(u.view); }
  build(view) {
    /** @type {RangeSetBuilder<Decoration>} */
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

/** Several lines pasted on a note's title line: the first becomes the heading, the rest goes under the header line. */
const pasteKeepsHeader = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !(tr.isUserEvent('input.paste') || tr.isUserEvent('input.drop'))) return tr;
  /** @type {Array<{ from: number, to: number, text: string }>} */
  const parts = [];
  tr.changes.iterChanges((from, to, _fromB, _toB, inserted) => { parts.push({ from, to, text: inserted.toString() }); });
  if (parts.length !== 1) return tr;
  const r = pasteOnTitle(tr.startState.doc.toString(), parts[0].from, parts[0].to, parts[0].text);
  if (!r) return tr;
  return { changes: r.changes, selection: { anchor: r.cursor }, scrollIntoView: true, userEvent: 'input.paste' };
});

const mdHighlight = HighlightStyle.define([
  { tag: [t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: '700', color: 'var(--h-text, var(--h-color, var(--md-h)))' },
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
    compartments.wrap.of(opts.wordWrap ? wrapExt : []),
    compartments.gutter.of(opts.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
    compartments.theme.of(themeFor(opts.dark)),
    compartments.phrases.of(EditorState.phrases.of(opts.phrases || {})),
    compartments.extraKeys.of(keymap.of(opts.extraKeys || [])),
    compartments.markers.of(opts.kind === 'md' && opts.hideMarkers ? hideMarkers : []),
    compartments.placeholder.of(placeholder(opts.placeholder || '')),
    compartments.readOnly.of(readOnlyExt(opts.readOnly)),
    compartments.spellcheck.of(spellcheckExt(opts.spellcheck)),
    noteMeta,
    noteKeys,
    pasteKeepsHeader,
    searchCount,
    history(),
    closeBrackets(),
    drawSelection(),
    dropCursor(),
    highlightSpecialChars(),
    highlightActiveLine(),
    selectingClass,
    selectedText,
    scrollPastEnd(),
    highlightSelectionMatches(),
    rectangularSelection(),
    crosshairCursor(),
    search({ top: true }),
    syntaxHighlighting(mdHighlight),
    headings,
    typingEffects,
    indentUnit.of('  '),
    EditorState.allowMultipleSelections.of(true),
    keymap.of(editorKeymap()),
    EditorView.contentAttributes.of({ autocapitalize: 'off', autocorrect: 'off' })
  ];
}

// While text is selected the editor gets cm-selecting, so CSS can drop the active-line background.
// That background is drawn over CodeMirror's selection layer and hid a selection on the cursor's
// line, i.e. every selection within one line. VS Code also hides the line highlight then.
const selectingClass = EditorView.editorAttributes.compute(['selection'], (state) => (
  state.selection.ranges.some((r) => !r.empty) ? { class: 'cm-selecting' } : {}
));

// Selected text is drawn in --selection-fg. A selection strong enough to see (3:1 against the
// background, WCAG 1.4.11) leaves no room for coloured Markdown on top of it to stay readable
// (4.5:1), so the selected text takes one colour picked for that background, like Notepad does.
const selectedMark = Decoration.mark({ class: 'cm-selectedText' });
const selectedText = ViewPlugin.fromClass(class {
  /** @param {EditorView} view */
  constructor(view) { this.decorations = this.build(view); }
  /** @param {import('@codemirror/view').ViewUpdate} u */
  update(u) { if (u.selectionSet || u.docChanged || u.viewportChanged) this.decorations = this.build(u.view); }
  /** @param {EditorView} view */
  build(view) {
    const ranges = view.state.selection.ranges.filter((r) => !r.empty).map((r) => selectedMark.range(r.from, r.to));
    return Decoration.set(ranges, true);
  }
}, { decorations: (p) => p.decorations });

// With word wrap on, the continuation of a wrapped indented line starts under the line's own start,
// not at the left edge, like VS Code's wrappingIndent "same". Each indented line gets padding equal
// to its leading whitespace and the same negative text-indent, so its first visual line stays put.
// The width comes from the space width of the editor font (proportional fonts too); a tab counts
// as tabSize spaces. Leading whitespace only: a list item's continuation goes under its "-".
const indentDecos = new Map(); // columns -> line decoration
function indentDeco(cols) {
  let d = indentDecos.get(cols);
  if (!d) indentDecos.set(cols, d = Decoration.line({ class: 'cm-wrap-indent', attributes: { style: `--wi:${cols}` } }));
  return d;
}
const measureCtx = document.createElement('canvas').getContext('2d');
const wrapIndent = ViewPlugin.fromClass(class {
  /** @param {EditorView} view */
  constructor(view) {
    this.font = '';
    this.w = 0;
    this.pad = '';
    this.decorations = this.build(view);
    this.measure(view);
    // The font changes from outside the editor (Settings, a theme's CSS variables or style.css, a
    // web font finishing loading), which CodeMirror does not always report as a geometry change.
    this.remeasure = () => this.measure(view);
    this.observer = new MutationObserver(this.remeasure);
    this.observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
    this.observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    this.observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    document.fonts.addEventListener('loadingdone', this.remeasure);
  }
  destroy() {
    this.observer.disconnect();
    document.fonts.removeEventListener('loadingdone', this.remeasure);
  }
  /** @param {import('@codemirror/view').ViewUpdate} u */
  update(u) {
    if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view);
    if (u.geometryChanged) this.measure(u.view);
  }
  /** @param {EditorView} view */
  measure(view) {
    view.requestMeasure({
      read: () => {
        const cs = getComputedStyle(view.contentDOM);
        const plain = view.contentDOM.querySelector('.cm-line:not(.cm-wrap-indent)');
        const pad = plain ? getComputedStyle(plain).paddingLeft : '';
        const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        // Measure every time: a web font that finishes loading changes the space width while the
        // font string stays the same.
        measureCtx.font = font;
        const w = measureCtx.measureText(' ').width;
        if (font === this.font && w === this.w && (!pad || pad === this.pad)) return null;
        return { font, pad: pad || this.pad, w };
      },
      write: (m) => {
        if (!m) return;
        this.font = m.font;
        this.w = m.w;
        this.pad = m.pad;
        view.contentDOM.style.setProperty('--space-w', `${m.w}px`);
        if (m.pad) view.contentDOM.style.setProperty('--line-pad', m.pad);
      }
    });
  }
  /** @param {EditorView} view */
  build(view) {
    /** @type {RangeSetBuilder<Decoration>} */
    const b = new RangeSetBuilder();
    const { doc, tabSize } = view.state;
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const line = doc.lineAt(pos);
        let cols = 0, i = 0;
        for (; i < line.length; i++) {
          const c = line.text.charCodeAt(i);
          if (c === 32) cols++;
          else if (c === 9) cols += tabSize - (cols % tabSize);
          else break;
        }
        if (cols && i < line.length) b.add(line.from, line.from, indentDeco(cols));
        pos = line.to + 1;
      }
    }
    return b.finish();
  }
}, { decorations: (v) => v.decorations });
const wrapExt = [EditorView.lineWrapping, wrapIndent];

function spellcheckExt(on) { return EditorView.contentAttributes.of({ spellcheck: on ? 'true' : 'false' }); }

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
    compartments.wrap.reconfigure(opts.wordWrap ? wrapExt : []),
    compartments.gutter.reconfigure(opts.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
    compartments.theme.reconfigure(themeFor(opts.dark)),
    compartments.phrases.reconfigure(EditorState.phrases.of(opts.phrases || {})),
    compartments.extraKeys.reconfigure(keymap.of(opts.extraKeys || [])),
    compartments.markers.reconfigure(opts.kind === 'md' && opts.hideMarkers ? hideMarkers : []),
    compartments.placeholder.reconfigure(placeholder(opts.placeholder || '')),
    compartments.readOnly.reconfigure(readOnlyExt(opts.readOnly)),
    compartments.spellcheck.reconfigure(spellcheckExt(opts.spellcheck))
  ];
}

export { EditorView, EditorState };
