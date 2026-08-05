#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const forge = process.platform === "win32" ? "forge.exe" : "forge";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    // Windows: pnpm.cmd is a batch script and requires cmd.exe; forge.exe /
    // git.exe are real executables and must stay shell-free (cmd would mangle
    // arguments like HEAD^{tree}).
    shell: process.platform === "win32" && command === "pnpm.cmd",
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: options.stdio ?? "pipe",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (options.stdio !== "inherit") {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status ?? 1}`);
  }
  return (result.stdout ?? "").trim();
}

const status = run("git", ["status", "--porcelain"]);
if (status.length > 0) {
  console.error(status);
  throw new Error("commit or stash tracked changes before running the clean-checkout gate");
}

const commit = run("git", ["rev-parse", "HEAD"]);
const tempRoot = mkdtempSync(join(tmpdir(), "erc-8350-conformance-"));
const checkout = join(tempRoot, "checkout");
const reportDir = resolve(
  process.env.CONFORMANCE_REPORT_DIR ??
    join(root, "artifacts", "conformance", commit.slice(0, 12)),
);
mkdirSync(reportDir, { recursive: true });

let worktreeAdded = false;
try {
  run("git", ["worktree", "add", "--detach", checkout, commit], { stdio: "inherit" });
  worktreeAdded = true;
  run(pnpm, ["install", "--frozen-lockfile"], { cwd: checkout, stdio: "inherit" });
  run(
    forge,
    ["install", "foundry-rs/forge-std@v1.16.2", "--no-git"],
    { cwd: join(checkout, "contracts"), stdio: "inherit" },
  );
  run(pnpm, ["conformance:gate"], {
    cwd: checkout,
    stdio: "inherit",
    env: {
      CONFORMANCE_CLEAN_CHECKOUT: "1",
      CONFORMANCE_REPORT_DIR: reportDir,
    },
  });
  console.log(`Clean-checkout conformance passed for ${commit}`);
  console.log(`Reports: ${reportDir}`);
} finally {
  if (worktreeAdded) {
    try {
      run("git", ["worktree", "remove", "--force", checkout], { stdio: "inherit" });
    } catch (error) {
      console.error(`Unable to remove temporary worktree: ${error.message}`);
    }
  }
  rmSync(tempRoot, { recursive: true, force: true });
}
