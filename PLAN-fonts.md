# Standard fonts plan

Plan for the standard-fonts item in BACKLOG.md, written 2026-10-02 for Jonas to decide on. Nothing here is built yet. Jonas answered the first round of open questions on 2026-10-05 (see "Decisions" at the end). A clickable mockup of the dropdown: https://claude.ai/artifact/4BXxGcY73DphGMhKu8VLxR

## Goal

Notera ships a small set of coding fonts that the user can pick by name in the font dialog, and that any theme can name in `notera.fonts` without carrying the files itself. The font list draws every name in its own font, so you see the font before you pick it.

## Research: which fonts the popular VS Code themes use

What each theme's README says, checked 2026-10-02:

| Theme | Font it names | Where |
| --- | --- | --- |
| One Dark Pro | JetBrains Mono | README, "editor.fontFamily": "JetBrains Mono" in its sample settings ([Binaryify/OneDark-Pro](https://github.com/Binaryify/OneDark-Pro)) |
| Tokyo Night | JetBrains Mono | "Font used in the screenshots is JetBrains Mono" ([enkia/tokyo-night-vscode-theme](https://github.com/enkia/tokyo-night-vscode-theme)) |
| SynthWave '84 | Fira Code | "The font I use ... is Fira Code" ([robb0wen/synthwave-vscode](https://github.com/robb0wen/synthwave-vscode)) |
| Ayu | Iosevka | Bundles Iosevka "for a consistent look" ([ayu-theme/vscode-ayu](https://github.com/ayu-theme/vscode-ayu)) |
| Night Owl | Dank Mono (commercial) | Preview image uses Dank Mono ([sdras/night-owl-vscode-theme](https://github.com/sdras/night-owl-vscode-theme)) |
| Dracula | none in the free theme | Dracula Pro sells a bundle of "four hand-picked fonts" (draculatheme.com/pro) |
| GitHub Theme | none | GitHub's own coding font is Monaspace ([githubnext/monaspace](https://github.com/githubnext/monaspace)) |
| Catppuccin, Monokai Pro, Material Theme | none | No font named in the README or on the theme's site |

Most used overall, by GitHub stars of the font's own repo (2026-10-02): Fira Code 82k, Maple Mono 29k, Cascadia Code 28k, Iosevka 23k, Source Code Pro 20k, Monaspace 20k, Hack 17k, JetBrains Mono 13k, IBM Plex 12k (whole family). Stars undercount JetBrains Mono, which is the default in every JetBrains IDE, and Cascadia, which comes with Windows Terminal.

## The list

Ten fonts, plus iA Writer Mono S, which Notera ships already and which stays the default. Sizes are the files we would ship (see "Files" below).

| Font | Style in one line | Popular themes | Licence | Files we ship | Size |
| --- | --- | --- | --- | --- | --- |
| **JetBrains Mono** | Tall x-height, straight shapes, ligatures | One Dark Pro, Tokyo Night | OFL 1.1, no reserved name. [JetBrains/JetBrainsMono](https://github.com/JetBrains/JetBrainsMono) | upright + italic, variable | 136 KB |
| **Fira Code** | The classic ligature font | SynthWave '84 | OFL 1.1, no reserved name. [tonsky/FiraCode](https://github.com/tonsky/FiraCode) | upright, variable (no italic exists) | 98 KB |
| **Cascadia Code** | Microsoft's, from Windows Terminal; cursive italic | (Windows default terminal font) | OFL 1.1, reserved name "Cascadia Code". [microsoft/cascadia-code](https://github.com/microsoft/cascadia-code) | upright + italic, variable | 348 KB |
| **Iosevka** | Narrow and dense, many characters per line | Ayu (bundles it) | OFL 1.1, no reserved name. [be5invis/Iosevka](https://github.com/be5invis/Iosevka) | Regular and Italic, Latin subset (bold is synthesised) | 632 KB |
| **Victor Mono** | Narrow, with a handwritten italic | Neon Chill and Neon here | OFL 1.1, no reserved name. [rubjo/victor-mono](https://github.com/rubjo/victor-mono) | upright + italic, variable | 138 KB |
| **Monaspace Neon** | GitHub's modern grotesque mono | GitHub (same maker) | OFL 1.1, reserved name "Monaspace" and its subfamilies. [githubnext/monaspace](https://github.com/githubnext/monaspace) | one variable file with weight and slant | 469 KB |
| **Source Code Pro** | Adobe's open, airy classic | (long-time default in many editors) | OFL 1.1, reserved name "Source". [adobe-fonts/source-code-pro](https://github.com/adobe-fonts/source-code-pro) | upright + italic, variable | 151 KB |
| **IBM Plex Mono** | A little typewriter, slab serifs on i and l | | OFL 1.1, reserved name "Plex". [IBM/plex](https://github.com/IBM/plex) | Regular, Bold, Italic, Bold Italic | 151 KB |
| **Maple Mono** | Rounded corners, soft cursive italic | | OFL 1.1, no reserved name. [subframe7536/maple-font](https://github.com/subframe7536/maple-font) | upright + italic, variable | 251 KB |
| **Geist Mono** | Vercel's, clean and geometric | | OFL 1.1, no reserved name. [vercel/geist-font](https://github.com/vercel/geist-font) | upright + italic, variable | 138 KB |
| | | | | **Total** | **≈ 2.5 MB** |

Considered and left out. All four are in the mockup under "Alternativ" so Jonas can compare them before the list is final:

- **Hack** (MIT plus the Bitstream Vera licence, [source-foundry/Hack](https://github.com/source-foundry/Hack)): shippable, but close to Source Code Pro and DejaVu Sans Mono in look, and 407 KB.
- **Commit Mono** (licensed MIT on GitHub, [eigilnikolajsen/commit-mono](https://github.com/eigilnikolajsen/commit-mono)): shippable and nice, but less known (2k stars).
- **Recursive** (OFL, [arrowtype/recursive](https://github.com/arrowtype/recursive)): one variable file with a Casual axis, which would suit a writing app, but 692 KB as woff2 (2.3 MB as TTF).
- **Monaspace Radon** (handwriting style): fun for a theme, 722 KB on its own. A theme can carry it.

Not shippable, named so nobody asks again: **Operator Mono** (Hoefler&Co., commercial), **Dank Mono** (commercial, used in Night Owl's screenshots), **MonoLisa** (commercial), **Berkeley Mono** (commercial), **Consolas** (Microsoft, licensed with Windows only; Notera can use it from the system but not ship it). Dracula Pro's bundled fonts are sold with Dracula Pro and are not ours to ship either.

## Heading and reading fonts

Three fonts for the other places a font is picked: `notera.fonts.headings` and `heading1`, `read.fonts.body` and `read.fonts.headings`, and `ui`. They are also offered in the font dialog, for anyone who wants to write in a serif.

| Font | Style in one line | Meant for | Licence | Files we ship | Size |
| --- | --- | --- | --- | --- | --- |
| **Literata** | A serif made for long reading on screens (Google Play Books) | Body text in Läs | OFL 1.1, no reserved name. [googlefonts/literata](https://github.com/googlefonts/literata) | upright + italic, variable, Latin subset | 502 KB |
| **Fraunces** | Soft, slightly wonky display serif | Headings | OFL 1.1, no reserved name. [undercasetype/Fraunces](https://github.com/undercasetype/Fraunces) | upright + italic, variable | 413 KB |
| **Atkinson Hyperlegible Next** | A sans designed by the Braille Institute so letters cannot be mistaken for each other | Läs and the UI | OFL 1.1, no reserved name. [googlefonts/atkinson-hyperlegible-next](https://github.com/googlefonts/atkinson-hyperlegible-next) | upright + italic, variable | 95 KB |
| | | | | **Total** | **≈ 1.0 MB** |

## Files and licences

- Every font goes in `fonts/<family>/` next to its licence file (`OFL.txt` or `LICENSE`), as `fonts/` is already in `electron-builder.yml`. iA Writer Mono S moves to `fonts/ia-writer-mono-s/` in the same PR.
- **Ship the woff2 files each project publishes, unchanged.** The OFL forbids a modified font from keeping a reserved font name, and subsetting counts as modifying. Four of the fonts have a reserved name (Cascadia Code, Monaspace, Source Code Pro, IBM Plex), so for those we must ship upstream's files as they are. Doing the same for the rest keeps the rule simple, and taking upstream's own woff2 also avoids converting anything ourselves. The sizes in the table were measured by converting upstream's TTF files to woff2 (fontTools); upstream's woff2 files should be within a few per cent.
- **Iosevka and Literata are the exceptions.** Iosevka's full files are 8 MB per style as TTF and 1 MB per style as woff2, because it covers Greek, Cyrillic and thousands of symbols; Literata is 761 KB as woff2. Neither has a reserved name, so we may subset them: Latin, Latin Extended, punctuation, arrows, maths, box drawing, keeping all ligatures and OpenType features. That gives 632 KB for Iosevka Regular and Italic and 502 KB for Literata. Iosevka ships without Bold (decided 2026-10-05); bold text in it is synthesised by Chromium. A script `scripts/subset-fonts.py` (fontTools) makes the subsets reproducible, and the commit says which upstream version was cut.
- `fonts/README.md` lists every font with its version, upstream URL, licence and, for Iosevka and Literata, the subset command. A unit test checks that every font folder has a licence file and an entry there.
- Victor Mono moves out of `themes/neon-chill/fonts/` (Neon Chill names it instead), so the net size added is about 3.1 MB.

## Install size

The 0.11.1 installer is 112.7 MB. woff2 is already compressed, so the thirteen fonts (3.5 MB, 3.1 MB net after Victor Mono leaves Neon Chill) add about 3.1 MB to both the installer and the installed app, roughly 2.8 %. Everything is bundled; nothing is fetched at run time, and the CSP stays as it is (`font-src 'self' data: notera-theme:`).

## How fonts are loaded

- `src/shared/standardFonts.js` holds the list: family name, folder, files with weight and style, and a short description in Swedish and English for the dropdown. The renderer, the Theme tab and the schema all read it, so there is one list.
- The renderer writes `@font-face` rules for all of them at start-up, like `themeApply.js` does for theme fonts, with `font-display: swap` (not `block`, since a font the user did not pick should never hold up the window). The browser only downloads a face from disk when something uses it, so eleven declared families cost nothing until they are shown.
- iA Writer Mono S's four `@font-face` rules move from `styles.css` into the same list.

## Where you pick a font

1. **The font dialog** (`#dlg-font`, Format > Font, and the "Change..." button in Settings). The family list gets three groups: "Ships with Notera" (the ten plus iA Writer Mono S), "Headings and reading" (the three) and "On this computer" (every installed font from `queryLocalFonts()`, as today, with the bundled ones filtered out so none shows twice). The installed fonts are listed in full, not hidden behind "More fonts..." (decided 2026-10-05). The size field and the preview line stay.
2. **The Theme tab**, for `notera.fonts.editor`, `headings`, `heading1`, `ui` and `read.fonts.body` / `headings`. Today these are free-text fields. They become the same dropdown, with the same three groups (for the heading and `read` fields "Headings and reading" comes first), and with a first entry "From the theme" (empty value, which inherits) and a last entry "Other..." that opens the old text field for a list such as `Victor Mono, Consolas, monospace`. A value that is a list shows its first family in the dropdown and keeps the rest of the list when saved.
3. **The command palette** already has the font command (`font` in `src/shared/commands.js`), which opens the same dialog. Nothing to add.

## How the dropdown is built

Use Chromium's **customizable `<select>`** (`appearance: base-select`, in Chromium since 135; Notera's Electron 44 has it), not a hand-built listbox.

- Why not the plain native select: on Windows its popup is drawn outside the page, and fonts Notera loads with `@font-face` are not available there, so the bundled fonts would show in the default font. `dialogs.js` already sets `option.style.fontFamily`, which does nothing useful for the bundled fonts for this reason. (To confirm in step 1 below.)
- Why customizable select: the popup is drawn in the page, so each `<option>` can take its own `font-family` and our fonts work. It is still a real `<select>`: keyboard (arrows, Home/End, type-ahead, Enter, Esc), focus, screen readers and form value all come from Chromium, so we write no ARIA by hand. `<optgroup>` gives the two groups. The selected-value button can show the name in its font too (`<selectedcontent>`).
- Live preview like the theme picker: moving through the list with the arrow keys updates the preview line, and Esc goes back. Customizable select fires no event while you move through the open list, so this listens for focus on the options (`focusin` inside the picker). If that turns out to be flaky, the preview follows only the chosen value, which is acceptable.
- Each row: the family name in its own font at 18 px, and under it one line in the UI font with the style (from `standardFonts.js`). System fonts get their name only. Rows are at least 44 px high, so they also work with touch on a Windows tablet.
- Fallback: if step 1 shows customizable select misbehaving in Electron, build a select-only combobox by the WAI-ARIA APG pattern (a button with `role="combobox"`, a `role="listbox"` popup, `aria-activedescendant`, the same keys). The mockup is built that way, since phone browsers do not all have customizable select yet, so it shows that this path works too.
- `queryLocalFonts()` can return several hundred families. Each row in its own font then means drawing hundreds of fonts at once. The list renders system fonts in their own face only for rows that scroll into view (`content-visibility: auto` on the rows), and step 1 measures it on Jonas's Windows machine.

## How a theme names a standard font

By family name, exactly as for a system font, with no `fonts` entry needed:

```jsonc
"notera": { "fonts": { "editor": ["JetBrains Mono", "Consolas", "monospace"], "headings": "Victor Mono" } }
```

- Standard fonts are always declared, so the name just works in `notera.fonts`, `read.fonts` and `style.css`.
- A theme's own `fonts` entry with the same family wins over the standard font (its `@font-face` is added later), so a theme can pin another version.
- `theme.schema.json` gets the standard names as `examples` on `fontList`, which gives autocompletion in VS Code without forbidding other names.
- Neon Chill and Neon drop their Victor Mono files and name the standard Victor Mono.
- THEMES.md, section Fonts: a table of the standard fonts and a sentence saying a theme can use them by name.

## Ligatures

A new setting `fontLigatures`, on by default (decided 2026-10-05). Off sets `font-variant-ligatures: none` on the editor and the preview, so `->` and `!=` are drawn as two characters. It sits as a checkbox in the font dialog under the size (the preview line follows it at once, as in the mockup), in Settings next to the font, and in the command palette as "Ligatures on/off". It applies to every font; for fonts without ligatures it changes nothing.

## Settings

`fontFamily` stays a plain family name, as today. A standard font is stored by its name (`"JetBrains Mono"`), so picking one needs no new setting and old settings keep working. If a user had installed, say, JetBrains Mono on Windows, the bundled one now wins over the installed one with the same name; that is fine, and the dialog does not list it twice.

## Build order

1. **Spike** (no PR, a note in the PR of step 2): customizable select in Electron 44 on Windows with two bundled fonts: each option in its own font, keyboard, Narrator reads the options, preview while moving with the arrow keys, and scrolling a list of all installed fonts. Decide customizable select or APG listbox.
2. **Fonts and loading:** `fonts/<family>/` with files and licences, `fonts/README.md`, `standardFonts.js`, the `@font-face` rules, iA Writer Mono S moved, the Iosevka subset script.
3. **Font dialog:** the new dropdown with the two groups and the live preview.
4. **Theme tab and themes:** the dropdown for the font fields, Neon Chill and Neon on standard Victor Mono, schema examples, THEMES.md.

## Tests

- Unit: every entry in `standardFonts.js` has existing files and a licence file; family names are unique; no file is larger than 1.5 MB (catches an unsubset Iosevka).
- E2E (Playwright, like `test/e2e/settings.mjs`): open the font dialog; the list has the "Ships with Notera" group with eleven options and "Headings and reading" with three; each option's computed `font-family` starts with its own name, and `document.fonts.check('16px "JetBrains Mono"')` is true once the list is open (proves the bundled file loaded and not a fallback); arrow down changes the preview, Esc restores it, Enter saves `fontFamily`; the editor's `--editor-font` follows.
- E2E, themes: a theme naming `"Fira Code"` without a `fonts` entry gets Fira Code in the editor; Neon Chill still gets Victor Mono after its files are removed.
- E2E, Theme tab: the editor-font dropdown writes the name to the theme's `theme.json`, "From the theme" removes the key, "Other..." keeps a typed list.
- E2E, ligatures: unticking the checkbox sets `font-variant-ligatures: none` on `.cm-content` and the preview, and saves `fontLigatures: false`.
- Screenshot of the open list in `test/e2e/shots/` for review.
- No network: the e2e run blocks all http(s) requests and checks that every font still loads.

## Decisions (Jonas, 2026-10-05)

1. The ten stand for now. The four alternatives (Hack, Commit Mono, Recursive Mono Casual, Monaspace Radon) are added to the mockup for comparison.
2. Iosevka ships Regular and Italic only.
3. Two or three fonts for headings and Läs join the set: Literata, Fraunces and Atkinson Hyperlegible Next are the proposal.
4. iA Writer Mono S stays the default.
5. A ligatures setting, on by default.
6. Installed fonts are listed in full under the bundled ones.

## Open questions for Jonas

1. Having seen the alternatives in the mockup: swap any of them in for one of the ten?
2. Are Literata, Fraunces and Atkinson Hyperlegible Next the right three for headings and Läs?
