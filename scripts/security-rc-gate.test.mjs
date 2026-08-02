import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const gate = path.join(scriptDirectory, "security-rc-gate.mjs");
const scopePath = path.join(repositoryRoot, "audits", "g4", "scope.json");
const riskPath = path.join(
  repositoryRoot,
  "audits",
  "g4",
  "residual-risks.json",
);
const scopeBytes = await readFile(scopePath);
const riskBytes = await readFile(riskPath);
const canonicalScope = JSON.parse(scopeBytes.toString("utf8"));
const canonicalRisks = JSON.parse(riskBytes.toString("utf8"));
const acceptedRiskIds = canonicalRisks.risks
  .filter((risk) => risk.status === "accepted")
  .map((risk) => risk.id);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function runGate(args) {
  return spawnSync(process.execPath, [gate, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

function outputOf(result) {
  return `${result.stdout}\n${result.stderr}`;
}

async function withSyntheticReview(mutate, verify) {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "erc8350-g4-review-test-"));
  const reportPath = path.join(temporaryRoot, "report.md");
  const reviewPath = path.join(temporaryRoot, "external-review.json");
  const reportBytes = Buffer.from("# Independent synthetic gate fixture\n", "utf8");
  await writeFile(reportPath, reportBytes);

  const review = {
    schema: "erc-8350/external-solidity-review/v1",
    candidate: "G4-rc1",
    reviewer: {
      name: "Independent Test Reviewer",
      organization: "Synthetic test fixture",
      githubOwner: "independent-security",
      evidenceRepository:
        "https://github.com/independent-security/erc8350-review",
      independentFromProject: true,
      conflictDisclosure: "Synthetic test fixture; no project relationship.",
    },
    scope: {
      repository: "https://github.com/AwareLiquid/ERC-8350",
      commit: canonicalScope.source.commit,
      tree: canonicalScope.source.tree,
      manifestPath: "audits/g4/scope.json",
      manifestSha256: sha256(scopeBytes),
      riskRegisterPath: "audits/g4/residual-risks.json",
      riskRegisterSha256: sha256(riskBytes),
    },
    report: {
      path: "report.md",
      url: "https://example.com/erc-8350-independent-review",
      sha256: sha256(reportBytes),
      publishedAt: "2026-07-31T00:00:00Z",
    },
    methodology: {
      manualReview: true,
      tools: ["Synthetic fixture 1.0"],
      testCommands: ["cd contracts && forge test -vv"],
    },
    conclusion: {
      status: "pass",
      noUnresolvedCriticalOrHigh: true,
      unresolved: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        informational: 0,
      },
    },
    reviewedResidualRiskIds: acceptedRiskIds,
    findings: [],
    attestation: {
      statement:
        "I independently reviewed the exact G4 scope and the identified report is my work.",
      url: `https://github.com/independent-security/erc8350-review/commit/${"1".repeat(40)}`,
      signedAt: "2026-07-31T00:00:00Z",
    },
  };

  if (mutate) await mutate(review, { reportPath, reviewPath, temporaryRoot });
  await writeFile(reviewPath, `${JSON.stringify(review, null, 2)}\n`);

  try {
    await verify(runGate(["--review", reviewPath]));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function expectRejectedReview(mutate, expectedMessage) {
  await withSyntheticReview(mutate, (result) => {
    assert.notEqual(result.status, 0);
    assert.match(outputOf(result), expectedMessage);
  });
}

test("accepts the canonical G4 scope and residual-risk register", () => {
  const result = runGate(["--scope-only"]);
  assert.equal(result.status, 0, outputOf(result));
  assert.match(result.stdout, /G4 scope: PASS \(10 pinned files\)/u);
  assert.match(result.stdout, /G4 external review: PENDING/u);
});

test("accepts structurally valid independent review evidence", async () => {
  await withSyntheticReview(null, (result) => {
    assert.equal(result.status, 0, outputOf(result));
    assert.match(result.stdout, /G4 security-ready RC: PASS/u);
  });
});

test("rejects self-review by a project owner", async () => {
  await expectRejectedReview(
    (review) => {
      review.reviewer.githubOwner = "AwareLiquid";
      review.reviewer.evidenceRepository =
        "https://github.com/AwareLiquid/security-review";
      review.attestation.url =
        `https://github.com/AwareLiquid/security-review/commit/${"2".repeat(40)}`;
    },
    /Project owners cannot satisfy/u,
  );
});

test("rejects a report whose bytes do not match its digest", async () => {
  await expectRejectedReview(
    (review) => {
      review.report.sha256 = "0".repeat(64);
    },
    /External report SHA-256 mismatch/u,
  );
});

test("rejects report path traversal", async () => {
  await expectRejectedReview(
    (review) => {
      review.report.path = "../report.md";
    },
    /External report path is not a safe relative path/u,
  );
});

test("rejects an unresolved High finding", async () => {
  await expectRejectedReview(
    (review) => {
      review.findings.push({
        id: "EXT-001",
        title: "Unresolved High",
        severity: "high",
        status: "accepted",
        description: "Synthetic unresolved finding.",
        residualRiskId: "G4-R-001",
      });
      review.conclusion.unresolved.high = 1;
    },
    /leaves an unresolved high finding/u,
  );
});

test("rejects an accepted finding without residual-risk mapping", async () => {
  await expectRejectedReview(
    (review) => {
      review.findings.push({
        id: "EXT-002",
        title: "Unmapped Medium",
        severity: "medium",
        status: "accepted",
        description: "Synthetic unmapped finding.",
        residualRiskId: "G4-R-999",
      });
      review.conclusion.unresolved.medium = 1;
    },
    /must map to an accepted residual risk/u,
  );
});

test("rejects an incomplete residual-risk assessment", async () => {
  await expectRejectedReview(
    (review) => {
      review.reviewedResidualRiskIds = review.reviewedResidualRiskIds.slice(1);
    },
    /did not assess the exact accepted-risk set/u,
  );
});

test("rejects weakened scope acceptance criteria", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "erc8350-g4-scope-test-"));
  const mutatedScopePath = path.join(temporaryRoot, "scope.json");
  const mutatedScope = structuredClone(canonicalScope);
  mutatedScope.acceptanceCriteria.noUnresolvedCriticalOrHigh = false;
  await writeFile(mutatedScopePath, `${JSON.stringify(mutatedScope, null, 2)}\n`);

  try {
    const result = runGate(["--scope-only", "--scope", mutatedScopePath]);
    assert.notEqual(result.status, 0);
    assert.match(outputOf(result), /noUnresolvedCriticalOrHigh must remain true/u);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("rejects a changed scoped source hash", async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "erc8350-g4-scope-test-"));
  const mutatedScopePath = path.join(temporaryRoot, "scope.json");
  const mutatedScope = structuredClone(canonicalScope);
  mutatedScope.inScope[0].sha256 = "0".repeat(64);
  await writeFile(mutatedScopePath, `${JSON.stringify(mutatedScope, null, 2)}\n`);

  try {
    const result = runGate(["--scope-only", "--scope", mutatedScopePath]);
    assert.notEqual(result.status, 0);
    // The pin is authoritative against the frozen review commit, so that is the
    // comparison a tampered hash has to fail.
    assert.match(outputOf(result), /does not match source commit/u);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("reports post-freeze drift without failing the gate", async () => {
  // A pinned path that has legitimately moved on since the freeze must be surfaced,
  // but must not be treated as a defect in the review candidate: the review targets
  // the frozen commit, and main advancing underneath it is expected. This is the
  // "the check could not have failed" / "the check failed" distinction — collapsing
  // the two is what made this gate unrunnable after a routine rebase.
  const result = runGate(["--scope-only"]);
  assert.equal(result.status, 0);
  assert.match(outputOf(result), /G4 post-freeze drift:/u);
});
