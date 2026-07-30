#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const defaultScopePath = path.join(repositoryRoot, "audits", "g4", "scope.json");
const defaultRiskPath = path.join(
  repositoryRoot,
  "audits",
  "g4",
  "residual-risks.json",
);
const defaultReviewPath = path.join(
  repositoryRoot,
  "audits",
  "g4",
  "external",
  "external-review.json",
);

const projectRepository = "https://github.com/AwareLiquid/ERC-8350";
const projectOwners = new Set(["awareliquid", "xiaohai67890", "everest-an"]);
const requiredScopePaths = new Set([
  "contracts/src/ECDSA.sol",
  "contracts/src/interfaces/IAgentMemoryState.sol",
  "contracts/src/interfaces/IERC1271.sol",
  "contracts/src/reference/AgentMemoryStateRegistry.sol",
  "contracts/src/reference/PrivateCommitment.sol",
  "contracts/src/extensions/AuditGrant.sol",
  "contracts/src/extensions/DeletionAttestation.sol",
  "contracts/src/extensions/SpaceDescriptor.sol",
  "contracts/script/Deploy.s.sol",
  "contracts/foundry.toml",
]);
const requiredEvidencePaths = new Set([
  "test-vectors/v1.json",
  "contracts/test/unit/AuditGrant.t.sol",
  "contracts/test/unit/AgentMemoryStateRegistry.t.sol",
  "contracts/test/invariant/StateMachineInvariant.t.sol",
]);
const requiredCriteria = [
  "independentReviewerRequired",
  "externalRepositoryRequired",
  "exactSourceCommitRequired",
  "sourceHashesRequired",
  "publicReportRequired",
  "reportDigestRequired",
  "noUnresolvedCriticalOrHigh",
  "allOtherFindingsDispositioned",
  "residualRiskMappingRequired",
];
const severities = ["critical", "high", "medium", "low", "informational"];
const attestationStatement =
  "I independently reviewed the exact G4 scope and the identified report is my work.";

function parseArgs(argv) {
  const result = {
    scopeOnly: false,
    scope: defaultScopePath,
    risks: defaultRiskPath,
    review: defaultReviewPath,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--scope-only") {
      result.scopeOnly = true;
      continue;
    }
    if (["--scope", "--risks", "--review"].includes(argument)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a path`);
      result[argument.slice(2)] = path.resolve(repositoryRoot, value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isFullSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
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

function resolveInside(base, relativePath, label) {
  assert(isSafeRelativePath(relativePath), `${label} is not a safe relative path`);
  const resolved = path.resolve(base, relativePath);
  const relative = path.relative(base, resolved);
  assert(
    relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative),
    `${label} escapes its allowed directory`,
  );
  return resolved;
}

function assertNonEmptyString(value, label) {
  assert(typeof value === "string" && value.trim().length > 0, `${label} is required`);
}

function parseHttpsUrl(value, label) {
  assertNonEmptyString(value, label);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL`);
  }
  assert(
    parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.hash,
    `${label} must be an HTTPS URL without credentials or a fragment`,
  );
  return parsed;
}

function parseGitHubRepository(value, label) {
  const parsed = parseHttpsUrl(value, label);
  const parts = parsed.pathname
    .replace(/\/+$/u, "")
    .replace(/\.git$/u, "")
    .split("/")
    .filter(Boolean);
  assert(
    parsed.hostname === "github.com" &&
      parsed.port === "" &&
      parsed.search === "" &&
      parts.length === 2 &&
      /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u.test(parts[0]) &&
      /^[A-Za-z0-9._-]+$/u.test(parts[1]),
    `${label} must identify one public GitHub repository`,
  );
  return { owner: parts[0], repository: parts[1] };
}

function assertIsoTimestamp(value, label) {
  assertNonEmptyString(value, label);
  const timestamp = Date.parse(value);
  assert(Number.isFinite(timestamp), `${label} must be an ISO-8601 timestamp`);
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
    if (error.code === "ENOENT") {
      throw new Error(`${label} is missing: ${filePath}`);
    }
    throw error;
  }

  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
  return { value, bytes, digest: sha256(bytes) };
}

function assertExactPathSet(entries, expected, label) {
  assert(Array.isArray(entries), `${label} must be an array`);
  const observed = new Set();
  for (const entry of entries) {
    assertNonEmptyString(entry?.path, `${label} path`);
    assert(!observed.has(entry.path), `${label} contains duplicate path ${entry.path}`);
    observed.add(entry.path);
  }
  const missing = [...expected].filter((item) => !observed.has(item));
  const extra = [...observed].filter((item) => !expected.has(item));
  assert(
    missing.length === 0 && extra.length === 0,
    `${label} changed; missing=[${missing.join(", ")}] extra=[${extra.join(", ")}]`,
  );
}

async function verifyRegularFile(filePath, allowedBase, label) {
  const metadata = await lstat(filePath);
  assert(metadata.isFile(), `${label} must be a regular file`);
  const canonicalBase = await realpath(allowedBase);
  const canonicalFile = await realpath(filePath);
  const relative = path.relative(canonicalBase, canonicalFile);
  assert(
    relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative),
    `${label} resolves outside its allowed directory`,
  );
}

async function validatePinnedEntry(entry, sourceCommit, label) {
  assert(isSafeRelativePath(entry.path), `${label} has an unsafe path`);
  assert(isDigest(entry.sha256), `${label} ${entry.path} must pin a lowercase SHA-256`);
  const currentPath = resolveInside(repositoryRoot, entry.path, `${label} ${entry.path}`);
  await verifyRegularFile(currentPath, repositoryRoot, `${label} ${entry.path}`);
  const currentBytes = await readFile(currentPath);
  assert(
    sha256(currentBytes) === entry.sha256,
    `${label} ${entry.path} does not match its pinned SHA-256`,
  );
  const committedBytes = git(["show", `${sourceCommit}:${entry.path}`], { binary: true });
  assert(
    sha256(committedBytes) === entry.sha256,
    `${label} ${entry.path} does not match source commit ${sourceCommit}`,
  );
}

async function validateScope(scopePath) {
  const record = await readJson(scopePath, "G4 scope manifest");
  const scope = record.value;
  assert(
    scope.schema === "erc-8350/security-review-scope/v1",
    `Unsupported G4 scope schema: ${scope.schema}`,
  );
  assert(scope.candidate === "G4-rc1", `Unexpected candidate: ${scope.candidate}`);
  assert(scope.repository === projectRepository, "G4 scope repository changed");
  assert(isFullSha(scope.source?.commit), "G4 source commit must be a full SHA");
  assert(isFullSha(scope.source?.tree), "G4 source tree must be a full SHA");
  assert(
    scope.source?.ref === "refs/tags/audit/g4-rc1-source",
    "G4 source ref must be refs/tags/audit/g4-rc1-source",
  );

  const taggedCommit = git(["rev-parse", `${scope.source.ref}^{commit}`]);
  assert(taggedCommit === scope.source.commit, "G4 source tag does not resolve to source commit");
  const commitTree = git(["rev-parse", `${scope.source.commit}^{tree}`]);
  assert(commitTree === scope.source.tree, "G4 source tree does not match source commit");

  for (const criterion of requiredCriteria) {
    assert(
      scope.acceptanceCriteria?.[criterion] === true,
      `G4 acceptance criterion ${criterion} must remain true`,
    );
  }

  assertExactPathSet(scope.inScope, requiredScopePaths, "G4 in-scope files");
  assertExactPathSet(
    scope.supportingEvidence,
    requiredEvidencePaths,
    "G4 supporting evidence",
  );
  for (const entry of [...scope.inScope, ...scope.supportingEvidence]) {
    await validatePinnedEntry(entry, scope.source.commit, "G4 pinned file");
  }

  assert(Array.isArray(scope.excluded), "G4 exclusions must be an array");
  const market = scope.excluded.find(
    (entry) => entry.path === "contracts/src/experimental/MemoryMarket.sol",
  );
  assert(market, "G4 must explicitly exclude experimental MemoryMarket.sol");
  assertNonEmptyString(market.reason, "MemoryMarket exclusion reason");

  assert(scope.toolchain?.solidity === "0.8.24", "G4 Solidity version changed");
  assert(scope.toolchain?.optimizer === true, "G4 optimizer must remain enabled");
  assert(scope.toolchain?.optimizerRuns === 200, "G4 optimizer runs changed");
  assert(scope.toolchain?.evmVersion === "cancun", "G4 EVM version changed");

  return { scope, digest: record.digest };
}

function assertStringArray(value, label) {
  assert(
    Array.isArray(value) &&
      value.length > 0 &&
      value.every((item) => typeof item === "string" && item.trim().length > 0),
    `${label} must be a non-empty string array`,
  );
}

async function validateRisks(riskPath) {
  const record = await readJson(riskPath, "G4 residual-risk register");
  const register = record.value;
  assert(
    register.schema === "erc-8350/residual-risk-register/v1",
    `Unsupported residual-risk schema: ${register.schema}`,
  );
  assert(register.candidate === "G4-rc1", "Residual-risk candidate changed");
  assert(
    register.policy?.unresolvedCriticalOrHighAllowed === false,
    "Residual-risk policy must reject unresolved Critical/High risks",
  );
  assert(
    register.policy?.reviewRequiredAfterSourceChange === true,
    "Residual-risk policy must require review after source changes",
  );
  assert(Array.isArray(register.risks) && register.risks.length > 0, "Risks are required");

  const allIds = new Set();
  const acceptedIds = new Set();
  for (const risk of register.risks) {
    assert(/^G4-R-\d{3}$/u.test(risk.id ?? ""), `Invalid residual-risk ID: ${risk.id}`);
    assert(!allIds.has(risk.id), `Duplicate residual-risk ID: ${risk.id}`);
    allIds.add(risk.id);
    assertNonEmptyString(risk.title, `${risk.id} title`);
    assert(severities.includes(risk.severity), `${risk.id} has invalid severity`);
    assert(
      ["low", "medium", "high"].includes(risk.likelihood),
      `${risk.id} has invalid likelihood`,
    );
    assert(
      ["accepted", "mitigated"].includes(risk.status),
      `${risk.id} has invalid status`,
    );
    assertNonEmptyString(risk.description, `${risk.id} description`);
    assertStringArray(risk.affectedComponents, `${risk.id} affectedComponents`);
    assertStringArray(risk.existingControls, `${risk.id} existingControls`);
    assertStringArray(risk.deploymentRequirements, `${risk.id} deploymentRequirements`);
    assertNonEmptyString(risk.owner, `${risk.id} owner`);
    assertNonEmptyString(risk.reviewTrigger, `${risk.id} reviewTrigger`);
    if (risk.status === "accepted") {
      assert(
        !["critical", "high"].includes(risk.severity),
        `${risk.id} leaves an unresolved ${risk.severity} risk`,
      );
      acceptedIds.add(risk.id);
    }
  }

  return { register, digest: record.digest, allIds, acceptedIds };
}

function compareCounts(actual, expected) {
  for (const severity of severities) {
    assert(
      expected?.[severity] === actual[severity],
      `External-review unresolved ${severity} count must be ${actual[severity]}`,
    );
  }
}

async function validateExternalReview(reviewPath, scopeRecord, riskRecord) {
  const record = await readJson(reviewPath, "G4 external-review evidence");
  const review = record.value;
  assert(
    review.schema === "erc-8350/external-solidity-review/v1",
    `Unsupported external-review schema: ${review.schema}`,
  );
  assert(review.candidate === scopeRecord.scope.candidate, "Review candidate mismatch");

  const reviewer = review.reviewer ?? {};
  assertNonEmptyString(reviewer.name, "Reviewer name");
  assertNonEmptyString(reviewer.organization, "Reviewer organization");
  assert(
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u.test(reviewer.githubOwner ?? ""),
    "Reviewer GitHub owner is invalid",
  );
  assert(reviewer.independentFromProject === true, "Reviewer must attest independence");
  assertNonEmptyString(reviewer.conflictDisclosure, "Reviewer conflict disclosure");
  assert(
    !projectOwners.has(reviewer.githubOwner.toLowerCase()),
    "Project owners cannot satisfy the independent external-review gate",
  );
  const evidenceRepository = parseGitHubRepository(
    reviewer.evidenceRepository,
    "Reviewer evidenceRepository",
  );
  assert(
    evidenceRepository.owner.toLowerCase() === reviewer.githubOwner.toLowerCase(),
    "Reviewer evidence repository must be controlled by reviewer.githubOwner",
  );

  const reviewedScope = review.scope ?? {};
  assert(reviewedScope.repository === projectRepository, "Reviewed repository mismatch");
  assert(
    reviewedScope.commit === scopeRecord.scope.source.commit,
    "Reviewed commit does not match the frozen G4 commit",
  );
  assert(
    reviewedScope.tree === scopeRecord.scope.source.tree,
    "Reviewed tree does not match the frozen G4 tree",
  );
  assert(
    reviewedScope.manifestPath === "audits/g4/scope.json",
    "Review must identify the canonical scope manifest",
  );
  assert(
    reviewedScope.manifestSha256 === scopeRecord.digest,
    "Review scope-manifest SHA-256 mismatch",
  );
  assert(
    reviewedScope.riskRegisterPath === "audits/g4/residual-risks.json",
    "Review must identify the canonical residual-risk register",
  );
  assert(
    reviewedScope.riskRegisterSha256 === riskRecord.digest,
    "Review residual-risk SHA-256 mismatch",
  );

  const report = review.report ?? {};
  const reportUrl = parseHttpsUrl(report.url, "External report URL");
  assert(reportUrl.hostname.length > 0, "External report URL must have a host");
  assert(isDigest(report.sha256), "External report must pin a lowercase SHA-256");
  assertIsoTimestamp(report.publishedAt, "External report publishedAt");
  const reviewDirectory = path.dirname(reviewPath);
  const reportPath = resolveInside(reviewDirectory, report.path, "External report path");
  await verifyRegularFile(reportPath, reviewDirectory, "External report");
  const reportBytes = await readFile(reportPath);
  assert(sha256(reportBytes) === report.sha256, "External report SHA-256 mismatch");

  assert(review.methodology?.manualReview === true, "External manual review is required");
  assertStringArray(review.methodology?.tools, "External-review tools");
  assertStringArray(review.methodology?.testCommands, "External-review testCommands");

  assert(review.conclusion?.status === "pass", "External-review conclusion must pass");
  assert(
    review.conclusion?.noUnresolvedCriticalOrHigh === true,
    "External review must attest no unresolved Critical/High findings",
  );
  assert(Array.isArray(review.findings), "External-review findings must be an array");

  const findingIds = new Set();
  const unresolved = Object.fromEntries(severities.map((severity) => [severity, 0]));
  for (const finding of review.findings) {
    assert(
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(finding.id ?? ""),
      `Invalid external finding ID: ${finding.id}`,
    );
    assert(!findingIds.has(finding.id), `Duplicate external finding ID: ${finding.id}`);
    findingIds.add(finding.id);
    assertNonEmptyString(finding.title, `${finding.id} title`);
    assert(severities.includes(finding.severity), `${finding.id} has invalid severity`);
    assert(
      ["fixed", "accepted", "false-positive"].includes(finding.status),
      `${finding.id} has invalid disposition`,
    );
    assertNonEmptyString(finding.description, `${finding.id} description`);
    if (finding.status === "fixed") {
      assertNonEmptyString(finding.verification, `${finding.id} verification`);
    }
    if (finding.status === "false-positive") {
      assertNonEmptyString(finding.rationale, `${finding.id} rationale`);
    }
    if (finding.status === "accepted") {
      assert(
        !["critical", "high"].includes(finding.severity),
        `${finding.id} leaves an unresolved ${finding.severity} finding`,
      );
      assert(
        riskRecord.acceptedIds.has(finding.residualRiskId),
        `${finding.id} must map to an accepted residual risk`,
      );
      unresolved[finding.severity] += 1;
    }
  }
  compareCounts(unresolved, review.conclusion.unresolved);

  assert(
    Array.isArray(review.reviewedResidualRiskIds),
    "reviewedResidualRiskIds must be an array",
  );
  const reviewedRiskIds = new Set(review.reviewedResidualRiskIds);
  assert(
    reviewedRiskIds.size === review.reviewedResidualRiskIds.length,
    "reviewedResidualRiskIds contains duplicates",
  );
  const missingRisks = [...riskRecord.acceptedIds].filter(
    (riskId) => !reviewedRiskIds.has(riskId),
  );
  const unknownRisks = [...reviewedRiskIds].filter(
    (riskId) => !riskRecord.acceptedIds.has(riskId),
  );
  assert(
    missingRisks.length === 0 && unknownRisks.length === 0,
    `External reviewer did not assess the exact accepted-risk set; missing=[${missingRisks.join(", ")}] unknown=[${unknownRisks.join(", ")}]`,
  );

  assert(
    review.attestation?.statement === attestationStatement,
    "External-review attestation statement changed",
  );
  assertIsoTimestamp(review.attestation?.signedAt, "External attestation signedAt");
  const attestationUrl = parseHttpsUrl(
    review.attestation?.url,
    "External attestation URL",
  );
  const expectedPrefix = `/${evidenceRepository.owner}/${evidenceRepository.repository}/commit/`;
  assert(
    attestationUrl.hostname === "github.com" &&
      attestationUrl.pathname.startsWith(expectedPrefix) &&
      /[0-9a-f]{40}$/u.test(attestationUrl.pathname),
    "External attestation URL must be a full commit in the reviewer's evidence repository",
  );

  return { review, digest: record.digest };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scopeRecord = await validateScope(args.scope);
  const riskRecord = await validateRisks(args.risks);

  console.log(`G4 scope: PASS (${scopeRecord.scope.inScope.length} pinned files)`);
  console.log(`G4 source: ${scopeRecord.scope.source.commit}`);
  console.log(`G4 scope SHA-256: ${scopeRecord.digest}`);
  console.log(
    `Residual risks: PASS (${riskRecord.acceptedIds.size} accepted, ${riskRecord.register.risks.length - riskRecord.acceptedIds.size} mitigated)`,
  );
  console.log(`Risk-register SHA-256: ${riskRecord.digest}`);

  if (args.scopeOnly) {
    console.log("G4 external review: PENDING (scope-only validation requested)");
    return;
  }

  const reviewRecord = await validateExternalReview(
    args.review,
    scopeRecord,
    riskRecord,
  );
  console.log(`G4 external review: PASS (${reviewRecord.review.reviewer.name})`);
  console.log(`External-review evidence SHA-256: ${reviewRecord.digest}`);
  console.log("G4 security-ready RC: PASS");
}

main().catch((error) => {
  console.error(`G4 security-ready RC: FAIL\n${error.message}`);
  process.exitCode = 1;
});
