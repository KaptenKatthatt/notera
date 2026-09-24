// Markdown formatting commands operating on a CodeMirror EditorView.
import { EditorSelection } from '@codemirror/state';

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Toggle inline markers (e.g. ** for bold) around each selection range. */
export function toggleInline(view, before, after = before) {
  const changes = view.state.changeByRange((range) => {
    const { from, to } = range;
    const doc = view.state.doc;
    const text = doc.sliceString(from, to);
    const bl = before.length, al = after.length;
    // Selection already includes the markers -> unwrap.
    if (text.startsWith(before) && text.endsWith(after) && text.length >= bl + al) {
      const inner = text.slice(bl, text.length - al);
      return { changes: { from, to, insert: inner }, range: EditorSelection.range(from, from + inner.length) };
    }
    // Markers directly outside the selection -> unwrap.
    if (doc.sliceString(from - bl, from) === before && doc.sliceString(to, to + al) === after) {
      return {
        changes: [{ from: from - bl, to: from, insert: '' }, { from: to, to: to + al, insert: '' }],
        range: EditorSelection.range(from - bl, to - bl)
      };
    }
    if (from === to) {
      // Empty selection: wrap the word under the cursor if any, else insert an empty pair.
      const line = doc.lineAt(from);
      const rel = from - line.from;
      const wordRe = /[\p{L}\p{N}_]/u;
      let s = rel, e = rel;
      while (s > 0 && wordRe.test(line.text[s - 1])) s--;
      while (e < line.text.length && wordRe.test(line.text[e])) e++;
      if (s !== e) {
        const wf = line.from + s, wt = line.from + e;
        return {
          changes: [{ from: wf, insert: before }, { from: wt, insert: after }],
          range: EditorSelection.range(wf + bl, wt + bl)
        };
      }
      return { changes: { from, insert: before + after }, range: EditorSelection.cursor(from + bl) };
    }
    return {
      changes: [{ from, insert: before }, { from: to, insert: after }],
      range: EditorSelection.range(from + bl, to + bl)
    };
  });
  view.dispatch(changes, { scrollIntoView: true });
  view.focus();
  return true;
}

function linesInRange(state, range) {
  const lines = [];
  let line = state.doc.lineAt(range.from);
  while (true) {
    lines.push(line);
    if (line.to >= range.to || line.number === state.doc.lines) break;
    line = state.doc.line(line.number + 1);
  }
  return lines;
}

const LINE_PREFIX = /^(\s*)((?:[-*+]\s+\[[ xX]\]\s+)|(?:[-*+]\s+)|(?:\d+[.)]\s+)|(?:>\s?)|(?:#{1,6}\s+))?/;

/**
 * Toggle a line-level prefix on every line of every selection.
 * kind: 'bullet' | 'number' | 'check' | 'quote' | 'h1'..'h6'
 */
export function toggleLinePrefix(view, kind) {
  const state = view.state;
  const changes = [];
  const seen = new Set();
  for (const range of state.selection.ranges) {
    const lines = linesInRange(state, range).filter((l) => !seen.has(l.number));
    lines.forEach((l) => seen.add(l.number));
    const nonEmpty = lines.filter((l) => l.text.trim().length > 0);
    const target = nonEmpty.length ? nonEmpty : lines.slice(0, 1);
    const allHave = target.every((l) => hasPrefix(l.text, kind));
    let n = 1;
    for (const line of target) {
      const m = LINE_PREFIX.exec(line.text);
      const indent = m[1] || '';
      const existing = m[2] || '';
      const newPrefix = allHave ? '' : prefixFor(kind, n++);
      // Replace only the prefix span, so a selection in the rest of the line just shifts.
      const from = line.from + indent.length;
      if (newPrefix !== existing) changes.push({ from, to: from + existing.length, insert: newPrefix });
    }
  }
  if (changes.length) view.dispatch({ changes, scrollIntoView: true });
  view.focus();
  return true;
}

function prefixFor(kind, n) {
  switch (kind) {
    case 'bullet': return '- ';
    case 'number': return `${n}. `;
    case 'check': return '- [ ] ';
    case 'quote': return '> ';
    default: {
      const m = /^h([1-6])$/.exec(kind);
      return m ? '#'.repeat(+m[1]) + ' ' : '';
    }
  }
}

function hasPrefix(text, kind) {
  const m = LINE_PREFIX.exec(text);
  const p = (m && m[2]) || '';
  switch (kind) {
    case 'bullet': return /^[-*+]\s+$/.test(p);
    case 'number': return /^\d+[.)]\s+$/.test(p);
    case 'check': return /^[-*+]\s+\[[ xX]\]\s+$/.test(p);
    case 'quote': return /^>\s?$/.test(p);
    default: {
      const mm = /^h([1-6])$/.exec(kind);
      return !!mm && new RegExp(`^${escapeRe('#'.repeat(+mm[1]))}\\s+$`).test(p);
    }
  }
}

export function toggleCodeBlock(view) {
  const state = view.state;
  const range = state.selection.main;
  const lines = linesInRange(state, range);
  const first = lines[0], last = lines[lines.length - 1];
  // Unwrap if the block is already fenced.
  if (first.number > 1 && last.number < state.doc.lines) {
    const above = state.doc.line(first.number - 1), below = state.doc.line(last.number + 1);
    if (/^\s*```/.test(above.text) && /^\s*```\s*$/.test(below.text)) {
      view.dispatch({ changes: [{ from: above.from, to: first.from, insert: '' }, { from: last.to, to: below.to, insert: '' }] });
      view.focus();
      return true;
    }
  }
  if (/^\s*```/.test(first.text) && /^\s*```\s*$/.test(last.text) && first.number !== last.number) {
    view.dispatch({ changes: [{ from: first.from, to: first.to + 1, insert: '' }, { from: last.from - 1, to: last.to, insert: '' }] });
    view.focus();
    return true;
  }
  const insertFrom = first.from, insertTo = last.to;
  view.dispatch({
    changes: [{ from: insertFrom, insert: '```\n' }, { from: insertTo, insert: '\n```' }],
    selection: EditorSelection.cursor(insertFrom + 4)
  });
  view.focus();
  return true;
}

export function insertLink(view, text, url) {
  const range = view.state.selection.main;
  const md = `[${text || url}](${url})`;
  view.dispatch({ changes: { from: range.from, to: range.to, insert: md }, selection: EditorSelection.cursor(range.from + md.length) });
  view.focus();
}

/** Insert a block (hr, table) on its own lines at the cursor. */
export function insertBlock(view, block) {
  const state = view.state;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.to);
  const prefix = line.text.length ? '\n\n' : (line.number > 1 && state.doc.line(line.number - 1).text.length ? '\n' : '');
  const insert = prefix + block + '\n';
  view.dispatch({ changes: { from: line.to, insert }, selection: EditorSelection.cursor(line.to + insert.length) , scrollIntoView: true });
  view.focus();
}

export function insertAtCursor(view, text) {
  const changes = view.state.changeByRange((range) => ({
    changes: { from: range.from, to: range.to, insert: text },
    range: EditorSelection.cursor(range.from + text.length)
  }));
  view.dispatch(changes, { scrollIntoView: true });
  view.focus();
}

export const TABLE_TEMPLATE = '| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |';
