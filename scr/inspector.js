// The Inspector panel: numeric fields for the selected layer's properties at the
// playhead, plus project settings and colour variants when nothing is selected.

import { project, programState as st, commit, refresh, onChange, activeLayer, setProp, propAt, moveLayer, frameMs } from "./states.js";
import { PROPS, propsOf, convertToPath } from "./model.js";

const host = document.getElementById("inspector");

function el(tag, props = {}, ...kids) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}

const field = (label, ...controls) => el("label", { className: "field" }, el("span", { textContent: label }), el("span", { className: "inputs" }, ...controls));

function number(value, onSet, attrs = {}) {
  return el("input", {
    type: "number", step: "any", value: Math.round(value * 100) / 100, ...attrs,
    onchange: (e) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v)) { onSet(v); commit(); }
    },
  });
}

function propField(l, name) {
  const info = PROPS[name], v = propAt(l, name), animated = l.props[name].keys.length > 0;
  const label = `${info.label}${info.unit && info.unit !== "px" ? ` (${info.unit})` : ""}${animated ? " ◆" : ""}`;
  return field(label, ...v.map((x, i) => number(x, (nv) => {
    const next = [...propAt(l, name)];
    next[i] = nv;
    setProp(l, name, next);
  })));
}

function layerPanel(l) {
  const colors = project.variants[st.variant].colors, slot = propAt(l, "fill")[0];
  const fill = el("select", { onchange: (e) => { setProp(l, "fill", [Number(e.target.value)]); commit(); } },
    ...colors.map((c, i) => el("option", { value: i, textContent: `${i === 0 ? "Background" : `Colour ${i}`} ${c}`, selected: i === slot })));
  const time = (v) => `${v} ms (frame ${Math.round(v / frameMs())})`;

  return [
    el("h3", { textContent: `${l.type === "path" ? "Path" : l.type === "rect" ? "Rectangle" : "Ellipse"} layer` }),
    field("Name", el("input", { value: l.name, onchange: (e) => { l.name = e.target.value; commit(); } })),
    field(`Fill${l.props.fill.keys.length ? " ◆" : ""}`, fill),
    ...propsOf(l).filter((n) => n !== "fill" && n !== "path").map((n) => propField(l, n)),
    field("In", number(l.in, (v) => { l.in = Math.max(0, Math.min(l.out - 1, Math.round(v))); }, { title: time(l.in) })),
    field("Out", number(l.out, (v) => { l.out = Math.min(project.duration, Math.max(l.in + 1, Math.round(v))); }, { title: time(l.out) })),
    el("div", { className: "row" },
      el("button", { textContent: "Bring forward", onclick: () => { moveLayer(l.id, 1); commit(); } }),
      el("button", { textContent: "Send back", onclick: () => { moveLayer(l.id, -1); commit(); } }),
      l.type === "path" ? "" : el("button", {
        textContent: "Convert to path", title: "Turn into an editable bezier path",
        onclick: () => { convertToPath(l); commit(); },
      })),
    el("p", {
      className: "hint",
      textContent: l.type === "path"
        ? "Drag points and handles on the canvas. Double-click an edge to add a point, Alt+click a point to make it sharp or smooth, Alt+drag a handle to break it."
        : "Lower depth is nearer and moves more when the toy is shaken.",
    }),
  ];
}

function palettePanel() {
  const rows = project.variants.map((v, vi) => el("div", { className: "swatches" },
    el("input", { type: "text", value: v.name, "aria-label": "Variant name", onchange: (e) => { v.name = e.target.value; commit(); } }),
    ...v.colors.map((c, i) => el("input", {
      type: "color", value: c, title: i === 0 ? "Background" : `Colour ${i}`,
      onchange: (e) => { v.colors[i] = e.target.value; commit(); },
    })),
    el("button", {
      textContent: st.variant === vi ? "●" : "○", title: "Preview this variant",
      onclick: () => { st.variant = vi; refresh(); },
    })));

  return [
    el("h3", { textContent: "Colour variants" }),
    ...rows,
    el("div", { className: "row" },
      el("button", {
        textContent: "+ Variant",
        onclick: () => {
          project.variants.push({ name: `Variant ${project.variants.length + 1}`, colors: [...project.variants[st.variant].colors] });
          commit();
        },
      }),
      el("button", { textContent: "+ Colour", onclick: () => { project.variants.forEach((v) => v.colors.push("#ffffff")); commit(); } }),
      el("button", {
        textContent: "Delete variant", disabled: project.variants.length < 2,
        onclick: () => { project.variants.splice(st.variant, 1); st.variant = Math.max(0, st.variant - 1); commit(); },
      })),
  ];
}

function projectPanel() {
  const spring = (label, key, min, max, step) => field(label, el("input", {
    type: "range", min, max, step, value: st.spring[key], oninput: (e) => { st.spring[key] = Number(e.target.value); },
  }));
  return [
    el("h3", { textContent: "Project" }),
    field("Name", el("input", { value: project.name, onchange: (e) => { project.name = e.target.value; commit(); } })),
    field("Length (ms)", number(project.duration, (v) => {
      project.duration = Math.max(100, Math.min(60000, Math.round(v)));
      project.layers.forEach((l) => { l.out = Math.min(l.out, project.duration); l.in = Math.min(l.in, l.out - 1); });
    })),
    field("Frame rate", number(project.fps, (v) => { project.fps = Math.max(1, Math.min(120, Math.round(v))); })),
    el("h3", { textContent: "Shake preview" }),
    spring("Stiffness", "k", 10, 200, 1),
    spring("Damping", "c", 1, 20, 0.1),
    spring("Strength", "gain", 0, 2, 0.05),
    el("p", { className: "hint", textContent: "Drag on the emulator to shake it. Copy values you like into firmware config.h." }),
  ];
}

let shown = "";

function render() {
  const l = activeLayer();
  const signature = JSON.stringify([l?.id, st.variant, st.time, project.variants, project.name, project.duration, project.fps, l]);
  const focused = document.activeElement;
  if (signature === shown || (host.contains(focused) && focused.tagName === "INPUT" && focused.type !== "color")) return;
  shown = signature;
  host.replaceChildren(...(l ? layerPanel(l) : projectPanel()), ...palettePanel());
}

export function setupInspector() {
  onChange(render);
  render();
}
