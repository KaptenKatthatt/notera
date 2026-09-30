const test = require('node:test');
const assert = require('node:assert/strict');

// format.js is an ES module that only needs @codemirror/state; a view stand-in is enough.
async function run(text, cursor, kind) {
  const { toggleLinePrefix } = await import('../../src/renderer/format.js');
  const { EditorState } = await import('@codemirror/state');
  const view = {
    state: EditorState.create({ doc: text, selection: { anchor: cursor } }),
    dispatch(spec) { this.state = this.state.update(spec).state; },
    focus() {}
  };
  toggleLinePrefix(view, kind);
  return { doc: view.state.doc.toString(), cursor: view.state.selection.main.head };
}

test('Ctrl+2 på tom rad: "## " och markören efter mellanslaget', async () => {
  assert.deepEqual(await run('', 0, 'h2'), { doc: '## ', cursor: 3 });
  assert.deepEqual(await run('a\n\nb', 2, 'h2'), { doc: 'a\n## \nb', cursor: 5 });
});

test('markören i början av en rad med text hamnar efter prefixet', async () => {
  assert.deepEqual(await run('Rubrik', 0, 'h2'), { doc: '## Rubrik', cursor: 3 });
});

test('markören inne i texten stannar kvar i texten', async () => {
  assert.deepEqual(await run('Rubrik', 3, 'h2'), { doc: '## Rubrik', cursor: 6 });
});

test('byte av nivå byter prefix, markören i gamla prefixet hamnar efter det nya', async () => {
  assert.deepEqual(await run('### Rubrik', 1, 'h2'), { doc: '## Rubrik', cursor: 3 });
  assert.deepEqual(await run('### Rubrik', 7, 'h1'), { doc: '# Rubrik', cursor: 5 });
});

test('samma nivå igen tar bort rubriken', async () => {
  assert.deepEqual(await run('## Rubrik', 5, 'h2'), { doc: 'Rubrik', cursor: 2 });
  assert.deepEqual(await run('## Rubrik', 3, 'h2'), { doc: 'Rubrik', cursor: 0 });
});

test('Ctrl+4 till 6 ger nivå 4 till 6', async () => {
  assert.deepEqual(await run('', 0, 'h6'), { doc: '###### ', cursor: 7 });
});
