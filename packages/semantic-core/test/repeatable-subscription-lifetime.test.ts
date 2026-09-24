/** Constructed transition witnesses for ESL lifetime rules; source admission is checked separately. */
import assert from "node:assert/strict";
import test from "node:test";
import {
  CommandOutcome, SemanticOperationKind, StimulusKind, applyStimulus, initialState,
  applyStimulusWithTrace, attachedHandlersForBodyAnchor, projectOpenFlowNodeOccurrences,
  requireCompleteFlowNodeOccurrenceLifecycles,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import * as message from "./activity-boundary-message-fixture.ts";
import * as taskTimer from "./monitored-task-fixture.ts";
import * as childTimer from "./bounded-scope-fixture.ts";
const { selectScopeCompletionWithdrawal } = await import(
  new URL("../dist/semantic-process-bounded-scope-runtime.js", import.meta.url).href
) as typeof import("../src/semantic-process-bounded-scope-runtime.ts");

test("distinct deliveries retain the Message subscription and create overlapping handler tasks", () => {
  const started = applyStimulus(message.program, initialState, message.start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  const program: SemanticProcessProgram = {
    ...message.program,
    operations: message.program.operations.map((operation) =>
      operation.kind === SemanticOperationKind.AwaitMessageBoundedUserTask
        ? { ...operation, kind: SemanticOperationKind.AwaitMessageMonitoredUserTask } : operation),
  };
  const first = applyStimulus(program, started.state, message.deliverWithdrawal);
  assert.equal(first.outcome, CommandOutcome.Committed);
  const traced = applyStimulusWithTrace(program, started.state, message.deliverWithdrawal);
  assert.equal(traced.result.outcome, CommandOutcome.Committed);
  const open = projectOpenFlowNodeOccurrences(program, started.state);
  assert.ok(open !== null);
  const retained = open.map((entry) => ({ ...entry,
    attachedHandlers: attachedHandlersForBodyAnchor(started.state, entry.anchor) }));
  requireCompleteFlowNodeOccurrenceLifecycles(program, retained, message.deliverWithdrawal.commandId,
    traced.committedTransitions, traced.flowNodeOccurrenceLifecycles);
  const delivered = traced.flowNodeOccurrenceLifecycles[0];
  assert.ok(delivered);
  assert.equal(delivered.started.length, 1);
  assert.equal(delivered.ended.length, 1);
  assert.equal(delivered.started[0]?.anchor.kind, "transition");
  assert.throws(() => requireCompleteFlowNodeOccurrenceLifecycles(program, retained,
    message.deliverWithdrawal.commandId, traced.committedTransitions,
    [{ started: [], ended: [] }, ...traced.flowNodeOccurrenceLifecycles.slice(1)]), /complete lifecycle/u);
  const second = applyStimulus(program, first.state, { ...message.deliverWithdrawal, commandId: "delivery-2" });
  assert.equal(second.outcome, CommandOutcome.Committed);
  assert.deepEqual(second.state.messageWaits, started.state.messageWaits);
  assert.deepEqual(second.state.messageActivations, started.state.messageActivations);
  assert.deepEqual(second.state.activityOccurrences, started.state.activityOccurrences);
  const handlers = second.state.userTaskWaits.filter(({ id }) => id.elementId === "HandleWithdrawal");
  assert.deepEqual(handlers.map(({ id }) => id.activation), [1, 2]);
  const completed = applyStimulus(program, second.state, message.completeReview);
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.deepEqual(completed.state.messageWaits, []);
  assert.deepEqual(completed.state.activityOccurrences, []);
  assert.deepEqual(completed.state.userTaskWaits.filter(({ id }) => id.elementId === "HandleWithdrawal"), handlers);
  assert.equal(applyStimulus(program, completed.state, {
    ...message.deliverWithdrawal, commandId: "late-delivery",
  }).outcome, CommandOutcome.Rejected);
});

for (const host of ["task", "child"] as const) {
  test(`recurring ${host} Timer replaces its attached identity and retains overlapping handlers`, () => {
    const original = host === "task" ? taskTimer.monitoredProgram : childTimer.boundedScopeProgram;
    const start = host === "task" ? taskTimer.start : childTimer.start;
    const started = applyStimulus(original, initialState, start);
    assert.equal(started.outcome, CommandOutcome.Committed);
    const program: SemanticProcessProgram = {
      ...original,
      operations: original.operations.map((operation) => {
        switch (operation.kind) {
          case SemanticOperationKind.AwaitMonitoredUserTask:
            return { ...operation, boundaryTimer: { ...operation.boundaryTimer, recurrence: "repeating" } };
          case SemanticOperationKind.EnterBoundedScope:
            return { ...operation, kind: SemanticOperationKind.EnterMonitoredScope,
              boundaryTimer: { ...operation.boundaryTimer, recurrence: "repeating" } };
          default: return operation;
        }
      }),
    };
    const old = started.state.timerWaits[0];
    assert.ok(old);
    for (const overflow of ["deadline", "activation"] as const) {
      const deadlineMs: number = overflow === "deadline" ? Number.MAX_SAFE_INTEGER : old.deadlineMs;
      const beforeOverflow: RuntimeState = {
        ...started.state,
        timerWaits: started.state.timerWaits.map((wait) => ({ ...wait, deadlineMs })),
        timerActivations: overflow === "activation"
          ? started.state.timerActivations.map((counter) => ({ ...counter, count: Number.MAX_SAFE_INTEGER }))
          : started.state.timerActivations,
      };
      const overflowResult = applyStimulusWithTrace(program, beforeOverflow, {
        kind: StimulusKind.FireTimer, commandId: `overflow-${overflow}`, timerId: old.id, logicalTimeMs: deadlineMs,
      });
      assert.equal(overflowResult.result.outcome, CommandOutcome.RolledBack);
      assert.deepEqual(overflowResult.result.state, beforeOverflow);
      assert.deepEqual(overflowResult.committedTransitions, []);
      assert.deepEqual(overflowResult.flowNodeOccurrenceLifecycles, []);
    }
    const missingDeadline = {
      ...started.state, timerWaits: [],
      activityOccurrences: started.state.activityOccurrences.map((record) => ({ ...record, attachedHandlers: [] })),
    };
    if (host === "task") {
      const refusedCompletion = applyStimulus(program, missingDeadline, taskTimer.completeMonitoredTask);
      assert.equal(refusedCompletion.outcome, CommandOutcome.Rejected);
      assert.deepEqual(refusedCompletion.state, missingDeadline);
    } else {
      const child = program.operations.find((operation) => operation.kind === SemanticOperationKind.EnterMonitoredScope);
      assert.ok(child?.kind === SemanticOperationKind.EnterMonitoredScope);
      assert.equal(selectScopeCompletionWithdrawal(program, child.childScopeId, missingDeadline), null);
    }
    const fire = { kind: StimulusKind.FireTimer, commandId: "first-fire", timerId: old.id, logicalTimeMs: old.deadlineMs } as const;
    const first = applyStimulus(program, started.state, fire);
    assert.equal(first.outcome, CommandOutcome.Committed);
    const traced = applyStimulusWithTrace(program, started.state, fire);
    assert.equal(traced.result.outcome, CommandOutcome.Committed);
    const open = projectOpenFlowNodeOccurrences(program, started.state);
    assert.ok(open !== null);
    requireCompleteFlowNodeOccurrenceLifecycles(program, open.map((entry) => ({ ...entry,
      attachedHandlers: attachedHandlersForBodyAnchor(started.state, entry.anchor),
    })), fire.commandId, traced.committedTransitions, traced.flowNodeOccurrenceLifecycles);
    const next = first.state.timerWaits[0];
    assert.ok(next);
    assert.deepEqual(next.id, { ...old.id, activation: old.id.activation + 1 });
    assert.equal(next.deadlineMs, old.deadlineMs + 1_000);
    assert.deepEqual(first.state.activityOccurrences.map(({ id, body }) => ({ id, body })),
      started.state.activityOccurrences.map(({ id, body }) => ({ id, body })),
      "Timer replacement preserves every Activity identity and body claim");
    assert.deepEqual(first.state.activityActivations, started.state.activityActivations);
    assert.deepEqual(first.state.activityOccurrences[0]?.body, started.state.activityOccurrences[0]?.body);
    assert.deepEqual(first.state.activityOccurrences[0]?.attachedHandlers, [{ kind: "timer", occurrence: next.id }]);
    assert.equal(applyStimulus(program, first.state, { ...fire, commandId: "stale-fire" }).outcome, CommandOutcome.Rejected);
    const second = applyStimulus(program, first.state, {
      ...fire, commandId: "second-fire", timerId: next.id, logicalTimeMs: next.deadlineMs,
    });
    assert.equal(second.outcome, CommandOutcome.Committed);
    assert.equal(second.state.timerWaits[0]?.id.activation, old.id.activation + 2);
    assert.equal(second.state.userTaskWaits.length, started.state.userTaskWaits.length + 2);
    const completed = applyStimulus(program, second.state,
      host === "task" ? taskTimer.completeMonitoredTask : childTimer.completeChildTask);
    assert.equal(completed.outcome, CommandOutcome.Committed);
    assert.deepEqual(completed.state.timerWaits, []);
    assert.deepEqual(completed.state.activityOccurrences, []);
    assert.equal(completed.state.userTaskWaits.length, 3);
  });
}
