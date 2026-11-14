# Epsilon

Epsilon is an animation editor for a small round display toy: an ESP32-C6 with a
240×240 GC9A01 screen and an MPU6050 motion sensor. You design flat, 2D animations
in the browser. The toy plays them in 3D: when you move it, the picture lags behind
and springs back, like a head following a body.

This guide is for animators. Programmers should read [DEVELOPER.md](DEVELOPER.md).

## Opening the editor

The editor is a web page, but browsers do not run it from a double-clicked file. Start
the small local server once, from this folder:

```bash
node tools/serve.mjs
```

Then open http://localhost:8080. Your work is autosaved in the browser. Use **Save** to
keep a project file you can open later or share.

## The screen

| Area | What it is for |
|---|---|
| Canvas (centre) | Draw and edit the frame under the playhead. The circle is the edge of the display. |
| Tools and Layers (left) | Drawing tools and the list of layers. |
| Inspector (top right) | Exact values of the selected layer, or project settings and colours when nothing is selected. |
| Emulator (right) | The real output, pixel for pixel. Drag on it to shake the toy. |
| Easing (bottom left) | The curve between keyframes. |
| Timeline (bottom) | Layers, their properties and their keyframes. |

## Layers

Every shape is a **layer**, as in After Effects. There are three kinds:

- **Ellipse** and **Rectangle**: simple shapes with a Size.
- **Path**: a free shape made of points with Bézier handles.

Every layer has these properties. Each can be animated on its own:

| Property | Meaning |
|---|---|
| Size / Path | The shape itself. |
| Fill | Which palette colour it uses (see Colours). |
| Anchor Point | The point it scales and rotates around. |
| Position | Where the anchor point sits. 0, 0 is the centre of the screen; y goes up. |
| Scale | Percent, width and height. |
| Rotation | Degrees, clockwise. |
| Depth | How far behind the screen it is. Lower values are nearer and move more when the toy is shaken; higher values move less. 0 is the screen itself. |

Layers higher in the timeline are drawn on top. A layer only exists between its **in**
and **out** points, the coloured bar in its timeline row. Use this for things that should
appear for just a few frames.

## Drawing

| Tool | Key | Use |
|---|---|---|
| Selection | V | Click a layer to select it, Shift+click to add more. Drag to move. |
| Pen | G | Click to place points; click and drag to pull out smooth handles. Click the first point or press Enter to close the shape. Esc cancels. |
| Rectangle | R | Drag a box. Hold Shift for a square. |
| Ellipse | E | Drag a box. Hold Shift for a circle. |

With a layer selected you get its transform box:

- Drag a **corner** to scale. Hold **Shift** (also partway through the drag) to keep the proportions, so a circle stays a circle.
- Drag the **round handle** above the box to rotate. Hold **Shift** to snap to 15°.
- The crosshair is the anchor point.

### Editing paths

Select one path layer to see its points:

- Drag a point to move it. Shift+click or drag a box to select several.
- A selected point shows its two Bézier handles. Dragging one moves both, keeping the curve smooth. Hold **Alt** to move just one handle and make a corner.
- **Alt+click** a point to switch it between sharp and smooth.
- **Double-click** an edge to add a point there. The shape does not change.
- **Delete** removes the selected points.

An ellipse or rectangle can become a path with **Convert to path** in the Inspector.

## Animating

Animation works like After Effects:

1. Twirl a layer open in the timeline (the ▸ arrow) to see its properties.
2. Click a property's **stopwatch** (the circle) to animate it. This puts a keyframe at the playhead.
3. Move the playhead and change the layer, on the canvas or in the Inspector. A keyframe is added there.
4. If the playhead is **on** a keyframe, changing the layer edits that keyframe instead of adding a new one. Click a keyframe to park the playhead on it.

Turning the stopwatch off removes the property's keyframes and keeps its current value.

The ◆ at the right end of a property row adds a keyframe at the playhead, or removes the one that is there.

### Keyframes in the timeline

- Click to select, Shift+click to add, or drag a box around several.
- Drag to move them in time. They snap to frames.
- **Alt+drag** copies them. **Alt+click** copies them to the playhead.
- Diamonds on the layer row stand for every keyframe of that layer at that time.
- Click empty space in the timeline (or on the canvas) to deselect everything.

### Easing

Select keyframes, then shape the curve in the Easing panel or click a preset. The curve
changes the motion *from* each selected keyframe to the next one. Several keyframes can
share one curve: select them all and edit once.

A path can ease each point differently. Twirl the Path property open to get one row per
point, then select keyframes on those rows.

### Layer timing

Drag the ends of a layer's bar to set when it appears and disappears. Drag the middle to
slide the whole layer, keyframes included.

## Colours

Shapes use palette *slots*, not fixed colours. A **colour variant** is another palette for
the same animation: the toy can show the same animation in many colours for almost no
extra memory. Slot 0 is the background. Fill can be animated too: the colour blends from
one slot to the next.

## Shake preview

Drag on the emulator to shake it. The Stiffness, Damping and Strength sliders change how
the picture lags and springs back. Copy values you like into `firmware/epsilon_firmware/config.h`.

## Putting animations on the toy

1. Save each finished animation (Save → `name.json`) into one folder, for example `examples/`.
2. Pack them all into the firmware:
   ```bash
   node tools/epsc.mjs examples -o firmware/epsilon_firmware/animations_data.h
   ```
   For a single animation, **Export .h** in the editor does the same.
3. Upload `firmware/epsilon_firmware/epsilon_firmware.ino` with the Arduino IDE. Use the **ESP32C6 Dev Module** board with **USB CDC On Boot** enabled, and the libraries **LovyanGFX** and **Adafruit MPU6050**. If the sketch gets too big, pick a larger Partition Scheme such as **Huge APP**.

The status line at the top right shows how much flash and player memory the open project needs.

## Keyboard shortcuts

| Keys | Action |
|---|---|
| V, G, R, E | Selection, Pen, Rectangle, Ellipse |
| Space | Play / pause |
| Page Down / Page Up | Next / previous frame (with Shift: 10 frames) |
| Home / End | First / last frame |
| K | Add a keyframe to every property of the selected layers |
| Alt+Shift+P / S / R / A / D | Add a Position / Scale / Rotation / Anchor / Depth keyframe |
| Alt+[ / Alt+] | Layer starts / ends at the playhead |
| F9 | Easy Ease on the selected keyframes |
| Delete | Delete selected keyframes, else selected points, else selected layers |
| Ctrl+D | Duplicate the selected layers |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Ctrl+S | Save the project file |
| Enter / Esc | Finish / cancel a pen shape; Esc also deselects |

On the toy, the serial monitor (115200 baud) takes: **n** next animation, **v** next
colour variant, **d** debug cube and FPS, **m** print gyro readings.
