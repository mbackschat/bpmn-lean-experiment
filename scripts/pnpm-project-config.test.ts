import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
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
  files?: ReadonlyArray<string>;
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
