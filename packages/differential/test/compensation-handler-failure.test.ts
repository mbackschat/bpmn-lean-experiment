/**
 * COMPH-FAIL-01 (compensation semantics): an Error a handler's effect reports and nothing inside the handler catches
 * fails the process instance, and the failure names the run's trigger, the handler and the raising effect. The search
 * reaches the handler's scope occurrence with the raising Service Task still its host (`Propagation.hostLeaves`), which
 * `Compensation.failCompensation` needs to tell an effect's Error from a handler's Error End Event; a search that drops
 * the host refuses the run as `compensation-handler-error-without-effect` instead. The witness is
 * `scenarios/transaction-cancellation/handler-failed`, whose handler `Task_Release` reports `release-failed`.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { runScenario } from "@bpmn-lean/kernel";

import { projectRoot } from "./pipeline-target-support.ts";
import { scenarioKernelInput } from "./scenario-discovery.ts";
import type { ScenarioDocument } from "./scenario-discovery.ts";

test("a compensation handler's uncaught business Error fails the instance and names the handler", async () => {
  const relativePath = "scenarios/transaction-cancellation/handler-failed.scenario.json";
  const scenario = JSON.parse(await readFile(path.join(projectRoot, relativePath), "utf8")) as ScenarioDocument;
  const input = await scenarioKernelInput(relativePath, scenario.bpmn, scenario.profile);
  assert.equal(input.kind, "program");
  const result = JSON.parse(JSON.stringify(runScenario((input as Extract<typeof input, { kind: "program" }>).program, scenario))) as
    Readonly<{ outcome: unknown; trace: ReadonlyArray<Record<string, unknown>> }>;
  assert.deepEqual(result.outcome, { kind: "semantic", outcome: "committed" });
  const last = result.trace.at(-1)!;
  const release = { processInstanceId: "withdrawal-handler-failed", elementId: "Task_Release", activation: 1 };
  assert.deepEqual({ status: last.status, failure: last.failure }, {
    status: "failed",
    failure: {
      code: "release-failed",
      message: "release failed",
      occurrence: release,
      related: [
        { name: "trigger", occurrence: { processInstanceId: "withdrawal-handler-failed", elementId: "End_Cancel", activation: 1 } },
        { name: "handler", occurrence: release },
      ],
    },
  });
});
