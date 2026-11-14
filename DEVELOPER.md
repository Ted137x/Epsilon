# Epsilon developer guide

How the code is organised, how an animation gets from the editor to the screen, and
how to change each part. Using the editor is covered in [README.md](README.md).

## The big picture

```
 Editor (browser)            Compiler                 Toy (ESP32-C6)
 project JSON  ───────►  EPS2 binary pack  ───────►  epsilon_player.h
 scr/model.js            scr/compiler.js             renders every frame
                          tools/epsc.mjs              + motion.h tilt
                                 │
                                 └──► scr/player.js (emulator: same renderer in JS)
```

- The **project** is plain JSON: layers with keyframed properties. The editor works on it directly.
- The **compiler** turns one or more projects into a compact binary **pack**. It runs in the browser (Export) and in Node (`tools/epsc.mjs`).
- The **player** reads the pack and draws frames with integer maths only, because the ESP32-C6 has no floating-point unit. It exists twice: `scr/player.js` for the emulator and `firmware/epsilon_firmware/epsilon_player.h` for the toy. They are line-for-line ports, and a test proves they draw identical pixels.

The animator never deals with 3D. The toy evaluates every property each frame, then
rotates the result by the spring-driven tilt and projects it, so motion stays smooth and
the files stay tiny. A three-animation pack is about 1.2 KB.

## Folder map

| Path | What it does |
|---|---|
| `index.html`, `main.js` | Page layout; creates the five p5 canvases. |
| `scr/functions.js` | Pure maths: easing curves, Bézier, 2D matrices, hit tests. |
| `scr/model.js` | The data model: layers, tracks, evaluation, edits that keep keyframes consistent, file validation and migration. |
| `scr/states.js` | App state: the open project, selection, playhead, undo/redo, change events. |
| `scr/editor.js` | Main canvas: drawing tools, transform handles, path editing. |
| `scr/timeline.js` | Ruler and track area: properties, keyframes, layer bars. |
| `scr/curves.js` | Easing panel and presets. |
| `scr/inspector.js` | Numeric property fields, project settings, colour variants. |
| `scr/emulator.js` | Compiles the project and shows the player's real framebuffer; shake preview. |
| `scr/ui.js` | Top bar, tool buttons, layer list, every keyboard shortcut. |
| `scr/compiler.js` | Project → EPS2 bytes, pack, C header. |
| `scr/player.js` | EPS2 renderer in JS. |
| `firmware/epsilon_firmware/` | The Arduino sketch (see Firmware below). |
| `tools/serve.mjs` | Local web server for the editor. |
| `tools/epsc.mjs` | Command-line compiler: `node tools/epsc.mjs <files or folders> -o out.h` (or `out.bin`). |
| `tools/make-examples.mjs` | Regenerates `examples/`. |
| `tests/` | `node --test tests/`. See Tests. |

There is no build step and no npm dependency. The editor uses p5.js 2.x from `lib/`.

## Data model (`scr/model.js`)

```js
project = {
  version: 2, name, duration /* ms */, fps,
  variants: [{ name, colors: ["#rrggbb", ...] }],   // colour slot 0 = background
  layers: [Layer, ...]                              // layers[0] is drawn first (bottom)
}

Layer = {
  id, name, type: "ellipse" | "rect" | "path",
  in, out,                                          // visible while in <= t < out (ms)
  props: { anchor, position, scale, rotation, depth, fill, size | path }  // each a Track
}

Track = { value, keys: [{ id, t, v, c }] }
```

- A track with no keys uses `value`; otherwise its keys. `v` has the same shape as `value`.
- `c` is the easing curve `[x1, y1, x2, y2]` (CSS cubic-bezier) from this key to the next.
- Units in the editor: pixels from the screen centre with y up, scale in percent, rotation in degrees clockwise, depth in pixels behind the screen, fill as a palette slot index.
- A **path** value is a list of vertices `{ x, y, ix, iy, ox, oy }`. The in/out handles are offsets from the vertex, as in After Effects. A path key can also carry `vc`, one curve per vertex (or `null` to use `c`), for per-point easing.

`propsOf(layer)` gives the property names in timeline order. `PROPS` has their labels,
dimensions and units.

### Evaluation

- `evalTrack(track, t)` gives the value at time t: hold before the first key and after the last, otherwise ease between the two keys around t.
- `transformAt(layer, t)` builds the 2D matrix: move the anchor to the origin, scale, rotate, then translate to the position. This is After Effects' order.
- `localVertices(layer, t)` gives the outline as Bézier vertices in layer space. Ellipses become 4 vertices with circle handles, rectangles 4 corners.
- `worldOutline(layer, t)` gives the flattened outline in screen space.

The editor uses these float versions for drawing and hit tests. The emulator shows the
integer player, which is the truth.

### Editing rules

All edits go through model functions so that keyframes stay consistent:

| Function | Rule |
|---|---|
| `setValue(track, value, t, tol)` | The After Effects stopwatch rule. With no keys it changes `value`. With keys, it edits the key within `tol` of t (half a frame), or inserts a new key there. |
| `addKey`, `toggleAnimated`, `removeKeys` | Add a key with the current value; turn the stopwatch on or off; delete keys. Deleting the last key keeps the current value. |
| `insertVertex(layer, i, u)` | Splits segment i at u with de Casteljau, in the static value and every key, so the shape does not change. |
| `removeVertices`, `convertToPath` | Act on every key at once, so all keys always have the same number of points. |

`states.setProp(layer, name, value)` is the shortcut panels use: `setValue` at the playhead.

### Files and migration

`validateProject(json)` checks everything the renderer will trust and throws on bad
input. Version 1 files (the old polygon format) are migrated to path layers
automatically. Bump `version` and add a migration step there when the format changes.

## Editor state (`scr/states.js`)

- `project` is a live export binding. Always read it as `project`, never cache it, because undo replaces the object.
- `programState` holds UI state: playhead `time`, `playing`, current `tool`, and the selections.
  - `layers`: a set of ids.
  - `vertices`: indices on the active path.
  - `keys`: strings `"layerId|prop|keyId|vertex"`, where vertex is -1 for the whole key.
- `refresh()` notifies listeners after a change that is not an undo step, such as selection or a mid-drag update. `commit()` ends a user gesture: it records undo, autosaves to `localStorage` and refreshes.
- Time is in ms. `snapTime` / `setTime` / `stepFrames` keep the playhead on frame boundaries, so "on a keyframe" checks are reliable.

The p5 panels redraw every frame from this state. The DOM panels (Inspector, layer
list) rebuild when `onChange` fires.

## EPS2 binary format (`scr/compiler.js`)

Little-endian and unaligned, so read it byte by byte. The firmware reads it straight
from flash.

**Pack**

| Field | Type |
|---|---|
| magic `"EPS2"` (0x32535045) | u32 |
| animation count | u16 |
| reserved | u16 |
| byte offset of each animation | u32 × count |

**Animation**

| Field | Type |
|---|---|
| duration, ms (≤ 60000) | u16 |
| layer count | u16 |
| curve count, palette slots, variant count, fps | u8 × 4 |
| curves: easing baked to 33 samples, Q14 | i16 × 33 each |
| palettes: RGB565, variant-major | u16 × variants × slots |
| layers | see below |

Baking curves means the toy never solves Bézier timing at runtime. Identical curves
are stored once.

**Layer**

| Field | Type |
|---|---|
| type: 0 ellipse, 1 rect, 2 path | u8 |
| reserved | u8 |
| in, out (ms) | u16, u16 |
| tracks: anchor (2), position (2), scale (2), rotation (1), depth (1), fill (1) | track |
| then size (2) for ellipse/rect, or a path track | track |

**Track** (dimension d)

| Field | Type |
|---|---|
| key count n | u8 |
| if n > 1: key times | u16 × n |
| if n > 1: curve index per segment | u8 × (n−1) |
| values | see below |

**Path track**

| Field | Type |
|---|---|
| vertex count nv (3..128), key count n, flags (bit 0: per-vertex curves) | u8 × 3 |
| if n > 1: times, then curve indices | (n−1) × (nv if per-vertex, else 1) |
| values, 6 per vertex: x, y, in x, in y, out x, out y | see below |

**Values**: the first key is written in full as i16. Each later key starts with a mode
byte: 0 = same as the previous key (no data), 1 = i8 deltas, 2 = i16 absolute values.

**Integer units**: position, anchor, size and path coordinates in quarter pixels; scale
in 1/4096 (4096 = 100%); rotation in tenths of a degree; depth in whole pixels; fill as a
slot index.

## The renderer (`player.js` / `epsilon_player.h`)

Per frame, `render(t, tiltX, tiltY, tiltZ)`:

1. Clear last frame's changed rectangle to the background colour.
2. For each layer with `in <= t < out`:
   1. Evaluate anchor, position, scale, rotation, depth and fill. Find the key segment, look up the eased progress in the baked curve, then interpolate.
   2. Build the outline in layer space: 32 points for an ellipse, 4 for a rectangle, or a path flattened at 8 points per curved segment (straight segments add 1).
   3. Apply anchor → scale → rotate → position.
   4. Rotate in 3D by the tilt (one Q14 matrix for the frame), add perspective (`FOV` 250, `SCALE` 150, depth 0 at z = −100, which projects 1:1), and convert to Q4 screen coordinates.
   5. Fill with a scanline even-odd fill sampled at pixel centres. It cannot hang on self-crossing shapes, and it tracks the changed rectangle.
3. Return the union of the old and new changed rectangles, so the firmware only sends that part to the display.

Fixed-point conventions: trig and easing in Q14 (16384 = 1.0), angles in 1/65536 of a
turn, sine from a 257-entry quarter table. Clamps before each multiply keep every product
inside 32 bits; keep them when you edit the maths.

Limits: 1024 outline points per layer, 128 path vertices, 255 keys per property, 255
curves per animation, and `POOL_BYTES` (120 KB) of decoded animation data. The compiler
reports when a project goes past them; the editor shows usage in the status bar.

## Firmware (`firmware/epsilon_firmware/`)

| File | Contents |
|---|---|
| `config.h` | Pins, SPI speed, display rotation, gyro axis signs, spring constants, playback settings. Start here. |
| `display.h` | `Display`: the LovyanGFX panel setup, a 240×240 sprite as the frame buffer, `push(rect)` to send only a changed area, `message(text)`. |
| `motion.h` | `Motion`: MPU6050 setup and gyro calibration, plus three `Spring`s that turn rotation speed into the lagging tilt. |
| `epsilon_player.h` | `eps::Player`, the renderer. No Arduino includes. |
| `animations_data.h` | Generated pack (`EPS_PACK`, `EPS_PACK_SIZE`). |
| `epsilon_firmware.ino` | Glue: setup, the frame loop, animation switching, serial commands, debug cube. |

### Player API

```cpp
eps::Player<true> player(EPS_PACK, display.buffer()); // true: byte-swapped RGB565 (LovyanGFX)

player.valid();               // pack magic is correct
player.count();               // animations in the pack
player.load(index, variant);  // decode into RAM; false if it does not fit
player.variants();            // colour variants of the loaded animation
player.duration();            // ms
eps::Rect r = player.render(timeMs, tiltX, tiltY, tiltZ); // angles in 1/65536 turn
player.invalidate();          // repaint everything on the next render
player.project(x, y, z, sx, sy); // Q2 world point to Q4 screen, for your own overlays
```

The player holds its RAM pool inside the object, so create it once with `new` as the
sketch does. Do not put it on the stack.

### Common changes

- **Wrong tilt direction**: flip `AXIS_X/Y/Z` in `config.h`.
- **Feel of the motion**: tune the spring in the emulator, then copy the numbers into `config.h`.
- **Pick animations another way** (a button, a timer, shake detection): replace `nextAnimation()` and `animationTime()` in the `.ino`. Call `player->load(i, v)`, then `display.pushAll()`.
- **Draw something over the animation**: after `render()`, draw into `display.frame`, call `player->invalidate()` for the next frame, and push the full frame, as the debug cube does.
- **Faster display**: set `SPI_HZ` to 80 MHz in `config.h` once the wiring is short.

## Extending the editor

**Add a property** (for example opacity-like effects or a new transform):

1. `model.js`: add it to `PROPS`, `propsOf()` and the default in `makeLayer()`, and check it in `validateProject()`. Add a migration if old files lack it.
2. `compiler.js`: add an `ENCODE` entry and write the track in the layer loop in the right order.
3. `player.js` **and** `epsilon_player.h`: read the track in `load()` and use it in `render()`.
4. Run the tests. The parity test fails until both players agree.

**Add a layer type**: add it to `TYPES` in the compiler, make `localVertices()` in
`model.js` describe it for the editor, and add its outline to `outline()` in both players.
Then add a tool in `editor.js` and `ui.js`.

**Change the binary format**: change the magic or version, update both players, and
update the tables in this file.

## Tests

```bash
node --test tests/
```

- `tests/engine.test.mjs` covers rendering, the model's editing rules, migration and validation.
- `tests/parity.test.mjs` compiles `epsilon_player.h` for your PC and compares every frame of every example and colour variant with `player.js`. It needs a C++ compiler in `EPS_CXX`, for example `EPS_CXX="zig c++"` or `EPS_CXX=g++`; without one it is skipped.

If you add a feature to the renderer, add it to `tools/make-examples.mjs`
(`node tools/make-examples.mjs`) so the parity test covers it.

## Conventions

- Everything in this repository is in English.
- Plain ES modules in the browser; no bundler, no framework.
- Keep `player.js` and `epsilon_player.h` in step. Name things the same in both.
- Integer-only maths in the player.
