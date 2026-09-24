import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, ControlStateKind, ObservationRequestKind, REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
  ScenarioDocumentKind, StimulusKind, applyStimulus, initialState, runScenario,
} from "@bpmn-lean/semantic-core";
import type { Scenario, Stimulus } from "@bpmn-lean/semantic-core";
import { timerFiringStimulus } from "@bpmn-lean/temporal-protocol";
import {
  TemporalCompletionDelivery, TemporalExecutionSchedule, TemporalScenarioRunner,
  requireSubscriptionTimerHistory,
} from "@bpmn-lean/temporal-testkit";
import { temporalCacheDirectory } from "./temporal-test-support.ts";

test("ordered subscription runner completes repeated native firings and replays both Activity loci", async () => {
  const runner = await TemporalScenarioRunner.create({
    downloadDirectory: temporalCacheDirectory,
  });
  try {
    for (const name of ["boundary-timer", "subprocess-boundary-timer"]) {
      const compiled = await compileBpmnToSemanticProcess({
        bytes: await readFile(new URL(`../../../bpmn-source/test/fixtures/repeatable-event-subscriptions/${name}.bpmn`, import.meta.url)),
        sourceId: name, expectedSha256: undefined, sourceOverlay: null,
        semanticProfile: REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
        limits: { maxBytes: 1024 * 1024, parserDeadlineMs: 1_000 },
      });
      assert.equal(compiled.status, BpmnCompilationStatus.Accepted);
      if (compiled.status !== BpmnCompilationStatus.Accepted) throw new Error("source refused");
      const program = compiled.semanticProcess;
      for (const firingCount of [0, 2]) {
        const id = `${name}-${firingCount}`;
        const start = {
          kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
          instanceId: id, initialVariables: [],
        } as const;
        const stimuli: Stimulus[] = [];
        let state = initialState;
        const append = (stimulus: Stimulus) => {
          const result = applyStimulus(program, state, stimulus);
          assert.equal(result.outcome, CommandOutcome.Committed);
          state = result.state;
          stimuli.push(stimulus);
        };
        append(start);
        for (let index = 0; index < firingCount; index += 1) {
          assert.ok(state.timerWaits[0]);
          append(timerFiringStimulus(state.timerWaits[0]));
        }
        const complete = (elementId: string, activation = 1) => {
          const task = state.userTaskWaits.find(({ id }) => id.elementId === elementId && id.activation === activation);
          assert.ok(task, `${elementId}#${activation} must be open`);
          append({ kind: StimulusKind.CompleteUserTaskInstance, commandId: `complete-${elementId}-${activation}`, taskId: task.id, submittedValues: [] });
        };
        complete("UserTask_Trigger");
        assert.equal(state.timerWaits.length, 0);
        if (name === "subprocess-boundary-timer") {
          for (let activation = 1; activation <= firingCount; activation += 1) complete("HandleReminder", activation);
        }
        complete("UserTask_Outer");
        complete("IndependentAudit");
        assert.equal(state.control.kind, ControlStateKind.Completed);
        const scenario: Scenario = {
          kind: ScenarioDocumentKind.Scenario, id, profile: REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
          bpmn: { id: name, relativePath: `${name}.bpmn`, sha256: program.identity.sourceSha256, sourceOverlay: null },
          stimuli, observations: [ObservationRequestKind.Deployment, ObservationRequestKind.CommandResults,
            ObservationRequestKind.ProcessStatus, ObservationRequestKind.ActiveWaits, ObservationRequestKind.OpenUserTasks,
            ObservationRequestKind.OpenTimers, ObservationRequestKind.OpenEffects, ObservationRequestKind.Variables,
            ObservationRequestKind.EnabledInteractions, ObservationRequestKind.LogicalTime],
          provenance: { normativeRefs: [], cibRevision: "diagnostic", cibRefs: [] },
        };
        const expected = runScenario(scenario, program);
        assert.deepEqual(expected.outcome, { kind: "semantic", outcome: CommandOutcome.Committed });
        const execution = await runner.runScenario(scenario, program, {
          workflowId: id, completionDelivery: TemporalCompletionDelivery.Ordered,
          executionSchedule: TemporalExecutionSchedule.StimulusOrder, effectExecutionSchedule: null,
        });
        assert.deepEqual(execution.result, expected);
        assert.ok(execution.receipt);
        requireSubscriptionTimerHistory(execution.history, firingCount);
        if (firingCount > 0) {
          const removed = { events: execution.history.events.filter((event) =>
            !(typeof event === "object" && event !== null && "timerStartedEventAttributes" in event &&
              Reflect.get(event, "timerStartedEventAttributes") != null)) };
          assert.throws(() => requireSubscriptionTimerHistory(removed, firingCount));
        }
        await runner.replayHistory(execution.history, `${id}-replay`);
      }
    }
  } finally {
    await runner.shutdown();
  }
});
