import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  InternalSchedulingMode,
  MessageChannelKind,
  SemanticOperationKind,
  SemanticOriginKind,
  StimulusKind,
  applyStimulus,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState,
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type {
  InternalTransitionStateAtom,
  InternalTransitionStateFootprint,
} from "../src/internal-transition-footprint.ts";

import {
  callActivityProgram,
  callActivityStart,
  calledScopeId,
  expectedCalledInstanceId,
} from "./call-activity-fixture.ts";
import {
  eventRaceProgram,
  eventRaceStart,
} from "./event-based-gateway-fixture.ts";

type EventRacePreparationModule =
  typeof import("../src/internal-transition-event-race-preparation.ts");
type EventRaceRuntimeModule =
  typeof import("../src/semantic-process-event-race-runtime.ts");
type FootprintModule = typeof import("../src/internal-transition-footprint.ts");

const preparationModule = await import(
  new URL(
    "../dist/internal-transition-event-race-preparation.js",
    import.meta.url,
  ).href
) as EventRacePreparationModule;
const eventRaceRuntimeModule = await import(
  new URL("../dist/semantic-process-event-race-runtime.js", import.meta.url).href
) as EventRaceRuntimeModule;
const footprintModule = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;

const { deriveInternalEventRacePreparation } = preparationModule;
const { armEventRace, winEventRaceWithMessage } = eventRaceRuntimeModule;
const {
  InternalOccurrenceKind,
  InternalTransitionStateAtomKind,
  internalTransitionStateFootprintsAreIndependent,
} = footprintModule;

const rootOperation = requireOperation(
  eventRaceProgram,
  SemanticOperationKind.AwaitEventRace,
);
const beforeRootRace = applyStimulus(
  eventRaceProgram,
  initialState,
  eventRaceStart,
  1,
);
assert.equal(beforeRootRace.outcome, CommandOutcome.Committed);
assert.equal(beforeRootRace.internalStepBoundExceeded, true);

test("prepares the race, both waits, counters, anchors, and input token", () => {
  const prepared = requirePrepared(deriveInternalEventRacePreparation(
    eventRaceProgram,
    beforeRootRace.state,
    rootOperation,
  ));

  assert.deepEqual(prepared.race, {
    id: {
      processInstanceId: eventRaceStart.instanceId,
      elementId: rootOperation.origin.elementId,
      activation: 1,
    },
    owner: prepared.owner,
    messageSubscriptionId: prepared.messageWait.id,
    timerOccurrenceId: prepared.timerWait.id,
  });
  assert.deepEqual(activationWrites(prepared.footprint), [
    { occurrenceKind: InternalOccurrenceKind.EventRace, elementId: "Race" },
    { occurrenceKind: InternalOccurrenceKind.Message, elementId: "MessageCatch" },
    { occurrenceKind: InternalOccurrenceKind.Timer, elementId: "TimerCatch" },
  ]);
  assert.equal(writesOfKind(
    prepared.footprint,
    InternalTransitionStateAtomKind.EventRaceAssociation,
  ).length, 1);
  assert.equal(writesOfKind(
    prepared.footprint,
    InternalTransitionStateAtomKind.Wait,
  ).length, 2);
  assert.equal(writesOfKind(
    prepared.footprint,
    InternalTransitionStateAtomKind.OpenWaitAnchor,
  ).length, 2);
  assert.equal(writesOfKind(
    prepared.footprint,
    InternalTransitionStateAtomKind.ControlToken,
  ).length, 1);
  assert.equal(prepared.footprint.reads.some(({ kind }) =>
    kind === InternalTransitionStateAtomKind.LogicalTime
  ), true);
});

test("keeps counter families tagged and conflicts on each exact race association key", () => {
  const prepared = requirePrepared(deriveInternalEventRacePreparation(
    eventRaceProgram,
    beforeRootRace.state,
    rootOperation,
  ));
  const sameElementOtherFamily: InternalTransitionStateFootprint = {
    reads: [],
    writes: [{
      kind: InternalTransitionStateAtomKind.Activation,
      occurrenceKind: InternalOccurrenceKind.UserTask,
      elementId: rootOperation.origin.elementId,
    }],
  };
  assert.equal(independent(prepared.footprint, sameElementOtherFamily), true);

  const aliasedRace: InternalTransitionStateFootprint = {
    reads: [],
    writes: [{
      kind: InternalTransitionStateAtomKind.EventRaceAssociation,
      record: {
        ...prepared.race,
        messageSubscriptionId: {
          ...prepared.race.messageSubscriptionId,
          elementId: "AnotherMessage",
        },
        timerOccurrenceId: {
          ...prepared.race.timerOccurrenceId,
          elementId: "AnotherTimer",
        },
      },
    }],
  };
  assert.equal(independent(prepared.footprint, aliasedRace), false);

  const aliasedMessage: InternalTransitionStateFootprint = {
    reads: [],
    writes: [{
      kind: InternalTransitionStateAtomKind.EventRaceAssociation,
      record: {
        ...prepared.race,
        id: {
          ...prepared.race.id,
          elementId: "AnotherRace",
        },
        timerOccurrenceId: {
          ...prepared.race.timerOccurrenceId,
          elementId: "AnotherTimer",
        },
      },
    }],
  };
  assert.equal(independent(prepared.footprint, aliasedMessage), false);

  const aliasedTimer: InternalTransitionStateFootprint = {
    reads: [],
    writes: [{
      kind: InternalTransitionStateAtomKind.EventRaceAssociation,
      record: {
        ...prepared.race,
        id: {
          ...prepared.race.id,
          elementId: "AnotherRace",
        },
        messageSubscriptionId: {
          ...prepared.race.messageSubscriptionId,
          elementId: "AnotherMessage",
        },
      },
    }],
  };
  assert.equal(independent(prepared.footprint, aliasedTimer), false);
});

test("refuses an existing public anchor or hidden race identity", () => {
  const prepared = requirePrepared(deriveInternalEventRacePreparation(
    eventRaceProgram,
    beforeRootRace.state,
    rootOperation,
  ));
  const occupiedAnchor: RuntimeState = {
    ...beforeRootRace.state,
    timerWaits: [{
      id: prepared.messageWait.id,
      owner: prepared.owner,
      deadlineMs: 1,
      output: "place:unrelated",
    }],
  };
  assert.equal(deriveInternalEventRacePreparation(
    eventRaceProgram,
    occupiedAnchor,
    rootOperation,
  ), null);
  assert.equal(deriveInternalEventRacePreparation(
    eventRaceProgram,
    { ...beforeRootRace.state, eventRaces: [prepared.race] },
    rootOperation,
  ), null);
});

test("refuses every race member when its next activation is not a safe integer", () => {
  const counterFamilies = [
    ["eventRaceActivations", rootOperation.origin.elementId],
    ["messageActivations", rootOperation.message.elementId],
    ["timerActivations", rootOperation.timer.elementId],
  ] as const;
  for (const [family, elementId] of counterFamilies) {
    const unsafeState: RuntimeState = {
      ...beforeRootRace.state,
      [family]: [{
        elementId,
        count: Number.MAX_SAFE_INTEGER,
      }],
    };
    assert.equal(deriveInternalEventRacePreparation(
      eventRaceProgram,
      unsafeState,
      rootOperation,
    ), null, family);
  }
});

test("binds a called-owner race and both winners to the called semantic instance", () => {
  const calledEntered = applyStimulus(
    callActivityProgram,
    initialState,
    callActivityStart(),
    2,
  );
  assert.equal(calledEntered.outcome, CommandOutcome.Committed);
  assert.equal(calledEntered.internalStepBoundExceeded, true);
  const calledOperation = calledEventRaceOperation();
  const calledProgram: SemanticProcessProgram = {
    ...callActivityProgram,
    internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
    operations: callActivityProgram.operations.map((operation) =>
      operation.id === calledOperation.id ? calledOperation : operation
    ),
  };
  const prepared = requirePrepared(deriveInternalEventRacePreparation(
    calledProgram,
    calledEntered.state,
    calledOperation,
  ));
  assert.equal(prepared.owner.processInstanceId, expectedCalledInstanceId);
  assert.equal(prepared.race.id.processInstanceId, expectedCalledInstanceId);
  assert.equal(
    prepared.messageWait.id.processInstanceId,
    expectedCalledInstanceId,
  );
  assert.equal(prepared.timerWait.id.processInstanceId, expectedCalledInstanceId);

  const armed = armEventRace(
    calledOperation,
    calledEntered.state,
    prepared.owner,
  );
  assert.ok(armed !== null);
  const won = winEventRaceWithMessage(calledProgram, armed, {
    kind: StimulusKind.DeliverMessage,
    commandId: "called-event-race-message",
    subscriptionId: prepared.messageWait.id,
    channel: calledOperation.message.channel,
  });
  assert.ok(won !== null);
  assert.deepEqual(won.eventRaces, []);
  assert.equal(won.controlTokens.some(({ placeId, owner }) =>
    placeId === calledOperation.message.output &&
    owner.processInstanceId === expectedCalledInstanceId
  ), true);
});

function calledEventRaceOperation(): Extract<
  SemanticOperation,
  { kind: SemanticOperationKind.AwaitEventRace }
> {
  return {
    id: "operation:Task_Called",
    kind: SemanticOperationKind.AwaitEventRace,
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId: "CalledRace",
    },
    input: "place:Called_Start",
    message: {
      configurationOrigin: {
        kind: SemanticOriginKind.BpmnSequenceFlow,
        elementId: "CalledMessageConfig",
      },
      elementId: "CalledMessage",
      channel: {
        kind: MessageChannelKind.OperationMessage,
        interfaceId: "Interface_Called",
        interfaceOperationId: "Operation_Called",
        messageId: "Message_Called",
      },
      output: "place:Called_Message_Won",
    },
    timer: {
      configurationOrigin: {
        kind: SemanticOriginKind.BpmnSequenceFlow,
        elementId: "CalledTimerConfig",
      },
      elementId: "CalledTimer",
      durationMs: 1000,
      output: "place:Called_Timer_Won",
    },
  };
}

function requireOperation<Kind extends SemanticOperationKind>(
  program: SemanticProcessProgram,
  kind: Kind,
): Extract<SemanticOperation, { kind: Kind }> {
  const operation = program.operations.find((candidate) => candidate.kind === kind);
  if (operation?.kind !== kind) {
    throw new Error(`expected ${kind} operation`);
  }
  return operation as Extract<SemanticOperation, { kind: Kind }>;
}

function requirePrepared<Prepared>(prepared: Prepared | null): Prepared {
  if (prepared === null) {
    throw new Error("expected a prepared Event Race transition");
  }
  return prepared;
}

function activationWrites(footprint: InternalTransitionStateFootprint) {
  return footprint.writes.flatMap((atom) =>
    atom.kind === InternalTransitionStateAtomKind.Activation
      ? [{ occurrenceKind: atom.occurrenceKind, elementId: atom.elementId }]
      : []
  );
}

function writesOfKind<Kind extends InternalTransitionStateAtom["kind"]>(
  footprint: InternalTransitionStateFootprint,
  kind: Kind,
) {
  return footprint.writes.filter((atom) => atom.kind === kind);
}

function independent(
  left: InternalTransitionStateFootprint,
  right: InternalTransitionStateFootprint,
): boolean {
  return internalTransitionStateFootprintsAreIndependent(left, right);
}
