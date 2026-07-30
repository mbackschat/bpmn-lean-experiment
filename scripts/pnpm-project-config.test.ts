import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
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
    ["run", "check:doc-fragments"],
    pnpmEnvironment(undefined),
  );
});

test("disables pnpm CLI self-switching for version discovery and dispatch", async (context) => {
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
  printf '%s\\n' '11.18.0'
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
