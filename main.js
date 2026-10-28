import { curvesCanvas } from "./scr/curves.js";
import { emulatorCanvas } from "./scr/emulator.js";
import { editorCanvas } from "./scr/editor.js";

new p5(curvesCanvas, curves);
new p5(emulatorCanvas, emulator);
new p5(editorCanvas, editor);

