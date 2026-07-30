import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const runner = path.join(scriptDirectory, "external-reproduction-gate.mjs");
const canonicalManifest = JSON.parse(
  await readFile(
    path.join(
      repositoryRoot,
      "evidence",
      "external-reproductions",
      "v1.json",
    ),
    "utf8",
  ),
);

async function expectRejectedManifest(name, mutate, expectedMessage) {
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "erc8350-evidence-manifest-test-"),
  );
  const manifestPath = path.join(temporaryRoot, `${name}.json`);
  const manifest = structuredClone(canonicalManifest);
  mutate(manifest);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  try {
    const result = spawnSync(
      process.execPath,
      [runner, "--validate-only", "--manifest", manifestPath],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
      },
    );
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, expectedMessage);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

test("accepts the canonical external reproduction manifest", () => {
  const result = spawnSync(
    process.execPath,
    [runner, "--validate-only"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Validated 2 external reproduction suites/u);
});

test("rejects a path-traversing suite id", async () => {
  await expectRejectedManifest(
    "suite-path-traversal",
    (manifest) => {
      manifest.suites[0].id = "../outside";
    },
    /Invalid suite id/u,
  );
});

test("rejects weakened independence criteria", async () => {
  await expectRejectedManifest(
    "weakened-criteria",
    (manifest) => {
      manifest.criteria.minimumIndependentRepositoryOwners = 1;
    },
    /at least two independent repository owners/u,
  );
});

test("rejects repository URLs with embedded credentials", async () => {
  await expectRejectedManifest(
    "repository-credentials",
    (manifest) => {
      manifest.suites[0].repository =
        "https://token@github.com/ERC8312/bounded-agent-actions.git";
    },
    /Invalid GitHub repository URL/u,
  );
});

test("rejects source files that escape the checkout", async () => {
  await expectRejectedManifest(
    "source-path-traversal",
    (manifest) => {
      manifest.suites[1].files[0].path = "../README.md";
    },
    /unsafe source-file path/u,
  );
});

test("rejects dependencies without artifact hashes", async () => {
  await expectRejectedManifest(
    "missing-dependency-hash",
    (manifest) => {
      manifest.suites[0].pythonPackageHashes["pycryptodome==3.23.0"] = [];
    },
    /must pin SHA-256 artifacts/u,
  );
});

test("rejects unsupported external suite kinds", async () => {
  await expectRejectedManifest(
    "unsupported-kind",
    (manifest) => {
      manifest.suites[0].kind = "shell-command";
    },
    /unsupported suite kind/u,
  );
});

test("rejects default RPC endpoints on the same host", async () => {
  await expectRejectedManifest(
    "same-rpc-host",
    (manifest) => {
      manifest.defaults.crossCheckRpc = manifest.defaults.primaryRpc;
    },
    /Default RPC endpoints must use distinct hosts/u,
  );
});
