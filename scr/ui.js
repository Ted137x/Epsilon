import { project, programState as st, commit, refresh, onChange, undo, redo, loadProject, newProject, activeShape, getShape, removePoints, deleteShapes, duplicateShapes, select } from "./states.js";
import { compile, pack, toHeader, RAM_LIMIT } from "./compiler.js";
import { finishPen } from "./editor.js";

const at = (id) => document.getElementById(id);
const TOOLS = [["select", "Select (V)", "v"], ["pen", "Polygon (P)", "p"], ["rect", "Rectangle (R)", "r"], ["ellipse", "Ellipse (E)", "e"]];

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
  const perAnimation = 60 * bytes.length;
  setStatus(`${bytes.length} B flash, ${Math.round(ram / RAM_LIMIT * 100)}% of player RAM. 60 like this: ${(perAnimation / 1024).toFixed(0)} KB`);
}

function exportPack(asHeader) {
  const { errors, bytes } = compile(project);
  if (errors.length) return setStatus(errors[0], true);
  const packed = pack([bytes]);
  if (asHeader) download("animations_data.h", toHeader(packed), "text/plain");
  else download(`${fileName()}.bin`, packed, "application/octet-stream");
}

function deleteSelection() {
  const s = activeShape();
  if (s && st.points.size) {
    if (removePoints(s, st.points)) st.points.clear();
    else setStatus("A shape needs at least 3 points", true);
  } else if (st.keys.size) {
    for (const item of st.keys) {
      const [sid, kid] = item.split("|").map(Number);
      const shape = getShape(sid);
      if (shape && shape.keys.length > 1) shape.keys = shape.keys.filter((k) => k.id !== kid);
    }
    st.keys.clear();
  } else if (st.shapes.size) {
    deleteShapes(st.shapes);
  }
  commit();
}

function setTool(tool) {
  st.tool = tool;
  refresh();
}

function onKey(e) {
  if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey) {
    if (k === "z") { e.shiftKey ? redo() : undo(); e.preventDefault(); }
    else if (k === "y") { redo(); e.preventDefault(); }
    else if (k === "d") { duplicateShapes(st.shapes); commit(); e.preventDefault(); }
    else if (k === "s") { at("btn-save").click(); e.preventDefault(); }
    return;
  }
  const tool = TOOLS.find((t) => t[2] === k);
  if (tool) setTool(tool[0]);
  else if (k === " ") { st.playing = !st.playing; refresh(); e.preventDefault(); }
  else if (k === "delete" || k === "backspace") deleteSelection();
  else if (k === "enter") finishPen.run();
  else if (k === "escape") { select([]); st.keys.clear(); setTool("select"); }
}

export function setupUI() {
  for (const [tool, label] of TOOLS) {
    const b = document.createElement("button");
    b.textContent = label;
    b.dataset.tool = tool;
    b.onclick = () => setTool(tool);
    at("tools").append(b);
  }

  at("btn-new").onclick = () => { if (confirm("Start a new project? Unsaved work stays in Undo.")) newProject(); };
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
  at("btn-play").onclick = () => { st.playing = !st.playing; refresh(); };
  at("onion").onchange = (e) => { st.onion = e.target.checked; };
  addEventListener("keydown", onKey);

  const objects = at("objects");
  const paint = () => {
    document.querySelectorAll("#tools button").forEach((b) => b.classList.toggle("active", b.dataset.tool === st.tool));
    at("btn-play").textContent = st.playing ? "Pause" : "Play";
    objects.replaceChildren(...[...project.shapes].reverse().map((s) => {
      const b = document.createElement("button");
      b.textContent = s.name;
      b.classList.toggle("active", st.shapes.has(s.id));
      b.onclick = (e) => {
        if (e.shiftKey) st.shapes.add(s.id); else select([s.id]);
        refresh();
      };
      return b;
    }));
    showBudget();
  };
  onChange(paint);

  try {
    const autosave = localStorage.getItem("epsilon.autosave");
    if (autosave) loadProject(autosave);
  } catch { /* a damaged autosave must not stop the editor opening */ }
  paint();

  const tick = () => {
    at("clock").textContent = `${(st.time / 1000).toFixed(2)} s`;
    requestAnimationFrame(tick);
  };
  tick();
}
