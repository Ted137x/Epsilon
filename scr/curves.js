import { programState as st, commit, refresh, selectedCurveTargets } from "./states.js";
import { easeAt, LINEAR } from "./functions.js";

const PRESETS = {
  Linear: LINEAR,
  "Ease": [0.25, 0.1, 0.25, 1],
  "In": [0.42, 0, 1, 1],
  "Out": [0, 0, 0.58, 1],
  "In-Out": [0.42, 0, 0.58, 1],
  "Back": [0.34, 1.56, 0.64, 1],
};

const W = 240, H = 208, M = 20;
const BOX_TOP = 44, BOX_H = 120;
const toX = (x) => M + x * (W - 2 * M);
const toY = (y) => BOX_TOP + BOX_H - y * BOX_H;
const fromX = (x) => (x - M) / (W - 2 * M);
const fromY = (y) => (BOX_TOP + BOX_H - y) / BOX_H;

function apply(c) {
  for (const point of selectedCurveTargets()) point.c = [...c];
}

export function setupCurvePresets() {
  const host = document.getElementById("curve-presets");
  for (const [name, c] of Object.entries(PRESETS)) {
    const b = document.createElement("button");
    b.textContent = name;
    b.onclick = () => { apply(c); commit(); };
    host.append(b);
  }
}

export function curvesCanvas(p) {
  let dragging = -1, shown = [...LINEAR];

  p.setup = () => {
    p.pixelDensity(1);
    p.createCanvas(W, H);
  };

  p.draw = () => {
    const targets = selectedCurveTargets();
    shown = targets.length ? targets[0].c : LINEAR;

    p.background(36, 38, 45);
    p.noFill();
    p.stroke(90);
    p.strokeWeight(1);
    p.rect(M, BOX_TOP, W - 2 * M, BOX_H);

    p.noStroke();
    p.fill(170);
    p.textSize(12);
    p.text(targets.length ? `Curve: ${targets.length} point keys selected` : "Select keyframes in the timeline", 8, 16);

    p.stroke(targets.length ? "#c89e02" : "#666");
    p.strokeWeight(2);
    p.noFill();
    p.beginShape();
    for (let i = 0; i <= 64; i++) p.vertex(toX(i / 64), toY(easeAt(shown, i / 64)));
    p.endShape();

    if (!targets.length) return;
    p.strokeWeight(1);
    p.stroke(200);
    p.line(toX(0), toY(0), toX(shown[0]), toY(shown[1]));
    p.line(toX(1), toY(1), toX(shown[2]), toY(shown[3]));
    p.fill(255);
    p.circle(toX(shown[0]), toY(shown[1]), 9);
    p.circle(toX(shown[2]), toY(shown[3]), 9);
  };

  p.mousePressed = () => {
    dragging = -1;
    if (!selectedCurveTargets().length) return;
    const d1 = p.dist(p.mouseX, p.mouseY, toX(shown[0]), toY(shown[1]));
    const d2 = p.dist(p.mouseX, p.mouseY, toX(shown[2]), toY(shown[3]));
    if (Math.min(d1, d2) <= 9) dragging = d1 <= d2 ? 0 : 2;
  };

  p.mouseDragged = () => {
    if (dragging < 0) return;
    const c = [...shown];
    c[dragging] = Math.min(1, Math.max(0, fromX(p.mouseX)));
    c[dragging + 1] = Math.min(1.35, Math.max(-0.35, fromY(p.mouseY)));
    apply(c);
    refresh();
  };

  p.mouseReleased = () => {
    if (dragging >= 0) commit();
    dragging = -1;
  };

  p.doubleClicked = () => {
    if (p.mouseX >= 0 && p.mouseX < W && p.mouseY >= 0 && p.mouseY < H && selectedCurveTargets().length) {
      apply(LINEAR);
      commit();
    }
  };
}
