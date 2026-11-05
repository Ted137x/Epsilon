import test from "node:test";
import assert from "node:assert/strict";
import { easeAt, hexTo565, sampleShape } from "../scr/functions.js";
import { compile, pack } from "../scr/compiler.js";
import { Player, isin, icos } from "../scr/player.js";

const LIN = [0.3, 0.3, 0.7, 0.7];
const square = (x, r, c = LIN) => [[-r, -r], [r, -r], [r, r], [-r, r]].map(([a, b]) => ({ x: x + a, y: b, c }));
const project = (over = {}) => ({
  version: 1, name: "t", duration: 2000,
  variants: [{ name: "a", colors: ["#000000", "#ff0000", "#00ff00"] }, { name: "b", colors: ["#101010", "#0000ff", "#ffffff"] }],
  shapes: [{
    id: 1, name: "s", start: 0, end: 2000, colorKeys: [{ t: 0, slot: 1 }],
    keys: [{ id: 2, t: 0, z: -100, pts: square(-40, 20) }, { id: 3, t: 1000, z: -100, pts: square(40, 20) }],
  }],
  ...over,
});
const play = (p, variant = 0) => {
  const { bytes, errors } = compile(p);
  assert.deepEqual(errors, []);
  const player = new Player(pack([bytes]));
  player.load(0, variant);
  return player;
};
const px = (pl, x, y) => pl.fb[y * 240 + x];

test("curve is finite with handles on the box edge, where Newton divided by zero", () => {
  for (const c of [[0, 0, 1, 1], [0, 1, 1, 0], [1, 0, 0, 1], [0, 0, 0, 0]]) {
    for (let x = 0; x <= 1; x += 0.01) assert.ok(Number.isFinite(easeAt(c, x)));
  }
  assert.equal(easeAt(LIN, 0), 0);
  assert.equal(easeAt(LIN, 1), 1);
  assert.ok(Math.abs(easeAt(LIN, 0.5) - 0.5) < 1e-4);
});

test("sampling exactly on a key returns that key, which used to index frame -1", () => {
  const s = project().shapes[0];
  assert.equal(sampleShape(s, 0).pts[0].x, -60);
  assert.equal(sampleShape(s, 1000).pts[0].x, 20);
  assert.equal(sampleShape(s, 1500).pts[0].x, 20);
});

test("rendering on and around every key time is safe and moves the shape", () => {
  const pl = play(project());
  pl.render(0);
  assert.equal(px(pl, 80, 120), hexTo565("#ff0000"));
  assert.equal(px(pl, 160, 120), 0);
  pl.render(1000);
  assert.equal(px(pl, 160, 120), hexTo565("#ff0000"));
  assert.equal(px(pl, 80, 120), 0, "old frame must be cleared");
  pl.render(1999);
  assert.equal(px(pl, 160, 120), hexTo565("#ff0000"));
});

test("colour variants reuse the geometry and cost only their palette", () => {
  const one = project();
  one.variants = one.variants.slice(0, 1);
  assert.equal(compile(project()).bytes.length - compile(one).bytes.length, 6);
  const pl = play(project(), 1);
  pl.render(0);
  assert.equal(px(pl, 80, 120), hexTo565("#0000ff"));
  assert.equal(px(pl, 5, 120), hexTo565("#101010"));
});

test("visibility window hides the shape", () => {
  const p = project();
  p.shapes[0].start = 500;
  p.shapes[0].end = 700;
  const pl = play(p);
  assert.equal(pl.render(100), null);
  assert.ok(pl.render(600));
  pl.render(800);
  assert.ok(pl.fb.every((v) => v === 0));
});

test("colour keys blend between slots", () => {
  const p = project();
  p.shapes[0].colorKeys = [{ t: 0, slot: 1 }, { t: 1000, slot: 2 }];
  p.shapes[0].keys = [{ id: 2, t: 0, z: -100, pts: square(0, 30) }];
  const pl = play(p);
  pl.render(500);
  const c = px(pl, 120, 120);
  assert.ok(c >> 11 > 10 && c >> 11 < 20, "red is half way");
  assert.ok(((c >> 5) & 63) > 20 && ((c >> 5) & 63) < 40, "green is half way");
});

test("per-point curves are kept and uniform curves are stored once", () => {
  const uniform = compile(project()).bytes.length;
  const p = project();
  p.shapes[0].keys[0].pts[1].c = [0.1, 0.9, 0.2, 1];
  assert.ok(compile(p).bytes.length > uniform);
  const a = play(project()), b = play(p);
  a.render(500); b.render(500);
  assert.notDeepEqual(a.fb, b.fb);
});

test("a self-crossing morph and degenerate shapes finish, which used to hang the ear clipper", () => {
  const bow = [{ x: -40, y: -40, c: LIN }, { x: 40, y: 40, c: LIN }, { x: 40, y: -40, c: LIN }, { x: -40, y: 40, c: LIN }];
  const flat = [0, 1, 2, 3].map((i) => ({ x: i * 10, y: 0, c: LIN }));
  const p = project();
  p.shapes[0].keys = [{ id: 2, t: 0, z: -100, pts: bow }, { id: 3, t: 1000, z: -100, pts: flat }];
  const pl = play(p);
  for (let t = 0; t < 2000; t += 37) pl.render(t, 3000, -2000, 500);
});

test("extreme tilt and depth stay inside the framebuffer", () => {
  const p = project();
  p.shapes[0].keys.forEach((k) => { k.z = 900; });
  const pl = play(p);
  for (let a = 0; a < 65536; a += 4099) pl.render(500, a, 65535 - a, a * 3);
  p.shapes[0].keys.forEach((k) => { k.z = -900; });
  const near = play(p);
  for (let a = 0; a < 65536; a += 4099) near.render(500, a, a, 0);
});

test("the returned rectangle covers every changed pixel", () => {
  const pl = play(project());
  let before = pl.fb.slice();
  for (let t = 0; t < 2000; t += 111) {
    const r = pl.render(t, t * 3, -t * 2, 0);
    for (let i = 0; i < before.length; i++) {
      if (before[i] !== pl.fb[i]) {
        const x = i % 240, y = (i / 240) | 0;
        assert.ok(r && x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1, `pixel ${x},${y} outside dirty rect at ${t}`);
      }
    }
    before = pl.fb.slice();
  }
});

test("integer sine tracks Math.sin", () => {
  for (let a = 0; a < 65536; a += 97) {
    assert.ok(Math.abs(isin(a) / 16384 - Math.sin(a / 65536 * 2 * Math.PI)) < 0.0005);
    assert.ok(Math.abs(icos(a) / 16384 - Math.cos(a / 65536 * 2 * Math.PI)) < 0.0005);
  }
});

test("compiler rejects what the firmware cannot play", () => {
  assert.ok(compile(project({ duration: 70000 })).errors.length);
  const p = project();
  p.shapes[0].keys[1].pts.pop();
  assert.ok(compile(p).errors.length);
});

test("sixty animations with four colour variants fit far below the 4 MB flash", () => {
  const ring = (r) => Array.from({ length: 48 }, (_, i) => ({ x: r * Math.cos(i / 7.6), y: r * Math.sin(i / 7.6), c: LIN }));
  const shape = (id) => ({
    id, name: "s", start: 0, end: 4000, colorKeys: [{ t: 0, slot: 1 }],
    keys: Array.from({ length: 8 }, (_, k) => ({ id: k, t: k * 500, z: -100, pts: ring(30 + k * 5 + id) })),
  });
  const colors = ["#000000", "#ff0000", "#00ff00", "#0000ff"];
  const p = { version: 1, name: "b", duration: 4000, variants: [1, 2, 3, 4].map(() => ({ name: "v", colors })), shapes: [1, 2, 3, 4, 5, 6].map(shape) };
  const one = compile(p).bytes;
  const total = pack(Array(60).fill(one)).length;
  assert.ok(total < 1024 * 1024, `pack is ${total} bytes`);
});
