import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  budgetPerScenarioMs,
  discoveredScenarioCount,
  leanDriverBatchTimeoutMsFor,
  pipelineBudgetMsFor,
  pipelineCommandTimeoutMs,
  pipelineJobTimeoutMinutes,
  pipelineTestTimeoutMs,
} from "./pipeline-budget.ts";

test("the pipeline keeps one bound, which only an owner decision changes", () => {
  // The value is restated here so that changing it shows as a guard edit in review, never as a silent constant change.
  assert.equal(budgetPerScenarioMs, 1_300);
});

test("every deadline derives from the discovered scenario count, parent above child", () => {
  const count = discoveredScenarioCount();
  assert.ok(count > 0, "discovery found no scenario files");
  assert.equal(pipelineBudgetMsFor(count), count * budgetPerScenarioMs);
  assert.equal(pipelineTestTimeoutMs(), pipelineBudgetMsFor(count) + 5_000);
  assert.equal(pipelineCommandTimeoutMs(), pipelineTestTimeoutMs() + 5_000);
});

test("scales the Lean driver deadline with its scenario batch above a floor", () => {
  assert.equal(leanDriverBatchTimeoutMsFor(1), 10_000);
  assert.equal(leanDriverBatchTimeoutMsFor(8), 10_400);
  assert.equal(leanDriverBatchTimeoutMsFor(72), 93_600);
  for (const count of [0, -1, 1.5, Number.NaN]) {
    assert.throws(() => leanDriverBatchTimeoutMsFor(count), TypeError);
    assert.throws(() => pipelineBudgetMsFor(count), TypeError);
  }
});

test("the runner, the oracle and the hosted job all take the derived deadlines", async () => {
  const [budget, runner, oracle, workflow] = await Promise.all([
    readFile(new URL("./pipeline-budget.ts", import.meta.url), "utf8"),
    readFile(new URL("./test-pipeline.ts", import.meta.url), "utf8"),
    readFile(new URL("../packages/differential/test/kernel-behavior-oracle.integration-test.ts", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/verify.yml", import.meta.url), "utf8"),
  ]);
  // test:infrastructure reads this module before any package build, so it may not reach package code.
  assert.doesNotMatch(budget, /from\s*["'`]\.\.\/packages|from\s*["'`]@bpmn-lean\//u);
  assert.match(runner, /pipelineCommandTimeoutMs\(\)/u, "the runner's process deadline must be the derived one");
  assert.match(oracle, /timeout: pipelineTestTimeoutMs\(\)/u, "the oracle's test deadline must be the derived one");
  // Searched inside the job's own block, so a removed timeout cannot borrow a later job's. A job timeout below the
  // pipeline's own deadline would end a pathological run as an anonymous cancellation instead of the budget failure.
  const jobBlock = (name: string): string | undefined =>
    workflow.match(new RegExp(String.raw`\n {2}${name}:\n((?: {4}.*\n|\n)*)`, "u"))?.[1];
  // A written-down job ceiling falls below the derived deadline as scenarios are added, so the classify job derives it
  // from this module on the checked-out tree and the pipeline job takes exactly that output.
  assert.match(jobBlock("verify_pipeline") ?? "",
    /^ {4}timeout-minutes: \$\{\{ fromJSON\(needs\.changes\.outputs\.pipeline_minutes\) \}\}$/mu,
    "the verify_pipeline job must take the derived ceiling");
  const changes = jobBlock("changes") ?? "";
  assert.match(changes, /^ {6}pipeline_minutes: \$\{\{ steps\.pipeline_ceiling\.outputs\.minutes \}\}$/mu);
  assert.match(changes, /id: pipeline_ceiling\n\s+run: .*pipelineJobTimeoutMinutes\(\).*>> "\$GITHUB_OUTPUT"/u);
});

test("the hosted job ceiling stays above the command deadline with room for job setup", () => {
  for (const count of [1, 1_340, 1_396, 5_000]) {
    const minutes = pipelineJobTimeoutMinutes(count);
    assert.ok(Number.isSafeInteger(minutes));
    assert.ok((minutes - 5) * 60_000 >= pipelineCommandTimeoutMs(count));
  }
});
