/**
 * PC-BASIC-03 beyond a split's own branches: one closure that queues several units of work through a Signal broadcast,
 * a non-interrupting catch beside its thrower, a Conditional firing, an uncaught Error, a Compensation throw or a Scope's
 * implicitly begun children leaves an order BPMN does not fix (§13.3.1, Table 13.1), so `BranchSchedule.orderInvariant` refuses the model when that order
 * could change a write or remove another unit's work (#81); so does a broadcast that completes the instances of a
 * parallel Multi-Instance body together (§13.3.7). The witnesses are `scenarios/open-rows/branch-fan-out-order`;
 * its controls, whose fan-out is caught, single or removed with the thrower, stay admitted.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { runScenario } from "@bpmn-lean/kernel";

import { readSourceFor } from "./scenario-discovery.ts";
import type { ScenarioDocument } from "./scenario-discovery.ts";
import { projectRoot } from "./pipeline-target-support.ts";

type Json = Record<string, any>;

async function run(name: string): Promise<Json> {
  const scenarioPath = `scenarios/open-rows/branch-fan-out-order/${name}-start.scenario.json`;
  const scenario = JSON.parse(await readFile(path.join(projectRoot, scenarioPath), "utf8")) as ScenarioDocument;
  const read = await readSourceFor(scenarioPath, scenario.bpmn, scenario.profile);
  assert.equal(read.kind, "read", JSON.stringify(read));
  return runScenario((read as Extract<typeof read, { kind: "read" }>).program, scenario) as Json;
}

const refused: ReadonlyArray<readonly [string, string]> = [
  ["esp-wake-pair", "flow.concurrentWrite"],
  ["esp-wake-pair-swapped", "flow.concurrentWrite"],
  ["throw-vs-wake", "flow.concurrentWrite"],
  ["signal-end-scope", "flow.concurrentWrite"],
  ["terminate-resumption", "flow.concurrentInterference"],
  ["escalation-vs-thrower", "flow.concurrentWrite"],
  ["escalation-end-scope", "flow.concurrentWrite"],
  ["conditional-write", "flow.concurrentWrite"],
  ["split-uncaught-error", "flow.concurrentInterference"],
  ["split-uncaught-error-swapped", "flow.concurrentInterference"],
  ["call-error-escapes", "flow.concurrentInterference"],
  ["handlers-together", "flow.concurrentWrite"],
  ["handlers-together-subjects-swapped", "flow.concurrentWrite"],
  ["handlers-across-choice", "flow.concurrentWrite"],
  ["handlers-reentered", "flow.concurrentWrite"],
  ["handlers-returning", "flow.concurrentWrite"],
  ["handlers-in-reentered-scope", "flow.concurrentWrite"],
  ["instances-woken-together", "multiInstance.concurrentInstances"],
  ["implicit-begins", "flow.concurrentWrite"],
  ["implicit-begins-swapped", "flow.concurrentWrite"],
];

for (const [name, code] of refused) {
  test(`${name}: the standards reading refuses an order no input fixes`, async () => {
    const result = await run(name);
    assert.deepEqual(result.trace[0], { kind: "deployment", outcome: "unsupported", code });
  });
}

const controls = [
  "caught-error-in-branch", "single-catch", "interrupting-boundary-around-thrower", "call-error-caught-inside", "handlers-in-sequence",
];

for (const name of controls) {
  test(`${name}: a fan-out no order can change is admitted`, async () => {
    const result = await run(name);
    assert.equal(result.trace[0]?.kind, "deployment", JSON.stringify(result.trace[0]));
    assert.notEqual(result.trace[0]?.outcome, "unsupported", JSON.stringify(result.trace[0]));
  });
}
