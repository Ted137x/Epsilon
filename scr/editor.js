// The main canvas: draws the frame at the playhead and handles the drawing tools,
// layer transforms and bezier path editing. Coordinates are y-up pixels from the
// display centre ("world"); each layer also has its own local space (see model.js).

import {
  project, programState as st, commit, refresh, activeLayer, selectedLayers, select, addLayer, setProp, propAt,
} from "./states.js";
import {
  isVisible, worldOutline, fillAt, transformAt, localVertices, makeLayer, insertVertex, vertex,
} from "./model.js";
import { apply, unapply, unapplyVector, flattenPath, pointInPolygon, bounds, segmentControls, bezierPoint } from "./functions.js";

const div = document.getElementById("editor");
const HIT = 7;          // pick radius in screen pixels
const ROTATE_GAP = 22;  // rotation handle distance above the box, screen pixels

// Lets the keyboard handler finish or cancel a pen path.
export const pen = { finish: () => {}, cancel: () => {} };

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a, b) => a.x * b.x + a.y * b.y;

export function editorCanvas(p) {
  let size = 400, drag = null, penPath = [], lastClick = 0;

  const scale = () => size / 240;
  const toX = (x) => size / 2 + x * scale();
  const toY = (y) => size / 2 - y * scale();
  const mouse = () => ({ x: (p.mouseX - size / 2) / scale(), y: (size / 2 - p.mouseY) / scale() });
  const inside = () => p.mouseX >= 0 && p.mouseY >= 0 && p.mouseX < size && p.mouseY < size;
  const near = (a, b) => Math.hypot(toX(a.x) - toX(b.x), toY(a.y) - toY(b.y)) <= HIT;
  const resize = () => { size = Math.max(100, Math.min(div.clientWidth, div.clientHeight)); };

  // ------------------------------------------------------------ geometry helpers

  const isPathEditing = (l) => l && l.type === "path" && st.layers.size === 1;

  // Transform box of a layer: its local bounds mapped to world, plus the rotate handle.
  function transformBox(l) {
    const m = transformAt(l, st.time), b = bounds(flattenPath(localVertices(l, st.time)));
    const corners = [[b.x0, b.y1], [b.x1, b.y1], [b.x1, b.y0], [b.x0, b.y0]].map(([x, y]) => apply(m, { x, y }));
    const top = apply(m, { x: (b.x0 + b.x1) / 2, y: b.y1 });
    const up = apply(m, { x: (b.x0 + b.x1) / 2, y: b.y1 + 1 });
    const len = Math.hypot(up.x - top.x, up.y - top.y) || 1;
    const gap = ROTATE_GAP / scale();
    const rotate = { x: top.x + (up.x - top.x) / len * gap, y: top.y + (up.y - top.y) / len * gap };
    const [x, y] = propAt(l, "position"); // the anchor point always lands on the position
    return { corners, top, rotate, anchor: { x, y } };
  }

  function hitLayer(pt) {
    for (let i = project.layers.length - 1; i >= 0; i--) {
      const l = project.layers[i];
      if (isVisible(l, st.time) && pointInPolygon(pt.x, pt.y, worldOutline(l, st.time))) return l;
    }
    return null;
  }

  function pathPoints(l) {
    const m = transformAt(l, st.time);
    return localVertices(l, st.time).map((v) => ({
      at: apply(m, v), in: apply(m, { x: v.x + v.ix, y: v.y + v.iy }), out: apply(m, { x: v.x + v.ox, y: v.y + v.oy }),
    }));
  }

  // Closest segment of the active path to pt, with its parameter, if within reach.
  function hitSegment(l, pt) {
    const m = transformAt(l, st.time), v = localVertices(l, st.time);
    let best = null;
    for (let i = 0; i < v.length; i++) {
      const c = segmentControls(v, i);
      for (let k = 0; k <= 40; k++) {
        const q = apply(m, bezierPoint(...c, k / 40)), d = Math.hypot(q.x - pt.x, q.y - pt.y) * scale();
        if (d < HIT && (!best || d < best.d)) best = { i, u: k / 40, d };
      }
    }
    return best;
  }

  // ------------------------------------------------------------ drawing

  function polygon(points, close = true) {
    p.beginShape();
    for (const q of points) p.vertex(toX(q.x), toY(q.y));
    p.endShape(close ? p.CLOSE : undefined);
  }

  function drawOnion(l) {
    const times = new Set(Object.values(l.props).flatMap((tr) => tr.keys.map((k) => k.t)));
    p.noFill();
    p.strokeWeight(1);
    for (const t of times) {
      if (Math.abs(t - st.time) < 1 || !isVisible(l, t)) continue;
      p.stroke(t < st.time ? "rgba(255,120,120,.4)" : "rgba(120,255,160,.4)");
      polygon(worldOutline(l, t));
    }
  }

  function drawSelection() {
    p.noFill();
    p.stroke("#c89e02");
    p.strokeWeight(1);
    for (const l of selectedLayers()) if (isVisible(l, st.time)) polygon(worldOutline(l, st.time));

    const l = activeLayer();
    if (!l) return;
    const box = transformBox(l);
    p.stroke(200, 158, 2, 150);
    polygon(box.corners);
    p.line(toX(box.top.x), toY(box.top.y), toX(box.rotate.x), toY(box.rotate.y));
    p.noStroke();
    p.fill("#c89e02");
    for (const c of box.corners) p.rect(toX(c.x) - 4, toY(c.y) - 4, 8, 8);
    p.circle(toX(box.rotate.x), toY(box.rotate.y), 10);
    p.stroke("#c89e02");
    p.noFill();
    p.circle(toX(box.anchor.x), toY(box.anchor.y), 9);
    p.line(toX(box.anchor.x) - 7, toY(box.anchor.y), toX(box.anchor.x) + 7, toY(box.anchor.y));
    p.line(toX(box.anchor.x), toY(box.anchor.y) - 7, toX(box.anchor.x), toY(box.anchor.y) + 7);

    if (!isPathEditing(l)) return;
    pathPoints(l).forEach((q, i) => {
      if (st.vertices.has(i)) {
        p.stroke(200);
        p.line(toX(q.in.x), toY(q.in.y), toX(q.at.x), toY(q.at.y));
        p.line(toX(q.out.x), toY(q.out.y), toX(q.at.x), toY(q.at.y));
        p.fill(255);
        p.circle(toX(q.in.x), toY(q.in.y), 7);
        p.circle(toX(q.out.x), toY(q.out.y), 7);
      }
      p.fill(st.vertices.has(i) ? "#c89e02" : "#fff");
      p.stroke(0);
      p.rect(toX(q.at.x) - 3.5, toY(q.at.y) - 3.5, 7, 7);
    });
  }

  function drawPen() {
    if (!penPath.length) return;
    p.stroke("#c89e02");
    p.noFill();
    const pts = penPath.length > 1 ? flattenPath(penPath).slice(0, -1) : penPath;
    p.beginShape();
    for (const q of pts) p.vertex(toX(q.x), toY(q.y));
    const last = penPath.at(-1);
    p.vertex(toX(last.x), toY(last.y));
    p.vertex(p.mouseX, p.mouseY);
    p.endShape();
    for (const q of penPath) p.rect(toX(q.x) - 3, toY(q.y) - 3, 6, 6);
  }

  p.setup = () => {
    resize();
    p.pixelDensity(1);
    p.createCanvas(size, size);
    pen.finish = finishPen;
    pen.cancel = () => { penPath = []; };
  };

  p.draw = () => {
    p.background(0);
    p.noFill();
    p.stroke(90);
    p.strokeWeight(1);
    p.circle(size / 2, size / 2, size - 1);
    p.stroke(40);
    p.line(size / 2, 0, size / 2, size);
    p.line(0, size / 2, size, size / 2);

    const colors = project.variants[st.variant].colors;
    p.noStroke();
    for (const l of project.layers) {
      if (!isVisible(l, st.time)) continue;
      p.fill(fillAt(l, st.time, colors));
      polygon(worldOutline(l, st.time));
    }
    if (st.onion) selectedLayers().forEach(drawOnion);
    drawSelection();
    drawPen();

    if (drag?.mode === "shape") {
      p.stroke("#c89e02");
      p.noFill();
      const { center, size: s } = shapeBox(drag.start, mouse(), drag.shift);
      if (st.tool === "rect") p.rect(toX(center.x - s[0] / 2), toY(center.y + s[1] / 2), s[0] * scale(), s[1] * scale());
      else p.ellipse(toX(center.x), toY(center.y), s[0] * scale(), s[1] * scale());
    }
    if (drag?.mode === "marquee") {
      p.stroke(255, 120);
      p.noFill();
      p.rect(drag.sx, drag.sy, p.mouseX - drag.sx, p.mouseY - drag.sy);
    }
  };

  // ------------------------------------------------------------ creating shapes

  function shapeBox(a, b, square) {
    let w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    if (square) w = h = Math.max(w, h);
    const center = { x: a.x + Math.sign(b.x - a.x || 1) * w / 2, y: a.y + Math.sign(b.y - a.y || 1) * h / 2 };
    return { center, size: [w, h] };
  }

  const nextName = (base) => `${base} ${project.layers.filter((l) => l.name.startsWith(base)).length + 1}`;

  function finishPen() {
    if (penPath.length >= 3) {
      const c = penPath.reduce((o, q) => ({ x: o.x + q.x / penPath.length, y: o.y + q.y / penPath.length }), { x: 0, y: 0 });
      const path = penPath.map((q) => ({ ...q, x: q.x - c.x, y: q.y - c.y }));
      addLayer(makeLayer("path", { name: nextName("Path"), path, position: [c.x, c.y], duration: project.duration }));
      commit();
    }
    penPath = [];
  }

  // ------------------------------------------------------------ mouse

  // Values every drag starts from, so moves are relative and never accumulate rounding.
  const snapshot = () => selectedLayers().map((l) => ({
    l, position: propAt(l, "position"), scale: propAt(l, "scale"), rotation: propAt(l, "rotation")[0],
    path: l.type === "path" ? propAt(l, "path") : null, m: transformAt(l, st.time),
  }));

  function startDrag(mode, extra = {}) {
    st.playing = false;
    drag = { mode, start: mouse(), base: snapshot(), moved: false, ...extra };
  }

  p.mousePressed = (event) => {
    if (!inside()) return;
    const pt = mouse(), now = performance.now(), double = now - lastClick < 300;
    lastClick = now;

    if (st.tool === "pen") {
      if (penPath.length >= 3 && near(pt, penPath[0])) return finishPen();
      penPath.push(vertex(pt.x, pt.y));
      drag = { mode: "pen", start: pt };
      return;
    }
    if (st.tool === "rect" || st.tool === "ellipse") {
      drag = { mode: "shape", start: pt, shift: event.shiftKey };
      return;
    }

    const l = activeLayer();
    if (isPathEditing(l)) {
      const pts = pathPoints(l);
      for (const i of st.vertices) {
        if (pts[i] && near(pt, pts[i].out)) return startDrag("handle", { index: i, which: "out" });
        if (pts[i] && near(pt, pts[i].in)) return startDrag("handle", { index: i, which: "in" });
      }
      const i = pts.findIndex((q) => near(pt, q.at));
      if (i >= 0) {
        if (event.altKey) return toggleSmooth(l, i);
        if (event.shiftKey) st.vertices.has(i) ? st.vertices.delete(i) : st.vertices.add(i);
        else if (!st.vertices.has(i)) st.vertices = new Set([i]);
        refresh();
        return startDrag("vertices");
      }
      const seg = double && hitSegment(l, pt);
      if (seg) {
        insertVertex(l, seg.i, seg.u);
        st.vertices = new Set([seg.i + 1]);
        commit();
        return;
      }
    }

    if (l && isVisible(l, st.time)) {
      const box = transformBox(l);
      if (near(pt, box.rotate)) return startDrag("rotate", { pivot: box.anchor });
      const corner = box.corners.findIndex((c) => near(pt, c));
      if (corner >= 0) return startDrag("scale", { pivot: box.anchor });
    }

    const hit = hitLayer(pt);
    if (hit) {
      if (event.shiftKey) { st.layers.has(hit.id) ? st.layers.delete(hit.id) : st.layers.add(hit.id); st.vertices.clear(); }
      else if (!st.layers.has(hit.id)) select([hit.id]);
      else if (hit !== l) { st.layers.delete(hit.id); st.layers.add(hit.id); st.vertices.clear(); }
      refresh();
      return startDrag("move");
    }

    drag = { mode: "marquee", sx: p.mouseX, sy: p.mouseY, shift: event.shiftKey };
  };

  function toggleSmooth(l, i) {
    const v = propAt(l, "path"), q = v[i];
    if (q.ix || q.iy || q.ox || q.oy) {
      Object.assign(q, { ix: 0, iy: 0, ox: 0, oy: 0 });
    } else {
      const a = v[(i + v.length - 1) % v.length], b = v[(i + 1) % v.length];
      q.ox = (b.x - a.x) / 6; q.oy = (b.y - a.y) / 6; q.ix = -q.ox; q.iy = -q.oy;
    }
    setProp(l, "path", v);
    st.vertices = new Set([i]);
    commit();
  }

  p.mouseDragged = (event) => {
    if (!drag) return;
    drag.shift = event.shiftKey; // Shift can be pressed mid-drag, like After Effects
    const pt = mouse();
    if (drag.mode === "pen") {
      const q = penPath.at(-1), d = sub(pt, drag.start);
      if (Math.hypot(d.x, d.y) * scale() > 3) Object.assign(q, { ox: d.x, oy: d.y, ix: -d.x, iy: -d.y });
      return;
    }
    if (!drag.base) return;
    const d = sub(pt, drag.start);
    if (!drag.moved && Math.hypot(d.x, d.y) * scale() < 2) return;
    drag.moved = true;

    for (const b of drag.base) {
      if (drag.mode === "move") {
        setProp(b.l, "position", [b.position[0] + d.x, b.position[1] + d.y]);
      } else if (drag.mode === "scale") {
        // Measure along the layer's own rotated axes, relative to its anchor.
        const r = -b.rotation * Math.PI / 180, ax = { x: Math.cos(r), y: Math.sin(r) }, ay = { x: -Math.sin(r), y: Math.cos(r) };
        const u0 = sub(drag.start, drag.pivot), u = sub(pt, drag.pivot);
        let fx = Math.abs(dot(u0, ax)) > 0.5 ? dot(u, ax) / dot(u0, ax) : 1;
        let fy = Math.abs(dot(u0, ay)) > 0.5 ? dot(u, ay) / dot(u0, ay) : 1;
        if (drag.shift) fx = fy = dot(u, u0) / dot(u0, u0);  // keep proportions
        setProp(b.l, "scale", [b.scale[0] * fx, b.scale[1] * fy]);
      } else if (drag.mode === "rotate") {
        const a0 = Math.atan2(drag.start.y - drag.pivot.y, drag.start.x - drag.pivot.x);
        const a1 = Math.atan2(pt.y - drag.pivot.y, pt.x - drag.pivot.x);
        let rot = b.rotation - (a1 - a0) * 180 / Math.PI;
        if (drag.shift) rot = Math.round(rot / 15) * 15;
        setProp(b.l, "rotation", [rot]);
      } else if (b.path && b.l === activeLayer()) {
        const v = b.path.map((q) => ({ ...q }));
        if (drag.mode === "vertices") {
          const local = unapplyVector(b.m, d);
          for (const i of st.vertices) { v[i].x += local.x; v[i].y += local.y; }
        } else if (drag.mode === "handle") {
          const q = v[drag.index], at = unapply(b.m, pt), rel = { x: at.x - q.x, y: at.y - q.y };
          const [mine, other] = drag.which === "out" ? ["o", "i"] : ["i", "o"];
          q[mine + "x"] = rel.x; q[mine + "y"] = rel.y;
          if (!event.altKey) { q[other + "x"] = -rel.x; q[other + "y"] = -rel.y; }  // Alt breaks the handle
        }
        setProp(b.l, "path", v);
      }
    }
    refresh();
  };

  p.mouseReleased = () => {
    const d = drag;
    drag = null;
    if (!d) return;
    if (d.mode === "shape") {
      const { center, size: s } = shapeBox(d.start, mouse(), d.shift);
      if (s[0] > 1 && s[1] > 1) {
        const name = nextName(st.tool === "rect" ? "Rectangle" : "Ellipse");
        addLayer(makeLayer(st.tool, { name, position: [center.x, center.y], size: s, duration: project.duration }));
        commit();
      }
    } else if (d.mode === "marquee") {
      const x0 = Math.min(d.sx, p.mouseX), x1 = Math.max(d.sx, p.mouseX), y0 = Math.min(d.sy, p.mouseY), y1 = Math.max(d.sy, p.mouseY);
      const within = (q) => toX(q.x) >= x0 && toX(q.x) <= x1 && toY(q.y) >= y0 && toY(q.y) <= y1;
      if (x1 - x0 < 3 && y1 - y0 < 3) {
        select([]);
      } else if (isPathEditing(activeLayer())) {
        st.vertices = new Set(pathPoints(activeLayer()).flatMap((q, i) => (within(q.at) ? [i] : [])));
      } else {
        const hits = project.layers.filter((l) => isVisible(l, st.time) && worldOutline(l, st.time).some(within)).map((l) => l.id);
        select(d.shift ? [...st.layers, ...hits] : hits);
      }
      refresh();
    } else if (d.moved) {
      commit();
    }
  };

  p.windowResized = () => {
    resize();
    p.resizeCanvas(size, size);
  };
}
