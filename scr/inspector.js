import { project, programState as st, commit, onChange, activeShape, keyAt, moveShape, refresh } from "./states.js";
import { colorSlotAt, sampleShape } from "./functions.js";

const host = document.getElementById("inspector");

function el(tag, props = {}, ...kids) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}

function field(label, control) {
  return el("label", { className: "field" }, el("span", { textContent: label }), control);
}

const number = (value, onSet, attrs = {}) => el("input", {
  type: "number", value: Math.round(value), ...attrs,
  onchange: (e) => { const v = Number(e.target.value); if (Number.isFinite(v)) { onSet(v); commit(); } },
});

const clampTime = (v) => Math.max(0, Math.min(project.duration, Math.round(v)));

function shapePanel(s) {
  const slots = project.variants[st.variant].colors;
  const slot = colorSlotAt(s, st.time), t = Math.round(st.time);

  const colorSelect = el("select", {
    onchange: (e) => {
      const value = Number(e.target.value), key = s.colorKeys.find((c) => c.t === t);
      if (key) key.slot = value;
      else if (s.colorKeys.length === 1) s.colorKeys[0].slot = value;
      else { s.colorKeys.push({ t, slot: value }); s.colorKeys.sort((a, b) => a.t - b.t); }
      commit();
    },
  }, ...slots.map((c, i) => el("option", { value: i, textContent: `${i === 0 ? "Bg" : `Colour ${i}`} ${c}`, selected: i === slot })));

  return [
    el("h3", { textContent: "Shape" }),
    field("Name", el("input", { value: s.name, onchange: (e) => { s.name = e.target.value; commit(); } })),
    field("Colour", colorSelect),
    el("div", { className: "row" },
      el("button", {
        textContent: "Add colour key",
        title: "Blend to a new colour from the playhead",
        onclick: () => {
          if (!s.colorKeys.some((c) => c.t === t)) {
            s.colorKeys.push({ t, slot });
            s.colorKeys.sort((a, b) => a.t - b.t);
            commit();
          }
        },
      }),
      el("button", {
        textContent: "Clear",
        title: "Back to one colour",
        onclick: () => { s.colorKeys = [{ t: 0, slot }]; commit(); },
      })),
    field("Depth", number(sampleShape(s, st.time).z, (v) => { keyAt(s, st.time).z = Math.max(-200, Math.min(1000, v)); })),
    field("Visible from", number(s.start, (v) => { s.start = clampTime(v); })),
    field("Visible to", number(s.end, (v) => { s.end = clampTime(v); })),
    el("div", { className: "row" },
      el("button", { textContent: "Forward", onclick: () => { moveShape(s.id, 1); commit(); } }),
      el("button", { textContent: "Back", onclick: () => { moveShape(s.id, -1); commit(); } })),
    el("p", { className: "hint", textContent: `${s.keys[0].pts.length} points, ${s.keys.length} keyframes. Lower depth is nearer and shifts more when the toy moves.` }),
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
          const base = project.variants[st.variant];
          project.variants.push({ name: `Variant ${project.variants.length + 1}`, colors: [...base.colors] });
          commit();
        },
      }),
      el("button", {
        textContent: "+ Colour",
        onclick: () => { project.variants.forEach((v) => v.colors.push("#ffffff")); commit(); },
      }),
      el("button", {
        textContent: "Delete variant",
        disabled: project.variants.length < 2,
        onclick: () => {
          project.variants.splice(st.variant, 1);
          st.variant = Math.max(0, st.variant - 1);
          commit();
        },
      })),
  ];
}

function projectPanel() {
  const spring = (label, key, min, max, step) => field(label, el("input", {
    type: "range", min, max, step, value: st.spring[key],
    oninput: (e) => { st.spring[key] = Number(e.target.value); },
  }));

  return [
    el("h3", { textContent: "Project" }),
    field("Name", el("input", { value: project.name, onchange: (e) => { project.name = e.target.value; commit(); } })),
    field("Length (ms)", number(project.duration, (v) => {
      project.duration = Math.max(100, Math.min(60000, Math.round(v)));
      st.time = Math.min(st.time, project.duration - 1);
      project.shapes.forEach((s) => { s.end = Math.min(s.end, project.duration); });
    })),
    el("h3", { textContent: "Shake preview" }),
    spring("Stiffness", "k", 10, 200, 1),
    spring("Damping", "c", 1, 20, 0.1),
    spring("Strength", "gain", 0, 2, 0.05),
    el("p", { className: "hint", textContent: "Drag on the emulator to shake it. These values are set in the firmware." }),
  ];
}

let shown = "";

function render() {
  const s = activeShape();
  const signature = JSON.stringify([s?.id, st.variant, Math.round(st.time), project.variants, project.name, project.duration, s && [s.name, s.start, s.end, s.colorKeys, s.keys.length]]);
  if (signature === shown || host.contains(document.activeElement) && document.activeElement.tagName === "INPUT" && document.activeElement.type !== "color") return;
  shown = signature;
  host.replaceChildren(...(s ? shapePanel(s) : []), ...palettePanel(), ...(s ? [] : projectPanel()));
}

export function setupInspector() {
  onChange(render);
  render();
}
