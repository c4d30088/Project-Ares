// Enforces CLAUDE.md hard rules 1 and 3 on every file in src/sim.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SIM_DIR = join(__dirname, "../src/sim");

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? listFiles(p) : /\.tsx?$/.test(name) ? [p] : [];
  });
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const forbidden: [RegExp, string][] = [
  [/from\s+["'](three|react|react-dom|lil-gui)(\/[^"']*)?["']/, "imports a rendering/UI library"],
  [/from\s+["'][^"']*\/(render|ui|game)\//, "imports from render/ui/game"],
  [/\bMath\.random\b/, "uses Math.random (use src/sim/rng.ts)"],
  [/\bDate\.now\b|\bnew Date\b/, "reads the wall clock"],
  [/\bperformance\.now\b/, "reads the wall clock"],
  [/\b(window|document|requestAnimationFrame)\b/, "touches the browser/DOM"],
];

describe("src/sim hard rules", () => {
  const files = listFiles(SIM_DIR);

  it("has files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${relative(SIM_DIR, file)} is pure and deterministic`, () => {
      const src = stripComments(readFileSync(file, "utf8"));
      const problems = forbidden.filter(([re]) => re.test(src)).map(([, why]) => why);
      expect(problems).toEqual([]);
    });
  }
});
