import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultWarmBudgetMs,
  warmBudgetMs,
  warmPipelineCommandTimeoutMs,
  warmPipelineTestTimeoutMs,
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
  const environment = { BPMN_PIPELINE_WARM_BUDGET_MS: "60000" };

  assert.equal(warmBudgetMs(environment), 60_000);
  assert.equal(warmPipelineTestTimeoutMs(environment), 65_000);
  assert.equal(warmPipelineCommandTimeoutMs(environment), 70_000);
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
