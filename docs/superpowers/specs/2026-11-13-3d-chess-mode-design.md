# 3D Chess Mode — Design

## Intent

Chesshub currently renders the board as flat 2D squares (DOM divs + SVG piece
images). The site owner wants a **"3D Mode"** toggle that replaces this with a
photorealistic 3D scene — a real chess set viewed from roughly a seated
player's height — reusing the Poly Haven "Chess Set" asset already downloaded
into `public/textures/chess_set_4k.blend/textures/chess_set_4k.gltf/`. The
appeal is immersion: being able to orbit the camera around the board like
walking around a real tournament table, and watching pieces glide across the
board instead of teleporting.

This is a presentation-layer feature only. No chess rule, network protocol,
bot logic, or game state changes. It is purely a new way of drawing the
position that already exists in `state.game` (chess.js).

## Why this architecture is cheap to build

The whole site already funnels every board-using page through **one shared
`BoardView` instance** (`const board = new BoardView($("board-wrap"))` in
`main.js`), reused by calling `board.draw({...})` with different state. Every
page that shows a board — Play, Review/Analysis, Puzzles, Watch, Daily,
Learn — calls this same object. There is only one `#board-wrap` element in
the DOM; `showPage()` just shows/hides the surrounding `#game-layout` and
swaps which `.page-panel` is visible next to it.

This means: **a drop-in alternative renderer that exposes the same external
surface as `BoardView` automatically works everywhere a board appears**,
with no changes needed in `main.js`, `review.js`, `puzzles.js`, `watch.js`,
`daily.js`, or `learn.js`.

## Goals

- A global **"3D Mode"** toggle (persisted in `settings`, like other display
  prefs in `settings.js`) that switches the board rendering site-wide.
- Applies everywhere the shared `board` object is used: **Play** (bot games,
  Pass & Play, online), **Review/Analysis**, **Puzzles**, and — as a free
  consequence of the shared-renderer architecture — **Watch**, **Daily**,
  **Learn** too.
- Photorealistic materials/lighting using the already-downloaded Poly Haven
  glTF chess set (PBR diffuse/normal/roughness-metalness maps for board,
  white pieces, black pieces).
- Left-click (or tap) select-and-move, functionally identical to today:
  same legal-move rules, same `onMove(from, to, promotion)` callback contract
  piece selection reuses chess.js's `moves({square, verbose:true})` exactly
  as `BoardView.legalMovesFrom` does today.
- Legal destination squares for a selected piece get a soft beige highlight
  decal on the 3D board surface (not the red/green/blue move-quality
  coloring — that stays 2D-only for v1, see Non-goals).
- Camera: holding the **right mouse button** (or a **two-finger drag** on
  touch/trackpad) orbits freely 360° in azimuth around the board's center,
  with polar angle clamped so the camera can't flip below the table or go
  to a flat top-down view — it stays roughly at a seated, looking-slightly-
  down height. Left-click/tap is never captured by the camera control.
- Every move animates: the piece tweens smoothly (eased, ~250–350ms) from
  its source square's world position to its destination's, rather than
  jumping. This covers:
  - normal moves and captures (captured piece fades/shrinks out at the
    moment the attacker arrives),
  - castling (king and rook tween simultaneously),
  - en passant (the captured pawn, on a different square than the
    destination, is removed with the same fade),
  - promotion (the pawn mesh swaps to the promoted piece's mesh at the end
    of the slide).
- Variant/mode fallback: if the active game is a variant whose board
  interaction the 3D scene doesn't model (see Non-goals — crazyhouse pocket
  drops, and other non-8×8/non-standard-movement variants), 3D Mode
  silently falls back to the existing 2D `BoardView` for that game only.
  The user's 3D Mode setting stays on; it just doesn't apply to that one
  variant.

## Non-goals / explicitly dropped for v1

- **Arrows and square-marks** (today's right-click-drag / right-click
  feature on the 2D board) are **dropped entirely** in 3D Mode, per explicit
  decision — right-click is now the camera control, and remapping
  arrows/marks to another input is out of scope for v1.
- **Move-quality coloring** (green/okay/blue/red destination squares) is
  2D-only for v1. 3D Mode only shows the plain beige legal-move highlight.
- **Crazyhouse piece drops from a pocket** are not modeled in the 3D scene
  (there's no pocket tray in the scene). Crazyhouse games automatically use
  the existing 2D board regardless of the 3D Mode setting.
- **Premove visuals** (the dashed premove highlight) are not reproduced in
  3D for v1; premove *logic* (queueing a move for when it becomes your
  turn) keeps working since that's unrelated to rendering, but it won't be
  visually marked on the 3D board.
- Lesson stars/badges (`opts.stars`, `opts.badge`, used by `learn.js` and
  Game Review mistake markers) are not rendered in 3D for v1.
- No attempt to reproduce the cluttered desk/props from the reference
  screenshots (camera, film canister, notebooks, etc.) — those are flavor
  in a promotional photo, not a specified requirement, and would need
  additional modeled assets. The environment is a clean, neutral
  studio-style setting: the board and a simple table-like surface under
  good soft lighting.
- No device-capability detection / auto-disable on low-end hardware. The
  toggle is manual; if it runs poorly on a given device that's a known v1
  limitation, not something this design solves.

## Assets (already in the repo)

`public/textures/chess_set_4k.blend/textures/chess_set_4k.gltf/`:
- `chess_set_4k.gltf` + `chess_set.bin` — verified: 32 individually named
  piece nodes (`piece_pawn_white_01`, `piece_king_black`, ...) plus one
  `board` node, three materials (`chess_set_pieces_white`,
  `chess_set_board`, `chess_set_pieces_black`), each a standard glTF
  metallic-roughness PBR material with normal + base-color + packed
  metallic-roughness textures, referenced via correct relative `uri`s into
  the sibling `textures/` folder. GLTFLoader can load this with no manual
  texture wiring.
- The glTF's own per-node transforms place all 32 pieces at the *starting*
  position. The 3D renderer ignores those baked transforms for gameplay
  purposes: at load time it clones one representative geometry per
  (piece type × color) — e.g. one white-pawn mesh, one black-knight mesh —
  and instances/repositions clones to match `chess.board()` on every draw,
  the same way `BoardView.render()` walks all 64 squares today.
- `beige_wall_001_*` and `floor_tiles_06_*` textures are **not used** by
  this design (see Non-goals: no cluttered room/floor scene).

No additional asset downloads are required for v1.

## Library integration

Follow the existing convention in `scripts/build-libs.mjs` (which already
bundles the `chessops` npm package into a global `window.Chessops` via
esbuild, loaded as a plain `<script>` — the same pattern as `chess.js`
being a pre-built global script in `public/lib/`).

- Add `three` to `package.json` dependencies.
- Add a new entry to `build-libs.mjs` that bundles `three` plus
  `three/examples/jsm/loaders/GLTFLoader.js` into a single IIFE global,
  e.g. `window.THREE` (with `THREE.GLTFLoader` attached), output to
  `public/lib/three.js`.
- Load it via `<script src="lib/three.js">` in `index.html`, same section
  as `chess.js` and the other prebuilt libs, before the new 3D renderer
  script.
- No orbit-controls library needed — the custom right-drag-only, clamped,
  single-target orbit behavior is simple enough to hand-write (~60 lines)
  against raw pointer events, consistent with how `BoardView` already
  hand-rolls its own pointer handling rather than pulling in a drag-and-drop
  library.

## Renderer architecture

A new `public/js/board3d.js` defines a `Board3D` class with the **same
external surface `BoardView` exposes**, so it's a drop-in swap:

- `draw(opts)` — same `opts` shape (`chess`, `flipped`, `lastMove`,
  `interactive`, `movableColor`, `animate: {from, to}`, `premove`,
  `premoveMoves`). Ignores the surface it doesn't support (`stars`,
  `badge`, `dropPiece`) per Non-goals.
- `onMove` — same callback contract, called the same way.
- `showHint(move)` — can either show the hint arrow as a simple highlighted
  destination square (consistent with the "no arrows" decision) or be a
  no-op in 3D; implementer's call, not gameplay-relevant.
- `arrows` / `marks` — present as inert no-op stand-ins (empty array /
  `Set`-like object with `.clear()`) so existing call sites that do
  `board.arrows = []` / `board.marks.clear()` don't throw, even though 3D
  never draws them.

`main.js` gets a thin **facade**: the module-level `board` binding becomes
an object that forwards every call to whichever of `BoardView`/`Board3D` is
currently active, based on `settings.board3D` (flipping instantly if the
user toggles the setting mid-session) and on whether the active game is a
fallback case (crazyhouse → always force the 2D instance regardless of the
setting). This is the one small, deliberate change to `main.js`; every
other file keeps calling `board.draw(...)` / `board.onMove = ...` exactly
as today, unaware of which renderer is live.

The `Board3D` instance owns one `THREE.WebGLRenderer` + `THREE.Scene` +
camera created once (expensive to recreate) and reused across page
switches — `draw()` just updates piece positions/materials and the camera
stays wherever the user left it (a page switch doesn't reset the view,
consistent with "walking around the table" being a persistent, exploratory
action rather than a per-page reset).

## Visual + interaction details left to the builder

These are deliberately not over-specified, since they're the "make it
pleasing to look at" part the person asked for and are easier to tune by
looking at the result than to pin down numerically up front:

- Exact camera distance/FOV/default height per page, lighting rig
  (likely: one soft key light + fill + `THREE.PMREMGenerator` /
  `RoomEnvironment`-style ambient environment for non-flat PBR response,
  since no HDRI was downloaded and the materials aren't metallic so a full
  reflection environment isn't critical).
- Shape/size/opacity of the beige legal-move highlight decal.
- Easing curve and exact duration for the move tween (goal: "pleasing",
  not a specific curve).
- Whether scroll-wheel zoom is added alongside orbit (not requested, but a
  natural, low-risk addition if it falls out easily).
- Loading-state treatment while the glTF/textures fetch on first visit to
  a 3D page (e.g. a brief spinner over the board area).

## Toggle placement

A new setting `board3D: false` added to `DEFAULT_SETTINGS` in
`settings.js`, persisted the same way as the rest (`localStorage` via
`saveSettings()`). Surfaced as a toggle switch on the Settings page using
the existing settings-row UI pattern, plus (implementer's call) optionally
a quicker-access button near the board itself, since this is a more
visually dramatic/discoverable feature than a buried settings checkbox.
