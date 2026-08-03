import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(scriptDirectory, "..");
const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

function isValidSemver(version) {
  const match = semverPattern.exec(version);
  if (!match) return false;

  const prerelease = match[4];
  return (
    !prerelease ||
    prerelease
      .split(".")
      .every((identifier) => !/^\d+$/u.test(identifier) || !/^0\d+/u.test(identifier))
  );
}

function parseArguments(argv) {
  const options = {
    output: null,
    repositoryRoot: defaultRepositoryRoot,
    requireTag: false,
    tag: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--require-tag") {
      options.requireTag = true;
      continue;
    }
    if (argument === "--output" || argument === "--root" || argument === "--tag") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      index += 1;
      if (argument === "--output") options.output = value;
      if (argument === "--root") options.repositoryRoot = path.resolve(value);
      if (argument === "--tag") options.tag = value;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function collectPackageManifests(repositoryRoot) {
  const manifestPaths = ["package.json"];

  for (const parent of ["packages", "implementations"]) {
    const entries = await readdir(path.join(repositoryRoot, parent), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        manifestPaths.push(path.join(parent, entry.name, "package.json"));
      }
    }
  }

  const manifests = [];
  for (const relativePath of manifestPaths.sort()) {
    const manifest = await readJson(path.join(repositoryRoot, relativePath));
    if (!manifest.name || !manifest.version) {
      throw new Error(`${relativePath} must define name and version`);
    }
    manifests.push({
      name: manifest.name,
      path: relativePath,
      version: manifest.version,
    });
  }
  return manifests;
}

function inferTag(explicitTag) {
  if (explicitTag) return explicitTag;
  if (process.env.GITHUB_REF_TYPE === "tag") return process.env.GITHUB_REF_NAME;
  if (process.env.GITHUB_REF?.startsWith("refs/tags/")) {
    return process.env.GITHUB_REF.slice("refs/tags/".length);
  }
  return null;
}

function gitValue(repositoryRoot, ...arguments_) {
  return execFileSync("git", ["-C", repositoryRoot, ...arguments_], {
    encoding: "utf8",
  }).trim();
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifests = await collectPackageManifests(options.repositoryRoot);
  const rootManifest = manifests.find((manifest) => manifest.path === "package.json");
  const version = rootManifest.version;

  if (!isValidSemver(version)) {
    throw new Error(`Root package version is not valid SemVer: ${version}`);
  }

  const mismatches = manifests.filter((manifest) => manifest.version !== version);
  if (mismatches.length > 0) {
    throw new Error(
      `Workspace package versions differ from ${version}: ${mismatches
        .map((manifest) => `${manifest.path}=${manifest.version}`)
        .join(", ")}`,
    );
  }

  const tag = inferTag(options.tag);
  if (options.requireTag && !tag) {
    throw new Error("A release tag is required");
  }
  if (tag && tag !== `v${version}`) {
    throw new Error(`Release tag ${tag} must equal v${version}`);
  }

  const result = {
    schema: "erc-8350/release-metadata/v1",
    version,
    tag,
    prerelease: version.includes("-"),
    source: {
      commit: gitValue(options.repositoryRoot, "rev-parse", "HEAD"),
      tree: gitValue(options.repositoryRoot, "rev-parse", "HEAD^{tree}"),
    },
    packages: manifests,
  };

  if (options.output) {
    const outputPath = path.resolve(options.repositoryRoot, options.output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  }

  console.log(`Release metadata: PASS (${manifests.length} package manifests)`);
  console.log(`Version: ${version}`);
  console.log(`Tag: ${tag ?? "not supplied"}`);
}

main().catch((error) => {
  console.error("Release metadata: FAIL");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
