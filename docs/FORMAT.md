# Epsilon pack format (EPS1)

Little-endian. Fields are not aligned, so read them byte by byte.

## Pack

| Field | Type |
|---|---|
| magic `EPS1` | u32 |
| animation count | u16 |
| reserved | u16 |
| offset of each animation from pack start | u32[count] |

## Animation

| Field | Type |
|---|---|
| duration, ms (max 60000) | u16 |
| shape count | u16 |
| curve count | u8 |
| palette slots | u8 |
| variant count | u8 |
| reserved | u8 |
| curves | i16[33] each |
| palettes, RGB565 | u16[variants][slots] |
| shapes | see below |

A curve is its easing baked to 33 Q14 samples, so the firmware has no bezier maths.
Curves are deduplicated within an animation. Palette slot 0 is the background.

## Shape

Shapes are stored back to front.

| Field | Type |
|---|---|
| flags: bit 0 per-point curves, bit 1 constant depth | u8 |
| points (3..255) | u8 |
| keys (1..255) | u8 |
| colour keys | u8 |
| visible from / to, ms | u16, u16 |
| colour keys: time, slot | (u16, u8)[n] |
| key times | u16[keys] |
| depth, pixels | i16[1 or keys] |
| curve index per segment | u8[(keys-1) * (1 or points)] |
| first key x, y | i16[points * 2] |
| later keys | mode u8, then deltas from the previous key |

Coordinates are Q2 (quarter pixels) from the display centre, y up.
Delta modes: 0 unchanged (no data), 1 i8, 2 i16.

## Rendering

Per frame, integer only: pick the key segment, ease with the curve table, rotate with
a Q14 matrix (X, then Y, then Z), project with `FOV` 250 and `SCALE` 150, then scanline
even-odd fill sampled at pixel centres from Q4 coordinates. Depth -100 draws at 1:1.

Changing the format means changing `scr/compiler.js`, `scr/player.js` and
`firmware/epsilon_firmware/epsilon_player.h` together.
