import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { runScenario } from "@bpmn-lean/semantic-core";
import type { Scenario } from "@bpmn-lean/semantic-core";
import {
  TemporalCompletionDelivery, TemporalExecutionSchedule, TemporalScenarioRunner,
  asRecord, historyEvents, requireOrderedCompensationHistory,
} from "@bpmn-lean/temporal-testkit";
import { temporalCacheDirectory } from "./temporal-test-support.ts";

test("registered Compensation schedules execute real ordered Activities through success and failure", async () => {
  const root = new URL("../../../../scenarios/compensation/", import.meta.url);
  const runner = await TemporalScenarioRunner.create({ downloadDirectory: temporalCacheDirectory });
  try {
    for (const name of ["success-b-c-a", "success-b-a-c", "success-c-b-a", "failure-a", "failure-b", "failure-c"]) {
      const scenario: Scenario = JSON.parse(await readFile(new URL(`${name}.scenario.json`, root), "utf8"));
      const compiled = await compileBpmnToSemanticProcess({
        bytes: await readFile(new URL("travel-cancellation.bpmn", root)),
        sourceId: scenario.bpmn.id, expectedSha256: scenario.bpmn.sha256,
        sourceOverlay: null, semanticProfile: scenario.profile,
        limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
      });
      assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
      if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("source refused");
      const execution = await runner.runScenario(scenario, compiled.semanticProcess, {
        workflowId: `ordered-${scenario.id}`, completionDelivery: TemporalCompletionDelivery.Ordered,
        executionSchedule: TemporalExecutionSchedule.StimulusOrder, effectExecutionSchedule: null,
      });
      assert.deepEqual(execution.result, runScenario(scenario, compiled.semanticProcess));
      assert.ok(execution.receipt);
      assert.deepEqual(execution.receipt.finalState, execution.result.trace.at(-1));
      const withoutSchedules = {
        events: execution.history.events.filter((event) =>
          asRecord(event, "event").activityTaskScheduledEventAttributes == null),
      };
      assert.throws(() => requireOrderedCompensationHistory(withoutSchedules, scenario, compiled.semanticProcess),
        /Every reached intent must schedule/);
      const changedRequest = structuredClone(execution.history);
      const scheduled = historyEvents(changedRequest, "activityTaskScheduledEventAttributes");
      const input = asRecord(scheduled[0]!.attributes.input, "Activity input");
      Reflect.set(input, "payloads", [{
        metadata: { encoding: Buffer.from("json/plain") },
        data: Buffer.from(JSON.stringify({ protocol: "wrong", operation: "wrong", idempotencyKey: "wrong", arguments: [] })),
      }]);
      assert.throws(() => requireOrderedCompensationHistory(changedRequest, scenario, compiled.semanticProcess),
        /Activity request must match/);
      const changedResult = structuredClone(execution.history);
      const completed = historyEvents(changedResult, "activityTaskCompletedEventAttributes");
      Reflect.set(completed.at(-1)!.attributes, "result", { payloads: [{
        metadata: { encoding: Buffer.from("json/plain") },
        data: Buffer.from(JSON.stringify({ kind: "success", localPatch: [{ name: "forged", value: { kind: "string", value: "changed" } }] })),
      }] });
      assert.throws(() => requireOrderedCompensationHistory(changedResult, scenario, compiled.semanticProcess),
        /no exact typed result/);
      if (name.startsWith("failure-")) {
        const withoutDrain = { events: execution.history.events.filter((event) =>
          asRecord(event, "event").activityTaskCanceledEventAttributes == null) };
        assert.throws(() => requireOrderedCompensationHistory(withoutDrain, scenario, compiled.semanticProcess));
      }
      await runner.replayHistory(execution.history, `ordered-${scenario.id}-replay`);
    }
  } finally {
    await runner.shutdown();
  }
});
