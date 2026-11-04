import { curvesCanvas } from "./scr/curves.js";
import { emulatorCanvas } from "./scr/emulator.js";
import { editorCanvas } from "./scr/editor.js";
import { timelineZoomCanvas } from "./scr/timeline.js";
import { timelineFrameCanvas } from "./scr/timeline.js";

new p5(curvesCanvas, curves);
new p5(emulatorCanvas, emulator);
new p5(editorCanvas, editor);
new p5(timelineZoomCanvas, zoombar);
new p5(timelineFrameCanvas, framebar);


