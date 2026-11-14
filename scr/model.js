// The project data model: what a layer is, how its properties animate, and the
// edits that keep keyframes consistent. No UI state lives here; see states.js.
//
// Project
//   { version: 2, name, duration (ms), fps, variants: [{ name, colors: ["#rrggbb"] }], layers: [Layer] }
//   layers[0] is drawn first (bottom). Colour slot 0 is the background.
// Layer
//   { id, name, type: "ellipse" | "rect" | "path", in, out (ms), props: { <name>: Track } }
// Track (every property)
//   { value, keys: [{ id, t, v, c }] }  - no keys: `value` is used; with keys: they are.
//   `c` is the curve [x1, y1, x2, y2] from this key to the next one.
// Path track
//   value / v is a list of vertices { x, y, ix, iy, ox, oy }; in/out handles are relative
//   to the vertex, like After Effects. A path key may also carry `vc`: one curve per vertex.

import { LINEAR, KAPPA, easeAt, segmentAt, blendHex, layerMatrix, apply, flattenPath, bezierPoint, segmentControls } from "./functions.js";

export const PROPS = {
  path: { label: "Path" },
  size: { label: "Size", dim: 2, unit: "px" },
  fill: { label: "Fill", dim: 1 },
  anchor: { label: "Anchor Point", dim: 2, unit: "px" },
  position: { label: "Position", dim: 2, unit: "px" },
  scale: { label: "Scale", dim: 2, unit: "%" },
  rotation: { label: "Rotation", dim: 1, unit: "°" },
  depth: { label: "Depth", dim: 1, unit: "px" },
};

export const propsOf = (layer) => [layer.type === "path" ? "path" : "size", "fill", "anchor", "position", "scale", "rotation", "depth"];

let nextId = 1;
export const uid = () => nextId++;

// After loading a file, new ids must not collide with saved ones.
export function syncIds(project) {
  let max = 0;
  for (const l of project.layers) {
    max = Math.max(max, l.id);
    for (const tr of Object.values(l.props)) for (const k of tr.keys) max = Math.max(max, k.id);
  }
  nextId = max + 1;
}

const clone = (v) => JSON.parse(JSON.stringify(v));
export const vertex = (x, y, ix = 0, iy = 0, ox = 0, oy = 0) => ({ x, y, ix, iy, ox, oy });

export function makeLayer(type, { name, position = [0, 0], size = [80, 80], path, slot = 1, duration }) {
  const props = {
    fill: { value: [slot], keys: [] },
    anchor: { value: [0, 0], keys: [] },
    position: { value: [...position], keys: [] },
    scale: { value: [100, 100], keys: [] },
    rotation: { value: [0], keys: [] },
    depth: { value: [0], keys: [] },
  };
  if (type === "path") props.path = { value: path, keys: [] };
  else props.size = { value: [...size], keys: [] };
  return { id: uid(), name, type, in: 0, out: duration, props };
}

// ---------------------------------------------------------------- evaluation

function lerpVertex(a, b, e) {
  const out = {};
  for (const k in a) out[k] = a[k] + (b[k] - a[k]) * e;
  return out;
}

// Value of a track at time t: a number array, or a vertex list for paths.
export function evalTrack(tr, t) {
  const keys = tr.keys;
  if (!keys.length) return clone(tr.value);
  const k = segmentAt(keys, t), a = keys[k], b = keys[k + 1];
  if (!b || t <= a.t) return clone(a.v);
  const f = (t - a.t) / (b.t - a.t);
  if (typeof a.v[0] === "number") {
    const e = easeAt(a.c, f);
    return a.v.map((x, i) => x + (b.v[i] - x) * e);
  }
  return a.v.map((x, i) => lerpVertex(x, b.v[i], easeAt(a.vc?.[i] ?? a.c, f)));
}

export const isVisible = (layer, t) => t >= layer.in && t < layer.out;

export function transformAt(layer, t) {
  const p = layer.props;
  return layerMatrix(evalTrack(p.anchor, t), evalTrack(p.position, t), evalTrack(p.scale, t), evalTrack(p.rotation, t)[0]);
}

// Outline in layer space, as bezier vertices (rectangles and ellipses included).
export function localVertices(layer, t) {
  if (layer.type === "path") return evalTrack(layer.props.path, t);
  const [w, h] = evalTrack(layer.props.size, t), rx = w / 2, ry = h / 2;
  if (layer.type === "rect") return [vertex(-rx, -ry), vertex(rx, -ry), vertex(rx, ry), vertex(-rx, ry)];
  const kx = rx * KAPPA, ky = ry * KAPPA;
  return [
    vertex(rx, 0, 0, -ky, 0, ky), vertex(0, ry, kx, 0, -kx, 0),
    vertex(-rx, 0, 0, ky, 0, -ky), vertex(0, -ry, -kx, 0, kx, 0),
  ];
}

export function worldOutline(layer, t) {
  const m = transformAt(layer, t);
  return flattenPath(localVertices(layer, t)).map((p) => apply(m, p));
}

export function fillAt(layer, t, colors) {
  const tr = layer.props.fill, keys = tr.keys;
  if (!keys.length) return colors[tr.value[0]];
  const k = segmentAt(keys, t), a = keys[k], b = keys[k + 1];
  if (!b || t <= a.t) return colors[a.v[0]];
  return blendHex(colors[a.v[0]], colors[b.v[0]], easeAt(a.c, (t - a.t) / (b.t - a.t)));
}

// ---------------------------------------------------------------- editing
// Every edit takes the playhead time and a tolerance (half a frame) so that editing
// while parked on a keyframe changes that keyframe instead of adding a new one.

export const keyNear = (tr, t, tol) => tr.keys.find((k) => Math.abs(k.t - t) <= tol);

function insertKey(tr, t, v) {
  const prev = tr.keys[segmentAt(tr.keys, t)];
  const key = { id: uid(), t: Math.round(t), v, c: prev ? [...prev.c] : [...LINEAR] };
  if (prev?.vc) key.vc = prev.vc.map((c) => c && [...c]);
  tr.keys.push(key);
  tr.keys.sort((a, b) => a.t - b.t);
  return key;
}

// The After Effects stopwatch rule: static properties change their value,
// animated ones change the key under the playhead or get a new key there.
export function setValue(tr, value, t, tol) {
  if (!tr.keys.length) { tr.value = clone(value); return; }
  const key = keyNear(tr, t, tol);
  if (key) key.v = clone(value);
  else insertKey(tr, t, clone(value));
}

export function addKey(tr, t, tol) {
  return keyNear(tr, t, tol) ?? insertKey(tr, t, evalTrack(tr, t));
}

// Stopwatch on: one key with the current value. Off: keep the current value, drop the keys.
export function toggleAnimated(tr, t) {
  if (tr.keys.length) {
    tr.value = evalTrack(tr, t);
    tr.keys = [];
  } else {
    insertKey(tr, t, clone(tr.value));
  }
}

export function removeKeys(tr, ids, t) {
  const now = evalTrack(tr, t);
  tr.keys = tr.keys.filter((k) => !ids.has(k.id));
  if (!tr.keys.length) tr.value = now;
}

// Every place that stores a path's vertices: its static value and each key.
const pathStores = (layer) => {
  const tr = layer.props.path;
  return [{ v: tr.value }, ...tr.keys];
};

// Split segment i at parameter u with de Casteljau, so the outline does not change.
export function insertVertex(layer, i, u) {
  for (const store of pathStores(layer)) {
    const v = store.v, n = v.length, j = (i + 1) % n;
    const [p0, p1, p2, p3] = segmentControls(v, i);
    const mix = (a, b) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
    const q0 = mix(p0, p1), q1 = mix(p1, p2), q2 = mix(p2, p3), r0 = mix(q0, q1), r1 = mix(q1, q2);
    const mid = bezierPoint(p0, p1, p2, p3, u);
    v[i].ox = q0.x - p0.x; v[i].oy = q0.y - p0.y;
    v[j].ix = q2.x - p3.x; v[j].iy = q2.y - p3.y;
    v.splice(i + 1, 0, vertex(mid.x, mid.y, r0.x - mid.x, r0.y - mid.y, r1.x - mid.x, r1.y - mid.y));
    if (store.vc) store.vc.splice(i + 1, 0, store.vc[i] && [...store.vc[i]]);
  }
}

export function removeVertices(layer, indices) {
  if (layer.props.path.value.length - indices.size < 3) return false;
  for (const store of pathStores(layer)) {
    const keep = (_, i) => !indices.has(i);
    store.v.splice(0, store.v.length, ...store.v.filter(keep));
    if (store.vc) store.vc = store.vc.filter(keep);
  }
  return true;
}

// Ellipses and rectangles become editable bezier paths; size keys become path keys.
export function convertToPath(layer) {
  if (layer.type === "path") return;
  const shapeAt = (size) => localVertices({ type: layer.type, props: { size: { value: size, keys: [] } } }, 0);
  const size = layer.props.size;
  layer.props.path = {
    value: shapeAt(size.value),
    keys: size.keys.map((k) => ({ id: k.id, t: k.t, c: [...k.c], v: shapeAt(k.v) })),
  };
  delete layer.props.size;
  layer.type = "path";
}

// Every key of a layer, as [propName, track, key].
export function layerKeys(layer) {
  return Object.entries(layer.props).flatMap(([name, tr]) => tr.keys.map((k) => [name, tr, k]));
}

// ---------------------------------------------------------------- files

export function demoProject() {
  const circle = makeLayer("ellipse", { name: "Circle", position: [-45, 0], size: [44, 36], duration: 5000 });
  const p = circle.props;
  p.position.keys = [{ id: uid(), t: 1000, v: [-45, 0], c: [0.6, 0.06, 0.98, 0.54] }, { id: uid(), t: 4000, v: [45, 0], c: [...LINEAR] }];
  p.size.keys = [{ id: uid(), t: 1000, v: [44, 36], c: [0.6, 0.06, 0.98, 0.54] }, { id: uid(), t: 4000, v: [32, 56], c: [...LINEAR] }];
  return {
    version: 2, name: "Untitled", duration: 5000, fps: 30,
    variants: [{ name: "Default", colors: ["#000000", "#9C4D00", "#FFD23F", "#3DA5D9"] }],
    layers: [circle],
  };
}

// Version 1 stored polygons with per-point keys; each becomes a path layer.
function migrateV1(p) {
  const layers = p.shapes.map((s) => {
    const keys = [...s.keys].sort((a, b) => a.t - b.t);
    const toPath = (k) => k.pts.map((q) => vertex(q.x, q.y));
    const layer = makeLayer("path", { name: s.name, path: toPath(keys[0]), duration: p.duration });
    layer.in = s.start;
    layer.out = s.end;
    if (keys.length > 1) {
      layer.props.path.keys = keys.map((k) => {
        const curves = k.pts.map((q) => [...q.c]);
        const key = { id: uid(), t: k.t, v: toPath(k), c: curves[0] };
        if (curves.some((c) => c.join() !== curves[0].join())) key.vc = curves;
        return key;
      });
    }
    const depth = layer.props.depth;
    depth.value = [keys[0].z + 100];
    if (keys.some((k) => k.z !== keys[0].z)) depth.keys = keys.map((k) => ({ id: uid(), t: k.t, v: [k.z + 100], c: [...k.pts[0].c] }));
    const colors = [...s.colorKeys].sort((a, b) => a.t - b.t);
    layer.props.fill.value = [colors[0].slot];
    if (colors.length > 1) layer.props.fill.keys = colors.map((c) => ({ id: uid(), t: c.t, v: [c.slot], c: [...LINEAR] }));
    return layer;
  });
  return { version: 2, name: p.name, duration: p.duration, fps: 30, variants: p.variants, layers };
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isHex = (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
const isVertex = (q) => q && ["x", "y", "ix", "iy", "ox", "oy"].every((k) => isNum(q[k]));
const isCurve = (c) => Array.isArray(c) && c.length === 4 && c.every(isNum);

// Project files come from outside, so check everything the renderer would trust.
export function validateProject(input) {
  const p = input?.version === 1 && Array.isArray(input.shapes) ? migrateV1(input) : input;
  if (!p || p.version !== 2) throw new Error("Not an Epsilon project");
  if (!isNum(p.duration) || !isNum(p.fps) || !Array.isArray(p.variants) || !p.variants.length || !Array.isArray(p.layers)) {
    throw new Error("Project is missing fields");
  }
  const slots = p.variants[0].colors?.length;
  if (!p.variants.every((v) => v.colors?.length === slots && v.colors.every(isHex))) throw new Error("Bad colour variants");
  for (const l of p.layers) {
    if (!isNum(l.id) || !isNum(l.in) || !isNum(l.out) || !["ellipse", "rect", "path"].includes(l.type)) throw new Error("Bad layer");
    for (const name of propsOf(l)) {
      const tr = l.props?.[name];
      if (!tr || !Array.isArray(tr.keys)) throw new Error(`${l.name}: missing ${name}`);
      const okValue = name === "path"
        ? (v) => Array.isArray(v) && v.length === tr.value.length && v.every(isVertex)
        : (v) => Array.isArray(v) && v.length === PROPS[name].dim && v.every(isNum);
      const okVc = (k) => k.vc === undefined || (Array.isArray(k.vc) && k.vc.length === k.v.length && k.vc.every((c) => c === null || isCurve(c)));
      if (!okValue(tr.value) || !tr.keys.every((k) => isNum(k.id) && isNum(k.t) && okValue(k.v) && isCurve(k.c) && okVc(k))) {
        throw new Error(`${l.name}: bad ${name}`);
      }
    }
    const slotOk = (v) => v[0] >= 0 && v[0] < slots;
    if (!slotOk(l.props.fill.value) || !l.props.fill.keys.every((k) => slotOk(k.v))) throw new Error(`${l.name}: bad fill`);
  }
  return p;
}
