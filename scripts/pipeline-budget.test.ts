import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { defaultCibSevenMavenTimeoutMs } from "./cibseven-maven-budget.ts";
import {
  PipelineCasePartition,
  pipelineCaseIdRegistry,
  pipelineCaseIdsFor,
} from "../packages/differential/test/pipeline-case-id-registry.ts";

import {
  defaultWarmBudgetMs,
  hostedPipelineJobOverheadMs,
  leanDriverBatchTimeoutMsFor,
  minimumHostedWarmBudgetFactor,
  warmBudgetMs,
  warmPipelineCommandTimeoutMs,
  warmPipelineTestTimeoutMs,
  warmBudgetPerCaseMs,
  warmSoftTargetMsFor,
  coldBudgetMsFor,
  coldBudgetPerCaseMs,
  contendedLoadPerCore,
  timingIsComparable,
} from "./pipeline-budget.ts";

test("keeps the portable budget and both process deadlines ordered", () => {
  assert.equal(warmBudgetMs({}), defaultWarmBudgetMs);
  assert.equal(
    warmPipelineTestTimeoutMs({}),
    defaultWarmBudgetMs + 5_000,
  );
  assert.equal(
    warmPipelineCommandTimeoutMs({}),
    defaultWarmBudgetMs + 10_000,
  );
});

test("the case partitions split the registry into disjoint covering runs", () => {
  const partitions = Object.values(PipelineCasePartition).map((partition) => pipelineCaseIdsFor(partition));
  for (const ids of partitions) {
    assert.ok(ids.length > 0, "an empty partition would be a hosted leg that verifies nothing");
  }
  assert.deepEqual(partitions.flat(), [...pipelineCaseIdRegistry]);
  assert.deepEqual(pipelineCaseIdsFor(undefined), pipelineCaseIdRegistry);
  assert.throws(() => pipelineCaseIdsFor("control"), TypeError);
  assert.equal(
    warmBudgetMs({ BPMN_PIPELINE_PARTITION: PipelineCasePartition.ControlFlow }),
    pipelineCaseIdsFor(PipelineCasePartition.ControlFlow).length * warmBudgetPerCaseMs,
  );
});

test("scales the Lean driver deadline with its scenario batch", () => {
  assert.equal(leanDriverBatchTimeoutMsFor(1), 10_000);
  assert.equal(leanDriverBatchTimeoutMsFor(8), 10_400);
  assert.equal(leanDriverBatchTimeoutMsFor(72), 93_600);

  for (const count of [0, -1, 1.5, Number.NaN]) {
    assert.throws(() => leanDriverBatchTimeoutMsFor(count), TypeError);
  }
});

test("derives both process deadlines from a declared hosted factor", () => {
  const environment = { BPMN_PIPELINE_WARM_BUDGET_FACTOR: "1.5" };
  const hosted = Math.ceil(defaultWarmBudgetMs * 1.5);

  assert.equal(warmBudgetMs(environment), hosted);
  assert.equal(warmPipelineTestTimeoutMs(environment), hosted + 5_000);
  assert.equal(warmPipelineCommandTimeoutMs(environment), hosted + 10_000);
});

test("rejects malformed warm-pipeline factors", () => {
  for (const declared of [
    "",
    "0",
    "0.0",
    "-1",
    "1.5x",
    "1e3",
    " 1.5",
    "NaN",
    "Infinity",
    "11000",
  ]) {
    assert.throws(
      () => warmBudgetMs({ BPMN_PIPELINE_WARM_BUDGET_FACTOR: declared }),
      TypeError,
    );
  }
});

test("scales the warm feedback target with the registered case count", () => {
  // The original fixed 15,000 ms target was set against a roughly thirty-case catalog, which is the
  // 500 ms per case this preserves. Anchoring on the rate rather than the total is what stops a
  // grown catalog from breaching the target for a reason that says nothing about pipeline speed.
  assert.equal(warmSoftTargetMsFor(30), 15_000);
  assert.equal(warmSoftTargetMsFor(52), 26_000);

  // A per-case regression must still breach it. At 52 cases the last uncontended run measured
  // 26,624.797 ms, so the target it is read against has to sit below that figure.
  assert.ok(warmSoftTargetMsFor(52) < 26_624.797);
});

test("rejects a case count that cannot describe a catalog", () => {
  for (const count of [0, -1, 1.5, Number.NaN]) {
    assert.throws(() => warmSoftTargetMsFor(count), TypeError);
  }
});

test("the pathology ceiling carries headroom over the slowest measured hardware", async () => {
  // Measured, not assumed. The same 52-case catalog runs at 515 ms per case on an eight-core
  // development machine and 1,038 ms per case on a four-core hosted runner, so a ceiling chosen
  // against the faster machine refuses healthy runs on the slower one: the 40,000 ms this replaced
  // was already 35% below the 53,975 ms a runner actually took, and only the workflow's declared
  // override hid that.
  assert.ok(
    warmBudgetPerCaseMs >= 1_300,
    "the per-case ceiling must retain headroom above the slowest observed 1,038 ms per case",
  );
  // The identifier registry imports nothing, preserving test:infrastructure's pre-build boundary
  // (Finding 34: a budget guard once reached stale package output through a case list).
  const registrySource = await readFile(
    new URL("../packages/differential/test/pipeline-case-id-registry.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    registrySource,
    /^\s*import\b|[;}]\s*import\b|\bimport\s*\(|\bfrom\s*["'`]|\brequire\s*\(/mu,
  );
});

/**
 * The cold ceiling derives from the catalog, and the load gate has both branches.
 *
 * A gate that never refuses is worse than the magic number it replaced, because it removes a ceiling
 * while looking like one. The quiet-host branch must still be able to fail, so both directions are
 * asserted at the exact threshold rather than only the permissive one.
 */
test("the cold ceiling derives from the registered case count", () => {
  assert.equal(coldBudgetMsFor(1), coldBudgetPerCaseMs);
  assert.equal(coldBudgetMsFor(52), 52 * coldBudgetPerCaseMs);
  assert.throws(() => coldBudgetMsFor(0), TypeError);
  assert.throws(() => coldBudgetMsFor(1.5), TypeError);
  assert.throws(() => coldBudgetMsFor(-3), TypeError);
});

test("a timing figure is comparable only on a host at or below the contended threshold", () => {
  assert.equal(timingIsComparable(0), true);
  assert.equal(timingIsComparable(contendedLoadPerCore), true);
  assert.equal(timingIsComparable(contendedLoadPerCore + 0.01), false);
  // The measured run that exposed the inline ceiling: 81,071 ms at loadPerCore 5.78.
  assert.equal(timingIsComparable(5.78), false);
  // A missing or malformed sample is not silently treated as quiet.
  assert.equal(timingIsComparable(Number.NaN), false);
  assert.equal(timingIsComparable(Number.POSITIVE_INFINITY), false);
});

test("hosted warm-pipeline budget has real headroom and the runner derives its deadline", async () => {
  const [pipelineTest, pipelineRunner, workflow] = await Promise.all([
    readFile(new URL("../packages/differential/test/pipeline.test.ts", import.meta.url), "utf8"),
    readFile(new URL("./test-pipeline.ts", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/verify.yml", import.meta.url), "utf8"),
  ]);
  const hostedFactorMatch = workflow.match(
    /BPMN_PIPELINE_WARM_BUDGET_FACTOR: "([^"]*)"/u,
  );
  // Searched inside the job's own block, so a removed timeout cannot borrow a later job's.
  const pipelineJob = workflow.match(/\n  verify_pipeline:\n((?: {4}.*\n|\n)*)/u)?.[1];
  const pipelineJobMatch = pipelineJob?.match(/^ {4}timeout-minutes: (\d+)$/mu) ?? null;
  assert.notEqual(hostedFactorMatch, null);
  assert.notEqual(pipelineJobMatch, null);
  if (hostedFactorMatch === null || pipelineJobMatch === null) {
    throw new Error("warm-pipeline budget owners are absent");
  }
  // The job runs one matrix leg per registered partition, so each leg's deadline derives from its own cases.
  const matrixPartitions = [...(pipelineJob?.match(/^ {6}matrix:\n {8}partition:\n((?: {10}- .*\n)+)/mu)?.[1] ?? "")
    .matchAll(/^ {10}- (\S+)$/gmu)].map((match) => match[1]);
  assert.deepEqual(matrixPartitions, Object.values(PipelineCasePartition));
  assert.match(pipelineJob ?? "", /^ {10}BPMN_PIPELINE_PARTITION: \$\{\{ matrix\.partition \}\}$/mu);
  const hostedEnvironments = Object.values(PipelineCasePartition).map((partition) => ({
    BPMN_PIPELINE_WARM_BUDGET_FACTOR: hostedFactorMatch[1],
    BPMN_PIPELINE_PARTITION: partition,
  }));

  assert.ok(
    Number(hostedFactorMatch[1]) >= minimumHostedWarmBudgetFactor,
    `hosted warm-pipeline factor ${hostedFactorMatch[1]} must retain at least 50% headroom above the portable default ${defaultWarmBudgetMs}ms`,
  );
  // Parent over child: a job timeout below the pipeline's own deadline would end a pathological run
  // as an anonymous cancellation instead of the budget failure that names it.
  const pipelineJobMs = Number(pipelineJobMatch[1]) * 60_000;
  for (const hostedEnvironment of hostedEnvironments) {
    const leg = hostedEnvironment.BPMN_PIPELINE_PARTITION;
    const hostedBudget = warmBudgetMs(hostedEnvironment);
    assert.ok(
      pipelineJobMs >= warmPipelineCommandTimeoutMs(hostedEnvironment) + hostedPipelineJobOverheadMs,
      `the verify_pipeline ${leg} leg's ${pipelineJobMs}ms timeout must exceed the hosted command deadline ${warmPipelineCommandTimeoutMs(hostedEnvironment)}ms plus the ${hostedPipelineJobOverheadMs}ms job overhead allowance; split the job by owned contract rather than raising the timeout`,
    );
    assert.ok(
      hostedBudget >= defaultCibSevenMavenTimeoutMs + 10_000,
      `hosted warm-pipeline budget ${hostedBudget}ms for the ${leg} leg must exceed the longest nested CIB deadline ${defaultCibSevenMavenTimeoutMs}ms plus reporting headroom`,
    );
  }
  assert.match(
    pipelineRunner,
    /timeoutMs: warmPipelineCommandTimeoutMs\(process\.env\)/u,
    "the process deadline must be derived from the selected warm budget instead of becoming a second lower ceiling",
  );
  assert.match(
    pipelineTest,
    /timeout: warmPipelineTestTimeoutMs\(process\.env\)/u,
    "the Node test deadline must be derived from the selected warm budget instead of becoming a second lower ceiling",
  );
});
