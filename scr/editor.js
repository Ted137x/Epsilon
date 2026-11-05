import { project, programState as st, commit, refresh, activeShape, addShape, getShape, keyAt, insertPoint, select } from "./states.js";
import { bounds, colorSlotAt, pointInPolygon, sampleShape } from "./functions.js";

const div = document.getElementById("editor");
const HANDLE = 6;
const snap = (v) => Math.round(v * 4) / 4;

export const finishPen = { run: () => {} };

export function editorCanvas(p) {
  let size = 400, drag = null, pen = [], lastClick = 0;

  const scale = () => size / 240;
  const toX = (x) => size / 2 + x * scale();
  const toY = (y) => size / 2 - y * scale();
  const fromX = (x) => (x - size / 2) / scale();
  const fromY = (y) => (size / 2 - y) / scale();
  const inside = () => p.mouseX >= 0 && p.mouseY >= 0 && p.mouseX < size && p.mouseY < size;
  const near = (a, b, c, d, r = HANDLE + 2) => Math.hypot(a - c, b - d) <= r;
  const resize = () => { size = Math.max(100, Math.min(div.clientWidth, div.clientHeight)); };

  const pose = (s) => sampleShape(s, st.time).pts;
  const selectedShapes = () => [...st.shapes].map(getShape).filter(Boolean);

  function box() {
    const pts = selectedShapes().flatMap(pose);
    if (!pts.length || st.points.size) return null;
    const b = bounds(pts);
    return { ...b, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2 };
  }
  const corners = (b) => [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];

  function drawShape(s) {
    if (st.time < s.start || st.time >= s.end) return;
    p.noStroke();
    p.fill(project.variants[st.variant].colors[colorSlotAt(s, st.time)]);
    p.beginShape();
    for (const q of pose(s)) p.vertex(toX(q.x), toY(q.y));
    p.endShape(p.CLOSE);
  }

  function drawOnion(s) {
    p.noFill();
    p.strokeWeight(1);
    s.keys.forEach((k) => {
      if (k.t === st.time) return;
      p.stroke(k.t < st.time ? "rgba(255,120,120,.35)" : "rgba(120,255,160,.35)");
      p.beginShape();
      for (const q of k.pts) p.vertex(toX(q.x), toY(q.y));
      p.endShape(p.CLOSE);
    });
  }

  function drawSelection() {
    p.noFill();
    p.stroke("#c89e02");
    p.strokeWeight(1);
    for (const s of selectedShapes()) {
      p.beginShape();
      for (const q of pose(s)) p.vertex(toX(q.x), toY(q.y));
      p.endShape(p.CLOSE);
    }
    const s = activeShape();
    if (s) {
      pose(s).forEach((q, i) => {
        p.fill(st.points.has(i) ? "#c89e02" : "#fff");
        p.stroke(0);
        p.rect(toX(q.x) - 3, toY(q.y) - 3, 6, 6);
      });
    }
    const b = box();
    if (b) {
      p.noFill();
      p.stroke(200, 158, 2, 160);
      p.rect(toX(b.x0), toY(b.y1), (b.x1 - b.x0) * scale(), (b.y1 - b.y0) * scale());
      p.fill("#c89e02");
      p.noStroke();
      for (const [x, y] of corners(b)) p.rect(toX(x) - 4, toY(y) - 4, 8, 8);
      p.circle(toX(b.cx), toY(b.y1) - 18, 10);
    }
  }

  p.setup = () => {
    resize();
    p.pixelDensity(1);
    p.createCanvas(size, size);
    finishPen.run = closePen;
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

    project.shapes.forEach(drawShape);
    if (st.onion) selectedShapes().forEach(drawOnion);
    drawSelection();

    if (pen.length) {
      p.stroke("#c89e02");
      p.noFill();
      p.beginShape();
      for (const q of pen) p.vertex(toX(q.x), toY(q.y));
      p.vertex(p.mouseX, p.mouseY);
      p.endShape();
    }
    if (drag?.mode === "draw") {
      p.stroke("#c89e02");
      p.noFill();
      const pts = outline(drag.x, drag.y, fromX(p.mouseX), fromY(p.mouseY));
      p.beginShape();
      for (const q of pts) p.vertex(toX(q.x), toY(q.y));
      p.endShape(p.CLOSE);
    }
    if (drag?.mode === "marquee") {
      p.stroke(255, 120);
      p.noFill();
      p.rect(drag.sx, drag.sy, p.mouseX - drag.sx, p.mouseY - drag.sy);
    }
  };

  function outline(x0, y0, x1, y1) {
    if (st.tool === "rect") return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
    return Array.from({ length: 24 }, (_, i) => {
      const a = 2 * Math.PI * i / 24;
      return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
    });
  }

  function closePen() {
    if (pen.length >= 3) {
      addShape(pen, Math.round(st.time));
      commit();
    }
    pen = [];
  }

  function hitShape(x, y) {
    for (let i = project.shapes.length - 1; i >= 0; i--) {
      const s = project.shapes[i];
      if (st.time >= s.start && st.time < s.end && pointInPolygon(x, y, pose(s))) return s;
    }
    return null;
  }

  function startEdit(mode, extra = {}) {
    const items = selectedShapes().map((s) => ({ s, base: pose(s) }));
    drag = { mode, x: fromX(p.mouseX), y: fromY(p.mouseY), items, moved: false, ...extra };
  }

  function insertOnEdge(x, y) {
    const s = activeShape();
    if (!s) return false;
    const pts = pose(s);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
      if (!len) continue;
      const f = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len));
      if (Math.hypot(a.x + dx * f - x, a.y + dy * f - y) * scale() < 6) {
        insertPoint(s, i, f);
        commit();
        return true;
      }
    }
    return false;
  }

  p.mousePressed = (event) => {
    if (!inside()) return;
    const x = fromX(p.mouseX), y = fromY(p.mouseY), now = performance.now();
    const double = now - lastClick < 300;
    lastClick = now;

    if (st.tool === "pen") {
      if (pen.length >= 3 && (double || near(p.mouseX, p.mouseY, toX(pen[0].x), toY(pen[0].y)))) closePen();
      else pen.push({ x: snap(x), y: snap(y) });
      return;
    }
    if (st.tool !== "select") {
      drag = { mode: "draw", x: snap(x), y: snap(y) };
      return;
    }
    if (double && insertOnEdge(x, y)) return;

    const b = box();
    if (b) {
      if (near(p.mouseX, p.mouseY, toX(b.cx), toY(b.y1) - 18)) return startEdit("rotate", { cx: b.cx, cy: b.cy });
      const hit = corners(b).findIndex(([cx, cy]) => near(p.mouseX, p.mouseY, toX(cx), toY(cy)));
      if (hit >= 0) {
        const [ox, oy] = corners(b)[(hit + 2) % 4];
        return startEdit("scale", { ox, oy });
      }
    }

    const active = activeShape();
    if (active) {
      const i = pose(active).findIndex((q) => near(p.mouseX, p.mouseY, toX(q.x), toY(q.y)));
      if (i >= 0) {
        if (event.shiftKey) st.points.has(i) ? st.points.delete(i) : st.points.add(i);
        else if (!st.points.has(i)) st.points = new Set([i]);
        refresh();
        return startEdit("points");
      }
    }

    const s = hitShape(x, y);
    if (s) {
      if (event.shiftKey) { st.shapes.add(s.id); st.points.clear(); }
      else if (!st.shapes.has(s.id)) select([s.id]);
      else st.points.clear();
      refresh();
      return startEdit("move");
    }

    if (!event.shiftKey && !active) select([]);
    st.points.clear();
    refresh();
    drag = { mode: "marquee", sx: p.mouseX, sy: p.mouseY };
  };

  p.mouseDragged = () => {
    if (!drag?.items) return;
    const x = fromX(p.mouseX), y = fromY(p.mouseY);
    const dx = x - drag.x, dy = y - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) * scale() < 2) return;
    drag.moved = true;

    for (const { s, base } of drag.items) {
      const key = keyAt(s, st.time);
      base.forEach((q, i) => {
        let nx = q.x, ny = q.y;
        if (drag.mode === "move") { nx += dx; ny += dy; }
        else if (drag.mode === "points") { if (s === activeShape() && st.points.has(i)) { nx += dx; ny += dy; } }
        else if (drag.mode === "scale") {
          const fx = drag.x === drag.ox ? 1 : (x - drag.ox) / (drag.x - drag.ox);
          const fy = drag.y === drag.oy ? 1 : (y - drag.oy) / (drag.y - drag.oy);
          nx = drag.ox + (q.x - drag.ox) * fx;
          ny = drag.oy + (q.y - drag.oy) * fy;
        } else if (drag.mode === "rotate") {
          const a = Math.atan2(y - drag.cy, x - drag.cx) - Math.atan2(drag.y - drag.cy, drag.x - drag.cx);
          const rx = q.x - drag.cx, ry = q.y - drag.cy;
          nx = drag.cx + rx * Math.cos(a) - ry * Math.sin(a);
          ny = drag.cy + rx * Math.sin(a) + ry * Math.cos(a);
        }
        key.pts[i].x = snap(nx);
        key.pts[i].y = snap(ny);
      });
    }
    refresh();
  };

  p.mouseReleased = () => {
    const d = drag;
    drag = null;
    if (!d) return;
    if (d.mode === "draw") {
      const x = snap(fromX(p.mouseX)), y = snap(fromY(p.mouseY));
      if (Math.abs(x - d.x) > 1 && Math.abs(y - d.y) > 1) {
        addShape(outline(d.x, d.y, x, y), Math.round(st.time));
        commit();
      }
    } else if (d.mode === "marquee") {
      const x0 = Math.min(d.sx, p.mouseX), x1 = Math.max(d.sx, p.mouseX), y0 = Math.min(d.sy, p.mouseY), y1 = Math.max(d.sy, p.mouseY);
      if (x1 - x0 < 3 && y1 - y0 < 3) {
        select([]);
      } else {
        const within = (q) => toX(q.x) >= x0 && toX(q.x) <= x1 && toY(q.y) >= y0 && toY(q.y) <= y1;
        const active = activeShape();
        if (active) st.points = new Set(pose(active).flatMap((q, i) => (within(q) ? [i] : [])));
        else select(project.shapes.filter((s) => pose(s).some(within)).map((s) => s.id));
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

