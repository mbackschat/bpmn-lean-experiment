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
  attachedTimersForBodyAnchor,
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
import {
  boundedProgram,
  fireDeadline,
  start as startBounded,
} from "./bounded-task-fixture.ts";

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

/**
 * The boundary-Timer host resolution, which is the one path the retained pairing exists for.
 *
 * This relation resolves a firing deadline to the occurrence it interrupts. It used to do that by
 * requiring the host's activation ordinal to equal the Timer's, a comparison across two counter
 * families that no state asserts and that body turnover breaks. It now reads the handler list the
 * accumulator retained from the Activity occurrence record.
 *
 * The case exists because nothing else covers it without a host port: every other oracle for this
 * path is in the differential pipeline or the Temporal gate, so a mutation to the pairing predicate
 * passed the whole port-free suite. Seeding `listsTimer` to `false` must fail here.
 */
test("resolves a firing boundary deadline to its host through the retained handler list", () => {
  const started = applyStimulusWithTrace(boundedProgram, initialState, startBounded);
  const retained = requireAndFold(
    boundedProgram,
    [],
    startBounded.commandId,
    started,
  );
  // Anti-vacuity: the arming command must have retained a handler, or the assertion below would hold
  // for a relation that reads nothing.
  assert.equal(
    retained.filter(({ attachedTimers }) => attachedTimers.length === 1).length,
    1,
    "arming must retain exactly one host carrying its deadline",
  );

  const fired = applyStimulusWithTrace(boundedProgram, started.result.state, fireDeadline);
  assert.doesNotThrow(() => requireAndFold(
    boundedProgram,
    retained,
    fireDeadline.commandId,
    fired,
  ));
});

/**
 * The same command, against a retained set whose handler list was dropped.
 *
 * This is what the ordinal join degraded to under turnover: the host is live and correct, the
 * publication is correct, and the relation finds no pair and refuses. Asserting the refusal is what
 * makes the positive case above attributable to the retained list rather than to anything else.
 */
test("a retained host that lists no handler makes a correct deadline publication unpairable", () => {
  const started = applyStimulusWithTrace(boundedProgram, initialState, startBounded);
  const retained = requireAndFold(
    boundedProgram,
    [],
    startBounded.commandId,
    started,
  ).map((entry) => ({ ...entry, attachedTimers: [] }));

  const fired = applyStimulusWithTrace(boundedProgram, started.result.state, fireDeadline);
  assert.throws(() => requireCompleteFlowNodeOccurrenceLifecycles(
    boundedProgram,
    retained,
    fireDeadline.commandId,
    fired.committedTransitions,
    fired.flowNodeOccurrenceLifecycles,
  ));
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
  let open: RetainedFlowNodeOccurrence[] = [...retained];
  for (const lifecycle of traced.flowNodeOccurrenceLifecycles) {
    const next = foldFlowNodeOccurrenceLifecycleDelta(open, lifecycle);
    assert.ok(next !== null);
    // Stands in for the Workflow accumulator, which retains each opening body's attached handlers
    // from the committed post-state. Folding without that step would leave every boundary Timer
    // unpairable, so this is the accumulator's obligation rather than test scaffolding.
    open = next.map((entry) => ({
      ...entry,
      attachedTimers: attachedTimersForBodyAnchor(traced.result.state, entry.anchor),
    }));
  }
  return open;
}
