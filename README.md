# Notera

A Windows notepad for Markdown and plain text. It keeps the shape of Windows Notepad (tabs, find and replace, go to line, time/date, font, zoom, word wrap, status bar) and adds what Markdown needs: syntax highlighting, a formatting toolbar, and a live preview.

Swedish UI when Windows runs in Swedish, English otherwise. Switch under View > Language.

The editor takes its cues from [Omawrite](https://github.com/omacom-io/omawrite), the writing app DHH ships with Omarchy: one column of iA Writer Mono, Markdown markers dimmed and inline markers hidden until the cursor reaches them, a floating search card with a match counter, autosave as you type, and draft recovery after a crash. View > Writing mode (Ctrl+Shift+W) drops every piece of Notepad chrome and leaves that column, a footer with the file name and word count, and nothing else. Alt still shows the menu.

## What it does

- Opens and saves `.md` and `.txt` files. The file extension decides the mode; the status bar button switches it by hand.
- Save as opens in the current file's folder. A new file opens in the folder you last used.
- Remembers encoding (UTF-8, UTF-8 with BOM, UTF-16 LE/BE, ANSI) and line endings (CRLF or LF) per file and writes them back unchanged. Both can be changed from the status bar.
- Tabs with unsaved-change dots, a save prompt on close, and reload prompts when a file changed on disk.
- Markdown formatting: bold, italic, strikethrough, headings, bullet/numbered/task lists, quote, inline code, code block, link, horizontal rule, table. Each toggles on and off.
- Editor, split and preview views for Markdown. Preview links open in the browser.
- Find, find next/previous, replace, regex, whole word, match case, go to line.
- Zoom (Ctrl+wheel too), font family and size, word wrap, line numbers, light/dark/system theme.
- Opening a file from Explorer reuses the running window as a new tab.
- Print: rendered Markdown for `.md`, plain text for `.txt`.
- Autosave (View > Autosave, on by default): a file with a name is written 0.8 s after you stop typing. Untitled tabs are kept as drafts under `%APPDATA%\Notera\drafts` and come back on the next start.
- Inline Markdown markers (`**`, `*`, `~~`, backticks, the `[]()` of a link) are hidden except on the line you are editing. View > Hide Markdown markers turns that off.
- Enter continues a list or quote, an empty item ends it. Pasting a URL over selected text makes a link, and Ctrl+K uses a URL from the clipboard directly.
- Writing mode (Ctrl+Shift+W), full screen (F11), and a shortcut reference (Ctrl+?).
- VS Code line editing with VS Code's keys, also under Edit > Line: move, copy, select and delete whole lines, cut or copy the current line when nothing is selected, open a line above or below, add the next occurrence to the selection, and add cursors above or below.

## Shortcuts

| Action | Keys |
| --- | --- |
| New tab / new window | Ctrl+N / Ctrl+Shift+N |
| Open / Save / Save as | Ctrl+O / Ctrl+S / Ctrl+Shift+S |
| Close tab | Ctrl+W |
| Next / previous tab | Ctrl+Tab / Ctrl+Shift+Tab |
| Find / Replace / Go to | Ctrl+F / Ctrl+H / Ctrl+G |
| Find next / previous | F3 / Shift+F3 |
| Time/Date | F5 |
| Bold / Italic / Strikethrough | Ctrl+B / Ctrl+I / Ctrl+Shift+X |
| Heading 1, 2, 3 | Ctrl+1, Ctrl+2, Ctrl+3 |
| Bullet / numbered / task list | Ctrl+Shift+8 / Ctrl+Shift+7 / Ctrl+Shift+9 |
| Quote | Ctrl+Shift+. |
| Code / code block / link | Ctrl+E / Ctrl+Shift+E / Ctrl+K |
| Editor / split / preview | Ctrl+Shift+1 / 2 / 3 |
| Writing mode / full screen | Ctrl+Shift+W / F11 |
| Move line up / down | Alt+Up / Alt+Down |
| Copy line up / down | Shift+Alt+Up / Shift+Alt+Down |
| Select line (again: add the next line) | Ctrl+L |
| Delete line | Ctrl+Shift+K |
| Cut / copy line (nothing selected) | Ctrl+X / Ctrl+C |
| New line below / above | Ctrl+Enter / Ctrl+Shift+Enter |
| Add next occurrence / select all occurrences | Ctrl+D / Ctrl+Shift+L |
| Add cursor above / below | Ctrl+Alt+Up / Ctrl+Alt+Down |
| Indent / outdent line | Ctrl+] / Ctrl+[ |
| Keyboard shortcuts | Ctrl+? |
| Zoom in / out / reset | Ctrl+= / Ctrl+- / Ctrl+0 |
| Word wrap | Alt+Z |

## Development

Requires Node 22.

```bash
npm install
npm start          # build renderer + run Electron
npm run watch      # rebuild renderer on change (run Electron separately)
npm test           # unit tests (encoding, line endings, strings)
npm run e2e        # drives the real app with Playwright; on Linux: xvfb-run -a npm run e2e
node test/e2e/writing.mjs   # writing mode, hidden markers, autosave, draft recovery
node test/e2e/lines.mjs     # VS Code line editing, driven with real key presses
npm run icon       # regenerate build/icon.png + icon.ico from the SVG in scripts/make-icon.js
```

## Build for Windows

```bash
npm run dist:win
```

Writes `release/Notera-Setup-<version>.exe` (installer, registers `.md`, `.markdown` and `.txt`) and `release/Notera-<version>-portable.exe`. Building the installer on Linux needs 32-bit wine (`wine32:i386`, plus a `wine` launcher on PATH) because electron-builder runs the NSIS setup once to generate its uninstaller. The `portable` and `zip` targets build without wine.

## Layout

```
src/main/       Electron main process: window, native menu, dialogs, file IO
  files.js      encoding detection/encoding + line endings (unit tested)
  settings.js   settings.json in %APPDATA%\Notera
src/renderer/   UI: tabs, CodeMirror 6 editor, formatting, preview, status bar
  markers.js    hides inline Markdown markers off the cursor line
  searchCount.js  match counter + jump-to-first-match for the search card
  lines.js      VS Code line-editing keymap (highest precedence) and Edit > Line commands
fonts/          iA Writer Mono S (SIL Open Font License, see fonts/OFL.txt)
src/shared/     English + Swedish strings used by both processes
scripts/        esbuild bundle + icon generator
test/           node:test unit tests, Playwright smoke test
```

Settings live in `%APPDATA%\Notera\settings.json`. Set `NOTERA_USER_DATA` to point them elsewhere (tests do).
