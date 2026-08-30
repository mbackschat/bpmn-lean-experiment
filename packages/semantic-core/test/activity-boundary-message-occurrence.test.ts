import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ActivityHandlerKind,
  CommandOutcome,
  FlowNodeOccurrenceTerminalKind,
  SemanticFlowNodeOccurrenceAnchorKind,
  SemanticOperationKind,
  SemanticTransitionKind,
  applyStimulusWithTrace,
  attachedHandlersForBodyAnchor,
  foldFlowNodeOccurrenceLifecycleDelta,
  initialState,
  projectOpenFlowNodeOccurrences,
  requireCompleteFlowNodeOccurrenceLifecycles,
} from "@bpmn-lean/semantic-core";
import type {
  RetainedFlowNodeOccurrence,
  TracedCommandResult,
  UnnumberedFlowNodeOccurrenceDelta,
} from "@bpmn-lean/semantic-core";

import {
  completeReview,
  deliverWithdrawal,
  owner,
  program,
  start,
  subscriptionId,
  taskId,
} from "./activity-boundary-message-fixture.ts";

test("arming publishes the task and Message subscription without executing the Boundary Event", () => {
  const armed = traceStart();
  const lifecycle = lifecycleForOperation(
    armed,
    SemanticOperationKind.AwaitMessageBoundedUserTask,
  );

  assert.deepEqual(lifecycle.started, [
    waitStart(taskId, "ReviewApplication"),
    waitStart(subscriptionId, "Withdrawal"),
  ]);
  assert.deepEqual(lifecycle.ended, []);
  assert.equal(lifecycle.started.some(({ anchor }) =>
    anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Transition
  ), false);
});

test("current-open projection requires the Activity record to own both paired waits", () => {
  const state = traceStart().result.state;

  assert.deepEqual(projectOpenFlowNodeOccurrences(program, state), [
    waitStart(taskId, "ReviewApplication"),
    waitStart(subscriptionId, "Withdrawal"),
  ]);
  assert.equal(projectOpenFlowNodeOccurrences(program, {
    ...state,
    activityOccurrences: [],
  }), null);
  assert.equal(projectOpenFlowNodeOccurrences(program, {
    ...state,
    activityOccurrences: state.activityOccurrences.map((record) => ({
      ...record,
      attachedHandlers: record.attachedHandlers.map((handler) => ({
        ...handler,
        occurrence: { ...handler.occurrence, activation: 2 },
      })),
    })),
  }), null);
});

test("each winner publishes the exact loser cancellation and only Message executes the Boundary Event", () => {
  const armed = traceStart();
  const taskWon = applyStimulusWithTrace(
    program,
    armed.result.state,
    completeReview,
  );
  assert.equal(taskWon.result.outcome, CommandOutcome.Committed);
  assert.deepEqual(lifecycleForExternal(taskWon), {
    started: [],
    ended: [
      waitEnd(taskId, FlowNodeOccurrenceTerminalKind.Completed),
      waitEnd(subscriptionId, FlowNodeOccurrenceTerminalKind.Cancelled),
    ],
  });

  const messageWon = applyStimulusWithTrace(
    program,
    armed.result.state,
    deliverWithdrawal,
  );
  assert.equal(messageWon.result.outcome, CommandOutcome.Committed);
  assert.deepEqual(lifecycleForExternal(messageWon), {
    started: [{
      anchor: {
        kind: SemanticFlowNodeOccurrenceAnchorKind.Transition,
        commandId: deliverWithdrawal.commandId,
        transitionIndex: 0,
        localIndex: 0,
      },
      processId: program.processId,
      elementId: "Withdrawal",
      owner,
    }],
    ended: [
      waitEnd(taskId, FlowNodeOccurrenceTerminalKind.Cancelled),
      waitEnd(subscriptionId, FlowNodeOccurrenceTerminalKind.Completed),
      {
        anchor: {
          kind: SemanticFlowNodeOccurrenceAnchorKind.Transition,
          commandId: deliverWithdrawal.commandId,
          transitionIndex: 0,
          localIndex: 0,
        },
        terminal: FlowNodeOccurrenceTerminalKind.Completed,
      },
    ],
  });
});

test("independent completeness derives both victories and rejects losing-wait drift", () => {
  const armed = traceStart();
  const retained = requireAndFold([], start.commandId, armed);
  const host = retained.find(({ elementId }) => elementId === "ReviewApplication");
  assert.deepEqual(host?.attachedHandlers, [{
    kind: ActivityHandlerKind.Message,
    occurrence: subscriptionId,
  }]);

  const taskWon = applyStimulusWithTrace(
    program,
    armed.result.state,
    completeReview,
  );
  assert.doesNotThrow(() => requireCompleteFlowNodeOccurrenceLifecycles(
    program,
    retained,
    completeReview.commandId,
    taskWon.committedTransitions,
    taskWon.flowNodeOccurrenceLifecycles,
  ));
  const retainedLoser = taskWon.flowNodeOccurrenceLifecycles.map(
    (lifecycle, index): UnnumberedFlowNodeOccurrenceDelta => index === 0
      ? {
          ...lifecycle,
          ended: lifecycle.ended.filter(({ anchor }) =>
            anchor.kind !== SemanticFlowNodeOccurrenceAnchorKind.Wait ||
            anchor.id.elementId !== subscriptionId.elementId
          ),
        }
      : lifecycle,
  );
  assert.throws(() => requireCompleteFlowNodeOccurrenceLifecycles(
    program,
    retained,
    completeReview.commandId,
    taskWon.committedTransitions,
    retainedLoser,
  ), /complete lifecycle/u);

  const messageWon = applyStimulusWithTrace(
    program,
    armed.result.state,
    deliverWithdrawal,
  );
  assert.doesNotThrow(() => requireCompleteFlowNodeOccurrenceLifecycles(
    program,
    retained,
    deliverWithdrawal.commandId,
    messageWon.committedTransitions,
    messageWon.flowNodeOccurrenceLifecycles,
  ));
  const misclassifiedLoser = messageWon.flowNodeOccurrenceLifecycles.map(
    (lifecycle, index): UnnumberedFlowNodeOccurrenceDelta => index === 0
      ? {
          ...lifecycle,
          ended: lifecycle.ended.map((terminal) =>
            terminal.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait &&
              terminal.anchor.id.elementId === taskId.elementId
              ? { ...terminal, terminal: FlowNodeOccurrenceTerminalKind.Completed }
              : terminal
          ),
        }
      : lifecycle,
  );
  assert.throws(() => requireCompleteFlowNodeOccurrenceLifecycles(
    program,
    retained,
    deliverWithdrawal.commandId,
    messageWon.committedTransitions,
    misclassifiedLoser,
  ), /complete lifecycle/u);

  const unpaired = retained.map((entry) => entry.elementId === "ReviewApplication"
    ? {
        ...entry,
        attachedHandlers: [{
          kind: ActivityHandlerKind.Message,
          occurrence: { ...subscriptionId, activation: 2 },
        }],
      }
    : entry);
  assert.throws(() => requireCompleteFlowNodeOccurrenceLifecycles(
    program,
    unpaired,
    deliverWithdrawal.commandId,
    messageWon.committedTransitions,
    messageWon.flowNodeOccurrenceLifecycles,
  ), /(complete lifecycle|continuity drifted)/u);
});

function traceStart(): TracedCommandResult {
  const armed = applyStimulusWithTrace(program, initialState, start);
  assert.equal(armed.result.outcome, CommandOutcome.Committed);
  return armed;
}

function lifecycleForExternal(traced: TracedCommandResult) {
  assert.equal(
    traced.committedTransitions[0]?.transition.kind,
    SemanticTransitionKind.ExternalStimulus,
  );
  const lifecycle = traced.flowNodeOccurrenceLifecycles[0];
  assert.ok(lifecycle !== undefined);
  return lifecycle;
}

function lifecycleForOperation(
  traced: TracedCommandResult,
  kind: SemanticOperationKind,
) {
  const index = traced.committedTransitions.findIndex(({ transition }) =>
    transition.kind === SemanticTransitionKind.InternalOperation &&
    transition.operationKind === kind
  );
  assert.notEqual(index, -1);
  const lifecycle = traced.flowNodeOccurrenceLifecycles[index];
  assert.ok(lifecycle !== undefined);
  return lifecycle;
}

function requireAndFold(
  retained: readonly RetainedFlowNodeOccurrence[],
  commandId: string,
  traced: TracedCommandResult,
): RetainedFlowNodeOccurrence[] {
  requireCompleteFlowNodeOccurrenceLifecycles(
    program,
    retained,
    commandId,
    traced.committedTransitions,
    traced.flowNodeOccurrenceLifecycles,
  );
  let open: RetainedFlowNodeOccurrence[] = [...retained];
  for (const lifecycle of traced.flowNodeOccurrenceLifecycles) {
    const folded = foldFlowNodeOccurrenceLifecycleDelta(open, lifecycle);
    assert.ok(folded !== null);
    open = folded.map((entry) => ({
      ...entry,
      attachedHandlers: [...attachedHandlersForBodyAnchor(
        traced.result.state,
        entry.anchor,
      )],
    }));
  }
  return open;
}

function waitStart(
  id: typeof taskId | typeof subscriptionId,
  elementId: string,
) {
  return {
    anchor: { kind: SemanticFlowNodeOccurrenceAnchorKind.Wait, id },
    processId: program.processId,
    elementId,
    owner,
  } as const;
}

function waitEnd(
  id: typeof taskId | typeof subscriptionId,
  terminal: FlowNodeOccurrenceTerminalKind,
) {
  return {
    anchor: { kind: SemanticFlowNodeOccurrenceAnchorKind.Wait, id },
    terminal,
  } as const;
}
