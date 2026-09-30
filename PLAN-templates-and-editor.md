# Plan: templates, standup notes and editor fixes

Decided with Jonas on 2026-09-30. Four PRs against master, in this order. Each one stands on its own.

## PR 1: editor

- **Ctrl+1 to Ctrl+6** set heading level 1 to 6 (Ctrl+4 to 6 are new, also in the Format menu).
  - Empty line: the line becomes `## ` and the cursor lands after the space.
  - Cursor at the start of the line or inside an old prefix: the cursor lands right after `## `, before the text.
  - Cursor inside the text: it stays where it was, shifted by the prefix.
  - Another level replaces the prefix. The same level again removes it, as today.
- **Narrow text column**: View menu checkbox, on by default, also for existing installs. 66 characters, centred, the same width as writing mode, set in one place. Sidebar and preview stay. Off means full width. No resizing yet; that stays in the backlog.
- **Scroll past the end**: CodeMirror's `scrollPastEnd()`, always on, in normal and writing mode. Replaces writing mode's fixed 220 px bottom padding.

## PR 2: tabs

- The mouse wheel over the tab bar scrolls it sideways. A thin scrollbar shows under the tabs on hover when they do not all fit. No arrow buttons.
- Tab right-click menu gains Close others, Close all and Close to the right (disabled when there is nothing to close).
- Unsaved tabs: ask about each affected tab in tab order, like closing the window does. Cancel on any of them stops everything and closes nothing. Once all are answered, the tabs close.
- Close all leaves one empty tab. The window never closes. Ctrl+W on the last tab still closes the window, unchanged.

## PR 3: spell checking

- Global setting "Spell check", **off by default**, also for existing installs. Checkbox in the Edit menu and in the Settings dialog.
- Swedish and English at the same time, always (`session.setSpellCheckerLanguages`).
- New right-click menu in the editor: Cut, Copy, Paste, Select all. With spell check on and a misspelled word under the pointer: suggestions, Add to dictionary and Turn off spell check.
- No per-tab or per-file-type switch, no autocorrect.

## PR 4: templates and projects

- **Templates folder**: `<root>/Mallar/` (English UI: `Templates/`), a special folder like the archive. Its name is fixed when created and stored in `.notera.json`. Shown as its own section at the bottom of the sidebar. Each template is a `.md` file; the file name is the template name.
  - The plus on the section asks for a name and creates `<name>.md`. No date prefix, no header line, the file name does not follow the heading.
  - Template right-click menu: Open, Rename, Delete.
  - Note right-click menu gains "Save as template…", which copies the note text without the header line into a new template.
- **Setup, once per notes folder** (flag in `.notera.json`): when a notes folder is first created or chosen, and on the first start after this update for existing folders, Notera creates the templates folder, `Standup.md` in it, and the project Standupanteckningar (English UI: Standup notes). An existing folder with that name is reused. Deleting the project or template later does not bring it back.
- **Placeholders** replaced when a note is created: `{{datum}}`/`{{date}}` (2026-09-30), `{{tid}}`/`{{time}}` (14:32), `{{projekt}}`/`{{project}}`. Unknown ones are left alone.
- **Combining with the project header**: the template's first line becomes the title when it is a `#` heading, then the header line, then the rest. Without a heading the note gets an empty `# ` first, the header line, then the template.
- **Cursor** in a note from a template: the first empty line after the first heading below the header line. Without such a heading, the end of the text. Without a title, after `# ` as today.
- **File names**: date prefix plus title, but the date is not repeated when the title already contains it: `2026-09-30 Standup.md`, not `2026-09-30 Standup 2026-09-30.md`.
- **Default template per project**: project right-click menu, submenu "Default template" with "None" first and then every template, the chosen one ticked. Stored per project in `.notera.json`; follows project renames and template renames made in Notera. A deleted template means plain notes again. Standupanteckningar gets Standup at setup.
- **File menu**: "New from template ▸" and "Apply template ▸" become submenus listing the templates folder. New from template creates a note in the current project with that template. Apply template inserts the template text, placeholders filled, at the cursor. The old `# Title:` header and the hard-coded list go. Without a notes folder the menus show one built-in Standup.
- **Sorting**: project right-click menu "Sort ▸ Manual / Date in note". Standupanteckningar gets date sorting at setup. In a date-sorted project drag-reordering is off; pinned notes stay on top. The date is the first `YYYY-MM-DD` in the heading, else the header's Created date, else the file-name date, else the file's modified time. Newest first; ties by Created time. ISO dates only.

## Tests

Unit tests (`npm test`) for the heading cursor, placeholders, header combination, date extraction and sort order, setup idempotence and file names. E2E (`npm run e2e`) for the tab menu, the plus button with a default template and the spell-check toggle. Screenshots of the touched surfaces before each merge.
