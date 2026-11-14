// Integer-only renderer for EPS2 packs. The ESP32-C6 has no FPU, so nothing per frame
// may use floats. firmware/epsilon_firmware/epsilon_player.h is a line-for-line port
// of this file: change both together. tests/parity.test.mjs proves they draw the same pixels.
//
// Per frame, for every visible layer:
//   1. evaluate its properties (keyframes + baked easing curves)
//   2. build its outline in layer space (ellipse, rectangle or flattened bezier path)
//   3. apply the 2D transform (anchor, scale, rotation, position)
//   4. rotate in 3D by the tilt angles, project, and scanline-fill into the framebuffer

export const SIZE = 240;
export const FOV = 250;
export const SCALE = 150;
export const Z0 = -100;           // depth 0 sits here, which projects at 1:1
export const MAX_POINTS = 1024;
export const ELLIPSE_POINTS = 32;
const MAGIC = 0x32535045;

const SIN = Array.from({ length: 257 }, (_, i) => Math.round(Math.sin(i * Math.PI / 512) * 16384));

// Cubic bezier weights for t = 0/8 .. 7/8, Q12.
const BEZ = [[4096, 0, 0, 0], [2744, 1176, 168, 8], [1728, 1728, 576, 64], [1000, 1800, 1080, 216],
  [512, 1536, 1536, 512], [216, 1080, 1800, 1000], [64, 576, 1728, 1728], [8, 168, 1176, 2744]];

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
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function lerp565(a, b, f) {
  const r = (a >> 11) + ((((b >> 11) - (a >> 11)) * f) >> 10);
  const g = ((a >> 5) & 63) + (((((b >> 5) & 63) - ((a >> 5) & 63)) * f) >> 10);
  const l = (a & 31) + ((((b & 31) - (a & 31)) * f) >> 10);
  return (r << 11) | (g << 5) | l;
}

export class Player {
  constructor(pack) {
    this.dv = new DataView(pack.buffer, pack.byteOffset, pack.byteLength);
    if (this.dv.getUint32(0, true) !== MAGIC) throw new Error("Not an EPS2 pack");
    this.count = this.dv.getUint16(4, true);
    this.fb = new Uint16Array(SIZE * SIZE);
    this.lx = new Int32Array(MAX_POINTS);
    this.ly = new Int32Array(MAX_POINTS);
    this.sx = new Int32Array(MAX_POINTS);
    this.sy = new Int32Array(MAX_POINTS);
    this.nodes = new Int32Array(MAX_POINTS);
    this.vtx = new Int32Array(128 * 6);
    this.dirty = null;
  }

  // ------------------------------------------------------------ loading

  readValues(count, n) {
    const dv = this.dv, v = new Int16Array(count * n);
    for (let i = 0; i < count; i++, this.o += 2) v[i] = dv.getInt16(this.o, true);
    for (let k = 1; k < n; k++) {
      const mode = dv.getUint8(this.o++), base = k * count;
      for (let i = 0; i < count; i++) {
        if (mode === 0) v[base + i] = v[base - count + i];
        else if (mode === 1) v[base + i] = v[base - count + i] + dv.getInt8(this.o++);
        else { v[base + i] = dv.getInt16(this.o, true); this.o += 2; }
      }
    }
    return v;
  }

  readTimes(n) {
    const t = new Uint16Array(n);
    for (let i = 0; i < n; i++, this.o += 2) t[i] = this.dv.getUint16(this.o, true);
    return t;
  }

  readTrack(dim) {
    const n = this.dv.getUint8(this.o++);
    const tr = { n, dim, t: null, c: null, v: null };
    if (n > 1) {
      tr.t = this.readTimes(n);
      tr.c = this.o;
      this.o += n - 1;
    }
    tr.v = this.readValues(dim, n);
    return tr;
  }

  readPath() {
    const nv = this.dv.getUint8(this.o), n = this.dv.getUint8(this.o + 1), perVertex = this.dv.getUint8(this.o + 2) & 1;
    this.o += 3;
    const tr = { n, nv, perVertex, t: null, c: null, v: null };
    if (n > 1) {
      tr.t = this.readTimes(n);
      tr.c = this.o;
      this.o += (n - 1) * (perVertex ? nv : 1);
    }
    tr.v = this.readValues(nv * 6, n);
    return tr;
  }

  load(index, variant = 0) {
    const dv = this.dv;
    this.o = dv.getUint32(8 + index * 4, true);
    this.duration = dv.getUint16(this.o, true);
    const layerCount = dv.getUint16(this.o + 2, true);
    const curveCount = dv.getUint8(this.o + 4), slots = dv.getUint8(this.o + 5);
    this.variants = dv.getUint8(this.o + 6);
    this.fps = dv.getUint8(this.o + 7);
    this.o += 8;
    this.curves = this.o;
    this.o += curveCount * 66;
    variant = Math.min(variant, this.variants - 1);
    this.palette = [];
    for (let i = 0; i < slots; i++) this.palette.push(dv.getUint16(this.o + (variant * slots + i) * 2, true));
    this.o += this.variants * slots * 2;

    this.layers = [];
    for (let i = 0; i < layerCount; i++) {
      const type = dv.getUint8(this.o), inT = dv.getUint16(this.o + 2, true), outT = dv.getUint16(this.o + 4, true);
      this.o += 6;
      const layer = { type, in: inT, out: outT };
      layer.anchor = this.readTrack(2);
      layer.position = this.readTrack(2);
      layer.scale = this.readTrack(2);
      layer.rotation = this.readTrack(1);
      layer.depth = this.readTrack(1);
      layer.fill = this.readTrack(1);
      if (type === 2) layer.path = this.readPath();
      else layer.size = this.readTrack(2);
      this.layers.push(layer);
    }
    this.fb.fill(this.palette[0]);
    this.dirty = null;
  }

  // ------------------------------------------------------------ evaluation

  ease(curve, frac) {
    const lut = this.curves + curve * 66;
    if (frac >= 1024) return this.dv.getInt16(lut + 64, true);
    const p = lut + (frac >> 5) * 2;
    const a = this.dv.getInt16(p, true), b = this.dv.getInt16(p + 2, true);
    return a + (((b - a) * (frac & 31)) >> 5);
  }

  // Sets this.k (segment) and this.frac (Q10). frac < 0 means "hold key k".
  locate(tr, t) {
    let k = 0;
    while (k < tr.n - 1 && t >= tr.t[k + 1]) k++;
    this.k = k;
    this.frac = k < tr.n - 1 && t > tr.t[k] ? (((t - tr.t[k]) << 10) / (tr.t[k + 1] - tr.t[k])) | 0 : -1;
  }

  value(tr, t, out) {
    if (tr.n === 1) { for (let i = 0; i < tr.dim; i++) out[i] = tr.v[i]; return; }
    this.locate(tr, t);
    const a = this.k * tr.dim;
    if (this.frac < 0) { for (let i = 0; i < tr.dim; i++) out[i] = tr.v[a + i]; return; }
    const e = this.ease(this.dv.getUint8(tr.c + this.k), this.frac), b = a + tr.dim;
    for (let i = 0; i < tr.dim; i++) out[i] = tr.v[a + i] + (((tr.v[b + i] - tr.v[a + i]) * e) >> 14);
  }

  color(tr, t) {
    if (tr.n === 1) return this.palette[tr.v[0]];
    this.locate(tr, t);
    const a = this.palette[tr.v[this.k]];
    if (this.frac < 0) return a;
    const e = this.ease(this.dv.getUint8(tr.c + this.k), this.frac);
    return lerp565(a, this.palette[tr.v[this.k + 1]], clamp(e >> 4, 0, 1024));
  }

  // Path vertices at t into this.vtx (6 values each, Q2).
  pathValues(tr, t) {
    const count = tr.nv * 6, vtx = this.vtx;
    if (tr.n === 1) { for (let i = 0; i < count; i++) vtx[i] = tr.v[i]; return; }
    this.locate(tr, t);
    const a = this.k * count;
    if (this.frac < 0) { for (let i = 0; i < count; i++) vtx[i] = tr.v[a + i]; return; }
    const b = a + count;
    let e = 0;
    for (let i = 0; i < count; i++) {
      if (i % 6 === 0 && (i === 0 || tr.perVertex)) {
        e = this.ease(this.dv.getUint8(tr.c + (tr.perVertex ? this.k * tr.nv + i / 6 : this.k)), this.frac);
      }
      vtx[i] = tr.v[a + i] + (((tr.v[b + i] - tr.v[a + i]) * e) >> 14);
    }
  }

  // Layer outline in layer space (Q2) into lx/ly; returns the point count.
  outline(layer, t) {
    const { lx, ly } = this, s = [0, 0];
    if (layer.type !== 2) {
      this.value(layer.size, t, s);
      const rx = s[0] >> 1, ry = s[1] >> 1;
      if (layer.type === 1) {
        lx[0] = -rx; ly[0] = -ry; lx[1] = rx; ly[1] = -ry; lx[2] = rx; ly[2] = ry; lx[3] = -rx; ly[3] = ry;
        return 4;
      }
      for (let i = 0; i < ELLIPSE_POINTS; i++) {
        lx[i] = (rx * icos(i * (65536 / ELLIPSE_POINTS))) >> 14;
        ly[i] = (ry * isin(i * (65536 / ELLIPSE_POINTS))) >> 14;
      }
      return ELLIPSE_POINTS;
    }

    this.pathValues(layer.path, t);
    const v = this.vtx, nv = layer.path.nv;
    let n = 0;
    for (let i = 0; i < nv; i++) {
      const a = i * 6, b = ((i + 1) % nv) * 6;
      const x0 = v[a], y0 = v[a + 1], x3 = v[b], y3 = v[b + 1];
      if (v[a + 4] === 0 && v[a + 5] === 0 && v[b + 2] === 0 && v[b + 3] === 0) {
        lx[n] = x0; ly[n] = y0; n++;
        continue;
      }
      const x1 = x0 + v[a + 4], y1 = y0 + v[a + 5], x2 = x3 + v[b + 2], y2 = y3 + v[b + 3];
      for (let k = 0; k < 8; k++) {
        const w = BEZ[k];
        lx[n] = (w[0] * x0 + w[1] * x1 + w[2] * x2 + w[3] * x3) >> 12;
        ly[n] = (w[0] * y0 + w[1] * y1 + w[2] * y2 + w[3] * y3) >> 12;
        n++;
      }
    }
    return n;
  }

  // ------------------------------------------------------------ drawing

  // Scanline even-odd fill sampled at pixel centres; sx/sy are Q4.
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

  // Draws frame t with tilt angles (1/65536 turn). Returns the changed rectangle or null.
  render(t, ax = 0, ay = 0, az = 0) {
    const sa = isin(ax), ca = icos(ax), sb = isin(ay), cb = icos(ay), sc = isin(az), cc = icos(az);
    const sasb = mul(sa, sb), casb = mul(ca, sb);
    const m00 = mul(cb, cc), m01 = mul(sasb, cc) - mul(ca, sc), m02 = mul(casb, cc) + mul(sa, sc);
    const m10 = mul(cb, sc), m11 = mul(sasb, sc) + mul(ca, cc), m12 = mul(casb, sc) - mul(sa, cc);
    const m20 = -sb, m21 = mul(sa, cb), m22 = mul(ca, cb);

    const old = this.dirty;
    if (old) for (let y = old.y0; y < old.y1; y++) this.fb.fill(this.palette[0], y * SIZE + old.x0, y * SIZE + old.x1);

    const box = { x0: SIZE, y0: SIZE, x1: 0, y1: 0 };
    const anchor = [0, 0], pos = [0, 0], scale = [0, 0], rot = [0], depth = [0];
    for (const layer of this.layers) {
      if (t < layer.in || t >= layer.out) continue;
      this.value(layer.anchor, t, anchor);
      this.value(layer.position, t, pos);
      this.value(layer.scale, t, scale);
      this.value(layer.rotation, t, rot);
      this.value(layer.depth, t, depth);
      const turn = -(((rot[0] * 4096) / 225) | 0); // tenths of a degree to 1/65536 turn
      const cr = icos(turn), sr = isin(turn);
      const z = (depth[0] + Z0) * 4;

      const n = this.outline(layer, t);
      for (let i = 0; i < n; i++) {
        // Clamps keep every product inside 32 bits on the ESP.
        const dx = clamp(this.lx[i] - anchor[0], -16383, 16383), dy = clamp(this.ly[i] - anchor[1], -16383, 16383);
        const xs = clamp((dx * scale[0]) >> 12, -32767, 32767), ys = clamp((dy * scale[1]) >> 12, -32767, 32767);
        const x = clamp(((xs * cr - ys * sr) >> 14) + pos[0], -8000, 8000);
        const y = clamp(((xs * sr + ys * cr) >> 14) + pos[1], -8000, 8000);
        const X = (m00 * x + m01 * y + m02 * z) >> 14;
        const Y = (m10 * x + m11 * y + m12 * z) >> 14;
        const w = Math.max(16, ((m20 * x + m21 * y + m22 * z) >> 14) + (FOV << 2));
        this.sx[i] = clamp(1920 + ((X * SCALE * 16) / w | 0), -8192, 8192);
        this.sy[i] = clamp(1920 - ((Y * SCALE * 16) / w | 0), -8192, 8192);
      }
      this.fill(n, this.color(layer.fill, t), box);
    }

    this.dirty = box.x1 > box.x0 ? box : null;
    if (!old) return this.dirty && { ...box };
    if (!this.dirty) return old;
    return { x0: Math.min(old.x0, box.x0), y0: Math.min(old.y0, box.y0), x1: Math.max(old.x1, box.x1), y1: Math.max(old.y1, box.y1) };
  }
}
