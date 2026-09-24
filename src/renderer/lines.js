// VS Code line editing. Bound at high precedence so these keys mean what they mean in VS Code,
// whatever CodeMirror's defaults happen to be.
import { Prec, EditorSelection } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import {
  moveLineUp, moveLineDown, copyLineUp, copyLineDown, deleteLine, insertBlankLine,
  addCursorAbove, addCursorBelow, indentMore, indentLess
} from '@codemirror/commands';
import { selectNextOccurrence, selectSelectionMatches } from '@codemirror/search';

/**
 * Ctrl+L as in VS Code: select the whole line including its line break. Pressing it again
 * while a full-line selection is active adds the next line.
 */
export function selectLineVS(view) {
  const { state } = view;
  const ranges = state.selection.ranges.map((range) => {
    const first = state.doc.lineAt(range.from);
    // A selection that already ends at the start of a line covers the previous lines fully:
    // the line it ends on is the next one to add.
    const last = state.doc.lineAt(range.to);
    const to = last.number < state.doc.lines ? last.to + 1 : last.to;
    return EditorSelection.range(first.from, to);
  });
  view.dispatch({ selection: EditorSelection.create(ranges, state.selection.mainIndex), scrollIntoView: true, userEvent: 'select' });
  return true;
}

/**
 * Ctrl+D: select the word under each cursor. A range that already has a selection is left alone,
 * so pressing it again does nothing.
 */
export function selectWord(view) {
  const { state } = view;
  let changed = false;
  const ranges = state.selection.ranges.map((range) => {
    if (!range.empty) return range;
    const word = state.wordAt(range.head);
    if (!word) return range;
    changed = true;
    return EditorSelection.range(word.from, word.to);
  });
  if (changed) view.dispatch({ selection: EditorSelection.create(ranges, state.selection.mainIndex), userEvent: 'select' });
  return true;
}

/** Ctrl+Shift+Enter: open an empty line above the cursor, keeping the line's indentation. */
export function insertLineAbove(view) {
  if (view.state.readOnly) return false;
  const changes = view.state.changeByRange((range) => {
    const line = view.state.doc.lineAt(range.head);
    const indent = /^\s*/.exec(line.text)[0];
    return {
      changes: { from: line.from, insert: indent + '\n' },
      range: EditorSelection.cursor(line.from + indent.length)
    };
  });
  view.dispatch(changes, { scrollIntoView: true, userEvent: 'input' });
  return true;
}

export const lineCommands = {
  moveLineUp, moveLineDown, copyLineUp, copyLineDown, deleteLine, selectLine: selectLineVS,
  insertLineBelow: insertBlankLine, insertLineAbove, selectWord, selectNextOccurrence, selectAllOccurrences: selectSelectionMatches,
  addCursorAbove, addCursorBelow, indentLine: indentMore, outdentLine: indentLess
};

export const vscodeKeymap = Prec.highest(keymap.of([
  { key: 'Alt-ArrowUp', run: moveLineUp, preventDefault: true },
  { key: 'Alt-ArrowDown', run: moveLineDown, preventDefault: true },
  { key: 'Shift-Alt-ArrowUp', run: copyLineUp, preventDefault: true },
  { key: 'Shift-Alt-ArrowDown', run: copyLineDown, preventDefault: true },
  { key: 'Mod-l', run: selectLineVS, preventDefault: true },
  { key: 'Mod-Shift-k', run: deleteLine, preventDefault: true },
  { key: 'Mod-Enter', run: insertBlankLine, preventDefault: true },
  { key: 'Mod-Shift-Enter', run: insertLineAbove, preventDefault: true },
  { key: 'Mod-d', run: selectWord, preventDefault: true },
  { key: 'Mod-Shift-l', run: selectSelectionMatches, preventDefault: true },
  { key: 'Mod-Alt-ArrowUp', run: addCursorAbove, preventDefault: true },
  { key: 'Mod-Alt-ArrowDown', run: addCursorBelow, preventDefault: true },
  { key: 'Mod-]', run: indentMore, preventDefault: true },
  { key: 'Mod-[', run: indentLess, preventDefault: true }
]));
