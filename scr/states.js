// Application state: the open project, what is selected, the playhead, undo/redo.
// Panels read `project` and `programState` every frame and call commit() after an edit.

import { demoProject, syncIds, validateProject, setValue, evalTrack, uid } from "./model.js";

export let project = demoProject();

// Not saved with the project.
// Key references are strings "layerId|propName|keyId|vertex"; vertex -1 means the whole key.
export const programState = {
  time: 0, playing: true, tool: "select", rev: 0,
  layers: new Set(),        // selected layer ids
  vertices: new Set(),      // selected path vertices of the active layer
  keys: new Set(),          // selected keyframes (key references)
  expanded: new Set(),      // layers twirled open in the timeline
  pathExpanded: new Set(),  // layers whose path shows one row per vertex
  variant: 0, onion: false,
  spring: { k: 60, c: 5.4, gain: 1, max: 0.8 },
};
const st = programState;

const listeners = [];
export const onChange = (fn) => listeners.push(fn);
export function refresh() { st.rev++; listeners.forEach((fn) => fn()); }

// ---------------------------------------------------------------- time

export const frameMs = () => 1000 / project.fps;
export const tolerance = () => 500 / project.fps; // half a frame: "on" a keyframe
export const lastFrame = () => Math.max(0, Math.round(Math.ceil(project.duration / frameMs() - 1) * frameMs()));

export function snapTime(t) {
  const f = Math.round(t / frameMs());
  return Math.max(0, Math.min(lastFrame(), Math.round(f * frameMs())));
}

export function setTime(t) {
  st.time = snapTime(t);
  st.playing = false;
  refresh();
}

export const stepFrames = (n) => setTime(st.time + n * frameMs());

// ---------------------------------------------------------------- undo

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
  project = validateProject(JSON.parse(json));
  saved = JSON.stringify(project);
  syncIds(project);
  st.layers.clear(); st.vertices.clear(); st.keys.clear();
  st.variant = Math.min(st.variant, project.variants.length - 1);
  st.time = snapTime(st.time);
  refresh();
}

export function undo() { if (undoStack.length) { redoStack.push(saved); restore(undoStack.pop()); } }
export function redo() { if (redoStack.length) { undoStack.push(saved); restore(redoStack.pop()); } }

export function loadProject(text) {
  validateProject(JSON.parse(text));
  undoStack.push(saved);
  redoStack = [];
  restore(text);
}

export function newProject() {
  undoStack.push(saved);
  redoStack = [];
  restore(JSON.stringify({ ...demoProject(), layers: [] }));
}

// ---------------------------------------------------------------- selection

export const getLayer = (id) => project.layers.find((l) => l.id === id);
export const selectedLayers = () => [...st.layers].map(getLayer).filter(Boolean);
export const activeLayer = () => getLayer([...st.layers].at(-1));

export function select(ids) {
  st.layers = new Set(ids);
  st.vertices.clear();
  st.keys.clear();
}

export function deselectAll() {
  select([]);
  refresh();
}

export const keyRef = (layerId, prop, keyId, vertex = -1) => `${layerId}|${prop}|${keyId}|${vertex}`;

// Resolves key references to { layer, prop, track, key, vertex }, skipping stale ones.
export function selectedKeys() {
  const out = [];
  for (const ref of st.keys) {
    const [lid, prop, kid, vertex] = ref.split("|");
    const layer = getLayer(Number(lid)), track = layer?.props[prop], key = track?.keys.find((k) => k.id === Number(kid));
    if (key) out.push({ layer, prop, track, key, vertex: Number(vertex) });
  }
  return out;
}

// ---------------------------------------------------------------- edits

export function addLayer(layer) {
  project.layers.push(layer);
  select([layer.id]);
}

// Set a property at the playhead with the After Effects stopwatch rule (see model.setValue).
export function setProp(layer, name, value) {
  setValue(layer.props[name], value, st.time, tolerance());
}

export const propAt = (layer, name) => evalTrack(layer.props[name], st.time);

export function duplicateLayers(ids) {
  const copies = project.layers.filter((l) => ids.has(l.id)).map((l) => {
    const c = JSON.parse(JSON.stringify(l));
    c.id = uid();
    c.name += " copy";
    for (const tr of Object.values(c.props)) for (const k of tr.keys) k.id = uid();
    return c;
  });
  project.layers.push(...copies);
  select(copies.map((c) => c.id));
}

export function deleteLayers(ids) {
  project.layers = project.layers.filter((l) => !ids.has(l.id));
  select([]);
}

export function moveLayer(id, dir) {
  const i = project.layers.findIndex((l) => l.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= project.layers.length) return;
  [project.layers[i], project.layers[j]] = [project.layers[j], project.layers[i]];
}
