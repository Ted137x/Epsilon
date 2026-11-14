// Writes the example projects in examples/. Run: node tools/make-examples.mjs
import { writeFileSync } from "node:fs";
import { makeLayer, vertex, convertToPath } from "../scr/model.js";

const EASE = [0.33, 0, 0.67, 1], BOUNCE = [0.34, 1.56, 0.64, 1];
let id = 1000;
const keys = (...list) => list.map(([t, v, c = EASE]) => ({ id: id++, t, v, c }));
const save = (file, name, duration, variants, layers) =>
  writeFileSync(new URL(`../examples/${file}`, import.meta.url), JSON.stringify({ version: 2, name, duration, fps: 30, variants, layers }, null, 1));

// Two eyes that blink and glance sideways.
const eyes = [-48, 48].flatMap((x) => {
  const eye = makeLayer("ellipse", { name: x < 0 ? "Left eye" : "Right eye", position: [x, 0], size: [68, 80], duration: 4000 });
  eye.props.scale.keys = keys([0, [100, 100]], [2600, [100, 100]], [2750, [100, 8]], [2900, [100, 100]]);
  const pupil = makeLayer("ellipse", { name: "Pupil", position: [x, 0], size: [28, 32], slot: 2, duration: 4000 });
  pupil.props.depth.value = [-30];
  pupil.props.position.keys = keys([0, [x, 0]], [800, [x + 14, 0]], [1600, [x + 14, 0]], [2200, [x, 0]]);
  pupil.props.scale.keys = keys([0, [100, 100]], [2600, [100, 100]], [2750, [100, 5]], [2900, [100, 100]]);
  return [eye, pupil];
});
save("eyes.json", "Blinking eyes", 4000, [
  { name: "Ocean", colors: ["#04121F", "#E8F7FF", "#1B9AAA"] },
  { name: "Ember", colors: ["#1A0505", "#FFF1D6", "#E4572E"] },
  { name: "Forest", colors: ["#07140B", "#EEFBE3", "#3FA34D"] },
], eyes);

// A ball that squashes on landing, with a shadow and a star that only flashes on impact.
const shadow = makeLayer("ellipse", { name: "Shadow", position: [0, -80], size: [80, 14], slot: 2, duration: 1200 });
shadow.props.scale.keys = keys([0, [100, 100]], [600, [40, 40]], [1200, [100, 100]]);
const ball = makeLayer("ellipse", { name: "Ball", position: [0, -50], size: [60, 60], duration: 1200 });
ball.props.depth.value = [-20];
ball.props.position.keys = keys([0, [0, -50], [0.2, 0.7, 0.4, 1]], [600, [0, 60], [0.6, 0, 0.8, 0.3]], [1200, [0, -50]]);
ball.props.scale.keys = keys([0, [140, 70], BOUNCE], [120, [90, 115], [0.2, 0.7, 0.4, 1]], [1080, [90, 115]], [1200, [140, 70]]);
const star = makeLayer("path", {
  name: "Spark", slot: 2, duration: 1200, position: [0, -70],
  path: Array.from({ length: 10 }, (_, i) => {
    const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 7 : 18;
    return vertex(r * Math.cos(a), r * Math.sin(a));
  }),
});
star.in = 0;
star.out = 200;
star.props.rotation.keys = keys([0, [0]], [200, [72]]);
const floor = makeLayer("rect", { name: "Floor", position: [0, -95], size: [170, 10], slot: 2, duration: 1200 });
floor.props.depth.value = [40];
floor.props.rotation.keys = keys([0, [-3]], [600, [3]], [1200, [-3]]);
save("bounce.json", "Bouncing ball", 1200, [
  { name: "Sunny", colors: ["#101A2B", "#FFD23F", "#EE4266"] },
  { name: "Mint", colors: ["#0B1F1A", "#7CF5C4", "#2D6CDF"] },
], [floor, shadow, ball, star]);

// A blob drawn with bezier handles that wobbles between two shapes.
const blob = makeLayer("ellipse", { name: "Blob", size: [110, 100], duration: 3000 });
convertToPath(blob);
const wobble = blob.props.path.value.map((q, i) => ({ ...q, x: q.x * (i % 2 ? 0.8 : 1.15), y: q.y * (i % 2 ? 1.2 : 0.9) }));
blob.props.path.keys = keys([0, blob.props.path.value], [1500, wobble], [3000, blob.props.path.value]);
blob.props.rotation.keys = keys([0, [-8]], [1500, [8]], [3000, [-8]]);
save("blob.json", "Wobbly blob", 3000, [{ name: "Grape", colors: ["#120A1F", "#9B5DE5", "#F15BB5"] }], [blob]);
