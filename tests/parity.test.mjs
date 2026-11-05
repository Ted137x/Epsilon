// Proves the C++ player and the web emulator draw identical pixels. Needs a host C++
// compiler: set EPS_CXX to e.g. "zig c++" or "g++". Without one the test is skipped.
import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, pack, toHeader } from "../scr/compiler.js";
import { Player } from "../scr/player.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const cxx = process.env.EPS_CXX;

test("C++ and JS frames match for every example and variant", { skip: !cxx && "EPS_CXX not set" }, () => {
  const dir = join(root, "examples");
  const packed = pack(readdirSync(dir).filter((f) => f.endsWith(".json")).sort()
    .map((f) => compile(JSON.parse(readFileSync(join(dir, f), "utf8"))).bytes));

  const expected = [];
  const pl = new Player(packed);
  for (let a = 0; a < pl.count; a++) {
    pl.load(a, 0);
    const variants = pl.variants;
    for (let v = 0; v < variants; v++) {
      pl.load(a, v);
      let h = 2166136261;
      for (let t = 0; t < pl.duration; t += 7) {
        pl.render(t, t * 13, -t * 9, t * 3);
        for (let i = 0; i < pl.fb.length; i++) h = Math.imul(h ^ pl.fb[i], 16777619) >>> 0;
      }
      expected.push(`${a} ${v} ${h}`);
    }
  }

  const tmp = mkdtempSync(join(tmpdir(), "eps-"));
  writeFileSync(join(tmp, "animations_data.h"), toHeader(packed));
  const exe = join(tmp, "parity.exe");
  execSync(`${cxx} -std=c++17 -O1 -I"${tmp}" "${join(root, "tests", "parity", "parity_main.cpp")}" -o "${exe}"`, { stdio: "inherit" });
  const actual = execSync(`"${exe}"`, { encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(actual, expected);
});
