// Omawrite-style marker hiding: inline Markdown syntax (** * ~~ ` and the [ ]( url ) of links)
// collapses to zero width on every line except the one the cursor is on, so the text reads
// like prose while it stays plain Markdown underneath.
import { ViewPlugin, Decoration } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';

const hidden = Decoration.replace({});
const HIDDEN_NODES = new Set(['EmphasisMark', 'CodeMark', 'StrikethroughMark', 'LinkMark', 'URL']);

function build(view) {
  const builder = new RangeSetBuilder();
  const { doc, selection } = view.state;
  const reveal = selection.ranges.map((r) => [doc.lineAt(r.from).from, doc.lineAt(r.to).to]);
  const onCursorLine = (from, to) => reveal.some(([a, b]) => from <= b && to >= a);
  let last = -1;
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (n) => {
        if (!HIDDEN_NODES.has(n.name) || n.from === n.to || n.from < last) return;
        if ((n.name === 'LinkMark' || n.name === 'URL') && n.node.parent?.name !== 'Link') return;
        if (n.name === 'CodeMark' && n.node.parent?.name !== 'InlineCode') return; // keep ``` fences visible
        if (onCursorLine(n.from, n.to)) return;
        builder.add(n.from, n.to, hidden);
        last = n.to;
      }
    });
  }
  return builder.finish();
}

export const hideMarkers = ViewPlugin.fromClass(
  class {
    constructor(view) { this.decorations = build(view); }
    update(u) { if (u.docChanged || u.viewportChanged || u.selectionSet) this.decorations = build(u.view); }
  },
  { decorations: (v) => v.decorations }
);
