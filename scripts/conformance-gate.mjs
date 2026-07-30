#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contractsRoot = join(root, "contracts");
const vectorPath = join(root, "test-vectors", "v1.json");
const reportDir = resolve(
  process.env.CONFORMANCE_REPORT_DIR ?? join(root, "artifacts", "conformance"),
);
const logsDir = join(reportDir, "logs");
const requireCleanCheckout = process.env.CONFORMANCE_CLEAN_CHECKOUT === "1";
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const forge = process.platform === "win32" ? "forge.exe" : "forge";

mkdirSync(logsDir, { recursive: true });

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
    maxBuffer: 32 * 1024 * 1024,
  });
}

function outputOf(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function textCommand(command, args) {
  return [command, ...args]
    .map((part) => (/^[A-Za-z0-9_./:@=-]+$/.test(part) ? part : JSON.stringify(part)))
    .join(" ");
}

function git(args) {
  const result = run("git", args);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${outputOf(result)}`);
  }
  return result.stdout.trim();
}

function version(command, args) {
  const result = run(command, args);
  return result.status === 0 ? outputOf(result).trim().split("\n")[0] : "unavailable";
}

const sourceStatus = git(["status", "--porcelain"]);
const sourceClean = sourceStatus.length === 0;
const sourceCommit = git(["rev-parse", "HEAD"]);
const sourceTree = git(["rev-parse", "HEAD^{tree}"]);
const sourceBranch = git(["branch", "--show-current"]) || "(detached)";
const vectorBytes = readFileSync(vectorPath);
const vector = JSON.parse(vectorBytes.toString("utf8"));
const vectorSha256 = createHash("sha256").update(vectorBytes).digest("hex");

const matchedFields = [
  "deltaCommitment",
  "provenanceCommitment",
  "locatorCommitment",
  "experienceDeltaTypehash",
  "memoryStateTypehash",
  "memorySpaceTypehash",
  "transitionId",
  "nextStateRoot",
  "spaceId",
  "registrationId",
  "authorizationId",
  "domainSeparator",
  "signingDigest",
];

const definitions = [
  {
    id: "workspace",
    implementation: "clean pnpm/Foundry workspace",
    category: "clean-checkout",
    command: pnpm,
    args: ["check"],
    cwd: root,
    matchedFields: [],
  },
  {
    id: "core-ts",
    implementation: "@erc-awar/core",
    category: "golden-vector",
    command: pnpm,
    args: ["--filter", "@erc-awar/core", "test:golden"],
    cwd: root,
    matchedFields,
  },
  {
    id: "minimal-ts",
    implementation: "@erc-awar/minimal-independent",
    category: "golden-vector",
    command: pnpm,
    args: ["--filter", "@erc-awar/minimal-independent", "test:golden"],
    cwd: root,
    matchedFields,
  },
  {
    id: "solidity",
    implementation: "AgentMemoryStateRegistry.sol",
    category: "golden-vector",
    command: forge,
    args: ["test", "--match-path", "test/unit/GoldenVector.t.sol", "-vv"],
    cwd: contractsRoot,
    matchedFields,
  },
];

const results = [];
for (const definition of definitions) {
  const started = Date.now();
  const result = run(definition.command, definition.args, { cwd: definition.cwd });
  const durationMs = Date.now() - started;
  const output = outputOf(result);
  const logPath = join(logsDir, `${definition.id}.txt`);
  writeFileSync(logPath, output);
  process.stdout.write(`\n== ${definition.id}: ${result.status === 0 ? "PASS" : "FAIL"} ==\n`);
  process.stdout.write(output);
  if (output.length > 0 && !output.endsWith("\n")) process.stdout.write("\n");

  results.push({
    id: definition.id,
    implementation: definition.implementation,
    category: definition.category,
    command: textCommand(definition.command, definition.args),
    workingDirectory: relative(root, definition.cwd) || ".",
    status: result.status === 0 ? "pass" : "fail",
    exitCode: result.status ?? 1,
    durationMs,
    matchedFields: result.status === 0 ? definition.matchedFields : [],
    log: relative(reportDir, logPath),
    logSha256: createHash("sha256").update(output).digest("hex"),
  });
}

const cleanCheckoutSatisfied = !requireCleanCheckout || sourceClean;
const passed = cleanCheckoutSatisfied && results.every((result) => result.status === "pass");
const report = {
  schema: "erc-8350/conformance-result/v1",
  result: passed ? "pass" : "fail",
  recordedAt: new Date().toISOString(),
  source: {
    repository: "https://github.com/AwareLiquid/ERC-8350",
    commit: sourceCommit,
    tree: sourceTree,
    branch: sourceBranch,
    cleanCheckoutRequired: requireCleanCheckout,
    cleanCheckoutObserved: sourceClean,
  },
  environment: {
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    pnpm: version(pnpm, ["--version"]),
    forge: version(forge, ["--version"]),
    solidity: "0.8.24 (contracts/foundry.toml)",
  },
  vector: {
    path: "test-vectors/v1.json",
    schema: vector.schema,
    bytes: vectorBytes.length,
    sha256: vectorSha256,
    expected: {
      ...vector.expected,
      deltaCommitment: vector.delta.deltaCommitment,
      provenanceCommitment: vector.delta.provenanceCommitment,
      locatorCommitment: vector.delta.locatorCommitment,
      spaceId: vector.delta.spaceId,
      registrationId: vector.spaceAuthorization.registrationId,
      authorizationId: vector.spaceAuthorization.authorizationId,
      domainSeparator: vector.eip712.domainSeparator,
      signingDigest: vector.eip712.signingDigest,
    },
  },
  suites: results,
};

function markdownFor(value) {
  const lines = [
    "# ERC-8350 v1 Conformance Result",
    "",
    `- Result: **${value.result.toUpperCase()}**`,
    `- Recorded: \`${value.recordedAt}\``,
    `- Source commit: \`${value.source.commit}\``,
    `- Source tree: \`${value.source.tree}\``,
    `- Clean checkout observed: **${value.source.cleanCheckoutObserved ? "yes" : "no"}**`,
    `- Vector SHA-256: \`${value.vector.sha256}\``,
    `- Vector bytes: \`${value.vector.bytes}\``,
    `- Tools: Node \`${value.environment.node}\`, pnpm \`${value.environment.pnpm}\`, Forge \`${value.environment.forge}\``,
    "",
    "| Suite | Implementation | Result | Command |",
    "|---|---|---:|---|",
    ...value.suites.map(
      (suite) =>
        `| \`${suite.id}\` | ${suite.implementation} | **${suite.status.toUpperCase()}** | \`${suite.command}\` |`,
    ),
    "",
    "## Canonical Outputs",
    "",
    "| Field | Value |",
    "|---|---|",
    ...Object.entries(value.vector.expected).map(
      ([field, expected]) => `| \`${field}\` | \`${expected}\` |`,
    ),
    "",
    "## Reproduce",
    "",
    "```bash",
    "pnpm conformance:clean",
    "```",
    "",
  ];
  return lines.join("\n");
}

const jsonPath = join(reportDir, "conformance-v1.json");
const markdownPath = join(reportDir, "conformance-v1.md");
const markdown = markdownFor(report);
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(markdownPath, markdown);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
}

console.log(`\nConformance report: ${relative(root, jsonPath)}`);
console.log(`Conformance summary: ${relative(root, markdownPath)}`);
if (!cleanCheckoutSatisfied) {
  console.error("Conformance failed: a clean checkout was required but tracked changes exist.");
}
process.exit(passed ? 0 : 1);
