import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { typeScriptModuleSpecifiersFromSource } from "./platform-product-boundary.ts";
import { runCommand } from "./run-command.ts";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

function pnpmEnvironment(ci: string | undefined): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.pnpm_config_enable_global_virtual_store;
  delete environment.PNPM_CONFIG_ENABLE_GLOBAL_VIRTUAL_STORE;
  if (ci === undefined) {
    delete environment.CI;
  } else {
    environment.CI = ci;
  }
  return environment;
}

async function runPnpm(
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<string> {
  const result = await runCommand(
    "./scripts/pnpm.sh",
    args,
    {
      cwd: projectRoot,
      env: environment,
      timeoutMs: 10_000,
    },
  );
  return result.stdout.trim();
}

type WorkspacePackage = Readonly<{
  name: string;
  path: string;
}>;

type PackageManifest = Readonly<{
  dependencies?: Readonly<Record<string, string>>;
  devDependencies?: Readonly<Record<string, string>>;
  files?: ReadonlyArray<string>;
  optionalDependencies?: Readonly<Record<string, string>>;
  peerDependencies?: Readonly<Record<string, string>>;
  scripts?: Readonly<Record<string, string>>;
}>;

test("pins the repository-local virtual store in ordinary and CI execution", async () => {
  assert.equal(
    await runPnpm(
      ["config", "get", "enableGlobalVirtualStore"],
      pnpmEnvironment(undefined),
    ),
    "false",
  );
  assert.equal(
    await runPnpm(
      ["config", "get", "enableGlobalVirtualStore"],
      pnpmEnvironment("true"),
    ),
    "false",
  );

  await runPnpm(
    ["run", "check:source-hygiene"],
    pnpmEnvironment(undefined),
  );
});

test("enforces a fourteen-day dependency quarantine without lockfile bypasses", async () => {
  for (const ci of [undefined, "true"]) {
    const environment = pnpmEnvironment(ci);
    assert.equal(await runPnpm(["config", "get", "minimumReleaseAge"], environment), "20160");
    assert.equal(await runPnpm(["config", "get", "minimumReleaseAgeStrict"], environment), "true");
    assert.equal(await runPnpm(["config", "get", "trustLockfile"], environment), "false");
    assert.equal(await runPnpm(["config", "get", "minimumReleaseAgeIgnoreMissingTime"], environment), "false");
  }
});

function validateSecurityExceptions(selectors: readonly string[], table: string, now: number): void {
  const rows = table.split("\n").filter((line) => line.startsWith("| ") && !line.startsWith("| Package "));
  const records = rows.map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
  assert.deepEqual(records.map(([selector]) => selector).sort(), [...selectors].sort());
  assert.equal(new Set(selectors).size, selectors.length);
  for (const record of records) {
    assert.equal(record.length, 6, "exception record must contain six fields");
    const [selector, advisory, published, expires, reviewer, reason] = record;
    assert.match(selector ?? "", /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+@\d+\.\d+\.\d+$/u);
    assert.match(advisory ?? "", /^\[[^\]]+\]\(https:\/\/[^\s)]+\)$/u);
    const publication = Date.parse(published ?? "");
    const expiration = Date.parse(expires ?? "");
    assert.ok(Number.isFinite(publication) && publication <= now, "published timestamp must be valid and in the past");
    assert.equal(expiration, publication + 14 * 24 * 60 * 60 * 1000, "exception expires when the release reaches fourteen days");
    assert.ok(expiration > now, "remove expired release-age exceptions");
    assert.ok(reviewer && reason, "exception requires a reviewer and risk justification");
  }
}

test("release-age exceptions are exact, documented and unexpired", async () => {
  const configured = await runPnpm(["config", "get", "minimumReleaseAgeExclude", "--json"], pnpmEnvironment(undefined));
  const selectors = (configured === "undefined" || configured === "") ? [] : JSON.parse(configured) as string[];
  const guide = await readFile(path.join(projectRoot, "docs/CONTRIBUTOR-SETUP-GUIDE.md"), "utf8");
  const section = guide.split("### Active security release-age exceptions\n")[1]?.split("\n##")[0];
  assert.ok(section !== undefined, "missing security exception register");
  validateSecurityExceptions(selectors, section, Date.now());
});

test("security exception guard rejects broad, undocumented and expired bypasses", () => {
  const now = Date.parse("2026-09-28T00:00:00Z");
  const row = "| example@1.2.3 | [GHSA](https://github.com/advisories/GHSA-test) | 2026-09-27T00:00:00Z | 2026-10-11T00:00:00Z | maintainer | Exposed service needs the verified fix. |";
  validateSecurityExceptions(["example@1.2.3"], row, now);
  for (const selector of ["example", "@example/*", "example@^1.2.3", "example@1.2.3-beta.1"]) {
    assert.throws(() => validateSecurityExceptions([selector], row.replace("example@1.2.3", selector), now));
  }
  assert.throws(() => validateSecurityExceptions(["example@1.2.3"], "", now));
  assert.throws(() => validateSecurityExceptions(["example@1.2.3"], row, Date.parse("2026-10-11T00:00:00Z")));
  assert.throws(() => validateSecurityExceptions(["example@1.2.3"], row.replace("2026-10-11", "2026-10-12"), now));
  assert.throws(() => validateSecurityExceptions(["example@1.2.3"], row.replace("maintainer", ""), now));
});

test("security monitoring runs daily and on changes without a full build", async () => {
  const workflow = await readFile(path.join(projectRoot, ".github/workflows/dependency-security.yml"), "utf8");
  assert.match(workflow, /cron: "\d+ \d+ \* \* \*"/u);
  assert.match(workflow, /  pull_request:/u);
  assert.match(workflow, /  push:/u);
  assert.match(workflow, /pnpm audit --audit-level=high/u);
  assert.match(workflow, /pnpm install --frozen-lockfile --ignore-scripts/u);
  assert.match(workflow, /node --test scripts\/pnpm-project-config.test.ts/u);
  assert.doesNotMatch(workflow, /continue-on-error|--prod|--ignore-registry-errors|verify\.sh|lake\.sh/u);
});

test("derives workspace build order from package manifests", async () => {
  const environment = pnpmEnvironment("true");
  const packages = JSON.parse(await runPnpm(
    ["list", "--recursive", "--depth", "-1", "--json"],
    environment,
  )) as ReadonlyArray<WorkspacePackage>;
  const workspaceNames = new Set(packages.map(({ name }) => name));
  const rootManifest = JSON.parse(await readFile(
    path.join(projectRoot, "package.json"),
    "utf8",
  )) as PackageManifest;

  for (const workspacePackage of packages) {
    const manifest = JSON.parse(await readFile(
      path.join(workspacePackage.path, "package.json"),
      "utf8",
    )) as PackageManifest;
    if (manifest.files?.includes("dist") === true) {
      assert.match(
        manifest.scripts?.build ?? "",
        /^tsc -p tsconfig\.json(?: && vite build)?$/u,
        `${workspacePackage.name} must own a deterministic TypeScript build with only an optional package-owned Vite bundle`,
      );
    }
  }

  for (const [scriptName, command] of Object.entries(rootManifest.scripts ?? {})) {
    if (!scriptName.startsWith("build:")) {
      continue;
    }
    const graphBuild = /^pnpm (?<filters>(?:--filter \S+\.\.\. )+)--if-present run build$/u.exec(
      command,
    );
    if (graphBuild?.groups?.filters !== undefined) {
      const selectedPackages = Array.from(
        graphBuild.groups.filters.matchAll(/--filter (?<packageName>\S+)\.\.\./gu),
        (match) => match.groups?.packageName,
      );
      assert.ok(selectedPackages.length > 0, scriptName);
      for (const packageName of selectedPackages) {
        assert.ok(packageName !== undefined && workspaceNames.has(packageName), `${scriptName}: ${packageName}`);
      }
      continue;
    }
    const alias = /^pnpm (?<scriptName>build:[a-z0-9-]+)$/u.exec(command);
    assert.ok(alias?.groups?.scriptName !== undefined, `${scriptName}: ${command}`);
    assert.ok(rootManifest.scripts?.[alias.groups.scriptName] !== undefined, scriptName);
  }
});

test("declares every direct package import in its owning workspace manifest", async () => {
  const packages = JSON.parse(await runPnpm(
    ["list", "--recursive", "--depth", "-1", "--json"],
    pnpmEnvironment("true"),
  )) as ReadonlyArray<WorkspacePackage>;
  const findings: string[] = [];

  for (const workspacePackage of packages) {
    if (path.resolve(workspacePackage.path) === path.resolve(projectRoot)) continue;
    const manifest = JSON.parse(await readFile(
      path.join(workspacePackage.path, "package.json"),
      "utf8",
    )) as PackageManifest;
    const declared = new Set([
      workspacePackage.name,
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);
    for (const sourcePath of await typeScriptSources(workspacePackage.path)) {
      const source = await readFile(sourcePath, "utf8");
      for (const specifier of new Set(typeScriptModuleSpecifiersFromSource(source))) {
        const importedPackage = importedPackageName(specifier);
        if (
          importedPackage !== null &&
          !isBuiltin(specifier) &&
          !declared.has(importedPackage)
        ) {
          findings.push(
            `${path.relative(projectRoot, sourcePath)}: ${importedPackage} is not declared by ${workspacePackage.name}`,
          );
        }
      }
    }
  }

  assert.deepEqual(findings.sort(), []);
});

test("disables pnpm CLI self-switching for version discovery and dispatch", async (context) => {
  // The stub must satisfy the wrapper's exact version check, so it answers with the
  // pin resolved from package.json rather than a literal that a bump would strand.
  const resolvedPins = await runCommand("./scripts/pinned-toolchain.sh", [], {
    cwd: projectRoot,
    env: process.env,
    timeoutMs: 10_000,
  });
  const pinnedPnpmVersion = /required_pnpm_version=(\S+)/u.exec(
    resolvedPins.stdout,
  )?.[1];
  assert.match(pinnedPnpmVersion ?? "", /^\d+\.\d+\.\d+$/u);

  const fixtureDirectory = await mkdtemp(
    path.join(tmpdir(), "bpmn-pnpm-wrapper-"),
  );
  context.after(async () => {
    await rm(fixtureDirectory, { force: true, recursive: true });
  });
  const fakePnpmPath = path.join(fixtureDirectory, "pnpm");
  await writeFile(
    fakePnpmPath,
    `#!/bin/sh
set -eu
if test "\${1-}" != "--pm-on-fail=ignore"; then
  sleep 60
  exit 97
fi
shift
if test "\${1-}" = "--version"; then
  printf '%s\\n' '${pinnedPnpmVersion}'
  exit 0
fi
printf 'dispatched:%s\\n' "$*"
`,
    "utf8",
  );
  await chmod(fakePnpmPath, 0o755);
  const environment = pnpmEnvironment(undefined);
  environment.PATH = `${fixtureDirectory}:${environment.PATH ?? ""}`;

  assert.equal(
    await runPnpm(["config", "get", "sentinel"], environment),
    "dispatched:config get sentinel",
  );
});

async function typeScriptSources(directory: string): Promise<ReadonlyArray<string>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    if (entry.name === "dist" || entry.name === "node_modules") return [];
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return typeScriptSources(entryPath);
    return entry.isFile() && /\.(?:cts|mts|tsx?)$/u.test(entry.name)
      ? [entryPath]
      : [];
  }));
  return nested.flat();
}

function importedPackageName(specifier: string): string | null {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return null;
  const segments = specifier.split("/");
  return specifier.startsWith("@")
    ? segments.length >= 2 ? `${segments[0]}/${segments[1]}` : specifier
    : segments[0] ?? null;
}
