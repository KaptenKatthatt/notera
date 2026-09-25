// previewTasks.js — klickbara todo-rutor i förhandsvisningen.
// marked renderar varje task-rad (`- [ ]` / `- [x]`) som exakt en checkbox i
// DOM-ordning, så den k:te rutan mappas till dokumentets k:te task-rad.
// Klick växlar [ ]↔[x] i dokumentet — dirty, autosave och preview-uppdatering
// följer de befintliga flödena via appens dispatchTransactions.
const TASK_RE = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[[ xX]\]/;

export function taskRows(doc) {
  const rows = [];
  for (let i = 1; i <= doc.lines; i++) {
    if (TASK_RE.test(doc.line(i).text)) rows.push(i);
  }
  return rows;
}

export function bindTaskCheckboxes(previewEl, view) {
  const boxes = Array.from(previewEl.querySelectorAll('input[type="checkbox"]'));
  if (!boxes.length) return;
  const rows = taskRows(view.state.doc);
  if (boxes.length > rows.length) return; // mappningen stämmer inte — låt rutorna vara
  boxes.forEach((box, k) => {
    box.disabled = false;
    box.style.cursor = 'pointer';
    box.addEventListener('change', () => {
      const line = view.state.doc.line(rows[k]);
      const m = line.text.match(/^([ \t]*(?:[-*+]|\d+[.)])[ \t]+\[)([ xX])(\])/);
      if (!m) return;
      const next = m[2] === ' ' ? 'x' : ' ';
      view.dispatch({ changes: { from: line.from + m[1].length, to: line.from + m[1].length + 1, insert: next } });
    });
  });
}
