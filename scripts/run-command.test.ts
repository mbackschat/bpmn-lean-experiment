import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import { CommandTimeoutError, runCommand } from "./run-command.ts";

async function waitForPathBefore(
  targetPath: string,
  boundary: Promise<unknown>,
  boundaryMessage: string,
): Promise<void> {
  const boundaryFailure = boundary.then(() => {
    throw new Error(boundaryMessage);
  });
  for (;;) {
    try {
      await access(targetPath);
      return;
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ENOENT")
      ) {
        throw error;
      }
    }
    await Promise.race([delay(25), boundaryFailure]);
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
    throw error;
  }
}

/**
 * Waits until the descendant is gone. An escaped descendant never exits, so the test's own timeout reports the escape;
 * a wall-clock marker instead failed whenever load delayed the group signal past the marker's deadline.
 */
async function waitForExit(pid: number): Promise<void> {
  while (isAlive(pid)) await delay(25);
}

function killIfAlive(pid: number | undefined): void {
  if (pid !== undefined && isAlive(pid)) process.kill(pid, "SIGKILL");
}

/** The descendant outlives the test unless its process group is signalled; it ends itself as a safety bound. */
const descendantSource = "setTimeout(() => process.exit(0), 30_000);";

/** A parent that reports its descendant's process id in `readyPath`, then lives for `lifetimeMs` unless signalled. */
function parentSource(readyPath: string, lifetimeMs: number, ignoresSigterm: boolean): string {
  return [
    'const { spawn } = require("node:child_process");',
    'const { writeFileSync } = require("node:fs");',
    `const descendant = spawn(process.execPath, ["-e", ${JSON.stringify(descendantSource)}], { stdio: "ignore" });`,
    `writeFileSync(${JSON.stringify(readyPath)}, String(descendant.pid));`,
    ignoresSigterm ? 'process.on("SIGTERM", () => {});' : "",
    `setTimeout(() => process.exit(0), ${lifetimeMs});`,
  ].join("");
}

test(
  "terminates a timed-out process group before descendants can escape",
  { timeout: 6_000 },
  async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "bpmn-run-command-test-"),
    );
    const readyPath = path.join(directory, "ready");
    let descendant: number | undefined;

    try {
      const rejected = assert.rejects(
        runCommand(process.execPath, ["-e", parentSource(readyPath, 30_000, true)], {
          cwd: directory,
          env: process.env,
          timeoutMs: 2_500,
          terminationGraceMs: 50,
        }),
        (error: unknown) => {
          assert.ok(error instanceof CommandTimeoutError);
          assert.equal(error.timeoutMs, 2_500);
          assert.match(error.message, /exceeded 2500ms/u);
          return true;
        },
      );
      await waitForPathBefore(
        readyPath,
        rejected,
        "command timed out before establishing its descendant process",
      );
      descendant = Number(await readFile(readyPath, "utf8"));
      await rejected;
      await waitForExit(descendant);
    } finally {
      killIfAlive(descendant);
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test(
  "terminates the owned process group when the command runner is interrupted",
  { timeout: 3_000 },
  async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "bpmn-run-command-interrupt-test-"),
    );
    const readyPath = path.join(directory, "ready");
    const runnerUrl = pathToFileURL(
      path.join(process.cwd(), "scripts/run-command.ts"),
    ).href;
    // The parent and the runner's own deadline outlive the test, so only the interrupt can end the group in time.
    const controllerSource = [
      `import { runCommand } from ${JSON.stringify(runnerUrl)};`,
      `await runCommand(process.execPath, ["-e", ${JSON.stringify(parentSource(readyPath, 30_000, false))}], {`,
      `  cwd: ${JSON.stringify(directory)},`,
      "  env: process.env,",
      "  timeoutMs: 30_000,",
      "  terminationGraceMs: 50,",
      "});",
    ].join("\n");
    const controller = spawn(
      process.execPath,
      ["--input-type=module", "-e", controllerSource],
      { cwd: directory, stdio: "ignore" },
    );
    const controllerClosed = new Promise<void>((resolve, reject) => {
      controller.once("error", reject);
      controller.once("close", resolve);
    });
    let descendant: number | undefined;

    try {
      await waitForPathBefore(
        readyPath,
        controllerClosed,
        "controller exited before establishing its process group",
      );
      descendant = Number(await readFile(readyPath, "utf8"));
      controller.kill("SIGTERM");
      await controllerClosed;
      await waitForExit(descendant);
    } finally {
      controller.kill("SIGKILL");
      killIfAlive(descendant);
      await rm(directory, { recursive: true, force: true });
    }
  },
);
