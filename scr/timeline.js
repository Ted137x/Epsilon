import { project, programState as st, commit, refresh, getShape, select, selKey } from "./states.js";

const zoomDiv = document.getElementById("zoombar");
const frameDiv = document.getElementById("framebar");
const LEFT = 150, ROW = 20;
const view = { msPerPx: 0, scroll: 0 };

const width = () => zoomDiv.clientWidth;
const fit = () => { view.msPerPx = project.duration / Math.max(100, width() - LEFT - 16); view.scroll = 0; };
const timeToX = (t) => LEFT + (t - view.scroll) / view.msPerPx;
const xToTime = (x) => (x - LEFT) * view.msPerPx + view.scroll;
const snapTime = (t) => Math.max(0, Math.min(project.duration, Math.round(t / 10) * 10));

function rows() {
  const out = [];
  for (const s of [...project.shapes].reverse()) {
    out.push({ s, point: -1 });
    if (st.expanded.has(s.id)) s.keys[0].pts.forEach((_, i) => out.push({ s, point: i }));
  }
  return out;
}

function zoomAt(event, x) {
  const t = xToTime(x);
  view.msPerPx = Math.min(project.duration / 100, Math.max(0.5, view.msPerPx * Math.exp(event.deltaY * 0.001)));
  view.scroll = Math.max(0, t - (x - LEFT) * view.msPerPx);
}

export function timelineZoomCanvas(p) {
  let scrubbing = false;
  const scrub = () => {
    st.time = Math.max(0, Math.min(project.duration - 1, xToTime(p.mouseX)));
    st.playing = false;
    refresh();
  };

  p.setup = () => {
    p.pixelDensity(1);
    p.createCanvas(width(), 32);
    fit();
    p.textSize(10);
  };

  p.draw = () => {
    p.background(36, 38, 45);
    const step = [50, 100, 250, 500, 1000, 2000, 5000, 10000].find((s) => s / view.msPerPx >= 50) ?? 20000;
    p.stroke(90);
    for (let t = 0; t <= project.duration; t += step) {
      const x = timeToX(t);
      if (x < LEFT) continue;
      p.stroke(90);
      p.line(x, 20, x, 32);
      p.noStroke();
      p.fill(170);
      p.text(`${(t / 1000).toFixed(2)}s`, x + 3, 12);
    }
    p.noStroke();
    p.fill(36, 38, 45);
    p.rect(0, 0, LEFT, 32);
    p.fill(170);
    p.text("Wheel: zoom", 8, 19);
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

export function timelineFrameCanvas(p) {
  let drag = null, list = [], lastDuration = project.duration;

  const size = () => {
    list = rows();
    const h = Math.max(frameDiv.clientHeight, list.length * ROW);
    if (p.width !== width() || p.height !== h) p.resizeCanvas(width(), h);
  };

  function keyHit(mx, my) {
    const row = list[Math.floor(my / ROW)];
    if (!row || mx < LEFT) return null;
    const key = row.s.keys.find((k) => Math.abs(timeToX(k.t) - mx) <= 6);
    return key ? { row, key } : null;
  }

  p.setup = () => {
    p.pixelDensity(1);
    p.createCanvas(width(), Math.max(frameDiv.clientHeight, 100));
    p.textSize(11);
  };

  p.draw = () => {
    if (lastDuration !== project.duration) { lastDuration = project.duration; fit(); }
    size();
    p.background(25, 27, 32);

    list.forEach((row, i) => {
      const y = i * ROW, mid = y + ROW / 2, s = row.s;
      const chosen = row.point < 0 && st.shapes.has(s.id);
      p.noStroke();
      p.fill(chosen ? 52 : row.point < 0 ? 36 : 30);
      p.rect(0, y, p.width, ROW - 1);

      p.fill(200, 158, 2, 40);
      const a = Math.max(LEFT, timeToX(s.start)), b = timeToX(s.end);
      if (b > a) p.rect(a, y + 3, b - a, ROW - 7);

      for (let k = 0; k < s.keys.length; k++) {
        const key = s.keys[k], x = timeToX(key.t);
        if (x < LEFT) continue;
        const on = st.keys.has(selKey(s.id, key.id, row.point)) || st.keys.has(selKey(s.id, key.id));
        p.fill(on ? "#c89e02" : row.point < 0 ? "#e8eaf0" : "#8a8f9c");
        p.quad(x, mid - 5, x + 5, mid, x, mid + 5, x - 5, mid);
      }

      p.fill(36, 38, 45);
      p.rect(0, y, LEFT, ROW - 1);
      p.fill(row.point < 0 ? 232 : 160);
      p.text(row.point < 0 ? `${st.expanded.has(s.id) ? "▾" : "▸"} ${s.name}` : `    Point ${row.point + 1}`, 8, mid + 4);
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

  const insideCanvas = () => {
    const r = frameDiv.getBoundingClientRect(), c = p.canvas.getBoundingClientRect();
    const y = c.top + p.mouseY;
    return p.mouseX >= 0 && p.mouseX < p.width && y >= r.top && y < r.bottom;
  };

  p.mousePressed = (event) => {
    if (!insideCanvas()) return;
    const shift = event.shiftKey;

    if (p.mouseX < LEFT) {
      const row = list[Math.floor(p.mouseY / ROW)];
      if (!row) return;
      if (row.point < 0) {
        if (p.mouseX < 22) st.expanded.has(row.s.id) ? st.expanded.delete(row.s.id) : st.expanded.add(row.s.id);
        else if (shift) st.shapes.add(row.s.id);
        else select([row.s.id]);
      } else {
        select([row.s.id]);
        st.points = new Set([row.point]);
      }
      refresh();
      return;
    }

    const hit = keyHit(p.mouseX, p.mouseY);
    if (hit) {
      const id = selKey(hit.row.s.id, hit.key.id, hit.row.point);
      if (shift) st.keys.has(id) ? st.keys.delete(id) : st.keys.add(id);
      else if (!st.keys.has(id)) st.keys = new Set([id]);
      const moves = [...st.keys].flatMap((item) => {
        const [sid, kid] = item.split("|").map(Number);
        const key = getShape(sid)?.keys.find((k) => k.id === kid);
        return key ? [{ s: getShape(sid), key, t: key.t }] : [];
      });
      drag = { mode: "keys", startX: p.mouseX, moves, moved: false };
      refresh();
      return;
    }

    if (!shift) st.keys.clear();
    drag = { mode: "marquee", sx: p.mouseX, sy: p.mouseY };
    refresh();
  };

  p.mouseDragged = () => {
    if (drag?.mode !== "keys") return;
    const dt = (p.mouseX - drag.startX) * view.msPerPx;
    if (Math.abs(p.mouseX - drag.startX) < 2 && !drag.moved) return;
    drag.moved = true;
    for (const m of drag.moves) {
      const t = snapTime(m.t + dt);
      if (!m.s.keys.some((k) => k !== m.key && k.t === t)) m.key.t = t;
    }
    drag.moves.forEach((m) => m.s.keys.sort((a, b) => a.t - b.t));
    refresh();
  };

  p.mouseReleased = () => {
    const d = drag;
    drag = null;
    if (d?.mode === "keys") {
      if (d.moved) commit();
    } else if (d?.mode === "marquee") {
      const x0 = Math.min(d.sx, p.mouseX), x1 = Math.max(d.sx, p.mouseX), y0 = Math.min(d.sy, p.mouseY), y1 = Math.max(d.sy, p.mouseY);
      if (x1 - x0 < 3 && y1 - y0 < 3) {
        if (d.sx >= LEFT) { st.time = Math.max(0, Math.min(project.duration - 1, xToTime(d.sx))); st.playing = false; }
      } else {
        list.forEach((row, i) => {
          if ((i + 1) * ROW < y0 || i * ROW > y1) return;
          for (const k of row.s.keys) {
            const x = timeToX(k.t);
            if (x >= x0 && x <= x1) st.keys.add(selKey(row.s.id, k.id, row.point));
          }
        });
      }
      refresh();
    }
  };

  p.mouseWheel = (event) => {
    if (!insideCanvas() || !(event.ctrlKey || event.shiftKey)) return;
    if (event.ctrlKey) zoomAt(event, Math.max(LEFT, p.mouseX));
    else view.scroll = Math.max(0, view.scroll + event.deltaY * view.msPerPx);
    return false;
  };

  p.windowResized = () => { fit(); };
}
