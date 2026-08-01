import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import { CommandTimeoutError, runCommand } from "./run-command.ts";

test(
  "terminates a timed-out process group before descendants can escape",
  { timeout: 2_000 },
  async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "bpmn-run-command-test-"),
    );
    const markerPath = path.join(directory, "escaped-child");
    const childSource = [
      'const { writeFileSync } = require("node:fs");',
      `setTimeout(() => writeFileSync(${JSON.stringify(markerPath)}, "escaped"), 500);`,
    ].join("");
    const parentSource = [
      'const { spawn } = require("node:child_process");',
      `spawn(process.execPath, ["-e", ${JSON.stringify(childSource)}], { stdio: "ignore" });`,
      'process.on("SIGTERM", () => {});',
      "setTimeout(() => process.exit(0), 800);",
    ].join("");

    try {
      await assert.rejects(
        runCommand(process.execPath, ["-e", parentSource], {
          cwd: directory,
          env: process.env,
          timeoutMs: 200,
          terminationGraceMs: 50,
        }),
        (error: unknown) => {
          assert.ok(error instanceof CommandTimeoutError);
          assert.equal(error.timeoutMs, 200);
          assert.match(error.message, /exceeded 200ms/u);
          return true;
        },
      );
      await delay(700);
      await assert.rejects(access(markerPath), { code: "ENOENT" });
    } finally {
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
    const markerPath = path.join(directory, "escaped-child");
    const childSource = [
      'const { writeFileSync } = require("node:fs");',
      `setTimeout(() => writeFileSync(${JSON.stringify(markerPath)}, "escaped"), 500);`,
    ].join("");
    const parentSource = [
      'const { spawn } = require("node:child_process");',
      'const { writeFileSync } = require("node:fs");',
      `spawn(process.execPath, ["-e", ${JSON.stringify(childSource)}], { stdio: "ignore" });`,
      `writeFileSync(${JSON.stringify(readyPath)}, "ready");`,
      "setTimeout(() => process.exit(0), 1_500);",
    ].join("");
    const runnerUrl = pathToFileURL(
      path.join(process.cwd(), "scripts/run-command.ts"),
    ).href;
    const controllerSource = [
      `import { runCommand } from ${JSON.stringify(runnerUrl)};`,
      `await runCommand(process.execPath, ["-e", ${JSON.stringify(parentSource)}], {`,
      `  cwd: ${JSON.stringify(directory)},`,
      "  env: process.env,",
      "  timeoutMs: 2_000,",
      "  terminationGraceMs: 50,",
      "});",
    ].join("\n");
    const controller = spawn(
      process.execPath,
      ["--input-type=module", "-e", controllerSource],
      { cwd: directory, stdio: "ignore" },
    );

    try {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          await access(readyPath);
          break;
        } catch {
          await delay(25);
        }
      }
      await access(readyPath);
      controller.kill("SIGTERM");
      await new Promise<void>((resolve) => controller.once("close", resolve));
      await delay(700);
      await assert.rejects(access(markerPath), { code: "ENOENT" });
    } finally {
      controller.kill("SIGKILL");
      await rm(directory, { recursive: true, force: true });
    }
  },
);
