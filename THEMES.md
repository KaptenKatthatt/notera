# Making a Notera theme

A theme is a folder with a `theme.json` in it. Put the folder in Notera's themes folder (View > Theme > Open themes folder, which is `%APPDATA%\Notera\themes` on Windows) and it shows up in the Theme menu. Notera watches that folder: save `theme.json` or `style.css` and the window repaints at once.

```
themes/
  my-theme/
    theme.json      required
    style.css       optional, extra CSS
    fonts/          optional, font files the theme uses
```

The folder name is the theme's id: lowercase letters, digits, `-`, `_` and `.`. A folder with the same name as a built-in theme (`default`, `those-guys`, `other-guys`) is ignored; built-in themes cannot be changed in place, so extend them instead.

## The quickest start

Pick the theme you want to start from, press Ctrl+Shift+P and run **New theme from current** (Nytt tema från nuvarande). Give it a name: Notera creates the folder, writes a `theme.json` that extends the theme you had on, switches to it and opens the file in a tab. Change a colour and save; the window repaints as you save, and with autosave on, as you type.

Browse themes (Bläddra bland teman) in the same palette lists every theme, and the arrow keys show each one on your open document before you pick it.

By hand, a theme that extends one you like and changes one thing looks like this:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/KaptenKatthatt/notera/master/theme.schema.json",
  "name": "My theme",
  "extends": "those-guys",
  "dark": { "colors": { "editor.background": "#1b1b2f" } }
}
```

The `$schema` line gives you autocompletion and hover docs for every key when you edit the file in VS Code.

## Light and dark

The Theme menu has two choices: the theme, and the mode (Follow system, Light, Dark). The mode picks the theme's `light` or `dark` section. Every theme should have both; one with only one section uses it in both modes.

Values at the top level are shared by both variants, and the `light` and `dark` sections are merged over them:

```jsonc
{
  "name": "My theme",
  "notera": { "fonts": { "editor": "Victor Mono" } },    // both modes
  "light": { "colors": { "editor.background": "#fdfdfd" } },
  "dark":  { "colors": { "editor.background": "#101014" } }
}
```

## Importing a VS Code theme

Ctrl+Shift+P, **Import VS Code theme** (Importera VS Code-tema) lists every colour theme installed in VS Code on this computer (also Insiders, VSCodium, Cursor and VS Code's own built-in themes). The arrow keys show each one on your open document before anything is written. Enter copies it into your themes folder as a Notera theme and switches to it. The list also offers **Choose a .vsix file**, and a `.vsix` dropped on the window works too.

When the extension has both a light and a dark theme, Notera pairs them, so GitHub Dark Default comes with GitHub Light Default and Catppuccin Mocha with Latte, and the Light and Dark modes both work. A dark-only theme such as Dracula is used in both modes. Only the colours Notera reads and the Markdown rules of `tokenColors` are kept, so the imported `theme.json` is short enough to read. Importing the same theme again replaces the earlier copy.

An imported theme is an ordinary theme: add a `notera` section to it for heading colours, fonts and effects. SynthWave '84's glow, for example, is not part of its colour theme (in VS Code an extension injects it), so it comes over without it. Give it back like this:

```jsonc
"notera": { "effects": { "glow": { "target": "headings", "strength": 0.7 }, "cursor": { "style": "line", "glow": 0.6 } } }
```

## Colours: VS Code's keys

`colors` uses VS Code's own workbench colour names, so you can copy the `colors` block of any VS Code theme into a variant as it is. Notera reads the keys below and ignores the rest. Anything you leave out is derived from the background and text colours.

| Key | Paints |
| --- | --- |
| `editor.background`, `editor.foreground` | The page and its text. Everything else derives from these two. |
| `editorGroupHeader.tabsBackground` (or `sideBar.background`) | Tab bar, toolbar, sidebar, status bar |
| `list.hoverBackground` | Hovered buttons, tabs and rows |
| `tab.activeBackground` | The active tab |
| `tab.activeModifiedBorder` | The unsaved dot on a tab |
| `editorWidget.background`, `editorWidget.border` | Menus, dialogs, the search panel |
| `descriptionForeground` | Muted text |
| `panel.border` | Borders and dividers |
| `button.background`, `button.foreground` | The accent: primary buttons, the active view button |
| `editor.selectionBackground` | Selected text |
| `editor.lineHighlightBackground` | The line the cursor is on |
| `editorCursor.foreground` | The cursor |
| `textCodeBlock.background` | Code in the preview |
| `list.activeSelectionBackground` | The open note in the sidebar |
| `input.background` | The search field |
| `editor.findMatchHighlightBackground`, `editor.findMatchBackground` | Search hits, and the current one |
| `editor.rangeHighlightBackground` | The flash on a note that just moved |
| `errorForeground` | Errors |
| `widget.shadow` | The shadow under menus and dialogs |

## Markdown colours

Like VS Code, Notera takes Markdown colours from `tokenColors`, so an imported VS Code theme keeps its heading colours:

| Scope | Paints |
| --- | --- |
| `markup.heading` | Headings |
| `markup.underline.link` | Links |
| `markup.quote` | Quotes |
| `markup.inline.raw` | Inline code |
| `punctuation.definition` | Markdown markers: `#`, `**`, `>`, fences |

`notera.colors` overrides them with plain names: `heading`, `link`, `quote`, `code` and `markup`. `heading1` to `heading6` give each heading level its own colour, in the editor and the preview.

## Fonts

A theme brings its own font files. List them in `fonts` and use the family names in `notera.fonts`:

```jsonc
{
  "fonts": [
    { "family": "Orbitron", "src": "fonts/Orbitron.ttf", "weight": "400 900" },
    { "family": "Victor Mono", "src": "fonts/VictorMono-Italic.ttf", "style": "italic" }
  ],
  "notera": { "fonts": { "editor": ["Victor Mono", "monospace"], "ui": "Orbitron" } },
  "read": { "fonts": { "body": ["Georgia", "serif"] } }
}
```

- `notera.fonts.editor` is the editor font. It overrides the font chosen in Settings while the theme is on.
- `notera.fonts.ui` is the font for menus, tabs, the toolbar and the preview.
- `notera.fonts.headings` is the font for headings, in the editor and the preview; `notera.fonts.heading1` sets the H1 apart.
- `read.fonts.body` and `read.fonts.headings` apply to the preview only (Läs), for a theme that writes in monospace but reads in a serif.

Check that a font's licence lets you share it before you put it in a theme you give away. Fonts under the SIL Open Font License are fine; include their `OFL.txt`.

## Effects

`notera.effects` switches on Notera's built-in effects. A theme only picks effects and sets their parameters; it never runs code. Every effect is off unless the theme turns it on, and `false` turns off one the theme inherited. View > Theme > Theme effects switches them all off without changing theme, and turning off Windows' "Animation effects" (Accessibility > Visual effects) stops everything that moves: particles, the gliding cursor and the moving grid. Glow stays, since it does not move.

```jsonc
"notera": {
  "effects": {
    "glow":      { "target": "headings", "strength": 0.6 },          // or "all"; optional "color"
    "gradient":  { "colors": ["#ff7edb", "#fede5d"], "levels": [1] }, // headings drawn with a gradient
    "cursor":    { "style": "block", "glow": 0.8, "smooth": true },   // "line", "block", "underline"
    "particles": { "amount": 10, "colors": ["#ff7edb", "#36f9f6"], "size": 2.5 },
    "background": {
      "grid": { "color": "#ff7edb", "opacity": 0.6, "speed": 0.5 },   // a synthwave floor, moving
      "sun":  { "colors": ["#fede5d", "#ff7edb"], "opacity": 0.3 },   // a striped sun on the horizon
      "scanlines": 0.2,                                              // 0 to 1
      "vignette": 0.4                                                // 0 to 1
    }
  }
}
```

| Effect | Parameters |
| --- | --- |
| `glow` | `target`: `headings` or `all`. `strength` 0 to 1. `color`, default the text's own colour. |
| `gradient` | `colors`: two or more. `levels`: which heading levels, default `[1]`. |
| `cursor` | `style`: `line`, `block` or `underline`. `glow` 0 to 1. `smooth`: the cursor glides to where it goes. |
| `particles` | `amount` per keystroke, 1 to 40. `colors`, default the theme's accent and heading colours. `size` in pixels. |
| `background` | `grid`, `sun`: `true` or an object as above. `scanlines`, `vignette`: 0 to 1. The editor and preview turn transparent so the background shows. |

Effects can differ per mode (put them in `light` or `dark`; a glow reads as a smudge on a light page, so keep it low there) and in the preview: `read.effects` is merged over the editor's effects in Läs, so a theme can glow every letter while you write and only the headings while you read. The `neon-chill`, `neon` and `neon-omg` built-in themes show all of it, from calm to everything.

## Extra CSS

`"style": "style.css"` loads a CSS file after Notera's own styles while the theme is on. Use it for what colours cannot do: a border on the active tab, rounder buttons, a different cursor. Paths in `url()` are relative to the theme folder. The class names are Notera's internals and can change between versions, so keep `style.css` short; the built-in `those-guys` and `other-guys` themes show the idea.

## Extending

`"extends": "<id>"` starts from another theme, built-in or your own. Objects merge key by key and your values win; lists such as `tokenColors` replace the parent's. Fonts and style sheets from the whole chain are loaded, parent first. A chain may be several themes long, but must not loop.

## When something is wrong

If `theme.json` does not parse, Notera keeps the theme that was on screen and shows which theme and line is wrong. Comments (`//`, `/* */`) and trailing commas are fine, as in VS Code's own theme files. A theme that is broken is greyed out in the Theme menu until it is fixed.

Printing always uses Notera's plain light look, whatever the theme.
