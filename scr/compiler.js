// Turns a project into the compact EPS2 binary that the firmware plays straight from
// flash. Runs in the browser (Export) and in Node (tools/epsc.mjs).
// The byte layout is documented in DEVELOPER.md; scr/player.js and
// firmware/epsilon_firmware/epsilon_player.h read it.

import { easeAt, hexTo565 } from "./functions.js";
import { propsOf } from "./model.js";

export const MAGIC = 0x32535045; // "EPS2"
export const RAM_LIMIT = 120 * 1024; // POOL_BYTES in epsilon_player.h
export const MAX_PATH_VERTICES = 128; // 8 points per curved segment, 1024 points max
export const TYPES = { ellipse: 0, rect: 1, path: 2 };

class Writer {
  constructor() { this.b = []; }
  u8(v) { this.b.push(v & 255); }
  u16(v) { this.b.push(v & 255, (v >> 8) & 255); }
  i16(v) { this.u16(v); }
  u32(v) { this.u16(v & 0xffff); this.u16(v >>> 16); }
}

const i16 = (v) => Math.max(-32768, Math.min(32767, Math.round(v)));

// Editor units to the integers the player uses.
const ENCODE = {
  anchor: (v) => v.map((x) => i16(x * 4)),          // quarter pixels
  position: (v) => v.map((x) => i16(x * 4)),
  size: (v) => v.map((x) => i16(Math.abs(x) * 4)),
  scale: (v) => v.map((x) => i16(x * 4096 / 100)),   // 4096 = 100 %
  rotation: (v) => [i16(v[0] * 10)],                 // tenths of a degree
  depth: (v) => [Math.max(-1000, Math.min(1000, Math.round(v[0])))],
  fill: (v) => [Math.round(v[0])],
  path: (v) => v.flatMap((q) => [q.x, q.y, q.ix, q.iy, q.ox, q.oy].map((x) => i16(x * 4))),
};

// Values of every key: the first in full, later ones as small deltas when they fit.
function writeValues(w, rows) {
  rows[0].forEach((v) => w.i16(v));
  for (let k = 1; k < rows.length; k++) {
    const d = rows[k].map((v, i) => v - rows[k - 1][i]);
    const mode = d.every((v) => v === 0) ? 0 : d.every((v) => v >= -128 && v <= 127) ? 1 : 2;
    w.u8(mode);
    if (mode === 1) d.forEach((v) => w.u8(v));
    if (mode === 2) rows[k].forEach((v) => w.i16(v));
  }
}

export function compile(project) {
  const errors = [];
  if (!(project.duration >= 1 && project.duration <= 60000)) errors.push("Length must be 1..60000 ms");
  const slots = project.variants[0]?.colors.length ?? 0;
  if (slots < 1 || slots > 255) errors.push("Palette must have 1..255 colours");
  if (project.layers.length > 1000) errors.push("Too many layers");

  const curves = new Map();
  const curveId = (c) => {
    const key = c.map((v) => v.toFixed(3)).join();
    if (!curves.has(key)) curves.set(key, { id: curves.size, c });
    return curves.get(key).id;
  };

  const body = new Writer();
  let ram = 0;
  const alloc = (bytes) => { ram += (bytes + 3) & ~3; };

  for (const layer of project.layers) {
    alloc(256);
    body.u8(TYPES[layer.type]);
    body.u8(0);
    body.u16(Math.max(0, Math.min(project.duration, Math.round(layer.in))));
    body.u16(Math.max(0, Math.min(project.duration, Math.round(layer.out))));

    for (const name of ["anchor", "position", "scale", "rotation", "depth", "fill", propsOf(layer)[0]]) {
      const tr = layer.props[name], keys = [...tr.keys].sort((a, b) => a.t - b.t);
      if (keys.length > 255) { errors.push(`${layer.name}: ${name} has more than 255 keyframes`); continue; }
      const rows = (keys.length ? keys.map((k) => k.v) : [tr.value]).map(ENCODE[name]);
      if (name === "fill" && rows.some((r) => r[0] < 0 || r[0] >= slots)) errors.push(`${layer.name}: fill uses a missing colour`);
      const n = rows.length;

      if (name === "path") {
        const nv = tr.value.length;
        if (nv < 3 || nv > MAX_PATH_VERTICES) { errors.push(`${layer.name}: a path needs 3..${MAX_PATH_VERTICES} points`); continue; }
        if (keys.some((k) => k.v.length !== nv)) { errors.push(`${layer.name}: path keyframes disagree on point count`); continue; }
        const segs = keys.slice(0, -1).map((k) => k.v.map((_, i) => curveId(k.vc?.[i] ?? k.c)));
        const perVertex = segs.some((s) => s.some((id) => id !== s[0]));
        body.u8(nv); body.u8(n); body.u8(perVertex ? 1 : 0);
        if (n > 1) {
          keys.forEach((k) => body.u16(Math.round(k.t)));
          segs.forEach((s) => (perVertex ? s : s.slice(0, 1)).forEach((id) => body.u8(id)));
        }
        writeValues(body, rows);
        alloc(n * 2); alloc(n * nv * 12);
      } else {
        body.u8(n);
        if (n > 1) {
          keys.forEach((k) => body.u16(Math.round(k.t)));
          keys.slice(0, -1).forEach((k) => body.u8(curveId(k.c)));
        }
        writeValues(body, rows);
        alloc(n * 2); alloc(n * rows[0].length * 2);
      }
    }
  }

  if (curves.size > 255) errors.push("More than 255 different curves");
  if (ram > RAM_LIMIT) errors.push(`Needs ${ram} bytes of player RAM, the limit is ${RAM_LIMIT}`);
  if (errors.length) return { errors };

  const out = new Writer();
  out.u16(Math.round(project.duration));
  out.u16(project.layers.length);
  out.u8(curves.size); out.u8(slots); out.u8(project.variants.length); out.u8(Math.min(255, project.fps));
  for (const { c } of curves.values()) {
    for (let i = 0; i <= 32; i++) out.i16(Math.max(-24576, Math.min(24576, Math.round(easeAt(c, i / 32) * 16384))));
  }
  for (const v of project.variants) for (const hex of v.colors) out.u16(hexTo565(hex));
  return { errors, ram, bytes: Uint8Array.from([...out.b, ...body.b]) };
}

export function pack(animations) {
  const head = new Writer();
  head.u32(MAGIC);
  head.u16(animations.length); head.u16(0);
  let offset = 8 + animations.length * 4;
  for (const a of animations) { head.u32(offset); offset += a.length; }
  const out = new Uint8Array(offset);
  out.set(head.b);
  let o = head.b.length;
  for (const a of animations) { out.set(a, o); o += a.length; }
  return out;
}

export function toHeader(bytes) {
  const lines = [];
  for (let i = 0; i < bytes.length; i += 24) lines.push("  " + Array.from(bytes.subarray(i, i + 24)).join(",") + ",");
  return `// Generated by Epsilon (tools/epsc.mjs or Export .h). Do not edit by hand.\n#pragma once\n#include <stdint.h>\n\n` +
    `static const uint32_t EPS_PACK_SIZE = ${bytes.length};\n` +
    `static const uint8_t EPS_PACK[] __attribute__((aligned(4))) = {\n${lines.join("\n")}\n};\n`;
}
