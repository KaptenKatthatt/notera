# Theme system plan

Decided with Jonas in a design grilling on 2026-09-30. Notera becomes a writing tool for people who miss modding their IDE: a theme can be clean and plain like today, or full SynthWave neon with glow and particles. Built in four PRs, merged in order.

## Decisions

1. **No writing in the preview, no Obsidian-style live preview.** The editor stays a code editor with visible Markdown, styled like an IDE. The existing "Hide Markdown markers" setting (`src/renderer/markers.js`) stays as it is.
2. **No per-word syntax colouring of prose.** Colours per heading level and theme fonts are in; nouns and verbs in different colours are out.
3. **A theme is a folder** with `theme.json` (colours, fonts, built-in effects and their parameters) and an optional `style.css`. Never JavaScript.
4. **Built-in effects in v1:** glow, heading colours per level with an optional H1 gradient, a styled cursor (glow, block or line, smooth motion), particles while typing, and backgrounds (synthwave grid and sun, scanlines, vignette). Screen shake, a combo meter and tab transitions are later. A global "effects off" switch exists, and Windows' "reduce animations" turns every moving effect off.
5. **Decoration levels are separate themes**, not a slider: Neon Chill, Neon and Neon OMG.
6. **Themes inherit** with `"extends": "<theme id>"`, one level at a time; chains are allowed, loops are an error.
7. **Themes folder** `%APPDATA%/Notera/themes/<id>/`, reloaded on save. An in-app gallery is in BACKLOG.md.
8. **Themes in v1:** Default, Those guys, The Other guys, Neon Chill, Neon, Neon OMG. Ports of Dracula, Tokyo Night and Catppuccin come later (and the VS Code import covers them today).
9. **Fonts:** each theme carries its own in `fonts/`. A shared set of standard fonts is in BACKLOG.md.
10. **View modes are called Skriv, Delad and Läs** (Write, Split, Read); Ctrl+Shift+1/2/3 stay.
11. **Read overrides:** one shared style plus an optional `read` section that changes fonts, line height, size and effects in Läs. Cursor and particles only exist where you type.
12. **Theme picker:** a VS Code-style quick pick; arrow keys preview each theme on the open document, Enter keeps it, Esc goes back. The Theme menu follows Jonas's spec from PR #12 (theme radios, a line, mode radios) and gets a "Browse themes..." item that opens the picker.
13. **Ctrl+Shift+P command palette** with every command and every setting (multi-choice settings open a second list in the same box), shortcuts shown on the right, plus "Open settings (JSON)" that opens `settings.json` in Notera and applies it on save.
14. **No dedicated picker shortcut** and no two-step chords; the palette reaches the picker, and anyone can bind their own key.
15. **Making a theme:** "New theme from current" in the palette creates a folder whose `theme.json` extends the active theme, switches to it and opens the file. `THEMES.md` documents every key; `theme.schema.json` gives autocompletion in VS Code. A visual theme editor is in BACKLOG.md.
16. **Colour keys use VS Code's own names** (`editor.background`, `sideBar.background`, `tab.activeBackground`, `editorCursor.foreground`, ...), so a VS Code theme's `colors` block pastes straight in. Heading colours come from the theme's `tokenColors` (`markup.heading`, `markup.quote`, ...) like in VS Code, and can be overridden in a `notera` section together with effects and fonts.
17. **VS Code import in v1** from the local VS Code install (`%USERPROFILE%\.vscode\extensions`) and from `.vsix` files. Searching Open VSX is in BACKLOG.md; Microsoft's Marketplace is off limits by its terms.
18. **Build order:** (1) theme format, (2) effects and the Neon family, (3) palette and picker, (4) VS Code import.

Defaults Jonas approved: printing and export are always plain; a broken `theme.json` shows an error with its line number and keeps the previous theme; an imported theme is copied and converted into the themes folder; built-in themes are read-only and changed through "New theme from current".

## Adjustments after PR #12 landed

PR #12 added Jonas's spec for the Theme menu to BACKLOG.md: themes at the top, the mode (Follow system / Light / Dark) below the line, one pick in each group, and the mode only switches the chosen theme between its own light and dark version. Every theme, now and later, ships both. That changes the plan in three places:

- **A theme has a `light` and a `dark` variant.** `theme.json` keeps shared values at the top and puts per-variant colours in `light` and `dark`. Those guys and The Other guys get light versions (Claude's cream and Codex's white).
- **Default replaces Light and Dark as themes.** The settings split into `theme` (an id, `default` out of the box) and `mode` (`system`, `light`, `dark`). Old settings migrate: `system`/`light`/`dark` become Default with that mode, a named theme keeps its id with mode `dark`. So v1 has six themes, not seven.
- **Neon Light is renamed Neon Chill,** so the lightest Neon theme cannot be confused with the Light mode.

An imported VS Code theme pairs a light and a dark theme from the same extension when it ships both (GitHub, Catppuccin, Tokyo Night). When an extension has only one, Notera uses it for both modes and the picker says so.

## Format sketch

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/KaptenKatthatt/notera/master/theme.schema.json",
  "name": "Neon OMG",
  "extends": "neon",
  "fonts": [{ "family": "Orbitron", "src": "fonts/Orbitron.ttf", "weight": "400 900" }],
  "notera": {
    "fonts": { "editor": "Victor Mono", "headings": "Orbitron", "ui": null },
    "effects": { "glow": { "target": "all", "strength": 0.8 }, "particles": { "amount": 12 } }
  },
  "read": { "fonts": { "body": "Georgia" }, "effects": { "glow": { "target": "headings" } } },
  "dark":  { "colors": { "editor.background": "#241b2f" }, "tokenColors": [], "notera": { "colors": { "heading1": "#ff7edb" } } },
  "light": { "colors": { "editor.background": "#fbf6ff" } }
}
```

Theme files are served to the window over a `notera-theme://` protocol, so fonts and images in a theme folder load without widening the page's content security policy to `file:`.
