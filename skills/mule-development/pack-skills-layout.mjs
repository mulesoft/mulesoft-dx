#!/usr/bin/env node
// Builds the nested `skills/<skill>/` copy that ships alongside the flat `<skill>/` layout in the npm tarball.
// Vibes 1.0 reads the flat package root; the AFV skills updater in Vibes 2.0 requires `<pkg>/skills/`.
// Usage: `node pack-skills-layout.mjs build` (npm `prepack`) | `node pack-skills-layout.mjs clean` (npm `postpack`).

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = dirname(fileURLToPath(import.meta.url));
const NESTED_DIR = join(PACKAGE_ROOT, "skills");
const EXCLUDED_DIRS = new Set(["tmp", "node_modules"]);

function clean() {
  rmSync(NESTED_DIR, { recursive: true, force: true });
}

function build() {
  clean();
  const skills = readdirSync(PACKAGE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "skills" && !EXCLUDED_DIRS.has(entry.name))
    .filter((entry) => existsSync(join(PACKAGE_ROOT, entry.name, "SKILL.md")))
    .map((entry) => entry.name);

  if (skills.length === 0) {
    throw new Error(`No <skill>/SKILL.md directories found in ${PACKAGE_ROOT}`);
  }

  mkdirSync(NESTED_DIR);
  for (const skill of skills) {
    cpSync(join(PACKAGE_ROOT, skill), join(NESTED_DIR, skill), {
      recursive: true,
      // Runtime scratch dirs are gitignored and must not leak into the tarball.
      filter: (src) => !relative(PACKAGE_ROOT, src).split(sep).some((part) => EXCLUDED_DIRS.has(part)),
    });
  }
  console.log(`pack-skills-layout: copied ${skills.length} skill(s) into skills/`);
}

const command = process.argv[2];
if (command === "build") {
  build();
} else if (command === "clean") {
  clean();
} else {
  console.error("Usage: node pack-skills-layout.mjs <build|clean>");
  process.exit(1);
}
