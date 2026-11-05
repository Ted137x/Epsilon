#!/usr/bin/env node
// Packs project files into the header the firmware embeds in flash.
//   node tools/epsc.mjs examples/*.json -o firmware/epsilon_firmware/animations_data.h
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { compile, pack, toHeader } from "../scr/compiler.js";
import { validateProject } from "../scr/states.js";

const args = process.argv.slice(2);
const o = args.indexOf("-o");
const out = o >= 0 ? args.splice(o, 2)[1] : "animations_data.h";
const files = args.flatMap((a) => statSync(a).isDirectory()
  ? readdirSync(a).filter((f) => f.endsWith(".json")).sort().map((f) => join(a, f))
  : [a]);

if (!files.length) {
  console.error("usage: epsc <project.json | folder>... -o animations_data.h");
  process.exit(2);
}

const animations = [];
let failed = false;
for (const file of files) {
  const { bytes, errors } = compile(validateProject(JSON.parse(readFileSync(file, "utf8"))));
  if (errors.length) {
    failed = true;
    errors.forEach((e) => console.error(`${file}: ${e}`));
  } else {
    animations.push(bytes);
    console.log(`${String(bytes.length).padStart(8)} B  ${file}`);
  }
}
if (failed) process.exit(1);

const packed = pack(animations);
writeFileSync(out, out.endsWith(".bin") ? packed : toHeader(packed));
console.log(`${String(packed.length).padStart(8)} B  total, ${animations.length} animations -> ${out}`);
