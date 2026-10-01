# Notera backlog

Brain dump of ideas, in the order they were said. Not prioritised yet.

- [ ] Change the text width without resizing the window, modelled on VS Code's centered layout. The toggle is done: "Narrow text column" in the View menu and Settings, on by default, centres the text at 66 characters with the sidebar and preview still there. Left to do:
  - A shortcut for the toggle.
  - Resize: the column's edges show on hover, and dragging either edge changes the width. Both edges move together so the text stays centred. Double-clicking an edge resets it to 66.
  - Storage: the width is saved in characters, not pixels, so it looks the same after Ctrl+Plus and when the window is resized. A window narrower than the column just fills the window.
  - Writing mode uses the same width, so it is set in one place.
- [ ] Theme gallery: browse and install community themes in one click, fetched from a GitHub repo. Later, once other people have made themes worth showing. Builds on the themes folder (`%APPDATA%/Notera/themes/<theme>/` with `theme.json`, optional `style.css`, `fonts/`, images) that reloads on save, decided in the theme design grilling 2026-09-30.
- [ ] Look at shipping a small set of standard fonts that any theme can refer to by name (e.g. a few OFL heading and monospace faces). Not yet: for now every theme carries its own fonts in its `fonts/` folder, decided in the theme design grilling 2026-09-30.
- [ ] Search and download VS Code themes by name from Open VSX (open-vsx.org), not Microsoft's Visual Studio Marketplace, whose terms limit its extensions to Microsoft products. Pair it with the theme gallery, since both fetch themes over the network. v1 imports from the local VS Code install (`%USERPROFILE%\.vscode\extensions`) and from `.vsix` files, decided in the theme design grilling 2026-09-30.
