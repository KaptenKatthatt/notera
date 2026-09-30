# Notera backlog

Brain dump of ideas, in the order they were said. Not prioritised yet.

- [ ] When "Check for updates" finds a new version, one prompt should ask whether to download and install it, and a yes should do both. Today download and install are two separate steps.
- [ ] Bug: the Theme submenu shows two selected radio buttons at once, e.g. "Follow system" and "Those guys". Rebuild it as two independent choices with exactly one pick each. At the top, the themes: Default, Those guys, The Other guys. Default is a theme of its own, like the other two. Below the line, the mode: Follow system, Light, Dark. The mode is only a switch between the light and dark version of the selected theme; it never switches to Default's light or dark version. So every theme, now and later, must ship both a light and a dark version (today Those guys and The Other guys are dark only). Screenshot: [backlog-theme-menu.png](backlog-theme-menu.png).
- [ ] Change the text width without resizing the window, modelled on VS Code's centered layout. Writing mode already centres a fixed 66ch column but hides the sidebar and preview, and its width cannot be changed.
  - Toggle: "Narrow text column" in the View menu, with a shortcut, on by default. The text is centred at 66 characters; the sidebar and preview stay.
  - Resize: the column's edges show on hover, and dragging either edge changes the width. Both edges move together so the text stays centred. Double-clicking an edge resets it to 66.
  - Storage: the width is saved in characters, not pixels, so it looks the same after Ctrl+Plus and when the window is resized. A window narrower than the column just fills the window.
  - Writing mode uses the same width, so it is set in one place.
