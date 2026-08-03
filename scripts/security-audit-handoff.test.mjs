import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const scriptPath = path.join(scriptDirectory, "security-audit-handoff.mjs");
const manifestPath = path.join(
  repositoryRoot,
  "audits",
  "g4",
  "handoff-manifest.json",
);

async function canonicalManifest() {
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

function runGate(customManifestPath) {
  const arguments_ = customManifestPath
    ? [scriptPath, "--manifest", customManifestPath]
    : [scriptPath];
  return spawnSync(process.execPath, arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

async function withManifest(mutator, assertion) {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "erc-8350-audit-handoff-"),
  );
  try {
    const manifest = await canonicalManifest();
    mutator(manifest);
    const temporaryManifest = path.join(temporaryDirectory, "handoff.json");
    await writeFile(temporaryManifest, `${JSON.stringify(manifest, null, 2)}\n`);
    assertion(runGate(temporaryManifest));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

test("accepts the canonical external-audit handoff", () => {
  const result = runGate();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /G4 audit handoff: PASS/u);
});

test("rejects a changed frozen source commit", async () => {
  await withManifest(
    (manifest) => {
      manifest.source.commit = "0".repeat(40);
    },
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Frozen source commit changed/u);
    },
  );
});

test("rejects a missing evidence file", async () => {
  await withManifest(
    (manifest) => {
      manifest.evidence = manifest.evidence.filter(
        (entry) => entry.path !== "docs/threat-model.md",
      );
    },
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /missing=\[docs\/threat-model\.md\]/u);
    },
  );
});

test("rejects treating the legacy AuditGrant as active", async () => {
  await withManifest(
    (manifest) => {
      manifest.deployment.legacySepolia.auditGrantDeprecated = false;
    },
    (result) => {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /must remain explicitly deprecated/u);
    },
  );
});

