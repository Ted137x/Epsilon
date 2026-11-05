// Curve maths and shape sampling shared by the editor panels and the compiler.

export const LINEAR = [0.3, 0.3, 0.7, 0.7];

const bezier = (a, b, t) => {
  const u = 1 - t;
  return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
};

// Eased progress (0..1, may overshoot) at linear progress x. Bisection rather than
// Newton: handles fall on x = 0 or 1 where the slope is zero and Newton gives NaN.
export function easeAt(c, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const x1 = Math.min(1, Math.max(0, c[0])), x2 = Math.min(1, Math.max(0, c[2]));
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    if (bezier(x1, x2, t) < x) lo = t; else hi = t;
  }
  return bezier(c[1], c[3], (lo + hi) / 2);
}

export const hexTo565 = (hex) => {
  const v = parseInt(hex.slice(1), 16);
  return ((v >> 19) & 31) << 11 | ((v >> 10) & 63) << 5 | ((v >> 3) & 31);
};

// Index of the key segment that contains t; the last index means "hold the last key".
export function segmentAt(keys, t) {
  let k = 0;
  while (k < keys.length - 1 && t >= keys[k + 1].t) k++;
  return k;
}

// The shape as it looks at time t, in editor coordinates.
export function sampleShape(shape, t) {
  const keys = shape.keys, k = segmentAt(keys, t), a = keys[k], b = keys[k + 1];
  if (!b || t <= a.t) return { z: a.z, pts: a.pts.map((p) => ({ x: p.x, y: p.y })) };
  const f = (t - a.t) / (b.t - a.t);
  return {
    z: a.z + (b.z - a.z) * easeAt(a.pts[0].c, f),
    pts: a.pts.map((p, i) => {
      const e = easeAt(p.c, f);
      return { x: p.x + (b.pts[i].x - p.x) * e, y: p.y + (b.pts[i].y - p.y) * e };
    }),
  };
}

export function colorSlotAt(shape, t) {
  const keys = shape.colorKeys;
  let k = 0;
  while (k < keys.length - 1 && t >= keys[k + 1].t) k++;
  return keys[k].slot;
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
