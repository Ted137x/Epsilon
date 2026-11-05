import { curvesCanvas, setupCurvePresets } from "./scr/curves.js";
import { emulatorCanvas } from "./scr/emulator.js";
import { editorCanvas } from "./scr/editor.js";
import { timelineZoomCanvas, timelineFrameCanvas } from "./scr/timeline.js";
import { setupInspector } from "./scr/inspector.js";
import { setupUI } from "./scr/ui.js";

const at = (id) => document.getElementById(id);

setupUI();
setupInspector();
setupCurvePresets();

new p5(curvesCanvas, at("curves"));
new p5(emulatorCanvas, at("emulator"));
new p5(editorCanvas, at("editor"));
new p5(timelineZoomCanvas, at("zoombar"));
new p5(timelineFrameCanvas, at("framebar"));
