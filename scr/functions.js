// Pure maths shared by the editor panels, the model and the compiler.
// Nothing here knows about the project or the UI.

export const LINEAR = [0.3, 0.3, 0.7, 0.7];
export const EASY_EASE = [0.33, 0, 0.67, 1];
export const KAPPA = 0.5523; // handle length for a circle drawn with 4 bezier segments

const cubic = (a, b, t) => {
  const u = 1 - t;
  return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
};

// Eased progress at linear progress x for a CSS-style curve [x1, y1, x2, y2].
// Bisection rather than Newton: handles on x = 0 or 1 give a zero slope where Newton divides by zero.
export function easeAt(c, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const x1 = Math.min(1, Math.max(0, c[0])), x2 = Math.min(1, Math.max(0, c[2]));
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    if (cubic(x1, x2, t) < x) lo = t; else hi = t;
  }
  return cubic(c[1], c[3], (lo + hi) / 2);
}

export function hexTo565(hex) {
  const v = parseInt(hex.slice(1), 16);
  return ((v >> 19) & 31) << 11 | ((v >> 10) & 63) << 5 | ((v >> 3) & 31);
}

export function blendHex(a, b, f) {
  f = Math.min(1, Math.max(0, f));
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((x >> s) & 255) + (((y >> s) & 255) - ((x >> s) & 255)) * f);
  return "#" + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0");
}

// Index of the key segment containing t. The last index means "hold the last key".
export function segmentAt(keys, t) {
  let k = 0;
  while (k < keys.length - 1 && t >= keys[k + 1].t) k++;
  return k;
}

export function bezierPoint(p0, p1, p2, p3, t) {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

// The four control points of segment i of a closed path.
export function segmentControls(v, i) {
  const a = v[i], b = v[(i + 1) % v.length];
  return [{ x: a.x, y: a.y }, { x: a.x + a.ox, y: a.y + a.oy }, { x: b.x + b.ix, y: b.y + b.iy }, { x: b.x, y: b.y }];
}

const straight = (a, b) => !a.ox && !a.oy && !b.ix && !b.iy;

// Closed bezier path to a polygon. Straight segments add one point, curves add `steps`.
export function flattenPath(v, steps = 16) {
  const out = [];
  for (let i = 0; i < v.length; i++) {
    const n = straight(v[i], v[(i + 1) % v.length]) ? 1 : steps;
    const [p0, p1, p2, p3] = segmentControls(v, i);
    for (let k = 0; k < n; k++) out.push(bezierPoint(p0, p1, p2, p3, k / n));
  }
  return out;
}

export function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if ((pts[i].y > y) !== (pts[j].y > y) &&
        x < pts[i].x + (y - pts[i].y) * (pts[j].x - pts[i].x) / (pts[j].y - pts[i].y)) inside = !inside;
  }
  return inside;
}

export function bounds(pts) {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

// 2D affine matrix {a, b, c, d, e, f}: x' = a*x + c*y + e, y' = b*x + d*y + f.
// Same order as After Effects: move the anchor to the origin, scale, rotate, then position.
// Coordinates are y-up, so positive (clockwise on screen) rotation is a negative maths angle.
export function layerMatrix(anchor, position, scale, rotation) {
  const r = -rotation * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
  const sx = scale[0] / 100, sy = scale[1] / 100;
  const a = cs * sx, b = sn * sx, c = -sn * sy, d = cs * sy;
  return { a, b, c, d, e: position[0] - (a * anchor[0] + c * anchor[1]), f: position[1] - (b * anchor[0] + d * anchor[1]) };
}

export const apply = (m, p) => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });

// Maps a world-space vector (not a point) back into layer space.
export function unapplyVector(m, v) {
  const det = m.a * m.d - m.b * m.c || 1e-9;
  return { x: (m.d * v.x - m.c * v.y) / det, y: (-m.b * v.x + m.a * v.y) / det };
}

export const unapply = (m, p) => unapplyVector(m, { x: p.x - m.e, y: p.y - m.f });
