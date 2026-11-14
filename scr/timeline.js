
// The timeline: a ruler for the playhead and a track area with one row per layer.
// Twirling a layer open shows its properties, After Effects style; a path property
// can be twirled open again to show one row per vertex (for per-vertex easing).

import {
  project, programState as st, commit, refresh, select, getLayer, keyRef, selectedKeys, setTime, snapTime,
  frameMs, tolerance,
} from "./states.js";
import { PROPS, propsOf, evalTrack, toggleAnimated, addKey, removeKeys, keyNear, layerKeys, uid } from "./model.js";

const rulerDiv = document.getElementById("zoombar");
const tracksDiv = document.getElementById("framebar");
const LEFT = 270, ROW = 20, EDGE = 5;
const view = { msPerPx: 0, scroll: 0 };

const width = () => rulerDiv.clientWidth;
const fit = () => { view.msPerPx = project.duration / Math.max(100, width() - LEFT - 16); view.scroll = 0; };
const timeToX = (t) => LEFT + (t - view.scroll) / view.msPerPx;
const xToTime = (x) => (x - LEFT) * view.msPerPx + view.scroll;

function zoomAt(event, x) {
  const t = xToTime(x);
  view.msPerPx = Math.min(project.duration / 100, Math.max(0.5, view.msPerPx * Math.exp(event.deltaY * 0.001)));
  view.scroll = Math.max(0, t - (x - LEFT) * view.msPerPx);
}

function rows() {
  const out = [];
  for (const layer of [...project.layers].reverse()) {
    out.push({ kind: "layer", layer });
    if (!st.expanded.has(layer.id)) continue;
    for (const name of propsOf(layer)) {
      out.push({ kind: "prop", layer, name });
      if (name === "path" && st.pathExpanded.has(layer.id)) {
        layer.props.path.value.forEach((_, i) => out.push({ kind: "vertex", layer, name, vertex: i }));
      }
    }
  }
  return out;
}

function formatValue(layer, name) {
  const v = evalTrack(layer.props[name], st.time);
  if (name === "path") return `${v.length} points`;
  if (name === "fill") return `Colour ${v[0]}`;
  const unit = PROPS[name].unit;
  return v.map((x) => `${Math.round(x * 10) / 10}${unit === "px" ? "" : unit}`).join(", ");
}

// ------------------------------------------------------------------ ruler

export function timelineZoomCanvas(p) {
  let scrubbing = false;

  // Snap to frames, and to keyframes of selected layers when close.
  function scrub() {
    let t = xToTime(p.mouseX);
    for (const id of st.layers) {
      const l = getLayer(id);
      if (!l) continue;
      for (const [, , k] of layerKeys(l)) if (Math.abs(timeToX(k.t) - p.mouseX) < 6) t = k.t;
    }
    setTime(t);
  }

  p.setup = () => {
    p.pixelDensity(1);
    p.createCanvas(width(), 32);
    fit();
    p.textSize(10);
  };

  p.draw = () => {
    p.background(36, 38, 45);
    const step = [50, 100, 250, 500, 1000, 2000, 5000, 10000].find((s) => s / view.msPerPx >= 55) ?? 20000;
    const frameStep = frameMs() / view.msPerPx;
    for (let t = 0; t <= project.duration; t += step) {
      const x = timeToX(t);
      if (x < LEFT) continue;
      p.stroke(90);
      p.line(x, 18, x, 32);
      p.noStroke();
      p.fill(170);
      p.text(`${(t / 1000).toFixed(2)}s`, x + 3, 12);
    }
    if (frameStep >= 6) {
      p.stroke(70);
      for (let t = 0; t <= project.duration; t += frameMs()) {
        const x = timeToX(t);
        if (x >= LEFT) p.line(x, 27, x, 32);
      }
    }
    p.noStroke();
    p.fill(36, 38, 45);
    p.rect(0, 0, LEFT, 32);
    p.fill(170);
    const frame = Math.round(st.time / frameMs());
    p.text(`Frame ${frame}   ${(st.time / 1000).toFixed(3)}s`, 8, 14);
    p.text("Wheel: zoom   PgUp/PgDn: frame", 8, 27);
    const x = timeToX(st.time);
    if (x >= LEFT) {
      p.stroke("#c89e02");
      p.line(x, 0, x, 32);
    }
  };

  p.mousePressed = () => {
    if (p.mouseY >= 0 && p.mouseY < 32 && p.mouseX >= LEFT && p.mouseX < p.width) { scrubbing = true; scrub(); }
  };
  p.mouseDragged = () => { if (scrubbing) scrub(); };
  p.mouseReleased = () => { scrubbing = false; };
  p.mouseWheel = (event) => {
    if (p.mouseY < 0 || p.mouseY >= 32 || p.mouseX < 0 || p.mouseX >= p.width) return;
    zoomAt(event, Math.max(LEFT, p.mouseX));
    return false;
  };
  p.windowResized = () => { p.resizeCanvas(width(), 32); fit(); };
}

// ------------------------------------------------------------------ tracks

export function timelineFrameCanvas(p) {
  let drag = null, list = [], lastDuration = project.duration;

  const resize = () => {
    list = rows();
    const h = Math.max(tracksDiv.clientHeight, list.length * ROW);
    if (p.width !== width() || p.height !== h) p.resizeCanvas(width(), h);
  };

  const rowAt = (y) => list[Math.floor(y / ROW)];

  // Keys drawn on a row, each with the references it selects.
  function rowKeys(row) {
    const l = row.layer;
    if (row.kind === "layer") {
      const byTime = new Map();
      for (const [name, , k] of layerKeys(l)) {
        if (!byTime.has(k.t)) byTime.set(k.t, []);
        byTime.get(k.t).push(keyRef(l.id, name, k.id));
      }
      return [...byTime].map(([t, refs]) => ({ t, refs }));
    }
    return l.props[row.name].keys.map((k) => ({ t: k.t, refs: [keyRef(l.id, row.name, k.id, row.vertex ?? -1)] }));
  }

  const isSelected = (refs) => refs.every((r) => st.keys.has(r) || st.keys.has(r.replace(/\|-?\d+$/, "|-1")));

  function diamond(x, y, r) {
    p.quad(x, y - r, x + r, y, x, y + r, x - r, y);
  }

  p.setup = () => {
    p.pixelDensity(1);
    p.createCanvas(width(), Math.max(tracksDiv.clientHeight, 100));
    p.textSize(11);
  };

  p.draw = () => {
    if (lastDuration !== project.duration) { lastDuration = project.duration; fit(); }
    resize();
    p.background(25, 27, 32);
    const colors = project.variants[st.variant].colors;

    list.forEach((row, i) => {
      const y = i * ROW, mid = y + ROW / 2, l = row.layer;
      const chosen = st.layers.has(l.id);
      p.noStroke();
      p.fill(row.kind === "layer" ? (chosen ? 56 : 40) : row.kind === "prop" ? 31 : 27);
      p.rect(0, y, p.width, ROW - 1);

      if (row.kind === "layer") {
        const a = Math.max(LEFT, timeToX(l.in)), b = timeToX(l.out);
        p.fill(chosen ? "rgba(200,158,2,.45)" : "rgba(200,158,2,.22)");
        if (b > a) p.rect(a, y + 3, b - a, ROW - 7, 3);
      }
      for (const { t, refs } of rowKeys(row)) {
        const x = timeToX(t);
        if (x < LEFT) continue;
        p.fill(isSelected(refs) ? "#c89e02" : row.kind === "layer" ? "#9aa0ad" : "#e8eaf0");
        diamond(x, mid, row.kind === "layer" ? 4 : 5);
      }

      // Left column
      p.fill(chosen && row.kind === "layer" ? 56 : 36);
      p.rect(0, y, LEFT, ROW - 1);
      if (row.kind === "layer") {
        p.fill(220);
        p.text(st.expanded.has(l.id) ? "▾" : "▸", 6, mid + 4);
        p.fill(colors[evalTrack(l.props.fill, st.time)[0]] ?? "#000");
        p.stroke(90);
        p.rect(20, mid - 5, 10, 10);
        p.noStroke();
        p.fill(235);
        p.text(l.name, 36, mid + 4);
        p.fill(130);
        p.text(l.type, LEFT - 50, mid + 4);
      } else if (row.kind === "prop") {
        const tr = l.props[row.name];
        p.stroke(tr.keys.length ? "#c89e02" : 120);
        p.fill(tr.keys.length ? "#c89e02" : 36);
        p.circle(30, mid, 9);
        p.noStroke();
        if (row.name === "path") {
          p.fill(170);
          p.text(st.pathExpanded.has(l.id) ? "▾" : "▸", 40, mid + 4);
        }
        p.fill(200);
        p.text(PROPS[row.name].label, 52, mid + 4);
        p.fill("#7fb6e8");
        p.text(formatValue(l, row.name), 140, mid + 4);
        const here = tr.keys.length && keyNear(tr, st.time, tolerance());
        p.stroke(150);
        p.fill(here ? "#c89e02" : 36);
        diamond(LEFT - 14, mid, 5);
        p.noStroke();
      } else {
        p.fill(150);
        p.text(`Vertex ${row.vertex + 1}`, 60, mid + 4);
      }
    });

    if (!list.length) {
      p.noStroke();
      p.fill(140);
      p.text("Draw a shape to start", LEFT + 10, 20);
    }

    const x = timeToX(st.time);
    if (x >= LEFT) {
      p.stroke("#c89e02");
      p.line(x, 0, x, p.height);
      p.noStroke();
    }
    if (drag?.mode === "marquee") {
      p.stroke(255, 120);
      p.noFill();
      p.rect(drag.sx, drag.sy, p.mouseX - drag.sx, p.mouseY - drag.sy);
    }
  };

  const insideTracks = () => {
    const r = tracksDiv.getBoundingClientRect(), c = p.canvas.getBoundingClientRect();
    const y = c.top + p.mouseY;
    return p.mouseX >= 0 && p.mouseX < p.width && y >= r.top && y < r.bottom;
  };

  // Clones every selected key in place and selects the clones (Alt + drag).
  function duplicateSelectedKeys() {
    const refs = new Set();
    for (const { layer, prop, track, key, vertex } of selectedKeys()) {
      const copy = JSON.parse(JSON.stringify(key));
      copy.id = uid();
      track.keys.push(copy);
      refs.add(keyRef(layer.id, prop, copy.id, vertex));
    }
    st.keys = refs;
  }

  function startKeyDrag(refs, t, event) {
    const l = getLayer(Number(refs[0].split("|")[0]));
    if (event.shiftKey) {
      const all = isSelected(refs);
      refs.forEach((r) => (all ? st.keys.delete(r) : st.keys.add(r)));
    } else if (!isSelected(refs)) {
      st.keys = new Set(refs);
    }
    if (!st.layers.has(l.id)) st.layers = new Set([l.id]);
    const duplicate = event.altKey;
    if (duplicate) duplicateSelectedKeys();
    const moves = selectedKeys().map((s) => ({ ...s, t: s.key.t }));
    drag = { mode: "keys", startX: p.mouseX, moves, moved: false, duplicate, clicked: t };
    refresh();
  }

  const rowKeysTime = (refs) => selectedKeys().find((s) => refs.includes(keyRef(s.layer.id, s.prop, s.key.id, s.vertex)) || refs.includes(keyRef(s.layer.id, s.prop, s.key.id)))?.key.t;

  p.mousePressed = (event) => {
    if (!insideTracks()) return;
    const row = rowAt(p.mouseY);

    if (p.mouseX < LEFT) {
      if (!row) return deselect();
      const l = row.layer;
      if (row.kind === "layer") {
        if (p.mouseX < 18) st.expanded.has(l.id) ? st.expanded.delete(l.id) : st.expanded.add(l.id);
        else if (event.shiftKey) st.layers.add(l.id);
        else select([l.id]);
        refresh();
      } else if (row.kind === "prop") {
        const tr = l.props[row.name];
        if (!st.layers.has(l.id)) select([l.id]);
        if (Math.abs(p.mouseX - 30) < 8) {
          toggleAnimated(tr, st.time);
          commit();
        } else if (Math.abs(p.mouseX - (LEFT - 14)) < 8) {
          const here = keyNear(tr, st.time, tolerance());
          if (here) removeKeys(tr, new Set([here.id]), st.time);
          else addKey(tr, st.time, tolerance());
          commit();
        } else if (row.name === "path" && p.mouseX >= 36 && p.mouseX < 50) {
          st.pathExpanded.has(l.id) ? st.pathExpanded.delete(l.id) : st.pathExpanded.add(l.id);
          refresh();
        } else {
          refresh();
        }
      } else {
        select([l.id]);
        st.vertices = new Set([row.vertex]);
        refresh();
      }
      return;
    }

    if (row) {
      const hit = rowKeys(row).find(({ t }) => Math.abs(timeToX(t) - p.mouseX) <= 6);
      if (hit) return startKeyDrag(hit.refs, hit.t, event);
      if (row.kind === "layer") {
        const l = row.layer, xi = timeToX(l.in), xo = timeToX(l.out);
        if (p.mouseX >= xi - EDGE && p.mouseX <= xo + EDGE) {
          if (!st.layers.has(l.id)) select([l.id]);
          const mode = Math.abs(p.mouseX - xi) <= EDGE ? "in" : Math.abs(p.mouseX - xo) <= EDGE ? "out" : "slide";
          drag = { mode, layer: l, startX: p.mouseX, in: l.in, out: l.out, keys: layerKeys(l).map(([, , k]) => ({ k, t: k.t })), moved: false };
          refresh();
          return;
        }
      }
    }
    drag = { mode: "marquee", sx: p.mouseX, sy: p.mouseY, shift: event.shiftKey };
  };

  function deselect() {
    select([]);
    refresh();
  }

  p.mouseDragged = () => {
    if (!drag || drag.mode === "marquee") return;
    if (!drag.moved && Math.abs(p.mouseX - drag.startX) < 3) return;
    drag.moved = true;
    const dt = Math.round((p.mouseX - drag.startX) * view.msPerPx / frameMs()) * frameMs();

    if (drag.mode === "keys") {
      for (const m of drag.moves) {
        const t = snapTime(m.t + dt);
        if (!m.track.keys.some((k) => k !== m.key && k.t === t && !drag.moves.some((o) => o.key === k))) m.key.t = t;
      }
      drag.moves.forEach((m) => m.track.keys.sort((a, b) => a.t - b.t));
    } else {
      const l = drag.layer, D = project.duration;
      if (drag.mode === "in") l.in = Math.max(0, Math.min(drag.out - frameMs(), Math.round(drag.in + dt)));
      else if (drag.mode === "out") l.out = Math.min(D, Math.max(drag.in + frameMs(), Math.round(drag.out + dt)));
      else {
        const shift = Math.max(-drag.in, Math.min(D - drag.out, dt));
        l.in = Math.round(drag.in + shift);
        l.out = Math.round(drag.out + shift);
        drag.keys.forEach(({ k, t }) => { k.t = Math.round(t + shift); });
      }
    }
    refresh();
  };

  p.mouseReleased = () => {
    const d = drag;
    drag = null;
    if (!d) return;
    if (d.mode === "keys") {
      if (!d.moved && d.duplicate) {
        // Alt+click without dragging drops the copies at the playhead.
        const offset = st.time - Math.min(...d.moves.map((m) => m.t));
        const clash = d.moves.some((m) => m.track.keys.some((k) => k !== m.key && Math.abs(k.t - (m.t + offset)) < 1));
        for (const m of d.moves) {
          if (clash || offset === 0) m.track.keys.splice(m.track.keys.indexOf(m.key), 1);
          else m.key.t = Math.round(m.t + offset);
        }
        d.moves.forEach((m) => m.track.keys.sort((a, b) => a.t - b.t));
        if (clash || offset === 0) st.keys.clear();
      } else if (!d.moved && d.clicked !== undefined) {
        st.time = d.clicked; // clicking a key parks the playhead on it, ready to edit
        st.playing = false;
      }
      commit();
    } else if (d.mode === "marquee") {
      const x0 = Math.min(d.sx, p.mouseX), x1 = Math.max(d.sx, p.mouseX), y0 = Math.min(d.sy, p.mouseY), y1 = Math.max(d.sy, p.mouseY);
      if (x1 - x0 < 3 && y1 - y0 < 3) return deselect();
      if (!d.shift) st.keys.clear();
      list.forEach((row, i) => {
        if ((i + 1) * ROW < y0 || i * ROW > y1 || row.kind === "layer") return;
        for (const { t, refs } of rowKeys(row)) {
          const x = timeToX(t);
          if (x >= x0 && x <= x1) refs.forEach((r) => st.keys.add(r));
        }
      });
      refresh();
    } else if (d.moved) {
      commit();
    }
  };

  p.mouseWheel = (event) => {
    if (!insideTracks() || !(event.ctrlKey || event.shiftKey)) return;
    if (event.ctrlKey) zoomAt(event, Math.max(LEFT, p.mouseX));
    else view.scroll = Math.max(0, view.scroll + event.deltaY * view.msPerPx);
    return false;
  };

  p.windowResized = () => { fit(); };
}
