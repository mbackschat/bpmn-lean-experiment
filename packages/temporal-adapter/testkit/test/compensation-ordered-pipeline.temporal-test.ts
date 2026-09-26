import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import { StimulusKind, runScenario } from "@bpmn-lean/semantic-core";
import type { Scenario } from "@bpmn-lean/semantic-core";
import {
  TemporalCompletionDelivery, TemporalExecutionSchedule, TemporalScenarioRunner,
  asArray, asRecord, decodeJsonPayload, historyEvents, requireOrderedCompensationHistory,
  processTerminalReceiptFormatV1, productionBpmnWorkflowInitialHostInput,
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

test("registered Transaction cancellation schedules retain production hosting and exact ordered Activity evidence", async () => {
  const root = new URL("../../../../scenarios/transaction-cancellation/", import.meta.url);
  const bytes = await readFile(new URL("reservation-withdrawal.bpmn", root));
  const runner = await TemporalScenarioRunner.create({ downloadDirectory: temporalCacheDirectory });
  try {
    for (const name of ["empty", "retained-active", "retained-ended", "handler-failed"]) {
      const scenario: Scenario = JSON.parse(await readFile(new URL(`${name}.scenario.json`, root), "utf8"));
      assert.equal(scenario.profile, "bpmn-2.0.2-transaction-cancellation-checkpoint-draft");
      const compiled = await compileBpmnToSemanticProcess({
        bytes, sourceId: scenario.bpmn.id, expectedSha256: scenario.bpmn.sha256,
        sourceOverlay: null, semanticProfile: scenario.profile,
        limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
      });
      assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
      if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("Transaction source refused");
      const start = scenario.stimuli[0];
      assert.equal(start?.kind, StimulusKind.StartProcess);
      if (start?.kind !== StimulusKind.StartProcess) throw new Error("Transaction Start missing");
      const execution = await runner.runScenario(scenario, compiled.semanticProcess, {
        workflowId: `ordered-${scenario.id}`, completionDelivery: TemporalCompletionDelivery.Ordered,
        executionSchedule: TemporalExecutionSchedule.StimulusOrder, effectExecutionSchedule: null,
      });
      const expected = runScenario(scenario, compiled.semanticProcess);
      assert.deepEqual(execution.result, expected);
      assert.deepEqual(execution.receipt, {
        format: processTerminalReceiptFormatV1,
        definition: compiled.semanticProcess.identity,
        processId: start.processId, processInstanceId: start.instanceId,
        finalState: expected.trace.at(-1),
      });
      const starts = historyEvents(execution.history, "workflowExecutionStartedEventAttributes");
      assert.equal(starts.length, 1);
      const input = asRecord(starts[0]!.attributes.input, "Transaction Workflow input");
      // runner-workflow-start must enroll every Transaction in the production chain,
      // including empty cancellation: effect presence does not select host admission.
      assert.deepEqual(asArray(input.payloads, "Workflow arguments")
        .map((payload) => decodeJsonPayload(payload, "Workflow argument")), [
        start, compiled.semanticProcess, productionBpmnWorkflowInitialHostInput(),
      ]);
      assert.equal(historyEvents(execution.history, "workflowExecutionContinuedAsNewEventAttributes").length, 0);
      if (name === "empty") {
        // OrderedEffectExecution requires nonempty intent entries; TXC-EMPTY-01
        // creates no handler, so its runner path must bypass that harness entirely.
        assert.equal(scenario.stimuli.filter(({ kind }) => kind === StimulusKind.CompleteEffect).length, 0);
        for (const attributes of [
          "activityTaskScheduledEventAttributes", "activityTaskStartedEventAttributes",
          "activityTaskCompletedEventAttributes", "activityTaskFailedEventAttributes",
          "activityTaskTimedOutEventAttributes", "activityTaskCancelRequestedEventAttributes",
          "activityTaskCanceledEventAttributes",
        ]) assert.equal(historyEvents(execution.history, attributes).length, 0, attributes);
      } else {
        assert.equal(historyEvents(execution.history, "activityTaskScheduledEventAttributes").length, 1);
        requireOrderedCompensationHistory(execution.history, scenario, compiled.semanticProcess);
        const withoutSchedule = { events: execution.history.events.filter((event) =>
          asRecord(event, "event").activityTaskScheduledEventAttributes == null) };
        assert.throws(() => requireOrderedCompensationHistory(withoutSchedule, scenario, compiled.semanticProcess),
          /Every reached intent must schedule/);
      }
      await runner.replayHistory(execution.history, `ordered-${scenario.id}-replay`);
    }
  } finally {
    await runner.shutdown();
  }
});
