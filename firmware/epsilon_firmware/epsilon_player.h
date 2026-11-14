// Epsilon player: plays EPS2 animation packs into a 240x240 RGB565 framebuffer.
//
// This is a line-for-line port of scr/player.js. Change both together;
// tests/parity.test.mjs builds this file on a PC and checks every pixel matches.
// It has no Arduino includes, so it compiles anywhere.
//
// Usage:
//   eps::Player<true> player(EPS_PACK, framebuffer);  // true = byte-swapped RGB565 (LovyanGFX sprites)
//   player.load(animationIndex, variantIndex);
//   eps::Rect changed = player.render(timeMs, tiltX, tiltY, tiltZ);  // angles in 1/65536 turn
//   // push only `changed` to the display
//
// Integer only: the ESP32-C6 has no FPU. Units: positions Q2 (quarter pixels),
// screen coordinates Q4, trig and easing Q14, scale Q12 (4096 = 100%), rotation 0.1 deg.
#pragma once
#include <stdint.h>

namespace eps {

constexpr int SIZE = 240;              // display width and height
constexpr int FOV = 250;               // perspective distance
constexpr int SCALE = 150;             // projection scale
constexpr int Z0 = -100;               // depth 0 sits here and projects at 1:1
constexpr int MAX_POINTS = 1024;       // outline points per layer
constexpr int MAX_VERTICES = 128;      // bezier path vertices per layer
constexpr int ELLIPSE_POINTS = 32;
constexpr uint32_t POOL_BYTES = 120 * 1024;  // keep equal to RAM_LIMIT in scr/compiler.js
constexpr uint32_t MAGIC = 0x32535045;       // "EPS2"

enum LayerType : uint8_t { ELLIPSE = 0, RECT = 1, PATH = 2 };

static const int16_t SIN[257] = {
    0, 101, 201, 302, 402, 503, 603, 704, 804, 904, 1005, 1105, 1205, 1306, 1406, 1506,
    1606, 1706, 1806, 1906, 2006, 2105, 2205, 2305, 2404, 2503, 2603, 2702, 2801, 2900, 2999, 3098,
    3196, 3295, 3393, 3492, 3590, 3688, 3786, 3883, 3981, 4078, 4176, 4273, 4370, 4467, 4563, 4660,
    4756, 4852, 4948, 5044, 5139, 5235, 5330, 5425, 5520, 5614, 5708, 5803, 5897, 5990, 6084, 6177,
    6270, 6363, 6455, 6547, 6639, 6731, 6823, 6914, 7005, 7096, 7186, 7276, 7366, 7456, 7545, 7635,
    7723, 7812, 7900, 7988, 8076, 8163, 8250, 8337, 8423, 8509, 8595, 8680, 8765, 8850, 8935, 9019,
    9102, 9186, 9269, 9352, 9434, 9516, 9598, 9679, 9760, 9841, 9921, 10001, 10080, 10159, 10238, 10316,
    10394, 10471, 10549, 10625, 10702, 10778, 10853, 10928, 11003, 11077, 11151, 11224, 11297, 11370, 11442, 11514,
    11585, 11656, 11727, 11797, 11866, 11935, 12004, 12072, 12140, 12207, 12274, 12340, 12406, 12472, 12537, 12601,
    12665, 12729, 12792, 12854, 12916, 12978, 13039, 13100, 13160, 13219, 13279, 13337, 13395, 13453, 13510, 13567,
    13623, 13678, 13733, 13788, 13842, 13896, 13949, 14001, 14053, 14104, 14155, 14206, 14256, 14305, 14354, 14402,
    14449, 14497, 14543, 14589, 14635, 14680, 14724, 14768, 14811, 14854, 14896, 14937, 14978, 15019, 15059, 15098,
    15137, 15175, 15213, 15250, 15286, 15322, 15357, 15392, 15426, 15460, 15493, 15525, 15557, 15588, 15619, 15649,
    15679, 15707, 15736, 15763, 15791, 15817, 15843, 15868, 15893, 15917, 15941, 15964, 15986, 16008, 16029, 16049,
    16069, 16088, 16107, 16125, 16143, 16160, 16176, 16192, 16207, 16221, 16235, 16248, 16261, 16273, 16284, 16295,
    16305, 16315, 16324, 16332, 16340, 16347, 16353, 16359, 16364, 16369, 16373, 16376, 16379, 16381, 16383, 16384,
    16384,
};

// Cubic bezier weights for t = 0/8 .. 7/8, Q12.
static const int16_t BEZ[8][4] = {
    {4096, 0, 0, 0}, {2744, 1176, 168, 8}, {1728, 1728, 576, 64}, {1000, 1800, 1080, 216},
    {512, 1536, 1536, 512}, {216, 1080, 1800, 1000}, {64, 576, 1728, 1728}, {8, 168, 1176, 2744},
};

// Angle in 1/65536 turn to sine, Q14.
inline int32_t isin(int32_t a) {
  a &= 0xffff;
  const int q = a >> 14;
  int32_t r = a & 0x3fff;
  if (q & 1) r = 0x4000 - r;
  const int i = r >> 6;
  const int32_t v = i == 256 ? SIN[256] : SIN[i] + (((SIN[i + 1] - SIN[i]) * (r & 63)) >> 6);
  return q >= 2 ? -v : v;
}
inline int32_t icos(int32_t a) { return isin(a + 0x4000); }

inline int32_t mul(int32_t a, int32_t b) { return (a * b) >> 14; }
inline int32_t imax(int32_t a, int32_t b) { return a > b ? a : b; }
inline int32_t imin(int32_t a, int32_t b) { return a < b ? a : b; }
inline int32_t clamp(int32_t v, int32_t lo, int32_t hi) { return v < lo ? lo : v > hi ? hi : v; }

// Pack data sits in flash at arbitrary offsets, so never cast to a wider pointer.
inline uint16_t rd16(const uint8_t* p) { return uint16_t(p[0] | (p[1] << 8)); }
inline uint32_t rd32(const uint8_t* p) { return p[0] | (p[1] << 8) | (p[2] << 16) | (uint32_t(p[3]) << 24); }

inline uint16_t lerp565(uint16_t a, uint16_t b, int32_t f) {
  const int32_t ar = a >> 11, ag = (a >> 5) & 63, ab = a & 31;
  const int32_t r = ar + ((((b >> 11) - ar) * f) >> 10);
  const int32_t g = ag + (((((b >> 5) & 63) - ag) * f) >> 10);
  const int32_t l = ab + ((((b & 31) - ab) * f) >> 10);
  return uint16_t((r << 11) | (g << 5) | l);
}

// Screen rectangle; x1 and y1 are exclusive.
struct Rect {
  int x0 = SIZE, y0 = SIZE, x1 = 0, y1 = 0;
  bool empty() const { return x1 <= x0; }
  int width() const { return x1 - x0; }
  int height() const { return y1 - y0; }
};

// One animated property. n == 1 means a constant.
struct Track {
  uint8_t n = 0, dim = 0;
  const uint16_t* t = nullptr;  // key times, RAM
  const uint8_t* c = nullptr;   // curve index per segment, flash
  const int16_t* v = nullptr;   // n * dim values, RAM
};

// A bezier path: per vertex x, y, in-handle x, y, out-handle x, y.
struct PathTrack {
  uint8_t n = 0, nv = 0;
  bool perVertex = false;       // one curve per vertex instead of one per segment
  const uint16_t* t = nullptr;
  const uint8_t* c = nullptr;
  const int16_t* v = nullptr;   // n * nv * 6 values
};

struct Layer {
  uint8_t type;
  uint16_t in, out;             // visible while in <= t < out
  Track anchor, position, scale, rotation, depth, fill, size;
  PathTrack path;
};

template <bool swapBytes>
class Player {
 public:
  Player(const uint8_t* pack, uint16_t* framebuffer) : pack_(pack), fb_(framebuffer) {}

  bool valid() const { return rd32(pack_) == MAGIC; }
  int count() const { return rd16(pack_ + 4); }      // animations in the pack
  int variants() const { return variants_; }        // colour variants of the loaded animation
  uint16_t duration() const { return duration_; }   // ms
  int layerCount() const { return layerCount_; }

  // Decodes an animation into RAM. Returns false if it does not fit POOL_BYTES.
  bool load(int index, int variant = 0) {
    o_ = pack_ + rd32(pack_ + 8 + index * 4);
    used_ = 0;
    duration_ = rd16(o_);
    layerCount_ = rd16(o_ + 2);
    const int curveCount = o_[4], slots = o_[5];
    variants_ = o_[6];
    o_ += 8;
    curves_ = o_;
    o_ += curveCount * 66;
    if (variant >= variants_) variant = variants_ - 1;
    palette_ = o_ + variant * slots * 2;
    o_ += variants_ * slots * 2;

    layers_ = static_cast<Layer*>(alloc(sizeof(Layer) * layerCount_));
    if (!layers_) return false;
    for (int i = 0; i < layerCount_; i++) {
      Layer& l = layers_[i];
      l.type = o_[0];
      l.in = rd16(o_ + 2);
      l.out = rd16(o_ + 4);
      o_ += 6;
      if (!readTrack(l.anchor, 2) || !readTrack(l.position, 2) || !readTrack(l.scale, 2) ||
          !readTrack(l.rotation, 1) || !readTrack(l.depth, 1) || !readTrack(l.fill, 1)) return false;
      if (l.type == PATH ? !readPath(l.path) : !readTrack(l.size, 2)) return false;
    }
    const uint16_t bg = pixel(paletteAt(0));
    for (int i = 0; i < SIZE * SIZE; i++) fb_[i] = bg;
    dirty_ = Rect();
    return true;
  }

  // The next render clears and repaints the whole screen.
  void invalidate() { dirty_.x0 = 0; dirty_.y0 = 0; dirty_.x1 = SIZE; dirty_.y1 = SIZE; }

  // Draws frame t (ms) tilted by the given angles (1/65536 turn). Returns the changed area.
  Rect render(uint32_t t, int32_t ax, int32_t ay, int32_t az) {
    const int32_t sa = isin(ax), ca = icos(ax), sb = isin(ay), cb = icos(ay), sc = isin(az), cc = icos(az);
    const int32_t sasb = mul(sa, sb), casb = mul(ca, sb);
    m_[0] = mul(cb, cc); m_[1] = mul(sasb, cc) - mul(ca, sc); m_[2] = mul(casb, cc) + mul(sa, sc);
    m_[3] = mul(cb, sc); m_[4] = mul(sasb, sc) + mul(ca, cc); m_[5] = mul(casb, sc) - mul(sa, cc);
    m_[6] = -sb; m_[7] = mul(sa, cb); m_[8] = mul(ca, cb);

    const Rect old = dirty_;
    const uint16_t bg = pixel(paletteAt(0));
    for (int y = old.y0; y < old.y1; y++) {
      uint16_t* row = fb_ + y * SIZE;
      for (int x = old.x0; x < old.x1; x++) row[x] = bg;
    }

    Rect box;
    int32_t anchor[2], pos[2], scale[2], rot[1], depth[1];
    for (int li = 0; li < layerCount_; li++) {
      const Layer& l = layers_[li];
      if (t < l.in || t >= l.out) continue;
      value(l.anchor, t, anchor);
      value(l.position, t, pos);
      value(l.scale, t, scale);
      value(l.rotation, t, rot);
      value(l.depth, t, depth);
      const int32_t turn = -((rot[0] * 4096) / 225);  // tenths of a degree to 1/65536 turn
      const int32_t cr = icos(turn), sr = isin(turn);
      const int32_t z = (depth[0] + Z0) * 4;

      const int n = outline(l, t);
      for (int i = 0; i < n; i++) {
        // Clamps keep every product inside 32 bits.
        const int32_t dx = clamp(lx_[i] - anchor[0], -16383, 16383), dy = clamp(ly_[i] - anchor[1], -16383, 16383);
        const int32_t xs = clamp((dx * scale[0]) >> 12, -32767, 32767), ys = clamp((dy * scale[1]) >> 12, -32767, 32767);
        const int32_t x = clamp(((xs * cr - ys * sr) >> 14) + pos[0], -8000, 8000);
        const int32_t y = clamp(((xs * sr + ys * cr) >> 14) + pos[1], -8000, 8000);
        project(x, y, z, sx_[i], sy_[i]);
      }
      fill(n, pixel(color(l.fill, t)), box);
    }

    dirty_ = box;
    if (old.empty()) return box;
    if (box.empty()) return old;
    Rect r;
    r.x0 = imin(old.x0, box.x0); r.y0 = imin(old.y0, box.y0);
    r.x1 = imax(old.x1, box.x1); r.y1 = imax(old.y1, box.y1);
    return r;
  }

  // Q2 world point to Q4 screen point, using the last render's tilt. Handy for overlays.
  void project(int32_t x, int32_t y, int32_t z, int32_t& outX, int32_t& outY) const {
    const int32_t X = (m_[0] * x + m_[1] * y + m_[2] * z) >> 14;
    const int32_t Y = (m_[3] * x + m_[4] * y + m_[5] * z) >> 14;
    const int32_t w = imax(16, ((m_[6] * x + m_[7] * y + m_[8] * z) >> 14) + (FOV << 2));
    outX = clamp(1920 + (X * SCALE * 16) / w, -8192, 8192);
    outY = clamp(1920 - (Y * SCALE * 16) / w, -8192, 8192);
  }

 private:
  // ---------------------------------------------------------- loading

  void* alloc(uint32_t bytes) {
    bytes = (bytes + 3) & ~3u;
    if (used_ + bytes > POOL_BYTES) return nullptr;
    void* p = pool_ + used_;
    used_ += bytes;
    return p;
  }

  const int16_t* readValues(int count, int n) {
    int16_t* v = static_cast<int16_t*>(alloc(uint32_t(count) * n * 2));
    if (!v) return nullptr;
    for (int i = 0; i < count; i++, o_ += 2) v[i] = int16_t(rd16(o_));
    for (int k = 1; k < n; k++) {
      const uint8_t mode = *o_++;
      int16_t* cur = v + k * count;
      for (int i = 0; i < count; i++) {
        if (mode == 0) cur[i] = cur[i - count];
        else if (mode == 1) cur[i] = int16_t(cur[i - count] + int8_t(*o_++));
        else { cur[i] = int16_t(rd16(o_)); o_ += 2; }
      }
    }
    return v;
  }

  const uint16_t* readTimes(int n) {
    uint16_t* t = static_cast<uint16_t*>(alloc(n * 2));
    if (!t) return nullptr;
    for (int i = 0; i < n; i++, o_ += 2) t[i] = rd16(o_);
    return t;
  }

  bool readTrack(Track& tr, int dim) {
    tr.n = *o_++;
    tr.dim = dim;
    if (tr.n > 1) {
      if (!(tr.t = readTimes(tr.n))) return false;
      tr.c = o_;
      o_ += tr.n - 1;
    }
    return (tr.v = readValues(dim, tr.n)) != nullptr;
  }

  bool readPath(PathTrack& tr) {
    tr.nv = o_[0];
    tr.n = o_[1];
    tr.perVertex = o_[2] & 1;
    o_ += 3;
    if (tr.nv > MAX_VERTICES) return false;
    if (tr.n > 1) {
      if (!(tr.t = readTimes(tr.n))) return false;
      tr.c = o_;
      o_ += (tr.n - 1) * (tr.perVertex ? tr.nv : 1);
    }
    return (tr.v = readValues(tr.nv * 6, tr.n)) != nullptr;
  }

  // ---------------------------------------------------------- evaluation

  static uint16_t pixel(uint16_t c) { return swapBytes ? uint16_t((c << 8) | (c >> 8)) : c; }
  uint16_t paletteAt(int slot) const { return rd16(palette_ + slot * 2); }

  int32_t ease(int curve, int32_t frac) const {
    const uint8_t* lut = curves_ + curve * 66;
    if (frac >= 1024) return int16_t(rd16(lut + 64));
    const uint8_t* p = lut + (frac >> 5) * 2;
    const int32_t a = int16_t(rd16(p)), b = int16_t(rd16(p + 2));
    return a + (((b - a) * (frac & 31)) >> 5);
  }

  // Finds the key segment for t. frac (Q10) is -1 when holding key k.
  void locate(uint8_t n, const uint16_t* times, uint32_t t, int& k, int32_t& frac) const {
    k = 0;
    while (k < n - 1 && t >= times[k + 1]) k++;
    frac = k < n - 1 && t > times[k] ? int32_t(((t - times[k]) << 10) / uint32_t(times[k + 1] - times[k])) : -1;
  }

  void value(const Track& tr, uint32_t t, int32_t* out) const {
    if (tr.n == 1) { for (int i = 0; i < tr.dim; i++) out[i] = tr.v[i]; return; }
    int k; int32_t frac;
    locate(tr.n, tr.t, t, k, frac);
    const int16_t* a = tr.v + k * tr.dim;
    if (frac < 0) { for (int i = 0; i < tr.dim; i++) out[i] = a[i]; return; }
    const int32_t e = ease(tr.c[k], frac);
    const int16_t* b = a + tr.dim;
    for (int i = 0; i < tr.dim; i++) out[i] = a[i] + (((b[i] - a[i]) * e) >> 14);
  }

  uint16_t color(const Track& tr, uint32_t t) const {
    if (tr.n == 1) return paletteAt(tr.v[0]);
    int k; int32_t frac;
    locate(tr.n, tr.t, t, k, frac);
    const uint16_t a = paletteAt(tr.v[k]);
    if (frac < 0) return a;
    const int32_t e = ease(tr.c[k], frac);
    return lerp565(a, paletteAt(tr.v[k + 1]), clamp(e >> 4, 0, 1024));
  }

  void pathValues(const PathTrack& tr, uint32_t t) {
    const int count = tr.nv * 6;
    if (tr.n == 1) { for (int i = 0; i < count; i++) vtx_[i] = tr.v[i]; return; }
    int k; int32_t frac;
    locate(tr.n, tr.t, t, k, frac);
    const int16_t* a = tr.v + k * count;
    if (frac < 0) { for (int i = 0; i < count; i++) vtx_[i] = a[i]; return; }
    const int16_t* b = a + count;
    int32_t e = 0;
    for (int i = 0; i < count; i++) {
      if (i % 6 == 0 && (i == 0 || tr.perVertex)) e = ease(tr.c[tr.perVertex ? k * tr.nv + i / 6 : k], frac);
      vtx_[i] = a[i] + (((b[i] - a[i]) * e) >> 14);
    }
  }

  // Layer outline in layer space (Q2) into lx_/ly_. Returns the point count.
  int outline(const Layer& l, uint32_t t) {
    if (l.type != PATH) {
      int32_t s[2];
      value(l.size, t, s);
      const int32_t rx = s[0] >> 1, ry = s[1] >> 1;
      if (l.type == RECT) {
        lx_[0] = -rx; ly_[0] = -ry; lx_[1] = rx; ly_[1] = -ry;
        lx_[2] = rx; ly_[2] = ry; lx_[3] = -rx; ly_[3] = ry;
        return 4;
      }
      for (int i = 0; i < ELLIPSE_POINTS; i++) {
        lx_[i] = (rx * icos(i * (65536 / ELLIPSE_POINTS))) >> 14;
        ly_[i] = (ry * isin(i * (65536 / ELLIPSE_POINTS))) >> 14;
      }
      return ELLIPSE_POINTS;
    }

    pathValues(l.path, t);
    const int nv = l.path.nv;
    int n = 0;
    for (int i = 0; i < nv; i++) {
      const int32_t* a = vtx_ + i * 6;
      const int32_t* b = vtx_ + ((i + 1) % nv) * 6;
      if (a[4] == 0 && a[5] == 0 && b[2] == 0 && b[3] == 0) {
        lx_[n] = a[0]; ly_[n] = a[1]; n++;
        continue;
      }
      const int32_t x0 = a[0], y0 = a[1], x3 = b[0], y3 = b[1];
      const int32_t x1 = x0 + a[4], y1 = y0 + a[5], x2 = x3 + b[2], y2 = y3 + b[3];
      for (int k = 0; k < 8; k++) {
        const int16_t* w = BEZ[k];
        lx_[n] = (w[0] * x0 + w[1] * x1 + w[2] * x2 + w[3] * x3) >> 12;
        ly_[n] = (w[0] * y0 + w[1] * y1 + w[2] * y2 + w[3] * y3) >> 12;
        n++;
      }
    }
    return n;
  }

  // ---------------------------------------------------------- drawing

  // Scanline even-odd fill sampled at pixel centres.
  void fill(int n, uint16_t color, Rect& box) {
    int32_t top = 1 << 30, bottom = -(1 << 30);
    for (int i = 0; i < n; i++) {
      top = imin(top, sy_[i]);
      bottom = imax(bottom, sy_[i]);
    }
    const int y0 = imax(0, (top + 7) >> 4), y1 = imin(SIZE - 1, ((bottom + 7) >> 4) - 1);
    for (int y = y0; y <= y1; y++) {
      const int32_t yc = y * 16 + 8;
      int count = 0;
      for (int i = 0, j = n - 1; i < n; j = i++) {
        if ((sy_[i] <= yc) != (sy_[j] <= yc)) {
          const int32_t x = sx_[i] + ((yc - sy_[i]) * (sx_[j] - sx_[i])) / (sy_[j] - sy_[i]);
          int m = count++;
          while (m > 0 && nodes_[m - 1] > x) { nodes_[m] = nodes_[m - 1]; m--; }
          nodes_[m] = x;
        }
      }
      for (int i = 0; i + 1 < count; i += 2) {
        const int a = imax(0, (nodes_[i] + 7) >> 4), b = imin(SIZE - 1, ((nodes_[i + 1] + 7) >> 4) - 1);
        if (a > b) continue;
        uint16_t* row = fb_ + y * SIZE;
        for (int x = a; x <= b; x++) row[x] = color;
        if (a < box.x0) box.x0 = a;
        if (b >= box.x1) box.x1 = b + 1;
        if (y < box.y0) box.y0 = y;
        if (y >= box.y1) box.y1 = y + 1;
      }
    }
  }

  const uint8_t* pack_;
  uint16_t* fb_;
  const uint8_t* o_ = nullptr;  // read cursor while loading
  const uint8_t* curves_ = nullptr;
  const uint8_t* palette_ = nullptr;
  Layer* layers_ = nullptr;
  uint16_t duration_ = 0, layerCount_ = 0;
  int variants_ = 0;
  Rect dirty_;
  int32_t m_[9] = {16384, 0, 0, 0, 16384, 0, 0, 0, 16384};
  int32_t lx_[MAX_POINTS], ly_[MAX_POINTS], sx_[MAX_POINTS], sy_[MAX_POINTS], nodes_[MAX_POINTS];
  int32_t vtx_[MAX_VERTICES * 6];
  uint32_t used_ = 0;
  alignas(4) uint8_t pool_[POOL_BYTES];
};

}  // namespace eps
