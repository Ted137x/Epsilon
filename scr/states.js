// The project file plus the editor state around it. Times are ms, x/y are pixels
// from the display centre with y up, z is depth. z = -100 draws at 1:1 scale.

import { LINEAR, sampleShape, segmentAt } from "./functions.js";

export const DEFAULT_Z = -100;
let nextId = 1;
const uid = () => nextId++;

export function makeKey(t, pts, z = DEFAULT_Z) {
  return { id: uid(), t, z, pts: pts.map((p) => ({ x: p.x, y: p.y, c: p.c ? [...p.c] : [...LINEAR] })) };
}

function demoProject() {
  const ring = (cx, rx, ry) => Array.from({ length: 60 }, (_, i) => {
    const a = 2 * Math.PI * i / 60;
    return { x: cx + rx * Math.cos(a), y: ry * Math.sin(a), c: [0.6, 0.06, 0.98, 0.54] };
  });
  return {
    version: 1, name: "Untitled", duration: 5000,
    variants: [{ name: "Default", colors: ["#000000", "#9C4D00", "#FFD23F", "#3DA5D9"] }],
    shapes: [{
      id: uid(), name: "Shape 1", start: 0, end: 5000,
      colorKeys: [{ t: 0, slot: 1 }],
      keys: [makeKey(1000, ring(-45, 22, 18)), makeKey(4000, ring(45, 16, 28))],
    }],
  };
}

export let project = demoProject();

// Not saved. Selection keys look like "shapeId|keyId|point" and point -1 means all points.
export const programState = {
  time: 0, playing: true, tool: "select", rev: 0,
  shapes: new Set(), points: new Set(), keys: new Set(),
  variant: 0, onion: false, expanded: new Set(),
  spring: { k: 60, c: 5.4, gain: 1, max: 0.8 },
};

const listeners = [];
export const onChange = (fn) => listeners.push(fn);
export function refresh() { programState.rev++; listeners.forEach((fn) => fn()); }

let undoStack = [], redoStack = [], saved = JSON.stringify(project);

// Call once at the end of each user gesture.
export function commit() {
  const now = JSON.stringify(project);
  if (now !== saved) {
    undoStack.push(saved);
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
    saved = now;
    try { localStorage.setItem("epsilon.autosave", now); } catch { /* private mode: autosave is optional */ }
  }
  refresh();
}

function restore(json) {
  project = JSON.parse(json);
  saved = json;
  nextId = 1 + Math.max(0, ...project.shapes.flatMap((s) => [s.id, ...s.keys.map((k) => k.id)]));
  programState.shapes.clear(); programState.points.clear(); programState.keys.clear();
  programState.variant = Math.min(programState.variant, project.variants.length - 1);
  programState.time = Math.min(programState.time, project.duration);
  refresh();
}

export function undo() { if (undoStack.length) { redoStack.push(saved); restore(undoStack.pop()); } }
export function redo() { if (redoStack.length) { undoStack.push(saved); restore(redoStack.pop()); } }

const isHex = (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Project files come from outside, so check everything the renderer would trust.
export function validateProject(p) {
  if (!p || p.version !== 1) throw new Error("Not an Epsilon project (version 1)");
  if (!isNum(p.duration) || !Array.isArray(p.variants) || !p.variants.length || !Array.isArray(p.shapes)) throw new Error("Project is missing fields");
  const slots = p.variants[0].colors?.length;
  if (!p.variants.every((v) => v.colors?.length === slots && v.colors.every(isHex))) throw new Error("Bad colour variants");
  for (const s of p.shapes) {
    if (!isNum(s.id) || !isNum(s.start) || !isNum(s.end) || !s.keys?.length || !s.colorKeys?.length) throw new Error("Bad shape");
    if (!s.colorKeys.every((c) => isNum(c.t) && c.slot >= 0 && c.slot < slots)) throw new Error("Bad colour key");
    const n = s.keys[0].pts?.length;
    for (const k of s.keys) {
      if (!isNum(k.id) || !isNum(k.t) || !isNum(k.z) || k.pts?.length !== n) throw new Error("Bad keyframe");
      if (!k.pts.every((q) => isNum(q.x) && isNum(q.y) && q.c?.length === 4 && q.c.every(isNum))) throw new Error("Bad point");
    }
  }
  return p;
}

export function loadProject(text) {
  validateProject(JSON.parse(text));
  undoStack.push(saved);
  redoStack = [];
  restore(text);
}

export function newProject() {
  undoStack.push(saved);
  redoStack = [];
  const p = demoProject();
  p.shapes = [];
  restore(JSON.stringify(p));
}

export const getShape = (id) => project.shapes.find((s) => s.id === id);
export const activeShape = () => getShape([...programState.shapes].at(-1));

export function addShape(pts, t, slot = 1) {
  const s = {
    id: uid(), name: `Shape ${project.shapes.length + 1}`, start: 0, end: project.duration,
    colorKeys: [{ t: 0, slot: Math.min(slot, project.variants[0].colors.length - 1) }],
    keys: [makeKey(t, pts)],
  };
  project.shapes.push(s);
  select([s.id]);
  return s;
}

export function select(ids) {
  programState.shapes = new Set(ids);
  programState.points.clear();
  programState.keys.clear();
}

// Auto-key: the key at time t, created from the current pose if there is none.
// shortcut: the new key copies the previous curve instead of splitting the bezier,
// so timing shifts slightly around it; split the curve if artists notice.
export function keyAt(shape, t) {
  t = Math.round(t);
  const found = shape.keys.find((k) => k.t === t);
  if (found) return found;
  const pose = sampleShape(shape, t), prev = shape.keys[segmentAt(shape.keys, t)];
  const key = makeKey(t, pose.pts.map((p, i) => ({ ...p, c: prev.pts[i].c })), pose.z);
  shape.keys.push(key);
  shape.keys.sort((a, b) => a.t - b.t);
  return key;
}

export function insertPoint(shape, index, f = 0.5) {
  for (const k of shape.keys) {
    const a = k.pts[index], b = k.pts[(index + 1) % k.pts.length];
    k.pts.splice(index + 1, 0, { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, c: [...a.c] });
  }
}

export function removePoints(shape, indices) {
  if (shape.keys[0].pts.length - indices.size < 3) return false;
  for (const k of shape.keys) k.pts = k.pts.filter((_, i) => !indices.has(i));
  return true;
}

export function deleteShapes(ids) {
  project.shapes = project.shapes.filter((s) => !ids.has(s.id));
  select([]);
}

export function duplicateShapes(ids) {
  const copies = project.shapes.filter((s) => ids.has(s.id)).map((s) => {
    const c = JSON.parse(JSON.stringify(s));
    c.id = uid();
    c.name += " copy";
    c.keys.forEach((k) => { k.id = uid(); k.pts.forEach((p) => { p.x += 8; p.y -= 8; }); });
    return c;
  });
  project.shapes.push(...copies);
  select(copies.map((c) => c.id));
}

export function moveShape(id, dir) {
  const i = project.shapes.findIndex((s) => s.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= project.shapes.length) return;
  [project.shapes[i], project.shapes[j]] = [project.shapes[j], project.shapes[i]];
}

export const selKey = (shapeId, keyId, point = -1) => `${shapeId}|${keyId}|${point}`;

// Every point-and-key pair the selected keyframes cover. The last key has no outgoing
// segment, so its curve is unused but setting it keeps the selection simple.
export function selectedCurveTargets() {
  const out = [];
  for (const item of programState.keys) {
    const [sid, kid, pt] = item.split("|").map(Number);
    const key = getShape(sid)?.keys.find((k) => k.id === kid);
    if (!key) continue;
    if (pt >= 0) { if (key.pts[pt]) out.push(key.pts[pt]); } else out.push(...key.pts);
  }
  return out;
}
