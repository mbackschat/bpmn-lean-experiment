import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BpmnCompilationStatus, compileBpmnToSemanticProcess } from "@bpmn-lean/bpmn-source";
import {
  CommandOutcome, REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
  ScenarioDocumentKind, StimulusKind, applyStimulus, initialState,
} from "@bpmn-lean/semantic-core";
import type { Scenario, Stimulus } from "@bpmn-lean/semantic-core";
import { timerFiringStimulus } from "@bpmn-lean/temporal-protocol";
import { TemporalCompletionDelivery, TemporalExecutionSchedule } from "@bpmn-lean/temporal-testkit";
import type { TemporalHistory } from "@bpmn-lean/temporal-testkit";

const support: typeof import("../src/runner-support.js") = await import(
  new URL("../dist/runner-support.js", import.meta.url).href,
);
const evidence: typeof import("../src/harness-evidence.js") = await import(
  new URL("../dist/harness-evidence.js", import.meta.url).href,
);
const options = {
  workflowId: "subscription-runner", completionDelivery: TemporalCompletionDelivery.Ordered,
  executionSchedule: TemporalExecutionSchedule.StimulusOrder, effectExecutionSchedule: null,
};

test("ordered runner admits two actual recurring firings at both selected Activity loci", async () => {
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
    const start = {
      kind: StimulusKind.StartProcess, commandId: "start", processId: program.processId,
      instanceId: "runner-recurring", initialVariables: [],
    } as const;
    let state = applyStimulus(program, initialState, start).state;
    const stimuli: Stimulus[] = [start];
    for (let index = 0; index < 2; index += 1) {
      const timer = state.timerWaits[0];
      assert.ok(timer);
      const firing = timerFiringStimulus(timer);
      const result = applyStimulus(program, state, firing);
      assert.equal(result.outcome, CommandOutcome.Committed);
      stimuli.push(firing);
      state = result.state;
    }
    const scenario: Scenario = {
      kind: ScenarioDocumentKind.Scenario, id: name, profile: REPEATABLE_EVENT_SUBSCRIPTIONS_CHECKPOINT_PROFILE_ID,
      bpmn: { id: name, relativePath: `${name}.bpmn`, sha256: program.identity.sourceSha256, sourceOverlay: null },
      stimuli, observations: [], provenance: { normativeRefs: [], cibRevision: "diagnostic", cibRefs: [] },
    };
    assert.doesNotThrow(() => support.validateExecutionOptions(scenario, options));
    assert.throws(() => support.validateExecutionOptions({ ...scenario, profile: "legacy" }, options), /exactly one timer/);
    assert.throws(() => support.validateExecutionOptions(scenario, {
      ...options, executionSchedule: TemporalExecutionSchedule.Normal,
    }), /stimulus-order/);
    assert.throws(() => support.validateExecutionOptions(scenario, {
      ...options, executionSchedule: TemporalExecutionSchedule.WorkerDownAtTimerDue,
    }), /stimulus-order/);
    assert.throws(() => support.validateExecutionOptions({ ...scenario, stimuli: [
      start, { ...stimuli[1]!, commandId: "unbound" }, stimuli[2]!,
    ] }, options), /not bound/);
  }
});

function started(eventId: number, timerId: string, milliseconds = 1_000) {
  return { eventId, timerStartedEventAttributes: {
    timerId, startToFireTimeout: { seconds: Math.floor(milliseconds / 1_000), nanos: (milliseconds % 1_000) * 1_000_000 },
  } };
}
function fired(eventId: number, startedEventId: number, timerId: string) {
  return { eventId, timerFiredEventAttributes: { startedEventId, timerId } };
}
const history: TemporalHistory = { events: [
  started(1, "first"), fired(2, 1, "first"), started(3, "second", 1), fired(4, 3, "second"),
  started(5, "withdrawn"), { eventId: 6, timerCanceledEventAttributes: { startedEventId: 5, timerId: "withdrawn" } },
] };

test("recurring native Timer evidence accounts for every firing and withdrawn successor", () => {
  evidence.requireSubscriptionTimerHistory(history, 2);
  evidence.requireSubscriptionTimerHistory({ events: [] }, 0);
  assert.throws(() => evidence.requireDurableTimerHistory(history, 1_000), /exactly one/);
});

test("recurring history rejects missing, duplicate, mismatched and overlapping native Timers", () => {
  const events = history.events;
  for (const altered of [
    events.filter((_, index) => index !== 2),
    [...events, fired(7, 1, "first")],
    [events[0], fired(2, 1, "wrong"), ...events.slice(2)],
    [events[0], events[2], events[1], ...events.slice(3)],
    [started(1, "first", 0), ...events.slice(1)],
    events.slice(0, -1),
  ]) {
    assert.throws(() => evidence.requireSubscriptionTimerHistory({ events: altered }, 2));
  }
  assert.throws(() => evidence.requireSubscriptionTimerHistory({ events: events.slice(0, 4) }, 3), /firing count/);
});

test("only explicit harness termination permits an outstanding native Timer", () => {
  const pending = { events: [...history.events.slice(0, -1), { eventId: 6, workflowExecutionTerminatedEventAttributes: {} }] };
  evidence.requireSubscriptionTimerHistory(pending, 2);
  assert.throws(() => evidence.requireSubscriptionTimerHistory({ events: history.events.slice(0, -1) }, 2), /outstanding/);
});
