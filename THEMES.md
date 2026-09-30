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

Extend a theme you like and change one thing:

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

`notera.colors` overrides them with plain names: `heading`, `link`, `quote`, `code` and `markup`.

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
- `read.fonts.body` is the preview's text only (Läs), for a theme that writes in monospace but reads in a serif.

Check that a font's licence lets you share it before you put it in a theme you give away. Fonts under the SIL Open Font License are fine; include their `OFL.txt`.

## Extra CSS

`"style": "style.css"` loads a CSS file after Notera's own styles while the theme is on. Use it for what colours cannot do: a border on the active tab, rounder buttons, a different cursor. Paths in `url()` are relative to the theme folder. The class names are Notera's internals and can change between versions, so keep `style.css` short; the built-in `those-guys` and `other-guys` themes show the idea.

## Extending

`"extends": "<id>"` starts from another theme, built-in or your own. Objects merge key by key and your values win; lists such as `tokenColors` replace the parent's. Fonts and style sheets from the whole chain are loaded, parent first. A chain may be several themes long, but must not loop.

## When something is wrong

If `theme.json` does not parse, Notera keeps the theme that was on screen and shows which theme and line is wrong. Comments (`//`, `/* */`) and trailing commas are fine, as in VS Code's own theme files. A theme that is broken is greyed out in the Theme menu until it is fixed.

Printing always uses Notera's plain light look, whatever the theme.
