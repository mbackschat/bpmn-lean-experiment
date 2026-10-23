import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const lakeWrapperPath = fileURLToPath(new URL("./lake.sh", import.meta.url));

/**
 * The development-host pin bounds memory on a contributor's machine; a GitHub-hosted runner is a
 * separate, disposable host with its own documented memory, so it takes the manifest's CI pin. Only a
 * GitHub-hosted Linux runner selects it: a self-hosted runner or a local shell that merely sets
 * `GITHUB_ACTIONS` keeps the development pin.
 */
test("the Lean wrapper selects the CI pin only on a GitHub-hosted Linux runner", async () => {
  const manifest = JSON.parse(await readFile(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as
    Readonly<{ config: Readonly<Record<string, string>> }>;
  const local = manifest.config.leanBuildThreads;
  const hosted = manifest.config.leanCiBuildThreads;
  assert.ok(local && hosted && hosted !== local, "the manifest must own distinct local and CI thread pins");
  const fakeBin = await mkdtemp(path.join(tmpdir(), "bpmn-lean-ci-pin-"));
  const lockOwner = path.basename(fakeBin);
  const lockPath = `/tmp/bpmn-lean-experiment-${lockOwner}.lake-build.lock`;
  await writeFile(path.join(fakeBin, "id"), `#!/bin/sh\nprintf '%s\\n' '${lockOwner}'\n`, { mode: 0o755 });
  await writeFile(path.join(fakeBin, "lake"), "#!/bin/sh\nprintf '%s\\n' \"$LEAN_NUM_THREADS\"\n", { mode: 0o755 });
  const { GITHUB_ACTIONS: _actions, RUNNER_ENVIRONMENT: _runner, ...ambient } = process.env;
  const threads = (runner: Readonly<Record<string, string>>): string => {
    const result = spawnSync(lakeWrapperPath, ["--version"], {
      encoding: "utf8",
      env: { ...ambient, ...runner, PATH: `${fakeBin}:${process.env.PATH ?? ""}` },
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    assert.equal(threads({}), local);
    assert.equal(threads({ GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "self-hosted" }), local);
    assert.equal(threads({ GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "github-hosted" }),
      process.platform === "linux" ? hosted : local);
  } finally {
    await rm(lockPath, { recursive: true, force: true });
    await rm(fakeBin, { recursive: true, force: true });
  }
});
