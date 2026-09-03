import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultWarmBudgetMs,
  leanInterpreterBatchTimeoutMsFor,
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

test("scales the Lean interpreter deadline with its scenario batch", () => {
  assert.equal(leanInterpreterBatchTimeoutMsFor(1), 10_000);
  assert.equal(leanInterpreterBatchTimeoutMsFor(8), 10_400);
  assert.equal(leanInterpreterBatchTimeoutMsFor(68), defaultWarmBudgetMs);

  for (const count of [0, -1, 1.5, Number.NaN]) {
    assert.throws(() => leanInterpreterBatchTimeoutMsFor(count), TypeError);
  }
});

test("derives both process deadlines from a hosted budget", () => {
  const environment = { BPMN_PIPELINE_WARM_BUDGET_MS: "135000" };

  assert.equal(warmBudgetMs(environment), 135_000);
  assert.equal(warmPipelineTestTimeoutMs(environment), 140_000);
  assert.equal(warmPipelineCommandTimeoutMs(environment), 145_000);
});

test("rejects malformed warm-pipeline budgets", () => {
  for (const declared of [
    "",
    "0",
    "-1",
    "1.5",
    "40000ms",
    "9007199254740992",
    "NaN",
  ]) {
    assert.throws(
      () => warmBudgetMs({ BPMN_PIPELINE_WARM_BUDGET_MS: declared }),
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

test("the pathology ceiling carries headroom over the slowest measured hardware", () => {
  // Measured, not assumed. The same 52-case catalog runs at 515 ms per case on an eight-core
  // development machine and 1,038 ms per case on a four-core hosted runner, so a ceiling chosen
  // against the faster machine refuses healthy runs on the slower one: the 40,000 ms this replaced
  // was already 35% below the 53,975 ms a runner actually took, and only the workflow's declared
  // override hid that.
  assert.ok(
    warmBudgetPerCaseMs >= 1_300,
    "the per-case ceiling must retain headroom above the slowest observed 1,038 ms per case",
  );
  // This file stays build-free because `test:infrastructure` runs before any package is built, so
  // the catalog-tied half of this contract lives with the catalog in the differential package.
  assert.ok(defaultWarmBudgetMs >= 54 * warmBudgetPerCaseMs);
  assert.ok(defaultWarmBudgetMs < 54 * warmBudgetPerCaseMs * 2);
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
