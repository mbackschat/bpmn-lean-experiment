/**
 * The opposite-key-order build of the Lean kernel (KD7, promise row 810): the storage order of a scope-keyed map never
 * reaches an output. `oppositeKeyOrderKernelRun` builds `kernelRun` in a copy of the checkout with
 * `Kernel/State/KeyOrder.lean`'s constant set to `true`, so every scope-led key order is reversed. Every discovered
 * scenario the reader admits (`key-order-cases.ts`) runs as a `kernelRun --batch` case through the checkout's and the
 * opposite executable, and their outputs must be byte-identical; a difference is listed by scenario and first differing
 * path, never adjusted away. Discovery runs in its own process (`key-order-cases.ts cases`), so this one holds the cases
 * and one batch's two outputs, never discovery's heap. The TypeScript kernel's build is `opposite-key-order.test.ts`.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { firstValueDisagreement } from "@bpmn-lean/differential";

import { pipelineTestTimeoutMs } from "../../../scripts/pipeline-budget.ts";
import { runCommand } from "../../../scripts/run-command.ts";
import { parseStrictJson } from "../../../scripts/strict-json.ts";
import type { KeyOrderCase } from "./key-order-cases.ts";
import { leanKernelBatchText, oppositeKeyOrderKernelRun } from "./kernel-targets.ts";
import { projectRoot } from "./pipeline-target-support.ts";

/** Cases per Lean process, as the unit pairing batches them. */
const batchSize = 500;

test("the Lean kernel's answers are byte-identical with every scope-led key order reversed", {
  timeout: pipelineTestTimeoutMs(),
}, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "bpmn-opposite-key-order-lean-"));
  try {
    const casesPath = path.join(directory, "cases.json");
    await runCommand(process.execPath, [fileURLToPath(new URL("./key-order-cases.ts", import.meta.url)), "cases", casesPath], {
      cwd: projectRoot, env: process.env, timeoutMs: pipelineTestTimeoutMs(),
    });
    const cases = JSON.parse(await readFile(casesPath, "utf8")) as KeyOrderCase[];
    const opposite = await oppositeKeyOrderKernelRun(path.join(directory, "tree"));
    await mkdir(path.join(directory, "batches"));
    const differences: string[] = [];
    for (let first = 0; first < cases.length; first += batchSize) {
      const chunk = cases.slice(first, first + batchSize);
      const batchPath = path.join(directory, "batches", `${String(first)}.json`);
      await writeFile(batchPath, JSON.stringify(chunk.map((one) => one.batch)), "utf8");
      const normal = await leanKernelBatchText(batchPath, chunk.length);
      const reversed = await leanKernelBatchText(batchPath, chunk.length, opposite);
      if (normal === reversed) continue;
      const [a, b] = [parseStrictJson<unknown[]>(normal, batchPath), parseStrictJson<unknown[]>(reversed, batchPath)];
      const before = differences.length;
      chunk.forEach((one, index) => {
        const at = firstValueDisagreement(a[index], b[index], "answer");
        if (at !== null) differences.push(`${one.scenario}: ${JSON.stringify(at)}`);
      });
      if (differences.length === before) differences.push(`${batchPath}: the same answers, written differently`);
    }
    assert.deepEqual(differences, [], `storage order reached ${String(differences.length)} of ${String(cases.length)} answers`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
