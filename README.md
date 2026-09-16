# MAGMA//KIT

The shared engine under the family's desktop apps (sprite-forge,
magma-ops-app, and whatever comes next). Extracted, not invented: every module
here existed in two or three hand-cloned copies before it was one.

Three parts:

- **`js/`** — classic scripts attaching to `window.MagmaKit.*`, vendored into
  a consumer's `app/kit/` by byte-copy. Crash-reporting boot, the Tauri bridge
  substrate, keyboard resolver, undo/redo history, localStorage prefs,
  `<dialog>` modal idioms, DOM primitives.
- **`crate/`** — a Rust library consumed as a sibling path dependency
  (`magma-kit = { path = "../../../magma-kit/crate" }`). Filesystem bridge
  with path containment, the two-sided log file, tray-popover anchoring
  geometry, dirty tracking (+ close guard behind feature `dialog`), autostart
  (feature `autostart`).
- **`template/`** — a stampable minimal app carrying the house conventions:
  CSP, minimal capabilities, `[lib]` split, release profile, test wiring.

## Using it in a consumer

```
npm run sync-kit     # node ../magma-kit/scripts/sync.mjs .   — (re)vendor
npm run check:kit    # node ../magma-kit/scripts/sync.mjs --check .
```

`scripts/sync.mjs` is the only writer of `app/kit/` and `tests/kit/`. Files
are byte-copies; `app/kit/KIT.md` records the kit version and per-file hashes.
Edit kit files **here**, never in a consumer, then re-sync every consumer.

Two guards keep that honest, one at each end. A consumer's own `npm run check`
verifies its vendored files against its own `KIT.md` (hermetic — no kit
checkout needed), catching a file edited in place. This repo's `npm run check`
verifies every app listed in `consumers.json`, catching a kit file changed
here and never synced out. Add new apps to that list.

## New app

```
node scripts/new-app.mjs ../my-app --name "MY//APP" --ns MyApp --from ../sprite-forge
```

`--from` carries `app/shell/`, `app/fonts/` and `desktop/src-tauri/icons/`
across from an existing app, which is what makes the result build and run
immediately — `tauri-build` refuses to compile without icons. Without the
flag the script stamps anyway and prints what is still missing.

Then: `npm install` (root and `desktop/`), `npm run check`, `cd desktop &&
npm run dev`, `git init`, and add the app to `consumers.json`.

## Developing the kit

```
npm run check                          # lint + node tests/run.mjs
cd crate && cargo test                 # base modules
cd crate && cargo test --features dialog,autostart
```

After any kit change: run the above, then re-sync and `npm run check` in every
consumer. The kit's tests protect the kit; the consumers' tests protect the
migrations.

## What deliberately is NOT here

- **`ware/shell`** (app-shell.css, toast, fonts) — chrome stays upstream in
  the website repo per its README's vendoring contract; apps vendor it from
  there exactly as before.
- Docking, command palettes, autosave, plugin systems — none of the apps have
  them, so the kit does not speculate about them.
- App vocabulary: bindings tables, history caps, command catalogs, status
  pills. Those are data the app passes in — kit files stay byte-identical
  across consumers.

## Candidates, not yet taken

Things a second app has now hand-rolled, which the extraction rule says are
eligible, and which have not moved for a stated reason. Recorded so the next
person does not have to rediscover them.

- **`scripts/make-icon.mjs`** — deck-press and gatefold both have one: a
  palette, a 32x32 grid of indices, a PNG encoder and an ICO writer, identical
  below each app's `DESIGNS` registry. What stops it moving is the vendoring
  mechanism rather than the rule: the manifest carries `js/` and `testkit/`,
  both of which are byte-copied into a consumer and hash-checked there. A build
  script is a third category — it is not loaded by the app, not covered by
  `kit-integrity`, and would need its own destination and its own check. Worth
  doing when a third app needs an icon; not worth designing for two.
- **The project shell** — `currentPath`, Save vs Save As, `confirmDiscard`, the
  filename in the header. sprite-forge and gatefold have full versions and
  deck-press has half of one, so extracting today would mean designing the
  union rather than lifting it. Revisit with three real copies to diff.

## Support This Project

If you find this useful, consider supporting its development:

[![Sponsor](https://img.shields.io/badge/%E2%9D%A4_Sponsor-pink)](https://github.com/sponsors/magmacrunch-media)
[![PayPal](https://img.shields.io/badge/Donate-PayPal-blue)](https://www.paypal.biz/magmacrunchmedia)
