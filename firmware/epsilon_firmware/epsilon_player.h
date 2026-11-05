// Port of scr/player.js. Integer only: the ESP32-C6 has no FPU. No Arduino includes,
// so tests/parity can build this on a PC and compare frames with the web emulator.
#pragma once
#include <stdint.h>
#include <string.h>

namespace eps {

constexpr int SIZE = 240;
constexpr int FOV = 250;
constexpr int SCALE = 150;
constexpr uint32_t POOL_BYTES = 120 * 1024;  // keep in step with RAM_LIMIT in scr/compiler.js

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

// Angles are 1/65536 of a turn, results are Q14.
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

struct Rect {
  int x0 = SIZE, y0 = SIZE, x1 = 0, y1 = 0;  // x1/y1 are exclusive
  bool empty() const { return x1 <= x0; }
};

struct Shape {
  bool perPoint;
  uint8_t nPts, nKeys, nColor;
  uint16_t start, end;
  const uint8_t* colors;  // flash: u16 time, u8 slot
  const uint8_t* curve;   // flash
  uint16_t* t;
  int16_t* z;
  int16_t* xy;
};

// swapBytes: LovyanGFX sprites hold RGB565 big-endian.
template <bool swapBytes>
class Player {
 public:
  Player(const uint8_t* pack, uint16_t* framebuffer) : pack_(pack), fb_(framebuffer) {}

  bool valid() const { return rd32(pack_) == 0x31535045; }
  int count() const { return rd16(pack_ + 4); }
  int variants() const { return variants_; }
  uint16_t duration() const { return duration_; }

  bool load(int index, int variant = 0) {
    const uint8_t* o = pack_ + rd32(pack_ + 8 + index * 4);
    used_ = 0;
    duration_ = rd16(o);
    shapeCount_ = rd16(o + 2);
    const int curveCount = o[4], slots = o[5];
    variants_ = o[6];
    o += 8;
    curves_ = o;
    o += curveCount * 66;
    if (variant >= variants_) variant = variants_ - 1;
    palette_ = o + variant * slots * 2;
    o += variants_ * slots * 2;

    shapes_ = static_cast<Shape*>(alloc(sizeof(Shape) * shapeCount_));
    if (!shapes_) return false;
    for (int s = 0; s < shapeCount_; s++) {
      Shape& h = shapes_[s];
      const uint8_t flags = o[0];
      h.perPoint = flags & 1;
      h.nPts = o[1]; h.nKeys = o[2]; h.nColor = o[3];
      h.start = rd16(o + 4); h.end = rd16(o + 6);
      o += 8;
      h.colors = o;
      o += h.nColor * 3;
      h.t = static_cast<uint16_t*>(alloc(h.nKeys * 2));
      h.z = static_cast<int16_t*>(alloc(h.nKeys * 2));
      h.xy = static_cast<int16_t*>(alloc(h.nKeys * h.nPts * 4));
      if (!h.t || !h.z || !h.xy) return false;
      for (int i = 0; i < h.nKeys; i++, o += 2) h.t[i] = rd16(o);
      for (int i = 0; i < h.nKeys; i++) {
        h.z[i] = int16_t(rd16(o));
        if (!(flags & 2)) o += 2;
      }
      if (flags & 2) o += 2;
      h.curve = o;
      o += (h.nKeys - 1) * (h.perPoint ? h.nPts : 1);

      const int n = h.nPts * 2;
      for (int i = 0; i < n; i++, o += 2) h.xy[i] = int16_t(rd16(o));
      for (int k = 1; k < h.nKeys; k++) {
        const uint8_t mode = *o++;
        int16_t* cur = h.xy + k * n;
        for (int i = 0; i < n; i++) {
          int32_t d = 0;
          if (mode == 1) d = int8_t(*o++);
          else if (mode == 2) { d = int16_t(rd16(o)); o += 2; }
          cur[i] = int16_t(cur[i - n] + d);
        }
      }
    }
    const uint16_t bg = pixel(paletteAt(0));
    for (int i = 0; i < SIZE * SIZE; i++) fb_[i] = bg;
    dirty_ = Rect();
    return true;
  }

  // The next frame clears and repaints the whole screen (used by the debug overlay).
  void invalidate() { dirty_.x0 = 0; dirty_.y0 = 0; dirty_.x1 = SIZE; dirty_.y1 = SIZE; }

  // Draws the frame and returns the rectangle that changed.
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
    for (int s = 0; s < shapeCount_; s++) {
      const Shape& h = shapes_[s];
      if (t < h.start || t >= h.end) continue;
      int k = 0;
      while (k < h.nKeys - 1 && t >= h.t[k + 1]) k++;
      const bool moving = k < h.nKeys - 1 && t > h.t[k];
      const int32_t frac = moving ? int32_t(((t - h.t[k]) << 10) / uint32_t(h.t[k + 1] - h.t[k])) : 0;
      const int16_t* a = h.xy + k * h.nPts * 2;
      const int16_t* b = a + h.nPts * 2;
      int32_t z = int32_t(h.z[k]) * 4;
      if (moving) z += ((int32_t(h.z[k + 1]) - h.z[k]) * 4 * ease(h.curve[h.perPoint ? k * h.nPts : k], frac)) >> 14;

      for (int i = 0; i < h.nPts; i++) {
        int32_t x = a[i * 2], y = a[i * 2 + 1];
        if (moving) {
          const int32_t e = ease(h.curve[h.perPoint ? k * h.nPts + i : k], frac);
          x += ((b[i * 2] - x) * e) >> 14;
          y += ((b[i * 2 + 1] - y) * e) >> 14;
        }
        project(x, y, z, sx_[i], sy_[i]);
      }
      fill(h.nPts, pixel(shapeColor(h, t)), box);
    }

    dirty_ = box;
    if (old.empty()) return box;
    if (box.empty()) return old;
    Rect r;
    r.x0 = imin(old.x0, box.x0); r.y0 = imin(old.y0, box.y0);
    r.x1 = imax(old.x1, box.x1); r.y1 = imax(old.y1, box.y1);
    return r;
  }

  // Q2 model coordinates to Q4 screen coordinates, using the last render's rotation.
  void project(int32_t x, int32_t y, int32_t z, int32_t& outX, int32_t& outY) const {
    const int32_t X = (m_[0] * x + m_[1] * y + m_[2] * z) >> 14;
    const int32_t Y = (m_[3] * x + m_[4] * y + m_[5] * z) >> 14;
    const int32_t w = imax(16, ((m_[6] * x + m_[7] * y + m_[8] * z) >> 14) + (FOV << 2));
    outX = imax(-8192, imin(8192, 1920 + (X * SCALE * 16) / w));
    outY = imax(-8192, imin(8192, 1920 - (Y * SCALE * 16) / w));
  }

 private:
  void* alloc(uint32_t bytes) {
    bytes = (bytes + 3) & ~3u;
    if (used_ + bytes > POOL_BYTES) return nullptr;
    void* p = pool_ + used_;
    used_ += bytes;
    return p;
  }

  static uint16_t pixel(uint16_t c) { return swapBytes ? uint16_t((c << 8) | (c >> 8)) : c; }
  uint16_t paletteAt(int slot) const { return rd16(palette_ + slot * 2); }

  int32_t ease(int curve, int32_t frac) const {
    const uint8_t* lut = curves_ + curve * 66;
    if (frac >= 1024) return int16_t(rd16(lut + 64));
    const uint8_t* p = lut + (frac >> 5) * 2;
    const int32_t a = int16_t(rd16(p)), b = int16_t(rd16(p + 2));
    return a + (((b - a) * (frac & 31)) >> 5);
  }

  uint16_t shapeColor(const Shape& h, uint32_t t) const {
    int k = 0;
    while (k < h.nColor - 1 && t >= rd16(h.colors + (k + 1) * 3)) k++;
    const uint8_t* c = h.colors + k * 3;
    const uint16_t a = paletteAt(c[2]);
    const uint32_t t0 = rd16(c);
    if (k == h.nColor - 1 || t <= t0) return a;
    const uint32_t t1 = rd16(c + 3);
    return lerp565(a, paletteAt(c[5]), int32_t(((t - t0) << 10) / (t1 - t0)));
  }

  // Scanline even-odd fill, sampled at pixel centres.
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
  const uint8_t* curves_ = nullptr;
  const uint8_t* palette_ = nullptr;
  Shape* shapes_ = nullptr;
  uint16_t duration_ = 0, shapeCount_ = 0;
  int variants_ = 0;
  Rect dirty_;
  int32_t m_[9] = {16384, 0, 0, 0, 16384, 0, 0, 0, 16384};
  int32_t sx_[256], sy_[256], nodes_[256];
  uint32_t used_ = 0;
  alignas(4) uint8_t pool_[POOL_BYTES];
};

}  // namespace eps
