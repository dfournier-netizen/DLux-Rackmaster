# DLux Rackmaster — Project Notes & Handoff

*Last updated: July 8, 2026 · Current build: `DLux Rackmaster 539PM 070826.html` (v6.4.1)*

## What this is

A fully local, single-file rack diagram and signal-flow builder for mobile AV racks ("rock and roll" touring racks), inspired by Vectorworks ConnectCAD. Everything — HTML, CSS, and JavaScript — lives in one `.html` file. Double-click it, it runs in any modern browser (Chrome/Edge recommended), no install, no server, no network.

**Four views:** Library (device templates), Racks (physical rack builder), Routing (port-level signal flow), Rig (system-level view with rack containers and edge devices).

## File conventions

- Project folder: `Projects/DLux Rackmaster/`
- Every change produces a **new timestamped file** — never overwrite. Naming: `DLux Rackmaster HHMMAM/PM MMDDYY.html` (e.g. `DLux Rackmaster 0908PM 070326.html`). The newest timestamp is always the current build; older files are the version history.
- App data autosaves to browser `localStorage` under key `dlux-rackmaster-v1`. **Storage is per-file-path**, so opening a new iteration starts fresh in that tab — use **Export Project** (`.dlux.json`) in the old file and **Import** in the new one to carry work forward. Images are embedded base64, so exports are fully portable.

## Architecture

- **No frameworks, no build step.** Vanilla JS, single `<script>`, `"use strict"`.
- **State:** one global object `S` = `{ meta, library, racks, edges, connections, ui }`. Mutate → call `commit()` (= `save()` to localStorage + full `render()`), or `save()` alone for non-structural edits.
- **Rendering:** `render()` wipes `#view` and dispatches to `renderLibrary` / `renderRacks` / `renderRouting` (Routing and Rig share `renderRouting`; `S.ui.view === "rig"` toggles rig behavior). Views are rebuilt from state with template literals + delegated event listeners. No virtual DOM — full re-render on every commit.
- **Theming:** CSS custom properties on `:root` with a `[data-theme="dark"]` override block. High-contrast light + dark. Dyslexia-friendly type (Verdana stack, generous spacing).
- **Migration:** `migrate()` runs on every load/import and fills any state fields added in later versions (also heals old bugs, remaps renamed port types, backfills library depths). Old project exports always open cleanly.

## Data model (key shapes)

```
S.racks[]        { id, name, sizeU, depth /*in, default 20*/, color, notes, devices[] }
device instance  { id, tplId, name, cat, u, w:"full"|"half", side:"L"|"R",
                   mount:"front"|"rear"|"inside", depth /*in|null*/, inOff /*in|null=auto-center*/,
                   pos /*bottom U, 1-based*/, color, isContainer, contents[{id,name,qty}],
                   ports[], fields[{id,key,value}], img, imgRear, notes, rx, ry /*routing canvas*/ }
port group       { id, name, type, dir:"in"|"out"|"bi", count, face:"front"|"rear",
                   color?, jacks[ {label, fields[]} ] /*per-jack overrides, index-aligned*/ }
S.edges[]        device instances without pos/rack (consoles, WAPs, antennas)
S.connections[]  { id, a:{dev,g,i}, b:{dev,g,i}, label, color, type, len /*inches*/, notes }
S.library[]      templates: device shape minus pos/rx/ry, plus cat; containers may carry default contents
S.ui             view state: theme, face, filters, collapsed sections, floating panel geometry
                 (panels/panelHidden), zoomRack/zoomRoute, rigCollapsed, jackEd, selections
```

## Domain rules (the important math)

- **Placement:** `canPlace(rack, pos, u, ignoreId, w, side, probe)`. Vertical overlap → lateral check (half-width units share a row on opposite sides) → **depth check**: `depthRange(dev, rack)` returns the occupied span in inches including **2.5″ connector/cable room** (front mounts grow rearward, rear mounts grow inward, inside mounts sit at `insideOff`, auto-centered when `inOff == null`). Front/rear/inside can stack in one U row as long as spans don't intersect. `findBlocker`/`blockMsg` name the colliding unit in error toasts.
- **Face visibility:** front view shows front-mounted; rear shows rear-mounted plus front units deep enough to reach within 3″ of the rear; inside units show dashed on both faces with an `IN` badge. Left/Right side views (`sideSVG`) draw the depth cross-section with the cable-room strip shaded.
- **Cable length default:** `12″ base + 4″ per connector (×2) + 3.5″/U vertical + detour past deeper gear in the path + 6″ lateral + 10″ strain relief`; rack-to-rack adds 24″ up-and-over; edge runs use base + allowances. Editable per cable, "Auto" recalculates.
- **Library depths:** `SEED_DEPTHS` maps stock template names to typical chassis depths (Blank Panel 0.5″ … UPS 19″, Media Server 20″). Unknown gear falls back to a `Depth (in)` field or 18″.

## Feature inventory

- **Library:** templates with ports (type/direction/qty/face/color), custom fields with suggestions (IP, Universe, DMX…), width, mount, depth, front+rear faceplate images, containers (contents list replaces ports), duplicate/delete, search + department/size filters, collapsible categories.
- **Racks:** multiple racks (size, depth, color); drag-and-drop or double-click placement; half-width side-by-side; front/rear/F+R/left/right views; toggles for rails, U template, U numbers, labels, images, stats; highlight filter; zoom; clipboard (Ctrl+C/X/V/D, Del, ↑/↓); inspector edits everything including per-port labels/fields ("⋯" on a port row) and image keystone/scale/crop/shift/opacity sliders; save instance back to library.
- **Routing:** node canvas, click out-pin → in-pin to patch, per-cable label/color/type/length/notes, per-port colors, shift-click multi-select (cables and ports) for bulk color/delete, cable-type filter hides wires on canvas, device editor in the side panel, zoom.
- **Rig:** rack group containers (drag header moves the whole rack), collapse to a single node with cables re-anchored to its edge, per-rack show/hide + hide/show all, "hide intra-rack cables" toggle, edge devices (from templates or blank).
- **UI chrome:** all four side panels float (drag grip, corner resize, Hide → edge restore tab, Reset), content margins adjust automatically, dark/light themes, mobile layout under 920px with a top pane switcher.
- **Outputs:** Export/Import project JSON; cable schedule CSV; **Rack Guide PDF** (print dialog → save as PDF): cover, system overview, inter-rack trunks, network/addressing table, edge device table, then per rack front/rear/left-side elevations (with faceplate images), build order, cabling checklist, and full config/credential sheets; ends with the signal-flow diagram and complete cable schedule.

## Known quirks

- The Rack Guide opens in a pop-up — allow pop-ups for the file.
- "Paste screenshot" needs Chromium clipboard permissions; Upload always works.
- Many large images can fill the ~5–10 MB localStorage quota; the app warns once and keeps running — export to file when it does.
- `file://` localStorage is per-browser and per-path; treat Export Project as the real save.

## Notes for the next Claude session

- The single source of truth is the newest timestamped HTML in `Projects/DLux Rackmaster/`. Read its `<script>` for current code; a version comment sits just before `</script>`.
- Keep the iteration convention: copy newest → new timestamp name → edit the copy.
- Practical workflow that has worked well: copy the current build into the sandbox (`/tmp`), apply changes as exact-string patches via python (verify each patch's match count), `node --check` the extracted script, smoke-test with `jsdom` (install via npm; simulate placement/routing/report calls and assert on DOM), then `cp` the finished file into the mounted Projects folder. **Caution:** host↔sandbox file sync has intermittently served stale/truncated content for files *edited* after creation — freshly created files sync reliably, so prefer creating new files over editing mounted ones, and verify with `md5sum`/`Grep` before and after. **This bit again in the v6.3 session:** both markdown docs got silently truncated mid-sentence after being edited in place via the file-edit tool (confirmed by `wc -l`/`tail` after the fact) even though the tool reported success — the fix was to rewrite the full file in the sandbox and `cp` it over the mounted copy (overwrite-via-cp worked even though `rm` on the mounted file was refused). **Always re-read mounted `.md`/`.js` files with `wc -l`/`tail` right after any edit to confirm they're not truncated, not just files you assume are "done."** **Confirmed a third time in the v6.4.1 session:** an in-place Edit-tool call on this very file silently truncated it mid-sentence again despite reporting success — same fix applied (full rewrite in sandbox + `cp` over). At this point treat in-place edits to mounted `.md` files as unreliable by default; always rewrite-and-cp, and always verify with `wc -c`/`tail -c` (not just `wc -l`, since truncation can land mid-line) right after.
- **Checkpoint cadence (corrected after v6.3):** v6.3 batched five sub-features (Racks/Routing/Rig/Lighting multi-select + the zoom fix) through ~10 sandbox patches and only wrote ONE timestamped file to the project folder at the very end — a multi-hour gap with no intermediate version to fall back to, unlike v6.0–v6.2 which checkpointed every 30–45 min. Worse, that file's name (`0227PM`) was generated from a clock read hours before the actual save (real mtime: 5:28 PM) — a stale-timestamp bug. **Going forward:** re-read the actual current time (`date` in bash) immediately before each write, and cut a new timestamped file after each meaningful sub-feature lands (not just once at the end of a long session) so the version trail stays granular and the filename matches the real save time.
- `migrate()` must gain defaults for any new state field, and `instantiate()` must copy any new template property.
- User preferences established so far: minimalist high-contrast UI, dyslexia-friendly type, "ports" not "jacks", "BiDi" not "Bi", everything labelable and color-codable, runs fully local.

## v6.0 — LIGHTING workspace (RIGPOWER merge, P1)

RIGPOWER (`Projects/AV Tools and plugins/RigPower/` — see its `RIGPOWER_REFERENCE.md` for all lighting-domain logic) is now merged in as a fifth top-level view, **Lighting**, plus a sixth, **Settings**. Racks and Lighting stay logically separate domains; P2 (shared cable engine, unified schedule/PDF) and P3 (racks publishable as distro devices, cross-domain Rig Check) are the agreed next phases.

**Merge architecture:**

- **Shadow-DOM isolation.** RIGPOWER's markup + CSS live in `<template id="rpTpl">`; a `<div id="rpRoot">` hosts a shadow root. Zero ID/class/selector collisions with Rackmaster by construction. Its JS is wrapped in an IIFE exposed as `window.RP` with API `{ getState, setState, onShow, host }`; its `$`/`$$` helpers query the shadow root (`RPDOC`).
- **State:** `S.lighting = { state, stockLengths }` (live reference to RP internals; `migrate()` defaults it to `null`). Sync: debounced (300 ms) `input/click/keyup/change` listeners on the shadow root call `save()`; `#btnExport` re-pulls `RP.getState()` before serializing; project import calls `RP.setState(S.lighting)` then relinks. One `.dlux.json` now carries everything. RIGPOWER's own Save/Load buttons still work for lighting-only files.
- **Vendored libs, zero network:** JSZip 3.10.1 + Three.js r128 are inlined (~700 KB; total file ~965 KB). Google-Fonts `@import` removed (falls back to Verdana stack / system mono).
- **Theming:** Rackmaster exposes `--rm-*` aliases on `:root`; the shadow `:host` block maps RIGPOWER's vars onto them (with `color-mix()` for derived elevations), so light/dark themes flow through. Leg colors X/Y/Z, SOCA purple, L21-30 red-orange stay fixed. `@media print` hides `#rpRoot` so the Rack Guide prints clean.
- **Settings + units:** `S.ui.units` = `"imperial" | "metric"`. Global helpers `fmtIn` / `fmtFt` / `fmtInNum` convert **readouts** (rack depth ranges, cable-length chips/cells, RIGPOWER ft displays — all 8 sites). Entry fields and stored data remain native in/ft; CSV exports stay numeric-native. Static explainer text (e.g. the cable-length formula) stays imperial deliberately.
- **Renderer boundary:** `render()` toggles `#rpRoot` visibility and calls `RP.onShow()` (dispatches a resize so the Three.js canvas sizes after unhide). The mobile pane-switcher is skipped for lighting/settings views.

**Build provenance:** merged programmatically by `build2.py` (19 exact-string patches, all count-verified) from `0908PM 070326` (v5.2) + `RIGPOWER.html`; validated with `node --check` on all 5 inline scripts and a 19-assertion jsdom smoke suite (boot, view switching, state bridge, autosave, units, import round-trip). 3D plot needs a real browser — untested in jsdom.

**v6.0 quirks:** RIGPOWER inputs are still labeled in ft (by design); lighting leg/identity colors are tuned for dark and are slightly soft on the light theme; if future edits touch RIGPOWER internals, edit the merged file's fourth `<script>` (the `window.RP` IIFE) directly.

## v6.1 — P2 shared services + P3 cross-domain seams

**P2 — shared cable engine & unified outputs:**

- `RP` API grew: `buildRun(targetFt, sizes[])`, `computeAutoCable(opts)`, `getStock()`, `refresh()`. Rackmaster-side helpers (`lgData/lgCalc/lgPick/buildTxt/lightingCSVRows/lightingReportHTML`) read `S.lighting.state` directly — pure data reads, no RP rendering coupling.
- **Rack trunk stock** (Settings → "Rack trunk stock lengths", `S.ui.rackStock`, default 3/5/10/15/25/50/100 ft) feeds a **Suggested Build** column in the schedule: each rack/edge run's auto length (inches→ft, ceil) is solved through `RP.buildRun` (e.g. `1×15′ (+2′ over)`).
- **Unified CSV** (`scheduleCSV()`, still on the Cable CSV button): rack connections (now with Build column) + appended lighting sections — phase load, multicables with home-run/DMX/Enet builds, cable part totals (multis + jumper/data parts from `computeAutoCable`), breakouts. Also fixed a latent crash when a connection touched an edge device (`A.rack` null).
- **Rack Guide PDF**: new numbered section "Lighting power & cabling" (phase table with spread %, power by position with per-circuit leg/watts/amps, multicable + data pick list, cable part totals, DMX universe summary). Renders only when lighting data exists; the Signal-flow section number shifts via `lgSecCount()`.

**P3 — the seams:**

- **Publish rack → lighting distro**: button in Rack settings (label flips to "Re-publish" once published; re-publish syncs the name). Creates `{ kind:"distro", _rackRef: rack.id, placed:false, outputs:6, voltage:208 }` in `S.lighting.state.devices`; place it via Lighting → Devices, where it anchors home-run distance math. `RP.refresh()` re-renders the active lighting tab.
- **Rig Check** (topbar button): cross-domain lint in a modal — Signal: port-type mismatch per cable, in→in / out→out, dangling endpoints. Network: duplicate IPs across rack devices + edges (any `IP*` field). Power: circuit overload (SOCA >20 A, L21-30 >30 A at multi voltage), phase imbalance (spread >500 W and >20%). Patch: universe overlaps via footprints, >512 overflow, unrefined stub GDTFs. Cross-domain: published devices pointing at deleted racks, unplaced published racks, name drift. `rigCheck()` returns the findings array (testable); `rcShow()` renders.

**Validation:** 30-assertion jsdom suite for P2/P3 (synthetic rig: 3-leg SOCA with deliberate overload, overlapping patch, dup IPs, orphaned publish) + the 19-assertion P1 suite re-run green. 3D placement of published devices still needs a real-browser once-over.

## v6.2 — one library across modules

Lighting → Devices gained an **"or — from Rack Library"** picker: any Rackmaster library template can be added as a lighting device. Mapping: name + category carried over; **in/out counts derived from the template's port groups** (non-`in` dirs → outputs, non-`out` → inputs); generic kind `"gear"` (renderer + 3D plot fall back gracefully: category as the pill label, `--legX` accent). Devices carry `_tplId`/`_cat`; Rig Check warns when the source template is deleted and notes name drift after renames. The picker (`refreshLibSel`, RP-side) re-reads `window.lgLibDevices()` (RM-side snapshot fn) every time the Devices tab renders, so library edits show up live. Suite: 13 new assertions + P1 (19) + P2/P3 (30) all green.

## v6.3 — unified shift-click multi-select + zoom/viewport fix

**Multi-select** — a shared runtime-only `MSEL.devs[]` (alongside the pre-existing `MSEL.conns[]`/`MSEL.ports[]`) holds either a device-instance id or a `"rack:<id>"` key for a Rig rack container. Shift-click toggles membership everywhere; a plain click still single-selects and clears the group.

- **Racks:** shift-click devices to build a group. `↑`/`↓` nudges the whole group one U at a time, **all-or-nothing** (`canPlaceGroupMove()` validates every member's new position — against the rest of the rack and against each other — before committing any of them; if one is blocked, none move). `Ctrl+C/X/D` and `Delete` operate on the group via `copyDevs/cutDevs/duplicateDevs/pasteDevs` (backed by a new `CLIP_MULTI` clipboard, alongside the existing single-device `CLIP`); paste/duplicate re-selects the newly placed clones. The Inspector swaps to a compact multi-edit panel (`renderMultiInspector`) for bulk color/notes + the same bulk actions.
- **Routing/Rig canvas:** shift-click a node header or a rack-group/rack-node header to add/remove it from the group. Dragging any *selected* header (`startGroupDrag`/`resolveDragTargets`) moves every selected node and rack together by the same delta — including collapsed racks (by `grx/gry`) and expanded racks (by moving every member device). The dashed rack-container box re-syncs live during the drag (`syncRackGroupBoxes`). The existing cable/port multi-select panel gained a device section (count, bulk color, bulk delete); background click / Escape clears all three selection kinds together.
- **Lighting (RIGPOWER) Devices tab:** shift-click a device panel's header to multi-select (`DSEL[]`, scoped to that tab only) and bulk-delete via a small toolbar. Scoped down from the canvas group-move behavior on purpose — the Devices tab is a form list with no shared drag surface, so "move" and "bulk field edit" don't map onto it the way they do for a spatial canvas; this is intentionally the smaller, honest version of the feature for that tab.

**Zoom/viewport-reset bug fix** — `render()` fully wipes and rebuilds `#view` on every commit, which recreates `.center` (Racks) and `#routeCanvas` (Routing/Rig) from scratch each time — silently dropping `scrollLeft`/`scrollTop` back to `0,0`, not just on zoom. `render()` now captures the outgoing scroll position (and the zoom value in effect) before the wipe, then restores it after rebuilding, rescaled by `newZoom/oldZoom` when `zoomRack`/`zoomRoute` changed (via a small `VZ` last-zoom cache) — so panning position survives both zoom changes and ordinary edits.

**Validation:** new jsdom suite (40 assertions, saved as `test_suite_v6.3.js` in the project folder — run it with `node test_suite_v6.3.js` after `npm install jsdom`, or pass a build path as an argument) covering boot/view-switching/state-bridge/autosave/import round-trip regression basics plus every new v6.3 behavior (shift-click toggling, all-or-nothing group nudge, bulk clipboard, cross-canvas group-drag math including collapsed-rack + edge-device combos, scroll-preservation math for both zoom and non-zoom commits, Lighting bulk delete). Note for future sessions: the prior "19+30+13" suites referenced in the v6.0–v6.2 sections above were never persisted anywhere accessible in this project folder (only the shipped HTML was saved each time) — this v6.3 suite is a fresh one written by re-deriving coverage from the shipped code, not a literal re-run of those exact files. Going forward, the test file itself is now saved alongside the HTML build so this gap doesn't repeat.

## v6.4 — port renaming, single-rack routing, touch support, adapters, push-from-library

**Individual port renaming, faster path.** Double-click a pin's name directly on the Routing/Rig canvas to rename that one port inline (writes to the same `g.jacks[i].label` the existing side-panel "⋯" editor uses — this is just a shortcut to it, not a new data model). Enter commits, Escape cancels. The "⋯" editor remains the guaranteed-works-everywhere path since double-tap-to-rename isn't reliable on every touch browser.

**Routing is now single-rack.** The Routing tab (not Rig) locks to exactly one rack at a time via a required dropdown in the side panel (`S.ui.routingRackOnly`, no "All racks" option, defaults to the first rack). Edge devices are excluded from Routing while a rack is selected — per the user's choice, cross-rack/edge patching stays a Rig-only workflow. Rig is unchanged: still shows every rack + edge devices together.

**Auto-hide portless devices + a visibility override.** Devices with zero configured ports show nothing to patch, so they're now excluded from Routing/Rig by default (`devVisibleInCanvas()`, checks `portList(d).length`). A new Inspector field, "Show in Routing/Rig" (Auto / Always show / Always hide → `d.hideInRouting` = `null`/`false`/`true`), overrides the default either direction.

**Mount position now follows the current view, not a stored template default.** The Library template editor's old "Mount" field is gone. Placing a *new* device — drag-drop from the palette, the empty-slot picker, or a tap-to-place — now takes its mount from whichever face panel/view it lands on: front panel → `mount:"front"`, rear panel → `"rear"`, left/right side view → `"inside"` with `side:"L"`/`"R"` respectively (`faceMount()`/`faceSide()`). The side (left/right) view gained its own placement affordance for the first time (double-click *or* tap an empty spot) since it previously had none. Existing devices and paste/duplicate keep whatever mount they already had — this only decides the mount for a device that didn't exist a moment ago. "Both" view has no spec from the user for this; it defaults to front-panel behavior on that panel, rear on the rear panel (each panel already knows its own face).

**Touchscreen support.** Previously, native HTML5 drag-and-drop (`draggable`/`dragstart`/`dragover`/`drop`) was the *only* way to place a device from the palette — and HTML5 DnD doesn't fire from touch on most mobile/tablet browsers, so touch users had no way to add anything to a rack at all. Fixed with a parallel, purely additive input path: tap a palette item to "arm" it (highlighted, toast confirms), then tap an empty slot (or the side view) to place it — same fit/mount logic as drag-and-drop, just a different trigger. Desktop mouse drag-and-drop is untouched and still works exactly as before. Escape or tapping the armed item again cancels. Routing/Rig canvas dragging (nodes, rack groups, multi-select, floating panel drag) was already Pointer-Events-based from v6.3 and needed no changes — already touch-compatible. Repositioning an *existing* placed device still relies on desktop drag or the Inspector's Position/Mount/Side fields (plain number/select inputs, already touch-friendly) rather than a new touch-drag gesture — scoped out for time; flagging as a candidate for a future pass if reposition-by-touch turns out to matter in practice. Known remaining rough edges: the floating side panels' resize-by-corner-drag (native CSS `resize`) doesn't respond well to touch, and `title="…"` hover tooltips are invisible on touch (discoverability loss only, nothing is blocked).

**Themed scrollbars.** Global `scrollbar-width/color` (Firefox) + `::-webkit-scrollbar` rules (Chromium/Edge) replace the raw OS scrollbar chrome everywhere, matching the light/dark palette instead of standing out.

**Manual Save button.** Topbar gained a "💾 Save" button next to the theme toggle — calls `save()` directly (same as autosave-on-commit) and toasts "Saved". Purely a confidence/reassurance affordance; autosave-on-every-commit was already there and unchanged.

**Cable/connector adapters.** `S.connections[].adapter` (free-text, e.g. "Edison → TRUE1 adapter") is a new field on every cable, editable in the connection editor (with a suggestion datalist) and included in the cable schedule CSV. Rig Check's port-type-mismatch rule now consults `typesCompatible()`: RJ45↔EtherCON is treated as natively plug-compatible and never flagged (real-world RJ45-into-EtherCON is genuinely compatible; we don't model plug/jack gender elsewhere in the port system, so the reverse direction isn't distinguished — flagged as a known simplification). Any other mismatched pair still warns *unless* the cable has an `adapter` label set, in which case it downgrades to an info-level note ("via adapter (...)") instead of a warning.

**Push template changes to its placed instances.** Library template editor gained a "Push to instances" button (`instancesOfTpl()`, `pushTemplateToInstances()`). Per the user's choice ("let me pick per push"), it opens a dialog to choose exactly what syncs: ports (types/dir/count/color, matched to existing port groups **by index** so ids and per-jack label/field overrides on surviving ports are preserved; removed ports also clean up their connections), dimensions (height/width/depth — validated per-instance with `canPlace()` first, so an instance whose growth would collide is silently skipped rather than corrupting the rack, and the toast reports how many were skipped), color, faceplate images, field list (adds new template field **keys** only — never overwrites a value the user already filled in), default contents (containers only), and name (**unchecked by default** — instances are routinely renamed on purpose, e.g. "SM58" → "Vocal Mic - Lead"). A new per-instance Inspector checkbox, "Protect from push," excludes that specific instance from ever being touched by a push, regardless of what's checked in the dialog.

**Lighting dropdown contrast fix.** The Lighting → Devices "from Rack Library" select (and selects generally, in the RIGPOWER shadow root) rendered white-on-white when the native `<option>` popup opened, because that popup is painted by the OS/browser chrome on its own light background rather than picking up the shadow root's dark theme vars. Fixed with `select option{color:#111;background:#fff}` forcing readable text regardless of the page theme.

**Validation:** new suite saved as `test_suite_v6.4/` (8 files, 115 assertions total: 40 re-run from the v6.3 suite unchanged in behavior except one fixture — an edge device with zero ports needed a port added, since portless-auto-hide is an intentional new v6.4 behavior, not a regression — plus 75 new assertions across mount-from-view, cable adapters, single-rack routing + visibility, double-click rename, the Save button, touch tap-to-place, and push-from-library). `test_suite_v6.4/run_all.js` runs every file in the folder and auto-picks the newest `DLux Rackmaster *.html` in the parent folder if you don't pass a path — so it keeps working against future builds without editing it each time.

## v6.4.1 — Lighting module bugfixes (Fixtures focus loss, leg-graph contrast)

**Fixtures/Patch input losing focus after one character.** Root cause: `renderFixtures()`'s `oninput` handler for the Watts field called `renderFixtures()` synchronously on every keystroke — `render()` wipes and rebuilds the DOM, so the input node was destroyed and recreated after each character, kicking focus out. Fixed by moving the rebuild off `oninput` and onto `onchange` (fires on blur/Enter, once the value has settled): `oninput` now only updates the in-memory fixture object (`f.watts=+inp.value||0`) and refreshes the Power Calc numbers if visible, with no render; a separate `onchange` handler does the `renderFixtures()` + recalc. Audited all 12 other `oninput=` sites in the Lighting module (Multicables' homerun/DMX/Ethernet fields, Patch tab's circuit/universe/address selects, Devices tab's name/x/y/z fields) — all of them were already doing surgical DOM updates or no render at all, so Fixtures' Watts field was the only offender. Patch and Devices tabs were not actually broken despite being named in the report; flagging in case the behavior resurfaces there under different data.

**X/Y/Z leg graph on the Lighting Summary page.** Not a logic bug — the math (`positionLegWatts`, `circuitWatts`, `multiWatts`, `positionWatts`) checks out correctly against synthetic balanced-load data. It was a contrast failure: the leg-identity colors (`--legX/Y/Z`, used for the bar-chart fills) were hardcoded once inside RIGPOWER's shadow-DOM `:host{}` block, tuned only for the dark theme. On the light theme, leg Z in particular measured close to 1:1 contrast against its own track background — visually indistinguishable from empty, which read as "broken." Fixed by making `--legX/Y/Z` theme-aware, following the app's existing `--rm-*` cross-shadow-boundary variable convention: the outer stylesheet now defines `--rm-legx/y/z` (aliased to a new `--legx/y/z` triplet that flips between a darkened light-theme set and the original vibrant dark-theme set), and the shadow `:host` block reads `var(--rm-legx,#4aa3e0)` etc. instead of a hardcoded hex. Dark theme is visually unchanged; light theme's leg bars are now readable.

**Validation:** two new test files added to `test_suite_v6.4/` (16 new assertions: `test_fixtures_watts_focus.js` simulates sequential keystrokes into the Watts input and asserts the DOM node survives without being replaced, and that the value commits correctly on blur; `test_leg_colors.js` structurally confirms the `--rm-legx/y/z` → `--legx/y/z` → shadow `--legX/Y/Z` variable chain is wired correctly for both themes — jsdom's limited CSS custom-property computed-style support means this is a structural check, not a rendered-pixel check). Full suite re-run: 131/131 green, no regressions.

## Backlog ideas (not yet requested, just candidates)

PNG/SVG export of elevations; orthogonal wire routing; undo/redo; multi-select in the rack view *(shipped in v6.3)*; touch-drag repositioning of already-placed devices *(v6.4 scoped this to the Inspector fields instead — candidate if it turns out to matter)*; touch-friendly panel resize handles; per-rack power circuits and load balancing; cable label printing (P-touch CSV); template sharing between projects; weight distribution per case; directional (not just symmetric) connector compatibility for cases where plug/jack gender matters.

## v6.5 — diagnosis-pass bugfixes, cable-rendering rework, BiDi-bottom-edge, undo/redo, signal trace, elevation export, cable label CSV

Checkpoint: `DLux Rackmaster 836AM 071426.html` (md5 `c09fcaa18dc11b6b59c34c8cee583010`, 1,070,149 bytes). Test suite: `test_suite_v6.5/` — the 11 pre-existing v6.4 files plus 5 phase-2 files plus 4 new feature files, 334 assertions total, all green against the checkpoint. Built on a diagnosis-only pass (`bug_report.md`) run against `DLux Rackmaster 539PM 070826.html`, then a phase-2 implementation pass, then this session's four user-approved features.

### Phase 2, Part A — bug fixes (2 high, 4 medium, 2 low)

- **H1** `libListHTML()` extracted out of `renderLibrary()`; the Library search box's (`#libSearch`) `oninput` handler now mutates `S.ui.libSearch` + `save()` and re-renders only `#libList`'s innerHTML instead of calling the global `render()` on every keystroke — the input element itself is never rebuilt, so focus and caret position survive, and the caret no longer jams to the end of the string.
- **H2** Same pattern applied to the Routing/Rig cable search box (`#connSearch`): `connDescribe()`/`connFilteredRows()`/`connListHTML()` extracted out of `renderConnPanel()`, `oninput` now updates only `#connList` + a `#connListHdr` count span instead of rebuilding the entire side panel per keystroke.
- **M1** RIGPOWER's `--amber` identity color was silently aliased to the app's blue `--rm-accent` bridge instead of its own dedicated bridge — every amber highlight in Lighting (active tab underline, focus outlines, manual-value badges, watts/amp totals) rendered blue in both themes. Fixed with a proper `--rm-amber` outer-side bridge and a real gold/amber literal (`#8a5c00` light / `#f4b942` dark), following the app's own `--rm-*` cross-shadow-boundary convention.
- **M2** `migrate()` now backfills `S.lighting.state.{positions,fixtures,instances,devices}` to `[]` if missing (previously only guarded `S.lighting` at the top level); `RP._setState()` gained the same defensive backfill as a second line of defense; `renderSummary()` wrapped in the same try/catch + toast pattern `renderCalc()` already used, so a malformed lighting state degrades to an error toast instead of an uncaught crash.
- **M3** "per-jack" → "per-port" in the Push Template dialog's copy — the one remaining user-facing "jack" string (internal `jacks[]` field name is unaffected, per the terminology rule).
- **M4** `t.fields`/`d.fields` now backfilled to `[]` in `migrate()`'s library/rack-device/edge loops, matching the existing pattern already used for `contents[]`/`jacks[]`/`ports[]`.
- **L1** RIGPOWER's distro device Outputs/Inputs fields (`.d-out`/`.d-in`) gained an `onchange` that calls `renderDevices()`, so the "→ adds N multi outputs…" label refreshes instead of going stale.
- **L2** Theme/contrast sweep found no further issues.

### Phase 2, Part B — cable rendering rework (Routing/Rig canvas)

`svg#wires` is now appended **after** every rack-group/rack-node/device-node (previously the first child of `#routeInner`, so cables always painted underneath everything) — cables now render on top of device nodes. Each cable is a `<g class="wire-grp">` wrapping two paths: a wider theme-aware "casing" stroke (new `--wire-casing` var) painted first, then the colored wire path on top, keeping cables legible crossing over arbitrary device-node colors — casing is `pointer-events:none`, only the colored `.wire` path stays clickable. `pinCenter()` now also returns the port's physical exit direction (`portExitDir()`: in→left, out→right, bi→down); `wirePath()` adds a short straight stub out of the port face before the Bézier begins, so cables visibly leave the port instead of emerging from under the node body. Collapsed-rack-fallback anchor stagger widened from `hash%6` to `hash%9` to cover the new third port zone. Preserved unchanged: drag re-draw, dangling-connection skip, cable click-to-select, cable colors/labels.

### Phase 2, Part C — BiDi ports moved to the node's bottom edge

`buildNode()` now buckets ports into three groups instead of two: `in` → left column, `out` → right column, `bi` → a new `.node-ports-bottom` zone (flex row, wraps, labeled "BiDi" — never "Bi"). `nodeEstH()` updated to account for the extra bottom zone's height when estimating node size for the Rig view's rack-group bounding box. All existing pin interactions (click-to-connect, dblclick rename, MSEL, the `data-dev`/`data-g`/`data-i` attributes `pinCenter()` depends on) unchanged — bottom-zone pins are the same `.pin`/`.pin-row` markup, just in a different container.

### Phase 2, Part D — UI reset cleanup + light polish

`render()` is now a capture/restore wrapper: `captureUIState()`/`restoreUIState()` record and restore scrollTop/scrollLeft for every scrollable element with a stable `id` or `data-panel-key` (generalizing v6.3's canvas-only zoom-aware scroll preservation), plus the focused element's id + text-selection range. The previous `render()` body is now `renderInner()`. `makeFloating()` tags every floating panel with `dataset.panelKey` so it can be found again after a rebuild. Escape now closes the topmost open `<dialog>`, or — if no dialog is open and focus is inside a floating panel (not a form field) — hides that panel via the same `S.ui.panelHidden` mechanism as its own "Hide" button. Number inputs now select-on-focus (cable length, U position, watts, counts, etc.). Added missing `:hover` states on tabs/face-seg/pane-toggle buttons.

### F1 — Undo/Redo

A structural-only snapshot stack (`UNDO_STACK`/`REDO_STACK`, capped at 50 entries) hooked into `commit()`: `structuralSnapshot()` captures `{racks, edges, connections, library, meta, lighting}` as a JSON string — deliberately excluding `S.ui`, so view/scroll/panel state survives undo/redo untouched. `commit()` calls `pushUndoIfChanged()` first, which diffs the just-mutated state against a cached `LAST_STRUCT_SNAPSHOT`; if different, the *old* cached snapshot is pushed onto `UNDO_STACK` and the redo stack is cleared. `doUndo()`/`doRedo()` restore a snapshot into `S`, re-sync RIGPOWER via `RP.setState()`, then `save()` + `render()`. Ctrl+Z undoes; Ctrl+Y or Ctrl+Shift+Z redo; both suppressed via a shared `inputFocused()` helper while focus is in an input/textarea/contenteditable or inside RIGPOWER's shadow root (checked via `shadowRoot.activeElement`). Topbar ↶/↷ buttons (`#btnUndo`/`#btnRedo`) mirror stack state through `disabled` attributes, with tooltips that are explicit about scope. Runtime-only — never persisted, no `migrate()` footprint.

**Scope decision (Lighting):** RIGPOWER's edits reach `S.lighting` via `script4.js`'s debounced (300ms) shadow-root sync bridge, which calls `save()` only — never `commit()` — so keystroke-level Lighting edits do not get their own undo step (hooking a JSON-diff into that debounced listener was judged too risky/expensive). However `S.lighting` **is** one of the fields in the structural snapshot, and switching the topbar tab into or out of Lighting already calls `commit()`, so Lighting state as of the last tab switch is captured and restorable like everything else. Net effect: full-featured undo/redo for Racks/Routing/Rig/Library edits; Lighting edits are undoable at tab-switch granularity, not keystroke granularity — the button tooltips say this plainly.

### F2 — Signal path trace highlight (Routing + Rig canvases)

A topbar "⚡ Trace" toggle (`#btnTrace`) + keyboard shortcut `T` (same input-focus suppression as F1, and only active on Routing/Rig views — switching to a different view auto-disarms an active trace) arm trace mode. While armed, clicking a device node or cable computes the connected component via `traceComponent(startDevId)` — a plain BFS across `S.connections`, devices ↔ cables, transitively — and stores it in module-level `TRACE_MEMBERS = {devs:Set, conns:Set}`. `buildNode()`/`drawWires()` (and the Rig view's `buildRackGroup()`/`buildRackNode()`) read `TRACE_MEMBERS` while constructing their markup and bake `trace-hi`/`trace-dim` classes straight in — this is what makes highlighting survive every `drawWires()` redraw during a drag, with no separate DOM-walk/reapply pass needed. Clicking another element retraces; **Escape clears the active trace and disarms trace mode**; re-clicking the Trace button also disarms and clears. Trace mode takes over click handling only while armed (`node.addEventListener("click")` and the canvas background's click-away handler both branch on `TRACE_ARMED` first) — normal click-to-select/MSEL is completely unaffected when trace mode is off.

### F3 — PNG/SVG elevation export (Racks view)

Per-rack "Export SVG" / "Export PNG" buttons sit next to the existing rack-settings controls in the Racks side panel. Front/rear elevations are plain HTML/CSS (`buildRackEl`), not SVG, so `rackElevationSVGString(rack, face)` builds the elevation off-screen, bakes every element's *computed* style into an inline `style` attribute via `inlineComputedStyles()` (CSS custom properties/theme vars don't resolve inside a standalone `.svg` opened outside this document), then wraps the cloned markup in an SVG `<foreignObject>`. Left/Right side views are already real SVG (`sideSVG`) and are used as-is via `resolveExportFace()`. `exportRackSVG()` serializes that string straight to a `.svg` Blob download; `exportRackPNG()` loads the same SVG string into an `<Image>` (via a blob URL), draws it onto a canvas at 2x scale, and reads back a PNG blob. Filenames: `"<rack name> <face>.svg/.png"` (`safeFileName()` strips filesystem-illegal characters). Known jsdom gap: canvas rasterization can't be meaningfully unit-tested (no real image decoder in jsdom, and jsdom doesn't implement `URL.createObjectURL` at all) — `test_elevation_export.js` verifies the SVG serialization path in full and confirms the export functions exist and don't throw synchronously when invoked with the minimum browser APIs stubbed; actual pixel output needs a manual browser spot-check.

### F4 — Cable Labels CSV (P-touch)

A "Cable Labels CSV" button sits next to the existing schedule-CSV export. `cableLabelsCSV()` emits one row per `S.connections` entry: `Label, From, To, Type, Length, Color`, where From/To are `"Rack/Device:Port"` (or `"Edge/Device:Port"` for edge devices) strings resolved from each connection's `{dev,g,i}` refs via `findDev()`/`portLabel()`. The Label column uses the connection's own label if set, else synthesizes `"From → To"`. Dangling refs (a deleted device) are skipped rather than crashing, with the skipped count reported in the export toast. Output is CRLF-terminated, every field quoted, UTF-8 with a leading BOM (`﻿`) so Brother P-touch Editor's CSV import reliably auto-detects UTF-8 instead of falling back to a legacy codepage. Filename: `"<rig name> - cable labels.csv"`.

**Scope decision (Lighting inclusion):** rack/routing `S.connections` only — the unified schedule CSV (`scheduleCSV()`) can fold lighting in via `lightingCSVRows()` because that function already emits fully-formatted summary rows (phase loads, multicable builds) in the same column shape as the rack section, but cable labels need the opposite: discrete per-run endpoints resolved from raw connection refs. RIGPOWER's lighting-side data model (positions/multis/circuits/slots) has no per-cable-run `{dev,g,i}`-style connection object to resolve the same way — synthesizing one would mean building a second, parallel resolution path against a totally different shape, not "cheap" by the brief's own test, so lighting cable runs are deliberately out of scope for this export.

### F5 — routingSVG() BiDi bucketing fix (deferred item from Phase 2)

The static Rack Guide PDF's port-layout renderer (`routingSVG()`) still bucketed `dir==="bi"` ports together with `"in"` ports even after Part C moved BiDi ports to their own zone on the interactive canvas. Fixed: each device box in the PDF's SVG now reserves a bottom band for BiDi ports (dashed separator, "BiDi" label, ports laid out in a wrapping grid sized to the box width) instead of lumping them in with the left-column "in" ports, mirroring the canvas's `.node-ports-bottom` semantics. `pinPos()` (the PDF-SVG's connection-endpoint resolver) updated to route BiDi refs into the new band.

### Tests

`test_suite_v6.5/` = the 16 files present at the start of this session (11 v6.4 carryovers + 5 phase-2 files) plus 4 new feature files: `test_undo_redo.js` (28 assertions, F1 — push/undo/redo cycle, non-structural commits don't grow the stack, undo leaves `S.ui` untouched, redo-stack-clears-on-new-commit, ~50-entry cap, Ctrl+Z/Y/Shift+Z, suppression in inputs/textarea/contenteditable/RIGPOWER shadow root), `test_trace_highlight.js` (35, F2 — BFS component computation, arm/disarm via button and `T`, click-to-trace on nodes and cables, retrace updates highlight set, `drawWires()` reapplies classes on redraw, Escape behavior, view-switch auto-disarm, click-to-select unaffected when disarmed), `test_elevation_export.js` (29, F3 + F5 folded in — SVG serialization structure, computed-style inlining, left/right delegation to `sideSVG()`, `resolveExportFace()`/`safeFileName()` unit behavior, export-function-exists-and-doesn't-throw with jsdom's `URL.createObjectURL` gap stubbed, plus F5's BiDi-band assertions against `routingSVG()`), `test_cable_labels_csv.js` (28, F4 — header/CSV shape, CRLF + full quoting, From/To resolution incl. edge devices and multi-count ports, label synthesis, dangling-ref skip + toast count, BOM + MIME type, filename format, "Nothing to export" guard). Total: **334 assertions, all passing** against the checkpointed build, zero regressions in the pre-existing suite.

## v6.6 — orthogonal wire routing, touch-drag repositioning, per-rack power circuits

Checkpoint: `DLux Rackmaster 914AM 071426.html` (md5 `4c98346d4a85c2ee8c3988ffc34b2633`, 1,088,786 bytes). Intermediate checkpoint (G1+G2+G3 code landed, pre new-test-files): `DLux Rackmaster 904AM 071426.html` (md5 `421f1ed73a0c48307eeebcff2d00da54`, 1,087,692 bytes). Test suite: `test_suite_v6.6/` — the 20 pre-existing v6.5 files plus 3 new feature files, 442 assertions total, all green against the final checkpoint. Three user-approved backlog items shipped this session: orthogonal wire routing, touch-drag repositioning of already-placed devices, and per-rack power circuits + load.

### G1 — Orthogonal wire routing (Routing + Rig canvases)

A topbar segmented control (`#wireStyleSeg`, next to the Trace button) toggles `S.ui.wireStyle` between `"curved"` (default) and `"orthogonal"`. `wirePath(a, b, connId)` now dispatches on the toggle: the curved branch (`wirePathCurved()`) is the untouched original Bézier-with-stub body — byte-for-byte identical output to pre-v6.6 — and a new `wirePathOrthogonal()` builds an axis-aligned route: the same port-exit stub as curved mode, then an H/V/H elbow (or a single straight run when both stubs land at the same height) to the destination stub, with small (~6px) rounded corners via quadratic Bézier arcs (`roundedPolylinePath()`). Parallel cables sharing a corridor get a small deterministic lateral stagger on the elbow's midpoint X — `connHash(connId)` (a simple string hash) feeds `(hash % 5 - 2) * 8`, giving a repeatable ±16px spread in 8px steps per connection id, cheap enough to recompute every `drawWires()` tick during a drag. Casing+wire two-path pairs, hover/selected states, trace highlight classes, and click-to-select all work identically in both modes since they're layered on top of whichever `d` attribute `wirePath()` returns — no changes needed to `drawWires()`'s rendering logic beyond passing `c.id` through. `migrate()` backfills `S.ui.wireStyle` to `"curved"` for any pre-v6.6 project.

### G2(a) — Long-press touch-drag repositioning of already-placed rack devices

v6.4 added touch placement of *new* devices (tap-to-arm a palette template, tap an empty slot); repositioning an already-placed device was still desktop-drag-only. `createRepositionFSM(cfg)` is a small, timer-free pure state machine (`idle → armed → lifted → idle`) built specifically to be testable with synthesized PointerEvents under jsdom without waiting on real `setTimeout` delays — its `timerFire()` method is caller-driven rather than owning its own timer. Production wiring (`wireDevReposition()`, called from `buildDevEl()`) gates on `e.pointerType === "touch"` so desktop mouse/pen users keep the existing HTML5 drag-and-drop and plain-click-to-select paths completely untouched, and skips out if a palette tap-to-place (`ARMED_TPL`) is already in progress. On a real touch: pointerdown arms the gesture and starts a 350ms timer; movement past 8px before the timer fires cancels (treated as a scroll — the handler never calls `preventDefault()` during this phase, so native one-finger panning/scrolling of the rack view is unaffected); the timer firing while still armed lifts the device (dims the original slot via a `.repo-ghost-src` class, spawns a floating `.dev-repo-ghost` with a slight scale/shadow); subsequent pointermove events update the ghost's position and, once the pointer is over a `.rack-inner`, resolve a candidate U/side via the same math `buildRackEl`'s native-drag `dragover` handler already uses, validating live with `canPlace()` (ghost gets a `.bad` outline when the candidate spot is blocked). On drop: a valid candidate commits the move (`d.pos`/`d.side` mutated, `commit()`); an invalid one toasts `blockMsg()`'s reason and the device silently returns to its origin (it was never mutated during the drag, so "return to origin" needs no extra code); dropping outside any rack slot does the same. Escape cancels an in-progress lift via a small module-level `REPO_ACTIVE` handle. On the Routing/Rig canvas, node/rack-group/rack-node header drag was already Pointer-Events-based since v6.3 (`startGroupDrag`) — the one real gap found was a missing `touch-action:none` on the drag handles (`.node-head`, `.rg-head`), the CSS-side mechanism browsers use to reliably suppress native touch-scroll for a gesture starting on a small drag handle (more reliable than relying solely on `pointerdown`'s `preventDefault()`); added to both. Per handoff §7, real touch *feel* (long-press timing, accidental-scroll disambiguation) can't be meaningfully verified under jsdom's non-layout engine — `test_touch_reposition.js` exhaustively covers the state machine's arm/cancel-on-move/lift/drop/release-early/external-cancel transitions and boundary thresholds synchronously, plus a DOM-wiring smoke test confirming the touch-gated listener doesn't throw and doesn't fire on mouse pointers; the full arm→lift→drag→drop-commits path needs a manual spot-check on a real touch device or Chrome DevTools' touch emulation (flagged, not skipped).

### G3 — Per-rack power circuits + load

Data model: `rack.circuits[] = { id, name, amps /*breaker, default 20*/, volts /*default 120*/ }`; device instances and library templates both gain `draw` (watts, `null` = unknown); device instances additionally gain `circuit` (a circuit id within the parent rack, or `null` = unassigned). `migrate()` backfills all three, including healing a dangling `circuit` reference (an old save pointing at a since-deleted circuit) back to `null`, and `instantiate()` carries a template's `draw` forward to new instances (`circuit` always starts unassigned). Existing `fields[]` custom key/value data is untouched. Three helper functions do the load math: `circuitLoad(rack, circuitId)` sums `draw` across every device in the rack assigned to that circuit (a `null` draw contributes 0, not `NaN`); `circuitCapacityW(c)` = `amps × volts`; `circuitPct(rack, c)` = load/capacity; `circuitLoadClass(pct)` returns `"ok"` / `"warn"` (≥80%) / `"over"` (>100%, strictly). **Rack panel** (Racks view side panel): a new "Power circuits" section lists each circuit with inline name/amps/volts editors, a delete button, and a load bar (`.circuit-load-bar`/`.circuit-load-fill`, colored via the already-theme-aware `--ok`/`--amber`/`--danger` CSS vars — no new theme plumbing needed). Deleting a circuit unassigns every device that referenced it and toasts the count. **Device Inspector:** both inspector surfaces in the app gained the fields — the Racks-view Inspector (`renderInspector`, rack devices only, since edge devices were never selectable there) and the Routing/Rig canvas's side-panel device editor (`#rtDevEd`, the *only* surface that ever shows an edge device) — each got a "Power draw (W)" number input, wired with the oninput-mutate-only/onchange-render split the render-in-`oninput` rule requires, and a "Circuit" dropdown listing the parent rack's circuits (omitted entirely for edge devices, which have no parent rack). **Rig Check** gained three new checks under a "Rack Power" scope: circuit overload (>100% load → error, ≥80% → warning) and a powered device (`draw > 0`) with no circuit assigned (→ info), formatted identically to every other Rig Check finding. **Schedule CSV:** `scheduleCSV()`'s existing one-row-per-cable structure already had a natural per-endpoint slot, so four columns were added (`From Circuit`, `From Draw (W)`, `To Circuit`, `To Draw (W)`) rather than restructuring the export — `devCircuitInfo()` resolves each connection endpoint's circuit name (blank for edge devices or unassigned) and draw value.

### Tests

`test_suite_v6.6/` = the 20 files carried over from `test_suite_v6.5/` (unchanged) plus 3 new files: `test_orthogonal_wires.js` (26 assertions — `migrate()` default + backfill, curved mode delegates byte-for-byte to the untouched original path, orthogonal paths parsed and asserted axis-aligned via a small SVG-path-command parser, `connHash()` determinism, end-to-end `drawWires()` casing/hover/selected/trace/click-to-select parity in both modes, topbar toggle + persistence), `test_touch_reposition.js` (30 — the full `createRepositionFSM` transition table including exact-threshold boundaries, stale-timer no-ops, external cancel, custom thresholds, plus a DOM smoke test confirming touch-gating doesn't interfere with mouse input; explicitly flags the real-touch-feel jsdom gap per handoff §7), `test_power_circuits.js` (52 — migrate backfill incl. dangling-circuit-ref healing, load math incl. the 80%/100% thresholds, circuit CRUD + delete-unassigns-devices + toast, both Device Inspector surfaces' fields incl. the oninput/onchange split and the edge-device exclusion, Rig Check overload/warning/info messages, schedule CSV's new columns). Total: **442 assertions, all passing** against the checkpointed build, zero regressions in the pre-existing suite. (One authoring note for future sessions: this environment's file-write/edit tooling silently truncated `test_power_circuits.js` mid-line on two separate save attempts despite reporting success — including once on a freshly-authored file, not just an in-place edit — consistent with prior sessions' documented sandbox/mount sync caution; the fix was writing the file via a quoted bash heredoc and immediately verifying with `node -c` + `wc -c`, which finally produced a byte-stable file. Worth remembering that this failure mode isn't limited to *editing* existing files.)


## v6.6.1 — tidy bus lanes (replaces v6.6 G1's per-cable hash stagger)

Same-day, tightly-scoped follow-up per §6 convention. The user rejected v6.6 G1's per-cable
`connHash()`-based ±16px lateral stagger on orthogonal wire corridors — with several parallel cables
in the same corridor, the deterministic-but-arbitrary per-id offsets read as random jitter rather than
an intentional layout. Approved replacement: tidy bus lanes (ConnectCAD/schematic style) — cables
sharing a corridor get evenly spaced parallel lanes, sorted to minimize the visual mess of the common
fan patterns. No obstacle avoidance — lanes-only was the explicit scope, chosen deliberately over a
full routing-around-devices system.

Checkpoint: `DLux Rackmaster 211PM 071426.html` (md5 `de130ad30d513a010c3769c6e271af06`,
1,092,406 bytes). Test suite: `test_suite_v6.6/` (unchanged file set) — `test_orthogonal_wires.js`
grew from 23 to 41 assertions; full suite total **457 assertions, all green**, zero regressions.

### The algorithm

`connHash()` is gone entirely — it fed nothing else in the codebase. In its place, `drawWires()`
(script0.js) now runs a **global lane-assignment pass** before building any path string, since it
already iterates every connection each redraw and has the full picture:

1. A pre-pass resolves every visible, resolvable connection's endpoints (`pinCenter()` for both ends)
   into an `items[]` array — unchanged from before, just hoisted out of the per-cable loop body.
2. In orthogonal mode only, each item is reduced to `{ id, prefX, srcY, destY, needsCorridor }` via the
   shared `wireStubPts(a, b)` helper (factored out of the old `wirePathOrthogonal()` body so both the
   lane pass and the path-builder compute the identical stub points) — `prefX` is the midpoint between
   the source and destination stub ends (the same corridor x the old code used for its unstaggered
   midpoint), and `needsCorridor` is `true` only when the stubs don't already share a height (mirrors
   the existing "already on the same horizontal run -- no elbow needed" branch).
3. `assignWireLanes(entries)` buckets entries by `wireCorridorKey(prefX)` — `Math.round(prefX / 24)`,
   i.e. a ~24px quantization band — so cables whose preferred corridor lands within roughly the same
   24px strip are grouped as one bus.
4. Each group is sorted deterministically: destination y ascending, then source y, then connection id
   as a final tiebreak — never iteration/draw order — which is what keeps the common fan-out/fan-in
   patterns crossing-free-looking without any actual crossing-minimization search.
5. Lanes are assigned evenly spaced at `WIRE_LANE_GAP` (8px) apart, centered on the group's average
   `prefX` (rounded to a whole pixel for clean coordinates) — `centerX + (i - (n-1)/2) * 8` for the
   i-th cable in sorted order — producing a neat centered band instead of a directionless spread.
6. The resulting `Map<connId, laneX>` is passed into `wirePath()`/`wirePathOrthogonal()` as an explicit
   optional 4th/5th `laneX` argument. When present, it's used verbatim as the corridor mid-run x; when
   absent (ghost-wire preview during a pending connection drag, or a direct/ad hoc call with no
   `drawWires()` pass behind it) the function falls back to the plain unstaggered `(sa.x+sb.x)/2`
   midpoint — deterministic, just not lane-grouped, which is correct for a single line with no siblings
   to bus alongside.

Bottom-exit BiDi stubs (`portExitDir()`'s `"down"` case) flow through the same `wireStubPts()` call as
left/right-exit ports, so all three v6.5/v6.6 exit directions are handled without special-casing.

**Determinism / no frame-to-frame swapping:** grouping and ordering are pure functions of each
connection's own geometry (`prefX`/`srcY`/`destY`) and its `id` — never the order connections appear
in `S.connections` or the order `drawWires()` happens to iterate them — so redrawing an unchanged
topology (e.g. every tick of an unrelated drag elsewhere on the canvas) produces byte-identical path
`d` strings. Only a connection whose own endpoint actually moves changes its `prefX`/`destY` and
therefore potentially its bucket/lane; unrelated cables in the same or a different corridor are
unaffected. Verified directly: `assignWireLanes()` given the same entries in shuffled array order
returns an identical `Map`, and calling `drawWires()` twice in a row with no state change yields
identical path strings both in the unit-level sanity check and in `test_orthogonal_wires.js`.

**Horizontal-run lanes: scoped out, documented, not an oversight.** The spec allowed applying the same
y-band grouping to shared horizontal mid-segments "if trivially reachable." This geometry doesn't
produce any — the only path shape with no vertical corridor is the direct stub-to-stub case
(`sa.y === sb.y`), which is a single straight line at its own fixed y with no elbow and thus no
mid-run x to bucket in the first place. There is no analogous "several cables share one horizontal
mid-run" shape in the current routing to lane. Left as a documented non-issue rather than building
unused machinery.

### Sanity-check numbers (from the ad hoc jsdom render dump, see below)

Direct `assignWireLanes()` call with 6 synthetic same-corridor entries (`prefX` 198–202, destY
100–600) plus a 7th entry far away (`prefX` 900) and an 8th flat/non-corridor entry: lane x values
came back `[180, 188, 196, 204, 212, 220]` in destY order — spacing exactly 8px throughout, all six
values unique, centered on 200 (the group's average `prefX`), and the far entry got its own lane
(900) rather than being folded into the band; the flat entry was excluded (`undefined`) as expected.

A full `render()` + `drawWires()` pass (6 output ports on one console fanning out to 6 separate amps,
`getBoundingClientRect` mocked per-pin since jsdom has no layout engine) produced corridor x values
`[235, 243, 251, 259, 267, 275]` across `conn0`–`conn5` — again unique, sorted in destY order, and
evenly spaced 8px apart end to end; every path's `d` string parsed cleanly against the M/L/Q path
grammar, and a second `drawWires()` call with nothing changed reproduced byte-identical `d` strings.

### Tests

`test_orthogonal_wires.js` was rewritten in place (23 → 41 assertions, same file, no new file needed
— everything else in `test_suite_v6.6/` was untouched): the three connHash-specific assertions
(stagger determinism via `connHash()`, hash inequality/stability) were replaced with — `wirePathOrthogonal()`
with no `laneX` is deterministic and no longer varies by `connId` at all (plain geometric midpoint,
confirmed `connHash` is `typeof undefined`, i.e. removed); an explicit `laneX` is honored verbatim;
`assignWireLanes()`'s grouping/sort/even-spacing/centering/separate-corridor/non-corridor-exclusion
behavior via direct synthetic-entry calls; order-independence (shuffled input array, identical output);
`wirePath()` forwards `laneX` through to `wirePathOrthogonal()` when dispatching; and a full end-to-end
corridor test through the real `render()`+`drawWires()` pipeline with mocked pin geometry, including
the redraw-stability check. All pre-existing curved-mode-unchanged, axis-alignment, casing/hover/
selected/trace/click-to-select-in-both-modes, and topbar-toggle-persistence assertions were kept as-is.
Full suite (23 files, run individually per handoff §7's sandbox-timeout note): **457 assertions, all
green**, zero regressions.

**v6.6.1 follow-up tweak (same day):** per user feedback after visual review, lane spacing `WIRE_LANE_GAP` increased 8px → 14px and port exit-stub length `STUB` 18px → 28px, then → 42px after edge-case collisions at 28 (applies to both curved and orthogonal modes, so wires leave devices with more clearance). Builds: `DLux Rackmaster 218PM 071426.html`, then the 42px stub build (see newest timestamp).


## v6.6.2 — node-aware orthogonal routing (avoid device bodies)

Same-day-scope follow-up to v6.6.1 per §6 convention, user-approved after two rounds of `STUB`-length
increases (28px → 42px, see the v6.6.1 follow-up tweak above) still didn't stop orthogonal wires from
visually crossing straight through device node bodies in close/dense layouts — a longer stub only pushes
the *first* segment clear of a cable's own endpoint, it does nothing about a *third* device sitting in the
corridor or jog path between two other devices. Decision: orthogonal mode now **always** avoids node
bodies — no extra toggle, no opt-out. Curved mode is completely untouched (byte-identical, as always).

Checkpoint: `DLux Rackmaster 453PM 071426.html` (md5 `9a2d9cd190f29a3d6d63029bf6858c17`,
1,102,613 bytes). Test suite: `test_suite_v6.6/` (unchanged file set) — `test_orthogonal_wires.js` grew
from 41 to 65 assertions; full suite total **481 assertions, all green**, zero regressions across all 23
files (each run individually per handoff §7's sandbox-timeout note).

### The algorithm

Obstacles are the **live rendered DOM rects** of every visible device node (`.node`) and collapsed rack
container (`.rack-node`) under `#routeInner` — not a re-derivation from `d.rx/d.ry` + an estimated
width/height. `collectNodeObstacles()` queries them directly and converts each rect to canvas space the
same `getBoundingClientRect()` → `(rect - innerRect) / zoom` way `pinCenter()` already does, then inflates
by `WIRE_CLEARANCE` (10px). This choice makes the feature naturally environment-safe: any test (or a
real page before `#routeInner` exists) that hasn't laid the DOM out yields an empty obstacle list, so
every avoidance function becomes a provable no-op and the pre-v6.6.2 geometry reproduces exactly — this
is what kept all 41 pre-existing `test_orthogonal_wires.js` assertions green with zero changes.

`drawWires()` collects obstacles once per redraw into a module-level cache (`WIRE_OBSTACLES`), read by
every cable via `getWireObstacles()` (falls back to a fresh `collectNodeObstacles()` call for a direct/
unit call or the ghost-wire preview with no `drawWires()` pass behind it) — obstacle collection is
O(nodes) once per redraw, not once per cable, keeping the whole pass close to the target
O(cables × obstacles) with no grid/A* needed at this scale.

1. **Corridor placement** (`pickCorridorX(prefX, y1, y2, obstacles)`): if the preferred vertical corridor
   x would intersect an obstacle across the run's y-range, candidate x's are gathered from every relevant
   obstacle's edges (±0.5px) that spans that y-range, sorted nearest-to-`prefX` first, tested up to
   `WIRE_MAX_CORRIDOR_CANDIDATES` (16) and the first clear one wins; if nothing clears within budget it
   falls back to the original preferred x (never crashes, just doesn't dodge).
2. **Horizontal detours** (`routeHorizontalAvoiding(p1, p2, obstacles, budget)`): any horizontal run
   (the same-height direct case, or either corridor-side jog) that crosses an obstacle gets a 4-point
   rectangular detour over the top or under the bottom edge — `findHorizontalBlocker()` picks the nearest
   blocker in travel direction, then the shorter of `|y - top|` vs `|y - bottom|` decides which side.
   `budget` is a small mutable `{n}` counter shared across *both* of one cable's corridor-side jogs (or
   the single direct run), capped at `WIRE_MAX_DETOURS` (4); once spent, any remaining blocked stretch is
   left as a straight, unrouted line rather than looping or throwing — confirmed with a deliberately
   unroutable obstacle (spans ±100000px) in the new tests: no exception, a wire path string is still
   produced.
3. **Endpoint exemption:** a cable's short port→stub segment (`a`→`sa`, `sb`→`b`) is **never** obstacle-
   checked at all — `STUB` (42px) already clears a node's own ~190px-wide body once past its edge, and the
   wire is expected to touch its own endpoint there. Every other segment — the corridor's vertical run and
   both horizontal jogs, or the direct run when the stubs already share a height — is checked against the
   **full** obstacle list, including the cable's own two endpoint nodes, per spec: an unusually short stub
   against a tall/wide node (or a corridor approaching a port from the "wrong" side, forcing a detour
   around the device's own body to reach its own port correctly) still gets routed around.
4. **Lanes, now avoidance-aware:** `drawWires()` runs `pickCorridorX()` per connection *before* handing
   `prefX` to `assignWireLanes()`, so a corridor an obstacle pushed sideways still buckets/sorts/spaces
   correctly at its shifted location, not its raw geometric midpoint. `assignWireLanes(entries, obstacles)`
   gained an optional second parameter (omit it entirely and behavior is byte-identical to v6.6.1 — this
   is what kept the two direct-call unit tests in the existing suite green unchanged): when obstacles are
   supplied, each group's lane band is clamped to the clear x-gap at that corridor (`gapBoundsAt()`), and
   spacing compresses below `WIRE_LANE_GAP` (14px) if the gap is narrower than the group's natural band,
   so a lane offset can never land back inside an obstacle.
5. **Determinism:** grouping/ordering/candidate-selection are all pure functions of each connection's own
   geometry and id (`findHorizontalBlocker()`'s nearest-blocker tiebreak, `pickCorridorX()`'s sorted
   candidate list) — never DOM query iteration order — so redrawing an unchanged topology with avoidance
   active still produces byte-identical path `d` strings, verified end-to-end in the new tests with two
   consecutive `drawWires()` calls against a dense 3-device column layout.

### Sanity-check evidence

An ad hoc jsdom script (development-time only, not part of the checked-in suite) built three dense
layouts — a device directly between two connected devices (horizontal block), devices flanking a
corridor with a blocker in between (vertical block), and a 6-cable fan sharing a corridor next to a
blocking node — rendered them through the real `render()`/`drawWires()` pipeline with mocked
`getBoundingClientRect()`, and asserted no rendered mid-run segment (excluding the two endpoint stub
segments) intersects any inflated obstacle rect: **114 mid-run segments checked across 8 cables against
14 obstacles, zero intersections.** The first iteration of the fan scenario *did* fail (20 violations) —
the blocker was placed so its inflated rect overlapped the destination stubs' own anchor points, an
unsolvable layout by construction, not an algorithm bug — fixed by widening the margins in the test
layout, at which point it passed clean. The dense-column scenario (`test_orthogonal_wires.js` §13f) is
the permanent regression version of this check, run against the real checkpointed build every time the
suite runs.

### Tests

`test_orthogonal_wires.js` grew from 41 to 65 assertions (all pre-existing ones kept, none needed
updating — see above for why): `pickCorridorX()` corridor-shift-to-nearest-clear-candidate and no-op
when already clear; `routeHorizontalAvoiding()`'s over-top vs. under-bottom shorter-jog choice and
per-obstacle budget consumption; `wirePathOrthogonal()` producing a real vertical detour excursion with
a third-party obstacle present vs. staying flat at y=0 with none; a deliberately unroutable (whole-width)
obstacle producing no exception and a still-valid path string; `assignWireLanes()` lane-spacing
compression inside a narrow gap (with a boundary-touching-is-clear convention check matching
`obstacleBlocksVerticalSeg()`'s own strict-inequality semantics) vs. unchanged 14px spacing with the
obstacles argument omitted; and an end-to-end dense 3-device-column redraw-determinism + zero-
intersection check through the real pipeline. Full suite (23 files, run individually): **481 assertions,
all green**, zero regressions in the pre-existing 457.


## v6.7 — orthogonal-wire backtrack fix, Export menu, Lighting Summary split, per-rack Rack Guide

Three-part session: one rendering bugfix (user-reported screenshot) and one UI/export reorganization
(user-requested), both landing together as v6.7.

### Part 1 — bugfix: orthogonal wire "T" artifact

User screenshot: an Edison power cable in Routing view (orthogonal mode), running from a Netgear
switch's left-side "Power" port down to a Rack PDU's left-side "Main In" port (PDU below-left of the
switch), visibly split into a "T" near the PDU's top edge — a short spur tailing toward the PDU's top
while the main run continued around to Main In.

**Reproduction:** a purpose-built jsdom sweep (`repro_t_artifact.js`, adapted into
`test_orthogonal_wires.js` §14) generated two devices, both with left-facing ports, the lower one below
at varying x offsets, and dumped `wirePathOrthogonal()`'s path `d` for each. The very first geometry
tried (dest below-left, modest offset) reproduced it immediately; a full grid sweep (11 dx values × 4 dy
values × 3 device-size pairs) found **17,472 of the swept combinations produced the artifact** before the
fix — this was not a rare edge case, it was the common case for same-direction ports at an x offset.

**Root cause (confirmed by direct instrumentation, not just inference):** `wirePathOrthogonal()`'s
mid-run vertical corridor x used the plain `(sa.x + sb.x) / 2` midpoint of the two port stubs, with no
awareness of which side of its own stub a "left"/"right"-facing port must be approached from. Example
from the actual debug trace: source `a=(300,140,dir:left)`, dest `b=(260,240,dir:left)`. Stubs:
`sa=(258,140)`, `sb=(218,240)`. Midpoint `rawX = 238`. Since `238 > sb.x (218)`, the path had to travel
**left** from the corridor to reach the stub (238→218), then **right** all the way past 238 again to
reach the actual port at 260 — a genuine 180° backtrack. This happened with **zero obstacles present**
(both `routeHorizontalAvoiding()` calls returned empty) — a pure geometry bug in the corridor-x formula,
not an obstacle-avoidance interaction as originally speculated.

**Fix, cause level:** new `corridorXRange(sa, aDir, sb, bDir)` computes the valid x-range that keeps the
final approach into each horizontally-exiting stub monotonic (`dir:"left"` → corridor x must be ≤ the
stub's x; `dir:"right"` → ≥; `dir:"down"`/BiDi stubs don't move in x, no constraint). `clampCorridorX()`
clamps the preferred corridor x into that range — applied both *before* `pickCorridorX()`'s
obstacle-avoidance shift (so the search starts from a valid geometry) and *after* it (since obstacle
avoidance can otherwise push the corridor back out of the monotonic zone). Wired into both
`wirePathOrthogonal()` and `drawWires()`'s lane-bucketing `prefX` computation.

**Fix, polyline level (safety net):** new `collapseCollinear(pts)` runs after `dedupeAdjacent()` and
before `roundedPolylinePath()` — merges any three consecutive axis-aligned-collinear points (A,B,C, all
on one horizontal or vertical line) down to the outer two, dropping B. One rule handles both spec
patterns at once: redundant same-direction waypoints collapse harmlessly, and genuine backtrack/reversal
triples (A→B→C where the two segments are collinear but opposite-direction) collapse the same way,
which is what eliminates the overlapping "spur" — a legitimate obstacle detour from
`routeHorizontalAvoiding()` always adds a *perpendicular* jog, so it's never collinear with its
neighbors and is never touched by this pass.

**Tests:** `test_orthogonal_wires.js` §14 (196 new assertions, 65 → 261 total in that file) — a
44-layout adversarial sweep (both ports left-facing, destination below at 11 x-offsets × 4 y-offsets,
each with real obstacle rects for both devices' own bodies), the exact screenshot geometry
(switch-Power → PDU-Main-In), four mixed-direction cases (left→right, right→left, down→left, and
destination-above-source), and an end-to-end render()/drawWires() pipeline test of the literal
screenshot topology. Every case asserts: no overlapping collinear segments, no consecutive-segment 180°
reversal (dot product < −0.95), axis-alignment preserved, and (where obstacles are supplied) zero
mid-run/obstacle intersections — matching the v6.6.2 assertion style. One test-authoring gotcha hit and
fixed along the way: naively checking distance between *rendered* (rounded-corner) waypoints falsely
flagged the intentionally non-axis-aligned arc-traversal as a "diagonal" — fixed by reconstructing the
true pre-rounding polyline points from the SVG path's own `Q` command control points (which are exactly
the original corner coordinates) before running the structural checks.

### Part 2 — topbar Export ▾ dropdown menu

The topbar had five separate export-related buttons (Cable CSV, Cable Labels CSV, Rack Guide PDF,
Export Project, plus the paired Import) crowding it alongside Save/Undo/Redo/Trace/wire-style/Rig Check.
Consolidated into one `Export ▾` button (`#btnExportMenu`) opening an anchored `#exportMenuPanel`
dropdown, grouped with separators: **Project** (Export Project .dlux.json), **Schedules** (Cable
Schedule CSV, Cable Labels CSV), **Guides & Summaries** (Rack Guide PDF…, Lighting Summary PDF).
Save/Undo/Redo/Trace/wire-style toggle/Rig Check all stayed on the topbar untouched, per spec. Import
stayed put too (not an export action, and not tightly paired positionally with Export Project in the
original layout, so no reason to relocate it).

Vanilla JS/CSS, no framework: click toggles the panel (`openExportMenu()`/`closeExportMenu()`), outside
click closes it (delegated `document` click listener checking `!dm.contains(e.target)`), Escape closes
it via an extension of the *same* global Escape handler v6.5 introduced for `<dialog>`/floating-panel
close (checked first, before the dialog case), and arrow keys + Home/End/wraparound move focus among
`.dropmenu-item` buttons (`role="menu"`/`role="menuitem"`, `aria-haspopup`/`aria-expanded` on the
trigger). Both themes work via the existing `--panel`/`--line`/`--ink`/`--accent-soft`/`--shadow` CSS
variables — no new theme bridge needed. Elevation SVG/PNG export was confirmed to already live per-rack
in the Racks panel (`#rkExpSvg`/`#rkExpPng`) and was deliberately **not** duplicated into the menu.

### Part 3 — Lighting Summary split + per-rack Rack Guide scope

1. **Lighting Summary, new standalone export.** The lighting section that used to be embedded in the
   Rack Guide (v6.1: phase load, power-by-position, multicable/DMX/data pick list, DMX universe usage)
   is now its own export (`lightingSummaryHTML()`/`openLightingSummary()`), reusing
   `lightingReportHTML()` verbatim for the content (full parity — same data, same tables) with its own
   cover page/title and the same print-window→PDF mechanism as the Rack Guide (`window.open` +
   `document.write`; the pop-up-blocker quirk is accepted per handoff §10, unchanged).
2. **Removed from the Rack Guide entirely.** `reportHTML()` no longer calls `lightingReportHTML()` at
   all — the "Signal flow diagram" section's heading number, which previously accounted for the
   lighting section's offset (`S.racks.length + 2 + lgSecCount()`), simplified back to
   `S.racks.length + 2`.
3. **Per-rack Rack Guide scope.** `reportHTML()` gained an optional `scopeRackId` parameter; when set,
   the output is a standalone document containing only that one rack's own section (elevations,
   build order, cabling checklist, device configuration sheets) — no system-wide "System overview" or
   "Signal flow diagram" sections, and (like the all-racks case) no lighting content. Wired into the
   Export menu: clicking "Rack Guide PDF…" opens a small `<dialog id="rackGuideScopeDlg">` (reusing the
   existing `pickerDlg`-style pattern — `.lib-item` rows, `dlg.showModal()`, backdrop-click-to-close)
   listing "All racks" plus one entry per rack; choosing one calls `openReport(scopeId)`.

Shared CSS between the Rack Guide and Lighting Summary print documents was factored into
`reportStyleBlock()` to avoid duplicating/drifting the print stylesheet across the two exports.

Terminology check: no new UI copy introduced "jacks" or "Bi" — all new labels use "ports"/"BiDi"
conventions already established.

### Tests, checkpoint

`test_suite_v6.7/`: copied all v6.6 files verbatim (no self-references needed updating —
`run_all.js` auto-detects the newest build generically) plus two new files:
- `test_export_menu.js` (49 assertions): menu open/close via button toggle, outside-click, and Escape;
  aria attributes; every relocated action present and grouped with separators; elevation SVG/PNG NOT
  duplicated into the menu; Save/Undo/Redo/Trace/wire-style/Rig Check confirmed still on the topbar;
  arrow-key/Home/End keyboard navigation with wraparound; each relocated action still performs its
  underlying export when clicked from the menu.
- `test_summary_split.js` (44 assertions): Lighting Summary contains real phase-load/power-by-position/
  multicable/DMX-universe content; Rack Guide (all-racks) no longer contains any lighting section or
  heading; all-racks parity (system overview, every rack, signal-flow diagram, corrected heading number
  all still present); single-rack scope contains only that rack's own content and nothing from other
  racks or system-wide sections; the scope-choice dialog offers "All racks" + one item per rack and
  routes to the correct scoped output.

`test_orthogonal_wires.js` extended in place (65 → 261 assertions, see Part 1). One pre-existing test
needed updating for the topbar reorganization: `test_cable_labels_csv.js`'s "topbar button wired" check
asserted `#btnCableLabels` existed — updated to assert the relocated `#miCableLabelsCsv` Export-menu
item instead (28 assertions, same count, just re-targeted).

Full suite, run individually per handoff §7's sandbox-timeout note (23 pre-existing files + 2 new):
**770 assertions, all green, zero regressions** against the 481-assertion v6.6.2 baseline.

Checkpoint: `DLux Rackmaster 822PM 071426.html` (md5 `fd2d66ed5ce633e1f9cc28d1d7de926e`,
1,114,911 bytes). `test_suite_v6.7/` copied to the project folder (test files + `run_all.js` only, no
`node_modules`), byte-verified.

## v6.7.1 — orthogonal-wire spur/hugging fix (opposing-direction geometry, reproduced against the user's real project)

Same-day, tightly-scoped bugfix. The v6.7 fix (above) did not fully resolve the reported artifact — the
user's screenshot (Routing view, ~70% zoom) still showed a spur/T tailing from the Netgear M4250's
"Power" port down toward a Rack PDU's "Main In" area, plus the wrap route hugging the PDU's edge with
near-zero clearance instead of the intended ~10px (`WIRE_CLEARANCE`). This time the user's actual project
export (`LX Network racks.dlux.json`) was used as the repro fixture instead of a synthetic sweep.

**Reproduction.** The real project was hydrated in jsdom exactly like the Import Project flow
(`S = data; migrate(); RP.setState(...); resetUndoHistory();`), switched to Routing/orthogonal on the "LX
BOH Rack", and the exact reported connection identified: `5g4kr2v70t`, Rack PDU's "Out" port (dir `out`,
right-facing) → Netgear M4250's "Power" port (dir `in`, left-facing). jsdom has no layout engine, so
`getBoundingClientRect()` was mocked per node using the devices' own **real persisted `rx`/`ry`**
routing-canvas coordinates from the export (PDU `rx≈546, ry≈443`; Netgear `rx≈685, ry≈152` — PDU is
genuinely below-left of the switch, matching the screenshot) and `style.css`'s real `.node{min-width:190px}`.
Dumping the pipeline stage by stage reproduced both symptoms numerically pre-fix: **zero-clearance
hugging** (final rendered mid-run distance to the Netgear node's un-inflated rect measured **4.29px**,
well under the ~10px `WIRE_CLEARANCE` target) confirmed directly; the **spur/backtrack** mechanism was
confirmed by exact-value tracing even though this particular mocked geometry happened to dodge a literal
reversal (see root cause below — the surviving margin was thin enough that a slightly different real
pixel layout would tip it into a literal backtrack, exactly as the user saw).

**Root cause — a second, different gap than v6.7's fix, not another instance of the same one.** v6.7's
`corridorXRange()`/`clampCorridorX()` only handled the case where both ports face the **same** direction
(e.g. two "left" ports at an x offset). This connection hits the **opposing-direction** case: PDU's "Out"
faces right, Netgear's "Power" faces left, and — because of where the two devices actually sit — the
PDU's stub x (≈1095) ends up to the *right* of the Netgear's stub x (≈938). `corridorXRange()` computes
`lo = max(..., sa.x) = 1095`, `hi = min(..., sb.x) = 938`, i.e. **`lo > hi`, an inverted range**. The
pre-v6.7.1 `clampCorridorX()` explicitly punted on this ("no valid monotonic zone, leave unclamped" — see
the old code comment), which let the corridor land in the **forbidden middle** strictly between the two
stubs' own x's. Any corridor there forces at least one stub's own horizontal jog to travel backward past
its own port/edge before turning — for the PDU that backtrack runs directly toward its own "Main In" port
group, which is exactly the spur the user saw. `collapseCollinear()` (v6.7's polyline-level safety net)
only merges a straight 3-point collinear backtrack; once obstacle avoidance turns that backtrack into a
multi-point detour (perpendicular jogs around a node), it's no longer collinear and survives collapse —
this is why v6.7's fix, which only tested same-direction geometry, didn't catch it.

A second, related gap caused the hugging symptom independently: `pickCorridorX()`'s obstacle-clearing
candidates and `routeHorizontalAvoiding()`'s detour Y/enter-X/exit-X all used a bare **0.5px** nudge past
an obstacle's already-`WIRE_CLEARANCE`-inflated edge — nowhere near enough to survive
`roundedPolylinePath()`'s quadratic-corner rounding, which cuts a corner *toward* the obstacle by up to
its radius (`R=6px`) at exactly the waypoint sitting on that edge. Net worst-case clearance on the
**final rendered path** collapsed to ~4px instead of the intended ~10px.

**Fix, all four contributing stages (script0.js):**
1. `clampCorridorX()` — for an inverted range (`lo > hi`), instead of leaving x unclamped, snap into
   whichever of the two valid **outer wrap zones** (`x ≤ hi` or `x ≥ lo`) is nearer to the requested x.
   The corridor can now only align with, or lie beyond, one of the two stubs — never sandwiched between
   them — which structurally eliminates the backtrack-into-own-ports mechanism.
2. `pickCorridorX()` gained an optional 5th `range` parameter — candidates that a valid-zone clamp would
   itself relocate are excluded from consideration, so the search never returns a value the caller's own
   subsequent clamp would override. `wirePathOrthogonal()` and `drawWires()`'s lane-bucketing precompute
   both now pass `range` through.
3. New shared constant `CORRIDOR_MARGIN = WIRE_CORNER_R + 0.5` (6.5px; `WIRE_CORNER_R` is the previously
   locals-only rounded-corner radius, promoted to a top-level constant) replaces the bare 0.5px nudge in
   `pickCorridorX()`'s candidate generation, `routeHorizontalAvoiding()`'s `detourY`, and its
   `enterX`/`exitX` — enough margin that the worst-case corner cut can never eat `WIRE_CLEARANCE` down
   toward zero on the rendered path.
4. **Post-render invariant guard (new, ships in production, not just tests):** `hasReversalOrOverlap(pts)`
   runs on every `wirePathOrthogonal()` call after `collapseCollinear()`, checking the actual waypoint
   list for any surviving 180°-fold-back or overlapping collinear segment. If one slips through despite
   1–3 above, `simpleOrthogonalPts()` re-emits the cable as a plain no-avoidance H/V/H route (still
   respecting each stub's own monotonic clamp) — a boring-but-correct fallback beats a spur, per spec.

**Verification against the full real project.** All **31 connections** in `LX Network racks.dlux.json`
(both racks, real `rx`/`ry`, real port directions) were rendered through the real
`render()`/`drawWires()` pipeline and checked: zero reversals, zero overlapping collinear segments, every
path axis-aligned, and every mid-run segment ≥6px from every un-inflated node rect (excluding each
cable's own endpoint stubs) — **31/31 pass**. The reported connection specifically: min clearance went
from **4.29px → 10.5px**; a literal reversal, while not present in this particular mocked pixel layout,
is now structurally impossible regardless of exact layout (fix #1 above), and is caught by the guard
(fix #4) even if some other unforeseen path reintroduces one.

**Tests.** `test_orthogonal_wires.js` §15 (new, +11 assertions, 261 → **272** in that file): a fixture
built from the actual Netgear M4250 / Rack PDU / UPS cluster in the user's real project (real `rx`/`ry`,
real port groups, the two live connections `ky7i0ztu5j` and `5g4kr2v70t` copied verbatim from the
export), rendered through the real `render()`/`drawWires()` pipeline, asserting the structural invariants
(§14's `assertClean14` helper) plus a ≥6px mid-run clearance check against un-inflated node rects on the
final `d` attribute. Three pre-existing §13 assertions needed updating for the widened
`CORRIDOR_MARGIN` (pickCorridorX candidate shift and both routeHorizontalAvoiding detour-Y directions —
values changed from the old ±0.5px formula to ±6.5px; noted in the assertion labels themselves).

Full suite, run individually per handoff §7: **781 assertions, all green, zero regressions** against the
770-assertion v6.7 baseline.

Checkpoint: `DLux Rackmaster 1129PM 071426.html` (md5 `e2fb1e131772922ab976ebf759a4a802`,
1,121,677 bytes). `test_suite_v6.7/test_orthogonal_wires.js` re-copied to the project folder's
`test_suite_v6.7/`, byte-verified.


## v6.8 — Topbar decongestion: floating canvas toolbar + Export dialog

User-approved design decisions from a prior session, implemented as specified. Two parts, both about
the topbar getting crowded as features accumulated (v6.5 added Undo/Redo/Trace, v6.6 added the
wire-style toggle, v6.7 consolidated exports into a dropdown but the topbar still carried six
canvas-specific controls that only make sense on Routing/Rig) and the Export dropdown outgrowing a
simple anchored panel now that it had a nested scope-picker dialog behind one of its items.

### Part 1 — Floating canvas toolbar (Routing/Rig only)

A Figma/Miro-style pill, bottom-center of the Routing/Rig canvas, absorbing the old
`zoomCtl("zoomRoute")` pill plus five controls that were previously static topbar buttons:
Undo/Redo, Trace, and the Curved/Orthogonal wire-style segment. **The Racks view's own
`zoomCtl("zoomRack")` pill is untouched** — it's a different, non-pannable elevation-grid canvas, out of
scope for this toolbar by design.

Built by a new `canvasToolbar()` function (script0.js), called from `renderRouting()` in place of the old
`zoomCtl("zoomRoute")` call, and — critically — placed *before* the function's empty-canvas early return,
so the toolbar (and the new pan/marquee wiring below) is available even with nothing placed yet. Because
`render()` fully rebuilds `#view` from scratch every commit (the standing "gotcha" per handoff §3), the
toolbar's buttons are built fresh each render reading current state directly (`TRACE_ARMED`,
`S.ui.wireStyle`, `S.ui.toolMode`, `UNDO_STACK`/`REDO_STACK` lengths) rather than relying on a separate
sync pass — the old `renderInner()` line that live-synced a *static* `#wireStyleSeg`'s active class is
now dead code and was removed. Left to right: Undo (↶) / Redo (↷) — same `doUndo()`/`doRedo()`, same
`#btnUndo`/`#btnRedo` ids, disabled-state tracking unchanged; a new **Select/Pan** segmented pair
(`#toolModeSeg`, reusing the existing `.face-seg` visual language); Trace (`#btnTrace`, same
`toggleTrace()`); the Curved/Orthogonal segment (`#wireStyleSeg`, same click handler); a Zoom group
(`-`/%/`+`, same behavior as the old pill) plus a new **Fit** button (`#btnZoomFit`, Shift+1).

**Tool modes (`S.ui.toolMode`, new, default `"select"`, `migrate()`-backfilled and self-healing against
any invalid value).** Select mode preserves every pre-v6.8 click/shift-click/drag-to-reposition behavior
byte-for-byte and adds **marquee multi-select**: dragging from empty canvas (target is `#routeInner`,
`#routeCanvas`, or the bare `#wires` SVG background — never a node/port/cable, checked at pointerdown)
draws a theme-aware dashed `.marquee` rect (screen-space `position:fixed`, so no zoom/scroll coordinate
math is needed for hit-testing) and, on release, selects every device node or **collapsed** rack
container (`.node[data-dev]`, `.rack-node[data-rack]`) whose live `getBoundingClientRect()` intersects it
into `MSEL.devs`; shift held at drag-start adds to the existing selection instead of replacing it. The
hit-test itself is factored into two small pure functions — `rectsIntersect(a,b)` (AABB overlap) and
`computeMarqueeHits(candidates, rect)` — kept independent of the DOM so they're directly unit-testable
without fighting jsdom's lack of a layout engine (`marqueeCandidates(inner)` is the thin DOM-collecting
wrapper around them). **Pan mode** (`S.ui.toolMode === "pan"`) makes any left-drag anywhere on the canvas
— including over a node — pan via `#routeCanvas`'s native `scrollLeft`/`scrollTop` instead (`startPanDrag()`);
node/rack-group/rack-node header `pointerdown` handlers each gained an early `if (panModeActive()) return;`
guard so they don't fight the canvas-level pan, and a capture-phase `click` listener on `#routeCanvas`
swallows any click while pan is active (`panModeActive()`) so a drag that happens not to move doesn't
accidentally select a device or start a port connection underneath. **Always available regardless of
mode:** middle-mouse (`button===1`) drag pans immediately; holding Space pans temporarily
(`SPACE_HELD`, toggling a `.space-pan` cursor class, guarded the same way as the T/Ctrl+Z shortcuts —
suppressed while typing, Routing/Rig-view-only) — both funnel through the same `panModeActive()` check
and `startPanDrag()`. **Keyboard:** `V`/`H` switch Select/Pan (same typing-suppression guard as the
existing T shortcut); **Ctrl+A** in Select mode selects every visible node into `MSEL.devs` (also
suppressed while typing, and a no-op in Pan mode); **Shift+1** (checked via `e.code==="Digit1"` for
keyboard-layout independence, not `e.key`, since Shift+1 often isn't literally `"1"`) fires **Zoom to
fit**. Esc's existing gesture-cancel handler (previously only `REPO_ACTIVE`, the v6.6 touch-reposition
lift) now also cancels an in-progress marquee (`MARQUEE.cancel()`).

**Zoom to fit** (`zoomToFit()`) computes the bounding box (via live `getBoundingClientRect()`, converted
back to unscaled content coordinates using the canvas's own rect + current `scrollLeft`/`scrollTop` +
`S.ui.zoomRoute`) of every visible node/rack-group/rack-node, then hands it to a **pure** helper,
`computeFitZoomScroll(bbox, viewportW, viewportH, pad, minZ, maxZ)`, which returns `{zoom, scrollLeft,
scrollTop}` — factored out exactly so the fit *math* (not the DOM measurement) is directly unit-testable
against a hand-built bounding box and viewport, independent of jsdom's layout gaps. Zoom is clamped to
the existing `[0.4, 2]` range and rounded to 2 decimals, matching the manual +/- buttons; framing uses
~40px padding on every edge; a degenerate bbox (zero-area) or viewport returns `null`, which `zoomToFit()`
treats as a no-op — satisfies "no-op on an empty canvas" without a special-cased empty check of its own.
`requestAnimationFrame` applies the resulting scroll position after the zoom-triggered `commit()`/`render()`
settles (matching how `drawWires()` is already deferred elsewhere in this codebase).

### Part 2 — Export dialog (replaces the v6.7 dropdown)

`#exportMenuPanel`/`#exportMenu` (the anchored dropdown `<div>`, its outside-click listener, its
arrow-key/Home/End keyboard nav, `openExportMenu()`/`closeExportMenu()`/`isExportMenuOpen()`/
`exportMenuItems()`) are gone entirely — replaced by a real `<dialog id="exportDlg">`, opened via
`showModal()` from the same `#btnExportMenu` topbar button (now just "Export", no dropdown-caret glyph).
Esc-close and backdrop-click-close come for free from the app's existing `<dialog>` conventions (v6.5's
generic "close the topmost open `dialog[open]`" Esc handler already covers any dialog; a
`target===currentTarget` backdrop-click listener matches every other dialog in the app, e.g.
`pickerDlg`) — no bespoke open/close state machine needed this time, unlike the dropdown it replaces.

Same four grouped sections (Guides & Summaries / Schedules / Rack elevations / Project), each actionable
item now laid out as name + one-line description + action button (`.exp-item` /`.exp-item-name`/
`.exp-item-desc`, new CSS) rather than a single-line menu row — the button itself is deliberately generic
("Generate"/"Export") since the descriptive text now lives alongside it, not on the button. **Rack Guide
PDF's scope picker is absorbed inline** as a `<select id="expRackGuideScope">` right on that item — one
less hop than the old flow (Export menu → "Rack Guide PDF…" → separate `<dialog id="rackGuideScopeDlg">`
with an "All racks" + one-lib-item-per-rack picker). `openExportDlg()` repopulates the select from
`S.racks` every time the dialog opens; `#miRackGuide`'s click handler reads `scopeSel.value || null`
directly into `openReport(scope)`. The old `<dialog id="rackGuideScopeDlg">` markup,
`openRackGuideScopeDlg()`, and its click-to-close listener are all removed — no orphaned markup or dead
code. "Rack elevations" stays hint text pointing at the existing per-rack SVG/PNG buttons in the Racks
panel (`rkExpSvg`/`rkExpPng`), still not duplicated, matching v6.7's decision.

### Part 3 — Topbar end state

`Library | Racks | Routing | Rig | Lighting | Settings` (unchanged) — theme — **Save — New — Import — Rig
Check — Export**. Six action buttons, no overflow at ~1280px, no orphaned ids/classes/CSS left behind
from anything that moved.

### Tests

`test_suite_v6.8/` (copied from `test_suite_v6.7/` + `run_all.js`; no version-specific self-refs needed
updating — `run_all.js` already auto-detects the newest `DLux Rackmaster *.html` in the parent folder
generically). `test_export_menu.js` rewritten in place for dialog semantics: modal open/close (button
click, Esc, backdrop click), every action present including the absorbed inline scope `<select>`, and
explicit assertions that the old dropdown/menu/scope-dialog machinery no longer exists at all (markup or
JS). New `test_canvas_toolbar.js` (86 assertions): toolbar presence gated to Routing/Rig only (absent on
Library/Racks/Settings, Racks view's own `zoomCtl` untouched), every control present and wired, disabled
states, tool-mode switching + `localStorage` persistence + `migrate()` default/self-heal; marquee
selection via synthesized `PointerEvent` sequences with per-element `getBoundingClientRect()` stubs
simulating a known layout (jsdom has no real layout engine, so this is the standard workaround, same
technique available to any future canvas-geometry test), covering plain-marquee-replaces, shift-marquee-
adds, marquee-never-starts-on-a-node, and an unmoved click being a no-op; pan-mode blocking node drag and
panning instead; middle-mouse and space-hold pan always available regardless of mode; Ctrl+A select-all
plus its typing-suppression and Pan-mode no-op; Esc cancelling an in-progress marquee (state + DOM
element both cleared); zoom-to-fit's pure math (`computeFitZoomScroll`) checked against hand-built
bounding boxes including the zoom clamp ceiling/floor and empty-input no-op, plus a DOM-wiring smoke test
via stubbed rects. Three pre-existing files needed small updates for controls that moved: `test_undo_redo.js`
(switched its view fixture from `"racks"` to `"routing"` so `#btnUndo`/`#btnRedo` exist to query — they
only render inside the canvas toolbar now); `test_orthogonal_wires.js` (its wire-style-toggle-active-class
assertions now re-query `#wireStyleSeg` after each click, since it's rebuilt fresh on every `commit()`
instead of being a static element with a live class-sync, matching the "re-query after any render()-
triggering action" convention `test_trace_highlight.js` already documented); `test_summary_split.js`'s
Rack Guide scope-dialog section rewritten for the inline `<select>` flow. `test_cable_labels_csv.js`
needed one assertion re-targeted from checking the button's own title/textContent to checking its parent
`.exp-item` row's text, since the button itself is now deliberately generic and the descriptive copy
moved to a sibling element.

Full suite, run individually per handoff §7: **881 assertions, all green, zero regressions** against the
781-assertion v6.7.1 baseline.

Checkpoint: `DLux Rackmaster 957AM 071526.html` (md5 `d2b3375e4c35e7fbc04f583b4f329236`,
1,134,742 bytes). `test_suite_v6.8/` copied to the project folder (test files + `run_all.js` only, no
`node_modules`), byte-verified.

## v6.9 — Align/Distribute toolbar cluster + corner minimap (Routing/Rig canvas)

Two user-approved canvas features, both landing on the same v6.8 floating `canvasToolbar()` and both
covering the Routing AND Rig canvases identically (the same `renderRouting()` handles both views).

### Part 1 — Align / Distribute

A small contextual cluster (separator + 8 icon buttons: Align Left/Center/Right, Align Top/Middle/Bottom,
Distribute Horizontally/Vertically) is appended to the end of `canvasToolbar()`, rebuilt fresh from state
on every render like the rest of the toolbar. It appears only once **2+ qualifying items** are in
`MSEL.devs`; the two Distribute buttons render present-but-`disabled` until a 3rd qualifying item joins
the selection (Figma/Illustrator-style, not hidden — the align actions stay usable at 2 selected).
"Qualifying" is deliberately narrower than everything present in `MSEL.devs`: a plain device id, or
`"rack:<id>"` **only when that rack is currently collapsed** — an *expanded* rack-group's on-screen
position is derived from its members (see `resolveDragTargets()`, v6.3), not a value of its own, so it
has nothing for align/distribute to move and is filtered out by a new `alignQualifyingKeys()` helper even
if it's present in `MSEL.devs` (you can still shift-click an expanded rack-group's header into the
selection for other purposes — it just doesn't count toward the 2/3 thresholds or get moved).

**Math (all pure, zero DOM dependency, same split pattern as v6.8's `rectsIntersect`/`computeMarqueeHits`/
`computeFitZoomScroll`):** `bboxOfItems(items)` computes the tight bounding box of `items = [{key,x,y,w,h}]`
(shared with the minimap below). `computeAlignPositions(kind, items)` returns `{key: newCoordinate}` for
one of `left|hcenter|right|top|vmiddle|bottom` — left/right/top/bottom snap every item's respective edge
to the matching bbox edge; hcenter/vmiddle center every item on the bbox's horizontal/vertical center.
`computeDistributePositions(axis, items)` is **gap-based, not center-based** (per spec — node sizes vary
too much in this app for center-based spacing to look right): items are sorted by center on the relevant
axis, the first and last stay exactly where they are, and the total available "slack" (`span` between the
first item's leading edge and the last item's trailing edge, minus the sum of every item's own size along
that axis) is divided into `n-1` equal gaps between bounding boxes — not equal center-to-center spacing.
If the items' combined size already exceeds the span (gap would go negative — e.g. one huge item wedged
between two small ones), it falls back to equal **center**-to-center spacing instead, per spec's explicit
fallback rule.

**DOM wiring:** `getAlignItems()` resolves `alignQualifyingKeys()` into `{key,x,y,w,h,set(x,y)}` — position
comes straight from state (`d.rx/d.ry` or `rack.grx/gry`), but **size prefers each element's live
`getBoundingClientRect()`**, converted out of the zoom transform exactly like `zoomToFit()`'s own
`toContent()` (real node widths vary with port-label content, so a fixed constant would make gap-based
distribute measurably wrong), falling back to `nodeEstH()` + a fixed width (190 for device nodes, 200×60
for rack-node containers) only when the DOM isn't laid out yet. `doAlign(kind)`/`doDistribute(axis)` each
call `getAlignItems()`, run the matching pure function, apply every returned position via each item's own
`set()`, and call **`commit()` exactly once** — `commit()`'s existing structural-diff undo mechanism (v6.5)
means this is automatically a single undo step with no extra bookkeeping. Both are no-ops (return before
mutating or committing anything) below their item-count threshold, including an entirely empty selection.

### Part 2 — Corner minimap

A ~180×(≤140)px semi-transparent overlay pinned to the bottom-right corner of the viewport (`position:
fixed`, clear of the bottom-center canvas toolbar since that one is horizontally centered). Toggle:
`S.ui.minimap` (new, `migrate()`-backfilled default `true`, same `if (u.minimap == null) u.minimap = true`
pattern as `showLabels`/`showImages`/`showStats`), a 🗺 button inside the toolbar's existing `.ct-zoom`
group (`#btnMinimapToggle`). Hidden **entirely** (no DOM at all, not just visually) when toggled off, or
when the current canvas has nothing visible on it — mirrors `zoomToFit()`'s own no-op-on-empty guard.

**The scene is fully state-driven** — a deliberate departure from preferring DOM rects (Part 1's choice):
`minimapItems()` mirrors `renderRouting()`'s own `placed`-filtering logic (routing = current single rack
only, no edges; rig = every visible rack + edge, expanded racks contribute both a group-box item *and*
their individual device items, collapsed racks contribute just one rack-node-sized item and skip their
members) and reads `d.rx/d.ry`/`rack.grx/gry` directly — since those are already canvas-content-space
coordinates, no `getBoundingClientRect()`/scroll/zoom conversion is needed at all to place the little
`.mm-node` rects (fill = the item's own device/rack color at reduced opacity, no text, no wires — cheap).
This also makes the scene trivially unit-testable against known `S` state with no DOM stubbing.

**Geometry (pure):** `computeMinimapScale(bboxW, bboxH, maxW, maxH)` scales content into the ≤180×≤140 box
preserving aspect (returns `null` — no-op — for a degenerate bbox). `computeVisibleContentRect(scrollLeft,
scrollTop, clientW, clientH, zoom)` divides the canvas's live scroll+viewport by zoom to get the visible
region in content coordinates; `computeViewportRectOnMinimap(bbox, scale, vis)` maps that into minimap-
local px for the `#minimapViewport` rect. `computeCenterScroll(contentX, contentY, clientW, clientH, zoom)`
powers click-to-center (clamped ≥0); `computeDragScrollDelta(dxPx, dyPx, scale, zoom)` converts a minimap-
local drag delta into a canvas scroll delta for live-panning by dragging the viewport rect.

**Interactions:** `renderMinimap(wrap, canvasEl)` builds `#minimapBox` fresh every `render()` (rebuild-
from-state, same as everything else), including the per-item `.mm-node` rects and one `.mm-viewport` rect.
A `pointerdown` on `#minimapBox` branches on target: on `#minimapViewport` itself, it live-pans
(`computeDragScrollDelta` on every `pointermove` until `pointerup`); anywhere else on the box, it centers
the canvas there immediately (`computeCenterScroll`) — matching "click anywhere = jump, drag the viewport
rect = pan" from spec exactly. **Per the "do NOT re-render the whole minimap per scroll tick" requirement,**
a lightweight `canvasEl` `"scroll"` listener calls only `syncViewport()`, which repositions `#minimapViewport`
— it never touches the `.mm-node` rects or rebuilds `#minimapBox`; those only change on the next full
`render()` (i.e. the next `commit()`), when node positions can actually have changed. All listeners live on
`#minimapBox`/`#minimapViewport` themselves (no document-level capture), so the minimap cannot intercept
pointer events anywhere outside its own small footprint.

### Tests

`test_suite_v6.9/` (copied from `test_suite_v6.8/` + `run_all.js`; no self-refs needed updating —
`run_all.js` already auto-detects the newest build generically). Two new files:

`test_align_distribute.js` (44 assertions) — pure-math fixtures first (hand-computed `bboxOfItems`/
`computeAlignPositions` for all 6 align kinds against a 3-item fixture with distinct sizes; gap-based
`computeDistributePositions` verified both by expected coordinate AND by independently re-deriving that
the two resulting gaps are exactly equal; the negative-gap fallback-to-equal-center-spacing branch on a
deliberately oversized middle item; the `<3 items` and empty-selection no-ops), then DOM-wiring tests
against a small rack scenario (`getAlignItems()`'s fallback sizing, `doAlign()`/`doDistribute()` mutating
`S` correctly and each pushing exactly one `UNDO_STACK` entry, the 2-item distribute no-op leaving `S`
byte-identical and pushing no undo entry, empty-selection no-op safety, collapsed-vs-expanded rack-
container qualification in a Rig scenario, toolbar cluster hidden below 2 items / distribute disabled
below 3 / tooltips present, a real end-to-end button click, and `getAlignItems()` preferring a stubbed live
`getBoundingClientRect()` over the fallback size, converted correctly out of a 2x zoom).

`test_minimap.js` (46 assertions) — `migrate()` default/heal/preserve for `S.ui.minimap`; every pure
geometry function against hand-computed fixtures (scale for both width-bound and height-bound content,
zero-bbox no-op, visible-content-rect and viewport-rect-on-minimap math, click-to-center including the
clamp-to-0 case, drag-delta math); `minimapItems()` scene correctness for Routing (single rack, edges
excluded), Rig-expanded (rack-group box + individual devices + edge, with the rack-group bbox hand-
verified against `buildRackGroup()`'s own pad/headH/w formula), and Rig-collapsed (rack-node-sized item,
members excluded); DOM presence gated to Routing/Rig only and hidden on an empty canvas; the toggle button
existing inside `.ct-zoom`, its active state, and `localStorage` persistence; node-rect-count-matches-
scene, the `#minimapBox` element's own size matching `computeMinimapScale()`'s output, and a scroll event
updating only `#minimapViewport`'s position (not triggering a full rebuild — same `#minimapBox` reference
before/after); click-to-center and viewport-rect-drag exercised via synthesized `PointerEvent`s with
stubbed `getBoundingClientRect()`/`clientWidth`/`clientHeight`, each checked against the same pure
primitives already verified above (an integration/composition check, not a re-derivation); and a sanity
check that clicking a device node well outside the minimap's own bounds still selects it normally.

Full suite, run individually per handoff §7: the 26 carried-over v6.8 files are **byte-for-byte unchanged
and still 881/881** (zero regressions), plus the 90 new assertions above — **971 assertions, all green**.

Checkpoint: `DLux Rackmaster 1043AM 071526.html` (md5 `25b4183f261e9e436a5059b13525a224`,
1,149,875 bytes). `test_suite_v6.9/` copied to the project folder (no `node_modules`), byte-verified.

## v6.10 — cable clarity pass, per-type directional Trace rework, Z-route wrap fix, Evergreen theme

Four user-requested items in one session, plus a mid-session user bug report (screenshot) fixed by a
subagent. Checkpoint: `DLux Rackmaster 1055PM 072026.html` (md5 `fb51ed773ca6a2b0045a0413127b4367`,
1,160,480 bytes). Test suite: `test_suite_v6.10/` — 29 files, **1,262 assertions, all green** (v6.9's
971 grew via the reworked/expanded files below; zero regressions in everything untouched).

### Part 1 — cable spacing + clarity pass (Routing/Rig)

- **`WIRE_LANE_GAP` 14 → 28px** — corridor bus lanes are now twice as far apart so parallel runs are
  individually trackable end to end. Narrow-gap compression (v6.6.2) unchanged and still applies.
- **Bus lanes in curved mode too** — `drawWires()` now runs the same grouping/sort/even-spacing pass
  when `wireStyle === "curved"` (no obstacle machinery — curved mode never had it) and passes `laneX`
  into `wirePathCurved(a, b, laneX)` (new optional 3rd param): the two Bézier control-point x's shift
  by the lane offset (capped ±70px), fanning parallel curves mid-run. Endpoints/stubs untouched;
  omitted `laneX` (ghost preview, direct/unit calls) is byte-identical to the pre-v6.6 curve.
- **Thicker cables:** wire 2.2 → 3px (selected 3.5 → 4.5), casing 5 → 6.5px (selected 6.5 → 8),
  base opacity .85 → .9.
- **Hover = track the run:** hovering any cable fades every other cable to 22% opacity
  (`#wires:has(.wire-grp:hover) .wire-grp:not(:hover)` — pure CSS `:has()`, no JS) while the hovered
  one brightens/thickens as before.
- **Always-visible cable labels, toggleable.** Every cable now shows a mid-run label chip — its label
  if set, else its type — controlled by `S.ui.wireLabels` (new, `migrate()`-backfilled default `true`)
  via a 🏷️ button in the canvas toolbar's zoom group (`#btnWireLabels`). The `<text class="wire-label">`
  moved *inside* the cable's `.wire-grp` `<g>`, so hover-fade and trace-dim carry each label with its
  own cable. Labels are positioned at the endpoint midpoint at build time, then refined onto the true
  path midpoint via `getTotalLength()/getPointAtLength()` after insertion (matters for orthogonal
  elbows; jsdom lacks those APIs and keeps the fallback — guarded with a `typeof` check). Label type
  bumped 10 → 11px semi-bold.
- **Port/node readability:** pin rows 11 → 12px type at `--ink` (was `--ink2`) with 3px padding,
  pins 11 → 13px, node headers 12.5 → 13.5px, node borders 1 → 1.5px. `nodeEstH()` row metrics
  updated to match (36 head + 25/row + 8; was 34/19/8) — the align/distribute and minimap tests'
  hand-computed fixtures updated accordingly (61 → 69 fallback height, rack-group bbox h 399 → 407).

### Part 2 — Trace rework: cable-first, same-type, directional

The v6.5 trace (whole-connected-component BFS from any clicked device or cable, any direction, any
type) lit up essentially the entire rig on dense projects — the user's verdict: useless. Reworked
per spec (user-confirmed): **click a cable** while armed and the trace covers only cables of the
**same type** as the clicked one; **upstream**, only the direct feed chain back to the signal's
origin — each upstream device is expanded through its *incoming* same-type cables only, so sibling
outputs of upstream devices (branches upstream of the selected cable) are excluded; **downstream**,
every same-type branch transitively to its end. Direction comes from the connection data itself
(`a` = source/out side, `b` = destination/in side — assigned at pin-click patch time since v1).
Untyped cables trace together as their own "" type. `conns.has()` guards cycles.

- `traceComponent()`/`traceFrom()` removed; `traceCableFlow(connId)` (pure, returns
  `{devs, conns, type}` or `null`) + `traceFromCable(connId)` replace them. `TRACE_MEMBERS` keeps its
  shape (plus `.type`), so every consumer (`buildNode`/`drawWires`/`buildRackGroup`/`buildRackNode`,
  trace-hi/trace-dim baking, redraw survival, Esc/view-switch clearing) is unchanged.
- Clicking a **device** while armed no longer traces — hint toast ("click a cable"). Toolbar button
  tooltips/toasts rewritten for the cable-first workflow; toast reports
  `Traced <type>: N devices, M cables`.
- `test_trace_highlight.js` rewritten in place for the new semantics (33 assertions: the
  included/excluded topology matrix incl. sibling-output exclusion both at the source device and
  further upstream, different-type feed exclusion, leaf-cable trace, untyped grouping, cycle safety,
  removed-function checks, arm/disarm/Esc/T/view-switch, device-click-doesn't-trace, class baking +
  redraw survival, retrace-replaces, click-to-select unaffected when disarmed).

### Part 3 — orthogonal Z-route (mid-session user bug report, subagent fix)

User screenshot: EN4 "DMX Out 4" (right-facing) → RDM 6XL "DMX In" (left-facing, node below-left) —
the cable picture-framed three sides of the splitter. Root cause: the v6.7.1 inverted-`corridorXRange`
handling (`lo > hi`, opposing-direction ports facing away from each other) snapped the *single*
corridor into one outer wrap zone, forcing `routeHorizontalAvoiding()` to detour around the far
endpoint's whole body to reach its port. Fix: the inverted case now gets its own **two-corridor
staircase Z** — out past the source stub → vertical to a clear transfer height between the nodes →
horizontal across → vertical → into the destination port, each vertical staying inside its own stub's
monotonic-approach zone. New `pickTransferY()` (horizontal twin of `pickCorridorX()`, same
`CORRIDOR_MARGIN`/candidate-budget conventions) picks the transfer height deterministically
(midpoint of the stub gap, shifted to the nearest clear y past obstacle edges); new `zRouteMidPts()`
builds the mid-run; `wirePathOrthogonal()` dispatches to it only when `range[0] > range[1]` —
**normal-range geometry is byte-identical to v6.9**, now pinned by hardcoded pre-fix path strings in
the test suite (§16c — any future deliberate change to normal-range geometry must update those).
Z-routed cables bucket into `assignWireLanes()` by their source-side corridor x; lane offsets shift
only the source-side vertical, clamped to the source stub's monotonic zone. All existing guards
(`collapseCollinear`, `hasReversalOrOverlap` → `simpleOrthogonalPts` fallback) still wrap everything.
`test_orthogonal_wires.js` 272 → 527 assertions (§16: exact screenshot geometry incl. a
max-2-hugged-sides / no-far-side-vertical / final-approach-direction / Manhattan-length-bound check,
determinism, pre-fix normal-range pins, a 48-layout opposing-direction sweep) plus the lane-gap
assertions re-encoded at 28px. Validated against the user's real `LX Network racks.dlux.json`
through the live pipeline: **31/31 connections clean**, both real inverted-range runs (incl.
`5g4kr2v70t` from v6.7.1) now render as clean staircases.

### Part 4 — Evergreen theme

Third theme, `S.ui.theme === "evergreen"`: deep evergreen/OD-green surfaces (`--bg:#0c120e`,
`--panel:#15211a`), green-tinted inks and lines, evergreen primary accent (`--accent:#69b578`,
`--accent-soft:#1c3626`), light-sage inverse chips/toasts, `--wire-casing:#e9efe7`. Same contrast
structure as dark; leg X/Y/Z + amber identity colors keep the dark-tuned vibrant values (they sit on
elevated tracks and stay readable on green). RIGPOWER flows through automatically via the existing
`--rm-*` shadow-boundary bridges — no shadow-side changes needed. The topbar theme button now
**cycles** light → dark → evergreen → light, its label always naming the theme it switches *to*
(☾ Dark / 🌲 Evergreen / ☀ Light); `migrate()` heals any unknown stored theme to `"light"`.
`data-theme="evergreen"` rides the existing `dataset.theme` plumbing untouched.

### Tests

`test_suite_v6.10/` (copied from v6.9's set): `test_trace_highlight.js` rewritten (35 → 33),
`test_orthogonal_wires.js` extended by the subagent (272 → 527), `test_align_distribute.js` /
`test_minimap.js` fixture values updated for the new `nodeEstH()` metrics, new
`test_clarity_theme.js` (38: evergreen CSS block + accent/surface values, hover-fade `:has` rule,
pin/node CSS bumps, label-chip markup incl. type fallback and inside-group placement, stroke widths
default+selected, toggle button + persistence, migrate defaults/heals for `wireLabels` + theme,
3-way theme cycle with `data-theme` application, curved-mode lane fanning + determinism +
`wirePathCurved` no-laneX byte-parity, `WIRE_LANE_GAP === 28`). Full suite run individually per
handoff §7: **29 files, 1,262 assertions, all green.**

**Known non-regression notes:** the static Rack Guide PDF's `routingSVG()` diagram still draws its
own simplified straight connections — the Z-route/lane changes are canvas-only, PDF untouched by
design. Real-browser spot-checks recommended (per the standing jsdom gaps): hover-fade `:has()`
rendering, label placement on long orthogonal runs, evergreen theme contrast on the Lighting tab's
3D plot, and the label toggle on touch.

## v6.10.1 — curved wire mode removed (orthogonal only)

Same-day, tightly-scoped follow-up per §6 convention. User verdict after seeing v6.10's curved-mode
lane fanning: curved is still ugly — remove it. Orthogonal (with v6.10's Z-route and bus lanes) is
now the only routing style.

- **Removed:** `wirePathCurved()` (the original pre-v6.6 Bézier body, kept byte-identical through
  four versions of "curved mode untouched" guarantees — now gone entirely), the Curved/Orthogonal
  segmented control (`#wireStyleSeg`) from the canvas toolbar, `drawWires()`'s style branch (the
  obstacle-collection + corridor/lane pass is now unconditional), and v6.10's curved-mode lane-entry
  block (lived one version).
- **Kept:** `wirePath(a, b, connId, laneX)` survives as a thin alias for `wirePathOrthogonal()` so
  every caller (drawWires, ghost preview, tests) is untouched. `S.ui.wireStyle` survives as a field
  but `migrate()` now pins it to `"orthogonal"` unconditionally — old saves/exports with `"curved"`
  stored heal on load and round-trip cleanly; nothing reads the field anymore.
- `wireStub()`'s comment updated ("before the route begins" — there is no Bézier now).

**Tests:** `test_orthogonal_wires.js` reworked in place (527 → 526: migrate-heal assertions now
expect `"orthogonal"` incl. an explicit stored-`"curved"`-heals case, the old §3 curved byte-parity
block replaced with removed-function + alias-delegation checks, the §12 toggle section replaced with
segment-gone + persisted-always-orthogonal checks, six inert "restore to curved" lines dropped);
`test_canvas_toolbar.js` 86 → 84 (segment-gone instead of segment-present/toggle);
`test_clarity_theme.js` 38 → 39 (curved byte-parity swapped for removed-function + no-Bézier-in-
rendered-paths checks); `test_wires_paint_order.js` stub assertion re-targeted (M..L.. start, no `C`
command); `test_trace_highlight.js` dropped its inert wireStyle fixture line. Full suite:
**29 files, 1,260 assertions, all green**; real-project validation re-run: 31/31 clean.

Checkpoint: `DLux Rackmaster 1108PM 072026.html` (md5 `04d4ae0417883628a3b0b39dbc2cd083`,
1,158,542 bytes). Updated test files re-copied to `test_suite_v6.10/`, byte-verified.

## v6.11 — configurable Rack Guide sections + per-port settings tables

Two user-requested export improvements, implemented by a subagent per the orchestrator plan.
Checkpoint: `DLux Rackmaster 1119PM 072026.html` (md5 `7aa253ad977666a0da536bbe9e206740`,
1,162,209 bytes). Test suite: `test_suite_v6.10/` grew to 30 files — new
`test_report_sections.js` (73 assertions); no existing files needed changes. Full suite:
**1,333 assertions, all green.**

### Per-section Rack Guide toggles

`S.ui.reportSections` — 12 boolean keys, all defaulting true, `migrate()`-backfilled via
`Object.assign(reportSectionDefaults(), stored)` so stored choices survive and new keys heal in
(**add future keys to `REPORT_SECTION_DEFS` only** — it's the single source of truth for migrate,
`reportHTML()`, and the dialog UI): `overview`, `trunks` (inter-rack "System integration"),
`network`, `edges`, and per-rack `stats` (Space/power/weight line), `elevations`, `build`,
`cabling`, `sheets` (device config sheets), `portDetail` (the new per-port table, meaningful only
with `sheets` on), plus `signal` and `schedule`.

- **UI:** a checkbox grid (`#rgSections`, `.rg-sections` CSS — 2-column, 12px) injected into the
  Export dialog's Rack Guide item by `openExportDlg()` on every open (idempotent; static dialog
  markup untouched). Checkbox changes write `S.ui.reportSections[key]` + `save()` only — **not**
  `commit()`, which would rebuild the DOM under the open modal.
- **`reportHTML()`** reads the toggles at build time and renumbers sections dynamically via a
  running counter: the first (system) `<h2>` number belongs to whichever system block is first
  enabled; the whole system section disappears only when all of overview/trunks/network/edges are
  off (racks then start at 1); the final section disappears only when signal AND schedule are both
  off, and the schedule is promoted to its own numbered heading when only signal is off. Rack
  sections always render; their internal blocks obey stats/elevations/build/cabling/sheets. The
  single-rack scope obeys the same rack-internal toggles.
- Known intentional edge: hiding the `edges` table doesn't remove edge devices from the signal-flow
  SVG — that's the routing diagram's own content.

### Per-port settings tables

The device config sheets' cramped inline "Port labels:" paragraph is gone, superseded by a proper
**"Per-port settings"** table per device (gated by `portDetail`): columns Port (`<group> <n>`) /
Label / Settings (each per-port field `key: value`, " · "-joined), listing only ports that actually
carry an override (a label or any keyed field from the "⋯" per-port editor or the canvas
double-click rename). Devices with no overridden ports render no table; `portDetail` off renders
nothing (no fallback to the old paragraph). All copy says "ports" per the terminology rule.

### Tests

`test_report_sections.js` (73): migrate backfill/heal incl. unknown-key preservation, each toggle's
exact removal against a 2-rack + edge + network-fields + per-port-overrides fixture, dynamic
renumbering both ways, all-off section removal, single-rack scope, the per-port table matrix
(label-only, fields-only, no-override omitted, off-state), and the dialog grid (state reflection,
persistence without closing the modal, reopen reflects stored state, end-to-end Generate honoring
toggles). `test_summary_split.js` and `test_export_menu.js` pass unchanged.

## v6.11.1 — Routing/Rig canvas auto-size (edge smush + cable clipping fix)

Same-day user bug report (screenshot, both canvases): dragging devices/racks far right or bottom
"smushed" nodes and made cables disappear. Root cause: `#routeInner` was a **hard-coded 3000×2200px**
box since the canvas's introduction — auto-width absolutely-positioned `.node`s squeezed against the
containing block's right edge (port columns wrapped/overlapped), and `#wires` (`inset:0`, 100%)
clipped every path segment beyond the box. The user's real project had both racks' content sitting
right at that boundary. Subagent fix, orchestrator-verified.

- **CSS:** `#routeInner` now `min-width:3000px;min-height:2200px` (floor, not hard size).
- **JS:** pure `computeRouteInnerSize(items, floorW, floorH, pad)` → `max(floor, extent + 400px pad)`
  per axis; `sizeRouteInner(inner, growOnly)` sets the **unscaled** `style.width/height` (zoom stays
  purely in `transform:scale()`). Content extent comes from **`minimapItems()`** — deliberately the
  same single source of truth the minimap uses, so per-view filtering (Routing = selected rack only;
  Rig = group boxes + collapsed racks + edges) and the rack-group pad/headH/205 formula are never
  duplicated. Nodes wider than the 190px estimate are absorbed by the pad.
- **Call sites:** `renderRouting()` after nodes are appended (full render sizes to `max(floor,
  content)` — so pulling everything back left shrinks the canvas again); `startGroupDrag()`'s
  pointermove with `growOnly` (the one shared drag path for device nodes, rack heads, collapsed
  rack-nodes, and multi-selections) — the canvas grows live mid-drag and never shrinks mid-drag.
  Align/Distribute/undo/redo are covered automatically via `commit()` → `render()`.
- No new state fields, no `migrate()` footprint; obstacles/marquee/pan/ghost/scroll-restore and the
  `#wires` sizing all confirmed untouched.

**Tests:** new `test_canvas_autosize.js` (31 assertions: pure math, CSS floor structure, grow/shrink,
per-view filtering incl. far-device-in-other-rack, live PointerEvent drag growth + mid-drag no-shrink,
zoom independence, determinism, minimap composition). Full suite: **31 files, 1,364 assertions, all
green**; real-project validation 31/31 clean. Checkpoint: `DLux Rackmaster 1140PM 072026.html`
(md5 `9dac61ae46f706e28890e6fb8e74caef`, 1,163,944 bytes); suite re-copied to `test_suite_v6.10/`,
byte-verified.

## v6.11.2 — click-away shrink fix, hover fade removed, 16px cable hit target

Three user-reported items, subagent-implemented, orchestrator-diagnosed and verified.
Checkpoint: `DLux Rackmaster 1158PM 072026.html` (md5 `68f373604f58d4cb44b768a36a48515a`,
1,166,791 bytes). Suite: **32 files, 1,399 assertions, all green**; real-project 31/31 clean.

### 1. Canvas re-squeeze on click-away (v6.11.1 regression)

Root cause: `sizeRouteInner()` sized purely from `minimapItems()`' fixed 190px-per-node estimate;
real nodes run 400–600px wide. Mid-drag the grow-only guard masked it, then the first
`commit()`-triggered render (usually the background click that clears a selection) shrank the
canvas to the underestimate — re-squeezing edge nodes and re-clipping their cables. Two-part fix:
`.node` and `.rack-node` gained `width:max-content` (an absolutely-positioned element then sizes to
content regardless of the containing block — edge squeeze is structurally impossible and DOM
measurement has no squeeze-feedback loop), and `sizeRouteInner()` now takes the per-axis max of the
state estimate (still the deterministic floor — jsdom rects are zero and skipped) and live
`.node`/`.rack-node` rects converted to content space the same way `collectNodeObstacles()` does,
plus the 400px pad. Full renders may still shrink, but only to the TRUE measured extent; grow-only
mid-drag unchanged.

### 2. Hover fade removed

The v6.10 `#wires:has(.wire-grp:hover) .wire-grp:not(:hover){opacity:.22}` rule read as trace-style
greying — removed per user. The hovered cable's own brighten/thicken (pre-v6.10) and trace-mode
dimming are untouched. Nothing changes other cables' visibility on hover when trace is inactive.

### 3. Bigger cable click target

Each `.wire-grp` gains an invisible third path: `path.wire-hit` (16px stroke, `stroke-opacity:0`,
`pointer-events:stroke`, `cursor:pointer`, same `data-id`), painted last (casing → wire → label →
hit; the paint-order contract is untouched). Click/shift-multiselect/trace-armed clicks all bind to
`path.wire, path.wire-hit`. **The hit path spans stub-end to stub-end only** — `#wires` paints above
device nodes (v6.5), so a fat stroke reaching the pin centers would steal click-to-connect from
connected pins; the hit polyline is rebuilt as `collapseCollinear(dedupeAdjacent([sa,
...finalPts.slice(1,-1), sb]))` (the agent found plain `slice(1,-1)` drops the whole first run when
`collapseCollinear` has merged pin→stub→corridor into one segment — `sa`/`sb` re-anchoring fixes
that exactly). Mechanism: module-level `LAST_WIRE_HIT_D` set by every `wirePathOrthogonal()` call,
read same-tick by `drawWires()` — `wirePath()`'s public signature is unchanged. **Future path-
emission changes must keep setting `LAST_WIRE_HIT_D`** (fallback: hit path = visible path).

### Tests

`test_cable_hit_target.js` new (24: CSS contract, paint order, hit-starts-at-stub geometry checked
by exact coordinates, select/shift-multiselect/trace via the hit path, one hit per cable);
`test_canvas_autosize.js` 31 → 41 (max-content CSS, prototype-level rect stubs proving measured >
estimate wins, the literal click-away scenario, stub-removed determinism);
`test_clarity_theme.js` 39 → 40 (fade rule asserted GONE, hovered-cable emphasis asserted kept).

## v6.11.3 — Rack Guide signal-flow diagram: orthogonal cables, fit-to-devices, portless filter

Three user-reported export issues, all in `routingSVG()` (the static print-SVG renderer — it had
never gone through the canvas router, which is why "curved" survived v6.10.1's removal there).
Subagent-implemented, orchestrator-verified. Checkpoint: `DLux Rackmaster 0956AM 072126.html`
(md5 `86ccc02471897864fb2467ec28743232`, 1,170,713 bytes). Suite: **33 files, 1,426 assertions,
all green** (new `test_report_routing_svg.js`, 27); real-project regression guard 31/31 canvas
wires clean.

- **Portless devices filtered.** `routingSVG()` now honors `devVisibleInCanvas()` exactly like the
  canvas (v6.4 rule: zero-port devices — drawers, blank panels — hidden; `hideInRouting` overrides
  respected in both directions). `ensureRoutingLayout()` still runs on the unfiltered list so hidden
  devices keep stable rx/ry. Connections to hidden endpoints skip cleanly via `pinPos()`'s existing
  null path; an all-hidden rig returns the "No devices placed yet." placeholder.
- **Orthogonal cables in the export.** `pinPos()` returns `{x, y, dir}` (out→right, in→left,
  BiDi→down, mirroring `portExitDir`); the connection loop reuses the canvas router verbatim —
  `drawWires()`'s entries/lane precompute + `assignWireLanes` + `wirePath()` — with `WIRE_OBSTACLES`
  swapped for the diagram's own geo rects (inflated by `WIRE_CLEARANCE`) and restored in a
  `finally`. Print output stays lean (single path per cable, no casing/hit paths — print is on
  white). Corridor cables get lane separation; their labels sit on the corridor run (straight runs
  keep the endpoint midpoint). Node boxes are 200px wide (canvas nodes are 190), so STUB/lane
  constants apply unchanged.
- **Fit to devices.** viewBox and `max-width` now anchor to the visible devices' min/max bounding
  box with a 60px margin instead of `0 0 maxX maxY` — rigs living far from the origin no longer
  print as a mostly blank field.

**Tests:** `test_report_routing_svg.js` (27: filter matrix incl. both overrides, skip-to-hidden
without throwing, viewBox anchoring/span, no `C` commands + axis alignment + exact pin coordinates,
lane separation, corridor label placement, determinism, `WIRE_OBSTACLES` sentinel restore,
empty-placeholder). The three pre-existing routingSVG-adjacent files (`test_elevation_export` F5
BiDi band, `test_summary_split`, `test_report_sections`) pass unchanged. `validate_real_project.js`
was recreated after the sandbox reset (the old copy lived only in /tmp) and — going forward — is
now **persisted in `test_suite_v6.10/`**; note it validates via the Rig view with all racks
expanded and internal runs shown, since single-rack Routing only reaches 21 of the project's 31
connections.

## v6.11.4 — single-rack Rack Guide gets a scoped signal-flow diagram

User request: the single-rack export had no signal-flow diagram — that was v6.7's deliberate
"nothing system-wide in single-rack scope" rule, now relaxed on purpose. `routingSVG()` gained an
optional `scopeRackId` (filters the visible device list to that rack; connections leaving the rack
skip naturally via `pinPos()`'s missing-geo null path — the diagram shows the rack's internal flow
only, with trunks still documented in the cabling checklist). The single-rack `reportHTML()` branch
appends a numbered "2. Signal flow — <rack>" section, gated by the existing `signal` report toggle;
unscoped calls are byte-identical to v6.11.3. Tests: `test_report_routing_svg.js` 27 → 33 (scoped
device filtering, cross-rack run skipped, unscoped unchanged, section presence + toggle-off in the
single-rack guide, diagram-vs-checklist scoping — "Scoped B" rightly stays in the cabling checklist
while excluded from the SVG). Full suite: **33 files, 1,432 assertions, all green**; real-project
validation 7/7 (31/31 wires). Checkpoint: `DLux Rackmaster 1001AM 072126.html`
(md5 `583ed44102e45e62cc8081a38cf9999a`, 1,171,567 bytes).

## v6.11.5 — single-rack Rack Guide honors every section toggle (rack-scoped)

User report: a single-rack export showed only Rack Build + Signal flow with every box checked —
v6.7's "nothing system-wide in single-rack scope" rule was still governing the other ten sections.
Subagent rework, orchestrator-verified. Checkpoint: `DLux Rackmaster 1018AM 072126.html`
(md5 `7975d2618fd62102f0767332268b381c`, 1,172,969 bytes). Suite: **34 files, 1,476 assertions, all
green** (+ real-project validator 7/7).

The old single-rack early-return branch is gone: both scopes flow through one shared assembly
(system blocks → rack build → signal/schedule, running-counter numbering), parameterized by
scope-aware lists that are the *original array references* when unscoped — the all-racks output
cannot drift, and is now pinned by **byte-identity fixtures** in `test_suite_v6.10/`
(`fixture_rackguide_allracks_synth.html` + `_real.html`, captured under a fixed-Date shim;
regenerate deliberately via `node test_report_scoped.js <build> --capture` after any intentional
report-copy change — done once this version for the pluralization below). Scoping rules: overview =
this rack's row + scoped totals; trunks = inter-rack runs touching this rack; network = this rack's
devices only; edge devices only if actually cabled into this rack (else the block disappears);
schedule = runs touching this rack; signal = v6.11.4's scoped diagram, now counter-numbered.
Rack-internal toggles unchanged. Also fixed the totals line to pluralize properly ("1 rack", not
"1 racks") — the one deliberate all-racks copy change this version, fixtures re-captured.

Tests: new `test_report_scoped.js` (34 — every scoping rule, per-toggle removal, renumbering
combos, both byte-identity guards); `test_report_sections.js` 73 → 82 (single-rack contract
rewritten); `test_summary_split.js` rewritten §4 (system sections present-but-scoped, other rack
still absent); `test_report_routing_svg.js` 33 → 34 (numbering regex + system-off case).

## v6.11.6 — signal-flow diagram readability + standalone scaled SVG/PNG export

User request (diagram too small to read in the export) — both remedies shipped. Subagent-implemented,
orchestrator-verified. Checkpoint: `DLux Rackmaster 1049AM 072126.html`
(md5 `ed0c7c570d360372df01744432cf6317`, 1,178,465 bytes). Suite: **35 files, 1,515 assertions, all
green**; real-project validator 7/7.

- **In-guide readability bump** (`routingSVG()`): rowH 15→17, headH 22→24, device name 9→10.5px
  (slice 26→22), rack tag 7→8 (12→10), port labels 7.5→9 (18→15), BiDi labels 6.5→8 (10→8), pins
  r 3→3.5, cable stroke 1.8→2.2, connection labels 7.5→9. All pin/label geometry derives from
  rowH/headH so `pinPos()` stayed consistent automatically. The all-racks byte-identity fixtures
  were deliberately regenerated for this (documented process, `--capture`).
- **Standalone "Signal flow diagram" export**: new Export-dialog item (Guides & Summaries group,
  injected dynamically like `#rgSections` — chassis untouched) with a scope select (All racks / per
  rack) and a 1×–4× scale select (default 2×; PNG only — SVG is vector, the tooltip says so).
  `signalFlowSVGString(scope)` converts `routingSVG()` output to a standalone file (explicit
  width/height from the viewBox span, embedding styles dropped, opening-tag-only replacement);
  `exportSignalFlowSVG/PNG` reuse the v6.5 elevation pipeline (blob → Image → canvas at span×scale,
  **white background fill first** — the diagram is drawn for a white page), filenames
  `"<rig> - signal flow[ - <rack>].svg/.png"`. Empty scope → "Nothing to export" toast. No new
  persisted state.

**Tests:** new `test_signal_flow_export.js` (39 — injection/repopulation, standalone-SVG structure,
scoping, filenames, structurally-stubbed PNG pipeline incl. white fill + scaled drawImage, empty
guard; jsdom canvas gaps documented per handoff §7 — a one-time real-browser spot-check of 4× PNG
on a large rig is still recommended); `test_report_routing_svg.js` re-derived exact coordinates for
the new rowH/headH metrics (still 34); fixtures regenerated then `test_report_scoped.js` 34/34.

## v6.12 — label legibility over cables (canvas + export)

*(Numbering note: this session's work is tagged **v6.12** in the code comments; earlier drafts of this doc called it v6.11.7. v6.12 is authoritative — it's what the build's inline comments say.)*

User report: port labels were hard to read because cables paint over them. Requested remedy, verbatim:
text in front of the cables in the stacking order so it's always visible, plus a box behind the text
at 50% opacity for contrast. Confirmed scope with the user before implementing: **both** surfaces
(interactive canvas *and* the signal-flow export), and **three** text classes (port labels, device
names, cable labels). Two implementation subagents, orchestrator-verified.

Checkpoint: `DLux Rackmaster 0137PM 072126.html` (md5 `5c2311a2c42982deae924c932399ba90`,
1,184,446 bytes). Suite: **37 files, 1,670 assertions, all green**; real-project validator 7/7.

### Root causes (two independent ones, one per surface)

- **Canvas:** since v6.5, `svg#wires` is appended *last* inside `#routeInner` so cables deliberately
  paint on top of device node bodies. Port labels (`.pin-label`) and device names live *inside*
  `.node`, so they were structurally under every cable. Separately, since v6.10 each
  `text.wire-label` lives inside its own `.wire-grp`, so cable #1's label painted under cable #7's
  *path* — a second-order case of the same problem.
- **Export (`routingSVG()`):** all device boxes are emitted first, then all cables second, so every
  cable drew over every port label.

### Canvas fix

New theme var `--label-scrim` in all three theme blocks — each theme's own `--panel` at 50% alpha
(`rgba(255,255,255,.5)` light / `rgba(27,27,31,.5)` dark / `rgba(21,33,26,.5)` evergreen), as literal
rgba (not `color-mix`, not `var(--panel)` + `opacity`, which would fade the text too).

Five selectors lifted with `position:relative;z-index:2` + a scrim chip: `.pin-label`,
`.node-head .node-title` (new class on `buildNode()`'s name span), `.node-head .rk`,
`.bidi-zone-label`, and `.rg-head .rg-title` (new class on `buildRackGroup()`'s rack-name span). The
three that sit on a coloured header use a fixed `rgba(0,0,0,.5)` instead — their text is `#fff`, so a
light scrim would wash out.

**The chips' padding is cancelled by an equal negative margin so measured node width is unchanged.**
`.node` is `width:max-content`, so any net widening would have broken the hand-computed fixtures in
`test_align_distribute` / `test_minimap` / `test_canvas_autosize`. Two of the five needed care rather
than the naive `padding:0 3px;margin:0 -3px`: `.node-head .rk` has `margin-left:auto` (which resolves
to 0 under max-content, so the naive form would have netted +3px) and uses
`padding:0 3px;margin:0 -6px 0 auto` — the `auto` preserves right-alignment while -6px cancels both
padding sides; and `.bidi-zone-label` preserves its original `+2px` net via
`padding:0 3px;margin:0 -1px 0 -3px`. **The invariant is "net box contribution unchanged from the
pre-change build," not "net zero"** — `test_label_legibility.js` encodes it as a per-selector
`netExpected`.

Two stacking decisions worth not re-litigating:

- **`.rack-group` lost its `z-index:0`** so its `.rg-title` descendant can escape (a positioned element
  with `z-index:0` *is* a stacking context and traps descendants). Genuine no-op: `z-index:0` and
  `z-index:auto` both paint in CSS 2.1 step 8 in tree order, and rack-groups are appended first.
- **`.rack-node` was deliberately left alone** (still `z-index:1`) and `#wires` deliberately has **no**
  `z-index`. An earlier draft of this work added `#wires{z-index:1}`; that was reverted. Reason:
  `#wires` at `z-index:auto` is step 8, while `.rack-node`'s `z-index:1` is step 9 — so collapsed rack
  boxes and their header text were **already above the cables** and needed no change at all. Adding
  `z-index:1` to `#wires` would have joined it to step 9 and, being last in tree order, flipped cables
  *over* collapsed rack boxes — a real Rig-view regression. `test_label_legibility.js` carries an
  explicit guard asserting `#wires` has no `z-index`, with a comment, so a future session doesn't
  "helpfully" re-add it. The base `.node` rule must likewise stay free of any stacking-context
  property (z-index/transform/opacity/filter/isolation/will-change/contain) or the lifted text can no
  longer escape — also asserted.

**Cable labels extracted to their own layer.** `.wire-grp` now holds exactly casing → wire → hit (the
v6.11.2 paint-order contract, unchanged). All labels moved into a single `<g id="wireLabelLayer">`
appended as the last child of `#wires` (after `#ghostWire`, so labels stay readable mid-drag), one
`<g class="wire-lbl-grp" data-id>` per labelled cable holding a `rect.wire-label-bg` +
`text.wire-label`. The trace class is baked onto the label group as well as the cable group, so v6.10's
"label dims/highlights with its own cable" coupling survives the decoupling. The post-insertion
reposition loop now iterates label groups and resolves each cable via `data-id`, keeping the existing
`getTotalLength` guard and try/catch. Rect sizing uses `getBBox()` where available with a
feature-tested character-count fallback (jsdom has no `getBBox`). `.wire-label` **keeps** its
`paint-order:stroke` halo — halo *and* rect, per the user's explicit choice.

`wirePath()`, `wirePathOrthogonal()`, `LAST_WIRE_HIT_D`, lane assignment, obstacle collection and every
path `d` string are untouched — verified byte-identical against the pre-change build across 5 view
scenarios (rig, rig+1 collapsed, rig+both collapsed, `rigHideInternal`, routing).

### Export fix

`routingSVG()` restructured from two passes into **three**: device geometry (box rects, header rects,
port circles, BiDi divider) → cables → all `<text>`, each immediately preceded by a 50%-opacity
backdrop `<rect>`. New helper `svgTextBg(txt, x, y, fs, anchor, dark)`. White-on-colour text (device
name, rack tag) gets `fill="#000" opacity="0.5"`; everything else gets `fill="#fff" opacity="0.5"`.
Connection labels keep their `paint-order` halo *and* gain a rect.

**Rect width is estimated, not measured** — this is string-generated SVG with no DOM, so `getBBox()`
isn't available: `0.58 × font-size` per character + 2px padding each side, height `fs × 1.25`,
`y − fs×0.95`, `rx=2`, sized from the already-`.slice()`d rendered string. Documented in a source
comment. Known to undershoot slightly on the **bold** device name and "BiDi" labels, and on all-caps
port labels (Verdana caps run wider than 0.58em); overshoots slightly on lowercase/digit-heavy labels.
Error scales with length, so labels at the slice limits (22/15/10/8 chars) are the worst case. Do not
derive any position from this estimate.

All pre-existing coordinates, font-sizes, fills, text-anchors and path `d`s are byte-identical —
verified as sorted-set comparisons against the pre-change build.

### Fixture regeneration (deliberate, diff-reviewed)

This changes the Rack Guide's signal-flow diagram, so v6.11.5's byte-identity fixtures were
regenerated via `node test_report_scoped.js <build> --capture`. **The diff was reviewed before
capture, per the documented gate**, and confirmed confined:

- With every `<svg>` block excised, the remainder of both fixtures is **byte-identical** (synth 12,969
  bytes, real 50,643 bytes, matching md5) — nothing in the overview, trunks, network, edge, schedule,
  build-order or config sections moved.
- Both fixtures contain 7 SVG blocks before and after; **6 of 7 are byte-identical** in each. Only
  block 6 — the signal-flow diagram — changed. All rack elevation SVGs untouched.
- Changed element tags across both diffs: `<text>` and `<rect>` only, nothing else.

Future sessions changing this diagram should run the same three checks before re-capturing; a capture
without a reviewed diff can silently bless an unrelated regression, which is the one real hazard of a
byte-identity guard.

### Tests

New `suite/test_label_legibility.js` (**144 assertions**): the `--label-scrim` triplet incl. a check
that each value is exactly 50% alpha of that theme's own `--panel`; all five lifted selectors'
position/z-index/scrim/box arithmetic; the `.node`-is-not-a-stacking-context guard; the `#wires`
no-`z-index` regression guard; `.rack-group`/`.rack-node` expectations; builder hook classes
(`.node-title` present, `.rg-title` on rack-*groups* only, absent from `buildRackNode`);
`#wireLabelLayer` structure/ordering; trace-class baking; label type-fallback and the `wireLabels`
toggle; and the export's three-pass ordering, rect/text pairing, dark/light polarity, `svgTextBg`
behaviour, and a coordinate-identity guard (hardcoded hashes `0cebb9d013bd482e` for the text tuples
and `89b995eb7617f048` for the path `d`s, both verified equal to the pre-change build, plus two
spelled-out exact values so a future mismatch is debuggable). Run against the *pre-change* build it
fails 25 assertions then crashes on missing markup — i.e. it is load-bearing, not vacuously green.

Two existing files updated for the new contract, coverage otherwise intact:
`test_cable_hit_target.js` 24 → 26 (the "label lives inside the group" assertion became three:
not-in-`.wire-grp`, in-`#wireLabelLayer`, no label text anywhere in the group) and
`test_clarity_theme.js` 40 → 42 (`lblOf` helper re-pointed at the label layer; same three-way split).

**Real-browser spot-checks still recommended** (standing jsdom gaps): the scrim's actual contrast on
all three themes, the net-zero box arithmetic as *rendered* (jsdom has no layout engine — the claim is
verified by CSS arithmetic, not measurement), and the export rects' fit at print scale given the
width estimate above.


## v6.12.1 — horizontal-run (Y-lane) separation for BiDi cables

User report (screenshot): two same-colour teal cables running Unifi Flex -> Custom Patch Panel, both
ending on **bottom-edge BiDi ports**, ran the full width of the canvas hugging each other so they read
as one line -- untraceable. Diagnosed, fix approach confirmed with the user (general y-lane pass, not a
targeted patch), then implemented. Checkpoint A (y-lane alone): `DLux Rackmaster 0235PM 072226.html`
(md5 `005bd83d6132a4afba8617c8a99b92fd`, 1,191,054 bytes).

### Root cause

The orthogonal router draws each cable as: source stub -> horizontal leg -> vertical corridor ->
horizontal leg -> dest stub. `assignWireLanes()` separates parallel cables by offsetting the **vertical
corridor's x** (`WIRE_LANE_GAP` = 28px per cable). BiDi ports exit **downward** (`portExitDir()` ->
`"down"`), so two cables between the same pair of bottom-edge BiDi ports have down-stubs that reach an
identical y (shared node bottom edge +/- `STUB`), and their **horizontal legs coincide on that shared y**.
An x-offset cannot separate two lines that share a y -- it only moves the short vertical corridor, which
isn't the segment the eye follows. Empirically (real project): three teal cables had corridors correctly
28px apart in x but ~510-540px of dead-coincident horizontal overlap per pair, because BOTH legs
(source-side at `sa.y`, dest-side at `sb.y`) sat exactly on top of each other. v6.6.1 explicitly scoped
out "horizontal-run lanes" on the assumption that horizontal runs only occur in the trivial straight-line
case; bottom-exit BiDi ports are the case that breaks that assumption. Not a regression from v6.12.

### The fix — a Y-lane pass mirroring the X-lane pass

For each cable **end that exits down/up**, stagger that end's **stub length** so its horizontal leg sits
at its own y, spaced the same 28px the corridors use. New helpers after `assignWireLanes()`:
`wireStubBandKey(y)` (buckets a leg y into ~24px bands, mirroring `wireCorridorKey`),
`buildWireStubEnds(items, laneX)` (collects the participating down/up ends), and
`assignWireStubLanes(...)` (groups + staggers). `STUB` (42) was lifted from a local in `wireStubPts` to a
module const so the pass can grow it. `wireStubPts(a,b,stubA,stubB)` and
`wirePathOrthogonal(a,b,connId,laneX,stubA,stubB)` gained optional per-end stub lengths (default `STUB`);
`wirePath()` forwards them; 4-arg callers (ghost preview, tests, and `routingSVG`'s reuse) are unchanged.
`drawWires()` computes the per-end stubs after the x-lane pass and passes them; `routingSVG()` mirrors it
so the Rack Guide diagram benefits too.

Design decisions worth not re-litigating:

- **Per-END, independent grouping.** A cable's source-side and dest-side legs belong to different buses
  (cables leaving one edge vs entering another), so source and dest ends are grouped separately.
- **Only down/up ends participate.** Left/right-exit ends keep the base stub -- their legs are already
  y-separated by port position (ports stack vertically ~25px apart), which is exactly why left/right runs
  fan out fine and never needed this.
- **Grow-only stagger** (`STUB + laneIndex*28`, downward for "down" / upward for "up"), never
  centre-and-shrink: a shortened stub could pull a leg up into the node body or its BiDi label zone.
- **Deterministic sort** by the other end's position (x, then y, then id) -- a pure function of geometry +
  id, never draw order, so redraws never swap lanes.
- **Byte-identity invariant:** an end alone in its band gets exactly base `STUB`, so a cable that doesn't
  bunch is byte-identical to before. This preserves the 526 pinned assertions in `test_orthogonal_wires.js`
  and every other path-`d` pin. For down/up exits the stub is vertical, so changing its length never moves
  the stub-end x -> no feedback loop with the x-lane pass (`prefX` unaffected). `collapseCollinear` /
  `hasReversalOrOverlap` / `simpleOrthogonalPts` fallback guards still wrap everything.

### Results

Real project: the teal trio's source legs went from all-coincident at y=1988.67 to 2044.67 / 2072.67 /
2100.67 (28px apart), dest legs from all-coincident at y=707.98 to 903.98 / 931.98 / 959.98, corridors
unchanged at 3086 / 3114 / 3142. **Whole-project coincident horizontal overlap: 57,947px -> 304px**
(canvas), 23,463px -> 699px (export); the residual is band-boundary/x-disjoint cases matching the x-pass's
own tolerance. 19 of 31 cables shifted (the LX Network rig has many BiDi network cables sharing bottom
edges); relative spacing stays exactly 28px, grow-only keeps every leg clear of node bodies.

### Tests

New `test_ylane_separation.js` (35 assertions): solo-cable byte-identity vs the pre-change build, the real
teal-bus before/after leg-y separation on both sides + corridor preservation, determinism (redraw +
shuffled `S.connections`), grow-only/min==STUB on a controlled synthetic cluster, left/right-ends
untouched, valid axis-aligned grammar, direct/inverted-branch skip. Fails 16 of 35 against the pre-change
build (feature + unit asserts) -> load-bearing, not vacuous. Rack Guide fixtures regenerated (diff-gated:
only the signal-flow SVG block changed, only `<path>` tags, path `d`s... actually the geometry moved so
the `d`s changed, but every non-signal-flow byte and all six elevation SVGs are identical). Full suite at
this checkpoint: 38 files green.

## v6.12.2 — per-bus same-colour shade variation (render-only)

Follow-on to v6.12.1, same session, user-approved alongside the y-lane fix: even once spatially
separated, several same-colour cables in one bus are hard to tell apart. Add a subtle per-cable lightness
step so each is individually distinguishable while still reading as the same colour/category. Final build:
`DLux Rackmaster 0259PM 072226.html` (md5 `98ea9cba74d5467a4083e27e92d6df8c`, 1,196,685 bytes).

- **Render-only, never mutates `c.color`.** The variation is computed at draw time and applied only to the
  emitted `stroke`; the data model, Export Project JSON, cable schedule CSV, legend and inspector swatch
  all still show the true colour. Verified: `S.connections[].color` is unchanged after both `render()` and
  `routingSVG()`.
- **Grouping = the x-corridor lane bucket** (`wireCorridorKey(prefX)`), subdivided by true colour; only a
  same-colour subgroup of size >= 2 is varied. This is deliberately the lowest-false-positive choice: a
  cable is shaded only when the lane pass itself couldn't separate it (same corridor). Cables that
  obstacle-avoidance already pushed into distinct bands, isolated cables, and the only-one-of-its-colour in
  a bus all render their exact base colour (byte-identical stroke).
- **Hue + saturation preserved, lightness stepped.** New helpers after `assignWireLanes()`:
  `assignWireShades(entries, colorById)` -> `Map<connId, hex>`, `shadeHexLightness(hex, dl)`, and
  `_wsHexRgb`/`_wsRgbHex`/`_wsRgbToHsl`/`_wsHslToRgb`. Constants: `WIRE_SHADE_MAX_L` = 0.06 (max +/-6pt L
  from group centre, ~12pt total spread), clamp `[0.12, 0.88]` so it never blows to near-white/black. The
  middle cable of an odd group returns the true colour verbatim; `dl===0` and non-`#rrggbb` inputs return
  the input unchanged. Deterministic: lightness is a pure function of sorted index within the colour-group
  and group size, never draw order.
- **Both surfaces via one shared helper.** `drawWires()` emits
  `stroke="${esc((shadeMap && shadeMap.get(c.id)) || c.color)}"`; `routingSVG()` mirrors it. Known, honest
  divergence: the canvas reads live DOM rects while the export uses an analytic 200px-wide layout, so the
  two surfaces' lane passes sometimes bucket a given set of cables differently -- each surface shades
  exactly the bus *its own* lane pass forms (intended "vary only where actually bunched" behaviour), so a
  trio bunched on the canvas may render un-shaded in the export if the export's layout already separated
  them. Not a helper divergence -- both call the identical `assignWireShades`.
- **Real project:** the teal `#3fa46c` bus renders `#378e5d` / `#3fa46c` (middle = true) / `#49b97b` --
  three distinct hexes, H/S within rounding, L symmetric at +/-0.06.

### Tests

New `test_wire_shade_variation.js` (38 assertions): `shadeHexLightness` unit (dl=0 no-op, lighten/darken,
hue+sat preservation, clamps, non-hex passthrough), `assignWireShades` unit (3-same-colour
distinct/symmetric/even/middle==base, all-distinct untouched, lone untouched, determinism-on-shuffle),
real teal bus, byte-identity vs the y-lane-only build, no-state-mutation after render + routingSVG,
render-level determinism, export parity (robust to the layout divergence above). Fails 24 of 38 against
the pre-shade build -> load-bearing. Rack Guide fixtures regenerated once more (diff-gated: only the
signal-flow SVG block changed, only `<path>` `stroke=` hex values -- path `d` geometry byte-identical,
non-SVG remainder and all elevation SVGs identical). **Full suite: 38 files, 1,736 assertions, all green;
real-project validator 7/7.**

Real-browser spot-check recommended: that the 12pt lightness spread is actually distinguishable yet still
reads as one colour on all three themes, and that the y-lane fan looks right on a dense rig.
