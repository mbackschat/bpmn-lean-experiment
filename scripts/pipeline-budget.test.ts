import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultWarmBudgetMs,
  warmBudgetMs,
  warmPipelineCommandTimeoutMs,
  warmPipelineTestTimeoutMs,
  warmSoftTargetMsFor,
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

test("derives both process deadlines from a hosted budget", () => {
  const environment = { BPMN_PIPELINE_WARM_BUDGET_MS: "130000" };

  assert.equal(warmBudgetMs(environment), 130_000);
  assert.equal(warmPipelineTestTimeoutMs(environment), 135_000);
  assert.equal(warmPipelineCommandTimeoutMs(environment), 140_000);
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
