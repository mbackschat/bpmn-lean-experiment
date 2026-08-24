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
  SemanticFlowNodeOccurrenceAnchorKind,
  SemanticOperationKind,
  SemanticTransitionKind,
  applyInternalOperation,
  applyStimulusWithTrace,
  attachedTimersForBodyAnchor,
  completeSequentialMultiInstanceIteration,
  foldFlowNodeOccurrenceLifecycleDelta,
  initialState,
  interruptSequentialMultiInstance,
  projectFlowNodeOccurrenceLifecycleDelta,
  requireCompleteFlowNodeOccurrenceLifecycles,
} from "@bpmn-lean/semantic-core";
import type {
  RetainedFlowNodeOccurrence,
  RuntimeState,
  SemanticOperation,
  SemanticProcessProgram,
  TracedCommandResult,
  UnnumberedCommittedTransitionRecord,
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
import {
  completeIteration,
  fireOuterTimer,
  innerTaskId,
  outerTimerId,
  owner as sequentialOwner,
  reviewProgram,
  start as startSequential,
  startEmpty as startSequentialEmpty,
  startedState as sequentialStartedState,
} from "./sequential-multi-instance-fixture.ts";

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

test("admits exactly the generated inner occurrence on sequential Multi-Instance entry", () => {
  for (const stimulus of [startSequential, startSequentialEmpty]) {
    const { initiated, entered, initiate, entry } = enterSequential(stimulus);
    const lifecycles = [
      { started: [], ended: [] },
      requireProjectedLifecycle(
        sequentialStartedState(stimulus),
        initiated,
        { kind: "internal", operation: initiate, owner: sequentialOwner },
        stimulus.commandId,
        1,
      ),
      requireProjectedLifecycle(
        initiated,
        entered,
        { kind: "internal", operation: entry, owner: sequentialOwner },
        stimulus.commandId,
        2,
      ),
    ] satisfies UnnumberedFlowNodeOccurrenceDelta[];
    assert.doesNotThrow(() => requireCompleteFlowNodeOccurrenceLifecycles(
      reviewProgram,
      [],
      stimulus.commandId,
      [
        externalRecord(stimulus),
        internalRecord(initiate, sequentialOwner),
        internalRecord(entry, sequentialOwner),
      ],
      lifecycles,
    ));

    if (stimulus === startSequential) {
      const outerActivitySubstitution = structuredClone(lifecycles);
      outerActivitySubstitution[2] = {
        started: [{
          anchor: {
            kind: SemanticFlowNodeOccurrenceAnchorKind.CallActivity,
            id: innerTaskId(0),
          },
          processId: reviewProgram.processId,
          elementId: "Review",
          owner: sequentialOwner,
        }],
        ended: [],
      };
      assertIncomplete(
        reviewProgram,
        [],
        stimulus.commandId,
        [
          externalRecord(stimulus),
          internalRecord(initiate, sequentialOwner),
          internalRecord(entry, sequentialOwner),
        ],
        outerActivitySubstitution,
      );
    }
  }
});

test("admits one completed inner occurrence and at most one distinct sequential successor", () => {
  const first = enterSequential(startSequential).entered;
  const nonFinal = completeSequential(first, 0);
  const current = retainedInner(0);
  const record = externalRecord(completeIteration(0, "reviewed alpha"));
  assert.doesNotThrow(() => requireCompleteFlowNodeOccurrenceLifecycles(
    reviewProgram,
    [current],
    "complete-review-0",
    [record],
    [nonFinal.delta],
  ));

  const mutations: UnnumberedFlowNodeOccurrenceDelta[] = [
    { ...nonFinal.delta, ended: [] },
    {
      ...nonFinal.delta,
      started: nonFinal.delta.started.map((start) => ({
        ...start,
        anchor: {
          kind: SemanticFlowNodeOccurrenceAnchorKind.Wait,
          id: innerTaskId(0),
        },
      })),
    },
    {
      ...nonFinal.delta,
      started: [
        ...nonFinal.delta.started,
        innerStart(2),
      ],
    },
    {
      ...nonFinal.delta,
      started: nonFinal.delta.started.map((start) => ({
        ...start,
        processId: "Process_Substituted",
      })),
    },
    {
      ...nonFinal.delta,
      started: nonFinal.delta.started.map((start) => ({
        ...start,
        elementId: "Review_Substituted",
      })),
    },
    {
      ...nonFinal.delta,
      started: nonFinal.delta.started.map((start) => ({
        ...start,
        owner: { ...start.owner, activation: 2 },
      })),
    },
  ];
  for (const mutation of mutations) {
    assertIncomplete(
      reviewProgram,
      [current],
      "complete-review-0",
      [record],
      [mutation],
    );
  }

  const second = completeSequential(nonFinal.after, 1);
  const final = completeSequential(second.after, 2);
  assert.deepEqual(final.delta.started, [], "final completion has no successor");
  assert.doesNotThrow(() => requireCompleteFlowNodeOccurrenceLifecycles(
    reviewProgram,
    [retainedInner(2)],
    "complete-review-2",
    [externalRecord(completeIteration(2, "reviewed 2"))],
    [final.delta],
  ));
});

test("keeps sequential Multi-Instance deadline interruption exact", () => {
  const first = enterSequential(startSequential).entered;
  const nonFinal = completeSequential(first, 0);
  const interrupted = projectSequentialInterruption(nonFinal.after);
  const retained = retainedInner(1, [outerTimerId]);
  const record = externalRecord(fireOuterTimer);
  assert.doesNotThrow(() => requireCompleteFlowNodeOccurrenceLifecycles(
    reviewProgram,
    [retained],
    fireOuterTimer.commandId,
    [record],
    [interrupted],
  ));
  assertIncomplete(
    reviewProgram,
    [retained],
    fireOuterTimer.commandId,
    [record],
    [{
      ...interrupted,
      ended: interrupted.ended.map((end) =>
        end.anchor.kind === SemanticFlowNodeOccurrenceAnchorKind.Wait
          ? { ...end, terminal: FlowNodeOccurrenceTerminalKind.Completed }
          : end
      ),
    }],
  );
});

function enterSequential(
  stimulus: typeof startSequential,
): Readonly<{
  initiated: RuntimeState;
  entered: RuntimeState;
  initiate: SemanticOperation;
  entry: SemanticOperation;
}> {
  const initiate = sequentialOperation(SemanticOperationKind.Initiate);
  const entry = sequentialOperation(
    SemanticOperationKind.AwaitSequentialMultiInstanceUserTask,
  );
  const initiated = applyInternalOperation(
    reviewProgram,
    initiate,
    sequentialStartedState(stimulus),
  );
  assert.ok(initiated !== null);
  const entered = applyInternalOperation(reviewProgram, entry, initiated);
  assert.ok(entered !== null);
  return { initiated, entered, initiate, entry };
}

function completeSequential(
  before: RuntimeState,
  counter: number,
): Readonly<{ after: RuntimeState; delta: UnnumberedFlowNodeOccurrenceDelta }> {
  const stimulus = completeIteration(counter, `reviewed ${counter}`);
  const after = completeSequentialMultiInstanceIteration(
    reviewProgram,
    before,
    stimulus,
  );
  assert.ok(after !== null);
  return {
    after,
    delta: requireProjectedLifecycle(
      before,
      after,
      { kind: "external", stimulus },
      stimulus.commandId,
      0,
    ),
  };
}

function projectSequentialInterruption(
  before: RuntimeState,
): UnnumberedFlowNodeOccurrenceDelta {
  const after = interruptSequentialMultiInstance(
    reviewProgram,
    before,
    fireOuterTimer,
  );
  assert.ok(after !== null);
  return requireProjectedLifecycle(
    before,
    after,
    { kind: "external", stimulus: fireOuterTimer },
    fireOuterTimer.commandId,
    0,
  );
}

function requireProjectedLifecycle(
  before: RuntimeState,
  after: RuntimeState,
  transition: Parameters<typeof projectFlowNodeOccurrenceLifecycleDelta>[3],
  commandId: string,
  transitionIndex: number,
): UnnumberedFlowNodeOccurrenceDelta {
  const delta = projectFlowNodeOccurrenceLifecycleDelta(
    reviewProgram,
    before,
    after,
    transition,
    commandId,
    transitionIndex,
  );
  assert.ok(delta !== null);
  return delta;
}

function sequentialOperation(kind: SemanticOperationKind): SemanticOperation {
  const operation = reviewProgram.operations.find((candidate) =>
    candidate.kind === kind
  );
  assert.ok(operation !== undefined);
  return operation;
}

function innerStart(counter: number) {
  return {
    anchor: {
      kind: SemanticFlowNodeOccurrenceAnchorKind.Wait,
      id: innerTaskId(counter),
    },
    processId: reviewProgram.processId,
    elementId: "Review",
    owner: sequentialOwner,
  } as const;
}

function retainedInner(
  counter: number,
  attachedTimers: RetainedFlowNodeOccurrence["attachedTimers"] = [],
): RetainedFlowNodeOccurrence {
  return { ...innerStart(counter), attachedTimers };
}

function externalRecord(
  stimulus: Extract<
    UnnumberedCommittedTransitionRecord["transition"],
    { kind: SemanticTransitionKind.ExternalStimulus }
  >["stimulus"],
): UnnumberedCommittedTransitionRecord {
  return {
    logicalTimeMs: 0,
    transition: { kind: SemanticTransitionKind.ExternalStimulus, stimulus },
    positionDelta: emptyPositionDelta(),
  };
}

function internalRecord(
  operation: SemanticOperation,
  owner: RetainedFlowNodeOccurrence["owner"],
): UnnumberedCommittedTransitionRecord {
  return {
    logicalTimeMs: 0,
    transition: {
      kind: SemanticTransitionKind.InternalOperation,
      operationId: operation.id,
      operationKind: operation.kind,
      origin: operation.origin,
      owner,
    },
    positionDelta: emptyPositionDelta(),
  };
}

function emptyPositionDelta() {
  return {
    consumedTokens: [],
    producedTokens: [],
    enteredScopes: [],
    exitedScopes: [],
  };
}

function assertIncomplete(
  program: SemanticProcessProgram,
  retained: readonly RetainedFlowNodeOccurrence[],
  commandId: string,
  records: readonly UnnumberedCommittedTransitionRecord[],
  lifecycles: readonly UnnumberedFlowNodeOccurrenceDelta[],
): void {
  assert.throws(() => requireCompleteFlowNodeOccurrenceLifecycles(
    program,
    retained,
    commandId,
    records,
    lifecycles,
  ), /complete lifecycle/u);
}

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
    // Stands in for the Workflow accumulator, which rewrites every retained entry's handler list from
    // the committed post-state at the end of each command. Recomputing for every entry rather than
    // only for the ones just opened is the production model, not a simplification: a stale entry makes
    // the continuation decoder refuse a legal state. Folding without this step would leave every
    // boundary Timer unpairable, so it is the accumulator's obligation rather than test scaffolding.
    open = next.map((entry) => ({
      ...entry,
      attachedTimers: attachedTimersForBodyAnchor(traced.result.state, entry.anchor),
    }));
  }
  return open;
}
