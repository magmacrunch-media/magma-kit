# MAGMA//KIT — conventions and invariants

Read README.md first for what this repo is. This file is the rules, and where
each was learned.

## The one law: kit files are byte-identical everywhere

`scripts/sync.mjs` byte-copies `js/` and `testkit/` into consumers and is the
ONLY thing that writes `app/kit/` or `tests/kit/` there. Nothing is templated
or rewritten on the way through, so `sync.mjs --check` (a hash compare) is a
complete drift detector. Anything app-specific — bindings tables, history
caps, snapshot callbacks, command names — is a PARAMETER the app passes in,
never an edit to a kit file. If a kit file needs app-specific content, the
design is wrong; move the content to the app and pass it in.

### Drift is guarded from both ends

Vendoring has two ways to rot, and each is caught by the side that can see it:

- **A vendored file edited in place.** Caught in the consumer, by its own
  `npm run check`: `testkit/kit-integrity.mjs` verifies `app/kit/` and
  `tests/kit/` against the sha256 rows in that app's own `app/kit/KIT.md`. It
  needs nothing but that repo — no kit checkout, no network — which is why it
  can live in `check` at all.
- **A kit file changed here and never synced out.** Invisible from the
  consumer, because KIT.md travels with the files, so an old-but-consistent
  vendoring verifies clean. Caught HERE, by `tests/consumers.test.mjs`, which
  runs `sync.mjs --check` against every path in `consumers.json` — at the
  moment the change is made, which is the moment the risk is created.

`consumers.json` skips paths that are not checked out rather than failing, so
this repo stays checkable on a machine holding only part of the family. **When
you stamp a new app, add it to that list** — `new-app.mjs` prints the
reminder, and nothing else will.

`npm run check:kit` in a consumer answers the sharper question ("am I behind
the kit?") but needs the sibling present, so it stays out of `check` and stays
manual.

## js/ is classic scripts, not ES modules — do not convert

Same rule as sprite-forge and magma-ops-app, and it comes from the website:
magmacrunch.com is buildless and cache-busts by stamping `?v=<hash>` onto
`<script src>` tags. An `import` specifier inside a .js file is invisible to
that stamper, so ESM would sit behind stale caches with no way to force a
refresh. Kit js/ files stay stamper-compatible so the website can consume them
later if it ever wants to. They attach to `window.MagmaKit.*` via IIFEs.

Load order in a consumer page: `kit/boot.js` FIRST (it exists to report
failures in everything after it), then the remaining `kit/*.js`, then the
app's `core/`, then `ui/`. The app's test runner should assert this against
its index.html via the harness's `scriptOrder()`.

## bridge-core.js rides Tauri internals — the CLI pin lives with it

`MagmaKit.tauri.on()` calls `transformCallback` and `plugin:event|listen`
directly rather than depending on @tauri-apps/api (the house rule from
sprite-forge). Because that is an internal, EVERY consumer pins
`@tauri-apps/cli` to an exact version in desktop/package.json — and all
consumers pin the SAME version, since one kit file now rides the shape.
Absence of `MagmaKit.tauri` is the desktop/web feature switch; nothing
downstream ever asks "are we in Tauri".

### invoke takes Tauri's third argument, and a raw body needs it

`invoke(cmd, args, options)` and `dialog(cmd, args, options)` forward all three.
The third one matters because of what the first one can be: a payload that IS
bytes — an ArrayBuffer, a view, or an Array — is sent as
application/octet-stream instead of being serialised, and that is the only
affordable way to move a large one. A Uint8Array reached through an object
becomes a JSON array of numbers, which deck-press measured at 1.3 GB of heap
and 100 MB of wire for 50 MB of image data.

A raw payload is the whole body, so a command's other arguments have nowhere to
go but `options.headers`, which Tauri deserialises into
`tauri::ipc::Request::headers()`. Forwarding two arguments made that
unreachable; deck-press framed its path into the front of the body instead.

**Header values must be visible ASCII.** Tauri builds them with
`HeaderValue::from_str`, which refuses anything else and fails the whole invoke
rather than the one header — so a path is not something you can put in one, and
`C:\decks\Tarot de Épée.deckpack` is the case that proves it. Encode it, or
frame it into the body. deck-press's frame is the right answer there, not a
leftover to be migrated.

## crate/ exposes plain functions, not commands

Apps keep three-line `#[tauri::command]` wrappers so each app's
`generate_handler!` stays an explicit allowlist in its own crate. The base
crate has no tauri dependency (fast `cargo test`); tauri-needing pieces sit
behind features `dialog` and `autostart`.

## Versioning

`package.json` is the kit's version (crate/Cargo.toml tracks it). Bump on any
change to `js/`, `testkit/`, or the manifest; the version lands in consumers'
`app/kit/KIT.md` at sync, which is how you tell who is behind.

## Testing

- `npm run check` — lint + `node tests/run.mjs` (the kit tests itself with its
  own vendored harness; that circularity is the point).
- `cargo test` and `cargo test --features dialog,autostart` in crate/.
- After changing the kit: re-sync every consumer and run THEIR `npm run check`
  before calling the change done. The consumers' suites are the migration
  regression net.

## Git

Commit as magmacrunchmedia <magmacrunchmedia@gmail.com> — ONE WORD, and by
doing nothing: `~/.gitconfig` already resolves to it here.

This file used to say `magmacrunch media`, with a space, which is what a local
`user.name` in this repo once set. That override was cleared on 2026-09-04,
along with the same one in gatefold and sprite-forge, so the instruction had
outlived the thing it described — and following it would mean re-adding the
override that was deliberately removed. **Do not set `user.name` or
`user.email` per repo.** `git -C . config user.email` is how you check.

The spaced spelling stays in the history, on commits that were made under it,
and is not a live misconfiguration. `crate/Cargo.toml` keeps
`authors = ["magmacrunch media"]`, which is package metadata rather than an
identity and is spelled that way in the consumers too.

No AI attribution in commits, code comments, or docs.

## What the kit refuses

- Chrome (`ware/shell`) — the website repo owns it; see its README for the
  vendoring contract and the packaging decision.
- Speculative framework features (docking, command palette, autosave, plugin
  systems). The kit is extraction: a module gets in when a second app has
  hand-rolled it, not when one app might want it.
- App vocabulary (status pills, stat rows, describe() tables). One consumer is
  not shared; it moves here when a second consumer wants it.
