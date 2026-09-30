// headings.js: marks heading lines in the editor so themes can style them per level. Each heading
// line gets `cm-h cm-h<level>` (colour per level, heading font, glow), and the heading text itself
// the class `cm-hd` (an H1 gradient must sit on the text, not on the line, whose background is
// the active-line highlight).
import { ViewPlugin, Decoration } from '@codemirror/view';
import { syntaxTree, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import { tags as t } from '@lezer/highlight';

const LEVEL = /^(?:ATXHeading|SetextHeading)([1-6])$/;
const lineDeco = [1, 2, 3, 4, 5, 6].map((n) => Decoration.line({ class: `cm-h cm-h${n}` }));

function build(view) {
  /** @type {RangeSetBuilder<Decoration>} */
  const builder = new RangeSetBuilder();
  const doc = view.state.doc;
  let lastLine = -1;
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from, to,
      enter: (n) => {
        const m = LEVEL.exec(n.name);
        if (!m) return;
        const deco = lineDeco[Number(m[1]) - 1];
        // A setext heading spans its text line and its underline; mark both.
        for (let pos = n.from; pos <= n.to;) {
          const line = doc.lineAt(pos);
          if (line.number > lastLine) { builder.add(line.from, line.from, deco); lastLine = line.number; }
          if (line.to >= n.to) break;
          pos = line.to + 1;
        }
        return false;
      }
    });
  }
  return builder.finish();
}

const headingLines = ViewPlugin.fromClass(
  class {
    constructor(view) { this.decorations = build(view); }
    update(u) {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = build(u.view);
    }
  },
  { decorations: (v) => v.decorations }
);

const headingText = syntaxHighlighting(HighlightStyle.define([
  { tag: [t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6], class: 'cm-hd' }
]));

export const headings = [headingLines, headingText];
