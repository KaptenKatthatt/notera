import { EditorState, Compartment } from '@codemirror/state';
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor,
  rectangularSelection, crosshairCursor, highlightSpecialChars, placeholder
} from '@codemirror/view';
import { hideMarkers } from './markers.js';
import { searchCount } from './searchCount.js';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { syntaxHighlighting, HighlightStyle, indentUnit } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

export const compartments = {
  language: new Compartment(),
  wrap: new Compartment(),
  gutter: new Compartment(),
  theme: new Compartment(),
  phrases: new Compartment(),
  extraKeys: new Compartment(),
  markers: new Compartment(),
  placeholder: new Compartment()
};

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
    searchCount,
    history(),
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
    keymap.of([...searchKeymap, ...historyKeymap, indentWithTab, ...defaultKeymap]),
    EditorView.contentAttributes.of({ spellcheck: 'true', autocapitalize: 'off', autocorrect: 'off' })
  ];
}

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
    compartments.placeholder.reconfigure(placeholder(opts.placeholder || ''))
  ];
}

export { EditorView, EditorState };
