// Top bar, tool buttons, layer list and every keyboard shortcut.

import {
  project, programState as st, commit, refresh, onChange, undo, redo, loadProject, newProject, activeLayer,
  selectedLayers, selectedKeys, deleteLayers, duplicateLayers, select, stepFrames, setTime, lastFrame, tolerance, frameMs,
} from "./states.js";
import { addKey, removeKeys, removeVertices, propsOf } from "./model.js";
import { compile, pack, toHeader, RAM_LIMIT } from "./compiler.js";
import { applyCurve } from "./curves.js";
import { EASY_EASE } from "./functions.js";
import { pen } from "./editor.js";

const at = (id) => document.getElementById(id);
const TOOLS = [["select", "Selection (V)", "v"], ["pen", "Pen (G)", "g"], ["rect", "Rectangle (R)", "r"], ["ellipse", "Ellipse (E)", "e"]];
// Alt+Shift+letter adds a key to one property, like After Effects.
const PROP_KEYS = { p: "position", s: "scale", r: "rotation", a: "anchor", d: "depth" };

function download(name, data, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const fileName = () => project.name.replace(/[^\w-]+/g, "_") || "animation";

function setStatus(text, error = false) {
  at("status").textContent = text;
  at("status").classList.toggle("error", error);
}

function showBudget() {
  const { errors, bytes, ram } = compile(project);
  if (errors.length) return setStatus(errors[0], true);
  setStatus(`${bytes.length} B flash, ${Math.round(ram / RAM_LIMIT * 100)}% of player RAM`);
}

function exportPack(asHeader) {
  const { errors, bytes } = compile(project);
  if (errors.length) return setStatus(errors[0], true);
  const packed = pack([bytes]);
  if (asHeader) download("animations_data.h", toHeader(packed), "text/plain");
  else download(`${fileName()}.bin`, packed, "application/octet-stream");
}

function deleteSelection() {
  const l = activeLayer();
  if (st.keys.size) {
    const byTrack = new Map();
    for (const { track, key } of selectedKeys()) {
      if (!byTrack.has(track)) byTrack.set(track, new Set());
      byTrack.get(track).add(key.id);
    }
    byTrack.forEach((ids, track) => removeKeys(track, ids, st.time));
    st.keys.clear();
  } else if (l?.type === "path" && st.vertices.size) {
    if (removeVertices(l, st.vertices)) st.vertices.clear();
    else return setStatus("A path needs at least 3 points", true);
  } else if (st.layers.size) {
    deleteLayers(st.layers);
  }
  commit();
}

function addKeys(names) {
  for (const l of selectedLayers()) {
    for (const name of names ?? propsOf(l)) addKey(l.props[name], st.time, tolerance());
    st.expanded.add(l.id);
  }
  commit();
}

// Alt+[ / Alt+]: the layer starts at, or ends after, the frame under the playhead.
function trim(side) {
  const end = Math.min(project.duration, Math.round(st.time + frameMs()));
  for (const l of selectedLayers()) {
    if (side === "in") l.in = Math.min(st.time, l.out - 1);
    else l.out = Math.max(end, l.in + 1);
  }
  commit();
}

const setTool = (tool) => { st.tool = tool; pen.cancel(); refresh(); };

function onKey(e) {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  const k = e.key.toLowerCase(), handled = () => e.preventDefault();

  if (e.ctrlKey || e.metaKey) {
    if (k === "z") { e.shiftKey ? redo() : undo(); handled(); }
    else if (k === "y") { redo(); handled(); }
    else if (k === "d") { duplicateLayers(st.layers); commit(); handled(); }
    else if (k === "s") { at("btn-save").click(); handled(); }
    return;
  }
  if (e.altKey && e.shiftKey && PROP_KEYS[k]) { addKeys([PROP_KEYS[k]]); return handled(); }
  if (e.altKey && (e.code === "BracketLeft" || e.code === "BracketRight")) { trim(e.code === "BracketLeft" ? "in" : "out"); return handled(); }
  if (e.altKey) return;

  const tool = TOOLS.find((t) => t[2] === k);
  if (tool) return setTool(tool[0]);
  switch (e.key) {
    case " ": st.playing = !st.playing; if (!st.playing) setTime(st.time); else refresh(); return handled();
    case "PageDown": stepFrames(e.shiftKey ? 10 : 1); return handled();
    case "PageUp": stepFrames(e.shiftKey ? -10 : -1); return handled();
    case "Home": setTime(0); return handled();
    case "End": setTime(lastFrame()); return handled();
    case "Delete": case "Backspace": deleteSelection(); return handled();
    case "Enter": pen.finish(); return handled();
    case "Escape": pen.cancel(); select([]); setTool("select"); return;
    case "F9": applyCurve(EASY_EASE); commit(); return handled();
  }
  if (k === "k") addKeys();
}

export function setupUI() {
  for (const [tool, label] of TOOLS) {
    const b = document.createElement("button");
    b.textContent = label;
    b.dataset.tool = tool;
    b.onclick = () => setTool(tool);
    at("tools").append(b);
  }

  at("btn-new").onclick = () => { if (confirm("Start a new project? The current one stays in Undo.")) newProject(); };
  at("btn-open").onclick = () => at("file-open").click();
  at("file-open").onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try { loadProject(await file.text()); }
    catch (err) { setStatus(`Could not open ${file.name}: ${err.message}`, true); }
  };
  at("btn-save").onclick = () => download(`${fileName()}.json`, JSON.stringify(project), "application/json");
  at("btn-undo").onclick = undo;
  at("btn-redo").onclick = redo;
  at("btn-export-h").onclick = () => exportPack(true);
  at("btn-export-bin").onclick = () => exportPack(false);
  at("btn-play").onclick = () => { st.playing = !st.playing; if (!st.playing) setTime(st.time); else refresh(); };
  at("onion").onchange = (e) => { st.onion = e.target.checked; };
  addEventListener("keydown", onKey);

  const layers = at("objects");
  const paint = () => {
    document.querySelectorAll("#tools button").forEach((b) => b.classList.toggle("active", b.dataset.tool === st.tool));
    at("btn-play").textContent = st.playing ? "Pause" : "Play";
    layers.replaceChildren(...[...project.layers].reverse().map((l) => {
      const b = document.createElement("button");
      b.textContent = l.name;
      b.classList.toggle("active", st.layers.has(l.id));
      b.onclick = (e) => { if (e.shiftKey) st.layers.add(l.id); else select([l.id]); refresh(); };
      return b;
    }));
    showBudget();
  };
  onChange(paint);

  try {
    const autosave = localStorage.getItem("epsilon.autosave");
    if (autosave) loadProject(autosave);
  } catch { /* a damaged or outdated autosave must not stop the editor opening */ }
  paint();

  const tick = () => {
    at("clock").textContent = `${(st.time / 1000).toFixed(2)} s`;
    requestAnimationFrame(tick);
  };
  tick();
}
