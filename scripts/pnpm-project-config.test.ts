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

test("does not carry release-age exceptions when release-age protection is disabled", async () => {
  const environment = pnpmEnvironment("true");
  assert.equal(
    await runPnpm(["config", "get", "minimumReleaseAge"], environment),
    "undefined",
  );
  assert.equal(
    await runPnpm(["config", "get", "minimumReleaseAgeExclude"], environment),
    "undefined",
  );
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
