import test from "node:test";
import assert from "node:assert/strict";
import { easeAt, hexTo565, flattenPath } from "../scr/functions.js";
import { compile, pack } from "../scr/compiler.js";
import { Player, isin, icos } from "../scr/player.js";
import {
  makeLayer, evalTrack, setValue, addKey, toggleAnimated, removeKeys, insertVertex, removeVertices,
  convertToPath, localVertices, validateProject, vertex, worldOutline,
} from "../scr/model.js";

const LIN = [0.3, 0.3, 0.7, 0.7];
const TOL = 500 / 30;
const project = (layers, over = {}) => ({
  version: 2, name: "t", duration: 2000, fps: 30,
  variants: [{ name: "a", colors: ["#000000", "#ff0000", "#00ff00"] }, { name: "b", colors: ["#101010", "#0000ff", "#ffffff"] }],
  layers, ...over,
});
const rect = (over = {}) => makeLayer("rect", { name: "r", size: [40, 40], duration: 2000, ...over });
const play = (p, variant = 0) => {
  const { bytes, errors } = compile(p);
  assert.deepEqual(errors, []);
  const player = new Player(pack([bytes]));
  player.load(0, variant);
  return player;
};
const px = (pl, x, y) => pl.fb[y * 240 + x];
const RED = hexTo565("#ff0000");

test("curves stay finite with handles on the box edge", () => {
  for (const c of [[0, 0, 1, 1], [0, 1, 1, 0], [1, 0, 0, 1], [0, 0, 0, 0]]) {
    for (let x = 0; x <= 1; x += 0.01) assert.ok(Number.isFinite(easeAt(c, x)));
  }
  assert.ok(Math.abs(easeAt(LIN, 0.5) - 0.5) < 1e-4);
});

test("a static rectangle draws at 1:1 around its position", () => {
  const pl = play(project([rect({ position: [-60, 0] })]));
  pl.render(0);
  assert.equal(px(pl, 60, 120), RED);
  assert.equal(px(pl, 79, 120), RED);
  assert.equal(px(pl, 81, 120), 0);
});

test("position keys move the layer and old pixels are cleared", () => {
  const l = rect();
  l.props.position.keys = [{ id: 1, t: 0, v: [-60, 0], c: LIN }, { id: 2, t: 1000, v: [60, 0], c: LIN }];
  const pl = play(project([l]));
  pl.render(0);
  assert.equal(px(pl, 60, 120), RED);
  pl.render(1000);
  assert.equal(px(pl, 180, 120), RED);
  assert.equal(px(pl, 60, 120), 0);
});

test("scale, rotation and anchor follow After Effects order", () => {
  const l = rect({ size: [100, 20] });
  l.props.rotation.value = [90];
  const pl = play(project([l]));
  pl.render(0);
  assert.equal(px(pl, 120, 75), RED, "a wide bar turned 90 degrees is tall");
  assert.equal(px(pl, 75, 120), 0);

  const s = rect({ size: [20, 20] });
  s.props.scale.value = [300, 100];
  s.props.anchor.value = [-10, 0];
  const p2 = play(project([s]));
  p2.render(0);
  assert.equal(px(p2, 175, 120), RED, "scaled away from a left-edge anchor");
  assert.equal(px(p2, 115, 120), 0);
});

test("layers only exist between their in and out points", () => {
  const l = rect();
  l.in = 500;
  l.out = 700;
  const pl = play(project([l]));
  assert.equal(pl.render(100), null);
  assert.ok(pl.render(600));
  pl.render(800);
  assert.ok(pl.fb.every((v) => v === 0));
});

test("fill keys blend between palette colours", () => {
  const l = rect({ size: [60, 60] });
  l.props.fill.keys = [{ id: 1, t: 0, v: [1], c: LIN }, { id: 2, t: 1000, v: [2], c: LIN }];
  const pl = play(project([l]));
  pl.render(500);
  const c = px(pl, 120, 120);
  assert.ok(c >> 11 > 10 && c >> 11 < 20 && ((c >> 5) & 63) > 20 && ((c >> 5) & 63) < 40);
});

test("colour variants only add a palette", () => {
  const one = project([rect()]);
  one.variants = one.variants.slice(0, 1);
  assert.equal(compile(project([rect()])).bytes.length - compile(one).bytes.length, 6);
  const pl = play(project([rect()]), 1);
  pl.render(0);
  assert.equal(px(pl, 120, 120), hexTo565("#0000ff"));
  assert.equal(px(pl, 2, 120), hexTo565("#101010"));
});

test("ellipse and bezier circle cover the same pixels closely", () => {
  const e = makeLayer("ellipse", { name: "e", size: [100, 100], duration: 2000 });
  const c = makeLayer("ellipse", { name: "c", size: [100, 100], duration: 2000 });
  convertToPath(c);
  const a = play(project([e])), b = play(project([c]));
  a.render(0); b.render(0);
  let diff = 0;
  for (let i = 0; i < a.fb.length; i++) if (a.fb[i] !== b.fb[i]) diff++;
  assert.ok(diff < 120, `${diff} pixels differ`);
  assert.equal(px(b, 120, 120), RED);
  assert.equal(px(b, 120, 72), RED);
  assert.equal(px(b, 120, 68), 0);
});

test("path morphs with per-vertex curves", () => {
  const sq = [vertex(-20, -20), vertex(20, -20), vertex(20, 20), vertex(-20, 20)];
  const big = sq.map((q) => vertex(q.x * 2, q.y * 2));
  const l = makeLayer("path", { name: "p", path: sq, duration: 2000 });
  l.props.path.keys = [{ id: 1, t: 0, v: sq, c: LIN }, { id: 2, t: 1000, v: big, c: LIN }];
  const uniform = compile(project([l])).bytes.length;
  l.props.path.keys[0].vc = [[0, 1, 0, 1], null, null, null];
  assert.ok(compile(project([l])).bytes.length > uniform);
  const pl = play(project([l]));
  for (let t = 0; t <= 1000; t += 50) pl.render(t, 2000, -1000, 300);
});

test("self-crossing paths and extreme tilt never hang or write outside the screen", () => {
  const bow = [vertex(-40, -40), vertex(40, 40), vertex(40, -40, 0, 0, 30, 30), vertex(-40, 40)];
  const l = makeLayer("path", { name: "p", path: bow, duration: 2000 });
  l.props.scale.value = [800, 800];
  l.props.depth.value = [-190];
  const pl = play(project([l]));
  for (let a = 0; a < 65536; a += 4099) pl.render(500, a, 65535 - a, a * 3);
});

test("the returned rectangle covers every changed pixel", () => {
  const l = rect();
  l.props.position.keys = [{ id: 1, t: 0, v: [-60, 30], c: LIN }, { id: 2, t: 2000, v: [60, -30], c: LIN }];
  l.props.rotation.keys = [{ id: 3, t: 0, v: [0], c: LIN }, { id: 4, t: 2000, v: [360], c: LIN }];
  const pl = play(project([l]));
  let before = pl.fb.slice();
  for (let t = 0; t < 2000; t += 111) {
    const r = pl.render(t, t * 3, -t * 2, 0);
    for (let i = 0; i < before.length; i++) {
      if (before[i] === pl.fb[i]) continue;
      const x = i % 240, y = (i / 240) | 0;
      assert.ok(r && x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1, `pixel ${x},${y} outside at ${t}`);
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

test("editing on a keyframe changes it instead of adding one", () => {
  const tr = { value: [0, 0], keys: [] };
  setValue(tr, [5, 5], 0, TOL);
  assert.deepEqual(tr.value, [5, 5], "static property just changes");
  toggleAnimated(tr, 0);
  setValue(tr, [9, 9], 1000, TOL);
  assert.equal(tr.keys.length, 2);
  setValue(tr, [7, 7], 1000 + TOL / 2, TOL);
  assert.equal(tr.keys.length, 2, "within half a frame edits the existing key");
  assert.deepEqual(tr.keys[1].v, [7, 7]);
  assert.equal(addKey(tr, 1000, TOL), tr.keys[1]);
  addKey(tr, 500, TOL);
  assert.deepEqual(tr.keys.map((k) => k.t), [0, 500, 1000]);
  removeKeys(tr, new Set(tr.keys.map((k) => k.id)), 1000);
  assert.deepEqual(tr.value, [7, 7], "removing every key keeps the current value");
  assert.equal(tr.keys.length, 0);
});

test("inserting a vertex keeps the outline and works on every key", () => {
  const l = makeLayer("ellipse", { name: "e", size: [100, 60], duration: 2000 });
  l.props.size.keys = [{ id: 1, t: 0, v: [100, 60], c: LIN }, { id: 2, t: 1000, v: [40, 80], c: LIN }];
  convertToPath(l);
  assert.equal(l.props.path.keys.length, 2);
  const before = worldOutline(l, 500);
  insertVertex(l, 0, 0.5);
  assert.equal(l.props.path.value.length, 5);
  assert.ok(l.props.path.keys.every((k) => k.v.length === 5));
  const after = flattenPath(localVertices(l, 500), 64);
  for (const p of before) {
    const d = Math.min(...after.map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
    assert.ok(d < 1, `outline moved by ${d}`);
  }
  assert.ok(removeVertices(l, new Set([1])));
  assert.ok(!removeVertices(l, new Set([0, 1])), "a path keeps at least 3 points");
});

test("version 1 projects open as path layers", () => {
  const v1 = {
    version: 1, name: "old", duration: 2000, variants: [{ name: "a", colors: ["#000000", "#ff0000"] }],
    shapes: [{
      id: 1, name: "s", start: 100, end: 1900, colorKeys: [{ t: 0, slot: 1 }],
      keys: [
        { id: 2, t: 0, z: -100, pts: [[-20, -20], [20, -20], [20, 20]].map(([x, y]) => ({ x, y, c: LIN })) },
        { id: 3, t: 1000, z: -60, pts: [[-30, -20], [20, -20], [20, 30]].map(([x, y]) => ({ x, y, c: LIN })) },
      ],
    }],
  };
  const p = validateProject(v1);
  assert.equal(p.version, 2);
  const l = p.layers[0];
  assert.equal(l.type, "path");
  assert.equal(l.in, 100);
  assert.equal(l.props.path.keys.length, 2);
  assert.deepEqual(evalTrack(l.props.depth, 1000), [40]);
  assert.deepEqual(compile(p).errors, []);
});

test("bad project files are rejected", () => {
  assert.throws(() => validateProject({ version: 2, duration: 1, fps: 30, variants: [{ colors: ["red"] }], layers: [] }));
  const p = project([rect()]);
  p.layers[0].props.fill.value = [9];
  assert.throws(() => validateProject(p));
});

test("sixty animations with four colour variants fit far below the 4 MB flash", () => {
  const layers = Array.from({ length: 6 }, (_, i) => {
    const l = makeLayer("ellipse", { name: "e", size: [40, 40], duration: 4000 });
    for (const name of ["position", "scale", "rotation"]) {
      l.props[name].keys = Array.from({ length: 6 }, (_, k) => ({ id: k, t: k * 700, v: l.props[name].value.map((v) => v + k * 10 + i), c: LIN }));
    }
    return l;
  });
  const colors = ["#000000", "#ff0000", "#00ff00", "#0000ff"];
  const p = project(layers, { duration: 4000, variants: [1, 2, 3, 4].map(() => ({ name: "v", colors })) });
  const total = pack(Array(60).fill(compile(p).bytes)).length;
  assert.ok(total < 200 * 1024, `pack is ${total} bytes`);
});
