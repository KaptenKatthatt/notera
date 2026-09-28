# Notera backlog

Brain dump of ideas, in the order they were said. Not prioritised yet.

- [x] Right-clicking a note offers "Rename", so the note can be renamed from the context menu. Done in #11: rename edits the heading and the file name follows.
- [x] Bug: the bottom status bar overflows. Its text does not fit in its boxes, wraps onto two lines and ends up hidden. Done in #11.
- [x] Remove the line-ending indicator from the bottom status bar. Done in #11. Converting a file's line endings is no longer possible anywhere in the UI.
- [x] Bug: in the new-project dialog, pressing Enter after typing the name acts as cancel and closes the dialog without creating the project. Enter should mean create. Done in #11. The link and font dialogs had the same bug.
- [x] In a tab's right-click menu, hovering "Move to project" does not open the submenu; it only opens on click. It should open on hover too. Done in #11. Applies to the note menu too.
- [ ] Bug: in the menu that opens when you right-click the Notera icon in the taskbar (Windows jump list), the "Notera" app entry still shows the icon on a white background. The other entries in the same menu show it correctly. Photo: [backlog-jumplist-icon.jpg](backlog-jumplist-icon.jpg). Fixed in #11 (stale icon cache for the pin; the installer now points the shortcuts at a fresh icon path). Confirm on Windows after the next release.
- [ ] When "Check for updates" finds a new version, one prompt should ask whether to download and install it, and a yes should do both. Today download and install are two separate steps.
- [ ] Bug: the Theme submenu shows two selected radio buttons at once, e.g. "Follow system" and "Those guys". Rebuild it as two independent choices with exactly one pick each. At the top, the themes: Default, Those guys, The Other guys. Default is a theme of its own, like the other two. Below the line, the mode: Follow system, Light, Dark. The mode is only a switch between the light and dark version of the selected theme; it never switches to Default's light or dark version. So every theme, now and later, must ship both a light and a dark version (today Those guys and The Other guys are dark only). Screenshot: [backlog-theme-menu.png](backlog-theme-menu.png).
