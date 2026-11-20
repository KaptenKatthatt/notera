# Plan: sync between computer and phone, Notera on mobile

Draft 2026-10-09, not yet decided with Jonas. The open questions at the end need an answer before PR 1.

Goal: the same notes on the Thinkpad and the phone, edited on either one, also offline, without giving up what Notera promises today: **the notes are ordinary Markdown files in a folder**. The phone gets Notera as a PWA first and as a Google Play app later. Both are built from one web build.

## What we borrow from Claude Code and T3 Code on the phone

| Claude Code / T3 Code does | Notera does |
| --- | --- |
| The work lives on a server; the phone is a window onto it (Claude Code's cloud and Remote Control sessions, T3's `t3 serve` on the devserver). | A small sync hub on the devserver holds the current copy of every note. Computer and phone are both clients of it. |
| Remote Control: the computer only connects *out*. No open ports on the laptop. | The desktop sync agent only calls the hub. The Thinkpad opens nothing. |
| T3: one server process serves both the web UI and its API, on the tailnet only. "Never Funnel it: a pairing token is a password." | The hub serves the PWA and the sync API from one process, on the tailnet only. Devices pair with a one-time code; the token is treated as a password. |
| Pairing by QR code from the computer. | Settings > Sync on the computer shows a QR code; the phone scans it and is paired. |
| Home on the phone is a list (sessions, threads) with live status; one tap opens one; a composer bar sits above the keyboard. | Home on the phone is the notes list (recent, projects, search) with a sync status chip; one tap opens the editor; a formatting bar sits above the keyboard. |
| Claude Code's teleport: carry a session from web to terminal. | "Open on computer" in a note's menu opens it as a tab in the running desktop Notera; "Continue on phone" on the computer shows a QR code to the note. |
| The same look on every surface (and Notera's "Those guys" theme already looks like Claude Code). | The phone uses the same themes and the same CSS variables. Theme effects are off by default on the phone (battery). |

What we do *not* borrow: Remote Control's model where the phone only works while the computer is on. Notes have to work on the phone when the Thinkpad is asleep, and on a train with no signal.

## Alternatives considered

- **OneDrive only, phone edits through some Markdown app.** No phone editor understands Notera's header line, rename-on-title, projects or `.notera.json`, and OneDrive on Android does not sync a folder both ways.
- **Syncthing + Markor.** Works for raw files with zero building, but the same gaps as above, and Syncthing resolves conflicts with `.sync-conflict` files nobody notices. A fine stopgap while this is built.
- **CRDT (Yjs, Automerge).** Real-time co-editing is not the problem; one person rarely types into the same note on two devices in the same second. A CRDT would need its own document format beside the Markdown files. Rejected for revision-based three-way merge.
- **Remote Control style, desktop is the server.** Rejected above: the phone would be useless whenever the computer is off.

## Architecture

```
 Thinkpad (Electron)                     devserver (always on)                     Phone
 ┌─────────────────────┐   HTTPS/SSE    ┌──────────────────────────┐   HTTPS/SSE   ┌──────────────────────┐
 │ notes folder (files)│◄──────────────►│ notera-hub (Node 22)     │◄─────────────►│ PWA (later: Play app) │
 │ sync agent (main)   │   tailnet only │  files/  plain mirror    │  tailnet only │ IndexedDB folder      │
 │ base copies         │                │  state.sqlite revs, seq  │               │ same notes store      │
 └─────────────────────┘                │  git history, restic     │               │ service worker        │
                                        └──────────────────────────┘               └──────────────────────┘
```

- **The files stay the truth on the computer.** The sync agent mirrors the notes folder to the hub and back. `notes.js` does not learn about sync; edits made in Explorer, VS Code or another Notera window sync like any other change.
- **The phone runs the same notes store.** `notes.js` gets a file-system adapter. On the computer it is Node `fs`; in the browser it is a folder kept in IndexedDB. Projects, header lines, rename-on-title, archive, templates and `.notera.json` behave the same on both, because it is the same code.
- **One sync protocol for both clients.** Both mirror a folder of files against the hub, so the desktop agent and the PWA share the client code (`src/sync/`).
- **The hub keeps a plain copy** of the folder in `/srv/notera/files/`, plus a git repository there that commits at most once a minute. That is the server-side history and, with restic to the Synology, the backup.

### Sync protocol

Every file has a stable id from the hub, a path, a revision and a content hash. A global sequence number orders all changes.

| Call | Does |
| --- | --- |
| `GET /api/changes?since=<seq>` | Every file changed after `seq`: id, path, rev, hash, deleted. Plus the new `seq`. |
| `GET /api/files/:id` | Content and rev. |
| `POST /api/files` `{path, content}` | Create. Returns id and rev. A path that already exists answers 409 with that file. |
| `PUT /api/files/:id` `{baseRev, content}` | Write. 409 with the current content when `baseRev` is old. |
| `POST /api/files/:id/move` `{baseRev, path}` | Rename or move. Keeps the id, so an edit to the old path still lands on the moved file. |
| `DELETE /api/files/:id` `{baseRev}` | Tombstone. The content stays in git history. |
| `GET /api/events` (SSE) | A nudge with the new `seq` on every change, so the other device pulls within a second. Also carries "open this note" for handoff. |
| `POST /api/pair`, `GET/DELETE /api/devices` | Pairing and revoking devices. |

- **Push**: a client pushes a note 1 s after the last keystroke (desktop autosave already writes after 0.8 s; the agent picks the write up from the watcher).
- **Base copies**: each client keeps the last synced version of every file (`%APPDATA%\Notera\sync\` on the computer, IndexedDB on the phone). That is the base for the merge.
- **Merge on 409**: line-based three-way merge (`src/sync/merge.js`, diff3) of base, mine and theirs. Edits in different places merge silently. Edits to the same lines: theirs stays in the note, mine goes into a **conflict copy** next to it, `2026-10-09 Login error (konflikt, telefon 14.32).md`, and a toast says so. Nothing is ever lost.
- **`.notera.json`** is merged as data, not lines: order lists keep their order and gain missing entries, pinned and collapsed sets are unioned, per-project options take the newest writer.
- **Renames**: Notera renames a note when its heading changes, so renames are frequent. The PWA's store knows when it renames. The desktop agent sees unlink + add and pairs them by content hash within a couple of seconds; Notera's own renames are reported to it directly, so it does not have to guess.
- **Text form**: the hub stores UTF-8 with LF. The desktop agent converts to and from each file's own encoding, BOM and line endings (the code in `files.js` already detects them) and remembers them per file, so a Windows note stays CRLF on Windows and an edit on the phone does not flip it.
- **Deletes** applied from another device go to the Recycle Bin on Windows, never straight to nothing.
- **Not synced**: `.notera-history/` (version history, PR #50, is per device; the hub has git history), temp files from atomic writes, `desktop.ini`, `~$*`, OneDrive's own conflict files.
- **First connection** of a computer: hub empty → upload everything. Local folder empty → download everything. Both have notes → join by path; the same path with different text gets a conflict copy. The first connection never deletes anything, on either side.
- **Live editor**: when a synced change arrives for a note open in a tab, an unchanged tab takes it in place with the cursor kept (a CodeMirror transaction from the diff, not a reload). A tab with unsaved typing merges the same way as on 409. This replaces the reload prompt for files in the notes folder; files outside it keep the prompt.

### Reaching the hub from the phone

- **Tailnet only**, never Funnel, as with T3. Every request also needs a device token.
- **A PWA needs HTTPS** (service worker, install, share target). The obvious address, `https://devserver.tail8111ea.ts.net`, does not resolve on the phone because Tailscale DNS is broken on Android 17 (tailscale/tailscale#21375; T3 is reached at `http://100.78.157.104:3773` for that reason). Plain http to the IP is not a secure context, so no offline PWA there.
- **Proposal**: a public DNS name, say `notera.<a domain of Jonas's>`, with an A record to the devserver's tailnet IP 100.78.157.104, and a Let's Encrypt certificate fetched by DNS-01. Anyone can resolve it, only the tailnet can reach it. The hub listens on the tailnet IP on its own port. (Open question 1.)
- The desktop agent can use the same name, or the ts.net name, which works on Windows.

### The phone UI

Mockups first, as for every other Notera surface; they are the spec. Screens:

1. **Notes list** (home). Search field at the top (titles and text, archive included), "Recent" (the last five notes opened on any device), Unsorted, the projects (collapsible, in the desktop order), Templates and Archive at the bottom. A sync chip in the header: "Synced", "Offline · 3 changes waiting", "Conflict". A + button makes a note in Unsorted; the + on a project makes one there with its default template.
2. **Editor.** A back arrow, the title and a project chip on top; the editor in writing-mode style below (one column, iA Writer Mono, markers hidden off the current line). Above the keyboard a bar: bold, italic, heading, list, task, link, undo, redo, and Write/Read. Read shows the rendered preview with tappable task boxes.
3. **Note sheet** (long press in the list, ⋯ in the editor): move to project, pin, archive, delete, version history from the hub, save as template, open on computer.
4. **Command sheet**: the command palette as a bottom sheet with a search field, the phone's subset of commands.
5. **Settings**: theme and mode, font size, hide markers, spell check (the phone keyboard's), the paired hub and this device, sign out.
6. **Pairing**: what the phone shows after scanning the QR code, and the error states (not on the tailnet, code expired).

Plus: **share to Notera** (the PWA's `share_target`, later an Android intent): text or a link shared from another app becomes a note in Unsorted.

Not on the phone: menu bar, tabs, split view, encodings, print, keyboard shortcut settings, theme editor, VS Code theme import, opening files outside the notes folder.

### Where the code goes

- `src/shared/notesStore.js`: today's `src/main/notes.js` with every `fsp`/`files`/`trash` call going through an adapter `{ readText, writeText, rename, mkdir, readdir, stat, remove, trash }`. `src/main/notes.js` becomes the Node wiring. About 45 call sites; no behaviour change.
- `src/sync/`: `client.js` (pull, push, base copies, rename pairing, retries, offline queue), `merge.js`, `jsonMerge.js`, `protocol.js` (types). Runs in Node and in the browser.
- `src/main/sync.js`: the desktop agent: watcher on the notes folder, text-form conversion, Recycle Bin, status to the renderer, pairing.
- `src/web/`: `platform.js` (a `window.notera` for the browser: notes store over IndexedDB, settings in localStorage, no dialogs that need a file system), `idbFolder.js`, `sw.js`, `manifest.webmanifest`, `mobile.css`, and the mobile shell `list.js`, `note.js`, `sheet.js`. The editor modules (`editor.js`, `format.js`, `markers.js`, `headings.js`, `preview.js`, `previewTasks.js`, `themeApply.js`, `effects.js`) are reused unchanged; they already talk to nothing but the editor. `app.js` and `sidebar.js` stay desktop only: their job (tabs, menus, a 925-line drag-and-drop sidebar) does not fit a phone, and a second, small shell is cheaper than making them responsive.
- `scripts/build.mjs` gains a `--web` target: a second esbuild entry with `path` aliased to a browser shim, output in `dist/web/`.
- `server/`: the hub. Node 22, `node:http` and `node:sqlite`, no framework. Serves `dist/web/` and `/api`. `deploy/notera-hub.service` (systemd unit, restart always, a memory cap, written like `t3code.service`), and `server/README.md` for setup and backup.

## PRs

Each stands alone and leaves master releasable.

1. **Phone mockups.** HTML mockups of the six screens and the share flow in `mockups/mobile/`, in the Default and "Those guys" themes, light and dark, at 412 px wide. Jonas picks and adjusts before PR 5.
2. **Notes store over an adapter.** The move to `src/shared/notesStore.js`, a Node adapter and an in-memory adapter. Every existing unit and e2e test passes unchanged; the in-memory adapter runs the store's unit tests a second time.
3. **Hub and protocol.** `server/`, `src/sync/merge.js`, `jsonMerge.js`, `protocol.js`. Unit tests with simulated clients for every case under "Sync protocol": parallel edits in different and the same lines, edit vs rename, edit vs delete, rename vs rename, two creates on the same path, `.notera.json` merges, tombstones, pairing and revocation. Deployed to the devserver as a systemd unit, tailnet only, with the certificate from open question 1.
4. **Desktop sync.** `src/main/sync.js`, Settings > Sync (connect, QR code for the phone, devices, pause), a sync dot in the status bar, conflict toasts, live update of open tabs, first-connection join. E2E: two Notera instances with separate notes folders against a local hub; edit, rename, move, archive, delete and offline-then-online on one, check the other.
5. **PWA.** `src/web/`, the `--web` build, served by the hub. Offline: the app shell from the service worker, notes from IndexedDB, changes queued and pushed when back online. Install prompt, share target, handoff. E2E with Playwright's Pixel 7 emulation, including `setOffline`, and one test with Electron and the PWA editing the same note.
6. **Hardening.** A randomized test: three clients doing random operations, some offline, must end up with identical folders and no lost text (every text ever written exists in a note, a conflict copy or git history). A restore test of the hub from restic. A week of daily use by Jonas before PR 7.
7. **Google Play.** See below.

## Google Play, later

- **Capacitor** around the same `dist/web/` build. The app's files ship inside the APK, so the phone needs no HTTPS name for the UI and starts without a network; only sync calls the hub. Capacitor also gives the native share intent, and later a home-screen widget (quick note) and a notification for conflicts. A Trusted Web Activity (Bubblewrap) is the cheaper wrapper but ties the app to the hub's web address; Capacitor fits an offline notes app better.
- **Store requirements**: a Play developer account, a privacy policy, the Data safety form, the current target API level, an app signing key kept outside the repo. A new personal developer account has to run a closed test with at least 12 testers for 14 days before it may publish to production.
- **Who is it for?** For Jonas alone, the internal testing track is enough and the hub can stay on the tailnet (the phone runs Tailscale). For other people, the hub becomes a product: accounts, a public address with real authentication, hosting off the devserver, per-user storage, GDPR. That is a separate plan; nothing in PRs 2 to 6 blocks it, because the protocol already has devices and tokens. (Open question 4.)

## Running the build

Following the multi-agent rules: one agent per PR, models chosen by me per PR, every PR reviewed and its e2e run before the next starts. PR 3 (merge and protocol) is the risky one and gets the most review; PR 2 is the pilot that measures cost per PR before the rest are started. E2E runs under `xvfb-run` on whichever devserver is free, never two Electron suites at once.

## Open questions for Jonas

1. **HTTPS name for the PWA.** Which domain gets `notera.…` pointing at the devserver's tailnet IP? Or wait for Tailscale DNS on Android and use the ts.net name?
2. **Hub on the devserver (Contabo)?** It is always on and backed up by restic. The HP box is the alternative.
3. **OneDrive and the Google Drive copy.** The notes folder is copied to Google Drive ("Anteckningar", nightly-ish). Keep that, or OneDrive, as an extra backup beside Notera sync (works, but two tools syncing one folder both ways can race), or let the hub's git history and restic be the backup?
4. **Play Store: just for you, or for others?** Decides whether PR 7 is a wrapper or the start of a hosted service.
5. **Phone editor default**: open notes in Write, or in Read with a tap to edit?
6. **Version history** from PR #50: you put it inside the notes folder so it follows the backups. Keep it per device and let the hub's git history cover the phone (proposed, less churn), or sync `.notera-history/` too?
