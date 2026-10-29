# Plan: images in notes

Decided with Jonas 2026-10-20 and 2026-10-21. Three PRs against master, in this order. Each one stands on its own.

Decided:

- Image files live in an images folder inside the project, `Enlantis/bilder/`. Notes in Unsorted share `Osorterat/bilder/`.
- The note refers to them with plain Markdown, `![Bild 1](bilder/login-error-1.jpg)`, so GitHub, Obsidian, VS Code and OneDrive see ordinary files and ordinary links.
- Images are stored as JPEG to save space.
- In the preview an image is scaled to the column width. Clicking it shows it at full size.
- The Write view shows the image too, under its line, so a note about screenshots can be written without switching to Split.

Why a folder per project and not per note or one for all: the link stays `bilder/…` whatever happens to the note. A rename after the heading changes nothing, a move to another project moves the files to that project's folder and the link is still right, the archive mirrors the project (`Arkiv/Enlantis/bilder/`), and a project rename moves the whole folder. The sidebar never lists folders inside a project, so the images folder is invisible without new code.

## PR 1: showing images

- **A `notera-file:` scheme**, registered and served like `notera-theme:` (themes.js `serve`): a handler in the main process that answers only for image extensions (jpg, jpeg, png, gif, webp, bmp, svg) and only for files under the notes folder or the folder of a file the window has opened. Anything else is 404. `img-src` in the CSP gains `notera-file:`; DOMPurify's allowed URI pattern gains the scheme.
- **Preview**: after Markdown is rendered, every relative `src` is resolved against the note's folder and rewritten to the scheme. `https:` and `data:` images keep working as today. Printing uses the same rendering, so images print.
- **Scaled to the column** (`max-width: 100%`, already there), with `cursor: zoom-in`. **Clicking** opens the image at its natural size in an overlay over the window, scrollable when it is larger than the window; Esc, a click outside the image or the close button closes it. Nothing more (no zoom steps, no next/previous).
- **A missing file** shows a dashed box with the alt text and the file name instead of the browser's broken-image icon.
- **The image in the Write view.** A line that is nothing but an image, `![Bild 1](bilder/login-error-1.jpg)`, shows the image under it, scaled to the text column, while the cursor is on another line (a CodeMirror block widget, like Obsidian's live preview and in the spirit of the hidden markers). When the cursor reaches the line the widget goes away and the plain text is there to edit; the marker hider also hides `![` and `](bilder/…)` on lines the cursor is not on, so an image inside a paragraph reads as `Bild 1`. The widget's height is known once the image has loaded, so the editor keeps its scroll position across the load. Clicking the image opens the same full-size overlay as in the preview. A missing file shows the same dashed box. Plain-text tabs and View > Hide Markdown markers off show the text only. A broken `https:` image is never fetched twice: the widget is keyed on the URL and remembers the failure for the tab's lifetime.
  - Changed 2026-10-29, asked for by Jonas: the image stays an image when the cursor reaches it, as in Word. Every image link is replaced by the image (an inline widget, no caption line), and the range is atomic, so the arrow keys land before or after it and Backspace removes it whole. Only a selection reaching into the link (a search match in the file name) shows it as text; View > Hide Markdown markers off shows all the text.

## PR 2: getting images in

Three ways in, all ending the same: the file is written to the images folder, and `![Bild N](bilder/<name>.jpg)` is inserted at the cursor on a line of its own, with a blank line before and after when the neighbours are not blank. The cursor lands after it.

- **Ctrl+V** with an image on the clipboard (Win+Shift+S puts one there). A CodeMirror paste handler sees the image in `clipboardData.files`, sends the bytes to the main process and gets the relative path back. When the clipboard carries both text and an image (a copied web image), the image wins in a Markdown tab. Plain-text tabs ignore images.
- **Drop** of an image file from Explorer onto the window with a Markdown tab active: the file is copied in (the original is left alone) and linked. Other files open as tabs as today. Several images give several lines.
- **Format > Insert image…** (Ctrl+Shift+I, also in the toolbar) with a file dialog filtered to images. Same path as drop.
- **Folder**: `bilder` in a Swedish UI, `images` in English, created the first time a note in the project gets an image. Like the inbox and archive the name is fixed when first created and stored in `.notera.json` (`images`), so a language switch never splits the images in two folders. A project may not be named the same. For a Markdown file outside the notes folder the images folder is created next to the file.
- **File name**: a slug of the note's title plus a number: `login-error-1.jpg`, `login-error-2.jpg`. The slug keeps letters (åäö too) and digits, turns everything else into `-`, and lower-cases. The number is the first free one in the folder for that slug. No spaces, so the link needs no `%20`. Ctrl+V in a note that has not got a title yet uses the file name stem.
- **Alt text**: `Bild N` (`Image N` in English), N = the number of images already in the note plus one. Written into the text, so "se bild 3" is searchable and the alt text can be edited by hand.
- **JPEG**: the clipboard always gives PNG; the window converts on a canvas (Chromium decodes every image type, `nativeImage` only PNG and JPEG) and sends the JPEG bytes to the main process, which only names and writes. Transparency becomes white. A dropped or inserted file: jpg is copied unchanged; png, bmp, webp and avif are converted to jpg; gif and svg are copied as they are (a converted gif loses its animation, svg stays vector). A file Chromium cannot decode (tiff) is refused with a toast. Quality 85 is fixed, no setting until someone asks.
  - Known trade-off, agreed: JPEG blurs small text slightly and a screenshot with large flat areas is not always smaller as JPEG than as PNG. 85 is the usual compromise.
- **Untitled tab.** With a notes folder chosen, pasting an image into an untitled tab first makes it a note in Unsorted (what Ctrl+T does) and then adds the image there. Without a notes folder the paste shows "Save the file first" in the status bar and does nothing.

## PR 3: the files follow the note

`imagesOf(text)` lists the links in a note that point into its own images folder. The notes store uses it so that:

- **Move, archive, restore**: the images go to the destination's images folder in the same journal as the note, so the Undo bar brings them back too. When another note in the source folder links the same file, the file is copied, not moved. A name clash in the destination gives the file a free number and rewrites that link in the note, in the same write that rewrites the header line.
- **Rename after heading, rename project, archive or delete a whole project**: nothing to do; the links are relative and the folder moves or goes to the Recycle Bin with the project.
- **Delete note**: the images only that note links go to the Recycle Bin with it. An image line deleted from the text leaves the file behind, untouched. "Clean up unused images" (a command that lists and trashes orphans) goes to the backlog.
- **Version history** stays text only. A restored version that links a trashed image shows the missing-file box.
- **Templates**: a template's images are not copied when a note is made from it. Out of scope.

## Tests

Unit tests (`npm test`) for the slug and numbering, `imagesOf`, the scheme handler's path checks, and the store moving, copying and trashing images with a note. E2E (`npm run e2e`): the main process puts a PNG on the clipboard, Ctrl+V in a note writes a jpg into the project's images folder and inserts the line, the Write view shows the image widget and takes it away when the cursor reaches the line, the preview renders it (`naturalWidth > 0`), a click opens the overlay and Esc closes it, and dropping a png converts it to jpg. Screenshots of the Write view, the preview and the overlay before each merge.

## Backlog after this

- Clean up unused images.
- JPEG quality or PNG as a setting, if screenshots turn out too fuzzy.
- Width per image without raw HTML (`<img src="bilder/x.jpg" width="400">` works already).
