// The curve panel: edits the easing of every selected keyframe at once.
// A key's curve shapes the motion from that key to the next one.

import { programState as st, commit, refresh, selectedKeys } from "./states.js";
import { easeAt, LINEAR, EASY_EASE } from "./functions.js";

export const PRESETS = {
  Linear: LINEAR,
  "Easy Ease": EASY_EASE,
  In: [0.42, 0, 1, 1],
  Out: [0, 0, 0.58, 1],
  Back: [0.34, 1.56, 0.64, 1],
};

const W = 240, H = 208, M = 20, BOX_TOP = 44, BOX_H = 120;
const toX = (x) => M + x * (W - 2 * M);
const toY = (y) => BOX_TOP + BOX_H - y * BOX_H;
const fromX = (x) => (x - M) / (W - 2 * M);
const fromY = (y) => (BOX_TOP + BOX_H - y) / BOX_H;

// The curve a selected key uses; a vertex row of a path can override it.
const curveOf = ({ key, vertex }) => (vertex >= 0 && key.vc?.[vertex]) || key.c;

export function applyCurve(c) {
  for (const { prop, key, vertex } of selectedKeys()) {
    if (prop === "path" && vertex >= 0) {
      key.vc ??= key.v.map(() => null);
      key.vc[vertex] = [...c];
    } else {
      key.c = [...c];
      if (prop === "path") delete key.vc;
    }
  }
}

export function setupCurvePresets() {
  const host = document.getElementById("curve-presets");
  for (const [name, c] of Object.entries(PRESETS)) {
    const b = document.createElement("button");
    b.textContent = name;
    if (name === "Easy Ease") b.title = "F9";
    b.onclick = () => { applyCurve(c); commit(); };
    host.append(b);
  }
}

export function curvesCanvas(p) {
  let dragging = -1, shown = LINEAR;

  p.setup = () => {
    p.pixelDensity(1);
    p.createCanvas(W, H);
  };

  p.draw = () => {
    const keys = selectedKeys();
    shown = keys.length ? curveOf(keys[0]) : LINEAR;

    p.background(36, 38, 45);
    p.noFill();
    p.stroke(90);
    p.strokeWeight(1);
    p.rect(M, BOX_TOP, W - 2 * M, BOX_H);

    p.noStroke();
    p.fill(170);
    p.textSize(12);
    p.text(keys.length ? `Easing: ${keys.length} keyframe${keys.length > 1 ? "s" : ""} selected` : "Select keyframes in the timeline", 8, 16);

    p.stroke(keys.length ? "#c89e02" : "#666");
    p.strokeWeight(2);
    p.noFill();
    p.beginShape();
    for (let i = 0; i <= 64; i++) p.vertex(toX(i / 64), toY(easeAt(shown, i / 64)));
    p.endShape();

    if (!keys.length) return;
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
    if (!selectedKeys().length) return;
    const d1 = p.dist(p.mouseX, p.mouseY, toX(shown[0]), toY(shown[1]));
    const d2 = p.dist(p.mouseX, p.mouseY, toX(shown[2]), toY(shown[3]));
    if (Math.min(d1, d2) <= 9) dragging = d1 <= d2 ? 0 : 2;
  };

  p.mouseDragged = () => {
    if (dragging < 0) return;
    const c = [...shown];
    c[dragging] = Math.min(1, Math.max(0, fromX(p.mouseX)));
    c[dragging + 1] = Math.min(1.35, Math.max(-0.35, fromY(p.mouseY)));
    applyCurve(c);
    refresh();
  };

  p.mouseReleased = () => {
    if (dragging >= 0) commit();
    dragging = -1;
  };

  p.doubleClicked = () => {
    if (p.mouseX >= 0 && p.mouseX < W && p.mouseY >= 0 && p.mouseY < H && selectedKeys().length) {
      applyCurve(LINEAR);
      commit();
    }
  };
}
