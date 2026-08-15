/**
 * Independent semantic publication completeness contract.
 *
 * The oracle is the Program transition/stimulus relation plus retained private occurrence anchors.
 * A host-visible state difference is deliberately insufficient because it omits transient flow-node
 * occurrences and cancellation terminals whose anchors are no longer open after the command.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FlowNodeOccurrenceTerminalKind,
  SemanticOperationKind,
  SemanticTransitionKind,
  applyStimulusWithTrace,
  foldFlowNodeOccurrenceLifecycleDelta,
  initialState,
  requireCompleteFlowNodeOccurrenceLifecycles,
} from "@bpmn-lean/semantic-core";
import type {
  RetainedFlowNodeOccurrence,
  SemanticProcessProgram,
  TracedCommandResult,
  UnnumberedFlowNodeOccurrenceDelta,
} from "@bpmn-lean/semantic-core";

import {
  eventRaceProgram,
  eventRaceStart,
  messageDelivery,
} from "./event-based-gateway-fixture.ts";
import {
  completionStimulus,
  parallelProgram,
  startStimulus,
} from "./parallel-fork-join-fixture.ts";

test("rejects a state-difference substitute that omits Join, End, and scope-completion lifecycles from a valid E1 batch", () => {
  const started = applyStimulusWithTrace(
    parallelProgram,
    initialState,
    startStimulus(),
  );
  let retained = requireAndFold(
    parallelProgram,
    [],
    startStimulus().commandId,
    started,
  );
  const completedA = applyStimulusWithTrace(
    parallelProgram,
    started.result.state,
    completionStimulus("UserTask_A"),
  );
  retained = requireAndFold(
    parallelProgram,
    retained,
    completionStimulus("UserTask_A").commandId,
    completedA,
  );
  const completionB = completionStimulus("UserTask_B");
  const completedB = applyStimulusWithTrace(
    parallelProgram,
    completedA.result.state,
    completionB,
  );
  assert.deepEqual(
    completedB.committedTransitions.flatMap(({ transition }) =>
      transition.kind === SemanticTransitionKind.InternalOperation
        ? [transition.operationKind]
        : []
    ),
    [
      SemanticOperationKind.Synchronize,
      SemanticOperationKind.ReachNoneEnd,
      SemanticOperationKind.CompleteScope,
    ],
  );
  assert.doesNotThrow(() => requireCompleteFlowNodeOccurrenceLifecycles(
    parallelProgram,
    retained,
    completionB.commandId,
    completedB.committedTransitions,
    completedB.flowNodeOccurrenceLifecycles,
  ));

  const stateDifference = completedB.flowNodeOccurrenceLifecycles.map(
    (): UnnumberedFlowNodeOccurrenceDelta => ({ started: [], ended: [] }),
  );
  stateDifference[0] = completedB.flowNodeOccurrenceLifecycles[0]!;
  assert.throws(
    () => requireCompleteFlowNodeOccurrenceLifecycles(
      parallelProgram,
      retained,
      completionB.commandId,
      completedB.committedTransitions,
      stateDifference,
    ),
    /complete lifecycle/u,
  );
});

test("rejects a validly shaped event-race substitution missing the loser terminal", () => {
  const armed = applyStimulusWithTrace(
    eventRaceProgram,
    initialState,
    eventRaceStart,
  );
  const retained = requireAndFold(
    eventRaceProgram,
    [],
    eventRaceStart.commandId,
    armed,
  );
  const delivery = messageDelivery();
  const won = applyStimulusWithTrace(
    eventRaceProgram,
    armed.result.state,
    delivery,
  );
  assert.doesNotThrow(() => requireCompleteFlowNodeOccurrenceLifecycles(
    eventRaceProgram,
    retained,
    delivery.commandId,
    won.committedTransitions,
    won.flowNodeOccurrenceLifecycles,
  ));

  const missingLoser = won.flowNodeOccurrenceLifecycles.map((lifecycle, index) =>
    index === 0
      ? {
          ...lifecycle,
          ended: lifecycle.ended.filter(({ terminal }) =>
            terminal !== FlowNodeOccurrenceTerminalKind.Cancelled
          ),
        }
      : lifecycle
  );
  assert.throws(
    () => requireCompleteFlowNodeOccurrenceLifecycles(
      eventRaceProgram,
      retained,
      delivery.commandId,
      won.committedTransitions,
      missingLoser,
    ),
    /complete lifecycle/u,
  );
});

function requireAndFold(
  program: SemanticProcessProgram,
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
  let open = [...retained];
  for (const lifecycle of traced.flowNodeOccurrenceLifecycles) {
    const next = foldFlowNodeOccurrenceLifecycleDelta(open, lifecycle);
    assert.ok(next !== null);
    open = next;
  }
  return open;
}
