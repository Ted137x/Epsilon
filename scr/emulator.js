// Plays the real compiled binary through the integer renderer, so this canvas shows
// exactly the pixels the display will show.
import { project, programState as st } from "./states.js";
import { compile, pack } from "./compiler.js";
import { Player, SIZE } from "./player.js";

const TO_UNITS = 65536 / (2 * Math.PI);
const CUBE = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
const EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

// Keep in step with Spring in firmware/epsilon_firmware/epsilon_firmware.ino.
function springStep(s, rate, dt) {
  const { k, c, gain, max } = st.spring;
  s.velocity += (-k * s.angle - c * s.velocity) * dt;
  s.angle += (s.velocity - gain * rate) * dt;
  if (Math.abs(s.angle) > max) {
    s.angle = Math.sign(s.angle) * max;
    s.velocity = 0;
  }
}

export const compileState = { result: null };

export function emulatorCanvas(p) {
  let player = null, builtRev = -1, builtVariant = -1, image;
  const sx = { angle: 0, velocity: 0 }, sy = { angle: 0, velocity: 0 };
  let dragging = false, lastX = 0, lastY = 0;

  function rebuild() {
    builtRev = st.rev;
    builtVariant = st.variant;
    const result = compile(project);
    compileState.result = result;
    if (result.errors.length) return;
    player = new Player(pack([result.bytes]));
    player.load(0, st.variant);
  }

  function blit() {
    image.loadPixels();
    const px = image.pixels, fb = player.fb;
    for (let i = 0; i < fb.length; i++) {
      const c = fb[i], o = i * 4;
      px[o] = ((c >> 11) * 527 + 23) >> 6;
      px[o + 1] = (((c >> 5) & 63) * 259 + 33) >> 6;
      px[o + 2] = ((c & 31) * 527 + 23) >> 6;
      px[o + 3] = 255;
    }
    image.updatePixels();
    p.image(image, 0, 0);
  }

  function drawCube() {
    const [ca, sa, cb, sb] = [Math.cos(sx.angle), Math.sin(sx.angle), Math.cos(sy.angle), Math.sin(sy.angle)];
    const pts = CUBE.map(([x, y, z]) => {
      x *= 100; y *= 100; z *= 100;
      [y, z] = [y * ca - z * sa, y * sa + z * ca];
      [x, z] = [x * cb + z * sb, -x * sb + z * cb];
      return [120 + x / (z + 250) * 150, 120 - y / (z + 250) * 150];
    });
    p.stroke(255, 100);
    for (const [a, b] of EDGES) p.line(pts[a][0], pts[a][1], pts[b][0], pts[b][1]);
  }

  p.setup = () => {
    p.pixelDensity(1);
    p.createCanvas(SIZE, SIZE);
    image = p.createImage(SIZE, SIZE);
    p.textSize(12);
  };

  p.draw = () => {
    const dt = Math.min(0.05, p.deltaTime / 1000);
    if (st.rev !== builtRev || st.variant !== builtVariant) rebuild();

    if (st.playing && project.duration > 0) st.time = (st.time + p.deltaTime) % project.duration;

    let rateX = 0, rateY = 0;
    if (dragging) {
      rateY = (p.mouseX - lastX) / Math.max(dt, 0.001) * 0.012;
      rateX = (p.mouseY - lastY) / Math.max(dt, 0.001) * 0.012;
      lastX = p.mouseX;
      lastY = p.mouseY;
    }
    springStep(sx, rateX, dt);
    springStep(sy, rateY, dt);

    if (player && !compileState.result.errors.length) {
      player.render(Math.round(st.time), Math.round(sx.angle * TO_UNITS), Math.round(sy.angle * TO_UNITS), 0);
      blit();
    } else {
      p.background(0);
    }

    const ctx = p.drawingContext;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.rect(0, 0, SIZE, SIZE);
    ctx.arc(120, 120, 120, 0, Math.PI * 2, true);
    ctx.fill("evenodd");

    if (dragging) drawCube();
  };

  p.mousePressed = () => {
    if (p.mouseX >= 0 && p.mouseX < SIZE && p.mouseY >= 0 && p.mouseY < SIZE) {
      dragging = true;
      lastX = p.mouseX;
      lastY = p.mouseY;
    }
  };
  p.mouseReleased = () => { dragging = false; };
}
