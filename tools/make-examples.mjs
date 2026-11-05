// Writes the example projects in examples/.
import { writeFileSync } from "node:fs";

const EASE = [0.42, 0, 0.58, 1], BOUNCE = [0.34, 1.56, 0.64, 1];
let id = 1;
const key = (t, pts, c = EASE, z = -100) => ({ id: id++, t, z, pts: pts.map(([x, y]) => ({ x, y, c })) });
const ring = (cx, cy, rx, ry, n = 32) => Array.from({ length: n }, (_, i) => {
  const a = 2 * Math.PI * i / n;
  return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
});
const shape = (name, slot, keys, colorKeys = [{ t: 0, slot }], duration = 4000) => ({ id: id++, name, start: 0, end: duration, colorKeys, keys });
const save = (file, name, variants, shapes, duration = 4000) =>
  writeFileSync(new URL(`../examples/${file}`, import.meta.url), JSON.stringify({ version: 1, name, duration, variants, shapes }, null, 1));

save("eyes.json", "Blinking eyes", [
  { name: "Ocean", colors: ["#04121F", "#E8F7FF", "#1B9AAA"] },
  { name: "Ember", colors: ["#1A0505", "#FFF1D6", "#E4572E"] },
  { name: "Forest", colors: ["#07140B", "#EEFBE3", "#3FA34D"] },
], [-48, 48].flatMap((cx) => {
  const open = ring(cx, 0, 34, 40), shut = ring(cx, 0, 34, 3);
  const pupilOpen = ring(cx, 0, 14, 16), pupilShut = ring(cx, 0, 14, 1);
  const blink = (a, b, z) => [key(0, a, EASE, z), key(2600, a, EASE, z), key(2750, b, EASE, z), key(2900, a, EASE, z)];
  return [shape("Eye", 1, blink(open, shut, -100)), shape("Pupil", 2, blink(pupilOpen, pupilShut, -130))];
}));

save("bounce.json", "Bouncing ball", [
  { name: "Sunny", colors: ["#101A2B", "#FFD23F", "#EE4266"] },
  { name: "Mint", colors: ["#0B1F1A", "#7CF5C4", "#2D6CDF"] },
], [
  shape("Shadow", 2, [key(0, ring(0, -78, 40, 7)), key(600, ring(0, -78, 16, 3)), key(1200, ring(0, -78, 40, 7))], undefined, 1200),
  shape("Ball", 1, [
    key(0, ring(0, -50, 44, 22), BOUNCE, -120),
    key(120, ring(0, -38, 30, 34), [0.2, 0.7, 0.4, 1], -120),
    key(600, ring(0, 60, 30, 30), [0.6, 0, 0.8, 0.3], -120),
    key(1080, ring(0, -38, 30, 34), EASE, -120),
    key(1200, ring(0, -50, 44, 22), EASE, -120),
  ], undefined, 1200),
], 1200);
