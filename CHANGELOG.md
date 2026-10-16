# Changelog

## Unreleased

- The scripts are now published under the Transversal name (script headers, read-me, license holder).
- New home: github.com/transversal-tools/after-effects-scripts. The old address under pdrmafra stays as it was.
- Shape to Stroke: thin rotated bars read back from After Effects are recognised again (path points are stored as 32-bit floats; the rectangle checks now tolerate that rounding).
- Depth Map: Depth Sweep and sequence Depth Reveal no longer leave an empty "Solids" folder in the project.
- Native AE suites (core, Shape to Stroke, Depth Map) run and passed in AE 26.5; see docs/validation.md.
- Keyframe Tools: the N tile shows its number drawn large (After Effects on macOS ignores font sizes in script panels); click it to type a new value and press Enter.

## 0.4.0-beta.1 — 2026-10-12

Depth Map overhaul.

- One **Generate** button that follows the selection: selected still images get one depth map each, placed above their layer and parented to it, so they match its position, scale and animation; with nothing selected (or a video/precomp layer) the work area becomes a Video Depth Anything sequence. Fixes the window keeping the selection from when it was opened.
- Generation runs in the background, so After Effects stays usable; the panel shows progress and Generate turns into **Cancel**. Cancelling (or closing the window/project) stops Python, imports nothing and deletes that run's files. When it finishes, the window closes with a message saying what was imported and how long it took; failures show the reason.
- Optional **Effect** after generating, built from standard AE effects: **Depth Reveal** (Gradient Wipe driven by depth, near areas first; on an adjustment layer for sequences), **Depth Sweep** (a band of light travels from near to far) and **Parallax** for stills (Displacement Map driven by depth), keyed from the current time.
- Stills reuse an existing depth map for the same image and quality instead of generating again (Option-click Generate to regenerate); the Project panel item is reused too.
- Files always go into a "Depth Maps" folder on disk (next to the saved project, or inside the folder you choose) and into a "Depth Maps" folder in the Project panel.
- Simpler panel: removed Choose Image, Encoder, Clip, Gamma, Blur, Invert, Frame batch and Temporal smoothing (do contrast, blur and invert in AE, where they stay editable; the CLIs keep their flags). New **Still quality** (Normal/High); sequences stay at Normal because higher sizes ran out of GPU memory on Apple Silicon.
- `install.command` sets everything up with a double-click (Python environment, pinned model code, verified Small checkpoints, environment check); verified from an empty folder.
- Newer depth models were compared (Depth Anything 3, MoGe-2, Distill Any Depth); the current Small models at High quality gave the best detail, so they stay.

## 0.3.0-beta.1 — 2026-10-10

- Spacing Keyframes and Stepped Keyframes are now part of Keyframe Tools; the separate scripts and their guide were removed.
- Add Keyframe Tools: a compact dockable ScriptUI panel with icon buttons for Space, Step, Keep every Nth key, keys to layer in/out and trim layers to their keys (in, out or both), plus KBar arguments for each action. Its tiles rearrange into a column, a 3 × 3 square or a single row to fit the panel, never leaving one tile alone. It replaces Pedro's separate Key To In/Out and Trim scripts with safer versions: preflight, collision checks, one Undo group and rollback.
- Trimming ignores layer markers and keeps the last key's frame inside the layer; keys to layer out lands on the layer's last visible frame.

## 0.2.0-beta.1 — 2026-10-09

- Add Shape to Stroke as an explicitly experimental standalone tool, with one canonical build and no version-suffixed copies.
- Recover supported bars/capsules, circular rings/arcs, polygon/rounded frames and angular connectors; retain conservative width/topology checks and full-batch preflight.
- Compact dialog with Keep disabled/Delete, animated Trim Paths, Create and Cancel; remember successful choices. The Reverse option was removed: use AE's Reverse Path Direction on the generated path.
- Frames and angular connectors accept near-uniform thickness: the stroke uses the middle width and each edge may move at most 0.5 local units (2.5% of the width on thin artwork).
- Refuse ring/frame paths with Reverse Path Direction switched on; explain unsupported single-path shapes with one clear message.
- Add applicability map, 106 synthetic fixtures (including an ICONS demo comp with 16 everyday icons), tool-specific Node tests and documented native/render validation.
- Include the experimental build and tests in root `npm run build`, `npm run check` and GitHub CI.
- Font Inspector: the report-save error message now breaks lines correctly.
- Stepped Keyframes: Position samples split the original motion path, so hand-pulled handles no longer loop around the new keys.
- Font Inspector: reused precomps are read once per scan; much faster on heavily nested projects, same report.
- Depth Map: the window warns that After Effects stops responding while generating.
- Shape to Stroke: the replacement keeps the original layer comment and appends its note.
- Illustrative GIFs for Shape to Stroke and Transform to Null, regenerated with `npm run media`.
- Shorter, task-first guides for every tool; technical detail moved to separate pages (Shape to Stroke `TECHNICAL.md`, `docs/development.md`).
- One version for the whole collection; `npm run check` verifies generated headers and test-comp names.
- `npm run package` builds a release ZIP with only the scripts users need, a plain-text read-me, license and changelog.
- Publish the latest source on `main`; keep historical commits/tags for recovery rather than maintaining separate old builds.

## 0.1.0-beta.1 — 2026-10-08

First curated public collection, derived from Pedro's personal scripts. Originals remain unchanged.

- Transform to Null: zero controller pivot, explicit class handling, verified channel copy, unique names, guarded hierarchy transfer and rollback.
- Spacing: explicit selected/all-key scope, composition-frame timing, collision preflight and key-data preservation.
- Stepped: stable original intervals, pre-sampled values, retained existing keys, optional Hold mode and insertion limit.
- Keyframe serialization: property-value-type spatial detection and safe handling of Hold-only Source Text.
- Font Inspector: portable text report/save UI, canonical font names, safer reveal references, scope warnings and timestamp carry fix.
- Depth Map: source-only distribution, environment check, tested dependency pins, safer checkpoint loading, durable output folder selection, finite-value validation, natural sequence order, overwrite protection and complete-sequence markers.
- English usage guides, explicit beta limitations, automated tests and native AE integration fixtures.
