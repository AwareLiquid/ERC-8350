import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const gate = path.join(scriptDirectory, "release-metadata-gate.mjs");

function runGate(arguments_, root = repositoryRoot) {
  return spawnSync(process.execPath, [gate, "--root", root, ...arguments_], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_REF: "",
      GITHUB_REF_NAME: "",
      GITHUB_REF_TYPE: "",
    },
  });
}

function outputOf(result) {
  return `${result.stdout}\n${result.stderr}`;
}

async function createWorkspace(versions) {
  const root = await mkdtemp(path.join(tmpdir(), "erc8350-release-test-"));
  await mkdir(path.join(root, "packages", "core"), { recursive: true });
  await mkdir(path.join(root, "implementations", "minimal-ts"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, "package.json"),
    `${JSON.stringify({ name: "root", version: versions.root })}\n`,
  );
  await writeFile(
    path.join(root, "packages", "core", "package.json"),
    `${JSON.stringify({ name: "core", version: versions.core })}\n`,
  );
  await writeFile(
    path.join(root, "implementations", "minimal-ts", "package.json"),
    `${JSON.stringify({ name: "minimal", version: versions.minimal })}\n`,
  );
  return root;
}

test("accepts the canonical workspace version without a tag", () => {
  const result = runGate([]);
  assert.equal(result.status, 0, outputOf(result));
  assert.match(result.stdout, /Release metadata: PASS/u);
  assert.match(result.stdout, /Tag: not supplied/u);
});

test("accepts a tag that exactly matches the package version", () => {
  const result = runGate(["--tag", "v1.0.0-alpha.1", "--require-tag"]);
  assert.equal(result.status, 0, outputOf(result));
  assert.match(result.stdout, /Tag: v1\.0\.0-alpha\.1/u);
});

test("writes reproducible release metadata", async () => {
  const outputDirectory = await mkdtemp(path.join(tmpdir(), "erc8350-release-output-"));
  const outputPath = path.join(outputDirectory, "release-metadata.json");
  try {
    const result = runGate([
      "--tag",
      "v1.0.0-alpha.1",
      "--require-tag",
      "--output",
      outputPath,
    ]);
    assert.equal(result.status, 0, outputOf(result));

    const metadata = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(metadata.schema, "erc-8350/release-metadata/v1");
    assert.equal(metadata.version, "1.0.0-alpha.1");
    assert.equal(metadata.tag, "v1.0.0-alpha.1");
    assert.equal(metadata.prerelease, true);
    assert.match(metadata.source.commit, /^[0-9a-f]{40}$/u);
    assert.match(metadata.source.tree, /^[0-9a-f]{40}$/u);
    assert.equal(metadata.packages.length, 6);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("rejects a tag that differs from the package version", () => {
  const result = runGate(["--tag", "v1.0.0-rc.1", "--require-tag"]);
  assert.notEqual(result.status, 0);
  assert.match(outputOf(result), /must equal v1\.0\.0-alpha\.1/u);
});

test("rejects a release run without a tag", () => {
  const result = runGate(["--require-tag"]);
  assert.notEqual(result.status, 0);
  assert.match(outputOf(result), /A release tag is required/u);
});

test("rejects inconsistent workspace package versions", async () => {
  const root = await createWorkspace({
    root: "1.0.0-rc.1",
    core: "1.0.0-rc.1",
    minimal: "1.0.0-alpha.1",
  });
  try {
    const result = runGate([], root);
    assert.notEqual(result.status, 0);
    assert.match(outputOf(result), /Workspace package versions differ/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a non-SemVer root version", async () => {
  const root = await createWorkspace({
    root: "release-candidate",
    core: "release-candidate",
    minimal: "release-candidate",
  });
  try {
    const result = runGate([], root);
    assert.notEqual(result.status, 0);
    assert.match(outputOf(result), /not valid SemVer/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a prerelease numeric identifier with a leading zero", async () => {
  const root = await createWorkspace({
    root: "1.0.0-rc.01",
    core: "1.0.0-rc.01",
    minimal: "1.0.0-rc.01",
  });
  try {
    const result = runGate([], root);
    assert.notEqual(result.status, 0);
    assert.match(outputOf(result), /not valid SemVer/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
