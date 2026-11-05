// Integer-only animation renderer. The ESP32-C6 has no FPU, so nothing per-frame
// may use floats. firmware/epsilon_firmware/epsilon_player.h is a line-for-line
// port of this file: keep them in step, tests/parity checks they match pixel for pixel.

export const SIZE = 240;
export const FOV = 250;
export const SCALE = 150;

const SIN = Array.from({ length: 257 }, (_, i) => Math.round(Math.sin(i * Math.PI / 512) * 16384));

// Angles are 1/65536 of a turn, results are Q14.
export function isin(a) {
  a &= 0xffff;
  const q = a >> 14;
  let r = a & 0x3fff;
  if (q & 1) r = 0x4000 - r;
  const i = r >> 6;
  const v = i === 256 ? SIN[256] : SIN[i] + (((SIN[i + 1] - SIN[i]) * (r & 63)) >> 6);
  return q >= 2 ? -v : v;
}
export const icos = (a) => isin(a + 0x4000);

const mul = (a, b) => (a * b) >> 14;
const lerp565 = (a, b, f) => {
  const r = (a >> 11) + ((((b >> 11) - (a >> 11)) * f) >> 10);
  const g = ((a >> 5) & 63) + (((((b >> 5) & 63) - ((a >> 5) & 63)) * f) >> 10);
  const l = (a & 31) + ((((b & 31) - (a & 31)) * f) >> 10);
  return (r << 11) | (g << 5) | l;
};

export class Player {
  constructor(pack) {
    this.dv = new DataView(pack.buffer, pack.byteOffset, pack.byteLength);
    if (this.dv.getUint32(0, true) !== 0x31535045) throw new Error("not an Epsilon pack");
    this.count = this.dv.getUint16(4, true);
    this.fb = new Uint16Array(SIZE * SIZE);
    this.sx = new Int32Array(256);
    this.sy = new Int32Array(256);
    this.nodes = new Int32Array(256);
    this.dirty = null;
  }

  load(index, variant = 0) {
    const dv = this.dv;
    let o = dv.getUint32(8 + index * 4, true);
    this.duration = dv.getUint16(o, true);
    const shapeCount = dv.getUint16(o + 2, true);
    const curveCount = dv.getUint8(o + 4);
    const slots = dv.getUint8(o + 5);
    this.variants = dv.getUint8(o + 6);
    o += 8;
    this.curves = o;
    o += curveCount * 66;
    this.palette = [];
    variant = Math.min(variant, this.variants - 1);
    for (let i = 0; i < slots; i++) this.palette.push(dv.getUint16(o + (variant * slots + i) * 2, true));
    o += this.variants * slots * 2;

    this.shapes = [];
    for (let s = 0; s < shapeCount; s++) {
      const flags = dv.getUint8(o), nPts = dv.getUint8(o + 1), nKeys = dv.getUint8(o + 2), nColor = dv.getUint8(o + 3);
      const shape = { perPoint: flags & 1, nPts, nKeys, start: dv.getUint16(o + 4, true), end: dv.getUint16(o + 6, true) };
      o += 8;
      shape.colorT = []; shape.colorSlot = [];
      for (let i = 0; i < nColor; i++, o += 3) {
        shape.colorT.push(dv.getUint16(o, true));
        shape.colorSlot.push(dv.getUint8(o + 2));
      }
      shape.t = [];
      for (let i = 0; i < nKeys; i++, o += 2) shape.t.push(dv.getUint16(o, true));
      shape.z = [];
      for (let i = 0; i < nKeys; i++) {
        shape.z.push(dv.getInt16(o, true));
        if (!(flags & 2)) o += 2;
      }
      if (flags & 2) o += 2;
      const nCurves = (nKeys - 1) * (shape.perPoint ? nPts : 1);
      shape.curve = [];
      for (let i = 0; i < nCurves; i++, o++) shape.curve.push(dv.getUint8(o));

      shape.xy = new Int16Array(nKeys * nPts * 2);
      for (let i = 0; i < nPts * 2; i++, o += 2) shape.xy[i] = dv.getInt16(o, true);
      for (let k = 1; k < nKeys; k++) {
        const mode = dv.getUint8(o++), base = k * nPts * 2;
        for (let i = 0; i < nPts * 2; i++) {
          let d = 0;
          if (mode === 1) d = dv.getInt8(o++);
          else if (mode === 2) { d = dv.getInt16(o, true); o += 2; }
          shape.xy[base + i] = shape.xy[base - nPts * 2 + i] + d;
        }
      }
      this.shapes.push(shape);
    }
    this.fb.fill(this.palette[0]);
    this.dirty = null;
  }

  ease(curve, frac) {
    const base = this.curves + curve * 66 + (frac >> 5) * 2;
    if (frac >= 1024) return this.dv.getInt16(this.curves + curve * 66 + 64, true);
    const a = this.dv.getInt16(base, true), b = this.dv.getInt16(base + 2, true);
    return a + (((b - a) * (frac & 31)) >> 5);
  }

  shapeColor(s, t) {
    const n = s.colorT.length;
    let k = 0;
    while (k < n - 1 && t >= s.colorT[k + 1]) k++;
    const a = this.palette[s.colorSlot[k]];
    if (k === n - 1 || t <= s.colorT[k]) return a;
    const f = (((t - s.colorT[k]) << 10) / (s.colorT[k + 1] - s.colorT[k])) | 0;
    return lerp565(a, this.palette[s.colorSlot[k + 1]], f);
  }

  // Scanline even-odd fill, sampled at pixel centres. Coordinates are Q4, so slow
  // motion stays smooth, and a self-crossing morph can never hang the renderer.
  fill(n, color, box) {
    const { sx, sy, nodes, fb } = this;
    let top = 1 << 30, bottom = -(1 << 30);
    for (let i = 0; i < n; i++) {
      if (sy[i] < top) top = sy[i];
      if (sy[i] > bottom) bottom = sy[i];
    }
    const y0 = Math.max(0, (top + 7) >> 4), y1 = Math.min(SIZE - 1, ((bottom + 7) >> 4) - 1);
    for (let y = y0; y <= y1; y++) {
      const yc = y * 16 + 8;
      let count = 0;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        if ((sy[i] <= yc) !== (sy[j] <= yc)) {
          const x = sx[i] + (((yc - sy[i]) * (sx[j] - sx[i])) / (sy[j] - sy[i]) | 0);
          let m = count++;
          while (m > 0 && nodes[m - 1] > x) { nodes[m] = nodes[m - 1]; m--; }
          nodes[m] = x;
        }
      }
      for (let i = 0; i + 1 < count; i += 2) {
        const a = Math.max(0, (nodes[i] + 7) >> 4), b = Math.min(SIZE - 1, ((nodes[i + 1] + 7) >> 4) - 1);
        if (a > b) continue;
        fb.fill(color, y * SIZE + a, y * SIZE + b + 1);
        if (a < box.x0) box.x0 = a;
        if (b >= box.x1) box.x1 = b + 1;
        if (y < box.y0) box.y0 = y;
        if (y >= box.y1) box.y1 = y + 1;
      }
    }
  }

  // Draws the frame and returns the changed rectangle (x1/y1 exclusive), or null.
  render(t, ax = 0, ay = 0, az = 0) {
    const sa = isin(ax), ca = icos(ax), sb = isin(ay), cb = icos(ay), sc = isin(az), cc = icos(az);
    const sasb = mul(sa, sb), casb = mul(ca, sb);
    const m00 = mul(cb, cc), m01 = mul(sasb, cc) - mul(ca, sc), m02 = mul(casb, cc) + mul(sa, sc);
    const m10 = mul(cb, sc), m11 = mul(sasb, sc) + mul(ca, cc), m12 = mul(casb, sc) - mul(sa, cc);
    const m20 = -sb, m21 = mul(sa, cb), m22 = mul(ca, cb);

    const old = this.dirty;
    if (old) for (let y = old.y0; y < old.y1; y++) this.fb.fill(this.palette[0], y * SIZE + old.x0, y * SIZE + old.x1);

    const box = { x0: SIZE, y0: SIZE, x1: 0, y1: 0 };
    for (const s of this.shapes) {
      if (t < s.start || t >= s.end) continue;
      let k = 0;
      while (k < s.nKeys - 1 && t >= s.t[k + 1]) k++;
      const moving = k < s.nKeys - 1 && t > s.t[k];
      const frac = moving ? (((t - s.t[k]) << 10) / (s.t[k + 1] - s.t[k])) | 0 : 0;
      const a = k * s.nPts * 2, b = a + s.nPts * 2;
      const z = (s.z[k] << 2) + (moving ? (((s.z[k + 1] - s.z[k]) << 2) * this.ease(s.curve[s.perPoint ? k * s.nPts : k], frac)) >> 14 : 0);

      for (let i = 0; i < s.nPts; i++) {
        let x = s.xy[a + i * 2], y = s.xy[a + i * 2 + 1];
        if (moving) {
          const e = this.ease(s.curve[s.perPoint ? k * s.nPts + i : k], frac);
          x += ((s.xy[b + i * 2] - x) * e) >> 14;
          y += ((s.xy[b + i * 2 + 1] - y) * e) >> 14;
        }
        const X = (m00 * x + m01 * y + m02 * z) >> 14;
        const Y = (m10 * x + m11 * y + m12 * z) >> 14;
        const w = Math.max(16, ((m20 * x + m21 * y + m22 * z) >> 14) + (FOV << 2));
        this.sx[i] = Math.max(-8192, Math.min(8192, 1920 + ((X * SCALE * 16) / w | 0)));
        this.sy[i] = Math.max(-8192, Math.min(8192, 1920 - ((Y * SCALE * 16) / w | 0)));
      }
      this.fill(s.nPts, this.shapeColor(s, t), box);
    }

    this.dirty = box.x1 > box.x0 ? box : null;
    if (!old) return this.dirty && { ...box };
    if (!this.dirty) return old;
    return { x0: Math.min(old.x0, box.x0), y0: Math.min(old.y0, box.y0), x1: Math.max(old.x1, box.x1), y1: Math.max(old.y1, box.y1) };
  }
}
