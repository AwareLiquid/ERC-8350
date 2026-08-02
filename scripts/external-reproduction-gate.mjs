import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const defaultManifest = path.join(
  repoRoot,
  "evidence",
  "external-reproductions",
  "v1.json",
);

function parseArgs(argv) {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const parsed = {
    manifest: defaultManifest,
    output: path.join(
      repoRoot,
      "artifacts",
      "external-reproductions",
      timestamp,
    ),
    validateOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--validate-only") {
      parsed.validateOnly = true;
      continue;
    }
    if (argument === "--manifest" || argument === "--output") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${argument} requires a path`);
      }
      parsed[argument.slice(2)] = path.resolve(repoRoot, value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return parsed;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function formatCommand(command, args) {
  return [command, ...args]
    .map((part) => (part.includes(" ") ? JSON.stringify(part) : part))
    .join(" ");
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode, signal) => {
      resolve({
        command: formatCommand(command, args),
        exitCode,
        signal,
        stdout,
        stderr,
      });
    });
  });
}

async function runChecked(command, args, options = {}) {
  const result = await run(command, args, options);
  if (result.exitCode !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${result.command} exited ${result.exitCode}\n${details}`);
  }
  return result;
}

function parseGitHubRepository(repository) {
  const parsed = new URL(repository);
  const parts = parsed.pathname
    .replace(/\/+$/u, "")
    .replace(/\.git$/u, "")
    .split("/")
    .filter(Boolean);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u.test(parts[0] ?? "") ||
    !/^[A-Za-z0-9._-]+$/u.test(parts[1] ?? "") ||
    parts.length !== 2
  ) {
    throw new Error(`Invalid GitHub repository URL: ${repository}`);
  }
  return { owner: parts[0], repository: parts[1] };
}

function assertSourceUrl(suite, repository) {
  const parsed = new URL(suite.sourceUrl);
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "github.com" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    parts.length < 4 ||
    parts[0].toLowerCase() !== repository.owner.toLowerCase() ||
    parts[1].toLowerCase() !== repository.repository.toLowerCase() ||
    parts[2] !== "tree" ||
    parts[3] !== suite.commit
  ) {
    throw new Error(`${suite.id} sourceUrl is not bound to its repository and commit`);
  }
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

function assertHttpsUrl(label, value, expectedHostname) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be an HTTPS URL`);
  }
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    (expectedHostname &&
      (parsed.hostname !== expectedHostname || parsed.port !== ""))
  ) {
    throw new Error(`${label} must be an HTTPS URL without embedded credentials`);
  }
  return parsed;
}

function assertMinimumVersion(label, rawVersion, requiredMajor, requiredMinor) {
  const match = rawVersion.match(/(\d+)\.(\d+)(?:\.\d+)?/u);
  if (!match) {
    throw new Error(`Unable to parse ${label} version: ${rawVersion}`);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major < requiredMajor || (major === requiredMajor && minor < requiredMinor)) {
    throw new Error(
      `${label} ${requiredMajor}.${requiredMinor} or later is required; received ${rawVersion}`,
    );
  }
}

function externalEnvironment(home, temporaryDirectory) {
  const environment = {
    HOME: home,
    TMPDIR: temporaryDirectory,
    TMP: temporaryDirectory,
    TEMP: temporaryDirectory,
    XDG_CACHE_HOME: path.join(home, ".cache"),
    XDG_CONFIG_HOME: path.join(home, ".config"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    PIP_CONFIG_FILE: devNull,
    PIP_DISABLE_PIP_VERSION_CHECK: "1",
    PIP_NO_INPUT: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONHASHSEED: "0",
    PYTHONNOUSERSITE: "1",
  };
  for (const key of [
    "PATH",
    "LANG",
    "LC_ALL",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "REQUESTS_CA_BUNDLE",
    "CURL_CA_BUNDLE",
  ]) {
    if (process.env[key]) {
      environment[key] = process.env[key];
    }
  }
  return environment;
}

function requirementsText(suite) {
  return `${suite.pythonPackages
    .map((dependency) => {
      const hashes = suite.pythonPackageHashes[dependency];
      return `${dependency} \\\n${hashes
        .map((hash) => `    --hash=sha256:${hash}`)
        .join(" \\\n")}`;
    })
    .join("\n")}\n`;
}

function assertManifest(manifest) {
  if (manifest.schema !== "erc8350.external-reproduction-evidence.v1") {
    throw new Error(`Unsupported manifest schema: ${manifest.schema}`);
  }
  if (manifest.riskId !== "R-002") {
    throw new Error(`Expected riskId R-002, received ${manifest.riskId}`);
  }
  if (!Array.isArray(manifest.suites)) {
    throw new Error("Manifest suites must be an array");
  }
  if (
    !Number.isInteger(manifest.criteria?.minimumExecutableSuites) ||
    manifest.criteria.minimumExecutableSuites < 2
  ) {
    throw new Error("Manifest must require at least two executable suites");
  }
  if (manifest.suites.length < manifest.criteria.minimumExecutableSuites) {
    throw new Error("Manifest does not meet minimumExecutableSuites");
  }
  if (
    !Number.isInteger(manifest.criteria.minimumIndependentRepositoryOwners) ||
    manifest.criteria.minimumIndependentRepositoryOwners < 2
  ) {
    throw new Error("Manifest must require at least two independent repository owners");
  }
  for (const criterion of [
    "externalRepositoryRequired",
    "fullCommitShaRequired",
    "sourceDigestRequired",
    "dependencyHashesRequired",
    "machineCheckableExitRequired",
  ]) {
    if (manifest.criteria[criterion] !== true) {
      throw new Error(`Manifest criterion ${criterion} must be true`);
    }
  }
  if (manifest.criteria.importsFromErc8350RepositoryAllowed !== false) {
    throw new Error(
      "Manifest criterion importsFromErc8350RepositoryAllowed must be false",
    );
  }
  const primaryRpc = assertHttpsUrl(
    "defaults.primaryRpc",
    manifest.defaults?.primaryRpc,
  );
  const crossCheckRpc = assertHttpsUrl(
    "defaults.crossCheckRpc",
    manifest.defaults?.crossCheckRpc,
  );
  if (primaryRpc.hostname === crossCheckRpc.hostname) {
    throw new Error("Default RPC endpoints must use distinct hosts");
  }

  const ids = new Set();
  const repositoryOwners = new Set();
  for (const suite of manifest.suites) {
    if (
      !suite.maintainer ||
      typeof suite.maintainer.repositoryOwner !== "string" ||
      typeof suite.repository !== "string" ||
      typeof suite.sourceUrl !== "string" ||
      typeof suite.discussionUrl !== "string"
    ) {
      throw new Error("Every suite must declare its maintainer and public URLs");
    }
    if (!Array.isArray(suite.pythonPackages)) {
      throw new Error(`${suite.id} must declare pythonPackages`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(suite.id ?? "")) {
      throw new Error(`Invalid suite id: ${suite.id}`);
    }
    if (!["live-chain-replay", "saved-artifact-recompute"].includes(suite.kind)) {
      throw new Error(`${suite.id} has an unsupported suite kind`);
    }
    if (
      suite.arguments !== undefined &&
      (!Array.isArray(suite.arguments) ||
        suite.arguments.some((argument) => typeof argument !== "string"))
    ) {
      throw new Error(`${suite.id} arguments must be an array of strings`);
    }
    if (ids.has(suite.id)) {
      throw new Error(`Duplicate suite id: ${suite.id}`);
    }
    ids.add(suite.id);
    if (!/^[0-9a-f]{40}$/.test(suite.commit)) {
      throw new Error(`${suite.id} must pin a full 40-character commit SHA`);
    }
    const repository = parseGitHubRepository(suite.repository);
    if (repository.owner.toLowerCase() === "awareliquid") {
      throw new Error(`${suite.id} is not hosted in an external namespace`);
    }
    if (
      suite.maintainer.repositoryOwner.toLowerCase() !==
      repository.owner.toLowerCase()
    ) {
      throw new Error(`${suite.id} repositoryOwner does not match repository URL`);
    }
    repositoryOwners.add(repository.owner.toLowerCase());
    assertSourceUrl(suite, repository);
    assertHttpsUrl(
      `${suite.id} discussionUrl`,
      suite.discussionUrl,
      "ethereum-magicians.org",
    );
    if (!suite.files?.length || !suite.assertions?.length) {
      throw new Error(`${suite.id} must declare source files and assertions`);
    }
    if (
      !isSafeRelativePath(suite.entrypoint) ||
      !suite.files.some((file) => file.path === suite.entrypoint)
    ) {
      throw new Error(`${suite.id} must digest its repository-relative entrypoint`);
    }
    for (const dependency of suite.pythonPackages ?? []) {
      if (!/^[A-Za-z0-9_.-]+==[A-Za-z0-9_.+-]+$/.test(dependency)) {
        throw new Error(`${suite.id} has an unpinned Python dependency`);
      }
      const hashes = suite.pythonPackageHashes?.[dependency];
      if (
        !Array.isArray(hashes) ||
        hashes.length === 0 ||
        hashes.some((hash) => !/^[0-9a-f]{64}$/u.test(hash))
      ) {
        throw new Error(`${suite.id}:${dependency} must pin SHA-256 artifacts`);
      }
    }
    for (const dependency of Object.keys(suite.pythonPackageHashes ?? {})) {
      if (!suite.pythonPackages.includes(dependency)) {
        throw new Error(`${suite.id} has hashes for undeclared dependency ${dependency}`);
      }
    }
    for (const file of suite.files) {
      if (
        !file ||
        typeof file !== "object" ||
        !isSafeRelativePath(file.path)
      ) {
        throw new Error(`${suite.id} has an unsafe source-file path`);
      }
      if (!/^[0-9a-f]{64}$/.test(file.sha256)) {
        throw new Error(`${suite.id}:${file.path} has an invalid SHA-256`);
      }
    }
    for (const assertion of suite.assertions) {
      if (
        !assertion ||
        typeof assertion.id !== "string" ||
        !assertion.id ||
        typeof assertion.pattern !== "string"
      ) {
        throw new Error(`${suite.id} has an invalid assertion`);
      }
      new RegExp(assertion.pattern, "m");
    }
  }
  if (
    repositoryOwners.size < manifest.criteria.minimumIndependentRepositoryOwners
  ) {
    throw new Error("Manifest does not meet minimumIndependentRepositoryOwners");
  }
}

function redact(text, values) {
  return values.reduce(
    (current, value) =>
      value ? current.replaceAll(value, `<rpc:${new URL(value).hostname}>`) : current,
    text,
  );
}

function parseObservations(suite, stdout) {
  if (suite.kind === "live-chain-replay") {
    const counts = stdout.match(
      /^TransitionCommitted (\d+) logs across (\d+) Memory Spaces$/m,
    );
    const block = stdout.match(/^observation block\s+(\d+)$/m);
    const blockHash = stdout.match(/^block hash\s+(0x[0-9a-f]{64})/m);
    const stateRoot = stdout.match(/^stateRoot\s+(0x[0-9a-f]{64})/m);
    return {
      transitionLogs: counts ? Number(counts[1]) : null,
      memorySpaces: counts ? Number(counts[2]) : null,
      observationBlock: block ? Number(block[1]) : null,
      blockHash: blockHash?.[1] ?? null,
      stateRoot: stateRoot?.[1] ?? null,
      verifiedGoodSpaces: (stdout.match(/==> VERIFIED-GOOD:/g) ?? []).length,
    };
  }

  const checks = [...stdout.matchAll(/^\s*OK\s+([A-Za-z0-9_]+)$/gm)].map(
    (match) => match[1],
  );
  return { checks };
}

function reportMarkdown(report, manifest) {
  const rows = report.suites
    .map((suite) => {
      const observation =
        suite.kind === "live-chain-replay"
          ? `${suite.observations.transitionLogs} transitions / ${suite.observations.memorySpaces} Spaces / block ${suite.observations.observationBlock}`
          : `${(suite.observations.checks ?? []).length} independent hash checks`;
      return `| ${suite.id} | ${suite.status.toUpperCase()} | \`${suite.commit.slice(0, 12)}\` | ${suite.assertions.filter((item) => item.matched).length}/${suite.assertions.length} | ${observation} |`;
    })
    .join("\n");

  const sources = manifest.suites
    .map(
      (suite) =>
        `- [${suite.id}](${suite.sourceUrl}) by ${suite.maintainer.github}; discussion: [Ethereum Magicians](${suite.discussionUrl})`,
    )
    .join("\n");

  return `# ERC-8350 R-002 External Reproduction Report

- Result: **${report.result.toUpperCase()}**
- Generated: \`${report.generatedAt}\`
- Manifest SHA-256: \`${report.manifest.sha256}\`
- Runner SHA-256: \`${report.runner.sha256}\`
- External executable suites: ${report.suites.length}
- Child-process environment: **ALLOWLISTED**
- Python isolated mode: **ENABLED**
- Dependency artifact hashes: **REQUIRED**

| Suite | Result | Pinned commit | Assertions | Observation |
|---|---|---|---:|---|
${rows}

## Sources

${sources}

## Scope

This report establishes public, executable, independently maintained reproduction
evidence for R-002. It does **not** claim a complete separately maintained ERC-8350
client, broad ecosystem adoption, or an external security audit.
`;
}

async function verifySuite({
  suite,
  root,
  output,
  python,
  rpc,
}) {
  const started = Date.now();
  const checkout = path.join(root, suite.id, "checkout");
  const venv = path.join(root, suite.id, "venv");
  const home = path.join(root, suite.id, "home");
  const temporaryDirectory = path.join(root, suite.id, "tmp");
  const requirements = path.join(root, suite.id, "requirements.txt");
  const environment = externalEnvironment(home, temporaryDirectory);
  let log = "";
  const sourceFiles = [];

  try {
    await mkdir(home, { recursive: true });
    await mkdir(temporaryDirectory, { recursive: true });
    await runChecked("git", ["init", "-q", checkout], { env: environment });
    await runChecked(
      "git",
      ["-C", checkout, "remote", "add", "origin", suite.repository],
      { env: environment },
    );
    await runChecked(
      "git",
      [
        "-C",
        checkout,
        "fetch",
        "-q",
        "--depth=1",
        "origin",
        suite.commit,
      ],
      { env: environment },
    );
    await runChecked(
      "git",
      ["-C", checkout, "checkout", "-q", "--detach", "FETCH_HEAD"],
      { env: environment },
    );

    const headResult = await runChecked(
      "git",
      ["-C", checkout, "rev-parse", "HEAD"],
      { env: environment },
    );
    const observedCommit = headResult.stdout.trim();
    if (observedCommit !== suite.commit) {
      throw new Error(`Expected ${suite.commit}, checked out ${observedCommit}`);
    }

    const checkoutRealPath = await realpath(checkout);
    for (const expected of suite.files) {
      const absolutePath = path.join(checkout, expected.path);
      const fileStatus = await lstat(absolutePath);
      const fileRealPath = await realpath(absolutePath);
      const relativeRealPath = path.relative(checkoutRealPath, fileRealPath);
      if (
        !fileStatus.isFile() ||
        fileStatus.isSymbolicLink() ||
        relativeRealPath.startsWith(`..${path.sep}`) ||
        relativeRealPath === ".." ||
        path.isAbsolute(relativeRealPath)
      ) {
        throw new Error(`${suite.id}:${expected.path} is not a regular checkout file`);
      }
      const observedSha256 = sha256(await readFile(absolutePath));
      const matched = observedSha256 === expected.sha256;
      sourceFiles.push({ ...expected, observedSha256, matched });
      if (!matched) {
        throw new Error(
          `${suite.id}:${expected.path} expected ${expected.sha256}, received ${observedSha256}`,
        );
      }
    }

    await writeFile(requirements, requirementsText(suite));
    await runChecked(python, ["-m", "venv", venv], { env: environment });
    const venvPython = path.join(venv, "bin", "python");
    const install = await runChecked(
      venvPython,
      [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-input",
        "--quiet",
        "--require-hashes",
        "--only-binary=:all:",
        "--requirement",
        requirements,
      ],
      { env: environment },
    );

    const entrypoint = path.join(checkout, suite.entrypoint);
    const runtimeArgs = ["-I", entrypoint, ...(suite.arguments ?? [])];
    const redactions = [];
    const endpointHosts = {};
    if (suite.kind === "live-chain-replay") {
      runtimeArgs.push(
        "--rpc-url",
        rpc.primary,
        "--cross-check-rpc",
        rpc.crossCheck,
      );
      redactions.push(rpc.primary, rpc.crossCheck);
      endpointHosts.primary = new URL(rpc.primary).hostname;
      endpointHosts.crossCheck = new URL(rpc.crossCheck).hostname;
    }

    const execution = await run(venvPython, runtimeArgs, {
      cwd: path.dirname(entrypoint),
      env: environment,
    });
    const assertions = suite.assertions.map((assertion) => ({
      id: assertion.id,
      matched: new RegExp(assertion.pattern, "m").test(execution.stdout),
    }));
    const status =
      execution.exitCode === 0 && assertions.every((assertion) => assertion.matched)
        ? "pass"
        : "fail";
    const redactedStdout = redact(execution.stdout, redactions);
    const redactedStderr = redact(execution.stderr, redactions);
    log = [
      `SOURCE ${suite.repository}@${suite.commit}`,
      `COMMAND ${redact(execution.command, redactions)}`,
      "",
      "STDOUT",
      redactedStdout,
      "STDERR",
      redactedStderr,
      install.stderr ? `PIP STDERR\n${install.stderr}` : "",
    ]
      .filter((item) => item !== "")
      .join("\n");

    const logPath = path.join(output, "logs", `${suite.id}.txt`);
    await writeFile(logPath, `${log.trimEnd()}\n`);
    return {
      id: suite.id,
      kind: suite.kind,
      status,
      repository: suite.repository,
      sourceUrl: suite.sourceUrl,
      discussionUrl: suite.discussionUrl,
      maintainer: suite.maintainer,
      license: suite.license,
      commit: suite.commit,
      sourceFiles,
      dependencies: suite.pythonPackages.map((dependency) => ({
        requirement: dependency,
        sha256: suite.pythonPackageHashes[dependency],
      })),
      exitCode: execution.exitCode,
      assertions,
      observations: parseObservations(suite, execution.stdout),
      endpointHosts,
      durationMs: Date.now() - started,
      log: {
        path: path.relative(output, logPath),
        sha256: sha256(Buffer.from(`${log.trimEnd()}\n`)),
      },
      scope: suite.scope,
      nonClaims: suite.nonClaims,
    };
  } catch (error) {
    log = `${log}${log ? "\n" : ""}ERROR\n${error.stack ?? error.message}\n`;
    const logPath = path.join(output, "logs", `${suite.id}.txt`);
    await writeFile(logPath, log);
    return {
      id: suite.id,
      kind: suite.kind,
      status: "fail",
      repository: suite.repository,
      sourceUrl: suite.sourceUrl,
      discussionUrl: suite.discussionUrl,
      maintainer: suite.maintainer,
      license: suite.license,
      commit: suite.commit,
      sourceFiles,
      dependencies: suite.pythonPackages.map((dependency) => ({
        requirement: dependency,
        sha256: suite.pythonPackageHashes[dependency],
      })),
      exitCode: null,
      assertions: suite.assertions.map((assertion) => ({
        id: assertion.id,
        matched: false,
      })),
      observations: {},
      endpointHosts: {},
      durationMs: Date.now() - started,
      log: {
        path: path.relative(output, logPath),
        sha256: sha256(Buffer.from(log)),
      },
      scope: suite.scope,
      nonClaims: suite.nonClaims,
      error: error.message,
    };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifestBytes = await readFile(args.manifest);
  const manifest = JSON.parse(manifestBytes);
  assertManifest(manifest);
  assertMinimumVersion("Node.js", process.versions.node, 22, 0);

  if (args.validateOnly) {
    process.stdout.write(
      `Validated ${manifest.suites.length} external reproduction suites from ${path.relative(
        repoRoot,
        args.manifest,
      )}\n`,
    );
    return;
  }

  await mkdir(path.join(args.output, "logs"), { recursive: true });
  const python = process.env.PYTHON || "python3";
  const primaryRpc =
    process.env.ERC8350_PRIMARY_RPC || manifest.defaults.primaryRpc;
  const crossCheckRpc =
    process.env.ERC8350_CROSSCHECK_RPC || manifest.defaults.crossCheckRpc;
  const runnerBytes = await readFile(fileURLToPath(import.meta.url));
  const nodeVersion = process.version;
  const pythonVersionResult = await runChecked(python, ["--version"]);
  const pythonVersion = (
    pythonVersionResult.stdout || pythonVersionResult.stderr
  ).trim();
  assertMinimumVersion("Python", pythonVersion, 3, 12);
  const gitVersion = (await runChecked("git", ["--version"])).stdout.trim();
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "erc8350-external-reproduction-"),
  );
  const suites = [];

  try {
    for (const suite of manifest.suites) {
      process.stdout.write(`Running external suite ${suite.id}...\n`);
      const result = await verifySuite({
        suite,
        root: temporaryRoot,
        output: args.output,
        python,
        rpc: { primary: primaryRpc, crossCheck: crossCheckRpc },
      });
      suites.push(result);
      process.stdout.write(`  ${result.status.toUpperCase()}\n`);
    }
  } finally {
    if (process.env.KEEP_EXTERNAL_REPRO_TEMP !== "1") {
      await rm(temporaryRoot, { recursive: true, force: true });
    } else {
      process.stdout.write(`Temporary checkouts retained at ${temporaryRoot}\n`);
    }
  }

  const report = {
    schema: "erc8350.external-reproduction-report.v1",
    riskId: manifest.riskId,
    result: suites.every((suite) => suite.status === "pass") ? "pass" : "fail",
    generatedAt: new Date().toISOString(),
    manifest: {
      path: path.relative(repoRoot, args.manifest),
      sha256: sha256(manifestBytes),
    },
    runner: {
      path: path.relative(repoRoot, fileURLToPath(import.meta.url)),
      sha256: sha256(runnerBytes),
    },
    environment: {
      platform: process.platform,
      arch: process.arch,
      node: nodeVersion,
      python: pythonVersion,
      git: gitVersion,
      externalProcessEnvironment: "allowlisted",
      pythonIsolatedMode: true,
      dependencyArtifactsHashPinned: true,
    },
    criteria: manifest.criteria,
    suites,
    attestations: manifest.attestations,
    conclusion:
      "R-002 is resolved for independent reproduction evidence. A complete separately maintained ERC-8350 client and an external security audit remain open.",
  };
  const markdown = reportMarkdown(report, manifest);
  const jsonPath = path.join(args.output, "report.json");
  const markdownPath = path.join(args.output, "report.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, markdown);

  if (process.env.GITHUB_STEP_SUMMARY) {
    await writeFile(process.env.GITHUB_STEP_SUMMARY, markdown, { flag: "a" });
  }

  process.stdout.write(`Report JSON: ${jsonPath}\n`);
  process.stdout.write(`Report Markdown: ${markdownPath}\n`);
  process.exitCode = report.result === "pass" ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
