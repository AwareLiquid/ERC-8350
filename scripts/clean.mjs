#!/usr/bin/env node
// Cross-platform clean: removes build outputs without relying on Unix-only
// `rm -rf`. CONTRIBUTING.md promises the command chain runs on any supported
// platform (Node 22+, pnpm 11.7, Foundry 1.7.1); `rm -rf` broke that promise
// on Windows. This script is the portable replacement.

import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const targets = [
  "packages/core/dist",
  "packages/reference-engine/dist",
  "packages/awareness-adapter/dist",
  "packages/examples/dist",
  "implementations/minimal-independent/dist",
  "contracts/out",
  "contracts/cache",
];

let removed = 0;
for (const rel of targets) {
  const abs = path.join(root, rel);
  try {
    rmSync(abs, { recursive: true, force: true });
    removed++;
    console.log(`cleaned ${rel}`);
  } catch {
    // already absent — not an error
  }
}
console.log(`clean: ${removed} target(s) removed`);
