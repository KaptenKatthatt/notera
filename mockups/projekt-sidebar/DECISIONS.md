# Projects in the sidebar: decisions

Agreed with Jonas before building, and built as decided. The clickable mockup is `index.html` next to this file. It has no real disk behind it: its data lives in `localStorage`, and its "Disk" panel shows what would happen to the files. The yellow bar at the top belongs to the mockup, not to the app. The mockup's UI text is Swedish, like the app's default.

1. **One notes folder, chosen once.** You pick it in Settings, for example `OneDrive\Documents\Notera`. Every project is a subfolder named after the project, and Notera owns that structure. Renaming a project renames its folder. An existing file assigned to a project is moved in, never copied.
2. **One level.** Projects contain notes, nothing deeper. Projects and notes keep a manual order you change by dragging. The order is stored in `.notera.json` in the notes folder.
3. **Borrowed from other notes apps:** an Unsorted inbox, search (Ctrl+Shift+F) over titles and text including the archive, and pinning a note to the top of its project.
4. **New note without a dialog.** The + on a project creates the file right away. It is named `YYYY-MM-DD Title.md` after its `# ` heading when the cursor leaves the heading. When two notes would get the same name, the second one gets " (2)".
5. **Header:** `# Title`, then `Projekt: X · Skapad: YYYY-MM-DD HH:MM`, with the labels in the UI language. The project is rewritten when the note moves or its project is renamed. The creation time never changes.
6. **One shared archive** in `Arkiv\<Project>\`. Whole projects can be archived too. Restoring a note whose project is gone re-creates the project.
7. **Tabs.** Clicking a note opens it in a tab, or switches to the tab when it is already open. Files outside the notes folder get "Move to project…" in the tab menu.
8. **Sidebar** on the left with a width you can drag. Ctrl+Shift+B shows and hides it, and it is hidden in writing mode. It starts hidden until a notes folder is chosen.
9. **Ctrl+T** creates a note in Unsorted once a notes folder is chosen. Before that it opens an untitled tab as it always did. **Ctrl+Alt+N** creates a note in the current project.
10. **Deleting** goes to the Windows Recycle Bin. A project with notes can be deleted: the dialog warns and offers "Archive instead". Archiving, moving and restoring show an Undo bar.
