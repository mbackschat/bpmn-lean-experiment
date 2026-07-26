import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

import { runCommand } from "./run-command.ts";

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
        /exceeded 200ms/u,
      );
      await delay(700);
      await assert.rejects(access(markerPath), { code: "ENOENT" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
