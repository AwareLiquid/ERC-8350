#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const defaultManifestPath = path.join(
  repositoryRoot,
  "audits",
  "g4",
  "handoff-manifest.json",
);

const expected = {
  repository: "https://github.com/AwareLiquid/ERC-8350",
  candidate: "G4-rc1",
  sourceCommit: "af5a75fb2db532fd5603554083d8895a825c2de2",
  sourceTree: "f8d66277123391ea54de3f53842256e17e2a497e",
  sourceRef: "refs/tags/audit/g4-rc1-source",
  evidenceCommit: "31f4fbb3732652884dac8f66fcc7a3655113c969",
  evidenceTree: "b9baf6f6b4337b72d79c5343f5d178a4dc80f589",
  scopePath: "audits/g4/scope.json",
  scopeDigest: "c9db7d27957c86386d8842687a2d009c0ca03bc864307e88cfed0ee25f3ae9bf",
  riskPath: "audits/g4/residual-risks.json",
  riskDigest: "307a52eb0bf512aea25565bf604d92fc6b1b2d64eb910595568a5f0c04aa6019",
};

const requiredEvidencePaths = new Set([
  "SECURITY.md",
  "docs/architecture.md",
  "docs/threat-model.md",
  "docs/deployment.md",
  "docs/security/residual-risks.md",
  "audits/g4/INTERNAL_REVIEW.md",
  "audits/g4/internal/slither-summary.json",
  "test-vectors/v1.json",
  "contracts/test/unit/AgentMemoryStateRegistry.t.sol",
  "contracts/test/unit/AuditGrant.t.sol",
  "contracts/test/unit/AuthorizationBoundary.t.sol",
  "contracts/test/unit/DeletionAttestation.t.sol",
  "contracts/test/unit/SpaceDescriptor.t.sol",
  "contracts/test/unit/GoldenVector.t.sol",
  "contracts/test/invariant/StateMachineInvariant.t.sol",
  "scripts/security-rc-gate.mjs",
  "scripts/security-rc-gate.test.mjs",
]);

const requiredCommands = {
  install: "pnpm install --frozen-lockfile",
  handoff: "pnpm security:handoff",
  scope: "pnpm security:scope",
  gateTests: "pnpm security:test",
  workspace: "pnpm check",
  cleanCheckout: "pnpm conformance:clean",
  solidity: "cd contracts && forge test -vv",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isDigest(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function isSafeRelativePath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !path.isAbsolute(value) &&
    !value.split(/[\\/]/u).includes("..") &&
    !value.includes("\0")
  );
}

function resolveInside(relativePath, label) {
  assert(isSafeRelativePath(relativePath), `${label} is not a safe relative path`);
  const resolved = path.resolve(repositoryRoot, relativePath);
  const relative = path.relative(repositoryRoot, resolved);
  assert(
    relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative),
    `${label} escapes the repository`,
  );
  return resolved;
}

function git(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: options.binary ? undefined : "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString("utf8")
      : result.stderr;
    throw new Error(`git ${args.join(" ")} failed: ${stderr.trim()}`);
  }
  return options.binary ? result.stdout : result.stdout.trim();
}

async function readJson(filePath, label) {
  let bytes;
  try {
    bytes = await readFile(filePath);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`${label} is missing: ${filePath}`);
    throw error;
  }

  try {
    return { value: JSON.parse(bytes.toString("utf8")), bytes };
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

async function verifyRegularFile(filePath, label) {
  const metadata = await lstat(filePath);
  assert(metadata.isFile(), `${label} must be a regular file`);
  const canonicalRoot = await realpath(repositoryRoot);
  const canonicalFile = await realpath(filePath);
  const relative = path.relative(canonicalRoot, canonicalFile);
  assert(
    relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative),
    `${label} resolves outside the repository`,
  );
}

async function verifyPinnedFile(entry, evidenceCommit) {
  assert(typeof entry.category === "string" && entry.category.length > 0, "Evidence category is required");
  assert(isDigest(entry.sha256), `Evidence ${entry.path} must pin a lowercase SHA-256`);
  const filePath = resolveInside(entry.path, `Evidence ${entry.path}`);
  await verifyRegularFile(filePath, `Evidence ${entry.path}`);
  const currentBytes = await readFile(filePath);
  assert(
    sha256(currentBytes) === entry.sha256,
    `Evidence ${entry.path} does not match its pinned SHA-256`,
  );
  const committedBytes = git(["show", `${evidenceCommit}:${entry.path}`], {
    binary: true,
  });
  assert(
    sha256(committedBytes) === entry.sha256,
    `Evidence ${entry.path} does not match evidence revision ${evidenceCommit}`,
  );
}

async function verifyAnchor(anchor, expectedPath, expectedDigest, evidenceCommit, label) {
  assert(anchor?.path === expectedPath, `${label} path changed`);
  assert(anchor?.sha256 === expectedDigest, `${label} digest changed`);
  const filePath = resolveInside(anchor.path, label);
  await verifyRegularFile(filePath, label);
  const currentBytes = await readFile(filePath);
  assert(sha256(currentBytes) === anchor.sha256, `${label} current bytes changed`);
  const committedBytes = git(["show", `${evidenceCommit}:${anchor.path}`], {
    binary: true,
  });
  assert(sha256(committedBytes) === anchor.sha256, `${label} evidence bytes changed`);
  return JSON.parse(currentBytes.toString("utf8"));
}

async function main() {
  const arguments_ = process.argv.slice(2);
  let manifestPath = defaultManifestPath;
  if (arguments_.length > 0) {
    assert(
      arguments_.length === 2 && arguments_[0] === "--manifest",
      "Usage: security-audit-handoff.mjs [--manifest <path>]",
    );
    manifestPath = path.resolve(repositoryRoot, arguments_[1]);
  }

  const record = await readJson(manifestPath, "G4 audit handoff manifest");
  const manifest = record.value;
  assert(
    manifest.schema === "erc-8350/external-audit-handoff/v1",
    `Unsupported handoff schema: ${manifest.schema}`,
  );
  assert(manifest.candidate === expected.candidate, "Handoff candidate changed");
  assert(manifest.repository === expected.repository, "Handoff repository changed");

  assert(manifest.source?.commit === expected.sourceCommit, "Frozen source commit changed");
  assert(manifest.source?.tree === expected.sourceTree, "Frozen source tree changed");
  assert(manifest.source?.ref === expected.sourceRef, "Frozen source ref changed");
  assert(
    git(["rev-parse", `${manifest.source.ref}^{commit}`]) === manifest.source.commit,
    "Frozen source tag does not resolve to the frozen commit",
  );
  assert(
    git(["rev-parse", `${manifest.source.commit}^{tree}`]) === manifest.source.tree,
    "Frozen source commit does not resolve to the frozen tree",
  );

  const evidenceRevision = manifest.evidenceRevision ?? {};
  assert(evidenceRevision.commit === expected.evidenceCommit, "Evidence revision changed");
  assert(evidenceRevision.tree === expected.evidenceTree, "Evidence tree changed");
  assert(
    evidenceRevision.relationship === "descendant-with-no-in-scope-source-changes",
    "Evidence/source relationship changed",
  );
  assert(
    git(["rev-parse", `${evidenceRevision.commit}^{tree}`]) === evidenceRevision.tree,
    "Evidence revision does not resolve to the pinned tree",
  );
  assert(
    git(["merge-base", manifest.source.commit, evidenceRevision.commit]) ===
      manifest.source.commit,
    "Evidence revision is not a descendant of the frozen source",
  );

  const scope = await verifyAnchor(
    manifest.source.scopeManifest,
    expected.scopePath,
    expected.scopeDigest,
    evidenceRevision.commit,
    "Scope manifest",
  );
  await verifyAnchor(
    manifest.source.residualRiskRegister,
    expected.riskPath,
    expected.riskDigest,
    evidenceRevision.commit,
    "Residual-risk register",
  );

  assert(Array.isArray(scope.inScope), "Scope manifest inScope must be an array");
  const scopedPaths = scope.inScope.map((entry) => entry.path);
  const changedScopedFiles = git([
    "diff",
    "--name-only",
    `${manifest.source.commit}..${evidenceRevision.commit}`,
    "--",
    ...scopedPaths,
  ]);
  assert(
    changedScopedFiles.length === 0,
    `Evidence revision changes frozen source files: ${changedScopedFiles}`,
  );

  assert(Array.isArray(manifest.evidence), "Handoff evidence must be an array");
  const observedPaths = new Set();
  for (const entry of manifest.evidence) {
    assert(isSafeRelativePath(entry?.path), "Handoff evidence contains an unsafe path");
    assert(!observedPaths.has(entry.path), `Duplicate evidence path: ${entry.path}`);
    observedPaths.add(entry.path);
    await verifyPinnedFile(entry, evidenceRevision.commit);
  }
  const missingPaths = [...requiredEvidencePaths].filter((item) => !observedPaths.has(item));
  const extraPaths = [...observedPaths].filter((item) => !requiredEvidencePaths.has(item));
  assert(
    missingPaths.length === 0 && extraPaths.length === 0,
    `Handoff evidence changed; missing=[${missingPaths.join(", ")}] extra=[${extraPaths.join(", ")}]`,
  );

  for (const [name, command] of Object.entries(requiredCommands)) {
    assert(manifest.reproduction?.[name] === command, `Reproduction command ${name} changed`);
  }
  assert(
    manifest.deployment?.correctedCandidateDeployed === false,
    "Handoff must not claim a corrected G4 deployment before external review",
  );
  assert(
    manifest.deployment?.legacySepolia?.auditGrantDeprecated === true,
    "Legacy Sepolia AuditGrant must remain explicitly deprecated",
  );
  assert(
    manifest.externalReview?.requiredEvidencePath ===
      "audits/g4/external/external-review.json",
    "External-review evidence path changed",
  );

  console.log(`G4 audit handoff: PASS (${manifest.evidence.length} pinned evidence files)`);
  console.log(`Frozen source: ${manifest.source.commit}`);
  console.log(`Scope SHA-256: ${manifest.source.scopeManifest.sha256}`);
  console.log(`Risk-register SHA-256: ${manifest.source.residualRiskRegister.sha256}`);
  console.log(`Evidence revision: ${evidenceRevision.commit}`);
  console.log(`Handoff manifest SHA-256: ${sha256(record.bytes)}`);
  console.log("Corrected G4 deployment: NONE (legacy AuditGrant remains deprecated)");
}

main().catch((error) => {
  console.error(`G4 audit handoff: FAIL\n${error.message}`);
  process.exitCode = 1;
});

